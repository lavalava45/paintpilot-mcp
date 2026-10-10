import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { throughputArchivePath } from '../src/core/guard/throughput-event-archive.js';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-throughput-archive-'));
  directories.push(dir);
  return { dir, store: new SessionStore(dir) };
}

it('durably pages more than 64 events across a new SessionStore without growing the live mirror', () => {
  const { dir, store } = fixture();
  store.updatePaintingState(42, current => ({ ...current, document_instance: { bootstrap_operation_id: 'first-canvas' } }));
  for (let index = 0; index < 75; index++) {
    store.recordArtisticThroughputEvent(42, {
      kind: 'semantic-dispatch', model_visible: true,
      operation_id: `paint-${index}`, semantic_actions: 1,
    });
  }
  expect(store.artisticThroughputMetrics(42).recent_events).toHaveLength(64);
  const restarted = new SessionStore(dir);
  const first = restarted.throughputArchivePage(42, { limit: 40 });
  expect(first).toMatchObject({ integrity: 'consistent', has_more: true, last_sequence: 75 });
  expect(first.events).toHaveLength(40);
  expect(first.events[0]).toMatchObject({ sequence: 1, document_incarnation: 'first-canvas', event: { operation_id: 'paint-0' } });
  const second = restarted.throughputArchivePage(42, { afterSequence: 40, limit: 40 });
  expect(second).toMatchObject({ integrity: 'consistent', has_more: false, last_sequence: 75 });
  expect(second.events).toHaveLength(35);
  expect(second.events[34]).toMatchObject({ sequence: 75, event: { operation_id: 'paint-74' } });
});

it('keeps document incarnations distinct even when Photoshop reuses a numeric document id', () => {
  const { store } = fixture();
  store.updatePaintingState(42, current => ({ ...current, document_instance: { bootstrap_operation_id: 'old' } }));
  store.recordArtisticThroughputEvent(42, { kind: 'rejected', operation_id: 'old-pass', semantic_actions: 0 });
  store.updatePaintingState(42, current => ({ ...current, document_instance: { bootstrap_operation_id: 'new' } }));
  store.recordArtisticThroughputEvent(42, { kind: 'rejected', operation_id: 'new-pass', semantic_actions: 0 });
  expect(store.throughputArchivePage(42, { documentIncarnation: 'new' }).events)
    .toMatchObject([{ sequence: 2, document_incarnation: 'new', event: { operation_id: 'new-pass' } }]);
  expect(store.throughputArchivePage(42, { documentIncarnation: 'old' }).events)
    .toMatchObject([{ sequence: 1, document_incarnation: 'old', event: { operation_id: 'old-pass' } }]);
  store.updatePaintingState(42, current => ({ ...current, document_instance: {
    bootstrap_operation_id: 'old', identity_pending: true,
  } }));
  store.recordArtisticThroughputEvent(42, { kind: 'rejected', semantic_actions: 0 });
  expect(store.throughputArchivePage(42, { afterSequence: 2 }).events)
    .toMatchObject([{ sequence: 3, document_incarnation: null }]);
});

it('reports an interrupted append or corrupted entry instead of claiming complete history', () => {
  const { dir, store } = fixture();
  store.recordArtisticThroughputEvent(42, { kind: 'rejected', semantic_actions: 0 });
  const file = throughputArchivePath(dir, 42);
  fs.appendFileSync(file, '{"incomplete":');
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified', reasons: expect.arrayContaining(['truncated_final_entry']),
  });
  fs.appendFileSync(file, '}\n');
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified', reasons: expect.arrayContaining(['malformed_entry']),
  });
  fs.appendFileSync(file, 'null\n');
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified', reasons: expect.arrayContaining(['invalid_entry']),
  });
  fs.writeFileSync(file, '');
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified', reasons: expect.arrayContaining(['archive_state_sequence_mismatch']),
  });
});

it('rejects a well-formed archive entry whose payload was changed after persistence', () => {
  const { dir, store } = fixture();
  store.recordArtisticThroughputEvent(42, { kind: 'semantic-dispatch', semantic_actions: 1 });
  const file = throughputArchivePath(dir, 42);
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
  entry.event.semantic_actions = 100;
  fs.writeFileSync(file, `${JSON.stringify(entry)}\n`);
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified', reasons: expect.arrayContaining(['checksum_mismatch']),
  });
});

it('does not claim archived coverage of events that predate the new archive', () => {
  const { store } = fixture();
  store.updatePaintingState(42, current => ({ ...current, artistic_throughput: {
    model_visible_guard_round_trips: 3, recent_events: [{ at: '2026-10-10T00:00:00Z' }],
  } }));
  store.recordArtisticThroughputEvent(42, { kind: 'rejected', semantic_actions: 0 });
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified', reasons: expect.arrayContaining(['legacy_history_not_archived']),
  });
});

it('detects a sequence gap after an interrupted state-persisted/archive-missing write', () => {
  const { store } = fixture();
  store.recordArtisticThroughputEvent(42, { kind: 'bookkeeping', semantic_actions: 0 });
  // Simulate a crash after the bounded state commit but before its archive append.
  store.updatePaintingState(42, current => ({ ...current, artistic_throughput: {
    ...current.artistic_throughput, archive_sequence: 2,
  } }));
  store.recordArtisticThroughputEvent(42, { kind: 'rejected', semantic_actions: 0 });
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified', last_sequence: 3,
    reasons: expect.arrayContaining(['sequence_gap_or_duplicate']),
  });
});
