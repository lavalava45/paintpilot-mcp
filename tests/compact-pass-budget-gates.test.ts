import { describe, expect, it } from 'vitest';
import {
  compactMutationLimitViolation,
  compactAdaptiveBudgetViolation,
  compactLayerCreationLimitViolation,
} from '../src/core/guard/compact-pass-budget-gates.js';
import {
  VISUAL_MICROPLAN_MAX_LAYER_CREATIONS,
  VISUAL_MICROPLAN_MAX_MUTATIONS,
  resolveVisualMicroPlanMutationBudget,
} from '../src/core/visual-microplan.js';

describe('compact pass budget gates extraction', () => {
  it('retains the hard visual-mutation cap and exact split details', () => {
    expect(compactMutationLimitViolation(VISUAL_MICROPLAN_MAX_MUTATIONS)).toBeUndefined();
    expect(compactMutationLimitViolation(VISUAL_MICROPLAN_MAX_MUTATIONS + 1)).toEqual({
      scope: 'next_operation', code: 'compact_pass_visual_mutation_limit',
      message: `next_pass may contain at most ${VISUAL_MICROPLAN_MAX_MUTATIONS} visual mutations; split the artistic stage into sequential Guard passes`,
      details: { requested_mutations: VISUAL_MICROPLAN_MAX_MUTATIONS + 1,
        allowed_mutations: VISUAL_MICROPLAN_MAX_MUTATIONS, splittable: true },
    });
  });

  it('retains adaptive risk/scale budget diagnostics without changing their source', () => {
    const budget = resolveVisualMicroPlanMutationBudget({ risk: 'low', scale: 'global', actionClass: 'ADD' });
    expect(budget.allowedMutations).toBe(2);
    expect(compactAdaptiveBudgetViolation(2, budget)).toBeUndefined();
    expect(compactAdaptiveBudgetViolation(3, budget)).toEqual({
      scope: 'next_operation', code: 'compact_pass_adaptive_mutation_budget_exceeded',
      message: 'next_pass requests 3 visual mutations but adaptive budget allows 2 (risk=low;global-scale); split/defer the remaining actions before dispatch',
      details: { requested_mutations: 3, allowed_mutations: 2, splittable: true, budget_reason: 'risk=low;global-scale' },
    });
  });

  it('preserves one-layer rollback-unit cap and exact message', () => {
    expect(compactLayerCreationLimitViolation(0)).toBeUndefined();
    expect(compactLayerCreationLimitViolation(VISUAL_MICROPLAN_MAX_LAYER_CREATIONS)).toBeUndefined();
    expect(compactLayerCreationLimitViolation(VISUAL_MICROPLAN_MAX_LAYER_CREATIONS + 1)).toEqual({
      scope: 'next_operation', code: 'compact_pass_multiple_layer_creation',
      message: `next_pass may create at most ${VISUAL_MICROPLAN_MAX_LAYER_CREATIONS} logical layer; the current VisualMicroPlan represents one rollback unit`,
    });
  });

  it('keeps hard and adaptive overflow as two separate diagnostics in original order', () => {
    const budget = resolveVisualMicroPlanMutationBudget({ risk: 'high', scale: 'global', actionClass: 'REPLACE' });
    const count = VISUAL_MICROPLAN_MAX_MUTATIONS + 1;
    const violations = [compactMutationLimitViolation(count), compactAdaptiveBudgetViolation(count, budget)]
      .filter(item => item !== undefined);
    expect(violations.map(item => item.code)).toEqual([
      'compact_pass_visual_mutation_limit', 'compact_pass_adaptive_mutation_budget_exceeded',
    ]);
    expect(violations[1]?.details).toEqual({
      requested_mutations: count, allowed_mutations: 1, splittable: true,
      budget_reason: 'risk=high;global-scale;action=replace',
    });
  });

  it('does not report any count limit on an empty compact pass', () => {
    const budget = resolveVisualMicroPlanMutationBudget({ risk: 'moderate', scale: 'medium' });
    expect(compactMutationLimitViolation(0)).toBeUndefined();
    expect(compactAdaptiveBudgetViolation(0, budget)).toBeUndefined();
    expect(compactLayerCreationLimitViolation(0)).toBeUndefined();
  });
});
