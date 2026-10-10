import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { createHash } from 'node:crypto';
import { ATTENTION_BINDING_SCHEMA } from '../core/perceptual-hierarchy.js';
import { bezierCriticalPoints } from '../core/bezier-geometry.js';
import {
  normalizeToolResultForPlaceholders,
  parseVisualMicroPlan,
  collectVisualMicroPlanConstructionErrors,
  resolveVisualMicroPlanArgs,
  VISUAL_MICROPLAN_ACTION_CLASSES,
  VISUAL_MICROPLAN_MAX_STEPS,
  VISUAL_MICROPLAN_DISPOSITIONS,
  VISUAL_MICROPLAN_METHOD_CLASSES,
  VISUAL_MICROPLAN_LOGICAL_LAYER_DECISIONS,
  VISUAL_MICROPLAN_LAYER_CHANGE_KINDS,
  VISUAL_MICROPLAN_PHYSICAL_ROLES,
  VISUAL_MICROPLAN_OPACITY_ROLES,
  VISUAL_MICROPLAN_CONSTRUCTION_TIERS,
  VISUAL_MICROPLAN_NEGATIVE_SPACE_RELATIONS,
  VISUAL_MICROPLAN_CAUSAL_EFFECT_RELATIONS,
  VISUAL_MICROPLAN_DEPTH_RELATIONS,
  VISUAL_MICROPLAN_CHANGE_DOMAINS,
  VISUAL_MICROPLAN_PAINTER_SCOPES,
  VISUAL_MICROPLAN_PRESSURE_POLICIES,
  VISUAL_MICROPLAN_ROLLBACK_VALUES,
  VISUAL_MICROPLAN_RISKS,
  VISUAL_MICROPLAN_SIGNIFICANCE_MODES,
  VISUAL_MICROPLAN_TARGET_RESOLUTION,
  VISUAL_MICROPLAN_VERDICTS,
  VISUAL_MICROPLAN_MAX_MUTATIONS,
  VISUAL_MICROPLAN_MUTATION_TOOLS,
  visualMicroPlanMethodClassForStep,
  type PreviousPreviewVerdict,
  type VisualMicroPlan,
  type VisualMicroPlanStep,
} from '../core/visual-microplan.js';
import type { ToolDefinition, ToolRegistry, ToolResult } from '../core/tool-registry.js';
import { EDGE_CLASSES, selectEdgeMethod } from '../core/edge-control.js';
import { PAINTING_CONSTRUCTION_ROLES, PAINTING_VISUAL_INTENTS, paintingMethodCapabilities } from '../core/painting-method-palette.js';
import {
  MATERIAL_RESPONSE_COMPONENTS,
  MATERIAL_RESPONSE_MICROTEXTURE_POLICIES,
  MATERIAL_RESPONSE_PLAN_APPLICABILITY,
  MATERIAL_RESPONSE_ROLES,
  MATERIAL_RESPONSE_STYLE_BASIS_FIELDS,
} from '../core/material-response.js';

import { PreviewBarriers, type PendingPreviewBarrier } from '../core/preview-barriers.js';
import {
  currentToolExecutionContext,
  withToolExecutionStepContext,
} from '../core/execution-context.js';
import { guardExecutionClass } from '../core/guard/execution-policy.js';
import {
  compileVisualMicroPlan,
  VISUAL_MICROPLAN_STAGES,
  visualMicroPlanFingerprint,
} from '../core/visual-microplan-compiler.js';

interface StepStatus {
  id: string;
  tool: string;
  ok: boolean;
  execution?: 'completed' | 'not-executed' | 'failed-or-uncertain';
}

function normalizedFailureCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const code = (value as Record<string, unknown>).code;
  return typeof code === 'string' && code.trim() ? code.trim() : undefined;
}

type PassActionExecutionState = 'completed' | 'failed-or-uncertain' | 'not-started';

interface PassActionOutcome {
  step_id: string;
  tool: string;
  kind: 'preparation' | 'visual-mutation';
  state: PassActionExecutionState;
}

function passActionOutcomes(
  plan: VisualMicroPlan,
  statuses: StepStatus[],
  failedOrUncertainStep?: string
): PassActionOutcome[] {
  const statusById = new Map(statuses.map(status => [status.id, status]));
  const mutationIndexes = new Set(plan.mutationIndexes);
  return plan.steps.flatMap((step, index) => {
    // BEFORE/AFTER previews are evidence boundaries, not artistic sub-actions.
    if (index === plan.captureIndex || index === plan.beforeCaptureIndex) return [];
    const status = statusById.get(step.id);
    const state: PassActionExecutionState = status?.execution === 'not-executed'
      ? 'not-started'
      : status?.ok
        ? 'completed'
        : status?.ok === false || step.id === failedOrUncertainStep
          ? 'failed-or-uncertain'
          : 'not-started';
    return [{
      step_id: step.id,
      tool: step.tool,
      kind: mutationIndexes.has(index) ? 'visual-mutation' : 'preparation',
      state,
    }];
  });
}

function passExecutionProjection(
  plan: VisualMicroPlan,
  statuses: StepStatus[],
  state: PassActionExecutionState,
  failedOrUncertainStep?: string,
  results?: Record<string, unknown>
) {
  const actions = passActionOutcomes(plan, statuses, failedOrUncertainStep);
  const completedMutationIds = actions
    .filter(action => action.kind === 'visual-mutation' && action.state === 'completed')
    .map(action => action.step_id);
  const explicitHistorySteps = (value: unknown): number | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const row = value as Record<string, unknown>;
    for (const candidate of [row.history_steps, (row.details as Record<string, unknown> | undefined)?.history_steps]) {
      if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0) return candidate;
    }
    return undefined;
  };
  // Preparation may write history too (new layer, selection, feathering).
  // Settings/reads can be proven zero; never infer zero for a history writer.
  const historyFree = new Set(['photoshop_select_layer_by_name', 'photoshop_select_brush_preset',
    'photoshop_set_brush', 'photoshop_set_foreground_color']);
  const historyActions = actions.filter(action => action.state === 'completed'
    && (action.kind === 'visual-mutation' || (guardExecutionClass(action.tool) !== 'read-only' && !historyFree.has(action.tool))));
  const ownedActions = historyActions.map(action => ({
    step_id: action.step_id,
    history_steps: results ? explicitHistorySteps(results[action.step_id]) : undefined,
  }));
  const historyProven = ownedActions.length > 0 && ownedActions.every(action => action.history_steps !== undefined);
  const uncertainMutation = actions.some(action => action.state === 'failed-or-uncertain' && guardExecutionClass(action.tool) !== 'read-only');
  return {
    pass_id: plan.planId,
    state,
    actions,
    history_ownership: {
      protocol: 'photoshop.guard.semantic_pass_history_ownership.v1',
      status: historyActions.length === 0 && !uncertainMutation
        ? 'not-started'
        : uncertainMutation
          ? 'partial-or-uncertain'
          : historyProven ? 'exact' : 'unproven',
      completed_mutation_count: completedMutationIds.length,
      uncertain_mutation_present: uncertainMutation,
      ...(historyProven ? {
        owned_history_steps: ownedActions.reduce((sum, action) => sum + Number(action.history_steps), 0),
        actions: ownedActions,
      } : historyActions.length ? {
        actions: ownedActions.map(action => ({
          step_id: action.step_id,
          ...(action.history_steps === undefined ? { history_steps: null } : { history_steps: action.history_steps }),
        })),
        reason: 'Exact rollback span is not proven until every completed history-writing preparation and visual mutation reports an explicit nonnegative history_steps count.',
      } : {}),
    },
  };
}

interface PreparedVisualPass {
  args: Record<string, unknown>;
  plan: VisualMicroPlan;
  semanticFingerprint: string;
}

const preparedVisualPasses = new Map<string, PreparedVisualPass>();
const PREPARED_VISUAL_PASS_CACHE_LIMIT = 64;

type PreparationCacheReason =
  | 'hit'
  | 'miss_empty'
  | 'miss_unproven_layer'
  | 'invalidate_runtime_revision'
  | 'invalidate_document'
  | 'invalidate_layer'
  | 'invalidate_preparation_mutation'
  | 'invalidate_uncertainty'
  | 'invalidate_reconciliation'
  | 'miss_signature';

interface PreparationCacheFact {
  signature: string;
  tool: string;
  result: unknown;
}

interface SessionPreparationCache {
  runtimeRevision: string;
  documentId?: number;
  layerProvenance?: string;
  facts: Map<string, PreparationCacheFact>;
}

export interface PreparationCacheDiagnostic {
  reason: PreparationCacheReason;
  tool?: string;
  step_id?: string;
}

const preparationCaches = new WeakMap<ToolRegistry, SessionPreparationCache>();
const preparationDiagnostics = new WeakMap<ToolRegistry, PreparationCacheDiagnostic[]>();
const CACHEABLE_PREPARATION_TOOLS = new Set([
  'photoshop_select_brush_preset',
  'photoshop_set_brush',
  'photoshop_get_brush_settings',
]);
const PREPARATION_MUTATION_TOOLS = new Set([
  'photoshop_select_brush_preset',
  'photoshop_set_brush',
]);

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableValue).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ':' + stableValue(item))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

