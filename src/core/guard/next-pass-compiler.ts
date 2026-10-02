import {
  type PaintingIntent,
  type PaintingIntentAction,
  type PaintingIntentScale,
} from './painting-intent.js';

export interface NextPassCompilerStore {
  compactPassContext?(documentId: number, projectionContext?: unknown): Record<string, unknown>;
  compilerDeferredNextPass?(operationId: string): Record<string, unknown> | undefined;
}

export interface PaintingIntentSkeleton {
  request_key?: string;
  problem_id: string;
  target_owner_id?: string;
  goal: string;
  scale?: string;
  region?: string;
  allowed_change_domains?: string[];
  preferred_method_family?: string;
  protected_qualities?: string[];
  stage?: string;
  source: 'current-task' | 'next-task' | 'corrective-branch';
}

export interface NextPassCompileDiagnostic {
  code: string;
  message: string;
  source?: string;
}

export interface NextPassCompileResult {
  next_pass: Record<string, unknown>;
  diagnostics: NextPassCompileDiagnostic[];
  context: Record<string, unknown>;
  durable_state_injection_ms: number;
}

export const NEXT_PASS_DERIVATION_RULES = [
  {
    field: 'stage',
    source_of_truth: 'compactPassContext.stage',
    derivation_rule: 'inherit the durable current stage when PaintingIntent does not request a stage change',
    model_override: 'only when changing stage is itself the artistic decision and existing stage-reset rules permit it',
    ambiguity_rule: 'fail closed when a requested transition requires authority not supplied by durable state',
  },
  {
    field: 'scale',
    source_of_truth: 'PaintingIntent.scale -> compactPassContext.scale',
    derivation_rule: 'prefer explicit artistic scale, otherwise inherit the compatible active durable scale',
    model_override: 'when the review intentionally changes working scale',
    ambiguity_rule: 'do not invent a scale when neither intent nor durable state establishes one',
  },
  {
    field: 'planner ids',
    source_of_truth: 'compactPassContext.art_director current task',
    derivation_rule: 'inject the single active directive/task binding',
    model_override: 'only when switching planner task is itself intentional',
    ambiguity_rule: 'multiple/no active tasks are not silently guessed',
  },
  {
    field: 'owner layer id',
    source_of_truth: 'logical_layer_owners[hypothesis_id].layer_id',
    derivation_rule: 'resolve target_owner_id to its authoritative current physical layer',
    model_override: 'only for a real owner reconstruction/replacement decision',
    ambiguity_rule: 'missing or multiply bound owner fails as a semantic compiler decision',
  },
  {
    field: 'logical owner metadata',
    source_of_truth: 'logical_layer_owners[hypothesis_id]',
    derivation_rule: 'inherit rollback/editability/construction and durable binding metadata for continuation',
    model_override: 'explicit structural reconstruction',
    ambiguity_rule: 'new unplanned owners require an explicit semantic role/ownership decision',
  },
  {
    field: 'geometry/camera/attention binding',
    source_of_truth: 'durable semantic owner bindings',
    derivation_rule: 'reuse the authoritative current binding for stable-owner continuation',
    model_override: 'explicit causal geometry/camera/attention change',
    ambiguity_rule: 'stale/contradictory bindings remain Guard failures rather than guessed repairs',
  },
  {
    field: 'brush role',
    source_of_truth: 'durable brush preflight roles',
    derivation_rule: 'select only when material_role + visual_intent + scale leave one compatible role',
    model_override: 'preferred_brush_role when the visible outcome intentionally depends on another role',
    ambiguity_rule: 'multiple materially different compatible roles return a semantic decision',
  },
  {
    field: 'protected sibling layers',
    source_of_truth: 'durable semantic owner bindings + PaintingIntent.preserve',
    derivation_rule: 'protect sibling owners, narrowed by explicit preserve owner ids when supplied',
    model_override: 'replace/erase authority is explicit and remains validated by Guard',
    ambiguity_rule: 'never drop protection merely to make a request pass',
  },
  {
    field: 'verification profile',
    source_of_truth: 'intent scale/region plus existing Guard review profile rules',
    derivation_rule: 'derive normal vs subtle-local intent and let the final Guard compiler expand the full profile',
    model_override: 'only when a stronger review is intentionally required',
    ambiguity_rule: 'review requirements may be strengthened but not silently weakened',
  },
  {
    field: 'material role',
    source_of_truth: 'PaintingIntent.material_role or unique compatible durable brush/material role',
    derivation_rule: 'inherit only a uniquely established material role',
    model_override: 'when material identity/response is a new artistic choice',
    ambiguity_rule: 'multiple material meanings require model semantic input',
  },
  {
    field: 'action class',
    source_of_truth: 'PaintingIntent.action',
    derivation_rule: 'add/refine -> ADD, replace -> REPLACE, erase -> ERASE, rollback -> ROLLBACK',
    model_override: 'change PaintingIntent.action rather than protocol boilerplate',
    ambiguity_rule: 'destructive/coupled meanings are never normalized into a different action class',
  },
] as const;

