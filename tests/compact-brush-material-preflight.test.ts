import { describe, expect, it } from 'vitest';
import { resolveCompactBrushMaterialPreflight } from '../src/core/guard/compact-brush-material-preflight.js';

const role = (id: string, materials: unknown[], intents = ['directional-mass'], scales = ['medium']) => ({
  role_id: id,
  material_roles: materials,
  visual_intents: intents,
  allowed_scales: scales,
});
const check = (overrides: Partial<Parameters<typeof resolveCompactBrushMaterialPreflight>[0]> = {}) =>
  resolveCompactBrushMaterialPreflight({
    materialFitnessRequired: true,
    stage: 'FORM_AND_LIGHT',
    requestedBrushScale: 'medium',
    visualIntent: 'directional-mass',
    roles: [role('fur-brush', ['fur'])],
    ...overrides,
  });

describe('compact brush material preflight', () => {
  it('derives the single compatible material with the exact normalization', () => {
    expect(check()).toEqual({
      requestedMaterialRole: 'fur',
      normalizations: [{
        code: 'material_role_normalized',
        message: 'Derived material_role=fur from the unambiguous durable brush preflight.',
      }],
      violations: [],
    });
  });

  it('derives only when every compatible role has the same sole material', () => {
    const result = check({ roles: [role('fur-a', ['fur']), role('fur-b', ['fur'])] });
    expect(result.requestedMaterialRole).toBe('fur');
    expect(result.violations).toEqual([]);
  });

  it('fails closed for distinct materials without guessing a first role', () => {
    const result = check({ roles: [role('fur', ['fur']), role('skin', ['skin'])] });
    expect(result.requestedMaterialRole).toBeUndefined();
    expect(result.normalizations).toEqual([]);
    expect(result.violations).toEqual([{
      scope: 'next_operation',
      code: 'brush_material_role_required',
      message: 'substantial FORM_AND_LIGHT brush work requires next_pass.material_role so Guard can match the installed/preflighted brush inventory to the requested material instead of choosing a generic first role',
    }]);
  });

  it('does not infer from a multi-material role even when values repeat', () => {
    const result = check({ roles: [role('multi', ['fur', 'fur'])] });
    expect(result.requestedMaterialRole).toBe('fur');
    expect(result.violations).toEqual([]);
    const ambiguous = check({ roles: [role('multi', ['fur', 'skin'])] });
    expect(ambiguous.requestedMaterialRole).toBeUndefined();
    expect(ambiguous.violations.map(item => item.code)).toEqual(['brush_material_role_required']);
  });

  it('respects an explicit brush role even when visual intents differ', () => {
    const result = check({
      explicitBrushRole: 'skin',
      roles: [role('fur', ['fur']), role('skin', ['skin'], ['local-edge'])],
    });
    expect(result.requestedMaterialRole).toBe('skin');
    expect(result.violations).toEqual([]);
  });

  it('respects visual intent and typed working scale when no explicit role is supplied', () => {
    const intent = check({ roles: [role('edge', ['ink'], ['local-edge']), role('fur', ['fur'])] });
    expect(intent.requestedMaterialRole).toBe('fur');
    const scale = check({ roles: [role('detail-only', ['fur'], ['directional-mass'], ['detail'])] });
    expect(scale.requestedMaterialRole).toBeUndefined();
    expect(scale.violations.map(item => item.code)).toEqual(['brush_material_role_required']);
  });

  it('reports filtered inventory after missing material, preserving both diagnostics', () => {
    const result = check({ brushInventoryScope: 'filtered', roles: [role('multi', ['fur', 'skin'])] });
    expect(result.violations.map(item => item.code)).toEqual([
      'brush_material_role_required', 'brush_inventory_scope_insufficient',
    ]);
    expect(result.violations[1]?.message).toBe(
      'substantial form/material/detail brush work requires a full installed-inventory or evidence-bound brush-pack preflight; a filtered familiar-preset lookup is insufficient'
    );
  });

  it('preserves supplied material and skips the finish-stage gates when not required', () => {
    const supplied = check({ requestedMaterialRole: 'authored', brushInventoryScope: 'filtered' });
    expect(supplied.requestedMaterialRole).toBe('authored');
    expect(supplied.normalizations).toEqual([]);
    expect(supplied.violations.map(item => item.code)).toEqual(['brush_inventory_scope_insufficient']);
    const early = check({ materialFitnessRequired: false, brushInventoryScope: 'filtered' });
    expect(early).toEqual({ requestedMaterialRole: undefined, normalizations: [], violations: [] });
  });
});