function preparationRuntimeRevision(registry: ToolRegistry): string {
  const declaration = registry.list()
    .map(tool => ({ name: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return createHash('sha256').update(stableValue(declaration)).digest('hex');
}

function preparationStepSignature(step: VisualMicroPlanStep, args: Record<string, unknown>): string {
  return createHash('sha256').update(step.tool).update('\n').update(stableValue(args)).digest('hex');
}

function explicitLayerProvenance(plan: VisualMicroPlan): string | undefined {
  const layerIds = new Set<number>();
  for (const mutationIndex of plan.mutationIndexes) {
    const args = plan.steps[mutationIndex]?.args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined;
    const layerId = Number((args as Record<string, unknown>).layer_id);
    if (!Number.isSafeInteger(layerId) || layerId <= 0) return undefined;
    layerIds.add(layerId);
  }
  if (!layerIds.size) return undefined;
  return [...layerIds].sort((a, b) => a - b).join(',');
}

function hasExplicitUncertainty(plan: VisualMicroPlan): boolean {
  const previous = plan.previousPreview;
  if (!previous) return false;
  if (previous.targetResolved === 'uncertain') return true;
  const text = previous.uncertainty.trim().toLowerCase();
  return text.length > 0 && !['none', 'none observed', 'no uncertainty', 'no uncertainty observed'].includes(text);
}

function diagnostic(registry: ToolRegistry, entry: PreparationCacheDiagnostic): void {
  const rows = preparationDiagnostics.get(registry) ?? [];
  rows.push(entry);
  preparationDiagnostics.set(registry, rows.slice(-128));
}

function clearPreparationFacts(
  registry: ToolRegistry,
  cache: SessionPreparationCache,
  reason: PreparationCacheReason,
): void {
  if (cache.facts.size) cache.facts.clear();
  diagnostic(registry, { reason });
}

function preparationCacheForPlan(
  registry: ToolRegistry,
  plan: VisualMicroPlan,
): { cache: SessionPreparationCache; reusable: boolean } {
  const runtimeRevision = preparationRuntimeRevision(registry);
  let cache = preparationCaches.get(registry);
  if (!cache) {
    cache = { runtimeRevision, facts: new Map() };
    preparationCaches.set(registry, cache);
  } else if (cache.runtimeRevision !== runtimeRevision) {
    clearPreparationFacts(registry, cache, 'invalidate_runtime_revision');
    cache.runtimeRevision = runtimeRevision;
    cache.documentId = undefined;
    cache.layerProvenance = undefined;
  }
  if (hasExplicitUncertainty(plan)) {
    clearPreparationFacts(registry, cache, 'invalidate_uncertainty');
    cache.documentId = plan.documentId;
    cache.layerProvenance = undefined;
    return { cache, reusable: false };
  }
  if (cache.documentId !== undefined && cache.documentId !== plan.documentId) {
    clearPreparationFacts(registry, cache, 'invalidate_document');
    cache.layerProvenance = undefined;
  }
  cache.documentId = plan.documentId;
  const layerProvenance = explicitLayerProvenance(plan);
  if (!layerProvenance) {
    clearPreparationFacts(registry, cache, 'miss_unproven_layer');
    cache.layerProvenance = undefined;
    return { cache, reusable: false };
  }
  if (cache.layerProvenance !== undefined && cache.layerProvenance !== layerProvenance) {
    clearPreparationFacts(registry, cache, 'invalidate_layer');
  }
  cache.layerProvenance = layerProvenance;
  return { cache, reusable: true };
}

export function preparationCacheDiagnosticsForTests(registry: ToolRegistry): PreparationCacheDiagnostic[] {
  return structuredClone(preparationDiagnostics.get(registry) ?? []);
}

export function resetPreparationCacheForTests(registry: ToolRegistry): void {
  preparationCaches.delete(registry);
  preparationDiagnostics.delete(registry);
}

export function invalidatePreparationCacheForReconciliation(registry: ToolRegistry): void {
  const cache = preparationCaches.get(registry);
  if (!cache) {
    diagnostic(registry, { reason: 'invalidate_reconciliation' });
    return;
  }
  clearPreparationFacts(registry, cache, 'invalidate_reconciliation');
  cache.documentId = undefined;
  cache.layerProvenance = undefined;
}

function preparedPassKey(args: Record<string, unknown>): string | undefined {
  return typeof args.plan_id === 'string' && args.plan_id.trim() ? args.plan_id.trim() : undefined;
}

function preparedPassFingerprint(input: Record<string, unknown>): string {
  const args = compileVisualMicroPlan(input);
  if (Array.isArray(args.steps)) {
    for (const value of args.steps) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const step = value as Record<string, unknown>;
      if (step.tool !== 'photoshop_get_preview' || !step.args || typeof step.args !== 'object' || Array.isArray(step.args)) continue;
      const previewArgs = step.args as Record<string, unknown>;
      // Guard materializes preview transport after semantic preflight. Those two
      // fields do not change the artistic/execution contract and must not cause
      // the already-validated plan to be parsed a second time.
      delete previewArgs.materialize_path;
      delete previewArgs.include_image;
    }
  }
  return visualMicroPlanFingerprint(args);
}

function cachePreparedVisualPass(args: Record<string, unknown>, plan: VisualMicroPlan): void {
  const key = preparedPassKey(args);
  if (!key) return;
  preparedVisualPasses.set(key, {
    args: structuredClone(args),
    plan: structuredClone(plan),
    semanticFingerprint: preparedPassFingerprint(args),
  });
  while (preparedVisualPasses.size > PREPARED_VISUAL_PASS_CACHE_LIMIT) {
    const oldest = preparedVisualPasses.keys().next().value;
    if (oldest === undefined) break;
    preparedVisualPasses.delete(oldest);
  }
}

function consumePreparedVisualPass(input: Record<string, unknown>): PreparedVisualPass | undefined {
  const key = preparedPassKey(input);
  if (!key) return undefined;
  if (currentToolExecutionContext()?.guardOperationId !== key) return undefined;
  const prepared = preparedVisualPasses.get(key);
  if (!prepared) return undefined;
  preparedVisualPasses.delete(key);
  if (prepared.semanticFingerprint !== preparedPassFingerprint(input)) return undefined;

  const runtimeArgs = compileVisualMicroPlan(input);
  const runtimeSteps = Array.isArray(runtimeArgs.steps)
    ? new Map((runtimeArgs.steps as Array<Record<string, unknown>>)
        .filter(step => step && typeof step === 'object' && !Array.isArray(step) && typeof step.id === 'string')
        .map(step => [String(step.id), step]))
    : new Map<string, Record<string, unknown>>();
  const plan = structuredClone(prepared.plan);
  plan.steps = plan.steps.map(step => {
    const runtimeStep = runtimeSteps.get(step.id);
    return runtimeStep?.args && typeof runtimeStep.args === 'object' && !Array.isArray(runtimeStep.args)
      ? { ...step, args: structuredClone(runtimeStep.args as Record<string, unknown>) }
      : step;
  });
  return { args: runtimeArgs, plan, semanticFingerprint: prepared.semanticFingerprint };
}

function jsonResult(body: Record<string, unknown>, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function getToolProperties(tool: Tool): Record<string, unknown> {
  const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  return schema?.properties ?? {};
}

type JsonSchemaNode = {
  type?: string;
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

const STEP_RESULT_PLACEHOLDER_RE = /^\$steps\.[^.]+(?:\..+)?$/;

function isDeferredStepPlaceholder(value: unknown): value is string {
  return typeof value === 'string' && STEP_RESULT_PLACEHOLDER_RE.test(value);
}

function containsDeferredStepPlaceholder(value: unknown): boolean {
  if (isDeferredStepPlaceholder(value)) return true;
  if (Array.isArray(value)) return value.some(containsDeferredStepPlaceholder);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsDeferredStepPlaceholder);
  }
  return false;
}

function schemaValidationError(
  value: unknown,
  schemaValue: unknown,
  path: string,
  allowDeferredPlaceholders: boolean
): string | null {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) return null;
  if (allowDeferredPlaceholders && isDeferredStepPlaceholder(value)) return null;
  const schema = schemaValue as JsonSchemaNode;

  if (Array.isArray(schema.enum) && !schema.enum.some(candidate => Object.is(candidate, value))) {
    return `${path} must be one of ${schema.enum.map(item => JSON.stringify(item)).join(', ')}`;
  }

  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path} must be an object`;
    const objectValue = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(objectValue, required)) return `${path}.${required} is required`;
    }
    for (const [key, item] of Object.entries(objectValue)) {
      const propertySchema = schema.properties?.[key];
      if (propertySchema) {
        const error = schemaValidationError(item, propertySchema, `${path}.${key}`, allowDeferredPlaceholders);
        if (error) return error;
      } else if (schema.additionalProperties === false) {
        return `${path}.${key} is not allowed`;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const error = schemaValidationError(
          item,
          schema.additionalProperties,
          `${path}.${key}`,
          allowDeferredPlaceholders
        );
        if (error) return error;
      }
    }
    return null;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) return `${path} must be an array`;
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return `${path} must contain at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`;
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      return `${path} must contain at most ${schema.maxItems} items`;
    }
    if (schema.items) {
      for (let index = 0; index < value.length; index++) {
        const error = schemaValidationError(
          value[index],
          schema.items,
          `${path}[${index}]`,
          allowDeferredPlaceholders
        );
        if (error) return error;
      }
    }
    return null;
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${path} must be a number`;
    if (schema.type === 'integer' && !Number.isInteger(value)) return `${path} must be an integer`;
    if (schema.minimum !== undefined && value < schema.minimum) return `${path} must be >= ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path} must be <= ${schema.maximum}`;
    return null;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') return `${path} must be a string`;
    if (schema.minLength !== undefined && value.length < schema.minLength) return `${path} is too short`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${path} is too long`;
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) return `${path} has invalid format`;
    return null;
  }

  if (schema.type === 'boolean' && typeof value !== 'boolean') return `${path} must be a boolean`;
  return null;
}

function stepArgumentValidationError(
  registry: ToolRegistry,
  plan: VisualMicroPlan,
  step: VisualMicroPlanStep,
  args: Record<string, unknown>,
  allowDeferredPlaceholders: boolean
): string | null {
  const definition = registry.get(step.tool);
  if (!definition) return `tool not found: ${step.tool}`;
  let pinnedArgs: Record<string, unknown>;
  try {
    pinnedArgs = withPinnedDocumentId(registry, step, args, plan.documentId);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return schemaValidationError(
    pinnedArgs,
    definition.tool.inputSchema,
    `step "${step.id}" args`,
    allowDeferredPlaceholders
  );
}

function planArgumentPreflightError(plan: VisualMicroPlan, registry: ToolRegistry): string | null {
  for (const step of plan.steps) {
    const error = stepArgumentValidationError(registry, plan, step, step.args, true);
    if (error) return error;
  }
  return null;
}

function collectSchemaErrors(value: unknown, schemaValue: unknown, path: string): string[] {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue) || isDeferredStepPlaceholder(value)) return [];
  const schema = schemaValue as JsonSchemaNode;
  const errors: string[] = [];
  const shallow = { ...schema, properties: {}, required: [], items: undefined, additionalProperties: true };
  const error = schemaValidationError(value, shallow, path, true);
  if (error) errors.push(error);
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in object)) errors.push(`${path}.${key} is required`);
    }
    for (const [key, item] of Object.entries(object)) {
      const child = schema.properties?.[key];
      if (child) errors.push(...collectSchemaErrors(item, child, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key} is not allowed`);
      else if (typeof schema.additionalProperties === 'object') {
        errors.push(...collectSchemaErrors(item, schema.additionalProperties, `${path}.${key}`));
      }
    }
  } else if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => errors.push(...collectSchemaErrors(item, schema.items, `${path}[${index}]`)));
  }
  return errors;
}

export interface VisualMicroPlanDocumentBounds {
  documentId: number;
  width: number;
  height: number;
}

interface VisualMicroPlanPreflightOptions {
  documentBounds?: VisualMicroPlanDocumentBounds;
  extraErrors?: string[];
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function rawMutationIndexes(steps: unknown[]): number[] {
  return steps
    .map((step, index) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) return -1;
      return VISUAL_MICROPLAN_MUTATION_TOOLS.has(String((step as Record<string, unknown>).tool))
        ? index
        : -1;
    })
    .filter(index => index >= 0);
}

function rawStrokeMethodClass(step: Record<string, unknown>): string | undefined {
  const args = step.args && typeof step.args === 'object' && !Array.isArray(step.args)
    ? step.args as Record<string, unknown>
    : {};
  return visualMicroPlanMethodClassForStep({ tool: String(step.tool ?? ''), args });
}

function collectSemanticEnvelopeErrors(args: Record<string, unknown>): string[] {
  const errors: string[] = collectVisualMicroPlanConstructionErrors(args);
  for (const field of ['plan_id', 'summary', 'stage', 'scale', 'region', 'intent', 'expected_visual_delta']) {
    if (typeof args[field] !== 'string' || !(args[field] as string).trim()) errors.push(`${field} must be a non-empty string`);
  }
  if (!!args.planner_directive_id !== !!args.planner_task_id) {
    errors.push('planner_directive_id and planner_task_id must be supplied together');
  }
  if ((args.planner_directive_id || args.planner_task_id) && !args.painter_scope) {
    errors.push('Painter-bound VisualMicroPlan requires painter_scope');
  }
  if (args.object_context_region_bounds && !args.region_bounds) {
    errors.push('object_context_region_bounds requires exact region_bounds for the tighter MICRO target');
  }
  const stage = normalizedString(args.stage);
  if (stage && !VISUAL_MICROPLAN_STAGES.includes(stage as (typeof VISUAL_MICROPLAN_STAGES)[number])) {
    errors.push(`stage must be one of ${VISUAL_MICROPLAN_STAGES.join(', ')}; got ${stage}`);
  }
  if (!Array.isArray(args.steps)) return errors;

  const steps = args.steps as unknown[];
  const mutationIndexes = rawMutationIndexes(steps);
  if (mutationIndexes.length < 1 || mutationIndexes.length > VISUAL_MICROPLAN_MAX_MUTATIONS) {
    errors.push(
      `VisualMicroPlan requires 1-${VISUAL_MICROPLAN_MAX_MUTATIONS} visual mutations; found ${mutationIndexes.length}`
    );
  }
  if (mutationIndexes.length > 1) {
    for (let index = mutationIndexes[0]!; index <= mutationIndexes.at(-1)!; index++) {
      if (!mutationIndexes.includes(index)) {
        errors.push('visual mutations must form one contiguous bounded transaction with no preparation/read steps between them');
        break;
      }
    }
  }

  const rootRegion = normalizedString(args.region);
  const rootMethodClass = normalizedString(args.method_class)?.toLowerCase();
  const rootRisk = normalizedString(args.risk)?.toLowerCase();
  const riskRank = (value: string | undefined) => ['low', 'moderate', 'high'].indexOf(value ?? '');
  const hasPresetSelection = mutationIndexes.length > 0 && steps
    .slice(0, mutationIndexes[0])
    .some(step => !!step && typeof step === 'object' && !Array.isArray(step)
      && (step as Record<string, unknown>).tool === 'photoshop_select_brush_preset');

  for (const index of mutationIndexes) {
    const step = steps[index] as Record<string, unknown>;
    const id = normalizedString(step.id) ?? `steps[${index}]`;
    const stepRegion = normalizedString(step.region);
    const stepMethodClass = normalizedString(step.method_class)?.toLowerCase();
    const stepRisk = normalizedString(step.risk)?.toLowerCase();
    if (rootRegion && stepRegion && stepRegion !== rootRegion) {
      errors.push(`step "${id}" region must match micro-plan region "${rootRegion}"`);
    }
    if (rootMethodClass && stepMethodClass && stepMethodClass !== rootMethodClass) {
      errors.push(`step "${id}" method_class must match micro-plan method_class=${rootMethodClass}`);
    }
    const actualMethodClass = rawStrokeMethodClass(step);
    const presetCompatible = rootMethodClass === 'preset-brush'
      && hasPresetSelection
      && step.tool === 'photoshop_paint_strokes'
      && actualMethodClass === 'paint';
    if (rootMethodClass && actualMethodClass && actualMethodClass !== rootMethodClass && !presetCompatible) {
      errors.push(`step "${id}" method class is incompatible with micro-plan method_class=${rootMethodClass}`);
    }
    if (rootRisk && stepRisk && riskRank(stepRisk) > riskRank(rootRisk)) {
      errors.push(`step "${id}" risk=${stepRisk} cannot be hidden inside micro-plan risk=${rootRisk}`);
    }
  }
  return errors;
}

function collectMethodExecutionErrorsFromInput(
  args: Record<string, unknown>,
  registry: ToolRegistry
): string[] {
  if (!Array.isArray(args.steps)) return [];
  const steps = args.steps as Array<Record<string, unknown>>;
  const mutationIndexes = rawMutationIndexes(steps);
  const firstMutationIndex = mutationIndexes[0] ?? steps.length;
  const preparationSteps = steps.slice(0, firstMutationIndex);
  const capabilities = new Map(
    paintingMethodCapabilities(registry).map(capability => [capability.id, capability])
  );
  const rootMethodClass = normalizedString(args.method_class)?.toLowerCase();
  const errors: string[] = [];

  for (const mutationIndex of mutationIndexes) {
    const step = steps[mutationIndex];
    if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
    const methodId = normalizedString(step.method_id);
    const id = normalizedString(step.id) ?? `steps[${mutationIndex}]`;
    if (!methodId) {
      if (rootMethodClass === 'preset-brush') {
        errors.push(`step "${id}" must declare method_id for method_class=preset-brush`);
      }
      continue;
    }
    const capability = capabilities.get(methodId);
    if (!capability) {
      const known = paintingMethodCapabilities(registry)
        .filter(method => method.primaryTool === step.tool)
        .map(method => method.id);
      errors.push(
        `step "${id}" unknown method_id=${methodId}; available for this tool: ${known.join(', ') || 'none'}`
      );
      continue;
    }
    if (capability.availability === 'unavailable') {
      errors.push(`step "${id}" method_id=${methodId} is unavailable: ${capability.availabilityReason}`);
    }
    const uniformContinuousField = capability.id === 'continuous-color-field'
      && step.tool === 'photoshop_fill_layer' && rootMethodClass === 'fill';
    if (rootMethodClass && capability.methodClass !== rootMethodClass && !uniformContinuousField) {
      errors.push(
        `step "${id}" method_id=${methodId} uses method_class=${capability.methodClass}, incompatible with micro-plan method_class=${rootMethodClass}`
      );
    }
    if ((!capability.primaryTool || step.tool !== capability.primaryTool) && !uniformContinuousField) {
      errors.push(
        `step "${id}" method_id=${methodId} requires primary tool ${capability.primaryTool ?? 'none'}, got ${String(step.tool)}`
      );
    }
    for (const requiredTool of capability.preparationTools ?? []) {
      if (!preparationSteps.some(preparation => preparation?.tool === requiredTool)) {
        errors.push(
          `step "${id}" method_id=${methodId} requires preparation step ${requiredTool} before visual mutation`
        );
      }
    }
    if (capability.preparationAnyOf?.length
      && !preparationSteps.some(preparation => capability.preparationAnyOf!.includes(String(preparation?.tool)))) {
      errors.push(
        `step "${id}" method_id=${methodId} requires one explicit preparation step from: ${capability.preparationAnyOf.join(', ')}`
      );
    }
    const brushHints = capability.executionHints?.brush;
    if (brushHints && typeof brushHints === 'object' && !Array.isArray(brushHints)) {
      const setBrush = [...preparationSteps].reverse().find(preparation => preparation?.tool === 'photoshop_set_brush');
      if (!setBrush) {
        errors.push(`step "${id}" method_id=${methodId} requires photoshop_set_brush matching execution hints`);
      } else {
        const setBrushArgs = setBrush.args && typeof setBrush.args === 'object' && !Array.isArray(setBrush.args)
          ? setBrush.args as Record<string, unknown>
          : {};
        for (const [key, expected] of Object.entries(brushHints as Record<string, unknown>)) {
          if (setBrushArgs[key] !== expected) {
            errors.push(
              `step "${id}" method_id=${methodId} requires photoshop_set_brush.${key}=${String(expected)}, got ${String(setBrushArgs[key])}`
            );
          }
        }
      }
    }
    const strokeTool = capability.executionHints?.stroke_tool;
    if (typeof strokeTool === 'string') {
      const stepArgs = step.args && typeof step.args === 'object' && !Array.isArray(step.args)
        ? step.args as Record<string, unknown>
        : {};
      const strokes = stepArgs.strokes;
      if (!Array.isArray(strokes) || strokes.length === 0) {
        errors.push(`step "${id}" method_id=${methodId} requires non-empty strokes using ${strokeTool}`);
      } else if (strokes.some(stroke =>
        !stroke || typeof stroke !== 'object' || Array.isArray(stroke)
        || String((stroke as Record<string, unknown>).tool ?? 'BRUSH').toUpperCase() !== strokeTool
      )) {
        errors.push(`step "${id}" method_id=${methodId} requires every stroke.tool=${strokeTool}`);
      }
    }
  }
  return errors;
}