export class NextPassCompilerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'NextPassCompilerError';
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function currentTask(context: Record<string, unknown>): Record<string, unknown> | undefined {
  const art = context.art_director && typeof context.art_director === 'object' && !Array.isArray(context.art_director)
    ? context.art_director as Record<string, unknown>
    : undefined;
  const currentTaskId = text(art?.current_task_id);
  return currentTaskId
    ? records(art?.tasks).find(task => text(task.task_id) === currentTaskId)
    : undefined;
}

export function resolveIntentStage(intent: PaintingIntent, context: Record<string, unknown>): string | undefined {
  return intent.stage ?? text(context.stage);
}

export function resolveIntentScale(
  intent: PaintingIntent,
  context: Record<string, unknown>
): PaintingIntentScale | undefined {
  const value = intent.scale ?? text(context.scale);
  return value as PaintingIntentScale | undefined;
}

export function resolveTargetOwner(
  intent: PaintingIntent,
  context: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!intent.target_owner_id) return undefined;
  const matches = records(context.logical_layer_owners)
    .filter(owner => text(owner.hypothesis_id) === intent.target_owner_id);
  if (matches.length > 1) {
    throw new NextPassCompilerError(
      'painting_intent_owner_ambiguous',
      `Cannot compile PaintingIntent: semantic owner ${intent.target_owner_id} has multiple durable bindings.`,
      { owner_id: intent.target_owner_id, matches: matches.length }
    );
  }
  return matches[0];
}

function scenePlanOwner(
  intent: PaintingIntent,
  context: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!intent.target_owner_id) return undefined;
  const plan = context.scene_ownership_plan && typeof context.scene_ownership_plan === 'object'
    && !Array.isArray(context.scene_ownership_plan)
    ? context.scene_ownership_plan as Record<string, unknown>
    : undefined;
  return records(plan?.units).find(unit =>
    text(unit.owner_id) === intent.target_owner_id || text(unit.semantic_id) === intent.target_owner_id
  );
}

export function resolvePhysicalLayer(owner: Record<string, unknown> | undefined): number | undefined {
  const layerId = Number(owner?.layer_id);
  return Number.isSafeInteger(layerId) && layerId > 0 ? layerId : undefined;
}

export function resolveActionClass(action: PaintingIntentAction): 'ADD' | 'REPLACE' | 'ERASE' | 'ROLLBACK' {
  if (action === 'replace') return 'REPLACE';
  if (action === 'erase') return 'ERASE';
  if (action === 'rollback') return 'ROLLBACK';
  return 'ADD';
}

function changeKindForConstructionRole(role: string | undefined): string {
  if (role === 'continuous-field' || role === 'planar-surface') return 'new-plane';
  if (role === 'optical-veil' || role === 'light-effect') return 'new-light';
  return 'new-object';
}

export function resolveLayerSeparationContract(
  intent: PaintingIntent,
  owner: Record<string, unknown> | undefined,
  plannedOwner: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!intent.target_owner_id) return undefined;
  if (owner) {
    return {
      change_kind: 'continuation',
      substantial: true,
      rollback_value: text(owner.rollback_value) ?? 'low',
      independent_adjustment_expected: false,
      reasons: ['Continue the uniquely bound durable semantic owner selected by PaintingIntent.'],
    };
  }
  if (!plannedOwner) {
    throw new NextPassCompilerError(
      'painting_intent_owner_unplanned',
      `Cannot create semantic owner ${intent.target_owner_id}: it is not present in the durable scene ownership plan.`,
      { owner_id: intent.target_owner_id }
    );
  }
  if (!intent.construction_role) {
    throw new NextPassCompilerError(
      'painting_intent_new_owner_role_required',
      `Creating semantic owner ${intent.target_owner_id} requires construction_role; this is a structural artistic choice and is not inferred.`,
      { owner_id: intent.target_owner_id }
    );
  }
  return {
    change_kind: changeKindForConstructionRole(intent.construction_role),
    substantial: true,
    rollback_value: 'moderate',
    independent_adjustment_expected: true,
    reasons: ['Create the predeclared semantic owner as an independently editable rollback unit.'],
  };
}

