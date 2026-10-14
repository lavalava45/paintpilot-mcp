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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-throughput-legacy-write-'));
  roots.push(root);
  const store = new SessionStore(root);
  store.updatePaintingState(42, current => ({
    ...current, document_instance: { bootstrap_operation_id: 'run-one' },
  }));
  return { root, store };
}

it.each([undefined, null, 'false'])(
  'does not launder an unproven legacy-coverage verdict (%s) into explicit false on the next append',
  verdict => {
    const { root, store } = fixture();
    store.recordArtisticThroughputEvent(42, {
      kind: 'rejected', model_visible: true, operation_id: 'first', semantic_actions: 0,
    });
    expect(store.throughputArchivePage(42).integrity).toBe('consistent');

    // Simulate an older/incompletely migrated persisted state: the archive
    // exists, but the coverage verdict is no longer a proven boolean false.
    store.updatePaintingState(42, current => ({ ...current, artistic_throughput: {
      ...current.artistic_throughput, archive_legacy_history_unverified: verdict,
    } }));
    expect(store.throughputArchivePage(42).integrity).toBe('unverified');

    store.recordArtisticThroughputEvent(42, {
      kind: 'recovery', model_visible: true, operation_id: 'second', semantic_actions: 0,
    });
    const state = store.paintingState().documents['42'];
    expect(state.artistic_throughput.archive_legacy_history_unverified).toBe(true);
    expect(store.throughputArchivePage(42)).toMatchObject({
      integrity: 'unverified', reasons: expect.arrayContaining(['legacy_history_not_archived']),
    });
    expect(benchmarkArchiveEvidence(root, state)?.integrity).toBe('unverified');
  },
);

it('preserves verified coverage for a fresh archive and later explicitly verified appends', () => {
  const { root, store } = fixture();
  store.recordArtisticThroughputEvent(42, {
    kind: 'rejected', model_visible: true, operation_id: 'first', semantic_actions: 0,
  });
  store.recordArtisticThroughputEvent(42, {
    kind: 'recovery', model_visible: true, operation_id: 'second', semantic_actions: 0,
  });
  const state = store.paintingState().documents['42'];
  expect(state.artistic_throughput.archive_legacy_history_unverified).toBe(false);
  expect(store.throughputArchivePage(42)).toMatchObject({ integrity: 'consistent', last_sequence: 2 });
  expect(benchmarkArchiveEvidence(root, state)).toMatchObject({ integrity: 'consistent' });
});
