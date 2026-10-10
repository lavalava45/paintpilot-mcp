import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { sanitizeModelFacingToolResult } from '../src/core/model-facing-tool-result.js';
import os from 'node:os';
import path from 'node:path';
import { serializeGuardState, GUARD_STATE_RESPONSE_MAX_BYTES } from '../src/core/guard/response-budget.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-budget-')); dirs.push(dir); return dir; }

it('bounds UTF-8 status without losing exact review, recovery, checkpoint or active owner bindings', () => {
  const dir = fixture();
  const binding = { hypothesis_id: 'mug', layer_id: 7, geometry_binding: { owner_id: 'mug', revision: 8 } };
  const doc = { document_id: 42, current_frame: { operation_id: 'paint', sha256: 'exact', path: 'frame.jpg' },
    accepted_frame: { operation_id: 'before', sha256: 'before-exact' }, visual_barrier: { operation_id: 'paint' },
    checkpoint_due_before_next_visual_mutation: true, active_problem: 'mug', logical_layer_owners: [binding],
    next_required_action: 'Review paint', scene_geometry_model: { rationale: 'геометрия'.repeat(20_000) } };
  const input = { next_required_action: 'Review paint', documents: { '42': doc },
    pending_visual_verdict_details: [{ operation_id: 'paint', sha256: 'exact', crop: { left: 1, top: 2, right: 3, bottom: 4 } }],
    uncertain: ['recover'], last_checkpoint: { path: 'checkpoint.psd' } };
  const before = JSON.stringify(input);
  const text = serializeGuardState(input, dir, 'status');
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(GUARD_STATE_RESPONSE_MAX_BYTES);
  const body = JSON.parse(text);
  const { scene_geometry_model: ignored, ...required } = doc;
  expect(body.documents['42']).toMatchObject(required);
  expect(body.documents['42']).not.toHaveProperty('scene_geometry_model');
  expect(body.documents['42'].logical_layer_owners).toEqual([binding]);
  expect(body.pending_visual_verdict_details).toEqual(input.pending_visual_verdict_details);
  expect(body.uncertain).toEqual(['recover']);
  expect(JSON.parse(fs.readFileSync(body.response_budget.full_projection_path, 'utf8'))).toEqual(input);
  expect(JSON.stringify(input)).toBe(before);
  const small = { next_required_action: 'ready', documents: {} };
  expect(serializeGuardState(small, dir, 'status')).toBe(JSON.stringify(small));
  expect(fs.readdirSync(path.join(dir, 'projections'))).toHaveLength(1);
});

it('public status/resume budget large histories; impossible required context is explicit, never silently clipped', async () => {
  const dir = fixture();
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: dir, workspaceRoot: dir });
  const docs = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i + 1), {
    document_id: i + 1, next_required_action: i === 41 ? 'poll exact-job' : 'ready',
    logical_layer_owners: [{ hypothesis_id: `owner-${i}`, layer_id: i + 1, geometry_binding: { anchors: 'x'.repeat(1000) } }],
  }]));
  const status = { next_required_action: 'poll exact-job', documents: docs,
    active_jobs: [{ job_id: 'exact-job', document_id: 42, poll_command: 'poll exact-job' }] };
  vi.spyOn(runtime, 'statusWithCapabilitySnapshots').mockResolvedValue(status);
  vi.spyOn(runtime, 'resume').mockReturnValue({ document: docs['42'], next_required_action: 'poll exact-job',
    active_job: status.active_jobs[0], delivered_preview: { sha256: 'exact', materialized_path: 'frame.jpg' },
    guard_capabilities: { catalog: Array(1000).fill('capability'.repeat(100)) } });
  for (const name of ['photoshop_guard_status', 'photoshop_guard_resume']) {
    const result = await createGuardTools(runtime).find(t => t.tool.name === name)!.handler({});
    const text = (result.content[0] as { text: string }).text;
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(GUARD_STATE_RESPONSE_MAX_BYTES);
    const body = JSON.parse(text);
    expect(body.next_required_action).toBe('poll exact-job');
    expect((body.documents?.['42'] ?? body.document).document_id).toBe(42);
    expect(body.active_job ?? body.active_jobs[0]).toEqual(status.active_jobs[0]);
  }
  const huge = serializeGuardState({ next_required_action: 'ready', current_operation_id: 'важный'.repeat(10_000) }, dir, 'resume');
  const failure = JSON.parse(huge);
  expect(failure.ok).toBe(false);
  expect(failure.code).toBe('guard_state_projection_requires_public_resume');
  expect(failure.next_required_action).toContain('projection=recovery');
  expect(failure.next_required_action).not.toContain('Read the full_projection_path');
  expect(failure.response_budget.required_context_omitted).toBe(true);
  expect(Buffer.byteLength(huge)).toBeLessThanOrEqual(GUARD_STATE_RESPONSE_MAX_BYTES);
  expect(fs.readFileSync(failure.response_budget.full_projection_path, 'utf8')).toContain('важный'.repeat(10_000));
});


