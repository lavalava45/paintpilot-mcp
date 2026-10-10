import { CHAT_CRITIC_SCHEMA, criticRoleInstruction, criticSpawnHandoff } from '../core/guard/chat-critic.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { EmbeddedGuardRuntime, guardRuntimeErrorCode } from '../core/guard/runtime.js';
import { projectGuardDiagnostics, serializeGuardState } from '../core/guard/response-budget.js';
import { currentToolExecutionContext } from '../core/execution-context.js';
import { ReviewContextCache, type ReviewContextImage } from '../core/guard/review-context-cache.js';
import {
  COMPACT_GUARD_PROTOCOL_VERSION,
  UXP_BRIDGE_REVISION,
  guardProtocolVersionError,
} from '../core/guard/protocol-version.js';
import { visualReviewPackage } from '../core/guard/cycle.js';
import { PAINTING_CONSTRUCTION_ROLES, PAINTING_VISUAL_INTENTS } from '../core/painting-method-palette.js';
import { PAINTING_STAGE_RESET_REASONS } from '../core/painting-stage-policy.js';
import { ATTENTION_BINDING_SCHEMA } from '../core/perceptual-hierarchy.js';
import { collectSchemaErrors, type JsonSchemaNode } from '../core/guard/cycle-compiler.js';
import { SCENE_GEOMETRY_SCHEMA, GEOMETRY_BINDING_SCHEMA } from '../core/geometry-contract.js';
import {
  DEFAULT_BRUSH_SCENE_ROLES,
  MEDIA_MARK_CHARACTERS,
  STAMP_INTENDED_USES,
  executeBrushPackProfileAction,
} from '../core/brush-pack-profile.js';
import {
  VISUAL_MICROPLAN_ACTION_CLASSES,
  VISUAL_MICROPLAN_CONSTRUCTION_TIERS,
  VISUAL_MICROPLAN_LAYER_CHANGE_KINDS,
  VISUAL_MICROPLAN_LOGICAL_LAYER_DECISIONS,
  VISUAL_MICROPLAN_PHYSICAL_ROLES,
  VISUAL_MICROPLAN_OPACITY_ROLES,
  VISUAL_MICROPLAN_DEPTH_RELATIONS,
  VISUAL_MICROPLAN_NEGATIVE_SPACE_RELATIONS,
  VISUAL_MICROPLAN_CAUSAL_EFFECT_RELATIONS,
  VISUAL_MICROPLAN_MAX_LAYER_CREATIONS,
  VISUAL_MICROPLAN_MAX_MUTATIONS,
  VISUAL_MICROPLAN_ROLLBACK_VALUES,
  VISUAL_MICROPLAN_CHANGE_DOMAINS,
} from '../core/visual-microplan.js';
import { DISTRIBUTION_INTENTS } from '../core/guard/mechanical-patterning.js';
import { VISUAL_REVIEW_FINDING_KINDS } from '../core/guard/visual-review-profile.js';
import {
  SOFT_DOMINANCE_CRITERIA,
  SOFT_DOMINANCE_CRITERION_STATUSES,
  SOFT_DOMINANCE_STATUSES,
} from '../core/guard/soft-dominance-review.js';
import {
  REFINEMENT_CHECK_STATUSES,
  REFINEMENT_CRITERIA,
  REFINEMENT_CRITERION_STATUSES,
  REFINEMENT_STYLE_BASIS_FIELDS,
  REPRESENTATION_CHANGE_STATUSES,
} from '../core/refinement-check.js';
import {
  MATERIAL_RESPONSE_COMPONENTS,
  MATERIAL_RESPONSE_MICROTEXTURE_POLICIES,
  MATERIAL_RESPONSE_MICROTEXTURE_REVIEW_STATUSES,
  MATERIAL_RESPONSE_PLAN_APPLICABILITY,
  MATERIAL_RESPONSE_REVIEW_STATUSES,
  MATERIAL_RESPONSE_ROLES,
  MATERIAL_RESPONSE_STYLE_BASIS_FIELDS,
} from '../core/material-response.js';
import { EDGE_CLASSES } from '../core/edge-control.js';
import {
  PHYSICAL_STACK_CHECK_STATUSES,
  PHYSICAL_STACK_CRITERIA,
  PHYSICAL_STACK_CRITERION_STATUSES,
} from '../core/physical-stack-check.js';
import { sceneOwnershipPlanSchema } from '../core/scene-ownership-plan.js';
import { CONSTRUCTION_MODEL_SCHEMA, CONSTRUCTION_PASS_SCHEMA, ConstructionError, constructionReviewTarget, solveConstruction } from '../core/object-construction.js';
import { PAINTERLY_PASS_SCHEMA } from '../core/painterly-strokes.js';
import { PAINTING_COMPLETION_SCHEMA } from '../core/guard/document-artistic-debt.js';
import { SCENE_CAMERA_IMAGING_MODEL_SCHEMA } from '../core/scene-camera-imaging-model.js';
import { IMAGING_PREFLIGHT_SCHEMA } from '../core/imaging-preflight.js';
import {
  PAINTING_INTENT_ACTIONS,
  PAINTING_INTENT_SCALES,
  PAINTING_INTENT_VISUAL_INTENTS,
} from '../core/guard/painting-intent.js';

const REVIEW_IMAGE_MAX_BLOCKS = 4;

// Stored Director records include runtime metadata/null optional defaults. Expose
// an editable public template without deleting artistic constraints or evidence.
export function publicDirectorTemplate(value: unknown, schema?: JsonSchemaNode): unknown {
  if (Array.isArray(value)) return value.map(item => publicDirectorTemplate(item, schema?.items));
  if (!value || typeof value !== 'object' || !schema?.properties) return value;
  const properties = schema.properties;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => {
      const child = properties[key];
      if (!child) return false;
      if (schema.required?.includes(key)) return true;
      if (item === null) return false;
      if (Array.isArray(item) && !item.length && child.minItems) return false;
      if (item && typeof item === 'object' && !Array.isArray(item) && !Object.keys(item).length && child.required?.length) return false;
      return true;
    })
    .map(([key, item]) => [key, publicDirectorTemplate(item, properties[key])]));
}
const REVIEW_RESPONSE_MAX_BYTES = 6 * 1024 * 1024;
const REVIEW_METADATA_RESERVE_BYTES = 256 * 1024;
const REVIEW_IMAGE_MAX_ENCODED_BYTES = REVIEW_RESPONSE_MAX_BYTES - REVIEW_METADATA_RESERVE_BYTES;

function base64EncodedBytes(rawBytes: number): number {
  return 4 * Math.ceil(rawBytes / 3);
}

interface ReviewFrameReference {
  role?: string;
  sha256?: string;
  materialized_path?: string;
  mime_type?: string;
  width?: number | null;
  height?: number | null;
  region?: unknown;
  crop?: ReviewFrameReference;
}

interface GuardReviewPackage {
  operation_id?: string;
  after?: ReviewFrameReference | null;
  before?: ReviewFrameReference | null;
  review_evidence?: ReviewFrameReference[];
  delivery_policy?: { preferred_content_order?: unknown };
  delivery?: Record<string, unknown>;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function reviewPackageOf(value: unknown): GuardReviewPackage | undefined {
  const root = recordValue(value);
  if (!root) return undefined;
  const direct = recordValue(root.visual_review);
  if (direct) return direct as GuardReviewPackage;
  const result = recordValue(root.result);
  const nested = result ? recordValue(result.visual_review) : undefined;
  if (nested) return nested as GuardReviewPackage;
  return undefined;
}

function reviewRequestedRoles(review: GuardReviewPackage): string[] {
  return Array.isArray(review?.delivery_policy?.preferred_content_order)
    ? review.delivery_policy.preferred_content_order.filter((role: unknown): role is string => typeof role === 'string')
    : (review?.after ? ['after'] : []);
}

function reviewRoleFrame(review: GuardReviewPackage, role: string): ReviewFrameReference | undefined {
  return role === 'after' ? review.after ?? undefined
    : role === 'after_crop' ? review.after?.crop ?? undefined
      : role === 'before_crop' ? review.before?.crop ?? undefined
        : role === 'before' ? review.before ?? undefined
          : Array.isArray(review.review_evidence)
            ? review.review_evidence.find(frame => frame?.role === role)
            : undefined;
}

function referenceOnlyReviewDelivery(review: GuardReviewPackage, runtime?: EmbeddedGuardRuntime): Record<string, unknown> {
  const requestedRoles = reviewRequestedRoles(review);
  const references: Array<Record<string, unknown>> = [];
  const omitted: Array<Record<string, unknown>> = [];
  for (const role of requestedRoles) {
    const frame = reviewRoleFrame(review, role);
    const file = frame?.materialized_path;
    const expectedSha = frame?.sha256;
    if (!frame || typeof file !== 'string' || typeof expectedSha !== 'string' || !existsSync(file)) {
      omitted.push({ role, reason: 'materialized_reference_unavailable' });
      continue;
    }
    try {
      if (!statSync(file).isFile()) {
        omitted.push({ role, reason: 'materialized_reference_not_file' });
        continue;
      }
    } catch {
      omitted.push({ role, reason: 'materialized_reference_stat_failed' });
      continue;
    }
    references.push({
      role,
      sha256: expectedSha,
      materialized_path: file,
      ...(typeof frame.mime_type === 'string' ? { mime_type: frame.mime_type } : {}),
      ...(Number.isFinite(frame.width) ? { width: frame.width } : {}),
      ...(Number.isFinite(frame.height) ? { height: frame.height } : {}),
      ...(frame.region ? { region: frame.region } : {}),
    });
  }
  const delivery: Record<string, unknown> = {
    transport: 'materialized_reference',
    references,
    delivered: [],
    omitted,
    raw_image_bytes: 0,
    encoded_image_bytes: 0,
    max_blocks: REVIEW_IMAGE_MAX_BLOCKS,
    max_total_bytes: REVIEW_RESPONSE_MAX_BYTES,
    max_encoded_image_bytes: REVIEW_IMAGE_MAX_ENCODED_BYTES,
    metadata_reserve_bytes: REVIEW_METADATA_RESERVE_BYTES,
    delivery_complete: requestedRoles.length === 0,
    expected_roles: requestedRoles,
    undelivered_roles: [...requestedRoles],
    explicit_review_tool: 'photoshop_guard_review_image',
    note: 'Guard hot-loop responses are reference-only. Call photoshop_guard_review_image explicitly to deliver exact review bytes through MCP image content.',
  };
  const operationId = typeof review.operation_id === 'string' ? review.operation_id : undefined;
  if (runtime && operationId && runtime.store.read(operationId)) {
    const receipt = runtime.store.recordVisualDeliveryReceipt(operationId, delivery);
    delivery.delivered = receipt.delivered ?? [];
    delivery.delivery_complete = receipt.delivery_complete === true;
    delivery.undelivered_roles = receipt.undelivered_roles ?? requestedRoles;
  }
  return delivery;
}

function json(value: unknown, isError = false, runtime?: EmbeddedGuardRuntime): ToolResult {
  const output = value && typeof value === 'object' ? structuredClone(value) : value;
  const review = reviewPackageOf(output);
  if (review) {
    review.delivery = referenceOnlyReviewDelivery(review, runtime);
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(runtime ? projectGuardDiagnostics(output, runtime.runtimeDirectory) : output) }],
    ...(isError ? { isError: true } : {}),
  };
}

function stateJson(value: Record<string, unknown>, runtime: EmbeddedGuardRuntime, surface: 'status' | 'resume'): ToolResult {
  const text = serializeGuardState(value, runtime.runtimeDirectory, surface);
  return {
    content: [{ type: 'text', text }],
    ...(text.startsWith('{"ok":false,"code":"guard_state_projection_requires_public_resume",') ? { isError: true } : {}),
  };
}

const reviewContextCaches = new WeakMap<EmbeddedGuardRuntime, ReviewContextCache>();