export function resolveGeometryBinding(owner: Record<string, unknown> | undefined): unknown {
  return owner?.geometry_binding === undefined ? undefined : structuredClone(owner.geometry_binding);
}

export function resolveMaterialContract(
  intent: PaintingIntent,
  context: Record<string, unknown>
): { material_role?: string; brush_role?: string } {
  const roles = records(context.brush_roles);
  const explicitMaterial = intent.material_role;
  const explicitBrush = intent.preferred_brush_role;
  const compatible = roles.filter(role => {
    const materials = Array.isArray(role.material_roles) ? role.material_roles.map(text).filter(Boolean) : [];
    const intents = Array.isArray(role.visual_intents) ? role.visual_intents.map(text).filter(Boolean) : [];
    return (!explicitMaterial || materials.includes(explicitMaterial))
      && (!intent.visual_intent || intents.includes(intent.visual_intent))
      && (!explicitBrush || text(role.role_id) === explicitBrush);
  });
  const materialCandidates = [...new Set(compatible.flatMap(role =>
    Array.isArray(role.material_roles) ? role.material_roles.map(text).filter((value): value is string => !!value) : []
  ))];
  return {
    ...(explicitMaterial
      ? { material_role: explicitMaterial }
      : materialCandidates.length === 1 ? { material_role: materialCandidates[0] } : {}),
    ...(explicitBrush
      ? { brush_role: explicitBrush }
      : compatible.length === 1 && text(compatible[0]?.role_id) ? { brush_role: text(compatible[0]?.role_id) } : {}),
  };
}

export function resolveBrushRole(
  intent: PaintingIntent,
  context: Record<string, unknown>
): string | undefined {
  return resolveMaterialContract(intent, context).brush_role;
}

export function resolveProtectionSet(
  intent: PaintingIntent,
  context: Record<string, unknown>,
  targetOwner: Record<string, unknown> | undefined
): number[] {
  const preserve = new Set(intent.preserve ?? []);
  const targetId = text(targetOwner?.hypothesis_id);
  const owners = records(context.logical_layer_owners);
  const ids = owners
    .filter(owner => {
      const ownerId = text(owner.hypothesis_id);
      if (!ownerId || ownerId === targetId) return false;
      return preserve.size === 0 || preserve.has(ownerId);
    })
    .map(owner => resolvePhysicalLayer(owner))
    .filter((id): id is number => id !== undefined);
  return [...new Set(ids)];
}

export function resolvePlannerBinding(context: Record<string, unknown>): Record<string, unknown> | undefined {
  const art = context.art_director && typeof context.art_director === 'object' && !Array.isArray(context.art_director)
    ? context.art_director as Record<string, unknown>
    : undefined;
  const task = currentTask(context);
  const directiveId = text(art?.directive_id);
  const taskId = text(task?.task_id);
  if (!directiveId || !taskId) return undefined;
  return {
    planner_directive_id: directiveId,
    planner_task_id: taskId,
    allowed_scales: Array.isArray(task?.allowed_scales) ? [...task.allowed_scales] : [],
    allowed_global_changes: Array.isArray(task?.allowed_global_changes) ? [...task.allowed_global_changes] : [],
  };
}

export function resolveVerificationProfile(
  intent: PaintingIntent,
  scale: string | undefined
): { significance_mode: 'normal' | 'subtle_local'; needs_region: boolean } {
  const local = ['small', 'detail', 'local', 'micro'].includes((scale ?? '').toLowerCase());
  return {
    significance_mode: local && !!intent.region_bounds ? 'subtle_local' : 'normal',
    needs_region: local,
  };
}

