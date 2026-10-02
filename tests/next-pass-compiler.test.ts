import { describe, expect, it } from 'vitest';
import { parsePaintingIntent } from '../src/core/guard/painting-intent.js';
import {
  NextPassCompilerError,
  compilePaintingIntentToNextPass,
  resolvePlannerBinding,
} from '../src/core/guard/next-pass-compiler.js';

function existingOwnerContext() {
  return {
    stage: 'FORM',
    scale: 'medium',
    painting_profile: 'nontrivial_painting',
    logical_layer_owners: [
      {
        hypothesis_id: 'coat-owner',
        hypothesis: 'Main coat mass',
        layer_id: 17,
        layer_name: 'Coat',
        rollback_value: 'low',
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
        construction_tier: 'primary',
        geometry_binding: {
          scene_geometry_model_id: 'scene-geometry',
          scene_geometry_revision: 3,
          owner_id: 'coat-owner',
        },
        camera_binding: { scene_camera_model_id: 'camera', scene_camera_revision: 2 },
        attention_binding: { hierarchy_revision: 4, zone_id: 'hero', dimensions: ['detail'] },
      },
      {
        hypothesis_id: 'background-owner',
        layer_id: 9,
        layer_name: 'Background',
      },
    ],
    brush_roles: [
      {
        role_id: 'fur-form',
        material_roles: ['fur'],
        visual_intents: ['directional-mass'],
      },
    ],
    art_director: {
      directive_id: 'directive-7',
      current_task_id: 'task-coat',
      tasks: [{
        task_id: 'task-coat',
        status: 'active',
        allowed_scales: ['medium', 'small'],
        allowed_global_changes: ['local-tone'],
      }],
    },
  };
}

function existingOwnerIntent() {
  return parsePaintingIntent({
    request_key: 'coat-refine-01',
    problem_id: 'coat-material',
    document_id: 42,
    goal: 'Build directional fur structure on the coat.',
    target_owner_id: 'coat-owner',
    action: 'refine',
    visual_intent: 'directional-mass',
    preserve: ['background-owner'],
    actions: [
      {
        id: 'fur-a',
        tool: 'photoshop_paint_strokes',
        method_id: 'installed-brush',
        args: {
          opacity: 70,
          strokes: [{ points: [{ x: 20, y: 20 }, { x: 40, y: 30 }] }],
        },
      },
      {
        id: 'fur-b',
        tool: 'photoshop_paint_strokes',
        method_id: 'installed-brush',
        args: {
          opacity: 70,
          strokes: [{ points: [{ x: 50, y: 40 }, { x: 70, y: 55 }] }],
        },
      },
    ],
  });
}

describe('NextPassCompiler', () => {
  it('inherits an existing owner, injects its physical layer, preserves planner context, and batches compatible actions', () => {
    const context = existingOwnerContext();
    const compiled = compilePaintingIntentToNextPass(existingOwnerIntent(), {
      compactPassContext: () => context,
    });

    expect(compiled.next_pass).toMatchObject({
      request_key: 'coat-refine-01',
      problem_id: 'coat-material',
      document_id: 42,
      stage: 'FORM',
      scale: 'medium',
      action_class: 'ADD',
      material_role: 'fur',
      brush_role: 'fur-form',
      protected_layer_ids: [9],
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'coat-owner',
        layer_id: 17,
        layer_name: 'Coat',
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
        construction_tier: 'primary',
        geometry_binding: context.logical_layer_owners[0].geometry_binding,
        camera_binding: context.logical_layer_owners[0].camera_binding,
        attention_binding: context.logical_layer_owners[0].attention_binding,
      },
    });

    const actions = compiled.next_pass.actions as Array<Record<string, any>>;
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: 'fur-a',
      tool: 'photoshop_paint_strokes',
      method_id: 'installed-brush',
      args: { layer_id: 17, opacity: 70 },
    });
    expect(actions[0].args.strokes).toHaveLength(2);

    expect(resolvePlannerBinding(compiled.context)).toEqual({
      planner_directive_id: 'directive-7',
      planner_task_id: 'task-coat',
      allowed_scales: ['medium', 'small'],
      allowed_global_changes: ['local-tone'],
    });
    expect(compiled.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      'intent_stage_inherited',
      'intent_scale_inherited',
      'intent_owner_layer_injected',
      'intent_material_role_inherited',
      'intent_brush_role_inherited',
    ]));
  });

  it('requires an explicit semantic construction role before creating a predeclared owner', () => {
    const context = {
      painting_profile: 'nontrivial_painting',
      stage: 'SHAPE',
      scale: 'global',
      logical_layer_owners: [],
      scene_ownership_plan: {
        plan_id: 'scene-plan',
        units: [{ semantic_id: 'tower', owner_id: 'tower-owner', role: 'Primary tower mass' }],
      },
    };
    const raw = {
      request_key: 'tower-create',
      problem_id: 'tower-structure',
      document_id: 42,
      goal: 'Create the primary tower mass.',
      target_owner_id: 'tower-owner',
      action: 'add',
      visual_intent: 'mass',
      actions: [
        { id: 'tower-layer', tool: 'photoshop_create_layer', args: { name: 'Tower' } },
        {
          id: 'tower-region',
          tool: 'photoshop_paint_regions',
          method_id: 'region-block-in',
          args: { regions: [{ contours: [{ points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 40, y: 60 }] }] }] },
        },
      ],
    };

    try {
      compilePaintingIntentToNextPass(parsePaintingIntent(raw), { compactPassContext: () => context });
      throw new Error('expected compiler to require construction_role');
    } catch (error) {
      expect(error).toBeInstanceOf(NextPassCompilerError);
      expect((error as NextPassCompilerError).code).toBe('painting_intent_new_owner_role_required');
    }

    const accepted = compilePaintingIntentToNextPass(
      parsePaintingIntent({ ...raw, construction_role: 'structured-mass' }),
      { compactPassContext: () => context }
    );
    expect(accepted.next_pass).toMatchObject({
      construction_role: 'structured-mass',
      layer_separation_check: {
        change_kind: 'new-object',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'tower-owner',
        hypothesis: 'Primary tower mass',
        layer_name: 'Tower',
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
      },
    });
    expect((accepted.next_pass.actions as any[])[1].args.regions[0].layer_id)
      .toBe('$steps.tower-layer.details.layerId');
  });

  it('is deterministic for identical PaintingIntent and durable context', () => {
    const context = existingOwnerContext();
    const intent = existingOwnerIntent();
    const store = { compactPassContext: () => structuredClone(context) };

    const first = compilePaintingIntentToNextPass(intent, store);
    const second = compilePaintingIntentToNextPass(intent, store);

    expect(second.next_pass).toEqual(first.next_pass);
    expect(second.diagnostics).toEqual(first.diagnostics);
    expect(second.context).toEqual(first.context);
  });
});
