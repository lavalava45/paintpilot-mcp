import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
import type { ToolDefinition, ToolRegistry } from '../core/tool-registry.js';
import { analyzeLuminanceJpeg } from '../core/value-check.js';

function textBody(result: Awaited<ReturnType<ToolRegistry['execute']>>): Record<string, unknown> | undefined {
  const item = result.content.find(content => content.type === 'text');
  if (!item || !('text' in item)) return undefined;
  try { return JSON.parse(item.text) as Record<string, unknown>; } catch { return undefined; }
}

export interface ValueEvidenceHooks {
  currentFrame: (documentId: number) => { bytes: Buffer; sha256: string; sourcePath: string; materializePath: string };
  registerEvidence: (documentId: number, sourceSha: string, result: Awaited<ReturnType<ToolRegistry['execute']>>) => Promise<string>;
}

export function createValueCheckTools(registry: ToolRegistry, hooks?: ValueEvidenceHooks): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_analyze_value_structure',
        description:
          'Analyze the exact delivered Guard frame and automatically register materialized grayscale/luminance evidence. Returns a real evidence_operation_id and SHA for Director updates without source or journal inspection. Standalone preview-only catalogs capture a non-destructive preview. Returns a full grayscale JPEG, a low-frequency downsampled grayscale thumbnail, and descriptive luminance summaries for Art Director review. The low-frequency view suppresses small texture/noise so major-form claims can be checked independently of surface activity. It never declares artistic PASS automatically and does not modify the PSD.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: {
              type: 'number',
              minimum: 1,
              description: 'Required pinned Photoshop document id whose current preview is analyzed.',
            },
            max_dimension_px: { type: 'number', minimum: 128, maximum: 2048, default: 1000 },
            materialize_path: {
              type: 'string',
              description: 'Optional absolute path where the derived grayscale JPEG should be written for external visual inspection.',
            },
          },
          required: ['document_id'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        const requestedPath = typeof args.materialize_path === 'string' && args.materialize_path.trim()
          ? args.materialize_path.trim()
          : undefined;
        if (requestedPath && !isAbsolute(requestedPath)) {
          return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'invalid_arguments', message: 'materialize_path must be absolute' }) }] };
        }
        const source = hooks?.currentFrame(Number(args.document_id));
        const preview = registry.get('photoshop_get_preview');
        if (!source && !preview) throw new Error('photoshop_get_preview is not registered');
        const result = source ? { content: [{ type: 'image' as const, data: source.bytes.toString('base64'), mimeType: 'image/jpeg' }, { type: 'text' as const, text: JSON.stringify({ sha256: source.sha256 }) }] } : await preview!.handler({
          ...(args.document_id === undefined ? {} : { document_id: args.document_id }),
          max_dimension_px: typeof args.max_dimension_px === 'number' ? args.max_dimension_px : 1000,
          quality: 8,
          include_image: true,
        });
        const image = result.content.find(content => content.type === 'image');
        const meta = textBody(result);
        if (!image || !('data' in image)) {
          return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'value_preview_unavailable', preview: meta ?? null }) }] };
        }
        const original = Buffer.from(image.data, 'base64');
        const evidence = analyzeLuminanceJpeg(original);
        const grayscaleSha = createHash('sha256').update(evidence.grayscale_jpeg).digest('hex');
        const lowFrequencySha = createHash('sha256').update(evidence.low_frequency_jpeg).digest('hex');
        const materializedPath = requestedPath ? resolve(requestedPath) : source?.materializePath;
        const lowFrequencyPath = materializedPath ? (() => {
          const ext = extname(materializedPath);
          const stem = basename(materializedPath, ext);
          return resolve(dirname(materializedPath), `${stem}.low-frequency${ext || '.jpg'}`);
        })() : undefined;
        if (source && [materializedPath, lowFrequencyPath].some(file => file && resolve(file).toLowerCase() === resolve(source.sourcePath).toLowerCase())) {
          throw new Error('value_evidence_source_overwrite_forbidden: choose a different materialize_path');
        }
        if (materializedPath) {
          await mkdir(dirname(materializedPath), { recursive: true });
          await writeFile(materializedPath, evidence.grayscale_jpeg);
          await writeFile(lowFrequencyPath!, evidence.low_frequency_jpeg);
        }
        const response: Awaited<ReturnType<ToolRegistry['execute']>> = {
          content: [
            { type: 'image', data: evidence.grayscale_jpeg.toString('base64'), mimeType: 'image/jpeg' },
            { type: 'image', data: evidence.low_frequency_jpeg.toString('base64'), mimeType: 'image/jpeg' },
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                observed: true,
                document_id: Number(args.document_id),
                source_preview_sha256: typeof meta?.sha256 === 'string' ? meta.sha256 : null,
                grayscale_sha256: grayscaleSha,
                ...(materializedPath ? { materialized_path: materializedPath } : {}),
                low_frequency_sha256: lowFrequencySha,
                ...(lowFrequencyPath ? { low_frequency_materialized_path: lowFrequencyPath } : {}),
                width: evidence.width,
                height: evidence.height,
                low_frequency_width: evidence.low_frequency_width,
                low_frequency_height: evidence.low_frequency_height,
                sampled_pixels: evidence.sampled_pixels,
                luminance_summary: {
                  p10: evidence.p10_luma,
                  p50: evidence.p50_luma,
                  p90: evidence.p90_luma,
                  dark_ratio: evidence.dark_ratio,
                  midtone_ratio: evidence.midtone_ratio,
                  light_ratio: evidence.light_ratio,
                  center_mean: evidence.center_mean_luma,
                  border_mean: evidence.border_mean_luma,
                  center_border_abs_delta: evidence.center_border_abs_delta,
                },
                interpretation_note:
                  'These are descriptive luminance summaries, not an artistic score. Art Director must inspect the grayscale image and the low-frequency thumbnail explicitly; the thumbnail is intended to reveal whether large-form modelling survives suppression of small texture/noise.',
              }, null, 2),
            },
          ],
        };
        if (hooks && source) {
          const id = await hooks.registerEvidence(Number(args.document_id), source.sha256, response);
          const text = response.content.find(item => item.type === 'text');
          if (text?.type === 'text') text.text = JSON.stringify({ ...JSON.parse(text.text),
            evidence_operation_id: id, current_frame_sha256: source.sha256,
            director_evidence_fields: { evidence_operation_id: id, preview_sha256: source.sha256,
              grayscale_sha256: grayscaleSha, materialized_path: materializedPath },
          });
        }
        return response;
      },
    },
  ];
}
