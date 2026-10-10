import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { isVisual } from '../src/core/guard/session-store.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';
import { normalizeSceneOwnershipPlan } from '../src/core/scene-ownership-plan.js';
import { cycleEnvelope } from '../src/core/guard/cycle.js';
import { createJob, writeJobResult, writeJobCompleted } from '../src/core/guard/async-job.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'component-recovery-')); roots.push(root);
  const registry = new ToolRegistry();
  const data = Buffer.alloc(16 * 16 * 4, 180); for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const bytes = jpeg.encode({ data, width: 16, height: 16 }, 80).data;
  const witness = { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'test-session', token: 'test-document' };
  const state = vi.fn(async () => ({ content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, document: { id: 42, width: 16, height: 16, instanceWitness: witness } }) }] }));
  const preview = vi.fn(async (args: Record<string, unknown>) => {
    const file = String(args.materialize_path); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, preview: { document_id: 42, sha256: createHash('sha256').update(bytes).digest('hex'), materialized_path: file, canvas_width: 16, canvas_height: 16 } }) },
      { type: 'image' as const, mimeType: 'image/jpeg', data: bytes.toString('base64') }] };
  });
  registry.register('photoshop_get_state', { tool: { name: 'photoshop_get_state', inputSchema: { type: 'object' } }, handler: state });
  registry.register('photoshop_get_preview', { tool: { name: 'photoshop_get_preview', inputSchema: { type: 'object' } }, handler: preview });
  const runtime = new EmbeddedGuardRuntime(registry, { workspaceRoot: root, runtimeDirectory: path.join(root, 'controller'),
    previewBarrierDirectory: path.join(root, 'barriers'), executionLeaseFile: path.join(root, 'execution.lock'), processVideoTraceEnabled: false,
    uxpReadinessProbe: async () => ({ ready: true, revision_match: true, plugin_connected: true, active_document: { id: 42 }, bridge_revision: UXP_BRIDGE_REVISION } as any),
    uxpStateProbe: async () => ({ ok: true, data: { document: { id: 42, instanceWitness: witness } } }),
  });
  runtime.store.observeDocumentInstance(42, witness);
  return { runtime, registry, state, preview, bytes };
}
function uncertain(runtime: EmbeddedGuardRuntime) {
  runtime.store.write({ id: 'partial-leaves', tool: 'photoshop_paint_strokes', args: { document_id: 42, layer_id: 7 },
    summary: 'Interrupted stroke operation', purpose: 'Recovery regression', hash: 'original', sequence: 1,
    created_at: '2026-01-01T00:00:00.000Z', phase: 'uncertain', visual: true, failed: true, execution: 'uncertain', dispatched: true });
  runtime.store.setVisualBarrier(42, { planId: 'partial-leaves', operationId: 'partial-leaves', operationSequence: 1, requiresExternalPreview: true });
}
it('collects and closes fresh state/image evidence through the public tool without clearing the original barrier or replaying', async () => {
  const f = fixture(); uncertain(f.runtime);
  const tool = createGuardTools(f.runtime).find(tool => tool.tool.name === 'photoshop_guard_reconcile')!;
  const result = await tool.handler({ id: 'partial-leaves', capture_evidence: true });
  const body = JSON.parse((result.content[0] as any).text);
  expect(result.isError, body.message).not.toBe(true);
  expect(body).toMatchObject({ ok: true, execution_classified: false, mutation_replayed: false, document_id: 42 });
  expect(result.content.some(row => row.type === 'image')).toBe(true);
  expect(createHash('sha256').update(readFileSync(body.materialized_path)).digest('hex')).toBe(body.sha256);
  expect(f.runtime.store.read('partial-leaves').resolved).toBeUndefined();
  expect(f.runtime.store.visualBarrier(42)).toBeTruthy();
  for (const id of [body.state_id, body.preview_id]) {
    expect(f.runtime.store.read(id)).toMatchObject({ phase: 'completed', failed: false });
    expect(f.runtime.store.read(id).report).toBeTruthy();
    expect(f.runtime.store.read(id).operation_ack).toBeTruthy();
  }
  const rejected = await tool.handler({ id: 'partial-leaves', capture_evidence: true, outcome: 'completed' });
  expect(rejected.isError).toBe(true);
  expect(f.state).toHaveBeenCalledTimes(1); expect(f.preview).toHaveBeenCalledTimes(1);
  const reconciled = await tool.handler({ id: 'partial-leaves', state_id: body.state_id, preview_id: body.preview_id,
    outcome: 'partial', reason: 'Fresh pixels show earlier leaf batches while later marks are absent.' });
  expect(reconciled.isError).not.toBe(true);
  expect(f.runtime.store.read('partial-leaves').execution).toBe('partial');
});
it('public recovery subset omits bulky art histories while preserving exact pending identity and commands', async () => {
  const f = fixture(); uncertain(f.runtime);
  f.runtime.store.updatePaintingState(42, current => ({ ...current, art_director: { tasks: Array(1000).fill({ description: 'x'.repeat(2000) }) } }));
  const tool = createGuardTools(f.runtime).find(tool => tool.tool.name === 'photoshop_guard_resume')!;
  const result = await tool.handler({ document_id: 42, projection: 'recovery' });
  const text = (result.content[0] as any).text; const body = JSON.parse(text);
  expect(body.uncertain).toContain('partial-leaves');
  expect(body.recovery.args).toEqual({ id: 'partial-leaves', capture_evidence: true });
  expect(body.document).not.toHaveProperty('art_director');
  expect(Buffer.byteLength(text)).toBeLessThan(8000);
});
it('uses the newest surviving additive ownership plan and restores the prior plan after its rollback', () => {
  const f = fixture();
  const unit = (id: string) => ({ semantic_id: id, owner_id: id, role: `Editable ${id}`, editability: 'independent' });
  const before = normalizeSceneOwnershipPlan({ plan_id: 'cabin', units: [unit('bed-frame')] });
  const after = normalizeSceneOwnershipPlan({ plan_id: 'cabin', units: [...before.units, unit('lamp')] });
  for (const [sequence, plan] of [[1, before], [2, after]] as const) f.runtime.store.write({ id: `plan-${sequence}`,
    tool: 'photoshop_paint_regions', args: { document_id: 42 }, sequence, created_at: '2026-01-01T00:00:00.000Z', phase: 'completed', scene_ownership_plan: plan });
  expect(f.runtime.store.sceneOwnershipPlan(42)?.units).toHaveLength(2);
  f.runtime.store.write({ ...f.runtime.store.read('plan-2'), rolled_back: true });
  expect(f.runtime.store.sceneOwnershipPlan(42)?.units).toHaveLength(1);
});
it('classifies copy export as nonvisual while retaining visual painting and mask work', () => {
  expect(isVisual('photoshop_export_as')).toBe(false);
  expect(isVisual('photoshop_save_document')).toBe(false);
  expect(isVisual('photoshop_paint_strokes')).toBe(true);
  expect(isVisual('photoshop_create_layer_mask')).toBe(true);
});
it('requires component declarations for a new committed nontrivial owner before dispatch', async () => {
  const f = fixture();
  f.runtime.store.updatePaintingState(42, current => ({ ...current, painting_profile: 'nontrivial_painting', commentary_mode: 'technical' }));
  for (const name of ['photoshop_create_layer', 'photoshop_paint_regions', 'photoshop_execute_visual_microplan']) {
    f.registry.register(name, { tool: { name, inputSchema: { type: 'object' } }, handler: async () => { throw new Error('Never dispatch'); } });
  }
  const compiled = await compileGuardCycle({ next_pass: { request_key: 'new-bed', document_id: 42, goal: 'Construct editable bed',
    stage: 'SHAPE', scale: 'global', logical_layer: { decision: 'create-new', hypothesis_id: 'bed' },
    layer_separation_check: { change_kind: 'new-object', substantial: true, rollback_value: 'high', independent_adjustment_expected: true },
    scene_ownership_plan: { plan_id: 'cabin', units: [{ semantic_id: 'bed', owner_id: 'bed', role: 'Bed mass', editability: 'independent' }] },
    actions: [{ id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Bed' } },
      { id: 'paint', tool: 'photoshop_paint_regions', args: { regions: [{ layer_id: '$steps.layer.details.layerId' }] } }],
  } }, f.runtime.store, f.registry);
  expect(compiled.violations.some(row => row.code === 'scene_component_plan_required')).toBe(true);
  expect(f.runtime.store.records()).toEqual([]);
});

it('refuses promoting a whole person as a single component without rewriting journals', () => {
  const f = fixture();
  const plan = { plan_id: 'woman-plan', units: [{ semantic_id: 'woman-whole', owner_id: 'woman', role: 'Body hair and garment', editability: 'independent' }],
    objects: [{ object_id: 'woman', subject_kind: 'person', kind: 'single-part', component_semantic_ids: ['woman-whole'] }] };
  expect(() => f.runtime.store.keepSemanticLayerOwner({ document_id: 42, request_key: 'keep-woman',
    hypothesis_id: 'woman', layer_id: 7, scene_ownership_plan: plan })).toThrow(/scene_component_decomposition_required/);
  expect(f.runtime.store.records()).toEqual([]);
});

it('reports a finished async process as uncertain when its operation needs reconciliation, keeping the actual partial failure visible', () => {
  const f = fixture(); uncertain(f.runtime);
  const record = f.runtime.store.read('partial-leaves');
  f.runtime.store.write({ ...record, error: 'Logical cycle deadline exhausted before preview dispatch',
    result: { content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'preview_required_before_next_mutation',
      failed_mutation_step: 'paint', mutation_results: { paint: { ok: false, code: 'uxp_bridge_unavailable', message: 'Batch 85/228 failed after 336/912 render strokes; earlier batches remain applied.' } } }) }] } });
  const envelope = cycleEnvelope(f.runtime.store, f.runtime.store.read('partial-leaves'));
  expect(envelope.execution_failure.mutation.message).toContain('336/912');
  expect(envelope.execution_failure.followup_error).toContain('deadline');
  expect(envelope.delivery_recovery.args).toEqual({ id: 'partial-leaves', capture_evidence: true });
  const job = createJob(f.runtime.runtimeDirectory, { next_operation: { id: 'partial-leaves', args: { document_id: 42 } } }, {});
  writeJobResult(job.dir, envelope); writeJobCompleted(job.dir, 0);
  expect(f.runtime.pollJob(job.meta.job_id)).toMatchObject({ ok: false, process_state: 'completed', state: 'uncertain', next: expect.stringContaining('never replay') });
});
it('refuses recovery evidence from a different active document without invoking preview or classifying the original', async () => {
  const f = fixture(); uncertain(f.runtime);
  f.state.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify({ document: { id: 43 } }) }] });
  await expect(f.runtime.captureRecoveryEvidence('partial-leaves')).rejects.toThrow(/different\/no document/);
  expect(f.preview).not.toHaveBeenCalled();
  expect(f.runtime.store.read('partial-leaves').resolved).toBeUndefined();
});
