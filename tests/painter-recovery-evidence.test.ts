import abandonedRecords from './fixtures/identity-recovery-abandoned-records.json';
import liveOwnerCase from './fixtures/identity-recovery-live-layers.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';

const directories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
const witness = (session: string, token = 1) => ({ protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: session, token: `${session}:${token}` });

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'painter-recovery-'));
  directories.push(dir);
  const data = Buffer.alloc(16 * 16 * 4, 180);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  const bytes = jpeg.encode({ data, width: 16, height: 16 }, 80).data;
  const file = path.join(dir, 'current.jpg');
  writeFileSync(file, bytes);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const registry = new ToolRegistry();
  let activeWitness = witness('original');
  let previewBytes: Buffer = bytes;
  let layerIds = [9];
  let bootstrapHistory: Record<string, unknown> = { totalStates: 2, currentIndex: 1, currentState: 'New',
    states: [{ name: 'Untitled-1', snapshot: true }, { name: 'New', snapshot: false }] };
  const preview = vi.fn(async () => ({ content: [{ type: 'image' as const, data: previewBytes.toString('base64'), mimeType: 'image/jpeg' }] }));
  registry.register('photoshop_get_preview', { tool: { name: 'photoshop_get_preview', inputSchema: { type: 'object' } }, handler: preview });
  registry.register('photoshop_get_layers', { tool: { name: 'photoshop_get_layers', inputSchema: { type: 'object' } },
    handler: async () => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true,
      details: { layers: layerIds.map(id => ({ id, name: 'Background' })), context: {
        document: { id: 42 }, activeLayer: { isBackground: true },
      } } }) }] }) });
  registry.register('photoshop_get_history', { tool: { name: 'photoshop_get_history', inputSchema: { type: 'object' } },
    handler: async () => ({ content: [{ type: 'text', text: `History States:\n${JSON.stringify(bootstrapHistory)}` }] }) });
  const runtime = new EmbeddedGuardRuntime(registry, {
    workspaceRoot: dir, runtimeDirectory: path.join(dir, 'controller'), previewBarrierDirectory: path.join(dir, 'barriers'), executionLeaseFile: path.join(dir, 'execution.lock'),
    uxpReadinessProbe: async () => ({ ready: true, revision_match: true, plugin_connected: true, active_document: { id: 42 }, bridge_revision: UXP_BRIDGE_REVISION } as any),
    uxpStateProbe: async () => ({ ok: true, data: { document: { id: 42, name: 'Untitled-1', width: 16, height: 16, instanceWitness: activeWitness } } }),
  });
  runtime.store.observeDocumentInstance(42, activeWitness);
  runtime.store.updatePaintingState(42, current => ({ ...current, process_dir: 'processes/test-process/run-01',
    current_frame: { operation_id: 'frame', path: file, sha256: sha, at: '2026-01-01T00:00:00.000Z' },
    art_director: { directive_id: 'director', style_contract: { edge_policy: 'selective' }, prompt_conflict_preflight: { chosen_rendering_strategy: 'mass and contact' }, strategy_validation_after_microplans: 2, strategy_validation: { status: 'pending' }, assessment: { next_priority: 'road form' } },
  }));
  vi.spyOn(runtime.store, 'semanticLayerOwners').mockReturnValue([{ layer_id: 9, hypothesis_id: 'road' }] as any);
  return { runtime, registry, preview, sha, file, restart: () => { activeWitness = witness('restarted'); }, replace: () => { activeWitness = witness('original', 2); },
    changePreview: () => { previewBytes = Buffer.from('different'); }, loseOwner: () => { layerIds = [10]; },
    setHistory: (history: Record<string, unknown>) => { bootstrapHistory = history; },
    makePristine: () => {
      runtime.store.updatePaintingState(42, current => ({ ...current, current_frame: null, accepted_frame: null,
        confirmed_goal_frame: null, logical_layer_owners: [] }));
      vi.spyOn(runtime.store, 'semanticLayerOwners').mockReturnValue([]);
    },
  };
}

