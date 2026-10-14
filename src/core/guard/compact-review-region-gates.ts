import type { GuardCycleCompileViolation } from './cycle-compiler.js';
import type { VisualReviewProfile } from './visual-review-profile.js';

/**
 * Pure focus-region admission gates. Review-profile resolution and actual
 * BEFORE/AFTER preview insertion remain in the compiler, in their original order.
 */
export function collectCompactReviewRegionViolations(input: {
  requiresLocalInspection: boolean;
  hasRegionBounds: boolean;
  reviewProfile: Pick<VisualReviewProfile, 'require_region' | 'level'>;
}): GuardCycleCompileViolation[] {
  const { requiresLocalInspection, hasRegionBounds, reviewProfile } = input;
  const violations: GuardCycleCompileViolation[] = [];
  if (requiresLocalInspection && !hasRegionBounds) {
    violations.push({
      scope: 'next_operation',
      code: 'compact_local_region_bounds_required',
      message: 'local/small/subtle visual passes require next_pass.region_bounds so Guard can generate matching BEFORE/AFTER focus previews',
    });
  }
  if (reviewProfile.require_region && !hasRegionBounds && !requiresLocalInspection) {
    violations.push({
      scope: 'next_operation',
      code: 'compact_review_region_bounds_required',
      message: `${reviewProfile.level} visual review requires next_pass.region_bounds in source-document pixels; Guard will not invent a crop center`,
    });
  }
  return violations;
}
