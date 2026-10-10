import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';
import { createGuardTools } from '../src/tools/guard-tools.js';

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function jpegFrame(dir: string, name: string, value: number) {
  const width = 32;
  const height = 32;
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const bytes = jpeg.encode({ data, width, height }, 100).data;
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    materialized_path: file,
    width,
    height,
    canvas_width: width,
    canvas_height: height,
    document_id: 42,
    mime_type: 'image/jpeg',
  };
}

function record(
  id: string,
  sequence: number,
  preview: Record<string, unknown>,
  historySteps: number
) {
  return {
    id,
    tool: 'photoshop_execute_visual_microplan',
    args: {
      document_id: 42,
      steps: [{
        id: 'guard_after_preview',
        tool: 'photoshop_get_preview',
        args: { max_dimension_px: 1000, quality: 8 },
      }],
    },
    summary: `Visual mutation ${id}`,
    purpose: 'Task 21a restore fixture.',
    hash: `hash-${id}`,
    sequence,
    created_at: new Date(sequence * 1000).toISOString(),
    completed_at: new Date(sequence * 1000 + 100).toISOString(),
    phase: 'completed',
    execution: 'completed',
    visual: true,
    failed: false,
    preview,
    report: {
      id,
      did: `Executed ${id}.`,
      why: 'Populate a fully closed historical visual record for anchor recovery.',
      result: 'The synthetic visual operation completed and was classified.',
      source: 'guard_execution',
      recorded_at: new Date(sequence * 1000 + 150).toISOString(),
      delivery: 'technical_execution_record',
    },
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          history_steps: historySteps,
          mutation_results: {
            paint: { history_steps: historySteps },
          },
        }),
      }],
    },
    verdict: {
      verdict: 'improvement',
      disposition: 'accept',
      target_resolved: 'yes',
      significance: { execution_effect: 'material' },
      at: new Date(sequence * 1000 + 200).toISOString(),
    },
  };
}

function anchorSnapshot(witness: Record<string, unknown>) {
  return {
    protocol: 'photoshop.guard.anchor_restore_snapshot.v1',
    document_id: 42,
    captured_at: '2026-09-25T00:00:00.000Z',
    document_instance_witness: witness,
    layer_count: 2,
    layers: [
      { id: 11, name: 'Paint', path: 'Paint', depth: 0, kind: 'LayerKind.NORMAL', typename: 'ArtLayer', visible: true, opacity: 82, blend_mode: 'BlendMode.NORMAL' },
      { id: 10, name: 'Background', path: 'Background', depth: 0, kind: 'LayerKind.NORMAL', typename: 'ArtLayer', visible: true, opacity: 100, blend_mode: 'BlendMode.NORMAL' },
    ],
    active_layer: { id: 11, name: 'Paint', kind: 'LayerKind.NORMAL', visible: true, opacity: 82, blend_mode: 'BlendMode.NORMAL', locked: false, is_background: false },
    selection: { has_selection: true, bounds: { left: 5, top: 6, right: 24, bottom: 25 } },
  };
}

