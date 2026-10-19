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

function fixture(nonempty = false) {
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
  let instanceWitness = { protocol: 'photoshop.uxp.document_instance_witness.v1',
    session_id: 'atomic-owner-e2e', token: 'atomic-owner-e2e:42' };
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
  register('photoshop_fill_layer', async () => {
    calls.push('fill');
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, history_steps: 1,
      document_target: { id: 42 }, details: { applied: true } }) }] };
  });
  register('photoshop_paint_regions', async () => {
    calls.push('regions');
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, history_steps: 1,
      document_target: { id: 42 }, details: { applied: true } }) }] };
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
      { id: 7, name: 'Background', isBackground: true, kind: 'LayerKind.NORMAL' },
      { id: nextLayerId, name: 'Field', depth: 0, kind: 'LayerKind.NORMAL', isBackground: false,
        bounds: { left: 0, top: 0, right: nonempty ? 20 : 0, bottom: nonempty ? 20 : 0 } },
    ], context: { document: { id: 42, name: 'Test.psd', width: 400, height: 300 } }, document_target: { id: 42 } }) }],
  }));
  registry.register('photoshop_get_history', { tool: { name: 'photoshop_get_history', inputSchema: { type: 'object' } },
    handler: async () => ({ content: [{ type: 'text', text: 'History States:\n' + JSON.stringify({
      totalStates: 3, currentIndex: 2, currentState: 'New Layer',
      states: [{ name: 'Test.psd', snapshot: true }, { name: 'New', snapshot: false }, { name: 'New Layer', snapshot: false }],
    }) }] }) });
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
      ok: true, data: { document: { id: 42, name: 'Test.psd', width: 400, height: 300, instanceWitness },
        activeLayer: { id: 7, name: 'Background' } },
    }),
  });
  const tools = createGuardTools(runtime);
  const cycle = tools.find(item => item.tool.name === 'photoshop_guard_cycle_auto')!;
  const setRun = tools.find(item => item.tool.name === 'photoshop_guard_set_art_run')!;
  const body = (result: Awaited<ReturnType<ToolDefinition['handler']>>) =>
    JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}') as any;
  return { dir, runtime, cycle, setRun, calls, body, restart: () => {
    instanceWitness = { ...instanceWitness, session_id: 'after-reload', token: 'after-reload:42' };
  }, witness: () => instanceWitness };
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
  it.each([
    ['next_pass', false, false], ['next_pass', false, true], ['next_pass', true, false],
    ['painting_intent', false, false], ['painting_intent', false, true], ['painting_intent', true, false],
    ['next_pass', false, false, 'create-new'], ['next_pass', false, true, 'create-new'],
    ['next_pass', true, false, 'create-new'], ['painting_intent', false, false, 'create-new'],
    ['painting_intent', false, true, 'create-new'],
    ['next_pass', false, false, 'create-new', true], ['painting_intent', false, false, 'create-new', true],
  ] as const)('binds separately created sky via %s (nonempty=%s, authoredPlan=%s, decision=%s, reload=%s)', async (mode, nonempty, authoredPlan, decision, reload) => {
    const f = fixture(nonempty);
    await f.setRun.handler({ document_id: 42, process_dir: 'processes/owner-bootstrap-fixture-process/run-01',
      painting_profile: 'simple_graphic', commentary_mode: 'technical' });
    f.runtime.store.write({ id: 'separate-create', tool: 'photoshop_create_layer',
      args: { document_id: 42 }, sequence: 1, created_at: new Date().toISOString(),
      phase: 'completed', failed: false, dispatched: true, visual: false,
      report: { did: 'Created empty layer' }, operation_ack: {},
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true,
        document_target: { id: 42 }, details: { layerId: 80, layerName: 'Field', relativeToId: 7,
          history_steps: 1, history_evidence: 'uxp_modal_native_history_cursor',
          context: { activeLayer: { isBackground: false,
            bounds: { left: 0, top: 0, right: 0, bottom: 0 } } } } }) }] } } as any);
    if (reload) {
      f.runtime.store.observeDocumentInstance(42, f.witness());
      f.runtime.store.write({ id: 'same-document-bootstrap', sequence: 0, created_at: new Date().toISOString(),
        tool: 'photoshop_create_document', args: {}, phase: 'completed', dispatched: true, failed: false,
        visual: false, report: { did: 'Created initial document' }, operation_ack: {},
        bootstrap_outcome: { document: { id: 42, name: 'Test.psd', width: 400, height: 300 } } } as any);
      f.runtime.store.updatePaintingState(42, current => ({ ...current,
        document_instance: { ...current.document_instance, bootstrap_operation_id: 'same-document-bootstrap' } }));
      f.restart();
      const recovered = await f.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true });
      expect(recovered.identity_recovery).toMatchObject({ status: 'confirmed', recovery_mode: 'empty_layer_setup' });
      expect(f.runtime.store.semanticLayerOwners(42)).toEqual([]);
      expect(f.calls).not.toContain('gradient');
    }
    const pass: any = first();
    pass.scene_ownership_plan = {
      protocol: 'photoshop.guard.scene_ownership_plan.v1', plan_id: 'scene-test',
      units: [{ semantic_id: 'sky-unit', owner_id: 'sky-field', role: 'Sky color field',
        editability: 'continuous-field', edit_axes: ['color', 'rollback'] }],
      objects: [{ object_id: 'sky-object', kind: 'single-part', subject_kind: 'continuous-field',
        component_semantic_ids: ['sky-unit'] }], shared_owner_justifications: [],
    };
    pass.logical_layer.decision = decision ?? 'continue-logical-layer';
    pass.logical_layer.layer_id = 80;
    pass.actions.shift();
    pass.actions[0].args.layer_id = 80;
    if (!authoredPlan) delete pass.scene_ownership_plan;
    if (mode === 'painting_intent') {
      pass.action = 'add';
      pass.target_owner_id = 'sky-field';
      delete pass.action_class;
    }
    const result = f.body(await f.cycle.handler({ [mode]: pass }));
    expect(result.preflight_rejection, JSON.stringify(result)).toBeUndefined();
    let completion = result;
    if (result.job_id) for (let poll = 0; poll < 60; poll++) {
      const polled = f.runtime.pollJob(String(result.job_id)) as any;
      if (['completed', 'failed', 'uncertain'].includes(String(polled.state))) { completion = polled.result; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(f.calls).not.toContain('create');
    const owners = f.runtime.store.semanticLayerOwners(42);
    if (nonempty) {
      expect(f.calls).not.toContain('gradient');
      expect(owners).toEqual([]);
      expect(f.runtime.store.sceneOwnershipPlan(42)).toBeNull();
    } else {
      expect(completion.execution, JSON.stringify(completion)).toMatchObject({ failed: false });
      expect(f.calls).toContain('gradient');
      expect(owners).toContainEqual(expect.objectContaining({ hypothesis_id: 'sky-field', layer_id: 80 }));
    }
  });
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
      const callsBeforeReplay = [...f.calls];
      const repeated = f.body(await f.cycle.handler({ next_pass: first() }));
      expect(repeated.preflight_rejection, JSON.stringify(repeated)).toBeUndefined();
      expect(repeated.execution).toMatchObject({ operation_id: 'atomic-owned-field', phase: 'completed', failed: false });
      expect(f.calls).toEqual(callsBeforeReplay);
      const changed = first(); changed.goal = 'A different authored operation using the same key';
      const conflict = await f.cycle.handler({ next_pass: changed });
      expect(JSON.stringify(conflict)).toContain('operation_request_identity_conflict');
      expect(f.calls).toEqual(callsBeforeReplay);
    },
  );
  it.each(['fill', 'regions'])('admits the compiler-owned flat canvas transition using %s', async mechanism => {
    const f = fixture();
    await f.setRun.handler({ document_id: 42, process_dir: 'processes/owner-bootstrap-fixture-process/run-01',
      painting_profile: 'simple_graphic', commentary_mode: 'technical' });
    const pass: any = first();
    pass.actions[1] = { id: 'flat-field', tool: 'photoshop_fill_layer', method_id: 'continuous-color-field',
      args: { layer_id: '$steps.new-field-layer.details.layerId', red: 180, green: 35, blue: 45 } };
    if (mechanism === 'regions') {
      pass.construction_role = 'structured-mass'; pass.visual_intent = 'mass';
      pass.material_role = 'opaque graphic pigment'; pass.preferred_method_id = 'region-block-in';
      pass.logical_layer.physical_role = 'opaque-mass'; pass.logical_layer.opacity_role = 'opaque';
      pass.actions[1] = { id: 'flat-field', tool: 'photoshop_paint_regions', method_id: 'region-block-in',
        args: { regions: [{ layer_id: '$steps.new-field-layer.details.layerId', color: { red: 25, green: 80, blue: 200 },
          contours: [{ points: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 140 }, { x: 20, y: 140 }] }] }] } };
    }
    const submitted = f.body(await f.cycle.handler({ next_pass: pass }));
    let result = submitted;
    if (submitted.job_id) for (let i = 0; i < 100; i++) {
      const job = f.runtime.pollJob(submitted.job_id) as any;
      if (['completed', 'failed', 'uncertain'].includes(job.state)) { result = job.result; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(result.preflight_rejection, JSON.stringify(result)).toBeUndefined();
    expect(result.execution, JSON.stringify(result)).toMatchObject({ phase: 'completed', failed: false });
    expect(f.calls.filter(call => call === mechanism)).toHaveLength(1);
    expect(f.runtime.store.read('atomic-owned-field')?.args.paint_strategy).toMatchObject({
      construction_role: pass.construction_role, visual_intent: pass.visual_intent });
  });
});
