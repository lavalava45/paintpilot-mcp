import { describe, expect, it } from 'vitest';
import { correctionTargetFacts, plannedGlobalComponentCorrection } from '../src/core/guard/correction-admissibility.js';

const defect = {
  problem_id: 'cumulative-trend-primitive-footprint-repeating',
  scale: 'global', severity: 'must-fix', status: 'open',
  // Different regions cannot be replaced by an invented enclosing review rectangle.
  supporting_regions: [
    { region_bounds: { left: 800, top: 145, right: 1015, bottom: 365 } },
    { region_bounds: { left: 245, top: 756, right: 706, bottom: 1125 } },
  ],
};
const roi = { left: 245, top: 756, right: 706, bottom: 1125 };

it('accepts same-scale medium correction without granting an unreviewed medium-to-small exception', () => {
  const medium = { ...defect, scale: 'medium' };
  const facts = correctionTargetFacts({ problem: medium, proposedBounds: roi, allowedScales: ['medium'] });
  expect(facts.sameScaleMediumTarget).toBe(true);
  expect(facts.boundedMediumTarget).toBe(false);
  expect(correctionTargetFacts({ problem: medium, proposedBounds: roi, allowedScales: ['medium', 'small'] }).sameScaleMediumTarget).toBe(false);
  expect(correctionTargetFacts({ problem: medium, proposedBounds: roi, allowedScales: ['small'] }).sameScaleMediumTarget).toBe(false);
});

describe('shared Director/Guard correction admissibility', () => {
  it('classifies a durable cumulative global must-fix without fabricating a Critic-reviewed union', () => {
    expect(correctionTargetFacts({ problem: defect, proposedBounds: roi })).toEqual({
      globalTarget: true, mediumTarget: false, boundedMediumTarget: false,
      reclassifiedMediumTarget: false,
      sameScaleMediumTarget: false,
    });
    expect(correctionTargetFacts({ problem: undefined, proposedBounds: roi }).globalTarget).toBe(false);
    expect(correctionTargetFacts({ problem: { ...defect, status: 'resolved' }, proposedBounds: roi }).globalTarget).toBe(false);
    expect(correctionTargetFacts({ problem: { ...defect, severity: 'should-fix' }, proposedBounds: roi }).globalTarget).toBe(false);
  });

  it('requires exact Critic spatial evidence for a medium target, and retires inherited global authority', () => {
    const medium = { ...defect, scale: 'medium', source_review_kind: 'proportion', review_region_bounds: roi };
    const inner = { left: 270, top: 770, right: 480, bottom: 995 };
    expect(correctionTargetFacts({ problem: medium, proposedBounds: inner }).boundedMediumTarget).toBe(true);
    expect(correctionTargetFacts({ problem: medium, proposedBounds: { ...inner, right: 1100 } }).boundedMediumTarget).toBe(false);
    expect(correctionTargetFacts({ problem: { ...medium, review_region_bounds: undefined }, proposedBounds: inner }).boundedMediumTarget).toBe(false);
    expect(correctionTargetFacts({ problem: { ...defect, scale: 'medium' }, proposedBounds: inner, inheritedTarget: true }).reclassifiedMediumTarget).toBe(true);
  });

  it('admits only a bounded active medium construction linked to the open global problem', () => {
    const director = { status: 'active', review_due: false, directive_id: 'director-2' };
    const task = {
      status: 'active', allowed_scales: ['medium', 'small'],
      allowed_global_changes: ['depth-structure'], construction_plan: { representation_strategy: 'rebuild' },
      correction_target: { problem_id: defect.problem_id, region_bounds: roi },
    };
    const request = {
      scale: 'medium', problem_id: 'torso-construct', addresses_problem_ids: [defect.problem_id],
      planner_directive_id: 'director-2', painter_scope: 'medium', stageIsDetail: false,
      cosmetic: false, impactClass: 'construct', change_domains: ['depth-structure'],
    };
    const args = { problem: defect, director, task, request, operationBounds: roi,
      globalDomains: new Set(['depth-structure', 'silhouette']) };
    expect(plannedGlobalComponentCorrection(args)).toBe(true);
    // A scale-only already-selected blocker can be checked for route shape by
    // the compiler, but cannot authorize a new Director target on its own.
    expect(plannedGlobalComponentCorrection({ ...args,
      problem: { problem_id: defect.problem_id, scale: 'global' } })).toBe(true);
    expect(correctionTargetFacts({ problem: { problem_id: defect.problem_id, scale: 'global' },
      proposedBounds: roi }).globalTarget).toBe(false);
    expect(plannedGlobalComponentCorrection({ ...args, operationBounds: { ...roi, right: 900 } })).toBe(false);
    expect(plannedGlobalComponentCorrection({ ...args, request: { ...request, addresses_problem_ids: [] } })).toBe(false);
    expect(plannedGlobalComponentCorrection({ ...args, request: { ...request, cosmetic: true } })).toBe(false);
    expect(plannedGlobalComponentCorrection({ ...args, request: { ...request, change_domains: ['local-tone'] } })).toBe(false);
    expect(plannedGlobalComponentCorrection({ ...args, problem: { ...defect, status: 'resolved' } })).toBe(false);
    expect(plannedGlobalComponentCorrection({ ...args, task: { ...task, construction_plan: undefined } })).toBe(false);
  });
});
