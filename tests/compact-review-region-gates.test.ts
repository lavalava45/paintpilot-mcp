import { describe, expect, it } from 'vitest';
import { collectCompactReviewRegionViolations } from '../src/core/guard/compact-review-region-gates.js';

describe('compact review focus-region gates', () => {
  it('preserves the local-inspection diagnostic and exact correction', () => {
    expect(collectCompactReviewRegionViolations({
      requiresLocalInspection: true, hasRegionBounds: false,
      reviewProfile: { require_region: false, level: 'composition' },
    })).toEqual([{
      scope: 'next_operation',
      code: 'compact_local_region_bounds_required',
      message: 'local/small/subtle visual passes require next_pass.region_bounds so Guard can generate matching BEFORE/AFTER focus previews',
    }]);
  });

  it('preserves the resolved object-review diagnostic', () => {
    expect(collectCompactReviewRegionViolations({
      requiresLocalInspection: false, hasRegionBounds: false,
      reviewProfile: { require_region: true, level: 'object' },
    })).toEqual([{
      scope: 'next_operation',
      code: 'compact_review_region_bounds_required',
      message: 'object visual review requires next_pass.region_bounds in source-document pixels; Guard will not invent a crop center',
    }]);
  });

  it('uses the resolved review level verbatim, including micro', () => {
    const issues = collectCompactReviewRegionViolations({
      requiresLocalInspection: false, hasRegionBounds: false,
      reviewProfile: { require_region: true, level: 'micro' },
    });
    expect(issues.map(issue => issue.code)).toEqual(['compact_review_region_bounds_required']);
    expect(issues[0]?.message).toContain('micro visual review');
  });

  it('does not double-report a missing region when both policies require it', () => {
    expect(collectCompactReviewRegionViolations({
      requiresLocalInspection: true, hasRegionBounds: false,
      reviewProfile: { require_region: true, level: 'micro' },
    }).map(issue => issue.code)).toEqual(['compact_local_region_bounds_required']);
  });

  it('accepts supplied bounds for both policies without changing review requirements', () => {
    expect(collectCompactReviewRegionViolations({
      requiresLocalInspection: true, hasRegionBounds: true,
      reviewProfile: { require_region: true, level: 'micro' },
    })).toEqual([]);
    expect(collectCompactReviewRegionViolations({
      requiresLocalInspection: false, hasRegionBounds: true,
      reviewProfile: { require_region: true, level: 'object' },
    })).toEqual([]);
  });

  it('does not require a crop for composition-only review', () => {
    expect(collectCompactReviewRegionViolations({
      requiresLocalInspection: false, hasRegionBounds: false,
      reviewProfile: { require_region: false, level: 'composition' },
    })).toEqual([]);
  });
});
