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
  return { state, rows, persist, benchmark, archivePath, event, runDir, operationsDir };
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

it('keeps typed repair accounting and refuses unsafe streamed counter overflow', () => {
  const { rows, persist, benchmark } = fixture();
  Object.assign(rows[0].event, {
    deterministic_violations_encountered_count: 3,
    deterministic_violations_repaired_count: 2,
    deterministic_violations_unresolved_count: 1,
    violation_accounting: [{ scope: 'next_operation', repair_class: 'AUTO_PATCH',
      code: 'fixture-repair', encountered: 3, repaired: 2, unresolved: 1 }],
  });
  persist();
  expect(benchmark()?.hot_loop.aggregate.scoped_violation_accounting).toMatchObject({
    complete: true, encountered: 3, repaired: 2, unresolved: 1, percent: 2 / 3,
  });
  rows[0].event.semantic_actions = Number.MAX_SAFE_INTEGER;
  rows[1].event.semantic_actions = 1;
  rows[0].event.auto_repair_count = Number.MAX_SAFE_INTEGER;
  rows[1].event.auto_repair_count = 1;
  persist();
  expect(benchmark()?.throughput).toMatchObject({
    complete: true, semantic_artistic_actions_dispatched: null, auto_repair_count: null,
  });
});

it('streams more than 50,000 selected events without truncating exact run counters', () => {
  const { rows, state, persist, benchmark, archivePath, event, operationsDir } = fixture();
  fs.writeFileSync(path.join(operationsDir, 'run-a-pass.json'), JSON.stringify({
    id: 'run-a-pass', tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42 }, visual: true, phase: 'completed',
    created_at: '2026-10-10T00:00:30.000Z', completed_at: '2026-10-10T00:00:31.000Z',
    latency: { cycle_received_at: '2026-10-10T00:00:30.000Z',
      response_ready_at: '2026-10-10T00:00:31.000Z' },
  }));
  const largePayload = 'p'.repeat(900 * 1024);
  for (let i = 0; i < 50_010; i++) {
    const row = event(`run-a-extra-${i}`);
    if (i < 20) Object.assign(row, { padding: largePayload });
    rows.push({ incarnation: 'run-a-create', event: row });
  }
  state.artistic_throughput.archive_sequence = rows.length;
  persist();
  expect(fs.statSync(archivePath).size).toBeGreaterThan(16 * 1024 * 1024);
  const result = benchmark();
  expect(result?.throughput).toMatchObject({
    available: true, complete: true, evidence_source: 'verified_archive',
    events: [], events_retained: false,
    model_visible_guard_round_trips: 50_085,
    rejected_before_dispatch_round_trips: 50_085,
    auto_repair_count: 0, auto_split_count: 0,
    semantic_artistic_actions_dispatched: 0,
  });
  expect(result?.hot_loop.passes[0].model_visible_rejection_count).toBe(50_085);
  fs.appendFileSync(archivePath, 'incomplete');
  expect(benchmark()?.throughput).toMatchObject({
    complete: false, evidence_source: 'unverified_archive',
    model_visible_guard_round_trips: null,
  });
}, 45_000);

it('does not claim zero per-pass recovery/rejection counts when the previous visual completion boundary is missing', () => {
  const { operationsDir, benchmark } = fixture();
  fs.writeFileSync(path.join(operationsDir, 'run-a-pass01.json'), JSON.stringify({
    id: 'run-a-pass01', tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42 }, visual: true, phase: 'completed',
    created_at: '2026-10-10T00:00:20.000Z', latency: { cycle_received_at: '2026-10-10T00:00:20.000Z' },
    // No completed_at or response_ready_at: the next pass's counting window is unknown.
  }));
  fs.writeFileSync(path.join(operationsDir, 'run-a-pass02.json'), JSON.stringify({
    id: 'run-a-pass02', tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42 }, visual: true, phase: 'completed',
    created_at: '2026-10-10T00:00:40.000Z', completed_at: '2026-10-10T00:00:41.000Z',
    latency: { cycle_received_at: '2026-10-10T00:00:40.000Z', response_ready_at: '2026-10-10T00:00:41.000Z' },
  }));
  const result = benchmark();
  // A completed journal without an end marker also leaves the run's true
  // boundary unproven. The archive can be valid without proving run totals.
  expect(result?.throughput).toMatchObject({ complete: false, evidence_source: 'verified_archive' });
  expect(result?.hot_loop.passes[0]).toMatchObject({ model_visible_rejection_count: null, recovery_only_count: null });
  expect(result?.hot_loop.passes[1]).toMatchObject({ model_visible_rejection_count: null, recovery_only_count: null });
});

