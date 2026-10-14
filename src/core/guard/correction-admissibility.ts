import { regionContains } from './visual-review-region.js';
import type { VisualReviewRegion } from './visual-review-region.js';

/** Read-only admission facts shared by Director ingestion and Painter priority. */
export interface CorrectionProblem {
  problem_id?: string;
  status?: string;
  scale?: string;
  severity?: string;
  source_review_kind?: string;
  structural_review?: boolean;
  structural_defect?: { region_bounds?: VisualReviewRegion };
  review_region_bounds?: VisualReviewRegion;
}

export interface CorrectionTargetFacts {
  globalTarget: boolean;
  mediumTarget: boolean;
  boundedMediumTarget: boolean;
  reclassifiedMediumTarget: boolean;
}

/**
 * A Director-declared rectangle is *not* Critic evidence. A global debt permits
 * a planned medium construction task; a medium debt requires an actual reviewed
 * rectangle that contains the Director target. No state writes or inferred ROI.
 */
export function correctionTargetFacts(input: {
  problem?: CorrectionProblem;
  proposedBounds?: VisualReviewRegion;
  inheritedTarget?: boolean;
}): CorrectionTargetFacts {
  const { problem, proposedBounds, inheritedTarget = false } = input;
  const scale = typeof problem?.scale === 'string' ? problem.scale.trim().toLowerCase() : undefined;
  const openMustFix = problem?.status === 'open' && problem.severity === 'must-fix';
  const globalTarget = !!openMustFix && scale === 'global';
  const mediumTarget = !!openMustFix && scale === 'medium'
    && ((typeof problem?.source_review_kind === 'string' && problem.source_review_kind.trim().length > 0)
      || !!problem?.structural_defect);
  const reviewedBounds = problem?.review_region_bounds ?? problem?.structural_defect?.region_bounds;
  let boundedMediumTarget = false;
  if (mediumTarget && reviewedBounds && proposedBounds) {
    try { boundedMediumTarget = regionContains(reviewedBounds, proposedBounds); }
    catch { /* A claimed target cannot create missing or invalid Critic evidence. */ }
  }
  const reclassifiedMediumTarget = !globalTarget && !mediumTarget && inheritedTarget
    && openMustFix && scale === 'medium';
  return { globalTarget, mediumTarget, boundedMediumTarget, reclassifiedMediumTarget };
}

interface PlannedTask {
  status?: string;
  allowed_scales?: string[];
  allowed_global_changes?: string[];
  construction_plan?: unknown;
  correction_target?: { problem_id?: string; region_bounds?: VisualReviewRegion };
}

/** Pure global→medium exception, never a replacement for Planner/owner/Guard preflight. */
export function plannedGlobalComponentCorrection(input: {
  problem: CorrectionProblem;
  director?: { status?: string; review_due?: boolean; directive_id?: string };
  task?: PlannedTask;
  request: {
    scale?: string;
    problem_id?: string;
    addresses_problem_ids: string[];
    planner_directive_id?: string;
    painter_scope?: string;
    stageIsDetail: boolean;
    cosmetic: boolean;
    impactClass?: string;
    change_domains: string[];
  };
  operationBounds?: VisualReviewRegion;
  globalDomains: ReadonlySet<string>;
}): boolean {
  const { problem, director, task, request, operationBounds, globalDomains } = input;
  const target = task?.correction_target;
  // The very same durable problem facts decide whether Director may issue the
  // target and whether Painter may use it. A bare ID cannot grant authority.
  const completePriority = correctionTargetFacts({ problem, proposedBounds: target?.region_bounds }).globalTarget;
  // plannedComponentCorrection is also used by an offline compiler admission
  // contract with a preselected {problem_id, scale} blocker. Retain that legacy
  // scale-only calculation; only the Director ingestion path can grant a new
  // target and it *always* requires the full durable open/must-fix evidence.
  const preselectedScaleOnly = problem.status === undefined && problem.severity === undefined
    && problem.scale?.trim().toLowerCase() === 'global';
  if (!(completePriority || preselectedScaleOnly)
    || request.scale !== 'medium'
    || !request.problem_id || request.problem_id === problem.problem_id
    || !request.addresses_problem_ids.includes(problem.problem_id ?? '')
    || director?.status !== 'active' || director.review_due
    || request.planner_directive_id !== director.directive_id || task?.status !== 'active'
    || request.painter_scope !== 'medium' || !task.allowed_scales?.includes('medium')
    || target?.problem_id !== problem.problem_id || !task.construction_plan
    || request.stageIsDetail || request.cosmetic || request.impactClass === 'texture'
    || !request.change_domains.some(domain => globalDomains.has(domain)
      && task.allowed_global_changes?.includes(domain))) return false;
  // A declared crop only bounds the claimed plan. Actual painted footprint,
  // semantic owner, protection and exact-current evidence are enforced later.
  if (!operationBounds || !target?.region_bounds) return false;
  try { return regionContains(target.region_bounds, operationBounds); }
  catch { return false; }
}
