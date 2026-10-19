import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { SessionStore, bindPreviewDocument } from '../src/core/guard/session-store.js';
import { nativeLayers, projectFileIdentity, restoredProjectRecords, sha256Bytes, verifyProjectCheckpoint } from '../src/core/guard/project-checkpoint.js';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
const witness = (id: number) => ({ protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: `host-${id}`, token: `host-${id}:document` });

// Simulated native receipts only. Real PSD/native acceptance is recorded
// separately; these tests exercise durable authority and interrupted recovery.
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'project-checkpoint-')); directories.push(dir);
  const s = new SessionStore(path.join(dir, 'controller'), { workspaceRoot: dir });
  s.observeDocumentInstance(42, witness(42));
  const file = path.join(dir, 'project.psd'); writeFileSync(file, 'simulated native PSD bytes');
  const frame = path.join(dir, 'frame.jpg');
  const image = jpeg.encode({ width: 16, height: 16, data: Buffer.alloc(16 * 16 * 4, 180) }, 90).data;
  writeFileSync(frame, image);
  const preview = { ok: true, sha256: sha256Bytes(image), width: 16, height: 16,
    canvas_width: 16, canvas_height: 16, materialized_path: frame, document_id: 42, mime_type: 'image/jpeg' };
  const owner = { hypothesis_id: 'sky', hypothesis: 'Independent flat field', layer_id: 2, layer_name: 'Sky',
    physical_layer_ids: [2], physical_role: 'atmosphere', opacity_role: 'effect-only', component_space: 'canvas',
    rollback_value: 'moderate', decision: 'create-new', temporary: false };
  const plan = { protocol: 'photoshop.guard.scene_ownership_plan.v1', plan_id: 'chart',
    units: [{ semantic_id: 'sky-unit', owner_id: 'sky', role: 'Flat graphic field', editability: 'continuous-field', edit_axes: ['color', 'rollback'] }],
    shared_owner_justifications: [] };
  s.write({ id: 'paint', sequence: 1, created_at: new Date().toISOString(), tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42, logical_layer: owner }, scene_ownership_plan: plan,
    phase: 'completed', dispatched: true, failed: false, visual: true, preview,
    verdict: { disposition: 'accept', target_resolved: 'yes' }, report: { did: 'Painted field' }, operation_ack: {},
    result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, document_target: { id: 42 }, continuation_layers: [owner] }) }] },
  } as any);
  s.updatePaintingState(42, current => ({ ...current, current_stage: 'GLOBAL_BLOCK_IN', original_brief: 'Flat test chart',
    current_frame: { operation_id: 'paint', sha256: preview.sha256, accepted: true } }));
  const save: any = { id: 'save', sequence: 2, created_at: new Date().toISOString(), tool: 'photoshop_save_document', args: { document_id: 42, path: file, format: 'PSD' },
    phase: 'completed', dispatched: true, failed: false, visual: false, checkpoint: file, result: { content: [] } };
  s.write(save);
  const layers = [{ id: 2, name: 'Sky', kind: 'LayerKind.NORMAL', parent: null, isBackground: false,
    bounds: { left: 0, top: 0, right: 16, bottom: 16 } }];
  const observation = { file: projectFileIdentity(file), witness: witness(42), preview, layers };
  const reference = s.writeProjectCheckpoint('save', observation, { quality: 8, max_dimension_px: 16 });
  const checkpoint = s.loadProjectCheckpoint(reference);
  const open = () => {
    const r: any = { id: 'open', sequence: 3, created_at: new Date().toISOString(), tool: 'photoshop_open_image', args: { filePath: file }, dispatched: true, visual: false };
    return s.complete(r, { content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { document: { id: 43 } } }) }] });
  };
  return { s, dir, file, observation, checkpoint, reference, open };
}