function collectDocumentBoundsErrors(
  args: Record<string, unknown>,
  bounds: VisualMicroPlanDocumentBounds
): string[] {
  const errors: string[] = [];
  let clip: { left: number; top: number; right: number; bottom: number } | undefined;
  let curveMode: 'region' | 'stroke' | undefined;
  const checkPoint = (x: number, y: number, path: string): void => {
    if (x < -1e-7 || x > bounds.width + 1e-7 || y < -1e-7 || y > bounds.height + 1e-7) {
      errors.push(`${path} point (${x}, ${y}) is outside document ${bounds.documentId} bounds 0..${bounds.width} x 0..${bounds.height}`);
    }
    if (clip && (x < clip.left - 1e-7 || x > clip.right + 1e-7 || y < clip.top - 1e-7 || y > clip.bottom + 1e-7)) {
      errors.push(`${path} point (${x}, ${y}) is outside clip_bounds [${clip.left}, ${clip.top}, ${clip.right}, ${clip.bottom}]`);
    }
  };
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.x === 'number' && Number.isFinite(record.x)
      && typeof record.y === 'number' && Number.isFinite(record.y)) {
      checkPoint(record.x, record.y, path);
    }
    if (curveMode && Array.isArray(record.points)) {
      try {
        bezierCriticalPoints(record.points, curveMode === 'region' || record.closed === true)
          .forEach(point => checkPoint(point.x, point.y, `${path}.curve`));
      } catch (error) { errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    if (['left', 'top', 'right', 'bottom'].every(key => typeof record[key] === 'number' && Number.isFinite(record[key]))) {
      const left = record.left as number;
      const top = record.top as number;
      const right = record.right as number;
      const bottom = record.bottom as number;
      if (left < 0 || top < 0 || right > bounds.width || bottom > bounds.height) {
        errors.push(
          `${path} bounds [${left}, ${top}, ${right}, ${bottom}] exceed document ${bounds.documentId} bounds 0..${bounds.width} x 0..${bounds.height}`
        );
      }
    }
    for (const [key, item] of Object.entries(record)) visit(item, path ? `${path}.${key}` : key);
  };
  if (args.region_bounds !== undefined) visit(args.region_bounds, 'region_bounds');
  if (Array.isArray(args.steps)) {
    args.steps.forEach((step, index) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) return;
      const stepArgs = step.args as Record<string, unknown> | undefined;
      curveMode = step.tool === 'photoshop_paint_regions' ? 'region'
        : step.tool === 'photoshop_paint_strokes' ? 'stroke' : undefined;
      const candidate = stepArgs?.clip_bounds as Record<string, unknown> | undefined;
      clip = step.tool === 'photoshop_paint_regions' && candidate
        && ['left', 'top', 'right', 'bottom'].every(key => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]))
        ? candidate as typeof clip : undefined;
      visit(stepArgs, `steps[${index}].args`);
    });
  }
  return [...new Set(errors)];
}

function rejectionFingerprint(planFingerprint: string, errors: string[]): string {
  return createHash('sha256')
    .update(planFingerprint)
    .update('\n')
    .update(errors.join('\n'))
    .digest('hex');
}

function validateCompiledVisualMicroPlan(
  args: Record<string, unknown>,
  registry: ToolRegistry,
  options: VisualMicroPlanPreflightOptions = {}
): { rejection?: ToolResult; plan?: VisualMicroPlan } {
  const errors: string[] = [
    ...collectSchemaErrors(args, visualMicroPlanToolSchema().inputSchema, 'microplan'),
    ...collectSemanticEnvelopeErrors(args),
    ...(options.extraErrors ?? []),
  ];
  const methodErrors: string[] = [];
  let plan: VisualMicroPlan | undefined;
  try { plan = parseVisualMicroPlan(args); }
  catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  if (Array.isArray(args.steps)) {
    for (const step of args.steps) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
      const definition = registry.get(step.tool);
      if (!definition) { errors.push(`tool not found: ${String(step.tool)}`); continue; }
      errors.push(...collectSchemaErrors(step.args, definition.tool.inputSchema, `step "${String(step.id)}" args`));
      if (step.args && typeof step.args === 'object' && step.args.document_id !== undefined && step.args.document_id !== args.document_id) {
        errors.push(`step "${String(step.id)}" document_id must match micro-plan document_id`);
      }
    }
  }
  methodErrors.push(...collectMethodExecutionErrorsFromInput(args, registry));
  if (options.documentBounds) errors.push(...collectDocumentBoundsErrors(args, options.documentBounds));
  if (plan) {
    const methodError = methodExecutionError(plan, registry);
    if (methodError) methodErrors.push(methodError);
  }
  if (!errors.length && !methodErrors.length) return { plan };
  const uniqueErrors = [...new Set([...errors, ...methodErrors])];
  const planFingerprint = visualMicroPlanFingerprint(args);
  const rejectionId = rejectionFingerprint(planFingerprint, uniqueErrors);
  const code = errors.length ? 'invalid_visual_microplan' : 'method_execution_preflight_failed';
  return { rejection: jsonResult({
    ok: false,
    code,
    execution: 'not-executed',
    terminal: true,
    visual_mutation_started: false,
    ...(typeof args.plan_id === 'string' ? { plan_id: args.plan_id } : {}),
    ...(typeof args.document_id === 'number' ? { document_id: args.document_id } : {}),
    plan_fingerprint: planFingerprint,
    rejection_fingerprint: rejectionId,
    errors: uniqueErrors,
    message: uniqueErrors.join('\n'),
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
      action: 'correct-and-resubmit',
      tool: 'photoshop_execute_visual_microplan',
      replaces_rejection_fingerprint: rejectionId,
      requirement: 'Correct all listed errors together before resubmission.',
    },
    next_required_action:
      'Correct all listed request errors together and resubmit the corrected VisualMicroPlan. No Photoshop mutation ran; no recovery preview, report, acknowledgement, reconcile, visual verdict, or rollback is required for this rejection.',
  }, true) };
}

/** Pure preflight: no Photoshop reads, preparation, dispatch, or barriers. */
export function preflightVisualMicroPlan(
  input: Record<string, unknown>,
  registry: ToolRegistry,
  options: VisualMicroPlanPreflightOptions = {}
): ToolResult | undefined {
  const args = compileVisualMicroPlan(input);
  return validateCompiledVisualMicroPlan(args, registry, options).rejection;
}

function documentsFromListResult(result: ToolResult): Array<Record<string, unknown>> | undefined {
  const normalized = normalizeToolResultForPlaceholders(result);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return undefined;
  const body = normalized as Record<string, unknown>;
  const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details)
    ? body.details as Record<string, unknown>
    : undefined;
  const documents = Array.isArray(details?.documents)
    ? details.documents
    : Array.isArray(body.documents) ? body.documents : undefined;
  return documents?.filter(
    (value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  );
}

/**
 * Guard-side compile pass. The only Photoshop access allowed here is one
 * read-only open-document listing used to validate document-space coordinates.
 * It never writes a Guard journal record or visual barrier.
 */