async function explicitReviewImageResult(
  runtime: EmbeddedGuardRuntime,
  operationId: string,
  requestedRoles?: string[],
  forceRedelivery = false,
  redeliveryReason?: string
): Promise<ToolResult> {
  const record = runtime.store.read(operationId);
  if (!record?.visual || !record.preview) {
    return json({
      ok: false,
      code: 'guard_review_image_unavailable',
      message: `Visual operation ${operationId} does not have a durable review preview.`,
    }, true);
  }
  if (forceRedelivery && !['images-unavailable', 'delivery-failed'].includes(redeliveryReason ?? ''))
    return json({ ok: false, code: 'guard_review_redelivery_reason_required', execution: 'not-executed',
      next_required_action: 'Inspect the already delivered inline images. Only if unavailable use force_redelivery=true and redelivery_reason=images-unavailable|delivery-failed; do not repeat delivery to confirm a successful result.' }, true);
  const review = visualReviewPackage(record, runtime.store.visualSignificance(operationId));
  if (!review) {
    return json({
      ok: false,
      code: 'guard_review_image_unavailable',
      message: `Visual operation ${operationId} does not have review metadata.`,
    }, true);
  }
  const documentId = Number(record.args?.document_id);
  const projectionContext = Number.isSafeInteger(documentId) && documentId > 0
    ? runtime.store.captureProjectionContext({ capturedAt: Date.now() })
    : undefined;
  const incarnation = runtime.store.currentDocumentIncarnationId(documentId, projectionContext);
  const identityPending = runtime.store.artRunState(documentId, projectionContext)?.document_instance?.identity_pending;
  const contextId = incarnation && !identityPending ? currentToolExecutionContext()?.reviewContextId : undefined;
  const identity = JSON.stringify([documentId, incarnation]);
  let cache = reviewContextCaches.get(runtime);
  if (!cache) { cache = new ReviewContextCache(); reviewContextCaches.set(runtime, cache); }
  const confirmed = (entry: ReviewContextImage): boolean => {
    const source = runtime.store.read(entry.operation_id);
    return source?.verdict?.sha256 === entry.whole_sha256
      && source.visual_delivery?.review_context_id === entry.context_id
      && source.visual_delivery?.bound_whole_sha256 === entry.whole_sha256
      && source.visual_delivery?.delivery_complete === true
      && source.continuation_timing?.review_image_response_boundary_complete === true
      && source.visual_delivery.delivered.some((item: Record<string, unknown>) => item.role === entry.role
        && item.sha256 === entry.sha256 && item.image_delivered_for_review === true);
  };
  const deliveredHere = (entry: ReviewContextImage): boolean => {
    const source = runtime.store.read(entry.operation_id);
    return entry.operation_id === operationId && source.visual_delivery?.review_context_id === entry.context_id
      && source.visual_delivery?.bound_whole_sha256 === entry.whole_sha256
      && source.visual_delivery?.delivery_complete === true
      && source.continuation_timing?.review_image_response_boundary_complete === true
      && source.visual_delivery.delivered.some((item: Record<string, unknown>) => item.role === entry.role
        && item.sha256 === entry.sha256 && item.image_delivered_for_review === true);
  };
  const reusable = (entry: ReviewContextImage) => confirmed(entry) || deliveredHere(entry);
  // A new known chat cannot inherit the assumption that a historical BEFORE was seen.
  const expectedRoles = [...new Set([...reviewRequestedRoles(review),
    ...(contextId && review.before?.sha256 ? ['before'] : []),
  ])];
  const roles = requestedRoles?.length ? requestedRoles : expectedRoles;
  const invalidRoles = roles.filter(role => !expectedRoles.includes(role));
  if (invalidRoles.length) {
    return json({
      ok: false,
      code: 'guard_review_role_invalid',
      message: `Requested review roles are not available for ${operationId}: ${invalidRoles.join(', ')}`,
      available_roles: expectedRoles,
    }, true);
  }
  const forceKey = cache.forcedKey(contextId, identity, operationId, record.preview.sha256, roles);
  if (forceRedelivery && cache.wasForced(forceKey) && record.visual_delivery?.delivery_complete === true)
    return json({ ok: false, code: 'guard_review_repeated_forced_delivery', execution: 'not-executed',
      next_required_action: 'The same exact roles were already redelivered in this host-proven chat. Inspect those images; if still unavailable report the client image-availability blocker. Do not request the same bytes again or invent an observation.' }, true);
  const reviewRequestReceivedAt = new Date().toISOString();

  const images: Array<{ type: 'image'; data: string; mimeType: string }> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const omitted: Array<Record<string, unknown>> = [];
  let totalBytes = 0;
  let totalEncodedBytes = 0;
  const responseImages = new Map<string, number>();
  for (const role of roles) {
    const frame = reviewRoleFrame(review, role);
    const file = frame?.materialized_path;
    const expectedSha = frame?.sha256;
    if (!frame || typeof file !== 'string' || typeof expectedSha !== 'string' || !existsSync(file)) {
      omitted.push({ role, reason: 'materialized_image_unavailable' });
      continue;
    }
    try {
      const stat = statSync(file);
      if (!stat.isFile()) {
        omitted.push({ role, reason: 'materialized_image_not_file' });
        continue;
      }
      // No cached/inline frame can exceed the per-response limit. Reject oversized
      // files before reading; reused frames do not consume the remaining budget.
      const encodedSize = base64EncodedBytes(stat.size);
      if (encodedSize > REVIEW_IMAGE_MAX_ENCODED_BYTES) {
        omitted.push({ role, reason: 'response_byte_budget', bytes: stat.size,
          encoded_bytes: encodedSize, max_total_bytes: REVIEW_RESPONSE_MAX_BYTES });
        continue;
      }
    } catch {
      omitted.push({ role, reason: 'materialized_image_stat_failed' });
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(file);
    } catch {
      omitted.push({ role, reason: 'materialized_image_read_failed' });
      continue;
    }
    const actualSha = createHash('sha256').update(bytes).digest('hex');
    if (actualSha !== expectedSha) {
      omitted.push({ role, reason: 'sha256_mismatch' });
      continue;
    }
    const previous = forceRedelivery ? undefined : cache.image(contextId, identity, actualSha, reusable);
    const sameResponseIndex = responseImages.get(actualSha);
    if (previous || sameResponseIndex !== undefined) {
      delivered.push({ role, sha256: actualSha, image_delivered_for_review: true,
        ...(previous ? { reused_from: { operation_id: previous.operation_id, role: previous.role,
          context_id: previous.context_id, sha256: previous.sha256, confirmed_observation: confirmed(previous), confirmed_delivery: true } }
          : { content_index: sameResponseIndex, reused_from: { same_response_content_index: sameResponseIndex } }),
      });
      continue;
    }
    if (images.length >= REVIEW_IMAGE_MAX_BLOCKS) {
      omitted.push({ role, reason: 'image_block_limit' });
      continue;
    }
    const encodedBytes = base64EncodedBytes(bytes.byteLength);
    if (totalEncodedBytes + encodedBytes > REVIEW_IMAGE_MAX_ENCODED_BYTES) {
      omitted.push({ role, reason: 'response_byte_budget', bytes: bytes.byteLength, encoded_bytes: encodedBytes, max_total_bytes: REVIEW_RESPONSE_MAX_BYTES });
      continue;
    }
    const mimeType = typeof frame.mime_type === 'string' ? frame.mime_type : 'image/jpeg';
    images.push({ type: 'image', data: bytes.toString('base64'), mimeType });
    responseImages.set(actualSha, images.length);
    delivered.push({
      role,
      sha256: actualSha,
      bytes: bytes.byteLength,
      encoded_bytes: encodedBytes,
      content_index: images.length,
      image_delivered_for_review: true,
    });
    totalBytes += bytes.byteLength;
    totalEncodedBytes += encodedBytes;
  }

  const reviewResultReadyAt = new Date().toISOString();
  const delivery = {
    transport: images.length ? 'mcp_image_content_explicit_review'
      : delivered.length ? 'confirmed_same_chat_image_references' : 'metadata_only',
    delivered,
    omitted,
    raw_image_bytes: totalBytes,
    encoded_image_bytes: totalEncodedBytes,
    max_blocks: REVIEW_IMAGE_MAX_BLOCKS,
    max_total_bytes: REVIEW_RESPONSE_MAX_BYTES,
    max_encoded_image_bytes: REVIEW_IMAGE_MAX_ENCODED_BYTES,
    metadata_reserve_bytes: REVIEW_METADATA_RESERVE_BYTES,
    expected_roles: expectedRoles,
    undelivered_roles: expectedRoles.filter(role => !new Set(delivered.map(item => item.role)).has(role)),
    timing: {
      protocol: 'photoshop.guard.continuation_timing.v1',
      request_received_at: reviewRequestReceivedAt,
      result_ready_at: reviewResultReadyAt,
      response_boundary_complete: false,
      semantics: 'server_observed_review_image_tool_boundaries',
    },
  };
  const presentationContext = runtime.store.presentationContext(
    Number.isSafeInteger(documentId) && documentId > 0 ? documentId : undefined,
    projectionContext?.paintingState
  );
  const artisticContinuation = Number.isSafeInteger(documentId) && documentId > 0
    ? runtime.store.artisticContinuationContext(documentId, projectionContext)
    : null;
  const state = projectionContext?.paintingState.documents?.[String(documentId)];
  const director = state?.art_director as { tasks?: Array<Record<string, unknown>> } | undefined;
  const taskId = record.args?.planner_task_id ?? record.planner_task_id;
  const task = director?.tasks?.find(row => row.task_id === taskId);
  // This is a request to the host looking at the delivered pixels, never a server verdict.
  const criticRole = runtime.store.chatCriticRequest(operationId, projectionContext);
  const artisticReview = {
    mode: 'same_chat',
    ...(criticRole ? { critic_role: { ...criticRole, ...(criticRole.required ? {
      instruction: criticRoleInstruction(presentationContext.language),
      optional_spawn: criticSpawnHandoff(criticRole, state ?? {}, record) } : {}) } } : {}),
    status: delivery.undelivered_roles.length === 0 ? 'awaiting_host_observation' : 'awaiting_image_delivery',
    language: presentationContext.language,
    original_brief: state?.original_brief ?? null,
    pass_goal: record.summary ?? record.args?.summary ?? null,
    construction_target: constructionReviewTarget(record),
    painterly_target: record.painterly_provenance ? {
      algorithm: record.painterly_provenance.algorithm,
      source_kind: record.painterly_provenance.source_kind ?? 'aligned-jpeg-reference',
      ...(record.painterly_provenance.authored_form_field ? { authored_form_field: record.painterly_provenance.authored_form_field } : {}),
      owner_id: record.painterly_provenance.owner_id,
      reference_path: record.painterly_provenance.reference_path,
      reference_sha256: record.painterly_provenance.reference_sha256,
      reference_bounds: record.painterly_provenance.reference_bounds,
      stroke_count: record.painterly_provenance.stroke_count,
      deferred_candidates: record.painterly_provenance.levels?.reduce((sum: number, level: Record<string, unknown>) => sum + Number(level.deferred_candidates ?? 0), 0),
      native_pixels_verified: false, artistic_quality_verified: false,
      instruction: 'Judge actual visible form/light/material against the brief and observed reference, including marks outside the intended component. Surrogate errors and generated strokes are not proof. Replan from the current frame; do not replay.',
    } : undefined,
    stage: record.stage ?? record.args?.stage ?? state?.current_stage ?? 'GLOBAL_BLOCK_IN',
    planner_task: task ? { task_id: task.task_id, summary: task.summary } : null,
    after_sha256: record.preview.sha256,
    instruction: presentationContext.language === 'ru'
      ? 'Посмотри на доставленные AFTER и BEFORE: что реально видно в форме, пропорциях, перспективе и освещении относительно исходного задания и выбранного стиля? Не используй отчёт о выполненных командах как доказательство. Запиши видимый результат в previous_observation.observed, самый важный оставшийся недостаток в primary_mismatch и честный target. Если цель не достигнута, следующий painting_intent или next_pass должен исправлять этот недостаток конкретным способом построения; при повторном провале меняй построение, а не добавляй фактуру или блики. Различай улучшение прохода, готовность стадии и всей работы. Если кадра или задания недостаточно, укажи неопределённость. Оцени primitive_footprint относительно формы объекта и задания: при доминировании плоской заготовки/пиктограммы укажи suspect и сохрани дефект объекта; unknown оставляет долг оценки. Успех локального прохода не закрывает этот долг. Полезную начальную заготовку можно сохранить. Дальность сама по себе не требует размытия: оцени воздушную перспективу, фокус, материал и выборочные края отдельно. Смягчение не исправляет геометрию; фильтр не закрывает долг формы только потому, что исчезли углы. Заполненные поля не доказывают качество; дополнительный вызов оценки не нужен.'
      : 'Inspect the delivered AFTER and BEFORE: what is actually visible in form, proportions, perspective and lighting against the original brief and intended style? Do not use executed commands as evidence. Put the visible result in previous_observation.observed, the largest remaining defect in primary_mismatch and an honest target. If the goal is unmet, the next painting_intent or next_pass must address that defect with a concrete construction change; after repeated failure change construction instead of adding texture or highlights. Distinguish pass improvement, stage readiness and whole-image completion. State uncertainty when the frame or brief is insufficient. Assess primitive_footprint against object form and the brief: use suspect for scaffold/pictogram-dominant representation and retain the object defect; unknown leaves assessment debt. Local pass success does not close this debt. Useful initial block-in pixels may be retained. Distance alone does not require blur: assess atmospheric perspective, focus, material and selective edges separately. Softening does not repair geometry; a filter does not clear form debt merely because corners disappear. Filled fields do not prove quality; no separate assessment call is needed.',
  };
  // Continuation projection is review-service work; no external inference is awaited.
  delivery.timing.result_ready_at = new Date().toISOString();
  const receipt = runtime.store.recordVisualDeliveryReceipt(operationId, delivery);
  const body = {
        ok: receipt.delivery_complete === true,
        operation_id: operationId,
        presentation_context: presentationContext,
        artistic_review: artisticReview,
        delivery: {
          ...delivery,
          timing: { ...delivery.timing, result_ready_at: '__guard_review_response_boundary__', response_boundary_complete: true },
          delivered: receipt.delivered,
          delivery_complete: receipt.delivery_complete,
          undelivered_roles: receipt.undelivered_roles,
        },
        ...(artisticContinuation ? { artistic_continuation: artisticContinuation } : {}),
        next_required_action: receipt.delivery_complete
          ? (criticRole?.required ? 'Switch to Critic and review the whole exact scene against original_brief; submit previous_observation.critic_review with the next pass in the SAME cycle_auto. ' : '') + 'Perform artistic_review on the delivered pixels, then continue once with previous_operation_id + previous_observation and a painting_intent or next_pass addressing the largest visible defect. Omit the next pass only to finalize or when the user asked to stop.'
          : 'Some required review roles were not delivered. Request the remaining roles before visual verdict closure.',
  };
  const serialized = JSON.stringify(body, null, 2);
  const readyAt = new Date().toISOString();
  runtime.store.recordReviewResponseBoundary(operationId, receipt, readyAt);
  const briefSha = createHash('sha256').update(JSON.stringify(artisticReview.original_brief)).digest('hex');
  const observedBrief = forceRedelivery ? undefined : cache.brief(contextId, identity, briefSha, confirmed);
  const completeBody = JSON.parse(serialized.replace('"result_ready_at": "__guard_review_response_boundary__"', `"result_ready_at": ${JSON.stringify(readyAt)}`));
  const text = JSON.stringify(projectGuardDiagnostics(completeBody, runtime.runtimeDirectory,
    observedBrief ? { sha256: briefSha, operation_id: observedBrief.operation_id } : undefined));
  if (contextId && receipt.delivery_complete) for (const item of delivered) {
    if (item.reused_from) continue;
    cache.remember({ context_id: contextId, document_identity: identity, sha256: String(item.sha256),
      operation_id: operationId, role: String(item.role), whole_sha256: record.preview.sha256,
      ...(observedBrief ? {} : { brief_sha256: briefSha }),
    }, confirmed);
  }
  if (forceRedelivery && receipt.delivery_complete) cache.rememberForced(forceKey);
  return {
    content: [{ type: 'text', text }, ...images],
    ...(receipt.delivery_complete ? {} : { isError: true }),
  };
}

async function inlineReviewImageResult(runtime: EmbeddedGuardRuntime, operationId: string): Promise<ToolResult | null> {
  const result = await explicitReviewImageResult(runtime, operationId);
  if (result.isError) return null;
  const images = result.content.filter(item => item.type === 'image');
  if (!images.length) return null;
  let body: Record<string, unknown>;
  try {
    const text = result.content.find(item => item.type === 'text');
    body = text?.type === 'text' ? JSON.parse(text.text) : {};
  } catch {
    return null;
  }
  const delivery = body.delivery as Record<string, unknown> | undefined;
  if (delivery?.delivery_complete !== true) return null;
  return result;
}

function compactPassSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      request_key: {
        type: 'string',
        description: 'Unique attempt id; reuse only for the same attempt, never a new mutation.',
      },
      problem_id: {
        type: 'string',
        description: 'Stable problem id across attempts; omit only if request_key also identifies the problem.',
      },
      document_id: { type: 'number', minimum: 1 },
      restore_anchor_operation_id: {
        type: 'string',
        description:
          'Registered primary/alternative anchor operation id instead of actions; recovery verifies exact frame and layer/selection parity.',
      },
      goal: {
        type: 'string',
        description: 'One artistic goal in presentation_context.language; otherwise supply the exact localized chat text in artistic_commentary.',
      },
      artistic_commentary: { type: 'string', description: 'Exact pre-pass chat text in presentation_context.language, saved verbatim; include intent and tool choices, with settings derived from actions.' },
      region: { type: 'string' },
      region_bounds: {
        type: 'object',
        properties: {
          left: { type: 'number' },
          top: { type: 'number' },
          right: { type: 'number' },
          bottom: { type: 'number' },
        },
        required: ['left', 'top', 'right', 'bottom'],
        additionalProperties: false,
        description: 'Optional document-space bounds for focused compact review of the semantic region.',
      },
      object_context_region_bounds: {
        type: 'object',
        properties: {
          left: { type: 'number' },
          top: { type: 'number' },
          right: { type: 'number' },
          bottom: { type: 'number' },
        },
        required: ['left', 'top', 'right', 'bottom'],
        additionalProperties: false,
        description: 'Source-document object bounds for MICRO review; must contain region_bounds.',
      },
      protected_regions: { type: 'array', items: { type: 'string' } },
      protected_layer_ids: { type: 'array', items: { type: 'number', minimum: 1 } },
      replace_protected_layer_ids: {
        type: 'array',
        items: { type: 'number', minimum: 1 },
        description: 'Protected ids intentionally replaced/erased; also list them in protected_layer_ids and set action_class=REPLACE or ERASE.',
      },
      action_class: {
        type: 'string',
        enum: [...VISUAL_MICROPLAN_ACTION_CLASSES],
        description: 'Required for protected-layer REPLACE/ERASE and late-stage paint_regions corrections; otherwise ADD is inferred.',
      },
      stage: {
        type: 'string',
        description: 'Inherit the art-run stage, or GLOBAL_BLOCK_IN initially; moving backwards requires stage_reset.',
      },
      stage_reset: {
        type: 'object',
        description: 'Required for an earlier structural stage; use only for genuine rework, not to unlock early-stage primitives.',
        properties: {
          reason: { type: 'string', enum: [...PAINTING_STAGE_RESET_REASONS] },
          detail: {
            type: 'string',
            description: 'Optional audit guidance describing why the established later-stage basis is invalid and structural rework is required.',
          },
        },
        required: ['reason'],
        additionalProperties: false,
      },
      layer_separation_check: {
        type: 'object',
        description: 'Editability decision; unchanged known-owner continuation inherits it. Required for new ownership, structural changes or rollback reassessment.',
        properties: {
          change_kind: { type: 'string', enum: [...VISUAL_MICROPLAN_LAYER_CHANGE_KINDS] },
          substantial: { type: 'boolean' },
          rollback_value: { type: 'string', enum: [...VISUAL_MICROPLAN_ROLLBACK_VALUES] },
          independent_adjustment_expected: { type: 'boolean' },
          reasons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional artistic/audit guidance for the structural layer-separation decision.',
          },
        },
        required: ['change_kind', 'substantial', 'rollback_value', 'independent_adjustment_expected'],
        additionalProperties: false,
      },
      cross_layer_correction: {
        type: 'object',
        description: 'Authorize edits to historical owner bindings; correction preserves the current binding, migration moves it.',
        properties: {
          mode: { type: 'string', enum: ['correction', 'migration'] },
          current_layer_id: { type: 'number', minimum: 1 },
          target_layer_ids: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { type: 'number', minimum: 1 } },
          post_authoritative_layer_id: { type: 'number', minimum: 1 },
          reason: { type: 'string', description: 'Optional audit guidance for why the cross-layer correction or migration is being performed.' },
        },
        required: ['mode', 'current_layer_id', 'target_layer_ids', 'post_authoritative_layer_id'],
        additionalProperties: false,
      },
      scene_ownership_plan: sceneOwnershipPlanSchema(
        'Declare before semantic layer construction in every rendering profile, including first block-in. semantic_id is one editable part, owner_id its logical layer. objects declare subject_kind and single-part/compound-object; whole people/animals/furniture/windows cannot be single-part. Add units to the same plan without altering old bindings; distinct components require distinct owners/layers and intermediate review.'
      ),
      scene_geometry_model: SCENE_GEOMETRY_SCHEMA,
      construction: { ...CONSTRUCTION_PASS_SCHEMA, description: 'General object proportions/connections and articulated reach/contact/pose edits: model.ik_chains preserves authored bone lengths and joint limits; curve=smooth builds continuous contours. Supply model once, then durable model_id, part_id and explicit color. Generates one component on its own layer. Do not also supply actions. No source reads or extra preparation call.' },
      painterly: PAINTERLY_PASS_SCHEMA,
      scene_camera_imaging_model: SCENE_CAMERA_IMAGING_MODEL_SCHEMA,
      imaging_preflight: IMAGING_PREFLIGHT_SCHEMA,
      scene_lighting_color_model: {
        type: 'object',
        description: 'Incarnation-bound light/color for broad color, atmosphere, relighting and materials; updates keep model_id and increase revision.',
        properties: {
          model_id: { type: 'string' },
          revision: { type: 'number', minimum: 1 },
          source_frame: {
            type: 'object',
            properties: {
              document_id: { type: 'number', minimum: 1 },
              document_incarnation: { type: 'string' },
              operation_id: { type: 'string' },
              preview_sha256: { type: 'string' },
            },
            required: ['document_id', 'document_incarnation'],
            additionalProperties: false,
          },
          global_value_structure: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: ['low', 'mid', 'high', 'mixed'] },
              local_value_anchor: { type: 'string' },
              atmospheric_lift: { type: 'string' },
            },
            required: ['key'],
            additionalProperties: false,
          },
          ambient_environment: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              role: { type: 'string' },
              family: { type: 'string' },
              provenance: { type: 'string', enum: ['user-or-prompt', 'reference-sample', 'accepted-frame', 'deterministic-derivation', 'artist-selected'] },
              sample: {
                type: 'object',
                properties: {
                  rgb: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer', minimum: 0, maximum: 255 } },
                  source: { type: 'string' },
                },
                required: ['rgb', 'source'],
                additionalProperties: false,
              },
              chroma: { type: 'string', enum: ['low', 'medium', 'high'] },
              value_role: { type: 'string' },
            },
            required: ['id', 'role', 'family', 'provenance', 'chroma', 'value_role'],
            additionalProperties: false,
          },
          emitters: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                role: { type: 'string' },
                family: { type: 'string' },
                provenance: { type: 'string', enum: ['user-or-prompt', 'reference-sample', 'accepted-frame', 'deterministic-derivation', 'artist-selected'] },
                sample: {
                  type: 'object',
                  properties: {
                    rgb: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer', minimum: 0, maximum: 255 } },
                    source: { type: 'string' },
                  },
                  required: ['rgb', 'source'],
                  additionalProperties: false,
                },
                light_role: { type: 'string' },
              },
              required: ['id', 'role', 'family', 'provenance', 'light_role'],
              additionalProperties: false,
            },
          },
          atmosphere: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              density_role: { type: 'string' },
              color_bias: { type: 'string' },
              contrast_effect: { type: 'string' },
              provenance: { type: 'string', enum: ['user-or-prompt', 'reference-sample', 'accepted-frame', 'deterministic-derivation', 'artist-selected'] },
            },
            required: ['id', 'density_role', 'color_bias', 'contrast_effect', 'provenance'],
            additionalProperties: false,
          },
          palette_relations: { type: 'array', maxItems: 32, items: { type: 'string' } },
          sampled_anchors: {
            type: 'array',
            maxItems: 24,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                role: { type: 'string' },
                family: { type: 'string' },
                provenance: { type: 'string', enum: ['reference-sample', 'accepted-frame'] },
                sample: {
                  type: 'object',
                  properties: {
                    rgb: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer', minimum: 0, maximum: 255 } },
                    source: { type: 'string' },
                  },
                  required: ['rgb', 'source'],
                  additionalProperties: false,
                },
              },
              required: ['id', 'role', 'family', 'provenance'],
              additionalProperties: false,
            },
          },
          intentional_exceptions: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                relation: { type: 'string' },
                rationale: { type: 'string' },
              },
              required: ['id', 'relation', 'rationale'],
              additionalProperties: false,
            },
          },
        },
        required: ['model_id', 'revision', 'source_frame', 'global_value_structure', 'emitters', 'palette_relations', 'sampled_anchors', 'intentional_exceptions'],
        additionalProperties: false,
      },
      color_gradient_preflight: {
        type: 'object',
        description: 'Required for broad color, relighting, atmosphere and major optical effects; bind the active scene_lighting_color_model revision.',
        properties: {
          scene_model_id: { type: 'string' },
          scene_model_revision: { type: 'number', minimum: 1 },
          field_role: { type: 'string' },
          interaction: { type: 'string' },
          stops: {
            type: 'array',
            minItems: 1,
            maxItems: 16,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                role: { type: 'string' },
                family: { type: 'string' },
                provenance: { type: 'string', enum: ['user-or-prompt', 'reference-sample', 'accepted-frame', 'deterministic-derivation', 'artist-selected'] },
                rgb: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer', minimum: 0, maximum: 255 } },
                source_anchor_id: { type: 'string' },
                artistic_choice: { type: 'string' },
              },
              required: ['id', 'role', 'family', 'provenance'],
              additionalProperties: false,
            },
          },
          required_relations: { type: 'array', maxItems: 24, items: { type: 'string' } },
          artistic_choices: { type: 'array', maxItems: 24, items: { type: 'string' } },
        },
        required: ['scene_model_id', 'scene_model_revision', 'field_role', 'interaction', 'stops'],
        additionalProperties: false,
      },
      logical_layer: {
        type: 'object',
        description: 'Stable owner binding; hypothesis_id, not request_key, identifies the owner across passes.',
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
          physical_role: { type: 'string', enum: [...VISUAL_MICROPLAN_PHYSICAL_ROLES] },
          opacity_role: { type: 'string', enum: [...VISUAL_MICROPLAN_OPACITY_ROLES] },
          construction_tier: { type: 'string', enum: [...VISUAL_MICROPLAN_CONSTRUCTION_TIERS] },
          parent_hypothesis_id: { type: 'string' },
          parent_construction_revision: { type: 'string' },
          construction_change: {
            type: 'boolean',
            description: 'True only when this pass structurally revises the owner; structural revisions require current scene-geometry classification.',
          },
          geometry_binding: GEOMETRY_BINDING_SCHEMA,
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
          },
          negative_space: {
            type: 'object',
            description: 'Structural aperture/negative-space relation to an established semantic parent; background-color matching alone is not structural evidence.',
            properties: {
              relation: { type: 'string', enum: [...VISUAL_MICROPLAN_NEGATIVE_SPACE_RELATIONS] },
              parent_hypothesis_id: { type: 'string' },
              parent_construction_revision: { type: 'string' },
              topology: { type: 'string', minLength: 4 },
              evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 4 } },
            },
            required: ['relation', 'parent_hypothesis_id', 'topology', 'evidence'],
            additionalProperties: false,
          },
          causal_effect: {
            type: 'object',
            description: 'Durable source -> effect causal relation. Reflection/shadow require an established receiver; emission may omit one when the medium is not a separate owner.',
            properties: {
              relation: { type: 'string', enum: [...VISUAL_MICROPLAN_CAUSAL_EFFECT_RELATIONS] },
              source_hypothesis_id: { type: 'string' },
              source_construction_revision: { type: 'string' },
              receiver_hypothesis_id: { type: 'string' },
              receiver_construction_revision: { type: 'string' },
              causal_statement: { type: 'string', minLength: 4 },
              evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 4 } },
            },
            required: ['relation', 'source_hypothesis_id', 'causal_statement', 'evidence'],
            additionalProperties: false,
          },
          preserve_negative_space_ids: {
            type: 'array', items: { type: 'string' },
            description: 'Opening owners explicitly reviewed/preserved while mutating their parent semantic owner.',
          },
          surface_frame: { type: 'object' },
          camera_binding: { type: 'object' },
          attention_binding: ATTENTION_BINDING_SCHEMA,
        },
        required: ['decision', 'hypothesis_id', 'hypothesis', 'rollback_value', 'expected_independent_rollback'],
        additionalProperties: false,
      },
      scale: {
        type: 'string',
        description: 'Inherit art-run scale or default to global; bounded marks use small/local plus region_bounds; broad soft construction needs construction_role.',
      },
      brush_role: {
        type: 'string',
        description: 'Optional preflighted brush role; omit for selection by working scale.',
      },
      material_role: {
        type: 'string',
        description: 'Material/surface role for construction planning and matching refinement to brush_preflight.',
      },
      construction_role: {
        type: 'string',
        enum: [...PAINTING_CONSTRUCTION_ROLES],
        description: 'Choose before broad construction; structured-mass permits early closed masses, while continuous/soft/environmental roles use their matching mechanisms.',
      },
      material_response: {
        type: 'object',
        description: 'Optional material plan bound to role/style/light; omission proves neither quality nor resolved refinement.',
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
        description: 'Boundary-specific edge intents. Each boundary must be referenced by an action edge_boundary_ids entry; expected_behavior may be omitted for the class default.',
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
      style_contract_basis: {
        type: 'object',
        description: 'For primitive-heavy late passes, criterion must exactly match the active Director style_contract field.',
        properties: {
          field: {
            type: 'string',
            enum: ['shape_language', 'material_treatment', 'texture_policy', 'primitive_footprint_tolerance', 'finish_criteria'],
          },
          criterion: { type: 'string', minLength: 4 },
        },
        required: ['field', 'criterion'],
        additionalProperties: false,
      },
      significance_mode: { type: 'string', enum: ['normal', 'subtle_local'] },
      visual_intent: { type: 'string', enum: [...PAINTING_VISUAL_INTENTS] },
      impact_class: {
        type: 'string',
        enum: ['construct', 'subtract', 'edge', 'tone', 'texture', 'transition', 'transform', 'isolate', 'composite', 'cleanup'],
      },
      preferred_method_id: { type: 'string' },
      avoid_method_ids: { type: 'array', items: { type: 'string' } },
      affected_relations: { type: 'array', items: { type: 'string' } },
      affected_qualities: { type: 'array', items: { type: 'string' } },
      preservation_facts: { type: 'array', items: { type: 'string' } },
      change_domains: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string', enum: [...VISUAL_MICROPLAN_CHANGE_DOMAINS] },
      },
      distribution_intent: {
        type: 'string',
        enum: [...DISTRIBUTION_INTENTS],
        description: 'Optional spatial-distribution contract for repeated marks; uses the same vocabulary as previous_observation.',
      },
      independent_region: {
        type: 'boolean',
        description: 'True only when this pass is independent of the currently unresolved primary mismatch; preservation_facts must explain why.',
      },
      addresses_primary_mismatch: { type: 'boolean' },
      addresses_problem_id: { type: 'string' },
      causal_strategy_id: { type: 'string' },
      strategy_family: { type: 'string' },
      causal_escalation_level: { type: 'integer', minimum: 0, maximum: 4 },
      root_cause_classification: {
        type: 'string',
        enum: ['wrong-owner-layer', 'wrong-representation', 'wrong-scale', 'wrong-method-family', 'wrong-silhouette-negative-space', 'wrong-value-form', 'wrong-brush-vocabulary', 'insufficient-evidence'],
        description: 'Required after two failed strategies for the same problem before the single causal-level escalation attempt.',
      },
      brush_preset_choice_reason: {
        type: 'string',
        minLength: 12,
        description: 'When multiple presets fit, explain the selected preset using observed mark behavior.',
      },
      brush_retry_reason: {
        type: 'string',
        minLength: 12,
        description: 'Required when reusing a failed/rolled-back preset despite alternatives; explain why mark fit was not the cause and reuse is justified.',
      },
      root_cause_reason: { type: 'string', minLength: 12 },
      causal_level_change: { type: 'boolean' },
      pattern_intent: {
        type: 'string',
        enum: ['organic_instances', 'intentional_regular'],
        description: 'Optional semantic classification for repeated visible motifs. Use intentional_regular only for deliberate grids/modules/formations; color/transform jitter is not structural variation.',
      },
      motif_instances: {
        type: 'array',
        maxItems: 24,
        description: 'Optional exact source-document grouping for independently visible motif instances when admitted action structure alone cannot recover grouping reliably.',
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
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: 11,
        description: `Ordered actions for one bounded Guard pass, not an entire artistic stage. The current VisualMicroPlan executor supports at most ${VISUAL_MICROPLAN_MAX_MUTATIONS} contiguous visual mutations and at most ${VISUAL_MICROPLAN_MAX_LAYER_CREATIONS} created logical layer in one rollback unit. Preparation must precede the visual transaction. These are executor constraints, not pass-type labels.`,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional technical step key; omitted keys are assigned deterministically. Keep an explicit id when another action references it.' },
            tool: { type: 'string' },
            args: { type: 'object', additionalProperties: true },
            description: { type: 'string' },
            method_id: { type: 'string' },
            edge_boundary_ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['tool'],
          additionalProperties: false,
        },
      },
    },
      required: ['request_key', 'goal'],
    additionalProperties: false,
  };
}

function paintingIntentSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description:
      'Compact artistic decision for the hot loop. Guard derives stable protocol facts from durable state and keeps the existing next_pass validator authoritative. Concrete Photoshop action geometry remains explicit when it cannot be derived uniquely.',
    properties: {
      request_key: { type: 'string' },
      problem_id: { type: 'string' },
      document_id: { type: 'number', minimum: 1 },
      goal: { type: 'string', description: 'Artistic goal; use presentation_context.language or supply the localized chat narration in artistic_commentary.' },
      artistic_commentary: { type: 'string', description: 'Optional exact pre-pass chat narration in presentation_context.language; preserved through compilation independently of the technical goal.' },
      target_owner_id: {
        type: 'string',
        description: 'Existing or predeclared semantic owner. Guard resolves the current physical layer and durable bindings.',
      },
      region: { type: 'string' },
      region_bounds: {
        type: 'object',
        properties: {
          left: { type: 'number' },
          top: { type: 'number' },
          right: { type: 'number' },
          bottom: { type: 'number' },
        },
        required: ['left', 'top', 'right', 'bottom'],
        additionalProperties: false,
      },
      action: { type: 'string', enum: [...PAINTING_INTENT_ACTIONS] },
      scale: { type: 'string', enum: [...PAINTING_INTENT_SCALES] },
      visual_intent: { type: 'string', enum: [...PAINTING_INTENT_VISUAL_INTENTS] },
      material_role: { type: 'string' },
      preferred_method_id: { type: 'string' },
      preferred_brush_role: { type: 'string' },
      preserve: { type: 'array', items: { type: 'string' } },
      addresses_primary_mismatch: { type: 'boolean' },
      deferred_from_operation_id: {
        type: 'string',
        description: 'Select a compiler-owned deferred sub-pass after review; Guard reloads and revalidates the saved sub-pass.',
      },
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: 32,
        description:
          'Bounded concrete Photoshop actions only when visible geometry/color/tool parameters are not uniquely derivable. Guard injects durable owner/layer/planner/verification protocol around them.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional technical step key; omitted keys are assigned deterministically. Keep an explicit id when another action references it.' },
            tool: { type: 'string' },
            args: { type: 'object', additionalProperties: true },
            description: { type: 'string' },
            method_id: { type: 'string' },
            edge_boundary_ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['tool'],
          additionalProperties: false,
        },
      },
      stage: {
        type: 'string',
        description: 'Advanced override only when changing stage is itself part of the artistic decision; otherwise inherited.',
      },
      stage_reset: {
        type: 'object',
        properties: {
          reason: { type: 'string', enum: [...PAINTING_STAGE_RESET_REASONS] },
          detail: { type: 'string' },
        },
        required: ['reason'],
        additionalProperties: false,
      },
      impact_class: {
        type: 'string',
        enum: ['construct', 'subtract', 'edge', 'tone', 'texture', 'transition', 'transform', 'isolate', 'composite', 'cleanup'],
      },
      construction_role: { type: 'string', enum: [...PAINTING_CONSTRUCTION_ROLES] },
      material_response: { type: 'object', additionalProperties: true },
    },
    required: ['request_key', 'problem_id', 'document_id', 'goal', 'action', 'visual_intent'],
    additionalProperties: false,
  };
}

function materialResponseReviewSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description: 'Evidence-bound qualitative decomposition supporting material_light_response. Texture/noise alone cannot resolve this review.',
    properties: {
      response_role: { type: 'string', enum: [...MATERIAL_RESPONSE_ROLES] },
      components: {
        type: 'object',
        properties: Object.fromEntries(MATERIAL_RESPONSE_COMPONENTS.map(key => [key, {
          type: 'object',
          properties: {
            status: { type: 'string', enum: [...MATERIAL_RESPONSE_REVIEW_STATUSES] },
            note: { type: 'string', minLength: 8 },
          },
          required: ['status', 'note'],
          additionalProperties: false,
        }])),
        required: [...MATERIAL_RESPONSE_COMPONENTS],
        additionalProperties: false,
      },
      microtexture: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: [...MATERIAL_RESPONSE_MICROTEXTURE_REVIEW_STATUSES] },
          note: { type: 'string', minLength: 8 },
        },
        required: ['status', 'note'],
        additionalProperties: false,
      },
      texture_only_treatment: { type: 'boolean' },
      style_contract_basis: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: [...MATERIAL_RESPONSE_STYLE_BASIS_FIELDS] },
          criterion: { type: 'string', minLength: 8 },
        },
        required: ['field', 'criterion'],
        additionalProperties: false,
      },
    },
    required: ['response_role', 'components', 'microtexture', 'texture_only_treatment'],
    additionalProperties: false,
  };
}

function physicalStackCheckSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description: 'Optional physical scene-stack assessment on the ordinary current whole-frame review, needed before VALUE or later in fresh nontrivial runs. Reuse the same criteria with or without Director. Guard derives exact SHA and operation id in previous_observation; omission is not a pass.',
    properties: {
      status: { type: 'string', enum: [...PHYSICAL_STACK_CHECK_STATUSES] },
      observed: { type: 'boolean' },
      preview_sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
      evidence_operation_id: {
        type: 'string',
        description: 'Guard operation id of the successful visual operation whose preview is the exact current frame being assessed.',
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      limitations: { type: 'array', items: { type: 'string' } },
      criteria: {
        type: 'object',
        properties: Object.fromEntries(PHYSICAL_STACK_CRITERIA.map(key => [key, {
          type: 'object',
          properties: {
            status: { type: 'string', enum: [...PHYSICAL_STACK_CRITERION_STATUSES] },
            note: { type: 'string' },
          },
          required: ['status', 'note'],
          additionalProperties: false,
        }])),
        additionalProperties: false,
      },
      material_response: materialResponseReviewSchema(),
    },
    required: ['status', 'observed'],
    additionalProperties: false,
};
}

function compactObservationSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      observed: {
        type: 'string',
        description: 'Describe visible form/perspective/light against the brief and style in presentation_context.language; executed tools prove no artistic gain; include remaining defects and the next construction change in this ordinary review.',
      },
      target: {
        type: 'string',
        enum: ['resolved', 'unresolved', 'uncertain'],
        description: 'Preferred compact form: whether the artistic target is visibly resolved.',
      },
      regression: {
        type: ['string', 'null'],
        description: 'Optional visible regression. Prefer omit/null when none is observed. Exact negative sentinels such as "none observed" are normalized to no regression evidence; substantive text is never discarded.',
      },
      action: {
        type: 'string',
        enum: ['accept', 'correct', 'rollback'],
        description: 'Optional override. Normally Guard derives the disposition from target/regression.',
      },
      verdict: { type: 'string', enum: ['improvement', 'neutral', 'regression'] },
      disposition: { type: 'string', enum: ['accept', 'correct', 'rollback'] },
      observed_change: {
        type: 'string',
        description: 'Factual observation in presentation_context.language grounded in the delivered previous frame; preserved in full in frame commentary regardless of detail mode.',
      },
      artistic_commentary: { type: 'string', description: 'Optional localized pre-pass narration for the previous operation when its saved intent used the wrong language. Repairs presentation during this ordinary observation call; does not rewrite goal, actions or artistic verdict.' },
      target_resolved: { type: 'string', enum: ['yes', 'no', 'uncertain'] },
      painting_completion: PAINTING_COMPLETION_SCHEMA,
      critic_review: CHAT_CRITIC_SCHEMA,
      regressions: { type: 'array', items: { type: 'string' } },
      uncertainty: { type: 'string' },
      uncertainty_review: {
        type: 'object',
        description: 'Structured multiscale escalation request for unresolved visual uncertainty. Coordinates are source-document pixels; Guard never infers crop geometry or escalation level from free text.',
        properties: {
          after_level: { type: 'string', enum: ['composition', 'object'] },
          region_bounds: {
            type: 'object',
            properties: {
              left: { type: 'number' }, top: { type: 'number' },
              right: { type: 'number' }, bottom: { type: 'number' },
            },
            required: ['left', 'top', 'right', 'bottom'],
            additionalProperties: false,
          },
          tighter_region_bounds: {
            type: 'object',
            properties: {
              left: { type: 'number' }, top: { type: 'number' },
              right: { type: 'number' }, bottom: { type: 'number' },
            },
            required: ['left', 'top', 'right', 'bottom'],
            additionalProperties: false,
          },
        },
        required: ['after_level'],
        additionalProperties: false,
      },
      distribution_intent: {
        type: 'string',
        enum: [...DISTRIBUTION_INTENTS],
        description: 'Optional spatial-distribution contract for repeated marks. This complements pattern_intent: random jitter is not proof of organic clustering, and perspective-regular distribution is checked against the declared surface frame.',
      },
      edge_observations: {
        type: 'array',
        description: 'Required after a pass with edge intents; report each declared boundary exactly once.',
        items: {
          type: 'object',
          properties: {
            boundary_id: { type: 'string' },
            observed_behavior: { type: 'string' },
            target_met: { type: 'string', enum: ['yes', 'no', 'uncertain'] },
          },
          required: ['boundary_id', 'observed_behavior', 'target_met'],
          additionalProperties: false,
        },
      },
      primary_mismatch: { type: 'string', description: 'Largest defect visible in AFTER against the brief; guide the next construction change; if none is visible say so honestly; field presence proves no quality.' },
      global_readability: { type: 'string', enum: ['improved', 'stable', 'degraded', 'unknown'] },
      primitive_footprint: { type: 'string', enum: ['none', 'acceptable', 'suspect', 'unknown'], description: 'Judge the object representation against the brief, not merely recognizability or the operation goal. Use suspect for scaffold/pictogram-dominant form; unknown keeps durable owner assessment debt. A temporary block-in can be retained without certifying object completion.' },
      trend_signals: { type: 'array', items: { type: 'string' } },
      softness_review: {
        type: 'object',
        description: 'Optional detailed softness/over-smoothing review. Ordinary exact-frame whole-frame observation and review_findings suffice; omission does not certify a softness pass. Supplied criteria remain bound to the exact current preview; do not use a generic sharpness score.',
        properties: {
          status: { type: 'string', enum: [...SOFT_DOMINANCE_STATUSES] },
          observed: { type: 'boolean' },
          criteria: {
            type: 'object',
            properties: Object.fromEntries(SOFT_DOMINANCE_CRITERIA.map(key => [
              key,
              {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: [...SOFT_DOMINANCE_CRITERION_STATUSES] },
                  note: { type: 'string' },
                },
                required: ['status', 'note'],
                additionalProperties: false,
              },
            ])),
            required: [...SOFT_DOMINANCE_CRITERIA],
            additionalProperties: false,
          },
          style_contract_basis: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              criterion: { type: 'string' },
            },
            required: ['field', 'criterion'],
            additionalProperties: false,
          },
        },
        required: ['status', 'observed', 'criteria'],
        additionalProperties: false,
      },
      physical_stack_check: physicalStackCheckSchema(),
      review_findings: {
        type: 'array',
        maxItems: 6,
        description: 'Optional structured local review findings. OBJECT/MICRO kinds require exact source-document region_bounds; Guard may return read-only crop evidence for the same pending operation before accepting visual closure.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: [...VISUAL_REVIEW_FINDING_KINDS] },
            problem_id: { type: 'string', description: 'Optional stable problem id. Omit to use Guard\'s stable review-<kind> id.' },
            region_bounds: {
              type: 'object',
              properties: {
                left: { type: 'number' },
                top: { type: 'number' },
                right: { type: 'number' },
                bottom: { type: 'number' },
              },
              required: ['left', 'top', 'right', 'bottom'],
              additionalProperties: false,
            },
            severity: { type: 'string', enum: ['must-fix', 'should-fix', 'optional'] },
            trend_signals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional explicit binding from this spatial finding to one or more cumulative trend signals. Unrelated findings are never borrowed as spatial evidence for another signal.',
            },
            brief_item_id: {
              type: 'string',
              description: 'Optional active brief item id when this visible finding directly establishes prompt-relevant debt.',
            },
            brief_state: {
              type: 'string', enum: ['NOT_MET', 'UNCERTAIN'],
              description: 'Evidence-bound hard-brief debt state established by this finding. Only valid with brief_item_id.',
            },
          },
          required: ['kind'],
          additionalProperties: false,
        },
      },
      recognition: {
        type: 'object',
        properties: {
          subject: { type: 'string', enum: ['yes', 'no', 'uncertain'] },
          style: { type: 'string', enum: ['yes', 'no', 'uncertain', 'not_applicable'] },
          evaluator: { type: 'string', enum: ['producer', 'blinded', 'human', 'external'] },
          visible_features: { type: 'array', items: { type: 'string' } },
          lost_features: { type: 'array', items: { type: 'string' } },
        },
        required: ['subject', 'style'],
        additionalProperties: false,
      },
      observations: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        description: 'Visible observations from delivered review evidence. Every meaningful visual pass must include region="whole frame".',
        items: {
          type: 'object',
          properties: {
            region: { type: 'string' },
            visible: { type: 'string' },
          },
          required: ['region', 'visible'],
          additionalProperties: false,
        },
      },
      planner_task_assessment: {
        type: 'object',
        description: 'Optional whole-task assessment. Omit it to keep the current Planner task active.',
        properties: {
          status: { type: 'string', enum: ['continue', 'completed', 'blocked'] },
          evidence_scope: { type: 'string', enum: ['task'] },
          evidence: { type: 'array', items: { type: 'string' } },
        },
        required: ['status', 'evidence_scope', 'evidence'],
        additionalProperties: false,
      },
      affected_relations: { type: 'array', items: { type: 'string' } },
      affected_qualities: { type: 'array', items: { type: 'string' } },
      preservation_facts: { type: 'array', items: { type: 'string' } },
      independent_region: { type: 'boolean' },
    },
    description: 'Compact visual closure. Supply observed + target, with optional regression/action and structured review_findings. A finding may trigger read-only crop enrichment for the same operation before closure. target is operation-local; planner_task_assessment is separate and optional.',
    additionalProperties: false,
  };
}

