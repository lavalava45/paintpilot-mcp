import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { collectSchemaErrors } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { SCENE_FOUNDATION_SCHEMA, SCENE_FOUNDATION_VERSION, foundationAdmission,
  sceneFoundationRequest, validateSceneFoundation } from '../src/core/guard/scene-foundation.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const state = () => ({ document_id: 479, document_incarnation_id: 'pagoda-instance',
  original_brief: 'Fine pencil pagoda on aged kraft paper, mountains and tiny human in a complete frontal composition.',
  scene_foundation_policy: SCENE_FOUNDATION_VERSION, current_frame: { operation_id: 'pagoda-flat', sha256: 'actual-sha' } });
const record = () => ({ id: 'pagoda-flat', visual: true, phase: 'completed', dispatched: true,
  tool: 'photoshop_execute_visual_microplan', created_at: '2026-10-18T00:00:00Z',
  args: { document_id: 479 }, preview: { sha256: 'actual-sha', canvas_width: 900, canvas_height: 1600 } });
function review(status = 'fail') {
  return { request_id: sceneFoundationRequest(record(), state()).request_id,
    composition: { status, visible: 'Only a mountain on the left; the right surroundings and paper are absent.', next_change: 'Establish the whole mountain horizon, ground and kraft-paper field.' },
    technique: { status, visible: 'Opaque filled polygons dominate; a pencil contour and hatch sample is absent.', next_change: 'Demonstrate fine pencil contours and hatching on one roof.',
      ...(status === 'pass' ? { sample_region: { left: 300, top: 205, right: 602, bottom: 332 } } : {}) } };
}
function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'scene-foundation-')); dirs.push(dir);
  const s = new SessionStore(dir); s.updatePaintingState(479, () => state()); s.write(record() as any); return s;
}
const detail = { tool: 'photoshop_execute_visual_microplan', stage: 'GLOBAL_BLOCK_IN', scale: 'medium',
  args: { document_id: 479, stage: 'GLOBAL_BLOCK_IN', scale: 'medium', change_domains: ['local-shape'] } };
const composition = { ...detail, foundation_goal: 'composition', args: { ...detail.args, change_domains: ['composition', 'background-scope'] } };
const technique = { ...detail, foundation_goal: 'technique', args: { ...detail.args,
  region_bounds: { left: 300, top: 205, right: 602, bottom: 332 }, visual_intent: 'line' } };

it('requires whole composition and medium proof before local work even when relabelled GLOBAL_BLOCK_IN', () => {
  expect(foundationAdmission(state(), detail).status).toBe('blocked');
  const partial = { ...state(), scene_foundation: validateSceneFoundation(review(), record(), state()) };
  expect(foundationAdmission(partial, composition).status).toBe('foundation-repair');
  expect(foundationAdmission(partial, technique).status).toBe('foundation-repair');
  expect(foundationAdmission(partial, { ...detail, foundation_goal: 'composition' }).status).toBe('blocked');
});
it('permits the first subject and non-painting closures without demanding an extra preview', () => {
  expect(foundationAdmission({ ...state(), current_frame: undefined }, detail).status).toBe('initial-subject');
  expect(validateSceneFoundation(undefined, record(), state())).toBeUndefined();
  const s = store(); expect(() => s.priorityGate(479, { tool: 'photoshop_save_document', args: { document_id: 479 } })).not.toThrow();
});
it('uses a separate early milestone rather than requiring the whole unfinished artwork to pass Critic', () => {
  const r = review('pass'); r.composition.visible = 'The whole subject, required surroundings, ground and kraft-paper field are established.';
  r.technique.visible = 'The upper eave has thin broken pencil contours and directional hatch marks against kraft paper.';
  const proof = validateSceneFoundation(r, record(), state());
  expect(collectSchemaErrors(SCENE_FOUNDATION_SCHEMA, r)).toEqual([]);
  expect(foundationAdmission({ ...state(), scene_foundation: proof }, detail).status).toBe('ready');
  for (const field of ['composition', 'technique'] as const) {
    const partial: any = structuredClone(proof); partial[field].status = 'fail';
    expect(foundationAdmission({ ...state(), scene_foundation: partial }, detail).status).toBe('blocked');
  }
});
it('binds review to exact frame, brief and document incarnation and requires a real sample location', () => {
  const r = review('pass');
  for (const variant of [{ ...state(), original_brief: 'Different task' }, { ...state(), document_incarnation_id: 'reused-doc' }])
    expect(() => validateSceneFoundation(r, record(), variant)).toThrow(/request_id/);
  expect(() => validateSceneFoundation(r, { ...record(), preview: { sha256: 'other-frame' } }, state())).toThrow(/request_id/);
  const noSample: any = structuredClone(r); delete noSample.technique.sample_region;
  expect(() => validateSceneFoundation(noSample, record(), state())).toThrow(/sample_region/);
  const outside = structuredClone(r); outside.technique.sample_region!.right = 901;
  expect(() => validateSceneFoundation(outside, record(), state())).toThrow(/inside the delivered canvas/);
});
it('preempts conflicting artistic priorities and Director tasks while preserving unresolved defects', () => {
  const s = store();
  s.updatePaintingState(479, current => ({ ...current, visual_problems: { shell: { problem_id: 'shell', scale: 'global', severity: 'must-fix', status: 'open' } },
    art_director: { status: 'review_due', directive_id: 'old-detail', review_due: true },
    owner_representation_state: { tower: { state: 'primitive-scaffold' } } }));
  for (const request of [composition, technique]) {
    expect(() => s.priorityGate(479, request)).not.toThrow();
    expect(() => s.plannerGate(479, request)).not.toThrow();
  }
  expect(() => s.plannerGate(479, detail)).toThrow(/scene_foundation_required/);
  expect(s.paintingState().documents['479'].visual_problems.shell.status).toBe('open');
});
it('does not inherit a passed foundation after its source pixels are rolled back', () => {
  const s = store(); s.updatePaintingState(479, current => ({ ...current,
    scene_foundation: validateSceneFoundation(review('pass'), record(), current) }));
  expect(s.sceneFoundationAdmission(479, detail).status).toBe('ready');
  s.write({ ...record(), rolled_back: true } as any);
  expect(s.sceneFoundationAdmission(479, detail).status).toBe('blocked');
});
it('publishes both review and recovery fields in the actual ordinary cycle schema', () => {
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: mkdtempSync(path.join(tmpdir(), 'foundation-schema-')) });
  dirs.push(runtime.runtimeDirectory);
  const cycle = createGuardTools(runtime).find(t => t.tool.name === 'photoshop_guard_cycle_auto')!.tool.inputSchema as any;
  expect(cycle.properties.previous_observation.properties.scene_foundation).toEqual(SCENE_FOUNDATION_SCHEMA);
  expect(cycle.properties.next_pass.properties.foundation_goal.enum).toEqual(['composition', 'technique']);
});
