import { expect, it, vi } from 'vitest';
import { SessionStore } from '../src/core/guard/session-store.js';
import { readFileSync } from 'node:fs';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileGuardCycle, type GuardCycleCompilerStore } from '../src/core/guard/cycle-compiler.js';
import { normalizeSceneOwnershipPlan, sceneComponentScopeIssue, extendSceneOwnershipPlan } from '../src/core/scene-ownership-plan.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/flattened-woman-request.json', import.meta.url), 'utf8'));
function fixture(profile?: string, owners: Record<string, unknown>[] = [], plan?: Record<string, unknown>) {
  const dispatch = vi.fn(async () => { throw new Error('Offline compiler must never dispatch'); });
  const registry = new ToolRegistry();
  for (const name of ['photoshop_create_layer', 'photoshop_paint_regions', 'photoshop_execute_visual_microplan', 'photoshop_get_preview']) {
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } }, handler: dispatch });
  }
  const store: GuardCycleCompilerStore = {
    collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
    compactPassContext: () => ({ painting_profile: profile, logical_layer_owners: owners, scene_ownership_plan: plan }),
  };
  return { registry, store, dispatch };
}
function person() {
  return normalizeSceneOwnershipPlan({ plan_id: 'portrait',
    units: ['face', 'hair', 'garment'].map(id => ({ semantic_id: id, owner_id: id, role: `Visible ${id}`, editability: 'independent', edit_axes: ['visibility', 'color', 'rollback'] })),
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

const scaffoldPlan = normalizeSceneOwnershipPlan({ plan_id: 'cozy_cafe_ownership_v1',
  objects: [{ object_id: 'cafe_underpainting', kind: 'single-part', subject_kind: 'single-component', component_semantic_ids: ['composition_study'] }],
  units: [{ semantic_id: 'composition_study', owner_id: 'cafe_underpainting', role: 'Temporary composition study', editability: 'temporary' }],
});
const scaffoldOwner = { hypothesis_id: 'cafe_underpainting', layer_id: 2, layer_name: '01 - Underpainting',
  temporary: true, rollback_value: 'high', hypothesis: 'Temporary composition study', physical_role: 'opaque-mass', opacity_role: 'opaque' };
function continuingPart(owner = 'cafe_underpainting', layer = 2) {
  const request = componentPass(); const p = request.next_pass;
  delete p.scene_ownership_plan; delete p.layer_separation_check;
  p.stage = 'GLOBAL_BLOCK_IN'; p.problem_id = 'cafe_flat_window_debt';
  p.logical_layer = { decision: 'continue-logical-layer', hypothesis_id: owner, layer_id: layer, expected_independent_rollback: true };
  p.actions = [p.actions[1]]; p.actions[0].args.regions[0].layer_id = layer;
  return request;
}
it('preserves structural correction semantics through polygon compilation without granting cosmetic or unplanned admission', async () => {
  const owner={hypothesis_id:'face',hypothesis:'Rebuild the visible component support',layer_id:7,rollback_value:'low',physical_role:'opaque-mass',opacity_role:'opaque'};
  const f=fixture('simple_graphic',[owner],person() as any);
  const art:any={directive_id:'cafe-correction',status:'active',review_due:false,current_task_id:'repair-support',
    tasks:[{task_id:'repair-support',status:'active',allowed_scales:['medium','small'],allowed_global_changes:['depth-structure'],
      construction_plan:{representation_strategy:'Rebuild support'},correction_target:{problem_id:'global-debt',
        region_bounds:{left:0,top:0,right:200,bottom:200}}}]};
  const original=f.store.compactPassContext!;
  f.store.compactPassContext=(...args)=>({...original(...args),art_director:art});
  const request=continuingPart('face',7);
  Object.assign(request.next_pass,{scale:'medium',region_bounds:{left:0,top:0,right:100,bottom:100},
    addresses_problem_id:'global-debt',change_domains:['depth-structure']});
  const compiled=await compileGuardCycle(request,f.store,f.registry);
  expect(compiled.violations,JSON.stringify(compiled.violations)).toEqual([]);
  const operation:any=compiled.input.next_operation;
  expect(operation.args.change_domains).toEqual(['local-shape','depth-structure']);
  const blocker={problem_id:'global-debt',scale:'global'};
  const admits=(req:any)=>SessionStore.prototype.plannedComponentCorrection.call({}, {art_director:art},req,blocker);
  expect(admits(operation)).toBe(true);
  expect(admits({...operation,impact_class:'texture'})).toBe(false);
  // Top-level and micro-plan singular/plural problem links are additive:
  // replace all declared references to actually make the pass unrelated.
  const unrelated = structuredClone(operation);
  unrelated.addresses_problem_id = 'different-debt';
  unrelated.addresses_problem_ids = ['different-debt'];
  unrelated.args.addresses_problem_id = 'different-debt';
  unrelated.args.addresses_problem_ids = ['different-debt'];
  expect(admits(unrelated)).toBe(false);
  expect(admits({...operation,args:{...operation.args,region_bounds:{left:0,top:0,right:300,bottom:300}}})).toBe(false);
  const cosmetic=structuredClone(request);cosmetic.next_pass.impact_class='texture';
  const cosmeticCompiled=await compileGuardCycle(cosmetic,f.store,f.registry);
  expect((cosmeticCompiled.input.next_operation as any).impact_class).toBe('texture');
  expect(admits(cosmeticCompiled.input.next_operation)).toBe(false);
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('freezes the observed cafe scaffold before both inherited and explicitly relabelled continuations', async () => {
  const f = fixture('simple_graphic', [scaffoldOwner], scaffoldPlan as any);
  const inherited = await compileGuardCycle(continuingPart(), f.store, f.registry);
  expect(inherited.violations).toContainEqual(expect.objectContaining({ code: 'scene_scaffold_frozen' }));
  const disguised = continuingPart();
  disguised.next_pass.logical_layer.decision = 'adjust';
  disguised.next_pass.logical_layer.rollback_value = 'low';
  disguised.next_pass.layer_separation_check = { change_kind: 'continuation', substantial: false, rollback_value: 'low', independent_adjustment_expected: false };
  const explicit = await compileGuardCycle(disguised, f.store, f.registry);
  expect(explicit.violations).toContainEqual(expect.objectContaining({ code: 'scene_scaffold_frozen' }));
  expect(f.dispatch).not.toHaveBeenCalled();
  const unknown = fixture('simple_graphic', [scaffoldOwner]);
  const missing = await compileGuardCycle(continuingPart(), unknown.store, unknown.registry);
  expect(missing.violations).toContainEqual(expect.objectContaining({ code: 'scene_ownership_plan_required' }));
});
it('lets the next independent component be built while retaining the frozen cafe scaffold', async () => {
  const expanded = normalizeSceneOwnershipPlan({ ...scaffoldPlan, units: [...scaffoldPlan.units, ...person().units], objects: [...scaffoldPlan.objects!, ...person().objects!] });
  const f = fixture('simple_graphic', [scaffoldOwner], scaffoldPlan as any);
  const compiled = await compileGuardCycle(componentPass(expanded), f.store, f.registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
});
it('keeps ordinary multi-mark continuation on an independently planned temporary component legal', async () => {
  const owner = { ...scaffoldOwner, hypothesis_id: 'face', layer_id: 7 };
  const f = fixture('simple_graphic', [owner], person() as any);
  const request = continuingPart('face', 7);
  request.next_pass.actions[0].args.regions.push(structuredClone(request.next_pass.actions[0].args.regions[0]));
  const compiled = await compileGuardCycle(request, f.store, f.registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  request.next_pass.scale = 'small';
  request.next_pass.actions[0].args.regions[0].layer_id = 8;
  const foreignSmall = await compileGuardCycle(request, f.store, f.registry);
  expect(foreignSmall.violations).toContainEqual(expect.objectContaining({ code: 'semantic_mutation_target_owner_mismatch' }));
});

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
it('also rejects whole-subject construction labelled as an insubstantial temporary hypothesis', async () => {
  const f = fixture('simple_graphic'); const request = structuredClone(saved);
  request.next_pass.logical_layer.decision = 'temporary-hypothesis';
  request.next_pass.layer_separation_check.substantial = false;
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
    const plan = normalizeSceneOwnershipPlan({ plan_id: 'part', units: [{ semantic_id: 'part', owner_id: 'part', role: 'One real part', editability, edit_axes: ['visibility', 'rollback'] }],
      objects: [{ object_id: 'part', subject_kind: subject, kind: 'single-part', component_semantic_ids: ['part'] }] });
    expect(sceneComponentScopeIssue(plan, 'part')).toBeUndefined();
  }
});
