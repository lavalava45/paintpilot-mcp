import { strokeExecutionBudget } from '../../tools/painting-tools.js';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/**
 * Pure compact-pass stroke budget preflight. Preserve both the atomic tool's
 * detailed rejection and the cumulative AUTO-batch limit across actions.
 * Earlier violations matter: an existing stroke budget rejection suppresses
 * the redundant cumulative diagnostic, exactly as in the original compiler.
 */
export function collectCompactStrokeBudgetViolations(
  actions: Array<Record<string, unknown>>,
  priorViolations: readonly GuardCycleCompileViolation[]
): GuardCycleCompileViolation[] {
  const violations: GuardCycleCompileViolation[] = [];
  let expandedStrokeBatches = 0;
  for (const action of actions) {
    if (action.tool !== 'photoshop_paint_strokes' || !action.args || typeof action.args !== 'object') continue;
    try {
      const budget = strokeExecutionBudget(action.args as Record<string, unknown>);
      expandedStrokeBatches += budget.auto_batches;
      if (!budget.allowed) violations.push({ scope: 'next_operation', code: 'stroke_batch_budget_exceeded', message: budget.message, details: budget });
    } catch { /* Atomic stroke validation retains its precise format errors. */ }
  }

  if (expandedStrokeBatches > 8
    && !priorViolations.some(item => item.code === 'stroke_batch_budget_exceeded')
    && !violations.some(item => item.code === 'stroke_batch_budget_exceeded')) {
    violations.push({
      scope: 'next_operation',
      code: 'stroke_batch_budget_exceeded',
      message: `This pass expands to ${expandedStrokeBatches} AUTO batches across stroke actions; split the same-component work into passes of at most 8 total batches, keeping preview reserve.`,
      details: { auto_batches: expandedStrokeBatches, max_auto_batches: 8 },
    });
  }
  return violations;
}