function mergeableActionCollectionKey(tool: string): string | undefined {
  if (tool === 'photoshop_paint_strokes') return 'strokes';
  if (tool === 'photoshop_paint_dabs') return 'dabs';
  if (tool === 'photoshop_paint_regions') return 'regions';
  return undefined;
}

function stableComparableArgs(args: Record<string, unknown>, collectionKey: string): string {
  const comparable = structuredClone(args);
  delete comparable[collectionKey];
  return JSON.stringify(comparable, Object.keys(comparable).sort());
}

export function consolidateCompatibleActions(
  input: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];
  for (const action of input) {
    const tool = text(action.tool);
    const key = tool ? mergeableActionCollectionKey(tool) : undefined;
    const args = action.args && typeof action.args === 'object' && !Array.isArray(action.args)
      ? structuredClone(action.args) as Record<string, unknown>
      : {};
    if (!tool || !key || !Array.isArray(args[key])) {
      output.push(structuredClone(action));
      continue;
    }
    const previous = output.at(-1);
    const previousTool = text(previous?.tool);
    const previousArgs = previous?.args && typeof previous.args === 'object' && !Array.isArray(previous.args)
      ? previous.args as Record<string, unknown>
      : undefined;
    const sameMethod = text(previous?.method_id) === text(action.method_id);
    if (
      previous && previousTool === tool && previousArgs && Array.isArray(previousArgs[key])
      && sameMethod
      && stableComparableArgs(previousArgs, key) === stableComparableArgs(args, key)
    ) {
      previousArgs[key] = [...previousArgs[key] as unknown[], ...args[key] as unknown[]];
      continue;
    }
    output.push(structuredClone(action));
  }
  return output;
}

const DIRECT_LAYER_TARGET_TOOLS = new Set([
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_fill_layer',
  'photoshop_transform_layer',
  'photoshop_set_layer_opacity',
  'photoshop_delete_layer',
]);

function bindActionToLayer(action: Record<string, unknown>, layerId: number | undefined): Record<string, unknown> {
  if (!layerId) return structuredClone(action);
  const next = structuredClone(action);
  const tool = text(next.tool);
  const args = next.args && typeof next.args === 'object' && !Array.isArray(next.args)
    ? next.args as Record<string, unknown>
    : {};
  if (tool && DIRECT_LAYER_TARGET_TOOLS.has(tool) && args.layer_id === undefined) {
    args.layer_id = layerId;
  }
  if (tool === 'photoshop_paint_regions' && Array.isArray(args.regions)) {
    args.regions = args.regions.map(region => {
      if (!region || typeof region !== 'object' || Array.isArray(region)) return region;
      const nextRegion = { ...region as Record<string, unknown> };
      nextRegion.layer_id ??= layerId;
      return nextRegion;
    });
  }
  next.args = args;
  return next;
}

export function compileIntentActions(
  intent: PaintingIntent,
  owner: Record<string, unknown> | undefined
): Array<Record<string, unknown>> {
  if (!intent.actions?.length) {
    throw new NextPassCompilerError(
      'painting_intent_actions_required',
      'The artistic intent is clear, but concrete Photoshop action geometry is not uniquely derivable. Supply bounded actions; Guard will compile the protocol fields locally.'
    );
  }
  const layerId = resolvePhysicalLayer(owner);
  if (layerId) {
    return consolidateCompatibleActions(intent.actions.map(action => bindActionToLayer(action, layerId)));
  }

  const createLayer = intent.actions.find(action => text(action.tool) === 'photoshop_create_layer');
  const createLayerId = text(createLayer?.id);
  if (!createLayerId) return consolidateCompatibleActions(intent.actions.map(action => structuredClone(action)));
  const stepRef = `$steps.${createLayerId}.details.layerId`;
  return consolidateCompatibleActions(intent.actions.map(action => {
    if (action === createLayer) return structuredClone(action);
    const next = structuredClone(action);
    const tool = text(next.tool);
    const args = next.args && typeof next.args === 'object' && !Array.isArray(next.args)
      ? next.args as Record<string, unknown>
      : {};
    if (tool && DIRECT_LAYER_TARGET_TOOLS.has(tool) && args.layer_id === undefined) args.layer_id = stepRef;
    if (tool === 'photoshop_paint_color_gradient' && args.layer_id === undefined) args.layer_id = stepRef;
    if (tool === 'photoshop_paint_regions' && Array.isArray(args.regions)) {
      args.regions = args.regions.map(region => {
        if (!region || typeof region !== 'object' || Array.isArray(region)) return region;
        const nextRegion = { ...region as Record<string, unknown> };
        nextRegion.layer_id ??= stepRef;
        return nextRegion;
      });
    }
    next.args = args;
    return next;
  }));
}

