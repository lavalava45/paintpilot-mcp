import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildBenchmark } from '../scripts/dev/benchmark-painting-cycles.mjs';
import { throughputArchivePath } from '../src/core/guard/throughput-event-archive.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function measure(mode: 'archive' | 'mirror', operationId: string, at: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-owned-event-window-'));
  roots.push(root);
  const runtime = path.join(root, '.photoshop-runtime', 'controller');
  const operationsDir = path.join(runtime, 'operations');
  const runDir = path.join(root, 'processes', 'owned-window-process', 'run-01');
  fs.mkdirSync(operationsDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(operationsDir, 'run-a-create.json'), JSON.stringify({
    id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'frame.psd') },
    phase: 'completed', created_at: '2026-10-10T00:00:00.000Z',
    completed_at: '2026-10-10T00:01:00.000Z',
  }));
  const event = (id: string, timestamp: string) => ({
    at: timestamp, operation_id: id, kind: 'rejected', model_visible: true,
    semantic_actions: 0, auto_repair_count: 0, auto_split_count: 0,
    model_semantic_ambiguity_count: 0, preflight_rejection_exposed_to_model_count: 0,
    deterministic_violations_encountered_count: 0,
    deterministic_violations_repaired_count: 0,
    deterministic_violations_unresolved_count: 0, violation_accounting: [],
  });
  const events = [
    event('foreign-before-start', '2026-10-09T23:59:58.000Z'),
    event('run-a-create', '2026-10-10T00:00:10.000Z'),
    event(operationId, at),
  ];
  fs.writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
    document_id: 42, document_instance: { bootstrap_operation_id: 'run-a-create' },
    process_dir: 'processes/owned-window-process/run-01',
    artistic_throughput: {
      recent_events: events,
      ...(mode === 'archive' ? { archive_sequence: events.length, archive_legacy_history_unverified: false } : {}),
    },
  }));
  if (mode === 'archive') {
    const file = throughputArchivePath(runtime, 42);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, events.map((row, index) => {
      const payload = { protocol: 'photoshop.guard.throughput_event_archive.v1',
        document_id: 42, sequence: index + 1, document_incarnation: 'run-a-create', event: row };
      return JSON.stringify({ ...payload,
        sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') });
    }).join('\n') + '\n');
  }
  return buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope?.throughput;
}

it.each(['archive', 'mirror'] as const)(
  'does not certify %s counts when a journal-owned event arrives beyond the allowed persistence tail', mode => {
    const result = measure(mode, 'run-a-create', '2026-10-10T00:01:02.000Z');
    expect(result).toMatchObject({ complete: false, model_visible_guard_round_trips: null });
    expect(result?.warning).toMatch(/outside.*window|outside.*tail|time.*inconsistent/i);
  },
);

it.each(['archive', 'mirror'] as const)(
  'does not certify %s counts when a journal-owned event predates the run start', mode => {
    const result = measure(mode, 'run-a-create', '2026-10-09T23:59:59.000Z');
    expect(result).toMatchObject({ complete: false, model_visible_guard_round_trips: null });
  },
);

it.each(['archive', 'mirror'] as const)(
  'keeps a provably foreign late event outside the %s run', mode => {
    expect(measure(mode, 'foreign-late', '2026-10-10T00:01:02.000Z')).toMatchObject({
      complete: true, model_visible_guard_round_trips: 1,
    });
  },
);

it.each(['archive', 'mirror'] as const)(
  'still counts a journal-owned event inside the %s persistence tail', mode => {
    expect(measure(mode, 'run-a-create', '2026-10-10T00:01:00.500Z')).toMatchObject({
      complete: true, model_visible_guard_round_trips: 2,
    });
  },
);
