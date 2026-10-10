import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function storeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-throughput-semantic-source-'));
  roots.push(root);
  return new SessionStore(root);
}

it.each([
  ['missing', undefined],
  ['text', '3'],
  ['negative', -2],
  ['fraction', 1.5],
  ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ['null', null],
])('does not turn %s semantic_actions into a measured count in the durable event', (_name, count) => {
  const store = storeFixture();
  store.recordArtisticThroughputEvent(42, {
    kind: 'semantic-dispatch', model_visible: true, operation_id: 'pass-1',
    ...(count === undefined ? {} : { semantic_actions: count }),
  });
  const metrics = store.artisticThroughputMetrics(42);
  expect(metrics.recent_events).toHaveLength(1);
  expect(metrics.recent_events[0]).not.toHaveProperty('semantic_actions');
  expect(metrics.accounting_integrity).toMatchObject({
    status: 'unverified', reasons: expect.arrayContaining(['recent_semantic_actions_unmeasured']),
  });
  expect(metrics.artistic_actions_per_model_visible_guard_round_trip).toBeNull();
});

it('preserves explicit zero and exact integer semantic actions, including non-model-visible dispatch', () => {
  const store = storeFixture();
  store.recordArtisticThroughputEvent(42, {
    kind: 'bookkeeping', model_visible: true, semantic_actions: 0, operation_id: 'pass-1',
  });
  store.recordArtisticThroughputEvent(42, {
    kind: 'async-execution', model_visible: false, semantic_actions: 2, operation_id: 'pass-1',
  });
  const metrics = store.artisticThroughputMetrics(42);
  expect(metrics.recent_events.map((event: { semantic_actions?: number }) => event.semantic_actions)).toEqual([0, 2]);
  expect(metrics.semantic_artistic_actions_dispatched).toBe(2);
  expect(metrics.accounting_integrity.reasons).not.toContain('recent_semantic_actions_unmeasured');
});
