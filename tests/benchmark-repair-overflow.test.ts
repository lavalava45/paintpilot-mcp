import { expect, it } from 'vitest';
import { scopedDeterministicRepairAccounting } from '../scripts/dev/benchmark-painting-cycles.mjs';

function repairedEvent(encountered: number) {
  return {
    operation_id: 'run-a-cycle',
    model_visible: true,
    kind: 'semantic-dispatch',
    deterministic_violations_encountered_count: encountered,
    violation_accounting: [{
      scope: 'next_operation', repair_class: 'AUTO_PATCH', code: 'bounded-repair',
      encountered, repaired: encountered, unresolved: 0,
    }],
  };
}

it('refuses to certify an unsafe sum of individually valid repair-accounting rows', () => {
  const overflow = scopedDeterministicRepairAccounting([
    repairedEvent(Number.MAX_SAFE_INTEGER), repairedEvent(1),
  ]);
  expect(overflow).toMatchObject({
    complete: false, encountered: null, repaired: null, unresolved: 0, percent: null,
  });
});

it('keeps the exact maximum safe repair-accounting boundary', () => {
  const boundary = scopedDeterministicRepairAccounting([
    repairedEvent(Number.MAX_SAFE_INTEGER), repairedEvent(0),
  ]);
  expect(boundary).toMatchObject({
    complete: true, encountered: Number.MAX_SAFE_INTEGER,
    repaired: Number.MAX_SAFE_INTEGER, unresolved: 0, percent: 1,
  });
});
