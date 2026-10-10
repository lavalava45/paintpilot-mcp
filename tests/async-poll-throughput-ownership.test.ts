import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createJob, updateJob, writeJobStarted } from '../src/core/guard/async-job.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'async-poll-ownership-'));
  roots.push(root);
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), {
    workspaceRoot: root, runtimeDirectory: path.join(root, 'controller'),
    previewBarrierDirectory: path.join(root, 'barriers'),
    executionLeaseFile: path.join(root, 'execution.lock'), processVideoTraceEnabled: false,
  });
  const job = createJob(runtime.runtimeDirectory, {
    previous_operation_id: 'another-run-previous-operation',
    next_pass: { document_id: 42 },
    next_operation: { id: 'run-a-current-operation', args: { document_id: 42 } },
  }, {});
  return { runtime, job };
}

it('attributes each async poll to its durable reserved operation, not a previous-operation continuation', () => {
  const { runtime, job } = fixture();
  updateJob(job.dir, { operation_id: 'run-a-current-operation' });
  runtime.pollJob(job.jobId); // Starting jobs can be polled before started.json exists.
  writeJobStarted(job.dir, { operation_id: 'run-a-current-operation' });
  runtime.pollJob(job.jobId);
  const events = runtime.store.artisticThroughputMetrics(42).recent_events;
  expect(events).toHaveLength(2);
  expect(events).toEqual([
    expect.objectContaining({ kind: 'bookkeeping', operation_id: 'run-a-current-operation', job_id: job.jobId }),
    expect.objectContaining({ kind: 'bookkeeping', operation_id: 'run-a-current-operation', job_id: job.jobId }),
  ]);
  expect(events.every((event: any) => event.operation_id !== 'another-run-previous-operation')).toBe(true);
});

it('does not invent run ownership for legacy or conflicting job metadata', () => {
  const { runtime, job } = fixture();
  runtime.pollJob(job.jobId); // Legacy job has no persisted operation id.
  writeJobStarted(job.dir, { operation_id: 'different-operation' });
  updateJob(job.dir, { operation_id: 'run-a-current-operation' });
  runtime.pollJob(job.jobId);
  const events = runtime.store.artisticThroughputMetrics(42).recent_events;
  expect(events).toHaveLength(2);
  expect(events.every((event: any) => !Object.hasOwn(event, 'operation_id'))).toBe(true);
  expect(events.every((event: any) => event.job_id === job.jobId)).toBe(true);
});
