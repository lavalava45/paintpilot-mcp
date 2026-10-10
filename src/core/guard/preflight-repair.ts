import { createHash } from 'node:crypto';

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
  'scene_component_plan_required',
  'scene_component_scope_required',
  'scene_component_decomposition_required',
  'scene_component_layer_conflict',
  'stroke_batch_budget_exceeded',
  'construction_role_material_role_required',
  'painting_stage_reset_required',
  'compact_local_region_bounds_required',
  'compact_review_region_bounds_required',
  'geometry_binding_required',
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
  if (SYSTEMIC_CODES.has(violation.code) || /_state_invalid$/.test(violation.code)) return 'SYSTEMIC_FAILURE';
  if (SPLIT_CODES.has(violation.code)) return 'SPLIT_DEFER';
  if (['geometry_contract_invalid', 'attention_binding_invalid'].includes(violation.code)) return 'CONTRACT_CORRECTION';
  if (violation.code === 'geometry_contract_retry_exhausted') return 'SYSTEMIC_FAILURE';
  if (MODEL_DECISION_CODES.has(violation.code)) return 'MODEL_SEMANTIC_DECISION';
  if (NORMALIZE_CODES.has(violation.code)) return 'AUTO_NORMALIZE';
  if (PATCH_CODES.has(violation.code)) return 'AUTO_PATCH';
  if (['compact_actions_required','compact_action_schema_invalid','compact_request_key_required',
    'compact_goal_required','guard_tool_contract_unknown','construction_role_intent_mismatch',
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
    const parsed = Number(violation.details?.allowed_mutations);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
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