function publicBody(name: string, result: Awaited<ReturnType<ReturnType<typeof createGuardTools>[number]['handler']>>) {
  const sanitized = sanitizeModelFacingToolResult(name, result);
  const text = (sanitized.content[0] as { text: string }).text;
  const body = JSON.parse(text);
  delete body.estimated_context_bytes;
  delete body.context_warning;
  return { body, text };
}

function fullArchive(body: Record<string, any>) {
  const reference = body.diagnostic_projection;
  const text = fs.readFileSync(reference.full_response_path, 'utf8');
  expect(createHash('sha256').update(text).digest('hex')).toBe(reference.full_response_sha256);
  expect(reference.diagnostics_only).toBe(true);
  return JSON.parse(text);
}

it('keeps the final status text within budget after sanitization, including a boundary-sized response', () => {
  const dir = fixture();
  const owners = Array.from({ length: 140 }, (_, i) => ({
    owner_id: 'reeds-' + i, layer_id: i + 1,
    geometry_binding: { revision: 7, model_id: 'exact-model', sha256: 'exact-sha' },
  }));
  const input = { next_required_action: 'Review exact-operation', review_token: 'exact-token',
    document: { document_incarnation_id: 'exact-incarnation', logical_layer_owners: owners }, padding: '' };
  expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(GUARD_STATE_RESPONSE_MAX_BYTES);
  expect(Buffer.byteLength(JSON.stringify(input, null, 2))).toBeGreaterThan(GUARD_STATE_RESPONSE_MAX_BYTES);
  for (const boundary of [false, true]) {
    if (boundary) input.padding = 'x'.repeat(GUARD_STATE_RESPONSE_MAX_BYTES - Buffer.byteLength(JSON.stringify(input)));
    const serialized = serializeGuardState(input, dir, 'status');
    const { body, text } = publicBody('photoshop_guard_status', { content: [{ type: 'text', text: serialized }] });
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(GUARD_STATE_RESPONSE_MAX_BYTES);
    expect(body).toEqual(input);
  }
});

it('public set_art_run archives only diagnostic histories and preserves every other artistic and safety field', async () => {
  const dir = fixture();
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: dir, workspaceRoot: dir });
  const input = { ok: true, art_run: { document: {
    document_id: 42, document_incarnation_id: 'exact-incarnation', original_brief: 'A richly painted wanderer in reeds',
    process_dir: 'processes/run-02', visual_problems: [{ problem_id: 'depth', required: true }],
    owner_representation_state: { reeds: { layer_id: 7, geometry_binding: { revision: 8 } } },
    brief_debt_overrides: [], priority_review_required: true, last_critique: { quality: 'needs-depth' },
    physical_stack_check: { required: true }, cumulative_trend_guard: { regression: true },
    recognition_metrics: { score: 0.7 }, current_frame: { sha256: 'exact-sha', path: 'exact.jpg' },
    workflow_metrics: { timings: 'x'.repeat(30_000) }, artistic_throughput: { recent_events: 'y'.repeat(30_000) },
    compiler_attempt_audit: { recent_attempts: 'z'.repeat(30_000) },
  } }, paint_readiness: { ready: false, blockers: ['brush-witness'] },
    capability_snapshot: { revision: 'exact-revision', supported_semantic_methods: ['paint-dabs'] }, next: 'Resolve depth' };
  const original = structuredClone(input);
  vi.spyOn(runtime, 'artRunWithCapabilitySnapshot').mockResolvedValue(input);
  const name = 'photoshop_guard_set_art_run';
  const result = await createGuardTools(runtime).find(t => t.tool.name === name)!.handler({ document_id: 42 });
  const { body, text } = publicBody(name, result);
  const restored = fullArchive(body);
  expect(restored).toEqual(original);
  const expected = structuredClone(original) as Record<string, any>;
  for (const key of ['workflow_metrics', 'artistic_throughput', 'compiler_attempt_audit']) delete expected.art_run.document[key];
  const { diagnostic_projection: reference, ...actual } = body;
  expect(reference.omitted_paths).toHaveLength(3);
  expect(actual).toEqual(expected);
  expect(Buffer.byteLength(text)).toBeLessThan(5000);
  expect(input).toEqual(original);
});

