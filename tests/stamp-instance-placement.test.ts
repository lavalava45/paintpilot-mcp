import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter } from '../src/platform/photoshop-backend.js';
import * as uxpClient from '../src/platform/uxp-bridge-client.js';
import { writeBrushPackRecord, type BrushPackIngestionRecord } from '../src/core/brush-pack.js';
import { recordStampMotifProfile } from '../src/core/brush-pack-profile.js';
import { withToolExecutionContext } from '../src/core/execution-context.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';

const dirs: string[] = [];
const previousRecordDir = process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR;

afterEach(() => {
  vi.restoreAllMocks();
  if (previousRecordDir === undefined) delete process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR;
  else process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR = previousRecordDir;
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function dir(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'stamp-placement-'));
  dirs.push(value);
  return value;
}

function seedProfile(root: string) {
  process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR = root;
  const brushPackId = `brush-pack-sha256:${'d'.repeat(64)}`;
  const presetName = 'Bird Stamp';
  const evidencePath = path.join(root, 'probe.jpg');
  const bytes = Buffer.from('stamp-placement-probe');
  writeFileSync(evidencePath, bytes);
  const record: BrushPackIngestionRecord = {
    protocol: 'photoshop.brush_pack.manifest.v1', brush_pack_id: brushPackId,
    fingerprint_sha256: 'd'.repeat(64), source_kind: 'files', source_root: root,
    created_at: '2026-09-26T00:00:00.000Z', assets: [], ingestion_status: 'imported',
    ingested_at: '2026-09-26T00:00:01.000Z', backend: 'uxp',
    inventory_before: { total: 0, presets: [] }, inventory_after: { total: 1, presets: [presetName] },
    attributed_presets: [{ name: presetName, occurrence_index: 0, inventory_ordinal: 0 }],
  };
  writeBrushPackRecord(root, record);
  const profile = recordStampMotifProfile({
    brush_pack_id: brushPackId, preset_name: presetName, occurrence_index: 0,
    effective_settings: { size: 80, opacity: 100, flow: 100 },
    backend: 'uxp', runtime_revision: 'runtime-1', bridge_revision: 'bridge-1',
    classification_status: 'classified', motif_category: 'bird', semantic_description: 'flying bird',
    canonical_footprint_bounds: { left: 10, top: 20, right: 90, bottom: 80 },
    canonical_orientation_degrees: 0, useful_scale_range: { min_px: 20, max_px: 180 },
    mirror_x: 'allowed', mirror_y: 'restricted', rotation_policy: 'restricted',
    intended_use: ['support', 'background'], repetition_class: 'organic_instances',
    raw_placement: 'needs-integration', known_caveats: [],
    evidence: {
      preview_path: evidencePath,
      preview_sha256: createHash('sha256').update(bytes).digest('hex'),
      operation_id: 'probe-stamp',
    },
  }, { recordDirectory: root });
  return { brushPackId, presetName, profile };
}

function body(result: { content: Array<{ type: string; text?: string }> }): any {
  return JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}');
}

function tool(router: PhotoshopBackendRouter) {
  const definition = createPaintingTools({} as PhotoshopConnection, router)
    .find(item => item.tool.name === 'photoshop_paint_stamp_instances');
  if (!definition) throw new Error('stamp tool not registered');
  return definition;
}