function restoreFixture(options: { staleAnchor?: boolean; parityMismatch?: boolean; semanticState?: Record<string, unknown> } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'accepted-anchor-restore-'));
  dirs.push(dir);
  const anchor = jpegFrame(dir, 'anchor.jpg', 70);
  const degraded = jpegFrame(dir, 'degraded.jpg', 190);
  const witness = {
    protocol: 'photoshop.uxp.document_instance_witness.v1',
    session_id: 'restore-test-session',
    token: 'restore-test-session:1',
  };
  const snapshot = anchorSnapshot(witness);
  const registry = new ToolRegistry();
  const undoCalls: Array<Record<string, unknown>> = [];
  const previewCalls: Array<Record<string, unknown>> = [];

  registry.register('photoshop_get_preview', {
    tool: {
      name: 'photoshop_get_preview',
      description: 'restore fixture preview',
      inputSchema: { type: 'object', properties: { document_id: { type: 'number' }, materialize_path: { type: 'string' }, include_image: { type: 'boolean' }, max_dimension_px: { type: 'number' }, quality: { type: 'number' } } },
    },
    handler: async (args) => {
      previewCalls.push(structuredClone(args));
      const target = typeof args.materialize_path === 'string'
        ? args.materialize_path
        : path.join(dir, 'fallback-preview.jpg');
      const source = /-after\.jpg$/i.test(String(target)) ? anchor : degraded;
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, source.bytes);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...source, materialized_path: target }) }],
      };
    },
  });
  registry.register('photoshop_undo', {
    tool: {
      name: 'photoshop_undo',
      description: 'restore fixture undo',
      inputSchema: { type: 'object', properties: { document_id: { type: 'number' }, steps: { type: 'number', minimum: 1 } } },
    },
    handler: async (args) => {
      undoCalls.push(structuredClone(args));
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'Undo applied', undo_history_states_consumed: args.steps }) }],
      };
    },
  });
  registry.register('photoshop_get_state', {
    tool: { name: 'photoshop_get_state', description: 'restore fixture state', inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } } },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        hasDocument: true,
        document: { id: 42, instanceWitness: witness, hasSelection: true },
        activeLayer: options.parityMismatch
          ? { id: 99, name: 'Wrong', kind: 'LayerKind.NORMAL', visible: true, opacity: 100, blendMode: 'BlendMode.NORMAL', locked: false, isBackground: false }
          : { id: 11, name: 'Paint', kind: 'LayerKind.NORMAL', visible: true, opacity: 82, blendMode: 'BlendMode.NORMAL', locked: false, isBackground: false },
      }) }],
    }),
  });
  registry.register('photoshop_get_layers', {
    tool: { name: 'photoshop_get_layers', description: 'restore fixture layers', inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } } },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        summary: 'Listed 2 layers',
        details: {
          layerCount: 2,
          layers: [
            { id: 11, name: 'Paint', path: 'Paint', depth: 0, kind: 'LayerKind.NORMAL', typename: 'ArtLayer', visible: true, opacity: 82, blendMode: 'BlendMode.NORMAL' },
            { id: 10, name: 'Background', path: 'Background', depth: 0, kind: 'LayerKind.NORMAL', typename: 'ArtLayer', visible: true, opacity: 100, blendMode: 'BlendMode.NORMAL' },
          ],
          context: { document: { id: 42 } },
        },
      }) }],
    }),
  });
  registry.register('photoshop_get_selection_bounds', {
    tool: { name: 'photoshop_get_selection_bounds', description: 'restore fixture selection', inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } } },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        summary: 'Selection present',
        details: {
          has_selection: true,
          bounds: { left: 5, top: 6, right: 24, bottom: 25 },
          context: { document: { id: 42 } },
        },
      }) }],
    }),
  });

  const runtime = new EmbeddedGuardRuntime(registry, {
    runtimeDirectory: path.join(dir, 'controller'),
    previewBarrierDirectory: path.join(dir, 'barriers'),
    executionLeaseFile: path.join(dir, 'execution.lock'),
    workspaceRoot: dir,
    uxpReadinessProbe: async () => ({
      ready: true,
      transport: 'uxp',
      bridge_transport: 'long-poll',
      bridge_revision: UXP_BRIDGE_REVISION,
      expected_bridge_revision: UXP_BRIDGE_REVISION,
      revision_match: true,
      photoshop_version: '27.0.1',
      document_count: 1,
      active_document: { id: 42, name: 'Restore.psd' },
      plugin_connected: true,
      reason: null,
      checked_at: new Date().toISOString(),
      cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
    }),
    uxpStateProbe: async () => ({
      ok: true,
      data: { document: { id: 42, instanceWitness: witness } },
    }),
  });

  runtime.store.write(record('anchor-op', 1, anchor, 1));
  runtime.store.updatePaintingState(42, current => ({
    ...current,
    ...options.semanticState,
    document_id: 42,
    document_instance: { protocol: 'photoshop.guard.document_instance.v1', host_witness: witness },
    current_frame: { operation_id: 'anchor-op', sha256: anchor.sha256, path: anchor.materialized_path, accepted: true },
    accepted_frame: { operation_id: 'anchor-op', sha256: anchor.sha256, path: anchor.materialized_path, accepted: true },
    primary_artistic_anchor: { operation_id: 'anchor-op', sha256: anchor.sha256, path: anchor.materialized_path },
  }));
  runtime.store.attachAnchorRestoreSnapshot(42, 'anchor-op', snapshot);
  runtime.store.write(record('later-multi-history', 2, degraded, 3));
  runtime.store.write(record('later-second-pass', 3, degraded, 2));
  runtime.store.updatePaintingState(42, current => ({
    ...current,
    current_frame: { operation_id: 'later-second-pass', sha256: degraded.sha256, path: degraded.materialized_path, accepted: false },
  }));
  if (options.staleAnchor) writeFileSync(anchor.materialized_path, degraded.bytes);

  return { dir, runtime, anchor, degraded, undoCalls, previewCalls };
}

