import path from 'node:path';
import type { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { invokeUxpImportBrushPackAsset } from '../platform/uxp-bridge-client.js';
import {
  attributeNewBrushPresets,
  buildBrushPackManifest,
  resolveBrushPackRecordDirectory,
  inventoryContainsOccurrences,
  readBrushPackRecord,
  writeBrushPackRecord,
  type BrushPackIngestionRecord,
  type BrushPresetInventory,
} from '../core/brush-pack.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import type { PhotoshopErrorCode } from '../errors/envelope.js';

export interface BrushPackToolOptions {
  recordDirectory?: string;
  now?: () => string;
  importAsset?: typeof invokeUxpImportBrushPackAsset;
}

function exactInventory(raw: Record<string, unknown>): BrushPresetInventory {
  const total = Number(raw.total);
  const presets = Array.isArray(raw.presets) ? raw.presets.filter((value): value is string => typeof value === 'string') : [];
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('brush_pack_inventory_invalid: total is not a non-negative integer');
  if (raw.truncated === true || presets.length !== total) {
    throw new Error(`brush_pack_inventory_incomplete: expected ${total} presets, received ${presets.length}`);
  }
  return { total, presets };
}

async function readExactInventory(router: PhotoshopBackendRouter): Promise<BrushPresetInventory> {
  return exactInventory(await router.listBrushPresets('', 10000));
}

function brushPackFailure(
  error: unknown,
  code: PhotoshopErrorCode = 'brush_pack_ingestion_failed'
): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const unavailable = /brush_pack_import_unavailable|photoshop_backend_unavailable|uxp_bridge/i.test(message);
  return atomicFailureFromError(error, {
    code: unavailable ? 'brush_pack_import_unavailable' : code,
    message,
    suggested_next_tool: 'photoshop_guard_status',
  });
}

export function createBrushPackTools(
  connection: PhotoshopConnection,
  backendRouter = new PhotoshopBackendRouter(connection),
  options: BrushPackToolOptions = {}
): ToolDefinition[] {
  const recordDirectory = resolveBrushPackRecordDirectory(options.recordDirectory);
  const now = options.now ?? (() => new Date().toISOString());
  const importAsset = options.importAsset ?? invokeUxpImportBrushPackAsset;

  return [{
    tool: {
      name: 'photoshop_ingest_brush_pack',
      description:
        'Internal Guard-routed brush-pack ingestion. Recursively fingerprints supplied ABR assets, loads them through the UXP backend, attributes exact before/after preset inventory occurrences, and persists an idempotent manifest. In required Guard mode call photoshop_guard_brush_pack_ingest instead.',
      inputSchema: {
        type: 'object',
        properties: {
          source_path: { type: 'string', description: 'Folder or explicit .abr file path.' },
          source_files: {
            type: 'array',
            minItems: 1,
            maxItems: 128,
            items: { type: 'string' },
            description: 'Explicit .abr files. Use instead of source_path.',
          },
        },
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      let manifest;
      try {
        manifest = buildBrushPackManifest({
          ...(typeof args.source_path === 'string' ? { source_path: args.source_path } : {}),
          ...(Array.isArray(args.source_files) ? { source_files: args.source_files.filter((item): item is string => typeof item === 'string') } : {}),
          now: now(),
        });
      } catch (error) {
        return brushPackFailure(error, 'brush_pack_manifest_invalid');
      }

      try {
        const before = await readExactInventory(backendRouter);
        const prior = readBrushPackRecord(recordDirectory, manifest.brush_pack_id);
        if (prior?.ingestion_status === 'imported' && inventoryContainsOccurrences(before, prior.attributed_presets ?? [])) {
          return atomicSuccess('Brush pack already ingested; durable manifest and installed preset attribution were reused.', {
            brush_pack_id: manifest.brush_pack_id,
            reused: true,
            manifest: prior,
            installed_presets: prior.attributed_presets ?? [],
          }, 'photoshop_guard_set_art_run');
        }
        if (prior?.ingestion_status === 'imported') {
          throw new Error('brush_pack_inventory_drift: a durable imported manifest exists but its attributed preset occurrences are no longer present');
        }

        let backendKind = 'unavailable';
        try {
          const backend = await backendRouter.backendFor('brush.presets.import');
          backendKind = backend.kind;
          if (backend.kind !== 'uxp') {
            throw new Error(`brush_pack_import_unavailable: missing host capability uxp.localFileSystem+photoshop.app.open; selected backend=${backend.kind}`);
          }
        } catch (error) {
          const record: BrushPackIngestionRecord = {
            ...manifest,
            ingestion_status: 'import-unavailable',
            ingested_at: now(),
            backend: backendKind,
            inventory_before: before,
            missing_capability: 'uxp.localFileSystem+photoshop.app.open(ABR)',
            error: error instanceof Error ? error.message : String(error),
          };
          writeBrushPackRecord(recordDirectory, record);
          return brushPackFailure(new Error(
            `brush_pack_import_unavailable: missing host capability ${record.missing_capability}; ${record.error}`
          ));
        }

        for (const [index, asset] of manifest.assets.entries()) {
          const commandId = `brush-pack:${manifest.fingerprint_sha256}:${index}:${asset.sha256}`;
          const imported = await importAsset(asset.absolute_path, commandId);
          if (!imported.ok) {
            const afterFailure = await readExactInventory(backendRouter).catch(() => undefined);
            const record: BrushPackIngestionRecord = {
              ...manifest,
              ingestion_status: /brush_pack_import_unavailable/i.test(imported.error ?? '') ? 'import-unavailable' : 'failed',
              ingested_at: now(),
              backend: 'uxp',
              inventory_before: before,
              ...(afterFailure ? { inventory_after: afterFailure } : {}),
              ...(/brush_pack_import_unavailable/i.test(imported.error ?? '')
                ? { missing_capability: 'uxp.localFileSystem+photoshop.app.open(ABR)' }
                : {}),
              error: imported.error ?? `brush_pack_import_failed:${path.basename(asset.absolute_path)}`,
            };
            writeBrushPackRecord(recordDirectory, record);
            return brushPackFailure(new Error(record.error ?? 'brush_pack_import_failed'));
          }
        }

        const after = await readExactInventory(backendRouter);
        const attributed = attributeNewBrushPresets(before, after);
        if (attributed.length === 0) {
          const record: BrushPackIngestionRecord = {
            ...manifest,
            ingestion_status: 'failed',
            ingested_at: now(),
            backend: 'uxp',
            inventory_before: before,
            inventory_after: after,
            attributed_presets: [],
            error: 'brush_pack_inventory_attribution_failed: import completed but no new preset occurrence can be proven from before/after inventory',
          };
          writeBrushPackRecord(recordDirectory, record);
          return brushPackFailure(new Error(record.error));
        }

        const record: BrushPackIngestionRecord = {
          ...manifest,
          ingestion_status: 'imported',
          ingested_at: now(),
          backend: 'uxp',
          inventory_before: before,
          inventory_after: after,
          attributed_presets: attributed,
        };
        writeBrushPackRecord(recordDirectory, record);
        return atomicSuccess('Brush pack ingested and attributed to exact newly installed preset inventory occurrences.', {
          brush_pack_id: manifest.brush_pack_id,
          reused: false,
          manifest: record,
          installed_presets: attributed,
        }, 'photoshop_guard_set_art_run');
      } catch (error) {
        return brushPackFailure(error);
      }
    },
  }];
}
