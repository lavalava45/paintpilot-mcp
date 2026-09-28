import { createHash } from 'node:crypto';
import type { ToolRegistry, ToolResult } from '../tool-registry.js';
import { DOCUMENT_ID_SCHEMA_EXCLUDES } from '../document-target.js';
import { compileVisualMicroPlan } from '../visual-microplan-compiler.js';
import { preflightVisualMicroPlanForExecution } from '../../tools/visual-microplan-tools.js';
import { isVisual, parseTexts } from './session-store.js';
import { compileArtisticOperation } from '../artistic-operation-contract.js';
import { paintingMethodCapabilities } from '../painting-method-palette.js';
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
import { normalizeMaterialResponsePlan } from '../material-response.js';

export interface GuardCycleCompilerStore {
  read?(id: string): Record<string, unknown> | undefined;
  collectClosePreviousErrors(input: Record<string, unknown>): string[];
  compactClosureDefaults?(id: string): {
    previous_report?: Record<string, unknown>;
    previous_operation_ack?: Record<string, unknown>;
  };
  compactPassContext?(documentId: number): {
    stage?: string;
    scale?: string;
    painting_profile?: string;
    active_problem_id?: string;
    active_problem_scale?: string;
    brush_roles?: Array<Record<string, unknown>>;
    brush_inventory_scope?: string | null;
    logical_layer_owners?: Array<Record<string, unknown>>;
    art_director?: Record<string, unknown> | null;
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
      projectionContext?: GuardProjectionContext;
      stateOnly?: boolean;
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
}

export interface GuardCycleCompilerOptions {
  collectDynamicOperationViolations?: (
    operation: Record<string, unknown>
  ) => Promise<GuardCycleCompileViolation[]>;
  projectionContext?: GuardProjectionContext;
  nextOperationValidation?: 'full' | 'state-only';
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

type JsonSchemaNode = {
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

function collectSchemaErrors(value: unknown, schemaValue: unknown, path: string): string[] {
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
  message: string
): GuardCycleCompileViolation {
  return { scope, code, message };
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
      target_resolved: targetResolved,
      regressions: regression ? [regression] : [],
      uncertainty: text(observation.uncertainty)
        ?? (compactTarget === 'uncertain' ? 'The delivered frame remains visually uncertain.' : 'none observed'),
      ...(observation.uncertainty_review !== undefined
        ? { uncertainty_review: observation.uncertainty_review }
        : {}),
      observations: Array.isArray(observation.observations)
        ? observation.observations
        : [{ region: 'delivered review frame', visible: compactObserved }],
      primary_mismatch: text(observation.primary_mismatch)
        ?? (compactTarget === 'resolved'
          ? 'No blocking mismatch is visible in the supplied observation.'
          : 'The requested visual target remains unresolved or uncertain in the supplied observation.'),
      global_readability: text(observation.global_readability) ?? 'unknown',
      primitive_footprint: text(observation.primitive_footprint) ?? 'unknown',
      trend_signals: Array.isArray(observation.trend_signals) ? observation.trend_signals : [],
      ...(observation.softness_review !== undefined ? { softness_review: observation.softness_review } : {}),
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

function compactStepMethodClass(step: Record<string, unknown>): string | undefined {
  const args = step.args && typeof step.args === 'object' && !Array.isArray(step.args)
    ? step.args as Record<string, unknown>
    : {};
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

function inferUniqueClassification(input: {
  registry: ToolRegistry;
  goal: string;
  actionClass?: string;
  executionTools: string[];
}): { visualIntent: string; impactClass: string; reason: string } | null {
  const actionClass = (input.actionClass ?? '').trim().toUpperCase();
  if (['REPLACE', 'ERASE', 'ROLLBACK'].includes(actionClass)) return null;
  const goal = input.goal.toLowerCase();
  let visualIntent: string | undefined;
  let impactClass: string | undefined;

  if (/\b(line|stroke|outline|contour)\b/.test(goal)) visualIntent = 'line';
  else if (/\b(soften|soft transition|blend transition|lost edge)\b/.test(goal)) visualIntent = 'soft-transition';
  else if (/\b(texture|textural|grain)\b/.test(goal)) visualIntent = 'texture';
  else if (/\b(tonal|tone|value contrast|contrast)\b/.test(goal)) visualIntent = 'tonal-contrast';
  else if (/\b(mass|silhouette|shape block|block in)\b/.test(goal)) visualIntent = 'mass';

  if (/\b(edge|boundary|contour|outline)\b/.test(goal)) impactClass = 'edge';
  else if (/\b(structur|construct|build|shape|silhouette|mass)\w*\b/.test(goal)) impactClass = 'construct';
  else if (/\b(tonal|tone|value|light)\b/.test(goal)) impactClass = 'tone';
  else if (/\b(texture|textural|grain)\b/.test(goal)) impactClass = 'texture';
  else if (/\b(soften|transition|blend)\b/.test(goal)) impactClass = 'transition';

  if (!visualIntent || !impactClass) return null;
  const available = paintingMethodCapabilities(input.registry).filter(method => {
    if (method.availability === 'unavailable') return false;
    const tools = method.executionTools?.length ? method.executionTools : method.primaryTool ? [method.primaryTool] : [];
    return method.visualIntents.includes(visualIntent as never)
      && method.impactClasses.includes(impactClass as never)
      && input.executionTools.every(tool => tools.includes(tool));
  });
  if (!available.length) return null;
  return {
    visualIntent,
    impactClass,
    reason: `goal/tool classification is unique: ${visualIntent}+${impactClass} for ${input.executionTools.join('|')}`,
  };
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
    violations.push(violation(
      'next_operation',
      'painting_stage_unknown',
      `next_pass.stage=${requestedStage} is not a recognized painting stage and cannot replace durable stage ${durableStage ?? 'none'}`
    ));
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
    violations.push(violation(
      'next_operation',
      'painting_stage_regression_requires_reset',
      `painting_stage_regression_requires_reset: durable stage ${durableStage} cannot move backward to ${stage} from an ordinary Painter pass; supply explicit next_pass.stage_reset only for genuine structural rework`
    ));
    return { stage };
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
  if (!detail || detail.length < 12) {
    violations.push(violation(
      'next_operation',
      'painting_stage_reset_detail_required',
      'next_pass.stage_reset.detail must give a concrete structural reason of at least 12 characters'
    ));
  }
  if (!reason || !PAINTING_STAGE_RESET_REASONS.includes(reason as never) || !detail || detail.length < 12) {
    return { stage };
  }

  return {
    stage,
    stageReset: {
      protocol: 'photoshop.guard.painting_stage_reset.v1',
      from_stage: durableStage,
      to_stage: stage,
      reason,
      detail,
    },
  };
}

function compileCompactPass(
  raw: Record<string, unknown>,
  store: GuardCycleCompilerStore,
  registry: ToolRegistry
): { operation?: Record<string, unknown>; violations: GuardCycleCompileViolation[]; normalizations?: Array<{ code: string; message: string }> } {
  const violations: GuardCycleCompileViolation[] = [];
  const normalizations: Array<{ code: string; message: string }> = [];
  const requestKey = text(raw.request_key);
  const goal = text(raw.goal);
  const documentId = raw.document_id;
  const restoreAnchorOperationId = text(raw.restore_anchor_operation_id);
  const actions = Array.isArray(raw.actions)
    ? structuredClone(raw.actions) as Array<Record<string, unknown>>
    : [];
  if (!requestKey || !goal || (!restoreAnchorOperationId && !actions.length)) {
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
  if (onlyAction && onlyTool && !VISUAL_MICROPLAN_MUTATION_TOOLS.has(onlyTool)) {
    const actionArgs = onlyAction.args && typeof onlyAction.args === 'object' && !Array.isArray(onlyAction.args)
      ? structuredClone(onlyAction.args) as Record<string, unknown>
      : {};
    if (!bootstrap) actionArgs.document_id ??= Number(documentId);
    const context = !bootstrap && Number.isSafeInteger(documentId)
      ? store.compactPassContext?.(Number(documentId)) ?? {}
      : {};
    const art = context.art_director && typeof context.art_director === 'object'
      ? context.art_director as Record<string, unknown>
      : undefined;
    const plannerDirectiveId = text(art?.directive_id);
    const plannerTaskId = text(art?.current_task_id);
    const scale = text(raw.scale) ?? text(context.scale);
    const { stage, stageReset } = bootstrap
      ? { stage: undefined, stageReset: undefined }
      : resolveCompactStageTransition(raw, context, violations);
    const region = text(raw.region) ?? (bootstrap ? 'document-bootstrap' : 'whole-canvas');
    const significanceMode = text(raw.significance_mode) ?? 'normal';
    const regionBounds = raw.region_bounds && typeof raw.region_bounds === 'object' && !Array.isArray(raw.region_bounds)
      ? structuredClone(raw.region_bounds) as Record<string, unknown>
      : undefined;
    const directActionClass = text(raw.action_class)?.toUpperCase();
    const directImpactClass = text(raw.impact_class);
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
      ...(!bootstrap ? { artistic_commentary: goal } : {}),
      ...(plannerDirectiveId && plannerTaskId ? {
        planner_directive_id: plannerDirectiveId,
        planner_task_id: plannerTaskId,
        painter_scope: scale === 'medium' ? 'medium' : 'local',
        change_domains: ['local-tone'],
        ...(Array.isArray(raw.affected_relations) ? { affected_relations: raw.affected_relations } : {}),
        ...(Array.isArray(raw.affected_qualities) ? { affected_qualities: raw.affected_qualities } : {}),
        ...(Array.isArray(raw.preservation_facts) ? { preservation_facts: raw.preservation_facts } : {}),
        ...(raw.independent_region === true ? { independent_region: true } : {}),
        ...(raw.addresses_primary_mismatch === true ? { addresses_primary_mismatch: true } : {}),
        ...(text(raw.addresses_problem_id) ? { addresses_problem_id: text(raw.addresses_problem_id) } : {}),
      } : {}),
    };

    const visualIntent = text(raw.visual_intent);
    const impactClass = text(raw.impact_class);
    if (!bootstrap && isVisual(onlyTool) && canonicalPaintingStage(stage) === 'MATERIAL') {
      if (raw.material_response === undefined) {
        violations.push(violation(
          'next_operation',
          'material_response_plan_required',
          'MATERIAL work requires next_pass.material_response decomposition before visual execution'
        ));
      } else {
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
    if (!bootstrap && (visualIntent || impactClass || text(raw.preferred_method_id))) {
      if (!visualIntent || !impactClass) {
        violations.push(violation(
          'next_operation',
          'artistic_method_contract_incomplete',
          'visual_intent and impact_class must be supplied together when declaring a compact artistic method contract'
        ));
      } else {
        try {
          const plan = compileArtisticOperation(registry, {
            visualIntent: visualIntent as never,
            impactClass: impactClass as never,
            stage,
            preferredMethodId: text(raw.preferred_method_id),
            avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
            documentId: Number(documentId),
            runtimeRevision: UXP_BRIDGE_REVISION,
          });
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
    return { operation: directOperation, violations };
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
  const methodClasses = [...new Set(mutationSteps.map(compactStepMethodClass).filter(Boolean))] as string[];
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
      `next_pass may contain at most ${VISUAL_MICROPLAN_MAX_MUTATIONS} visual mutations; split the artistic stage into sequential Guard passes`
    ));
  }
  const methodClass = methodClasses[0];
  const risk = mutationSteps
    .map(step => compactRiskForMethod(compactStepMethodClass(step)))
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

  const context = store.compactPassContext?.(Number(documentId)) ?? {};
  const { stage, stageReset } = resolveCompactStageTransition(
    raw,
    context,
    violations,
    methodClass === 'region' ? 'GLOBAL_BLOCK_IN' : undefined
  );
  const scale = text(raw.scale) ?? text(context.scale) ?? (methodClass === 'region' ? 'global' : undefined);
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
      `next_pass requests ${mutationSteps.length} visual mutations but adaptive budget allows ${adaptiveMutationBudget.allowedMutations} (${adaptiveMutationBudget.reason}); split/defer the remaining actions before dispatch`
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
  const rawLayerSeparation = raw.layer_separation_check
    && typeof raw.layer_separation_check === 'object'
    && !Array.isArray(raw.layer_separation_check)
    ? structuredClone(raw.layer_separation_check) as Record<string, unknown>
    : undefined;
  const rawLogicalLayer = raw.logical_layer
    && typeof raw.logical_layer === 'object'
    && !Array.isArray(raw.logical_layer)
    ? structuredClone(raw.logical_layer) as Record<string, unknown>
    : undefined;
  const declaredChangeKind = text(rawLayerSeparation?.change_kind)?.toLowerCase();
  const declaredRollbackValue = text(rawLayerSeparation?.rollback_value)?.toLowerCase();
  const declaredRequiresIsolation = rawLayerSeparation?.substantial === true
    && ['new-object', 'new-material', 'new-light', 'new-plane'].includes(declaredChangeKind ?? '')
    && (declaredRollbackValue !== 'low' || rawLayerSeparation?.independent_adjustment_expected === true);
  const semanticCreateMetadataRequired = context.painting_profile === 'nontrivial_painting' && !!createStep;

  if (semanticCreateMetadataRequired && !rawLayerSeparation) {
    violations.push(violation(
      'next_operation',
      'semantic_layer_owner_missing',
      `semantic_layer_owner_missing: nontrivial painting layer creation must declare next_pass.layer_separation_check instead of letting pass structure invent semantic ownership`
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
      'semantic_layer_owner_missing: next_pass.logical_layer requires an explicit next_pass.layer_separation_check'
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

  const owners = Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : [];
  const ownerByHypothesis = new Map(
    owners.map(owner => [text(owner.hypothesis_id), owner]).filter(([key]) => !!key) as Array<[string, Record<string, unknown>]>
  );
  const ownerByLayerId = new Map(
    owners
      .filter(owner => Number.isSafeInteger(owner.layer_id) && Number(owner.layer_id) > 0)
      .map(owner => [Number(owner.layer_id), owner] as [number, Record<string, unknown>])
  );
  const logicalDecision = text(logicalLayer?.decision)?.toLowerCase();
  const logicalHypothesisId = text(logicalLayer?.hypothesis_id);
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

  if (declaredRequiresIsolation && !['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '')) {
    violations.push(violation(
      'next_operation',
      'semantic_layer_isolation_required',
      `semantic_layer_isolation_required: substantial independently adjustable ${declaredChangeKind} work requires logical_layer.decision=create-new|temporary-hypothesis before Photoshop dispatch`
    ));
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
  const constructionRole = text(raw.construction_role);
  let brushRole: Record<string, unknown> | undefined;
  let paintStrategy: Record<string, unknown> | undefined;

  const art = context.art_director && typeof context.art_director === 'object'
    ? context.art_director as Record<string, unknown>
    : undefined;
  const changeDomains = [...new Set(mutationSteps.map(step => compactChangeDomain(compactStepMethodClass(step))))];
  const plannerDirectiveId = text(art?.directive_id);
  const plannerTaskId = text(art?.current_task_id);
  const painterScope = scale === 'medium' ? 'medium' : 'local';
  let visualIntent = text(raw.visual_intent);
  let impactClass = text(raw.impact_class);
  if (visualIntent || impactClass || text(raw.preferred_method_id)) {
    if (!visualIntent || !impactClass) {
      violations.push(violation(
        'next_operation',
        'artistic_method_contract_incomplete',
        'visual_intent and impact_class must be supplied together when declaring a compact artistic method contract'
      ));
    } else {
      let plan;
      try {
        plan = compileArtisticOperation(registry, {
          visualIntent: visualIntent as never,
          impactClass: impactClass as never,
          stage,
          preferredMethodId: text(raw.preferred_method_id),
          avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
          documentId: Number(documentId),
          runtimeRevision: UXP_BRIDGE_REVISION,
        });
      } catch (error) {
        const executedMutationTools = [...new Set(mutationSteps.map(step => text(step.tool)).filter(Boolean))] as string[];
        const inferred = inferUniqueClassification({
          registry,
          goal,
          actionClass,
          executionTools: executedMutationTools,
        });
        if (inferred) {
          visualIntent = inferred.visualIntent;
          impactClass = inferred.impactClass;
          normalizations.push({
            code: 'artistic_classification_normalized',
            message: `Normalized classification metadata only to visual_intent=${visualIntent}, impact_class=${impactClass}; ${inferred.reason}.`,
          });
          try {
            plan = compileArtisticOperation(registry, {
              visualIntent: visualIntent as never,
              impactClass: impactClass as never,
              stage,
              preferredMethodId: text(raw.preferred_method_id),
              avoidMethodIds: Array.isArray(raw.avoid_method_ids) ? raw.avoid_method_ids.map(text).filter(Boolean) as string[] : [],
              documentId: Number(documentId),
              runtimeRevision: UXP_BRIDGE_REVISION,
            });
          } catch {
            plan = undefined;
          }
        }
        if (!plan) {
          violations.push(violation(
            'next_operation',
            'artistic_method_unavailable',
            error instanceof Error ? error.message : String(error)
          ));
        }
      }
      if (plan) {
        const executedMutationTools = [...new Set(mutationSteps.map(step => text(step.tool)).filter(Boolean))] as string[];
        const drift = executedMutationTools.filter(tool => !plan.allowedExecutionTools.includes(tool));
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

  if (methodClass === 'paint') {
    const requestedMaterialRole = text(raw.material_role);
    const rankedStage = paintingStageRank(stage);
    const materialFitnessRequired = rankedStage !== undefined && rankedStage >= 4 && roles.length > 0;
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
        && (!visualIntent || intents.includes(visualIntent.toLowerCase()));
    });
    if (explicitBrushRole) {
      brushRole = candidates.find(role => text(role.role_id) === explicitBrushRole);
      if (!brushRole) {
        violations.push(violation(
          'next_operation',
          'brush_role_material_fitness_mismatch',
          `brush_role=${explicitBrushRole} does not match material_role=${requestedMaterialRole ?? 'unspecified'} and visual_intent=${visualIntent ?? 'unspecified'} in the durable brush_preflight`
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
      if (selectedPreset && !acceptedPresets.has(selectedPreset)) {
        violations.push(violation(
          'next_operation',
          'brush_preset_not_fit_for_role',
          `selected preset ${selectedPreset} is not bound to brush_role=${text(brushRole.role_id)}`
        ));
      }
      selectedPreset ??= text(brushRole.preferred_preset);
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
        pressure_policy: text(brushRole.pressure_policy),
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
    action_class: actionClass,
    problem_id: problemId,
    expected_visual_result: goal,
    failure_signals: [],
    significance_mode: significanceMode,
    ...(text(raw.pattern_intent) ? { pattern_intent: text(raw.pattern_intent) } : {}),
    ...(text(raw.distribution_intent) ? { distribution_intent: text(raw.distribution_intent) } : {}),
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

  if (canonicalPaintingStage(stage) === 'MATERIAL' && actionClass !== 'ROLLBACK') {
    if (raw.material_response === undefined) {
      violations.push(violation(
        'next_operation',
        'material_response_plan_required',
        'MATERIAL work requires next_pass.material_response decomposition before brush/texture execution'
      ));
    } else {
      try {
        normalizeMaterialResponsePlan(raw.material_response, {
          physicalRole: text(logicalLayer?.physical_role),
          opacityRole: text(logicalLayer?.opacity_role),
          constructionRole: text(paintStrategy?.construction_role),
        });
      } catch (error: unknown) {
        violations.push(violation(
          'next_operation',
          'material_response_plan_invalid',
          error instanceof Error ? error.message : String(error)
        ));
      }
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
      visual_review_profile: visualReviewProfile,
      preview_args: {
        max_dimension_px: visualReviewProfile.whole_max_dimension_px,
        quality: 8,
      },
      artistic_commentary: goal,
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
      violations.push(violation(
        'next_operation',
        'invalid_visual_microplan',
        error instanceof Error ? error.message : String(error)
      ));
    }
  }

  for (const message of store.collectPreflightErrors(compiled, {
    plannedPreviousOperationId,
    plannedPreviousVisualVerdict,
    projectionContext: options.projectionContext,
    stateOnly,
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
      registry
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
  const compiledInput = structuredClone(input);
  const violations: GuardCycleCompileViolation[] = [];
  const normalizations: Array<{ code: string; message: string }> = [];
  const internalStateOnlyRevalidation = options.nextOperationValidation === 'state-only';
  const compactPreviousOperationId = text(compiledInput.previous_operation_id);
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
  if (compiledInput.previous_observation !== undefined) {
    const previousOperationId = text(compiledInput.previous_operation_id);
    const expanded = compactObservationToVerdict(compiledInput.previous_observation, normalizations);
    if (expanded) compiledInput.previous_visual_verdict ??= expanded;
    delete compiledInput.previous_observation;
    if (previousOperationId && store.compactClosureDefaults) {
      const defaults = store.compactClosureDefaults(previousOperationId);
      compiledInput.previous_report ??= defaults.previous_report;
      compiledInput.previous_operation_ack ??= defaults.previous_operation_ack;
      compiledInput._compact_closure = true;
    }
  }
  const rawNextPass = compiledInput.next_pass;
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
        'photoshop_guard_cycle next_pass must be an object when supplied'
      ));
    } else {
      const compact = compileCompactPass(rawNextPass as Record<string, unknown>, store, registry);
      violations.push(...compact.violations);
      if (compact.normalizations?.length) normalizations.push(...compact.normalizations);
      if (compact.operation) compiledInput.next_operation = compact.operation;
    }
    delete compiledInput.next_pass;
  }
  const rawNextOperation = compiledInput.next_operation;
  const hasNextOperation = rawNextOperation !== undefined;
  let nextOperation: Record<string, unknown> | undefined;

  if (hasNextOperation && (!rawNextOperation || typeof rawNextOperation !== 'object' || Array.isArray(rawNextOperation))) {
    violations.push(violation(
      'cycle',
      'invalid_next_operation',
      'photoshop_guard_cycle next_operation must be an object when supplied'
    ));
  }
  if (!hasNextOperation) {
    const previousOperationId = compiledInput.previous_operation_id;
    if (typeof previousOperationId !== 'string' || !previousOperationId.trim()) {
      violations.push(violation(
        'cycle',
        'missing_cycle_operation',
        'photoshop_guard_cycle requires next_pass or previous_operation_id for close-only finalization'
      ));
    }
  }

  if (!internalStateOnlyRevalidation && compactPreviousOperationId && !compactPreviousObservationSupplied) {
    violations.push(violation(
      'finalization',
      'previous_observation_required',
      `previous_observation is required to close operation ${compactPreviousOperationId} on the compact Guard contract`
    ));
  } else {
    for (const message of store.collectClosePreviousErrors(compiledInput)) {
      violations.push(violation('finalization', 'previous_operation_finalization_invalid', message));
    }
  }

  if (hasNextOperation && rawNextOperation && typeof rawNextOperation === 'object' && !Array.isArray(rawNextOperation)) {
    const plannedPreviousOperationId = typeof compiledInput.previous_operation_id === 'string'
      ? compiledInput.previous_operation_id.trim() || undefined
      : undefined;
    const plannedPreviousVisualVerdict = !!compiledInput.previous_visual_verdict;
    const next = await compileNextOperation(
      rawNextOperation as Record<string, unknown>,
      store,
      registry,
      plannedPreviousOperationId,
      plannedPreviousVisualVerdict,
      options
    );
    nextOperation = next.operation;
    violations.push(...next.violations);
    normalizations.push(...next.normalizations);
    compiledInput.next_operation = next.operation;
  }

  const unique = uniqueViolations(violations);
  if (!unique.length) return { input: compiledInput, nextOperation, violations: [], normalizations };

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
    : undefined;
  const passContext = nextDocumentId ? store.compactPassContext?.(nextDocumentId) : undefined;
  const artDirector = passContext?.art_director && typeof passContext.art_director === 'object'
    ? passContext.art_director as Record<string, unknown>
    : undefined;
  const currentTaskId = text(artDirector?.current_task_id);
  const tasks = Array.isArray(artDirector?.tasks) ? artDirector.tasks as Array<Record<string, unknown>> : [];
  const currentTask = currentTaskId ? tasks.find(task => text(task.task_id) === currentTaskId) : undefined;
  return {
    input: compiledInput,
    nextOperation,
    violations: unique,
    normalizations,
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
        action: 'correct-and-resubmit-cycle',
        tool: typeof nextOperation?.tool === 'string' ? nextOperation.tool : null,
        replaces_rejection_fingerprint: rejectionFingerprint,
        requirement: 'Correct all listed deterministic cycle errors together, then resubmit the same semantic Guard cycle.',
      },
      compact_correction_recipe: {
        repeat_same_semantic_cycle: true,
        previous_operation_closed: false,
        photoshop_mutation_started: false,
        ...(currentTaskId ? { planner_task_id: currentTaskId } : {}),
        ...(text(currentTask?.status) ? { planner_task_status: text(currentTask?.status) } : {}),
      },
      next_required_action:
        'Correct all listed deterministic finalization and next-operation errors together, then resubmit the same Guard cycle. The previous operation was not closed and no next Photoshop operation was dispatched.',
    }, true),
  };
}
