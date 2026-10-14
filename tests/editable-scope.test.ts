import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { editableScopeRequest, validateEditableScopeReview, editableOwnerScopeIssue, persistEditableScopeReview } from '../src/core/guard/editable-scope.js';
import { normalizeSceneOwnershipPlan, extendSceneOwnershipPlan, sceneComponentScopeIssue } from '../src/core/scene-ownership-plan.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { documentArtisticDebt } from '../src/core/guard/document-artistic-debt.js';

const unit = (id: string) => ({ semantic_id: id, owner_id: id, role: `Visible ${id}`, editability: 'independent', edit_axes: ['visibility', 'color', 'rollback'] });
const object = (id: string) => ({ object_id: id, subject_kind: 'single-component', kind: 'single-part', component_semantic_ids: [id] });
const plan = normalizeSceneOwnershipPlan({ plan_id: 'arbitrary-scene', units: [unit('whole')], objects: [object('whole')] });
const owners = [{ hypothesis_id: 'whole', layer_id: 2 }];
const record = { id: 'pass-1', visual: true, args: { document_id: 850, logical_layer: { hypothesis_id: 'whole' } }, preview: { sha256: 'exact-frame' } };
const state = { original_brief: 'A cafe with independently editable doors and glazing', document_incarnation_id: 'incarnation-1' };
const request = editableScopeRequest(record, state, plan, owners)!;

it('accepts an exact explicitly expanded review when the ordinary checkpoint covers one owner', () => {
  const store = Object.create(SessionStore.prototype) as SessionStore;
  const nextRecord = { ...record, id: 'partial-preparation' };
  const priorState = { ...state, editable_scope_review: { topology_signature: request.topology_signature,
    operation_id: record.id, scope: 'whole-scene' } };
  vi.spyOn(store, 'paintingState').mockReturnValue({ documents: { '850': priorState } } as any);
  vi.spyOn(store, 'read').mockReturnValue(nextRecord as any);
  vi.spyOn(store, 'sceneOwnershipPlan').mockReturnValue(plan as any);
  vi.spyOn(store, 'semanticLayerOwners').mockReturnValue(owners as any);
  vi.spyOn(store, 'currentDocumentIncarnationId').mockReturnValue(state.document_incarnation_id);
  vi.spyOn(store, 'chatCriticRequest').mockReturnValue(undefined);
  try {
    const local = store.editableScopeRequest(nextRecord.id)!;
    const whole = store.editableScopeRequest(nextRecord.id, undefined, true)!;
    expect(local.scope).toBe('touched-owner');
    const review = { request_id: whole.request_id, parts: whole.parts.map(part => ({
      semantic_id: part.semantic_id, layer_id: part.layer_id, status: 'unknown', visible: 'No isolated pixel evidence for this retained component.' })), unmapped_parts: [] };
    expect(store.validateEditableScope(nextRecord, { editable_scope_review: review }).review.scope).toBe('whole-scene');
    expect(() => store.validateEditableScope(nextRecord, { editable_scope_review: { ...review, request_id: 'foreign-frame' } }))
      .toThrow('editable_scope_review_binding_mismatch');
    expect(() => store.validateEditableScope(nextRecord, { editable_scope_review: { ...review, request_id: local.request_id } }, true))
      .toThrow('editable_scope_review_binding_mismatch');
  } finally { vi.restoreAllMocks(); }
});

it('recovers a reconciled dedicated creation receipt without replay or certifying painted pixels', () => {
  const store = Object.create(SessionStore.prototype) as SessionStore;
  const partial: any = { id: 'partial-layer', phase: 'completed', failed: false, execution: 'partial',
    resolved: { outcome: 'partial' }, args: { document_id: 850,
      logical_layer: { decision: 'create-new', hypothesis_id: 'whole' },
      steps: [{ id: 'create', tool: 'photoshop_create_layer' }] },
    result: { content: [{ type: 'text', text: JSON.stringify({ steps: [{ id: 'create', tool: 'photoshop_create_layer', ok: true, execution: 'completed' }],
      completed_results: { create: { ok: true, document_target: { id: 850, pinned: true }, details: { layerId: 19 } } } }) }] } };
  vi.spyOn(store, 'currentDocumentRecords').mockReturnValue([partial]);
  try {
    expect(store.semanticLayerOwners(850, [partial])).toMatchObject([{ hypothesis_id: 'whole', layer_id: 19 }]);
    partial.execution = 'uncertain';
    expect(store.semanticLayerOwners(850, [partial])).toEqual([]);
    partial.execution = 'partial';
    partial.result.content[0].text = partial.result.content[0].text.replace('"id":850', '"id":999');
    expect(store.semanticLayerOwners(850, [partial])).toEqual([]);
  } finally { vi.restoreAllMocks(); }
});
const report = (req = request) => ({ request_id: req.request_id,
  parts: req.parts.map(part => ({ semantic_id: part.semantic_id, layer_id: part.layer_id, status: part.layer_id ? 'independent' : 'missing', visible: 'Isolated component preview confirms its actual pixel extent.' })),
  unmapped_parts: [] as { owner_id: string; visible: string }[], replacements: [] as { owner_id: string; semantic_ids: string[] }[] });

