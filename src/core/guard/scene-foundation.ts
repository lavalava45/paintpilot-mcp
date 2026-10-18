import { createHash } from 'node:crypto';
import { normalizeRegion } from './visual-review-region.js';

type Row = Record<string, any>;
export const SCENE_FOUNDATION_VERSION = 'scene-foundation-v1';
export const SCENE_FOUNDATION_GUIDANCE = 'Before local component development, establish the WHOLE requested composition (subject, required surroundings/background, ground/space and major value/color relationships) AND demonstrate the requested medium on a representative visible area. Pencil/ink line character and paper are part of the medium from the beginning, not deferred decoration. Use the existing delivered whole-frame review: previous_observation.scene_foundation={composition:{status,visible,next_change},technique:{status,visible,next_change,sample_region}}. status=pass|fail|unknown; pass is an early working foundation, NOT finished artwork. Judge pixels against original_brief, never tool names or intention. technique=pass needs sample_region in document pixels. Until both pass, next_pass.foundation_goal=composition|technique prioritizes that missing foundation over ordinary detail; no extra preview, separate Critic call or external evaluator. Existing safety, ownership, geometry and exact-image evidence remain required. Never certify an absent background or filled polygons as a demonstrated pencil medium.';
const assessment = { type: 'object', additionalProperties: false, properties: {
  status: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
  visible: { type: 'string', minLength: 12, maxLength: 800 },
  next_change: { type: 'string', maxLength: 800 },
}, required: ['status', 'visible'] };
export const SCENE_FOUNDATION_SCHEMA = {
  type: 'object', additionalProperties: false, description: SCENE_FOUNDATION_GUIDANCE,
  properties: { request_id: { type: 'string' }, composition: assessment, technique: { ...assessment, properties: { ...assessment.properties,
    sample_region: { type: 'object', additionalProperties: false, properties: {
      left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' },
    }, required: ['left', 'top', 'right', 'bottom'] },
  } } }, required: ['request_id', 'composition', 'technique'],
};
export const FOUNDATION_GOAL_SCHEMA = { type: 'string', enum: ['composition', 'technique'],
  description: 'While scene_foundation is incomplete, use this for one actual composition/background establishment or representative medium demonstration pass. It preempts artistic task ordering only; never safety or pixel evidence. Do not label unrelated component detail as foundation.' };
const briefHash = (state: Row) => createHash('sha256').update(state.original_brief ?? '').digest('hex');
const incarnation = (state: Row) => state.document_incarnation_id ?? state.document_instance?.host_witness?.token ?? null;
export function sceneFoundationRequest(record: Row, state: Row, readiness?: Row): Row {
  return { request_id: createHash('sha256').update(JSON.stringify([SCENE_FOUNDATION_VERSION,
    record.id, record.preview?.sha256, record.args?.document_id, briefHash(state), incarnation(state)])).digest('hex'),
    ...(readiness ?? sceneFoundationState(state)), operation_id: record.id, frame_sha256: record.preview?.sha256 };
}

export function validateSceneFoundation(value: unknown, record: Row, state: Row): Row | undefined {
  if (value === undefined) return undefined;
  const row = value as Row;
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(k => !['request_id', 'composition', 'technique'].includes(k)))
    throw new Error('scene_foundation_review_invalid: previous_observation.scene_foundation needs composition and technique assessments');
  const expected = sceneFoundationRequest(record, state).request_id;
  if (row.request_id !== expected) throw new Error(`scene_foundation_review_invalid: previous_observation.scene_foundation.request_id must match ${expected} on the delivered current frame`);
  for (const key of ['composition', 'technique']) {
    const check = row[key];
    if (!check || !['pass', 'fail', 'unknown'].includes(check.status) || typeof check.visible !== 'string'
      || check.visible.trim().length < 12 || check.visible.length > 800
      || Object.keys(check).some(k => !['status', 'visible', 'next_change', ...(key === 'technique' ? ['sample_region'] : [])].includes(k))
      || (check.next_change !== undefined && (typeof check.next_change !== 'string' || check.next_change.length > 800))
      || (check.status !== 'pass' && !check.next_change?.trim()))
      throw new Error(`scene_foundation_review_invalid: previous_observation.scene_foundation.${key} requires status, visible pixel evidence and next_change for fail/unknown`);
  }
  if (row.technique.sample_region !== undefined || row.technique.status === 'pass') {
    let bounds;
    try { bounds = normalizeRegion(row.technique.sample_region); }
    catch { throw new Error('scene_foundation_review_invalid: previous_observation.scene_foundation.technique.sample_region requires finite left,top,right,bottom with positive area'); }
    if (bounds.left < 0 || bounds.top < 0 || (record.preview?.canvas_width && bounds.right > record.preview.canvas_width)
      || (record.preview?.canvas_height && bounds.bottom > record.preview.canvas_height))
      throw new Error('scene_foundation_review_invalid: previous_observation.scene_foundation.technique.sample_region must lie inside the delivered canvas');
  }
  return { ...structuredClone(row), version: SCENE_FOUNDATION_VERSION,
    operation_id: record.id, frame_sha256: record.preview?.sha256, brief_sha256: briefHash(state),
    document_id: record.args?.document_id, document_incarnation_id: incarnation(state) };
}

