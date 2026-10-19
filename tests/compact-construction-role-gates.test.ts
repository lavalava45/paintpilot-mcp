import { describe, expect, it } from 'vitest';
import { collectCompactConstructionRoleViolations } from '../src/core/guard/compact-construction-role-gates.js';

const check = (broadNontrivialRegionAdd: boolean, constructionRole?: string, requestedMaterialRole?: string) =>
  collectCompactConstructionRoleViolations({ broadNontrivialRegionAdd, constructionRole, requestedMaterialRole });

describe('compact broad-region construction role gates', () => {
  it('allows broad region work without a prescribed artistic construction role', () => {
    expect(check(true)).toEqual([]);
  });

  it('allows authored construction without compulsory artistic material classification', () => {
    expect(check(true, 'structured-mass')).toEqual([]);
  });

  it('does not duplicate the material role error when construction role is missing', () => {
    expect(check(true).map(issue => issue.code)).toEqual([]);
  });

  it('accepts complete metadata for a broad nontrivial region', () => {
    expect(check(true, 'structured-mass', 'opaque-form')).toEqual([]);
  });

  it('does not add these broad-region refusals to unrelated passes', () => {
    expect(check(false)).toEqual([]);
    expect(check(false, 'structured-mass')).toEqual([]);
  });
});
