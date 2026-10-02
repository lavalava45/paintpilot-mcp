import { createHash } from 'node:crypto';

export const VIOLATION_REPAIR_CLASSES = [
  'AUTO_NORMALIZE',
  'AUTO_PATCH',
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
  'brush_role_ambiguous',
  'brush_preset_choice_required',
  'brush_material_role_required',
  'semantic_layer_owner_missing',
  'semantic_layer_isolation_required',
  'scene_ownership_plan_required',
  'scene_ownership_owner_unplanned',
  'construction_role_material_role_required',
  'painting_stage_reset_required',
  'compact_local_region_bounds_required',
  'compact_review_region_bounds_required',
  'geometry_binding_required',
  'material_response_plan_required',
]);

const SYSTEMIC_CODES = new Set([
  'scene_ownership_plan_state_invalid',
  'scene_geometry_model_state_invalid',
  'scene_lighting_color_model_state_invalid',
  'scene_camera_imaging_model_state_invalid',
  'geometry_binding_state_invalid',
  'document_instance_probe_failed',
  'document_instance_witness_missing',
  'dynamic_preflight_failed',
]);

const SPLIT_CODES = new Set([
  'compact_pass_visual_mutation_limit',
  'compact_pass_adaptive_mutation_budget_exceeded',
]);

const NORMALIZE_CODES = new Set([
  'compact_action_class_invalid',
]);

const PATCH_CODES = new Set([
  'semantic_layer_pollution',
  'scene_geometry_model_incarnation_mismatch',
  'scene_lighting_color_model_incarnation_mismatch',
  'scene_camera_imaging_model_incarnation_mismatch',
]);

export function classifyViolation(violation: RepairableViolation): ViolationRepairClass {
  if (
    violation.code === 'invalid_visual_microplan'
    && /mutation budget exceeded/i.test(violation.message)
  ) return 'SPLIT_DEFER';
  if (SYSTEMIC_CODES.has(violation.code) || /_state_invalid$/.test(violation.code)) return 'SYSTEMIC_FAILURE';
  if (SPLIT_CODES.has(violation.code)) return 'SPLIT_DEFER';
  if (MODEL_DECISION_CODES.has(violation.code)) return 'MODEL_SEMANTIC_DECISION';
  if (NORMALIZE_CODES.has(violation.code)) return 'AUTO_NORMALIZE';
  if (PATCH_CODES.has(violation.code)) return 'AUTO_PATCH';
  if (violation.scope === 'finalization' || violation.scope === 'cycle') return 'MODEL_SEMANTIC_DECISION';
  return 'MODEL_SEMANTIC_DECISION';
}

export function classifyViolations(violations: RepairableViolation[]): ClassifiedViolation[] {
  return violations.map(violation => ({ violation, repair_class: classifyViolation(violation) }));
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
        ['photoshop_paint_strokes', 'photoshop_paint_dabs', 'photoshop_fill_layer',
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

function patchAuthoritativeModelIncarnation(
  pass: Record<string, unknown>,
  context: Record<string, unknown>,
  violations: RepairableViolation[],
  repairs: StructuredRepairOperation[]
): void {
  const incarnation = nonEmptyText(context.document_incarnation_id);
  if (!incarnation) return;
  const fields: Array<{ code: string; field: string }> = [
    { code: 'scene_geometry_model_incarnation_mismatch', field: 'scene_geometry_model' },
    { code: 'scene_lighting_color_model_incarnation_mismatch', field: 'scene_lighting_color_model' },
    { code: 'scene_camera_imaging_model_incarnation_mismatch', field: 'scene_camera_imaging_model' },
  ];
  const violationCodes = new Set(violations.map(item => item.code));
  for (const { code, field } of fields) {
    if (!violationCodes.has(code)) continue;
    const model = pass[field];
    if (!model || typeof model !== 'object' || Array.isArray(model)) continue;
    const clonedModel = structuredClone(model) as Record<string, unknown>;
    const source = clonedModel.source_frame;
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const clonedSource = structuredClone(source) as Record<string, unknown>;
    if (clonedSource.document_incarnation === incarnation) continue;
    clonedSource.document_incarnation = incarnation;
    clonedModel.source_frame = clonedSource;
    pass[field] = clonedModel;
    repairs.push({
      kind: 'replace_from_context',
      path: `next_pass.${field}.source_frame.document_incarnation`,
      source: 'compactPassContext.document_incarnation_id',
      reason: 'The exact current document incarnation is durable Guard state and must not be restated or guessed by the model.',
    });
  }
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

  if (classified.some(item => item.repair_class === 'AUTO_PATCH')) {
    patchKnownOwner(repairedPass, context, repairs);
    patchAuthoritativeModelIncarnation(repairedPass, context, violations, repairs);
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
    const match = violation.message.match(/allows\s+(\d+)/i)
      ?? violation.message.match(/at most\s+(\d+)/i);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
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
  if (!allowed || actions.length <= allowed) return undefined;
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
  return {
    repairs,
    violation_classes: classified.map(item => ({
      code: item.violation.code,
      repair_class: item.repair_class,
    })),
    model_semantic_decision_required: classified.some(item => item.repair_class === 'MODEL_SEMANTIC_DECISION'),
    systemic_failure: classified.some(item => item.repair_class === 'SYSTEMIC_FAILURE'),
  };
}
