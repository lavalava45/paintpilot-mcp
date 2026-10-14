import { describe, expect, it } from 'vitest';
import { collectCompactOwnerMetadataViolations } from '../src/core/guard/compact-owner-metadata.js';

const check = (overrides: Partial<Parameters<typeof collectCompactOwnerMetadataViolations>[0]> = {}) =>
  collectCompactOwnerMetadataViolations({
    semanticCreateMetadataRequired: false,
    declaredRequiresIsolation: false,
    hasLayerSeparation: false,
    hasLogicalLayer: false,
    ...overrides,
  });

describe('compact semantic-owner metadata preflight', () => {
  it('does not add errors for a legacy pass without an owner', () => {
    expect(check()).toEqual([]);
  });

  it('retains two missing-metadata errors in order on semantic creation', () => {
    const errors = check({ semanticCreateMetadataRequired: true });
    expect(errors.map(v => v.code)).toEqual(['semantic_layer_owner_missing', 'semantic_layer_owner_missing']);
    expect(errors[0].message).toContain('layer_separation_check');
    expect(errors[1].message).toContain('stable next_pass.logical_layer');
  });

  it('requires owner identity when isolation is declared', () => {
    const errors = check({ declaredRequiresIsolation: true });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('stable next_pass.logical_layer');
  });

  it('rejects a declared owner without separation metadata', () => {
    const errors = check({ hasLogicalLayer: true });
    expect(errors).toEqual([{ scope: 'next_operation', code: 'semantic_layer_owner_missing',
      message: 'semantic_layer_owner_missing: new ownership, structural change or rollback reassessment requires next_pass.layer_separation_check; unchanged known-owner continuation can inherit it' }]);
  });

  it('preserves duplicate-code ordering and accepts complete creation metadata', () => {
    const errors = check({ semanticCreateMetadataRequired: true, hasLogicalLayer: true });
    expect(errors.map(v => v.scope)).toEqual(['next_operation', 'next_operation']);
    expect(errors[0].message).toContain('semantic painting layer creation');
    expect(errors[1].message).toContain('new ownership, structural change');
    expect(check({ semanticCreateMetadataRequired: true, hasLogicalLayer: true, hasLayerSeparation: true })).toEqual([]);
  });
});
