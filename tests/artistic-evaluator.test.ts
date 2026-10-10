import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { LocalArtisticEvaluator, artisticEvaluationFingerprint, type ArtisticEvaluationRequest } from '../src/core/guard/artistic-evaluator.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { VISUAL_MICROPLAN_STAGES } from '../src/core/visual-microplan-compiler.js';

const dirs: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const assessment = { goal: 'unmet', task: 'uncertain', stage: 'not-ready', finish: 'unsatisfied', observations: ['Flat faceted cup'], deficits: [{ scope: 'goal', visible: 'No rounded volume' }], next_change: 'Build a continuous light-to-shadow turn.' };
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artistic-evaluator-')); dirs.push(dir);
  const file = path.join(dir, 'frame.jpg');
  fs.writeFileSync(file, jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }).data);
  const request: ArtisticEvaluationRequest = {
    operationId: 'pass', documentId: 42, stage: 'FORM', goal: 'Build rounded volume',
    originalBrief: 'Realistic rounded white cup', language: 'ru',
    frame: { path: file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') },
  };
  return { dir, file, request };
}
function response(value: unknown = assessment) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
}

it('isolates pixels/brief from painter claims, coalesces exact review and invalidates changed brief/stage/files', async () => {
  const { file, request } = fixture();
  request.focusFrame = { ...request.frame, region: { left: 0, top: 0, right: 2, bottom: 2 } };
  const provider = vi.fn(async () => response());
  const evaluator = new LocalArtisticEvaluator({ fetch: provider });
  await Promise.all([evaluator.evaluate({ ...request, painter_claim: 'already photorealistic' } as ArtisticEvaluationRequest), evaluator.evaluate(request)]);
  expect(provider).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(provider.mock.calls[0]![1]!.body as string);
  expect(JSON.stringify(payload)).not.toContain('already photorealistic');
  expect(payload.messages).toHaveLength(2);
  expect(payload.messages[1].content.filter((item: any) => item.type === 'image_url')).toHaveLength(2);
  expect(await evaluator.evaluate(request)).toMatchObject({ status: 'completed', assessment });
  await evaluator.evaluate({ ...request, originalBrief: 'Intentional flat poster' });
  await evaluator.evaluate({ ...request, stage: 'DETAIL' });
  expect(provider).toHaveBeenCalledTimes(3);
  fs.writeFileSync(file, 'tampered');
  expect(await evaluator.evaluate(request)).toMatchObject({ status: 'invalid' });
  expect(provider).toHaveBeenCalledTimes(3);
});

it('never certifies malformed, contradictory, unavailable or brief-less judgments', async () => {
  const { request } = fixture();
  const invalid = new LocalArtisticEvaluator({ fetch: vi.fn(async () => response({ ...assessment, finish: 'satisfied' })) });
  expect(await invalid.evaluate(request)).toMatchObject({ status: 'invalid' });
  const contradiction = new LocalArtisticEvaluator({ fetch: vi.fn(async () => response({ ...assessment, goal: 'met' })) });
  expect(await contradiction.evaluate(request)).toMatchObject({ status: 'completed', assessment: { goal: 'unmet' } });
  const failedProvider = vi.fn(async () => { throw new Error('provider offline'); });
  const offline = new LocalArtisticEvaluator({ fetch: failedProvider });
  expect(await offline.evaluate(request)).toMatchObject({ status: 'unavailable' });
  await offline.evaluate({ ...request, stage: 'DETAIL' });
  expect(failedProvider).toHaveBeenCalledTimes(1);
  const timedOut = new LocalArtisticEvaluator({ timeoutMs: 5,
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }),
  });
  expect(await timedOut.evaluate(request)).toMatchObject({ status: 'unavailable', reason: 'timeout' });
  const noBrief = new LocalArtisticEvaluator({ fetch: vi.fn(async () => response({ ...assessment, goal: 'met', finish: 'satisfied', deficits: [] })) });
  expect(await noBrief.evaluate({ ...request, originalBrief: undefined })).toMatchObject({ assessment: { finish: 'uncertain' } });
});

