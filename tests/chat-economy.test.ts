import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { withToolExecutionContext } from '../src/core/execution-context.js';
import { projectGuardDiagnostics } from '../src/core/guard/response-budget.js';
import { installProtocolHandlers } from '../src/core/server-protocol.js';
import { currentToolExecutionContext } from '../src/core/execution-context.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-economy-')); dirs.push(dir);
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: dir, workspaceRoot: dir });
  runtime.store.observeDocumentInstance(42, { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'test', token: 'test:1' });
  runtime.store.updatePaintingState(42, current => ({ ...current, original_brief: 'Preserve cabin lighting and volume. '.repeat(200) }));
  const frame = (name: string, value: number) => {
    const data = Buffer.alloc(16 * 16 * 4, value);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const bytes = jpeg.encode({ data, width: 16, height: 16 }, 80).data;
    const file = path.join(dir, name + '.jpg'); fs.writeFileSync(file, bytes);
    return { sha256: createHash('sha256').update(bytes).digest('hex'), materialized_path: file,
      width: 16, height: 16, canvas_width: 16, canvas_height: 16, document_id: 42 };
  };
  const add = (id: string, preview: ReturnType<typeof frame>, before?: ReturnType<typeof frame>) => {
    runtime.store.write({ id, sequence: 1, phase: 'completed', visual: true, args: { document_id: 42 },
      preview, ...(before ? { before_preview: before } : {}), summary: 'Model one cabin form',
      created_at: new Date().toISOString() });
  };
  const accept = (id: string, sha?: string) => {
    const record = runtime.store.read(id);
    runtime.store.write({ ...record, verdict: { sha256: sha ?? record.preview.sha256, disposition: 'accept', at: new Date().toISOString() } });
  };
  const tool = createGuardTools(runtime).find(t => t.tool.name === 'photoshop_guard_review_image')!;
  const review = async (id: string, context?: string, args = {}) => {
    const result = await withToolExecutionContext(context ? { reviewContextId: context } : {},
      () => tool.handler({ operation_id: id, ...args }));
    const text = result.content.find(x => x.type === 'text')!;
    return { result, body: JSON.parse(text.type === 'text' ? text.text : '{}'),
      images: result.content.filter(x => x.type === 'image') };
  };
  return { runtime, frame, add, accept, review, dir };
}

it('reuses only reviewed same-chat exact BEFORE bytes and the already-observed original brief', async () => {
  const f = fixture(), before = f.frame('before', 80), after = f.frame('after', 130);
  f.add('first', before);
  expect((await f.review('first', 'chat-a')).images).toHaveLength(1);
  f.accept('first'); f.add('second', after, before);
  const next = await f.review('second', 'chat-a');
  expect(next.images).toHaveLength(1);
  expect(next.body.delivery.delivered.find((x: any) => x.role === 'before').reused_from)
    .toMatchObject({ operation_id: 'first', role: 'after', confirmed_observation: true });
  expect(next.body.artistic_review.original_brief_reference).toMatchObject({ operation_id: 'first', already_observed_in_this_chat: true });
  expect(next.body.artistic_review).not.toHaveProperty('original_brief');
  const full = JSON.parse(fs.readFileSync(next.body.diagnostic_projection.full_response_path, 'utf8'));
  expect(full.artistic_review.original_brief).toContain('Preserve cabin');
  expect(f.runtime.store.read('second').visual_delivery.delivered.some((x: any) => x.reused_from?.operation_id === 'first')).toBe(true);
});