it('public cycle and poll archive detailed telemetry while keeping deferred passes, rejection and exact recovery', async () => {
  const dir = fixture();
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: dir, workspaceRoot: dir });
  const pass = { request_key: 'exact-deferred', owner_id: 'reeds', geometry_binding: { model_id: 'exact-model', revision: 3 } };
  const repair = { kind: 'inject_from_context', path: 'next_pass.geometry_binding', source: 'exact-model', reason: 'known-context'.repeat(1000) };
  const envelope = { next_state: 'blocked', execution: { operation_id: 'exact-operation', execution: 'not-executed' },
    preflight_rejection: { error_codes: ['lighting_conflict'], compact_correction_recipe: { revision: 3 } },
    delivery_recovery: { review_operation_id: 'exact-operation', review_arguments: { roles: ['object_after_3'] } },
    artistic_review: { must_fix: ['perspective'], original_brief: 'Detailed painting' },
    next_required_action: 'Review exact-operation before mutation',
    cycle_latency: { protocol: 'photoshop.guard.cycle_latency.v1', guard_cycle_total_ms: 20, guard_preflight_ms: 4,
      photoshop_dispatch_wall_ms: 12, semantic_cycle_wall_ms: null, auto_repair_count: 1,
      deterministic_violations_unresolved_count: 1, violation_accounting: [{ code: 'lighting_conflict', unresolved: 1 }],
      future_recovery_binding: { token: 'exact-token' }, local_validation_ms: 3, compiled_at: '2026-10-08T01:02:03Z',
      compiler_repair_audit: { protocol: 'photoshop.guard.compiler_repair.v1', final_validation: 'valid',
        repaired_payload_fingerprint: 'exact-fingerprint', repairs: [repair], deferred_next_pass: pass } } };
  const poll = { job_id: 'exact-job', state: 'completed', result: envelope };
  vi.spyOn(runtime, 'cycleAuto').mockResolvedValue(envelope);
  vi.spyOn(runtime, 'pollJob').mockReturnValue(poll);
  for (const name of ['photoshop_guard_cycle_auto', 'photoshop_guard_job_poll']) {
    const result = await createGuardTools(runtime).find(t => t.tool.name === name)!.handler({ job_id: 'exact-job' });
    const { body } = publicBody(name, result);
    const target = body.result ?? body;
    const reference = body.diagnostic_projection;
    const full = fullArchive(body);
    const fullTarget = full.result ?? full;
    const { cycle_latency: latency, ...required } = envelope;
    expect(target).toMatchObject(required);
    expect(target.cycle_latency).toMatchObject({ guard_cycle_total_ms: 20, auto_repair_count: 1,
      deterministic_violations_unresolved_count: 1, violation_accounting: latency.violation_accounting,
      future_recovery_binding: latency.future_recovery_binding,
      compiler_repair_audit: { deferred_next_pass: pass, repaired_payload_fingerprint: 'exact-fingerprint' } });
    expect(target.cycle_latency).not.toHaveProperty('local_validation_ms');
    expect(target.cycle_latency).not.toHaveProperty('compiled_at');
    expect(target.cycle_latency.compiler_repair_audit).not.toHaveProperty('repairs');
    expect(fullTarget.cycle_latency).toEqual(latency);
    expect(reference.omitted_paths).toHaveLength(3);
  }
  const rejected = structuredClone(envelope);
  rejected.cycle_latency.compiler_repair_audit.final_validation = 'rejected';
  vi.spyOn(runtime, 'cycleAuto').mockResolvedValue(rejected);
  const result = await createGuardTools(runtime).find(t => t.tool.name === 'photoshop_guard_cycle_auto')!.handler({});
  expect(publicBody('photoshop_guard_cycle_auto', result).body.cycle_latency.compiler_repair_audit.repairs).toEqual([repair]);
  expect(envelope.cycle_latency.compiler_repair_audit.repairs).toEqual([repair]);
});