describe('public painter recovery and evidence (offline mocks only)', () => {
  it('quarantines a connection epoch without destroying work, then rebinds only with user confirmation and fresh exact pixels/owners', async () => {
    const f = fixture(); f.restart();
    const problems = await (f.runtime as any).collectDynamicOperationViolations({ tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 50 } });
    expect(problems[0].code).toBe('document_identity_unverified');
    expect(f.runtime.store.artRunState(42, undefined)?.art_director.directive_id).toBe('director');
    expect(f.runtime.store.artRunState(42, undefined)?.current_frame.sha256).toBe(f.sha);
    expect(f.runtime.resume(42)).toMatchObject({ resume_mode: 'identity_unverified', mutation_allowed: false });
    expect(() => f.runtime.store.setArtRunState({ document_id: 42, process_dir: 'processes/replacement-process/run-01' })).toThrow(/document_identity_unverified/);
    const recovered = await f.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true });
    expect(recovered.identity_recovery).toMatchObject({ status: 'confirmed', frame_sha256: f.sha });
    expect(f.runtime.store.currentDocumentIncarnationId(42)).toBe('original:1');
    expect(f.runtime.store.observeDocumentInstance(42, witness('restarted'))).toMatchObject({ status: 'match', host_witness: witness('original') });
    expect(f.preview).toHaveBeenCalledTimes(1);
  });

  it.each(['pixels', 'owners'] as const)('keeps state quarantined when fresh %s disagree', async kind => {
    const f = fixture(); f.restart();
    if (kind === 'pixels') f.changePreview(); else f.loseOwner();
    await expect(f.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true })).rejects.toThrow(/document_identity_(frame|owner)_mismatch/);
    expect(f.runtime.store.artRunState(42, undefined)?.document_instance.identity_pending).toBeTruthy();
    expect(f.runtime.store.artRunState(42, undefined)?.current_frame.sha256).toBe(f.sha);
  });

  it('recovers the frozen real cabin six-layer payload and five owners without changing durable bindings', async () => {
    const f = fixture(); f.restart();
    const body = structuredClone(liveOwnerCase.layer_result);
    // Only the document id is adapted to this isolated fixture; layer ids/envelope are frozen.
    body.details.context.document.id = 42;
    body.document_target.id = 42;
    vi.spyOn(f.runtime.store, 'semanticLayerOwners').mockReturnValue(liveOwnerCase.owners as any);
    vi.spyOn(f.registry, 'execute').mockImplementation(async name => name === 'photoshop_get_layers'
      ? { content: [{ type: 'text', text: JSON.stringify(body) }] } : f.preview());
    const recovered = await f.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true });
    expect(recovered.identity_recovery).toMatchObject({ status: 'confirmed', frame_sha256: f.sha });
    expect(f.runtime.store.semanticLayerOwners(42)).toEqual(liveOwnerCase.owners);
    expect(f.runtime.store.artRunState(42, undefined)?.current_frame.sha256).toBe(f.sha);
    expect(f.runtime.store.artRunState(42, undefined)?.art_director.directive_id).toBe('director');
  });

  it('still resets a proven same-session document replacement', async () => {
    const f = fixture(); f.replace();
    const problems = await (f.runtime as any).collectDynamicOperationViolations({ tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 50 } });
    expect(problems[0].code).toBe('document_reincarnated');
    expect(f.runtime.store.artRunState(42, undefined)?.art_director).toBeUndefined();
  });

  it.each([
    { details: { layers: [{ id: '9' }], context: { document: { id: 42 } } } },
    { details: { layers: [{ id: 9 }], context: { document: { id: 43 } } } },
    { ok: false, details: { layers: [{ id: 9 }] } },
  ])('public owner mismatch identifies the unproven binding without accepting malformed/foreign evidence %#', async body => {
    const f = fixture(); f.restart();
    vi.spyOn(f.registry, 'execute').mockImplementation(async name => {
      if (name === 'photoshop_get_layers') return { content: [{ type: 'text', text: JSON.stringify(body) }] };
      return f.preview();
    });
    const result = await createGuardTools(f.runtime).find(t => t.tool.name === 'photoshop_guard_resume')!
      .handler({ document_id: 42, same_document_confirmed: true });
    const response = JSON.parse((result.content[0] as { text: string }).text);
    expect(response).toMatchObject({ code: 'document_identity_owner_mismatch', mutation_allowed: false,
      mutation_replay_permitted: false, owner_identity_comparison: { document_id: 42 } });
    expect(f.runtime.store.artRunState(42, undefined)?.document_instance.identity_pending).toBeTruthy();
    expect(f.runtime.store.artRunState(42, undefined)?.current_frame.sha256).toBe(f.sha);
  });

  it('registers grayscale evidence from the exact delivered frame without a Photoshop preview call', async () => {
    const f = fixture();
    const result = await f.registry.execute('photoshop_analyze_value_structure', { document_id: 42 });
    const item = result.content.find(item => item.type === 'text');
    const body = JSON.parse(item?.type === 'text' ? item.text : '{}');
    expect(f.preview).not.toHaveBeenCalled();
    expect(body.source_preview_sha256).toBe(f.sha);
    expect(body.evidence_operation_id).toMatch(/^value-evidence-/);
    expect(createHash('sha256').update(readFileSync(body.materialized_path)).digest('hex')).toBe(body.grayscale_sha256);
    expect(f.runtime.store.read(body.evidence_operation_id)).toMatchObject({ phase: 'completed', failed: false, report: expect.anything(), operation_ack: expect.anything() });
    expect(() => f.runtime.store.validateValueCheckEvidence(42, { ...body.director_evidence_fields, observed: true })).not.toThrow();
    expect(f.runtime.store.read(body.evidence_operation_id)?.result.content.every((item: any) => item.type === 'text')).toBe(true);
    const director = (f.runtime.resume(42).document as any).art_director;
    expect(director).toMatchObject({ style_contract: { edge_policy: 'selective' }, strategy_validation: { status: 'pending' }, strategy_validation_after_microplans: 2, assessment: { next_priority: 'road form' } });
    expect(director.prompt_conflict_preflight.chosen_rendering_strategy).toBe('mass and contact');
  });

  it('refuses analysis of an altered cached frame without registering fake evidence', async () => {
    const f = fixture(); writeFileSync(f.file, Buffer.from('changed'));
    await expect(f.registry.execute('photoshop_analyze_value_structure', { document_id: 42 })).rejects.toThrow(/current_frame_file_changed/);
    expect(f.runtime.store.records()).toHaveLength(0);
    expect(f.preview).not.toHaveBeenCalled();
  });

  it('cannot overwrite its source frame through materialize_path', async () => {
    const f = fixture();
    await expect(f.registry.execute('photoshop_analyze_value_structure', { document_id: 42, materialize_path: f.file })).rejects.toThrow(/source_overwrite_forbidden/);
    expect(createHash('sha256').update(readFileSync(f.file)).digest('hex')).toBe(f.sha);
    expect(f.runtime.store.records()).toHaveLength(0);
  });

  it('fetches exact Director continuation fields through the public tool without returning a large task inventory', async () => {
    const f = fixture();
    f.runtime.store.updatePaintingState(42, current => ({ ...current, art_director: { ...current.art_director,
      tasks: Array.from({ length: 100 }, (_, index) => ({ task_id: `t${index}`, summary: 'x'.repeat(1000) })),
    } }));
    const resume = createGuardTools(f.runtime).find(tool => tool.tool.name === 'photoshop_guard_resume')!;
    const result = await resume.handler({ document_id: 42, director_fields: ['style_contract', 'prompt_conflict_preflight', 'strategy_validation_after_microplans', 'strategy_validation', 'assessment'] });
    const text = result.content.find(item => item.type === 'text');
    const body = JSON.parse(text?.type === 'text' ? text.text : '{}');
    expect(body).toMatchObject({ ok: true, resume_mode: 'director_fields', art_director: { style_contract: { edge_policy: 'selective' } } });
    expect(body.art_director.tasks).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(4096);
  });

  it('rejects prepared filters before dispatch when imaging authority is missing', async () => {
    const f = fixture();
    const blur = vi.fn(async () => ({ content: [] }));
    f.registry.register('photoshop_apply_gaussian_blur', { tool: { name: 'photoshop_apply_gaussian_blur', inputSchema: { type: 'object', properties: { radius: { type: 'number' }, layer_id: { type: 'integer' } }, required: ['radius', 'layer_id'] } }, handler: blur });
    f.registry.register('photoshop_select_rectangle', { tool: { name: 'photoshop_select_rectangle', inputSchema: { type: 'object' } }, handler: async () => ({ content: [] }) });
    const compiled = await compileGuardCycle({ next_pass: { request_key: 'unsafe-prepared-filter', document_id: 42,
      goal: 'Soften one existing owner after selecting its bounded region', stage: 'SHAPE', scale: 'global',
      actions: [{ id: 'selection', tool: 'photoshop_select_rectangle', args: {} },
        { id: 'filter', tool: 'photoshop_apply_gaussian_blur', method_id: 'gaussian-blur', args: { layer_id: 9, radius: 2 } }],
    } }, f.runtime.store, f.registry);
    expect(compiled.violations.some(item => item.code === 'imaging_preflight_required')).toBe(true);
    expect(blur).not.toHaveBeenCalled();
    expect(f.preview).not.toHaveBeenCalled();
  });
});