describe('P0-E.4 bounded stamp-instance placement', () => {
  it('sends heterogeneous per-instance transforms as one UXP stable command and returns motif bounds', async () => {
    const root = dir();
    const { brushPackId, presetName, profile } = seedProfile(root);
    const router = { backendFor: vi.fn(async () => ({ kind: 'uxp' })) } as unknown as PhotoshopBackendRouter;
    const spy = vi.spyOn(uxpClient, 'invokeUxpPaintStampInstances').mockResolvedValue({
      ok: true,
      command_id: 'cmd',
      receipt: { command_id: 'cmd', action: 'paint_stamp_instances', state: 'completed', updated_at: 'now' },
      data: {
        placement_status: 'complete', coordinate_space: 'canvas_pixels',
        completed_instances: [
          { instance_id: 'bird-a', source_bounds: { left: 75, top: 75, right: 125, bottom: 125 } },
          { instance_id: 'bird-b', source_bounds: { left: 250, top: 190, right: 350, bottom: 290 } },
        ],
        failed_or_uncertain_instance: null, not_started_instances: [],
      },
    });
    const args = {
      document_id: 42, layer_id: 9, brush_pack_id: brushPackId,
      stamp_profile_id: profile.profile_id, preset_name: presetName,
      instances: [
        { instance_id: 'bird-a', x: 100, y: 100, size: 50, angle: -18, flip_x: false, flip_y: false, opacity: 82 },
        { instance_id: 'bird-b', x: 300, y: 240, size: 100, angle: 27, flip_x: true, flip_y: false, opacity: 55, color: { red: 50, green: 60, blue: 70 } },
      ],
    };
    const result = await withToolExecutionContext({ guardOperationId: 'guard-op-1' }, () => tool(router).handler(args));
    expect(result.isError).not.toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0].instances).toEqual(args.instances);
    const parsed = body(result);
    expect(parsed.details.motif_instances).toEqual([
      expect.objectContaining({ id: 'bird-a', category: 'bird', stamp_profile_id: profile.profile_id, region_bounds: { left: 75, top: 75, right: 125, bottom: 125 } }),
      expect.objectContaining({ id: 'bird-b', category: 'bird', stamp_profile_id: profile.profile_id, region_bounds: { left: 250, top: 190, right: 350, bottom: 290 } }),
    ]);
  });

  it('preserves exact partial identity and does not redispatch the same stable command on retry', async () => {
    const root = dir();
    const { brushPackId, presetName, profile } = seedProfile(root);
    const router = { backendFor: vi.fn(async () => ({ kind: 'uxp' })) } as unknown as PhotoshopBackendRouter;
    const durable = new Map<string, Awaited<ReturnType<typeof uxpClient.invokeUxpPaintStampInstances>>>();
    let actualDispatches = 0;
    vi.spyOn(uxpClient, 'invokeUxpPaintStampInstances').mockImplementation(async (_params, commandId) => {
      const cached = durable.get(commandId);
      if (cached) return cached;
      actualDispatches += 1;
      const receipt = {
        ok: true as const, command_id: commandId,
        receipt: { command_id: commandId, action: 'paint_stamp_instances', state: 'completed' as const, updated_at: 'now' },
        data: {
          placement_status: 'partial',
          completed_instances: [{ instance_id: 'a', source_bounds: { left: 80, top: 80, right: 120, bottom: 120 } }],
          failed_or_uncertain_instance: { instance_id: 'b', instance_index: 1, state: 'failed-or-uncertain', error: 'simulated failure' },
          not_started_instances: [{ instance_id: 'c', instance_index: 2 }],
          coordinate_space: 'canvas_pixels',
        },
      };
      durable.set(commandId, receipt);
      return receipt;
    });
    const args = {
      document_id: 42, layer_id: 9, brush_pack_id: brushPackId,
      stamp_profile_id: profile.profile_id, preset_name: presetName,
      instances: [
        { instance_id: 'a', x: 100, y: 100, size: 40 },
        { instance_id: 'b', x: 200, y: 100, size: 40 },
        { instance_id: 'c', x: 300, y: 100, size: 40 },
      ],
    };
    const first = await withToolExecutionContext({ guardOperationId: 'guard-op-partial' }, () => tool(router).handler(args));
    const second = await withToolExecutionContext({ guardOperationId: 'guard-op-partial' }, () => tool(router).handler(args));
    expect(first.isError).toBe(true);
    expect(second.isError).toBe(true);
    expect(actualDispatches).toBe(1);
    expect(body(first).details).toMatchObject({
      placement_status: 'partial',
      completed_instances: [{ instance_id: 'a' }],
      failed_or_uncertain_instance: { instance_id: 'b', state: 'failed-or-uncertain' },
      not_started_instances: [{ instance_id: 'c' }],
    });
    expect(body(second).details.stable_command_id).toBe(body(first).details.stable_command_id);
  });

  it('rejects raw placement without Guard ownership', async () => {
    const root = dir();
    const { brushPackId, presetName, profile } = seedProfile(root);
    const router = { backendFor: vi.fn(async () => ({ kind: 'uxp' })) } as unknown as PhotoshopBackendRouter;
    const result = await tool(router).handler({
      layer_id: 9, brush_pack_id: brushPackId, stamp_profile_id: profile.profile_id, preset_name: presetName,
      instances: [{ instance_id: 'a', x: 100, y: 100, size: 40 }],
    });
    expect(result.isError).toBe(true);
    expect(body(result).message).toMatch(/guard_required/);
  });
});
