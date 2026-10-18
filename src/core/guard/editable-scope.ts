import { createHash } from 'node:crypto';
import { normalizeSceneOwnershipPlan } from '../scene-ownership-plan.js';
import { DEPICTION_DETAIL_GUIDANCE, wholeObjectDepiction } from '../depiction-detail.js';

const STATUSES = ['independent', 'combined', 'missing', 'unknown', 'reference'] as const;
const idSchema = { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' };
export const EDITABLE_SCOPE_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  description: 'Same delivered-image review, no extra model call. Compare independently editable visible parts with the declared inventory AND actual owner/layer topology. Report undeclared parts even if the artist called the whole object single-component. Composite appearance alone does not prove pixel separation; use read-only owner/mask evidence or exact owner-bound BEFORE/AFTER pixel changes with topology; otherwise unknown. Command success alone is not evidence. Many marks for one part are legal.',
  properties: {
    request_id: { type: 'string' },
    parts: { type: 'array', maxItems: 128, items: { type: 'object', additionalProperties: false,
      properties: { semantic_id: idSchema, layer_id: { type: ['integer', 'null'], minimum: 1 },
        status: { type: 'string', enum: [...STATUSES] }, visible: { type: 'string', minLength: 10, maxLength: 400 } },
      required: ['semantic_id', 'layer_id', 'status', 'visible'] } },
    unmapped_parts: { type: 'array', maxItems: 32, items: { type: 'object', additionalProperties: false,
      properties: { owner_id: idSchema, visible: { type: 'string', minLength: 10, maxLength: 400 } }, required: ['owner_id', 'visible'] } },
    replacements: { type: 'array', maxItems: 32, items: { type: 'object', additionalProperties: false,
      properties: { owner_id: idSchema, semantic_ids: { type: 'array', minItems: 1, maxItems: 128, uniqueItems: true, items: idSchema } },
      required: ['owner_id', 'semantic_ids'] } },
  }, required: ['request_id', 'parts', 'unmapped_parts'],
};

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ownerId = (record: any) => record?.args?.logical_layer?.hypothesis_id ?? record?.logical_layer?.hypothesis_id;
const positiveLayer = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;

/** Host judges arbitrary visual semantics; the server checks identity and topology. */
export function editableScopeRequest(record: any, state: any, rawPlan: any, owners: any[], whole = false) {
  if (!record?.visual || !record.preview?.sha256 || !rawPlan || record.rolled_back
    || record.current_frame_authority === false || record.verdict?.disposition === 'rollback') return undefined;
  const plan = normalizeSceneOwnershipPlan(rawPlan);
  const currentOwner = ownerId(record);
  const layerByOwner = new Map(owners.map(row => [row.hypothesis_id, positiveLayer(row.layer_id)]));
  const topology = plan.units.map(unit => ({ semantic_id: unit.semantic_id, owner_id: unit.owner_id,
    role: unit.role, editability: unit.editability, edit_axes: unit.edit_axes ?? [], layer_id: layerByOwner.get(unit.owner_id) ?? null }));
  const signature = hash({ plan, topology });
  const wholeScene = whole || !currentOwner || state.editable_scope_review?.topology_signature !== signature
    || (state.editable_scope_review?.operation_id === record.id && state.editable_scope_review.scope === 'whole-scene');
  const parts = wholeScene ? topology : topology.filter(row => row.owner_id === currentOwner);
  if (!parts.length) return undefined;
  const request_id = hash({ version: 'editable-scope-v1', operation_id: record.id, frame: record.preview.sha256,
    brief: state.original_brief, incarnation: state.document_incarnation_id, signature, wholeScene, currentOwner });
  return { required: wholeScene, request_id, operation_id: record.id, scope: wholeScene ? 'whole-scene' : 'touched-owner', parts,
    whole_object_components: (plan.objects ?? []).filter(object => wholeObjectDepiction(object.depiction))
      .map(object => ({ object_id: object.object_id, component_semantic_ids: object.component_semantic_ids, depiction: object.depiction })),
    detail_policy: DEPICTION_DETAIL_GUIDANCE,
    topology_signature: signature, frame_sha256: record.preview.sha256,
    instruction: 'Review the brief, exact pixels and these layer bindings together. Use detail_policy and whole_object_components to choose inventory at delivered scale and for requested edits. Do not invent anatomical subparts of a permitted contextual whole figure. List any part requiring independent editing at that scale absent from this map in unmapped_parts, pinned to its current owner. Single-component and continuous-field labels do not certify completeness. For each required part return its exact layer_id, status and concrete visible evidence. An unpainted planned part is missing with layer_id=null; it does not block its creation. Confirm separation with layer-isolated evidence or exact owner-bound BEFORE/AFTER pixel changes and topology; command success alone does not prove it. Otherwise use unknown. Combined owners are frozen; repair on distinct new layers and visually confirm replacements. Retain old pixels as reference; no automatic split or erase.' };
}