function inferImpactClass(intent: PaintingIntent): string {
  if (intent.action === 'erase') return 'subtract';
  if (intent.action === 'rollback') return 'cleanup';
  if (intent.visual_intent === 'texture' || intent.visual_intent === 'surface-flow') return 'texture';
  if (intent.visual_intent === 'hard-edge' || intent.visual_intent === 'lost-edge') return 'edge';
  if (intent.visual_intent === 'soft-transition') return 'transition';
  if (intent.visual_intent === 'tonal-contrast' || intent.visual_intent === 'light-sculpt') return 'tone';
  if (intent.visual_intent === 'remove-distraction') return 'cleanup';
  if (intent.visual_intent === 'move-scale-rotate') return 'transform';
  return 'construct';
}

function logicalLayerForIntent(
  intent: PaintingIntent,
  owner: Record<string, unknown> | undefined,
  plannedOwner: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!intent.target_owner_id) return undefined;
  if (owner) {
    const result: Record<string, unknown> = {
      decision: intent.action === 'replace' || intent.action === 'erase' ? 'adjust' : 'continue-logical-layer',
      hypothesis_id: intent.target_owner_id,
      hypothesis: text(owner.hypothesis) ?? text(plannedOwner?.role) ?? `Stable semantic owner ${intent.target_owner_id}`,
      rollback_value: text(owner.rollback_value) ?? 'low',
      expected_independent_rollback: false,
      separation_reasons: ['PaintingIntent targets the existing durable semantic owner.'],
      ...(resolvePhysicalLayer(owner) ? { layer_id: resolvePhysicalLayer(owner) } : {}),
    };
    for (const field of [
      'layer_name', 'physical_role', 'opacity_role', 'construction_tier',
      'parent_hypothesis_id', 'parent_construction_revision', 'negative_space',
      'causal_effect', 'surface_frame', 'geometry_binding', 'camera_binding',
      'attention_binding', 'depth_relations',
    ] as const) {
      if (owner[field] !== undefined) result[field] = structuredClone(owner[field]);
    }
    return result;
  }
  const layerAction = intent.actions?.find(action => text(action.tool) === 'photoshop_create_layer');
  const layerArgs = layerAction?.args && typeof layerAction.args === 'object' && !Array.isArray(layerAction.args)
    ? layerAction.args as Record<string, unknown>
    : undefined;
  const deterministicPhysicalStack = intent.construction_role === 'structured-mass'
    ? { physical_role: 'opaque-mass', opacity_role: 'opaque' }
    : {};
  return {
    decision: 'create-new',
    hypothesis_id: intent.target_owner_id,
    hypothesis: text(plannedOwner?.role) ?? intent.goal,
    rollback_value: 'moderate',
    expected_independent_rollback: true,
    separation_reasons: ['PaintingIntent creates a predeclared independently editable semantic owner.'],
    ...deterministicPhysicalStack,
    ...(text(layerArgs?.name) ? { layer_name: text(layerArgs?.name) } : {}),
  };
}

