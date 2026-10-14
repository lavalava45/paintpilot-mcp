import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { appendThroughputArchiveEvent, readThroughputArchivePage, throughputArchivePath } from '../src/core/guard/throughput-event-archive.js';

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

it('does not certify archive coverage when the state omits the explicit legacy-history verdict', () => {
  const { store } = fixture();
  store.recordArtisticThroughputEvent(42, {
    kind: 'rejected', operation_id: 'known-run', model_visible: true, semantic_actions: 0,
  });
  expect(store.throughputArchivePage(42)).toMatchObject({ integrity: 'consistent' });
  store.updatePaintingState(42, current => ({ ...current, artistic_throughput: {
    ...current.artistic_throughput,
    archive_legacy_history_unverified: undefined,
  } }));
  expect(store.throughputArchivePage(42)).toMatchObject({
    integrity: 'unverified',
    reasons: expect.arrayContaining(['archive_legacy_coverage_unproven']),
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

it('does not certify an empty existing archive as complete history', () => {
  const { dir } = fixture();
  const file = throughputArchivePath(dir, 42);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  expect(readThroughputArchivePage(dir, 42)).toMatchObject({
    integrity: 'unverified', reasons: expect.arrayContaining(['archive_empty']),
  });
});

it('does not certify an empty page when the requested cursor exceeds verified archive history', () => {
  const { dir } = fixture();
  appendThroughputArchiveEvent(dir, 42, 1, 'first-canvas', {
    kind: 'rejected', operation_id: 'run-a-one', model_visible: true,
  });
  expect(readThroughputArchivePage(dir, 42, { afterSequence: 1 })).toMatchObject({
    integrity: 'consistent', events: [], last_sequence: 1,
  });
  expect(readThroughputArchivePage(dir, 42, { afterSequence: 2 })).toMatchObject({
    integrity: 'unverified', events: [], last_sequence: 1,
    reasons: expect.arrayContaining(['cursor_beyond_archive']),
  });
});

it('refuses a stale complete page when another writer appends just after EOF', () => {
  const { dir } = fixture();
  appendThroughputArchiveEvent(dir, 42, 1, 'first-canvas', {
    kind: 'rejected', operation_id: 'run-a-one', model_visible: true,
  });
  const realReadSync = fs.readSync.bind(fs);
  let appended = false;
  const spy = vi.spyOn(fs, 'readSync').mockImplementation((fd, buffer, offset, length, position) => {
    const count = realReadSync(fd, buffer, offset, length, position);
    if (count === 0 && !appended) {
      appended = true;
      appendThroughputArchiveEvent(dir, 42, 2, 'first-canvas', {
        kind: 'recovery', operation_id: 'run-a-two', model_visible: true,
      });
    }
    return count;
  });
  try {
    expect(readThroughputArchivePage(dir, 42)).toMatchObject({
      integrity: 'unverified', reasons: expect.arrayContaining(['archive_changed_during_read']),
    });
  } finally { spy.mockRestore(); }
  expect(appended).toBe(true);
  expect(readThroughputArchivePage(dir, 42)).toMatchObject({
    integrity: 'consistent', last_sequence: 2,
  });
});

it('returns unverified if another process rotates the archive between existence check and open', () => {
  const { dir } = fixture();
  appendThroughputArchiveEvent(dir, 42, 1, 'first-canvas', {
    kind: 'rejected', operation_id: 'run-a-one', model_visible: true,
  });
  const file = throughputArchivePath(dir, 42);
  const originalOpen = fs.openSync.bind(fs);
  let rotated = false;
  const spy = vi.spyOn(fs, 'openSync').mockImplementation((filePath, flags, mode) => {
    if (filePath === file && flags === 'r' && !rotated) {
      rotated = true;
      fs.renameSync(file, `${file}.rotated`);
    }
    return originalOpen(filePath, flags, mode);
  });
  try {
    expect(readThroughputArchivePage(dir, 42)).toMatchObject({
      integrity: 'unverified', reasons: expect.arrayContaining(['archive_open_failed']),
    });
  } finally { spy.mockRestore(); }
  expect(rotated).toBe(true);
});

it('returns unverified rather than throwing when the archive read fails after opening', () => {
  const { dir } = fixture();
  appendThroughputArchiveEvent(dir, 42, 1, 'first-canvas', {
    kind: 'rejected', operation_id: 'run-a-one', model_visible: true,
  });
  const spy = vi.spyOn(fs, 'readSync').mockImplementation(() => {
    throw Object.assign(new Error('simulated interrupted read'), { code: 'EIO' });
  });
  try {
    expect(readThroughputArchivePage(dir, 42)).toMatchObject({
      integrity: 'unverified', reasons: expect.arrayContaining(['archive_read_failed']),
    });
  } finally { spy.mockRestore(); }
});