export function validateEditableScopeReview(value: any, request: any, state: any, completion?: any) {
  if (!request) {
    if (value !== undefined) throw new Error('editable_scope_review_unbound: no exact ownership review request');
    if (completion?.criteria?.editable_parts === 'pass') throw new Error('editable_scope_plan_required: whole-scene editability requires an inventory bound to actual owners/layers and the exact image review');
    return undefined;
  }
  if (value === undefined && !request.required && completion === undefined) return undefined;
  if (value && value.request_id !== request.request_id)
    throw new Error(`editable_scope_review_binding_mismatch: expected request_id=${request.request_id}, scope=${request.scope}; use the current exact-frame ownership request, preserving actual layer IDs and uncertainty. No new capture or source reads.`);
  if (!value || !Array.isArray(value.parts) || !Array.isArray(value.unmapped_parts)
    || value.parts.length > 128 || value.unmapped_parts.length > 32
    || Object.keys(value).some(key => !['request_id', 'parts', 'unmapped_parts', 'replacements'].includes(key)))
    throw new Error('editable_scope_review_required: submit request_id, parts and unmapped_parts in the existing exact-image observation; no source reads or separate Critic call');
  const expected = new Map<string, any>(request.parts.map((row: any) => [row.semantic_id, row]));
  const seen = new Set<string>();
  const evidence = (text: any) => typeof text === 'string' && text.trim().length >= 10 && text.trim().length <= 400;
  const debts: Record<string, any> = { ...(state.editable_scope_debt ?? {}) };
  const rows: any[] = [];
  for (const row of value.parts) {
    const part = expected.get(row?.semantic_id);
    if (!part || seen.has(row.semantic_id) || !STATUSES.includes(row.status) || row.layer_id !== part.layer_id || !evidence(row.visible)
      || Object.keys(row).some(key => !['semantic_id', 'layer_id', 'status', 'visible'].includes(key)))
      throw new Error('editable_scope_review_invalid: unique declared semantic_id, exact current layer_id, status and concrete visible evidence required');
    seen.add(row.semantic_id);
    if (row.status === 'independent' && !part.layer_id) throw new Error('editable_scope_layer_missing: unpainted declarations cannot pass');
    if (row.status === 'reference' && part.editability !== 'temporary' && !debts[part.owner_id]?.frozen)
      throw new Error('editable_scope_reference_invalid: an active editable part cannot be relabelled as reference');
    rows.push({ ...row, owner_id: part.owner_id });
    if (part.layer_id && ['combined', 'missing', 'unknown'].includes(row.status)) {
      const prior = debts[part.owner_id];
      debts[part.owner_id] = { ...prior, status: prior?.status === 'replaced' ? 'replaced' : 'open',
        frozen: prior?.frozen === true || row.status === 'combined', layer_id: part.layer_id, visible: row.visible };
    } else if (row.status === 'independent' && !debts[part.owner_id]?.frozen) delete debts[part.owner_id];
  }
  if (seen.size !== expected.size) throw new Error('editable_scope_review_incomplete: cover every part in the supplied review request once');
  const independent = rows.filter(row => row.status === 'independent');
  const independentOwners = new Map<number, string>();
  for (const row of independent) {
    const previous = independentOwners.get(row.layer_id);
    if (previous && previous !== row.owner_id) throw new Error('scene_component_layer_conflict: independent owners share a physical layer');
    independentOwners.set(row.layer_id, row.owner_id);
  }
  for (const row of value.unmapped_parts) {
    const part = request.parts.find((part: any) => part.owner_id === row?.owner_id);
    if (!part || !part.layer_id || !evidence(row.visible) || Object.keys(row).some(key => !['owner_id', 'visible'].includes(key)))
      throw new Error('editable_scope_unmapped_invalid: identify a reviewed painted owner and its undeclared visible part');
    debts[row.owner_id] = { status: 'open', frozen: true, layer_id: part.layer_id, visible: row.visible };
  }
  const replacements = value.replacements ?? [];
  if (!Array.isArray(replacements) || replacements.length > 32) throw new Error('editable_scope_replacements_invalid');
  const replaced = new Set<string>();
  for (const replacement of replacements) {
    const debt = debts[replacement?.owner_id];
    if (!debt?.frozen || replaced.has(replacement.owner_id) || !Array.isArray(replacement.semantic_ids) || !replacement.semantic_ids.length
      || replacement.semantic_ids.length > 128 || new Set(replacement.semantic_ids).size !== replacement.semantic_ids.length
      || Object.keys(replacement).some(key => !['owner_id', 'semantic_ids'].includes(key))) throw new Error('editable_scope_replacement_invalid');
    for (const id of replacement.semantic_ids) {
      const part = independent.find(row => row.semantic_id === id);
      if (!part || part.owner_id === replacement.owner_id || part.layer_id === debt.layer_id)
        throw new Error('editable_scope_replacement_unproven: confirm new independent replacement parts on distinct actual layers in a whole-scene review');
    }
    if (request.scope !== 'whole-scene') throw new Error('editable_scope_replacement_requires_whole_scene');
    replaced.add(replacement.owner_id);
    debts[replacement.owner_id] = { ...debt, status: 'replaced', replacement_semantic_ids: replacement.semantic_ids };
  }
  const failedParts = rows.some(row => row.status !== 'independent'
    && !(row.status === 'reference' && (debts[row.owner_id]?.status === 'replaced' || expected.get(row.semantic_id)?.editability === 'temporary')));
  const openDebt = Object.values(debts).some((row: any) => row.status !== 'replaced');
  if (completion?.criteria?.editable_parts === 'pass'
    && (request.scope !== 'whole-scene' || !independent.length || failedParts || openDebt || value.unmapped_parts.length))
    throw new Error('editable_parts_completion_unproven: missing, combined, unknown or undeclared parts leave whole-scene editability unfinished');
  return { review: { request_id: request.request_id, operation_id: request.operation_id, frame_sha256: request.frame_sha256,
    topology_signature: request.topology_signature, scope: request.scope, parts: rows, unmapped_parts: value.unmapped_parts }, debt: debts };
}

export function persistEditableScopeReview(review: any) {
  return review ? { editable_scope_review: review.review, editable_scope_debt: review.debt } : {};
}

export function editableOwnerScopeIssue(debts: any, owner: string) {
  const debt = debts?.[owner];
  if (!debt?.frozen) return undefined; // missing/unknown dedicated components retain completion debt but remain repairable
  return { code: 'scene_editable_scope_blocked', message: `Owner ${owner} lacks confirmed independent editable scope: ${debt.visible}. ${debt.frozen ? 'This combined/reference owner is permanently frozen; preserve its pixels and build independently editable replacement parts on distinct new layers.' : 'Use the same delivered-image review to confirm its isolated scope; unknown evidence is not pass.'}` };
}
