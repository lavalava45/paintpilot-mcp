import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildBenchmark } from '../scripts/dev/benchmark-painting-cycles.mjs';

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function benchmarkWithActions(actions: unknown[]) {
  const root = mkdtempSync(path.join(tmpdir(), 'painting-semantic-actions-'));
  temporaryRoots.push(root);
  const operationsDir = path.join(root, '.photoshop-runtime', 'controller', 'operations');
  const runDir = path.join(root, 'processes', 'action-integrity', 'run-01');
  mkdirSync(operationsDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  writeFileSync(path.join(operationsDir, 'run-a-create.json'), JSON.stringify({
    id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'painting.psd') },
    created_at: '2026-10-02T10:00:00.000Z', completed_at: '2026-10-02T10:00:10.000Z',
    latency: { cycle_received_at: '2026-10-02T10:00:00.000Z', response_ready_at: '2026-10-02T10:00:10.000Z' },
  }));
  writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
    document_id: 42,
    document_instance: { bootstrap_operation_id: 'run-a-create' },
    process_dir: 'processes/action-integrity/run-01',
    artistic_throughput: {
      recent_events: actions.map((semantic_actions, index) => ({
        at: `2026-10-02T10:00:0${index + 1}.000Z`,
        kind: 'semantic-dispatch', operation_id: 'run-a-create', model_visible: true,
        ...(semantic_actions === undefined ? {} : { semantic_actions }),
      })),
    },
  }));
  return buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope?.throughput;
}

it('does not turn a missing semantic action count into a measured zero', () => {
  const incomplete = benchmarkWithActions([2, undefined]);
  expect(incomplete).toMatchObject({
    complete: true,
    model_visible_guard_round_trips: 2,
    semantic_dispatch_round_trips: 2,
    semantic_artistic_actions_dispatched: null,
  });
  expect(incomplete?.warning).toContain('semantic_actions');

  const measured = benchmarkWithActions([2, 0]);
  expect(measured).toMatchObject({
    complete: true, semantic_artistic_actions_dispatched: 2,
  });
});

it.each([['textual', '2'], ['negative', -1], ['fractional', 1.5], ['nonfinite', null]])(
  'does not silently coerce an invalid %s semantic action count', (_label, invalid) => {
    const result = benchmarkWithActions([1, invalid]);
    expect(result).toMatchObject({ complete: true, semantic_artistic_actions_dispatched: null });
    expect(result?.warning).toContain('semantic_actions');
  },
);

it('does not report an unsafe aggregate as an exact semantic action count', () => {
  const result = benchmarkWithActions([Number.MAX_SAFE_INTEGER, 1]);
  expect(result).toMatchObject({ complete: true, semantic_artistic_actions_dispatched: null });
});
