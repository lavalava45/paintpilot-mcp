import { createHash } from 'node:crypto';
import { brushRoleMatchesScale } from './brush-scale-fit.js';
import { constructionExecutionIssue, unexpandedConstructionPrerequisites } from './construction-execution.js';
import { ConstructionError, expandConstructionPass, type ConstructionModel } from '../object-construction.js';
import { PainterlyError, expandPainterlyPass, type PainterlyFrame } from '../painterly-strokes.js';
import { prepareGeometryContract, geometryContractRecipe } from '../geometry-contract.js';
import type { ToolRegistry, ToolResult } from '../tool-registry.js';
import { DOCUMENT_ID_SCHEMA_EXCLUDES } from '../document-target.js';
import { compileVisualMicroPlan } from '../visual-microplan-compiler.js';
import {
  preflightVisualMicroPlanForExecution,
  type VisualMicroPlanDocumentBounds,
} from '../../tools/visual-microplan-tools.js';
import { isVisual, parseTexts } from './session-store.js';
import { compileArtisticOperation } from '../artistic-operation-contract.js';
import { projectStyleMethodTraitEvidence, type OpenStyleContract } from '../style-contract-runtime.js';
import {
  paintingMethodCapabilities,
  selectPaintingConstructionMethod,
  type PaintingConstructionRole,
  type PaintingImpactClass,
} from '../painting-method-palette.js';
import { UXP_BRIDGE_REVISION } from './protocol-version.js';
import {
  VISUAL_MICROPLAN_ACTION_CLASSES,
  VISUAL_MICROPLAN_MAX_LAYER_CREATIONS,
  VISUAL_MICROPLAN_MAX_MUTATIONS,
  VISUAL_MICROPLAN_MUTATION_TOOLS,
  resolveVisualMicroPlanMutationBudget,
  visualMicroPlanMethodClassForStep,
  visualMicroPlanRequiresLocalInspection,
  type VisualMicroPlanSignificanceMode,
} from '../visual-microplan.js';
import type { GuardProjectionContext } from './projection-context.js';
import {
  collectOperationContractViolations,
  type GuardOperationContractViolation,
} from './operation-contract.js';
import { resolveVisualReviewProfile } from './visual-review-profile.js';
import {
  PAINTING_STAGE_RESET_REASONS,
  canonicalPaintingStage,
  isBackwardPaintingStageTransition,
  paintingStageRank,
} from '../painting-stage-policy.js';
import { normalizeMaterialResponsePlan, type MaterialResponsePlan } from '../material-response.js';
import { parseEdgeIntents } from '../edge-control.js';
import {
  normalizeSceneOwnershipPlan,
  extendSceneOwnershipPlan,
  sceneOwnershipOwnerIds,
  sceneComponentScopeIssue,
  type SceneOwnershipPlan,
} from '../scene-ownership-plan.js';
import { strokeExecutionBudget } from '../../tools/painting-tools.js';
import { geometryOptOutAuthorityIssue, normalizeSceneGeometryModel, type SceneGeometryModel } from '../scene-geometry-model.js';
import {
  assertLightingColorBindingMatchesScene,
  lightingColorBindingStaleness,
  normalizeSceneLightingColorModel,
  type SceneLightingColorModel,
} from '../scene-lighting-color-model.js';
import { normalizeColorGradientPreflight, type ColorGradientPreflight } from '../color-gradient-preflight.js';
import { normalizeImagingPreflight, type ImagingPreflight } from '../imaging-preflight.js';
import { ATTENTION_BINDING_SCHEMA, prepareAttentionBinding, normalizeAttentionBinding, normalizePerceptualHierarchy } from '../perceptual-hierarchy.js';
import { cameraBindingStaleness, normalizeCameraBinding, normalizeSceneCameraImagingModel, type SceneCameraImagingModel } from '../scene-camera-imaging-model.js';
import {
  changedSceneGeometryDependencyIds,
  geometryBindingDependencyIds,
  geometryBindingIssues,
  geometryBindingStaleness,
  normalizeGeometryBinding,
  type GeometryBinding,
} from '../geometry-binding.js';
import { runGeometryPreflight, type GeometryPreflightReport } from '../geometry-preflight.js';
import { inspectExecutableGeometry, materializeBoundaryDerivedGeometry } from '../executable-geometry-validation.js';
import { guardExecutionClass } from './execution-policy.js';
import {
  PaintingIntentError,
  paintingIntentFingerprint,
  parsePaintingIntent,
  normalizeGuardActionIds,
} from './painting-intent.js';
import {
  NextPassCompilerError,
  compilePaintingIntentToNextPass,
} from './next-pass-compiler.js';
import {
  applyDeterministicPassRepairs,
  classifyViolations,
  machineRepairRecipe,
  splitPassForBudget,
  type StructuredRepairOperation,
  type ViolationRepairClass,
} from './preflight-repair.js';

export interface GuardCycleCompilerStore {
  constructionModel?(documentId: number, modelId: string, projectionContext?: GuardProjectionContext): ConstructionModel | null;
  read?(id: string): Record<string, unknown> | undefined;
  compactPendingNonvisualClosureId?(projectionContext?: GuardProjectionContext): string | undefined;
  collectClosePreviousErrors(input: Record<string, unknown>): string[];
  projectBoundedUndoClosure?(input: Record<string, unknown>, projectionContext: GuardProjectionContext): GuardProjectionContext;
  compactClosureDefaults?(id: string, previousVerdict?: Record<string, unknown>): {
    previous_report?: Record<string, unknown>;
    previous_operation_ack?: Record<string, unknown>;
  };
  compactPassContext?(documentId: number, projectionContext?: GuardProjectionContext): {
    stage?: string;
    scale?: string;
    painting_profile?: string;
    has_visual_frame?: boolean;
    painterly_frame?: PainterlyFrame | null;
    active_problem_id?: string;
    active_problem_scale?: string;
    brush_roles?: Array<Record<string, unknown>>;
    brush_inventory_scope?: string | null;
    recent_brush_problem_usage?: Array<Record<string, unknown>>;
    recent_brush_usage?: Array<Record<string, unknown>>;
    logical_layer_owners?: Array<Record<string, unknown>>;
    scene_ownership_plan?: Record<string, unknown> | null;
    scene_geometry_model?: Record<string, unknown> | null;
    scene_lighting_color_model?: Record<string, unknown> | null;
    scene_camera_imaging_model?: Record<string, unknown> | null;
    geometry_binding_states?: Array<Record<string, unknown>>;
    lighting_color_binding_states?: Array<Record<string, unknown>>;
    camera_binding_states?: Array<Record<string, unknown>>;
    attention_binding_states?: Array<Record<string, unknown>>;
    document_incarnation_id?: string | null;
    art_director?: Record<string, unknown> | null;
    recent_geometry_contract_attempts?: Array<{ problem_id?: string; outcome: string; error_codes: string[] }>;
  };
  planAcceptedAnchorRestore?(
    documentId: number,
    anchorOperationId: string,
    suppliedRecords?: Array<Record<string, unknown>>,
    projectionContext?: GuardProjectionContext
  ): Record<string, unknown>;
  collectPreflightErrors(
    request: Record<string, unknown>,
    options?: {
      plannedPreviousOperationId?: string;
      plannedPreviousVisualVerdict?: boolean;
      plannedPhysicalStackReview?: boolean;
      projectionContext?: GuardProjectionContext;
      stateOnly?: boolean;
      deferCheckpointDebt?: boolean;
      compilerDeferredFromOperationId?: string;
    }
  ): string[];
}

export interface GuardCycleCompileViolation {
  scope: 'cycle' | 'finalization' | 'next_operation';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GuardCycleCompileResult {
  input: Record<string, unknown>;
  nextOperation?: Record<string, unknown>;
  rejection?: ToolResult;
  violations: GuardCycleCompileViolation[];
  normalizations: Array<{ code: string; message: string }>;
  compilerTelemetry?: GuardCompilerTelemetry;
  repairAudit?: GuardCompilerRepairAudit;
  compilerDeferredFromOperationId?: string;
}

export interface GuardCompilerTelemetry {
  painting_intent_compile_ms: number;
  durable_state_injection_ms: number;
  local_validation_ms: number;
  auto_repair_ms: number;
  auto_repair_count: number;
  auto_split_count: number;
  model_semantic_ambiguity_count: number;
  preflight_rejection_exposed_to_model_count: number;
  deterministic_violations_encountered_count: number;
  deterministic_violations_repaired_count: number;
  deterministic_violations_unresolved_count: number;
  violation_accounting: Array<{
    code: string;
    repair_class: ViolationRepairClass;
    scope: GuardCycleCompileViolation['scope'];
    origin: 'initial' | 'introduced';
    encountered: number;
    repaired: number;
    unresolved: number;
  }>;
  intent_received_at: string;
  compiled_at?: string;
  validated_at?: string;
  repaired_at?: string;
}

export interface GuardCompilerRepairAudit {
  protocol: 'photoshop.guard.compiler_repair.v1';
  original_intent_fingerprint?: string;
  first_compiled_payload_fingerprint?: string;
  repairs: StructuredRepairOperation[];
  repaired_payload_fingerprint?: string;
  first_violation_fingerprint?: string;
  final_violation_fingerprint?: string;
  final_validation: 'valid' | 'rejected' | 'systemic-repeat';
  deferred_next_pass?: Record<string, unknown>;
}

export interface GuardCycleCompilerOptions {
  plannedPhysicalStackReview?: boolean;
  collectDynamicOperationViolations?: (
    operation: Record<string, unknown>
  ) => Promise<GuardCycleCompileViolation[]>;
  projectionContext?: GuardProjectionContext;
  visualMicroPlanDocumentBounds?: VisualMicroPlanDocumentBounds;
  nextOperationValidation?: 'full' | 'state-only';
  compilerDeferredFromOperationId?: string;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export type JsonSchemaNode = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchemaNode;
};

function schemaTypeMatches(value: unknown, type: string): boolean {
  if (type === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

export function collectSchemaErrors(value: unknown, schemaValue: unknown, path: string): string[] {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) return [];
  const schema = schemaValue as JsonSchemaNode;
  const errors: string[] = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some(type => schemaTypeMatches(value, type))) {
    errors.push(`${path} must be ${types.join('|')}`);
    return errors;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(candidate => Object.is(candidate, value))) {
    errors.push(`${path} must be one of ${schema.enum.map(item => JSON.stringify(item)).join(', ')}`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)
    && (!types.length || types.includes('object'))) {
    const object = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(object, required)) errors.push(`${path}.${required} is required`);
    }
    for (const [key, item] of Object.entries(object)) {
      const child = schema.properties?.[key];
      if (child) errors.push(...collectSchemaErrors(item, child, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key} is not allowed`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...collectSchemaErrors(item, schema.additionalProperties, `${path}.${key}`));
      }
    }
  }
  if (Array.isArray(value) && (!types.length || types.includes('array'))) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path} must contain at most ${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => errors.push(...collectSchemaErrors(item, schema.items, `${path}[${index}]`)));
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${path} has invalid format`);
  }
  return errors;
}