it('freezes a false single-component claim discovered on pixels and preserves its bindings during repair', () => {
  expect(sceneComponentScopeIssue(plan, 'whole')).toBeUndefined(); // no noun/contour classifier
  const value = report(); value.unmapped_parts.push({ owner_id: 'whole', visible: 'Door and glazing need independent visibility and material edits but share this raster.' });
  const review = validateEditableScopeReview(value, request, state)!;
  expect(editableOwnerScopeIssue(review.debt, 'whole')?.code).toBe('scene_editable_scope_blocked');
  expect(documentArtisticDebt({ ...state, ...persistEditableScopeReview(review) })).toContain('editable_scope_unresolved');
  const falsePass = validateEditableScopeReview(report(), request, { ...state, editable_scope_debt: review.debt })!;
  expect(falsePass.debt.whole.frozen).toBe(true);
  expect(() => validateEditableScopeReview(report(), request, { ...state, editable_scope_debt: review.debt }, { criteria: { editable_parts: 'pass' } })).toThrow('completion_unproven');
  const enriched = normalizeSceneOwnershipPlan({ ...plan, units: plan.units.map(row => ({ ...row, rationale: 'Preserve binding while adding editing rights.' })) });
  const legacy = normalizeSceneOwnershipPlan({ ...enriched, units: enriched.units.map(({ edit_axes, ...row }) => row) });
  expect(sceneComponentScopeIssue(legacy, 'whole')?.code).toBe('scene_editable_inventory_required');
  expect(extendSceneOwnershipPlan(legacy, enriched).units).toEqual(enriched.units);
  expect(() => extendSceneOwnershipPlan(plan, normalizeSceneOwnershipPlan({ ...plan, units: [{ ...plan.units[0], owner_id: 'different' }] }))).toThrow('conflict');
});

it('binds review to exact frame, incarnation, complete inventory and actual layers; unknown never certifies completion', () => {
  for (const changed of [ { ...record, preview: { sha256: 'different-frame' } }, record ]) {
    const req = editableScopeRequest(changed, changed === record ? { ...state, document_incarnation_id: 'different' } : state, plan, owners)!;
    expect(() => validateEditableScopeReview(report(), req, state)).toThrow('review_binding_mismatch');
  }
  expect(() => validateEditableScopeReview(undefined, undefined, state, { criteria: { editable_parts: 'pass' } })).toThrow('plan_required');
  const scaffold = normalizeSceneOwnershipPlan({ ...plan, units: [{ ...plan.units[0], editability: 'temporary' }] });
  const scaffoldRequest = editableScopeRequest(record, state, scaffold, owners, true)!;
  const scaffoldReport = report(scaffoldRequest); scaffoldReport.parts[0].status = 'reference';
  expect(() => validateEditableScopeReview(scaffoldReport, scaffoldRequest, state, { criteria: { editable_parts: 'pass' } })).toThrow('completion_unproven');
  const forged = report(); forged.parts[0].layer_id = 8;
  expect(() => validateEditableScopeReview(forged, request, state)).toThrow('review_invalid');
  expect(() => validateEditableScopeReview({ ...report(), parts: [] }, request, state)).toThrow('review_incomplete');
  const uncertain = report(); uncertain.parts[0].status = 'unknown';
  expect(() => validateEditableScopeReview(uncertain, request, state, { criteria: { editable_parts: 'pass' } })).toThrow('completion_unproven');
  const accepted = validateEditableScopeReview(report(), request, state)!;
  const retained = { ...state, ...persistEditableScopeReview(accepted) };
  expect(editableScopeRequest(record, retained, plan, owners)?.request_id).toBe(request.request_id); // revalidation after closure
  const next = editableScopeRequest({ ...record, id: 'pass-2' }, retained, plan, owners)!;
  expect(next.scope).toBe('touched-owner');
  expect(validateEditableScopeReview(report(next), next, retained)?.debt).toEqual({}); // any number of marks, one part
});