function addOwnerHistory(f: ReturnType<typeof restoreFixture>) {
  const incarnation = f.runtime.store.currentDocumentIncarnationId(42);
  for (const [index, id] of ['anchor-op', 'later-multi-history', 'later-second-pass'].entries()) {
    const row = f.runtime.store.read(id);
    const body = JSON.parse(row.result.content[0].text);
    const revision = index === 0 ? 1 : 2;
    const ownerId = index === 2 ? 'discarded-detail-owner' : 'subject-owner';
    body.change_domains = ['local-shape'];
    body.continuation_layers = [{
      layer_id: index === 0 ? 11 : index === 1 ? 12 : 22, hypothesis_id: ownerId,
      hypothesis: index === 0 ? 'Retained modeled subject' : 'Discarded construction',
      decision: index === 1 ? 'adjust' : 'create-new', rollback_value: 'moderate', construction_tier: 'primary',
      geometry_binding: { owner_id: ownerId, scene_geometry_model_id: 'restore-scene', scene_geometry_revision: revision },
    }];
    row.result.content[0].text = JSON.stringify(body);
    row.problem_id = 'subject-form-problem';
    row.args.problem_id = 'subject-form-problem';
    row.scene_geometry_model = {
      model_id: 'restore-scene', revision, applicability: 'insufficient_evidence',
      applicability_rationale: 'The fixture preserves a bounded model without inventing perspective evidence.',
      source_frame: { document_id: 42, document_incarnation: incarnation, width: 1000, height: 700 },
      projection: { kind: 'custom', vanishing_points: [] },
    };
    f.runtime.store.write(row);
  }
}

