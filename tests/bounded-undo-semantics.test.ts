import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function frame(dir: string, name: string, value: number) {
  const data = Buffer.alloc(32 * 32 * 4, value);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  const bytes = jpeg.encode({ width: 32, height: 32, data }, 100).data;
  const materialized_path = path.join(dir, name);
  writeFileSync(materialized_path, bytes);
  return { document_id: 42, sha256: createHash('sha256').update(bytes).digest('hex'), materialized_path,
    width: 32, height: 32, canvas_width: 32, canvas_height: 32, mime_type: 'image/jpeg' };
}

function fixture(options: { steps?: number; executedSteps?: number; failed?: boolean; legacyText?: boolean; ownership?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bounded-undo-semantics-'));
  dirs.push(dir);
  const s = new SessionStore(path.join(dir, 'controller'), { visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir });
  const before = frame(dir, 'before.jpg', 60);
  const rejected = frame(dir, 'rejected.jpg', 190);
  const director = { directive_id: 'scene-plan', revision: 1, status: 'active', goal: 'Model the subject.',
    tasks: [{ task_id: 'form', goal: 'Model the major planes.', status: 'active', successful_microplans: 1 }],
    current_task_id: 'form', completed_microplans: 1, review_due: false };
  const retained = { current_stage: 'FORM', active_scale: 'medium', active_problem: { problem_id: 'form-problem', status: 'open' },
    visual_problems: { 'form-problem': { problem_id: 'form-problem', scale: 'medium', severity: 'should-fix', status: 'open' } },
    owner_representation_state: { subject: { state: 'scaffold-debt' } }, art_director: director };
  s.write({ id: 'retained', tool: 'photoshop_fill_layer', args: { document_id: 42 }, sequence: 1,
    phase: 'completed', visual: true, created_at: '2026-10-04T00:00:01Z', preview: before,
    verdict: { verdict: 'neutral', disposition: 'accept', target_resolved: 'no' } });
  s.updatePaintingState(42, current => ({ ...current, ...retained,
    document_instance: { host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'session', token: 'session:1' } },
    current_frame: { operation_id: 'retained', sha256: before.sha256, path: before.materialized_path, accepted: true } }));
  const projection = s.captureProjectionContext({ activeJobs: [] });
  const reads = vi.spyOn(s, 'paintingState');
  // Other admission rules have independent coverage; exercise the real journal
  // capture with an already admitted visual request and its existing projection.
  const preflight = vi.spyOn(s, 'collectPreflightErrors').mockReturnValueOnce([]);
  const { record: source } = s.begin({ id: 'rejected', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
    summary: 'Model the subject planes.', purpose: 'Turn the planes into light.', baseline_semantic_state: { forged: true } }, { projectionContext: projection });
  expect(reads).not.toHaveBeenCalled();
  reads.mockRestore(); preflight.mockRestore();
  const sourceVerdict = { verdict: 'neutral', disposition: 'rollback', target_resolved: 'no', observed_change: 'The modeling pass flattened the subject.' };
  s.write({ ...source, phase: 'completed', visual: true, failed: false, preview: rejected, verdict: sourceVerdict,
    result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, pass_execution: { history_ownership: {
      protocol: 'photoshop.guard.semantic_pass_history_ownership.v1', status: options.ownership ?? 'exact', owned_history_steps: 2,
    } } }) }] } });
  s.updatePaintingState(42, current => ({ ...current, current_stage: 'DETAIL', active_scale: 'small',
    active_problem: { problem_id: 'discarded-polish' }, visual_problems: {}, owner_representation_state: {},
    final_artistic_frame: { operation_id: 'rejected' }, confirmed_goal_frame: { operation_id: 'rejected' }, global_brief_outcome: 'satisfied',
    art_director: { ...director, status: 'completed', tasks: [{ ...director.tasks[0], status: 'completed', successful_microplans: 3 }] },
    commentary_detail: 'detailed', frame_counter: 77,
    pending_rollback: { operation_id: 'rejected', required_undo_steps: 2, remaining_undo_steps: 2 } }));
  const undo = { id: 'undo', tool: 'photoshop_undo', args: { document_id: 42, steps: options.steps ?? 2 },
    summary: 'Restore the previous subject state.', purpose: 'Discard the flat modeling attempt.', sequence: 3,
    phase: 'dispatched', visual: true, before_preview: rejected, created_at: '2026-10-04T00:00:03Z' };
  s.write(undo);
  s.setVisualBarrier(42, { planId: 'undo', operationId: 'undo', operationSequence: 3, requiresExternalPreview: true });
  const count = options.executedSteps ?? 2;
  const result = { ...(options.failed ? { isError: true } : {}), content: [{ type: 'text', text: options.legacyText
    ? `Undo successful (2 steps)\nResult: ${JSON.stringify({ undone: true, steps: count })}`
    : JSON.stringify({ ok: !options.failed, undo_history_states_consumed: count }) }] };
  s.complete(undo, result);
  s.attachPreview('undo', { content: [{ type: 'text', text: JSON.stringify(before) }] });
  const review = { id: 'undo', preview_id: 'undo', sha256: before.sha256, verdict: 'neutral', disposition: 'accept',
    target_resolved: 'no', observed_change: 'The previous volume is restored; the form task remains unfinished.',
    observations: [{ region: 'whole frame', visible: 'The previous mass is restored; its material and plane turns remain unfinished.' }],
    primary_mismatch: 'Form and material remain unfinished.', regressions: [], uncertainty: 'none observed',
    global_readability: 'stable', primitive_footprint: 'none', trend_signals: [] };
  return { dir, s, before, rejected, director, retained, sourceVerdict, review };
}