export function sceneFoundationState(state: Row, evidenceRetained = true): Row {
  const enabled = !!state.original_brief?.trim() && (state.scene_foundation_policy === SCENE_FOUNDATION_VERSION || state.construction_policy === 'enforced');
  const proof = state.scene_foundation;
  const valid = !!proof && incarnation(state) !== null && evidenceRetained && proof.version === SCENE_FOUNDATION_VERSION
    && proof.brief_sha256 === briefHash(state) && proof.document_incarnation_id === incarnation(state)
    && proof.document_id === state.document_id;
  const missing = ['composition', 'technique'].filter(key => !valid || proof[key]?.status !== 'pass');
  return { enabled, ready: !enabled || missing.length === 0, missing: enabled ? missing : [],
    ...(valid ? { evidence: proof } : {}), instruction: SCENE_FOUNDATION_GUIDANCE };
}

/** One artistic ordering rule, reused by Planner and priority. No mutation authority. */
export function foundationAdmission(state: Row, request: Row, evidenceRetained = true): Row {
  const foundation = sceneFoundationState(state, evidenceRetained);
  if (!foundation.enabled || foundation.ready) return { ...foundation, status: 'ready' };
  const args = request.args ?? request;
  const stage = String(request.stage ?? args.stage ?? 'GLOBAL_BLOCK_IN').toUpperCase();
  const goal = request.foundation_goal ?? args.foundation_goal;
  const domains = args.change_domains ?? request.change_domains ?? [];
  if ((!state.current_frame?.operation_id || state.current_frame.operation_id === state.document_instance?.bootstrap_operation_id)
    && !['DETAIL', 'TEXTURE', 'MATERIAL'].includes(stage)) return { ...foundation, status: 'initial-subject' };
  if (foundation.missing.includes(goal) && !['DETAIL', 'TEXTURE'].includes(stage)
    && (goal === 'composition' ? Array.isArray(domains) && domains.some((d: string) => ['composition', 'background-scope'].includes(d))
      : !!(request.region_bounds ?? args.region_bounds)))
    return { ...foundation, status: 'foundation-repair', goal };
  const binding = sceneFoundationRequest({ id: state.current_frame?.operation_id,
    preview: { sha256: state.current_frame?.sha256 }, args: { document_id: state.document_id } }, state, foundation);
  return { ...foundation, status: 'blocked', message:
    `scene_foundation_required: before local development establish ${foundation.missing.join(' and ')}. Use next_pass.foundation_goal=${foundation.missing.join('|')} for that actual missing foundation (composition uses change_domains=[composition or background-scope]; technique uses region_bounds for a representative medium sample). For the existing frame ${binding.operation_id}, previous_observation.scene_foundation.request_id=${binding.request_id}; report composition/technique status, visible and next_change (technique pass also needs sample_region). Continue through the SAME cycle_auto; no extra capture. Do not replay, relabel local detail, or certify unfinished pixels. ${foundation.missing.map((key: string) => foundation.evidence?.[key]?.next_change ?? '').filter(Boolean).join(' ')}` };
}
