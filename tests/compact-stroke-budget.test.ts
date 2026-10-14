import { describe, expect, it } from 'vitest';
import { strokeExecutionBudget } from '../src/tools/painting-tools.js';
import { collectCompactStrokeBudgetViolations } from '../src/core/guard/compact-stroke-budget.js';

const mark = { tool: 'BRUSH', size: 26, opacity: 66, flow: 46,
  color: { red: 0, green: 0, blue: 0 }, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] };
const action = (strokes: unknown) => ({ tool: 'photoshop_paint_strokes', args: { strokes } });

describe('compact stroke budget extraction', () => {
  it('admits a bounded stroke action and ignores unrelated actions', () => {
    expect(collectCompactStrokeBudgetViolations([action([mark]), { tool: 'photoshop_get_state' }], [])).toEqual([]);
  });

  it('preserves atomic over-budget diagnostic including its exact details', () => {
    const args = { strokes: Array.from({ length: 60 }, () => mark) };
    const budget = strokeExecutionBudget(args);
    expect(budget.allowed).toBe(false);
    expect(collectCompactStrokeBudgetViolations([action(args.strokes)], [])).toEqual([{
      scope: 'next_operation', code: 'stroke_batch_budget_exceeded',
      message: budget.message, details: budget,
    }]);
  });

  it('reports one cumulative violation across individually admissible actions', () => {
    expect(collectCompactStrokeBudgetViolations(Array.from({ length: 9 }, () => action([mark])), [])).toEqual([{
      scope: 'next_operation', code: 'stroke_batch_budget_exceeded',
      message: 'This pass expands to 9 AUTO batches across stroke actions; split the same-component work into passes of at most 8 total batches, keeping preview reserve.',
      details: { auto_batches: 9, max_auto_batches: 8 },
    }]);
  });

  it('does not duplicate a prior stroke budget violation', () => {
    const previous = [{ scope: 'next_operation' as const, code: 'stroke_batch_budget_exceeded', message: 'existing' }];
    expect(collectCompactStrokeBudgetViolations(Array.from({ length: 9 }, () => action([mark])), previous)).toEqual([]);
  });

  it('leaves invalid atomic stroke format to the atomic schema validator', () => {
    expect(collectCompactStrokeBudgetViolations([action('invalid'), action([mark])], [])).toEqual([]);
  });
});
