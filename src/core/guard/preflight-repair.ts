import { createHash } from 'node:crypto';
import { bindUniqueNewLayerStepTarget } from './technical-step-targets.js';
import { strokeExecutionBudget } from '../../tools/painting-tools.js';

export const VIOLATION_REPAIR_CLASSES = [
  'AUTO_NORMALIZE',
  'AUTO_PATCH',
  'CONTRACT_CORRECTION',
  'SPLIT_DEFER',
  'MODEL_SEMANTIC_DECISION',
  'SYSTEMIC_FAILURE',
] as const;

export type ViolationRepairClass = (typeof VIOLATION_REPAIR_CLASSES)[number];

export interface RepairableViolation {
  scope: 'cycle' | 'finalization' | 'next_operation';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface StructuredRepairOperation {
  kind: 'inject_from_context' | 'normalize' | 'replace_from_context' | 'split_defer';
  path: string;
  source?: string;
  normalizer?: string;
  reason: string;
}

export interface ClassifiedViolation {
  violation: RepairableViolation;
  repair_class: ViolationRepairClass;
}

/** Construction creates its own layer. Drop only an inert, redundant create-layer
 * declaration; layer placement, mismatched names and other actions are decisions. */
export function omitRedundantConstructionLayerAction<T extends Record<string, any>>(
  input: T,
): { pass: T; repair?: StructuredRepairOperation } {
  const pass = structuredClone(input);
  const actions = Array.isArray(pass.actions) ? pass.actions : [];
  if (!pass.construction || actions.length !== 1 || actions[0]?.tool !== 'photoshop_create_layer'
    || pass.restore_anchor_operation_id !== undefined) return { pass };
  const action = actions[0];
  if (Object.keys(action).some(key => !['id', 'tool', 'args', 'description'].includes(key))) return { pass };
  const args = action.args && typeof action.args === 'object' && !Array.isArray(action.args)
    ? action.args as Record<string, unknown> : {};
  if (Object.keys(args).some(key => !['name', 'document_id'].includes(key))) return { pass };
  if (args.document_id !== undefined && args.document_id !== pass.document_id) return { pass };
  const declaredName = nonEmptyText(args.name);
  const construction = pass.construction as Record<string, unknown>;
  const model = construction.model as Record<string, unknown> | undefined;
  const part = Array.isArray(model?.parts)
    ? model.parts.find((item: any) => item?.id === construction.part_id) : undefined;
  // A supplied display name is safe to remove only when the generated layer
  // will use exactly that name. Model-id-only construction has no local proof.
  if (args.name !== undefined && (!declaredName || declaredName !== nonEmptyText(part?.role))) return { pass };
  delete pass.actions;
  return { pass, repair: {
    kind: 'normalize', path: 'next_pass.actions', normalizer: 'construction_owned_layer',
    reason: 'The selected construction already creates this exact layer; the extra create_layer has no placement or independent effect.',
  } };
}

/** Restore a spelling/alias of an object only when EVERY authored component
 * already belongs to the SAME durable object. Never migrate ownership. */
function alignKnownConstructionObject(
  pass: Record<string, unknown>, context: Record<string, unknown>, repairs: StructuredRepairOperation[],
): void {
  const construction = pass.construction as Record<string, any> | undefined;
  const model = construction?.model as Record<string, any> | undefined;
  const durable = context.scene_ownership_plan as Record<string, any> | undefined;
  if (!model || !durable || pass.scene_ownership_plan !== undefined
    || !Array.isArray(model.objects) || !Array.isArray(model.parts)
    || !Array.isArray(model.points) || !Array.isArray(durable.objects) || !Array.isArray(durable.units)) return;
  for (const object of model.objects) {
    if (!object || typeof object.id !== 'string'
      || durable.objects.some((item: any) => item.object_id === object.id)) continue;
    const parts = model.parts.filter((part: any) => part?.object_id === object.id);
    if (!parts.length) continue;
    const matches = parts.map((part: any) => durable.units.filter((unit: any) => unit.owner_id === part.id));
    if (matches.some((rows: any[]) => rows.length !== 1)) continue;
    const savedObjects = durable.objects.filter((candidate: any) =>
      candidate.subject_kind === object.subject_kind
      && parts.every((_: any, i: number) => candidate.component_semantic_ids?.includes(matches[i][0].semantic_id)));
    if (savedObjects.length !== 1 || model.objects.some((candidate: any) => candidate !== object && candidate.id === savedObjects[0].object_id)) continue;
    const originalId = object.id;
    const canonicalId = savedObjects[0].object_id;
    object.id = canonicalId;
    for (const part of parts) part.object_id = canonicalId;
    for (const point of model.points) if (point?.object_id === originalId) point.object_id = canonicalId;
    repairs.push({ kind: 'replace_from_context', path: 'next_pass.construction.model.objects[].id',
      source: `scene_ownership_plan.objects[${canonicalId}]`,
      reason: `All construction parts of ${originalId} have unique, unchanged semantic membership in durable object ${canonicalId}; preserve object identity, not a new ownership declaration.`,
    });
  }
}

const VISUAL_MUTATION_TOOLS = new Set([
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_fill_layer',
  'photoshop_paint_regions',
  'photoshop_apply_gradient',
  'photoshop_erase',
  'photoshop_transform_layer',
  'photoshop_set_layer_opacity',
]);

const MODEL_DECISION_CODES = new Set([
  'reflection_source_copy_required',
  'brush_role_ambiguous',
  'brush_preset_choice_required',
  'brush_material_role_required',
  'semantic_layer_owner_missing',
  'semantic_layer_isolation_required',
  'scene_ownership_plan_required',
  'scene_ownership_owner_unplanned',
  'scene_component_plan_required',
  'scene_component_scope_required',
  'scene_component_decomposition_required',
  'scene_editable_inventory_required',
  'scene_editable_scope_blocked',
  'scene_component_layer_conflict',
  'construction_role_material_role_required',
  'painting_stage_reset_required',
  'compact_local_region_bounds_required',
  'compact_review_region_bounds_required',
  'geometry_binding_required',
]);

const SYSTEMIC_CODES = new Set([
  // A field explicitly accepted at the public boundary vanished inside our
  // compiler. This is NEVER an additional artistic decision to ask for.
  'contract_field_lost_during_compilation',
  'scene_ownership_plan_state_invalid',
  'scene_geometry_model_state_invalid',
  'scene_lighting_color_model_state_invalid',
  'scene_camera_imaging_model_state_invalid',
  'geometry_binding_state_invalid',
  'document_instance_probe_failed',
  'document_instance_witness_missing',
  'dynamic_preflight_failed',
  // Multiple durable bindings are conflicting authority, not an invitation to
  // choose another owner and conceal the corrupted state.
  'painting_intent_owner_ambiguous',
]);

const SPLIT_CODES = new Set([
  'compact_pass_visual_mutation_limit',
  'compact_pass_adaptive_mutation_budget_exceeded',
  'stroke_batch_budget_exceeded',
]);

const NORMALIZE_CODES = new Set([
  'compact_action_class_invalid',
]);

const PATCH_CODES = new Set([
  'semantic_layer_pollution',
]);

export function classifyViolation(violation: RepairableViolation): ViolationRepairClass {
  if (violation.code === 'deterministic_repair_repeat'
    || violation.code === 'compiled_operation_missing') return 'SYSTEMIC_FAILURE';
  if (violation.code === 'guard_requirement_conflict') return 'SYSTEMIC_FAILURE';
  if (violation.code === 'guard_requirement_unexpressible') return 'SYSTEMIC_FAILURE';
  if (violation.code === 'current_frame_review_stale'
    || (violation.code === 'previous_operation_finalization_invalid'
      && /current_frame_review_stale:/.test(violation.message))) return 'SYSTEMIC_FAILURE';
  if (['current_frame_review_conflict', 'current_frame_review_required'].includes(violation.code)) return 'CONTRACT_CORRECTION';
  if (SYSTEMIC_CODES.has(violation.code) || /_state_invalid$/.test(violation.code)) return 'SYSTEMIC_FAILURE';
  if (SPLIT_CODES.has(violation.code)) return 'SPLIT_DEFER';
  if (['geometry_contract_invalid', 'attention_binding_invalid'].includes(violation.code)) return 'CONTRACT_CORRECTION';
  if (violation.code === 'geometry_contract_retry_exhausted') return 'SYSTEMIC_FAILURE';
  if (MODEL_DECISION_CODES.has(violation.code)) return 'MODEL_SEMANTIC_DECISION';
  if (NORMALIZE_CODES.has(violation.code)) return 'AUTO_NORMALIZE';
  if (PATCH_CODES.has(violation.code)) return 'AUTO_PATCH';
  if (['compact_actions_required','compact_action_schema_invalid','compact_request_key_required',
    'compact_goal_required','compact_action_tool_invalid','technical_binding_conflict',
    'guard_tool_contract_unknown','construction_role_intent_mismatch',
    'previous_operation_finalization_invalid'].includes(violation.code)) return 'CONTRACT_CORRECTION';
  if (violation.code === 'invalid_visual_microplan'
    && /final VisualMicroPlan step|mutations must target logical_layer/.test(violation.message)) return 'AUTO_PATCH';
  if (violation.code === 'invalid_visual_microplan' && /immediately-before preview/.test(violation.message)) return 'CONTRACT_CORRECTION';
  if (violation.scope === 'finalization' || violation.scope === 'cycle') return 'MODEL_SEMANTIC_DECISION';
  return 'MODEL_SEMANTIC_DECISION';
}

export function classifyViolations(violations: RepairableViolation[]): ClassifiedViolation[] {
  return violations.map(violation => ({ violation, repair_class: classifyViolation(violation) }));
}

/** A single bounded field-level reply for all independent errors in the same attempted pass. */
export function fieldCorrectionPacket(violations: RepairableViolation[]) {
  // These rules have stable public input locations even when an older dynamic
  // validator returns prose only. A missing path in that prose is not evidence
  // that the artist's choice is impossible to express in the command schema.
  const rulePaths: Record<string, string> = {
    reflection_source_copy_required: 'next_pass.actions',
    reflection_source_binding_invalid: 'next_pass.actions',
    stroke_batch_budget_exceeded: 'next_pass.actions',
    semantic_layer_owner_missing: 'next_pass.logical_layer',
    semantic_mutation_target_owner_mismatch: 'next_pass.logical_layer.layer_id',
    semantic_layer_isolation_required: 'next_pass.logical_layer.decision',
    construction_role_material_role_required: 'next_pass.material_role',
    artistic_method_execution_mismatch: 'next_pass.actions',
    invalid_visual_microplan: 'next_pass.actions',
    component_space_invalid: 'next_pass.logical_layer.component_space',
    component_space_conflict: 'next_pass.logical_layer.component_space',
    component_space_owner_conflict: 'next_pass.logical_layer',
    geometry_binding_required: 'next_pass.logical_layer.geometry_binding',
    scene_geometry_model_required: 'next_pass.scene_geometry_model',
    scene_geometry_opt_out_unauthorized: 'next_pass.scene_geometry_model',
    construction_role_intent_mismatch: 'next_pass.visual_intent',
    color_gradient_preflight_required: 'next_pass.color_gradient_preflight',
    color_gradient_preflight_invalid: 'next_pass.color_gradient_preflight',
    color_gradient_preflight_conflict: 'next_pass.color_gradient_preflight',
    color_gradient_preflight_scene_model_missing: 'next_pass.scene_lighting_color_model',
  };
  const rows = violations.map(item => {
    const path = nonEmptyText(item.details?.path)
      ?? rulePaths[item.code]
      ?? item.message.match(/(?:next_pass|painting_intent)\.[A-Za-z0-9_.[\]-]+/)?.[0]
      ?? item.message.match(/args(?:\.[A-Za-z0-9_[\]]+)+/)?.[0]
      ?? null;
    const allowed = item.details?.allowed_commands ?? item.details?.allowed_ids;
    const expected = item.details?.expected;
    return {
      path,
      path_source: item.details?.path || rulePaths[item.code] ? 'rule' : path ? 'legacy-message' : 'unavailable',
      code: item.code,
      reason: item.message,
      ...(item.details?.cause_code ? { cause_code: item.details.cause_code } : {}),
      ...(allowed ? { allowed } : {}),
      ...(expected !== undefined ? { expected } : {}),
      ...(item.details?.operator ? { operator: item.details.operator, actual: item.details.actual } : {}),
      ...(item.details?.method_id ? { selected_method_id: item.details.method_id } : {}),
      ...(classifyViolation(item) === 'MODEL_SEMANTIC_DECISION'
        ? { artistic_decision_required: true } : {}),
    };
  });
  const systemic = violations.some(item => classifyViolation(item) === 'SYSTEMIC_FAILURE');
  return {
    corrections: rows.slice(0, 24),
    remaining_count: Math.max(0, rows.length - 24),
    unaddressable_count: rows.filter(row => !row.path).length,
    preserved_input: 'Keep valid ownership, model, component, proportion and light declarations; edit only rejected fields. Nothing was registered or painted.',
    next: systemic || rows.some(row => !row.path)
      ? 'Report the Guard contract/systemic diagnostic. Do not guess fields or automatically retry the same cycle.'
      : 'Resubmit the corrected cycle in the SAME cycle_auto call, preserving valid previous_observation and next_pass fields; no repeated unchanged status, preview or separate schema round.',
  };
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function ownerMap(context: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const rows = Array.isArray(context.logical_layer_owners)
    ? context.logical_layer_owners as Array<Record<string, unknown>>
    : [];
  return new Map(rows
    .map(owner => [nonEmptyText(owner.hypothesis_id), owner] as const)
    .filter((entry): entry is readonly [string, Record<string, unknown>] => !!entry[0]));
}

function patchKnownOwner(
  pass: Record<string, unknown>,
  context: Record<string, unknown>,
  repairs: StructuredRepairOperation[]
): void {
  const logicalLayer = pass.logical_layer && typeof pass.logical_layer === 'object' && !Array.isArray(pass.logical_layer)
    ? structuredClone(pass.logical_layer) as Record<string, unknown>
    : undefined;
  if (!logicalLayer) return;
  // Only an existing semantic owner can supply a unique physical mutation target.
  // Never infer a target for create-new or lifecycle decisions.
  if (!['continue-logical-layer', 'adjust'].includes(nonEmptyText(logicalLayer.decision) ?? '')) return;
  const ownerId = nonEmptyText(logicalLayer.hypothesis_id);
  const owner = ownerId ? ownerMap(context).get(ownerId) : undefined;
  if (!owner) return;
  const authoritativeLayerId = Number(owner.layer_id);
  if (logicalLayer.layer_id === undefined && Number.isSafeInteger(authoritativeLayerId) && authoritativeLayerId > 0) {
    logicalLayer.layer_id = authoritativeLayerId;
    repairs.push({
      kind: 'inject_from_context',
      path: 'next_pass.logical_layer.layer_id',
      source: `owner:${ownerId}.current_layer_id`,
      reason: 'The current physical layer for this durable semantic owner is unique.',
    });
  }
  if (Number.isSafeInteger(authoritativeLayerId) && authoritativeLayerId > 0 && Array.isArray(pass.actions)) {
    pass.actions = pass.actions.map((action, actionIndex) => {
      if (!action || typeof action !== 'object' || Array.isArray(action)) return action;
      const nextAction = structuredClone(action) as Record<string, unknown>;
      const tool = nonEmptyText(nextAction.tool);
      const args = nextAction.args && typeof nextAction.args === 'object' && !Array.isArray(nextAction.args)
        ? nextAction.args as Record<string, unknown>
        : undefined;
      if (!args) return nextAction;
      if (
        ['photoshop_move_layer', 'photoshop_rotate_layer', 'photoshop_scale_layer',
          'photoshop_paint_strokes', 'photoshop_paint_dabs', 'photoshop_fill_layer',
          'photoshop_transform_layer', 'photoshop_set_layer_opacity', 'photoshop_delete_layer'].includes(tool ?? '')
        && args.layer_id === undefined
      ) {
        args.layer_id = authoritativeLayerId;
        repairs.push({
          kind: 'inject_from_context',
          path: `next_pass.actions[${actionIndex}].args.layer_id`,
          source: `owner:${ownerId}.current_layer_id`,
          reason: 'The action targets the uniquely bound semantic owner and omitted its physical layer id.',
        });
      }
      if (tool === 'photoshop_paint_regions' && Array.isArray(args.regions)) {
        args.regions = args.regions.map((region, regionIndex) => {
          if (!region || typeof region !== 'object' || Array.isArray(region)) return region;
          const nextRegion = { ...region as Record<string, unknown> };
          if (nextRegion.layer_id === undefined) {
            nextRegion.layer_id = authoritativeLayerId;
            repairs.push({
              kind: 'inject_from_context',
              path: `next_pass.actions[${actionIndex}].args.regions[${regionIndex}].layer_id`,
              source: `owner:${ownerId}.current_layer_id`,
              reason: 'The region targets the uniquely bound semantic owner and omitted its physical layer id.',
            });
          }
          return nextRegion;
        });
      }
      nextAction.args = args;
      return nextAction;
    });
  }
  for (const field of ['geometry_binding', 'camera_binding', 'attention_binding', 'surface_frame'] as const) {
    if (logicalLayer[field] === undefined && owner[field] !== undefined) {
      logicalLayer[field] = structuredClone(owner[field]);
      repairs.push({
        kind: 'inject_from_context',
        path: `next_pass.logical_layer.${field}`,
        source: `owner:${ownerId}.${field}`,
        reason: `The durable owner has one authoritative ${field}.`,
      });
    }
  }
  pass.logical_layer = logicalLayer;
}

/** Complete unique technical pins and reconcile proven canvas execution labels.
 * Never choose an artistic owner, relabel a world owner, or change native actions. */
export function prepareTechnicalPassBindings(
  rawPass: Record<string, unknown>,
  context: Record<string, unknown>,
): { pass: Record<string, unknown>; repairs: StructuredRepairOperation[]; issues: Array<{ path: string; message: string }> } {
  const redundant = omitRedundantConstructionLayerAction(rawPass);
  const pass = redundant.pass;
  const repairs: StructuredRepairOperation[] = redundant.repair ? [redundant.repair] : [];
  const issues: Array<{ path: string; message: string }> = [];
  alignKnownConstructionObject(pass, context, repairs);
  let logical = pass.logical_layer && typeof pass.logical_layer === 'object' && !Array.isArray(pass.logical_layer)
    ? pass.logical_layer as Record<string, unknown> : undefined;
  const actions = Array.isArray(pass.actions) ? pass.actions as Array<Record<string, unknown>> : [];
  const ownerId = nonEmptyText(logical?.hypothesis_id);
  const owner = ownerId ? ownerMap(context).get(ownerId) : undefined;
  // A declared canvas field rendered only by fill/gradient has an unambiguous
  // mechanism. Repair obsolete construction labels, never commands, targets,
  // colors or real spatial bindings. A durable world owner is never relabelled.
  const canvasField = (logical?.component_space ?? owner?.component_space) === 'canvas'
    && (!owner || owner.component_space === 'canvas')
    && !pass.construction && !pass.painterly && !pass.restore_anchor_operation_id
    && !(Array.isArray(context.construction_bindings) && context.construction_bindings.some((b: any) => b.owner_id === ownerId))
    && !['geometry_binding', 'parent_hypothesis_id', 'surface_frame', 'camera_binding'].some(key => logical?.[key] || owner?.[key])
    && !['support-surface', 'transmissive-surface'].includes(String(logical?.physical_role ?? owner?.physical_role))
    && !['ROLLBACK', 'ERASE', 'REPLACE'].includes(String(pass.action_class).toUpperCase())
    && [undefined, 'mass', 'continuous-field'].includes(pass.visual_intent as any)
    && actions.length > 0 && actions.every(a => ['photoshop_create_layer', 'photoshop_fill_layer',
      'photoshop_paint_color_gradient', 'photoshop_get_preview'].includes(String(a?.tool)))
    && actions.some(a => ['photoshop_fill_layer', 'photoshop_paint_color_gradient'].includes(String(a?.tool)));
  if (canvasField && logical) {
    const update = (target: Record<string, unknown>, key: string, value: unknown, path: string) => {
      if (target[key] === value) return;
      if (value === undefined) delete target[key]; else target[key] = value;
      repairs.push({ kind: 'normalize', path, normalizer: 'canvas_field_execution',
        reason: 'Explicit canvas field with fill/gradient execution; remove spatial construction labels without changing pixels or ownership.' });
    };
    // Execution already specifies the Photoshop primitive. Fill only absent
    // optional descriptions; never overwrite an artist's explicit material,
    // method, style or construction intent to make it match a palette recipe.
    if (pass.construction_role === undefined)
      update(pass, 'construction_role', 'continuous-field', 'next_pass.construction_role');
    if (pass.visual_intent === undefined)
      update(pass, 'visual_intent', 'continuous-field', 'next_pass.visual_intent');
  }
  const continuing = ['continue-logical-layer', 'adjust'].includes(nonEmptyText(logical?.decision) ?? '');
  const targetId = Number(owner?.layer_id);
  if (continuing && Number.isSafeInteger(targetId) && targetId > 0) {
    const physicalLayerIds = Array.isArray(owner?.physical_layer_ids)
      ? owner.physical_layer_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
      : [targetId];
    const crossLayer = pass.cross_layer_correction
      && typeof pass.cross_layer_correction === 'object'
      && !Array.isArray(pass.cross_layer_correction)
      ? pass.cross_layer_correction as Record<string, unknown>
      : undefined;
    const crossMode = nonEmptyText(crossLayer?.mode)?.toLowerCase();
    const crossCurrent = Number(crossLayer?.current_layer_id);
    const crossPost = Number(crossLayer?.post_authoritative_layer_id);
    const crossTargets = Array.isArray(crossLayer?.target_layer_ids)
      ? crossLayer.target_layer_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
      : [];
    const historicalTargetSet = new Set<number>();
    const crossBindingEnvelopeValid = !!crossLayer
      && ['correction', 'migration'].includes(crossMode ?? '')
      && crossCurrent === targetId
      && crossTargets.length > 0
      && new Set(crossTargets).size === crossTargets.length
      && crossTargets.every(id => id !== targetId && physicalLayerIds.includes(id))
      && (crossMode === 'correction'
        ? crossPost === targetId
        : (crossTargets.length === 1 && crossPost === crossTargets[0]));
    if (crossBindingEnvelopeValid) {
      for (const id of crossTargets) historicalTargetSet.add(id);
    }
    const checkCurrentPin = (value: unknown, path: string) => {
      if (value !== undefined && value !== targetId) issues.push({
        path, message: `Explicit layer_id=${String(value)} conflicts with authoritative owner ${ownerId} layer_id=${targetId}; preserve the owner and choose its actual layer or explicitly plan a migration.`,
      });
    };
    const checkActionTarget = (value: unknown, path: string) => {
      if (value === undefined || value === targetId || historicalTargetSet.has(value as number)) return;
      issues.push({
        path, message: `Explicit layer_id=${String(value)} conflicts with authoritative owner ${ownerId} layer_id=${targetId}; preserve the owner and choose its actual layer or explicitly plan a migration.`,
      });
    };
    checkCurrentPin(logical?.layer_id, 'next_pass.logical_layer.layer_id');
    actions.forEach((action, i) => {
      const args = action?.args as Record<string, unknown> | undefined;
      if (!args || typeof args !== 'object') return;
      checkActionTarget(args.layer_id, `next_pass.actions[${i}].args.layer_id`);
      if (action.tool === 'photoshop_paint_regions' && Array.isArray(args.regions)) {
        args.regions.forEach((region, j) => checkActionTarget((region as Record<string, unknown>)?.layer_id,
          `next_pass.actions[${i}].args.regions[${j}].layer_id`));
      }
    });
    if (!issues.length && logical) {
      patchKnownOwner(pass, context, repairs);
      logical = pass.logical_layer as Record<string, unknown>;
    }
  }
  // The semantic layer declaration is authoritative for the display name of
  // the very same newly created layer. This is not an ownership/target change.
  // An explicit rename of an existing durable owner remains outside this path.
  if (logical && ['create-new', 'temporary-hypothesis'].includes(nonEmptyText(logical.decision) ?? '')) {
    const create = actions.find(action => action?.tool === 'photoshop_create_layer');
    const args = create?.args && typeof create.args === 'object' && !Array.isArray(create.args)
      ? create.args as Record<string, unknown> : undefined;
    const logicalName = nonEmptyText(logical.layer_name);
    const actionName = nonEmptyText(args?.name);
    if (logicalName && actionName && logicalName !== actionName) {
      args!.name = logicalName;
      repairs.push({ kind: 'normalize', path: 'next_pass.actions[].args.name',
        source: 'next_pass.logical_layer.layer_name',
        reason: `Synchronized new-layer display name ${JSON.stringify(actionName)} to the explicitly declared semantic layer name ${JSON.stringify(logicalName)}; no owner or Photoshop layer id changes.` });
    } else if (args && logicalName && !actionName) {
      args.name = logicalName;
      repairs.push({ kind: 'inject_from_context', path: 'next_pass.actions[].args.name',
        source: 'next_pass.logical_layer.layer_name', reason: 'One explicitly named new semantic layer.' });
    } else if (actionName && !logicalName) {
      logical.layer_name = actionName;
      repairs.push({ kind: 'inject_from_context', path: 'next_pass.logical_layer.layer_name',
        source: 'next_pass.actions[].args.name', reason: 'One explicitly named new semantic layer.' });
    }
  }
  // Technical model identities are uniquely known from the pinned pass or its
  // durable scene. Do not fill in missing artistic model structures or choices.
  const record = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : undefined;
  const light = record(pass.scene_lighting_color_model);
  const colorReport = record(pass.color_gradient_preflight);
  const selectedStops = Array.isArray(colorReport?.stops) ? colorReport.stops.map(record).filter(Boolean) : [];
  const selectedAnchors = [record(light?.ambient_environment),
    ...(Array.isArray(light?.emitters) ? light.emitters.map(record) : [])];
  for (const [i, anchor] of selectedAnchors.entries()) {
    const sample = record(anchor?.sample);
    if (anchor?.provenance !== 'artist-selected' || !Array.isArray(sample?.rgb)) continue;
    const selected = selectedStops.find(stop => stop?.provenance === 'artist-selected'
      && nonEmptyText(stop.artistic_choice)
      && (stop.source_anchor_id === anchor.id || stop.id === anchor.id)
      && JSON.stringify(stop.rgb) === JSON.stringify(sample.rgb));
    if (!selected) continue;
    delete anchor.sample;
    repairs.push({ kind: 'normalize', normalizer: 'artist_color_not_sample',
      path: `next_pass.scene_lighting_color_model.${i === 0 ? 'ambient_environment' : `emitters[${i - 1}]`}.sample`,
      source: 'next_pass.color_gradient_preflight.stops',
      reason: 'The same named artist-selected RGB and explicit artistic choice are already preserved in the color preflight. Remove only the contradictory duplicate measurement claim.' });
  }
  const inject = (object: Record<string, unknown> | undefined, key: string, value: unknown,
    path: string, source: string) => {
    if (!object || object[key] !== undefined || value === undefined || value === null) return;
    object[key] = structuredClone(value);
    repairs.push({ kind: 'inject_from_context', path, source,
      reason: 'Unambiguous identity inherited from the pinned document or explicitly selected model.' });
  };
  for (const field of ['scene_lighting_color_model', 'scene_camera_imaging_model'] as const) {
    const model = record(pass[field]);
    const frame = record(model?.source_frame);
    inject(frame, 'document_id', pass.document_id, `next_pass.${field}.source_frame.document_id`, 'next_pass.document_id');
    inject(frame, 'document_incarnation', context.document_incarnation_id,
      `next_pass.${field}.source_frame.document_incarnation`, 'compactPassContext.document_incarnation_id');
  }
  const camera = record(pass.scene_camera_imaging_model);
  const selectedGeometry = record(pass.scene_geometry_model) ?? record(context.scene_geometry_model);
  inject(camera, 'geometry_model_id', selectedGeometry?.model_id,
    'next_pass.scene_camera_imaging_model.geometry_model_id', 'selected_geometry.model_id');
  inject(camera, 'geometry_model_revision', selectedGeometry?.revision,
    'next_pass.scene_camera_imaging_model.geometry_model_revision', 'selected_geometry.revision');
  const binding = record(logical?.camera_binding);
  const selectedCamera = camera ?? record(context.scene_camera_imaging_model);
  inject(binding, 'scene_camera_model_id', selectedCamera?.model_id,
    'next_pass.logical_layer.camera_binding.scene_camera_model_id', 'selected_camera.model_id');
  inject(binding, 'scene_camera_revision', selectedCamera?.revision,
    'next_pass.logical_layer.camera_binding.scene_camera_revision', 'selected_camera.revision');
  if (record(logical?.geometry_binding)) inject(binding, 'geometry_binding_owner_id', ownerId,
    'next_pass.logical_layer.camera_binding.geometry_binding_owner_id', 'next_pass.logical_layer.hypothesis_id');
  if (!issues.length) {
    const bound = bindUniqueNewLayerStepTarget(pass);
    repairs.push(...bound.repairs);
    return { pass: bound.pass, repairs, issues };
  }
  return { pass, repairs, issues };
}

export function applyDeterministicPassRepairs(
  rawPass: Record<string, unknown>,
  violations: RepairableViolation[],
  context: Record<string, unknown>
): {
  repaired_pass: Record<string, unknown>;
  repairs: StructuredRepairOperation[];
  classified: ClassifiedViolation[];
} {
  const repairedPass = structuredClone(rawPass);
  const repairs: StructuredRepairOperation[] = [];
  const classified = classifyViolations(violations);

  const autoPatch = classified.some(item => item.repair_class === 'AUTO_PATCH');
  // A missing region target is reported by the visual-plan validator as a
  // generic error. Only retry this *specific* unambiguous omission locally;
  // unrelated semantic failures and explicit foreign targets must retain their
  // original rejection code, not turn into deterministic_repair_repeat.
  const owner = repairedPass.logical_layer && typeof repairedPass.logical_layer === 'object'
    && !Array.isArray(repairedPass.logical_layer)
    ? repairedPass.logical_layer as Record<string, unknown>
    : undefined;
  const actions = Array.isArray(repairedPass.actions) ? repairedPass.actions : [];
  const durableOwner = ownerMap(context).get(nonEmptyText(owner?.hypothesis_id) ?? '');
  const ownerLayerId = Number(durableOwner?.layer_id);
  const regionTargets = actions.flatMap(action => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return [];
    const item = action as Record<string, unknown>;
    const args = item.args as Record<string, unknown> | undefined;
    return item.tool === 'photoshop_paint_regions' && Array.isArray(args?.regions)
      ? args.regions.filter((region): region is Record<string, unknown> =>
        !!region && typeof region === 'object' && !Array.isArray(region))
      : [];
  });
  // One explicitly foreign target makes the pass ambiguous even when another
  // action omitted its target. Do not repair the logical owner or any sibling
  // action as a side effect: preserve the caller's exact conflicting payload
  // for an actionable fail-closed rejection.
  const explicitForeignTarget = Number.isSafeInteger(ownerLayerId) && ownerLayerId > 0
    && (regionTargets.some(region => region.layer_id !== undefined && region.layer_id !== ownerLayerId)
      || actions.some(action => {
        if (!action || typeof action !== 'object' || Array.isArray(action)) return false;
        const item = action as Record<string, unknown>;
        const args = item.args && typeof item.args === 'object' && !Array.isArray(item.args)
          ? item.args as Record<string, unknown> : undefined;
        return args?.layer_id !== undefined && args.layer_id !== ownerLayerId;
      }));
  const unambiguousRegionTargets = Number.isSafeInteger(ownerLayerId) && ownerLayerId > 0
    && actions.length > 0 && actions.every(action =>
      action && typeof action === 'object' && !Array.isArray(action)
      && (action as Record<string, unknown>).tool === 'photoshop_paint_regions')
    && regionTargets.some(region => region.layer_id === undefined)
    && regionTargets.every(region => region.layer_id === undefined || region.layer_id === ownerLayerId);
  const targetViolation = violations.find(item => item.code === 'invalid_visual_microplan');
  const missingKnownOwnerTarget = (targetViolation?.code === 'invalid_visual_microplan'
    && targetViolation.message.startsWith('continue-logical-layer/adjust mutations must target logical_layer.layer_id=')
    || classified.some(item => item.repair_class === 'SPLIT_DEFER'))
    && ['continue-logical-layer', 'adjust'].includes(nonEmptyText(owner?.decision) ?? '')
    && unambiguousRegionTargets;
  if (!explicitForeignTarget && (autoPatch || missingKnownOwnerTarget)) {
    patchKnownOwner(repairedPass, context, repairs);
  }
  if (autoPatch) {
    // A nested explicitly authored microplan keeps all mutations and artistic choices.
    // Repair only omitted technical envelope/preview/pins, never a conflicting target.
    for (const unknownItem of (repairedPass.actions as unknown[] ?? [])) {
      const item = unknownItem as Record<string, any>;
      if (item?.tool !== 'photoshop_execute_visual_microplan' || !Array.isArray(item.args?.steps)) continue;
      const plan = item.args;
      if (plan.document_id === undefined && repairedPass.document_id !== undefined) {
        plan.document_id = repairedPass.document_id;
        repairs.push({ kind: 'inject_from_context', path: 'next_pass.actions.args.document_id', source: 'pinned_pass', reason: 'Nested plan omitted its explicitly pinned document' });
      }
      if (Number.isSafeInteger(ownerLayerId) && ownerLayerId > 0 && ['continue-logical-layer','adjust'].includes(nonEmptyText(owner?.decision) ?? '')) {
        for (const step of plan.steps) {
          if (['photoshop_move_layer','photoshop_rotate_layer','photoshop_scale_layer'].includes(step?.tool)
            && step.args && step.args.layer_id === undefined) {
            step.args.layer_id = ownerLayerId;
            repairs.push({ kind: 'inject_from_context', path: 'next_pass.actions.args.steps.args.layer_id', source: 'durable_owner', reason: 'Pin the authored transform to the one durable owner' });
          }
        }
      }
      if (plan.steps.at(-1)?.tool !== 'photoshop_get_preview' && plan.steps.some((s: any) => VISUAL_MUTATION_TOOLS.has(s?.tool) || ['photoshop_move_layer','photoshop_rotate_layer','photoshop_scale_layer'].includes(s?.tool))) {
        const ids = new Set(plan.steps.map((s: any) => s?.id));
        let id = 'guard_after'; while (ids.has(id)) id += '_';
        plan.steps.push({ id, tool: 'photoshop_get_preview', args: { document_id: plan.document_id, include_image: false } });
        repairs.push({ kind: 'normalize', path: 'next_pass.actions.args.steps', normalizer: 'terminal_preview', reason: 'The final exact preview is a technical requirement of the existing authored microplan' });
      }
    }
    // Never replace an explicitly mismatched model incarnation. Its camera/
    // geometry/lighting measurements may belong to another physical document.
    // prepareGeometryContract already injects a missing technical incarnation
    // from unique current context; an explicit stale value is a real blocker.
  }

  return { repaired_pass: repairedPass, repairs, classified };
}

function containsStepReference(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('$steps.');
  if (Array.isArray(value)) return value.some(containsStepReference);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(containsStepReference);
  return false;
}

function deferredRequestKey(base: string, actions: Array<Record<string, unknown>>): string {
  const digest = createHash('sha256').update(JSON.stringify(actions)).digest('hex').slice(0, 8);
  return `${base.slice(0, 58)}-defer-${digest}`;
}

function allowedMutationCount(violations: RepairableViolation[]): number | undefined {
  for (const violation of violations) {
    if (!SPLIT_CODES.has(violation.code)) continue;
    const parsed = Number(violation.details?.allowed_mutations);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

/**
 * Split an oversized native stroke action at ORIGINAL stroke boundaries, not
 * expanded dynamic segments. The first pass remains a bounded atomic tool
 * invocation; the suffix is held for a separate Guard-reviewed cycle.
 * Do not change brush dynamics, mode, stroke order or layer ownership.
 */
function splitStrokeActionsAtBudget(
  actions: Array<Record<string, unknown>>, maxBatches: number,
): { first: Array<Record<string, unknown>>; deferred: Array<Record<string, unknown>> } | undefined {
  let usedBatches = 0;
  const first: Array<Record<string, unknown>> = [];
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index]!;
    const args = action.args as Record<string, unknown> | undefined;
    const strokes = args?.strokes;
    if (!Array.isArray(strokes) || !strokes.length || String(args?.batch_mode ?? 'AUTO').toUpperCase() !== 'AUTO')
      return undefined;
    let low = 1, high = strokes.length, fit = 0, fitBatches = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      try {
        const budget = strokeExecutionBudget({ ...args, strokes: strokes.slice(0, middle) });
        if (budget.allowed && usedBatches + budget.auto_batches <= maxBatches) {
          fit = middle;
          fitBatches = budget.auto_batches;
          low = middle + 1;
        } else high = middle - 1;
      } catch { return undefined; }
    }
    if (fit === strokes.length) {
      first.push(structuredClone(action));
      usedBatches += fitBatches;
      continue;
    }
    if (!first.length && !fit) return undefined;
    const deferred = actions.slice(index).map(item => structuredClone(item));
    if (fit > 0) {
      const front = structuredClone(action);
      (front.args as Record<string, unknown>).strokes = structuredClone(strokes.slice(0, fit));
      first.push(front);
      (deferred[0]!.args as Record<string, unknown>).strokes = structuredClone(strokes.slice(fit));
    }
    return { first, deferred };
  }
  return undefined;
}