function cycleTool(name: string, description: string): Tool {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        protocol_version: {
          type: 'string',
          const: COMPACT_GUARD_PROTOCOL_VERSION,
          default: COMPACT_GUARD_PROTOCOL_VERSION,
          description: 'Compact Guard protocol revision. Omit during normal model use; the provider supplies the current revision internally.',
        },
        previous_operation_id: { type: 'string' },
        previous_observation: compactObservationSchema(),
        painting_intent: paintingIntentSchema(),
        next_pass: compactPassSchema(),
      },
      additionalProperties: false,
    },
  };
}

export function createGuardTools(runtime: EmbeddedGuardRuntime): ToolDefinition[] {
  const compactCycleArgs = (args: Record<string, unknown>): Record<string, unknown> => {
    if (args.protocol_version !== undefined && args.protocol_version !== COMPACT_GUARD_PROTOCOL_VERSION) {
      const error = new Error(guardProtocolVersionError(args.protocol_version));
      Object.assign(error, { code: 'guard_protocol_version_mismatch' });
      throw error;
    }
    const normalized = { ...args };
    delete normalized.protocol_version;
    return normalized;
  };
  const definitions: ToolDefinition[] = [
    {
      tool: {
        name: 'photoshop_guard_capabilities',
        description: 'Read Guard capabilities and recovery contract; tool_name returns one exact executable argument schema without source inspection.',
        inputSchema: { type: 'object', properties: { if_revision: { type: 'string', description: 'Echo the prior discovery_revision when deliberately checking for changes; matching revision returns a compact unchanged receipt. Keep schemas from the earlier response.' }, tool_name: { type: 'string', description: 'One exact Photoshop command.' }, tool_names: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { type: 'string' }, description: 'Batch of exact command_sets names; avoids serial contract queries. Choose this OR tool_name.' } }, additionalProperties: false },
      },
      handler: async (args) => {
        if (args.tool_name !== undefined && args.tool_names !== undefined) throw new Error('Choose tool_name OR tool_names');
        const value = Array.isArray(args.tool_names)
          ? { execution: 'not-executed', contracts: args.tool_names.map(name => runtime.toolContract(String(name))) }
          : args.tool_name !== undefined ? runtime.toolContract(String(args.tool_name)) : {
            ...runtime.capabilities(), compact_guard_protocol_version: COMPACT_GUARD_PROTOCOL_VERSION,
            expected_uxp_bridge_revision: UXP_BRIDGE_REVISION };
        const revision = createHash('sha256').update(JSON.stringify(value)).digest('hex');
        if (args.if_revision === revision) return json({ execution: 'not-executed', unchanged: true, discovery_revision: revision,
          next: 'Reuse prior exact schemas; batch only missing names. Do not repeat capabilities/brush setup without changed bridge/inventory or a concrete missing command.' });
        return json({ ...value, discovery_revision: revision,
          discovery_policy: 'Read once per art run; cache schemas and batch up to 8 missing tool_names. Deliberate recheck uses if_revision.' });
      },
    },
    {
      tool: {
        name: 'photoshop_guard_brush_pack_ingest',
        description:
          'Import supplied .abr assets and return brush_pack_id with verified presets; changes Photoshop brush inventory, not canvas pixels.',
        inputSchema: {
          type: 'object',
          properties: {
            source_path: { type: 'string', description: 'Folder or one explicit .abr file path.' },
            source_files: {
              type: 'array',
              minItems: 1,
              maxItems: 128,
              items: { type: 'string' },
              description: 'Explicit .abr files. Use instead of source_path.',
            },
          },
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try {
          const result = await runtime.brushPackIngest(args);
          return json(result, result.ok === false);
        } catch (error) {
          return json({
            ok: false,
            code: guardRuntimeErrorCode(error, 'brush_pack_ingestion_failed'),
            message: error instanceof Error ? error.message : String(error),
          }, true);
        }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_brush_pack_profile',
        description:
          'Plan/probe a brush pack, record observed media or stamp behavior, or build its preflight role map; probe_media draws a disposable sheet.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['plan', 'probe_media', 'record_media', 'record_stamp', 'build_preflight'] },
            brush_pack_id: { type: 'string' },
            preset_name: { type: 'string' },
            occurrence_index: { type: 'number', minimum: 0 },
            inventory_total: { type: 'number', minimum: 1 },
            candidate_limit: { type: 'number', minimum: 1, maximum: 8 },
            required_roles: {
              type: 'array',
              items: { type: 'string', enum: [...DEFAULT_BRUSH_SCENE_ROLES] },
            },
            preset_states: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  preset_name: { type: 'string' },
                  occurrence_index: { type: 'number', minimum: 0 },
                  effective_settings: { type: 'object', additionalProperties: true },
                  backend: { type: 'string' },
                  runtime_revision: { type: 'string' },
                  bridge_revision: { type: 'string' },
                },
                required: ['preset_name', 'occurrence_index', 'effective_settings', 'backend', 'runtime_revision'],
                additionalProperties: false,
              },
            },
            profile: {
              type: 'object',
              properties: {
                probe_operation_id: { type: 'string' },
                brush_pack_id: { type: 'string' },
                preset_name: { type: 'string' },
                occurrence_index: { type: 'number', minimum: 0 },
                effective_settings: { type: 'object', additionalProperties: true },
                backend: { type: 'string' },
                runtime_revision: { type: 'string' },
                bridge_revision: { type: 'string' },
                usable_visual_intents: { type: 'array', minItems: 1, items: { type: 'string', enum: [...PAINTING_VISUAL_INTENTS] } },
                material_roles: { type: 'array', minItems: 1, items: { type: 'string' } },
                mark_character: { type: 'array', minItems: 1, items: { type: 'string', enum: [...MEDIA_MARK_CHARACTERS] } },
                useful_scale_range: {
                  type: 'object',
                  properties: { min_px: { type: 'number', minimum: 1 }, max_px: { type: 'number', minimum: 1 } },
                  required: ['min_px', 'max_px'],
                  additionalProperties: false,
                },
                edge_behavior: { type: 'string', enum: ['soft', 'hard', 'broken', 'variable', 'directional', 'unknown'] },
                buildup_behavior: { type: 'string', enum: ['glazing', 'opaque', 'layered', 'granular', 'streaking', 'unknown'] },
                rotation_meaningful: { type: 'boolean' },
                recommended_pressure_policy: {
                  type: 'string',
                  enum: ['none', 'native-preset', 'simulated-size', 'simulated-opacity', 'simulated-size-opacity'],
                },
                known_caveats: { type: 'array', items: { type: 'string' } },
                evidence: { type: 'object', additionalProperties: true },
                classification_status: { type: 'string', enum: ['classified', 'unclassified'] },
                motif_category: { type: 'string' },
                semantic_description: { type: 'string' },
                canonical_footprint_bounds: {
                  type: 'object',
                  properties: {
                    left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' },
                  },
                  required: ['left', 'top', 'right', 'bottom'],
                  additionalProperties: false,
                },
                canonical_orientation_degrees: { type: 'number' },
                mirror_x: { type: 'string', enum: ['allowed', 'restricted', 'unknown'] },
                mirror_y: { type: 'string', enum: ['allowed', 'restricted', 'unknown'] },
                rotation_policy: { type: 'string', enum: ['free', 'restricted', 'fixed', 'unknown'] },
                intended_use: { type: 'array', minItems: 1, items: { type: 'string', enum: [...STAMP_INTENDED_USES] } },
                repetition_class: { type: 'string', enum: ['intentional_regular', 'organic_instances', 'unclassified'] },
                raw_placement: { type: 'string', enum: ['finished-acceptable', 'needs-integration', 'unknown'] },
              },
              additionalProperties: true,
            },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try {
          if (args.action === 'probe_media') {
            const result = await runtime.brushPackProbe(args);
            const evidence = result.evidence && typeof result.evidence === 'object'
              ? result.evidence as Record<string, unknown>
              : {};
            const previewPath = typeof evidence.preview_path === 'string' ? evidence.preview_path : '';
            const previewSha = typeof evidence.preview_sha256 === 'string' ? evidence.preview_sha256 : '';
            const output = json(result);
            if (previewPath && previewSha && existsSync(previewPath)) {
              const bytes = readFileSync(previewPath);
              const actualSha = createHash('sha256').update(bytes).digest('hex');
              if (actualSha !== previewSha) throw new Error('brush_pack_probe_materialized_sha_mismatch');
              output.content.push({ type: 'image', data: bytes.toString('base64'), mimeType: 'image/jpeg' });
            }
            return output;
          }
          return json(executeBrushPackProfileAction(args));
        } catch (error) {
          return json({
            ok: false,
            code: 'brush_pack_profile_rejected',
            message: error instanceof Error ? error.message : String(error),
          }, true);
        }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_set_art_run',
        description:
          'Bind document and immutable process_dir; record the original brief and brush_preflight, required for the default nontrivial_painting profile.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number', minimum: 1 },
            process_dir: {
              type: 'string',
              description: 'Repository-relative path exactly processes/<subject>-process/<run-name> using lowercase kebab-case.',
            },
            original_brief: {
              type: 'string', minLength: 1, maxLength: 16000,
              description: 'Original user request for independent evaluation; changing it invalidates the evaluation binding, so never substitute a success summary.',
            },
            commentary_mode: {
              type: 'string',
              enum: ['technical', 'artistic', 'mixed'],
              default: 'mixed',
            },
            commentary_detail: {
              type: 'string',
              enum: ['short', 'normal', 'detailed'],
              default: 'normal',
              description: 'short: intent/tools/observation; normal adds layer/preset/settings; detailed adds colors/opacities/gradient stops; technical keeps audit text; no translation.',
            },
            painting_profile: {
              type: 'string',
              enum: ['nontrivial_painting', 'simple_graphic'],
              default: 'nontrivial_painting',
              description: 'nontrivial_painting requires brush_preflight and guarded microplans; simple_graphic can upgrade when these are supplied.',
            },
            profile_transition_reason: {
              type: 'string',
              description: 'Optional reason for upgrading simple_graphic; the stronger profile requirements still apply.',
            },
            brush_preflight: {
              type: 'object',
              description: 'Durable live brush-role map recorded after bounded installed-preset inventory, effective-settings readback and any role-critical footprint probes.',
              properties: {
                completed: { type: 'boolean' },
                inventory_observed: { type: 'boolean' },
                inventory_total: { type: 'number', minimum: 1 },
                inventory_query: { type: 'string' },
                brush_pack_id: { type: 'string' },
                roles: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 16,
                  items: {
                    type: 'object',
                    properties: {
                      role_id: { type: 'string' },
                      purpose: { type: 'string' },
                      material_roles: { type: 'array', minItems: 1, items: { type: 'string' } },
                      visual_intents: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string', enum: [...PAINTING_VISUAL_INTENTS] },
                      },
                      preferred_preset: { type: 'string' },
                      alternative_presets: { type: 'array', items: { type: 'string' } },
                      candidate_evidence: {
                        type: 'array',
                        description: 'Evidence-ranked viable presets for this role. Keeps observed mark behavior available to planning instead of reducing the role to one preferred name.',
                        items: {
                          type: 'object',
                          properties: {
                            preset_name: { type: 'string' },
                            profile_id: { type: 'string' },
                            evidence_score: { type: 'number' },
                            mark_character: { type: 'array', items: { type: 'string' } },
                            edge_behavior: { type: 'string' },
                            buildup_behavior: { type: 'string' },
                            useful_scale_range: {
                              type: 'object',
                              properties: { min_px: { type: 'number' }, max_px: { type: 'number' } },
                              required: ['min_px', 'max_px'], additionalProperties: false,
                            },
                            rotation_meaningful: { type: 'boolean' },
                            pressure_policy: { type: 'string', enum: ['none', 'native-preset', 'simulated-size', 'simulated-opacity', 'simulated-size-opacity'] },
                            dynamics_capability: {
                              type: 'object',
                              description: 'Probe/profile-backed pressure and stroke-dynamics capabilities available for causal mark planning.',
                              properties: {
                                native_pressure_size: { type: 'boolean' },
                                native_pressure_opacity: { type: 'boolean' },
                                simulated_pressure_size: { type: 'boolean' },
                                simulated_pressure_opacity: { type: 'boolean' },
                                rotation_meaningful: { type: 'boolean' },
                                spacing_tunable: { type: 'boolean' },
                                opacity_tunable: { type: 'boolean' },
                                flow_tunable: { type: 'boolean' },
                              },
                              required: ['native_pressure_size', 'native_pressure_opacity', 'simulated_pressure_size', 'simulated_pressure_opacity', 'rotation_meaningful', 'spacing_tunable', 'opacity_tunable', 'flow_tunable'],
                              additionalProperties: false,
                            },
                            effective_settings: { type: 'object', additionalProperties: true },
                            caveats: { type: 'array', items: { type: 'string' } },
                          },
                          required: ['preset_name', 'profile_id', 'evidence_score', 'mark_character', 'edge_behavior', 'buildup_behavior', 'useful_scale_range', 'rotation_meaningful', 'pressure_policy', 'dynamics_capability'],
                          additionalProperties: false,
                        },
                      },
                      effective_settings: {
                        type: 'object',
                        properties: {
                          size: { type: 'number' },
                          hardness: { type: 'number' },
                          roundness: { type: 'number' },
                          opacity: { type: 'number' },
                          flow: { type: 'number' },
                          spacing: { type: 'number' },
                          use_pressure_size: { type: 'boolean' },
                          use_pressure_opacity: { type: 'boolean' },
                          airbrush: { type: 'boolean' },
                          smoothing_enabled: { type: 'boolean' },
                          smoothing: { type: 'number' },
                        },
                        required: [
                          'size', 'hardness', 'roundness', 'opacity', 'flow', 'spacing',
                          'use_pressure_size', 'use_pressure_opacity', 'airbrush',
                          'smoothing_enabled', 'smoothing',
                        ],
                        additionalProperties: false,
                      },
                      working_scale: { type: 'string', description: 'Descriptive canvas/mark size. A legacy exact global|medium|small|detail|local|micro token restricts scale; prose does not. Use allowed_scales for explicit typed restrictions.' },
                      allowed_scales: { type: 'array', minItems: 1, maxItems: 6, uniqueItems: true,
                        items: { type: 'string', enum: ['global', 'medium', 'small', 'detail', 'local', 'micro'] },
                        description: 'Optional explicit applicable pass scales; overrides a legacy working_scale token. Other material/intent/preset checks still apply.' },
                      pressure_policy: {
                        type: 'string',
                        enum: ['none', 'native-preset', 'simulated-size', 'simulated-opacity', 'simulated-size-opacity'],
                      },
                      probe_status: { type: 'string', enum: ['pass', 'cached', 'not-needed'] },
                      caveat: { type: 'string' },
                      profile_id: { type: 'string' },
                    },
                    required: [
                      'role_id', 'purpose', 'material_roles', 'visual_intents', 'preferred_preset',
                      'effective_settings', 'working_scale', 'pressure_policy', 'probe_status',
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ['completed', 'inventory_observed', 'inventory_total', 'roles'],
              additionalProperties: false,
            },
            brush_preflight_invalidation: {
              type: 'string',
              enum: ['catalog_changed', 'settings_changed', 'runtime_changed'],
              description: 'Optional explicit invalidation for a replacement brush preflight. Catalog/settings drift is inferred from newly observed inventory/preset/settings evidence when unambiguous; runtime_changed remains explicit when host/runtime evidence requires a reprobe.',
            },
            brush_pack_policy: {
              type: 'object',
              description: 'Optional supplied-pack execution policy. preferred allows justified fallback; exclusive means every brush/stamp mark must be explicitly bound to this evidence-backed pack while non-brush Photoshop operations remain available.',
              properties: {
                mode: { type: 'string', enum: ['preferred', 'exclusive'] },
                brush_pack_id: { type: 'string' },
              },
              required: ['mode', 'brush_pack_id'],
              additionalProperties: false,
            },
          },
          required: ['document_id', 'process_dir'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try { return json(await runtime.artRunWithCapabilitySnapshot(args), false, runtime); }
        catch (error) { return json({ ok: false, code: 'guard_art_run_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_status',
        description: 'Read state/readiness, lint next_pass, or solve construction_model / construction_ref without painting. Keep the established local Photoshop workflow unless its route is unavailable; never replay uncertain mutations. Construction is a geometric target, not image proof; diagnostic_timing_marker is benchmark-only.',
        inputSchema: {
          type: 'object',
          properties: {
            next_pass: compactPassSchema(),
            construction_model: CONSTRUCTION_MODEL_SCHEMA,
            construction_ref: { type: 'object', properties: { document_id: { type: 'integer', minimum: 1 }, model_id: { type: 'string' } }, required: ['document_id', 'model_id'], additionalProperties: false },
            diagnostic_timing_marker: {
              type: 'object',
              properties: {
                operation_id: { type: 'string' },
                phase: { type: 'string', enum: ['review_finished', 'next_pass_ready'] },
              },
              required: ['operation_id', 'phase'],
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        if (args.construction_model !== undefined || args.construction_ref !== undefined) {
          try {
            if (args.next_pass !== undefined || args.diagnostic_timing_marker !== undefined || args.construction_model !== undefined && args.construction_ref !== undefined) throw new Error('Choose exactly one read-only construction solve, next_pass lint, or ordinary status request');
            const ref = args.construction_ref as { document_id: number; model_id: string } | undefined;
            const model = ref ? runtime.store.constructionModel(ref.document_id, ref.model_id) : args.construction_model;
            if (!model) throw new Error('No completed current-document construction has this id; supply construction_model');
            const solved = solveConstruction(model);
            return json({ ok: true, execution: 'not-executed', model_id: solved.model.model_id, revision: solved.model.revision,
              model_sha256: solved.model_sha256, iterations: solved.iterations, basis: solved.basis,
              landmarks: solved.landmarks, parts: solved.parts.map(p => ({ id: p.id, object_id: p.object_id, owner_id: p.id, bounds: p.bounds, target_sha256: p.target_sha256 })),
              pixel_geometry_verified: false, artistic_quality_verified: false,
              ...(ref ? { retained_geometry: runtime.store.constructionReviewState(ref.document_id, ref.model_id) } : {}),
              next: 'Use next_pass.construction with this model inline, or the completed durable model_id, one part_id and color; actual pixels still need exact-image review.' });
          } catch (error) {
            return json({ ok: false, execution: 'not-executed', code: 'construction_rejected', issues: error instanceof ConstructionError ? error.issues : [{ path: 'construction_model', message: error instanceof Error ? error.message : String(error) }] }, true);
          }
        }
        const marker = args.diagnostic_timing_marker
          && typeof args.diagnostic_timing_marker === 'object'
          && !Array.isArray(args.diagnostic_timing_marker)
          ? args.diagnostic_timing_marker as Record<string, unknown>
          : undefined;
        if (marker) {
          try {
            const recorded = runtime.store.recordContinuationMarker(
              String(marker.operation_id ?? ''),
              String(marker.phase ?? '')
            );
            return json({
              ok: true,
              mode: 'diagnostic-continuation-timing-marker',
              diagnostic_timing_marker: recorded,
              ...(args.next_pass && typeof args.next_pass === 'object' && !Array.isArray(args.next_pass)
                ? { next_pass_lint: await runtime.lintNextPass(args.next_pass as Record<string, unknown>) }
                : {}),
              next_required_action: marker.phase === 'review_finished'
                ? 'Prepare the next bounded artistic pass; optionally record next_pass_ready immediately before the continuation call.'
                : 'Call photoshop_guard_cycle_auto with previous_operation_id + previous_observation and the prepared next_pass.',
            });
          } catch (error) {
            return json({
              ok: false,
              code: 'diagnostic_continuation_timing_marker_rejected',
              message: error instanceof Error ? error.message : String(error),
            }, true);
          }
        }
        return stateJson({
          ...(await runtime.statusWithCapabilitySnapshots()),
          ...(args.next_pass && typeof args.next_pass === 'object' && !Array.isArray(args.next_pass)
            ? { next_pass_lint: await runtime.lintNextPass(args.next_pass as Record<string, unknown>) }
            : {}),
        }, runtime, 'status');
      },
    },
    {
      tool: {
        name: 'photoshop_guard_keep_logical_layer',
        description:
          'Commit a visually accepted temporary owner using its journal-bound hypothesis_id and layer_id; does not alter pixels or layer structure.',
        inputSchema: {
          type: 'object',
          properties: {
            request_key: { type: 'string' },
            document_id: { type: 'number', minimum: 1 },
            hypothesis_id: { type: 'string' },
            layer_id: { type: 'number', minimum: 1 },
            rationale: { type: 'string', description: 'Optional audit/artistic guidance for why this already-bound temporary owner is being promoted.' },
            scene_ownership_plan: sceneOwnershipPlanSchema(
              'Required when this temporary owner is the first committed owner and no durable scene ownership plan exists yet. Must predeclare the owner being kept; later keep calls reuse the durable plan.'
            ),
          },
          required: ['request_key', 'document_id', 'hypothesis_id', 'layer_id'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try { return json(runtime.store.keepSemanticLayerOwner(args)); }
        catch (error) {
          return json({
            ok: false,
            code: 'semantic_layer_lifecycle_rejected',
            message: error instanceof Error ? error.message : String(error),
          }, true);
        }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_resume',
        description: 'Recover the local Photoshop workflow without replaying uncertain mutations; keep it unless the user explicitly changes execution mode. After a UXP session change, same_document_confirmed=true requires user confirmation and internally compares fresh pixels/owners with the preserved frame; mismatch keeps work quarantined. No source inspection is needed.',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number', minimum: 1 },
            projection: { type: 'string', enum: ['recovery', 'ownership'], description: 'Bounded public recovery or ownership context; never read runtime files. Requires document_id.' },
            owner_id: { type: 'string', description: 'Optional exact hypothesis id for projection=ownership.' },
            same_document_confirmed: { type: 'boolean', description: 'True only after user confirms this is the same still-open document after reconnection.' },
            director_fields: { type: 'array', minItems: 1, maxItems: 5, uniqueItems: true,
              items: { type: 'string', enum: ['style_contract', 'prompt_conflict_preflight', 'strategy_validation_after_microplans', 'strategy_validation', 'assessment', 'perceptual_hierarchy', 'value_check', 'refinement_check', 'artistic_evaluation_contract', 'composition_freedom', 'composition_exploration', 'tasks'] },
              description: 'Fetch only the named saved Director fields, without inventories or source inspection. Requires document_id; use a separate call for identity recovery.' },
          },
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try {
          const result = await runtime.resumeWithRecovery(args);
          if (Array.isArray(args.director_fields) && result.art_director) {
            const schema = definitions.find(item => item.tool.name === 'photoshop_guard_art_director')!.tool.inputSchema as JsonSchemaNode;
            const saved = result.art_director as Record<string, unknown>;
            result.art_director = { ...saved, ...Object.fromEntries(args.director_fields.map(field => [String(field),
              publicDirectorTemplate(saved[String(field)], schema.properties!.directive!.properties![String(field)])])) };
          }
          return stateJson(result, runtime, 'resume');
        }
        catch (error) {
          const details = error as { identity_recovery_blockers?: unknown; next_public_call?: unknown; owner_identity_comparison?: unknown } | null;
          return json({ ok: false, code: guardRuntimeErrorCode(error, 'document_identity_recovery_rejected'), execution: 'not-executed',
            message: error instanceof Error ? error.message : String(error),
            ...(details?.identity_recovery_blockers ? { identity_recovery_blockers: details.identity_recovery_blockers,
              next_public_call: details.next_public_call, mutation_replay_permitted: false } : {}),
            ...(details?.owner_identity_comparison ? { owner_identity_comparison: details.owner_identity_comparison,
              mutation_replay_permitted: false, mutation_allowed: false } : {}),
          }, true);
        }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_lint_next_pass',
        description: 'Optional read-only validation of a complete continuation, including previous observation. cycle_auto already validates; do not lint each normal component or separately close a reviewed previous pass.',
        inputSchema: {
          type: 'object',
          properties: { next_pass: compactPassSchema(), previous_operation_id: { type: 'string' }, previous_observation: compactObservationSchema() },
          required: ['next_pass'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try { return json(await runtime.lintNextPass(args.next_pass as Record<string, unknown>, args)); }
        catch (error) { return json({ ok: false, code: 'guard_next_pass_lint_failed', execution: 'not-executed', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: cycleTool(
        'photoshop_guard_cycle_auto',
        'Run one bounded semantic pass, not an entire artistic stage, in local Photoshop; keep this route unless the user explicitly changes execution mode. After inspecting exact review images, send previous_operation_id + previous_observation (critic_review at its checkpoint) with optional next_pass; fetch missing images via photoshop_guard_review_image and poll returned job_id via photoshop_guard_job_poll.'
      ),
      handler: async (args) => {
        try {
          const envelope = await runtime.cycleAuto(compactCycleArgs(args)) as any;
          const base = json(envelope, false, runtime);
          const operationId = envelope?.execution?.operation_id;
          if (envelope?.next_state !== 'awaiting_visual_review' || typeof operationId !== 'string') return base;
          const inline = await inlineReviewImageResult(runtime, operationId);
          if (!inline) return base;
          const inlineText = inline.content.find(item => item.type === 'text');
          const inlineBody = inlineText?.type === 'text' ? JSON.parse(inlineText.text) : {};
          const body = JSON.parse((base.content[0] as { type: 'text'; text: string }).text);
          body.visual_review.delivery = inlineBody.delivery;
          body.artistic_review = inlineBody.artistic_review;
          body.next_required_action = (inlineBody.artistic_review?.critic_role?.required ? 'Switch to Critic; return previous_observation.critic_review for the whole exact scene, then resume Painter. ' : '') + `Perform artistic_review on the inline exact image(s), then call photoshop_guard_cycle_auto once with previous_operation_id=${operationId} + previous_observation and next_pass addressing the largest visible defect. Omit next_pass to close only the current operation, or when the user asked to stop. PSD/JPEG saves and pass closure never certify the whole painting: continue original-brief/form/light/contact debt and pending construction rebuilds.`;
          return {
            content: [
              { type: 'text', text: JSON.stringify(body, null, 2) },
              ...inline.content.filter(item => item.type === 'image'),
            ],
          };
        }
        catch (error) { return json({ ok: false, code: guardRuntimeErrorCode(error, 'guard_cycle_rejected'), message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_review_image',
        description:
          'Deliver exact review images for operation_id without painting; inspect them before submitting previous_observation.',
        inputSchema: {
          type: 'object',
          properties: {
            operation_id: { type: 'string' },
            force_redelivery: { type: 'boolean', description: 'Only for unavailable/failed images; requires redelivery_reason. Same-operation exact delivered images in a host-proven chat are reused without claiming visual observation.' },
            redelivery_reason: { type: 'string', enum: ['images-unavailable', 'delivery-failed'] },
            roles: {
              type: 'array',
              minItems: 1,
              maxItems: REVIEW_IMAGE_MAX_BLOCKS,
              items: { type: 'string' },
              description: 'Optional roles, e.g. after/after_crop; omit to deliver all required images.',
            },
          },
          required: ['operation_id'],
          additionalProperties: false,
        },
      },
      handler: async (args) => explicitReviewImageResult(
        runtime,
        String(args.operation_id ?? ''),
        Array.isArray(args.roles) ? args.roles.filter((role): role is string => typeof role === 'string') : undefined,
        args.force_redelivery === true,
        typeof args.redelivery_reason === 'string' ? args.redelivery_reason : undefined
      ),
    },
    {
      tool: {
        name: 'photoshop_guard_job_poll',
        description: 'Poll job_id; fetch completed visual review via photoshop_guard_review_image; never replace running/uncertain work with another mutation.',
        inputSchema: {
          type: 'object',
          properties: { job_id: { type: 'string' } },
          required: ['job_id'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try { return json(runtime.pollJob(String(args.job_id ?? '')), false, runtime); }
        catch (error) { return json({ ok: false, code: 'guard_job_not_found', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_reconcile',
        description: 'Reconcile uncertain execution without replay. For a user-confirmed closed document, send id + outcome=abandoned + document_closed_confirmed=true + reason; Guard collects fresh document-list evidence internally. Do not read source or manufacture evidence ids.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            capture_evidence: { type: 'boolean', description: 'Read-only: collect fresh pinned state and materialized preview internally and deliver exact image inline. Does not classify execution or clear the barrier. Inspect and then reconcile with returned ids/outcome/reason.' },
            state_id: { type: 'string' },
            preview_id: { type: 'string' },
            documents_id: { type: 'string', description: 'Optional existing Guard document-list evidence id. Omit for user-confirmed closed-document recovery: Guard collects fresh evidence internally.' },
            document_closed_confirmed: { type: 'boolean', description: 'Must be true only after the user explicitly confirms the interrupted target document was closed.' },
            outcome: { type: 'string', enum: ['completed', 'not-executed', 'partial', 'abandoned'] },
            reason: { type: 'string' },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try {
          if (args.capture_evidence === true) {
            if (args.outcome !== undefined || args.state_id !== undefined || args.preview_id !== undefined) throw new Error('Capture and outcome classification require separate calls; inspect fresh evidence first');
            const evidence = await runtime.captureRecoveryEvidence(String(args.id ?? ''));
            return { content: [...json(evidence.body).content, ...evidence.images] };
          }
          return json(await runtime.reconcile(args));
        }
        catch (error) { return json({ ok: false, code: 'guard_reconcile_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_set_priorities',
        description: 'Record whole-frame problem priorities; open larger must-fix problems block finer work.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number', minimum: 1 },
            current_stage: { type: 'string' },
            evidence_operation_id: { type: 'string', description: 'Exact-current visual operation with a completed verdict. Required when changing the status, scale, or severity of an existing open perceptual problem; prevents arbitrary blocker dismissal/reclassification.' },
            problems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  problem_id: { type: 'string' },
                  scale: { type: 'string', enum: ['global', 'medium', 'small', 'detail', 'local', 'micro'] },
                  severity: { type: 'string', enum: ['must-fix', 'should-fix', 'optional'] },
                  status: { type: 'string', enum: ['open', 'resolved'] },
                  region: { type: 'string' },
                  hypothesis: { type: 'string' },
                  depends_on_problem_ids: {
                    type: 'array',
                    uniqueItems: true,
                    items: { type: 'string' },
                    description: 'Problem ids that must be resolved first. Guard persists these dependencies and uses them when selecting the primary blocker.',
                  },
                },
                required: ['problem_id', 'scale', 'severity'],
                additionalProperties: false,
              },
            },
          },
          required: ['document_id', 'problems'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try { return json(runtime.priorities(args)); }
        catch (error) { return json({ ok: false, code: 'guard_priority_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_art_director',
        description: 'Manage Director plans: review issues tasks, interrupt returns to planning, complete closes a satisfied directive; does not certify painted quality.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number', minimum: 1 },
            action: { type: 'string', enum: ['review', 'interrupt', 'complete'] },
            reason: {
              type: 'string',
              enum: [
                'serious_visual_error',
                'unexpected_global_composition_value_shift',
                'likeness_main_shape_degraded',
                'unsafe_to_execute_directive',
              ],
            },
            detail: { type: 'string', description: 'Optional audit/artistic guidance for an interrupt. The enumerated reason is the structural interrupt authority.' },
            final_comparison: {
              type: 'object',
              description: 'Required for action=complete. Compare the current state with the strongest previous accepted state before declaring the directive finished.',
              properties: {
                scope: { type: 'string', enum: ['compared', 'no_previous'] },
                current_operation_id: { type: 'string' },
                best_previous_operation_id: { type: 'string' },
                preferred: { type: 'string', enum: ['current', 'previous', 'tie'] },
                reason: { type: 'string' },
                criteria: {
                  type: 'object',
                  properties: {
                    coherence: { type: 'string' },
                    expressiveness: { type: 'string' },
                    color: { type: 'string' },
                    rhythm: { type: 'string' },
                    detail_selectivity: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
              required: ['scope', 'preferred'],
              additionalProperties: false,
            },
            directive: {
              type: 'object',
              properties: {
                directive_id: { type: 'string' },
                goal: { type: 'string' },
                style_contract: {
                  type: 'object',
                  description: 'Durable artistic intent; supply relevant fields without a constraint-count quota.',
                  properties: {
                    realism_level: { type: 'string' },
                    shape_language: { type: 'string' },
                    composition_bias: { type: 'string' },
                    edge_policy: { type: 'string' },
                    contour_role: { type: 'string' },
                    mark_visibility: { type: 'string' },
                    value_policy: { type: 'string' },
                    color_policy: { type: 'string' },
                    spatial_treatment: { type: 'string' },
                    material_treatment: { type: 'string' },
                    detail_density: { type: 'string' },
                    texture_policy: { type: 'string' },
                    primitive_footprint_tolerance: { type: 'string' },
                    layer_or_mask_bias: { type: 'string' },
                    finish_criteria: { type: 'string' },
                  },
                  additionalProperties: false,
                },
                prompt_conflict_preflight: {
                  type: 'object',
                  description: 'Resolve structural prompt conflicts; declare the dominant objective and rendering strategy. First-pass notes are optional.',
                  properties: {
                    dominant_objective: { type: 'string' },
                    secondary_traits: { type: 'array', maxItems: 8, items: { type: 'string' } },
                    conflicts: {
                      type: 'array', maxItems: 8,
                      items: {
                        type: 'object',
                        properties: {
                          requirement_a: { type: 'string' },
                          requirement_b: { type: 'string' },
                          pipeline_consequence: { type: 'string' },
                          severity: { type: 'string', enum: ['tension', 'structural'] },
                          requires_user_choice: {
                            type: 'boolean',
                            description: 'True when multiple reasonable interpretations remain materially different and the user must choose before Painter mutation.',
                          },
                        },
                        required: ['requirement_a', 'requirement_b', 'pipeline_consequence', 'severity', 'requires_user_choice'],
                        additionalProperties: false,
                      },
                    },
                    resolution_mode: { type: 'string', enum: ['none', 'declared-interpretation', 'user-confirmed'] },
                    chosen_rendering_strategy: { type: 'string' },
                    resolution_rationale: { type: 'string' },
                    first_pass_strategy: { type: 'array', items: { type: 'string' } },
                    user_confirmation: { type: 'string' },
                  },
                  required: ['dominant_objective', 'conflicts', 'resolution_mode', 'chosen_rendering_strategy'],
                  additionalProperties: false,
                },
                strategy_validation_after_microplans: {
                  type: 'number', minimum: 1, maximum: 2,
                  description: 'Optional advisory cadence, default 2. Counting meaningful previews does not force a Director call or block Painter execution.',
                },
                strategy_validation: {
                  type: 'object',
                  description: 'Optional strategy review, initially pending by default. A persisted due review still requires pass/replan against the exact current frame; advisory cadence alone creates no review barrier.',
                  properties: {
                    status: { type: 'string', enum: ['pending', 'pass', 'replan'] },
                    evidence_operation_id: { type: 'string' },
                    dominant_objective_read: { type: 'string' },
                    strategy_fit: { type: 'string' },
                    reason: { type: 'string' },
                  },
                  required: ['status'],
                  additionalProperties: false,
                },
                artistic_evaluation_contract: {
                  type: 'object',
                  description: 'Revision-bound, open-ended image-observable criteria derived from this run brief. It interprets the brief without defining a style taxonomy.',
                  properties: {
                    brief_items: { type: 'array', maxItems: 24, items: {
                      type: 'object', properties: {
                        item_id: { type: 'string' }, kind: { type: 'string', enum: ['hard_perceptual', 'soft_preference', 'technical_non_visual'] },
                        requirement: { type: 'string' }, provenance: { type: 'string' }, recognition_target: { type: 'string' },
                      }, required: ['item_id', 'kind', 'requirement', 'provenance'], additionalProperties: false,
                    } },
                    contract_id: { type: 'string' },
                    revision: { type: 'number', minimum: 1 },
                    positive_criteria: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
                    failure_signals: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
                    protected_qualities: { type: 'array', maxItems: 8, items: { type: 'string' } },
                    stage_transition_expectations: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
                    final_evidence_requirements: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
                    provenance: {
                      type: 'array', minItems: 1, maxItems: 8,
                      items: {
                        type: 'object',
                        properties: {
                          source: { type: 'string' },
                          detail: { type: 'string' },
                        },
                        required: ['source', 'detail'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['contract_id', 'revision', 'positive_criteria', 'failure_signals', 'stage_transition_expectations', 'final_evidence_requirements', 'provenance'],
                  additionalProperties: false,
                },
                composition_freedom: { type: 'string', enum: ['fixed', 'constrained', 'free'] },
                composition_exploration: {
                  type: 'object',
                  description: 'Composition-mode contract. Free composition requires at least two cheap alternatives and an explicit selected hypothesis.',
                  properties: {
                    hypotheses: {
                      type: 'array',
                      description: 'Cheap structural alternatives. Free composition requires at least 2 with no fixed upper bound; constrained composition with material_choice_unresolved=true is runtime-bounded to 2-4; fixed composition requires none.',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          summary: { type: 'string' },
                          large_masses: { type: 'string' },
                          negative_space: { type: 'string' },
                          light_pattern: { type: 'string' },
                        },
                        required: ['id', 'summary', 'large_masses', 'negative_space', 'light_pattern'],
                        additionalProperties: false,
                      },
                    },
                    selected_id: { type: 'string' },
                    selection_reason: { type: 'string' },
                    material_choice_unresolved: { type: 'boolean' },
                  },
                  additionalProperties: false,
                },
                perceptual_hierarchy: {
                  type: 'object',
                  description: 'Durable shared Art Director attention allocation. Ranked mode defines relative focal ordering; distributed mode is an explicit flat/all-over attention contract.',
                  properties: {
                    revision: { type: 'integer', minimum: 1 },
                    mode: { type: 'string', enum: ['ranked', 'distributed'] },
                    distributed_attention_rationale: { type: 'string', description: 'Optional artistic/audit guidance for why attention is intentionally distributed. Distributed mode is authorized structurally by mode=distributed plus distributed zone priorities.' },
                    zones: {
                      type: 'array', minItems: 1, maxItems: 24,
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          owner_ids: { type: 'array', minItems: 1, maxItems: 24, items: { type: 'string' } },
                          priority: { type: 'string', enum: ['primary', 'secondary', 'support', 'distributed'] },
                          contrast_budget: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
                          detail_budget: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
                          edge_certainty: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
                          chroma_accent: { type: 'string', enum: ['none', 'restricted', 'allowed'] },
                        },
                        required: ['id', 'owner_ids', 'priority', 'contrast_budget', 'detail_budget', 'edge_certainty', 'chroma_accent'],
                        additionalProperties: false,
                      },
                    },
                    brief_items: {
                      type: 'array', maxItems: 24,
                      items: {
                        type: 'object',
                        properties: {
                          item_id: { type: 'string' },
                          kind: { type: 'string', enum: ['hard_perceptual', 'soft_preference', 'technical_non_visual'] },
                          requirement: { type: 'string' },
                          provenance: { type: 'string' },
                          recognition_target: {
                            type: 'string',
                            description: 'Optional named-object/subject identity that must be supported by current-frame OBJECT/MICRO crop evidence before this hard item can be MET.',
                          },
                        },
                        required: ['item_id', 'kind', 'requirement', 'provenance'],
                        additionalProperties: false,
                      },
                    },
                    ordering: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['revision', 'mode', 'zones', 'ordering'],
                  additionalProperties: false,
                },
                assessment: {
                  type: 'object',
                  properties: {
                    composition: { type: 'string' },
                    focal_hierarchy: { type: 'string' },
                    large_value_masses: { type: 'string' },
                    lighting: { type: 'string' },
                    silhouette: { type: 'string' },
                    depth: { type: 'string' },
                    likeness_main_shape: { type: 'string' },
                    overall_detail_level: { type: 'string' },
                    mood: { type: 'string' },
                    color_relationships: { type: 'string' },
                    shape_language: { type: 'string' },
                    edge_hierarchy: { type: 'string' },
                    intentional_omission: { type: 'string' },
                    next_priority: { type: 'string' },
                  },
                  required: [
                    'composition', 'focal_hierarchy', 'large_value_masses', 'lighting', 'silhouette',
                    'depth', 'likeness_main_shape', 'overall_detail_level',
                    'mood', 'color_relationships', 'shape_language', 'edge_hierarchy', 'intentional_omission',
                    'next_priority',
                  ],
                  additionalProperties: false,
                },
                brush_pack_scene_plan: {
                  type: 'object',
                  description: 'Required when the art run is bound to a supplied brush pack. Scene composition/focal/depth/light decisions remain primary; this maps evidence-bound media/stamp vocabulary onto bounded Painter tasks only where causally useful.',
                  properties: {
                    brush_pack_id: { type: 'string' },
                    scene_first: { type: 'boolean' },
                    uses: {
                      type: 'array', minItems: 1, maxItems: 16,
                      items: {
                        type: 'object',
                        properties: {
                          task_id: { type: 'string' },
                          source_kind: { type: 'string', enum: ['media-role', 'stamp-profile'] },
                          source_id: { type: 'string' },
                          causal_use: { type: 'string' },
                          integration_mode: { type: 'string', enum: ['integrate', 'raw-style-contract'] },
                          subject_importance: { type: 'string', enum: ['supporting', 'hero'] },
                          user_authorization: { type: 'string' },
                        },
                        required: ['task_id', 'source_kind', 'source_id', 'causal_use', 'integration_mode', 'subject_importance'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['brush_pack_id', 'scene_first', 'uses'],
                  additionalProperties: false,
                },
                value_check: {
                  type: 'object',
                  description: 'Omit on a fresh unpainted document, or use {status:pending, observed:false}; construct the subject before grayscale analysis. Pending never unlocks DETAIL. Observed PASS/FAIL/override still require exact grayscale evidence; style exceptions require an exact durable style-contract basis.',
                  properties: {
                    status: { type: 'string', enum: ['pending', 'pass', 'fail', 'override', 'style-not-applicable'] },
                    observed: { type: 'boolean' },
                    preview_sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                    evidence_operation_id: {
                      type: 'string',
                      description: 'Guard operation id of the successful photoshop_analyze_value_structure call that produced the observed grayscale evidence.',
                    },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    limitations: { type: 'array', items: { type: 'string' } },
                    applicability_reason: { type: 'string' },
                    override_reason: { type: 'string' },
                    style_contract_basis: {
                      type: 'object',
                      description: 'Required structural authority for override/style-not-applicable. criterion must exactly match the named durable style_contract field.',
                      properties: {
                        field: { type: 'string', enum: ['realism_level', 'shape_language', 'composition_bias', 'edge_policy', 'contour_role', 'mark_visibility', 'value_policy', 'color_policy', 'spatial_treatment', 'material_treatment', 'detail_density', 'texture_policy', 'primitive_footprint_tolerance', 'layer_or_mask_bias', 'finish_criteria'] },
                        criterion: { type: 'string' },
                      },
                      required: ['field', 'criterion'],
                      additionalProperties: false,
                    },
                    criteria: {
                      type: 'object',
                      properties: {
                        large_value_grouping: {
                          type: 'object',
                          properties: { status: { type: 'string', enum: ['pass', 'fail', 'uncertain', 'not-applicable'] }, note: { type: 'string' } },
                          required: ['status'], additionalProperties: false,
                        },
                        focal_hierarchy: {
                          type: 'object',
                          properties: { status: { type: 'string', enum: ['pass', 'fail', 'uncertain', 'not-applicable'] }, note: { type: 'string' } },
                          required: ['status'], additionalProperties: false,
                        },
                        silhouette_separation: {
                          type: 'object',
                          properties: { status: { type: 'string', enum: ['pass', 'fail', 'uncertain', 'not-applicable'] }, note: { type: 'string' } },
                          required: ['status'], additionalProperties: false,
                        },
                        local_contrast_budget: {
                          type: 'object',
                          properties: { status: { type: 'string', enum: ['pass', 'fail', 'uncertain', 'not-applicable'] }, note: { type: 'string' } },
                          required: ['status'], additionalProperties: false,
                        },
                        detail_before_form: {
                          type: 'object',
                          properties: { status: { type: 'string', enum: ['pass', 'fail', 'uncertain', 'not-applicable'] }, note: { type: 'string' } },
                          required: ['status'], additionalProperties: false,
                        },
                      },
                      additionalProperties: false,
                    },
                  },
                  required: ['status', 'observed'],
                  additionalProperties: false,
                },
                refinement_check: {
                  type: 'object',
                  description: 'Durable subject-agnostic progressive-refinement stage-exit evidence. DETAIL is blocked while this is pending/fail. A pass requires perceptually meaningful representation change and resolved lower-frequency form/block-in debt. style-not-applicable must be justified by an exact declared style_contract field.',
                  properties: {
                    status: { type: 'string', enum: [...REFINEMENT_CHECK_STATUSES] },
                    observed: { type: 'boolean' },
                    preview_sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                    evidence_operation_id: {
                      type: 'string',
                      description: 'Guard operation id of the successful visual operation whose preview is the exact current frame being assessed.',
                    },
                    representation_change: { type: 'string', enum: [...REPRESENTATION_CHANGE_STATUSES] },
                    low_frequency_evidence: {
                      type: 'object',
                      description: 'Required for refinement PASS. Observed low-frequency/thumbnail evidence from photoshop_analyze_value_structure proving that major-form modelling survives suppression of small texture/noise.',
                      properties: {
                        status: { type: 'string', enum: ['resolved', 'debt', 'uncertain'] },
                        observed: { type: 'boolean' },
                        source_preview_sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                        evidence_operation_id: {
                          type: 'string',
                          description: 'Completed photoshop_analyze_value_structure operation for the exact current frame.',
                        },
                        note: { type: 'string' },
                      },
                      required: ['status', 'observed', 'source_preview_sha256', 'evidence_operation_id', 'note'],
                      additionalProperties: false,
                    },
                    material_response: materialResponseReviewSchema(),
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    limitations: { type: 'array', items: { type: 'string' } },
                    applicability_reason: { type: 'string' },
                    style_contract_basis: {
                      type: 'object',
                      properties: {
                        field: { type: 'string', enum: [...REFINEMENT_STYLE_BASIS_FIELDS] },
                        criterion: { type: 'string' },
                      },
                      required: ['field', 'criterion'],
                      additionalProperties: false,
                    },
                    criteria: {
                      type: 'object',
                      properties: Object.fromEntries(REFINEMENT_CRITERIA.map(key => [key, {
                        type: 'object',
                        properties: {
                          status: { type: 'string', enum: [...REFINEMENT_CRITERION_STATUSES] },
                          note: { type: 'string' },
                        },
                        required: ['status', 'note'],
                        additionalProperties: false,
                      }])),
                      additionalProperties: false,
                    },
                  },
                  required: ['status', 'observed'],
                  additionalProperties: false,
                },
                physical_stack_check: physicalStackCheckSchema(),
                priorities: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } },
                review_after_microplans: {
                  type: 'number', minimum: 1, maximum: 20,
                  description: 'Planner-selected review horizon. Usually around 5-10 completed Painter micro-plans, but intentionally not a fixed magic constant.',
                },
                forbidden_without_review: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'composition', 'large-value', 'lighting-structure', 'silhouette',
                      'depth-structure', 'likeness-main-shape', 'background-scope',
                    ],
                  },
                },
                tasks: {
                  type: 'array', minItems: 1, maxItems: 8,
                  items: {
                    type: 'object',
                    properties: {
                      task_id: { type: 'string' },
                      summary: { type: 'string' },
                      region: { type: 'string' },
                      allowed_scales: {
                        type: 'array',
                        items: { type: 'string', enum: ['medium', 'small', 'detail', 'local', 'micro'] },
                      },
                      allowed_global_changes: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: [
                            'composition', 'large-value', 'lighting-structure', 'silhouette',
                            'depth-structure', 'likeness-main-shape', 'background-scope',
                          ],
                        },
                      },
                      affected_relations: { type: 'array', items: { type: 'string' } },
                      affected_qualities: { type: 'array', items: { type: 'string' } },
                      perceptual_zone_ids: {
                        type: 'array', maxItems: 8, items: { type: 'string' },
                        description: 'Attention zones this bounded Painter task is authorized to consume when it changes local contrast/detail/edge/chroma emphasis.',
                      },
                      construction_plan: {
                        type: 'object',
                        description: 'Deep-local construction plan for the active representational task. It defines the form transition before detail instead of treating a generic broad mass as sufficient.',
                        properties: {
                          representation_strategy: { type: 'string' },
                          structural_features: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'string' } },
                          recognition_features: { type: 'array', maxItems: 12, items: { type: 'string' } },
                          negative_spaces: { type: 'array', maxItems: 12, items: { type: 'string' } },
                          occlusions: { type: 'array', maxItems: 12, items: { type: 'string' } },
                          perspective_or_flow: { type: 'string' },
                          primitive_risks: { type: 'array', maxItems: 12, items: { type: 'string' } },
                          stage_exit_condition: { type: 'string' },
                        },
                        required: ['representation_strategy', 'structural_features', 'stage_exit_condition'],
                        additionalProperties: false,
                      },
                    },
                    required: ['task_id', 'summary'],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                'directive_id', 'goal', 'style_contract', 'prompt_conflict_preflight',
                'artistic_evaluation_contract', 'composition_freedom', 'composition_exploration',
                'assessment', 'perceptual_hierarchy', 'refinement_check', 'priorities',
                'review_after_microplans', 'tasks',
              ],
              additionalProperties: false,
            },
            global_brief_assessment: {
              type: 'object',
              description: 'Bounded whole-brief evaluation. A global artistic claim is independently validated only when contract revision, current frame SHA and an authorized critic result all match.',
              properties: {
                outcome: { type: 'string', enum: ['satisfied', 'unsatisfied', 'regression', 'uncertain', 'not-evaluated'] },
                contract_id: { type: 'string' },
                contract_revision: { type: 'number', minimum: 1 },
                frame_sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                critic_authority: { type: 'string', enum: ['authorized', 'shadow'] },
                critic_result_id: { type: 'string' },
                criteria: { type: 'array', items: { type: 'string' } },
                brief_item_results: {
                  type: 'array', maxItems: 24,
                  items: {
                    type: 'object',
                    properties: {
                      item_id: { type: 'string' },
                      state: { type: 'string', enum: ['UNASSESSED', 'MET', 'NOT_MET', 'UNCERTAIN'] },
                      reason: { type: 'string' },
                      evidence: { type: 'array', maxItems: 8, items: { type: 'string' } },
                    },
                    required: ['item_id', 'state'],
                    additionalProperties: false,
                  },
                },
                reason: { type: 'string' },
              },
              required: ['outcome'],
              additionalProperties: false,
            },
            pre_final_hostile_review: {
              type: 'object',
              description: 'Required for action=complete. Exact-current adversarial review; any hard defect blocks completion.',
              properties: {
                contract_id: { type: 'string' },
                contract_revision: { type: 'number', minimum: 1 },
                frame_sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                checks: {
                  type: 'array', minItems: 6, maxItems: 6,
                  items: {
                    type: 'object',
                    properties: {
                      area: {
                        type: 'string',
                        enum: [
                          'whole_frame_brief', 'named_subject_recognition', 'geometry_completion',
                          'physical_effect_accountability', 'material_differentiation', 'style_realism',
                        ],
                      },
                      status: { type: 'string', enum: ['clear', 'defect', 'not_applicable'] },
                      reason: { type: 'string' },
                    },
                    required: ['area', 'status'],
                    additionalProperties: false,
                  },
                },
                major_defects: {
                  type: 'array', maxItems: 12,
                  items: {
                    type: 'object',
                    properties: {
                      summary: { type: 'string' },
                      debt_class: { type: 'string', enum: ['hard', 'soft'] },
                      brief_item_id: { type: 'string' },
                    },
                    required: ['summary', 'debt_class'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['contract_id', 'contract_revision', 'frame_sha256', 'checks', 'major_defects'],
              additionalProperties: false,
            },
            anchor_decision: {
              type: 'object',
              description: 'Whole-image anchor decision. Promotion is explicit and must reference a classified durable frame; keeping a local edit never promotes an anchor implicitly.',
              properties: {
                action: { type: 'string', enum: ['promote_primary', 'retain_primary', 'preserve_alternative'] },
                operation_id: { type: 'string' },
                rationale: { type: 'string' },
                preserve_previous_as_alternative: { type: 'boolean' },
                capture_restore_state: {
                  type: 'boolean',
                  description: 'When true on promote_primary/preserve_alternative, Guard records pinned layer/active-layer/selection state for later one-action exact anchor recovery.',
                },
              },
              required: ['action'],
              additionalProperties: false,
            },
            incomplete_hypothesis: {
              type: 'object',
              description: 'Bounded artistic hypothesis that may temporarily lose a named quality but must retain a real rollback anchor and finite review horizon.',
              properties: {
                lost_quality: { type: 'string' },
                intended_relationship: { type: 'string' },
                observable_completion_condition: { type: 'string' },
                rollback_operation_id: { type: 'string' },
                rollback_path: { type: 'string' },
                max_review_horizon: { type: 'number', minimum: 1, maximum: 8 },
              },
              required: ['lost_quality', 'intended_relationship', 'observable_completion_condition', 'max_review_horizon'],
              additionalProperties: false,
            },
            incomplete_hypothesis_resolution: {
              type: 'string',
              enum: ['resolved', 'accepted', 'reversed'],
            },
            whole_image_glance: {
              type: 'object',
              description: 'Independent whole-image observation only at a stage, global-change, or final boundary.',
              properties: {
                trigger: { type: 'string', enum: ['stage_boundary', 'global_change', 'final_review'] },
                observation: { type: 'string' },
                operation_id: { type: 'string', description: 'Exact artistic-frame operation id. Required when satisfying a pending whole-image boundary.' },
                frame_sha256: { type: 'string', description: 'Exact 64-hex artistic-frame SHA. Required when satisfying a pending whole-image boundary.' },
                relationship_audit: {
                  type: 'object',
                  description: 'When pending required_relations is nonempty, supply checks[] with relation, status=pass|defect|uncertain, and existing-format review_finding for each defect. Runtime validates the exact bounded scope.',
                },
              },
              required: ['trigger', 'observation'],
              additionalProperties: false,
            },
          },
          required: ['document_id', 'action'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        const definition = definitions.find(item => item.tool.name === 'photoshop_guard_art_director')!;
        const errors = collectSchemaErrors(args, definition.tool.inputSchema, 'args');
        if (args.action === 'review' && args.directive === undefined) errors.push('args.directive is required for action=review');
        if (args.action === 'review' && args.directive && typeof args.directive === 'object') {
          const schema = definition.tool.inputSchema as JsonSchemaNode;
          const directive = args.directive as Record<string, unknown>;
          for (const field of ['value_check', 'refinement_check']) {
            const rawCheck = directive[field];
            if (!rawCheck || typeof rawCheck !== 'object') continue;
            const check = rawCheck as Record<string, unknown>;
            const status = typeof check.status === 'string' ? check.status : '';
            const required = ['status', 'observed'];
            if (['pass', 'fail', 'override'].includes(status)) required.push('preview_sha256', 'evidence_operation_id', 'criteria');
            if (field === 'refinement_check' && ['pass', 'fail'].includes(status)) required.push('representation_change');
            if (field === 'refinement_check' && status === 'pass') required.push('low_frequency_evidence', 'material_response');
            if (['override', 'style-not-applicable'].includes(status)) required.push('style_contract_basis');
            errors.push(...collectSchemaErrors(check, { ...schema.properties!.directive!.properties![field], required }, `args.directive.${field}`));
            if (status === 'pending' && check.observed !== false) errors.push(`args.directive.${field}.observed must be false for pending`);
            if (['pass', 'fail', 'override'].includes(status) && check.observed !== true) errors.push(`args.directive.${field}.observed must be true for an observed verdict`);
          }
        }
        const semantic = args.action === 'review' ? runtime.collectArtDirectorReviewErrors(args) : [];
        const issues = [...new Set([...errors, ...semantic])];
        if (issues.length) return json({ ok: false, code: 'guard_art_director_contract_invalid',
          issues, visual_mutation_started: false,
          correction: 'Correct all listed fields in one request using the published schema. Retrieve durable fields with photoshop_guard_resume(director_fields); never inspect source. Fixed composition requires empty hypotheses and no selected_id/selection_reason. Observed checks require current exact-image evidence; pending is legal only for an unobserved check.',
        }, true);
        try { return json(await runtime.artDirector(args)); }
        catch (error) { return json({ ok: false, code: 'guard_art_director_rejected', message: error instanceof Error ? error.message : String(error),
          next: 'Report this exact state/evidence blocker; do not repeat the same directive or inspect source.' }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_recover_lock',
        description: 'Release locks only for dead owners; embedded_guard_job_stalled with a live PID requires MCP-child restart before recovery, never mutation replay.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => {
        try { return json(runtime.recoverLocks()); }
        catch (error) { return json({ ok: false, code: 'guard_lock_recovery_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
  ];
  return definitions;
}
