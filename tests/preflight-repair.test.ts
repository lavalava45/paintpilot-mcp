import { describe, expect, it } from 'vitest';
import {
  applyDeterministicPassRepairs,
  classifyViolation,
  classifyViolations,
  machineRepairRecipe,
  fieldCorrectionPacket,
  splitPassForBudget,
  omitRedundantConstructionLayerAction,
  prepareTechnicalPassBindings,
  type RepairableViolation,
} from '../src/core/guard/preflight-repair.js';

function violation(code: string, message = code, details?: Record<string, unknown>): RepairableViolation {
  return { scope: 'next_operation', code, message, ...(details ? { details } : {}) };
}

describe('preflight repair', () => {
  it('drops a false duplicate sample only when the same named artistic choice and RGB are already retained', () => {
    const input: any = { scene_lighting_color_model: {
      ambient_environment: { id: 'sky', family: 'teal', provenance: 'artist-selected', sample: { rgb: [20, 40, 45], source: 'chosen by artist' } },
    }, color_gradient_preflight: { stops: [{ id: 'top', source_anchor_id: 'sky', provenance: 'artist-selected',
      rgb: [20, 40, 45], artistic_choice: 'Deliberately selected cool teal.' }] },
      actions: [{ tool: 'photoshop_fill_layer', args: { red: 20, green: 40, blue: 45 } }],
    };
    const prepared: any = prepareTechnicalPassBindings(input, {});
    expect(prepared.pass.scene_lighting_color_model.ambient_environment).not.toHaveProperty('sample');
    expect(prepared.pass.color_gradient_preflight).toEqual(input.color_gradient_preflight);
    expect(prepared.pass.actions).toEqual(input.actions);
    expect(prepared.repairs).toContainEqual(expect.objectContaining({ normalizer: 'artist_color_not_sample' }));
    expect(input.scene_lighting_color_model.ambient_environment.sample.rgb).toEqual([20, 40, 45]);
    for (const change of [{ rgb: [21, 40, 45] }, { source_anchor_id: 'other' }, { provenance: 'reference-sample' }, { artistic_choice: '' }]) {
      const conflict = structuredClone(input); Object.assign(conflict.color_gradient_preflight.stops[0], change);
      expect((prepareTechnicalPassBindings(conflict, {}).pass as any).scene_lighting_color_model.ambient_environment.sample).toBeDefined();
    }
    const measured = structuredClone(input); measured.scene_lighting_color_model.ambient_environment.provenance = 'reference-sample';
    expect((prepareTechnicalPassBindings(measured, {}).pass as any).scene_lighting_color_model.ambient_environment.sample).toBeDefined();
  });
  it('normalizes obsolete canvas field labels without changing native commands, color or layer targets', () => {
    const source: any = { construction_role: 'structured-mass', visual_intent: 'mass',
      preferred_method_id: 'region-block-in', material_role: 'paper',
      logical_layer: { hypothesis_id: 'paper', component_space: 'canvas', decision: 'create-new', construction_tier: 'primary', construction_change: true },
      actions: [{ tool: 'photoshop_fill_layer', method_id: 'region-block-in', args: { layer_id: 7, color: { red: 20, green: 30, blue: 40 } } }] };
    const fixed: any = prepareTechnicalPassBindings(source, {}).pass;
    expect(fixed).toMatchObject({ construction_role: 'continuous-field', visual_intent: 'continuous-field', preferred_method_id: 'continuous-color-field' });
    expect(fixed.logical_layer).not.toHaveProperty('construction_tier');
    expect(fixed.logical_layer).not.toHaveProperty('construction_change');
    expect(fixed.actions[0]).toMatchObject({ tool: source.actions[0].tool, args: source.actions[0].args, method_id: 'continuous-color-field' });
    expect(source.logical_layer.construction_tier).toBe('primary');
    for (const altered of [
      { ...source, logical_layer: { ...source.logical_layer, geometry_binding: { support_plane_id: 'floor' } } },
      { ...source, construction: { model_id: 'tower' } },
      { ...source, actions: [{ tool: 'photoshop_paint_regions', args: {} }] },
    ]) expect(prepareTechnicalPassBindings(altered, {}).pass.construction_role).toBe('structured-mass');
    expect(prepareTechnicalPassBindings(source, { logical_layer_owners: [{ hypothesis_id: 'paper', layer_id: 7, component_space: 'world' }] }).pass.construction_role).toBe('structured-mass');
  });

  it('addresses all canvas-field failure families and makes a genuinely missing correction contract explicit', () => {
    const codes = ['component_space_conflict', 'geometry_binding_required', 'color_gradient_preflight_required',
      'construction_role_intent_mismatch', 'artistic_method_execution_mismatch', 'invalid_visual_microplan'];
    const packet = fieldCorrectionPacket(codes.map(code => violation(code)));
    expect(packet.unaddressable_count).toBe(0);
    expect(machineRepairRecipe(codes.map(code => violation(code)))).toMatchObject({ systemic_failure: false, diagnostic_contract_incomplete: false });
    expect(machineRepairRecipe([violation('unmapped_internal_error')])).toMatchObject({ systemic_failure: true, diagnostic_contract_incomplete: true });
  });
  it('addresses the entire background-owner/method rejection without mislabelling semantic choices as a pipeline blocker', () => {
    const codes = ['semantic_layer_owner_missing', 'semantic_layer_isolation_required',
      'construction_role_material_role_required', 'artistic_method_execution_mismatch', 'invalid_visual_microplan'];
    const packet = fieldCorrectionPacket(codes.map(code => violation(code)));
    expect(packet.unaddressable_count).toBe(0);
    expect(packet.corrections.map(row => row.path)).toEqual(['next_pass.logical_layer',
      'next_pass.logical_layer.decision', 'next_pass.material_role', 'next_pass.actions', 'next_pass.actions']);
    const method = fieldCorrectionPacket([violation('artistic_method_execution_mismatch', 'Wrong mechanism', {
      path: 'next_pass.actions', method_id: 'continuous-color-field',
      allowed_commands: ['photoshop_fill_layer', 'photoshop_paint_color_gradient'],
    })]);
    expect(method.corrections[0]).toMatchObject({ selected_method_id: 'continuous-color-field',
      allowed: ['photoshop_fill_layer', 'photoshop_paint_color_gradient'] });
    const unknown = violation('unmapped_broken_contract');
    expect(fieldCorrectionPacket([unknown]).unaddressable_count).toBe(1);
    expect(classifyViolation(violation('guard_requirement_unexpressible'))).toBe('SYSTEMIC_FAILURE');
  });
  it('routes explicit finalization paths ahead of paths quoted in an error and asks to resubmit the whole cycle', () => {
    const packet = fieldCorrectionPacket([{ scope: 'finalization', code: 'previous_operation_finalization_invalid',
      message: 'Do not change next_pass.actions; provide the previous review.',
      details: { path: 'previous_observation.critic_review', cause_code: 'chat_critic_review_required' } }]);
    expect(packet.corrections[0]).toMatchObject({ path: 'previous_observation.critic_review', cause_code: 'chat_critic_review_required' });
    expect(packet.next).toMatch(/corrected.*cycle/i);
    expect(packet.next).not.toMatch(/corrected next_pass/);
  });
  it('removes only the duplicate layer automatically generated by construction', () => {
    const model = { parts: [{ id: 'window-owner', role: 'Window frame' }] };
    const source = { request_key: 'casement', document_id: 42,
      construction: { model, part_id: 'window-owner' },
      actions: [{ tool: 'photoshop_create_layer', args: { name: 'Window frame', document_id: 42 } }] };
    const repaired = omitRedundantConstructionLayerAction(source);
    expect(repaired.pass.actions).toBeUndefined();
    expect(repaired.repair?.normalizer).toBe('construction_owned_layer');
    expect(source.actions).toHaveLength(1);
    for (const args of [{ name: 'Other owner' }, { name: 'Window frame', above_layer_id: 10 },
      { name: 'Window frame', document_id: 43 }]) {
      const conflict = omitRedundantConstructionLayerAction({ ...source,
        actions: [{ tool: 'photoshop_create_layer', args }] });
      expect(conflict.repair).toBeUndefined();
      expect(conflict.pass.actions).toHaveLength(1);
    }
    const extra = omitRedundantConstructionLayerAction({ ...source,
      actions: [...source.actions, { tool: 'photoshop_paint_regions', args: { regions: [] } }] });
    expect(extra.repair).toBeUndefined();
  });

  it('canonicalizes only a uniquely bound construction object alias, never a new or mixed owner', () => {
    const pass: any = { document_id: 42, construction: { part_id: 'frame-owner', model: {
      objects: [{ id: 'window-alias', subject_kind: 'window' }],
      parts: [{ id: 'frame-owner', object_id: 'window-alias' },
        { id: 'glass-owner', object_id: 'window-alias' }],
      points: [{ id: 'p', object_id: 'window-alias', position: [1, 2] }],
    } } };
    const context = { scene_ownership_plan: { objects: [{ object_id: 'panorama-window',
      subject_kind: 'window', component_semantic_ids: ['window-frame', 'window-glass'] }],
    units: [{ semantic_id: 'window-frame', owner_id: 'frame-owner' },
      { semantic_id: 'window-glass', owner_id: 'glass-owner' }] } };
    const normalized = prepareTechnicalPassBindings(pass, context);
    expect(normalized.pass.construction.model.objects[0].id).toBe('panorama-window');
    expect(normalized.pass.construction.model.parts.every((p: any) => p.object_id === 'panorama-window')).toBe(true);
    expect(normalized.pass.construction.model.points[0].object_id).toBe('panorama-window');
    expect(normalized.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'replace_from_context', source: 'scene_ownership_plan.objects[panorama-window]' }),
    ]));
    expect(pass.construction.model.objects[0].id).toBe('window-alias');
    const mixed = structuredClone(pass);
    mixed.construction.model.parts[1].id = 'unplanned-owner';
    expect(prepareTechnicalPassBindings(mixed, context).repairs).toEqual([]);
    expect(prepareTechnicalPassBindings(mixed, context).pass.construction.model.objects[0].id).toBe('window-alias');
    const explicitlyReparented = { ...pass, scene_ownership_plan: { plan_id: 'new-scene' } };
    expect(prepareTechnicalPassBindings(explicitlyReparented, context).repairs).toEqual([]);
  });
  it('classifies normalization, deterministic patch, split, semantic choice, and systemic faults', () => {
    expect(classifyViolation(violation('compact_action_class_invalid'))).toBe('AUTO_NORMALIZE');
    expect(classifyViolation(violation('semantic_layer_pollution'))).toBe('AUTO_PATCH');
    expect(classifyViolation(violation('compact_pass_adaptive_mutation_budget_exceeded'))).toBe('SPLIT_DEFER');
    expect(classifyViolation(violation('brush_role_ambiguous'))).toBe('MODEL_SEMANTIC_DECISION');
    expect(classifyViolation(violation('scene_geometry_model_state_invalid'))).toBe('SYSTEMIC_FAILURE');
    expect(classifyViolation({ scope: 'finalization', code: 'previous_operation_finalization_invalid',
      message: 'current_frame_review_stale: resolve newer uncertain work first' })).toBe('SYSTEMIC_FAILURE');
    expect(classifyViolation({ scope: 'finalization', code: 'current_frame_review_conflict',
      message: 'Choose review_operation_id OR previous_operation_id' })).toBe('CONTRACT_CORRECTION');

    const classified = classifyViolations([
      violation('semantic_layer_pollution'),
      violation('brush_role_ambiguous'),
    ]);
    expect(classified.map(item => item.repair_class)).toEqual([
      'AUTO_PATCH',
      'MODEL_SEMANTIC_DECISION',
    ]);
  });

  it('patches uniquely known owner state without mutating the rejected pass', () => {
    const pass = {
      request_key: 'owner-repair',
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'hero-owner',
      },
    };
    const context = {
      logical_layer_owners: [{
        hypothesis_id: 'hero-owner',
        layer_id: 71,
        geometry_binding: { owner_id: 'hero-owner', scene_geometry_revision: 4 },
        camera_binding: { scene_camera_revision: 2 },
        attention_binding: { hierarchy_revision: 3, zone_id: 'hero' },
        surface_frame: { distribution: 'directional' },
      }],
    };

    const repaired = applyDeterministicPassRepairs(
      pass,
      [violation('semantic_layer_pollution')],
      context
    );

    expect(repaired.repaired_pass.logical_layer).toEqual(expect.objectContaining({
      layer_id: 71,
      geometry_binding: context.logical_layer_owners[0].geometry_binding,
      camera_binding: context.logical_layer_owners[0].camera_binding,
      attention_binding: context.logical_layer_owners[0].attention_binding,
      surface_frame: context.logical_layer_owners[0].surface_frame,
    }));
    expect((pass.logical_layer as Record<string, unknown>).layer_id).toBeUndefined();
    expect(repaired.repairs.map(item => item.path)).toEqual(expect.arrayContaining([
      'next_pass.logical_layer.layer_id',
      'next_pass.logical_layer.geometry_binding',
      'next_pass.logical_layer.camera_binding',
      'next_pass.logical_layer.attention_binding',
      'next_pass.logical_layer.surface_frame',
    ]));
  });

  it('never repairs an explicitly stale scene-model incarnation by relabeling foreign evidence', () => {
    const pass = {
      request_key: 'incarnation-repair',
      scene_geometry_model: {
        model_id: 'scene',
        revision: 1,
        source_frame: {
          document_id: 42,
          document_incarnation: 'stale-host-token',
          width: 1200,
          height: 800,
        },
      },
    };
    const repaired = applyDeterministicPassRepairs(
      pass,
      [violation('scene_geometry_model_incarnation_mismatch')],
      { document_incarnation_id: 'bootstrap-operation-42' }
    );

    expect((repaired.repaired_pass.scene_geometry_model as any).source_frame.document_incarnation)
      .toBe('stale-host-token');
    expect((pass.scene_geometry_model as any).source_frame.document_incarnation).toBe('stale-host-token');
    expect(repaired.repairs).toEqual([]);
    expect(repaired.classified).toEqual([expect.objectContaining({ repair_class: 'MODEL_SEMANTIC_DECISION' })]);
  });

  it('splits an ordered independent same-tool ADD pass at the declared adaptive budget', () => {
    const pass = {
      request_key: 'detail-pass',
      problem_id: 'detail',
      action_class: 'ADD',
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'hero-owner',
        layer_id: 7,
      },
      actions: [1, 2, 3].map(index => ({
        id: `dab-${index}`,
        tool: 'photoshop_paint_dabs',
        args: { layer_id: 7, dabs: [{ x: index * 10, y: index * 20 }] },
      })),
    };
    const budgetViolation = violation(
      'compact_pass_adaptive_mutation_budget_exceeded',
      'wording is intentionally irrelevant to machine control',
      { requested_mutations: 3, allowed_mutations: 2, splittable: true }
    );

    const split = splitPassForBudget(pass, [budgetViolation]);

    expect(split).toBeDefined();
    expect(split?.first_pass.actions).toHaveLength(2);
    expect(split?.deferred_pass.actions).toHaveLength(1);
    expect(split?.first_pass.request_key).toBe('detail-pass');
    expect(split?.deferred_pass.request_key).toMatch(/^detail-pass-defer-[0-9a-f]{8}$/);
    expect(split?.repair).toMatchObject({
      kind: 'split_defer',
      path: 'next_pass.actions',
      source: 'adaptive_mutation_budget:2',
    });
  });

  it('refuses to split causally inseparable actions that contain step references', () => {
    const pass = {
      request_key: 'dependent-pass',
      action_class: 'ADD',
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'hero-owner',
        layer_id: 7,
      },
      actions: [
        {
          id: 'first',
          tool: 'photoshop_paint_dabs',
          args: { layer_id: 7, dabs: [{ x: 10, y: 10 }] },
        },
        {
          id: 'dependent',
          tool: 'photoshop_paint_dabs',
          args: { layer_id: 7, source: '$steps.first.details.layerId', dabs: [{ x: 20, y: 20 }] },
        },
      ],
    };
    const budgetViolation = violation(
      'compact_pass_visual_mutation_limit',
      'different human-readable wording',
      { requested_mutations: 2, allowed_mutations: 1, splittable: true }
    );

    expect(splitPassForBudget(pass, [budgetViolation])).toBeUndefined();
  });

  it('never derives split control from human-readable violation prose', () => {
    const pass = {
      request_key: 'typed-budget-only',
      action_class: 'ADD',
      logical_layer: { decision: 'continue-logical-layer', hypothesis_id: 'hero-owner', layer_id: 7 },
      actions: [1, 2].map(index => ({
        id: `dab-${index}`,
        tool: 'photoshop_paint_dabs',
        args: { layer_id: 7, dabs: [{ x: index * 10, y: index * 20 }] },
      })),
    };
    const proseOnly = violation(
      'compact_pass_adaptive_mutation_budget_exceeded',
      'adaptive budget allows 1; this sentence must not be executable control data'
    );
    expect(splitPassForBudget(pass, [proseOnly])).toBeUndefined();
    expect(classifyViolation(violation(
      'invalid_visual_microplan',
      'mutation budget exceeded: requested=2 allowed=1'
    ))).toBe('MODEL_SEMANTIC_DECISION');
  });

  it('reports whether the remaining repair recipe still needs model choice or indicates a systemic failure', () => {
    expect(machineRepairRecipe([
      violation('brush_role_ambiguous'),
      violation('scene_geometry_model_state_invalid'),
    ])).toMatchObject({
      model_semantic_decision_required: true,
      systemic_failure: true,
      violation_classes: [
        { code: 'brush_role_ambiguous', repair_class: 'MODEL_SEMANTIC_DECISION' },
        { code: 'scene_geometry_model_state_invalid', repair_class: 'SYSTEMIC_FAILURE' },
      ],
    });
  });
});

