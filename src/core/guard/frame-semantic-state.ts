// @ts-nocheck
// Exact-frame semantic snapshot capture, validation and restoration.
// The SessionStore supplies its existing document-instance witness normalizer.
import { normalizePhysicalStackCheck } from '../physical-stack-check.js';
import { normalizeRefinementCheck } from '../refinement-check.js';

export const ANCHOR_SEMANTIC_FIELDS = [
  'current_stage', 'last_stage_reset', 'active_scale', 'active_problem', 'visual_problems',
  'owner_representation_state', 'physical_stack_check', 'confirmed_goal_frame',
  'brief_debt_overrides', 'priority_review_required', 'last_critique', 'cumulative_trend_guard', 'relation_review',
  'structural_repair_progress',
];
export const ANCHOR_FINISH_FIELDS = ['global_brief_assessment', 'global_brief_outcome', 'final_artistic_frame'];
const ANCHOR_DIRECTOR_FIELDS = [
  'status', 'current_task_id', 'completed_microplans', 'task_successful_microplans', 'task_autonomy_remaining',
  'strategy_meaningful_microplans', 'review_due', 'review_reason', 'interrupt', 'whole_image_glance',
  'last_painter_stage', 'last_painter_operation_id', 'last_painter_verdict_at', 'last_stage_reset',
  'assessment', 'physical_stack_check', 'value_check', 'refinement_check', 'strategy_validation',
  'global_brief_assessment', 'global_brief_completion_allowed', 'pre_final_hostile_review',
  'visual_development_gate', 'final_comparison', 'completed_at',
];
function snapshotFields(source, keys) {
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, structuredClone(source[key])]));
}
export function replaceSnapshotFields(target, fields, keys) {
  for (const key of keys) delete target[key];
  Object.assign(target, structuredClone(fields));
}
export function captureFrameSemanticSnapshot(current, documentId, operationId, sha256, normalizeDocumentInstanceWitness) {
  return {
    document_id: documentId, anchor_operation_id: operationId, anchor_sha256: sha256,
    document_incarnation: normalizeDocumentInstanceWitness(current.document_instance?.host_witness)?.token
      ?? current.document_instance?.bootstrap_operation_id ?? null,
    fields: snapshotFields(current, ANCHOR_SEMANTIC_FIELDS),
    finish_fields: snapshotFields(current, ANCHOR_FINISH_FIELDS),
    director_state: current.art_director?.directive_id ? {
      directive_id: current.art_director.directive_id, revision: current.art_director.revision,
      fields: snapshotFields(current.art_director, ANCHOR_DIRECTOR_FIELDS),
      tasks: (current.art_director.tasks ?? []).map(task => ({
        task_id: task.task_id, fields: snapshotFields(task, ['status', 'successful_microplans']),
      })),
    } : null,
  };
}
export function validateFrameSemanticSnapshot(snapshot, documentId, operationId, sha256, errorCode) {
  const fieldsMatchScope = (fields, keys) => fields && typeof fields === 'object' && !Array.isArray(fields)
    && Object.keys(fields).every(key => keys.includes(key));
  const director = snapshot?.director_state;
  if (!snapshot || snapshot.document_id !== documentId || snapshot.anchor_operation_id !== operationId
    || snapshot.anchor_sha256 !== sha256 || !fieldsMatchScope(snapshot.fields, ANCHOR_SEMANTIC_FIELDS)
    || (Object.hasOwn(snapshot, 'director_state') && (
      !fieldsMatchScope(snapshot.finish_fields, ANCHOR_FINISH_FIELDS)
      || (director !== null && (!director?.directive_id || !Number.isSafeInteger(director.revision) || director.revision < 1
        || !fieldsMatchScope(director.fields, ANCHOR_DIRECTOR_FIELDS) || !Array.isArray(director.tasks)
        || new Set(director.tasks.map(task => task?.task_id)).size !== director.tasks.length
        || director.tasks.some(task => !task?.task_id || !fieldsMatchScope(task.fields, ['status', 'successful_microplans']))))))) {
    throw new Error(`${errorCode}: semantic snapshot is not bound to this exact frame/scope`);
  }
}
export function restoreFrameSemantics(current, snapshot, frame) {
  const restored = { ...current };
  replaceSnapshotFields(restored, snapshot.fields, ANCHOR_SEMANTIC_FIELDS);
  let directorScope = 'unavailable';
  if (Object.hasOwn(snapshot, 'director_state')) {
    const saved = snapshot.director_state;
    const art = current.art_director;
    const sameDirective = saved === null ? !art?.directive_id
      : art?.directive_id === saved.directive_id && art.revision === saved.revision
        && (art.tasks ?? []).length === saved.tasks.length
        && (art.tasks ?? []).every(task => saved.tasks.some(row => row.task_id === task.task_id));
    if (sameDirective) {
      directorScope = 'exact_directive_revision';
      replaceSnapshotFields(restored, snapshot.finish_fields, ANCHOR_FINISH_FIELDS);
      if (saved) {
        const director = { ...art };
        replaceSnapshotFields(director, saved.fields, ANCHOR_DIRECTOR_FIELDS);
        director.tasks = (art.tasks ?? []).map(task => {
          const result = { ...task };
          replaceSnapshotFields(result, saved.tasks.find(row => row.task_id === task.task_id).fields, ['status', 'successful_microplans']);
          return result;
        });
        restored.art_director = director;
      }
    } else {
      directorScope = 'newer_directive_preserved_review_required';
      replaceSnapshotFields(restored, {}, ANCHOR_FINISH_FIELDS);
      delete restored.brief_debt_overrides;
      if (art) {
        const director = { ...art };
        replaceSnapshotFields(director, {}, ANCHOR_DIRECTOR_FIELDS);
        restored.art_director = {
          ...director, status: 'review_due', review_due: true, review_reason: `${frame.restore_kind ?? 'accepted_anchor'}_restored_under_newer_directive`,
          physical_stack_check: normalizePhysicalStackCheck({ status: 'pending', observed: false }),
          refinement_check: normalizeRefinementCheck({ status: 'pending', observed: false }),
          whole_image_glance: { due: true, reason: `${frame.restore_kind ?? 'accepted_anchor'}_restore`, required_operation_id: frame.operation_id,
            required_frame_sha256: frame.sha256 },
        };
      }
    }
  }
  return { restored, directorScope };
}
