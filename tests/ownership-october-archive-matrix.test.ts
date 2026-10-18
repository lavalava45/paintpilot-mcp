import { describe, expect, it } from 'vitest';
import { compileMinimalOwnerBootstrap } from '../src/core/guard/ownership-bootstrap-compiler.js';
import { compileSemanticOwnership, compileSemanticMethod } from '../src/core/guard/semantic-execution-compiler.js';

// Archive provenance, NOT byte-identical replay: the stored process histories
// retain failure codes and counters but not every original full next_pass.
// 2026-10-10 successful simple_graphic runs; 2026-10-14..18 repeated
// scene_ownership_plan_required / semantic_layer_owner_missing / target mismatch,
// tool_schema_invalid and invalid_visual_microplan.
const flat = () => ({
  request_key: 'oct14-one-flat-field', document_id: 42, action_class: 'ADD',
  logical_layer: { hypothesis_id: 'sky', decision: 'create-new', component_space: 'canvas',
    layer_name: 'Sky', hypothesis: 'A color field for the evening sky' },
  construction_role: 'continuous-field', visual_intent: 'continuous-field',
  actions: [
    { id: 'new-sky', tool: 'photoshop_create_layer', args: { name: 'Sky' } },
    { id: 'gradient', tool: 'photoshop_paint_color_gradient',
      args: { layer_id: '$steps.new-sky.details.layerId' } },
  ],
});

describe('Oct 10 baseline vs Oct 14–18 regression classes; both painting profiles', () => {
  it.each(['simple_graphic', 'nontrivial_painting'])(
    'Oct 14 missing plan for one canvas field is compiled, not guessed, under %s',
    profile => {
      const result = compileMinimalOwnerBootstrap(flat(), { painting_profile: profile,
        logical_layer_owners: [], scene_ownership_plan: null });
      expect(result.derived).toBe(true);
      expect(result.pass.scene_ownership_plan).toBeDefined();
    },
  );

  it.each(['simple_graphic', 'nontrivial_painting'])(
    'Oct 18 wrong continuation/foreign layer is never converted to new owner under %s',
    profile => {
      const invalid = flat();
      invalid.logical_layer.decision = 'continue-logical-layer';
      invalid.actions[1]!.args.layer_id = 1 as never;
      expect(compileMinimalOwnerBootstrap(invalid, { painting_profile: profile,
        logical_layer_owners: [], scene_ownership_plan: null }).derived).toBe(false);
      const conflict = compileSemanticOwnership({ target_owner_id: 'sky',
        actions: [{ tool: 'photoshop_paint_color_gradient', args: { layer_id: 1 } }],
      }, { logical_layer_owners: [{ hypothesis_id: 'sky', layer_id: 81, temporary: false }] });
      expect(conflict.issues.map(item => item.code)).toContain('semantic_execution_owner_conflict');
    },
  );

  it('Oct 15 multipart owner scope is still a human art decision, never a one-layer shortcut', () => {
    const input = {
      ...flat(), component_scope: { subject_kind: 'window',
        role: 'Window frame plus separate glass and curtains' },
    };
    expect(compileMinimalOwnerBootstrap(input).derived).toBe(false);
  });

  it('Oct 18 optional material no longer blocks a native gradient; real brush ambiguity still blocks', () => {
    const gradient = compileSemanticMethod({ construction_role: 'continuous-field',
      visual_intent: 'continuous-field', pressure_policy: 'none',
      material_role: undefined,
    }, { methodClass: 'gradient', authoredVisualIntent: 'continuous-field' });
    expect(gradient.issues).toEqual([]);
    expect(gradient.strategy).not.toHaveProperty('material_role');
    const brush = compileSemanticMethod({ brush_role: 'preflighted-texture',
      visual_intent: 'directional-mass', pressure_policy: 'none',
    }, { methodClass: 'preset-brush', brushMaterialRoles: ['fur', 'fabric'] });
    expect(brush.issues.map(item => item.code)).toContain('semantic_method_contract_required');
  });

  it('Oct 10 already-registered simple owner can continue without any fresh create or rebinding', () => {
    const pass = compileSemanticOwnership({ target_owner_id: 'already-registered',
      actions: [{ tool: 'photoshop_paint_color_gradient', args: { layer_id: 7 } }],
    }, { logical_layer_owners: [{ hypothesis_id: 'already-registered',
      temporary: false, layer_id: 7 }] });
    expect(pass.issues).toEqual([]);
    expect(pass.pass.logical_layer).toMatchObject({ layer_id: 7,
      hypothesis_id: 'already-registered', decision: 'continue-logical-layer' });
    expect(pass.repairs).toHaveLength(1);
  });
});