describe('saved project lifecycle authority', () => {
  it('uses the native pinned preview envelope without losing or contradicting document identity', () => {
    const native = { sha256: 'x', materialized_path: 'native.jpg', document_target: { id: 43, pinned: true } };
    expect(bindPreviewDocument(native, 43)).toMatchObject({ document_id: 43, document_target: { id: 43 } });
    expect(() => bindPreviewDocument(native, 42)).toThrow(/document_target/);
    expect(() => bindPreviewDocument({ ...native, document_id: 42 }, 43)).toThrow(/document_id/);
  });
  it('restores receipt-proven owners into a new incarnation without rewriting old native receipts or borrowing old Undo history', () => {
    const f = fixture(); const original = f.s.read('paint'); f.open();
    const restored = f.s.restoreProjectCheckpoint('open', f.reference, { ...f.observation,
      preview: { ...f.observation.preview, document_id: 43 }, witness: witness(43) });
    expect(restored).toMatchObject({ visual: true, args: { document_id: 43 }, native_history_available: false,
      project_recovery: { status: 'verified', source_document_id: 42 } });
    expect(f.s.semanticLayerOwners(43)).toContainEqual(expect.objectContaining({ hypothesis_id: 'sky', layer_id: 2 }));
    expect(f.s.sceneOwnershipPlan(43)?.units[0].owner_id).toBe('sky');
    expect(f.s.read('paint')).toEqual(original);
    expect(f.s.paintingState().documents['43'].accepted_frame).toBeUndefined();
    const restarted = new SessionStore(path.join(f.dir, 'controller'), { workspaceRoot: f.dir });
    expect(restarted.semanticLayerOwners(43)).toEqual(f.s.semanticLayerOwners(43));
    expect(restarted.currentDocumentRecords(43).filter(r => r.checkpoint_origin)).toHaveLength(1);
    expect(restarted.collectPreflightErrors({ id: 'bad-undo', tool: 'photoshop_undo', args: { document_id: 43, steps: 1 } }))
      .toContain('project_checkpoint_native_history_unavailable: reopened projects do not inherit old Photoshop Undo history; retain the restored frame and continue on owned layers');
  });
  it.each(['file', 'pixels', 'layer-id', 'layer-name', 'topology', 'witness', 'owner'])('rejects altered %s before registering any restored owner', mutation => {
    const f = fixture(); f.open();
    const observation: any = structuredClone({ ...f.observation, witness: witness(43) });
    const checkpoint = structuredClone(f.checkpoint);
    if (mutation === 'file') observation.file.sha256 = 'different';
    if (mutation === 'pixels') observation.preview.sha256 = 'different';
    if (mutation === 'layer-id') observation.layers[0].id = 7;
    if (mutation === 'layer-name') observation.layers[0].name = 'Different';
    if (mutation === 'topology') observation.layers[0].parent = 7;
    if (mutation === 'witness') observation.witness = {};
    if (mutation === 'owner') checkpoint.owners[0].layer_id = 7, checkpoint.owners[0].physical_layer_ids = [7];
    expect(() => verifyProjectCheckpoint(checkpoint, observation)).toThrow(/project_checkpoint_/);
    expect(f.s.semanticLayerOwners(43)).toEqual([]);
  });
  it('keeps an interrupted restore retryable and its projected timeline pure', () => {
    const f = fixture(); const before = structuredClone(f.checkpoint); f.open();
    const observed = { ...f.observation, preview: { ...f.observation.preview, document_id: 43 }, witness: witness(43) };
    for (let i = 0; i < 4; i++) {
      const view = restoredProjectRecords(f.checkpoint, 43, witness(43).token, 'open');
      expect(view[0].args.document_id).toBe(43);
      expect(f.checkpoint).toEqual(before);
    }
    f.s.restoreProjectCheckpoint('open', f.reference, observed);
    f.s.restoreProjectCheckpoint('open', f.reference, observed);
    expect(f.s.semanticLayerOwners(43)).toHaveLength(1);
    expect(f.s.records().filter(r => r.id === 'paint')).toHaveLength(1);
  });
  it('parses real layer envelopes and rejects duplicate physical ids', () => {
    const result: any = { content: [{ text: JSON.stringify({ ok: true, document_target: { id: 42 },
      details: { layers: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }] } }) }] };
    expect(() => nativeLayers(result, 42)).toThrow('project_checkpoint_layer_identity_ambiguous');
  });
});
