import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { scopedDeterministicRepairAccounting } from '../scripts/dev/benchmark-painting-cycles.mjs';

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'throughput-integrity-')); dirs.push(dir);
  const store = new SessionStore(dir);
  const record = { id: 'paint', args: { document_id: 42 }, sequence: 3, visual: true, tool: 'photoshop_execute_visual_microplan',
    phase: 'completed', execution: 'completed', failed: false,
    result: { content: [{ type: 'text', text: JSON.stringify({ mutation_count: 2 }) }] } };
  const mirror = { semantic_artistic_actions_dispatched: 2, model_visible_guard_round_trips: 1,
    semantic_dispatch_round_trips: 1, artistic_actions_per_model_visible_guard_round_trip: 2,
    recent_events: [{ semantic_actions: 2, operation_id: 'paint' }] };
  const projection: any = { records: [record], activeJobs: [], capturedAt: Date.now(), paintingState: {
    documents: { '42': { document_instance: { superseded_through_sequence: 2 }, artistic_throughput: mirror } },
  } };
  return { store, record, mirror, projection };
}

it('flags interrupted/stale run mirrors from existing journals without scanning or repairing unknown counters', () => {
  const { store, record, mirror, projection } = fixture();
  const scans = vi.spyOn(store, 'records');
  projection.records.push({ ...record, id: 'prior-incarnation', sequence: 1 },
    { ...record, id: 'other-document', args: { document_id: 41 } });
  const metrics = () => store.artisticThroughputMetrics(42, projection.records, projection);
  expect(metrics()).toMatchObject({ accounting_integrity: { status: 'consistent', journal_semantic_actions_dispatched: 2 },
    artistic_actions_per_model_visible_guard_round_trip: 2 });
  mirror.semantic_artistic_actions_dispatched = 0;
  expect(metrics()).toMatchObject({ accounting_integrity: { status: 'stale' }, artistic_actions_per_model_visible_guard_round_trip: null });
  expect(mirror.semantic_artistic_actions_dispatched).toBe(0); // diagnostics do not invent repair
  mirror.semantic_artistic_actions_dispatched = 3;
  expect(metrics().accounting_integrity.status).toBe('stale');
  mirror.semantic_artistic_actions_dispatched = 2;
  mirror.semantic_dispatch_round_trips = 0;
  expect(metrics().accounting_integrity.reasons).toContain('round_trip_categories_disagree');
  expect(scans).not.toHaveBeenCalled();
});

it('counts receipt-owned partial dispatch once and marks legacy/unowned totals unverified', () => {
  const { store, record, mirror, projection } = fixture();
  record.result.content[0].text = JSON.stringify({ pass_execution: { actions: [
    { kind: 'preparation', state: 'completed' }, { kind: 'visual-mutation', state: 'completed' },
    { kind: 'visual-mutation', state: 'failed-or-uncertain' }, { kind: 'visual-mutation', state: 'not-started' },
  ] } });
  expect(store.artisticThroughputMetrics(42, projection.records, projection).accounting_integrity)
    .toMatchObject({ status: 'consistent', journal_semantic_actions_dispatched: 2 });
  record.result.content[0].text = '{}';
  expect(store.artisticThroughputMetrics(42, projection.records, projection).accounting_integrity)
    .toMatchObject({ status: 'unverified', journal_operations_without_exact_dispatch_count: 1 });
  record.result.content[0].text = JSON.stringify({ mutation_count: 2 });
  mirror.recent_events[0].operation_id = 'unrelated';
  expect(store.artisticThroughputMetrics(42, projection.records, projection).accounting_integrity.status).toBe('unverified');
});


it('keeps request, closure and next-pass violation scopes distinct in compiler and durable counters', async () => {
  const { store } = fixture();
  const compiled = await compileGuardCycle({ previous_operation_id: 'missing', painting_intent: {}, next_pass: {} },
    store, new ToolRegistry());
  const accounting = compiled.compilerTelemetry!.violation_accounting;
  expect(new Set(accounting.map(row => row.scope))).toEqual(new Set(['cycle', 'finalization', 'next_operation']));
  expect(accounting.filter(row => row.scope !== 'next_operation').every(row => row.repaired === 0 && row.unresolved === 1)).toBe(true);
  const rows = ['cycle', 'finalization', 'next_operation'].map(scope => ({ scope, code: 'collision',
    repair_class: 'AUTO_PATCH', encountered: 1, repaired: scope === 'next_operation' ? 1 : 0,
    unresolved: scope === 'next_operation' ? 0 : 1 }));
  store.recordArtisticThroughputEvent(42, { kind: 'rejected', operation_id: 'pass', violation_accounting: rows });
  const counters = Object.values(store.artisticThroughputMetrics(42).violation_accounting_by_scope_class_code) as any[];
  expect(counters).toHaveLength(3);
  expect(counters.find(row => row.scope === 'next_operation')).toMatchObject({ repaired: 1, unresolved: 0 });
  expect(counters.find(row => row.scope === 'finalization')).toMatchObject({ repaired: 0, unresolved: 1 });
});

it('preserves missing event-level repair evidence as unknown instead of silently recording zero', () => {
  const { store } = fixture();
  store.recordArtisticThroughputEvent(42, {
    kind: 'semantic-dispatch', operation_id: 'unmeasured-pass', semantic_actions: 1,
  });
  store.recordArtisticThroughputEvent(42, {
    kind: 'rejected', operation_id: 'measured-rejection', semantic_actions: 0,
    auto_repair_count: 0, auto_split_count: 0,
    model_semantic_ambiguity_count: 1, preflight_rejection_exposed_to_model_count: 1,
    deterministic_violations_encountered_count: 0,
    deterministic_violations_repaired_count: 0,
    deterministic_violations_unresolved_count: 0,
    violation_accounting: [],
  });
  const events = store.artisticThroughputMetrics(42).recent_events;
  expect(events).toHaveLength(2);
  for (const field of [
    'auto_repair_count', 'auto_split_count', 'model_semantic_ambiguity_count',
    'preflight_rejection_exposed_to_model_count', 'deterministic_violations_encountered_count',
    'deterministic_violations_repaired_count', 'deterministic_violations_unresolved_count',
    'violation_accounting',
  ]) expect(events[0]).not.toHaveProperty(field);
  expect(events[1]).toMatchObject({
    auto_repair_count: 0, auto_split_count: 0,
    deterministic_violations_encountered_count: 0, violation_accounting: [],
  });
  expect(scopedDeterministicRepairAccounting(events)).toMatchObject({ complete: false, percent: null });
  expect(scopedDeterministicRepairAccounting([events[1]])).toMatchObject({
    complete: true, encountered: 0, repaired: 0, percent: null,
  });
});

it('does not turn malformed optional telemetry into an observed zero', () => {
  const { store } = fixture();
  store.recordArtisticThroughputEvent(42, {
    kind: 'rejected', operation_id: 'bad-metrics',
    auto_repair_count: '', auto_split_count: -1,
    model_semantic_ambiguity_count: Number.NaN,
    preflight_rejection_exposed_to_model_count: null,
    deterministic_violations_encountered_count: '0',
  });
  const [event] = store.artisticThroughputMetrics(42).recent_events;
  for (const field of [
    'auto_repair_count', 'auto_split_count', 'model_semantic_ambiguity_count',
    'preflight_rejection_exposed_to_model_count', 'deterministic_violations_encountered_count',
  ]) expect(event).not.toHaveProperty(field);
});
