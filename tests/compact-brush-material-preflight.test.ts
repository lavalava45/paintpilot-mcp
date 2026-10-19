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
  it('suggests a compatible material without replacing authored classification', () => {
    expect(check()).toEqual({
      requestedMaterialRole: undefined,
      normalizations: [{
        code: 'material_role_suggested',
        message: 'Optional artistic material_role suggestion: fur. Authored intent is unchanged.',
      }],
      violations: [],
    });
  });

  it('derives only when every compatible role has the same sole material', () => {
    const result = check({ roles: [role('fur-a', ['fur']), role('fur-b', ['fur'])] });
    expect(result.requestedMaterialRole).toBeUndefined();
    expect(result.violations).toEqual([]);
  });

  it('fails closed for distinct materials without guessing a first role', () => {
    const result = check({ roles: [role('fur', ['fur']), role('skin', ['skin'])] });
    expect(result.requestedMaterialRole).toBeUndefined();
    expect(result.normalizations).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it('does not infer from a multi-material role even when values repeat', () => {
    const result = check({ roles: [role('multi', ['fur', 'fur'])] });
    expect(result.requestedMaterialRole).toBeUndefined();
    expect(result.violations).toEqual([]);
    const ambiguous = check({ roles: [role('multi', ['fur', 'skin'])] });
    expect(ambiguous.requestedMaterialRole).toBeUndefined();
    expect(ambiguous.violations).toEqual([]);
  });

  it('respects an explicit brush role even when visual intents differ', () => {
    const result = check({
      explicitBrushRole: 'skin',
      roles: [role('fur', ['fur']), role('skin', ['skin'], ['local-edge'])],
    });
    expect(result.requestedMaterialRole).toBeUndefined();
    expect(result.violations).toEqual([]);
  });

  it('respects visual intent and typed working scale when no explicit role is supplied', () => {
    const intent = check({ roles: [role('edge', ['ink'], ['local-edge']), role('fur', ['fur'])] });
    expect(intent.requestedMaterialRole).toBeUndefined();
    const scale = check({ roles: [role('detail-only', ['fur'], ['directional-mass'], ['detail'])] });
    expect(scale.requestedMaterialRole).toBeUndefined();
    expect(scale.violations).toEqual([]);
  });

  it('does not turn filtered inventory into a Photoshop execution refusal', () => {
    const result = check({ brushInventoryScope: 'filtered', roles: [role('multi', ['fur', 'skin'])] });
    expect(result.violations).toEqual([]);
  });

  it('preserves supplied material and skips the finish-stage gates when not required', () => {
    const supplied = check({ requestedMaterialRole: 'authored', brushInventoryScope: 'filtered' });
    expect(supplied.requestedMaterialRole).toBe('authored');
    expect(supplied.normalizations).toEqual([]);
    expect(supplied.violations).toEqual([]);
    const early = check({ materialFitnessRequired: false, brushInventoryScope: 'filtered' });
    expect(early).toEqual({ requestedMaterialRole: undefined, normalizations: [], violations: [] });
  });
});
