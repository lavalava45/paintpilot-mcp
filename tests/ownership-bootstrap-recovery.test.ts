import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { compileMinimalOwnerBootstrap } from '../src/core/guard/ownership-bootstrap-compiler.js';

const tempRoots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

function run() {
  const dir = mkdtempSync(path.join(tmpdir(), 'owner-atomic-recovery-'));
  tempRoots.push(dir);
  const store = new SessionStore(path.join(dir, 'controller'), {
    workspaceRoot: dir, visualBarrierDirectory: path.join(dir, 'barriers'),
  });
  const raw = {
    request_key: 'first-component', document_id: 42,
    logical_layer: { decision: 'create-new', hypothesis_id: 'component-1',
      layer_name: 'Component', component_space: 'canvas' },
    action_class: 'ADD', construction_role: 'continuous-field',
    visual_intent: 'continuous-field',
    actions: [{ id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Component' } },
      { id: 'field', tool: 'photoshop_paint_color_gradient',
        args: { layer_id: '$steps.layer.details.layerId' } }],
  };
  const plan = compileMinimalOwnerBootstrap(raw).pass.scene_ownership_plan;
  expect(plan).toBeDefined();
  return { store, plan };
}

function authoredRecord(plan: unknown, updates: Record<string, unknown> = {}) {
  return {
    id: 'first-component', sequence: 10,
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42, logical_layer: { decision: 'create-new',
      hypothesis_id: 'component-1' } },
    scene_ownership_plan: plan,
    phase: 'completed', failed: false, execution: 'completed',
    ...updates,
  };
}

const result = (continuationLayers: unknown[] = []) => ({
  content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: continuationLayers }) }],
});

describe('atomic bootstrap durability and Stop/failure', () => {
  it('never treats preflight, queued, Stop, failed or uncertain proposals as committed owners', () => {
    const { store, plan } = run();
    for (const changes of [
      { phase: 'queued' }, { phase: 'prepared' },
      { phase: 'completed', failed: true, execution: 'not-executed' },
      { phase: 'completed', failed: true, execution: 'uncertain' },
      { phase: 'completed', failed: false, execution: 'not-executed' },
      { phase: 'completed', failed: false, execution: 'uncertain' },
      { phase: 'completed', failed: false, execution: 'completed', result: result() },
      { phase: 'completed', failed: false, execution: 'completed', rolled_back: true },
      { phase: 'completed', failed: false, execution: 'completed', current_frame_authority: false },
    ]) {
      vi.spyOn(store as any, 'currentDocumentRecords').mockReturnValueOnce([authoredRecord(plan, changes)]);
      expect(store.sceneOwnershipPlan(42), JSON.stringify(changes)).toBeNull();
    }
  });

  it('keeps a completed and authority-valid plan after successful native creation', () => {
    const { store, plan } = run();
    vi.spyOn(store as any, 'currentDocumentRecords').mockReturnValueOnce([authoredRecord(plan, {
      result: result([{ hypothesis_id: 'component-1', layer_id: 83, decision: 'create-new' }]),
    })]);
    expect(store.sceneOwnershipPlan(42)).toMatchObject({
      ...plan as Record<string, unknown>, source_operation_id: 'first-component',
    });
  });

  it('keeps only the recoverably proved partial-creation plan, not an unknown or empty partial result', () => {
    const { store, plan } = run();
    const partial = { phase: 'completed', execution: 'partial', resolved: { outcome: 'partial' },
      args: { document_id: 42, logical_layer: {
        hypothesis_id: 'component-1', decision: 'create-new',
      } } };
    vi.spyOn(store as any, 'currentDocumentRecords').mockReturnValueOnce([authoredRecord(plan, {
      ...partial, result: result(),
    })]);
    expect(store.sceneOwnershipPlan(42)).toBeNull();
    vi.spyOn(store as any, 'currentDocumentRecords').mockReturnValueOnce([authoredRecord(plan, {
      ...partial, result: result([{ hypothesis_id: 'component-1', layer_id: 83, decision: 'create-new' }]),
    })]);
    expect(store.sceneOwnershipPlan(42)?.units[0]?.owner_id).toBe('component-1');
    vi.spyOn(store as any, 'currentDocumentRecords').mockReturnValueOnce([authoredRecord(plan, {
      ...partial, failed: true,
      result: result([{ hypothesis_id: 'component-1', layer_id: 83, decision: 'create-new' }]),
    })]);
    expect(store.sceneOwnershipPlan(42)?.units[0]?.owner_id).toBe('component-1');
  });

  it('ignores an earlier failed plan when a later successful plan is available', () => {
    const { store, plan } = run();
    vi.spyOn(store as any, 'currentDocumentRecords').mockReturnValueOnce([
      authoredRecord(plan, { id: 'latest-failed', sequence: 20, phase: 'completed',
        failed: true, execution: 'not-executed' }),
      authoredRecord(plan, { id: 'original-valid', sequence: 10,
        result: result([{ hypothesis_id: 'component-1', layer_id: 83, decision: 'create-new' }]) }),
    ]);
    expect(store.sceneOwnershipPlan(42)?.source_operation_id).toBe('original-valid');
  });
});