describe('identity recovery terminal journal regression', () => {
  it('recovers an explicitly confirmed untouched new document with no prior Guard frame or visual mutations', async () => {
    const f = fixture(); f.makePristine(); f.restart();
    const recovered: any = await f.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true });
    expect(recovered.identity_recovery).toMatchObject({ status: 'confirmed', recovery_mode: 'pristine_bootstrap', frame_sha256: null });
    expect(f.runtime.store.artRunState(42, undefined)?.document_instance.identity_pending).toBeUndefined();
    expect(f.runtime.store.artRunState(42, undefined)?.current_frame).toBeNull();
    expect(f.preview).not.toHaveBeenCalled();
  });

  it('does not recover no-frame documents with edited history or prior Guard visual mutations', async () => {
    const edited = fixture(); edited.makePristine(); edited.restart();
    edited.setHistory({ totalStates: 3, currentIndex: 2, currentState: 'Paint Brush',
      states: [{ name: 'Untitled-1' }, { name: 'New' }, { name: 'Paint Brush' }] });
    await expect(edited.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true }))
      .rejects.toThrow('document_identity_saved_frame_unavailable');
    expect(edited.runtime.store.artRunState(42, undefined)?.document_instance.identity_pending).toBeTruthy();
    const visual = fixture(); visual.makePristine(); visual.restart();
    vi.spyOn(visual.runtime.store, 'records').mockReturnValue([{ id: 'prior-dab', tool: 'photoshop_paint_dabs',
      args: { document_id: 42 }, phase: 'completed', visual: true, failed: false, sequence: 7 }] as any);
    await expect(visual.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true }))
      .rejects.toThrow('document_identity_saved_frame_unavailable');
    expect(visual.runtime.store.artRunState(42, undefined)?.document_instance.identity_pending).toBeTruthy();
  });

  it('ignores the three actual abandoned legacy uncertain records without rewriting history', async () => {
    const f = fixture();
    for (const record of abandonedRecords) f.runtime.store.write(structuredClone(record));
    const before = abandonedRecords.map(record => readFileSync(f.runtime.store.file(record.id), 'utf8'));
    f.restart();
    await (f.runtime as any).collectDynamicOperationViolations({ tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 50 } });
    const recovered = await f.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true });
    expect(recovered.identity_recovery).toMatchObject({ status: 'confirmed', frame_sha256: f.sha });
    expect(f.preview).toHaveBeenCalledTimes(1);
    expect(abandonedRecords.map(record => readFileSync(f.runtime.store.file(record.id), 'utf8'))).toEqual(before);
  });
  it.each([undefined, { outcome: 'unknown' }])('keeps genuinely unresolved or malformed-resolution work blocking and exposes its exact identity (%j)', async resolved => {
    const f = fixture(); f.restart();
    f.runtime.store.observeDocumentInstance(42, witness('restarted'));
    const record = { id: 'real-unresolved', tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 50 },
      phase: 'uncertain', visual: true, failed: true, sequence: 1, created_at: '2026-10-09T07:00:00.000Z', ...(resolved ? { resolved } : {}) };
    f.runtime.store.write(record);
    const status: any = f.runtime.status();
    expect(status.uncertain).toContain('real-unresolved');
    expect(status.identity_recovery_blockers).toEqual([expect.objectContaining({ kind: 'operation', operation_id: 'real-unresolved', document_id: 42 })]);
    const resume = createGuardTools(f.runtime).find(tool => tool.tool.name === 'photoshop_guard_resume')!;
    const response = await resume.handler({ document_id: 42, same_document_confirmed: true });
    const failure: any = JSON.parse((response.content[0] as any).text);
    expect(failure).toMatchObject({ code: 'document_identity_recovery_busy', mutation_replay_permitted: false,
      identity_recovery_blockers: status.identity_recovery_blockers,
      next_public_call: { tool: 'photoshop_guard_reconcile', args: { id: 'real-unresolved', capture_evidence: true } } });
    const subset: any = await f.runtime.resumeWithRecovery({ document_id: 42, projection: 'recovery' });
    expect(subset).toMatchObject({ mutation_allowed: false, resume_mode: 'identity_unverified', identity_recovery_blockers: status.identity_recovery_blockers });
    expect(subset.next_public_call).toEqual(failure.next_public_call);
    const ownership: any = await f.runtime.resumeWithRecovery({ document_id: 42, projection: 'ownership', owner_id: 'road' });
    expect(ownership.next_public_call).toEqual(failure.next_public_call);
    expect(ownership.identity_recovery_blockers).toEqual(status.identity_recovery_blockers);
    expect(subset.document.next_required_action).toBe(subset.next_required_action);
    expect(subset.next_required_action).not.toContain('same_document_confirmed=true');
    expect(f.preview).not.toHaveBeenCalled();
    expect(f.runtime.store.artRunState(42, undefined)?.document_instance.identity_pending).toBeTruthy();
  });
  it('retains the global active-job guard and names the job to poll before identity confirmation', async () => {
    const f = fixture(); f.restart(); f.runtime.store.observeDocumentInstance(42, witness('restarted'));
    vi.spyOn(f.runtime.store, 'activeJobs').mockReturnValue([{ job_id: 'job-live', operation_id: 'live-pass', document_id: 99,
      state: 'running', poll_command: 'photoshop_guard_job_poll(job_id="job-live")' }] as any);
    await expect(f.runtime.resumeWithRecovery({ document_id: 42, same_document_confirmed: true })).rejects.toMatchObject({
      code: 'document_identity_recovery_busy', identity_recovery_blockers: [expect.objectContaining({ kind: 'job', job_id: 'job-live', document_id: 99 })],
      next_public_call: { tool: 'photoshop_guard_job_poll', args: { job_id: 'job-live' } },
    });
    expect(f.preview).not.toHaveBeenCalled();
    expect(f.runtime.store.artRunState(42, undefined)?.document_instance.identity_pending).toBeTruthy();
  });
  it.each([false, true])('accepts durable pre-dispatch proof only when there is no positive mutation evidence (%s)', positive => {
    const f = fixture();
    const record = { id: 'proof', phase: 'uncertain', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, execution: 'not-executed',
      result: { content: [{ type: 'text', text: JSON.stringify({ visual_mutation_started: positive }) }] } };
    expect(f.runtime.store.identityRecoveryBlockers([record], []).length).toBe(positive ? 1 : 0);
  });
});
