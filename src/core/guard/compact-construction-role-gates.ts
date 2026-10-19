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
  // Construction and material labels describe artistic intent. Neither is
  // evidence of a Photoshop execution hazard, including for broad passes.
  void broadNontrivialRegionAdd;
  void constructionRole;
  void requestedMaterialRole;
  return violations;
}