export function splitPassForBudget(
  rawPass: Record<string, unknown>,
  violations: RepairableViolation[]
): {
  first_pass: Record<string, unknown>;
  deferred_pass: Record<string, unknown>;
  repair: StructuredRepairOperation;
} | undefined {
  const allowed = allowedMutationCount(violations);
  const actions = Array.isArray(rawPass.actions)
    ? rawPass.actions.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : [];
  if ((nonEmptyText(rawPass.action_class) ?? 'ADD').toUpperCase() !== 'ADD') return undefined;
  const logicalLayer = rawPass.logical_layer && typeof rawPass.logical_layer === 'object' && !Array.isArray(rawPass.logical_layer)
    ? rawPass.logical_layer as Record<string, unknown>
    : undefined;
  if (nonEmptyText(logicalLayer?.decision) === 'create-new' || nonEmptyText(logicalLayer?.decision) === 'temporary-hypothesis') {
    return undefined;
  }
  if (!actions.every(action => VISUAL_MUTATION_TOOLS.has(nonEmptyText(action.tool) ?? ''))) return undefined;
  if (actions.some(action => containsStepReference(action.args))) return undefined;
  const toolSet = new Set(actions.map(action => nonEmptyText(action.tool)).filter(Boolean));
  if (toolSet.size !== 1) return undefined;

  // A single paint_strokes action can expand to more than eight native AUTO
  // batches even though the visual mutation count is only one.
  const strokeOverflow = violations.find(item => item.code === 'stroke_batch_budget_exceeded');
  if (strokeOverflow && toolSet.has('photoshop_paint_strokes')) {
    const maxBatches = Number(strokeOverflow.details?.max_auto_batches);
    const ownerLayerId = logicalLayer?.layer_id;
    if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 8
      || !['continue-logical-layer', 'adjust'].includes(nonEmptyText(logicalLayer?.decision) ?? '')
      || !Number.isSafeInteger(ownerLayerId) || Number(ownerLayerId) <= 0
      || actions.some(action => (action.args as Record<string, unknown> | undefined)?.layer_id !== ownerLayerId))
      return undefined;
    const split = splitStrokeActionsAtBudget(actions, maxBatches);
    const requestKey = nonEmptyText(rawPass.request_key);
    if (!split || !requestKey) return undefined;
    const firstPass = structuredClone(rawPass);
    firstPass.actions = split.first;
    const deferredPass = structuredClone(rawPass);
    deferredPass.request_key = deferredRequestKey(requestKey, split.deferred);
    deferredPass.actions = split.deferred;
    return { first_pass: firstPass, deferred_pass: deferredPass, repair: {
      kind: 'split_defer', path: 'next_pass.actions',
      source: `native_stroke_batch_budget:${maxBatches}`,
      reason: 'Split at original stroke boundaries without changing brush parameters, dynamics or owner; retain the suffix for a separate pass after visual review.',
    } };
  }
  if (!allowed || actions.length <= allowed) return undefined;

  const firstActions = actions.slice(0, allowed).map(action => structuredClone(action));
  const deferredActions = actions.slice(allowed).map(action => structuredClone(action));
  if (!firstActions.length || !deferredActions.length) return undefined;
  const requestKey = nonEmptyText(rawPass.request_key);
  if (!requestKey) return undefined;
  const firstPass = structuredClone(rawPass);
  firstPass.actions = firstActions;
  const deferredPass = structuredClone(rawPass);
  deferredPass.request_key = deferredRequestKey(requestKey, deferredActions);
  deferredPass.actions = deferredActions;

  return {
    first_pass: firstPass,
    deferred_pass: deferredPass,
    repair: {
      kind: 'split_defer',
      path: 'next_pass.actions',
      source: `adaptive_mutation_budget:${allowed}`,
      reason: 'The pass contains ordered independent same-tool ADD mutations with no step dependencies; dispatch the bounded prefix and re-evaluate the deferred suffix after visual review.',
    },
  };
}

export function machineRepairRecipe(
  violations: RepairableViolation[],
  repairs: StructuredRepairOperation[] = []
): Record<string, unknown> {
  const classified = classifyViolations(violations);
  const diagnosticContractIncomplete = fieldCorrectionPacket(violations).unaddressable_count > 0;
  return {
    repairs,
    violation_classes: classified.map(item => ({
      code: item.violation.code,
      repair_class: item.repair_class,
    })),
    model_semantic_decision_required: classified.some(item => item.repair_class === 'MODEL_SEMANTIC_DECISION'),
    systemic_failure: classified.some(item => item.repair_class === 'SYSTEMIC_FAILURE')
      || diagnosticContractIncomplete,
    diagnostic_contract_incomplete: diagnosticContractIncomplete,
  };
}
