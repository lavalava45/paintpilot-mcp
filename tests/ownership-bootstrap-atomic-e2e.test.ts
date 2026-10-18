import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { ToolRegistry, type ToolDefinition } from '../src/core/tool-registry.js';
import { withOptionalDocumentId } from '../src/core/document-target.js';
import { PhotoshopConnection } from '../src/platform/connection.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';
import { createLayerTools } from '../src/tools/layer-tools.js';
import { createDocumentTools } from '../src/tools/document-tools.js';
import { createStateTools } from '../src/tools/state-tools.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';
import { compileSemanticOwnership } from '../src/core/guard/semantic-execution-compiler.js';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'atomic-owner-e2e-'));
  roots.push(dir);
  const registry = new ToolRegistry();
  const connection = new PhotoshopConnection({
    detector: { detect: async () => ({ version: 'test', path: 'mock', isRunning: true }) },
  });
  const definitions = [
    ...createPaintingTools(connection), ...createLayerTools(connection),
    ...createDocumentTools(connection), ...createStateTools(connection),
  ];
  const calls: string[] = [];
  let nextLayerId = 80;
  const image = jpeg.encode({ data: Buffer.alloc(64 * 64 * 4, 180), width: 64, height: 64 }, 90).data;
  const file = path.join(dir, 'after.jpg');
  writeFileSync(file, image);
  const sha = createHash('sha256').update(image).digest('hex');
  const register = (name: string, handler: ToolDefinition['handler']) => {
    const definition = definitions.find(item => item.tool.name === name);
    if (!definition) throw new Error('Missing real tool definition ' + name);
    registry.register(name, { tool: withOptionalDocumentId(definition.tool), handler });
  };
  register('photoshop_create_layer', async args => {
    calls.push('create');
    return { content: [{ type: 'text', text: JSON.stringify({
      ok: true, history_steps: 1, document_target: { id: 42 },
      details: { layerId: ++nextLayerId, layerName: args.name },
    }) }] };
  });
  register('photoshop_paint_color_gradient', async () => {
    calls.push('gradient');
    return { content: [{ type: 'text', text: JSON.stringify({
      ok: true, history_steps: 1, document_target: { id: 42 },
      details: { applied: true, gradient_kind: 'raster-color-linear' },
    }) }] };
  });
  register('photoshop_get_preview', async () => {
    calls.push('preview');
    return { content: [{ type: 'text', text: JSON.stringify({
      ok: true, sha256: sha, materialized_path: file, width: 64, height: 64,
      canvas_width: 400, canvas_height: 300, scale_x: 64 / 400, scale_y: 64 / 300,
      mime_type: 'image/jpeg',
    }) }] };
  });
  register('photoshop_get_state', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true, document: { id: 42 } }) }],
  }));
  register('photoshop_get_layers', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true, layers: [
      { id: 7, name: 'Background' }, { id: nextLayerId, name: 'Field' },
    ] }) }],
  }));
  const visual = createVisualMicroPlanTools(registry, path.join(dir, 'barriers'))[0]!;
  registry.register(visual.tool.name, visual);
  const runtime = new EmbeddedGuardRuntime(registry, {
    runtimeDirectory: path.join(dir, 'controller'),
    previewBarrierDirectory: path.join(dir, 'barriers'),
    executionLeaseFile: path.join(dir, 'execution.lock'),
    workspaceRoot: dir, processVideoTraceEnabled: false,
    uxpReadinessProbe: async () => ({
      ready: true, transport: 'uxp', bridge_transport: 'long-poll',
      bridge_revision: UXP_BRIDGE_REVISION,
      expected_bridge_revision: UXP_BRIDGE_REVISION, revision_match: true,
      photoshop_version: '27.8', document_count: 1,
      active_document: { id: 42, name: 'Test.psd' }, plugin_connected: true,
      reason: null, checked_at: '2026-10-18T13:00:00.000Z',
      cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
    }),
    uxpStateProbe: async () => ({
      ok: true, data: { document: { id: 42, instanceWitness: {
        protocol: 'photoshop.uxp.document_instance_witness.v1',
        session_id: 'atomic-owner-e2e', token: 'atomic-owner-e2e:42',
      } }, activeLayer: { id: 7, name: 'Background' } },
    }),
  });
  const tools = createGuardTools(runtime);
  const cycle = tools.find(item => item.tool.name === 'photoshop_guard_cycle_auto')!;
  const setRun = tools.find(item => item.tool.name === 'photoshop_guard_set_art_run')!;
  const body = (result: Awaited<ReturnType<ToolDefinition['handler']>>) =>
    JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}') as any;
  return { dir, runtime, cycle, setRun, calls, body };
}

