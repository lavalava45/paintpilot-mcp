import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { EmbeddedGuardRuntime, guardRuntimeErrorCode } from '../core/guard/runtime.js';
import {
  COMPACT_GUARD_PROTOCOL_VERSION,
  UXP_BRIDGE_REVISION,
  guardProtocolVersionError,
} from '../core/guard/protocol-version.js';
import { visualReviewPackage } from '../core/guard/cycle.js';
import { PAINTING_CONSTRUCTION_ROLES, PAINTING_VISUAL_INTENTS } from '../core/painting-method-palette.js';
import { PAINTING_STAGE_RESET_REASONS } from '../core/painting-stage-policy.js';
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
} from '../core/visual-microplan.js';
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
import {
  PHYSICAL_STACK_CHECK_STATUSES,
  PHYSICAL_STACK_CRITERIA,
  PHYSICAL_STACK_CRITERION_STATUSES,
} from '../core/physical-stack-check.js';
import { SCENE_OWNERSHIP_EDITABILITY } from '../core/scene-ownership-plan.js';
import {
  PAINTING_INTENT_ACTIONS,
  PAINTING_INTENT_SCALES,
  PAINTING_INTENT_VISUAL_INTENTS,
} from '../core/guard/painting-intent.js';

const REVIEW_IMAGE_MAX_BLOCKS = 4;
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
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function explicitReviewImageResult(
  runtime: EmbeddedGuardRuntime,
  operationId: string,
  requestedRoles?: string[]
): ToolResult {
  const record = runtime.store.read(operationId);
  if (!record?.visual || !record.preview) {
    return json({
      ok: false,
      code: 'guard_review_image_unavailable',
      message: `Visual operation ${operationId} does not have a durable review preview.`,
    }, true);
  }
  const review = visualReviewPackage(record, runtime.store.visualSignificance(operationId));
  if (!review) {
    return json({
      ok: false,
      code: 'guard_review_image_unavailable',
      message: `Visual operation ${operationId} does not have review metadata.`,
    }, true);
  }
  const expectedRoles = reviewRequestedRoles(review);
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
  const reviewRequestReceivedAt = new Date().toISOString();

  const images: Array<{ type: 'image'; data: string; mimeType: string }> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const omitted: Array<Record<string, unknown>> = [];
  let totalBytes = 0;
  let totalEncodedBytes = 0;
  for (const role of roles) {
    if (images.length >= REVIEW_IMAGE_MAX_BLOCKS) {
      omitted.push({ role, reason: 'image_block_limit' });
      continue;
    }
    const frame = reviewRoleFrame(review, role);
    const file = frame?.materialized_path;
    const expectedSha = frame?.sha256;
    if (!frame || typeof file !== 'string' || typeof expectedSha !== 'string' || !existsSync(file)) {
      omitted.push({ role, reason: 'materialized_image_unavailable' });
      continue;
    }
    let size: number;
    try {
      const stat = statSync(file);
      if (!stat.isFile()) {
        omitted.push({ role, reason: 'materialized_image_not_file' });
        continue;
      }
      size = stat.size;
    } catch {
      omitted.push({ role, reason: 'materialized_image_stat_failed' });
      continue;
    }
    const estimatedEncodedBytes = base64EncodedBytes(size);
    if (totalEncodedBytes + estimatedEncodedBytes > REVIEW_IMAGE_MAX_ENCODED_BYTES) {
      omitted.push({ role, reason: 'response_byte_budget', bytes: size, encoded_bytes: estimatedEncodedBytes, max_total_bytes: REVIEW_RESPONSE_MAX_BYTES });
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
    const encodedBytes = base64EncodedBytes(bytes.byteLength);
    if (totalEncodedBytes + encodedBytes > REVIEW_IMAGE_MAX_ENCODED_BYTES) {
      omitted.push({ role, reason: 'response_byte_budget', bytes: bytes.byteLength, encoded_bytes: encodedBytes, max_total_bytes: REVIEW_RESPONSE_MAX_BYTES });
      continue;
    }
    const mimeType = typeof frame.mime_type === 'string' ? frame.mime_type : 'image/jpeg';
    images.push({ type: 'image', data: bytes.toString('base64'), mimeType });
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
    transport: images.length ? 'mcp_image_content_explicit_review' : 'metadata_only',
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
      semantics: 'server_observed_review_image_tool_boundaries',
    },
  };
  const receipt = runtime.store.recordVisualDeliveryReceipt(operationId, delivery);
  const documentId = Number(record.args?.document_id);
  const artisticContinuation = Number.isSafeInteger(documentId) && documentId > 0
    ? runtime.store.artisticContinuationContext(documentId)
    : null;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ok: receipt.delivery_complete === true,
        operation_id: operationId,
        delivery: {
          ...delivery,
          delivered: receipt.delivered,
          delivery_complete: receipt.delivery_complete,
          undelivered_roles: receipt.undelivered_roles,
        },
        ...(artisticContinuation ? { artistic_continuation: artisticContinuation } : {}),
        next_required_action: receipt.delivery_complete
          ? 'Inspect the delivered image blocks, select/adapt the compact artistic continuation candidate when useful, then continue with previous_operation_id + previous_observation plus painting_intent or next_pass.'
          : 'Some required review roles were not delivered. Request the remaining roles before visual verdict closure.',
      }, null, 2),
    }, ...images],
    ...(receipt.delivery_complete ? {} : { isError: true }),
  };
}

function compactPassSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      request_key: {
        type: 'string',
        description: 'Unique stable idempotency key for this execution attempt. Re-delivering the same request_key must not repeat a mutation. Do not reuse it for a new attempt.',
      },
      problem_id: {
        type: 'string',
        description: 'Stable artistic problem identity shared across multiple distinct attempts at the same unresolved visual problem. Omit only when request_key intentionally also names the problem.',
      },
      document_id: { type: 'number', minimum: 1 },
      restore_anchor_operation_id: {
        type: 'string',
        description:
          'One-action accepted-state recovery. Supply a registered primary/alternative artistic anchor operation id instead of actions. Guard computes bounded undo depth internally, restores through the pinned Photoshop document, and verifies exact preview SHA plus registered layer/active-layer/selection parity before closing the recovery.',
      },
      goal: {
        type: 'string',
        description: 'The single authoritative artistic goal for the pass.',
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
        description: 'Optional broader exact source-document object/semantic bounds for direct MICRO review. Must contain region_bounds; Guard never invents this context region.',
      },
      protected_regions: { type: 'array', items: { type: 'string' } },
      protected_layer_ids: { type: 'array', items: { type: 'number', minimum: 1 } },
      replace_protected_layer_ids: {
        type: 'array',
        items: { type: 'number', minimum: 1 },
        description: 'Exact protected layer ids intentionally replaced/erased by this pass. Every id must also be in protected_layer_ids and action_class must explicitly be REPLACE or ERASE.',
      },
      action_class: {
        type: 'string',
        enum: [...VISUAL_MICROPLAN_ACTION_CLASSES],
        description: 'Optional explicit artistic mutation intent. Required for protected-layer REPLACE/ERASE exceptions and late-stage paint_regions corrections. Omit for ordinary ADD inference.',
      },
      stage: {
        type: 'string',
        description: 'Optional override when no durable current stage exists; normally inherited from the art run.',
      },
      stage_reset: {
        type: 'object',
        description: 'Explicit durable authorization for a genuine backward structural stage transition. Required only when next_pass.stage moves earlier than the durable current stage; ordinary passes cannot regress stage merely to regain early-stage primitives.',
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
        description: 'Semantic editability decision for this pass. Required for committed nontrivial refinement and for independently editable new logical owners.',
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
        description: 'Explicit fail-closed authorization for intentionally targeting a historical physical binding of the declared semantic owner. Ordinary correction preserves the current authoritative binding; migration deliberately moves it.',
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
      scene_ownership_plan: {
        type: 'object',
        description: 'Durable scene-level ownership plan declared before the first committed semantic owner is constructed. semantic_id names the visual concern; owner_id is the stable future logical_layer.hypothesis_id. Multiple semantic units may share one owner only through explicit shared-owner justification.',
        properties: {
          plan_id: { type: 'string' },
          units: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            items: {
              type: 'object',
              properties: {
                semantic_id: { type: 'string' },
                owner_id: { type: 'string' },
                role: { type: 'string', minLength: 4 },
                editability: { type: 'string', enum: [...SCENE_OWNERSHIP_EDITABILITY] },
                rationale: { type: 'string', description: 'Optional audit/artistic guidance for this semantic ownership assignment.' },
              },
              required: ['semantic_id', 'owner_id', 'role', 'editability'],
              additionalProperties: false,
            },
          },
          shared_owner_justifications: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'object',
              properties: {
                owner_id: { type: 'string' },
                semantic_ids: { type: 'array', minItems: 2, items: { type: 'string' } },
                rationale: { type: 'string', description: 'Optional audit/artistic guidance for why these semantic ids intentionally share one owner.' },
              },
              required: ['owner_id', 'semantic_ids'],
              additionalProperties: false,
            },
          },
        },
        required: ['plan_id', 'units'],
        additionalProperties: false,
      },
      scene_geometry_model: {
        type: 'object',
        description: 'Durable document-incarnation-bound scene geometry/projection model. A later structural revision must preserve model_id and increase revision.',
        properties: {
          model_id: { type: 'string' },
          revision: { type: 'number', minimum: 1 },
          applicability: { type: 'string', enum: ['coherent_3d', 'orthographic_or_diagrammatic', 'flat_or_collage', 'intentional_non_euclidean', 'insufficient_evidence'] },
          applicability_rationale: { type: 'string' },
          source_frame: {
            type: 'object',
            properties: {
              document_id: { type: 'number', minimum: 1 },
              document_incarnation: { type: 'string' },
              width: { type: 'number', minimum: 1 },
              height: { type: 'number', minimum: 1 },
              operation_id: { type: 'string' },
              preview_sha256: { type: 'string' },
            },
            required: ['document_id', 'document_incarnation', 'width', 'height'],
            additionalProperties: false,
          },
          projection: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['one_point', 'two_point', 'three_point', 'weak_perspective', 'orthographic', 'custom'] },
              horizon: { type: 'object' },
              vanishing_points: { type: 'array', maxItems: 8, items: { type: 'object' } },
            },
            required: ['kind', 'vanishing_points'],
            additionalProperties: false,
          },
          line_families: { type: 'array', maxItems: 16, items: { type: 'object' } },
          support_planes: { type: 'array', maxItems: 16, items: { type: 'object' } },
          scale_anchors: { type: 'array', maxItems: 24, items: { type: 'object' } },
        },
        required: ['model_id', 'revision', 'applicability', 'source_frame', 'projection'],
        additionalProperties: false,
      },
      scene_lighting_color_model: {
        type: 'object',
        description: 'Durable document-incarnation-bound lighting/color model used by broad color, atmosphere, relighting, and material-response preflights. A later revision must preserve model_id and increase revision.',
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
        description: 'Required semantic color/gradient receipt for broad color-field, relighting, atmosphere, and major optical-effect passes. Must reference the exact active scene_lighting_color_model revision.',
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
        description: 'Stable semantic owner binding. hypothesis_id is owner identity across passes; request_key is never owner identity.',
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
          geometry_binding: {
            type: 'object',
            description: 'Durable relational binding from this semantic owner to the exact scene_geometry_model revision. Required for committed owner-bearing structured construction in coherent_3d scenes.',
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
          attention_binding: { type: 'object' },
        },
        required: ['decision', 'hypothesis_id', 'hypothesis', 'rollback_value', 'expected_independent_rollback'],
        additionalProperties: false,
      },
      scale: {
        type: 'string',
        description: 'Optional override when no durable active scale exists; normally inherited from the art run.',
      },
      brush_role: {
        type: 'string',
        description: 'Optional durable brush-role hint when several preflighted roles fit. Omit to let Guard choose by working scale.',
      },
      material_role: {
        type: 'string',
        description: 'Explicit material/surface role. Guard uses it for construction-role planning and matches brush-based refinement against durable brush_preflight roles.',
      },
      construction_role: {
        type: 'string',
        enum: [...PAINTING_CONSTRUCTION_ROLES],
        description: 'Subject-agnostic construction role fixed before mechanism selection for broad nontrivial construction. structured-mass preserves legitimate early closed-mass block-in; continuous/soft/environmental roles route to their dedicated mechanisms.',
      },
      material_response: {
        type: 'object',
        description: 'Required for MATERIAL visual work. Qualitatively decomposes visible material response before brush/texture execution; no numeric roughness/PBR score is used.',
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
      style_contract_basis: {
        type: 'object',
        description: 'Optional exact durable style-contract basis for an otherwise suspicious primitive-heavy late pass. The criterion must exactly equal the active Art Director style_contract field; this is not a free-form bypass.',
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
      independent_region: {
        type: 'boolean',
        description: 'True only when this pass is independent of the currently unresolved primary mismatch; preservation_facts must explain why.',
      },
      addresses_primary_mismatch: { type: 'boolean' },
      deferred_from_operation_id: {
        type: 'string',
        description:
          'Explicit post-review selection of a compiler-owned deferred sub-pass from a prior safe SPLIT_DEFER. Do not combine with actions; Guard reloads the durable deferred action geometry and revalidates it against current state.',
      },
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
        description: 'Evidence-fit reason for the selected preset when a brush role has multiple viable candidates. State the relevant observed mark behavior rather than familiarity or generic preference.',
      },
      brush_retry_reason: {
        type: 'string',
        minLength: 12,
        description: 'Required when retrying the same preset after that preset failed or was rolled back for the same problem while viable alternatives exist. Explain why the failure was not caused by mark fit and why reuse remains causal rather than habitual.',
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
            id: { type: 'string' },
            tool: { type: 'string' },
            args: { type: 'object', additionalProperties: true },
            description: { type: 'string' },
            method_id: { type: 'string' },
            edge_boundary_ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'tool'],
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
      goal: { type: 'string' },
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
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: 32,
        description:
          'Bounded concrete Photoshop actions only when visible geometry/color/tool parameters are not uniquely derivable. Guard injects durable owner/layer/planner/verification protocol around them.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            tool: { type: 'string' },
            args: { type: 'object', additionalProperties: true },
            description: { type: 'string' },
            method_id: { type: 'string' },
            edge_boundary_ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'tool'],
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

function compactObservationSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      observed: {
        type: 'string',
        description: 'Preferred compact form: one short factual observation grounded in the delivered frame.',
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
        description: 'Short factual observation grounded in the delivered previous frame.',
      },
      target_resolved: { type: 'string', enum: ['yes', 'no', 'uncertain'] },
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
        enum: ['organic-clustered', 'directional-broken', 'perspective-regular', 'intentional-uniform'],
        description: 'Optional spatial-distribution contract for repeated marks. This complements pattern_intent: random jitter is not proof of organic clustering, and perspective-regular distribution is checked against the declared surface frame.',
      },
      primary_mismatch: { type: 'string' },
      global_readability: { type: 'string', enum: ['improved', 'stable', 'degraded', 'unknown'] },
      primitive_footprint: { type: 'string', enum: ['none', 'acceptable', 'suspect', 'unknown'] },
      trend_signals: { type: 'array', items: { type: 'string' } },
      softness_review: {
        type: 'object',
        description: 'Structured contextual review for broad softness/over-smoothing. Required by Guard for broad soft-dominant work in nontrivial paintings. It is bound to the exact current preview internally; do not use a generic sharpness score.',
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
  return [
    {
      tool: {
        name: 'photoshop_guard_capabilities',
        description: 'Describe the embedded durable Photoshop Guard, acknowledgement/barrier behavior and current public mutation mode.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => json({
        ...runtime.capabilities(),
        compact_guard_protocol_version: COMPACT_GUARD_PROTOCOL_VERSION,
        expected_uxp_bridge_revision: UXP_BRIDGE_REVISION,
      }),
    },
    {
      tool: {
        name: 'photoshop_guard_brush_pack_ingest',
        description:
          'Canonical Guard entry for a supplied Photoshop brush pack. Recursively fingerprints .abr assets, performs idempotent UXP import with durable command receipts, compares exact before/after installed-preset inventory, and returns a durable brush_pack_id plus attributed preset occurrences. This is a global Photoshop preparation operation, not a canvas mutation.',
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
          'Canonical bounded brush-pack profiling surface. plan returns a finite probe plan; probe_media executes one disposable UXP probe sheet under a stable no-replay command and returns exact preview evidence; record_media stores evidence-bound mark behavior; record_stamp stores a separate evidence-bound motif vocabulary without guessing semantics from names; build_preflight generates the durable media-brush role map.',
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
          'Bind a Photoshop document to one repository-local art-project folder. Non-trivial painting is the default profile and remains fail-closed until this same art run records a live brush_preflight role map from the installed Photoshop preset inventory. Re-call with the same immutable process_dir after inventory/probes to persist brush_preflight.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number', minimum: 1 },
            process_dir: {
              type: 'string',
              description: 'Repository-relative path exactly processes/<subject>-process/<run-name> using lowercase kebab-case.',
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
            },
            painting_profile: {
              type: 'string',
              enum: ['nontrivial_painting', 'simple_graphic'],
              default: 'nontrivial_painting',
              description: 'nontrivial_painting requires brush preflight and VisualMicroPlan-mediated paint; simple_graphic may be upgraded in place to nontrivial_painting when the stronger obligations are supplied.',
            },
            profile_transition_reason: {
              type: 'string',
              description: 'Optional audit/artistic context for an in-place simple_graphic -> nontrivial_painting upgrade. The stronger profile obligations, not prose, authorize the transition.',
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
                      working_scale: { type: 'string' },
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
        try { return json(await runtime.artRunWithCapabilitySnapshot(args)); }
        catch (error) { return json({ ok: false, code: 'guard_art_run_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_status',
        description: 'Read compact durable Guard state and paint readiness for the established local Photoshop workflow. Optional next_pass runs read-only lint. diagnostic_timing_marker is benchmark-only; do not add marker calls to normal painting. Use after interruption before declaring the route is unavailable; never replay prior mutations.',
        inputSchema: {
          type: 'object',
          properties: {
            next_pass: compactPassSchema(),
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
        return json({
          ...(await runtime.statusWithCapabilitySnapshots()),
          ...(args.next_pass && typeof args.next_pass === 'object' && !Array.isArray(args.next_pass)
            ? { next_pass_lint: await runtime.lintNextPass(args.next_pass as Record<string, unknown>) }
            : {}),
        });
      },
    },
    {
      tool: {
        name: 'photoshop_guard_keep_logical_layer',
        description:
          'Promote one exact temporary semantic layer owner to stable ownership without mutating Photoshop pixels or layer structure. The exact hypothesis_id -> layer_id binding must already exist in the current document journal. Use this only after the temporary structure has been visually accepted; discard/merge still use the real guarded Photoshop layer operations.',
        inputSchema: {
          type: 'object',
          properties: {
            request_key: { type: 'string' },
            document_id: { type: 'number', minimum: 1 },
            hypothesis_id: { type: 'string' },
            layer_id: { type: 'number', minimum: 1 },
            rationale: { type: 'string', description: 'Optional audit/artistic guidance for why this already-bound temporary owner is being promoted.' },
            scene_ownership_plan: {
              type: 'object',
              description: 'Required when this temporary owner is the first committed owner and no durable scene ownership plan exists yet. Must predeclare the owner being kept; later keep calls reuse the durable plan.',
              properties: {
                plan_id: { type: 'string' },
                units: {
                  type: 'array', minItems: 1, maxItems: 32,
                  items: {
                    type: 'object',
                    properties: {
                      semantic_id: { type: 'string' },
                      owner_id: { type: 'string' },
                      role: { type: 'string', minLength: 4 },
                      editability: { type: 'string', enum: [...SCENE_OWNERSHIP_EDITABILITY] },
                      rationale: { type: 'string', description: 'Optional audit/artistic guidance for this semantic ownership assignment.' },
                    },
                    required: ['semantic_id', 'owner_id', 'role', 'editability'],
                    additionalProperties: false,
                  },
                },
                shared_owner_justifications: {
                  type: 'array', maxItems: 16,
                  items: {
                    type: 'object',
                    properties: {
                      owner_id: { type: 'string' },
                      semantic_ids: { type: 'array', minItems: 2, items: { type: 'string' } },
                      rationale: { type: 'string', description: 'Optional audit/artistic guidance for why these semantic ids intentionally share one owner.' },
                    },
                    required: ['owner_id', 'semantic_ids'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['plan_id', 'units'],
              additionalProperties: false,
            },
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
        description: 'Resume one established local Photoshop workflow after interruption without replaying any prior mutation. With no document_id, consume and verify the persisted continuation checkpoint first: an exact match returns the already-delivered frame/operation and bounded next action; a stale checkpoint fails closed into one bounded status/recovery verification. Pass document_id only for an explicit workflow selection. Drawing/image continuation remains bound to the local Photoshop document unless the user explicitly changes execution mode.',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number', minimum: 1 } },
          additionalProperties: false,
        },
      },
      handler: async (args) => json(runtime.resume(typeof args.document_id === 'number' ? args.document_id : undefined)),
    },
    {
      tool: {
        name: 'photoshop_guard_lint_next_pass',
        description: 'Read-only deterministic validation for one proposed compact next_pass against current durable Guard state.',
        inputSchema: {
          type: 'object',
          properties: { next_pass: compactPassSchema() },
          required: ['next_pass'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try { return json(await runtime.lintNextPass(args.next_pass as Record<string, unknown>)); }
        catch (error) { return json({ ok: false, code: 'guard_next_pass_lint_failed', execution: 'not-executed', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: cycleTool(
        'photoshop_guard_cycle',
        'Run one durable compact Photoshop cycle inside the embedded Guard. Start with next_pass; after inspecting the returned frame, continue or finalize with previous_operation_id + previous_observation and optionally another next_pass. Technical report/receipt/verdict closure is derived internally.'
      ),
      handler: async (args) => {
        try { return json(await runtime.cycle(compactCycleArgs(args)), false, runtime); }
        catch (error) { return json({ ok: false, code: guardRuntimeErrorCode(error, 'guard_cycle_rejected'), message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: cycleTool(
        'photoshop_guard_cycle_auto',
        'Preferred normal entry point for local Photoshop creation/editing/painting/continuation and accepted-anchor recovery. In an established workflow stay on this route unless the user explicitly changes execution mode. One Guard pass is NOT an entire artistic stage: a whole-canvas/recognition block-in may require several sequential passes. request_key identifies the unique execution attempt; problem_id identifies the stable artistic problem across attempts. Guard derives technical method/preview requirements from the actual actions. Start ordinary work with next_pass={request_key,problem_id?,document_id,goal,region/protection,action_class?,actions}. To restore a registered accepted anchor, send next_pass={request_key,document_id,goal,restore_anchor_operation_id} with no actions; Guard computes bounded history internally and closes recovery only after exact preview/state parity. Visual cycle results are reference-only: call photoshop_guard_review_image for the returned operation before submitting previous_observation. Guard derives technical report, exact receipt acknowledgement and internal visual closure. Short work runs synchronously; longer work returns a durable job_id for photoshop_guard_job_poll.'
      ),
      handler: async (args) => {
        try { return json(await runtime.cycleAuto(compactCycleArgs(args)), false, runtime); }
        catch (error) { return json({ ok: false, code: guardRuntimeErrorCode(error, 'guard_cycle_rejected'), message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_review_image',
        description:
          'Explicitly deliver the exact durable image bytes for a pending Guard visual review. Guard cycle/poll responses are reference-only; call this after receiving a visual_review operation_id, inspect the returned MCP image blocks, then submit previous_observation. The tool never replays or mutates Photoshop.',
        inputSchema: {
          type: 'object',
          properties: {
            operation_id: { type: 'string' },
            roles: {
              type: 'array',
              minItems: 1,
              maxItems: REVIEW_IMAGE_MAX_BLOCKS,
              items: { type: 'string' },
              description: 'Optional subset of exact review roles such as after or after_crop. Omit to deliver every role required by the Guard review package.',
            },
          },
          required: ['operation_id'],
          additionalProperties: false,
        },
      },
      handler: async (args) => explicitReviewImageResult(
        runtime,
        String(args.operation_id ?? ''),
        Array.isArray(args.roles) ? args.roles.filter((role): role is string => typeof role === 'string') : undefined
      ),
    },
    {
      tool: {
        name: 'photoshop_guard_job_poll',
        description: 'Poll a durable embedded-Guard background job. Completed visual jobs return reference-only review metadata; use photoshop_guard_review_image for exact image delivery. Running/uncertain jobs must not be replaced by a second mutation.',
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
        description: 'Resolve an interrupted/uncertain operation from fresh evidence. Normal recovery requires same-document state + preview. If the user explicitly closed the target document first, a fresh photoshop_list_documents record proving that document absent may close the workflow as abandoned. The original operation remains non-replayable.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            state_id: { type: 'string' },
            preview_id: { type: 'string' },
            documents_id: { type: 'string', description: 'Fresh Guard operation id for photoshop_list_documents; used only for closed-document abandonment recovery.' },
            document_closed_confirmed: { type: 'boolean', description: 'Must be true only after the user explicitly confirms the interrupted target document was closed.' },
            outcome: { type: 'string', enum: ['completed', 'not-executed', 'partial', 'abandoned'] },
            reason: { type: 'string' },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        try { return json(await runtime.reconcile(args)); }
        catch (error) { return json({ ok: false, code: 'guard_reconcile_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_set_priorities',
        description: 'Persist whole-frame visual problem priorities so the Guard blocks finer work while a larger must-fix remains open.',
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
        description: 'Manage the high-level Art Director/Planner state separately from Painter execution. Review issues a bounded directive/task queue and adaptive review horizon; interrupt returns early from Painter to Planner; complete closes a fully satisfied directive.',
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
                  description: 'Compact durable artistic intent. Supply only relevant fields, with at least three concrete constraints.',
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
                  description: 'Mandatory pre-paint interpretation gate. Resolve prompt tensions that would change the first 1-3 rendering passes before Painter mutation, declare one dominant rendering objective, and freeze the initial rendering strategy.',
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
                    first_pass_strategy: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
                    user_confirmation: { type: 'string' },
                  },
                  required: ['dominant_objective', 'conflicts', 'resolution_mode', 'chosen_rendering_strategy', 'first_pass_strategy'],
                  additionalProperties: false,
                },
                strategy_validation_after_microplans: {
                  type: 'number', minimum: 1, maximum: 2,
                  description: 'Mandatory early strategy checkpoint after the first one or two classified Painter micro-plans.',
                },
                strategy_validation: {
                  type: 'object',
                  description: 'Early preview-based validation of whether the chosen rendering strategy is actually advancing the dominant objective. Initial directives use pending; a due review must record pass or replan against the exact current frame.',
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
                      maxItems: 4,
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
                  description: 'Observed grayscale/value review for representational workflows. DETAIL is blocked when this status is fail or when observed evidence is missing. style-not-applicable and override require an exact durable style-contract basis; prose reasons are optional audit guidance.',
                  properties: {
                    status: { type: 'string', enum: ['pass', 'fail', 'override', 'style-not-applicable'] },
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
                physical_stack_check: {
                  type: 'object',
                  description: 'Observed physical scene-stack review. For fresh nontrivial paintings, VALUE and later stages are blocked until opaque masses, depth/occlusion, intentional transparency and Photoshop layer-stack order are coherent on the exact current frame.',
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
                    material_response: {
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
                    },
                  },
                  required: ['status', 'observed'],
                  additionalProperties: false,
                },
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
                'strategy_validation_after_microplans', 'strategy_validation',
                'artistic_evaluation_contract', 'composition_freedom', 'composition_exploration',
                'assessment', 'value_check', 'refinement_check', 'priorities',
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
        try { return json(await runtime.artDirector(args)); }
        catch (error) { return json({ ok: false, code: 'guard_art_director_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
    {
      tool: {
        name: 'photoshop_guard_recover_lock',
        description: 'Recover stale Guard/execution lock files only when their owning process is no longer alive. A live-PID async job whose heartbeat/deadline lease is stalled is reported as embedded_guard_job_stalled and remains locked; restart only the Photoshop MCP child before recovery. Never replays a mutation.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => {
        try { return json(runtime.recoverLocks()); }
        catch (error) { return json({ ok: false, code: 'guard_lock_recovery_rejected', message: error instanceof Error ? error.message : String(error) }, true); }
      },
    },
  ];
}
