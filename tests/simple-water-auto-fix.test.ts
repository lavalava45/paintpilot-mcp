import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileMinimalOwnerBootstrap } from '../src/core/guard/ownership-bootstrap-compiler.js';
import { normalizeSimpleGraphicPass } from '../src/core/guard/simple-graphic-leniency.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { normalizeSceneOwnershipPlan } from '../src/core/scene-ownership-plan.js';

function registry() {
  const r = new ToolRegistry();
  for (const name of ['photoshop_create_layer', 'photoshop_paint_regions', 'photoshop_paint_color_gradient',
    'photoshop_get_preview']) {
    r.register(name, { tool: { name, inputSchema: { type: 'object' } },
      handler: async () => { throw Error('No Photoshop mutation in offline contract test'); } });
  }
  return r;
}
function savedSkyPlan() {
  return {
    protocol: 'photoshop.guard.scene_ownership_plan.v1',
    plan_id: 'canal-owners-v2',
    units: [{ semantic_id: 'upper-sky', owner_id: 'sky',
      role: 'Pale spring atmosphere', editability: 'continuous-field',
      edit_axes: ['color', 'visibility', 'rollback'] }],
    objects: [{ object_id: 'sky-object', kind: 'single-part',
      subject_kind: 'continuous-field', component_semantic_ids: ['upper-sky'] }],
    shared_owner_justifications: [],
  };
}
function water() {
  const ref = '$steps.create_water.details.layerId';
  return {
    request_key: 'canal-waterwater-safe-new-request', problem_id: 'canal-water-foundation',
    document_id: 1063, goal: 'One flat editable foreground canal-water silhouette',
    stage: 'GLOBAL_BLOCK_IN', scale: 'medium', action_class: 'ADD',
    visual_intent: 'mass', impact_class: 'construct', construction_role: 'structured-mass',
    preferred_method_id: 'continuous-color-field',
    logical_layer: {
      decision: 'create-new', hypothesis_id: 'canal_water',
      hypothesis: 'Single bounded flat water silhouette as a distinct canvas component',
      layer_name: 'Water — flat reflection field', component_space: 'canvas',
      rollback_value: 'moderate', expected_independent_rollback: true,
    },
    actions: [
      { id: 'create_water', tool: 'photoshop_create_layer',
        args: { name: 'Water — flat reflection field' } },
      { id: 'paint_water', tool: 'photoshop_paint_regions', args: {
        layer_id: ref, regions: [{
          id: 'canal-polygon', layer_id: ref, color: { red: 83, green: 128, blue: 130 },
          contours: [{ points: [
            { x: 100, y: 810 }, { x: 850, y: 810 },
            { x: 850, y: 1570 }, { x: 100, y: 1570 },
          ] }],
        }],
      } },
    ],
  };
}
const context = () => ({ painting_profile: 'simple_graphic',
  document_target: { id: 1063 },
  logical_layer_owners: [{ hypothesis_id: 'sky', layer_id: 31, temporary: false }],
  scene_ownership_plan: savedSkyPlan(), has_visual_frame: true });

describe('Canal water first-followup: compiler owns technical forms', () => {
  it('adds precisely one explicitly 2D region owner without altering existing sky ownership', () => {
    const input = water();
    const previous = structuredClone(input);
    const result = compileMinimalOwnerBootstrap(input, context());
    expect(result.derived).toBe(true);
    const plan = normalizeSceneOwnershipPlan(result.pass.scene_ownership_plan);
    expect(plan.plan_id).toBe('canal-owners-v2');
    expect(plan.units.map(u => u.owner_id).sort()).toEqual(['canal_water', 'sky']);
    expect(plan.objects?.find(o => o.component_semantic_ids.some(id =>
      plan.units.find(u => u.semantic_id === id)?.owner_id === 'canal_water')))
      .toMatchObject({ subject_kind: 'single-component', kind: 'single-part' });
    expect(input).toEqual(previous);
  });
  it('converts only an incompatible technique hint to one verified executable method', () => {
    const r = registry();
    const input = water();
    const value = normalizeSimpleGraphicPass(input, context(), r);
    expect(value.pass.preferred_method_id).toBe('region-block-in');
    expect(value.pass.actions).toEqual(input.actions);
    expect(value.pass.visual_intent).toBe('mass');
    expect(value.notices).toContainEqual(expect.objectContaining({ code: 'simple_graphic_auto_fix' }));
    const ambiguous = { ...water(), visual_intent: 'continuous-field' };
    expect(normalizeSimpleGraphicPass(ambiguous, context(), r).pass.preferred_method_id)
      .toBe('continuous-color-field');
    expect(normalizeSimpleGraphicPass(input, { ...context(), painting_profile: 'nontrivial_painting' }, r).pass)
      .toEqual(input);
  });
  it('threads the exact 2D owner and method through the real compact compiler without Photoshop execution', async () => {
    const r = registry();
    const c = context();
    const store: any = { compactPassContext: () => c, collectClosePreviousErrors: () => [],
      collectPreflightErrors: () => [] };
    const compiled = await compileGuardCycle({ next_pass: water() }, store, r);
    const codes = compiled.violations.map(i => i.code);
    expect(codes).not.toContain('scene_ownership_owner_unplanned');
    expect(codes).not.toContain('scene_geometry_model_required');
    expect(codes).not.toContain('artistic_method_execution_mismatch');
    expect(compiled.normalizations.map(n => n.code)).toContain('scene_single_component_plan_compiled');
    expect(compiled.normalizations.map(n => n.code)).toContain('simple_graphic_auto_fix');
  });
  it('does not flatten world-space water, invent a component scope or override an authored method ID on a step', () => {
    const r = registry();
    const world = water();
    world.logical_layer.component_space = 'world';
    expect(compileMinimalOwnerBootstrap(world, context()).derived).toBe(false);
    const tiered = water() as any;
    tiered.logical_layer.construction_tier = 'primary';
    expect(compileMinimalOwnerBootstrap(tiered, context()).derived).toBe(true);
    const multi = water() as any;
    multi.actions[1].args.regions.push({ id: 'another', layer_id: multi.actions[1].args.layer_id });
    expect(compileMinimalOwnerBootstrap(multi, context()).derived).toBe(false);
    const stepMethod = water() as any;
    stepMethod.actions[1].method_id = 'continuous-color-field';
    expect(normalizeSimpleGraphicPass(stepMethod, context(), r).pass.preferred_method_id)
      .toBe('continuous-color-field');
    const foreign = water() as any;
    foreign.actions[1].args.regions[0].layer_id = 32;
    expect(compileMinimalOwnerBootstrap(foreign, context()).derived).toBe(false);
  });
});
