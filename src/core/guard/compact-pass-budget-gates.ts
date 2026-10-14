import {
  VISUAL_MICROPLAN_MAX_LAYER_CREATIONS,
  VISUAL_MICROPLAN_MAX_MUTATIONS,
  type VisualMicroPlanMutationBudget,
} from '../visual-microplan.js';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/**
 * Independent compact-pass count gates. The compiler invokes each at its
 * original position: hard cap, adaptive cap after stage resolution, then
 * physical layer-creation cap. Keep simultaneous diagnostics distinct.
 */
export function compactMutationLimitViolation(mutationCount: number): GuardCycleCompileViolation | undefined {
  if (mutationCount <= VISUAL_MICROPLAN_MAX_MUTATIONS) return undefined;
  return {
    scope: 'next_operation',
    code: 'compact_pass_visual_mutation_limit',
    message: `next_pass may contain at most ${VISUAL_MICROPLAN_MAX_MUTATIONS} visual mutations; split the artistic stage into sequential Guard passes`,
    details: {
      requested_mutations: mutationCount,
      allowed_mutations: VISUAL_MICROPLAN_MAX_MUTATIONS,
      splittable: true,
    },
  };
}

export function compactAdaptiveBudgetViolation(
  mutationCount: number,
  budget: VisualMicroPlanMutationBudget
): GuardCycleCompileViolation | undefined {
  if (mutationCount <= budget.allowedMutations) return undefined;
  return {
    scope: 'next_operation',
    code: 'compact_pass_adaptive_mutation_budget_exceeded',
    message: `next_pass requests ${mutationCount} visual mutations but adaptive budget allows ${budget.allowedMutations} (${budget.reason}); split/defer the remaining actions before dispatch`,
    details: {
      requested_mutations: mutationCount,
      allowed_mutations: budget.allowedMutations,
      splittable: true,
      budget_reason: budget.reason,
    },
  };
}

export function compactLayerCreationLimitViolation(layerCount: number): GuardCycleCompileViolation | undefined {
  if (layerCount <= VISUAL_MICROPLAN_MAX_LAYER_CREATIONS) return undefined;
  return {
    scope: 'next_operation',
    code: 'compact_pass_multiple_layer_creation',
    message: `next_pass may create at most ${VISUAL_MICROPLAN_MAX_LAYER_CREATIONS} logical layer; the current VisualMicroPlan represents one rollback unit`,
  };
}