it('requests same-chat pixel review at all stages without calling or preparing a separate evaluator', async () => {
  const { dir, request } = fixture();
  const evaluate = vi.fn(async (r: ArtisticEvaluationRequest) => ({
    protocol: 'photoshop.guard.artistic_evaluator.v1' as const, status: 'completed' as const,
    operation_id: r.operationId, document_id: r.documentId, frame_sha256: r.frame.sha256,
    stage: r.stage, request_fingerprint: artisticEvaluationFingerprint(r), evaluator: 'isolated-test', independent: true,
    duration_ms: 1, assessment: assessment as any,
  }));
  const prepare = vi.fn(async () => {});
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: path.join(dir, 'runtime'),
    previewBarrierDirectory: path.join(dir, 'barriers'), executionLeaseFile: path.join(dir, 'lease'),
    workspaceRoot: dir, artisticEvaluator: { evaluate, prepare } });
  runtime.ensureRuntimeDirectories();
  runtime.artRun({ document_id: 42, process_dir: 'processes/review-process/run-01', original_brief: request.originalBrief });
  runtime.store.setUserConfig({ language: 'ru' }, 42);
  runtime.store.updatePaintingState(42, (state: any) => ({ ...state,
    independent_artistic_evaluation: { status: 'unavailable', reason: 'old timeout' } }));
  const review = createGuardTools(runtime).find(tool => tool.tool.name === 'photoshop_guard_review_image')!;
  for (const stage of [...VISUAL_MICROPLAN_STAGES, 'FINAL_SELECTION']) {
    const id = `pass-${stage}`;
    runtime.store.write({ id, visual: true, phase: 'completed', created_at: new Date().toISOString(), stage, summary: request.goal,
      args: { document_id: 42 }, preview: { document_id: 42, materialized_path: request.frame.path,
        sha256: request.frame.sha256, mime_type: 'image/jpeg', width: 2, height: 2 } });
    const result = await review.handler({ operation_id: id });
    const body = JSON.parse((result.content[0] as any).text);
    expect(body.independent_artistic_evaluation).toBeUndefined();
    expect(body.artistic_continuation.independent_artistic_evaluation).toBeUndefined();
    expect(body.artistic_review).toMatchObject({ mode: 'same_chat', status: 'awaiting_host_observation',
      stage, original_brief: request.originalBrief, pass_goal: request.goal, after_sha256: request.frame.sha256 });
    expect(body.artistic_review.instruction).toContain('форме, пропорциях, перспективе');
    expect(body.artistic_review.instruction).toContain('при повторном провале меняй построение');
    expect(body.next_required_action).toContain('largest visible defect');
    expect(result.content.filter(item => item.type === 'image')).toHaveLength(1);
    expect(runtime.store.read(id).verdict).toBeUndefined();
    await review.handler({ operation_id: id });
  }
  runtime.store.setUserConfig({ language: 'en' }, 42);
  runtime.store.updatePaintingState(42, (state: any) => ({ ...state, original_brief: 'Intentional flat poster' }));
  const english = await review.handler({ operation_id: 'pass-FORM' });
  const body = JSON.parse((english.content[0] as any).text);
  expect(body.artistic_review.original_brief).toBe('Intentional flat poster');
  expect(body.artistic_review.instruction).toContain('intended style');
  expect(evaluate).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
});

it('discards results bound to another frame or operation rather than admitting a foreign judgment', async () => {
  const { dir, request } = fixture();
  const evaluator = new LocalArtisticEvaluator({ fetch: vi.fn(async () => response()) });
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: path.join(dir, 'runtime'),
    previewBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir,
    artisticEvaluator: { evaluate: async r => ({ ...await evaluator.evaluate(r), operation_id: 'foreign' }) } });
  runtime.ensureRuntimeDirectories();
  runtime.store.write({ id: 'pass', visual: true, phase: 'completed', created_at: new Date().toISOString(), stage: 'FORM', summary: request.goal,
    args: { document_id: 42 }, preview: { document_id: 42, materialized_path: request.frame.path, sha256: request.frame.sha256 } });
  expect(await runtime.evaluateArtisticOperation('pass')).toBeNull();
  expect(runtime.store.applyArtisticEvaluation('pass', { target_resolved: 'yes' })).toMatchObject({ target_resolved: 'uncertain' });
});

it('measures review after receipt persistence without another write; restart before flush exposes only a prefix', async () => {
  const { dir, request } = fixture();
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: path.join(dir, 'runtime'), workspaceRoot: dir });
  runtime.ensureRuntimeDirectories();
  runtime.store.write({ id: 'timed', visual: true, phase: 'completed', created_at: new Date().toISOString(),
    args: { document_id: 42 }, latency: {}, preview: { document_id: 42,
      materialized_path: request.frame.path, sha256: request.frame.sha256, mime_type: 'image/jpeg', width: 2, height: 2 } });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T00:00:00.000Z'));
  const write = runtime.store.write.bind(runtime.store);
  const writes = vi.spyOn(runtime.store, 'write').mockImplementation((record: any) => {
    write(record);
    vi.setSystemTime(Date.now() + 250);
  });
  const review = createGuardTools(runtime).find(t => t.tool.name === 'photoshop_guard_review_image')!;
  const result = await review.handler({ operation_id: 'timed' });
  const body = JSON.parse((result.content[0] as any).text);
  expect(body.delivery.timing.result_ready_at).toBe('2026-10-05T00:00:00.250Z');
  expect(body.delivery.timing.response_boundary_complete).toBe(true);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(runtime.store.read('timed').latency.review_image_service_ms).toBe(250);
  const restart = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: runtime.runtimeDirectory, workspaceRoot: dir });
  expect(restart.store.read('timed').latency).toMatchObject({ review_image_service_ms: null, review_image_service_prefix_ms: 0 });
  const prefix = restart.store.continuationTimelineExport(42).operations[0];
  expect(prefix.boundary_events).toContainEqual({ kind: 'review_image_service_prefix_end', at: '2026-10-05T00:00:00.000Z' });
  expect(prefix.boundary_events.some((event: any) => event.kind === 'review_image_result_ready')).toBe(false);
  const record = runtime.store.read('timed');
  runtime.store.write(record); // the next ordinary journal write persists the observed endpoint
  expect(restart.store.read('timed').latency.review_image_service_ms).toBe(250);
  expect(restart.store.records()[0].continuation_timing.review_image_response_boundary_complete).toBe(true);
});
