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
type Case = 'completion-before-creation' | 'response-before-creation' | 'valid';

function measure(mode: Mode, boundaryCase: Case) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-start-markers-'));
  roots.push(root);
  const runtime = path.join(root, '.photoshop-runtime', 'controller');
  const operationsDir = path.join(runtime, 'operations');
  const runDir = path.join(root, 'processes', 'start-marker-process', 'run-01');
  fs.mkdirSync(operationsDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });

  const journal = {
    id: 'run-a-visual', visual: true, tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42, path: path.join(runDir, 'frame.psd') },
    phase: 'completed',
    latency: {
      cycle_received_at: '2026-10-10T00:00:00.000Z',
      ...(boundaryCase === 'response-before-creation'
        ? { response_ready_at: '2026-10-10T00:00:20.000Z' } : {}),
    },
    created_at: '2026-10-10T00:00:40.000Z',
    completed_at: boundaryCase === 'completion-before-creation'
      ? '2026-10-10T00:00:20.000Z' : '2026-10-10T00:01:00.000Z',
  };
  fs.writeFileSync(path.join(operationsDir, `${journal.id}.json`), JSON.stringify(journal));

  const event = {
    at: '2026-10-10T00:00:50.000Z', operation_id: journal.id,
    kind: 'rejected', model_visible: true, semantic_actions: 0,
    auto_repair_count: 0, auto_split_count: 0,
    model_semantic_ambiguity_count: 0, preflight_rejection_exposed_to_model_count: 0,
    deterministic_violations_encountered_count: 0,
    deterministic_violations_repaired_count: 0,
    deterministic_violations_unresolved_count: 0, violation_accounting: [],
  };
  fs.writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
    document_id: 42, document_instance: { bootstrap_operation_id: journal.id },
    process_dir: 'processes/start-marker-process/run-01',
    artistic_throughput: {
      recent_events: [event],
      ...(mode === 'archive' ? { archive_sequence: 1, archive_legacy_history_unverified: false } : {}),
    },
  }));
  if (mode === 'archive') {
    const file = throughputArchivePath(runtime, 42);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = {
      protocol: 'photoshop.guard.throughput_event_archive.v1', document_id: 42,
      sequence: 1, document_incarnation: journal.id, event,
    };
    fs.writeFileSync(file, JSON.stringify({
      ...payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    }) + '\n');
  }
  return buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope;
}

it.each(['archive', 'mirror'] as const)(
  'refuses %s exact counters when completed_at predates created_at despite earlier cycle_received_at', mode => {
    const scope = measure(mode, 'completion-before-creation');
    expect(scope?.throughput).toMatchObject({ complete: false, model_visible_guard_round_trips: null });
    expect(scope?.boundaries.wall_ms).toBeNull();
  },
);

it.each(['archive', 'mirror'] as const)(
  'refuses %s exact counters when response_ready_at predates created_at despite earlier cycle_received_at', mode => {
    const scope = measure(mode, 'response-before-creation');
    expect(scope?.throughput).toMatchObject({ complete: false, model_visible_guard_round_trips: null });
    expect(scope?.boundaries.wall_ms).toBeNull();
  },
);

it.each(['archive', 'mirror'] as const)(
  'keeps %s exact counters when both start markers precede all completion markers', mode => {
    expect(measure(mode, 'valid')?.throughput).toMatchObject({
      complete: true, model_visible_guard_round_trips: 1,
    });
  },
);