function jsonResult(body: Record<string, unknown>, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function rejectionBody(result: ToolResult | undefined): Record<string, unknown> | undefined {
  const body = result ? parseTexts(result).find((candidate: unknown) =>
    !!candidate && typeof candidate === 'object' && !Array.isArray(candidate)
  ) : undefined;
  return body as Record<string, unknown> | undefined;
}

function operationSchemaErrors(operation: Record<string, unknown>, registry: ToolRegistry): string[] {
  const tool = typeof operation.tool === 'string' ? operation.tool : '';
  const definition = registry.get(tool);
  if (!definition) return tool ? [`Tool ${tool} missing from the project catalog`] : [];
  const args = operation.args ?? {};
  const errors = collectSchemaErrors(args, definition.tool.inputSchema, 'args');
  const schema = definition.tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  const acceptsDocumentId = !DOCUMENT_ID_SCHEMA_EXCLUDES.has(tool)
    && !!schema?.properties
    && Object.prototype.hasOwnProperty.call(schema.properties, 'document_id');
  if (tool !== 'photoshop_get_state' && acceptsDocumentId) {
    const documentId = (args as Record<string, unknown>)?.document_id;
    if (!Number.isSafeInteger(documentId) || Number(documentId) <= 0) {
      errors.push(`Pass a positive pinned document_id for ${tool}; obtain it from photoshop_get_state/photoshop_list_documents first`);
    }
  }
  return errors;
}

function violation(
  scope: GuardCycleCompileViolation['scope'],
  code: string,
  message: string,
  details?: Record<string, unknown>
): GuardCycleCompileViolation {
  return { scope, code, message, ...(details ? { details } : {}) };
}

function uniqueViolations(violations: GuardCycleCompileViolation[]): GuardCycleCompileViolation[] {
  const seen = new Set<string>();
  return violations.filter((item) => {
    const key = `${item.scope}\u0000${item.code}\u0000${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const NEGATIVE_REGRESSION_SENTINELS = new Set([
  'none',
  'none observed',
  'no regression',
  'no regressions',
  'no regression observed',
  'no regressions observed',
]);

function normalizeCompactRegression(value: unknown): { regression?: string; normalizedNegative: boolean } {
  const raw = text(value);
  if (!raw) return { normalizedNegative: false };
  const canonical = raw.toLowerCase().replace(/[.!]+$/g, '').replace(/\s+/g, ' ').trim();
  if (NEGATIVE_REGRESSION_SENTINELS.has(canonical)) return { normalizedNegative: true };
  return { regression: raw, normalizedNegative: false };
}

function compactObservationToVerdict(
  value: unknown,
  normalizations?: Array<{ code: string; message: string }>
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const observation = structuredClone(value) as Record<string, unknown>;
  const compactObserved = text(observation.observed);
  const compactTarget = text(observation.target)?.toLowerCase();
  if (compactObserved && compactTarget && ['resolved', 'unresolved', 'uncertain'].includes(compactTarget)) {
    const normalizedRegression = normalizeCompactRegression(observation.regression);
    const regression = normalizedRegression.regression;
    if (normalizedRegression.normalizedNegative) {
      normalizations?.push({
        code: 'negative_regression_sentinel_normalized',
        message: 'Normalized previous_observation.regression negative sentinel to no regression evidence.',
      });
    }
    const action = text(observation.action)?.toLowerCase();
    const targetResolved = compactTarget === 'resolved' ? 'yes'
      : compactTarget === 'unresolved' ? 'no'
        : 'uncertain';
    const disposition = ['accept', 'correct', 'rollback'].includes(action ?? '')
      ? action
      : regression ? 'correct'
        : compactTarget === 'resolved' ? 'accept' : 'correct';
    const verdict = disposition === 'rollback' || regression
      ? 'regression'
      : compactTarget === 'resolved' ? 'improvement' : 'neutral';
    return {
      verdict,
      disposition,
      observed_change: compactObserved,
      ...(text(observation.artistic_commentary) ? { artistic_commentary: text(observation.artistic_commentary) } : {}),
      target_resolved: targetResolved,
      ...(observation.painting_completion !== undefined ? { painting_completion: observation.painting_completion } : {}),
      ...(observation.critic_review !== undefined ? { critic_review: observation.critic_review } : {}),
      regressions: regression ? [regression] : [],
      uncertainty: text(observation.uncertainty)
        ?? (compactTarget === 'uncertain' ? 'The delivered frame remains visually uncertain.' : 'none observed'),
      ...(observation.uncertainty_review !== undefined
        ? { uncertainty_review: observation.uncertainty_review }
        : {}),
      observations: Array.isArray(observation.observations)
        ? observation.observations
        : [{ region: 'whole frame', visible: compactObserved }],
      primary_mismatch: text(observation.primary_mismatch)
        ?? (compactTarget === 'resolved'
          ? 'No blocking mismatch is visible in the supplied observation.'
          : 'The requested visual target remains unresolved or uncertain in the supplied observation.'),
      global_readability: text(observation.global_readability) ?? 'unknown',
      primitive_footprint: text(observation.primitive_footprint) ?? 'unknown',
      trend_signals: Array.isArray(observation.trend_signals) ? observation.trend_signals : [],
      ...(observation.softness_review !== undefined ? { softness_review: observation.softness_review } : {}),
      ...(observation.physical_stack_check !== undefined ? { physical_stack_check: observation.physical_stack_check } : {}),
      ...(observation.edge_observations !== undefined ? { edge_observations: observation.edge_observations } : {}),
      ...(Array.isArray(observation.review_findings) ? { review_findings: observation.review_findings } : {}),
      ...(observation.recognition !== undefined ? { recognition: observation.recognition } : {}),
      ...(observation.planner_task_assessment !== undefined
        ? { planner_task_assessment: observation.planner_task_assessment }
        : {}),
      ...(Array.isArray(observation.affected_relations) ? { affected_relations: observation.affected_relations } : {}),
      ...(Array.isArray(observation.affected_qualities) ? { affected_qualities: observation.affected_qualities } : {}),
      ...(Array.isArray(observation.preservation_facts) ? { preservation_facts: observation.preservation_facts } : {}),
      ...(observation.independent_region === true ? { independent_region: true } : {}),
    };
  }
  const observedChange = text(observation.observed_change);
  if (!observedChange) return observation;
  const targetResolved = text(observation.target_resolved);
  return {
    ...observation,
    observations: Array.isArray(observation.observations)
      ? observation.observations
      : [{
          region: 'delivered review frame',
          visible: observedChange,
        }],
    primary_mismatch: text(observation.primary_mismatch)
      ?? (targetResolved === 'yes'
        ? 'No blocking mismatch was stated beyond the supplied frame observation.'
        : 'The target remains unresolved or uncertain; see the supplied frame observation.'),
    global_readability: text(observation.global_readability) ?? 'unknown',
    primitive_footprint: text(observation.primitive_footprint) ?? 'unknown',
    trend_signals: Array.isArray(observation.trend_signals) ? observation.trend_signals : [],
    ...(observation.softness_review !== undefined ? { softness_review: observation.softness_review } : {}),
  };
}

function normalizeCompactOperation(
  operation: Record<string, unknown>
): {
  operation: Record<string, unknown>;
  violations: GuardCycleCompileViolation[];
  normalizations: Array<{ code: string; message: string }>;
} {
  const compiled = structuredClone(operation);
  const violations: GuardCycleCompileViolation[] = [];
  const normalizations: Array<{ code: string; message: string }> = [];
  const requestKey = text(compiled.request_key);
  const explicitId = text(compiled.id);
  if (requestKey && explicitId && requestKey !== explicitId) {
    violations.push(violation(
      'next_operation',
      'request_key_conflict',
      'next_operation.request_key and id must identify the same durable request when both are supplied'
    ));
  }
  if (!explicitId && requestKey) compiled.id = requestKey;

  const goal = text(compiled.goal);
  if (goal) {
    compiled.summary ??= goal;
    compiled.purpose ??= 'Execute the requested bounded Photoshop pass.';
  }
  if (requestKey && goal) compiled.problem_id ??= requestKey;

  if (compiled.tool === 'photoshop_execute_visual_microplan') {
    const args = compiled.args && typeof compiled.args === 'object' && !Array.isArray(compiled.args)
      ? structuredClone(compiled.args) as Record<string, unknown>
      : {};
    const operationId = text(compiled.id);
    const rootGoal = goal ?? text(args.intent) ?? text(args.summary);
    if (operationId) args.plan_id ??= operationId;
    if (rootGoal) {
      // One root goal is authoritative. Legacy args.intent/summary remain valid
      // when no compact goal is supplied, but compact callers need not repeat it.
      if (goal) args.intent = goal;
      else args.intent ??= rootGoal;
      args.summary ??= rootGoal;
      compiled.summary ??= rootGoal;
      compiled.purpose ??= 'Execute the requested bounded visual pass.';
    }
    compiled.problem_id ??= text(args.problem_id) ?? operationId;
    if (compiled.problem_id !== undefined) args.problem_id ??= compiled.problem_id;
    compiled.region ??= args.region;
    compiled.stage ??= args.stage;
    compiled.scale ??= args.scale;
    compiled.args = args;
  }

  if (compiled.preview_args && typeof compiled.preview_args === 'object' && !Array.isArray(compiled.preview_args)) {
    const previewArgs = structuredClone(compiled.preview_args) as Record<string, unknown>;
    if (previewArgs.document_id !== undefined) {
      const operationArgs = compiled.args && typeof compiled.args === 'object' && !Array.isArray(compiled.args)
        ? compiled.args as Record<string, unknown>
        : {};
      if (previewArgs.document_id === operationArgs.document_id) {
        delete previewArgs.document_id;
        compiled.preview_args = previewArgs;
        normalizations.push({
          code: 'duplicate_preview_document_id_removed',
          message: 'Removed preview_args.document_id because it duplicated the pinned next_operation.args.document_id.',
        });
      } else {
        violations.push(violation(
          'next_operation',
          'preview_document_mismatch',
          `preview_args.document_id=${String(previewArgs.document_id)} does not match pinned next_operation.args.document_id=${String(operationArgs.document_id)}`
        ));
      }
    }
  }

  delete compiled.request_key;
  delete compiled.goal;
  return { operation: compiled, violations, normalizations };
}

const COMPACT_DOCUMENT_BOOTSTRAP_TOOLS = new Set([
  'photoshop_create_document',
  'photoshop_open_image',
]);

function compactStepMethodClass(step: Record<string, unknown>, registry?: ToolRegistry): string | undefined {
  // Prepared Gaussian passes retain the direct blur preflight; the palette's
  // descriptive "blur" class must not bypass the bounded filter classification.
  if (text(step.tool) === 'photoshop_apply_gaussian_blur') return 'filter';
  const args = step.args && typeof step.args === 'object' && !Array.isArray(step.args)
    ? step.args as Record<string, unknown>
    : {};
  const methodId = text(step.method_id);
  if (methodId && registry) {
    const semanticMethod = paintingMethodCapabilities(registry).find(capability => capability.id === methodId);
    if (semanticMethod && semanticMethod.primaryTool === text(step.tool)) return semanticMethod.methodClass;
  }
  return visualMicroPlanMethodClassForStep({ tool: text(step.tool) ?? '', args });
}

function compactRiskForMethod(method: string | undefined): 'low' | 'moderate' | 'high' {
  if (method === 'rollback' || method === 'erase') return 'high';
  if (method === 'smudge' || method === 'fill' || method === 'mask') return 'moderate';
  return 'low';
}

function compactChangeDomain(method: string | undefined): string {
  if (method === 'region') return 'local-shape';
  if (method === 'erase' || method === 'line' || method === 'mask') return 'local-edge';
  return 'local-tone';
}

function deriveExecutableMethod(
  registry: ToolRegistry,
  plan: ReturnType<typeof compileArtisticOperation>,
  executionTools: string[],
  avoidMethodIds: string[],
  normalizations: Array<{ code: string; message: string }>,
) {
  // Resolve descriptive drift only when the actual tools uniquely identify a
  // compatible method. Never replace actions or infer an artistic goal from prose.
  const candidates = paintingMethodCapabilities(registry).filter(method => {
    const tools = method.executionTools?.length ? method.executionTools : method.primaryTool ? [method.primaryTool] : [];
    return method.availability !== 'unavailable'
      && !avoidMethodIds.includes(method.id)
      && method.visualIntents.includes(plan.visualIntent)
      && method.impactClasses.includes(plan.impactClass)
      && executionTools.length > 0
      && executionTools.every(tool => tools.includes(tool));
  });
  if (candidates.length !== 1) return null;
  const method = candidates[0]!;
  normalizations.push({
    code: 'artistic_method_derived_from_execution',
    message: `Replaced descriptive method ${plan.method.id} with uniquely executable ${method.id}; Photoshop actions are unchanged.`,
  });
  return compileArtisticOperation(registry, {
    visualIntent: plan.visualIntent, impactClass: plan.impactClass,
    preferredMethodId: method.id, avoidMethodIds,
    documentId: plan.documentId, layerId: plan.layerId, runtimeRevision: plan.runtimeRevision,
  });
}

function inferUniqueClassification(input: {
  registry: ToolRegistry;
  actionClass?: string;
  executionTools: string[];
  visualIntent?: string;
  impactClass?: string;
  preferredMethodId?: string;
  avoidMethodIds: string[];
}): { visualIntent: string; impactClass: string; reason: string } | null {
  const actionClass = (input.actionClass ?? '').trim().toUpperCase();
  if (['REPLACE', 'ERASE', 'ROLLBACK'].includes(actionClass)) return null;
  if (!input.executionTools.length || (input.visualIntent && input.impactClass)) return null;
  let available = paintingMethodCapabilities(input.registry).filter(method => {
    if (method.availability === 'unavailable' || input.avoidMethodIds.includes(method.id)) return false;
    const tools = method.executionTools?.length ? method.executionTools : method.primaryTool ? [method.primaryTool] : [];
    return (!input.visualIntent || method.visualIntents.includes(input.visualIntent as never))
      && (!input.impactClass || method.impactClasses.includes(input.impactClass as never))
      && input.executionTools.every(tool => tools.includes(tool));
  });
  const preferred = available.find(method => method.id === input.preferredMethodId);
  if (preferred) available = [preferred];
  const intents = new Set(available.flatMap(method => input.visualIntent ? [input.visualIntent] : method.visualIntents));
  const impacts = new Set(available.flatMap(method => input.impactClass ? [input.impactClass] : method.impactClasses));
  if (intents.size !== 1 || impacts.size !== 1) return null;
  return {
    visualIntent: [...intents][0]!,
    impactClass: [...impacts][0]!,
    reason: `missing classification is unique for executable tools ${input.executionTools.join('|')}; goal prose is not used`,
  };
}

function validatePartialClassification(input: {
  registry: ToolRegistry;
  executionTools: string[];
  visualIntent?: string;
  impactClass?: string;
  preferredMethodId?: string;
  avoidMethodIds: string[];
}): GuardCycleCompileViolation[] {
  const executable = paintingMethodCapabilities(input.registry).filter(method => {
    const tools = method.executionTools?.length ? method.executionTools : method.primaryTool ? [method.primaryTool] : [];
    return method.availability !== 'unavailable'
      && input.executionTools.length > 0 && input.executionTools.every(tool => tools.includes(tool));
  });
  // An exclusion alone does not impose a new classification on an uncatalogued
  // command. Supplied hints must fit execution; missing hints need no invention.
  if (!executable.length && !input.visualIntent && !input.impactClass && !input.preferredMethodId) return [];
  const compatible = executable.filter(method => !input.avoidMethodIds.includes(method.id)
    && (!input.visualIntent || method.visualIntents.includes(input.visualIntent as never))
    && (!input.impactClass || method.impactClasses.includes(input.impactClass as never))
    && (!input.preferredMethodId || method.id === input.preferredMethodId));
  return compatible.length ? [] : [violation('next_operation', 'artistic_method_unavailable',
    'Supplied method hints or exclusions conflict with executable tools; omitted classification fields are optional.')];
}

function resolveCompactStageTransition(
  raw: Record<string, unknown>,
  context: Record<string, unknown>,
  violations: GuardCycleCompileViolation[],
  fallbackStage?: string
): { stage?: string; stageReset?: Record<string, unknown> } {
  const durableStage = canonicalPaintingStage(text(context.stage));
  const requestedStage = canonicalPaintingStage(text(raw.stage));
  const stage = requestedStage ?? durableStage ?? canonicalPaintingStage(fallbackStage);

  if (requestedStage && paintingStageRank(requestedStage) === undefined) {
    // E.7c: an artistic stage label is guidance, not execution authority.
    // Unknown labels are ignored for canonical stage state rather than forcing
    // schema repair before an otherwise executable visual experiment.
    return { stage: durableStage ?? stage };
  }

  const rawStageReset = raw.stage_reset;
  const backward = durableStage && stage
    ? isBackwardPaintingStageTransition(durableStage, stage)
    : false;

  if (!backward) {
    if (rawStageReset !== undefined) {
      violations.push(violation(
        'next_operation',
        'painting_stage_reset_not_applicable',
        `next_pass.stage_reset is allowed only for a genuine backward structural transition; durable=${durableStage ?? 'none'} requested=${stage ?? 'none'}`
      ));
    }
    return { stage };
  }

  if (!rawStageReset || typeof rawStageReset !== 'object' || Array.isArray(rawStageReset)) {
    // Label-only regressions do not downgrade durable state and do not block
    // execution. Genuine structural resets remain explicit and validated below.
    return { stage: durableStage };
  }

  const reset = rawStageReset as Record<string, unknown>;
  const reason = text(reset.reason)?.toLowerCase();
  const detail = text(reset.detail);
  if (!reason || !PAINTING_STAGE_RESET_REASONS.includes(reason as never)) {
    violations.push(violation(
      'next_operation',
      'painting_stage_reset_reason_invalid',
      `next_pass.stage_reset.reason must be one of ${PAINTING_STAGE_RESET_REASONS.join('|')}`
    ));
  }
  // E.7c: the executable reset reason is the authority for a deliberate
  // backward structural transition. Free-form detail remains useful audit
  // guidance, but requiring a minimum prose length only creates a schema-
  // repair turn without making the reset safer.
  if (!reason || !PAINTING_STAGE_RESET_REASONS.includes(reason as never)) {
    return { stage };
  }

  return {
    stage,
    stageReset: {
      protocol: 'photoshop.guard.painting_stage_reset.v1',
      from_stage: durableStage,
      to_stage: stage,
      reason,
      ...(detail ? { detail } : {}),
    },
  };
}

function collectSuppliedActionViolations(rawActions: unknown, documentId: unknown, registry: ToolRegistry): GuardCycleCompileViolation[] {
  const violations: GuardCycleCompileViolation[] = [];
  const actions = Array.isArray(rawActions) ? rawActions as Array<Record<string, unknown>> : [];
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        violations.push(violation('next_operation', 'compact_action_invalid', `actions[${index}] must be an object`));
        continue;
      }
      const tool = text(action.tool);
      if (!tool || !registry.get(tool)) {
        violations.push(violation('next_operation', 'compact_action_tool_invalid', `actions[${index}].tool is absent or unknown`));
        continue;
      }
      const args = action.args && typeof action.args === 'object' && !Array.isArray(action.args)
        ? { ...action.args as Record<string, unknown> } : action.args;
      if (args && typeof args === 'object' && !DOCUMENT_ID_SCHEMA_EXCLUDES.has(tool)) {
        (args as Record<string, unknown>).document_id ??= documentId;
      }
      for (const message of operationSchemaErrors({ tool, args }, registry)) {
        violations.push(violation('next_operation', 'compact_action_schema_invalid', `actions[${index}]: ${message}`));
      }
    }
  return violations;
}

function compileCompactPass(
  raw: Record<string, unknown>,
  store: GuardCycleCompilerStore,
  registry: ToolRegistry,
  projectionContext?: GuardProjectionContext
): { operation?: Record<string, unknown>; violations: GuardCycleCompileViolation[]; normalizations?: Array<{ code: string; message: string }> } {
  const violations: GuardCycleCompileViolation[] = [];
  const normalizations: Array<{ code: string; message: string }> = [];
  let construction: ReturnType<typeof expandConstructionPass> | undefined;
  let painterly: ReturnType<typeof expandPainterlyPass> | undefined;
  if (raw.painterly !== undefined) {
    try {
      const context = store.compactPassContext?.(Number(raw.document_id), projectionContext) ?? {};
      painterly = expandPainterlyPass(raw, context, id => store.constructionModel?.(Number(raw.document_id), id, projectionContext) ?? null);
      raw = painterly.pass;
      normalizations.push({ code: 'painterly_strokes_compiled', message: `Hertzmann: ${painterly.provenance.stroke_count} bounded strokes on owner=${painterly.provenance.owner_id}; use the real preview for acceptance and replanning.` });
    } catch (error) {
      violations.push(violation('next_operation', error instanceof PainterlyError ? error.code : 'painterly_invalid', error instanceof Error ? error.message : String(error), { path: error instanceof PainterlyError ? error.path : 'next_pass.painterly' }));
      return { violations, normalizations };
    }
  }
  if (raw.construction !== undefined) {
    try {
      const context = store.compactPassContext?.(Number(raw.document_id), projectionContext) ?? {};
      construction = expandConstructionPass(raw, context,
        id => store.constructionModel?.(Number(raw.document_id), id, projectionContext) ?? null);
      raw = construction.pass;
      normalizations.push({ code: 'object_construction_compiled', message: `Solved ${construction.model.model_id}@${construction.model.revision}, part=${construction.provenance.part_id}; generated one independently owned component. Geometry is a target, not pixel or artistic proof.` });
    } catch (error) {
      const issues = [...(error instanceof ConstructionError ? error.issues : [{ code: 'construction_model_invalid', path: 'next_pass.construction', message: error instanceof Error ? error.message : String(error) }]),
        ...unexpandedConstructionPrerequisites(raw, store.compactPassContext?.(Number(raw.document_id), projectionContext) ?? {})];
      for (const issue of issues) violations.push(violation('next_operation', issue.code, issue.message, { path: issue.path, residual: issue.residual }));
      return { violations, normalizations };
    }
  }
  const constructionIssue = constructionExecutionIssue(raw,
    store.compactPassContext?.(Number(raw.document_id), projectionContext) ?? {}, construction?.model);
  if (constructionIssue) violations.push(violation('next_operation', constructionIssue.code, constructionIssue.message));
  const requestKey = text(raw.request_key);
  const goal = text(raw.goal);
  const documentId = raw.document_id;
  const restoreAnchorOperationId = text(raw.restore_anchor_operation_id);
  const actions = Array.isArray(raw.actions)
    ? normalizeGuardActionIds(raw.actions as Array<Record<string, unknown>>)
    : [];
  let edgeIntents: ReturnType<typeof parseEdgeIntents> = [];
  let edgeIntentsValid = true;
  try {
    edgeIntents = parseEdgeIntents(raw.edges);
  } catch (error) {
    edgeIntentsValid = false;
    violations.push(violation(
      'next_operation',
      'compact_edge_intents_invalid',
      error instanceof Error ? error.message : String(error)
    ));
  }
  if (edgeIntentsValid) {
    const declaredEdgeIds = new Set(edgeIntents.map(intent => intent.boundaryId));
    const referencedEdgeIds = new Set<string>();
    actions.forEach((action, actionIndex) => {
      if (!VISUAL_MICROPLAN_MUTATION_TOOLS.has(text(action.tool) ?? '')) return;
      if (action.edge_boundary_ids === undefined) return;
      if (!Array.isArray(action.edge_boundary_ids)) {
        violations.push(violation(
          'next_operation',
          'compact_edge_boundary_ids_invalid',
          `next_pass.actions[${actionIndex}].edge_boundary_ids must be an array of declared boundary ids`,
          { action_index: actionIndex }
        ));
        return;
      }
      const boundIds: string[] = [];
      action.edge_boundary_ids.forEach((value, boundaryIndex) => {
        const boundaryId = text(value);
        if (!boundaryId) {
          violations.push(violation(
            'next_operation',
            'compact_edge_boundary_ids_invalid',
            `next_pass.actions[${actionIndex}].edge_boundary_ids[${boundaryIndex}] must be a non-empty string`,
            { action_index: actionIndex, boundary_index: boundaryIndex }
          ));
          return;
        }
        if (!declaredEdgeIds.has(boundaryId)) {
          violations.push(violation(
            'next_operation',
            'compact_edge_boundary_unknown',
            `next_pass.actions[${actionIndex}].edge_boundary_ids references undeclared boundary_id ${boundaryId}`,
            { action_index: actionIndex, boundary_id: boundaryId }
          ));
          return;
        }
        referencedEdgeIds.add(boundaryId);
        boundIds.push(boundaryId);
      });
      if (boundIds.length && !text(action.method_id)) {
        violations.push(violation(
          'next_operation',
          'compact_edge_method_required',
          `next_pass.actions[${actionIndex}] must declare method_id when edge_boundary_ids are present`,
          { action_index: actionIndex, boundary_ids: boundIds }
        ));
      }
    });
    for (const intent of edgeIntents) {
      if (!referencedEdgeIds.has(intent.boundaryId)) {
        violations.push(violation(
          'next_operation',
          'compact_edge_intent_unbound',
          `next_pass.edges boundary_id ${intent.boundaryId} must bind to at least one visual mutation through edge_boundary_ids`,
          { boundary_id: intent.boundaryId }
        ));
      }
    }
  }
  if (!requestKey || !goal || (!restoreAnchorOperationId && !actions.length)) {
    if (!requestKey) violations.push(violation('next_operation', 'compact_request_key_required', 'next_pass.request_key must be a non-empty string'));
    if (!goal) violations.push(violation('next_operation', 'compact_goal_required', 'next_pass.goal must be a non-empty string'));
    if (!restoreAnchorOperationId && !actions.length) violations.push(violation('next_operation', 'compact_actions_required', 'next_pass.actions must contain executable actions'));
    // Missing envelope metadata must not hide independently repairable nested
    // arguments. Inspect all supplied actions without any Photoshop preparation.
    violations.push(...collectSuppliedActionViolations(actions, documentId, registry));
    return { violations };
  }
  if (restoreAnchorOperationId) {
    if (!Number.isSafeInteger(documentId) || Number(documentId) <= 0) {
      violations.push(violation(
        'next_operation',
        'accepted_anchor_restore_document_required',
        'next_pass.document_id is required for accepted-anchor restore'
      ));
      return { violations };
    }
    if (actions.length) {
      violations.push(violation(
        'next_operation',
        'accepted_anchor_restore_actions_forbidden',
        'restore_anchor_operation_id is one logical Guard recovery request and cannot be combined with next_pass.actions'
      ));
      return { violations };
    }
    if (!store.planAcceptedAnchorRestore) {
      violations.push(violation(
        'next_operation',
        'accepted_anchor_restore_unavailable',
        'The current Guard runtime does not expose accepted-anchor restore planning'
      ));
      return { violations };
    }
    try {
      const plan = store.planAcceptedAnchorRestore(Number(documentId), restoreAnchorOperationId);
      return {
        operation: {
          request_key: requestKey,
          goal,
          problem_id: text(raw.problem_id) ?? `restore:${restoreAnchorOperationId}`,
          tool: 'photoshop_undo',
          args: {
            document_id: Number(documentId),
            steps: Number(plan.required_undo_steps),
          },
          summary: goal,
          purpose: `Restore registered accepted artistic anchor ${restoreAnchorOperationId} without replaying later mutations.`,
          significance_mode: 'normal',
          preview_args: structuredClone(plan.anchor_preview_args),
          accepted_anchor_restore: {
            protocol: 'photoshop.guard.accepted_anchor_restore.v1',
            anchor_operation_id: restoreAnchorOperationId,
            anchor_sha256: plan.anchor_sha256,
            anchor_path: plan.anchor_path,
            anchor_preview_args: structuredClone(plan.anchor_preview_args),
            required_undo_steps: plan.required_undo_steps,
            history_operation_ids: plan.history_operation_ids,
          },
        },
        violations,
      };
    } catch (error) {
      violations.push(violation(
        'next_operation',
        'accepted_anchor_restore_rejected',
        error instanceof Error ? error.message : String(error)
      ));
      return { violations };
    }
  }
  const problemId = text(raw.problem_id) ?? text(raw.addresses_problem_id) ?? requestKey;
  const existingRequestRecord = store.read?.(requestKey);
  const existingReviewProfile = existingRequestRecord?.visual_review_profile
    && typeof existingRequestRecord.visual_review_profile === 'object'
    && !Array.isArray(existingRequestRecord.visual_review_profile)
    ? structuredClone(existingRequestRecord.visual_review_profile) as ReturnType<typeof resolveVisualReviewProfile>
    : undefined;

  const onlyAction = actions.length === 1 ? actions[0] : undefined;
  const onlyTool = onlyAction ? text(onlyAction.tool) : undefined;
  const bootstrap = !!onlyTool && COMPACT_DOCUMENT_BOOTSTRAP_TOOLS.has(onlyTool);
  if (!bootstrap && (!Number.isSafeInteger(documentId) || Number(documentId) <= 0)) {
    violations.push(violation(
      'next_operation',
      'compact_pass_document_required',
      'next_pass.document_id is required for every non-bootstrap Photoshop pass'
    ));
    return { violations };
  }
  if (bootstrap && documentId !== undefined) {
    violations.push(violation(
      'next_operation',
      'compact_bootstrap_document_forbidden',
      'next_pass.document_id must be omitted for photoshop_create_document/photoshop_open_image because the target document does not exist yet'
    ));
  }

  const visualMicroplanMutationCount = actions.filter(step =>
    VISUAL_MICROPLAN_MUTATION_TOOLS.has(text(step.tool) ?? '')
  ).length;
  if (actions.length > 1 && visualMicroplanMutationCount === 0) {
    violations.push(violation(
      'next_operation',
      'compact_pass_multiple_direct_operations',
      'next_pass cannot bundle multiple direct Photoshop operations into one durable Guard operation; submit each direct operation as its own guarded pass (for example, save PSD and PNG in two sequential passes)'
    ));
    return { violations };
  }

  // A compact semantic pass is not synonymous with VisualMicroPlan. Bootstrap,
  // Curves/masks/blend/transform/property mutations and other single registered
  // Photoshop operations keep their native semantics and are guarded directly.
  // VisualMicroPlan remains the compact bundle for its paint/fill/undo family.
  if (onlyAction && onlyTool && (!VISUAL_MICROPLAN_MUTATION_TOOLS.has(onlyTool) || DIRECT_BLUR_TOOLS.has(onlyTool))) {
    const actionArgs = onlyAction.args && typeof onlyAction.args === 'object' && !Array.isArray(onlyAction.args)
      ? structuredClone(onlyAction.args) as Record<string, unknown>
      : {};
    if (!bootstrap) actionArgs.document_id ??= Number(documentId);
    const context = !bootstrap && Number.isSafeInteger(documentId)
      ? store.compactPassContext?.(Number(documentId), projectionContext) ?? {}
      : {};
    if (context.painting_profile === 'nontrivial_painting' && onlyTool === 'photoshop_create_layer') {
      violations.push(violation(
        'next_operation',
        'semantic_owner_create_requires_visual_microplan',
        'nontrivial painting must create persistent paint layers inside the bounded VisualMicroPlan that also declares logical_layer ownership; a standalone create-layer operation would bypass atomic semantic owner binding'
      ));
    }
    const art = context.art_director && typeof context.art_director === 'object'
      ? context.art_director as Record<string, unknown>
      : undefined;
    const plannerDirectiveId = text(art?.directive_id);
    const plannerTaskId = text(art?.current_task_id);
    const scale = text(raw.scale) ?? text(context.scale) ?? (isVisual(onlyTool) ? 'global' : undefined);
    const { stage, stageReset } = bootstrap
      ? { stage: undefined, stageReset: undefined }
      : resolveCompactStageTransition(raw, context, violations, isVisual(onlyTool) ? 'GLOBAL_BLOCK_IN' : undefined);
    const region = text(raw.region) ?? (bootstrap ? 'document-bootstrap' : 'whole-canvas');
    const significanceMode = text(raw.significance_mode) ?? 'normal';
    const regionBounds = raw.region_bounds && typeof raw.region_bounds === 'object' && !Array.isArray(raw.region_bounds)
      ? structuredClone(raw.region_bounds) as Record<string, unknown>
      : undefined;
    const directActionClass = text(raw.action_class)?.toUpperCase();
    const directImpactClass = text(raw.impact_class);
    const directChangeDomains = plannerDirectiveId && plannerTaskId && isVisual(onlyTool)
      ? directVisualChangeDomains(onlyTool)
      : undefined;
    if (plannerDirectiveId && plannerTaskId && isVisual(onlyTool) && !directChangeDomains) {
      violations.push(violation(
        'next_operation',
        'direct_visual_change_domain_ambiguous',
        `${onlyTool} has no deterministic direct-operation change-domain derivation`
      ));
    }
    const directOperation: Record<string, unknown> = {
      request_key: requestKey,
      goal,
      ...(!bootstrap ? { problem_id: problemId } : {}),
      tool: onlyTool,
      args: actionArgs,
      summary: goal,
      purpose: 'Execute one bounded compact Photoshop operation.',
      region,
      ...(stage ? { stage } : {}),
      ...(stageReset ? { stage_reset: stageReset } : {}),
      ...(scale ? { scale } : {}),
      ...(text(raw.significance_mode) ? { significance_mode: significanceMode } : {}),
      ...(!bootstrap ? { artistic_commentary: text(raw.artistic_commentary) ?? goal } : {}),
      ...(plannerDirectiveId && plannerTaskId ? {
        planner_directive_id: plannerDirectiveId,
        planner_task_id: plannerTaskId,
        painter_scope: scale === 'medium' ? 'medium' : 'local',
        ...(directChangeDomains ? { change_domains: directChangeDomains } : {}),
        ...(Array.isArray(raw.affected_relations) ? { affected_relations: raw.affected_relations } : {}),
        ...(Array.isArray(raw.affected_qualities) ? { affected_qualities: raw.affected_qualities } : {}),
        ...(Array.isArray(raw.preservation_facts) ? { preservation_facts: raw.preservation_facts } : {}),
        ...(raw.independent_region === true ? { independent_region: true } : {}),
        ...(raw.addresses_primary_mismatch === true ? { addresses_primary_mismatch: true } : {}),
        ...(text(raw.addresses_problem_id) ? { addresses_problem_id: text(raw.addresses_problem_id) } : {}),
        ...(text(raw.root_cause_classification) ? { root_cause_classification: text(raw.root_cause_classification) } : {}),
        ...(text(raw.root_cause_reason) ? { root_cause_reason: text(raw.root_cause_reason) } : {}),
        ...(raw.causal_level_change === true ? { causal_level_change: true } : {}),
        ...(text(raw.causal_strategy_id) ? { causal_strategy_id: text(raw.causal_strategy_id) } : {}),
        ...(text(raw.strategy_family) ? { strategy_family: text(raw.strategy_family) } : {}),
        ...(Number.isInteger(raw.causal_escalation_level) ? { causal_escalation_level: raw.causal_escalation_level } : {}),
      } : {}),
    };

    let visualIntent = text(raw.visual_intent);
    let impactClass = text(raw.impact_class);
    if (!bootstrap && isVisual(onlyTool) && canonicalPaintingStage(stage) === 'MATERIAL'
      && raw.material_response !== undefined) {
      try {
        directOperation.material_response = normalizeMaterialResponsePlan(raw.material_response);
      } catch (error) {
        violations.push(violation(
          'next_operation',
          'material_response_plan_invalid',
          error instanceof Error ? error.message : String(error)
        ));
      }
    }
    if (!bootstrap && isVisual(onlyTool)) {
      const visualReviewProfile = existingReviewProfile ?? resolveVisualReviewProfile({
        scale,
        significance_mode: significanceMode,
        action_class: directActionClass,
        impact_class: directImpactClass,
        has_region_bounds: !!regionBounds,
        open_problem_scale: text(context.active_problem_id) === problemId
          ? text(context.active_problem_scale)
          : undefined,
      });
      if (visualReviewProfile.require_region && !regionBounds) {
        violations.push(violation(
          'next_operation',
          'compact_review_region_bounds_required',
          `${visualReviewProfile.level} visual review requires next_pass.region_bounds in source-document pixels`
        ));
      }
      directOperation.visual_review_profile = visualReviewProfile;
      directOperation.preview_args = {
        max_dimension_px: visualReviewProfile.whole_max_dimension_px,
        quality: 8,
        ...(visualReviewProfile.require_region && regionBounds ? {
          focus_region: regionBounds,
          focus_max_dimension_px: visualReviewProfile.focus_max_dimension_px,
        } : {}),
      };
    }
    // Document bootstrap is infrastructure, not an artistic painting method.
    // Callers may accidentally carry stage/intent metadata from the painting
    // request into create/open. Never route bootstrap through method selection:
    // doing so can misclassify GLOBAL_BLOCK_IN + mass/construct as
    // region-block-in and reject the real create/open tool before dispatch.
    if (!bootstrap && (visualIntent || impactClass || text(raw.preferred_method_id) || (Array.isArray(raw.avoid_method_ids) && raw.avoid_method_ids.length))) {
      const inferred = text(raw.construction_role) ? null : inferUniqueClassification({
        registry, actionClass: directActionClass, executionTools: [onlyTool], visualIntent, impactClass,
        preferredMethodId: text(raw.preferred_method_id),
        avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
      });
      if (inferred) {
        visualIntent ??= inferred.visualIntent;
        impactClass ??= inferred.impactClass;
        normalizations.push({ code: 'artistic_classification_normalized', message: inferred.reason });
      }
      if (!visualIntent || !impactClass) {
        violations.push(...validatePartialClassification({ registry, executionTools: [onlyTool], visualIntent, impactClass,
          preferredMethodId: text(raw.preferred_method_id),
          avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
        }));
      } else {
        try {
          let plan = compileArtisticOperation(registry, {
            visualIntent: visualIntent as never,
            impactClass: impactClass as never,
            stage,
            preferredMethodId: text(raw.preferred_method_id),
            avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
            documentId: Number(documentId),
            runtimeRevision: UXP_BRIDGE_REVISION,
          });
          if (!plan.allowedExecutionTools.includes(onlyTool)
            && !text(raw.construction_role)
            && !['REPLACE', 'ERASE', 'ROLLBACK'].includes(directActionClass ?? 'ADD')) {
            plan = deriveExecutableMethod(
              registry, plan, [onlyTool],
              Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
              normalizations,
            ) ?? plan;
          }
          if (!plan.allowedExecutionTools.includes(onlyTool)) {
            violations.push(violation(
              'next_operation',
              'artistic_method_execution_mismatch',
              `declared method ${plan.method.id} allows ${plan.allowedExecutionTools.join('|')} but compact pass executes ${onlyTool}`
            ));
          }
          // Validate the compact artistic-method contract here, but keep it
          // compiler-local. `artistic_operation` is not a public Guard request
          // field, so forwarding it would make a valid single-operation compact
          // pass reject itself during operation-contract validation.
        } catch (error) {
          violations.push(violation(
            'next_operation',
            'artistic_method_unavailable',
            error instanceof Error ? error.message : String(error)
          ));
        }
      }
    }
    if (DIRECT_BLUR_TOOLS.has(onlyTool)) {
      const layerId = actionArgs.layer_id;
      if (typeof layerId !== 'number' || !Number.isSafeInteger(layerId) || layerId <= 0) {
        violations.push(violation('next_operation', 'blur_target_layer_required', 'Blur requires one explicit numeric layer_id; active-layer selection is not ownership authority.'));
      }
      const owners = Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : [];
      const matches = owners.filter(owner => owner.temporary !== true && owner.layer_id === layerId);
      const supplied = raw.logical_layer && typeof raw.logical_layer === 'object' && !Array.isArray(raw.logical_layer)
        ? raw.logical_layer as Record<string, unknown> : undefined;
      const owner = matches.length === 1 ? matches[0] : undefined;
      if ((context.painting_profile === 'nontrivial_painting' || supplied || matches.length) && !owner) {
        violations.push(violation('next_operation', 'semantic_target_owner_ambiguous', 'Blur must target one unique current durable owner; unclaimed, temporary and historical layers cannot inherit authority.'));
      }
      if (supplied && (!owner || text(supplied.hypothesis_id) !== text(owner.hypothesis_id)
        || (supplied.layer_id !== undefined && supplied.layer_id !== layerId)
        || !['continue-logical-layer', 'adjust'].includes(text(supplied.decision) ?? ''))) {
        violations.push(violation('next_operation', 'semantic_mutation_target_owner_mismatch', 'Explicit blur ownership must agree with the actual numeric target and current durable binding.'));
      }
      if (owner) directOperation.logical_layer = {
        decision: 'continue-logical-layer', hypothesis_id: owner.hypothesis_id, layer_id: layerId,
        physical_role: owner.physical_role, opacity_role: owner.opacity_role,
      };
      let camera: SceneCameraImagingModel | undefined;
      try {
        if (context.scene_camera_imaging_model) camera = normalizeSceneCameraImagingModel(context.scene_camera_imaging_model);
        if (raw.scene_camera_imaging_model !== undefined) {
          const suppliedCamera = normalizeSceneCameraImagingModel(raw.scene_camera_imaging_model);
          const geometry = context.scene_geometry_model ? normalizeSceneGeometryModel(context.scene_geometry_model) : undefined;
          const lighting = context.scene_lighting_color_model ? normalizeSceneLightingColorModel(context.scene_lighting_color_model) : undefined;
          if (suppliedCamera.source_frame.document_id !== documentId
            || suppliedCamera.source_frame.document_incarnation !== context.document_incarnation_id
            || !geometry || suppliedCamera.geometry_model_id !== geometry.model_id || suppliedCamera.geometry_model_revision !== geometry.revision
            || (suppliedCamera.lighting_color_model_id && (!lighting || suppliedCamera.lighting_color_model_id !== lighting.model_id || suppliedCamera.lighting_color_model_revision !== lighting.revision))) {
            throw new Error('Supplied camera model must match the current document incarnation and durable geometry/light revisions.');
          }
          if (camera && (suppliedCamera.model_id !== camera.model_id || suppliedCamera.revision <= camera.revision)) {
            throw new Error('Camera replacement must retain model identity and advance its revision.');
          }
          camera = suppliedCamera;
          directOperation.scene_camera_imaging_model = camera;
        }
      } catch (error) {
        violations.push(violation('next_operation', 'scene_camera_imaging_model_invalid', error instanceof Error ? error.message : String(error)));
      }
      if (raw.imaging_preflight === undefined) {
        violations.push(violation('next_operation', 'imaging_preflight_required', 'Actual blur execution requires imaging_preflight, including owner depth/focus and edge-detail review; distance alone is not a blur justification.'));
      } else if (!camera) {
        violations.push(violation('next_operation', 'imaging_preflight_camera_model_missing', 'Blur requires the active durable camera/imaging model.'));
      } else {
        try {
          const imaging = normalizeImagingPreflight(raw.imaging_preflight, camera);
          if (imaging.outcome === 'conflict') throw new Error(imaging.findings.join('; '));
          if (!imaging.revalidate_edge_detail) throw new Error('Blur must revalidate the visible edge/detail hierarchy.');
          if (onlyTool === 'photoshop_apply_motion_blur' && imaging.effect_kind !== 'motion-blur') throw new Error('Motion blur requires a motion-blur imaging preflight.');
          if (owner) {
            const expected = imaging.owner_expectations.find(row => row.owner_id === owner.hypothesis_id);
            if (!expected) throw new Error('Imaging preflight must include the actual target owner.');
            if (owner.camera_binding) {
              const binding = normalizeCameraBinding(owner.camera_binding);
              if (binding.sceneCameraModelId !== camera.model_id || binding.sceneCameraRevision !== camera.revision) throw new Error('Target camera binding is stale; revalidate it before blur.');
              if (!expected.local_exception && (expected.depth_role !== binding.depthRole || expected.expected_focus_role !== binding.expectedFocusRole)) throw new Error('Target depth/focus contradicts the durable owner camera binding without an explicit local exception.');
            }
          }
          directOperation.imaging_preflight = imaging;
        } catch (error) {
          violations.push(violation('next_operation', 'imaging_preflight_conflict', error instanceof Error ? error.message : String(error)));
        }
      }
    }
    return { operation: directOperation, violations, normalizations };
  }

  if (!Number.isSafeInteger(documentId) || Number(documentId) <= 0) {
    violations.push(violation(
      'next_operation',
      'compact_pass_document_required',
      'next_pass.document_id is required for VisualMicroPlan painting passes'
    ));
    return { violations };
  }

  const mutationSteps = actions.filter(step => VISUAL_MICROPLAN_MUTATION_TOOLS.has(text(step.tool) ?? ''));
  const knownMethods = new Map(paintingMethodCapabilities(registry).map(capability => [capability.id, capability]));
  for (const step of mutationSteps) {
    const methodId = text(step.method_id);
    if (!methodId) continue;
    if (Array.isArray(raw.avoid_method_ids) && raw.avoid_method_ids.includes(methodId)) {
      violations.push(violation('next_operation', 'artistic_method_unavailable', `Executed method_id=${methodId} is explicitly excluded.`));
    }
    const semanticMethod = knownMethods.get(methodId);
    if (semanticMethod && semanticMethod.primaryTool !== text(step.tool)
      && !(methodId === 'continuous-color-field' && text(step.tool) === 'photoshop_fill_layer')) {
      violations.push(violation(
        'next_operation',
        'step_method_tool_mismatch',
        `method_id=${methodId} requires primary tool ${semanticMethod.primaryTool}, not ${text(step.tool) ?? 'missing'}`
      ));
    }
  }
  const methodClasses = [...new Set(mutationSteps.map(step => compactStepMethodClass(step, registry)).filter(Boolean))] as string[];
  if (methodClasses.length > 1) {
    violations.push(violation(
      'next_operation',
      'compact_pass_mixed_method_class',
      `next_pass actions contain incompatible mutation method classes: ${methodClasses.join(', ')}; split them into bounded passes`
    ));
  }
  if (mutationSteps.length > VISUAL_MICROPLAN_MAX_MUTATIONS) {
    violations.push(violation(
      'next_operation',
      'compact_pass_visual_mutation_limit',
      `next_pass may contain at most ${VISUAL_MICROPLAN_MAX_MUTATIONS} visual mutations; split the artistic stage into sequential Guard passes`,
      {
        requested_mutations: mutationSteps.length,
        allowed_mutations: VISUAL_MICROPLAN_MAX_MUTATIONS,
        splittable: true,
      }
    ));
  }
  const methodClass = methodClasses[0];
  if (methodClass === 'filter') {
    if (mutationSteps.length !== 1 || text(mutationSteps[0]?.tool) !== 'photoshop_apply_gaussian_blur'
      || actions.some(action => text(action.tool) === 'photoshop_create_layer')) {
      violations.push(violation('next_operation', 'prepared_filter_scope', 'Filter bundle permits preparation and exactly one Gaussian filter on an existing owner.'));
    } else {
      const direct = compileCompactPass({ ...raw, actions: [mutationSteps[0]] }, store, registry, projectionContext);
      violations.push(...direct.violations);
      if (!direct.operation || direct.violations.length) return { violations };
      const verified = direct.operation.logical_layer as Record<string, unknown> | undefined;
      const context = store.compactPassContext?.(Number(documentId), projectionContext) ?? {};
      const owner = Array.isArray(context.logical_layer_owners)
        ? context.logical_layer_owners.find(row => row.hypothesis_id === verified?.hypothesis_id) : undefined;
      const schema = registry.get('photoshop_execute_visual_microplan')?.tool.inputSchema as Record<string, any> | undefined;
      const ownerFields = schema?.properties?.logical_layer?.properties ?? {};
      const inherited = Object.fromEntries(Object.entries(owner ?? {}).filter(([key]) => Object.hasOwn(ownerFields, key)));
      const supplied = raw.logical_layer as Record<string, unknown> | undefined;
      raw = { ...raw, logical_layer: verified ? { ...inherited, ...supplied, ...verified,
        expected_independent_rollback: supplied?.expected_independent_rollback ?? inherited.expected_independent_rollback ?? false,
      } : raw.logical_layer };
    }
  }
  const risk = mutationSteps
    .map(step => compactRiskForMethod(compactStepMethodClass(step, registry)))
    .sort((a, b) => ['low', 'moderate', 'high'].indexOf(b) - ['low', 'moderate', 'high'].indexOf(a))[0]
    ?? 'low';
  const explicitActionClass = text(raw.action_class)?.toUpperCase();
  if (explicitActionClass && !VISUAL_MICROPLAN_ACTION_CLASSES.includes(explicitActionClass as never)) {
    violations.push(violation(
      'next_operation',
      'compact_action_class_invalid',
      `next_pass.action_class must be one of ${VISUAL_MICROPLAN_ACTION_CLASSES.join('|')}`
    ));
  }
  if (Array.isArray(raw.replace_protected_layer_ids) && raw.replace_protected_layer_ids.length > 0 && !explicitActionClass) {
    violations.push(violation(
      'next_operation',
      'compact_replace_action_required',
      'replace_protected_layer_ids requires explicit next_pass.action_class=REPLACE or ERASE'
    ));
  }
  const actionClass = explicitActionClass
    ?? (methodClass === 'rollback' ? 'ROLLBACK' : methodClass === 'erase' ? 'ERASE' : 'ADD');
  for (const step of mutationSteps) if (step.tool === 'photoshop_paint_regions' && (step.args as Record<string, unknown>)?.replace_contents === true) {
    const layer = Number((raw.logical_layer as any)?.layer_id);
    const declaredRegions = (step.args as Record<string, unknown>).regions as Array<Record<string, unknown>>;
    if (actionClass !== 'REPLACE' || !Number.isSafeInteger(layer) || layer <= 0
      || !declaredRegions?.length || declaredRegions.some(r => r.layer_id !== layer))
      violations.push(violation('next_operation', 'component_rebuild_target_required', 'Replacing contents requires explicit REPLACE, one durable owned layer and every region pinned to that same layer. Never clear an implicit active target.'));
  }

  const context = store.compactPassContext?.(Number(documentId), projectionContext) ?? {};
  const { stage, stageReset } = resolveCompactStageTransition(
    raw,
    context,
    violations,
    'GLOBAL_BLOCK_IN'
  );
  // An omitted inspection scale means the whole frame, not an absent required
  // executor field. Preserve explicit/durable artistic decisions verbatim.
  const scale = text(raw.scale) ?? text(context.scale) ?? 'global';
  const region = text(raw.region) ?? 'whole-canvas';
  const significanceMode = text(raw.significance_mode) ?? 'normal';
  const regionBounds = raw.region_bounds && typeof raw.region_bounds === 'object' && !Array.isArray(raw.region_bounds)
    ? structuredClone(raw.region_bounds) as Record<string, unknown>
    : undefined;
  const objectContextRegionBounds = raw.object_context_region_bounds
    && typeof raw.object_context_region_bounds === 'object'
    && !Array.isArray(raw.object_context_region_bounds)
    ? structuredClone(raw.object_context_region_bounds) as Record<string, unknown>
    : undefined;
  const adaptiveMutationBudget = resolveVisualMicroPlanMutationBudget({
    risk: risk as 'low' | 'moderate' | 'high',
    stage,
    scale,
    actionClass,
    protectedLayerCount: Array.isArray(raw.protected_layer_ids) ? raw.protected_layer_ids.length : 0,
    affectedRelationCount: Array.isArray(raw.affected_relations) ? raw.affected_relations.length : 0,
    affectedQualityCount: Array.isArray(raw.affected_qualities) ? raw.affected_qualities.length : 0,
  });
  if (mutationSteps.length > adaptiveMutationBudget.allowedMutations) {
    violations.push(violation(
      'next_operation',
      'compact_pass_adaptive_mutation_budget_exceeded',
      `next_pass requests ${mutationSteps.length} visual mutations but adaptive budget allows ${adaptiveMutationBudget.allowedMutations} (${adaptiveMutationBudget.reason}); split/defer the remaining actions before dispatch`,
      {
        requested_mutations: mutationSteps.length,
        allowed_mutations: adaptiveMutationBudget.allowedMutations,
        splittable: true,
        budget_reason: adaptiveMutationBudget.reason,
      }
    ));
  }
  const createSteps = actions.filter(step => text(step.tool) === 'photoshop_create_layer');
  if (createSteps.length > VISUAL_MICROPLAN_MAX_LAYER_CREATIONS) {
    violations.push(violation(
      'next_operation',
      'compact_pass_multiple_layer_creation',
      `next_pass may create at most ${VISUAL_MICROPLAN_MAX_LAYER_CREATIONS} logical layer; the current VisualMicroPlan represents one rollback unit`
    ));
  }

  const createStep = createSteps.length === 1 ? createSteps[0] : undefined;
  const createArgs = createStep?.args && typeof createStep.args === 'object' && !Array.isArray(createStep.args)
    ? createStep.args as Record<string, unknown>
    : {};
  const layerName = text(createArgs.name) ?? `Pass ${requestKey}`;
  let rawLayerSeparation = raw.layer_separation_check
    && typeof raw.layer_separation_check === 'object'
    && !Array.isArray(raw.layer_separation_check)
    ? structuredClone(raw.layer_separation_check) as Record<string, unknown>
    : undefined;
  let rawLogicalLayer = raw.logical_layer
    && typeof raw.logical_layer === 'object'
    && !Array.isArray(raw.logical_layer)
    ? structuredClone(raw.logical_layer) as Record<string, unknown>
    : undefined;

  const owners = Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : [];
  // A numeric mutation target can inherit ownership only from one current durable binding.
  // Never guess from a layer name, the active tab, an unclaimed layer or an old stack member.
  if (!rawLogicalLayer && !createStep && mutationSteps.length && actionClass !== 'ROLLBACK' && !raw.cross_layer_correction) {
    const targetIds: number[] = [];
    let explicitTargets = true;
    for (const step of mutationSteps) {
      const args = step.args as Record<string, unknown>;
      const regions = Array.isArray(args.regions) ? args.regions as Array<Record<string, unknown>> : undefined;
      const ids = regions?.length ? regions.map(region => region.layer_id ?? args.layer_id) : [args.layer_id];
      for (const id of ids) {
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) explicitTargets = false;
        else targetIds.push(id);
      }
    }
    if (explicitTargets && targetIds.length) {
      const matches = targetIds.map(id => owners.filter(owner => owner.temporary !== true && Number(owner.layer_id) === id));
      const uniqueOwnerIds = new Set(matches.flatMap(rows => rows.map(owner => text(owner.hypothesis_id))).filter(Boolean));
      if (matches.some(rows => rows.length > 1) || (uniqueOwnerIds.size > 0 && (uniqueOwnerIds.size !== 1 || matches.some(rows => rows.length === 0)))) {
        violations.push(violation('next_operation', 'semantic_target_owner_ambiguous',
          'Explicit mutation targets do not identify one unique current semantic owner; declare the owner/cross-layer correction instead of choosing an arbitrary binding.'));
      } else if (uniqueOwnerIds.size === 1 && matches.every(rows => rows.length === 1)) {
        rawLogicalLayer = { decision: 'continue-logical-layer', hypothesis_id: text(matches[0][0].hypothesis_id), layer_id: targetIds[0] };
        const owner = matches[0][0];
        if (typeof owner.expected_independent_rollback === 'boolean') rawLogicalLayer.expected_independent_rollback = owner.expected_independent_rollback;
        else if (text(owner.rollback_value)) rawLogicalLayer.expected_independent_rollback = text(owner.rollback_value) !== 'low';
        normalizations.push({ code: 'semantic_owner_inherited_from_target', message: 'Inherited the unique current durable semantic owner from explicit physical mutation targets.' });
      }
    }
  }
  if (!rawLogicalLayer && !createStep && context.has_visual_frame === true && context.painting_profile === 'nontrivial_painting'
    && text(raw.construction_role) === 'structured-mass' && mutationSteps.length && actionClass !== 'ROLLBACK' && !raw.cross_layer_correction) {
    violations.push(violation('next_operation', 'semantic_layer_owner_missing',
      'Structured-mass continuation must retain a semantic owner; supply a validated existing-owner binding when the physical target cannot inherit one uniquely.'));
  }
  const plannedLogicalDecision = text(rawLogicalLayer?.decision)?.toLowerCase();
  let durableSceneOwnershipPlan: SceneOwnershipPlan | undefined;
  if (context.scene_ownership_plan) {
    try {
      durableSceneOwnershipPlan = normalizeSceneOwnershipPlan(context.scene_ownership_plan);
    } catch (error) {
      violations.push(violation(
        'next_operation',
        'scene_ownership_plan_state_invalid',
        `Durable scene ownership plan is invalid: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }
  let suppliedSceneOwnershipPlan: SceneOwnershipPlan | undefined;
  if (raw.scene_ownership_plan !== undefined) {
    try {
      suppliedSceneOwnershipPlan = normalizeSceneOwnershipPlan(raw.scene_ownership_plan);
    } catch (error) {
      violations.push(violation(
        'next_operation',
        'scene_ownership_plan_invalid',
        error instanceof Error ? error.message : String(error)
      ));
    }
  }
  let sceneOwnershipPlan = durableSceneOwnershipPlan ?? suppliedSceneOwnershipPlan;
  if (durableSceneOwnershipPlan && suppliedSceneOwnershipPlan) {
    try { sceneOwnershipPlan = extendSceneOwnershipPlan(durableSceneOwnershipPlan, suppliedSceneOwnershipPlan); }
    catch (error) { violations.push(violation('next_operation', 'scene_ownership_plan_conflict', error instanceof Error ? error.message : String(error))); }
  }
  const sceneOwnershipPlanToPersist = suppliedSceneOwnershipPlan
    && (!durableSceneOwnershipPlan || stableJson(sceneOwnershipPlan) !== stableJson(durableSceneOwnershipPlan))
    ? sceneOwnershipPlan : undefined;
  let durableSceneGeometryModel: SceneGeometryModel | undefined;
  if (context.scene_geometry_model) {
    try {
      durableSceneGeometryModel = normalizeSceneGeometryModel(context.scene_geometry_model);
    } catch (error) {
      violations.push(violation('next_operation', 'scene_geometry_model_state_invalid',
        `Durable scene geometry model is invalid: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  let suppliedSceneGeometryModel: SceneGeometryModel | undefined;
  if (raw.scene_geometry_model !== undefined) {
    try {
      suppliedSceneGeometryModel = normalizeSceneGeometryModel(raw.scene_geometry_model);
    } catch (error) {
      violations.push(violation('next_operation', 'scene_geometry_model_invalid',
        error instanceof Error ? error.message : String(error)));
    }
  }
  let sceneGeometryModelToPersist: SceneGeometryModel | undefined;
  if (suppliedSceneGeometryModel) {
    if (suppliedSceneGeometryModel.source_frame.document_id !== documentId) {
      violations.push(violation('next_operation', 'scene_geometry_model_document_mismatch',
        `scene_geometry_model_document_mismatch: source_frame.document_id=${suppliedSceneGeometryModel.source_frame.document_id} does not match operation document_id=${documentId}`));
    } else if (context.document_incarnation_id
      && suppliedSceneGeometryModel.source_frame.document_incarnation !== context.document_incarnation_id) {
      violations.push(violation('next_operation', 'scene_geometry_model_incarnation_mismatch',
        `scene_geometry_model_incarnation_mismatch: source_frame.document_incarnation=${suppliedSceneGeometryModel.source_frame.document_incarnation} must match the exact current document incarnation=${context.document_incarnation_id}`));
    } else if (durableSceneGeometryModel) {
      if (suppliedSceneGeometryModel.model_id !== durableSceneGeometryModel.model_id) {
        violations.push(violation('next_operation', 'scene_geometry_model_conflict',
          `scene_geometry_model_conflict: durable model_id=${durableSceneGeometryModel.model_id}; replacement must preserve model identity`));
      } else if (suppliedSceneGeometryModel.revision <= durableSceneGeometryModel.revision) {
        violations.push(violation('next_operation', 'scene_geometry_model_revision_conflict',
          `scene_geometry_model_revision_conflict: supplied revision=${suppliedSceneGeometryModel.revision} must be greater than durable revision=${durableSceneGeometryModel.revision}`));
      } else {
        sceneGeometryModelToPersist = suppliedSceneGeometryModel;
      }
    } else {
      sceneGeometryModelToPersist = suppliedSceneGeometryModel;
    }
  }
  const applicableSceneGeometryModel = sceneGeometryModelToPersist ?? durableSceneGeometryModel;
  let durableSceneLightingColorModel: SceneLightingColorModel | undefined;
  if (context.scene_lighting_color_model) {
    try {
      durableSceneLightingColorModel = normalizeSceneLightingColorModel(context.scene_lighting_color_model);
    } catch (error) {
      violations.push(violation('next_operation', 'scene_lighting_color_model_state_invalid',
        `Durable scene lighting/color model is invalid: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  let suppliedSceneLightingColorModel: SceneLightingColorModel | undefined;
  if (raw.scene_lighting_color_model !== undefined) {
    try {
      suppliedSceneLightingColorModel = normalizeSceneLightingColorModel(raw.scene_lighting_color_model);
    } catch (error) {
      violations.push(violation('next_operation', 'scene_lighting_color_model_invalid', error instanceof Error ? error.message : String(error)));
    }
  }
  let sceneLightingColorModelToPersist: SceneLightingColorModel | undefined;
  if (suppliedSceneLightingColorModel) {
    if (suppliedSceneLightingColorModel.source_frame.document_id !== documentId) {
      violations.push(violation('next_operation', 'scene_lighting_color_model_document_mismatch',
        `scene_lighting_color_model_document_mismatch: source_frame.document_id=${suppliedSceneLightingColorModel.source_frame.document_id} does not match operation document_id=${documentId}`));
    } else if (context.document_incarnation_id && suppliedSceneLightingColorModel.source_frame.document_incarnation !== context.document_incarnation_id) {
      violations.push(violation('next_operation', 'scene_lighting_color_model_incarnation_mismatch',
        `scene_lighting_color_model_incarnation_mismatch: source_frame.document_incarnation=${suppliedSceneLightingColorModel.source_frame.document_incarnation} must match the exact current document incarnation=${context.document_incarnation_id}`));
    } else if (durableSceneLightingColorModel) {
      if (suppliedSceneLightingColorModel.model_id !== durableSceneLightingColorModel.model_id) {
        violations.push(violation('next_operation', 'scene_lighting_color_model_conflict',
          `scene_lighting_color_model_conflict: durable model_id=${durableSceneLightingColorModel.model_id}; replacement must preserve model identity`));
      } else if (suppliedSceneLightingColorModel.revision <= durableSceneLightingColorModel.revision) {
        violations.push(violation('next_operation', 'scene_lighting_color_model_revision_conflict',
          `scene_lighting_color_model_revision_conflict: supplied revision=${suppliedSceneLightingColorModel.revision} must be greater than durable revision=${durableSceneLightingColorModel.revision}`));
      } else sceneLightingColorModelToPersist = suppliedSceneLightingColorModel;
    } else sceneLightingColorModelToPersist = suppliedSceneLightingColorModel;
  }
  const applicableSceneLightingColorModel = sceneLightingColorModelToPersist ?? durableSceneLightingColorModel;
  let durableSceneCameraImagingModel: SceneCameraImagingModel | undefined;
  if (context.scene_camera_imaging_model) {
    try {
      durableSceneCameraImagingModel = normalizeSceneCameraImagingModel(context.scene_camera_imaging_model);
    } catch (error) {
      violations.push(violation('next_operation', 'scene_camera_imaging_model_state_invalid',
        `Durable scene camera/imaging model is invalid: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  let suppliedSceneCameraImagingModel: SceneCameraImagingModel | undefined;
  if (raw.scene_camera_imaging_model !== undefined) {
    try {
      suppliedSceneCameraImagingModel = normalizeSceneCameraImagingModel(raw.scene_camera_imaging_model);
    } catch (error) {
      violations.push(violation('next_operation', 'scene_camera_imaging_model_invalid', error instanceof Error ? error.message : String(error)));
    }
  }
  let sceneCameraImagingModelToPersist: SceneCameraImagingModel | undefined;
  if (suppliedSceneCameraImagingModel) {
    if (suppliedSceneCameraImagingModel.source_frame.document_id !== documentId) {
      violations.push(violation('next_operation', 'scene_camera_imaging_model_document_mismatch',
        `scene_camera_imaging_model source document ${suppliedSceneCameraImagingModel.source_frame.document_id} does not match operation document ${documentId}`));
    } else if (context.document_incarnation_id
      && suppliedSceneCameraImagingModel.source_frame.document_incarnation !== context.document_incarnation_id) {
      violations.push(violation('next_operation', 'scene_camera_imaging_model_incarnation_mismatch',
        `scene_camera_imaging_model source incarnation must match current document incarnation ${context.document_incarnation_id}`));
    } else if (!applicableSceneGeometryModel
      || suppliedSceneCameraImagingModel.geometry_model_id !== applicableSceneGeometryModel.model_id
      || suppliedSceneCameraImagingModel.geometry_model_revision !== applicableSceneGeometryModel.revision) {
      violations.push(violation('next_operation', 'scene_camera_imaging_geometry_mismatch',
        'scene_camera_imaging_model must reference the exact applicable Scene Geometry Model revision'));
    } else if (suppliedSceneCameraImagingModel.lighting_color_model_id
      && (!applicableSceneLightingColorModel
        || suppliedSceneCameraImagingModel.lighting_color_model_id !== applicableSceneLightingColorModel.model_id
        || suppliedSceneCameraImagingModel.lighting_color_model_revision !== applicableSceneLightingColorModel.revision)) {
      violations.push(violation('next_operation', 'scene_camera_imaging_lighting_mismatch',
        'scene_camera_imaging_model lighting/color provenance must reference the exact applicable E.19 revision'));
    } else if (durableSceneCameraImagingModel) {
      if (suppliedSceneCameraImagingModel.model_id !== durableSceneCameraImagingModel.model_id) {
        violations.push(violation('next_operation', 'scene_camera_imaging_model_conflict',
          `durable camera model_id=${durableSceneCameraImagingModel.model_id}; replacement must preserve model identity`));
      } else if (suppliedSceneCameraImagingModel.revision <= durableSceneCameraImagingModel.revision) {
        violations.push(violation('next_operation', 'scene_camera_imaging_model_revision_conflict',
          `supplied camera revision=${suppliedSceneCameraImagingModel.revision} must be greater than durable revision=${durableSceneCameraImagingModel.revision}`));
      } else sceneCameraImagingModelToPersist = suppliedSceneCameraImagingModel;
    } else sceneCameraImagingModelToPersist = suppliedSceneCameraImagingModel;
  }
  const applicableSceneCameraImagingModel = sceneCameraImagingModelToPersist ?? durableSceneCameraImagingModel;
  const imagingPreflightRequired = (
    text(rawLogicalLayer?.physical_role)?.toLowerCase() === 'camera-post'
    || mutationSteps.some(step => DIRECT_BLUR_TOOLS.has(text(step.tool) ?? ''))
    || ['gaussian-blur', 'smart-blur'].includes(text(raw.preferred_method_id)?.toLowerCase() ?? '')
  );
  let imagingPreflight: ImagingPreflight | undefined;
  if (imagingPreflightRequired && raw.imaging_preflight === undefined) {
    violations.push(violation('next_operation', 'imaging_preflight_required',
      'Substantial camera/post or blur treatment requires imaging_preflight against the active E.20 camera model'));
  } else if (raw.imaging_preflight !== undefined) {
    if (!applicableSceneCameraImagingModel) {
      violations.push(violation('next_operation', 'imaging_preflight_camera_model_missing',
        'imaging_preflight requires an active durable or same-pass scene_camera_imaging_model'));
    } else {
      try {
        imagingPreflight = normalizeImagingPreflight(raw.imaging_preflight, applicableSceneCameraImagingModel);
        if (imagingPreflight.outcome === 'conflict') {
          violations.push(violation('next_operation', 'imaging_preflight_conflict', imagingPreflight.findings.join('; ')));
        }
      } catch (error) {
        violations.push(violation('next_operation', 'imaging_preflight_invalid', error instanceof Error ? error.message : String(error)));
      }
    }
  }
  const rawLogicalLayerForColor = raw.logical_layer && typeof raw.logical_layer === 'object' && !Array.isArray(raw.logical_layer)
    ? raw.logical_layer as Record<string, unknown>
    : undefined;
  // The blank-canvas first-visible-progress path is intentionally exempt: it
  // must not be delayed by a scene-color receipt before any visual frame
  // exists. Once a frame exists, broad color decisions become causal edits
  // and require the E.19 receipt.
  const broadColorAdjustmentTools = new Set([
    'photoshop_adjust_hue_saturation',
    'photoshop_adjust_vibrance',
    'photoshop_adjust_exposure',
    'photoshop_apply_photo_filter',
    'photoshop_apply_gradient_map',
    'photoshop_apply_lut',
  ]);
  const hasBroadDirectColorAdjustment = scale === 'global'
    && mutationSteps.some(step => broadColorAdjustmentTools.has(text(step.tool) ?? ''));
  const colorPreflightRequired = context.has_visual_frame === true && (methodClass === 'gradient'
    || ['atmosphere', 'optical-effect'].includes(text(rawLogicalLayerForColor?.physical_role) ?? '')
    || (scale === 'global' && Array.isArray(raw.change_domains) && raw.change_domains.includes('lighting-structure'))
    || hasBroadDirectColorAdjustment);
  let colorGradientPreflight: ColorGradientPreflight | undefined;
  if (colorPreflightRequired && raw.color_gradient_preflight === undefined) {
    violations.push(violation('next_operation', 'color_gradient_preflight_required',
      'Large color-field/gradient, broad relighting, atmosphere, and major optical-effect passes require next_pass.color_gradient_preflight before dispatch'));
  } else if (raw.color_gradient_preflight !== undefined) {
    if (!applicableSceneLightingColorModel) {
      violations.push(violation('next_operation', 'color_gradient_preflight_scene_model_missing',
        'color_gradient_preflight requires an active durable or same-pass scene_lighting_color_model'));
    } else {
      try {
        colorGradientPreflight = normalizeColorGradientPreflight(raw.color_gradient_preflight, applicableSceneLightingColorModel);
        if (colorGradientPreflight.outcome === 'conflict') {
          violations.push(violation('next_operation', 'color_gradient_preflight_conflict',
            `color_gradient_preflight conflicts with established E.19 evidence: ${colorGradientPreflight.findings.join('; ')}`));
        }
      } catch (error) {
        violations.push(violation('next_operation', 'color_gradient_preflight_invalid',
          error instanceof Error ? error.message : String(error)));
      }
    }
  }
  const validateMaterialLightingBinding = (plan: MaterialResponsePlan) => {
    if (!plan.lightingColorBinding) return;
    if (!applicableSceneLightingColorModel) {
      violations.push(violation('next_operation', 'material_lighting_color_scene_model_missing',
        'material_response.lighting_color_binding requires an active durable or same-pass scene_lighting_color_model'));
      return;
    }
    const binding = plan.lightingColorBinding;
    const ownerId = text(logicalLayer?.hypothesis_id);
    const priorState = ownerId ? lightingColorBindingStateByOwner.get(ownerId) : undefined;
    const sameRevision = binding.sceneModelId === applicableSceneLightingColorModel.model_id
      && binding.sceneModelRevision === applicableSceneLightingColorModel.revision;
    const samePassSuccessor = !!sceneLightingColorModelToPersist && !!durableSceneLightingColorModel
      && binding.sceneModelId === durableSceneLightingColorModel.model_id
      && binding.sceneModelRevision === durableSceneLightingColorModel.revision;
    const staleness = sameRevision
      ? { stale: false, changed_dependency_ids: [] as string[] }
      : samePassSuccessor
        ? lightingColorBindingStaleness(binding, sceneLightingColorModelToPersist!, durableSceneLightingColorModel!)
        : {
            stale: priorState?.stale !== false,
            changed_dependency_ids: Array.isArray(priorState?.changed_dependency_ids)
              ? priorState.changed_dependency_ids.map(value => text(value)).filter((value): value is string => !!value)
              : [],
          };
    if (staleness.stale) {
      violations.push(violation('next_operation', 'material_lighting_color_binding_stale',
        `material lighting/color binding is stale against ${applicableSceneLightingColorModel.model_id}@${applicableSceneLightingColorModel.revision}; changed dependencies=${staleness.changed_dependency_ids.join(',') || 'unknown/source-revision-unavailable'}`));
      return;
    }
    const spatial = binding.spatialRelation;
    if (spatial) {
      if (!applicableSceneGeometryModel) {
        violations.push(violation('next_operation', 'material_lighting_spatial_geometry_missing',
          'material_response.lighting_color_binding.spatial_relation requires an active Scene Geometry Model'));
        return;
      }
      const currentSpatialRevision = spatial.sceneGeometryModelId === applicableSceneGeometryModel.model_id
        && spatial.sceneGeometryRevision === applicableSceneGeometryModel.revision;
      if (currentSpatialRevision) {
        const validSpatialIds = new Set<string>([
          ...applicableSceneGeometryModel.projection.vanishing_points.map(point => point.id),
          ...applicableSceneGeometryModel.line_families.map(family => family.id),
          ...applicableSceneGeometryModel.line_families.flatMap(family => family.members.map(member => member.id)),
          ...applicableSceneGeometryModel.support_planes.map(plane => plane.id),
          ...applicableSceneGeometryModel.scale_anchors.map(anchor => anchor.id),
        ]);
        const unknown = spatial.dependencyIds.filter(id => !validSpatialIds.has(id));
        if (unknown.length) {
          violations.push(violation('next_operation', 'material_lighting_spatial_dependency_missing',
            `lighting spatial relation references unknown Scene Geometry dependency id(s): ${unknown.join(',')}`));
          return;
        }
      } else {
        const priorSpatialState = priorState?.spatial_relation && typeof priorState.spatial_relation === 'object'
          ? priorState.spatial_relation as Record<string, unknown>
          : undefined;
        if (priorSpatialState?.stale !== false) {
          violations.push(violation('next_operation', 'material_lighting_spatial_relation_stale',
            `lighting spatial relation depends on geometry ${spatial.sceneGeometryModelId}@${spatial.sceneGeometryRevision}, but current geometry is ${applicableSceneGeometryModel.model_id}@${applicableSceneGeometryModel.revision}`));
          return;
        }
      }
    }
    // Current-revision bindings still receive the strict causal-reference validation.
    // Older bindings are admitted only when selective invalidation proved their dependencies unchanged.
    if (sameRevision) {
      try {
        assertLightingColorBindingMatchesScene(binding, applicableSceneLightingColorModel);
      } catch (error) {
        violations.push(violation('next_operation', 'material_lighting_color_binding_stale',
          error instanceof Error ? error.message : String(error)));
      }
    }
  };
  const lightingColorBindingStateByOwner = new Map(
    (Array.isArray(context.lighting_color_binding_states) ? context.lighting_color_binding_states : [])
      .map(state => [text(state?.owner_id), state] as const)
      .filter(([ownerId]) => !!ownerId)
  );
  const geometryBindingStateByOwner = new Map(
    (Array.isArray(context.geometry_binding_states) ? context.geometry_binding_states : [])
      .map(state => [text(state?.owner_id), state] as const)
      .filter(([ownerId]) => !!ownerId)
  );
  const cameraBindingStateByOwner = new Map(
    (Array.isArray(context.camera_binding_states) ? context.camera_binding_states : [])
      .map(state => [text(state?.owner_id), state] as const)
      .filter(([ownerId]) => !!ownerId)
  );
  const bindingStalenessAgainstApplicable = (binding: GeometryBinding, ownerId: string) => {
    if (!applicableSceneGeometryModel) return { stale: true, changed_dependency_ids: [] as string[] };
    if (binding.scene_geometry_revision === applicableSceneGeometryModel.revision
        && binding.scene_geometry_model_id === applicableSceneGeometryModel.model_id) {
      return { stale: false, changed_dependency_ids: [] as string[] };
    }
    const priorState = geometryBindingStateByOwner.get(ownerId);
    if (!sceneGeometryModelToPersist || !durableSceneGeometryModel) {
      return {
        stale: priorState?.stale !== false,
        changed_dependency_ids: Array.isArray(priorState?.changed_dependency_ids)
          ? priorState.changed_dependency_ids.map(value => text(value)).filter((value): value is string => !!value)
          : [],
      };
    }
    if (binding.scene_geometry_revision === durableSceneGeometryModel.revision) {
      return geometryBindingStaleness(binding, sceneGeometryModelToPersist, durableSceneGeometryModel);
    }
    if (priorState?.stale !== false) {
      return {
        stale: true,
        changed_dependency_ids: Array.isArray(priorState?.changed_dependency_ids)
          ? priorState.changed_dependency_ids.map(value => text(value)).filter((value): value is string => !!value)
          : [],
      };
    }
    const changed = changedSceneGeometryDependencyIds(durableSceneGeometryModel, sceneGeometryModelToPersist);
    const dependencies = new Set(geometryBindingDependencyIds(binding));
    const relevant = changed.filter(id => id === '__projection__' || dependencies.has(id));
    return { stale: relevant.length > 0, changed_dependency_ids: relevant };
  };
  const ownerByHypothesis = new Map(
    owners.map(owner => [text(owner.hypothesis_id), owner]).filter(([key]) => !!key) as Array<[string, Record<string, unknown>]>
  );
  for (const object of sceneOwnershipPlan?.objects ?? []) {
    if (object.kind !== 'compound-object') continue;
    const parts = object.component_semantic_ids.map(id => sceneOwnershipPlan!.units.find(unit => unit.semantic_id === id)!);
    const layers = parts.map(part => Number(ownerByHypothesis.get(part.owner_id)?.layer_id)).filter(id => Number.isSafeInteger(id) && id > 0);
    if (new Set(layers).size !== layers.length) violations.push(violation('next_operation', 'scene_component_layer_conflict',
      `Compound object ${object.object_id} has components sharing a physical layer; stop flattening and restore independent layers before painting.`));
    const migration = raw.cross_layer_correction as Record<string, unknown> | undefined;
    const proposedOwner = text(rawLogicalLayer?.hypothesis_id);
    if (migration && parts.some(part => part.owner_id === proposedOwner)
      && parts.some(part => part.owner_id !== proposedOwner && Number(ownerByHypothesis.get(part.owner_id)?.layer_id) === Number(migration.post_authoritative_layer_id))) {
      violations.push(violation('next_operation', 'scene_component_layer_conflict', 'A component migration cannot bind onto another editable component layer.'));
    }
  }
  const continuationOwner = ownerByHypothesis.get(text(rawLogicalLayer?.hypothesis_id) ?? '');
  if (raw.layer_separation_check === undefined && rawLogicalLayer && continuationOwner && !createStep
    && ['continue-logical-layer', 'adjust'].includes(plannedLogicalDecision ?? '')
    && rawLogicalLayer.construction_change !== true && raw.stage_reset === undefined
    && raw.cross_layer_correction === undefined
    && !['REPLACE', 'ERASE', 'ROLLBACK'].includes(actionClass)
    && text(continuationOwner.rollback_value)
    && (rawLogicalLayer.rollback_value === undefined || rawLogicalLayer.rollback_value === continuationOwner.rollback_value)) {
    rawLayerSeparation = {
      change_kind: 'continuation', substantial: true,
      rollback_value: continuationOwner.rollback_value,
      independent_adjustment_expected: false,
      reasons: ['Continue the durable owner without creating a new rollback unit.'],
    };
    normalizations.push({ code: 'layer_separation_inherited',
      message: 'Derived continuation separation from the durable owner; structural changes and fresh rollback reassessments still require an explicit check.' });
  }
  const declaredChangeKind = text(rawLayerSeparation?.change_kind)?.toLowerCase();
  const declaredRollbackValue = text(rawLayerSeparation?.rollback_value)?.toLowerCase();
  const declaredRequiresIsolation = rawLayerSeparation?.substantial === true
    && ['new-object', 'new-material', 'new-light', 'new-plane'].includes(declaredChangeKind ?? '')
    && (declaredRollbackValue !== 'low' || rawLayerSeparation?.independent_adjustment_expected === true);
  const semanticCreateMetadataRequired = !!createStep && (context.painting_profile === 'nontrivial_painting'
    || !!rawLogicalLayer || mutationSteps.some(step => step.tool !== 'photoshop_create_layer'));
  const componentScopeRequired = semanticCreateMetadataRequired
    && (plannedLogicalDecision !== 'temporary-hypothesis' || rawLayerSeparation?.substantial === true);

  if (semanticCreateMetadataRequired
    && componentScopeRequired
    && !sceneOwnershipPlan) {
    violations.push(violation(
      'next_operation',
      'scene_ownership_plan_required',
      'scene_ownership_plan_required: predeclare component ownership before semantic layer construction in every rendering profile; substantial temporary subjects also need independent components'
    ));
  }

  if (componentScopeRequired && sceneOwnershipPlan) {
    const issue = sceneComponentScopeIssue(sceneOwnershipPlan, text(rawLogicalLayer?.hypothesis_id) ?? '');
    if (issue) violations.push(violation('next_operation', issue.code, issue.message, issue.details));
  }
  let expandedStrokeBatches = 0;
  for (const action of actions) {
    if (action.tool !== 'photoshop_paint_strokes' || !action.args || typeof action.args !== 'object') continue;
    try {
      const budget = strokeExecutionBudget(action.args as Record<string, unknown>);
      expandedStrokeBatches += budget.auto_batches;
      if (!budget.allowed) violations.push(violation('next_operation', 'stroke_batch_budget_exceeded', budget.message, budget));
    } catch { /* Atomic stroke validation retains its precise format errors. */ }
  }

  if (expandedStrokeBatches > 8 && !violations.some(item => item.code === 'stroke_batch_budget_exceeded')) {
    violations.push(violation('next_operation', 'stroke_batch_budget_exceeded',
      `This pass expands to ${expandedStrokeBatches} AUTO batches across stroke actions; split the same-component work into passes of at most 8 total batches, keeping preview reserve.`,
      { auto_batches: expandedStrokeBatches, max_auto_batches: 8 }));
  }

  if (semanticCreateMetadataRequired && !rawLayerSeparation) {
    violations.push(violation(
      'next_operation',
      'semantic_layer_owner_missing',
      `semantic_layer_owner_missing: semantic painting layer creation must declare next_pass.layer_separation_check in every rendering profile`
    ));
  }
  if ((semanticCreateMetadataRequired || declaredRequiresIsolation) && !rawLogicalLayer) {
    violations.push(violation(
      'next_operation',
      'semantic_layer_owner_missing',
      `semantic_layer_owner_missing: independently editable nontrivial painting work must declare one stable next_pass.logical_layer semantic owner`
    ));
  }
  if (rawLogicalLayer && !rawLayerSeparation) {
    violations.push(violation(
      'next_operation',
      'semantic_layer_owner_missing',
      'semantic_layer_owner_missing: new ownership, structural change or rollback reassessment requires next_pass.layer_separation_check; unchanged known-owner continuation can inherit it'
    ));
  }

  const layerSeparationCheck = rawLayerSeparation ?? (createStep ? {
    change_kind: 'other',
    substantial: true,
    rollback_value: 'moderate',
    independent_adjustment_expected: true,
    reasons: ['Legacy/simple compact pass explicitly creates one independently addressable Photoshop layer.'],
  } : {
    change_kind: 'continuation',
    substantial: true,
    rollback_value: 'low',
    independent_adjustment_expected: false,
    reasons: ['Legacy/simple compact pass continues the current logical layer without creating a new rollback unit.'],
  });
  const logicalLayer = rawLogicalLayer;

  if (rawLogicalLayer && createStep && rawLogicalLayer.layer_name === undefined) {
    rawLogicalLayer.layer_name = layerName;
  }

  const ownerByLayerId = new Map(
    owners.flatMap(owner => {
      const projected = Array.isArray(owner.physical_layer_ids)
        ? owner.physical_layer_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
        : [];
      const current = Number(owner.layer_id);
      const ids = projected.length
        ? projected
        : (Number.isSafeInteger(current) && current > 0 ? [current] : []);
      return ids.map(id => [id, owner] as [number, Record<string, unknown>]);
    })
  );
  const logicalDecision = plannedLogicalDecision;
  const logicalHypothesisId = text(logicalLayer?.hypothesis_id);
  if (logicalLayer && logicalHypothesisId
    && ['continue-logical-layer', 'adjust'].includes(logicalDecision ?? '')) {
    const owner = ownerByHypothesis.get(logicalHypothesisId);
    for (const field of ['hypothesis', 'rollback_value', 'physical_role', 'opacity_role'] as const) {
      // A fresh explicit rollback assessment takes precedence over its saved value.
      const hasFreshAssessment = field === 'rollback_value' && raw.layer_separation_check !== undefined
        && rawLayerSeparation?.rollback_value !== undefined;
      const source = hasFreshAssessment ? rawLayerSeparation?.rollback_value : owner?.[field];
      if (logicalLayer[field] === undefined && owner && text(source)) {
        logicalLayer[field] = text(source);
        normalizations.push({
          code: 'semantic_owner_fact_inherited',
          message: `Inherited ${field} from ${hasFreshAssessment ? 'the explicit layer separation assessment' : `durable owner ${logicalHypothesisId}`}.`,
        });
      }
    }
    if (owner && rawLayerSeparation && rawLayerSeparation.rollback_value === undefined
      && text(logicalLayer.rollback_value)) {
      layerSeparationCheck.rollback_value = logicalLayer.rollback_value;
    }
    const ownerLayerId = Number(owner?.layer_id);
    // The owner names its current target even after multi-layer migration.
    // Historical member IDs alone cannot choose it; explicit IDs are not repaired.
    if (Number.isSafeInteger(ownerLayerId) && ownerLayerId > 0) {
      if (logicalLayer.layer_id === undefined) {
        logicalLayer.layer_id = ownerLayerId;
        normalizations.push({
          code: 'semantic_owner_target_inherited',
          message: `Inherited layer_id=${ownerLayerId} from durable owner ${logicalHypothesisId}; explicit action targets remain validated.`,
        });
      }
      if (Number(logicalLayer.layer_id) === ownerLayerId && logicalLayer.layer_name === undefined && text(owner?.layer_name)) {
        logicalLayer.layer_name = text(owner?.layer_name);
      }
    }
  }
  const logicalLayerId = Number(logicalLayer?.layer_id);
  const physicalSignatureRoles = new Set(['opaque-mass', 'support-surface', 'transmissive-surface']);
  const constructionTierRank = new Map([
    ['primary', 0], ['secondary', 1], ['tertiary', 2], ['surface', 3],
  ]);
  const ownerConstructionStale = (owner: Record<string, unknown>, seen = new Set<string>()): boolean => {
    const ownerId = text(owner.hypothesis_id);
    if (!ownerId || seen.has(ownerId)) return false;
    seen.add(ownerId);
    const parentId = text(owner.parent_hypothesis_id);
    if (!parentId) return false;
    const parent = ownerByHypothesis.get(parentId);
    if (!parent || parent.temporary === true) return true;
    if (text(owner.parent_construction_revision) !== text(parent.construction_revision)) return true;
    return ownerConstructionStale(parent, seen);
  };

  // P1-E.13: make the causal correction scope explicit before choosing/dispatching
  // the visual method.  This is derived from durable ownership rather than from
  // whichever Photoshop layer happens to be active, so read-only lint/status can
  // explain exactly what a corrective pass intends to touch.
  const scopedOwner = logicalHypothesisId ? ownerByHypothesis.get(logicalHypothesisId) : undefined;
  const rawCrossLayerCorrection = raw.cross_layer_correction
    && typeof raw.cross_layer_correction === 'object'
    && !Array.isArray(raw.cross_layer_correction)
    ? structuredClone(raw.cross_layer_correction) as Record<string, unknown>
    : undefined;
  const correctionScope = logicalHypothesisId ? {
    problem_id: problemId,
    semantic_owner_ids: [logicalHypothesisId],
    physical_layer_ids: Number.isSafeInteger(logicalLayerId) && logicalLayerId > 0
      ? [logicalLayerId]
      : (Number.isSafeInteger(scopedOwner?.layer_id) && Number(scopedOwner?.layer_id) > 0
        ? [Number(scopedOwner?.layer_id)]
        : []),
    region,
    ...(regionBounds ? { region_bounds: structuredClone(regionBounds) } : {}),
    method_class: methodClass,
    mutation_tools: [...new Set(mutationSteps.map(step => text(step.tool)).filter(Boolean))],
    owner_binding: scopedOwner ? 'durable' : (createStep ? 'planned-create' : 'unresolved'),
  } : undefined;
  const crossLayerCorrection = rawCrossLayerCorrection ? {
    mode: (text(rawCrossLayerCorrection.mode) ?? '').toLowerCase(),
    current_layer_id: Number(rawCrossLayerCorrection.current_layer_id),
    target_layer_ids: Array.isArray(rawCrossLayerCorrection.target_layer_ids)
      ? rawCrossLayerCorrection.target_layer_ids.map(Number)
      : [],
    post_authoritative_layer_id: Number(rawCrossLayerCorrection.post_authoritative_layer_id),
    reason: text(rawCrossLayerCorrection.reason) ?? '',
  } : undefined;

  // P1-E.2: the semantic declaration and the concrete mutation target must agree.
  // A pass used to be able to declare owner A/layer X while an action silently
  // carried layer_id=Y.  Check every concrete layer target in medium/global
  // visual mutations against the owner's projected physical stack, but keep the
  // current binding authoritative until an explicit migration/cross-layer
  // correction contract exists. Dynamic $steps references are intentionally
  // ignored here because create-new ownership is resolved atomically at runtime.
  const mutationTargetLayerIds = new Set<number>();
  const collectConcreteLayerIds = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) {
      for (const entry of value) collectConcreteLayerIds(entry, key);
      return;
    }
    if (!value || typeof value !== 'object') {
      if ((key === 'layer_id' || key === 'layerId') && Number.isSafeInteger(Number(value)) && Number(value) > 0) {
        mutationTargetLayerIds.add(Number(value));
      }
      return;
    }
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      collectConcreteLayerIds(child, childKey);
    }
  };
  if (logicalHypothesisId && ['medium', 'global'].includes((scale ?? '').toLowerCase())) {
    for (const step of mutationSteps) collectConcreteLayerIds(step.args);
    const projectedIds = Array.isArray(scopedOwner?.physical_layer_ids)
      ? scopedOwner.physical_layer_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
      : (Number.isSafeInteger(Number(scopedOwner?.layer_id)) ? [Number(scopedOwner?.layer_id)] : []);
    const projectedSet = new Set(projectedIds);
    const currentOwnerLayerId = Number(scopedOwner?.layer_id);
    const crossMode = (text(rawCrossLayerCorrection?.mode) ?? '').toLowerCase();
    const crossCurrentLayerId = Number(rawCrossLayerCorrection?.current_layer_id);
    const crossPostLayerId = Number(rawCrossLayerCorrection?.post_authoritative_layer_id);
    const rawCrossTargets = rawCrossLayerCorrection?.target_layer_ids;
    const crossTargets = Array.isArray(rawCrossTargets)
      ? rawCrossTargets.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
      : [];
    const crossTargetSet = new Set(crossTargets);
    const historicalTargets = [...mutationTargetLayerIds].filter(id => Number.isSafeInteger(currentOwnerLayerId) && id !== currentOwnerLayerId);
    const crossContractValid = !!rawCrossLayerCorrection
      && ['correction', 'migration'].includes(crossMode)
      && Number.isSafeInteger(currentOwnerLayerId)
      && crossCurrentLayerId === currentOwnerLayerId
      && crossTargets.length > 0
      && new Set(crossTargets).size === crossTargets.length
      && crossTargets.every(id => projectedSet.has(id))
      && historicalTargets.length > 0
      && historicalTargets.every(id => crossTargetSet.has(id))
      && crossTargets.every(id => historicalTargets.includes(id))
      && (crossMode === 'correction'
        ? crossPostLayerId === currentOwnerLayerId
        : (crossTargets.length === 1 && crossPostLayerId === crossTargets[0]));
    // E.7c: the layer ids + correction/migration mode carry execution authority.
    // Free-form reason is audit guidance and must not be a mutation-admission token.
    if (rawCrossLayerCorrection && !crossContractValid) {
      violations.push(violation(
        'next_operation',
        'semantic_cross_layer_contract_invalid',
        `semantic_cross_layer_contract_invalid: cross_layer_correction must exactly bind current layer ${currentOwnerLayerId || 'unknown'}, the historical mutation targets, and a valid post-authoritative binding; correction must preserve the current binding while migration must select its single target`
      ));
    }
    for (const targetLayerId of mutationTargetLayerIds) {
      const targetOwner = ownerByLayerId.get(targetLayerId);
      if (!scopedOwner || !projectedSet.has(targetLayerId)) {
        violations.push(violation(
          'next_operation',
          'semantic_mutation_target_owner_mismatch',
          `semantic_mutation_target_owner_mismatch: ${scale} mutation for logical owner ${logicalHypothesisId} targets physical layer ${targetLayerId}, which is not in its durable physical layer stack${targetOwner ? ` and belongs to ${text(targetOwner.hypothesis_id)}` : ''}`
        ));
      } else if (Number.isSafeInteger(currentOwnerLayerId) && targetLayerId !== currentOwnerLayerId && !crossContractValid) {
        violations.push(violation(
          'next_operation',
          'semantic_cross_layer_contract_required',
          `semantic_cross_layer_contract_required: logical owner ${logicalHypothesisId} historically spans physical layers ${projectedIds.join(', ')}, but ${targetLayerId} is not its current binding ${currentOwnerLayerId}; declare explicit migration/shared-owner cross-layer correction semantics before targeting a historical binding`
        ));
      }
    }
  }

  if (declaredRequiresIsolation && !['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '')) {
    violations.push(violation(
      'next_operation',
      'semantic_layer_isolation_required',
      `semantic_layer_isolation_required: substantial independently adjustable ${declaredChangeKind} work requires logical_layer.decision=create-new|temporary-hypothesis before Photoshop dispatch`
    ));
  }

  if (sceneOwnershipPlan && logicalHypothesisId && logicalDecision === 'create-new') {
    const plannedOwnerIds = new Set(sceneOwnershipOwnerIds(sceneOwnershipPlan));
    if (!plannedOwnerIds.has(logicalHypothesisId)) {
      violations.push(violation(
        'next_operation',
        'scene_ownership_owner_unplanned',
        `scene_ownership_owner_unplanned: committed logical owner ${logicalHypothesisId} is not predeclared by scene_ownership_plan=${sceneOwnershipPlan.plan_id}; replan ownership before Photoshop dispatch instead of inventing a new persistent owner reactively`
      ));
    }
  }

  if (logicalLayer && logicalHypothesisId) {
    const existingOwner = ownerByHypothesis.get(logicalHypothesisId);
    if (['continue-logical-layer', 'adjust'].includes(logicalDecision ?? '')) {
      if (!existingOwner) {
        violations.push(violation(
          'next_operation',
          'semantic_layer_owner_missing',
          `semantic_layer_owner_missing: logical owner ${logicalHypothesisId} has no durable journal binding for continuation`
        ));
      } else if (!Number.isSafeInteger(logicalLayerId) || logicalLayerId !== Number(existingOwner.layer_id)) {
        violations.push(violation(
          'next_operation',
          'semantic_layer_pollution',
          `semantic_layer_pollution: logical owner ${logicalHypothesisId} is bound to layer ${existingOwner.layer_id}, not ${Number.isSafeInteger(logicalLayerId) ? logicalLayerId : 'missing'}`
        ));
      }
      const layerOwner = Number.isSafeInteger(logicalLayerId) ? ownerByLayerId.get(logicalLayerId) : undefined;
      if (layerOwner && text(layerOwner.hypothesis_id) !== logicalHypothesisId) {
        violations.push(violation(
          'next_operation',
          'semantic_layer_pollution',
          `semantic_layer_pollution: layer ${logicalLayerId} belongs to ${text(layerOwner.hypothesis_id)}, not ${logicalHypothesisId}`
        ));
      }
      if (existingOwner) {
        for (const field of ['construction_tier', 'parent_hypothesis_id', 'parent_construction_revision'] as const) {
          const declared = text(logicalLayer[field]);
          const durable = text(existingOwner[field]);
          if (!declared && durable) logicalLayer[field] = durable;
          else if (declared && durable && declared !== durable) {
            violations.push(violation(
              'next_operation',
              'construction_graph_owner_conflict',
              `construction_graph_owner_conflict: logical owner ${logicalHypothesisId} is durably ${field}=${durable}, not ${declared}; replan the semantic owner instead of changing its construction dependency in-place`
            ));
          }
        }
        const declaredSurfaceFrame = logicalLayer.surface_frame;
        const durableSurfaceFrame = existingOwner.surface_frame;
        if (declaredSurfaceFrame === undefined && durableSurfaceFrame && typeof durableSurfaceFrame === 'object') {
          logicalLayer.surface_frame = structuredClone(durableSurfaceFrame);
        } else if (declaredSurfaceFrame !== undefined && durableSurfaceFrame !== undefined) {
          const canonicalFrame = (value: unknown) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
            const frame = value as Record<string, unknown>;
            const axes = Array.isArray(frame.axes) ? frame.axes.map(entry => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
              const axis = entry as Record<string, unknown>;
              return { id: text(axis.id), angle_degrees: Number(axis.angle_degrees), weight: axis.weight === undefined ? 1 : Number(axis.weight) };
            }).sort((a: any, b: any) => String(a?.id ?? '').localeCompare(String(b?.id ?? ''))) : [];
            const exceptions = Array.isArray(frame.local_exceptions)
              ? frame.local_exceptions.map(entry => text(entry)).filter(Boolean).sort()
              : [];
            return {
              axes,
              ...(frame.convergence_anchor !== undefined ? { convergence_anchor: frame.convergence_anchor } : {}),
              ...(frame.depth_progression !== undefined ? { depth_progression: frame.depth_progression } : {}),
              distribution: text(frame.distribution) ?? 'directional',
              local_exceptions: exceptions,
            };
          };
          if (stableJson(canonicalFrame(declaredSurfaceFrame)) !== stableJson(canonicalFrame(durableSurfaceFrame))) {
          violations.push(violation(
            'next_operation',
            'surface_frame_owner_conflict',
            `surface_frame_owner_conflict: logical owner ${logicalHypothesisId} has a durable surface frame; replan/create a structural owner rather than silently changing its orientation frame during continuation`
          ));
          }
        }
        const declaredGeometryBinding = logicalLayer.geometry_binding;
        const durableGeometryBinding = existingOwner.geometry_binding;
        if (declaredGeometryBinding === undefined && durableGeometryBinding && typeof durableGeometryBinding === 'object') {
          logicalLayer.geometry_binding = structuredClone(durableGeometryBinding);
        } else if (declaredGeometryBinding !== undefined && durableGeometryBinding !== undefined) {
          try {
            const declared = normalizeGeometryBinding(declaredGeometryBinding);
            const durable = normalizeGeometryBinding(durableGeometryBinding);
            if (stableJson(declared) !== stableJson(durable)) {
              const durableStaleness = bindingStalenessAgainstApplicable(durable, logicalHypothesisId);
              const declaredIssues = applicableSceneGeometryModel
                ? geometryBindingIssues(declared, applicableSceneGeometryModel, logicalHypothesisId)
                : [{ code: 'scene_geometry_model_required', message: 'scene geometry is unavailable' }];
              const explicitRevalidation = durableStaleness.stale
                && declared.scene_geometry_model_id === applicableSceneGeometryModel?.model_id
                && declared.scene_geometry_revision === applicableSceneGeometryModel?.revision
                && declaredIssues.length === 0;
              if (!explicitRevalidation) {
                violations.push(violation(
                  'next_operation',
                  'geometry_binding_owner_conflict',
                  `geometry_binding_owner_conflict: logical owner ${logicalHypothesisId} already has a durable geometry binding; replace it only as an explicit revalidation against the current scene geometry after its prior dependencies become stale`
                ));
              }
            }
          } catch (error) {
            violations.push(violation(
              'next_operation',
              'geometry_binding_state_invalid',
              `Durable/declared geometry binding for logical owner ${logicalHypothesisId} is invalid: ${error instanceof Error ? error.message : String(error)}`
            ));
          }
        }
        const declaredCameraBinding = logicalLayer.camera_binding;
        const durableCameraBinding = existingOwner.camera_binding;
        if (declaredCameraBinding === undefined && durableCameraBinding && typeof durableCameraBinding === 'object') {
          logicalLayer.camera_binding = structuredClone(durableCameraBinding);
        } else if (declaredCameraBinding !== undefined && durableCameraBinding !== undefined) {
          try {
            const declared = normalizeCameraBinding(declaredCameraBinding);
            const durable = normalizeCameraBinding(durableCameraBinding);
            if (stableJson(declared) !== stableJson(durable)) {
              const explicitRevalidation = !!applicableSceneCameraImagingModel
                && declared.sceneCameraModelId === applicableSceneCameraImagingModel.model_id
                && declared.sceneCameraRevision === applicableSceneCameraImagingModel.revision
                && (durable.sceneCameraModelId !== applicableSceneCameraImagingModel.model_id
                  || durable.sceneCameraRevision !== applicableSceneCameraImagingModel.revision);
              if (!explicitRevalidation) {
                violations.push(violation(
                  'next_operation',
                  'camera_binding_owner_conflict',
                  `camera_binding_owner_conflict: logical owner ${logicalHypothesisId} already has a durable camera binding; replace it only as explicit revalidation against the current camera model revision`
                ));
              }
            }
          } catch (error) {
            violations.push(violation(
              'next_operation',
              'camera_binding_state_invalid',
              `Durable/declared camera binding for logical owner ${logicalHypothesisId} is invalid: ${error instanceof Error ? error.message : String(error)}`
            ));
          }
        }
        const declaredAttentionBinding = logicalLayer.attention_binding;
        const durableAttentionBinding = existingOwner.attention_binding;
        if (declaredAttentionBinding === undefined && durableAttentionBinding && typeof durableAttentionBinding === 'object') {
          logicalLayer.attention_binding = structuredClone(durableAttentionBinding);
        } else if (declaredAttentionBinding !== undefined && durableAttentionBinding !== undefined) {
          try {
            const declared = normalizeAttentionBinding(declaredAttentionBinding);
            const durable = normalizeAttentionBinding(durableAttentionBinding);
            if (stableJson(declared) !== stableJson(durable)) {
              const artState = context.art_director && typeof context.art_director === 'object'
                ? context.art_director as Record<string, unknown>
                : undefined;
              const hierarchy = artState?.perceptual_hierarchy && typeof artState.perceptual_hierarchy === 'object'
                ? normalizePerceptualHierarchy(artState.perceptual_hierarchy)
                : undefined;
              const explicitRevalidation = !!hierarchy && declared.hierarchyRevision === hierarchy.revision;
              if (!explicitRevalidation) {
                violations.push(violation(
                  'next_operation',
                  'attention_binding_owner_conflict',
                  `attention_binding_owner_conflict: logical owner ${logicalHypothesisId} already has a durable attention binding; replace it only as explicit revalidation against the current perceptual hierarchy revision`
                ));
              }
            }
          } catch (error) {
            violations.push(violation(
              'next_operation',
              'attention_binding_state_invalid',
              `Durable/declared attention binding for logical owner ${logicalHypothesisId} is invalid: ${error instanceof Error ? error.message : String(error)}`
            ));
          }
        }
        const declaredNegativeSpace = logicalLayer.negative_space;
        const durableNegativeSpace = existingOwner.negative_space;
        if (declaredNegativeSpace === undefined && durableNegativeSpace && typeof durableNegativeSpace === 'object') {
          logicalLayer.negative_space = structuredClone(durableNegativeSpace);
        } else if (declaredNegativeSpace !== undefined && durableNegativeSpace !== undefined
          && stableJson(declaredNegativeSpace) !== stableJson(durableNegativeSpace)) {
          violations.push(violation(
            'next_operation',
            'negative_space_owner_conflict',
            `negative_space_owner_conflict: logical owner ${logicalHypothesisId} has durable aperture/negative-space topology; create/replan the structural owner rather than changing that relation in-place`
          ));
        }
        const declaredCausalEffect = logicalLayer.causal_effect;
        const durableCausalEffect = existingOwner.causal_effect;
        if (declaredCausalEffect === undefined && durableCausalEffect && typeof durableCausalEffect === 'object') {
          logicalLayer.causal_effect = structuredClone(durableCausalEffect);
        } else if (declaredCausalEffect !== undefined && durableCausalEffect !== undefined
          && stableJson(declaredCausalEffect) !== stableJson(durableCausalEffect)) {
          violations.push(violation(
            'next_operation',
            'causal_effect_owner_conflict',
            `causal_effect_owner_conflict: logical owner ${logicalHypothesisId} has a durable causal-effect relation; replan/create the effect owner rather than changing its cause in-place`
          ));
        }
        for (const field of ['physical_role', 'opacity_role'] as const) {
          const declared = text(logicalLayer[field])?.toLowerCase();
          const durable = text(existingOwner[field])?.toLowerCase();
          if (!declared && durable) {
            logicalLayer[field] = durable;
          } else if (declared && durable && declared !== durable) {
            violations.push(violation(
              'next_operation',
              'physical_stack_owner_conflict',
              `physical_stack_owner_conflict: logical owner ${logicalHypothesisId} is durably ${field}=${durable}, not ${declared}; create a new structural owner instead of mutating physical identity in-place`
            ));
          }
        }
        const declaredRelations = Array.isArray(logicalLayer.depth_relations) ? logicalLayer.depth_relations : undefined;
        const durableRelations = Array.isArray(existingOwner.depth_relations) ? existingOwner.depth_relations : [];
        if (declaredRelations === undefined && durableRelations.length) {
          logicalLayer.depth_relations = structuredClone(durableRelations);
        } else if (declaredRelations !== undefined && stableJson(declaredRelations) !== stableJson(durableRelations)) {
          violations.push(violation(
            'next_operation',
            'physical_stack_owner_conflict',
            `physical_stack_owner_conflict: logical owner ${logicalHypothesisId} cannot change durable depth_relations during continuation; create/replan the structural owner explicitly`
          ));
        }
      }
    }
    if (['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '') && existingOwner) {
      violations.push(violation(
        'next_operation',
        'semantic_layer_pollution',
        `semantic_layer_pollution: logical owner ${logicalHypothesisId} already owns layer ${existingOwner.layer_id}; explicitly discard/delete that owner before creating a replacement, or continue the existing owner`
      ));
    }
  }

  const constructionTier = text(logicalLayer?.construction_tier)?.toLowerCase();
  const parentHypothesisId = text(logicalLayer?.parent_hypothesis_id);
  if (constructionTier) {
    const tierRank = constructionTierRank.get(constructionTier);
    if (tierRank === undefined) {
      violations.push(violation('next_operation', 'construction_graph_invalid_tier', `construction_graph_invalid_tier: ${constructionTier} is not primary|secondary|tertiary|surface`));
    } else if (tierRank === 0) {
      if (parentHypothesisId) {
        violations.push(violation('next_operation', 'construction_graph_invalid_parent', 'construction_graph_invalid_parent: primary construction owners must not declare a parent'));
      }
    } else {
      const parentOwner = parentHypothesisId ? ownerByHypothesis.get(parentHypothesisId) : undefined;
      if (!parentHypothesisId || !parentOwner) {
        violations.push(violation(
          'next_operation',
          'construction_graph_parent_missing',
          `construction_graph_parent_missing: ${constructionTier} owner ${logicalHypothesisId ?? 'unknown'} requires an established parent_hypothesis_id; ${parentHypothesisId ?? 'none'} is not durably established`
        ));
      } else if (parentOwner.temporary === true) {
        violations.push(violation(
          'next_operation',
          'construction_graph_parent_unresolved',
          `construction_graph_parent_unresolved: ${constructionTier} owner ${logicalHypothesisId ?? 'unknown'} cannot depend on temporary/unresolved parent ${parentHypothesisId}`
        ));
      } else if (ownerConstructionStale(parentOwner)) {
        violations.push(violation(
          'next_operation',
          'construction_graph_parent_stale',
          `construction_graph_parent_stale: ${constructionTier} owner ${logicalHypothesisId ?? 'unknown'} depends on ${parentHypothesisId}, whose own construction prerequisites are stale; replan the dependent branch before refinement`
        ));
      } else {
        const parentTier = text(parentOwner.construction_tier)?.toLowerCase();
        const parentRank = parentTier ? constructionTierRank.get(parentTier) : undefined;
        if (parentRank === undefined || parentRank >= tierRank) {
          violations.push(violation(
            'next_operation',
            'construction_graph_parent_order',
            `construction_graph_parent_order: ${constructionTier} owner ${logicalHypothesisId ?? 'unknown'} requires a structurally earlier parent; ${parentHypothesisId} is ${parentTier ?? 'unclassified'}`
          ));
        }
        const currentParentRevision = text(parentOwner.construction_revision);
        const boundParentRevision = text(logicalLayer?.parent_construction_revision);
        if (['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '') && currentParentRevision) {
          logicalLayer!.parent_construction_revision = currentParentRevision;
        } else if (currentParentRevision && boundParentRevision !== currentParentRevision) {
          violations.push(violation(
            'next_operation',
            'construction_graph_parent_stale',
            `construction_graph_parent_stale: ${logicalHypothesisId ?? 'unknown'} was bound to parent revision ${boundParentRevision ?? 'missing'}, but ${parentHypothesisId} is now ${currentParentRevision}; replan dependent construction before further refinement`
          ));
        }
      }
    }
  }

  // Geometry debt follows the owner into every later visual stage, not only another
  // structured-mass pass. VALUE/MATERIAL/TEXTURE work cannot silently decorate a
  // structurally stale owner. Supplying a current explicit revalidation above clears it.
  if (logicalHypothesisId && mutationSteps.length > 0 && logicalLayer?.geometry_binding && applicableSceneGeometryModel) {
    try {
      const binding = normalizeGeometryBinding(logicalLayer.geometry_binding);
      const staleness = bindingStalenessAgainstApplicable(binding, logicalHypothesisId);
      if (staleness.stale) {
        violations.push(violation(
          'next_operation',
          'geometry_dependency_stale',
          `geometry_dependency_stale: owner=${logicalHypothesisId} cannot continue visual refinement against scene geometry ${applicableSceneGeometryModel.model_id}@${applicableSceneGeometryModel.revision}; changed dependencies=${staleness.changed_dependency_ids.join(',') || 'unknown/source-revision-unavailable'}; explicitly revalidate or rebuild the complete geometry binding first`
        ));
      }
      // Exact geometry is a durable completion claim, not a one-pass construction hint.
      // Once an owner declares it completion-relevant, every later visual mutation must
      // retain exact-frame measurement/landmark evidence. This keeps VALUE/MATERIAL/TEXTURE
      // continuation from silently dropping the deterministic evidence dependency.
      if (!staleness.stale && binding.exact_geometry_completion_relevant) {
        const exactPreflight = runGeometryPreflight(binding, applicableSceneGeometryModel);
        const exactEvidenceIssues = exactPreflight.issues.filter(issue =>
          issue.code === 'geometry_exact_evidence_required'
          || issue.code === 'geometry_exact_evidence_source_mismatch'
        );
        for (const issue of exactEvidenceIssues) {
          violations.push(violation('next_operation', issue.code, issue.message));
        }
        // Exact geometry remains an executable invariant after the initial SHAPE pass.
        // A later VALUE/MATERIAL/TEXTURE transform or repaint must validate the actual
        // dispatched payload too; otherwise a durable binding could coexist with fresh
        // hand-guessed coordinates. The structured-construction path below may repeat
        // this pure validation in order to attach its preflight provenance.
        if (!exactEvidenceIssues.length) {
          materializeBoundaryDerivedGeometry(
            mutationSteps as Array<Record<string, unknown>>,
            binding,
            applicableSceneGeometryModel,
          );
          const executableGeometry = inspectExecutableGeometry(
            mutationSteps as Array<Record<string, unknown>>,
            binding,
            applicableSceneGeometryModel,
          );
          for (const issue of executableGeometry.issues) {
            violations.push(violation('next_operation', issue.code, issue.message));
          }
        }
      }
    } catch {
      // The dedicated binding validation path reports malformed durable/declared state.
    }
  }

  if (logicalHypothesisId && mutationSteps.length > 0 && logicalLayer?.camera_binding) {
    try {
      const binding = normalizeCameraBinding(logicalLayer.camera_binding);
      logicalLayer.camera_binding = {
        scene_camera_model_id: binding.sceneCameraModelId,
        scene_camera_revision: binding.sceneCameraRevision,
        ...(binding.geometryBindingOwnerId ? { geometry_binding_owner_id: binding.geometryBindingOwnerId } : {}),
        depth_role: binding.depthRole,
        expected_focus_role: binding.expectedFocusRole,
        dependency_domains: binding.dependencyDomains,
        ...(binding.localException ? { local_exception: binding.localException } : {}),
        ...(binding.approximateDepthRationale ? { approximate_depth_rationale: binding.approximateDepthRationale } : {}),
      };
      if (!applicableSceneCameraImagingModel) {
        violations.push(violation(
          'next_operation',
          'scene_camera_imaging_model_required',
          `camera_binding_required_model: owner=${logicalHypothesisId} requires an active durable scene_camera_imaging_model before focus/depth-dependent mutation`
        ));
      } else {
        const sameRevision = binding.sceneCameraModelId === applicableSceneCameraImagingModel.model_id
          && binding.sceneCameraRevision === applicableSceneCameraImagingModel.revision;
        const samePassSuccessor = !!sceneCameraImagingModelToPersist && !!durableSceneCameraImagingModel
          && binding.sceneCameraModelId === durableSceneCameraImagingModel.model_id
          && binding.sceneCameraRevision === durableSceneCameraImagingModel.revision;
        const priorState = cameraBindingStateByOwner.get(logicalHypothesisId);
        const cameraState = sameRevision
          ? { stale: false, changed_dependency_ids: [] as string[] }
          : samePassSuccessor
            ? cameraBindingStaleness(binding, sceneCameraImagingModelToPersist!, durableSceneCameraImagingModel!)
            : {
                stale: priorState?.stale !== false,
                changed_dependency_ids: Array.isArray(priorState?.changed_dependency_ids)
                  ? priorState.changed_dependency_ids.map(value => text(value)).filter((value): value is string => !!value)
                  : [],
              };
        if (cameraState.stale) {
          violations.push(violation(
            'next_operation',
            'camera_binding_stale',
            `camera_binding_stale: owner=${logicalHypothesisId} is bound to ${binding.sceneCameraModelId}@${binding.sceneCameraRevision}; changed dependencies=${cameraState.changed_dependency_ids.join(',') || 'unknown/source-revision-unavailable'}`
          ));
        }
      }
      if (applicableSceneCameraImagingModel && (!applicableSceneGeometryModel
        || applicableSceneCameraImagingModel.geometry_model_id !== applicableSceneGeometryModel.model_id
        || applicableSceneCameraImagingModel.geometry_model_revision !== applicableSceneGeometryModel.revision)) {
        violations.push(violation(
          'next_operation',
          'camera_binding_geometry_stale',
          `camera_binding_geometry_stale: active camera model does not reference the exact current Scene Geometry Model revision`
        ));
      }

      if (binding.geometryBindingOwnerId) {
        if (binding.geometryBindingOwnerId !== logicalHypothesisId) {
          violations.push(violation(
            'next_operation',
            'camera_binding_geometry_owner_mismatch',
            `camera_binding_geometry_owner_mismatch: owner=${logicalHypothesisId} cannot derive depth from geometry owner=${binding.geometryBindingOwnerId}`
          ));
        } else if (!logicalLayer.geometry_binding || !applicableSceneGeometryModel) {
          violations.push(violation(
            'next_operation',
            'camera_binding_geometry_required',
            `camera_binding_geometry_required: owner=${logicalHypothesisId} must carry its accepted E.18 geometry binding when depth_role is geometry-derived`
          ));
        } else {
          const geometryBinding = normalizeGeometryBinding(logicalLayer.geometry_binding);
          const staleness = bindingStalenessAgainstApplicable(geometryBinding, logicalHypothesisId);
          if (staleness.stale) {
            violations.push(violation(
              'next_operation',
              'camera_binding_geometry_stale',
              `camera_binding_geometry_stale: owner=${logicalHypothesisId} cannot derive focus depth from stale geometry; changed dependencies=${staleness.changed_dependency_ids.join(',') || 'unknown'}`
            ));
          }
        }
      }
    } catch (error) {
      violations.push(violation(
        'next_operation',
        'camera_binding_invalid',
        `camera_binding_invalid: owner=${logicalHypothesisId}; ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  // Surface Frame is a local orientation/material-flow view of the owner's scene binding,
  // never an independent perspective model. Explicit scene references make inheritance
  // auditable; the numeric scene/preflight layer remains the sole geometry solver.
  if (logicalHypothesisId && logicalLayer?.surface_frame && logicalLayer?.geometry_binding
      && applicableSceneGeometryModel?.applicability === 'coherent_3d') {
    try {
      const frame = logicalLayer.surface_frame as Record<string, unknown>;
      const binding = normalizeGeometryBinding(logicalLayer.geometry_binding);
      const frameFamilyIds = new Set(
        Array.isArray(frame.scene_vanishing_family_ids)
          ? frame.scene_vanishing_family_ids.map(value => text(value)).filter((value): value is string => !!value)
          : []
      );
      const allowedFamilies = new Set(binding.vanishing_family_ids);
      for (const familyId of frameFamilyIds) {
        if (!allowedFamilies.has(familyId)) {
          violations.push(violation(
            'next_operation', 'surface_frame_geometry_conflict',
            `surface_frame_geometry_conflict: owner=${logicalHypothesisId} surface frame references vanishing family ${familyId}, but its Scene Geometry Binding does not`
          ));
        }
      }
      const frameSupportPlane = text(frame.scene_support_plane_id);
      if (frameSupportPlane && frameSupportPlane !== binding.support_plane_id) {
        violations.push(violation(
          'next_operation', 'surface_frame_geometry_conflict',
          `surface_frame_geometry_conflict: owner=${logicalHypothesisId} surface frame references support plane ${frameSupportPlane}, but its Scene Geometry Binding uses ${binding.support_plane_id ?? 'none'}`
        ));
      }
      // Persist the resolved scene references into the compiled Surface Frame so downstream
      // perspective-regular/mechanical-pattern consumers do not have to rediscover geometry
      // provenance or silently fall back to an independent local perspective assumption.
      if (!frameFamilyIds.size && binding.vanishing_family_ids.length) {
        frame.scene_vanishing_family_ids = [...binding.vanishing_family_ids];
      }
      if (!frameSupportPlane && binding.support_plane_id) {
        frame.scene_support_plane_id = binding.support_plane_id;
      }
      const anchor = frame.convergence_anchor;
      if (anchor && typeof anchor === 'object' && !Array.isArray(anchor)) {
        const point = anchor as Record<string, unknown>;
        const x = Number(point.x); const y = Number(point.y);
        const referencedFamilies = frameFamilyIds.size ? [...frameFamilyIds] : binding.vanishing_family_ids;
        for (const familyId of referencedFamilies) {
          const family = applicableSceneGeometryModel.line_families.find(item => item.id === familyId);
          const vp = family?.vanishing_point_id
            ? applicableSceneGeometryModel.projection.vanishing_points.find(item => item.id === family.vanishing_point_id)
            : undefined;
          if (vp && Math.hypot(x - vp.x, y - vp.y) > 1) {
            violations.push(violation(
              'next_operation', 'surface_frame_geometry_conflict',
              `surface_frame_geometry_conflict: owner=${logicalHypothesisId} convergence_anchor conflicts with scene vanishing point ${vp.id} for family ${familyId}`
            ));
          }
        }
      }
    } catch {
      // Dedicated Surface Frame / Geometry Binding validation reports malformed state.
    }
  }

  // Perspective-regular repetition is itself geometry-sensitive even when the pass is
  // MATERIAL/TEXTURE rather than structured-mass construction. It must consume the owner's
  // current Scene Geometry Binding instead of using Surface Frame as a second perspective model.
  const perspectiveRegularSurface = logicalLayer?.surface_frame
    && typeof logicalLayer.surface_frame === 'object'
    && !Array.isArray(logicalLayer.surface_frame)
    && text((logicalLayer.surface_frame as Record<string, unknown>).distribution)?.toLowerCase() === 'perspective-regular';
  if (logicalHypothesisId && mutationSteps.length > 0 && perspectiveRegularSurface
      && applicableSceneGeometryModel?.applicability === 'coherent_3d') {
    if (!logicalLayer?.geometry_binding) {
      violations.push(violation(
        'next_operation',
        'geometry_binding_required',
        `geometry_binding_required: perspective-regular surface work for owner=${logicalHypothesisId} must consume the current Scene Geometry Binding before Photoshop mutation`
      ));
    } else {
      try {
        const binding = normalizeGeometryBinding(logicalLayer.geometry_binding);
        const staleness = bindingStalenessAgainstApplicable(binding, logicalHypothesisId);
        const bindingIssues = geometryBindingIssues(binding, applicableSceneGeometryModel, logicalHypothesisId, {
          allowOlderUnchangedRevision: !staleness.stale,
        });
        if (staleness.stale && !bindingIssues.some(issue => issue.code === 'geometry_dependency_stale')) {
          bindingIssues.push({
            code: 'geometry_dependency_stale',
            message: `geometry binding for owner=${logicalHypothesisId} is stale against scene geometry ${applicableSceneGeometryModel.model_id}@${applicableSceneGeometryModel.revision}; changed dependencies=${staleness.changed_dependency_ids.join(',') || 'unknown/source-revision-unavailable'}`,
          });
        }
        for (const issue of bindingIssues) {
          violations.push(violation('next_operation', issue.code, `${issue.code}: owner=${logicalHypothesisId}; ${issue.message}`));
        }
        if (!bindingIssues.length) {
          const preflight = runGeometryPreflight(binding, applicableSceneGeometryModel);
          for (const issue of preflight.issues) {
            violations.push(violation('next_operation', issue.code, issue.message));
          }
        }
      } catch (error) {
        violations.push(violation(
          'next_operation',
          'geometry_binding_invalid',
          `geometry_binding_invalid: owner=${logicalHypothesisId}; ${error instanceof Error ? error.message : String(error)}`
        ));
      }
    }
  }

  const negativeSpace = logicalLayer?.negative_space && typeof logicalLayer.negative_space === 'object' && !Array.isArray(logicalLayer.negative_space)
    ? logicalLayer.negative_space as Record<string, unknown>
    : undefined;
  if (negativeSpace) {
    const negativeParentId = text(negativeSpace.parent_hypothesis_id);
    const negativeParent = negativeParentId ? ownerByHypothesis.get(negativeParentId) : undefined;
    if (!negativeParentId || !negativeParent) {
      violations.push(violation('next_operation', 'negative_space_parent_missing', `negative_space_parent_missing: ${logicalHypothesisId ?? 'unknown'} requires an established aperture/negative-space parent owner`));
    } else if (negativeParent.temporary === true) {
      violations.push(violation('next_operation', 'negative_space_parent_unresolved', `negative_space_parent_unresolved: ${logicalHypothesisId ?? 'unknown'} cannot bind aperture topology to temporary parent ${negativeParentId}`));
    } else {
      const currentRevision = text(negativeParent.construction_revision);
      const boundRevision = text(negativeSpace.parent_construction_revision);
      if (['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '') && currentRevision) {
        negativeSpace.parent_construction_revision = currentRevision;
      } else if (currentRevision && boundRevision !== currentRevision) {
        violations.push(violation('next_operation', 'negative_space_parent_stale', `negative_space_parent_stale: ${logicalHypothesisId ?? 'unknown'} aperture topology was bound to parent revision ${boundRevision ?? 'missing'}, but ${negativeParentId} is now ${currentRevision}; review/replan the opening before further paint`));
      }
    }
  }
  if (logicalHypothesisId && ['continue-logical-layer', 'adjust'].includes(logicalDecision ?? '')) {
    const requiredOpenings = owners.filter(owner => {
      const relation = owner.negative_space;
      return relation && typeof relation === 'object' && !Array.isArray(relation)
        && text((relation as Record<string, unknown>).parent_hypothesis_id) === logicalHypothesisId;
    });
    if (requiredOpenings.length) {
      const preserved = new Set(Array.isArray(logicalLayer?.preserve_negative_space_ids)
        ? logicalLayer!.preserve_negative_space_ids.map(value => text(value)).filter(Boolean) as string[]
        : []);
      const missing = requiredOpenings.map(owner => text(owner.hypothesis_id)).filter((id): id is string => !!id && !preserved.has(id));
      if (missing.length) {
        violations.push(violation(
          'next_operation',
          'negative_space_preservation_required',
          `negative_space_preservation_required: repainting/texturing parent ${logicalHypothesisId} requires explicit review/preservation of durable opening owner(s): ${missing.join(', ')}`
        ));
      }
    }
  }

  const causalEffect = logicalLayer?.causal_effect && typeof logicalLayer.causal_effect === 'object' && !Array.isArray(logicalLayer.causal_effect)
    ? logicalLayer.causal_effect as Record<string, unknown>
    : undefined;
  if (causalEffect) {
    const relation = text(causalEffect.relation);
    const sourceId = text(causalEffect.source_hypothesis_id);
    const receiverId = text(causalEffect.receiver_hypothesis_id);
    const source = sourceId ? ownerByHypothesis.get(sourceId) : undefined;
    const receiver = receiverId ? ownerByHypothesis.get(receiverId) : undefined;
    if (!sourceId || !source) {
      violations.push(violation('next_operation', 'causal_effect_source_missing', `causal_effect_source_missing: ${logicalHypothesisId ?? 'unknown'} requires established causal source ${sourceId ?? 'none'}`));
    } else if (source.temporary === true) {
      violations.push(violation('next_operation', 'causal_effect_source_unresolved', `causal_effect_source_unresolved: ${logicalHypothesisId ?? 'unknown'} cannot depend on temporary source ${sourceId}`));
    } else {
      const currentRevision = text(source.construction_revision);
      const boundRevision = text(causalEffect.source_construction_revision);
      if (['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '') && currentRevision) causalEffect.source_construction_revision = currentRevision;
      else if (currentRevision && boundRevision !== currentRevision) {
        violations.push(violation('next_operation', 'causal_effect_source_stale', `causal_effect_source_stale: ${logicalHypothesisId ?? 'unknown'} was caused by source revision ${boundRevision ?? 'missing'}, but ${sourceId} is now ${currentRevision}; review/replan the effect`));
      }
    }
    if (relation !== 'emission_from' && !receiverId) {
      violations.push(violation('next_operation', 'causal_effect_receiver_missing', `causal_effect_receiver_missing: ${relation ?? 'effect'} requires a receiving surface/medium`));
    } else if (receiverId && !receiver) {
      violations.push(violation('next_operation', 'causal_effect_receiver_missing', `causal_effect_receiver_missing: receiving owner ${receiverId} is not durably established`));
    } else if (receiver?.temporary === true) {
      violations.push(violation('next_operation', 'causal_effect_receiver_unresolved', `causal_effect_receiver_unresolved: effect cannot bind to temporary receiver ${receiverId}`));
    } else if (receiver) {
      const currentRevision = text(receiver.construction_revision);
      const boundRevision = text(causalEffect.receiver_construction_revision);
      if (['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '') && currentRevision) causalEffect.receiver_construction_revision = currentRevision;
      else if (currentRevision && boundRevision !== currentRevision) {
        violations.push(violation('next_operation', 'causal_effect_receiver_stale', `causal_effect_receiver_stale: receiving owner ${receiverId} changed structurally; review/replan ${logicalHypothesisId ?? 'effect'}`));
      }
    }
  }

  const physicalRole = text(logicalLayer?.physical_role)?.toLowerCase();
  const opacityRole = text(logicalLayer?.opacity_role)?.toLowerCase();
  const depthRelations = Array.isArray(logicalLayer?.depth_relations)
    ? logicalLayer.depth_relations.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry)) as Array<Record<string, unknown>>
    : [];
  const physicalMetadataRequired = context.painting_profile === 'nontrivial_painting'
    && !!createStep
    && !!logicalLayer;
  if (physicalMetadataRequired && (!physicalRole || !opacityRole)) {
    violations.push(violation(
      'next_operation',
      'physical_stack_metadata_required',
      'physical_stack_metadata_required: every new semantic layer in a nontrivial painting must declare logical_layer.physical_role and opacity_role so opaque structure cannot silently become a transparent/effect layer'
    ));
  }
  if (
    context.painting_profile === 'nontrivial_painting'
    && ['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '')
    && physicalRole
    && physicalSignatureRoles.has(physicalRole)
    && (paintingStageRank(stage) ?? -1) >= 3
  ) {
    violations.push(violation(
      'next_operation',
      'physical_stack_structural_change_requires_shape',
      `physical_stack_structural_change_requires_shape: new ${physicalRole} owner ${logicalHypothesisId ?? 'unknown'} cannot be introduced at ${stage}; return to SHAPE with an explicit structural stage_reset, rebuild occlusion, then re-pass the physical stack gate`
    ));
  }
  for (const relation of depthRelations) {
    const relationKind = text(relation.relation)?.toLowerCase();
    const targetHypothesisId = text(relation.target_hypothesis_id);
    const targetOwner = targetHypothesisId ? ownerByHypothesis.get(targetHypothesisId) : undefined;
    if (!targetHypothesisId || !targetOwner) {
      violations.push(violation(
        'next_operation',
        'physical_stack_target_missing',
        `physical_stack_target_missing: depth relation for ${logicalHypothesisId ?? 'unknown'} references semantic owner ${targetHypothesisId ?? 'missing'} which is not durably established`
      ));
      continue;
    }
    if (['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '') && createStep) {
      const targetLayerId = Number(targetOwner.layer_id);
      const aboveLayerId = Number(createArgs.above_layer_id);
      const belowLayerId = Number(createArgs.below_layer_id);
      if (relationKind === 'in-front-of' && aboveLayerId !== targetLayerId) {
        violations.push(violation(
          'next_operation',
          'physical_stack_layer_order_mismatch',
          `physical_stack_layer_order_mismatch: ${logicalHypothesisId} is declared in-front-of ${targetHypothesisId}; photoshop_create_layer must use above_layer_id=${targetLayerId}`
        ));
      } else if (relationKind === 'behind' && belowLayerId !== targetLayerId) {
        violations.push(violation(
          'next_operation',
          'physical_stack_layer_order_mismatch',
          `physical_stack_layer_order_mismatch: ${logicalHypothesisId} is declared behind ${targetHypothesisId}; photoshop_create_layer must use below_layer_id=${targetLayerId}`
        ));
      }
    }
  }

  if (context.painting_profile === 'nontrivial_painting' && (paintingStageRank(stage) ?? -1) >= 4) {
    const unresolvedTemporaryOwners = owners.filter(owner =>
      owner.temporary === true && text(owner.rollback_value)?.toLowerCase() !== 'low'
    );
    if (unresolvedTemporaryOwners.length) {
      violations.push(violation(
        'next_operation',
        'semantic_layer_stage_gate',
        `semantic_layer_stage_gate: committed ${stage} refinement is blocked while temporary semantic owners remain unresolved: ${unresolvedTemporaryOwners.map(owner => text(owner.hypothesis_id)).filter(Boolean).join(', ')}`
      ));
    }
  }

  let selectedPreset = actions
    .filter(step => text(step.tool) === 'photoshop_select_brush_preset')
    .map(step => step.args && typeof step.args === 'object' && !Array.isArray(step.args)
      ? text((step.args as Record<string, unknown>).name)
      : undefined)
    .filter(Boolean)
    .at(-1);
  const roles = Array.isArray(context.brush_roles) ? context.brush_roles : [];
  const explicitBrushRole = text(raw.brush_role);
  const requestedBrushScale = text(raw.scale)?.toLowerCase();
  const roleMatchesRequestedScale = (role: Record<string, unknown>) => brushRoleMatchesScale(role, requestedBrushScale);
  let constructionRole = text(raw.construction_role);
  let requestedMaterialRole = text(raw.material_role);
  let brushRole: Record<string, unknown> | undefined;
  let paintStrategy: Record<string, unknown> | undefined;

  const art = context.art_director && typeof context.art_director === 'object'
    ? context.art_director as Record<string, unknown>
    : undefined;
  const changeDomains = [...new Set(mutationSteps.map(step => compactChangeDomain(compactStepMethodClass(step, registry))))];
  const plannerDirectiveId = text(art?.directive_id);
  const plannerTaskId = text(art?.current_task_id);
  const plannerTasks = Array.isArray(art?.tasks) ? art.tasks as Array<Record<string, unknown>> : [];
  const activePlannerTask = plannerTaskId
    ? plannerTasks.find(task => text(task.task_id) === plannerTaskId)
    : undefined;
  let perceptualHierarchy;
  if (art?.perceptual_hierarchy && typeof art.perceptual_hierarchy === 'object') {
    try { perceptualHierarchy = normalizePerceptualHierarchy(art.perceptual_hierarchy); }
    catch (error) {
      violations.push(violation('next_operation', 'perceptual_hierarchy_state_invalid', error instanceof Error ? error.message : String(error)));
    }
  }
  const attentionBindingStateByOwner = new Map(
    (Array.isArray(context.attention_binding_states) ? context.attention_binding_states : [])
      .map(state => [text(state?.owner_id), state] as const)
      .filter(([ownerId]) => !!ownerId)
  );
  const affectedQualities = Array.isArray(raw.affected_qualities)
    ? raw.affected_qualities.map(value => text(value)?.toLowerCase()).filter((value): value is string => !!value)
    : [];
  const attentionSensitive = mutationSteps.length > 0 && (
    changeDomains.some(domain => ['local-tone', 'local-edge', 'local-texture', 'lighting-structure'].includes(domain))
    || affectedQualities.some(value => /(contrast|detail|edge|chroma|saturation|accent)/.test(value))
  );
  if (perceptualHierarchy && attentionSensitive && logicalHypothesisId) {
    const taskZones = Array.isArray(activePlannerTask?.perceptual_zone_ids)
      ? activePlannerTask!.perceptual_zone_ids.map(value => text(value)).filter((value): value is string => !!value) : [];
    const prepared = prepareAttentionBinding(logicalLayer?.attention_binding, perceptualHierarchy,
      logicalHypothesisId, taskZones, changeDomains, affectedQualities);
    const shapeErrors = collectSchemaErrors(prepared, ATTENTION_BINDING_SCHEMA, 'next_pass.logical_layer.attention_binding');
    const rawBinding = prepared && typeof prepared === 'object' ? prepared as Record<string, unknown> : {};
    const zoneId = text(rawBinding.zone_id);
    const ownerZones = perceptualHierarchy.zones.filter(zone => zone.owner_ids.includes(logicalHypothesisId));
    const requestedZones = zoneId ? [zoneId] : ownerZones.map(zone => zone.id);
    const correction = `owner=${logicalHypothesisId}; hierarchy_revision=${perceptualHierarchy.revision}; owner_zones=${ownerZones.map(zone => zone.id).join('|') || 'none'}; task=${plannerTaskId ?? 'unknown'}; authorized_zones=${taskZones.join('|') || 'none'}; dimensions=contrast|detail|edge|chroma (only actual pass effects)`;
    for (const message of shapeErrors) violations.push(violation('next_operation', 'attention_binding_invalid', `${message}; ${correction}`));
    if (zoneId && !ownerZones.some(zone => zone.id === zoneId)) {
      violations.push(violation('next_operation', 'attention_binding_zone_owner_mismatch', `owner is not allocated to zone=${zoneId}; ${correction}`));
    }
    if (!requestedZones.length || requestedZones.some(zone => !taskZones.includes(zone))) {
      violations.push(violation('next_operation', 'attention_binding_task_zone_not_authorized', `active Painter task does not authorize the requested owner zone; ${correction}`));
    }
    if (!shapeErrors.length) {
      try {
        const binding = normalizeAttentionBinding(prepared);
        if (logicalLayer) logicalLayer.attention_binding = {
          hierarchy_revision: binding.hierarchyRevision, zone_id: binding.zoneId, dimensions: binding.dimensions,
        };
        if (binding.hierarchyRevision !== perceptualHierarchy.revision
          && attentionBindingStateByOwner.get(logicalHypothesisId)?.stale !== false) {
          violations.push(violation('next_operation', 'attention_binding_stale', `binding hierarchy revision is stale; ${correction}`));
        }
      } catch (error) {
        violations.push(violation('next_operation', 'attention_binding_invalid', `${error instanceof Error ? error.message : String(error)}; ${correction}`));
      }
    }
  }
  const painterScope = scale === 'medium' ? 'medium' : 'local';
  let visualIntent = text(raw.visual_intent);
  let impactClass = text(raw.impact_class);
  const broadNontrivialRegionAdd = context.painting_profile === 'nontrivial_painting'
    && methodClass === 'region'
    && actionClass === 'ADD'
    && ['global', 'medium'].includes((scale ?? '').toLowerCase());
  // E.7c: construction role is compiler metadata when the executable method
  // already makes the semantic construction unambiguous. Do not require the
  // model to restate what a dedicated continuous-field primitive proves.
  const constructionRoleDerivedFromExecution = !constructionRole
      && methodClass === 'gradient'
      && mutationSteps.length > 0
      && mutationSteps.every(step => text(step.tool) === 'photoshop_paint_color_gradient');
  if (constructionRoleDerivedFromExecution) {
    constructionRole = 'continuous-field';
    normalizations.push({
      code: 'construction_role_normalized',
      message: 'Derived construction_role=continuous-field from the dedicated color-gradient execution primitive.',
    });
  }
  const committedStructuredConstruction = context.painting_profile === 'nontrivial_painting'
    && constructionRole === 'structured-mass'
    && mutationSteps.length > 0
    && actionClass !== 'ROLLBACK'
    && plannedLogicalDecision !== 'temporary-hypothesis';
  // A constant initial coat authors no perspective or object geometry. Infer
  // this from the executable fill and its newly created target, never the goal
  // prose. Selection/target safety and exact-image review remain unchanged.
  const initialLayerTone = context.has_visual_frame !== true
    && actionClass === 'ADD'
    && !!createStep
    && plannedLogicalDecision === 'create-new'
    && !constructionRole
    && !constructionTier
    && logicalLayer?.construction_change !== true
    && !logicalLayer?.surface_frame
    && !logicalLayer?.geometry_binding
    && !logicalLayer?.parent_hypothesis_id
    && (!Array.isArray(logicalLayer?.depth_relations) || logicalLayer.depth_relations.length === 0)
    && mutationSteps.length === 1
    && text(mutationSteps[0]?.tool) === 'photoshop_fill_layer'
    && text((mutationSteps[0]?.args as Record<string, unknown> | undefined)?.layer_id)
      === `$steps.${text(createStep.id)}.details.layerId`;
  if (initialLayerTone) {
    normalizations.push({
      code: 'initial_layer_tone_geometry_deferred',
      message: 'A uniform initial fill on its new layer needs no scene geometry; no spatial construction or artistic completion is certified.',
    });
  }
  const committedSpatialOwnerConstruction = context.painting_profile === 'nontrivial_painting'
    && !initialLayerTone
    && mutationSteps.length > 0
    && actionClass !== 'ROLLBACK'
    && !!plannedLogicalDecision
    && plannedLogicalDecision !== 'temporary-hypothesis'
    && !!logicalHypothesisId
    && (
      plannedLogicalDecision === 'create-new'
        ? (
            physicalSignatureRoles.has(physicalRole ?? '')
            || !!constructionTier
            || logicalLayer?.construction_change === true
            || perspectiveRegularSurface
          )
        : logicalLayer?.construction_change === true
    );
  const sceneGeometryRequired = committedStructuredConstruction || committedSpatialOwnerConstruction;
  let geometryPreflight: GeometryPreflightReport | undefined;
  if (sceneGeometryRequired && !applicableSceneGeometryModel) {
    violations.push(violation(
      'next_operation',
      'scene_geometry_model_required',
      'scene_geometry_model_required: committed early semantic/spatial construction requires one durable document-incarnation-bound scene_geometry_model before Photoshop mutation; classify the scene as coherent_3d or record an explicit orthographic/flat/non-Euclidean opt-out instead of constructing from independent visual guesses'
    ));
  } else if (sceneGeometryRequired
      && applicableSceneGeometryModel?.applicability === 'insufficient_evidence') {
    violations.push(violation(
      'next_operation',
      'scene_geometry_model_required',
      'scene_geometry_model_required: applicability=insufficient_evidence may defer exploratory planning but cannot authorize committed structured construction; establish coherent_3d geometry or an explicit brief/style-backed opt-out before mutation'
    ));
  }
  if (sceneGeometryRequired && applicableSceneGeometryModel) {
    const styleContract = art?.style_contract && typeof art.style_contract === 'object' && !Array.isArray(art.style_contract)
      ? art.style_contract as Record<string, unknown>
      : undefined;
    const optOutAuthorityIssue = geometryOptOutAuthorityIssue(applicableSceneGeometryModel, styleContract);
    if (optOutAuthorityIssue) {
      violations.push(violation(
        'next_operation',
        'scene_geometry_opt_out_unauthorized',
        `scene_geometry_opt_out_unauthorized: ${optOutAuthorityIssue}`
      ));
    }
  }
  if (sceneGeometryRequired && applicableSceneGeometryModel?.applicability === 'coherent_3d') {
    const projectionKind = applicableSceneGeometryModel.projection.kind;
    const requiredVanishingPoints = projectionKind === 'one_point' ? 1
      : projectionKind === 'two_point' ? 2
        : projectionKind === 'three_point' ? 3 : 0;
    if (requiredVanishingPoints > 0) {
      const finiteVanishingPoints = applicableSceneGeometryModel.projection.vanishing_points.length;
      const coveredVanishingPoints = new Set(
        applicableSceneGeometryModel.line_families
          .map(family => family.vanishing_point_id)
          .filter((value): value is string => !!value)
      );
      if (
        finiteVanishingPoints < requiredVanishingPoints
        || coveredVanishingPoints.size < requiredVanishingPoints
      ) {
        violations.push(violation(
          'next_operation',
          'perspective_basis_required',
          `perspective_basis_required: projection.kind=${projectionKind} requires at least ${requiredVanishingPoints} explicit vanishing point(s) covered by distinct line families before committed construction; got vanishing_points=${finiteVanishingPoints}, covered_vanishing_points=${coveredVanishingPoints.size}`
        ));
      }
    }
  }
  if (sceneGeometryRequired
      && applicableSceneGeometryModel?.applicability === 'coherent_3d'
      && logicalHypothesisId) {
    if (!logicalLayer?.geometry_binding) {
      violations.push(violation(
        'next_operation',
        'geometry_binding_required',
        `geometry_binding_required: committed coherent-3D structured owner ${logicalHypothesisId} must bind to scene geometry ${applicableSceneGeometryModel.model_id}@${applicableSceneGeometryModel.revision} before Photoshop mutation`
      ));
    } else {
      try {
        const binding = normalizeGeometryBinding(logicalLayer.geometry_binding);
        logicalLayer.geometry_binding = binding;
        const perspectiveProjection = ['one_point', 'two_point', 'three_point'].includes(
          applicableSceneGeometryModel.projection.kind
        );
        if (perspectiveProjection && binding.vanishing_family_ids.length === 0) {
          violations.push(violation(
            'next_operation',
            'perspective_binding_required',
            `perspective_binding_required: owner=${logicalHypothesisId} must bind at least one accepted vanishing family before committed perspective construction`
          ));
        }
        const staleness = bindingStalenessAgainstApplicable(binding, logicalHypothesisId);
        const bindingIssues = geometryBindingIssues(binding, applicableSceneGeometryModel, logicalHypothesisId, {
          allowOlderUnchangedRevision: !staleness.stale,
        });
        if (staleness.stale && !bindingIssues.some(issue => issue.code === 'geometry_dependency_stale')) {
          bindingIssues.push({
            code: 'geometry_dependency_stale',
            message: `geometry binding for owner=${logicalHypothesisId} is stale against scene geometry ${applicableSceneGeometryModel.model_id}@${applicableSceneGeometryModel.revision}; changed dependencies=${staleness.changed_dependency_ids.join(',') || 'unknown/source-revision-unavailable'}`,
          });
        }
        for (const issue of bindingIssues) {
          violations.push(violation('next_operation', issue.code, `${issue.code}: owner=${logicalHypothesisId}; ${issue.message}`));
        }
        if (!bindingIssues.length) {
          const preflight = runGeometryPreflight(binding, applicableSceneGeometryModel);
          geometryPreflight = preflight.report;
          for (const issue of preflight.issues) {
            violations.push(violation('next_operation', issue.code, issue.message));
          }
          if (!preflight.issues.length) {
            const derivedGeometry = materializeBoundaryDerivedGeometry(
              mutationSteps as Array<Record<string, unknown>>,
              binding,
              applicableSceneGeometryModel,
            );
            const executableGeometry = inspectExecutableGeometry(
              mutationSteps as Array<Record<string, unknown>>,
              binding,
              applicableSceneGeometryModel,
            );
            for (const issue of executableGeometry.issues) {
              violations.push(violation('next_operation', issue.code, issue.message));
            }
            if (derivedGeometry || executableGeometry.provenance) {
              geometryPreflight.executable_geometry = derivedGeometry ?? executableGeometry.provenance;
            }
          }
        }
      } catch (error) {
        violations.push(violation(
          'next_operation',
          'geometry_binding_invalid',
          `geometry_binding_invalid: owner=${logicalHypothesisId}; ${error instanceof Error ? error.message : String(error)}`
        ));
      }
    }
  }
  if (broadNontrivialRegionAdd && !constructionRole) {
    violations.push(violation(
      'next_operation',
      'broad_region_construction_role_required',
      'broad nontrivial region ADD work must declare construction_role before choosing photoshop_paint_regions; use structured-mass for genuine form-bearing closed mass or the applicable continuous/soft/environmental role'
    ));
  }
  if (broadNontrivialRegionAdd && constructionRole && !requestedMaterialRole) {
    violations.push(violation(
      'next_operation',
      'construction_role_material_role_required',
      `construction_role=${constructionRole} requires next_pass.material_role so the semantic construction is fixed before mechanism selection`
    ));
  }
  // Vertex count cannot distinguish legitimate planar construction from a flat
  // pictogram. Geometry validity stays executable; form quality belongs to the
  // ordinary exact-frame review, not a fifth-point preflight workaround.
  // E.7c: construction_plan is durable artistic guidance, not an execution
  // certificate. Broad structured work still goes through the executable
  // construction-role/material/method checks above and the geometry contracts
  // below, but missing narrative representation/features/exit-condition prose
  // must not veto an otherwise safe mutation.

  let rolePreferredMethodId: string | undefined;
  const canNormalizeConstructionMetadata = constructionRoleDerivedFromExecution
    && !['REPLACE', 'ERASE', 'ROLLBACK'].includes(actionClass);
  if (constructionRole) {
    try {
      const roleImpactClass = (impactClass ?? 'construct') as PaintingImpactClass;
      const roleSelection = selectPaintingConstructionMethod(
        registry,
        constructionRole as PaintingConstructionRole,
        roleImpactClass,
        Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
        {
          stage,
          preferredMethodId: canNormalizeConstructionMetadata ? undefined : text(raw.preferred_method_id),
          executionTools: [...new Set(mutationSteps.map(step => text(step.tool)).filter(Boolean))] as string[],
          styleTraitEvidence: art?.style_contract ? projectStyleMethodTraitEvidence(art.style_contract as OpenStyleContract, {
            stage: stage ?? '', methodClass,
            changeDomains: Array.isArray(raw.change_domains) ? raw.change_domains.map(text).filter(Boolean) as string[] : [],
          }) : undefined,
        },
      );
      if (visualIntent && visualIntent !== roleSelection.visualIntent) {
        if (canNormalizeConstructionMetadata) {
          normalizations.push({
            code: 'artistic_classification_derived_from_execution',
            message: `Derived visual_intent=${roleSelection.visualIntent} from executable construction_role=${constructionRole}; Photoshop actions are unchanged.`,
          });
          visualIntent = roleSelection.visualIntent;
        } else {
          violations.push(violation(
            'next_operation',
            'construction_role_intent_mismatch',
            `construction_role=${constructionRole} resolves to visual_intent=${roleSelection.visualIntent}, not ${visualIntent}`
          ));
        }
      }
      visualIntent ??= roleSelection.visualIntent;
      impactClass ??= roleImpactClass;
      rolePreferredMethodId = roleSelection.selected.id;
      const explicitPreferredMethodId = text(raw.preferred_method_id);
      if (explicitPreferredMethodId && explicitPreferredMethodId !== rolePreferredMethodId) {
        if (canNormalizeConstructionMetadata) {
          normalizations.push({
            code: 'artistic_method_derived_from_execution',
            message: `Replaced descriptive method ${explicitPreferredMethodId} with executable ${rolePreferredMethodId}; Photoshop actions are unchanged.`,
          });
        } else {
          violations.push(violation(
            'next_operation',
            'construction_role_method_mismatch',
            `construction_role=${constructionRole} selects method ${rolePreferredMethodId} before primitive choice; preferred_method_id=${explicitPreferredMethodId} would bypass that routing`
          ));
        }
      }
    } catch (error) {
      violations.push(violation(
        'next_operation',
        'construction_role_method_unavailable',
        error instanceof Error ? error.message : String(error)
      ));
    }
  }
  const preferredMethodId = rolePreferredMethodId ?? text(raw.preferred_method_id);
  if (visualIntent || impactClass || preferredMethodId || (Array.isArray(raw.avoid_method_ids) && raw.avoid_method_ids.length)) {
    const inferred = constructionRole ? null : inferUniqueClassification({
      registry, actionClass,
      executionTools: [...new Set(mutationSteps.map(step => text(step.tool)).filter(Boolean))] as string[],
      visualIntent, impactClass, preferredMethodId,
      avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
    });
    if (inferred) {
      visualIntent ??= inferred.visualIntent;
      impactClass ??= inferred.impactClass;
      normalizations.push({ code: 'artistic_classification_normalized', message: inferred.reason });
    }
    if (!visualIntent || !impactClass) {
      violations.push(...validatePartialClassification({ registry,
        executionTools: [...new Set(mutationSteps.map(step => text(step.tool)).filter(Boolean))] as string[],
        visualIntent, impactClass, preferredMethodId,
        avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
      }));
    } else {
      let plan: ReturnType<typeof compileArtisticOperation> | undefined;
      try {
        plan = compileArtisticOperation(registry, {
          visualIntent: visualIntent as never,
          impactClass: impactClass as never,
          stage,
          preferredMethodId,
          avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
          documentId: Number(documentId),
          runtimeRevision: UXP_BRIDGE_REVISION,
        });
      } catch (error) {
        violations.push(violation(
          'next_operation',
          'artistic_method_unavailable',
          error instanceof Error ? error.message : String(error)
        ));
      }
      if (plan) {
        const executedMutationTools = [...new Set(mutationSteps.map(step => text(step.tool)).filter(Boolean))] as string[];
        const declaredExecutionTools = plan.allowedExecutionTools;
        if (!constructionRole
          && !['REPLACE', 'ERASE', 'ROLLBACK'].includes(actionClass)
          && executedMutationTools.some(tool => !declaredExecutionTools.includes(tool))) {
          plan = deriveExecutableMethod(
            registry, plan, executedMutationTools,
            Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
            normalizations,
          ) ?? plan;
        }
        const allowedExecutionTools = plan.allowedExecutionTools;
        const drift = executedMutationTools.filter(tool => !allowedExecutionTools.includes(tool));
        if (drift.length) {
          violations.push(violation(
            'next_operation',
            'artistic_method_execution_mismatch',
            `declared method ${plan.method.id} allows ${plan.allowedExecutionTools.join('|')} but compact pass executes ${drift.join('|')}`
          ));
        }
        // The compact artistic contract is validated here, but it is not forwarded
        // as an `artistic_operation` field. VisualMicroPlan's public schema carries
        // the executable contract through method_class / paint_strategy / step
        // method_id and rejects unknown root fields fail-closed.
      }
    }
  }

  if (methodClass === 'paint' || methodClass === 'preset-brush') {
    const rankedStage = paintingStageRank(stage);
    const materialFitnessRequired = rankedStage !== undefined && rankedStage >= 4 && roles.length > 0;
    // E.7c: material role is compiler-owned when the durable brush preflight makes
    // it unambiguous. Filter by the already-resolved visual intent (and an explicit
    // brush role, when supplied), then derive only when every compatible role names
    // the same single material. Ambiguous inventories remain fail-closed below.
    if (materialFitnessRequired && !requestedMaterialRole) {
      const compatibleRoles = roles.filter(role => {
        const roleId = text(role.role_id);
        const intents = Array.isArray(role.visual_intents)
          ? role.visual_intents.map(value => text(value)?.toLowerCase()).filter(Boolean)
          : [];
        return (!explicitBrushRole || roleId === explicitBrushRole)
          && roleMatchesRequestedScale(role)
          && (!visualIntent || intents.includes(visualIntent.toLowerCase()));
      });
      const compatibleMaterials = [...new Set(compatibleRoles.flatMap(role =>
        Array.isArray(role.material_roles) ? role.material_roles.map(text).filter(Boolean) as string[] : []
      ))];
      const everyCompatibleRoleIsSingleMaterial = compatibleRoles.length > 0
        && compatibleRoles.every(role => {
          const materials = Array.isArray(role.material_roles)
            ? [...new Set(role.material_roles.map(text).filter(Boolean))]
            : [];
          return materials.length === 1 && materials[0] === compatibleMaterials[0];
        });
      if (compatibleMaterials.length === 1 && everyCompatibleRoleIsSingleMaterial) {
        requestedMaterialRole = compatibleMaterials[0];
        normalizations.push({
          code: 'material_role_normalized',
          message: `Derived material_role=${requestedMaterialRole} from the unambiguous durable brush preflight.`,
        });
      }
    }
    if (materialFitnessRequired && !requestedMaterialRole) {
      violations.push(violation(
        'next_operation',
        'brush_material_role_required',
        `substantial ${stage} brush work requires next_pass.material_role so Guard can match the installed/preflighted brush inventory to the requested material instead of choosing a generic first role`
      ));
    }
    if (materialFitnessRequired && context.brush_inventory_scope === 'filtered') {
      violations.push(violation(
        'next_operation',
        'brush_inventory_scope_insufficient',
        'substantial form/material/detail brush work requires a full installed-inventory or evidence-bound brush-pack preflight; a filtered familiar-preset lookup is insufficient'
      ));
    }

    const candidates = roles.filter(role => {
      const materials = Array.isArray(role.material_roles) ? role.material_roles.map(text).filter(Boolean) : [];
      const intents = Array.isArray(role.visual_intents) ? role.visual_intents.map(value => text(value)?.toLowerCase()).filter(Boolean) : [];
      return (!requestedMaterialRole || materials.includes(requestedMaterialRole))
        && roleMatchesRequestedScale(role)
        && (!visualIntent || intents.includes(visualIntent.toLowerCase()));
    });
    if (explicitBrushRole) {
      brushRole = candidates.find(role => text(role.role_id) === explicitBrushRole);
      if (!brushRole) {
        violations.push(violation(
          'next_operation',
          'brush_role_material_fitness_mismatch',
          `brush_role=${explicitBrushRole} does not match material_role=${requestedMaterialRole ?? 'unspecified'}, visual_intent=${visualIntent ?? 'unspecified'}, and scale=${requestedBrushScale ?? 'unspecified'} in the durable brush_preflight`
        ));
      }
    } else if (candidates.length === 1) {
      brushRole = candidates[0];
    } else if (materialFitnessRequired && candidates.length > 1) {
      violations.push(violation(
        'next_operation',
        'brush_role_ambiguous',
        `multiple preflighted brush roles fit material_role=${requestedMaterialRole} and visual_intent=${visualIntent ?? 'unspecified'}; specify next_pass.brush_role explicitly`
      ));
    } else if (materialFitnessRequired && candidates.length === 0) {
      violations.push(violation(
        'next_operation',
        'brush_role_no_material_fit',
        `no preflighted brush role fits material_role=${requestedMaterialRole ?? 'missing'} and visual_intent=${visualIntent ?? 'missing'}`
      ));
    } else {
      brushRole = candidates[0] ?? roles[0];
    }

    if (brushRole && materialFitnessRequired && ['MATERIAL', 'DETAIL', 'MICRO_DETAIL'].includes(String(stage))) {
      const probeStatus = text(brushRole.probe_status)?.toLowerCase();
      if (!['pass', 'cached'].includes(probeStatus ?? '')) {
        violations.push(violation(
          'next_operation',
          'brush_role_probe_required',
          `brush_role=${text(brushRole.role_id)} must have probe_status=pass|cached for substantial ${stage} material/finish work`
        ));
      }
    }

    if (brushRole) {
      const acceptedPresets = new Set([
        text(brushRole.preferred_preset),
        ...(Array.isArray(brushRole.alternative_presets) ? brushRole.alternative_presets.map(text) : []),
      ].filter(Boolean));
      const candidateEvidence = Array.isArray(brushRole.candidate_evidence)
        ? brushRole.candidate_evidence.find(candidate => text(candidate?.preset_name) === selectedPreset)
        : undefined;
      const viablePresetCount = acceptedPresets.size;
      if (materialFitnessRequired && viablePresetCount > 1 && !selectedPreset) {
        violations.push(violation(
          'next_operation',
          'brush_preset_choice_required',
          `brush_role=${text(brushRole.role_id)} has ${viablePresetCount} preflighted presets for material_role=${requestedMaterialRole ?? 'unspecified'}; explicitly select the evidence-fit preset instead of silently reusing preferred_preset=${text(brushRole.preferred_preset) ?? 'missing'}`
        ));
      }
      const presetChoiceReason = text(raw.brush_preset_choice_reason);
      if (selectedPreset && !acceptedPresets.has(selectedPreset)) {
        violations.push(violation(
          'next_operation',
          'brush_preset_not_fit_for_role',
          `selected preset ${selectedPreset} is not bound to brush_role=${text(brushRole.role_id)}`
        ));
      }
      const recentProblemBrush = Array.isArray(context.recent_brush_problem_usage)
        ? context.recent_brush_problem_usage.find(row => text(row.problem_id) === problemId)
        : undefined;
      const lastProblemPreset = text(recentProblemBrush?.preset_name);
      const lastProblemOutcome = text(recentProblemBrush?.outcome);
      const retryReason = text(raw.brush_retry_reason);
      const recentSameMaterialFailure = Array.isArray(context.recent_brush_usage)
        ? [...context.recent_brush_usage].reverse().find(row =>
            text(row.preset_name) === selectedPreset
            && text(row.material_role) === requestedMaterialRole
            && text(row.problem_id) !== problemId
            && ['failed', 'rolled-back', 'rollback-required'].includes(text(row.outcome) ?? ''))
        : undefined;
      // E.7c: explicit preset identity remains executable input, but prose explaining the
      // choice/retry is guidance only. Observed failed usage remains durable context for the
      // next artistic decision; it is not a standalone mutation-admission certificate.
      void lastProblemPreset;
      void lastProblemOutcome;
      void retryReason;
      void recentSameMaterialFailure;
      // A single-candidate role is deterministic. When several preflighted marks fit substantial
      // material work, do not collapse the portfolio back to the first/preferred preset merely
      // because the caller omitted a choice; the violation above forces an evidence-fit decision.
      if (viablePresetCount <= 1 || !materialFitnessRequired) {
        selectedPreset ??= text(brushRole.preferred_preset);
      }
      if (selectedPreset && !actions.some(step => text(step.tool) === 'photoshop_select_brush_preset')) {
        const ids = new Set(actions.map(step => text(step.id)).filter(Boolean));
        let selectId = 'guard_select_brush';
        while (ids.has(selectId)) selectId += '_';
        actions.unshift({
          id: selectId,
          tool: 'photoshop_select_brush_preset',
          args: { name: selectedPreset },
          description: 'Guard-selected material-fit preflighted brush role for this compact pass.',
        });
      }
      paintStrategy = {
        ...(constructionRole ? { construction_role: constructionRole } : {}),
        material_role: requestedMaterialRole
          ?? (Array.isArray(brushRole.material_roles) ? text(brushRole.material_roles[0]) : undefined),
        visual_intent: visualIntent
          ?? (Array.isArray(brushRole.visual_intents) ? text(brushRole.visual_intents[0]) : undefined),
        brush_role: text(brushRole.role_id),
        ...(selectedPreset ? { preset_name: selectedPreset } : {}),
        ...(presetChoiceReason ? { selection_reason: presetChoiceReason } : {}),
        // Pressure/dynamics are properties of the selected mark, not merely of the role's
        // preferred preset. Preserve the selected candidate's probed policy so VisualMicroPlan
        // validation can require the corresponding executable stroke dynamics.
        pressure_policy: text(candidateEvidence?.pressure_policy) ?? text(brushRole.pressure_policy),
      };
    }
  }

  if (methodClass === 'gradient' && visualIntent === 'continuous-field' && constructionRole) {
    paintStrategy = {
      construction_role: constructionRole,
      material_role: text(raw.material_role),
      visual_intent: visualIntent,
      pressure_policy: 'none',
    };
  }

  if (constructionRole && !paintStrategy && visualIntent && requestedMaterialRole) {
    paintStrategy = {
      construction_role: constructionRole,
      material_role: requestedMaterialRole,
      visual_intent: visualIntent,
      pressure_policy: 'none',
    };
  }

  const requiresLocalInspection = visualMicroPlanRequiresLocalInspection(
    scale ?? '',
    significanceMode as VisualMicroPlanSignificanceMode
  );
  const visualReviewProfile = existingReviewProfile ?? resolveVisualReviewProfile({
    scale,
    significance_mode: significanceMode,
    action_class: actionClass,
    impact_class: impactClass,
    has_region_bounds: !!regionBounds,
    open_problem_scale: text(context.active_problem_id) === problemId
      ? text(context.active_problem_scale)
      : undefined,
  });
  if (requiresLocalInspection && !regionBounds) {
    violations.push(violation(
      'next_operation',
      'compact_local_region_bounds_required',
      'local/small/subtle visual passes require next_pass.region_bounds so Guard can generate matching BEFORE/AFTER focus previews'
    ));
  }
  if (visualReviewProfile.require_region && !regionBounds && !requiresLocalInspection) {
    violations.push(violation(
      'next_operation',
      'compact_review_region_bounds_required',
      `${visualReviewProfile.level} visual review requires next_pass.region_bounds in source-document pixels; Guard will not invent a crop center`
    ));
  }
  if (regionBounds && visualReviewProfile.require_region) {
    const firstMutationIndex = actions.findIndex(step => VISUAL_MICROPLAN_MUTATION_TOOLS.has(text(step.tool) ?? ''));
    if (firstMutationIndex >= 0) {
      if (visualReviewProfile.require_before_after) {
        actions.splice(firstMutationIndex, 0, {
          id: 'guard_before_preview',
          tool: 'photoshop_get_preview',
          args: {
            max_dimension_px: visualReviewProfile.whole_max_dimension_px,
            quality: 8,
            focus_region: regionBounds,
            focus_max_dimension_px: visualReviewProfile.focus_max_dimension_px ?? 1200,
          },
        });
      }
      actions.push({
        id: 'guard_after_preview',
        tool: 'photoshop_get_preview',
        args: {
          max_dimension_px: visualReviewProfile.whole_max_dimension_px,
          quality: 8,
          focus_region: regionBounds,
          focus_max_dimension_px: visualReviewProfile.focus_max_dimension_px ?? 1200,
        },
      });
    }
  }

  const args: Record<string, unknown> = {
    document_id: documentId,
    stage,
    scale,
    region,
    ...(regionBounds ? { region_bounds: regionBounds } : {}),
    ...(objectContextRegionBounds ? { object_context_region_bounds: objectContextRegionBounds } : {}),
    method_class: methodClass,
    risk,
    expected_visual_delta: goal,
    verification_envelope: visualReviewProfile.require_before_after
      ? { mode: 'before_after', min_focus_dimension_px: 800 }
      : { mode: 'after_only' },
    layer_separation_check: layerSeparationCheck,
    ...(logicalLayer ? { logical_layer: logicalLayer } : {}),
    ...(rawCrossLayerCorrection ? { cross_layer_correction: rawCrossLayerCorrection } : {}),
    action_class: actionClass,
    problem_id: problemId,
    expected_visual_result: goal,
    failure_signals: [],
    significance_mode: significanceMode,
    ...(text(raw.pattern_intent) ? { pattern_intent: text(raw.pattern_intent) } : {}),
    ...(text(raw.distribution_intent) ? { distribution_intent: text(raw.distribution_intent) } : {}),
    ...(raw.edges !== undefined && edgeIntentsValid ? {
      edges: edgeIntents.map(intent => ({
        boundary_id: intent.boundaryId,
        region_a: intent.regionA,
        region_b: intent.regionB,
        class: intent.edgeClass,
        expected_behavior: intent.expectedBehavior,
        ...(intent.preferredMethodId ? { preferred_method_id: intent.preferredMethodId } : {}),
      })),
    } : {}),
    ...(Array.isArray(raw.motif_instances) ? { motif_instances: structuredClone(raw.motif_instances) } : {}),
    ...(Array.isArray(raw.protected_regions) ? { protected_regions: raw.protected_regions } : {}),
    ...(Array.isArray(raw.protected_layer_ids) ? { protected_layer_ids: raw.protected_layer_ids } : {}),
    ...(Array.isArray(raw.replace_protected_layer_ids) ? { replace_protected_layer_ids: raw.replace_protected_layer_ids } : {}),
    ...(paintStrategy ? { paint_strategy: paintStrategy } : {}),
    ...(raw.material_response !== undefined ? { material_response: structuredClone(raw.material_response) } : {}),
    ...(plannerDirectiveId && plannerTaskId ? {
      planner_directive_id: plannerDirectiveId,
      planner_task_id: plannerTaskId,
      painter_scope: painterScope,
      change_domains: changeDomains,
      ...(Array.isArray(raw.affected_relations) ? { affected_relations: raw.affected_relations } : {}),
      ...(Array.isArray(raw.affected_qualities) ? { affected_qualities: raw.affected_qualities } : {}),
      ...(Array.isArray(raw.preservation_facts) ? { preservation_facts: raw.preservation_facts } : {}),
      ...(raw.independent_region === true ? { independent_region: true } : {}),
      ...(raw.addresses_primary_mismatch === true ? { addresses_primary_mismatch: true } : {}),
      ...(text(raw.addresses_problem_id) ? { addresses_problem_id: text(raw.addresses_problem_id) } : {}),
    } : {}),
    steps: actions,
  };

  if (canonicalPaintingStage(stage) === 'MATERIAL' && actionClass !== 'ROLLBACK'
    && raw.material_response !== undefined) {
    try {
      const materialPlan = normalizeMaterialResponsePlan(raw.material_response, {
        physicalRole: text(logicalLayer?.physical_role),
        opacityRole: text(logicalLayer?.opacity_role),
        constructionRole: text(paintStrategy?.construction_role),
      });
      validateMaterialLightingBinding(materialPlan);
    } catch (error: unknown) {
      violations.push(violation(
        'next_operation',
        'material_response_plan_invalid',
        error instanceof Error ? error.message : String(error)
      ));
    }
  }

  return {
    operation: {
      request_key: requestKey,
      goal,
      problem_id: problemId,
      tool: 'photoshop_execute_visual_microplan',
      args,
      ...(stageReset ? { stage_reset: stageReset } : {}),
      significance_mode: significanceMode,
      ...(sceneOwnershipPlanToPersist ? { scene_ownership_plan: sceneOwnershipPlanToPersist } : {}),
      ...(construction ? { object_construction_model: construction.model, construction_provenance: construction.provenance } : {}),
      ...(painterly ? { painterly_provenance: painterly.provenance } : {}),
      ...(sceneGeometryModelToPersist ? { scene_geometry_model: sceneGeometryModelToPersist } : {}),
      ...(sceneLightingColorModelToPersist ? { scene_lighting_color_model: sceneLightingColorModelToPersist } : {}),
      ...(sceneCameraImagingModelToPersist ? { scene_camera_imaging_model: sceneCameraImagingModelToPersist } : {}),
      // Color preflight is Guard evidence; VisualMicroPlan accepts executable fields only.
      ...(colorGradientPreflight ? { color_gradient_preflight: colorGradientPreflight } : {}),
      ...(imagingPreflight ? { imaging_preflight: imagingPreflight } : {}),
      ...(geometryPreflight ? { geometry_preflight: geometryPreflight } : {}),
      ...(correctionScope ? { correction_scope: correctionScope } : {}),
      ...(crossLayerCorrection ? { cross_layer_correction: crossLayerCorrection } : {}),
      ...(text(raw.root_cause_classification) ? { root_cause_classification: text(raw.root_cause_classification) } : {}),
      ...(text(raw.root_cause_reason) ? { root_cause_reason: text(raw.root_cause_reason) } : {}),
      ...(raw.causal_level_change === true ? { causal_level_change: true } : {}),
      ...(text(raw.causal_strategy_id) ? { causal_strategy_id: text(raw.causal_strategy_id) } : {}),
      ...(text(raw.strategy_family) ? { strategy_family: text(raw.strategy_family) } : {}),
      ...(Number.isInteger(raw.causal_escalation_level) ? { causal_escalation_level: raw.causal_escalation_level } : {}),
      visual_review_profile: visualReviewProfile,
      preview_args: {
        max_dimension_px: visualReviewProfile.whole_max_dimension_px,
        quality: 8,
      },
      artistic_commentary: text(raw.artistic_commentary) ?? goal,
      ...(plannerDirectiveId && plannerTaskId ? {
        planner_directive_id: plannerDirectiveId,
        planner_task_id: plannerTaskId,
        painter_scope: painterScope,
        change_domains: changeDomains,
        ...(Array.isArray(raw.affected_relations) ? { affected_relations: raw.affected_relations } : {}),
        ...(Array.isArray(raw.affected_qualities) ? { affected_qualities: raw.affected_qualities } : {}),
        ...(Array.isArray(raw.preservation_facts) ? { preservation_facts: raw.preservation_facts } : {}),
        ...(raw.independent_region === true ? { independent_region: true } : {}),
        ...(raw.addresses_primary_mismatch === true ? { addresses_primary_mismatch: true } : {}),
        ...(text(raw.addresses_problem_id) ? { addresses_problem_id: text(raw.addresses_problem_id) } : {}),
      } : {}),
    },
    violations,
    normalizations,
  };
}

function operationContractViolations(
  operation: Record<string, unknown>
): GuardCycleCompileViolation[] {
  return collectOperationContractViolations(operation).map((item: GuardOperationContractViolation) =>
    violation('next_operation', item.code, item.message)
  );
}

async function compileNextOperation(
  operation: Record<string, unknown>,
  store: GuardCycleCompilerStore,
  registry: ToolRegistry,
  plannedPreviousOperationId?: string,
  plannedPreviousVisualVerdict = false,
  options: GuardCycleCompilerOptions = {}
): Promise<{
  operation: Record<string, unknown>;
  violations: GuardCycleCompileViolation[];
  normalizations: Array<{ code: string; message: string }>;
}> {
  const stateOnly = options.nextOperationValidation === 'state-only';
  const normalized = stateOnly
    ? {
        operation: structuredClone(operation),
        violations: [] as GuardCycleCompileViolation[],
        normalizations: [] as Array<{ code: string; message: string }>,
      }
    : normalizeCompactOperation(operation);
  let compiled = normalized.operation;
  const violations: GuardCycleCompileViolation[] = stateOnly
    ? []
    : [
        ...normalized.violations,
        ...operationContractViolations(compiled),
      ];
  let visualMicroPlanCompiled = stateOnly || compiled.tool !== 'photoshop_execute_visual_microplan';

  if (!stateOnly && compiled.tool === 'photoshop_analyze_value_structure') {
    const documentId = Number((compiled.args as Record<string, unknown> | undefined)?.document_id);
    const context = Number.isSafeInteger(documentId) && documentId > 0
      ? store.compactPassContext?.(documentId, options.projectionContext)
      : undefined;
    if (context?.painting_profile === 'nontrivial_painting' && context.has_visual_frame !== true) {
      violations.push(violation(
        'next_operation',
        'premature_value_analysis',
        'premature_value_analysis: do not spend a structural value-check round on a fresh blank nontrivial canvas; make the first meaningful visual construction pass first, then analyze value at a structural gate'
      ));
    }
  }

  if (!stateOnly) {
    const documentId = Number((compiled.args as Record<string, unknown> | undefined)?.document_id);
    const context = Number.isSafeInteger(documentId) && documentId > 0
      ? store.compactPassContext?.(documentId, options.projectionContext)
      : undefined;
    if (context?.painting_profile === 'nontrivial_painting'
        && context.has_visual_frame !== true
        && guardExecutionClass(String(compiled.tool ?? '')) === 'preparation-only'
        && compiled.tool !== 'photoshop_create_document'
        && compiled.tool !== 'photoshop_open_image'
        // Explicit document activation is target recovery/navigation, not future-stage
        // artistic preparation. A pinned blank document may legitimately stop being
        // active between Guard calls (for example when another workflow creates a
        // document). Blocking activation here makes the required first visual pass
        // unreachable because every following mutation fails closed on document
        // mismatch before it can create visible progress.
        && compiled.tool !== 'photoshop_set_active_document') {
      violations.push(violation(
        'next_operation',
        'premature_future_preparation',
        'premature_future_preparation: fresh blank nontrivial canvases must make first visible progress before standalone future-stage setup; put preparation that is causally required by the immediate first visual pass inside that same visual microplan instead of spending a separate Guard cycle on it'
      ));
    }
  }

  if (!stateOnly && compiled.tool === 'photoshop_execute_visual_microplan') {
    try {
      compiled = {
        ...compiled,
        args: compileVisualMicroPlan((compiled.args ?? {}) as Record<string, unknown>),
        ...(typeof compiled.stage === 'string' && /^block[ _-]?in$/i.test(compiled.stage.trim())
          ? { stage: 'GLOBAL_BLOCK_IN' }
          : {}),
      };
      visualMicroPlanCompiled = true;
    } catch (error) {
      // The compact compiler already emits typed mutation-budget violations with
      // numeric details above. Do not add a prose-only duplicate that would turn
      // an otherwise deterministic split into a model-owned semantic rejection.
      // The bounded prefix is compiled again after splitting, so any independent
      // VisualMicroPlan validation failure remains visible on that validation.
      const hasTypedBudgetViolation = violations.some(item =>
        item.code === 'compact_pass_visual_mutation_limit'
        || item.code === 'compact_pass_adaptive_mutation_budget_exceeded'
      );
      if (!hasTypedBudgetViolation) {
        violations.push(violation(
          'next_operation',
          'invalid_visual_microplan',
          error instanceof Error ? error.message : String(error)
        ));
      }
    }
  }

  for (const message of store.collectPreflightErrors(compiled, {
    plannedPreviousOperationId,
    plannedPreviousVisualVerdict,
    plannedPhysicalStackReview: options.plannedPhysicalStackReview,
    projectionContext: options.projectionContext,
    stateOnly,
    deferCheckpointDebt: true,
    ...(options.compilerDeferredFromOperationId
      ? { compilerDeferredFromOperationId: options.compilerDeferredFromOperationId }
      : {}),
  })) {
    violations.push(violation('next_operation', 'guard_preflight_failed', message));
  }
  if (!stateOnly) {
    for (const message of operationSchemaErrors(compiled, registry)) {
      violations.push(violation('next_operation', 'tool_schema_invalid', message));
    }
  }

  if (!stateOnly && options.collectDynamicOperationViolations) {
    try {
      violations.push(...await options.collectDynamicOperationViolations(compiled));
    } catch (error) {
      violations.push(violation(
        'next_operation',
        'dynamic_preflight_failed',
        error instanceof Error ? error.message : String(error)
      ));
    }
  }

  if (!stateOnly && compiled.tool === 'photoshop_execute_visual_microplan' && visualMicroPlanCompiled) {
    const planRejection = await preflightVisualMicroPlanForExecution(
      (compiled.args ?? {}) as Record<string, unknown>,
      registry,
      options.visualMicroPlanDocumentBounds
    );
    const body = rejectionBody(planRejection);
    if (Array.isArray(body?.errors)) {
      const planCode = typeof body?.code === 'string' ? body.code : 'invalid_visual_microplan';
      for (const message of body.errors.map(String)) {
        violations.push(violation('next_operation', planCode, message));
      }
    }
  }

  return {
    operation: compiled,
    violations: uniqueViolations(violations),
    normalizations: normalized.normalizations,
  };
}

export async function compileGuardCycle(
  input: Record<string, unknown>,
  store: GuardCycleCompilerStore,
  registry: ToolRegistry,
  options: GuardCycleCompilerOptions = {}
): Promise<GuardCycleCompileResult> {
  const intentReceivedAt = new Date().toISOString();
  const compiledInput = structuredClone(input);
  const violations: GuardCycleCompileViolation[] = [];
  const normalizations: Array<{ code: string; message: string }> = [];
  let paintingIntentCompileMs = 0;
  let durableStateInjectionMs = 0;
  let localValidationMs = 0;
  let autoRepairMs = 0;
  let autoRepairCount = 0;
  let autoSplitCount = 0;
  let originalIntentFingerprint: string | undefined;
  let compilerDeferredFromOperationId: string | undefined;
  let compiledAt: string | undefined;
  let validatedAt: string | undefined;
  let repairedAt: string | undefined;
  let repairAudit: GuardCompilerRepairAudit | undefined;
  let geometryRepairs: StructuredRepairOperation[] = [];
  let initialViolationsForAccounting: GuardCycleCompileViolation[] = [];
  const internalStateOnlyRevalidation = options.nextOperationValidation === 'state-only';
  let compactPreviousOperationId = text(compiledInput.previous_operation_id);
  const compactPreviousObservationSupplied = compiledInput.previous_observation !== undefined;
  if (!internalStateOnlyRevalidation) {
    const removedLegacyFields: Array<[string, string]> = [
      ['next_operation', 'next_pass'],
      ['previous_report', 'previous_observation'],
      ['previous_operation_ack', 'previous_operation_id + previous_observation'],
      ['previous_visual_verdict', 'previous_observation'],
      ['previous_report_ack', 'previous_operation_id + previous_observation'],
    ];
    const legacyViolations = removedLegacyFields
      .filter(([field]) => Object.prototype.hasOwnProperty.call(compiledInput, field))
      .map(([field, replacement]) => violation(
        'cycle',
        'legacy_contract_removed',
        `legacy_contract_removed: ${field} is no longer accepted on the public Guard cycle contract; use ${replacement}`
      ));
    if (legacyViolations.length) {
      const unique = uniqueViolations(legacyViolations);
      const cycleFingerprint = fingerprint(compiledInput);
      const rejectionFingerprint = fingerprint({ cycle_fingerprint: cycleFingerprint, violations: unique });
      const errors = unique.map((item) => item.message);
      return {
        input: compiledInput,
        nextOperation: undefined,
        violations: unique,
        normalizations,
        rejection: jsonResult({
          ok: false,
          code: 'legacy_contract_removed',
          execution: 'not-executed',
          terminal: true,
          previous_operation_closed: false,
          next_operation_dispatched: false,
          visual_mutation_started: false,
          cycle_fingerprint: cycleFingerprint,
          rejection_fingerprint: rejectionFingerprint,
          error_codes: ['legacy_contract_removed'],
          violations: unique,
          errors,
          normalizations,
          cycle_errors: errors,
          finalization_errors: [],
          next_operation_errors: [],
          guard_debt: {
            visual_barrier: false,
            preview: false,
            visual_report: false,
            operation_ack: false,
            visual_verdict: false,
            rollback: false,
            reconciliation: false,
          },
          compact_correction_recipe: {
            repeat_same_semantic_cycle: true,
            previous_operation_closed: false,
            photoshop_mutation_started: false,
          },
          next_required_action: 'Remove every legacy cycle field listed above and resubmit one compact cycle using previous_operation_id + previous_observation + optional next_pass.',
          message: errors.join('\n'),
        }, true),
      };
    }
  }
  const nextRequest = compiledInput.next_pass ?? compiledInput.painting_intent;
  if (!internalStateOnlyRevalidation && compiledInput.previous_operation_id === undefined
    && !compactPreviousObservationSupplied && nextRequest && typeof nextRequest === 'object'
    && !Array.isArray(nextRequest)
    && (compiledInput.next_pass !== undefined) !== (compiledInput.painting_intent !== undefined)) {
    const inferred = store.compactPendingNonvisualClosureId?.(options.projectionContext);
    if (inferred) {
      compactPreviousOperationId = inferred;
      compiledInput.previous_operation_id = inferred;
      normalizations.push({ code: 'completed_nonvisual_closure_inherited',
        message: `Inherited exact completed nonvisual operation ${inferred} for internal technical report/receipt closure; no visual observation or artistic completion is implied.` });
    }
  }
  if (compiledInput.previous_observation !== undefined) {
    const previousOperationId = text(compiledInput.previous_operation_id);
    const expanded = compactObservationToVerdict(compiledInput.previous_observation, normalizations);
    if (expanded) compiledInput.previous_visual_verdict ??= expanded;
    delete compiledInput.previous_observation;
    if (previousOperationId && store.compactClosureDefaults) {
      const previousVisualVerdict = compiledInput.previous_visual_verdict
        && typeof compiledInput.previous_visual_verdict === 'object'
        && !Array.isArray(compiledInput.previous_visual_verdict)
        ? compiledInput.previous_visual_verdict as Record<string, unknown>
        : undefined;
      const defaults = store.compactClosureDefaults(previousOperationId, previousVisualVerdict);
      compiledInput.previous_report ??= defaults.previous_report;
      compiledInput.previous_operation_ack ??= defaults.previous_operation_ack;
      compiledInput._compact_closure = true;
    }
  }
  const previousRecord = compactPreviousOperationId ? store.read?.(compactPreviousOperationId) : undefined;
  const completedNonvisual = previousRecord?.visual === false && previousRecord.phase === 'completed'
    && !previousRecord.failed;
  if (completedNonvisual && !compactPreviousObservationSupplied && store.compactClosureDefaults) {
    const defaults = store.compactClosureDefaults(compactPreviousOperationId!);
    compiledInput.previous_report ??= defaults.previous_report;
    compiledInput.previous_operation_ack ??= defaults.previous_operation_ack;
    compiledInput._compact_closure = true;
  }
  if (!internalStateOnlyRevalidation && compactPreviousOperationId && !compactPreviousObservationSupplied && !completedNonvisual) {
    violations.push(violation('finalization', 'previous_observation_required',
      `previous_observation is required to close operation ${compactPreviousOperationId} on the compact Guard contract`));
  } else {
    const closureInput = compiledInput.next_pass !== undefined || compiledInput.painting_intent !== undefined
      ? { ...compiledInput, next_operation: {} } : compiledInput;
    const closureErrors = store.collectClosePreviousErrors(closureInput);
    for (const message of closureErrors) {
      violations.push(violation('finalization', 'previous_operation_finalization_invalid', message));
    }
    if (!closureErrors.length && options.projectionContext && store.projectBoundedUndoClosure) {
      try {
        options = { ...options, projectionContext: store.projectBoundedUndoClosure(compiledInput, options.projectionContext) };
      } catch (error) {
        violations.push(violation('finalization', 'previous_operation_finalization_invalid', String(error instanceof Error ? error.message : error)));
      }
    }
  }
  const rawPaintingIntent = compiledInput.painting_intent;
  if (rawPaintingIntent !== undefined && compiledInput.next_pass !== undefined) {
    violations.push(violation(
      'cycle',
      'competing_next_request_forms',
      'Supply either painting_intent or next_pass, not both. PaintingIntent is the compact artistic input and next_pass is the compatibility contract.'
    ));
    delete compiledInput.painting_intent;
  } else if (rawPaintingIntent !== undefined) {
    const paintingIntentStartedAt = Date.now();
    try {
      const intent = parsePaintingIntent(rawPaintingIntent);
      originalIntentFingerprint = paintingIntentFingerprint(intent);
      compilerDeferredFromOperationId = intent.deferred_from_operation_id;
      const intentCompilation = compilePaintingIntentToNextPass(intent, store, options.projectionContext);
      durableStateInjectionMs = intentCompilation.durable_state_injection_ms;
      compiledInput.next_pass = intentCompilation.next_pass;
      normalizations.push(...intentCompilation.diagnostics.map(item => ({
        code: item.code,
        message: item.message,
      })));
      compiledAt = new Date().toISOString();
    } catch (error) {
      const semantic = error instanceof PaintingIntentError || error instanceof NextPassCompilerError;
      const errors = semantic && Array.isArray(error.details?.errors)
        ? error.details.errors as Array<{ code: string; message: string }> : undefined;
      if (errors) {
        for (const item of errors) violations.push(violation('next_operation', item.code, item.message));
      } else {
        violations.push(violation('next_operation', semantic ? error.code : 'painting_intent_compiler_failure',
          error instanceof Error ? error.message : String(error), semantic ? error.details : undefined));
      }
      if (rawPaintingIntent && typeof rawPaintingIntent === 'object' && !Array.isArray(rawPaintingIntent)) {
        const raw = rawPaintingIntent as Record<string, unknown>;
        violations.push(...collectSuppliedActionViolations(raw.actions, raw.document_id, registry));
      }
    } finally {
      paintingIntentCompileMs = Date.now() - paintingIntentStartedAt;
      delete compiledInput.painting_intent;
    }
  }
  const rawNextPass = compiledInput.next_pass;
  let sourceNextPass: Record<string, unknown> | undefined;
  if (rawNextPass !== undefined && compiledInput.next_operation !== undefined) {
    violations.push(violation(
      'cycle',
      'competing_next_request_forms',
        'Internal compiler invariant violated: next_pass and compiled next_operation cannot coexist'
    ));
  } else if (rawNextPass !== undefined) {
    if (!rawNextPass || typeof rawNextPass !== 'object' || Array.isArray(rawNextPass)) {
      violations.push(violation(
        'cycle',
        'invalid_next_pass',
        'photoshop_guard_cycle_auto next_pass must be an object when supplied'
      ));
    } else {
      sourceNextPass = structuredClone(rawNextPass as Record<string, unknown>);
      const documentId = Number(sourceNextPass.document_id);
      const context = Number.isSafeInteger(documentId) && documentId > 0
        ? store.compactPassContext?.(documentId, options.projectionContext) ?? {} : {};
      // Geometry contract preflight runs before compileCompactPass, where durable
      // owner facts are normally inherited. Carry forward only the exact binding
      // of a unique, non-temporary continuing owner; never invent a spatial
      // choice for a new owner or replace an explicit binding. The downstream
      // compiler still checks scene revision, dependencies and staleness.
      const logical = sourceNextPass.logical_layer && typeof sourceNextPass.logical_layer === 'object'
        && !Array.isArray(sourceNextPass.logical_layer)
        ? sourceNextPass.logical_layer as Record<string, unknown> : undefined;
      if (logical && logical.geometry_binding === undefined
          && ['continue-logical-layer', 'adjust'].includes(text(logical.decision) ?? '')
          && text(logical.hypothesis_id)) {
        const matches = (Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : [])
          .filter(owner => owner.hypothesis_id === logical.hypothesis_id && owner.temporary !== true);
        const durable = matches.length === 1 ? matches[0].geometry_binding : undefined;
        if (durable && typeof durable === 'object' && !Array.isArray(durable)) {
          logical.geometry_binding = structuredClone(durable);
          normalizations.push({
            code: 'geometry_binding_inherited',
            message: `Inherited the existing spatial decisions for durable owner ${String(logical.hypothesis_id)}; current-scene validation still applies.`,
          });
        }
      }
      const geometry = prepareGeometryContract(sourceNextPass, context);
      sourceNextPass = geometry.pass;
      geometryRepairs = geometry.repairs;
      for (const repair of geometryRepairs) normalizations.push({
        code: 'geometry_technical_default', message: `${repair.path}: ${repair.reason}`,
      });
      const compact = geometry.issues.length
        ? { operation: undefined, normalizations: [], violations: geometry.issues.map(issue => violation('next_operation',
            issue.code ?? (issue.decision ? 'geometry_binding_required' : 'geometry_contract_invalid'), issue.message, { ...issue })) }
        : compileCompactPass(sourceNextPass, store, registry, options.projectionContext);
      violations.push(...compact.violations);
      if (compact.normalizations?.length) normalizations.push(...compact.normalizations);
      if (compact.operation) {
        compiledInput.next_operation = compact.operation;
        compiledAt ??= new Date().toISOString();
      }
    }
    delete compiledInput.next_pass;
  }
  let rawNextOperation = compiledInput.next_operation;
  let hasNextOperation = rawNextOperation !== undefined;
  let nextOperation: Record<string, unknown> | undefined;

  if (hasNextOperation && (!rawNextOperation || typeof rawNextOperation !== 'object' || Array.isArray(rawNextOperation))) {
    violations.push(violation(
      'cycle',
      'invalid_next_operation',
      'photoshop_guard_cycle_auto next_operation must be an object when supplied'
    ));
  }
  if (!hasNextOperation && rawPaintingIntent === undefined && sourceNextPass === undefined) {
    const previousOperationId = compiledInput.previous_operation_id;
    if (typeof previousOperationId !== 'string' || !previousOperationId.trim()) {
      violations.push(violation(
        'cycle',
        'missing_cycle_operation',
        'photoshop_guard_cycle_auto requires next_pass or previous_operation_id for close-only finalization'
      ));
    }
  }

  const plannedPreviousOperationId = typeof compiledInput.previous_operation_id === 'string'
    ? compiledInput.previous_operation_id.trim() || undefined
    : undefined;
  const plannedPreviousVisualVerdict = !!compiledInput.previous_visual_verdict;
  const validateNextOperation = async (
    operation: Record<string, unknown>
  ): Promise<Awaited<ReturnType<typeof compileNextOperation>>> => {
    const validationStartedAt = Date.now();
    const result = await compileNextOperation(
      operation,
      store,
      registry,
      plannedPreviousOperationId,
      plannedPreviousVisualVerdict,
      {
        ...options,
        plannedPhysicalStackReview: !!plannedPreviousOperationId
          && plannedPreviousVisualVerdict
          && (compiledInput.previous_visual_verdict as Record<string, unknown>)?.disposition !== 'rollback'
          && ((compiledInput.previous_visual_verdict as Record<string, unknown>)?.physical_stack_check as Record<string, unknown>)?.status === 'pass',
        ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
      }
    );
    localValidationMs += Date.now() - validationStartedAt;
    validatedAt = new Date().toISOString();
    return result;
  };

  if (hasNextOperation && rawNextOperation && typeof rawNextOperation === 'object' && !Array.isArray(rawNextOperation)) {
    const next = await validateNextOperation(rawNextOperation as Record<string, unknown>);
    nextOperation = next.operation;
    if (!sourceNextPass && !internalStateOnlyRevalidation) {
      const args = next.operation?.args as Record<string, unknown> | undefined;
      const documentId = Number(args?.document_id);
      const issue = constructionExecutionIssue({
        logical_layer: args?.logical_layer, scene_ownership_plan: next.operation?.scene_ownership_plan,
        actions: [{ tool: next.operation?.tool, args }],
      }, store.compactPassContext?.(documentId, options.projectionContext) ?? {});
      if (issue) violations.push(violation('next_operation', issue.code, issue.message));
    }
    violations.push(...next.violations);
    normalizations.push(...next.normalizations);
    compiledInput.next_operation = next.operation;
    rawNextOperation = next.operation;
  }

  let initialNextViolations = uniqueViolations(violations.filter(item => item.scope === 'next_operation'));
  const typedBudgetViolationPresent = initialNextViolations.some(item =>
    item.code === 'compact_pass_visual_mutation_limit'
    || item.code === 'compact_pass_adaptive_mutation_budget_exceeded'
  );
  if (typedBudgetViolationPresent) {
    // A downstream VisualMicroPlan validator can report the same budget overflow
    // as generic prose. The typed compact violation is authoritative control data;
    // keep the generic validator message from changing repair classification.
    initialNextViolations = initialNextViolations.filter(item => item.code !== 'invalid_visual_microplan');
    violations.splice(0, violations.length, ...violations.filter(item =>
      item.scope !== 'next_operation' || item.code !== 'invalid_visual_microplan'
    ));
  }
  initialViolationsForAccounting = uniqueViolations(violations);
  if (sourceNextPass && initialNextViolations.length) {
    const classified = classifyViolations(initialNextViolations);
    const hasSemanticOrSystemic = classified.some(item =>
      item.repair_class === 'MODEL_SEMANTIC_DECISION' || item.repair_class === 'SYSTEMIC_FAILURE'
    );
    const repairStartedAt = Date.now();
    const documentId = Number(sourceNextPass.document_id);
    const context = Number.isSafeInteger(documentId) && documentId > 0
      ? store.compactPassContext?.(documentId, options.projectionContext) ?? {}
      : {};
    const deterministic = applyDeterministicPassRepairs(sourceNextPass, initialNextViolations, context);
    let repairCandidate = deterministic.repaired_pass;
    const appliedRepairs = [...deterministic.repairs];
    let deferredNextPass: Record<string, unknown> | undefined;

    if (!hasSemanticOrSystemic) {
      const split = splitPassForBudget(repairCandidate, initialNextViolations);
      if (split) {
        repairCandidate = split.first_pass;
        deferredNextPass = split.deferred_pass;
        appliedRepairs.push(split.repair);
        autoSplitCount = 1;
      }
    }

    if (appliedRepairs.length) {
      const firstViolationFingerprint = fingerprint(initialNextViolations);
      const firstCompiledPayloadFingerprint = fingerprint(nextOperation ?? rawNextOperation ?? sourceNextPass);
      const preservedViolations = violations.filter(item => item.scope !== 'next_operation');
      const repairedCompact = compileCompactPass(repairCandidate, store, registry, options.projectionContext);
      const repairedNextViolations = [...repairedCompact.violations];
      if (repairedCompact.normalizations?.length) normalizations.push(...repairedCompact.normalizations);
      let repairedOperation = repairedCompact.operation;
      if (repairedOperation) {
        const repairedValidation = await validateNextOperation(repairedOperation);
        repairedOperation = repairedValidation.operation;
        repairedNextViolations.push(...repairedValidation.violations);
        normalizations.push(...repairedValidation.normalizations);
      }
      const uniqueRepairedNextViolations = uniqueViolations(repairedNextViolations);
      const finalViolationFingerprint = fingerprint(uniqueRepairedNextViolations);
      const repeatedSameViolation = uniqueRepairedNextViolations.length > 0
        && finalViolationFingerprint === firstViolationFingerprint;

      violations.splice(0, violations.length, ...preservedViolations);
      if (repeatedSameViolation) {
        // A no-progress repair is a compiler diagnostic, not a replacement for
        // the actionable validation failures. In particular, an explicitly
        // foreign physical-layer target must remain a visible owner mismatch.
        violations.push(...uniqueRepairedNextViolations);
        violations.push(violation(
          'next_operation',
          'deterministic_repair_repeat',
          'A bounded deterministic repair pass reproduced the same violation fingerprint. Treat this as a compiler/systemic defect; do not retry automatically.',
          {
            violation_fingerprint: finalViolationFingerprint,
            original_error_codes: [...new Set(uniqueRepairedNextViolations.map(item => item.code))],
          }
        ));
      } else {
        violations.push(...uniqueRepairedNextViolations);
      }

      nextOperation = repairedOperation;
      rawNextOperation = repairedOperation;
      hasNextOperation = repairedOperation !== undefined;
      if (repairedOperation) compiledInput.next_operation = repairedOperation;
      sourceNextPass = repairCandidate;
      repairedAt = new Date().toISOString();
      autoRepairCount = deterministic.repairs.length;
      repairAudit = {
        protocol: 'photoshop.guard.compiler_repair.v1',
        ...(originalIntentFingerprint ? { original_intent_fingerprint: originalIntentFingerprint } : {}),
        first_compiled_payload_fingerprint: firstCompiledPayloadFingerprint,
        repairs: appliedRepairs,
        repaired_payload_fingerprint: fingerprint(repairedOperation ?? repairCandidate),
        first_violation_fingerprint: firstViolationFingerprint,
        final_violation_fingerprint: repeatedSameViolation
          ? finalViolationFingerprint
          : fingerprint(uniqueRepairedNextViolations),
        final_validation: repeatedSameViolation
          ? 'systemic-repeat'
          : uniqueRepairedNextViolations.length ? 'rejected' : 'valid',
        ...(deferredNextPass ? { deferred_next_pass: deferredNextPass } : {}),
      };
    }
    autoRepairMs = Date.now() - repairStartedAt;
  }

  if (geometryRepairs.length) {
    autoRepairCount += geometryRepairs.length;
    repairAudit = {
      protocol: 'photoshop.guard.compiler_repair.v1',
      ...repairAudit,
      repairs: [...geometryRepairs, ...(repairAudit?.repairs ?? [])],
      repaired_payload_fingerprint: fingerprint(nextOperation ?? sourceNextPass),
      final_validation: repairAudit?.final_validation === 'systemic-repeat' ? 'systemic-repeat'
        : violations.length ? 'rejected' : 'valid',
    };
  }
  // Stop a technical rejection chain across calls even when its fingerprint changes.
  // A valid correction is always allowed; this never creates replay/recovery authority.
  if (sourceNextPass && violations.some(item => item.code === 'geometry_contract_invalid')) {
    const context = store.compactPassContext?.(Number(sourceNextPass.document_id), options.projectionContext);
    const previous = context?.recent_geometry_contract_attempts?.at(-1);
    if (previous?.outcome === 'rejected' && previous.problem_id === sourceNextPass.problem_id
        && previous.error_codes.includes('geometry_contract_invalid')) {
      violations.push(violation('next_operation', 'geometry_contract_retry_exhausted',
        'A corrected geometry contract is still invalid. Stop automatic resubmission and report this complete diagnostic as a pipeline blocker; do not read source or schemas during painting.'));
    }
  }
  const unique = uniqueViolations(violations);
  const classifiedFinal = classifyViolations(unique);
  const key = (item: GuardCycleCompileViolation) => JSON.stringify([item.scope, item.code]);
  const finalKeys = new Set(unique.map(key));
  const initialKeys = new Set(initialViolationsForAccounting.map(key));
  const repeatedRepair = repairAudit?.final_validation === 'systemic-repeat';
  const violationAccounting = [
    ...classifyViolations(initialViolationsForAccounting).map(item => ({
      code: item.violation.code, scope: item.violation.scope, origin: 'initial' as const,
      repair_class: item.repair_class, encountered: 1,
      // Local payload repair cannot claim to repair closure or request-level errors.
      repaired: item.violation.scope === 'next_operation' && !repeatedRepair && !finalKeys.has(key(item.violation)) ? 1 : 0,
      unresolved: item.violation.scope !== 'next_operation' || repeatedRepair || finalKeys.has(key(item.violation)) ? 1 : 0,
    })),
    ...classifiedFinal.filter(item => !initialKeys.has(key(item.violation))).map(item => ({
      code: item.violation.code, scope: item.violation.scope, origin: 'introduced' as const,
      repair_class: item.repair_class, encountered: 1, repaired: 0, unresolved: 1,
    })),
  ];
  const deterministicViolationAccounting = violationAccounting.filter(item =>
    item.scope === 'next_operation' && (item.repair_class === 'AUTO_NORMALIZE'
    || item.repair_class === 'AUTO_PATCH'
    || item.repair_class === 'SPLIT_DEFER'
    || item.repair_class === 'CONTRACT_CORRECTION')
  );
  const compilerTelemetry: GuardCompilerTelemetry = {
    painting_intent_compile_ms: paintingIntentCompileMs,
    durable_state_injection_ms: durableStateInjectionMs,
    local_validation_ms: localValidationMs,
    auto_repair_ms: autoRepairMs,
    auto_repair_count: autoRepairCount,
    auto_split_count: autoSplitCount,
    model_semantic_ambiguity_count: classifiedFinal.filter(item => item.repair_class === 'MODEL_SEMANTIC_DECISION').length,
    preflight_rejection_exposed_to_model_count: unique.length ? 1 : 0,
    deterministic_violations_encountered_count: deterministicViolationAccounting.reduce((sum, item) => sum + item.encountered, 0),
    deterministic_violations_repaired_count: deterministicViolationAccounting.reduce((sum, item) => sum + item.repaired, 0),
    deterministic_violations_unresolved_count: deterministicViolationAccounting.reduce((sum, item) => sum + item.unresolved, 0),
    violation_accounting: violationAccounting,
    intent_received_at: intentReceivedAt,
    ...(compiledAt ? { compiled_at: compiledAt } : {}),
    ...(validatedAt ? { validated_at: validatedAt } : {}),
    ...(repairedAt ? { repaired_at: repairedAt } : {}),
  };
  if (!unique.length) {
    return {
      input: compiledInput,
      nextOperation,
      violations: [],
      normalizations,
      compilerTelemetry,
      ...(repairAudit ? { repairAudit } : {}),
      ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
    };
  }

  const cycleFingerprint = fingerprint(compiledInput);
  const rejectionFingerprint = fingerprint({ cycle_fingerprint: cycleFingerprint, violations: unique });
  const finalizationErrors = unique.filter((item) => item.scope === 'finalization').map((item) => item.message);
  const nextOperationErrors = unique.filter((item) => item.scope === 'next_operation').map((item) => item.message);
  const cycleErrors = unique.filter((item) => item.scope === 'cycle').map((item) => item.message);
  const errors = unique.map((item) => item.message);
  const errorCodes = [...new Set(unique.map((item) => item.code))];
  const nextArgs = nextOperation?.args && typeof nextOperation.args === 'object' && !Array.isArray(nextOperation.args)
    ? nextOperation.args as Record<string, unknown>
    : {};
  const nextDocumentId = Number.isSafeInteger(nextArgs.document_id) && Number(nextArgs.document_id) > 0
    ? Number(nextArgs.document_id)
    : Number.isSafeInteger(Number(sourceNextPass?.document_id)) && Number(sourceNextPass?.document_id) > 0
      ? Number(sourceNextPass?.document_id)
      : undefined;
  const passContext = nextDocumentId ? store.compactPassContext?.(nextDocumentId, options.projectionContext) : undefined;
  const artDirector = passContext?.art_director && typeof passContext.art_director === 'object'
    ? passContext.art_director as Record<string, unknown>
    : undefined;
  const currentTaskId = text(artDirector?.current_task_id);
  const tasks = Array.isArray(artDirector?.tasks) ? artDirector.tasks as Array<Record<string, unknown>> : [];
  const currentTask = currentTaskId ? tasks.find(task => text(task.task_id) === currentTaskId) : undefined;
  const systemicFailure = classifiedFinal.some(item => item.repair_class === 'SYSTEMIC_FAILURE');
  const semanticDecisionRequired = classifiedFinal.some(item => item.repair_class === 'MODEL_SEMANTIC_DECISION');
  return {
    input: compiledInput,
    nextOperation,
    violations: unique,
    normalizations,
    compilerTelemetry,
    ...(repairAudit ? { repairAudit } : {}),
    ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
    rejection: jsonResult({
      ok: false,
      code: 'guard_cycle_preflight_rejected',
      execution: 'not-executed',
      terminal: true,
      previous_operation_closed: false,
      next_operation_dispatched: false,
      visual_mutation_started: false,
      cycle_fingerprint: cycleFingerprint,
      rejection_fingerprint: rejectionFingerprint,
      error_codes: errorCodes,
      violations: unique,
      errors,
      normalizations,
      planner_context: artDirector ? {
        directive_id: text(artDirector.directive_id) ?? null,
        planner_task_id: currentTaskId ?? null,
        planner_task_status: text(currentTask?.status) ?? null,
      } : null,
      cycle_errors: cycleErrors,
      finalization_errors: finalizationErrors,
      next_operation_errors: nextOperationErrors,
      message: errors.join('\n'),
      next_operation_guard_debt: {
        visual_barrier: false,
        preview: false,
        visual_report: false,
        operation_ack: false,
        visual_verdict: false,
        rollback: false,
        reconciliation: false,
      },
      guard_debt: {
        visual_barrier: false,
        preview: false,
        visual_report: false,
        operation_ack: false,
        visual_verdict: false,
        rollback: false,
        reconciliation: false,
      },
      canonical_next_operation: {
        action: errorCodes.includes('geometry_contract_retry_exhausted') ? 'stop-and-report-pipeline-blocker' : 'correct-and-resubmit-cycle',
        tool: typeof nextOperation?.tool === 'string' ? nextOperation.tool : null,
        replaces_rejection_fingerprint: rejectionFingerprint,
        requirement: 'Correct all listed deterministic cycle errors together, then resubmit the same semantic Guard cycle.',
      },
      compact_correction_recipe: {
        repeat_same_semantic_cycle: true,
        previous_operation_closed: false,
        photoshop_mutation_started: false,
        correction_mode: 'payload-only-first',
        repository_or_schema_investigation: 'forbidden-during-painting-including-recovery-and-repeat-rejections',
        first_response: 'apply the listed deterministic violations directly to the rejected payload and resubmit immediately',
        ...machineRepairRecipe(unique, repairAudit?.repairs ?? []),
        ...(sourceNextPass ? geometryContractRecipe(sourceNextPass, passContext ?? {}, unique) : {}),
        ...(errorCodes.includes('geometry_contract_retry_exhausted')
          ? { repeat_same_semantic_cycle: false, first_response: 'stop-and-report-pipeline-blocker' } : {}),
        ...(currentTaskId ? { planner_task_id: currentTaskId } : {}),
        ...(text(currentTask?.status) ? { planner_task_status: text(currentTask?.status) } : {}),
      },
      next_required_action:
        errorCodes.includes('geometry_contract_retry_exhausted')
          ? 'Stop automatic resubmission and report the complete geometry contract diagnostic as a pipeline blocker. No Photoshop mutation was dispatched; no recovery, source reading or schema investigation is permitted during painting.'
          : systemicFailure
          ? 'A bounded compiler/systemic defect remains after local validation. Inspect only the returned diagnostics, apply a supported correction or report the exact blocker. Do not read source, tests, schemas or use shell/imports during painting. No Photoshop mutation was dispatched and no recovery/reconcile is required.'
          : semanticDecisionRequired
            ? 'Provide the named artistic or structural decision and resubmit the same semantic Guard cycle. This is not recovery: no Photoshop mutation was dispatched and no fresh state/preview read is required solely because of this rejection. Never read source, tests, schemas or use shell/imports during painting; if the corrected attempt remains unactionable, report the exact blocker.'
            : 'Apply the listed violations directly to the payload and resubmit the same semantic Guard cycle. Never read source, tests, schemas or use shell/imports during painting, including repeated/systemic rejection; report an unactionable blocker. The previous operation was not closed and no Photoshop mutation was dispatched.',
    }, true),
  };
}

const DIRECT_LARGE_VALUE_TOOLS = new Set([
  'photoshop_adjust_brightness_contrast',
  'photoshop_adjust_curves',
  'photoshop_adjust_exposure',
  'photoshop_adjust_hue_saturation',
  'photoshop_adjust_vibrance',
  'photoshop_auto_contrast',
  'photoshop_auto_levels',
  'photoshop_desaturate',
  'photoshop_invert',
  'photoshop_apply_gradient_map',
  'photoshop_apply_lut',
  'photoshop_apply_photo_filter',
]);

const DIRECT_LAYER_TRANSFORM_TOOLS = new Set([
  'photoshop_fit_layer_to_document',
  'photoshop_move_layer',
  'photoshop_rotate_layer',
  'photoshop_scale_layer',
  'photoshop_transform_landmarks',
]);

const DIRECT_BLUR_TOOLS = new Set(['photoshop_apply_gaussian_blur', 'photoshop_apply_motion_blur', 'photoshop_apply_smart_blur']);

const DIRECT_EDGE_FILTER_TOOLS = new Set([
  'photoshop_apply_gaussian_blur',
  'photoshop_apply_motion_blur',
  'photoshop_apply_sharpen',
  'photoshop_apply_smart_blur',
]);

export function directVisualChangeDomains(tool: string): string[] | undefined {
  if (DIRECT_LARGE_VALUE_TOOLS.has(tool)) return ['large-value'];
  if (DIRECT_LAYER_TRANSFORM_TOOLS.has(tool)) return ['composition', 'silhouette'];
  if (DIRECT_EDGE_FILTER_TOOLS.has(tool)) return ['local-edge'];
  if (tool === 'photoshop_apply_gradient_mask') return ['local-edge'];
  if (tool === 'photoshop_set_layer_opacity' || tool === 'photoshop_set_layer_blend_mode') return ['local-tone'];
  if (tool === 'photoshop_set_layer_visibility') return ['large-value'];
  return undefined;
}