function first() {
  return {
    request_key: 'atomic-owned-field', problem_id: 'background-tone',
    document_id: 42, goal: 'Lay one restrained flat evening sky color field.',
    stage: 'GLOBAL_BLOCK_IN', scale: 'global', region: 'whole-canvas',
    visual_intent: 'continuous-field', construction_role: 'continuous-field',
    impact_class: 'construct', preferred_method_id: 'continuous-color-field',
    action_class: 'ADD',
    logical_layer: { decision: 'create-new', hypothesis_id: 'sky-field',
      hypothesis: 'One flat canvas background', layer_name: 'Field',
      component_space: 'canvas', physical_role: 'atmosphere', opacity_role: 'effect-only',
      rollback_value: 'moderate', expected_independent_rollback: true,
      separation_reasons: ['Independent field retains its own editable layer.'] },
    layer_separation_check: { change_kind: 'new-plane', substantial: true,
      rollback_value: 'moderate', independent_adjustment_expected: true },
    actions: [
      { id: 'new-field-layer', tool: 'photoshop_create_layer', args: { name: 'Field' } },
      { id: 'flat-field', tool: 'photoshop_paint_color_gradient',
        method_id: 'continuous-color-field', args: {
          layer_id: '$steps.new-field-layer.details.layerId',
          from: { x: 0, y: 0 }, to: { x: 400, y: 300 },
          stops: [{ position: 0, red: 35, green: 54, blue: 65 },
            { position: 1, red: 78, green: 91, blue: 99 }],
        } },
    ],
  };
}

describe('full guarded owner bootstrap with entirely simulated Photoshop', () => {
  it.each(['simple_graphic', 'nontrivial_painting'])(
    'uses one create + one native mutation, registers owner and scene plan under %s',
    async profile => {
      const f = fixture();
      const setting = f.body(await f.setRun.handler({
        document_id: 42, process_dir: 'processes/owner-bootstrap-fixture-process/run-01',
        painting_profile: profile, commentary_mode: 'technical',
      }));
      expect(setting.ok, JSON.stringify(setting)).toBe(true);
      const result = f.body(await f.cycle.handler({ next_pass: first() }));
      expect(result.preflight_rejection, JSON.stringify(result.preflight_rejection)).toBeUndefined();
      let completion = result;
      if (result.job_id) {
        for (let poll = 0; poll < 50; poll++) {
          const polled = f.runtime.pollJob(String(result.job_id)) as any;
          if (['completed', 'failed', 'uncertain'].includes(String(polled.state))) {
            completion = polled.result;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
      expect(completion.execution, JSON.stringify(completion)).toMatchObject({ phase: 'completed', failed: false });
      expect(f.calls.filter(call => call === 'create')).toHaveLength(1);
      expect(f.calls.filter(call => call === 'gradient')).toHaveLength(1);
      expect(f.runtime.store.sceneOwnershipPlan(42)?.units).toContainEqual(
        expect.objectContaining({ owner_id: 'sky-field', editability: 'continuous-field' }),
      );
      expect(f.runtime.store.semanticLayerOwners(42)).toContainEqual(
        expect.objectContaining({ hypothesis_id: 'sky-field', layer_id: 81 }),
      );
      const durable = f.runtime.store.compactPassContext(42);
      const continuation = compileSemanticOwnership({ target_owner_id: 'sky-field',
        actions: [{ id: 'continue', tool: 'photoshop_paint_color_gradient',
          args: { layer_id: 81 } }],
      }, durable);
      expect(continuation.issues).toEqual([]);
      expect(continuation.pass.logical_layer).toMatchObject({
        decision: 'continue-logical-layer', hypothesis_id: 'sky-field', layer_id: 81,
      });
      const foreign = compileSemanticOwnership({ target_owner_id: 'sky-field',
        actions: [{ id: 'foreign', tool: 'photoshop_paint_color_gradient',
          args: { layer_id: 7 } }],
      }, durable);
      expect(foreign.issues.map(item => item.code)).toContain('semantic_execution_owner_conflict');
      expect(foreign.pass).not.toHaveProperty('logical_layer');
      expect(f.runtime.store.read('atomic-owned-field')?.args.steps).toEqual(
        expect.arrayContaining([expect.objectContaining({
          tool: 'photoshop_paint_color_gradient',
          args: expect.objectContaining({ layer_id: '$steps.new-field-layer.details.layerId' }),
        })]),
      );
      expect(f.calls.filter(call => call === 'create')).toHaveLength(1);
    },
  );
});
