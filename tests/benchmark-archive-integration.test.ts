import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildBenchmark } from '../scripts/dev/benchmark-painting-cycles.mjs';
import { throughputArchivePath } from '../src/core/guard/throughput-event-archive.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-archive-benchmark-'));
  roots.push(root);
  const operationsDir = path.join(root, '.photoshop-runtime', 'controller', 'operations');
  const runDir = path.join(root, 'processes', 'archive-process', 'run-01');
  fs.mkdirSync(operationsDir, { recursive: true });
  fs.mkdirSync(path.join(runDir, 'final'), { recursive: true });
  fs.writeFileSync(path.join(operationsDir, 'run-a-create.json'), JSON.stringify({
    id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'final', 'frame.psd') },
    phase: 'completed', created_at: '2026-10-10T00:00:00.000Z',
    completed_at: '2026-10-10T00:01:00.000Z',
    latency: { cycle_received_at: '2026-10-10T00:00:00.000Z', response_ready_at: '2026-10-10T00:01:00.000Z' },
  }));
  const event = (id: string | null) => ({
    at: '2026-10-10T00:00:10.000Z', kind: 'rejected', model_visible: true,
    semantic_actions: 0, auto_repair_count: 0, auto_split_count: 0,
    model_semantic_ambiguity_count: 0, preflight_rejection_exposed_to_model_count: 0,
    deterministic_violations_encountered_count: 0, deterministic_violations_repaired_count: 0,
    deterministic_violations_unresolved_count: 0, violation_accounting: [],
    ...(id ? { operation_id: id } : {}),
  });
  const rows = Array.from({ length: 75 }, (_, i) => ({ incarnation: 'run-a-create', event: event(`run-a-attempt-${i}`) }));
  rows.push({ incarnation: 'other-canvas', event: event('run-a-foreign-incarnation') });
  const state = {
    document_id: 42, document_instance: { bootstrap_operation_id: 'run-a-create' },
    process_dir: 'processes/archive-process/run-01',
    artistic_throughput: { archive_sequence: rows.length, archive_legacy_history_unverified: false,
      recent_events: rows.slice(-64).map(row => row.event) },
  };
  const statePath = path.join(runDir, 'painting-state.json');
  const archivePath = throughputArchivePath(path.dirname(operationsDir), 42);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  const persist = () => {
    fs.writeFileSync(statePath, JSON.stringify(state));
    fs.writeFileSync(archivePath, rows.map(({ incarnation, event }, i) => {
      const payload = { protocol: 'photoshop.guard.throughput_event_archive.v1',
        document_id: 42, sequence: i + 1, document_incarnation: incarnation, event };
      const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      return JSON.stringify({ ...payload, sha256 });
    }).join('\n') + '\n');
  };
  const benchmark = () => buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope;
  persist();
  return { state, rows, persist, benchmark, archivePath, event, runDir };
}

it('counts more than 64 owned events from the verified archive, excluding another incarnation', () => {
  const { benchmark } = fixture();
  expect(benchmark()?.throughput).toMatchObject({
    available: true, complete: true, evidence_source: 'verified_archive', model_visible_guard_round_trips: 75,
    rejected_before_dispatch_round_trips: 75, semantic_artistic_actions_dispatched: 0,
  });
});

it('does not fall back to a plausible 64-event mirror when archive integrity fails', () => {
  const { benchmark, archivePath, rows, state, persist, runDir } = fixture();
  rows[0].event.semantic_actions = 5;
  // Mutate the persisted row without updating its checksum.
  const lines = fs.readFileSync(archivePath, 'utf8').trimEnd().split('\n');
  const first = JSON.parse(lines[0]);
  first.event.semantic_actions = 5;
  lines[0] = JSON.stringify(first);
  fs.writeFileSync(archivePath, lines.join('\n') + '\n');
  expect(benchmark()?.throughput).toMatchObject({ complete: false, evidence_source: 'unverified_archive', model_visible_guard_round_trips: null });
  expect(benchmark()?.warnings.join(' ')).toContain('checksum mismatch');

  persist();
  state.artistic_throughput.archive_sequence++;
  fs.writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify(state));
  expect(benchmark()?.throughput).toMatchObject({ complete: false, model_visible_guard_round_trips: null });
  expect(benchmark()?.warnings.join(' ')).toContain('sequence mismatch');
});

it('treats a missing declared archive as lost evidence, not a valid mirror fallback', () => {
  const { benchmark, archivePath } = fixture();
  fs.unlinkSync(archivePath);
  expect(benchmark()?.throughput).toMatchObject({
    evidence_source: 'unverified_archive', complete: false, model_visible_guard_round_trips: null,
  });
  expect(benchmark()?.warnings.join(' ')).toContain('file is missing');
});

it('refuses legacy coverage and preserves unkeyed pending-incarnation ambiguity', () => {
  const { state, rows, persist, benchmark, event } = fixture();
  state.artistic_throughput.archive_legacy_history_unverified = true;
  persist();
  expect(benchmark()?.throughput.complete).toBe(false);
  delete (state.artistic_throughput as { archive_legacy_history_unverified?: boolean }).archive_legacy_history_unverified;
  persist();
  expect(benchmark()?.throughput.complete).toBe(false);
  state.artistic_throughput.archive_legacy_history_unverified = false;
  rows.push({ incarnation: null as unknown as string, event: event(null) });
  state.artistic_throughput.archive_sequence = rows.length;
  persist();
  expect(benchmark()?.throughput).toMatchObject({
    complete: false, unkeyed_time_window_events: 1, model_visible_guard_round_trips: null,
  });
});
