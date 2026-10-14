import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { SessionStore } from '../src/core/guard/session-store.js';

function probeTool(runtime: Record<string, unknown>) {
  return createGuardTools(runtime as any)
    .find(definition => definition.tool.name === 'photoshop_guard_brush_pack_profile')!;
}

describe('ordinary installed brush preset probe contract', () => {
  it('exposes probe_preset and returns its verified JPEG as image content', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'paintpilot-probe-preset-'));
    const previewPath = path.join(dir, 'probe.jpg');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    writeFileSync(previewPath, jpeg);
    const previewSha = createHash('sha256').update(jpeg).digest('hex');
    const tool = probeTool({
      brushPresetProbe: async () => ({
        ok: true,
        preset_name: 'Square Charcoal',
        evidence: {
          preset_name: 'Square Charcoal',
          preview_path: previewPath,
          preview_sha256: previewSha,
          operation_id: `brush-preset-probe:${'a'.repeat(64)}`,
          runtime_instance_witness: 'runtime-test',
          receipt_path: path.join(dir, 'receipt.json'),
          receipt_sha256: 'b'.repeat(64),
        },
      }),
    });
    const schema = tool.tool.inputSchema as any;
    expect(schema.properties.action.enum).toContain('probe_preset');

    const result = await tool.handler({ action: 'probe_preset', preset_name: 'Square Charcoal' });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image', mimeType: 'image/jpeg', data: jpeg.toString('base64') }),
    ]));
  });

  it('never turns mismatched native identity into successful probe evidence', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'paintpilot-probe-mismatch-'));
    const previewPath = path.join(dir, 'probe.jpg');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    writeFileSync(previewPath, jpeg);
    const previewSha = createHash('sha256').update(jpeg).digest('hex');
    const tool = probeTool({
      brushPresetProbe: async () => ({
        ok: true,
        preset_name: 'Different Brush',
        evidence: {
          preset_name: 'Different Brush',
          preview_path: previewPath,
          preview_sha256: previewSha,
        },
      }),
    });

    const result = await tool.handler({ action: 'probe_preset', preset_name: 'Square Charcoal' });
    expect(result.isError).toBe(true);
    expect(result.content.some(item => item.type === 'image')).toBe(false);
    const textPart = result.content.find(item => item.type === 'text');
    expect(textPart?.type === 'text' ? textPart.text : '').toContain('brush_preset_probe_identity_mismatch');
  });

  it('rejects live material preflight that still claims probe_status=not-needed', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'paintpilot-live-preflight-'));
    const store = new SessionStore(path.join(workspace, 'controller'), { workspaceRoot: workspace });
    expect(() => store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/live-brush-process/run-01',
      brush_preflight: {
        completed: true,
        inventory_observed: true,
        inventory_total: 123,
        runtime_instance_witness: 'runtime-live',
        runtime_instance_verified: true,
        roles: [{
          role_id: 'material-brush',
          purpose: 'Paint material-dependent broken mass.',
          material_roles: ['paint'],
          visual_intents: ['painted-mass', 'texture'],
          preferred_preset: 'Square Charcoal',
          alternative_presets: [],
          effective_settings: {
            size: 64, hardness: 50, roundness: 100, opacity: 100, flow: 100, spacing: 10,
            use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
            smoothing_enabled: true, smoothing: 10,
          },
          working_scale: 'medium',
          pressure_policy: 'none',
          probe_status: 'not-needed',
        }],
      },
    })).toThrow(/probe_status=not-needed is invalid/);
  });

  it('rejects probe evidence paths outside the canonical installed-preset evidence roots', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'paintpilot-evidence-path-'));
    const recordRoot = path.join(workspace, 'brush-records');
    mkdirSync(path.join(recordRoot, 'probes', 'installed-presets'), { recursive: true });
    mkdirSync(path.join(recordRoot, 'probe-receipts', 'installed-presets'), { recursive: true });
    const outsidePreview = path.join(recordRoot, 'outside.jpg');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    writeFileSync(outsidePreview, jpeg);
    const receiptPath = path.join(recordRoot, 'probe-receipts', 'installed-presets', 'receipt.json');
    const receiptBytes = Buffer.from('{}', 'utf8');
    writeFileSync(receiptPath, receiptBytes);
    const prior = process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR;
    process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR = recordRoot;
    try {
      const store = new SessionStore(path.join(workspace, 'controller'), { workspaceRoot: workspace });
      expect(() => store.setArtRunState({
        document_id: 42,
        process_dir: 'processes/path-escape-process/run-01',
        brush_preflight: {
          completed: true,
          inventory_observed: true,
          inventory_total: 123,
          runtime_instance_witness: 'runtime-live',
          runtime_instance_verified: true,
          roles: [{
            role_id: 'material-brush', purpose: 'Paint texture.', material_roles: ['paint'], visual_intents: ['texture'],
            preferred_preset: 'Square Charcoal', alternative_presets: [], working_scale: 'medium', pressure_policy: 'none', probe_status: 'pass',
            effective_settings: {
              size: 64, hardness: 50, roundness: 100, opacity: 100, flow: 100, spacing: 10,
              use_pressure_size: false, use_pressure_opacity: false, airbrush: false, smoothing_enabled: true, smoothing: 10,
            },
            candidate_evidence: [{
              preset_name: 'Square Charcoal', profile_id: 'profile:fixture', evidence_score: 10,
              mark_character: ['broken'], edge_behavior: 'broken', buildup_behavior: 'granular',
              useful_scale_range: { min_px: 8, max_px: 128 }, rotation_meaningful: false, pressure_policy: 'none',
              dynamics_capability: {
                native_pressure_size: false, native_pressure_opacity: false, simulated_pressure_size: false,
                simulated_pressure_opacity: false, rotation_meaningful: false, spacing_tunable: true,
                opacity_tunable: true, flow_tunable: true,
              },
              effective_settings: {}, caveats: [],
              probe_evidence: {
                preset_name: 'Square Charcoal', preview_path: outsidePreview,
                preview_sha256: createHash('sha256').update(jpeg).digest('hex'),
                operation_id: `brush-preset-probe:${'a'.repeat(64)}`, runtime_instance_witness: 'runtime-live',
                receipt_path: receiptPath, receipt_sha256: createHash('sha256').update(receiptBytes).digest('hex'),
              },
            }],
          }],
        },
      })).toThrow(/outside the installed-preset evidence directory/);
    } finally {
      if (prior === undefined) delete process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR;
      else process.env.PHOTOSHOP_BRUSH_PACK_RECORD_DIR = prior;
    }
  });
});
