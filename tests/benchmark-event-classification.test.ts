import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildBenchmark } from '../scripts/dev/benchmark-painting-cycles.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function measure(mode: 'archive' | 'mirror', invalid: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-event-classification-'));
  roots.push(root);
  const runtime = path.join(root, '.photoshop-runtime', 'controller');
  const operationsDir = path.join(runtime, 'operations');
  const runDir = path.join(root, 'processes', 'classification-process', 'run-01');
  fs.mkdirSync(operationsDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(operationsDir, 'run-a-create.json'), JSON.stringify({
    id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'frame.psd') },
    phase: 'completed',
    created_at: '2026-10-10T00:00:00.000Z', completed_at: '2026-10-10T00:01:00.000Z',
  }));
  const valid = {
    at: '2026-10-10T00:00:10.000Z', operation_id: 'run-a-attempt',
    kind: 'rejected', model_visible: true, semantic_actions: 0,
    auto_repair_count: 0, auto_split_count: 0, model_semantic_ambiguity_count: 0,
    preflight_rejection_exposed_to_model_count: 0,
    deterministic_violations_encountered_count: 0,
    deterministic_violations_repaired_count: 0,
    deterministic_violations_unresolved_count: 0,
  };
  // A pre-start event can witness mirror coverage only if it is provably
  // foreign. A run-a-* pre-start rejection instead makes attribution unknown.
  const events = [{ ...valid, operation_id: 'foreign-before-start',
    at: '2026-10-09T23:59:59.000Z' }, { ...valid, ...invalid }];
  const state = {
    document_id: 42, document_instance: { bootstrap_operation_id: 'run-a-create' },
    process_dir: 'processes/classification-process/run-01',
    artistic_throughput: {
      recent_events: events,
      ...(mode === 'archive' ? { archive_sequence: events.length, archive_legacy_history_unverified: false } : {}),
    },
  };
  fs.writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify(state));
  if (mode === 'archive') {
    const archiveDir = path.join(runtime, 'throughput-events');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, '42.jsonl'), events.map((event, index) => {
      const payload = {
        protocol: 'photoshop.guard.throughput_event_archive.v1', document_id: 42,
        sequence: index + 1, document_incarnation: 'run-a-create', event,
      };
      return JSON.stringify({ ...payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') });
    }).join('\n') + '\n');
  }
  return buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope?.throughput;
}

it.each(['archive', 'mirror'] as const)('does not certify unknown event kind in %s', mode => {
  const result = measure(mode, { kind: 'unknown-new-kind' });
  expect(result).toMatchObject({ complete: false, model_visible_guard_round_trips: null,
    rejected_before_dispatch_round_trips: null });
  expect(result?.warning).toMatch(/classification/i);
});

it.each(['archive', 'mirror'] as const)('does not coerce malformed model_visible in %s', mode => {
  const result = measure(mode, { model_visible: 'false' });
  expect(result).toMatchObject({ complete: false, model_visible_guard_round_trips: null,
    rejected_before_dispatch_round_trips: null });
  expect(result?.warning).toMatch(/classification/i);
});

it.each(['archive', 'mirror'] as const)('does not infer missing event classification in %s', mode => {
  const result = measure(mode, { kind: undefined, model_visible: undefined });
  expect(result).toMatchObject({ complete: false, model_visible_guard_round_trips: null,
    rejected_before_dispatch_round_trips: null });
});

it.each(['archive', 'mirror'] as const)('keeps explicitly non-visible known events valid in %s', mode => {
  const result = measure(mode, { model_visible: false });
  expect(result).toMatchObject({ complete: true, model_visible_guard_round_trips: 0,
    rejected_before_dispatch_round_trips: 0 });
});
