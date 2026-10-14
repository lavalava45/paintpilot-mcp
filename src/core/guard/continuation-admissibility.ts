import { correctionTargetFacts } from './correction-admissibility.js';
import type { CorrectionProblem } from './correction-admissibility.js';
import { normalizeRegion } from './visual-review-region.js';
import type { VisualReviewRegion } from './visual-review-region.js';

type ContinuationState = 'requires-preflight' | 'requires-director-review' | 'pending-task';
export interface ContinuationRoute {
  status: ContinuationState;
  reason: string;
  required_scale?: 'medium' | 'small';
  blocker_problem_id?: string;
}

interface ContinuationTask {
  task_id?: string;
  status?: string;
  allowed_scales?: string[];
  allowed_global_changes?: string[];
  construction_plan?: unknown;
  correction_target?: { problem_id?: string; region_bounds?: VisualReviewRegion };
}
interface ContinuationDirector {
  status?: string;
  review_due?: boolean;
  current_task_id?: string;
}

/**
 * Classifies *advice*, never authorizes Photoshop execution. Without a concrete
 * next_pass there is no compiled geometry, owner/stack evidence, method or
 * exact-current review. Only conclusive blockers can be returned here; all
 * other options must still pass the actual Guard gates.
 */
export function adviseTaskContinuation(input: {
  director?: ContinuationDirector;
  task?: ContinuationTask;
  blocker?: CorrectionProblem;
  globalDomains: ReadonlySet<string>;
}): ContinuationRoute {
  const { director, task, blocker, globalDomains } = input;
  const problemId = typeof blocker?.problem_id === 'string' ? blocker.problem_id : undefined;
  const blocked = (reason: string): ContinuationRoute => ({
    status: 'requires-director-review', reason,
    ...(problemId ? { blocker_problem_id: problemId } : {}),
  });
  const preflight = (scale: 'medium' | 'small', reason: string): ContinuationRoute => ({
    status: 'requires-preflight', reason, required_scale: scale,
    ...(problemId ? { blocker_problem_id: problemId } : {}),
  });

  if (director?.status !== 'active' || director.review_due)
    return blocked('The Art Director is not active; review or reactivate the directive before Painter mutation.');
  if (!task || !task.task_id)
    return blocked('No current Director task exists; select an active task before Painter mutation.');
  if (task.status !== 'active' || director.current_task_id !== task.task_id) {
    return { status: 'pending-task', reason: 'This task is not the active Director task; do not dispatch it until the Director advances or reviews the directive.' };
  }
  const scales = task.allowed_scales ?? [];
  if (blocker?.status !== 'resolved' && blocker?.severity === 'must-fix' && blocker.scale === 'global') {
    const target = task.correction_target;
    const eligible = correctionTargetFacts({ problem: blocker, proposedBounds: target?.region_bounds }).globalTarget;
    let validTargetBounds = false;
    try {
      if (target?.region_bounds) {
        const rect = normalizeRegion(target.region_bounds);
        validTargetBounds = rect.left >= 0 && rect.top >= 0;
      }
    } catch { /* Invalid Director target cannot establish a correction route. */ }
    if (eligible && scales.includes('medium') && target?.problem_id === problemId
      && validTargetBounds && task.construction_plan
      && task.allowed_global_changes?.some(domain => globalDomains.has(domain))) {
      return preflight('medium', 'A Director-linked bounded medium construction route exists. Supply a distinct component problem_id, the blocker ID, actual bounded geometry and matching change_domains; the Guard must still verify all preflights.');
    }
    if (scales.includes('medium') && blocker.structural_defect && blocker.review_region_bounds) {
      return preflight('medium', 'A Critic-reviewed structural defect may permit a matching bounded medium structural_correction; this is not yet an executable next_pass and requires full Guard preflight.');
    }
    return blocked('Open global must-fix blocks the current finer task. Review the Director task and bind an evidence-based medium construction correction_target with matching allowed_global_changes before dispatch; do not try detail/texture or invent a reviewed region.');
  }
  if (blocker?.status !== 'resolved' && blocker?.severity === 'must-fix' && blocker.scale === 'medium') {
    if (scales.includes('medium')) return preflight('medium', 'Use a linked same-scale medium pass for the must-fix; the exact next_pass still requires Guard preflight.');
    if (scales.includes('small') && correctionTargetFacts({ problem: blocker,
      proposedBounds: task.correction_target?.region_bounds }).boundedMediumTarget
      && task.correction_target?.problem_id === problemId) {
      return preflight('small', 'A Critic-enclosed small correction target exists; actual bounded pixel geometry and causal/structural bindings must still pass Guard preflight.');
    }
    return blocked('Open medium must-fix blocks finer work without a Critic-reviewed bounded correction target; revise the active task or use a same-scale medium route.');
  }
  if (scales.includes('medium')) return preflight('medium', 'Prepare a concrete next_pass for ordinary Guard/Planner/priority/owner preflight.');
  if (scales.includes('small')) return preflight('small', 'Prepare a concrete next_pass for ordinary Guard/Planner/priority/owner preflight.');
  return blocked('The active task has no allowed medium/small Painter scale; review the Director directive.');
}