describe('E.11 ordinary bounded undo semantic recovery', () => {
  it('restores retained scene/task facts with the native undo result', () => {
    const f = fixture({ legacyText: true });
    expect(f.s.read('rejected').baseline_semantic_state.forged).toBeUndefined();
    expect(f.s.read('rejected').rolled_back).not.toBe(true);
    expect(f.s.paintingState().documents['42'].pending_rollback.undo_operation_id).toBe('undo');
    expect(f.s.documentNextRequiredAction(42)).toMatch(/undo|previous_observation/);
    f.s.verdict(f.review);
    const state = f.s.paintingState().documents['42'];
    expect(state).toMatchObject({ ...f.retained, commentary_detail: 'detailed', frame_counter: 77,
      current_frame: { operation_id: 'undo', sha256: f.before.sha256, accepted: true },
      last_rollback: { semantic_state_restored: true, director_restore_scope: 'exact_directive_revision' } });
    expect(state.confirmed_goal_frame).toBeUndefined(); expect(state.final_artistic_frame).toBeUndefined();
    expect(state.global_brief_outcome).toBeUndefined(); expect(state.pending_rollback).toBeUndefined();
    expect(f.s.read('rejected')).toMatchObject({ rolled_back: true, current_frame_authority: false, verdict: f.sourceVerdict });
    expect(f.s.read('undo').verdict.observed_change).toBe(f.review.observed_change);
    expect(f.s.visualBarrier(42)).toBeFalsy();
    const restarted = new SessionStore(path.join(f.dir, 'controller'), { workspaceRoot: f.dir });
    expect(restarted.paintingState().documents['42'].art_director).toEqual(f.director);
  });

  it('keeps an interrupted semantic closure pending and completes it without a second undo', () => {
    const f = fixture();
    const snapshot = f.s.snapshotClosureState('undo');
    const originalSource = f.s.read('rejected');
    const update = f.s.updatePaintingState.bind(f.s);
    const interrupted = vi.spyOn(f.s, 'updatePaintingState').mockImplementation((id, updater) => {
      const candidate = updater(f.s.paintingState().documents[String(id)]);
      if (candidate.last_rollback?.semantic_state_restored) throw new Error('simulated semantic persistence interruption');
      return update(id, updater);
    });
    expect(() => f.s.verdict(f.review)).toThrow('simulated semantic persistence interruption');
    expect(f.s.read('undo').verdict).toBeUndefined(); expect(f.s.visualBarrier(42)).toBeTruthy();
    expect(f.s.paintingState().documents['42'].pending_rollback.undo_operation_id).toBe('undo');
    interrupted.mockRestore();
    f.s.restoreClosureState(snapshot);
    expect(f.s.read('rejected')).toEqual(originalSource);
    const blocked = f.s.collectPreflightErrors({ id: 'undo-again', tool: 'photoshop_undo', args: { document_id: 42, steps: 2 } });
    expect(blocked.some(error => error.includes('rollback_already_dispatched'))).toBe(true);
    f.s.verdict(f.review);
    expect(f.s.read('undo').verdict.recovery.semantic_state_restored).toBe(true);
    expect(f.s.records().filter(row => row.tool === 'photoshop_undo')).toHaveLength(1);
  });

  it('refuses a cached restoration after the document incarnation changes', () => {
    const f = fixture();
    f.s.cacheValidatedVerdict(f.review, f.s.validateVerdictInput(f.review));
    f.s.updatePaintingState(42, current => ({ ...current,
      document_instance: { host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'session', token: 'session:2' } } }));
    expect(() => f.s.verdict(f.review)).toThrow(/bounded_undo_restore/);
    expect(f.s.read('rejected').rolled_back).not.toBe(true);
    expect(f.s.read('undo').verdict).toBeUndefined();
  });

  it('compiles the next form pass against the retained facts in the same compact cycle', async () => {
    const f = fixture();
    const registry = new ToolRegistry();
    registry.register('photoshop_adjust_curves', { tool: { name: 'photoshop_adjust_curves',
      description: 'Non-destructive Curves fixture', inputSchema: { type: 'object', properties: { document_id: { type: 'number' }, preset: { type: 'string' } } } },
      handler: async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }) });
    const preflight = vi.spyOn(f.s, 'collectPreflightErrors').mockImplementation((_request, options) => {
      const projection = options?.projectionContext;
      expect(projection.paintingState.documents['42']).toMatchObject({ current_stage: 'FORM', art_director: f.director });
      expect(projection.paintingState.documents['42'].pending_rollback).toBeUndefined();
      expect(projection.records.find(row => row.id === 'rejected').current_frame_authority).toBe(false);
      return []; // Unrelated tool admission is covered by embedded-guard tests.
    });
    const compiled = await compileGuardCycle({ previous_operation_id: 'undo', previous_observation: f.review,
      next_pass: { request_key: 'continue-form', document_id: 42, goal: 'Adjust plane values while preserving volume.',
        region: 'whole-canvas', scale: 'medium', actions: [{ tool: 'photoshop_adjust_curves', args: { preset: 'auto_tone' } }] } },
    f.s, registry, { projectionContext: f.s.captureProjectionContext({ activeJobs: [] }) });
    expect(compiled.violations).toEqual([]);
    expect(compiled.nextOperation).toMatchObject({ stage: 'FORM', planner_task_id: 'form' });
    expect(preflight).toHaveBeenCalled();
    expect(f.s.paintingState().documents['42'].current_stage).toBe('DETAIL');
    f.s.closePreviousCycle(compiled.input);
    expect(f.s.paintingState().documents['42'].current_stage).toBe('FORM');
    expect(f.s.records().filter(row => row.tool === 'photoshop_undo')).toHaveLength(1);
  });

  it('uses refreshed retired source authority in the runtime continuation', async () => {
    const f = fixture();
    for (const id of ['retained', 'rejected']) {
      const record = f.s.read(id);
      f.s.write({ ...record, report: { did: 'Restored the accepted mass.', why: 'Preserve scene volume.', result: 'Form work remains unfinished.' } });
    }
    const registry = new ToolRegistry();
    const handler = vi.fn(async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }));
    registry.register('photoshop_get_state', { tool: { name: 'photoshop_get_state', description: 'Read fixture',
      inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } } }, handler });
    const runtime = new EmbeddedGuardRuntime(registry, { runtimeDirectory: path.join(f.dir, 'controller'),
      previewBarrierDirectory: path.join(f.dir, 'barriers'), executionLeaseFile: path.join(f.dir, 'execution.lock'),
      workspaceRoot: f.dir, processVideoTraceEnabled: false,
      uxpReadinessProbe: async () => ({ ready: true, revision_match: true }) as any,
      uxpStateProbe: async () => ({ ok: true, data: { document: { id: 42, instanceWitness: {
        protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'session', token: 'session:1' } } } }) as any });
    const capture = vi.spyOn(runtime.store, 'captureProjectionContext');
    const result = await runtime.cycleAuto({ previous_operation_id: 'undo', previous_observation: f.review,
      next_pass: { request_key: 'read-after-undo', document_id: 42, goal: 'Inspect the retained scene before its next modeling pass.',
        actions: [{ tool: 'photoshop_get_state', args: {} }] } });
    expect(result.preflight_rejection).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
    const postClosure = capture.mock.results.map(row => row.value).find(projection =>
      projection?.records.some(row => row.id === 'undo' && row.verdict));
    expect(postClosure.records.find(row => row.id === 'rejected').current_frame_authority).toBe(false);
    expect(capture.mock.calls.some(([options]) => options?.records?.some(row =>
      row.id === 'rejected' && row.current_frame_authority === false))).toBe(true);
  });
});
