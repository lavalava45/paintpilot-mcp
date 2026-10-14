import { describe, expect, it } from 'vitest';
import { collectCompactConstructionRoleViolations } from '../src/core/guard/compact-construction-role-gates.js';

const check = (broadNontrivialRegionAdd: boolean, constructionRole?: string, requestedMaterialRole?: string) =>
  collectCompactConstructionRoleViolations({ broadNontrivialRegionAdd, constructionRole, requestedMaterialRole });

describe('compact broad-region construction role gates', () => {
  it('preserves the exact missing construction role refusal', () => {
    expect(check(true)).toEqual([{
      scope: 'next_operation',
      code: 'broad_region_construction_role_required',
      message: 'broad nontrivial region ADD work must declare construction_role before choosing photoshop_paint_regions; use structured-mass for genuine form-bearing closed mass or the applicable continuous/soft/environmental role',
    }]);
  });

  it('requires material role only after a construction role is present', () => {
    expect(check(true, 'structured-mass')).toEqual([{
      scope: 'next_operation',
      code: 'construction_role_material_role_required',
      message: 'construction_role=structured-mass requires next_pass.material_role so the semantic construction is fixed before mechanism selection',
    }]);
  });

  it('does not duplicate the material role error when construction role is missing', () => {
    expect(check(true).map(issue => issue.code)).toEqual(['broad_region_construction_role_required']);
  });

  it('accepts complete metadata for a broad nontrivial region', () => {
    expect(check(true, 'structured-mass', 'opaque-form')).toEqual([]);
  });

  it('does not add these broad-region refusals to unrelated passes', () => {
    expect(check(false)).toEqual([]);
    expect(check(false, 'structured-mass')).toEqual([]);
  });
});