it.each(['new-chat', 'unknown', 'force'] as const)('redelivers image and full brief for %s', async mode => {
  const f = fixture(), frame = f.frame('frame', 90); f.add('first', frame);
  await f.review('first', 'chat-a'); f.accept('first');
  if (mode === 'new-chat') await withToolExecutionContext({ reviewContextId: 'chat-b' }, async () => {
    expect(f.runtime.store.visualDeliveryDebt(f.runtime.store.read('first'))).not.toBeNull();
  });
  const next = await f.review('first', mode === 'new-chat' ? 'chat-b' : mode === 'unknown' ? undefined : 'chat-a',
    mode === 'force' ? { force_redelivery: true, redelivery_reason: 'images-unavailable' } : {});
  expect(next.images).toHaveLength(1);
  expect(next.body.artistic_review.original_brief).toContain('Preserve cabin');
});

it.each(['unobserved', 'wrong-verdict-sha'] as const)('does not reuse a merely emitted/unconfirmed image: %s', async mode => {
  const f = fixture(), frame = f.frame('frame', 90); f.add('first', frame);
  await f.review('first', 'chat-a'); if (mode === 'wrong-verdict-sha') f.accept('first', 'wrong');
  f.add('next', frame);
  expect((await f.review('next', 'chat-a')).images).toHaveLength(1);
});

it('rejects a modified cached file and leaves the new role undelivered', async () => {
  const f = fixture(), frame = f.frame('frame', 90); f.add('first', frame);
  await f.review('first', 'chat-a'); f.accept('first'); f.add('next', frame);
  fs.writeFileSync(frame.materialized_path, 'tampered');
  const next = await f.review('next', 'chat-a');
  expect(next.result.isError).toBe(true); expect(next.images).toHaveLength(0);
  expect(next.body.delivery.omitted).toContainEqual({ role: 'after', reason: 'sha256_mismatch' });
  expect(f.runtime.store.read('next').visual_delivery.delivery_complete).toBe(false);
});

it('deduplicates identical roles in one response without a chat id, retaining both exact role proofs', async () => {
  const f = fixture(), frame = f.frame('frame', 90); f.add('same', frame, frame);
  const next = await f.review('same');
  expect(next.images).toHaveLength(1);
  expect(next.body.delivery.delivered.map((x: any) => x.role)).toEqual(['after', 'before']);
  expect(next.body.delivery.delivery_complete).toBe(true);
});

it('keeps a missing new crop as debt even when its whole frame can be reused', async () => {
  const f = fixture(), frame = f.frame('frame', 90), crop = f.frame('crop', 180);
  f.add('first', frame); await f.review('first', 'chat-a'); f.accept('first');
  f.add('next', { ...frame, focus: { ...crop, region: { left: 0, top: 0, right: 8, bottom: 8 } } } as any);
  const partial = await f.review('next', 'chat-a', { roles: ['after'] });
  expect(partial.images).toHaveLength(0); expect(partial.result.isError).toBe(true);
  expect(partial.body.delivery.undelivered_roles).toContain('after_crop');
  const complete = await f.review('next', 'chat-a');
  expect(complete.images).toHaveLength(1); expect(complete.result.isError).toBeUndefined();
});

