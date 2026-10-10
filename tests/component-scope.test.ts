import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileGuardCycle, type GuardCycleCompilerStore } from '../src/core/guard/cycle-compiler.js';
import { normalizeSceneOwnershipPlan, sceneComponentScopeIssue, extendSceneOwnershipPlan } from '../src/core/scene-ownership-plan.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/flattened-woman-request.json', import.meta.url), 'utf8'));
function fixture(profile?: string, owners: Record<string, unknown>[] = []) {
  const dispatch = vi.fn(async () => { throw new Error('Offline compiler must never dispatch'); });
  const registry = new ToolRegistry();
  for (const name of ['photoshop_create_layer', 'photoshop_paint_regions', 'photoshop_execute_visual_microplan', 'photoshop_get_preview']) {
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } }, handler: dispatch });
  }
  const store: GuardCycleCompilerStore = {
    collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
    compactPassContext: () => ({ painting_profile: profile, logical_layer_owners: owners }),
  };
  return { registry, store, dispatch };
}
function person() {
  return normalizeSceneOwnershipPlan({ plan_id: 'portrait',
    units: ['face', 'hair', 'garment'].map(id => ({ semantic_id: id, owner_id: id, role: `Visible ${id}`, editability: 'independent' })),
    objects: [{ object_id: 'woman', subject_kind: 'person', kind: 'compound-object', component_semantic_ids: ['face', 'hair', 'garment'] }],
  });
}
function componentPass(plan = person()) {
  const request = structuredClone(saved);
  const p = request.next_pass;
  p.scene_ownership_plan = plan;
  p.logical_layer.hypothesis_id = 'face'; p.logical_layer.hypothesis = 'Only the visible face';
  p.logical_layer.layer_name = 'Woman | face'; delete p.logical_layer.attention_binding;
  p.goal = 'Construct one editable face component';
  p.actions[0].args.name = 'Woman | face';
  p.actions[0].id = 'layer'; p.actions[1].id = 'paint';
  p.actions[1].args.regions = [{ id: 'face-base', layer_id: '$steps.layer.details.layerId',
    color: { red: 180, green: 130, blue: 120 },
    contours: [{ points: [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 5, y: 10 }], closed: true }] }];
  return request;
}

it.each(['simple_graphic', 'nontrivial_painting', undefined])('rejects the exact flattened-woman request for profile=%s without dispatch', async profile => {
  const f = fixture(profile);
  const compiled = await compileGuardCycle(saved, f.store, f.registry);
  expect(compiled.violations).toContainEqual(expect.objectContaining({ code: 'scene_component_plan_required',
    details: expect.objectContaining({ required_fields: expect.arrayContaining(['subject_kind']),
      component_examples: expect.objectContaining({ person: ['body', 'face', 'hair', 'garment'] }) }) }));
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('rejects a whole person relabelled as a single-part object even in simple_graphic', async () => {
  const f = fixture('simple_graphic'); const request = structuredClone(saved);
  request.next_pass.scene_ownership_plan.objects = [{ object_id: 'woman', subject_kind: 'person',
    kind: 'single-part', component_semantic_ids: ['woman-whole'] }];
  const compiled = await compileGuardCycle(request, f.store, f.registry);
  expect(compiled.violations.some(row => row.code === 'scene_component_decomposition_required')).toBe(true);
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('requires actual subject scope instead of an untyped single-part claim', async () => {
  const f = fixture('simple_graphic'); const request = structuredClone(saved);
  request.next_pass.scene_ownership_plan.objects = [{ object_id: 'woman', kind: 'single-part', component_semantic_ids: ['woman-whole'] }];
  const compiled = await compileGuardCycle(request, f.store, f.registry);
  expect(compiled.violations.some(row => row.code === 'scene_component_scope_required')).toBe(true);
});
it('accepts one component construction with separately planned face, hair and garment owners', async () => {
  const f = fixture('simple_graphic');
  const compiled = await compileGuardCycle(componentPass(), f.store, f.registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  expect(compiled.nextOperation).toBeDefined();
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('rejects distinct component labels that share a real physical layer', async () => {
  const f = fixture('simple_graphic', [{ hypothesis_id: 'hair', layer_id: 7 }, { hypothesis_id: 'garment', layer_id: 7 }]);
  const compiled = await compileGuardCycle(componentPass(), f.store, f.registry);
  expect(compiled.violations.some(row => row.code === 'scene_component_layer_conflict')).toBe(true);
});
it('also rejects substantial temporary whole-subject construction before it can become a keep loophole', async () => {
  const f = fixture('simple_graphic'); const request = structuredClone(saved);
  request.next_pass.logical_layer.decision = 'temporary-hypothesis';
  const compiled = await compileGuardCycle(request, f.store, f.registry);
  expect(compiled.violations.some(row => row.code === 'scene_component_plan_required')).toBe(true);
});
it('keeps old plans readable, permits one additive scope declaration and forbids later reclassification/remapping', () => {
  const old = structuredClone(person()); delete old.objects![0].subject_kind;
  const classified = extendSceneOwnershipPlan(old, person());
  expect(classified.objects![0].subject_kind).toBe('person');
  const relabelled = structuredClone(classified); relabelled.objects![0].subject_kind = 'single-component';
  expect(() => extendSceneOwnershipPlan(classified, relabelled)).toThrow(/conflict/);
  const remapped = structuredClone(classified); remapped.units[0].owner_id = 'hair';
  expect(() => extendSceneOwnershipPlan(classified, remapped)).toThrow(/conflict/);
});
it('allows a real isolated component or continuous background without exploding tiny accents into objects', () => {
  for (const [subject, editability] of [['single-component', 'independent'], ['continuous-field', 'continuous-field']]) {
    const plan = normalizeSceneOwnershipPlan({ plan_id: 'part', units: [{ semantic_id: 'part', owner_id: 'part', role: 'One real part', editability }],
      objects: [{ object_id: 'part', subject_kind: subject, kind: 'single-part', component_semantic_ids: ['part'] }] });
    expect(sceneComponentScopeIssue(plan, 'part')).toBeUndefined();
  }
});
