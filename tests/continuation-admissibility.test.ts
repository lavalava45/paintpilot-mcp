import { describe, expect, it } from 'vitest';
import { adviseTaskContinuation } from '../src/core/guard/continuation-admissibility.js';

const globalDomains = new Set(['composition', 'depth-structure', 'large-value', 'silhouette']);
const blocker = { problem_id: 'cumulative-trend-primitive-footprint-repeating',
  scale: 'global', status: 'open', severity: 'must-fix' };
const director = { status: 'active', review_due: false, current_task_id: 'repair' };
const task = { task_id: 'repair', status: 'active', allowed_scales: ['medium', 'small'],
  allowed_global_changes: ['depth-structure'],
  construction_plan: { representation_strategy: 'rebuild one component' },
  correction_target: { problem_id: blocker.problem_id,
    region_bounds: { left: 100, top: 110, right: 400, bottom: 450 } },
};

describe('bounded Painter continuation recommendations', () => {
  it('does not suggest an unbound medium/detail pass through open cumulative global debt', () => {
    const route = adviseTaskContinuation({ director, task: { ...task, correction_target: undefined }, blocker, globalDomains });
    expect(route).toMatchObject({ status: 'requires-director-review', blocker_problem_id: blocker.problem_id });
    expect(route.reason).toContain('medium construction correction_target');
    expect(adviseTaskContinuation({ director, task, blocker: { ...blocker, status: undefined }, globalDomains }).status)
      .toBe('requires-director-review');
  });
  it('reports a linked bounded construction as preflight-required, never as approved or executable', () => {
    expect(adviseTaskContinuation({ director, task, blocker, globalDomains })).toMatchObject({
      status: 'requires-preflight', required_scale: 'medium', blocker_problem_id: blocker.problem_id,
    });
    expect(adviseTaskContinuation({ director, task: { ...task, allowed_global_changes: ['local-tone'] }, blocker, globalDomains }).status)
      .toBe('requires-director-review');
    expect(adviseTaskContinuation({ director, task: { ...task,
      correction_target: { ...task.correction_target, region_bounds: { ...task.correction_target.region_bounds, right: NaN } } },
    blocker, globalDomains }).status).toBe('requires-director-review');
  });
  it('marks a pending next Director task as nonexecuting even with no visual debt', () => {
    const route = adviseTaskContinuation({ director, task: { ...task, task_id: 'next', status: 'pending' }, globalDomains });
    expect(route.status).toBe('pending-task');
    expect(route.reason).toContain('not the active Director task');
  });
  it('keeps legitimate same-scale medium correction available only through full preflight', () => {
    const medium = { ...blocker, scale: 'medium' };
    expect(adviseTaskContinuation({ director, task, blocker: medium, globalDomains })).toMatchObject({
      status: 'requires-preflight', required_scale: 'medium',
    });
    expect(adviseTaskContinuation({ director, task: { ...task, allowed_scales: ['small'] },
      blocker: medium, globalDomains }).status).toBe('requires-director-review');
  });
});
