import { describe, expect, it } from 'vitest';
import {
  compileSemanticOwnership, compileSemanticMethod, compileSemanticExecutablePlan,
} from '../src/core/guard/semantic-execution-compiler.js';
import { SEMANTIC_EXECUTION_SPEC } from '../src/core/guard/semantic-contract-spec.js';

const owner = { hypothesis_id: 'road', layer_id: 7, rollback_value: 'low', physical_role: 'opaque-mass' };
const context = { logical_layer_owners: [owner] };
const paint = (layer_id?: unknown) => ({
  tool: 'photoshop_paint_regions',
  args: { regions: [{ fill: { red: 20, green: 30, blue: 40 },
    ...(layer_id === undefined ? {} : { layer_id }) }] },
});
const intent = (layer_id?: unknown) => ({
  request_key: 'road-form', problem_id: 'road-form', document_id: 42,
  target_owner_id: 'road', actions: [paint(layer_id)],
});

describe('intent → owner → method → executable plan', () => {
  it('binds exactly one durable owner without a client-authored physical layer ID', () => {
    const raw = intent();
    const result = compileSemanticOwnership(raw, context);
    expect(result.issues).toEqual([]);
    expect(result.pass.logical_layer).toMatchObject({
      decision: 'continue-logical-layer', hypothesis_id: 'road', layer_id: 7,
    });
    expect(result.repairs[0].source).toBe('durable_owner:road');
    expect(raw).not.toHaveProperty('logical_layer');
    expect(compileSemanticOwnership(result.pass, context).repairs).toEqual([]);
  });

  it('does not relabel an explicitly foreign physical target as the selected owner', () => {
    const raw = intent(9);
    const result = compileSemanticOwnership(raw, context);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'semantic_execution_owner_conflict', path: 'actions',
    }));
    expect(result.pass).toEqual(raw);
    expect(result.repairs).toEqual([]);
  });

  it('does not confuse an auxiliary source-layer reference with the paint target', () => {
    const raw = { ...intent(), actions: [{ tool: 'photoshop_paint_regions',
      args: { source: { layer_id: 9 }, regions: [{ layer_id: 7 }] } }] };
    const result = compileSemanticOwnership(raw, context);
    expect(result.issues).toEqual([]);
    expect(result.pass.logical_layer).toMatchObject({ layer_id: 7, hypothesis_id: 'road' });
  });

  it('does not insert an owner binding on a read-only or nonvisual pass', () => {
    const result = compileSemanticOwnership({
      ...intent(), actions: [{ tool: 'photoshop_get_preview', args: {} }],
    }, context);
    expect(result.pass).not.toHaveProperty('logical_layer');
    expect(result.repairs).toEqual([]);
  });

  it('does not infer a new owner from a retained document layer or bypass cross-layer authorization', () => {
    const newOwner = compileSemanticOwnership({
      ...intent(), target_owner_id: 'uncommitted', actions: [
        { tool: 'photoshop_create_layer', args: { name: 'New' } }, paint(),
      ],
    }, context);
    expect(newOwner.pass).not.toHaveProperty('logical_layer');
    expect(newOwner.repairs).toEqual([]);
    const cross = compileSemanticOwnership({ ...intent(), cross_layer_correction: { mode: 'correction' } }, context);
    expect(cross.pass).not.toHaveProperty('logical_layer');
  });

  it('does not choose between two durable registrations for one semantic owner', () => {
    const result = compileSemanticOwnership(intent(), {
      logical_layer_owners: [owner, { ...owner, layer_id: 9 }],
    });
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'semantic_execution_owner_ambiguous',
    }));
    expect(result.pass).not.toHaveProperty('logical_layer');
  });

  it('derives method material from exactly one preflighted brush role', () => {
    const result = compileSemanticMethod({
      visual_intent: 'directional-mass', pressure_policy: 'none',
    }, { brushMaterialRoles: ['fur'], authoredVisualIntent: 'directional-mass' });
    expect(result.issues).toEqual([]);
    expect(result.strategy?.material_role).toBe('fur');
    expect(result.repairs).toHaveLength(1);
    expect(result.repairs[0].source).toBe('preflighted_brush_role.material_roles');
  });

  it('does not invent a material or reject non-brush continuous fields because an optional material is missing', () => {
    for (const choices of [[], ['fur', 'fabric']]) {
      const result = compileSemanticMethod({
        construction_role: 'continuous-field', visual_intent: 'continuous-field',
        material_role: undefined, pressure_policy: 'none',
      }, { brushMaterialRoles: choices, authoredVisualIntent: 'continuous-field', methodClass: 'gradient' });
      expect(result.issues).toEqual([]);
      expect(result.strategy?.material_role).toBeUndefined();
      expect(result.strategy).not.toHaveProperty('material_role');
      expect(result.repairs.some(item => item.kind === 'normalize')).toBe(true);
    }
  });

  it('keeps material fitness mandatory for a preflighted brush, including ambiguous roles', () => {
    for (const context of [
      { methodClass: 'preset-brush', brushMaterialRoles: ['fur', 'fabric'] },
      { methodClass: 'paint', brushMaterialRoles: ['fur', 'fabric'] },
    ]) {
      const result = compileSemanticMethod({
        construction_role: 'structured-mass', visual_intent: 'directional-mass',
        pressure_policy: 'none', brush_role: 'verified-fur-preset',
      }, { ...context, authoredVisualIntent: 'directional-mass' });
      expect(result.issues).toEqual([expect.objectContaining({
        code: 'semantic_method_contract_required', path: 'paint_strategy.material_role',
        candidates: ['fur', 'fabric'],
      })]);
    }
    const unboundPreset = compileSemanticMethod({
      visual_intent: 'directional-mass', pressure_policy: 'none',
    }, { methodClass: 'preset-brush', brushMaterialRoles: [] });
    expect(unboundPreset.issues.some(item => item.path === 'paint_strategy.material_role')).toBe(true);
  });

  it('keeps authored method values and blocks conflicting strategy metadata', () => {
    const result = compileSemanticMethod({
      material_role: 'metal', visual_intent: 'hard-edge', pressure_policy: 'none',
    }, { authoredMaterial: 'stone', authoredVisualIntent: 'hard-edge' });
    expect(result.issues.map(item => item.code)).toContain('semantic_method_contract_conflict');
    expect(result.strategy?.material_role).toBe('metal');
  });

  it('compiles a final preview as a technical consequence without changing artistic steps', () => {
    const before = { stage: 'GLOBAL_BLOCK_IN', method_class: 'region-fill',
      steps: [{ id: 'add', tool: 'photoshop_paint_regions', args: { regions: [{ layer_id: 7 }] } }] };
    const result = compileSemanticExecutablePlan(before);
    expect((result.args.steps as Array<{ tool: string }>).at(-1)?.tool).toBe('photoshop_get_preview');
    expect((result.args.steps as Array<{ id: string }>)[0].id).toBe('add');
    expect(result.repairs).toHaveLength(1);
    expect((before.steps as unknown[])).toHaveLength(1);
    expect(compileSemanticExecutablePlan(result.args).repairs).toEqual([]);
  });

  it('publishes the actual VisualMicroPlan method schema from the same contract specification', () => {
    // The runtime tool schema and source data contract must not drift again.
    expect(SEMANTIC_EXECUTION_SPEC.method.requiredFields).toEqual([
      'visual_intent', 'pressure_policy',
    ]);
    expect(SEMANTIC_EXECUTION_SPEC.method.materialRequiredMethodClasses).toContain('preset-brush');
  });
});
