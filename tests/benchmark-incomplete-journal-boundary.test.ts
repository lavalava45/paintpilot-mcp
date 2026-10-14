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
type BoundaryCase = 'missing-end' | 'missing-start' | 'nonterminal' | 'complete';

function measure(mode: Mode, boundaryCase: BoundaryCase) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-incomplete-journal-'));
  roots.push(root);
  const runtime = path.join(root, '.photoshop-runtime', 'controller');
  const operationsDir = path.join(runtime, 'operations');
  const runDir = path.join(root, 'processes', 'journal-boundary-process', 'run-01');
  fs.mkdirSync(operationsDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  const journal: Record<string, unknown> = {
    id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'frame.psd') },
    phase: boundaryCase === 'nonterminal' ? 'dispatched' : 'completed',
    created_at: '2026-10-10T00:00:00.000Z',
    completed_at: boundaryCase === 'missing-end' ? undefined : '2026-10-10T00:01:00.000Z',
  };
  fs.writeFileSync(path.join(operationsDir, 'run-a-create.json'), JSON.stringify(journal));
  if (boundaryCase === 'missing-start') {
    fs.writeFileSync(path.join(operationsDir, 'run-a-later.json'), JSON.stringify({
      id: 'run-a-later', args: { document_id: 42 }, phase: 'completed',
      completed_at: '2026-10-10T00:00:40.000Z',
      // Its start is unknown; the other journal cannot prove the whole run's start.
    }));
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
    event('run-a-create', boundaryCase === 'missing-end'
      ? '2026-10-10T00:00:00.000Z' : '2026-10-10T00:00:10.000Z'),
  ];
  fs.writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
    document_id: 42, document_instance: { bootstrap_operation_id: 'run-a-create' },
    process_dir: 'processes/journal-boundary-process/run-01',
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
        sequence: index + 1, document_incarnation: 'run-a-create', event: row,
      };
      return JSON.stringify({ ...payload,
        sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') });
    }).join('\n') + '\n');
  }
  return buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope;
}

it.each(['archive', 'mirror'] as const)(
  'does not certify %s run totals when the only journal has no completion timestamp', mode => {
    const scope = measure(mode, 'missing-end');
    expect(scope?.throughput).toMatchObject({ available: true, complete: false, model_visible_guard_round_trips: null });
    expect(scope?.warnings.join(' ')).toMatch(/journal.*(boundary|timestamp|incomplete)/i);
  },
);

it.each(['archive', 'mirror'] as const)(
  'does not certify %s run totals when a selected journal has no start timestamp', mode => {
    const scope = measure(mode, 'missing-start');
    expect(scope?.throughput).toMatchObject({ available: true, complete: false, model_visible_guard_round_trips: null });
  },
);

it.each(['archive', 'mirror'] as const)(
  'does not certify %s run totals while a selected journal is nonterminal', mode => {
    const scope = measure(mode, 'nonterminal');
    expect(scope?.throughput).toMatchObject({ available: true, complete: false, model_visible_guard_round_trips: null });
  },
);

it.each(['archive', 'mirror'] as const)(
  'retains exact %s totals for a fully completed and bounded journal', mode => {
    expect(measure(mode, 'complete')?.throughput).toMatchObject({
      complete: true, model_visible_guard_round_trips: 1,
    });
  },
);