export function compilePaintingIntentToNextPass(
  intent: PaintingIntent,
  store: NextPassCompilerStore,
  projectionContext?: unknown
): NextPassCompileResult {
  const injectionStartedAt = Date.now();
  const context = store.compactPassContext?.(intent.document_id, projectionContext) ?? {};
  const diagnostics: NextPassCompileDiagnostic[] = [];
  let effectiveIntent = intent;
  if (intent.deferred_from_operation_id) {
    if (intent.actions?.length) {
      throw new NextPassCompilerError(
        'painting_intent_deferred_actions_conflict',
        'Choose the compiler-owned deferred sub-pass or provide replacement actions, not both.'
      );
    }
    const deferred = store.compilerDeferredNextPass?.(intent.deferred_from_operation_id);
    if (!deferred) {
      throw new NextPassCompilerError(
        'painting_intent_deferred_subpass_missing',
        `No compiler-owned deferred sub-pass is durable for operation ${intent.deferred_from_operation_id}.`
      );
    }
    if (Number(deferred.document_id) !== intent.document_id || text(deferred.problem_id) !== intent.problem_id) {
      throw new NextPassCompilerError(
        'painting_intent_deferred_lineage_mismatch',
        'The selected deferred sub-pass belongs to a different document or artistic problem lineage.'
      );
    }
    const deferredVisualIntent = text(deferred.visual_intent);
    if (deferredVisualIntent && deferredVisualIntent !== intent.visual_intent) {
      throw new NextPassCompilerError(
        'painting_intent_deferred_semantic_change',
        'The review changed visual_intent, so the old compiler-owned action geometry cannot be reused. Supply new actions for the adapted intent.'
      );
    }
    const deferredActionClass = text(deferred.action_class)?.toUpperCase();
    if (deferredActionClass && deferredActionClass !== resolveActionClass(intent.action)) {
      throw new NextPassCompilerError(
        'painting_intent_deferred_action_change',
        'The review changed action semantics, so the old compiler-owned deferred actions cannot be reused.'
      );
    }
    const deferredLogicalLayer = deferred.logical_layer && typeof deferred.logical_layer === 'object'
      && !Array.isArray(deferred.logical_layer)
      ? deferred.logical_layer as Record<string, unknown>
      : undefined;
    const deferredOwnerId = text(deferredLogicalLayer?.hypothesis_id);
    if (intent.target_owner_id && deferredOwnerId && intent.target_owner_id !== deferredOwnerId) {
      throw new NextPassCompilerError(
        'painting_intent_deferred_owner_change',
        'The review selected a different semantic owner, so the old compiler-owned deferred actions cannot be reused.'
      );
    }
    const deferredActions = records(deferred.actions);
    if (!deferredActions.length) {
      throw new NextPassCompilerError(
        'painting_intent_deferred_actions_missing',
        'The compiler-owned deferred sub-pass does not contain reusable bounded actions.'
      );
    }
    effectiveIntent = {
      ...intent,
      ...(deferredOwnerId && !intent.target_owner_id ? { target_owner_id: deferredOwnerId } : {}),
      ...(text(deferred.region) && !intent.region ? { region: text(deferred.region) } : {}),
      ...(deferred.region_bounds && typeof deferred.region_bounds === 'object' && !Array.isArray(deferred.region_bounds)
        && !intent.region_bounds
        ? { region_bounds: structuredClone(deferred.region_bounds) as PaintingIntent['region_bounds'] }
        : {}),
      ...(text(deferred.construction_role) && !intent.construction_role
        ? { construction_role: text(deferred.construction_role) }
        : {}),
      ...(text(deferred.material_role) && !intent.material_role ? { material_role: text(deferred.material_role) } : {}),
      ...(text(deferred.preferred_method_id) && !intent.preferred_method_id
        ? { preferred_method_id: text(deferred.preferred_method_id) }
        : {}),
      ...(text(deferred.impact_class) && !intent.impact_class ? { impact_class: text(deferred.impact_class) } : {}),
      ...(deferred.material_response && typeof deferred.material_response === 'object'
        && !Array.isArray(deferred.material_response) && !intent.material_response
        ? { material_response: structuredClone(deferred.material_response) as Record<string, unknown> }
        : {}),
      actions: structuredClone(deferredActions),
    };
    diagnostics.push({
      code: 'intent_deferred_subpass_reused',
      message: `Reused compiler-owned deferred actions from ${intent.deferred_from_operation_id} after explicit post-review selection.`,
      source: `operation:${intent.deferred_from_operation_id}.compiler_repair_audit.deferred_next_pass`,
    });
  }
  const owner = resolveTargetOwner(effectiveIntent, context);
  const plannedOwner = scenePlanOwner(effectiveIntent, context);
  if (effectiveIntent.target_owner_id && !owner && !plannedOwner) {
    throw new NextPassCompilerError(
      'painting_intent_owner_missing',
      `Cannot target semantic owner ${effectiveIntent.target_owner_id}: it is neither durably bound nor predeclared by the current scene ownership plan.`,
      { owner_id: effectiveIntent.target_owner_id }
    );
  }
  if (!effectiveIntent.target_owner_id && text(context.painting_profile) === 'nontrivial_painting') {
    throw new NextPassCompilerError(
      'painting_intent_target_owner_required',
      'This nontrivial painting pass needs a semantic owner decision. Select an existing/predeclared owner instead of making the compiler guess ownership.'
    );
  }

  const stage = resolveIntentStage(effectiveIntent, context);
  const scale = resolveIntentScale(effectiveIntent, context);
  const separation = resolveLayerSeparationContract(effectiveIntent, owner, plannedOwner);
  const logicalLayer = logicalLayerForIntent(effectiveIntent, owner, plannedOwner);
  const material = resolveMaterialContract(effectiveIntent, context);
  const protectedLayerIds = resolveProtectionSet(effectiveIntent, context, owner);
  const verification = resolveVerificationProfile(effectiveIntent, scale);
  const actions = compileIntentActions(effectiveIntent, owner);

  if (!intent.scale && scale) diagnostics.push({
    code: 'intent_scale_inherited',
    message: `Inherited scale=${scale} from durable state.`,
    source: 'compactPassContext.scale',
  });
  if (!intent.stage && stage) diagnostics.push({
    code: 'intent_stage_inherited',
    message: `Inherited stage=${stage} from durable state.`,
    source: 'compactPassContext.stage',
  });
  if (owner && resolvePhysicalLayer(owner)) diagnostics.push({
    code: 'intent_owner_layer_injected',
    message: `Resolved owner ${intent.target_owner_id} to physical layer ${resolvePhysicalLayer(owner)}.`,
    source: `owner:${intent.target_owner_id}.current_layer_id`,
  });
  if (!intent.material_role && material.material_role) diagnostics.push({
    code: 'intent_material_role_inherited',
    message: `Derived material_role=${material.material_role} from the unique compatible durable brush role.`,
    source: 'brush_preflight',
  });
  if (!intent.preferred_brush_role && material.brush_role) diagnostics.push({
    code: 'intent_brush_role_inherited',
    message: `Derived brush_role=${material.brush_role} from durable brush preflight.`,
    source: 'brush_preflight',
  });

  const nextPass: Record<string, unknown> = {
    request_key: intent.request_key,
    problem_id: intent.problem_id,
    document_id: intent.document_id,
    goal: intent.goal,
    ...(stage ? { stage } : {}),
    ...(effectiveIntent.stage_reset ? { stage_reset: structuredClone(effectiveIntent.stage_reset) } : {}),
    ...(scale ? { scale } : {}),
    ...(effectiveIntent.region ? { region: effectiveIntent.region } : {}),
    ...(effectiveIntent.region_bounds ? { region_bounds: structuredClone(effectiveIntent.region_bounds) } : {}),
    action_class: resolveActionClass(effectiveIntent.action),
    visual_intent: effectiveIntent.visual_intent,
    impact_class: effectiveIntent.impact_class ?? inferImpactClass(effectiveIntent),
    ...(effectiveIntent.preferred_method_id ? { preferred_method_id: effectiveIntent.preferred_method_id } : {}),
    ...(effectiveIntent.construction_role ? { construction_role: effectiveIntent.construction_role } : {}),
    ...(material.material_role ? { material_role: material.material_role } : {}),
    ...(material.brush_role ? { brush_role: material.brush_role } : {}),
    ...(effectiveIntent.material_response ? { material_response: structuredClone(effectiveIntent.material_response) } : {}),
    ...(separation ? { layer_separation_check: separation } : {}),
    ...(logicalLayer ? { logical_layer: logicalLayer } : {}),
    ...(protectedLayerIds.length ? { protected_layer_ids: protectedLayerIds } : {}),
    ...(effectiveIntent.action === 'replace' || effectiveIntent.action === 'erase'
      ? (resolvePhysicalLayer(owner) ? { replace_protected_layer_ids: [resolvePhysicalLayer(owner)] } : {})
      : {}),
    significance_mode: verification.significance_mode,
    ...(effectiveIntent.addresses_primary_mismatch ? {
      addresses_primary_mismatch: true,
      addresses_problem_id: intent.problem_id,
    } : {}),
    actions,
  };

  return {
    next_pass: nextPass,
    diagnostics,
    context,
    durable_state_injection_ms: Date.now() - injectionStartedAt,
  };
}