it('accepts visually confirmed additive replacements on new layers while the original raster stays frozen', () => {
  const initial = report(); initial.parts[0].status = 'combined';
  const debt = validateEditableScopeReview(initial, request, state)!.debt;
  const expanded = extendSceneOwnershipPlan(plan, normalizeSceneOwnershipPlan({ ...plan,
    units: [...plan.units, unit('door'), unit('glazing')], objects: [...plan.objects!, object('door'), object('glazing')] }));
  const nextRecord = { ...record, id: 'pass-2', args: { ...record.args, logical_layer: { hypothesis_id: 'door' } } };
  const pendingRequest = editableScopeRequest(nextRecord, { ...state, editable_scope_debt: debt }, expanded, owners)!;
  const pending = report(pendingRequest); pending.parts.find(row => row.semantic_id === 'whole')!.status = 'combined';
  expect(validateEditableScopeReview(pending, pendingRequest, { ...state, editable_scope_debt: debt })!.debt.door).toBeUndefined(); // unpainted declaration can be created
  const layers = [...owners, { hypothesis_id: 'door', layer_id: 3 }, { hypothesis_id: 'glazing', layer_id: 4 }];
  const req = editableScopeRequest(nextRecord, { ...state, editable_scope_debt: debt }, expanded, layers, true)!;
  const replacement = report(req); replacement.parts.find(row => row.semantic_id === 'whole')!.status = 'reference';
  replacement.replacements = [{ owner_id: 'whole', semantic_ids: ['door', 'glazing'] }];
  const result = validateEditableScopeReview(replacement, req, { ...state, editable_scope_debt: debt }, { criteria: { editable_parts: 'pass' } })!;
  expect(result.debt.whole.status).toBe('replaced');
  expect(editableOwnerScopeIssue(result.debt, 'whole')).toBeDefined();
  expect(editableOwnerScopeIssue(result.debt, 'door')).toBeUndefined();
  const collision = editableScopeRequest(nextRecord, { ...state, editable_scope_debt: debt }, expanded, [...owners, { hypothesis_id: 'door', layer_id: 2 }, { hypothesis_id: 'glazing', layer_id: 4 }], true)!;
  const forged = report(collision); forged.parts.find(row => row.semantic_id === 'whole')!.status = 'reference'; forged.replacements = replacement.replacements;
  expect(() => validateEditableScopeReview(forged, collision, { ...state, editable_scope_debt: debt })).toThrow('replacement_unproven');
});

it('enforces frozen scope on raw/continue/keep and projects a previous review before same-cycle dispatch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-editable-scope-'));
  try {
    const store = new SessionStore(dir);
    const debt = { whole: { status: 'open', frozen: true, layer_id: 2, visible: 'Independent door and glazing are flattened together.' } };
    vi.spyOn(store, 'paintingState').mockReturnValue({ documents: { '850': { ...state, editable_scope_debt: debt } } } as any);
    vi.spyOn(store, 'sceneOwnershipPlan').mockReturnValue(plan as any);
    vi.spyOn(store, 'semanticLayerOwners').mockReturnValue(owners as any);
    vi.spyOn(store, 'assertDocumentIdentityVerified').mockImplementation(() => undefined);
    const operation = { id: 'next-pass', tool: 'photoshop_paint_regions', args: { document_id: 850, regions: [{ layer_id: 2 }] }, summary: 'Continue this visible part', purpose: 'Construct the visible surface' };
    expect(store.collectPreflightErrors(operation).join('\n')).toContain('scene_editable_scope_blocked');
    expect(() => store.keepSemanticLayerOwner({ document_id: 850, hypothesis_id: 'whole', layer_id: 2, request_key: 'keep-whole' })).toThrow('scene_editable_scope_blocked');
    vi.mocked(store.paintingState).mockReturnValue({ documents: { '850': state } } as any);
    vi.spyOn(store, 'read').mockImplementation(id => id === record.id ? record as any : undefined);
    const validator = vi.spyOn(store, 'validateEditableScope').mockReturnValue({ debt, review: {} } as any);
    expect(store.collectPreflightErrors(operation, { plannedPreviousOperationId: record.id,
      plannedEditableScopeReview: { disposition: 'accept', editable_scope_review: {} } }).join('\n')).toContain('scene_editable_scope_blocked');
    expect(validator).toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); }
});