it('archives routine compatibility/telemetry without dropping execution, targets, next action or deferred work', () => {
  const f = fixture();
  const input = { execution: { phase: 'completed', failed: false, operation_id: 'exact-id' },
    confirmed_targets: { document_id: 42, layer_ids: [7] }, next_state: 'awaiting_visual_review',
    next_required_action: 'Review exact-id', required_user_report: { result_hint: 'Saved exact.psd', compatibility_only: true },
    operation_receipt: { token: 'x'.repeat(1000) }, required_operation_ack: { token: 'x'.repeat(1000) },
    journal_record_path: 'journal.json', cycle_latency: { guard_cycle_total_ms: 1200 },
    compiler_repair_audit: { final_validation: 'valid', repairs: ['x'.repeat(1000)] } };
  const output = projectGuardDiagnostics(input, f.dir) as any;
  expect(output).toMatchObject({ execution: input.execution, confirmed_targets: input.confirmed_targets,
    next_required_action: input.next_required_action, result: { summary: 'Saved exact.psd' } });
  expect(output).not.toHaveProperty('required_user_report'); expect(output).not.toHaveProperty('cycle_latency');
  expect(output).not.toHaveProperty('compiler_repair_audit');
  expect(JSON.parse(fs.readFileSync(output.diagnostic_projection.full_response_path, 'utf8'))).toEqual(input);
  const deferred = { ...input, cycle_latency: { compiler_repair_audit: { final_validation: 'valid', deferred_next_pass: { request_key: 'retry' } } } };
  expect(projectGuardDiagnostics(deferred, f.dir)).toMatchObject({ cycle_latency: deferred.cycle_latency });
  for (const audit of [{ final_validation: 'invalid', repairs: ['rejected'] },
    { final_validation: 'valid', deferred_next_pass: { request_key: 'retry' } }]) {
    expect(projectGuardDiagnostics({ ...input, compiler_repair_audit: audit }, f.dir))
      .toMatchObject({ compiler_repair_audit: audit });
  }
  const failure = { ...input, execution: { ...input.execution, failed: true }, blocking_issue: 'foreign owner' };
  expect(projectGuardDiagnostics(failure, f.dir)).toMatchObject({ blocking_issue: 'foreign owner', operation_receipt: input.operation_receipt });
});

it('MCP binds only host metadata, never a model-authored context argument', async () => {
  let handler: (request: any) => Promise<any> = async () => {};
  let observed: unknown;
  installProtocolHandlers({ server: { setRequestHandler(schema: any, callback: any) {
    if (schema.shape.method.value === 'tools/call') handler = callback;
  } }, tools: { async execute() { observed = currentToolExecutionContext(); return { content: [] }; } },
    guard: { runtimeDirectory: '/unused' }, prompts: {}, lease: {},
  } as any);
  for (const context of ['chat-a', undefined, ' '.repeat(300)]) {
    await handler({ params: { name: 'photoshop_guard_review_image', arguments: { reviewContextId: 'forged' },
      _meta: { 'paintpilot/review-context': context, photoshop_mcp_deadline_at: 12345 } } });
    expect(observed).toEqual({ deadlineAt: 12345, ...(context === 'chat-a' ? { reviewContextId: 'chat-a' } : {}) });
  }
});

it('does not reuse a cached image while document identity is quarantined', async () => {
  const f = fixture(), frame = f.frame('frame', 90); f.add('first', frame);
  await f.review('first', 'chat-a'); f.accept('first');
  f.runtime.store.observeDocumentInstance(42, { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'restarted', token: 'restarted:1' });
  f.add('next', frame);
  expect((await f.review('next', 'chat-a')).images).toHaveLength(1);
});

it('reuses the same delivered operation before verdict without claiming observation; explicit force is bounded', async () => {
  const f = fixture(), frame = f.frame('unobserved-same', 100); f.add('same', frame);
  await f.review('same', 'chat-a');
  const reused = await f.review('same', 'chat-a');
  expect(reused.images).toHaveLength(0);
  expect(reused.body.delivery.delivered[0].reused_from).toMatchObject({ confirmed_delivery: true, confirmed_observation: false });
  expect(f.runtime.store.read('same')).not.toHaveProperty('verdict');
  const unjustified = await f.review('same', 'chat-a', { force_redelivery: true });
  expect(unjustified.body.code).toBe('guard_review_redelivery_reason_required');
  const forced = await f.review('same', 'chat-a', { force_redelivery: true, redelivery_reason: 'images-unavailable' });
  expect(forced.images).toHaveLength(1);
  const repeated = await f.review('same', 'chat-a', { force_redelivery: true, redelivery_reason: 'images-unavailable' });
  expect(repeated.images).toHaveLength(0); expect(repeated.body.code).toBe('guard_review_repeated_forced_delivery');
  expect((await f.review('same', 'chat-b', { force_redelivery: true, redelivery_reason: 'images-unavailable' })).images).toHaveLength(1);
});