it('fills omitted region targets before a budget split, including the deferred suffix, and keeps foreign targets rejected', () => {
  const pass = { request_key: 'plants', logical_layer: { decision: 'continue-logical-layer', hypothesis_id: 'plants', layer_id: 3 },
    actions: [1, 2, 3].map(index => ({ id: `region-${index}`, tool: 'photoshop_paint_regions', args: { regions: [{ id: `${index}` }] } })) };
  const context = { logical_layer_owners: [{ hypothesis_id: 'plants', layer_id: 3 }] };
  const budget = violation('compact_pass_adaptive_mutation_budget_exceeded', 'Split first', { allowed_mutations: 2 });
  const repaired = applyDeterministicPassRepairs(pass, [budget], context);
  const split = splitPassForBudget(repaired.repaired_pass, [budget])!;
  for (const candidate of [split.first_pass, split.deferred_pass]) {
    for (const action of candidate.actions as any[]) expect(action.args.regions[0].layer_id).toBe(3);
  }
  expect(pass.actions[0].args.regions[0]).not.toHaveProperty('layer_id');
  const foreign = structuredClone(pass) as any;
  foreign.actions[1].args.regions[0].layer_id = 99;
  expect(applyDeterministicPassRepairs(foreign, [budget], context).repairs).toEqual([]);
});