describe('Task 21a one-action accepted-anchor recovery', () => {
  it('reports legacy physical-only restoration without claiming mutable or Director parity', async () => {
    const f = restoreFixture({ semanticState: { current_stage: 'FORM' } });
    f.runtime.store.updatePaintingState(42, current => {
      const legacy = structuredClone(current);
      delete legacy.primary_artistic_anchor.restore_snapshot.semantic_state;
      legacy.current_stage = 'DETAIL';
      return legacy;
    });
    const response = await f.runtime.cycle({ next_pass: { request_key: 'restore-legacy-state', document_id: 42,
      goal: 'Restore the registered legacy Photoshop anchor.', restore_anchor_operation_id: 'anchor-op' } });
    expect(response.accepted_anchor_restore).toMatchObject({ completed: true, semantic_state_restored: false,
      semantic_restore_scope: [], director_restore_scope: 'unavailable' });
    expect(f.runtime.store.paintingState().documents['42'].current_stage).toBe('DETAIL');
    expect(f.undoCalls).toHaveLength(1);
  });

  it('restores task and finish assessments only for the exact retained directive revision', async () => {
    const director = { directive_id: 'scene-plan', revision: 2, status: 'active', goal: 'Model the retained subject.',
      current_task_id: 'form-task', tasks: [{ task_id: 'form-task', goal: 'Turn the major planes.', status: 'active', successful_microplans: 1 }],
      completed_microplans: 1, review_due: false, refinement_check: { status: 'pending', observed: false } };
    const f = restoreFixture({ semanticState: { art_director: director, global_brief_outcome: 'in-progress' } });
    f.runtime.store.updatePaintingState(42, current => ({ ...current, global_brief_outcome: 'satisfied',
      final_artistic_frame: { operation_id: 'later-second-pass' }, art_director: { ...director, status: 'completed',
        current_task_id: null, tasks: [{ ...director.tasks[0], status: 'completed', successful_microplans: 3 }],
        completed_microplans: 3, refinement_check: { status: 'pass', observed: true },
        final_comparison: { preferred: 'current' }, completed_at: 'discarded-time' } }));
    await f.runtime.cycle({ next_pass: { request_key: 'restore-director-state', document_id: 42,
      goal: 'Restore the accepted subject and its actual unfinished work.', restore_anchor_operation_id: 'anchor-op' } });
    const state = f.runtime.store.paintingState().documents['42'];
    expect(state.art_director).toEqual(director);
    expect(state.global_brief_outcome).toBe('in-progress');
    expect(state.final_artistic_frame).toBeUndefined();
    expect(state.last_anchor_restore.director_restore_scope).toBe('exact_directive_revision');
    expect(f.undoCalls).toHaveLength(1);
  });

  it('preserves a newer directive while invalidating its assessment of discarded pixels', async () => {
    const director = { directive_id: 'scene-plan', revision: 2, status: 'active', goal: 'Original plan.',
      tasks: [{ task_id: 'original-task', status: 'active' }] };
    const f = restoreFixture({ semanticState: { art_director: director, global_brief_outcome: 'in-progress' } });
    const newTasks = [{ task_id: 'new-task', goal: 'Follow the changed brief.', status: 'completed' }];
    f.runtime.store.updatePaintingState(42, current => ({ ...current, global_brief_outcome: 'satisfied',
      global_brief_assessment: { outcome: 'satisfied' }, final_artistic_frame: { operation_id: 'later-second-pass' },
      art_director: { ...director, revision: 3, goal: 'Changed user plan.', tasks: newTasks, status: 'completed',
        value_check: { status: 'pass' }, global_brief_completion_allowed: true, final_comparison: { preferred: 'current' } } }));
    await f.runtime.cycle({ next_pass: { request_key: 'restore-newer-director', document_id: 42,
      goal: 'Restore the accepted image without reverting the changed plan.', restore_anchor_operation_id: 'anchor-op' } });
    const state = f.runtime.store.paintingState().documents['42'];
    expect(state.art_director).toMatchObject({ directive_id: 'scene-plan', revision: 3, goal: 'Changed user plan.', tasks: newTasks,
      status: 'review_due', review_due: true, physical_stack_check: { status: 'pending' },
      whole_image_glance: { due: true, required_operation_id: 'restore-newer-director', required_frame_sha256: f.anchor.sha256 } });
    expect(state.art_director.value_check).toBeUndefined();
    expect(state.art_director.global_brief_completion_allowed).toBeUndefined();
    expect(state.art_director.final_comparison).toBeUndefined();
    expect(state.global_brief_outcome).toBeUndefined();
    expect(state.global_brief_assessment).toBeUndefined();
    expect(state.final_artistic_frame).toBeUndefined();
    expect(state.last_anchor_restore.director_restore_scope).toBe('newer_directive_preserved_review_required');
    expect(f.runtime.store.documentNextRequiredAction(42)).toMatch(/Art Director review required/);
  });

  it('cannot retire history or publish closure with a mismatched semantic snapshot identity', async () => {
    const f = restoreFixture();
    f.runtime.store.updatePaintingState(42, current => {
      const changed = structuredClone(current);
      changed.primary_artistic_anchor.restore_snapshot.semantic_state.anchor_sha256 = '0'.repeat(64);
      return changed;
    });
    await expect(f.runtime.cycle({ next_pass: { request_key: 'restore-wrong-semantics', document_id: 42,
      goal: 'Restore the retained anchor.', restore_anchor_operation_id: 'anchor-op' } })).rejects.toThrow('semantic_snapshot_mismatch');
    expect(f.runtime.store.read('later-second-pass').rolled_back).not.toBe(true);
    expect(f.runtime.store.read('restore-wrong-semantics').verdict).toBeUndefined();
    expect(f.runtime.store.visualBarrier(42)).toBeTruthy();
  });

  it('restores mutable scene facts from the exact anchor while keeping current preferences and failure history', async () => {
    const retained = { current_stage: 'FORM', active_scale: 'medium', active_problem: { problem_id: 'retained-form' },
      visual_problems: { 'retained-form': { status: 'open' } }, owner_representation_state: { subject: { state: 'scaffold-debt' } },
      physical_stack_check: { status: 'pending', observed: false }, last_critique: { operation_id: 'anchor-op' } };
    const f = restoreFixture({ semanticState: retained });
    f.runtime.store.updatePaintingState(42, current => ({ ...current, current_stage: 'DETAIL', active_scale: 'small',
      active_problem: { problem_id: 'discarded-polish' }, visual_problems: {}, owner_representation_state: { discarded: { state: 'resolved' } },
      physical_stack_check: { status: 'pass', observed: true }, last_critique: { operation_id: 'later-second-pass' },
      confirmed_goal_frame: { operation_id: 'later-second-pass' }, relation_review: { operation_id: 'later-second-pass' },
      commentary_detail: 'detailed', frame_counter: 77 }));
    const originalVerdict = structuredClone(f.runtime.store.read('later-second-pass').verdict);
    await f.runtime.cycle({ next_pass: { request_key: 'restore-mutable-scene', document_id: 42,
      goal: 'Restore the accepted scene and its unresolved form task.', restore_anchor_operation_id: 'anchor-op' } });
    const state = f.runtime.store.paintingState().documents['42'];
    expect(state).toMatchObject({ ...retained, commentary_detail: 'detailed', frame_counter: 77,
      last_anchor_restore: { semantic_state_restored: true } });
    expect(state.confirmed_goal_frame).toBeUndefined();
    expect(state.relation_review).toBeUndefined();
    expect(f.runtime.store.read('later-second-pass').verdict).toEqual(originalVerdict);
    const restarted = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: path.join(f.dir, 'controller'), workspaceRoot: f.dir });
    expect(restarted.store.paintingState().documents['42']).toMatchObject(retained);
    expect(f.undoCalls).toHaveLength(1);
  });

  it('keeps closure pending after interrupted mutable-state persistence and completes without another undo', async () => {
    const f = restoreFixture({ semanticState: { current_stage: 'FORM' } });
    f.runtime.store.updatePaintingState(42, current => ({ ...current, current_stage: 'DETAIL' }));
    const finalize = vi.spyOn(f.runtime.store, 'finalizeAcceptedAnchorRestore');
    const update = f.runtime.store.updatePaintingState.bind(f.runtime.store);
    const interrupted = vi.spyOn(f.runtime.store, 'updatePaintingState').mockImplementation((id, updater) => {
      const candidate = updater(f.runtime.store.paintingState().documents[String(id)] ?? {});
      if (candidate.last_anchor_restore?.restore_operation_id === 'restore-mutable-interruption') throw new Error('simulated mutable state interruption');
      return update(id, updater);
    });
    await expect(f.runtime.cycle({ next_pass: { request_key: 'restore-mutable-interruption', document_id: 42,
      goal: 'Restore accepted mutable state.', restore_anchor_operation_id: 'anchor-op' } })).rejects.toThrow('simulated mutable state interruption');
    expect(f.runtime.store.read('restore-mutable-interruption').verdict).toBeUndefined();
    expect(f.runtime.store.visualBarrier(42)).toBeTruthy();
    expect(f.runtime.store.paintingState().documents['42'].current_stage).toBe('DETAIL');
    interrupted.mockRestore();
    f.runtime.store.finalizeAcceptedAnchorRestore('restore-mutable-interruption', finalize.mock.calls[0][1]);
    expect(f.runtime.store.paintingState().documents['42'].current_stage).toBe('FORM');
    expect(f.runtime.store.visualBarrier(42)).toBeFalsy();
    expect(f.undoCalls).toHaveLength(1);
  });
  it('retires only the proven restored suffix and recovers retained owner/model authority after restart', async () => {
    const f = restoreFixture();
    addOwnerHistory(f);
    expect(f.runtime.store.semanticLayerOwners(42)).toHaveLength(2);
    expect(f.runtime.store.sceneGeometryModel(42)?.revision).toBe(2);
    await f.runtime.cycle({ next_pass: {
      request_key: 'restore-owner-authority', document_id: 42, goal: 'Restore the retained owner and its construction.',
      restore_anchor_operation_id: 'anchor-op',
    } });
    expect(f.undoCalls).toHaveLength(1);
    expect(f.runtime.store.read('anchor-op').rolled_back).not.toBe(true);
    for (const id of ['later-multi-history', 'later-second-pass']) {
      const source = f.runtime.store.read(id);
      expect(source.rolled_back).toBe(true);
      expect(source.current_frame_authority).toBe(false);
      expect(source.rollback).toMatchObject({ completed: true, rollback_operation_id: 'restore-owner-authority' });
      expect(f.runtime.store.read(id).verdict.target_resolved).toBe('yes');
    }
    const restarted = new EmbeddedGuardRuntime(new ToolRegistry(), {
      runtimeDirectory: path.join(f.dir, 'controller'), workspaceRoot: f.dir,
      previewBarrierDirectory: path.join(f.dir, 'barriers'), executionLeaseFile: path.join(f.dir, 'execution.lock'),
    });
    expect(restarted.store.semanticLayerOwners(42)).toEqual([expect.objectContaining({
      hypothesis_id: 'subject-owner', layer_id: 11, hypothesis: 'Retained modeled subject', construction_revision: 'anchor-op',
      geometry_binding: expect.objectContaining({ scene_geometry_revision: 1 }),
    })]);
    expect(restarted.store.sceneGeometryModel(42)).toMatchObject({ revision: 1, source_operation_id: 'anchor-op' });
    expect(restarted.store.artisticRecoveryForProblem(42, 'subject-form-problem', undefined)).toMatchObject({
      attempt_count: 2, strongest_known_frame: null,
    });
  });

  it('keeps interrupted semantic retirement incomplete and repairs it without a second Photoshop undo', async () => {
    const f = restoreFixture();
    addOwnerHistory(f);
    const finalize = vi.spyOn(f.runtime.store, 'finalizeAcceptedAnchorRestore');
    const write = f.runtime.store.write.bind(f.runtime.store);
    const interruptedWrite = vi.spyOn(f.runtime.store, 'write').mockImplementation(row => {
      if (row.id === 'later-second-pass' && row.rolled_back === true) throw new Error('simulated semantic journal interruption');
      return write(row);
    });
    await expect(f.runtime.cycle({ next_pass: {
      request_key: 'restore-interrupted-semantics', document_id: 42, goal: 'Restore the accepted subject state.',
      restore_anchor_operation_id: 'anchor-op',
    } })).rejects.toThrow('simulated semantic journal interruption');
    expect(f.runtime.store.read('restore-interrupted-semantics').verdict).toBeUndefined();
    expect(f.runtime.store.visualBarrier(42)).toBeTruthy();
    expect(f.runtime.store.read('later-second-pass').rolled_back).not.toBe(true);
    interruptedWrite.mockRestore();
    // The already verified fixture state has not changed; repair journal completion only.
    const verification = finalize.mock.calls[0][1];
    f.runtime.store.finalizeAcceptedAnchorRestore('restore-interrupted-semantics', verification);
    expect(f.undoCalls).toHaveLength(1);
    expect(f.runtime.store.read('later-second-pass').rolled_back).toBe(true);
    expect(f.runtime.store.visualBarrier(42)).toBeFalsy();
    expect(f.runtime.store.semanticLayerOwners(42)[0].layer_id).toBe(11);
  });

  it('exposes restore and restore-snapshot registration on the compact public Guard schema', () => {
    const f = restoreFixture();
    const tools = createGuardTools(f.runtime);
    const cycle = tools.find(definition => definition.tool.name === 'photoshop_guard_cycle_auto')!.tool as any;
    const artDirector = tools.find(definition => definition.tool.name === 'photoshop_guard_art_director')!.tool as any;
    expect(cycle.inputSchema.properties.next_pass.properties.restore_anchor_operation_id).toBeTruthy();
    expect(cycle.inputSchema.properties.next_pass.required).not.toContain('actions');
    expect(artDirector.inputSchema.properties.anchor_decision.properties.capture_restore_state).toBeTruthy();
  });

  it('captures normalized pinned layer/active-layer/selection state through the runtime read path', async () => {
    const f = restoreFixture();
    const snapshot = await (f.runtime as any).captureAnchorRestoreSnapshot(42);
    expect(snapshot).toMatchObject({
      protocol: 'photoshop.guard.anchor_restore_snapshot.v1',
      document_id: 42,
      layer_count: 2,
      active_layer: { id: 11, name: 'Paint', opacity: 82 },
      selection: {
        has_selection: true,
        bounds: { left: 5, top: 6, right: 24, bottom: 25 },
      },
    });
    expect(snapshot.layers.map((layer: any) => layer.id)).toEqual([11, 10]);
  });

  it('restores an older accepted anchor in one compact Guard request with internal history arithmetic and exact state verification', async () => {
    const f = restoreFixture();
    const response = await f.runtime.cycle({
      next_pass: {
        request_key: 'restore-anchor-request-01',
        document_id: 42,
        goal: 'Restore the last registered accepted artistic anchor exactly.',
        restore_anchor_operation_id: 'anchor-op',
      },
    });

    expect(f.undoCalls).toHaveLength(1);
    expect(f.undoCalls[0]).toMatchObject({ document_id: 42, steps: 5 });
    expect(f.previewCalls.at(-1)).toMatchObject({
      document_id: 42,
      max_dimension_px: 1000,
      quality: 8,
    });
    expect(response.accepted_anchor_restore).toMatchObject({
      completed: true,
      anchor_operation_id: 'anchor-op',
      anchor_sha256: f.anchor.sha256,
      exact_preview_sha_restored: true,
      semantic_state_restored: true,
      semantic_restore_scope: expect.arrayContaining(['current_stage', 'active_problem', 'owner_representation_state']),
      director_restore_scope: 'exact_directive_revision',
      mutation_replayed: false,
      model_supplied_undo_steps: false,
      state_verification: {
        matches: true,
        layer_state_matches: true,
        active_layer_matches: true,
        selection_matches: true,
      },
    });
    const restoreRecord = f.runtime.store.read('restore-anchor-request-01')!;
    expect(restoreRecord.preview_args).toEqual({ max_dimension_px: 1000, quality: 8 });
    expect(restoreRecord.preview.sha256).toBe(f.anchor.sha256);
    expect(restoreRecord.report).toBeTruthy();
    expect(restoreRecord.operation_ack).toBeTruthy();
    expect(restoreRecord.verdict?.recovery).toMatchObject({
      anchor_operation_id: 'anchor-op',
      anchor_sha256: f.anchor.sha256,
    });
    expect(f.runtime.store.artRunState(42, undefined)?.last_anchor_restore).toMatchObject({
      restore_operation_id: 'restore-anchor-request-01',
      anchor_operation_id: 'anchor-op',
      anchor_sha256: f.anchor.sha256,
    });
    const status = f.runtime.status() as any;
    expect(status.pending_reports).toEqual([]);
    expect(status.pending_operation_acks).toEqual([]);
    expect(status.pending_visual_verdicts).toEqual([]);
    expect(status.uncertain).toEqual([]);
    expect(status.documents['42'].visual_barrier).toBeNull();
  });

  it('rejects a missing or stale anchor before any Photoshop undo dispatch', async () => {
    const missing = restoreFixture();
    const missingResponse = await missing.runtime.cycle({
      next_pass: {
        request_key: 'restore-missing-anchor',
        document_id: 42,
        goal: 'Restore a missing anchor.',
        restore_anchor_operation_id: 'not-an-anchor',
      },
    });
    expect(missing.undoCalls).toHaveLength(0);
    expect(JSON.stringify(missingResponse)).toMatch(/accepted_anchor_restore_unknown_anchor/);

    const stale = restoreFixture({ staleAnchor: true });
    const staleResponse = await stale.runtime.cycle({
      next_pass: {
        request_key: 'restore-stale-anchor',
        document_id: 42,
        goal: 'Restore a stale anchor.',
        restore_anchor_operation_id: 'anchor-op',
      },
    });
    expect(stale.undoCalls).toHaveLength(0);
    expect(JSON.stringify(staleResponse)).toMatch(/accepted_anchor_restore_stale_anchor/);
  });

  it('rejects ambiguous later undo history and rejects restore requests mixed with new actions before dispatch', async () => {
    const ambiguous = restoreFixture();
    ambiguous.runtime.store.write({
      id: 'manual-later-undo',
      tool: 'photoshop_undo',
      args: { document_id: 42, steps: 1 },
      summary: 'Later undo makes history ambiguous.',
      purpose: 'Task 21a ambiguity fixture.',
      hash: 'manual-later-undo',
      sequence: 4,
      created_at: '2026-09-25T00:00:04.000Z',
      completed_at: '2026-09-25T00:00:04.100Z',
      phase: 'completed',
      execution: 'completed',
      visual: true,
      failed: false,
      report: {
        did: 'Executed a later undo.',
        why: 'Create an ambiguous history branch for the restore test.',
        result: 'History no longer has a simple forward-only journal suffix.',
      },
      verdict: {
        verdict: 'neutral',
        disposition: 'accept',
        target_resolved: 'yes',
        significance: { execution_effect: 'material' },
      },
    });
    const ambiguousResponse = await ambiguous.runtime.cycle({
      next_pass: {
        request_key: 'restore-ambiguous-history',
        document_id: 42,
        goal: 'Restore without guessing across an existing undo branch.',
        restore_anchor_operation_id: 'anchor-op',
      },
    });
    expect(ambiguous.undoCalls).toHaveLength(0);
    expect(JSON.stringify(ambiguousResponse)).toMatch(/accepted_anchor_restore_ambiguous_history/);

    const mixed = restoreFixture();
    const mixedResponse = await mixed.runtime.cycle({
      next_pass: {
        request_key: 'restore-with-extra-action',
        document_id: 42,
        goal: 'Restore only; no new mutation may be bundled into this recovery.',
        restore_anchor_operation_id: 'anchor-op',
        actions: [{ id: 'extra', tool: 'photoshop_undo', args: { steps: 1 } }],
      },
    });
    expect(mixed.undoCalls).toHaveLength(0);
    expect(JSON.stringify(mixedResponse)).toMatch(/accepted_anchor_restore_actions_forbidden/);
  });

  it('does not declare recovery complete when post-undo layered state differs from the registered snapshot', async () => {
    const f = restoreFixture({ parityMismatch: true });
    addOwnerHistory(f);
    f.runtime.store.updatePaintingState(42, current => ({ ...current, pending_rollback: {
      operation_id: 'later-second-pass', required_undo_steps: 5, remaining_undo_steps: 5,
    } }));
    await expect(f.runtime.cycle({
      next_pass: {
        request_key: 'restore-parity-mismatch',
        document_id: 42,
        goal: 'Restore anchor but reject wrong active-layer state.',
        restore_anchor_operation_id: 'anchor-op',
      },
    })).rejects.toThrow(/accepted_anchor_restore_state_mismatch/);
    expect(f.undoCalls).toHaveLength(1);
    const recordAfter = f.runtime.store.read('restore-parity-mismatch')!;
    expect(recordAfter.verdict).toBeUndefined();
    expect(recordAfter.operation_receipt).toBeTruthy();
    expect(f.runtime.store.read('later-second-pass').rollback).toBeUndefined();
    expect(f.runtime.store.read('later-multi-history').rolled_back).not.toBe(true);
    expect(f.runtime.store.sceneGeometryModel(42)?.revision).toBe(2);
    expect(f.runtime.store.paintingState().documents['42'].pending_rollback.operation_id).toBe('later-second-pass');
  });

  it('derives the same restore depth from the same degraded fixture after Guard restart', () => {
    const f = restoreFixture();
    const before = f.runtime.store.planAcceptedAnchorRestore(42, 'anchor-op', undefined, undefined);
    const restarted = new EmbeddedGuardRuntime((f.runtime as any).registry ?? new ToolRegistry(), {
      runtimeDirectory: path.join(f.dir, 'controller'),
      previewBarrierDirectory: path.join(f.dir, 'barriers'),
      executionLeaseFile: path.join(f.dir, 'execution.lock'),
      workspaceRoot: f.dir,
    });
    const after = restarted.store.planAcceptedAnchorRestore(42, 'anchor-op', undefined, undefined);
    expect(after.required_undo_steps).toBe(before.required_undo_steps);
    expect(after.history_operation_ids).toEqual(before.history_operation_ids);
  });
});