it('does not certify zero per-pass calls when consecutive visual journal windows overlap in time', () => {
  const { operationsDir, benchmark, state, archivePath, persist, event } = fixture();
  fs.writeFileSync(path.join(operationsDir, 'run-a-pass01.json'), JSON.stringify({
    id: 'run-a-pass01', tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42 }, visual: true, phase: 'completed',
    created_at: '2026-10-10T00:00:20.000Z', completed_at: '2026-10-10T00:00:50.000Z',
    latency: { cycle_received_at: '2026-10-10T00:00:20.000Z', response_ready_at: '2026-10-10T00:00:50.000Z' },
  }));
  fs.writeFileSync(path.join(operationsDir, 'run-a-pass02.json'), JSON.stringify({
    id: 'run-a-pass02', tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42 }, visual: true, phase: 'completed',
    created_at: '2026-10-10T00:00:40.000Z', completed_at: '2026-10-10T00:00:45.000Z',
    latency: { cycle_received_at: '2026-10-10T00:00:40.000Z', response_ready_at: '2026-10-10T00:00:45.000Z' },
  }));
  const streamed = benchmark();
  expect(streamed?.throughput).toMatchObject({ complete: true, evidence_source: 'verified_archive' });
  expect(streamed?.hot_loop.passes[1]).toMatchObject({
    model_visible_rejection_count: null, recovery_only_count: null,
  });

  // Legacy bounded mirrors must apply the same inverted-window rule.
  state.artistic_throughput.recent_events = [
    { ...event('foreign-before-start'), at: '2026-10-09T23:59:59.000Z' },
    event('run-a-rejection'),
  ];
  delete (state.artistic_throughput as { archive_sequence?: number }).archive_sequence;
  delete (state.artistic_throughput as { archive_legacy_history_unverified?: boolean }).archive_legacy_history_unverified;
  persist();
  fs.unlinkSync(archivePath);
  const legacy = benchmark();
  expect(legacy?.throughput).toMatchObject({ complete: true, evidence_source: 'bounded_mirror' });
  expect(legacy?.hot_loop.passes[1]).toMatchObject({
    model_visible_rejection_count: null, recovery_only_count: null,
  });
});

it('does not certify run totals when an unkeyed event lands in the keyed persistence tail', () => {
  const { rows, state, persist, benchmark, event } = fixture();
  // The last journal ends at 00:01:00. A keyed owned event may be accepted
  // for another second while state persistence catches up. An unkeyed event
  // in that same interval cannot be proven foreign to this run.
  rows.push({ incarnation: 'run-a-create', event: {
    ...event(null), at: '2026-10-10T00:01:00.500Z', kind: 'recovery',
  } });
  state.artistic_throughput.archive_sequence = rows.length;
  persist();
  const result = benchmark();
  expect(result?.throughput).toMatchObject({
    evidence_source: 'verified_archive', complete: false,
    unkeyed_time_window_events: 1,
    model_visible_guard_round_trips: null,
    recovery_only_round_trips: null,
  });
  // A provably foreign operation in the same tail must not poison this run.
  rows[rows.length - 1].event.operation_id = 'foreign-run-recovery';
  persist();
  expect(benchmark()?.throughput).toMatchObject({
    evidence_source: 'verified_archive', complete: true,
    unkeyed_time_window_events: 0, model_visible_guard_round_trips: 75,
  });
});

it('keeps the legacy mirror conservative about an unkeyed persistence-tail event', () => {
  const { state, persist, archivePath, benchmark, event } = fixture();
  state.artistic_throughput.recent_events = [
    { ...event('foreign-before-start'), at: '2026-10-09T23:59:59.000Z' },
    event('run-a-rejection'),
    { ...event(null), at: '2026-10-10T00:01:00.500Z', kind: 'recovery' },
  ];
  delete (state.artistic_throughput as { archive_sequence?: number }).archive_sequence;
  delete (state.artistic_throughput as { archive_legacy_history_unverified?: boolean }).archive_legacy_history_unverified;
  persist();
  fs.unlinkSync(archivePath); // Genuine pre-archive mirror, not missing declared evidence.
  expect(benchmark()?.throughput).toMatchObject({
    evidence_source: 'bounded_mirror', complete: false,
    unkeyed_time_window_events: 1,
    model_visible_guard_round_trips: null,
  });
});

it('does not certify zero run calls from a verified archive containing only foreign operations', () => {
  const { rows, persist, benchmark } = fixture();
  // The archive is intact and shares this document incarnation, but none of
  // its events is attributable to the selected run's operation prefix.
  for (const row of rows) row.event.operation_id = 'foreign-run-attempt';
  persist();
  expect(benchmark()?.throughput).toMatchObject({
    evidence_source: 'verified_archive', complete: false,
    model_visible_guard_round_trips: null,
    rejected_before_dispatch_round_trips: null,
    semantic_artistic_actions_dispatched: null,
  });
});

it('does not certify zero run calls from a legacy mirror containing only foreign operations', () => {
  const { state, persist, archivePath, benchmark, event } = fixture();
  state.artistic_throughput.recent_events = [
    { ...event('foreign-before-start'), at: '2026-10-09T23:59:59.000Z' },
    event('foreign-during-run'),
  ];
  delete (state.artistic_throughput as { archive_sequence?: number }).archive_sequence;
  delete (state.artistic_throughput as { archive_legacy_history_unverified?: boolean }).archive_legacy_history_unverified;
  persist();
  fs.unlinkSync(archivePath);
  expect(benchmark()?.throughput).toMatchObject({
    evidence_source: 'bounded_mirror', complete: false,
    model_visible_guard_round_trips: null,
    rejected_before_dispatch_round_trips: null,
    semantic_artistic_actions_dispatched: null,
  });
});