export async function preflightVisualMicroPlanForExecution(
  input: Record<string, unknown>,
  registry: ToolRegistry,
  documentBounds?: VisualMicroPlanDocumentBounds
): Promise<ToolResult | undefined> {
  const args = compileVisualMicroPlan(input);
  const documentId = args.document_id;
  if (typeof documentId !== 'number' || !Number.isSafeInteger(documentId) || documentId <= 0) {
    const validated = validateCompiledVisualMicroPlan(args, registry);
    if (!validated.rejection && validated.plan) cachePreparedVisualPass(args, validated.plan);
    return validated.rejection;
  }
  if (documentBounds && documentBounds.documentId === documentId) {
    const validated = validateCompiledVisualMicroPlan(args, registry, { documentBounds });
    if (!validated.rejection && validated.plan) cachePreparedVisualPass(args, validated.plan);
    return validated.rejection;
  }
  const listDefinition = registry.get('photoshop_list_documents');
  if (!listDefinition) {
    const validated = validateCompiledVisualMicroPlan(args, registry);
    if (!validated.rejection && validated.plan) cachePreparedVisualPass(args, validated.plan);
    return validated.rejection;
  }

  let listResult: ToolResult;
  try {
    listResult = await registry.execute('photoshop_list_documents', {});
  } catch (error) {
    return validateCompiledVisualMicroPlan(args, registry, {
      extraErrors: [
        `document bounds preflight failed before mutation: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }).rejection;
  }
  const documents = documentsFromListResult(listResult);
  if (listResult.isError === true || !documents) {
    return validateCompiledVisualMicroPlan(args, registry, {
      extraErrors: ['document bounds preflight failed: photoshop_list_documents did not return a usable documents array'],
    }).rejection;
  }
  const document = documents.find(item => Number(item.id ?? item.document_id) === documentId);
  if (!document) {
    return validateCompiledVisualMicroPlan(args, registry, {
      extraErrors: [`document_id=${documentId} is not present in the current open-document list`],
    }).rejection;
  }
  const width = Number(document.width);
  const height = Number(document.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return validateCompiledVisualMicroPlan(args, registry, {
      extraErrors: [`document_id=${documentId} did not expose finite positive width/height for bounds preflight`],
    }).rejection;
  }
  const validated = validateCompiledVisualMicroPlan(args, registry, {
    documentBounds: { documentId, width, height },
  });
  if (!validated.rejection && validated.plan) cachePreparedVisualPass(args, validated.plan);
  return validated.rejection;
}

function withPinnedDocumentId(
  registry: ToolRegistry,
  step: VisualMicroPlanStep,
  args: Record<string, unknown>,
  documentId: number
): Record<string, unknown> {
  const definition = registry.get(step.tool);
  if (!definition) throw new Error(`tool not found: ${step.tool}`);

  const acceptsDocumentId = Object.prototype.hasOwnProperty.call(
    getToolProperties(definition.tool),
    'document_id'
  );
  if (!acceptsDocumentId) return args;

  if (Object.prototype.hasOwnProperty.call(args, 'document_id')) {
    if (args.document_id !== documentId) {
      throw new Error(
        `step "${step.id}" document_id must match VisualMicroPlan document_id=${documentId}`
      );
    }
    return args;
  }

  return { ...args, document_id: documentId };
}

function previewMetadata(result: ToolResult): Record<string, unknown> | null {
  const normalized = normalizeToolResultForPlaceholders(result);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return null;
  return normalized as Record<string, unknown>;
}

function imageContent(result: ToolResult): CallToolResult['content'] {
  return result.content.filter((item) => item.type === 'image');
}

function validatePreviousPreviewBarrier(
  plan: VisualMicroPlan,
  pending: PendingPreviewBarrier | undefined
): string | null {
  const previous = plan.previousPreview;
  if (!pending) {
    // Controller-driven workflows already recorded the verdict and released the
    // shared durable barrier. Keep previous_preview accepted as harmless
    // compatibility metadata instead of resurrecting a second state machine.
    return null;
  }

  // The Core controller writes the SAME durable barrier immediately before it
  // dispatches a visual call. A VisualMicroPlan must not reject its own dispatch
  // barrier; it will replace/update this record around the actual mutation.
  if (pending.planId === plan.planId && pending.requiresExternalPreview && !pending.sha256) {
    return null;
  }

  if (!previous) {
    return pending.requiresExternalPreview
      ? 'a prior visual mutation has no verified preview; call photoshop_get_preview, inspect it, then supply previous_preview before another VisualMicroPlan'
      : `preview verdict required for prior plan "${pending.planId}" before another visual mutation`;
  }

  if (pending.sha256 && previous.sha256 !== pending.sha256) {
    return `previous_preview.sha256 does not match the pending preview from plan "${pending.planId}"`;
  }

  if (previous.disposition === 'rollback' && plan.actionClass !== 'ROLLBACK') {
    return 'previous_preview.disposition=rollback requires the next VisualMicroPlan action_class=ROLLBACK';
  }

  return null;
}

function previousPreviewSummary(previous: PreviousPreviewVerdict | undefined): Record<string, unknown> | undefined {
  if (!previous) return undefined;
  return {
    sha256: previous.sha256,
    observed_change: previous.observedChange,
    target_resolved: previous.targetResolved,
    regressions: previous.regressions,
    uncertainty: previous.uncertainty,
    verdict: previous.verdict,
    disposition: previous.disposition,
  };
}

function positiveLayerId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function protectedMutationError(
  plan: VisualMicroPlan,
  mutationStep: VisualMicroPlanStep,
  mutationArgs: Record<string, unknown>
): string | null {
  if (!plan.protectedLayerIds.length || mutationStep.tool === 'photoshop_undo') return null;

  let targets: number[] = [];
  if (mutationStep.tool === 'photoshop_paint_regions') {
    if (!Array.isArray(mutationArgs.regions) || mutationArgs.regions.length === 0) {
      return 'protected_layer_ids requires paint_regions.regions to be a non-empty array';
    }
    for (let index = 0; index < mutationArgs.regions.length; index++) {
      const region = mutationArgs.regions[index];
      if (!region || typeof region !== 'object' || Array.isArray(region)) {
        return `protected_layer_ids cannot verify regions[${index}] target layer`;
      }
      const layerId = positiveLayerId((region as Record<string, unknown>).layer_id);
      if (!layerId) {
        return `protected_layer_ids requires explicit regions[${index}].layer_id so the mutation target is fail-closed`;
      }
      targets.push(layerId);
    }
  } else if (
    mutationStep.tool === 'photoshop_paint_strokes' ||
    mutationStep.tool === 'photoshop_paint_dabs' ||
    mutationStep.tool === 'photoshop_paint_stamp_instances' ||
    mutationStep.tool === 'photoshop_fill_layer' ||
    mutationStep.tool === 'photoshop_paint_color_gradient'
  ) {
    const layerId = positiveLayerId(mutationArgs.layer_id);
    if (!layerId) {
      return `protected_layer_ids requires explicit ${mutationStep.tool}.layer_id so the mutation target is fail-closed`;
    }
    targets = [layerId];
  }

  const replaceable = new Set(plan.replaceProtectedLayerIds);
  for (const target of targets) {
    if (plan.protectedLayerIds.includes(target) && !replaceable.has(target)) {
      return `mutation targets protected layer ${target}; use a different target layer or explicitly declare replace_protected_layer_ids with action_class=REPLACE/ERASE`;
    }
  }
  return null;
}

function staticMutationProtectionError(
  plan: VisualMicroPlan,
  registry: ToolRegistry
): { step: VisualMicroPlanStep; message: string } | null {
  for (const mutationIndex of plan.mutationIndexes) {
    const step = plan.steps[mutationIndex]!;
    if (containsDeferredStepPlaceholder(step.args)) continue;
    try {
      const pinned = withPinnedDocumentId(registry, step, step.args, plan.documentId);
      const message = protectedMutationError(plan, step, pinned);
      if (message) return { step, message };
    } catch (error) {
      return { step, message: error instanceof Error ? error.message : String(error) };
    }
  }
  return null;
}

function compileEdgeStrategies(
  plan: VisualMicroPlan,
  registry: ToolRegistry
): { strategies: Array<Record<string, unknown>>; error?: string } {
  const strategies: Array<Record<string, unknown>> = [];
  try {
    for (const edge of plan.edges) {
      const boundSteps = plan.mutationIndexes
        .map(index => plan.steps[index]!)
        .filter(step => (step.edgeBoundaryIds ?? []).includes(edge.boundaryId));
      const executions = boundSteps.map(step => {
        const selection = selectEdgeMethod(registry, edge.edgeClass, {
          preferredMethodId: step.methodId ?? edge.preferredMethodId,
        });
        if (!step.methodId || selection.selected.id !== step.methodId) {
          throw new Error(
            `edge ${edge.boundaryId} step ${step.id} method_id=${step.methodId ?? 'missing'} is not executable for edge_class=${edge.edgeClass}; selected=${selection.selected.id}`
          );
        }
        if (selection.selected.methodClass !== plan.methodClass) {
          throw new Error(
            `edge ${edge.boundaryId} method ${selection.selected.id} uses method_class=${selection.selected.methodClass}, incompatible with micro-plan method_class=${plan.methodClass}`
          );
        }
        return {
          step_id: step.id,
          method_id: selection.selected.id,
          tool: selection.selected.primaryTool,
          execution_hints: selection.selected.executionHints ?? {},
          fallback_method_ids: selection.fallbacks.map(item => item.id),
        };
      });
      strategies.push({
        boundary_id: edge.boundaryId,
        region_a: edge.regionA,
        region_b: edge.regionB,
        class: edge.edgeClass,
        expected_behavior: edge.expectedBehavior,
        executions,
      });
    }
    return { strategies };
  } catch (error) {
    return { strategies: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function normalizedResultRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function preparationFailureOutcome(input: {
  step: VisualMicroPlanStep;
  normalizedResult?: unknown;
  invoked: boolean;
  priorSideEffectingPreparationCompleted: boolean;
}) {
  const executionClass = guardExecutionClass(input.step.tool);
  const child = normalizedResultRecord(input.normalizedResult);
  const childNotExecuted = child?.execution === 'not-executed';
  const currentStepSideEffectFree = !input.invoked
    || executionClass === 'read-only'
    || childNotExecuted;
  const exactNotExecuted = !input.priorSideEffectingPreparationCompleted && currentStepSideEffectFree;
  return {
    ...(exactNotExecuted ? { execution: 'not-executed' as const, terminal: true } : {}),
    preparation_execution: {
      failed_step_class: executionClass,
      failed_step_invoked: input.invoked,
      failed_step_execution: childNotExecuted
        ? 'not-executed'
        : input.invoked
          ? 'failed-or-uncertain'
          : 'not-dispatched',
      prior_side_effecting_preparation_completed: input.priorSideEffectingPreparationCompleted,
      side_effects_possible: !exactNotExecuted,
      ...(child?.execution_proof ? { failed_step_execution_proof: child.execution_proof } : {}),
    },
  };
}

function preVisualDispatchFailureOutcome(priorSideEffectingPreparationCompleted: boolean) {
  return {
    ...(!priorSideEffectingPreparationCompleted
      ? { execution: 'not-executed' as const, terminal: true }
      : {}),
    preparation_execution: {
      prior_side_effecting_preparation_completed: priorSideEffectingPreparationCompleted,
      side_effects_possible: priorSideEffectingPreparationCompleted,
    },
  };
}

function methodExecutionError(plan: VisualMicroPlan, registry: ToolRegistry): string | null {
  const capabilities = new Map(
    paintingMethodCapabilities(registry).map(capability => [capability.id, capability])
  );
  const preparationSteps = plan.steps.slice(0, plan.mutationIndex);

  for (const mutationIndex of plan.mutationIndexes) {
    const step = plan.steps[mutationIndex]!;
    if (!step.methodId) continue;
    const capability = capabilities.get(step.methodId);
    if (!capability) return `step "${step.id}" declares unknown method_id=${step.methodId}`;
    if (capability.availability === 'unavailable') {
      return `step "${step.id}" method_id=${step.methodId} is unavailable: ${capability.availabilityReason}`;
    }
    const uniformContinuousField = capability.id === 'continuous-color-field'
      && step.tool === 'photoshop_fill_layer' && plan.methodClass === 'fill';
    if (capability.methodClass !== plan.methodClass && !uniformContinuousField) {
      return `step "${step.id}" method_id=${step.methodId} uses method_class=${capability.methodClass}, incompatible with micro-plan method_class=${plan.methodClass}`;
    }
    if ((!capability.primaryTool || step.tool !== capability.primaryTool) && !uniformContinuousField) {
      return `step "${step.id}" method_id=${step.methodId} requires primary tool ${capability.primaryTool ?? 'none'}, got ${step.tool}`;
    }
    if (capability.preparationAnyOf?.length
      && !preparationSteps.some(preparation => capability.preparationAnyOf!.includes(preparation.tool))) {
      return `step "${step.id}" method_id=${step.methodId} requires one explicit preparation step from: ${capability.preparationAnyOf.join(', ')}`;
    }

    if (capability.methodClass === 'preset-brush' && plan.paintStrategy?.presetName) {
      const selectedPreset = [...preparationSteps].reverse()
        .find(preparation => preparation.tool === 'photoshop_select_brush_preset');
      if (!selectedPreset || selectedPreset.args?.name !== plan.paintStrategy.presetName) {
        return 'brush role ' + plan.paintStrategy.brushRole
          + ' requires preset ' + plan.paintStrategy.presetName
          + ' to be selected before mutation';
      }
    }

    for (const requiredTool of capability.preparationTools ?? []) {
      if (!preparationSteps.some(preparation => preparation.tool === requiredTool)) {
        return `step "${step.id}" method_id=${step.methodId} requires preparation step ${requiredTool} before visual mutation`;
      }
    }

    const brushHints = capability.executionHints?.brush;
    if (brushHints && typeof brushHints === 'object' && !Array.isArray(brushHints)) {
      const setBrush = [...preparationSteps].reverse().find(preparation => preparation.tool === 'photoshop_set_brush');
      if (!setBrush) {
        return `step "${step.id}" method_id=${step.methodId} requires photoshop_set_brush matching execution hints`;
      }
      for (const [key, expected] of Object.entries(brushHints as Record<string, unknown>)) {
        if (setBrush.args?.[key] !== expected) {
          return `step "${step.id}" method_id=${step.methodId} requires photoshop_set_brush.${key}=${String(expected)}, got ${String(setBrush.args?.[key])}`;
        }
      }
    }

    const strokeTool = capability.executionHints?.stroke_tool;
    if (typeof strokeTool === 'string') {
      const strokes = step.args?.strokes;
      if (!Array.isArray(strokes) || strokes.length === 0) {
        return `step "${step.id}" method_id=${step.methodId} requires non-empty strokes using ${strokeTool}`;
      }
      const mismatch = strokes.some(stroke =>
        !stroke || typeof stroke !== 'object' || Array.isArray(stroke)
        || String((stroke as Record<string, unknown>).tool ?? 'BRUSH').toUpperCase() !== strokeTool
      );
      if (mismatch) {
        return `step "${step.id}" method_id=${step.methodId} requires every stroke.tool=${strokeTool}`;
      }
    }
  }
  return null;
}

function visualMicroPlanToolSchema(): Tool {
  return {
    name: 'photoshop_execute_visual_microplan',
    description:
      'Execute one bounded semantic visual transaction: preparation calls, optional BEFORE preview, 1-4 tightly related visual mutations in one region/intent/method/risk envelope, then one mandatory AFTER preview. No preview is required between those mutations. The returned final frame MUST be visually classified before another micro-plan.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: 'Unique id for this short-horizon visual micro-plan.',
        },
        summary: {
          type: 'string',
          description: 'One short sentence describing the single visual problem being addressed.',
        },
        stage: {
          type: 'string',
          description: 'Current painting stage; all steps must remain within this one stage decision.',
        },
        scale: {
          type: 'string',
          description: 'Current scale band (for example global, medium, small).',
        },
        region: {
          type: 'string',
          description: 'One semantic region or inseparable region set affected by the bundle.',
        },
        region_bounds: {
          type: 'object',
          properties: {
            left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' },
          },
          required: ['left', 'top', 'right', 'bottom'],
          additionalProperties: false,
          description: 'Optional document-space bounds for the one semantic region affected by this transaction.',
        },
        object_context_region_bounds: {
          type: 'object',
          properties: {
            left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' },
          },
          required: ['left', 'top', 'right', 'bottom'],
          additionalProperties: false,
          description: 'Optional broader exact semantic/object bounds retained as context when region_bounds is a tight MICRO target.',
        },
        intent: {
          type: 'string',
          description: 'One artistic intent shared by every mutation in the transaction.',
        },
        method_class: {
          type: 'string',
          enum: [...VISUAL_MICROPLAN_METHOD_CLASSES],
          description: 'Compatible execution class shared by all visual mutations in the transaction.',
        },
        risk: {
          type: 'string',
          enum: [...VISUAL_MICROPLAN_RISKS],
          description: 'Maximum declared visual risk for the transaction; a higher-risk step cannot be hidden inside it.',
        },
        expected_visual_delta: {
          type: 'string',
          description: 'Specific visible before/after delta expected from the whole semantic transaction.',
        },
        verification_envelope: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['after_only', 'before_after'] },
            min_focus_dimension_px: { type: 'number', minimum: 1 },
          },
          required: ['mode'],
          additionalProperties: false,
          description: 'Preview contract for the transaction. subtle_local requires before_after and at least 800 px local inspection.',
        },
        planner_directive_id: {
          type: 'string',
          description: 'Active Art Director directive id. When present, planner_task_id, painter_scope and change_domains are also required and Guard validates them before dispatch.',
        },
        planner_task_id: {
          type: 'string',
          description: 'Bounded task id from the active Art Director directive.',
        },
        painter_scope: {
          type: 'string',
          enum: [...VISUAL_MICROPLAN_PAINTER_SCOPES],
          description: 'Painter reasoning scope. Painter executes local/medium directive tasks; global changes require an Art Director review.',
        },
        change_domains: {
          type: 'array',
          items: { type: 'string', enum: [...VISUAL_MICROPLAN_CHANGE_DOMAINS] },
          description: 'Declared causal change domains. Guard blocks domains forbidden by the active Art Director directive before Photoshop dispatch.',
        },
        affected_relations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only the compact artistic relationships this pass may affect.',
        },
        affected_qualities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only the achieved qualities this pass may affect.',
        },
        preservation_facts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Concrete facts proving an explicitly independent pass preserves the blocked/dependent region.',
        },
        independent_region: {
          type: 'boolean',
          description: 'True only when this task is causally independent of an unresolved primary mismatch.',
        },
        addresses_primary_mismatch: {
          type: 'boolean',
          description: 'True when this pass directly addresses the current primary mismatch.',
        },
        addresses_problem_id: {
          type: 'string',
          description: 'Stable unresolved problem id directly addressed by this pass.',
        },
        paint_strategy: {
          type: 'object',
          description:
            'Construction-first execution contract. construction_role is mandatory for broad/global softness-dominant or environmental work. continuous-field defaults to continuous-color-field. optical-veil may use a generic soft dab-chain only as an explicit justified fallback.',
          properties: {
            construction_role: { type: 'string', enum: [...PAINTING_CONSTRUCTION_ROLES] },
            material_role: { type: 'string' },
            visual_intent: { type: 'string', enum: [...PAINTING_VISUAL_INTENTS] },
            fallback_from_method_id: {
              type: 'string',
              description: 'Preferred method that could not be used when execution intentionally falls back to another mechanism.',
            },
            fallback_reason: {
              type: 'string',
              description: 'Optional capability/fit audit guidance for the fallback; fallback_from_method_id carries executable routing authority.',
            },
            brush_role: { type: 'string' },
            preset_name: { type: 'string' },
            selection_reason: {
              type: 'string',
              minLength: 12,
              description: 'Concrete evidence-fit reason for choosing this preset from a multi-candidate brush role (mark topology/edge/buildup/scale/dynamics), not a generic preference label.',
            },
            brush_pack_id: { type: 'string' },
            stamp_profile_id: { type: 'string' },
            pressure_policy: { type: 'string', enum: [...VISUAL_MICROPLAN_PRESSURE_POLICIES] },
          },
          required: ['material_role', 'visual_intent', 'pressure_policy'],
          additionalProperties: false,
        },
        material_response: {
          type: 'object',
          description: 'Optional qualitative material-response plan, validated when supplied. Exact-frame review determines material quality; texture density or noise cannot certify it.',
          properties: {
            response_role: { type: 'string', enum: [...MATERIAL_RESPONSE_ROLES] },
            components: {
              type: 'object',
              properties: Object.fromEntries(MATERIAL_RESPONSE_COMPONENTS.map(key => [key, {
                type: 'object',
                properties: {
                  applicability: { type: 'string', enum: [...MATERIAL_RESPONSE_PLAN_APPLICABILITY] },
                  intent: { type: 'string', minLength: 8 },
                },
                required: ['applicability', 'intent'],
                additionalProperties: false,
              }])),
              required: [...MATERIAL_RESPONSE_COMPONENTS],
              additionalProperties: false,
            },
            microtexture: {
              type: 'object',
              properties: {
                policy: { type: 'string', enum: [...MATERIAL_RESPONSE_MICROTEXTURE_POLICIES] },
                intent: { type: 'string', minLength: 8 },
              },
              required: ['policy', 'intent'],
              additionalProperties: false,
            },
            style_contract_basis: {
              type: 'object',
              description: 'Exact durable style-contract escape for intentionally simplified/flat material treatment; never an implicit realism override.',
              properties: {
                field: { type: 'string', enum: [...MATERIAL_RESPONSE_STYLE_BASIS_FIELDS] },
                criterion: { type: 'string', minLength: 8 },
              },
              required: ['field', 'criterion'],
              additionalProperties: false,
            },
          },
          required: ['response_role', 'components', 'microtexture'],
          additionalProperties: false,
        },
        edges: {
          type: 'array',
          description: 'Boundary-specific edge intents. Each edge must bind to at least one mutation step via edge_boundary_ids, and that step must declare an executable method_id compatible with the edge class.',
          items: {
            type: 'object',
            properties: {
              boundary_id: { type: 'string' },
              region_a: { type: 'string' },
              region_b: { type: 'string' },
              class: { type: 'string', enum: [...EDGE_CLASSES] },
              expected_behavior: { type: 'string' },
              preferred_method_id: { type: 'string' },
            },
            required: ['boundary_id', 'region_a', 'region_b', 'class'],
            additionalProperties: false,
          },
        },
        layer_separation_check: {
          type: 'object',
          properties: {
            change_kind: {
              type: 'string',
              enum: [...VISUAL_MICROPLAN_LAYER_CHANGE_KINDS],
              description:
                'Whether this pass continues an existing rollback unit or introduces a new object, material, light effect, plane, or other visual concern.',
            },
            substantial: {
              type: 'boolean',
              description:
                'True when the change is visually substantial rather than a tiny accent or incidental continuation.',
            },
            rollback_value: {
              type: 'string',
              enum: [...VISUAL_MICROPLAN_ROLLBACK_VALUES],
              description:
                'Value of being able to adjust, mask, weaken, recolor, protect, or roll back this change independently.',
            },
            independent_adjustment_expected: {
              type: 'boolean',
              description:
                'True when the new concern is likely to need independent adjustment, masking, weakening, recoloring, protection, transform, or rollback.',
            },
            reasons: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional artistic/audit guidance for separating or deliberately keeping the pass on the current logical layer.',
            },
          },
          required: [
            'change_kind',
            'substantial',
            'rollback_value',
            'independent_adjustment_expected',
          ],
          additionalProperties: false,
          description:
            'Mandatory Layer Separation Check. Substantial new objects/materials/lights/planes with independent correction value must use create-new or temporary-hypothesis; ordinary continuations stay on existing layers to avoid layer spam.',
        },
        logical_layer: {
          type: 'object',
          properties: {
            decision: { type: 'string', enum: [...VISUAL_MICROPLAN_LOGICAL_LAYER_DECISIONS] },
            hypothesis_id: { type: 'string' },
            hypothesis: { type: 'string' },
            rollback_value: { type: 'string', enum: [...VISUAL_MICROPLAN_ROLLBACK_VALUES] },
            expected_independent_rollback: { type: 'boolean' },
            separation_reasons: { type: 'array', items: { type: 'string' }, description: 'Optional audit/artistic guidance. Isolation authority comes from the structured Layer Separation Check plus rollback semantics.' },
            layer_id: { type: 'number', minimum: 1 },
            layer_name: { type: 'string' },
            merge_target_layer_id: { type: 'number', minimum: 1 },
            physical_role: {
              type: 'string',
              enum: [...VISUAL_MICROPLAN_PHYSICAL_ROLES],
              description: 'Physical scene role. Opaque/support masses establish occlusion; transmissive/optical/atmospheric roles are intentionally non-opaque overlays or media.',
            },
            opacity_role: {
              type: 'string',
              enum: [...VISUAL_MICROPLAN_OPACITY_ROLES],
              description: 'Physical opacity contract for this semantic owner; do not use transparency merely to soften an otherwise opaque scene mass.',
            },
            construction_tier: {
              type: 'string', enum: [...VISUAL_MICROPLAN_CONSTRUCTION_TIERS],
              description: 'Subject-agnostic construction hierarchy: primary -> secondary -> tertiary -> surface.',
            },
            parent_hypothesis_id: {
              type: 'string',
              description: 'Stable semantic owner that must already establish the structure this owner depends on. Required for non-primary tiers.',
            },
            parent_construction_revision: {
              type: 'string',
              description: 'Guard-owned durable revision of the parent structure. Compact Guard injects this; callers should not invent it.',
            },
            construction_change: {
              type: 'boolean',
              description: 'True only when this pass structurally revises the owner so dependent construction must be reconsidered; ordinary tone/texture continuation leaves the construction revision stable.',
            },
            geometry_binding: {
              type: 'object',
              description: 'Guard-normalized durable binding from this semantic owner to the exact accepted scene-geometry model revision and its support/family/dependency structure.',
            },
            camera_binding: {
              type: 'object',
              description: 'Durable E.20 focus/depth binding to the exact active camera model revision and either this owner\'s accepted E.18 geometry or an explicit approximate-depth rationale.',
              properties: {
                scene_camera_model_id: { type: 'string' },
                scene_camera_revision: { type: 'integer', minimum: 1 },
                geometry_binding_owner_id: { type: 'string' },
                depth_role: { type: 'string', enum: ['near', 'focal', 'mid', 'far'] },
                expected_focus_role: { type: 'string', enum: ['sharp', 'moderately_soft', 'soft', 'lost'] },
                dependency_domains: {
                  type: 'array', minItems: 1, maxItems: 4,
                  items: { type: 'string', enum: ['focus', 'motion', 'optical-response', 'capture-finish'] },
                },
                local_exception: { type: 'string' },
                approximate_depth_rationale: { type: 'string' },
              },
              required: ['scene_camera_model_id', 'scene_camera_revision', 'depth_role', 'expected_focus_role'],
              additionalProperties: false,
            },
            attention_binding: ATTENTION_BINDING_SCHEMA,
            negative_space: {
              type: 'object',
              description: 'Durable structural opening/gap relation. Evidence must describe topology/attachment, not merely sampled background color.',
              properties: {
                relation: { type: 'string', enum: [...VISUAL_MICROPLAN_NEGATIVE_SPACE_RELATIONS] },
                parent_hypothesis_id: { type: 'string' },
                parent_construction_revision: { type: 'string', description: 'Guard-owned parent revision; callers should not invent it.' },
                topology: { type: 'string', minLength: 4 },
                evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 4 } },
              },
              required: ['relation', 'parent_hypothesis_id', 'topology', 'evidence'],
              additionalProperties: false,
            },
            causal_effect: {
              type: 'object',
              description: 'Durable causal effect binding to an established source and, for reflection/shadow, an established receiving surface/medium.',
              properties: {
                relation: { type: 'string', enum: [...VISUAL_MICROPLAN_CAUSAL_EFFECT_RELATIONS] },
                source_hypothesis_id: { type: 'string' },
                source_construction_revision: { type: 'string', description: 'Guard-owned source revision; callers should not invent it.' },
                receiver_hypothesis_id: { type: 'string' },
                receiver_construction_revision: { type: 'string', description: 'Guard-owned receiver revision; callers should not invent it.' },
                causal_statement: { type: 'string', minLength: 4 },
                evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 4 } },
              },
              required: ['relation', 'source_hypothesis_id', 'causal_statement', 'evidence'],
              additionalProperties: false,
            },
            preserve_negative_space_ids: {
              type: 'array', items: { type: 'string' },
              description: 'Durable aperture/negative-space owners explicitly reviewed and preserved while repainting or texturing their parent.',
            },
            surface_frame: {
              type: 'object',
              properties: {
                axes: {
                  type: 'array', minItems: 1, maxItems: 3,
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      angle_degrees: { type: 'number', minimum: -180, maximum: 180 },
                      weight: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
                    },
                    required: ['id', 'angle_degrees'],
                    additionalProperties: false,
                  },
                },
                convergence_anchor: {
                  type: 'object',
                  properties: { x: { type: 'number' }, y: { type: 'number' } },
                  required: ['x', 'y'], additionalProperties: false,
                },
                scene_vanishing_family_ids: {
                  type: 'array', maxItems: 8, items: { type: 'string' },
                  description: 'Optional explicit references to Scene Geometry Model vanishing families inherited by this local surface frame.',
                },
                scene_support_plane_id: {
                  type: 'string',
                  description: 'Optional explicit reference to the owner Scene Geometry Binding support plane.',
                },
                depth_progression: {
                  type: 'object',
                  properties: {
                    near_scale: { type: 'number', exclusiveMinimum: 0 },
                    far_scale: { type: 'number', exclusiveMinimum: 0 },
                    direction: { type: 'string', enum: ['toward-anchor', 'away-from-anchor'] },
                  },
                  required: ['near_scale', 'far_scale', 'direction'], additionalProperties: false,
                },
                distribution: { type: 'string', enum: ['free', 'directional', 'perspective-regular'] },
                local_exceptions: { type: 'array', items: { type: 'string' } },
              },
              required: ['axes'],
              additionalProperties: false,
              description: 'Optional semantic surface orientation frame. Binds directional/repeated marks to depicted form without requiring a dense vector field.',
            },
            depth_relations: {
              type: 'array',
              maxItems: 1,
              items: {
                type: 'object',
                properties: {
                  relation: { type: 'string', enum: [...VISUAL_MICROPLAN_DEPTH_RELATIONS] },
                  target_hypothesis_id: { type: 'string' },
                },
                required: ['relation', 'target_hypothesis_id'],
                additionalProperties: false,
              },
              description: 'At most one direct semantic stack anchor. Chain owners to express larger depth order; in-front-of/behind must agree with explicit Photoshop layer placement.',
            },
          },
          required: [
            'decision',
            'hypothesis_id',
            'hypothesis',
            'rollback_value',
            'expected_independent_rollback',
          ],
          additionalProperties: false,
          description:
            'Rollback-semantic layer contract. create-new/temporary-hypothesis must create exactly one layer and target it; continue-logical-layer/adjust must reuse one stable layer_id. keep/discard/merge are lifecycle decisions handled separately.',
        },
        cross_layer_correction: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['correction', 'migration'] },
            current_layer_id: { type: 'number', minimum: 1 },
            target_layer_ids: { type: 'array', minItems: 1, items: { type: 'number', minimum: 1 } },
            post_authoritative_layer_id: { type: 'number', minimum: 1 },
            reason: { type: 'string' },
          },
          required: ['mode', 'current_layer_id', 'target_layer_ids', 'post_authoritative_layer_id'],
          additionalProperties: false,
          description: 'Guard-validated authorization for intentionally mutating a historical physical binding of the same semantic owner.',
        },
        problem_id: {
          type: 'string',
          description:
            'Stable identifier for the visual problem across correction attempts. Strongly recommended so retry/replan logic can be scoped to the same problem instead of unrelated recent edits.',
        },
        significance_mode: {
          type: 'string',
          enum: [...VISUAL_MICROPLAN_SIGNIFICANCE_MODES],
          default: 'normal',
          description:
            'Visual significance contract. normal requires a noticeable decoded before/after delta. subtle_local is reserved for deliberately small refinements and requires matching before/after focus previews so a small canvas-area change can still be judged locally.',
        },
        action_class: {
          type: 'string',
          enum: [...VISUAL_MICROPLAN_ACTION_CLASSES],
          description: 'ADD, REFINE, REPLACE, ERASE, or ROLLBACK.',
        },
        expected_visual_result: {
          type: 'string',
          description:
            'Testable before/after hypothesis: the specific visible change expected from this mutation.',
        },
        failure_signals: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Visible failure signals that would falsify or qualify the hypothesis, such as halo, seam, flattened value hierarchy, or primitive footprint.',
        },
        recognition_features: {
          type: 'array',
          minItems: 3,
          maxItems: 7,
          items: { type: 'string' },
          description:
            'For recognition-block-in stages: 3-7 subject cues that must coexist in the first recognizable whole-image pass. Their perceptual importance, not physical size, determines priority.',
        },
        style_recognition_features: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional large-scale style cues that should already read during recognition block-in when the requested style is part of the brief.',
        },
        document_id: {
          type: 'number',
          minimum: 1,
          description:
            'Required pinned Photoshop document id. The executor propagates it to every document-bound internal step and rejects cross-document overrides.',
        },
        pattern_intent: {
          type: 'string',
          enum: ['organic_instances', 'intentional_regular'],
          description: 'Optional repeated-motif intent. intentional_regular is only for deliberate uniform systems; transformed/color-jittered organic instances still require structural variation review.',
        },
        distribution_intent: {
          type: 'string',
          enum: ['organic-clustered', 'directional-broken', 'perspective-regular', 'intentional-uniform'],
          description: 'Optional spatial distribution semantics for repeated marks, separate from motif identity/similarity.',
        },
        motif_instances: {
          type: 'array',
          maxItems: 24,
          description: 'Optional exact source-document motif grouping used only to recover instance-scale geometry/crop evidence.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              category: { type: 'string' },
              region_bounds: {
                type: 'object',
                properties: {
                  left: { type: 'number' }, top: { type: 'number' },
                  right: { type: 'number' }, bottom: { type: 'number' },
                },
                required: ['left', 'top', 'right', 'bottom'],
                additionalProperties: false,
              },
            },
            required: ['id', 'region_bounds'],
            additionalProperties: false,
          },
        },
        protected_regions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Regions that the bundle must not damage.',
        },
        protected_layer_ids: {
          type: 'array',
          items: { type: 'number', minimum: 1 },
          description:
            'Stable layer ids that must not be modified. When present, supported painting mutations must pin their target layer explicitly; execution fails closed before dispatch when the target is unknown or protected.',
        },
        replace_protected_layer_ids: {
          type: 'array',
          items: { type: 'number', minimum: 1 },
          description:
            'Explicit exception for protected layers intentionally replaced/erased by this plan. Every id must also appear in protected_layer_ids and action_class must be REPLACE or ERASE.',
        },
        previous_preview: {
          type: 'object',
          description:
            'Backward-compatible raw-MCP acknowledgement for a prior pending VisualMicroPlan. In the canonical Core controller route, controller verdict releases the same shared durable barrier, so do not resend an already-recorded verdict here.',
          properties: {
            sha256: { type: 'string' },
            observed_change: {
              type: 'string',
              description: 'Factual description of what is visibly different in the classified frame.',
            },
            target_resolved: {
              type: 'string',
              enum: [...VISUAL_MICROPLAN_TARGET_RESOLUTION],
              description: 'Whether the targeted visual problem was actually resolved: yes, no, or uncertain.',
            },
            regressions: {
              type: 'array',
              items: { type: 'string' },
              description: 'New or worsened visible defects. Use an empty array when none are observed.',
            },
            uncertainty: {
              type: 'string',
              description: 'What remains uncertain after inspection; use a concrete value such as "none observed" when clear.',
            },
            verdict: { type: 'string', enum: [...VISUAL_MICROPLAN_VERDICTS] },
            disposition: { type: 'string', enum: [...VISUAL_MICROPLAN_DISPOSITIONS] },
          },
          required: [
            'sha256',
            'observed_change',
            'target_resolved',
            'regressions',
            'uncertainty',
            'verdict',
            'disposition',
          ],
          additionalProperties: false,
        },
        steps: {
          type: 'array',
          minItems: 2,
          maxItems: VISUAL_MICROPLAN_MAX_STEPS,
          description:
            'Ordered preparation steps, optional BEFORE preview, 1-4 contiguous related visual mutations, and one mandatory final AFTER preview. The root intent is authoritative; optional step description/legacy intent is explanatory only. Structural region/method/risk constraints remain fail-closed.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              tool: { type: 'string' },
              args: { type: 'object', additionalProperties: true },
              region: { type: 'string' },
              description: {
                type: 'string',
                description: 'Optional explanatory prose for this step. It is not a second copy of the root artistic intent and is never compared for literal equality.',
              },
              intent: {
                type: 'string',
                description: 'Legacy alias accepted for compatibility; the compiler converts it to description before validation.',
              },
              method_class: { type: 'string', enum: [...VISUAL_MICROPLAN_METHOD_CLASSES] },
              risk: { type: 'string', enum: [...VISUAL_MICROPLAN_RISKS] },
              method_id: { type: 'string' },
              edge_boundary_ids: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'tool'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'plan_id',
        'summary',
        'stage',
        'scale',
        'region',
        'intent',
        'method_class',
        'risk',
        'expected_visual_delta',
        'verification_envelope',
        'layer_separation_check',
        'action_class',
        'expected_visual_result',
        'document_id',
        'steps',
      ],
      additionalProperties: false,
    },
  };
}

export function createVisualMicroPlanTools(registry: ToolRegistry, barrierDirectory?: string): ToolDefinition[] {
  const pendingByDocument = new PreviewBarriers(barrierDirectory);

  return [
    {
      tool: visualMicroPlanToolSchema(),
      handler: async (args) => {
        const prepared = consumePreparedVisualPass(args);
        let plan: VisualMicroPlan;
        if (prepared) {
          args = prepared.args;
          plan = prepared.plan;
        } else {
          args = compileVisualMicroPlan(args);
          const preflight = preflightVisualMicroPlan(args, registry);
          if (preflight) return preflight;
          try {
            plan = parseVisualMicroPlan(args);
          } catch (error) {
            return jsonResult(
              {
                ok: false,
                code: 'invalid_visual_microplan',
                execution: 'not-executed',
                visual_mutation_started: false,
                message: error instanceof Error ? error.message : String(error),
              },
              true
            );
          }
        }

        let pending = pendingByDocument.get(plan.documentId);
        const guardOperationId = currentToolExecutionContext()?.guardOperationId;
        const canonicalGuardDispatch = guardOperationId === plan.planId;
        // The embedded Guard is authoritative for its own dispatch barrier. A stale
        // compatibility barrier left by a prior raw/inner VisualMicroPlan must not
        // resurrect an already-closed verdict and block the guarded continuation.
        // Raw VisualMicroPlan calls have no guardOperationId and keep the full
        // compatibility barrier behavior below.
        if (canonicalGuardDispatch && pending && pending.planId !== plan.planId) {
          pendingByDocument.delete(plan.documentId);
          pending = undefined;
        }
        const barrierError = validatePreviousPreviewBarrier(plan, pending);
        if (barrierError) {
          return jsonResult(
            {
              ok: false,
              code: 'preview_verdict_required',
              execution: 'not-executed',
              visual_mutation_started: false,
              message: barrierError,
              document_id: plan.documentId,
              pending_plan_id: pending?.planId,
              pending_preview_sha256: pending?.sha256,
            },
            true
          );
        }

        // Validate the complete nested command set before any preparation runs.
        // `$steps.*` references are allowed as deferred scalar values here, but
        // all statically knowable structure/ranges (for example empty region
        // contours) must already satisfy each registered tool's public schema.
        const argumentPreflightError = prepared ? null : planArgumentPreflightError(plan, registry);
        if (argumentPreflightError) {
          return jsonResult({
            ok: false,
            code: 'invalid_visual_microplan',
            execution: 'not-executed',
            visual_mutation_started: false,
            message: argumentPreflightError,
            plan_id: plan.planId,
            document_id: plan.documentId,
          }, true);
        }

        // Raw-MCP compatibility: previous_preview may still release a prior
        // barrier. In the canonical controller route, verdict() already released
        // the same shared file, so there is normally nothing to consume here.
        const currentDispatchBarrier = pending?.planId === plan.planId
          && pending.requiresExternalPreview && !pending.sha256;
        const dispatchOwnership = currentDispatchBarrier && pending
          ? {
              ...(pending.operationId ? { operationId: pending.operationId } : {}),
              ...(pending.operationSequence ? { operationSequence: pending.operationSequence } : {}),
            }
          : {};
        if (pending && !currentDispatchBarrier) pendingByDocument.delete(plan.documentId);

        const results: Record<string, unknown> = {};
        const statuses: StepStatus[] = [];
        let beforeCaptureResult: ToolResult | undefined;
        const preparationCache = preparationCacheForPlan(registry, plan);
        const preparationCacheEvents: PreparationCacheDiagnostic[] = [];

        const methodContractError = prepared ? null : methodExecutionError(plan, registry);
        if (methodContractError) {
          return jsonResult({
            ok: false,
            code: 'method_execution_preflight_failed',
            execution: 'not-executed',
            message: methodContractError,
            plan_id: plan.planId,
            document_id: plan.documentId,
            visual_mutation_started: false,
          }, true);
        }

        const staticProtectionError = staticMutationProtectionError(plan, registry);
        if (staticProtectionError) {
          return jsonResult({
            ok: false,
            code: 'protected_layer_violation',
            execution: 'not-executed',
            terminal: true,
            message: staticProtectionError.message,
            plan_id: plan.planId,
            document_id: plan.documentId,
            failed_step: staticProtectionError.step.id,
            protected_layer_ids: plan.protectedLayerIds,
            replace_protected_layer_ids: plan.replaceProtectedLayerIds,
            visual_mutation_started: false,
          }, true);
        }

        const edgePreflight = compileEdgeStrategies(plan, registry);
        if (edgePreflight.error) {
          return jsonResult({
            ok: false,
            code: 'edge_control_preflight_failed',
            execution: 'not-executed',
            terminal: true,
            message: edgePreflight.error,
            plan_id: plan.planId,
            document_id: plan.documentId,
            pass_execution: passExecutionProjection(plan, statuses, 'not-started'),
            visual_mutation_started: false,
          }, true);
        }
        const edgeStrategies = edgePreflight.strategies;

        let sideEffectingPreparationCompleted = false;

        const executeStep = async (step: VisualMicroPlanStep): Promise<ToolResult> => {
          const definition = registry.get(step.tool);
          if (!definition) throw new Error(`tool not found: ${step.tool}`);
          const resolved = resolveVisualMicroPlanArgs(step.args, results);
          if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
            throw new Error(`step "${step.id}" resolved args must be an object`);
          }
          const pinnedArgs = withPinnedDocumentId(
            registry,
            step,
            resolved as Record<string, unknown>,
            plan.documentId
          );
          const validationError = schemaValidationError(
            pinnedArgs,
            definition.tool.inputSchema,
            `step "${step.id}" args`,
            false
          );
          if (validationError) throw new Error(validationError);
          return withToolExecutionStepContext(step.id, () => registry.execute(step.tool, pinnedArgs));
        };

        for (let index = 0; index < plan.mutationIndex; index++) {
          const step = plan.steps[index]!;
          let stepInvoked = false;
          try {
            const resolvedPreparationArgs = resolveVisualMicroPlanArgs(step.args, results);
            if (!resolvedPreparationArgs || typeof resolvedPreparationArgs !== 'object' || Array.isArray(resolvedPreparationArgs)) {
              throw new Error(`step "${step.id}" resolved args must be an object`);
            }
            const pinnedPreparationArgs = withPinnedDocumentId(
              registry,
              step,
              resolvedPreparationArgs as Record<string, unknown>,
              plan.documentId
            );
            const signature = preparationStepSignature(step, pinnedPreparationArgs);
            if (preparationCache.reusable && CACHEABLE_PREPARATION_TOOLS.has(step.tool)) {
              const cached = preparationCache.cache.facts.get(step.tool);
              if (cached?.signature === signature) {
                const event = { reason: 'hit' as const, tool: step.tool, step_id: step.id };
                diagnostic(registry, event);
                preparationCacheEvents.push(event);
                statuses.push({ id: step.id, tool: step.tool, ok: true, execution: 'completed' });
                results[step.id] = structuredClone(cached.result);
                continue;
              }
              const event = {
                reason: cached ? 'miss_signature' as const : 'miss_empty' as const,
                tool: step.tool,
                step_id: step.id,
              };
              diagnostic(registry, event);
              preparationCacheEvents.push(event);
              if (PREPARATION_MUTATION_TOOLS.has(step.tool)) {
                clearPreparationFacts(registry, preparationCache.cache, 'invalidate_preparation_mutation');
                preparationCacheEvents.push({ reason: 'invalidate_preparation_mutation', tool: step.tool, step_id: step.id });
              }
            }
            stepInvoked = true;
            const result = await executeStep(step);
            const ok = result.isError !== true;
            results[step.id] = normalizeToolResultForPlaceholders(result);
            const exactChildNotExecuted = normalizedResultRecord(results[step.id])?.execution === 'not-executed';
            statuses.push({
              id: step.id,
              tool: step.tool,
              ok,
              execution: ok ? 'completed' : exactChildNotExecuted ? 'not-executed' : 'failed-or-uncertain',
            });
            if (ok && preparationCache.reusable && CACHEABLE_PREPARATION_TOOLS.has(step.tool)) {
              preparationCache.cache.facts.set(step.tool, {
                signature,
                tool: step.tool,
                result: structuredClone(results[step.id]),
              });
            }
            if (index === plan.beforeCaptureIndex) beforeCaptureResult = result;
            if (ok && guardExecutionClass(step.tool) === 'preparation-only') {
              sideEffectingPreparationCompleted = true;
            }
            if (!ok) {
              const failureCategory = normalizedFailureCode(results[step.id]);
              const outcome = preparationFailureOutcome({
                step,
                normalizedResult: results[step.id],
                invoked: true,
                priorSideEffectingPreparationCompleted: sideEffectingPreparationCompleted,
              });
              return jsonResult(
                {
                  ok: false,
                  code: 'microplan_prepare_failed',
                  ...outcome,
                  ...(failureCategory ? { failure_category: failureCategory } : {}),
                  message: `preparation step "${step.id}" failed before any visual mutation`,
                  plan_id: plan.planId,
                  document_id: plan.documentId,
                  failed_step: step.id,
                  steps: statuses,
                  pass_execution: passExecutionProjection(plan, statuses, 'not-started', step.id),
                  completed_results: results,
                  repair_scope: 'remaining_only',
                  visual_mutation_started: false,
                },
                true
              );
            }
          } catch (error) {
            const outcome = preparationFailureOutcome({
              step,
              invoked: stepInvoked,
              priorSideEffectingPreparationCompleted: sideEffectingPreparationCompleted,
            });
            return jsonResult(
              {
                ok: false,
                code: 'microplan_prepare_failed',
                ...outcome,
                message: error instanceof Error ? error.message : String(error),
                plan_id: plan.planId,
                document_id: plan.documentId,
                failed_step: step.id,
                steps: statuses,
                pass_execution: passExecutionProjection(plan, statuses, 'not-started', step.id),
                completed_results: results,
                repair_scope: 'remaining_only',
                visual_mutation_started: false,
              },
              true
            );
          }
        }

        const resolvedMutations: Array<{
          step: VisualMicroPlanStep;
          args: Record<string, unknown>;
        }> = [];
        for (const mutationIndex of plan.mutationIndexes) {
          const mutationStep = plan.steps[mutationIndex]!;
          let resolved: unknown;
          try {
            resolved = resolveVisualMicroPlanArgs(mutationStep.args, results);
          } catch (error) {
            return jsonResult(
              {
                ok: false,
                code: 'mutation_argument_resolution_failed',
                ...preVisualDispatchFailureOutcome(sideEffectingPreparationCompleted),
                message: error instanceof Error ? error.message : String(error),
                plan_id: plan.planId,
                document_id: plan.documentId,
                failed_step: mutationStep.id,
                pass_execution: passExecutionProjection(plan, statuses, 'not-started'),
                visual_mutation_started: false,
              },
              true
            );
          }
          if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
            return jsonResult(
              {
                ok: false,
                code: 'mutation_argument_resolution_failed',
                ...preVisualDispatchFailureOutcome(sideEffectingPreparationCompleted),
                message: `step "${mutationStep.id}" resolved args must be an object`,
                plan_id: plan.planId,
                document_id: plan.documentId,
                failed_step: mutationStep.id,
                pass_execution: passExecutionProjection(plan, statuses, 'not-started'),
                visual_mutation_started: false,
              },
              true
            );
          }

          let resolvedMutationArgs: Record<string, unknown>;
          try {
            resolvedMutationArgs = withPinnedDocumentId(
              registry,
              mutationStep,
              resolved as Record<string, unknown>,
              plan.documentId
            );
            const definition = registry.get(mutationStep.tool);
            if (!definition) throw new Error(`tool not found: ${mutationStep.tool}`);
            const validationError = schemaValidationError(
              resolvedMutationArgs,
              definition.tool.inputSchema,
              `step "${mutationStep.id}" args`,
              false
            );
            if (validationError) throw new Error(validationError);
          } catch (error) {
            return jsonResult(
              {
                ok: false,
                code: 'mutation_argument_validation_failed',
                ...preVisualDispatchFailureOutcome(sideEffectingPreparationCompleted),
                message: error instanceof Error ? error.message : String(error),
                plan_id: plan.planId,
                document_id: plan.documentId,
                failed_step: mutationStep.id,
                pass_execution: passExecutionProjection(plan, statuses, 'not-started'),
                visual_mutation_started: false,
              },
              true
            );
          }

          const protectionError = protectedMutationError(plan, mutationStep, resolvedMutationArgs);
          if (protectionError) {
            return jsonResult(
              {
                ok: false,
                code: 'protected_layer_violation',
                ...preVisualDispatchFailureOutcome(sideEffectingPreparationCompleted),
                message: protectionError,
                plan_id: plan.planId,
                document_id: plan.documentId,
                failed_step: mutationStep.id,
                protected_layer_ids: plan.protectedLayerIds,
                replace_protected_layer_ids: plan.replaceProtectedLayerIds,
                pass_execution: passExecutionProjection(plan, statuses, 'not-started'),
                visual_mutation_started: false,
              },
              true
            );
          }
          resolvedMutations.push({ step: mutationStep, args: resolvedMutationArgs });
        }

        // Write BEFORE the first dispatch: interruption must not erase the inspection obligation.
        pendingByDocument.set(plan.documentId, {
          planId: plan.planId,
          ...dispatchOwnership,
          requiresExternalPreview: true,
        });
        let mutationOk = true;
        let mutationFailureStep: string | undefined;
        for (const { step: mutationStep, args: resolvedMutationArgs } of resolvedMutations) {
          let mutationResult: ToolResult;
          try {
            const definition = registry.get(mutationStep.tool);
            if (!definition) throw new Error(`tool not found: ${mutationStep.tool}`);
            mutationResult = await withToolExecutionStepContext(
              mutationStep.id,
              () => registry.execute(mutationStep.tool, resolvedMutationArgs)
            );
          } catch (error) {
            mutationResult = jsonResult(
              {
                ok: false,
                code: 'visual_mutation_execution_error',
                message: error instanceof Error ? error.message : String(error),
              },
              true
            );
          }
          const stepOk = mutationResult.isError !== true;
          results[mutationStep.id] = normalizeToolResultForPlaceholders(mutationResult);
          const childNotExecuted = normalizedResultRecord(results[mutationStep.id])?.execution === 'not-executed';
          statuses.push({ id: mutationStep.id, tool: mutationStep.tool, ok: stepOk,
            execution: stepOk ? 'completed' : childNotExecuted ? 'not-executed' : 'failed-or-uncertain' });
          if (!stepOk) {
            mutationOk = false;
            mutationFailureStep = mutationStep.id;
            break;
          }
        }

        const allVisualNotStarted = passActionOutcomes(plan, statuses, mutationFailureStep)
          .filter(row => row.kind === 'visual-mutation').every(row => row.state === 'not-started');
        if (!mutationOk && allVisualNotStarted && !sideEffectingPreparationCompleted) {
          pendingByDocument.delete(plan.documentId);
          return jsonResult({
            ok: false, code: 'visual_mutation_not_executed', execution: 'not-executed', terminal: true,
            visual_mutation_started: false, plan_id: plan.planId, document_id: plan.documentId,
            failed_mutation_step: mutationFailureStep,
            failure_category: normalizedFailureCode(results[mutationFailureStep!]),
            mutation_results: Object.fromEntries(plan.mutationIndexes.map(index => plan.steps[index]!.id)
              .filter(id => Object.prototype.hasOwnProperty.call(results, id)).map(id => [id, results[id]])),
            steps: statuses, pass_execution: passExecutionProjection(plan, statuses, 'not-started', mutationFailureStep, results),
          }, true);
        }

        // A mutation error may still have partially changed Photoshop (for example
        // an AUTO paint batch timing out after earlier chunks). Never retry here;
        // force the same reconciliation preview as a successful mutation.
        const captureStep = plan.steps[plan.captureIndex]!;
        let captureResult: ToolResult;
        try {
          captureResult = await executeStep(captureStep);
        } catch (error) {
          captureResult = jsonResult(
            {
              ok: false,
              code: 'preview_execution_error',
              message: error instanceof Error ? error.message : String(error),
            },
            true
          );
        }

        const captureOk = captureResult.isError !== true;
        statuses.push({ id: captureStep.id, tool: captureStep.tool, ok: captureOk });
        results[captureStep.id] = normalizeToolResultForPlaceholders(captureResult);

        if (!captureOk) {
          pendingByDocument.set(plan.documentId, {
            planId: plan.planId,
            ...dispatchOwnership,
            requiresExternalPreview: true,
          });
          return jsonResult(
            {
              ok: false,
              code: 'preview_required_before_next_mutation',
              message:
                'the visual mutation ran but its mandatory preview failed; do not retry or start another mutation until photoshop_get_preview succeeds and is visually classified',
              plan_id: plan.planId,
              document_id: plan.documentId,
              mutation_ok: mutationOk,
              mutation_results: Object.fromEntries(
                plan.mutationIndexes
                  .map(index => plan.steps[index]!.id)
                  .filter(id => Object.prototype.hasOwnProperty.call(results, id))
                  .map(id => [id, results[id]])
              ),
              ...(mutationFailureStep ? { failed_mutation_step: mutationFailureStep } : {}),
              ...(mutationFailureStep && normalizedFailureCode(results[mutationFailureStep])
                ? { failure_category: normalizedFailureCode(results[mutationFailureStep]) }
                : {}),
              pass_execution: passExecutionProjection(
                plan,
                statuses,
                mutationOk ? 'completed' : 'failed-or-uncertain',
                mutationFailureStep,
                results
              ),
              steps: statuses,
              barrier: {
                status: 'blocked_until_external_preview_and_verdict',
                next_visual_mutation_allowed: false,
              },
            },
            true
          );
        }

        const metadata = previewMetadata(captureResult);
        const beforeMetadata = beforeCaptureResult ? previewMetadata(beforeCaptureResult) : undefined;
        const sha256 = typeof metadata?.sha256 === 'string' ? metadata.sha256 : undefined;
        if (!sha256) {
          pendingByDocument.set(plan.documentId, {
            planId: plan.planId,
            ...dispatchOwnership,
            requiresExternalPreview: true,
          });
          return jsonResult(
            {
              ok: false,
              code: 'preview_metadata_missing',
              message: 'preview completed but did not return sha256 metadata; barrier remains closed',
              plan_id: plan.planId,
              document_id: plan.documentId,
              mutation_ok: mutationOk,
              pass_execution: passExecutionProjection(
                plan,
                statuses,
                mutationOk ? 'completed' : 'failed-or-uncertain',
                mutationFailureStep
              ),
              steps: statuses,
            },
            true
          );
        }

        pendingByDocument.set(plan.documentId, {
          planId: plan.planId,
          ...dispatchOwnership,
          sha256,
          requiresExternalPreview: false,
        });

        const continuationLayers = plan.steps
          .slice(0, plan.mutationIndex)
          .filter(step => step.tool === 'photoshop_create_layer')
          .map(step => {
            const result = results[step.id];
            if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
            const details = (result as Record<string, unknown>).details;
            if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
            const layerId = (details as Record<string, unknown>).layerId;
            const layerName = (details as Record<string, unknown>).layerName;
            if (typeof layerId !== 'number' || !Number.isSafeInteger(layerId) || layerId <= 0) return null;
            return {
              step_id: step.id,
              layer_id: layerId,
              ...(typeof layerName === 'string' && layerName ? { layer_name: layerName } : {}),
            };
          })
          .filter((value): value is { step_id: string; layer_id: number; layer_name?: string } => value !== null);

        const semanticContinuationLayers = continuationLayers.map(layer => ({
          ...layer,
          ...(plan.logicalLayer?.createStepId === layer.step_id ? {
            hypothesis_id: plan.logicalLayer.hypothesisId,
            hypothesis: plan.logicalLayer.hypothesis,
            rollback_value: plan.logicalLayer.rollbackValue,
            temporary: plan.logicalLayer.decision === 'temporary-hypothesis',
            decision: plan.logicalLayer.decision,
            ...(plan.logicalLayer.physicalRole ? { physical_role: plan.logicalLayer.physicalRole } : {}),
            ...(plan.logicalLayer.opacityRole ? { opacity_role: plan.logicalLayer.opacityRole } : {}),
            ...(plan.logicalLayer.constructionTier ? { construction_tier: plan.logicalLayer.constructionTier } : {}),
            ...(plan.logicalLayer.parentHypothesisId ? { parent_hypothesis_id: plan.logicalLayer.parentHypothesisId } : {}),
            ...(plan.logicalLayer.parentConstructionRevision ? { parent_construction_revision: plan.logicalLayer.parentConstructionRevision } : {}),
            ...(plan.logicalLayer.constructionChange ? { construction_change: true } : {}),
            ...(plan.logicalLayer.geometryBinding ? { geometry_binding: structuredClone(plan.logicalLayer.geometryBinding) } : {}),
            ...(plan.logicalLayer.cameraBinding ? { camera_binding: {
              scene_camera_model_id: plan.logicalLayer.cameraBinding.sceneCameraModelId,
              scene_camera_revision: plan.logicalLayer.cameraBinding.sceneCameraRevision,
              ...(plan.logicalLayer.cameraBinding.geometryBindingOwnerId ? { geometry_binding_owner_id: plan.logicalLayer.cameraBinding.geometryBindingOwnerId } : {}),
              depth_role: plan.logicalLayer.cameraBinding.depthRole,
              expected_focus_role: plan.logicalLayer.cameraBinding.expectedFocusRole,
              dependency_domains: plan.logicalLayer.cameraBinding.dependencyDomains,
              ...(plan.logicalLayer.cameraBinding.localException ? { local_exception: plan.logicalLayer.cameraBinding.localException } : {}),
              ...(plan.logicalLayer.cameraBinding.approximateDepthRationale ? { approximate_depth_rationale: plan.logicalLayer.cameraBinding.approximateDepthRationale } : {}),
            } } : {}),
            ...(plan.logicalLayer.attentionBinding ? { attention_binding: {
              hierarchy_revision: plan.logicalLayer.attentionBinding.hierarchyRevision,
              zone_id: plan.logicalLayer.attentionBinding.zoneId,
              dimensions: plan.logicalLayer.attentionBinding.dimensions,
            } } : {}),
            ...(plan.logicalLayer.negativeSpace ? { negative_space: {
              relation: plan.logicalLayer.negativeSpace.relation,
              parent_hypothesis_id: plan.logicalLayer.negativeSpace.parentHypothesisId,
              ...(plan.logicalLayer.negativeSpace.parentConstructionRevision ? { parent_construction_revision: plan.logicalLayer.negativeSpace.parentConstructionRevision } : {}),
              topology: plan.logicalLayer.negativeSpace.topology,
              evidence: plan.logicalLayer.negativeSpace.evidence,
            } } : {}),
            ...(plan.logicalLayer.causalEffect ? { causal_effect: {
              relation: plan.logicalLayer.causalEffect.relation,
              source_hypothesis_id: plan.logicalLayer.causalEffect.sourceHypothesisId,
              ...(plan.logicalLayer.causalEffect.sourceConstructionRevision ? { source_construction_revision: plan.logicalLayer.causalEffect.sourceConstructionRevision } : {}),
              ...(plan.logicalLayer.causalEffect.receiverHypothesisId ? { receiver_hypothesis_id: plan.logicalLayer.causalEffect.receiverHypothesisId } : {}),
              ...(plan.logicalLayer.causalEffect.receiverConstructionRevision ? { receiver_construction_revision: plan.logicalLayer.causalEffect.receiverConstructionRevision } : {}),
              causal_statement: plan.logicalLayer.causalEffect.causalStatement,
              evidence: plan.logicalLayer.causalEffect.evidence,
            } } : {}),
            ...(plan.logicalLayer.surfaceFrame ? { surface_frame: {
              axes: plan.logicalLayer.surfaceFrame.axes.map(axis => ({ id: axis.id, angle_degrees: axis.angleDegrees, weight: axis.weight })),
              ...(plan.logicalLayer.surfaceFrame.convergenceAnchor ? { convergence_anchor: plan.logicalLayer.surfaceFrame.convergenceAnchor } : {}),
              ...(plan.logicalLayer.surfaceFrame.sceneVanishingFamilyIds?.length ? { scene_vanishing_family_ids: plan.logicalLayer.surfaceFrame.sceneVanishingFamilyIds } : {}),
              ...(plan.logicalLayer.surfaceFrame.sceneSupportPlaneId ? { scene_support_plane_id: plan.logicalLayer.surfaceFrame.sceneSupportPlaneId } : {}),
              ...(plan.logicalLayer.surfaceFrame.depthProgression ? { depth_progression: {
                near_scale: plan.logicalLayer.surfaceFrame.depthProgression.nearScale,
                far_scale: plan.logicalLayer.surfaceFrame.depthProgression.farScale,
                direction: plan.logicalLayer.surfaceFrame.depthProgression.direction,
              } } : {}),
              distribution: plan.logicalLayer.surfaceFrame.distribution,
              local_exceptions: plan.logicalLayer.surfaceFrame.localExceptions,
            } } : {}),
            ...(plan.logicalLayer.depthRelations.length ? {
              depth_relations: plan.logicalLayer.depthRelations.map(relation => ({
                relation: relation.relation,
                target_hypothesis_id: relation.targetHypothesisId,
              })),
            } : {}),
          } : {}),
        }));
        if (
          plan.logicalLayer
          && ['continue-logical-layer', 'adjust'].includes(plan.logicalLayer.decision)
          && plan.logicalLayer.layerId !== undefined
        ) {
          semanticContinuationLayers.push({
            step_id: 'logical-layer-continuation',
            layer_id: (() => {
              if (plan.methodClass !== 'filter') return plan.logicalLayer!.layerId;
              const step = plan.steps[plan.mutationIndexes[0]!]!;
              const result = results[step.id] as Record<string, any> | undefined;
              const data = result?.details ?? result;
              return result?.ok === true && data?.original_preserved === true && data.filter_mode === 'smart-filter'
                && data.source_layer_id === plan.logicalLayer!.layerId && Number.isSafeInteger(data.layer_id) && data.layer_id > 0
                ? data.layer_id : plan.logicalLayer!.layerId;
            })(),
            ...(plan.logicalLayer.layerName ? { layer_name: plan.logicalLayer.layerName } : {}),
            hypothesis_id: plan.logicalLayer.hypothesisId,
            hypothesis: plan.logicalLayer.hypothesis,
            rollback_value: plan.logicalLayer.rollbackValue,
            decision: plan.logicalLayer.decision,
            ...(plan.logicalLayer.physicalRole ? { physical_role: plan.logicalLayer.physicalRole } : {}),
            ...(plan.logicalLayer.opacityRole ? { opacity_role: plan.logicalLayer.opacityRole } : {}),
            ...(plan.logicalLayer.constructionTier ? { construction_tier: plan.logicalLayer.constructionTier } : {}),
            ...(plan.logicalLayer.parentHypothesisId ? { parent_hypothesis_id: plan.logicalLayer.parentHypothesisId } : {}),
            ...(plan.logicalLayer.parentConstructionRevision ? { parent_construction_revision: plan.logicalLayer.parentConstructionRevision } : {}),
            ...(plan.logicalLayer.constructionChange ? { construction_change: true } : {}),
            ...(plan.logicalLayer.geometryBinding ? { geometry_binding: structuredClone(plan.logicalLayer.geometryBinding) } : {}),
            ...(plan.logicalLayer.cameraBinding ? { camera_binding: {
              scene_camera_model_id: plan.logicalLayer.cameraBinding.sceneCameraModelId,
              scene_camera_revision: plan.logicalLayer.cameraBinding.sceneCameraRevision,
              ...(plan.logicalLayer.cameraBinding.geometryBindingOwnerId ? { geometry_binding_owner_id: plan.logicalLayer.cameraBinding.geometryBindingOwnerId } : {}),
              depth_role: plan.logicalLayer.cameraBinding.depthRole,
              expected_focus_role: plan.logicalLayer.cameraBinding.expectedFocusRole,
              dependency_domains: plan.logicalLayer.cameraBinding.dependencyDomains,
              ...(plan.logicalLayer.cameraBinding.localException ? { local_exception: plan.logicalLayer.cameraBinding.localException } : {}),
              ...(plan.logicalLayer.cameraBinding.approximateDepthRationale ? { approximate_depth_rationale: plan.logicalLayer.cameraBinding.approximateDepthRationale } : {}),
            } } : {}),
            ...(plan.logicalLayer.attentionBinding ? { attention_binding: {
              hierarchy_revision: plan.logicalLayer.attentionBinding.hierarchyRevision,
              zone_id: plan.logicalLayer.attentionBinding.zoneId,
              dimensions: plan.logicalLayer.attentionBinding.dimensions,
            } } : {}),
            ...(plan.logicalLayer.negativeSpace ? { negative_space: {
              relation: plan.logicalLayer.negativeSpace.relation,
              parent_hypothesis_id: plan.logicalLayer.negativeSpace.parentHypothesisId,
              ...(plan.logicalLayer.negativeSpace.parentConstructionRevision ? { parent_construction_revision: plan.logicalLayer.negativeSpace.parentConstructionRevision } : {}),
              topology: plan.logicalLayer.negativeSpace.topology,
              evidence: plan.logicalLayer.negativeSpace.evidence,
            } } : {}),
            ...(plan.logicalLayer.causalEffect ? { causal_effect: {
              relation: plan.logicalLayer.causalEffect.relation,
              source_hypothesis_id: plan.logicalLayer.causalEffect.sourceHypothesisId,
              ...(plan.logicalLayer.causalEffect.sourceConstructionRevision ? { source_construction_revision: plan.logicalLayer.causalEffect.sourceConstructionRevision } : {}),
              ...(plan.logicalLayer.causalEffect.receiverHypothesisId ? { receiver_hypothesis_id: plan.logicalLayer.causalEffect.receiverHypothesisId } : {}),
              ...(plan.logicalLayer.causalEffect.receiverConstructionRevision ? { receiver_construction_revision: plan.logicalLayer.causalEffect.receiverConstructionRevision } : {}),
              causal_statement: plan.logicalLayer.causalEffect.causalStatement,
              evidence: plan.logicalLayer.causalEffect.evidence,
            } } : {}),
            ...(plan.logicalLayer.surfaceFrame ? { surface_frame: {
              axes: plan.logicalLayer.surfaceFrame.axes.map(axis => ({ id: axis.id, angle_degrees: axis.angleDegrees, weight: axis.weight })),
              ...(plan.logicalLayer.surfaceFrame.convergenceAnchor ? { convergence_anchor: plan.logicalLayer.surfaceFrame.convergenceAnchor } : {}),
              ...(plan.logicalLayer.surfaceFrame.sceneVanishingFamilyIds?.length ? { scene_vanishing_family_ids: plan.logicalLayer.surfaceFrame.sceneVanishingFamilyIds } : {}),
              ...(plan.logicalLayer.surfaceFrame.sceneSupportPlaneId ? { scene_support_plane_id: plan.logicalLayer.surfaceFrame.sceneSupportPlaneId } : {}),
              ...(plan.logicalLayer.surfaceFrame.depthProgression ? { depth_progression: {
                near_scale: plan.logicalLayer.surfaceFrame.depthProgression.nearScale,
                far_scale: plan.logicalLayer.surfaceFrame.depthProgression.farScale,
                direction: plan.logicalLayer.surfaceFrame.depthProgression.direction,
              } } : {}),
              distribution: plan.logicalLayer.surfaceFrame.distribution,
              local_exceptions: plan.logicalLayer.surfaceFrame.localExceptions,
            } } : {}),
            ...(plan.logicalLayer.depthRelations.length ? {
              depth_relations: plan.logicalLayer.depthRelations.map(relation => ({
                relation: relation.relation,
                target_hypothesis_id: relation.targetHypothesisId,
              })),
            } : {}),
          });
        }

        const body: Record<string, unknown> = {
          ok: mutationOk,
          ...(mutationOk ? {} : { code: 'visual_mutation_failed_or_partial' }),
          plan_id: plan.planId,
          document_id: plan.documentId,
          summary: plan.summary,
          stage: plan.stage,
          scale: plan.scale,
          region: plan.region,
          ...(plan.regionBounds ? { region_bounds: plan.regionBounds } : {}),
          intent: plan.intent,
          ...(plan.changeDomains.length ? { change_domains: plan.changeDomains } : {}),
          method_class: plan.methodClass,
          risk: plan.risk,
          semantic_action_budget: {
            requested_mutations: plan.mutationIndexes.length,
            allowed_mutations: plan.mutationBudget.allowedMutations,
            hard_cap: plan.mutationBudget.hardCap,
            reason: plan.mutationBudget.reason,
          },
          expected_visual_delta: plan.expectedVisualDelta,
          verification_envelope: {
            mode: plan.verificationEnvelope.mode,
            ...(plan.verificationEnvelope.minFocusDimensionPx === undefined
              ? {}
              : { min_focus_dimension_px: plan.verificationEnvelope.minFocusDimensionPx }),
          },
          layer_separation_check: {
            change_kind: plan.layerSeparationCheck.changeKind,
            substantial: plan.layerSeparationCheck.substantial,
            rollback_value: plan.layerSeparationCheck.rollbackValue,
            independent_adjustment_expected: plan.layerSeparationCheck.independentAdjustmentExpected,
            reasons: plan.layerSeparationCheck.reasons,
            requires_isolation: plan.layerSeparationCheck.requiresIsolation,
          },
          ...(plan.logicalLayer ? {
            logical_layer: {
              decision: plan.logicalLayer.decision,
              hypothesis_id: plan.logicalLayer.hypothesisId,
              hypothesis: plan.logicalLayer.hypothesis,
              rollback_value: plan.logicalLayer.rollbackValue,
              expected_independent_rollback: plan.logicalLayer.expectedIndependentRollback,
              separation_reasons: plan.logicalLayer.separationReasons,
              ...(plan.logicalLayer.layerId === undefined ? {} : { layer_id: plan.logicalLayer.layerId }),
              ...(plan.logicalLayer.layerName ? { layer_name: plan.logicalLayer.layerName } : {}),
              ...(plan.logicalLayer.mergeTargetLayerId === undefined ? {} : { merge_target_layer_id: plan.logicalLayer.mergeTargetLayerId }),
              ...(plan.logicalLayer.physicalRole ? { physical_role: plan.logicalLayer.physicalRole } : {}),
              ...(plan.logicalLayer.opacityRole ? { opacity_role: plan.logicalLayer.opacityRole } : {}),
              ...(plan.logicalLayer.constructionTier ? { construction_tier: plan.logicalLayer.constructionTier } : {}),
              ...(plan.logicalLayer.parentHypothesisId ? { parent_hypothesis_id: plan.logicalLayer.parentHypothesisId } : {}),
              ...(plan.logicalLayer.parentConstructionRevision ? { parent_construction_revision: plan.logicalLayer.parentConstructionRevision } : {}),
              ...(plan.logicalLayer.constructionChange ? { construction_change: true } : {}),
              ...(plan.logicalLayer.geometryBinding ? { geometry_binding: structuredClone(plan.logicalLayer.geometryBinding) } : {}),
              ...(plan.logicalLayer.cameraBinding ? { camera_binding: {
                scene_camera_model_id: plan.logicalLayer.cameraBinding.sceneCameraModelId,
                scene_camera_revision: plan.logicalLayer.cameraBinding.sceneCameraRevision,
                ...(plan.logicalLayer.cameraBinding.geometryBindingOwnerId ? { geometry_binding_owner_id: plan.logicalLayer.cameraBinding.geometryBindingOwnerId } : {}),
                depth_role: plan.logicalLayer.cameraBinding.depthRole,
                expected_focus_role: plan.logicalLayer.cameraBinding.expectedFocusRole,
                dependency_domains: plan.logicalLayer.cameraBinding.dependencyDomains,
                ...(plan.logicalLayer.cameraBinding.localException ? { local_exception: plan.logicalLayer.cameraBinding.localException } : {}),
                ...(plan.logicalLayer.cameraBinding.approximateDepthRationale ? { approximate_depth_rationale: plan.logicalLayer.cameraBinding.approximateDepthRationale } : {}),
              } } : {}),
              ...(plan.logicalLayer.attentionBinding ? { attention_binding: {
                hierarchy_revision: plan.logicalLayer.attentionBinding.hierarchyRevision,
                zone_id: plan.logicalLayer.attentionBinding.zoneId,
                dimensions: plan.logicalLayer.attentionBinding.dimensions,
              } } : {}),
              ...(plan.logicalLayer.negativeSpace ? { negative_space: {
                relation: plan.logicalLayer.negativeSpace.relation,
                parent_hypothesis_id: plan.logicalLayer.negativeSpace.parentHypothesisId,
                ...(plan.logicalLayer.negativeSpace.parentConstructionRevision ? { parent_construction_revision: plan.logicalLayer.negativeSpace.parentConstructionRevision } : {}),
                topology: plan.logicalLayer.negativeSpace.topology,
                evidence: plan.logicalLayer.negativeSpace.evidence,
              } } : {}),
              ...(plan.logicalLayer.causalEffect ? { causal_effect: {
                relation: plan.logicalLayer.causalEffect.relation,
                source_hypothesis_id: plan.logicalLayer.causalEffect.sourceHypothesisId,
                ...(plan.logicalLayer.causalEffect.sourceConstructionRevision ? { source_construction_revision: plan.logicalLayer.causalEffect.sourceConstructionRevision } : {}),
                ...(plan.logicalLayer.causalEffect.receiverHypothesisId ? { receiver_hypothesis_id: plan.logicalLayer.causalEffect.receiverHypothesisId } : {}),
                ...(plan.logicalLayer.causalEffect.receiverConstructionRevision ? { receiver_construction_revision: plan.logicalLayer.causalEffect.receiverConstructionRevision } : {}),
                causal_statement: plan.logicalLayer.causalEffect.causalStatement,
                evidence: plan.logicalLayer.causalEffect.evidence,
              } } : {}),
              ...(plan.logicalLayer.preserveNegativeSpaceIds.length ? { preserve_negative_space_ids: plan.logicalLayer.preserveNegativeSpaceIds } : {}),
              ...(plan.logicalLayer.surfaceFrame ? { surface_frame: {
                axes: plan.logicalLayer.surfaceFrame.axes.map(axis => ({ id: axis.id, angle_degrees: axis.angleDegrees, weight: axis.weight })),
                ...(plan.logicalLayer.surfaceFrame.convergenceAnchor ? { convergence_anchor: plan.logicalLayer.surfaceFrame.convergenceAnchor } : {}),
                ...(plan.logicalLayer.surfaceFrame.sceneVanishingFamilyIds?.length ? { scene_vanishing_family_ids: plan.logicalLayer.surfaceFrame.sceneVanishingFamilyIds } : {}),
                ...(plan.logicalLayer.surfaceFrame.sceneSupportPlaneId ? { scene_support_plane_id: plan.logicalLayer.surfaceFrame.sceneSupportPlaneId } : {}),
                ...(plan.logicalLayer.surfaceFrame.depthProgression ? { depth_progression: {
                  near_scale: plan.logicalLayer.surfaceFrame.depthProgression.nearScale,
                  far_scale: plan.logicalLayer.surfaceFrame.depthProgression.farScale,
                  direction: plan.logicalLayer.surfaceFrame.depthProgression.direction,
                } } : {}),
                distribution: plan.logicalLayer.surfaceFrame.distribution,
                local_exceptions: plan.logicalLayer.surfaceFrame.localExceptions,
              } } : {}),
              ...(plan.logicalLayer.depthRelations.length ? {
                depth_relations: plan.logicalLayer.depthRelations.map(relation => ({
                  relation: relation.relation,
                  target_hypothesis_id: relation.targetHypothesisId,
                })),
              } : {}),
            },
          } : {}),
          ...(plan.edges.length ? { edge_control: edgeStrategies } : {}),
          ...(plan.problemId ? { problem_id: plan.problemId } : {}),
          significance_mode: plan.significanceMode,
          action_class: plan.actionClass,
          expected_visual_result: plan.expectedVisualResult,
          failure_signals: plan.failureSignals,
          ...(plan.recognitionFeatures.length ? { recognition_features: plan.recognitionFeatures } : {}),
          ...(plan.styleRecognitionFeatures.length
            ? { style_recognition_features: plan.styleRecognitionFeatures }
            : {}),
          protected_regions: plan.protectedRegions,
          protected_layer_ids: plan.protectedLayerIds,
          replace_protected_layer_ids: plan.replaceProtectedLayerIds,
          acknowledged_previous_preview: previousPreviewSummary(plan.previousPreview),
          ...(beforeMetadata ? { before_preview: beforeMetadata } : {}),
          mutation_results: Object.fromEntries(
            plan.mutationIndexes
              .map(index => plan.steps[index]!.id)
              .filter(id => Object.prototype.hasOwnProperty.call(results, id))
              .map(id => [id, results[id]])
          ),
          mutation_count: plan.mutationIndexes.length,
          ...(mutationFailureStep ? { failed_mutation_step: mutationFailureStep } : {}),
          ...(mutationFailureStep && normalizedFailureCode(results[mutationFailureStep])
            ? { failure_category: normalizedFailureCode(results[mutationFailureStep]) }
            : {}),
          pass_execution: passExecutionProjection(
            plan,
            statuses,
            mutationOk ? 'completed' : 'failed-or-uncertain',
            mutationFailureStep,
            results
          ),
          ...(semanticContinuationLayers.length ? {
            continuation_layers: semanticContinuationLayers,
          } : {}),
          preparation_cache: {
            advisory: true,
            events: preparationCacheEvents,
            reusable: preparationCache.reusable,
            runtime_revision: preparationCache.cache.runtimeRevision,
            document_id: preparationCache.cache.documentId,
            ...(preparationCache.cache.layerProvenance
              ? { layer_provenance: preparationCache.cache.layerProvenance }
              : {}),
          },
          preview: metadata,
          steps: statuses,
          barrier: {
            status: 'awaiting_visual_verdict',
            preview_sha256: sha256,
            next_visual_mutation_allowed: false,
            release: 'controller verdict on the shared durable barrier; raw MCP may use previous_preview for compatibility',
          },
        };

        return {
          content: [
            { type: 'text', text: JSON.stringify(body, null, 2) },
            ...(beforeCaptureResult ? imageContent(beforeCaptureResult) : []),
            ...imageContent(captureResult),
          ],
          ...(mutationOk ? {} : { isError: true }),
        };
      },
    },
  ];
}
