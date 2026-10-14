import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBenchmark } from '../scripts/dev/benchmark-painting-cycles.mjs';
import { throughputArchivePath } from '../src/core/guard/throughput-event-archive.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

type Mode = 'archive' | 'mirror';
type Case = 'inverted-completed' | 'inverted-response-ready' | 'valid';

function measure(mode: Mode, boundaryCase: Case) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-inverted-journal-'));
  roots.push(root);
  const runtime = path.join(root, '.photoshop-runtime', 'controller');
  const operationsDir = path.join(runtime, 'operations');
  const runDir = path.join(root, 'processes', 'inverted-journal-process', 'run-01');
  fs.mkdirSync(operationsDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });

  const goodJournal = {
    id: 'run-a-good', args: { document_id: 42, path: path.join(runDir, 'frame.psd') },
    phase: 'completed', created_at: '2026-10-10T00:00:00.000Z',
    completed_at: '2026-10-10T00:02:00.000Z',
  };
  const badJournal = {
    id: 'run-a-other', args: { document_id: 42 }, phase: 'completed',
    created_at: '2026-10-10T00:01:00.000Z',
    completed_at: boundaryCase === 'inverted-completed'
      ? '2026-10-10T00:00:30.000Z' : '2026-10-10T00:01:30.000Z',
    latency: boundaryCase === 'inverted-response-ready'
      ? { response_ready_at: '2026-10-10T00:00:30.000Z' } : undefined,
  };
  for (const journal of [goodJournal, badJournal]) {
    fs.writeFileSync(path.join(operationsDir, `${journal.id}.json`), JSON.stringify(journal));
  }

  const event = (operationId: string, at: string) => ({
    at, operation_id: operationId, kind: 'rejected', model_visible: true,
    semantic_actions: 0, auto_repair_count: 0, auto_split_count: 0,
    model_semantic_ambiguity_count: 0, preflight_rejection_exposed_to_model_count: 0,
    deterministic_violations_encountered_count: 0,
    deterministic_violations_repaired_count: 0,
    deterministic_violations_unresolved_count: 0, violation_accounting: [],
  });
  const events = [
    event('foreign-before-start', '2026-10-09T23:59:58.000Z'),
    event('run-a-good', '2026-10-10T00:01:00.000Z'),
  ];
  fs.writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
    document_id: 42, document_instance: { bootstrap_operation_id: 'run-a-good' },
    process_dir: 'processes/inverted-journal-process/run-01',
    artistic_throughput: {
      recent_events: events,
      ...(mode === 'archive' ? { archive_sequence: events.length, archive_legacy_history_unverified: false } : {}),
    },
  }));
  if (mode === 'archive') {
    const file = throughputArchivePath(runtime, 42);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, events.map((row, index) => {
      const payload = {
        protocol: 'photoshop.guard.throughput_event_archive.v1', document_id: 42,
        sequence: index + 1, document_incarnation: 'run-a-good', event: row,
      };
      return JSON.stringify({ ...payload,
        sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') });
    }).join('\n') + '\n');
  }
  return buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope;
}

it.each(['archive', 'mirror'] as const)(
  'does not certify %s totals when one selected journal completed before its own start', mode => {
    const scope = measure(mode, 'inverted-completed');
    expect(scope?.throughput).toMatchObject({ complete: false, model_visible_guard_round_trips: null });
    expect(scope?.warnings.join(' ')).toMatch(/journal.*(chronolog|timestamp|boundar)/i);
  },
);

it.each(['archive', 'mirror'] as const)(
  'does not certify %s totals when one selected response-ready timestamp precedes its start', mode => {
    const scope = measure(mode, 'inverted-response-ready');
    expect(scope?.throughput).toMatchObject({ complete: false, model_visible_guard_round_trips: null });
  },
);

it.each(['archive', 'mirror'] as const)(
  'preserves exact %s totals when every selected journal has valid chronology', mode => {
    expect(measure(mode, 'valid')?.throughput).toMatchObject({
      complete: true, model_visible_guard_round_trips: 1,
    });
  },
);
