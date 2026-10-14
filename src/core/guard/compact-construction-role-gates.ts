import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/**
 * Pure construction metadata admission for broad nontrivial region ADD passes.
 * The compiler still decides whether a pass is broad/nontrivial and derives
 * executable construction metadata before invoking these ordered gates.
 */
export function collectCompactConstructionRoleViolations(input: {
  broadNontrivialRegionAdd: boolean;
  constructionRole?: string;
  requestedMaterialRole?: string;
}): GuardCycleCompileViolation[] {
  const { broadNontrivialRegionAdd, constructionRole, requestedMaterialRole } = input;
  const violations: GuardCycleCompileViolation[] = [];
  if (broadNontrivialRegionAdd && !constructionRole) {
    violations.push({
      scope: 'next_operation',
      code: 'broad_region_construction_role_required',
      message: 'broad nontrivial region ADD work must declare construction_role before choosing photoshop_paint_regions; use structured-mass for genuine form-bearing closed mass or the applicable continuous/soft/environmental role',
    });
  }
  if (broadNontrivialRegionAdd && constructionRole && !requestedMaterialRole) {
    violations.push({
      scope: 'next_operation',
      code: 'construction_role_material_role_required',
      message: `construction_role=${constructionRole} requires next_pass.material_role so the semantic construction is fixed before mechanism selection`,
    });
  }
  return violations;
}
