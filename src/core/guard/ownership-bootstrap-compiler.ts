import { createHash } from 'node:crypto';
import {
  normalizeSceneOwnershipPlan, extendSceneOwnershipPlan, sceneComponentScopeIssue,
  type SceneOwnershipPlan,
} from '../scene-ownership-plan.js';
import { normalizeGuardActionIds } from './painting-intent.js';

type Row = Record<string, unknown>;
const row = (value: unknown): Row | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined;
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const stableId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const hashId = (prefix: string, value: string): string =>
  prefix + createHash('sha256').update(value).digest('hex').slice(0, 20);

export interface OwnerBootstrapResult {
  pass: Row;
  derived: boolean;
  source?: 'authored-single-component' | 'proven-canvas-continuous-field';
  reason?: string;
}

/**
 * A plan compiler, not a semantic classifier. Never assume a whole depicted
 * subject is "single-component" merely because the user selected one layer.
 * Explicit one-part scope is artistic authority; canvas continuous-field is
 * derived only from redundant, exact method + canvas + one newly created layer.
 *
 * This is preflight-only. Actual owner registration still requires a native
 * create-layer receipt and the existing Guard transaction/preview barrier.
 */
export function compileMinimalOwnerBootstrap(passInput: Row, context: Row = {}): OwnerBootstrapResult {
  const pass = structuredClone(passInput);
  if (pass.scene_ownership_plan !== undefined || pass.cross_layer_correction !== undefined
    || pass.restore_anchor_operation_id !== undefined || pass.deferred_from_operation_id !== undefined)
    return { pass, derived: false };
  const logical = row(pass.logical_layer);
  const ownerId = text(logical?.hypothesis_id) ?? text(pass.target_owner_id);
  if (!stableId(ownerId)) return { pass, derived: false };
  if (logical && (logical.decision !== 'create-new' || (logical.hypothesis_id && logical.hypothesis_id !== ownerId)))
    return { pass, derived: false };
  if (pass.target_owner_id !== undefined && pass.target_owner_id !== ownerId)
    return { pass, derived: false };
  if (row(context.document_target)?.id !== undefined && row(context.document_target)?.id !== pass.document_id)
    return { pass, derived: false };
  const existingOwners = Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : [];
  if (existingOwners.some(item => row(item)?.hypothesis_id === ownerId)) return { pass, derived: false };
  const actions = Array.isArray(pass.actions) ? normalizeGuardActionIds(pass.actions as Row[]).map(row) : [];
  if (actions.some(item => !item)) return { pass, derived: false };
  const creates = actions.filter(item => item?.tool === 'photoshop_create_layer');
  if (creates.length !== 1 || (pass.action_class !== undefined && pass.action_class !== 'ADD')
    || (pass.action !== undefined && pass.action !== 'add')) return { pass, derived: false };
  const createName = text(row(creates[0]?.args)?.name);
  if (!createName || (logical?.layer_name !== undefined && logical.layer_name !== createName)) return { pass, derived: false };
  const mutations = actions.filter(item => item?.tool !== 'photoshop_create_layer'
    && item?.tool !== 'photoshop_get_preview');
  if (mutations.length !== 1 || !mutations[0]) return { pass, derived: false };
  if (!['photoshop_paint_color_gradient', 'photoshop_fill_layer', 'photoshop_paint_regions',
    'photoshop_paint_strokes', 'photoshop_paint_dabs'].includes(String(mutations[0].tool))) return { pass, derived: false };
  // Guard's real VisualMicroPlan must still validate every deferred layer
  // target against this create step; never silently retarget raw numeric IDs.
  if (!stableId(creates[0]?.id) || !stableId(mutations[0].id)) return { pass, derived: false };
  const expectedTarget = `$steps.${creates[0].id}.details.layerId`;
  const mutationArgs = row(mutations[0].args);
  if (!mutationArgs || mutationArgs.layer_id !== expectedTarget) return { pass, derived: false };
  if (mutations[0].tool === 'photoshop_paint_regions') {
    if (!Array.isArray(mutationArgs.regions) || mutationArgs.regions.some(item =>
      row(item)?.layer_id !== expectedTarget)) return { pass, derived: false };
  }
  const scope = row(pass.component_scope);
  if (scope && Object.keys(scope).some(key => !['subject_kind', 'role', 'edit_axes'].includes(key)))
    return { pass, derived: false };
  const explicitKind = scope?.subject_kind;
  if (explicitKind !== undefined && !['single-component', 'continuous-field'].includes(String(explicitKind)))
    return { pass, derived: false };
  const provenCanvasField = !scope
    && logical?.component_space === 'canvas'
    && pass.construction_role === 'continuous-field'
    && pass.visual_intent === 'continuous-field'
    && ['photoshop_paint_color_gradient', 'photoshop_fill_layer'].includes(String(mutations[0].tool));
  const kind: 'single-component' | 'continuous-field' | undefined =
    explicitKind === 'single-component' || explicitKind === 'continuous-field'
      ? explicitKind : provenCanvasField ? 'continuous-field' : undefined;
  if (!kind) return { pass, derived: false };
  if (kind === 'continuous-field' && (logical?.component_space !== 'canvas'
    || pass.construction_role !== 'continuous-field'
    || !['photoshop_paint_color_gradient', 'photoshop_fill_layer'].includes(String(mutations[0].tool))))
    return { pass, derived: false };
  const role = text(scope?.role) ?? (kind === 'continuous-field' ? 'Continuous canvas color field' : undefined);
  if (!role || role.length < 4) return { pass, derived: false };
  const authoredAxes = scope?.edit_axes;
  if (authoredAxes !== undefined && (!Array.isArray(authoredAxes) || !authoredAxes.length
    || authoredAxes.some(axis => !['visibility', 'color', 'material', 'lighting', 'position', 'mask', 'rollback'].includes(String(axis)))
    || new Set(authoredAxes).size !== authoredAxes.length)) return { pass, derived: false };
  const editAxes = (authoredAxes ?? (kind === 'continuous-field'
    ? ['visibility', 'color', 'rollback'] : ['visibility', 'rollback'])) as string[];
  let durable: SceneOwnershipPlan | undefined;
  // Real compactPassContext uses null (not undefined) for an absent durable plan.
  if (context.scene_ownership_plan !== undefined && context.scene_ownership_plan !== null) {
    try { durable = normalizeSceneOwnershipPlan(context.scene_ownership_plan); }
    catch { return { pass, derived: false }; }
  }
  if (durable?.units.some(unit => unit.owner_id === ownerId)) return { pass, derived: false };
  const semanticId = hashId('unit_', `${ownerId}|unit`);
  const objectId = hashId('obj_', `${ownerId}|object`);
  if (durable?.units.some(unit => unit.semantic_id === semanticId)
    || durable?.objects?.some(object => object.object_id === objectId)) return { pass, derived: false };
  const seed: SceneOwnershipPlan = {
    protocol: 'photoshop.guard.scene_ownership_plan.v1',
    plan_id: durable?.plan_id ?? hashId('scene_', `${pass.document_id}|first|${ownerId}`),
    units: [...(durable?.units ?? []), {
      semantic_id: semanticId, owner_id: ownerId, role,
      editability: kind === 'continuous-field' ? 'continuous-field' : 'independent',
      edit_axes: [...editAxes],
    }],
    objects: [...(durable?.objects ?? []), {
      object_id: objectId, kind: 'single-part', subject_kind: kind,
      component_semantic_ids: [semanticId],
    }],
    shared_owner_justifications: [...(durable?.shared_owner_justifications ?? [])],
  };
  try {
    const normalized = normalizeSceneOwnershipPlan(seed);
    if (durable) extendSceneOwnershipPlan(durable, normalized);
    if (sceneComponentScopeIssue(normalized, ownerId)) return { pass, derived: false };
    pass.scene_ownership_plan = normalized;
    return { pass, derived: true,
      source: scope ? 'authored-single-component' : 'proven-canvas-continuous-field',
      reason: 'Single new semantic owner with exact create-layer reference and verified one-component artistic scope; no existing owner reassigned.' };
  } catch {
    return { pass, derived: false };
  }
}
