import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'cycle-auto-telemetry-'));
  roots.push(root);
  return new EmbeddedGuardRuntime(new ToolRegistry(), {
    workspaceRoot: root, runtimeDirectory: path.join(root, 'controller'),
    previewBarrierDirectory: path.join(root, 'barriers'),
    executionLeaseFile: path.join(root, 'execution.lock'), processVideoTraceEnabled: false,
  });
}

const request = { next_pass: { document_id: 42, request_key: 'telemetry-attempt' } };

it('preserves a completed Guard result when throughput persistence fails, without fabricating a rejection', async () => {
  const runtime = fixture();
  vi.spyOn(runtime, 'cycle').mockResolvedValueOnce({ ok: true, next_state: 'terminal_not_executed' } as any);
  const throughput = vi.spyOn(runtime.store, 'recordArtisticThroughputEvent')
    .mockImplementationOnce(() => { throw new Error('simulated-throughput-write-failure'); });
  const result = await runtime.cycleAuto(request) as any;
  expect(result).toMatchObject({ ok: true, next_state: 'terminal_not_executed',
    throughput_accounting_integrity: { status: 'unverified', reasons: ['artistic_throughput_event_write_failed'] } });
  expect(throughput).toHaveBeenCalledOnce();
  expect(runtime.store.artisticThroughputMetrics(42).recent_events).toHaveLength(0);
});

it('does not double-count a successful cycle when the separate compiler-attempt audit fails', async () => {
  const runtime = fixture();
  vi.spyOn(runtime, 'cycle').mockResolvedValueOnce({ ok: true, next_state: 'terminal_not_executed' } as any);
  vi.spyOn(runtime.store, 'recordCompilerAttemptAudit')
    .mockImplementationOnce(() => { throw new Error('simulated-audit-write-failure'); });
  const result = await runtime.cycleAuto(request) as any;
  expect(result).toMatchObject({ ok: true,
    throughput_accounting_integrity: { status: 'unverified', reasons: ['compiler_attempt_audit_write_failed'] } });
  const events = runtime.store.artisticThroughputMetrics(42).recent_events;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ kind: 'semantic-dispatch', model_visible: true, semantic_actions: 0 });
  expect(runtime.store.artisticThroughputMetrics(42).rejected_before_dispatch_round_trips).toBe(0);
});

it('does not invent zero dispatched actions when the durable operation receipt cannot be read', async () => {
  const runtime = fixture();
  vi.spyOn(runtime, 'cycle').mockResolvedValueOnce({ ok: true, operation_id: 'proven-operation' } as any);
  const originalRead = runtime.store.read.bind(runtime.store);
  vi.spyOn(runtime.store, 'read').mockImplementation((id: string) => {
    if (id === 'proven-operation') throw new Error('simulated-receipt-read-failure');
    return originalRead(id);
  });
  const result = await runtime.cycleAuto({ next_pass: { document_id: 42 } }) as any;
  expect(result).toMatchObject({ ok: true,
    throughput_accounting_integrity: { status: 'unverified', reasons: ['throughput_record_read_failed'] } });
  expect(runtime.store.artisticThroughputMetrics(42).recent_events).toHaveLength(0);
});

it('preserves the original Guard failure if rejection-counter persistence also fails', async () => {
  const runtime = fixture();
  const original = new Error('original-guard-cycle-failure');
  vi.spyOn(runtime, 'cycle').mockRejectedValueOnce(original);
  const throughput = vi.spyOn(runtime.store, 'recordArtisticThroughputEvent')
    .mockImplementationOnce(() => { throw new Error('simulated-throughput-write-failure'); });
  await expect(runtime.cycleAuto(request)).rejects.toBe(original);
  expect(throughput).toHaveBeenCalledOnce();
});
