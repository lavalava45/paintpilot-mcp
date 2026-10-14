import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { benchmarkArchiveEvidence } from '../scripts/dev/benchmark-throughput-archive.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-throughput-source-class-'));
  roots.push(root);
  const store = new SessionStore(root);
  store.updatePaintingState(42, current => ({
    ...current, document_instance: { bootstrap_operation_id: 'run-one' },
  }));
  return { root, store };
}

it.each([
  ['string model visibility', { kind: 'rejected', model_visible: 'false' }],
  ['unknown event kind', { kind: 'unexpected-kind', model_visible: true }],
  ['explicitly missing event kind', { kind: undefined, model_visible: true }],
])('retains malformed source %s rather than rewriting it as a valid category', (_label, event) => {
  const { root, store } = fixture();
  store.recordArtisticThroughputEvent(42, {
    operation_id: 'run-one-pass', semantic_actions: 0, ...event,
  });
  const page = store.throughputArchivePage(42);
  expect(page.integrity).toBe('consistent'); // File integrity and event classification are distinct.
  const persisted = store.paintingState().documents['42'];
  const benchmark = benchmarkArchiveEvidence(root, persisted);
  expect(benchmark?.integrity).toBe('consistent');
  expect(benchmark?.events).toHaveLength(1);
  const observed = benchmark?.events[0] as Record<string, unknown>;
  expect(typeof observed.model_visible === 'boolean'
    && ['semantic-dispatch', 'bookkeeping', 'recovery', 'rejected'].includes(String(observed.kind)))
    .toBe(false);
});

it('retains the intentional legacy defaults when classification fields are omitted', () => {
  const { root, store } = fixture();
  store.recordArtisticThroughputEvent(42, { operation_id: 'run-one-pass', semantic_actions: 0 });
  const persisted = store.paintingState().documents['42'];
  expect(benchmarkArchiveEvidence(root, persisted)).toMatchObject({
    integrity: 'consistent', events: [{ kind: 'bookkeeping', model_visible: true }],
  });
});
