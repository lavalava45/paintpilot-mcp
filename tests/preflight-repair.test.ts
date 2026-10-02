import { describe, expect, it } from 'vitest';
import {
  applyDeterministicPassRepairs,
  classifyViolation,
  classifyViolations,
  machineRepairRecipe,
  splitPassForBudget,
  type RepairableViolation,
} from '../src/core/guard/preflight-repair.js';

function violation(code: string, message = code): RepairableViolation {
  return { scope: 'next_operation', code, message };
}

describe('preflight repair', () => {
  it('classifies normalization, deterministic patch, split, semantic choice, and systemic faults', () => {
    expect(classifyViolation(violation('compact_action_class_invalid'))).toBe('AUTO_NORMALIZE');
    expect(classifyViolation(violation('semantic_layer_pollution'))).toBe('AUTO_PATCH');
    expect(classifyViolation(violation('compact_pass_adaptive_mutation_budget_exceeded'))).toBe('SPLIT_DEFER');
    expect(classifyViolation(violation('brush_role_ambiguous'))).toBe('MODEL_SEMANTIC_DECISION');
    expect(classifyViolation(violation('scene_geometry_model_state_invalid'))).toBe('SYSTEMIC_FAILURE');

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

  it('replaces stale scene-model incarnation from authoritative compact context', () => {
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
      .toBe('bootstrap-operation-42');
    expect((pass.scene_geometry_model as any).source_frame.document_incarnation).toBe('stale-host-token');
    expect(repaired.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'replace_from_context',
        path: 'next_pass.scene_geometry_model.source_frame.document_incarnation',
        source: 'compactPassContext.document_incarnation_id',
      }),
    ]));
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
      'next_pass requests 3 visual mutations but adaptive budget allows 2 (risk=low)'
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
      'next_pass may contain at most 1 visual mutations'
    );

    expect(splitPassForBudget(pass, [budgetViolation])).toBeUndefined();
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