it('does not hide diagnostics if archival fails, or add an archive to responses without diagnostics', async () => {
  const dir = fixture();
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: dir, workspaceRoot: dir });
  const full = { ok: true, art_run: { document: { document_id: 42, workflow_metrics: { diagnostic: 'full'.repeat(2000) } } } };
  vi.spyOn(runtime, 'artRunWithCapabilitySnapshot').mockResolvedValue(full);
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('disk unavailable'); });
  const tool = createGuardTools(runtime).find(t => t.tool.name === 'photoshop_guard_set_art_run')!;
  const failed = await tool.handler({ document_id: 42 });
  expect(failed.isError).not.toBe(true);
  expect(publicBody(tool.tool.name, failed).body).toEqual(full);
  expect(fs.mkdirSync).toHaveBeenCalled();
  vi.restoreAllMocks();
  const small = { ok: true, art_run: { document: { document_id: 42, priority_review_required: true } } };
  vi.spyOn(runtime, 'artRunWithCapabilitySnapshot').mockResolvedValue(small);
  expect(publicBody(tool.tool.name, await tool.handler({ document_id: 42 })).body).toEqual(small);
  const tiny = { ok: true, art_run: { document: { document_id: 42, workflow_metrics: { count: 1 } } } };
  vi.spyOn(runtime, 'artRunWithCapabilitySnapshot').mockResolvedValue(tiny);
  expect(publicBody(tool.tool.name, await tool.handler({ document_id: 42 })).body).toEqual(tiny);
  expect(fs.existsSync(path.join(dir, 'projections'))).toBe(false);
});


it.each([
  { name: 'ready active document', active: 2942, extra: {}, expected: '2942' },
  { name: 'global running job', active: 59, extra: { active_jobs: [{ job_id: 'job', document_id: 2942 }] }, expected: '2942' },
  { name: 'global unresolved operation', active: 59, extra: { identity_recovery_blockers: [{ kind: 'operation', operation_id: 'pending', document_id: 2942 }] }, expected: '2942' },
])('selects actionable context instead of numeric history order: $name', ({ extra, expected, active }) => {
  const dir = fixture();
  const doc = (id: number) => ({ document_id: id, next_required_action: 'ready',
    logical_layer_owners: [{ hypothesis_id: 'owner-' + id, geometry_binding: { anchors: 'x'.repeat(14000) } }] });
  const input = { next_required_action: 'ready', documents: { '59': doc(59), '2942': doc(2942) },
    paint_readiness: { document_id: active, active_document_id: active }, ...extra };
  const original = JSON.stringify(input);
  const body = JSON.parse(serializeGuardState(input, dir, 'status'));
  expect(Object.keys(body.documents)).toEqual([expected]);
  expect(body.documents[expected]).toEqual(input.documents[expected as '59' | '2942']);
  expect(JSON.stringify(input)).toBe(original);
  expect(JSON.parse(fs.readFileSync(body.response_budget.full_projection_path, 'utf8'))).toEqual(input);
});

it('oversized active owner binding returns that document and intact recovery blockers through public fallback', () => {
  const dir = fixture();
  const blockers = [{ kind: 'operation', operation_id: 'global-pending', document_id: 59, phase: 'uncertain' }];
  const next = { tool: 'photoshop_guard_reconcile', args: { id: 'global-pending', capture_evidence: true } };
  const input = { next_required_action: 'ready', documents: {
    '59': { document_id: 59, next_required_action: 'ready', logical_layer_owners: [{ anchors: 'x'.repeat(30000) }] },
    '2942': { document_id: 2942, next_required_action: 'ready' },
  }, paint_readiness: { document_id: 2942 }, identity_recovery_blockers: blockers, next_public_call: next };
  const body = JSON.parse(serializeGuardState(input, dir, 'status'));
  expect(body.code).toBe('guard_state_projection_requires_public_resume');
  expect(body.document_id).toBe(59);
  expect(body.identity_recovery_blockers).toEqual(blockers);
  expect(body.next_public_call).toEqual(next);
  expect(body.mutation_replay_permitted).toBe(false);
  expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(GUARD_STATE_RESPONSE_MAX_BYTES);
});
