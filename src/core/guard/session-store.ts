// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  assessVisualSignificance,
  VISUAL_SIGNIFICANCE_MODES,
} from './visual-significance.js';
import { operationNarrative } from './operation-narrative.js';
import { jobsDirectory, readJob } from './async-job.js';
import { OPERATION_ACK_PROTOCOL, OPERATION_RECEIPT_PROTOCOL } from './guard-capabilities.js';
import type {
  GuardActiveJobProjection,
  GuardProjectionContext,
  GuardProjectionContextOptions,
} from './projection-context.js';
import { parseEdgeIntents, validateEdgeObservations } from '../edge-control.js';
import { VALUE_CHECK_CRITERIA, VALUE_CHECK_STATUSES, VALUE_CRITERION_STATUSES, isDetailStage } from '../value-check.js';
import {
  isRefinementGatedStage,
  normalizeRefinementCheck,
  resolveVisualDevelopmentGate,
} from '../refinement-check.js';
import {
  isPhysicalStackGatedStage,
  normalizePhysicalStackCheck,
} from '../physical-stack-check.js';
import { PAINTING_VISUAL_INTENTS } from '../painting-method-palette.js';
import { GEOMETRY_PREFLIGHT_PROTOCOL, runGeometryPreflight } from '../geometry-preflight.js';
import {
  PAINTING_STAGE_RESET_REASONS,
  canonicalPaintingStage,
  isBackwardPaintingStageTransition,
  paintingStageRank,
} from '../painting-stage-policy.js';
import {
  visualMicroPlanMethodClassForStep,
  visualMicroPlanRequiresBrushPreflight,
} from '../visual-microplan.js';
import { RUNTIME_STATE_VERSION } from './protocol-version.js';
import { resolveArtisticRecovery as resolveArtisticRecoveryPolicy } from '../artistic-recovery-policy.js';
import {
  comparisonSpecificationForOperation,
  deriveArtisticOutcome,
  deriveComparisonMetric,
  deriveExecutionOutcome,
  evaluatePaintingProfileTransition,
  globalCompletionAllowed,
  normalizeArtisticEvaluationContract,
  normalizeGlobalBriefAssessment,
  normalizePreFinalHostileReview,
} from './artistic-contract.js';
import {
  assertCurrentRuntimeRecord,
  assertCurrentRuntimeStateDirectory,
  runtimeStateSchemaError,
} from './runtime-state.js';
import {
  reviewLevelForFinding,
  VISUAL_REVIEW_FINDING_KINDS,
} from './visual-review-profile.js';
import {
  normalizeRegion,
  overlapRatioAgainstSmaller,
  padRegion,
  regionContains,
} from './visual-review-region.js';
import { analyzeMechanicalPatterning } from './mechanical-patterning.js';
import {
  normalizeSoftDominanceReview,
  softDominanceContextForOperation,
  softDominanceRiskForOperation,
} from './soft-dominance-review.js';
import { normalizeSceneOwnershipPlan, sceneOwnershipOwnerIds } from '../scene-ownership-plan.js';
import { normalizeSceneGeometryModel } from '../scene-geometry-model.js';
import { lightingColorBindingStaleness, normalizeSceneLightingColorModel } from '../scene-lighting-color-model.js';
import { cameraBindingStaleness, normalizeCameraBinding, normalizeSceneCameraImagingModel } from '../scene-camera-imaging-model.js';
import { changedSceneGeometryDependencyIds, geometryBindingStaleness, normalizeGeometryBinding } from '../geometry-binding.js';
import { normalizeMaterialResponsePlan } from '../material-response.js';
import { attentionBindingStaleness, normalizeAttentionBinding, normalizePerceptualHierarchy } from '../perceptual-hierarchy.js';

export const ROUTE = 'MCP host -> embedded Photoshop Guard -> project dist/index.js -> Photoshop';
const READS = new Set([
  'photoshop_ping', 'photoshop_get_version', 'photoshop_get_capabilities',
  'photoshop_get_state', 'photoshop_get_preview', 'photoshop_list_documents',
  'photoshop_get_document_info', 'photoshop_get_layers', 'photoshop_get_history',
  'photoshop_get_selection_bounds', 'photoshop_list_fonts', 'photoshop_list_brush_presets',
  'photoshop_get_brush_settings', 'photoshop_sample_color', 'photoshop_sample_colors',
  'photoshop_get_painting_method_capabilities', 'photoshop_select_painting_method',
  'photoshop_analyze_value_structure',
  'photoshop_geometry_calculate', 'photoshop_measure_points', 'photoshop_transform_landmarks', 'photoshop_compare_landmarks',
  'photoshop_list_guides',
]);
const PREPARATION = new Set([
  'photoshop_set_brush', 'photoshop_set_foreground_color', 'photoshop_select_brush_preset',
  'photoshop_select_layer_by_name',
  // Selection/navigation state is configuration for a later visual mutation,
  // not itself a canvas-pixel change. Treating it as visual creates false
  // preview/verdict debt and makes exact postcondition recovery impossible.
  'photoshop_select_rectangle', 'photoshop_select_ellipse', 'photoshop_select_subject',
  'photoshop_expand_selection', 'photoshop_contract_selection', 'photoshop_feather_selection',
  'photoshop_invert_selection', 'photoshop_deselect',
  'photoshop_create_document', 'photoshop_open_image', 'photoshop_create_layer',
  'photoshop_set_active_document',
]);
export const BOOTSTRAP_EXACT_OUTCOME_PROTOCOL = 'photoshop.guard.bootstrap_exact_outcome.v1';
const DOCUMENT_BOOTSTRAP_TOOLS = new Set(['photoshop_create_document', 'photoshop_open_image']);
export function isRead(tool) { return READS.has(tool); }
export function isVisual(tool) {
  return !isRead(tool)
    && !PREPARATION.has(tool)
    && tool !== 'photoshop_save_document'
    && tool !== 'photoshop_close_document';
}
function isDocumentBootstrap(recordOrTool) {
  const tool = typeof recordOrTool === 'string' ? recordOrTool : recordOrTool?.tool;
  return DOCUMENT_BOOTSTRAP_TOOLS.has(tool);
}
function isAbandonedRecovery(record) {
  return record?.resolved?.outcome === 'abandoned';
}
function isClosureComplete(record) {
  if (!record || record.phase !== 'completed' || isAbandonedRecovery(record)) return false;
  if (record.execution === 'not-executed') return true;
  if (!record.report) return false;
  if (record.operation_receipt && !record.operation_ack) return false;
  if (record.visual && !record.verdict) return false;
  return true;
}
function legacyVisualContinuationActive(records, lastClassifiedVisual) {
  if (!lastClassifiedVisual) return false;
  const latestSemantic = [...records].reverse().find(record =>
    !isRead(record.tool)
    && record.execution !== 'not-executed'
    && !isAbandonedRecovery(record)
  );
  if (!latestSemantic) return true;
  if (latestSemantic.id === lastClassifiedVisual.id || latestSemantic.visual) return true;
  const terminalBoundary = latestSemantic.tool === 'photoshop_close_document'
    || ((latestSemantic.tool === 'photoshop_save_document' || latestSemantic.tool === 'photoshop_export_as')
      && !latestSemantic.checkpoint
      && typeof latestSemantic.args?.path === 'string'
      && /(?:^|[\\/])final(?:[\\/]|$)/i.test(latestSemantic.args.path));
  if (!terminalBoundary) return true;
  // Legacy journals predate the explicit workflow lifecycle marker. A later,
  // fully-closed non-read operation (for example the final diagnostic save)
  // is the only durable evidence available that the previous visual cadence
  // was intentionally left behind. Open visual problems remain open; they no
  // longer imply a live continuation timer by themselves.
  return !isClosureComplete(latestSemantic);
}
function isRollbackMutation(request) {
  return request?.tool === 'photoshop_undo'
    || (request?.tool === 'photoshop_execute_visual_microplan'
      && String(request?.args?.action_class ?? '').toUpperCase() === 'ROLLBACK');
}
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
function validId(id) { if (!idPattern.test(id ?? '')) throw new Error('Use an operation id of 1-80 letters, digits, hyphens or underscores'); return id; }
function textOrUndefined(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
const SCALE_RANK = { global: 0, medium: 1, small: 2, detail: 2, local: 2, micro: 2 };
const PHYSICAL_STACK_SIGNATURE_ROLES = new Set([
  'opaque-mass',
  'support-surface',
  'transmissive-surface',
]);
const SEVERITIES = new Set(['must-fix', 'should-fix', 'optional']);
const ART_DIRECTOR_INTERRUPT_REASONS = new Set([
  'serious_visual_error',
  'unexpected_global_composition_value_shift',
  'likeness_main_shape_degraded',
  'unsafe_to_execute_directive',
]);
const GLOBAL_CHANGE_DOMAINS = new Set([
  'composition',
  'large-value',
  'lighting-structure',
  'silhouette',
  'depth-structure',
  'likeness-main-shape',
  'background-scope',
]);
const STRUCTURAL_MISMATCH_TERMS = [
  'silhouette', 'topology', 'perspective', 'major proportion', 'proportion',
  'occlusion', 'large mass', 'large-value mass', 'primitive scaffold', 'polygonal',
  'negative space', 'negative-space',
];
const STRUCTURAL_REVIEW_FINDING_KINDS = new Set([
  'composition_balance', 'global_depth_read', 'perspective_geometry', 'silhouette',
  'proportion', 'contact_support', 'occlusion_depth', 'spatial_relation',
  'transform_placement', 'mechanical_patterning',
]);
const COSMETIC_STRATEGY_TERMS = [
  'cosmetic', 'texture', 'edge-noise', 'edge noise', 'blur', 'grain', 'stamp',
  'microdetail', 'micro-detail', 'surface-breakup', 'surface breakup', 'surface-soften',
  'surface soften', 'surface-mask', 'surface mask',
];
function hasStructuralMismatchEvidence(record) {
  const mismatch = textOrUndefined(record?.verdict?.primary_mismatch)?.toLowerCase() ?? '';
  return STRUCTURAL_MISMATCH_TERMS.some(term => mismatch.includes(term));
}
function isCosmeticCorrectiveAttempt(request) {
  const family = textOrUndefined(request?.strategy_family)?.toLowerCase() ?? '';
  const strategy = textOrUndefined(request?.causal_strategy_id)?.toLowerCase() ?? '';
  const method = textOrUndefined(request?.args?.method_class)?.toLowerCase() ?? '';
  const identity = `${family} ${strategy} ${method}`;
  return COSMETIC_STRATEGY_TERMS.some(term => identity.includes(term));
}
const PAINTER_SCOPES = new Set(['local', 'medium']);
const ART_RUN_COMMENTARY_MODES = new Set(['technical', 'artistic', 'mixed']);
const ART_RUN_COMMENTARY_DETAILS = new Set(['short', 'normal', 'detailed']);
const ART_RUN_PAINTING_PROFILES = new Set(['nontrivial_painting', 'simple_graphic']);
const BRUSH_PRESSURE_POLICIES = new Set([
  'none',
  'native-preset',
  'simulated-size',
  'simulated-opacity',
  'simulated-size-opacity',
]);
const BRUSH_VISUAL_INTENTS = new Set(PAINTING_VISUAL_INTENTS);
const BRUSH_PROBE_STATUSES = new Set(['pass', 'cached', 'not-needed']);
const NONTRIVIAL_DIRECT_PAINT_TOOLS = new Set([
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_paint_regions',
]);
const ART_RUN_ENTRY_TOOLS = new Set([
  'photoshop_execute_visual_microplan',
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_paint_regions',
  'photoshop_fill_layer',
  'photoshop_adjust_curves',
  'photoshop_auto_levels',
  'photoshop_create_layer_mask',
  'photoshop_apply_gradient_mask',
  'photoshop_set_layer_blend_mode',
]);
const WINDOWS_RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ART_DIRECTOR_ASSESSMENT_FIELDS = [
  'composition',
  'focal_hierarchy',
  'large_value_masses',
  'lighting',
  'silhouette',
  'depth',
  'likeness_main_shape',
  'overall_detail_level',
  'mood',
  'color_relationships',
  'shape_language',
  'edge_hierarchy',
  'intentional_omission',
  'next_priority',
];
const STYLE_CONTRACT_FIELDS = [
  'realism_level',
  'shape_language',
  'composition_bias',
  'edge_policy',
  'contour_role',
  'mark_visibility',
  'value_policy',
  'color_policy',
  'spatial_treatment',
  'material_treatment',
  'detail_density',
  'texture_policy',
  'primitive_footprint_tolerance',
  'layer_or_mask_bias',
  'finish_criteria',
];
const COMPOSITION_FREEDOMS = new Set(['fixed', 'constrained', 'free']);
const PROMPT_CONFLICT_SEVERITIES = new Set(['tension', 'structural']);
const PROMPT_CONFLICT_RESOLUTION_MODES = new Set(['none', 'declared-interpretation', 'user-confirmed']);
const STRATEGY_VALIDATION_STATUSES = new Set(['pending', 'pass', 'replan']);
const FINAL_COMPARISON_CRITERIA = ['coherence', 'expressiveness', 'color', 'rhythm', 'detail_selectivity'];
const INCOMPLETE_HYPOTHESIS_MAX_REVIEW_HORIZON = 8;
const WHOLE_IMAGE_GLANCE_TRIGGERS = new Set(['stage_boundary', 'global_change', 'final_review']);
const ANCHOR_RESTORE_NO_HISTORY_TOOLS = new Set([
  'photoshop_set_brush',
  'photoshop_set_foreground_color',
  'photoshop_select_brush_preset',
  'photoshop_select_layer_by_name',
  'photoshop_set_active_document',
  'photoshop_save_document',
  'photoshop_export_as',
  'photoshop_close_document',
]);

function parseBrushPreflight(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('brush_preflight must be an object');
  }
  if (raw.completed !== true || raw.inventory_observed !== true) {
    throw new Error('brush_preflight requires completed=true and inventory_observed=true');
  }
  const inventoryTotal = Number(raw.inventory_total);
  if (!Number.isSafeInteger(inventoryTotal) || inventoryTotal < 1) {
    throw new Error('brush_preflight.inventory_total must be a positive integer from the installed preset inventory');
  }
  if (!Array.isArray(raw.roles) || raw.roles.length < 1 || raw.roles.length > 16) {
    throw new Error('brush_preflight.roles must contain 1-16 concrete brush roles');
  }
  const seen = new Set();
  const roles = raw.roles.map((role, index) => {
    if (!role || typeof role !== 'object' || Array.isArray(role)) {
      throw new Error('brush_preflight.roles[' + index + '] must be an object');
    }
    const roleId = textOrUndefined(role.role_id);
    const purpose = textOrUndefined(role.purpose);
    const preferredPreset = textOrUndefined(role.preferred_preset);
    const workingScale = textOrUndefined(role.working_scale);
    const pressurePolicy = textOrUndefined(role.pressure_policy)?.toLowerCase();
    const probeStatus = textOrUndefined(role.probe_status)?.toLowerCase();
    if (!roleId || !idPattern.test(roleId) || seen.has(roleId)) {
      throw new Error('brush_preflight role_id values must be unique stable ids');
    }
    seen.add(roleId);
    if (!purpose || !preferredPreset || !workingScale) {
      throw new Error('brush_preflight role ' + roleId + ' requires purpose, preferred_preset and working_scale');
    }
    if (!BRUSH_PRESSURE_POLICIES.has(pressurePolicy)) {
      throw new Error('brush_preflight role ' + roleId + ' has invalid pressure_policy');
    }
    if (!BRUSH_PROBE_STATUSES.has(probeStatus)) {
      throw new Error('brush_preflight role ' + roleId + ' probe_status must be pass|cached|not-needed');
    }
    const materialRoles = Array.isArray(role.material_roles)
      ? [...new Set(role.material_roles.map(textOrUndefined).filter(Boolean))]
      : [];
    const visualIntents = Array.isArray(role.visual_intents)
      ? [...new Set(role.visual_intents.map(value => textOrUndefined(value)?.toLowerCase()).filter(Boolean))]
      : [];
    if (!materialRoles.length || !visualIntents.length) {
      throw new Error('brush_preflight role ' + roleId + ' requires material_roles[] and visual_intents[]');
    }
    for (const visualIntent of visualIntents) {
      if (!BRUSH_VISUAL_INTENTS.has(visualIntent)) {
        throw new Error(
          'brush_preflight role ' + roleId + ' visual_intents contains unsupported intent ' + visualIntent
        );
      }
    }
    const alternatives = Array.isArray(role.alternative_presets)
      ? [...new Set(role.alternative_presets.map(textOrUndefined).filter(Boolean))]
      : [];
    const candidateEvidence = Array.isArray(role.candidate_evidence)
      ? role.candidate_evidence.map((candidate, candidateIndex) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
          throw new Error('brush_preflight role ' + roleId + '.candidate_evidence[' + candidateIndex + '] must be an object');
        }
        const presetName = textOrUndefined(candidate.preset_name);
        const profileId = textOrUndefined(candidate.profile_id);
        const score = Number(candidate.evidence_score);
        const edgeBehavior = textOrUndefined(candidate.edge_behavior);
        const buildupBehavior = textOrUndefined(candidate.buildup_behavior);
        const pressure = textOrUndefined(candidate.pressure_policy)?.toLowerCase();
        const dynamics = candidate.dynamics_capability;
        const scale = candidate.useful_scale_range;
        if (!presetName || !profileId || !Number.isFinite(score) || !edgeBehavior || !buildupBehavior
          || !BRUSH_PRESSURE_POLICIES.has(pressure)
          || !scale || typeof scale !== 'object' || Array.isArray(scale)
          || !dynamics || typeof dynamics !== 'object' || Array.isArray(dynamics)
          || !Number.isFinite(Number(scale.min_px)) || !Number.isFinite(Number(scale.max_px))) {
          throw new Error('brush_preflight role ' + roleId + '.candidate_evidence[' + candidateIndex + '] is incomplete');
        }
        return {
          preset_name: presetName,
          profile_id: profileId,
          evidence_score: score,
          mark_character: Array.isArray(candidate.mark_character) ? candidate.mark_character.map(textOrUndefined).filter(Boolean) : [],
          edge_behavior: edgeBehavior,
          buildup_behavior: buildupBehavior,
          useful_scale_range: { min_px: Number(scale.min_px), max_px: Number(scale.max_px) },
          rotation_meaningful: candidate.rotation_meaningful === true,
          pressure_policy: pressure,
          dynamics_capability: {
            native_pressure_size: dynamics.native_pressure_size === true,
            native_pressure_opacity: dynamics.native_pressure_opacity === true,
            simulated_pressure_size: dynamics.simulated_pressure_size === true,
            simulated_pressure_opacity: dynamics.simulated_pressure_opacity === true,
            rotation_meaningful: dynamics.rotation_meaningful === true,
            spacing_tunable: dynamics.spacing_tunable === true,
            opacity_tunable: dynamics.opacity_tunable === true,
            flow_tunable: dynamics.flow_tunable === true,
          },
          effective_settings: candidate.effective_settings && typeof candidate.effective_settings === 'object' && !Array.isArray(candidate.effective_settings)
            ? { ...candidate.effective_settings } : {},
          caveats: Array.isArray(candidate.caveats) ? candidate.caveats.map(textOrUndefined).filter(Boolean) : [],
        };
      })
      : [];
    const effective = role.effective_settings;
    if (!effective || typeof effective !== 'object' || Array.isArray(effective)) {
      throw new Error('brush_preflight role ' + roleId + ' requires effective_settings from Photoshop');
    }
    const requiredSettings = ['size', 'hardness', 'roundness', 'opacity', 'flow', 'spacing', 'smoothing'];
    const effectiveSettings = {};
    for (const key of requiredSettings) {
      const value = Number(effective[key]);
      if (!Number.isFinite(value)) {
        throw new Error('brush_preflight role ' + roleId + ' effective_settings.' + key + ' must be numeric');
      }
      effectiveSettings[key] = value;
    }
    for (const key of ['use_pressure_size', 'use_pressure_opacity', 'airbrush', 'smoothing_enabled']) {
      if (typeof effective[key] !== 'boolean') {
        throw new Error('brush_preflight role ' + roleId + ' effective_settings.' + key + ' must be boolean');
      }
      effectiveSettings[key] = effective[key];
    }
    return {
      role_id: roleId,
      purpose,
      material_roles: materialRoles,
      visual_intents: visualIntents,
      preferred_preset: preferredPreset,
      alternative_presets: alternatives,
      candidate_evidence: candidateEvidence,
      effective_settings: effectiveSettings,
      working_scale: workingScale,
      pressure_policy: pressurePolicy,
      probe_status: probeStatus,
      caveat: textOrUndefined(role.caveat) ?? null,
      profile_id: textOrUndefined(role.profile_id) ?? null,
    };
  });
  const brushPackId = textOrUndefined(raw.brush_pack_id) ?? null;
  const inventoryQuery = textOrUndefined(raw.inventory_query) ?? null;
  return {
    completed: true,
    inventory_observed: true,
    inventory_total: inventoryTotal,
    inventory_query: inventoryQuery,
    inventory_scope: brushPackId ? 'brush-pack' : inventoryQuery ? 'filtered' : 'full',
    brush_pack_id: brushPackId,
    roles,
    recorded_at: new Date().toISOString(),
  };
}

function parseBrushPackPolicy(raw, brushPreflight) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('brush_pack_policy must be an object');
  }
  const mode = textOrUndefined(raw.mode)?.toLowerCase();
  if (!['preferred', 'exclusive'].includes(mode)) {
    throw new Error('brush_pack_policy.mode must be preferred|exclusive');
  }
  const brushPackId = textOrUndefined(raw.brush_pack_id) ?? textOrUndefined(brushPreflight?.brush_pack_id);
  if (!brushPackId) throw new Error('brush_pack_policy.brush_pack_id is required');
  const preflightPackId = textOrUndefined(brushPreflight?.brush_pack_id);
  if (preflightPackId && preflightPackId !== brushPackId) {
    throw new Error(`brush_pack_policy_mismatch: policy=${brushPackId} brush_preflight=${preflightPackId}`);
  }
  return {
    mode,
    brush_pack_id: brushPackId,
    applies_to: 'brush_marks_only',
  };
}

function parseBrushPackScenePlan(raw, { brushPackId, tasks, brushPreflight }) {
  if (!brushPackId) {
    if (raw !== undefined && raw !== null) {
      throw new Error('brush_pack_scene_plan requires an active art-run brush pack');
    }
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('directive.brush_pack_scene_plan is required when the art run is bound to a brush pack');
  }
  const planPackId = textOrUndefined(raw.brush_pack_id);
  if (planPackId !== brushPackId) {
    throw new Error(`brush_pack_scene_plan_mismatch: directive=${planPackId ?? 'missing'} art_run=${brushPackId}`);
  }
  if (raw.scene_first !== true) {
    throw new Error('brush_pack_scene_plan.scene_first must be true: establish composition/focal/depth/light structure before assigning pack assets');
  }
  if (!Array.isArray(raw.uses) || raw.uses.length < 1 || raw.uses.length > 16) {
    throw new Error('brush_pack_scene_plan.uses must contain 1-16 causal task bindings');
  }
  const taskIds = new Set((tasks ?? []).map(task => task.task_id));
  const preflightRoleIds = new Set((brushPreflight?.roles ?? []).map(role => role.role_id));
  const uses = raw.uses.map((use, index) => {
    if (!use || typeof use !== 'object' || Array.isArray(use)) {
      throw new Error(`brush_pack_scene_plan.uses[${index}] must be an object`);
    }
    const taskId = textOrUndefined(use.task_id);
    const sourceKind = textOrUndefined(use.source_kind)?.toLowerCase();
    const sourceId = textOrUndefined(use.source_id);
    const causalUse = textOrUndefined(use.causal_use);
    const integrationMode = textOrUndefined(use.integration_mode)?.toLowerCase();
    const subjectImportance = textOrUndefined(use.subject_importance)?.toLowerCase();
    const userAuthorization = textOrUndefined(use.user_authorization);
    if (!taskId || !taskIds.has(taskId)) {
      throw new Error(`brush_pack_scene_plan.uses[${index}].task_id must reference one declared Painter task`);
    }
    if (!['media-role', 'stamp-profile'].includes(sourceKind)) {
      throw new Error(`brush_pack_scene_plan.uses[${index}].source_kind must be media-role|stamp-profile`);
    }
    if (!sourceId || !causalUse || causalUse.length < 8) {
      throw new Error(`brush_pack_scene_plan.uses[${index}] requires source_id and a concrete causal_use`);
    }
    if (!['integrate', 'raw-style-contract'].includes(integrationMode)) {
      throw new Error(`brush_pack_scene_plan.uses[${index}].integration_mode must be integrate|raw-style-contract`);
    }
    if (!['supporting', 'hero'].includes(subjectImportance)) {
      throw new Error(`brush_pack_scene_plan.uses[${index}].subject_importance must be supporting|hero`);
    }
    if (sourceKind === 'media-role' && !preflightRoleIds.has(sourceId)) {
      throw new Error(`brush_pack_scene_plan media role ${sourceId} is not present in the durable pack brush_preflight`);
    }
    if (sourceKind === 'stamp-profile' && subjectImportance === 'hero' && integrationMode === 'raw-style-contract'
      && (!userAuthorization || userAuthorization.length < 4)) {
      throw new Error('hero raw stamp placement requires explicit user_authorization for a collage/stamp style contract');
    }
    return {
      task_id: taskId,
      source_kind: sourceKind,
      source_id: sourceId,
      causal_use: causalUse,
      integration_mode: integrationMode,
      subject_importance: subjectImportance,
      ...(userAuthorization ? { user_authorization: userAuthorization } : {}),
    };
  });
  return {
    brush_pack_id: brushPackId,
    scene_first: true,
    uses,
  };
}

function validateBrushStrategyAgainstPreflight(artRun, request) {
  if (request?.tool !== 'photoshop_execute_visual_microplan') return;
  const micro = request?.args && typeof request.args === 'object' && !Array.isArray(request.args)
    ? request.args
    : {};
  const methodClass = textOrUndefined(micro.method_class)?.toLowerCase();
  if (!methodClass || !['paint', 'preset-brush'].includes(methodClass)) return;
  const strategy = micro.paint_strategy;
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) {
    throw new Error(
      'paint_strategy_required: non-trivial brush painting must bind material_role -> visual_intent -> brush_role -> preset/pressure policy'
    );
  }
  const brushRole = textOrUndefined(strategy.brush_role);
  const materialRole = textOrUndefined(strategy.material_role);
  const visualIntent = textOrUndefined(strategy.visual_intent)?.toLowerCase();
  const pressurePolicy = textOrUndefined(strategy.pressure_policy)?.toLowerCase();
  const presetName = textOrUndefined(strategy.preset_name);
  const strategyPackId = textOrUndefined(strategy.brush_pack_id);
  const strategyStampProfileId = textOrUndefined(strategy.stamp_profile_id);
  const steps = Array.isArray(micro.steps) ? micro.steps : [];
  const stampSteps = steps.filter(step => step?.tool === 'photoshop_paint_stamp_instances');
  const mutationLikeSteps = steps.filter(step => [
    'photoshop_paint_stamp_instances', 'photoshop_paint_strokes', 'photoshop_paint_dabs',
  ].includes(step?.tool));
  const stampOnly = stampSteps.length > 0 && mutationLikeSteps.length === stampSteps.length;
  const packPolicy = artRun?.brush_pack_policy;
  const stage = canonicalPaintingStage(textOrUndefined(micro.stage) ?? textOrUndefined(request?.stage));
  const stageRank = paintingStageRank(stage);
  const materialFitnessRequired = stageRank !== undefined && stageRank >= 4;
  if (materialFitnessRequired && artRun?.brush_preflight?.inventory_scope === 'filtered') {
    throw new Error(
      'brush_inventory_scope_insufficient: substantial form/material/detail brush work requires a full installed-inventory or evidence-bound brush-pack preflight, not a narrow filtered familiar-preset lookup'
    );
  }
  if (stampSteps.length) {
    for (const step of stampSteps) {
      const stepPackId = textOrUndefined(step?.args?.brush_pack_id);
      const stepProfileId = textOrUndefined(step?.args?.stamp_profile_id);
      if (!stepPackId || !stepProfileId) {
        throw new Error('stamp_pack_identity_required: stamp placement requires brush_pack_id and stamp_profile_id');
      }
      if (strategyPackId !== stepPackId || strategyStampProfileId !== stepProfileId) {
        throw new Error('stamp_paint_strategy_identity_mismatch: paint_strategy must bind the same brush_pack_id and stamp_profile_id as the stamp mutation');
      }
      if (packPolicy?.mode === 'exclusive' && stepPackId !== packPolicy.brush_pack_id) {
        throw new Error(`exclusive_brush_pack_violation: stamp brush_pack_id=${stepPackId} is outside exclusive pack ${packPolicy.brush_pack_id}`);
      }
    }
    if (stampOnly) return;
  }
  const role = artRun?.brush_preflight?.roles?.find(row => row.role_id === brushRole);
  if (!role) {
    throw new Error(`brush_role_not_preflighted: brush_role=${brushRole ?? 'missing'} is not present in the durable brush_preflight role map`);
  }
  if (!materialRole || !role.material_roles?.includes(materialRole)) {
    throw new Error(`brush_material_role_mismatch: material_role=${materialRole ?? 'missing'} is not assigned to brush_role=${brushRole}`);
  }
  if (!visualIntent || !role.visual_intents?.includes(visualIntent)) {
    throw new Error(`brush_visual_intent_mismatch: visual_intent=${visualIntent ?? 'missing'} is not assigned to brush_role=${brushRole}`);
  }
  const selectedCandidate = presetName && Array.isArray(role.candidate_evidence)
    ? role.candidate_evidence.find(candidate => candidate.preset_name === presetName)
    : undefined;
  const expectedPressurePolicy = selectedCandidate?.pressure_policy ?? role.pressure_policy;
  if (pressurePolicy !== expectedPressurePolicy) {
    throw new Error(`brush_pressure_policy_mismatch: brush_role=${brushRole} preset_name=${presetName ?? 'missing'} requires pressure_policy=${expectedPressurePolicy}, got ${pressurePolicy ?? 'missing'}`);
  }
  const acceptedPresets = new Set([role.preferred_preset, ...(role.alternative_presets ?? [])]);
  if (presetName && !acceptedPresets.has(presetName)) {
    throw new Error(`brush_preset_not_preflighted: preset_name=${presetName} is not an accepted preset for brush_role=${brushRole}`);
  }
  if (methodClass === 'preset-brush' && !presetName) {
    throw new Error(`brush_preset_required: method_class=preset-brush requires preset_name from brush_role=${brushRole}`);
  }
  if (materialFitnessRequired && ['MATERIAL', 'DETAIL', 'MICRO_DETAIL'].includes(stage ?? '')) {
    const probeStatus = textOrUndefined(role.probe_status)?.toLowerCase();
    if (!['pass', 'cached'].includes(probeStatus ?? '')) {
      throw new Error(`brush_role_probe_required: brush_role=${brushRole} requires probe_status=pass|cached for ${stage} material/finish work`);
    }
  }
  if (packPolicy?.mode === 'exclusive') {
    if (artRun?.brush_preflight?.brush_pack_id !== packPolicy.brush_pack_id) {
      throw new Error(`exclusive_brush_pack_preflight_required: durable brush_preflight must belong to ${packPolicy.brush_pack_id}`);
    }
    if (!role.profile_id) {
      throw new Error(`exclusive_brush_pack_profile_required: brush_role=${brushRole} lacks an evidence-bound pack profile_id`);
    }
    if (!presetName) {
      throw new Error(`exclusive_brush_pack_preset_required: every brush-based mutation must select a preset bound to ${packPolicy.brush_pack_id}`);
    }
    const selectedPreset = [...steps].reverse().find(step => step?.tool === 'photoshop_select_brush_preset');
    if (!selectedPreset || textOrUndefined(selectedPreset?.args?.name) !== presetName) {
      throw new Error(`exclusive_brush_pack_selection_required: preset_name=${presetName} must be explicitly selected before mutation`);
    }
  }
}

function requestRequiresBrushPreflight(request) {
  if (request?.tool === 'photoshop_execute_visual_microplan') {
    return visualMicroPlanRequiresBrushPreflight(request.args);
  }
  if (request?.tool === 'photoshop_paint_dabs') return true;
  if (request?.tool !== 'photoshop_paint_strokes') return false;
  const args = request?.args && typeof request.args === 'object' && !Array.isArray(request.args)
    ? request.args
    : {};
  return visualMicroPlanMethodClassForStep({ tool: request.tool, args }) === 'paint';
}

function requestHasBrushStrategyOrStamp(request) {
  if (request?.tool !== 'photoshop_execute_visual_microplan') return false;
  const args = request?.args && typeof request.args === 'object' && !Array.isArray(request.args)
    ? request.args
    : {};
  if (args.paint_strategy && typeof args.paint_strategy === 'object' && !Array.isArray(args.paint_strategy)) return true;
  return Array.isArray(args.steps) && args.steps.some(step => step?.tool === 'photoshop_paint_stamp_instances');
}

function parseValueCheck(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('directive.value_check is required');
  }
  const status = textOrUndefined(raw.status)?.toLowerCase();
  if (!VALUE_CHECK_STATUSES.includes(status)) {
    throw new Error(`directive.value_check.status must be one of ${VALUE_CHECK_STATUSES.join(', ')}`);
  }
  const observed = raw.observed === true;
  const previewSha = textOrUndefined(raw.preview_sha256);
  const evidenceOperationId = textOrUndefined(raw.evidence_operation_id);
  const limitations = Array.isArray(raw.limitations)
    ? raw.limitations.map((value, index) => {
        const parsed = textOrUndefined(value);
        if (!parsed) throw new Error(`directive.value_check.limitations[${index}] must be non-empty`);
        return parsed;
      })
    : [];
  const confidence = raw.confidence === undefined ? undefined : Number(raw.confidence);
  if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new Error('directive.value_check.confidence must be between 0 and 1');
  }
  const rawStyleBasis = raw.style_contract_basis;
  let styleContractBasis;
  if (rawStyleBasis !== undefined) {
    if (!rawStyleBasis || typeof rawStyleBasis !== 'object' || Array.isArray(rawStyleBasis)) {
      throw new Error('directive.value_check.style_contract_basis must be an object');
    }
    const field = textOrUndefined(rawStyleBasis.field);
    const criterion = textOrUndefined(rawStyleBasis.criterion);
    if (!field || !STYLE_CONTRACT_FIELDS.includes(field) || !criterion) {
      throw new Error('directive.value_check.style_contract_basis requires a valid style_contract field and exact criterion');
    }
    styleContractBasis = { field, criterion };
  }

  if (status === 'style-not-applicable') {
    const reason = textOrUndefined(raw.applicability_reason);
    if (!styleContractBasis) throw new Error('value_check style-not-applicable requires style_contract_basis');
    return {
      status,
      observed,
      preview_sha256: previewSha ?? null,
      criteria: {},
      confidence: confidence ?? null,
      limitations,
      applicability_reason: reason ?? null,
      override_reason: null,
      style_contract_basis: styleContractBasis,
    };
  }

  if (!observed || !previewSha || !/^[0-9a-f]{64}$/i.test(previewSha) || !evidenceOperationId || !idPattern.test(evidenceOperationId)) {
    throw new Error('value check PASS/FAIL/override requires observed=true, a 64-hex preview_sha256, and evidence_operation_id from real grayscale evidence');
  }
  const rawCriteria = raw.criteria;
  if (!rawCriteria || typeof rawCriteria !== 'object' || Array.isArray(rawCriteria)) {
    throw new Error('directive.value_check.criteria is required');
  }
  const criteria = {};
  for (const key of VALUE_CHECK_CRITERIA) {
    const row = rawCriteria[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`directive.value_check.criteria.${key} is required`);
    }
    const criterionStatus = textOrUndefined(row.status)?.toLowerCase();
    const note = textOrUndefined(row.note);
    if (!VALUE_CRITERION_STATUSES.includes(criterionStatus)) {
      throw new Error(`directive.value_check.criteria.${key}.status must be one of ${VALUE_CRITERION_STATUSES.join(', ')}`);
    }
    criteria[key] = { status: criterionStatus, note: note ?? null };
  }
  if (status === 'pass' && Object.values(criteria).some(row => row.status === 'fail' || row.status === 'uncertain')) {
    throw new Error('value_check.status=pass is inconsistent with failed/uncertain criteria');
  }
  if (status === 'fail' && !Object.values(criteria).some(row => row.status === 'fail' || row.status === 'uncertain')) {
    throw new Error('value_check.status=fail requires at least one failed/uncertain criterion');
  }
  const overrideReason = status === 'override' ? textOrUndefined(raw.override_reason) : undefined;
  if (status === 'override' && !styleContractBasis) {
    throw new Error('value_check.status=override requires style_contract_basis');
  }
  return {
    status,
    observed,
    preview_sha256: previewSha.toLowerCase(),
    evidence_operation_id: evidenceOperationId,
    criteria,
    confidence: confidence ?? null,
    limitations,
    applicability_reason: null,
    override_reason: overrideReason ?? null,
    style_contract_basis: styleContractBasis ?? null,
  };
}
function normalizeScale(value) {
  const scale = textOrUndefined(value)?.toLowerCase();
  return scale && Object.prototype.hasOwnProperty.call(SCALE_RANK, scale) ? scale : undefined;
}
function normalizeSeverity(value) {
  const severity = textOrUndefined(value)?.toLowerCase();
  return severity && SEVERITIES.has(severity) ? severity : undefined;
}
function visualContext(request) {
  const micro = request?.tool === 'photoshop_execute_visual_microplan' && request.args && typeof request.args === 'object'
    ? request.args : {};
  const declaredStringArray = value => Array.isArray(value)
    ? [...new Set(value.map(item => textOrUndefined(item)).filter(Boolean))]
    : [];
  const rawStageReset = request?.stage_reset && typeof request.stage_reset === 'object' && !Array.isArray(request.stage_reset)
    ? request.stage_reset
    : micro.stage_reset && typeof micro.stage_reset === 'object' && !Array.isArray(micro.stage_reset)
      ? micro.stage_reset
      : undefined;
  const stageReset = rawStageReset
    ? {
        from_stage: textOrUndefined(rawStageReset.from_stage),
        to_stage: textOrUndefined(rawStageReset.to_stage),
        reason: textOrUndefined(rawStageReset.reason),
        detail: textOrUndefined(rawStageReset.detail),
      }
    : undefined;
  return {
    problem_id: textOrUndefined(request?.problem_id) ?? textOrUndefined(micro.problem_id),
    region: textOrUndefined(request?.region) ?? textOrUndefined(micro.region),
    hypothesis: textOrUndefined(request?.hypothesis) ?? textOrUndefined(micro.expected_visual_result),
    failure_signals: Array.isArray(request?.failure_signals) ? request.failure_signals
      : Array.isArray(micro.failure_signals) ? micro.failure_signals : [],
    stage: textOrUndefined(request?.stage) ?? textOrUndefined(micro.stage),
    ...(stageReset?.from_stage && stageReset?.to_stage && stageReset?.reason
      ? { stage_reset: stageReset }
      : {}),
    scale: normalizeScale(request?.scale) ?? normalizeScale(micro.scale),
    severity: normalizeSeverity(request?.severity),
    planner_directive_id: textOrUndefined(micro.planner_directive_id) ?? textOrUndefined(request?.planner_directive_id),
    planner_task_id: textOrUndefined(micro.planner_task_id) ?? textOrUndefined(request?.planner_task_id),
    painter_scope: (textOrUndefined(micro.painter_scope) ?? textOrUndefined(request?.painter_scope))?.toLowerCase(),
    affected_relations: declaredStringArray(micro.affected_relations ?? request?.affected_relations),
    affected_qualities: declaredStringArray(micro.affected_qualities ?? request?.affected_qualities),
    addresses_problem_id: textOrUndefined(micro.addresses_problem_id) ?? textOrUndefined(request?.addresses_problem_id),
    addresses_primary_mismatch: micro.addresses_primary_mismatch === true || request?.addresses_primary_mismatch === true,
    independent_region: micro.independent_region === true || request?.independent_region === true,
    preservation_facts: declaredStringArray(micro.preservation_facts ?? request?.preservation_facts),
    root_cause_classification: textOrUndefined(request?.root_cause_classification)?.toLowerCase(),
    root_cause_reason: textOrUndefined(request?.root_cause_reason),
    causal_level_change: request?.causal_level_change === true,
    change_domains: Array.isArray(micro.change_domains)
      ? [...new Set(micro.change_domains.map(value => textOrUndefined(value)?.toLowerCase()).filter(Boolean))]
      : Array.isArray(request?.change_domains)
        ? [...new Set(request.change_domains.map(value => textOrUndefined(value)?.toLowerCase()).filter(Boolean))]
      : [],
  };
}
function problemIdentity(request) {
  const context = visualContext(request);
  return context.problem_id;
}
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])]));
  return x;
}
export function fingerprint(request) { return createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex'); }
export function visualStrategyFingerprint(request) {
  const context = visualContext(request ?? {});
  const micro = request?.tool === 'photoshop_execute_visual_microplan' && request.args && typeof request.args === 'object'
    ? request.args : {};
  const steps = Array.isArray(micro.steps) ? micro.steps : [];
  const structuralMutations = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step) || step.tool === 'photoshop_get_preview') continue;
    const args = step.args && typeof step.args === 'object' && !Array.isArray(step.args) ? step.args : {};
    const strokes = Array.isArray(args.strokes) ? args.strokes : [];
    const dabs = Array.isArray(args.dabs) ? args.dabs : [];
    const regions = Array.isArray(args.regions) ? args.regions : [];
    const descriptor = {
      tool: step.tool,
      method_id: step.method_id ?? null,
      region: step.region ?? null,
      stroke_tools: [...new Set(strokes.map(stroke => String(stroke?.tool ?? 'BRUSH').toUpperCase()))].sort(),
      uses_strokes: strokes.length > 0,
      uses_dabs: dabs.length > 0,
      uses_regions: regions.length > 0,
    };
    const key = JSON.stringify(canonical(descriptor));
    if (!structuralMutations.some(row => row.key === key)) structuralMutations.push({ key, descriptor });
  }
  return fingerprint({
    tool: request?.tool ?? null,
    problem_id: context.problem_id ?? null,
    region: context.region ?? null,
    stage: context.stage ?? null,
    scale: context.scale ?? null,
    change_domains: context.change_domains,
    method_class: micro.method_class ?? null,
    action_class: micro.action_class ?? null,
    brush_role: micro.paint_strategy?.brush_role ?? null,
    mutations: structuralMutations.map(row => row.descriptor),
  });
}

export function paintingDevelopmentProvenance(records, documentId, currentFrameOperationId) {
  const currentRecord = currentFrameOperationId
    ? records.find(record => record?.id === currentFrameOperationId)
    : undefined;
  const sequenceCeiling = Number.isSafeInteger(currentRecord?.sequence)
    ? Number(currentRecord.sequence)
    : Number.MAX_SAFE_INTEGER;
  let regionConstructionOperations = 0;
  let postBlockinMarkmakingOperations = 0;
  const postBlockinMarkmakingTools = new Set();
  const blockInRegionStages = new Set([
    'RECOGNITION_BLOCK_IN',
    'GLOBAL_BLOCK_IN',
    'COMPOSITION',
    'SHAPE',
  ]);

  for (const record of records) {
    if (!record || record.phase !== 'completed' || record.failed || !record.visual) continue;
    if (record.args?.document_id !== documentId) continue;
    if (Number.isSafeInteger(record.sequence) && Number(record.sequence) > sequenceCeiling) continue;
    const executionChanged = record.verdict?.artistic_value?.execution_changed === true;
    const accepted = record.verdict?.disposition === 'accept';
    if (!executionChanged || !accepted) continue;
    if (record.tool !== 'photoshop_execute_visual_microplan') continue;
    const micro = record.args && typeof record.args === 'object' && !Array.isArray(record.args)
      ? record.args
      : {};
    const steps = Array.isArray(micro.steps) ? micro.steps : [];
    const mutationTools = steps
      .map(step => textOrUndefined(step?.tool))
      .filter(tool => tool && tool !== 'photoshop_get_preview');
    const stage = canonicalPaintingStage(micro.stage);
    const actionClass = textOrUndefined(micro.action_class)?.toUpperCase() ?? 'ADD';
    if (
      mutationTools.includes('photoshop_paint_regions')
      && actionClass === 'ADD'
      && blockInRegionStages.has(stage ?? '')
    ) {
      regionConstructionOperations += 1;
    }

    const stageRank = paintingStageRank(stage);
    if (stageRank === undefined || stageRank < 4) continue;
    const expressiveTools = new Set([
      'photoshop_paint_strokes',
      'photoshop_paint_dabs',
      'photoshop_paint_stamp_instances',
    ]);
    const used = mutationTools.filter(tool => expressiveTools.has(tool));
    if (used.length) {
      postBlockinMarkmakingOperations += 1;
      for (const tool of used) postBlockinMarkmakingTools.add(tool);
    }
  }

  return {
    region_construction_operations: regionConstructionOperations,
    post_blockin_markmaking_operations: postBlockinMarkmakingOperations,
    post_blockin_markmaking_tools: [...postBlockinMarkmakingTools].sort(),
    blockin_primitive_dominance: regionConstructionOperations >= 2 && postBlockinMarkmakingOperations === 0,
  };
}

export function paintingMethodUsage(records, documentId) {
  const completed = records.filter(record =>
    record
    && record.phase === 'completed'
    && record.visual === true
    && record.tool === 'photoshop_execute_visual_microplan'
    && record.args?.document_id === documentId
  );
  const increment = (target, key) => {
    if (!key) return;
    target[key] = (target[key] ?? 0) + 1;
  };
  const toolUsage = {};
  const methodClassUsage = {};
  const methodIdUsage = {};
  const brushRoleUsage = {};
  const brushPresetUsage = {};
  const stageUsage = {};
  const problemUsage = {};
  const outcomeUsage = {};
  let mutationOperations = 0;
  for (const record of completed) {
    const micro = record.args && typeof record.args === 'object' && !Array.isArray(record.args)
      ? record.args : {};
    const steps = Array.isArray(micro.steps) ? micro.steps : [];
    const mutationSteps = steps.filter(step => step?.tool && step.tool !== 'photoshop_get_preview');
    if (mutationSteps.length) mutationOperations += 1;
    for (const step of mutationSteps) {
      increment(toolUsage, textOrUndefined(step.tool));
      increment(methodIdUsage, textOrUndefined(step.method_id));
    }
    increment(methodClassUsage, textOrUndefined(micro.method_class)?.toLowerCase());
    increment(brushRoleUsage, textOrUndefined(micro.paint_strategy?.brush_role));
    increment(brushPresetUsage, textOrUndefined(micro.paint_strategy?.preset_name));
    increment(stageUsage, canonicalPaintingStage(micro.stage) ?? textOrUndefined(micro.stage));
    increment(problemUsage, problemIdentity(record));
    const outcome = record.rolled_back === true
      ? 'rolled-back'
      : record.failed === true
        ? 'failed'
        : record.verdict?.disposition === 'accept'
          ? 'accepted'
          : record.verdict?.disposition === 'rollback'
            ? 'rollback-required'
            : record.verdict ? 'reviewed-other' : 'unreviewed';
    increment(outcomeUsage, outcome);
  }
  const sorted = source => Object.fromEntries(
    Object.entries(source).sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
  );
  return {
    visual_microplan_operations: completed.length,
    mutation_operations: mutationOperations,
    distinct_tools_used: Object.keys(toolUsage).length,
    distinct_method_classes_used: Object.keys(methodClassUsage).length,
    distinct_method_ids_used: Object.keys(methodIdUsage).length,
    distinct_brush_roles_used: Object.keys(brushRoleUsage).length,
    distinct_brush_presets_used: Object.keys(brushPresetUsage).length,
    tool_usage: sorted(toolUsage),
    method_class_usage: sorted(methodClassUsage),
    method_id_usage: sorted(methodIdUsage),
    brush_role_usage: sorted(brushRoleUsage),
    brush_preset_usage: sorted(brushPresetUsage),
    stage_usage: sorted(stageUsage),
    problem_usage: sorted(problemUsage),
    outcome_usage: sorted(outcomeUsage),
  };
}
function strategyChanged(request, prior) {
  if (!prior) return true;
  return visualStrategyFingerprint(request) !== visualStrategyFingerprint(prior);
}
export function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
export function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid lock owner; inspect the lock manually');
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; return true; }
}
export function parseTexts(result) {
  return (result?.content ?? []).filter(c => c.type === 'text').map(c => {
    try { return JSON.parse(c.text); } catch { return { text: c.text }; }
  });
}
function motifInstancesInPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const rows = [];
  const collect = (value) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      if (!id || !item.region_bounds) continue;
      let regionBounds;
      try { regionBounds = normalizeRegion(item.region_bounds); }
      catch { continue; }
      rows.push({
        id,
        region_bounds: regionBounds,
        ...(typeof item.category === 'string' && item.category.trim() ? { category: item.category.trim() } : {}),
        ...(typeof item.stamp_profile_id === 'string' && item.stamp_profile_id.trim()
          ? { stamp_profile_id: item.stamp_profile_id.trim() }
          : {}),
      });
    }
  };
  collect(payload.motif_instances);
  collect(payload.details?.motif_instances);
  const nested = payload.mutation_results;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const result of Object.values(nested)) rows.push(...motifInstancesInPayload(result));
  }
  return rows;
}
function observedMotifInstancesFromResult(result) {
  const byId = new Map();
  for (const body of parseTexts(result)) {
    for (const row of motifInstancesInPayload(body)) byId.set(row.id, row);
  }
  return [...byId.values()];
}
function bootstrapOutcomeFromResult(result) {
  for (const body of parseTexts(result)) {
    const details = body?.details && typeof body.details === 'object' && !Array.isArray(body.details)
      ? body.details
      : {};
    const document = details?.document ?? body?.document;
    const documentId = document?.id ?? details?.document_id ?? body?.document_id;
    const commandReceipt = details?.command_receipt ?? body?.command_receipt ?? details?.receipt ?? body?.receipt;
    const commandId = details?.command_id ?? body?.command_id ?? commandReceipt?.command_id;
    if ((Number.isSafeInteger(documentId) && documentId > 0) || typeof commandId === 'string') {
      return {
        ...(Number.isSafeInteger(documentId) && documentId > 0 ? { document_id: documentId } : {}),
        ...(document && typeof document === 'object' && !Array.isArray(document) ? { document } : {}),
        ...(typeof commandId === 'string' && commandId ? { command_id: commandId } : {}),
        ...(commandReceipt && typeof commandReceipt === 'object' && !Array.isArray(commandReceipt)
          ? { command_receipt: commandReceipt }
          : {}),
      };
    }
  }
  return undefined;
}
function isTerminalBootstrapFailure(record) {
  return isDocumentBootstrap(record)
    && record?.phase === 'completed'
    && record?.failed === true
    && (record?.execution === 'failed' || record?.execution === 'not-executed' || record?.execution === 'abandoned');
}
function positiveHistoryStepCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}
function historyStepsInPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0;
  const nested = payload.mutation_results;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const total = Object.values(nested).reduce((sum, result) => sum + historyStepsInPayload(result), 0);
    if (total > 0) return total;
  }
  for (const candidate of [
    payload.history_steps,
    payload.undo_history_states_consumed,
    payload.details?.history_steps,
    payload.details?.undo_history_states_consumed,
  ]) {
    const count = positiveHistoryStepCount(candidate);
    if (count > 0) return count;
  }
  return 0;
}
function reportedHistorySteps(record) {
  for (const body of parseTexts(record?.result)) {
    const ownership = body?.pass_execution?.history_ownership;
    if (ownership?.protocol !== 'photoshop.guard.semantic_pass_history_ownership.v1') continue;
    if (ownership.status !== 'exact') return 0;
    const owned = positiveHistoryStepCount(ownership.owned_history_steps);
    if (owned > 0) return owned;
    return 0;
  }
  let reported = 0;
  for (const body of parseTexts(record?.result)) {
    reported = Math.max(reported, historyStepsInPayload(body));
  }
  // A successful visual mutation with no explicit history metadata is treated
  // as one undo state, preserving the historical single-step contract.
  return Math.max(1, reported);
}
export function previewOf(result) {
  for (const body of parseTexts(result)) {
    const p = body.preview ?? body;
    if (typeof p.sha256 === 'string' && typeof p.materialized_path === 'string') return p;
  }
  return undefined;
}
function bindPreviewDocument(preview, documentId) {
  if (!preview) return preview;
  if (!Number.isSafeInteger(documentId) || documentId <= 0) {
    throw new Error('Preview provenance requires a positive pinned document_id');
  }
  if (preview.document_id !== undefined && preview.document_id !== documentId) {
    throw new Error(`Preview document_id ${preview.document_id} does not match pinned document ${documentId}`);
  }
  return { ...preview, document_id: documentId };
}
function beforePreviewOf(result) {
  for (const body of parseTexts(result)) {
    const p = body?.before_preview;
    if (p && typeof p.sha256 === 'string' && typeof p.materialized_path === 'string') return p;
  }
  return undefined;
}
function significanceModeOf(request) {
  const micro = request?.tool === 'photoshop_execute_visual_microplan' && request.args && typeof request.args === 'object'
    ? request.args : {};
  return textOrUndefined(request?.significance_mode) ?? textOrUndefined(micro.significance_mode) ?? 'normal';
}
const WORKFLOW_STALL_ACTION_LIMIT = 8;
const WORKFLOW_STALL_INSUFFICIENT_LIMIT = 2;
const DECISION_LOOP_STALL_SECONDS = 90;
const SILENT_STALL_SECONDS = 90;
const CHECKPOINT_DEBT_LIMIT = 8;
const TREND_SIGNAL_WINDOW = 3;
const TREND_SIGNAL_REPEAT_LIMIT = 2;
const GLOBAL_READABILITY = new Set(['improved', 'stable', 'degraded', 'unknown']);
const PRIMITIVE_FOOTPRINT = new Set(['none', 'acceptable', 'suspect', 'unknown']);
const RECOGNITION_SUBJECT = new Set(['yes', 'no', 'uncertain']);
const RECOGNITION_STYLE = new Set(['yes', 'no', 'uncertain', 'not_applicable']);
const RECOGNITION_EVALUATOR = new Set(['producer', 'blinded', 'human', 'external']);
function normalizeTrendSignal(value) {
  if (typeof value !== 'string') return undefined;
  const signal = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return signal.length >= 3 ? signal.slice(0, 80) : undefined;
}
function findingTrendSignals(finding) {
  if (!Array.isArray(finding?.trend_signals)) return [];
  return [...new Set(finding.trend_signals.map(normalizeTrendSignal).filter(Boolean))];
}
function findingSupportsTrendSignal(finding, signal) {
  const explicit = findingTrendSignals(finding);
  if (explicit.includes(signal)) return true;
  const kind = textOrUndefined(finding?.kind)?.toLowerCase();
  if (!kind) return false;
  if (normalizeTrendSignal(kind) === signal) return true;
  return signal === 'primitive-footprint-repeating'
    && ['repeated_dab_pattern', 'mechanical_patterning'].includes(kind);
}
function trendFindingRegions(record, signal) {
  const regions = [];
  for (const finding of record?.verdict?.review_findings ?? []) {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding) || finding.region_bounds === undefined) continue;
    if (!findingSupportsTrendSignal(finding, signal)) continue;
    try {
      regions.push(normalizeRegion(finding.region_bounds));
    } catch {
      // Old/foreign verdict history must not make trend projection fail.
    }
  }
  return regions;
}
function operationTrendRegion(record) {
  const micro = record?.tool === 'photoshop_execute_visual_microplan'
    && record?.args && typeof record.args === 'object' && !Array.isArray(record.args)
    ? record.args
    : {};
  for (const candidate of [record?.region_bounds, micro.region_bounds, record?.preview?.focus?.region]) {
    if (!candidate) continue;
    try {
      return normalizeRegion(candidate);
    } catch {
      // Legacy/foreign records may not carry a usable exact operation region.
    }
  }
  return undefined;
}
function unionTrendRegions(regions) {
  if (!regions.length) return undefined;
  return regions.slice(1).reduce((union, region) => ({
    left: Math.min(union.left, region.left),
    top: Math.min(union.top, region.top),
    right: Math.max(union.right, region.right),
    bottom: Math.max(union.bottom, region.bottom),
  }), { ...regions[0] });
}
function materiallySeparateTrendRegions(a, b) {
  if (!a || !b || overlapRatioAgainstSmaller(a, b) >= 0.1) return false;
  const horizontalGap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const verticalGap = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  const gap = Math.hypot(horizontalGap, verticalGap);
  const maxDimensionA = Math.max(a.right - a.left, a.bottom - a.top);
  const maxDimensionB = Math.max(b.right - b.left, b.bottom - b.top);
  const localScale = Math.max(1, Math.min(maxDimensionA, maxDimensionB));
  return gap > localScale * 0.5;
}
function trendSupportForRecord(record, signal) {
  const context = visualContext(record);
  const reviewRegions = trendFindingRegions(record, signal);
  const operationRegion = operationTrendRegion(record);
  const representativeRegion = unionTrendRegions(reviewRegions) ?? operationRegion;
  return {
    operation_id: record.id,
    sequence: Number.isSafeInteger(record.sequence) ? record.sequence : 0,
    verdict_at: record.verdict?.at ?? null,
    evidence_identity: fingerprint({
      operation_id: record.id,
      signal,
      verdict_at: record.verdict?.at ?? null,
      preview_sha256: record.preview?.sha256 ?? null,
    }),
    named_region: context.region ?? null,
    scale: context.scale ?? null,
    ...(representativeRegion ? { region_bounds: representativeRegion } : {}),
    review_regions: reviewRegions,
    region_source: reviewRegions.length
      ? 'signal_bound_review_findings'
      : operationRegion
        ? 'operation_region'
        : 'none',
    whole_frame_global: signal === 'global-readability-degraded'
      && record.verdict?.global_readability === 'degraded',
  };
}

function stageResetStatePatch(current, context, operationId, at) {
  const reset = context?.stage_reset;
  if (!reset) return {};
  const durableReset = {
    protocol: 'photoshop.guard.painting_stage_reset.v1',
    operation_id: operationId,
    from_stage: reset.from_stage,
    to_stage: reset.to_stage,
    reason: reset.reason,
    ...(typeof reset.detail === 'string' && reset.detail.trim() ? { detail: reset.detail.trim() } : {}),
    at,
  };
  return {
    last_stage_reset: durableReset,
    ...(current.art_director ? {
      art_director: {
        ...current.art_director,
        physical_stack_check: normalizePhysicalStackCheck({ status: 'pending', observed: false }),
        refinement_check: normalizeRefinementCheck({ status: 'pending', observed: false }),
        last_stage_reset: durableReset,
      },
    } : {}),
  };
}
function localizedTrendScale(supports) {
  const scales = supports
    .map(support => normalizeScale(support.scale))
    .filter(scale => scale && scale !== 'global');
  if (scales.includes('medium')) return 'medium';
  if (scales.length) return 'small';
  return 'medium';
}
function trendScopeFromSupports(supports) {
  if (supports.some(support => support.whole_frame_global)) {
    return {
      scale: 'global',
      region: 'whole image',
      promotion_reason: 'whole_frame_global_evidence',
    };
  }
  for (let i = 0; i < supports.length; i++) {
    for (let j = i + 1; j < supports.length; j++) {
      if (
        supports[i].operation_id !== supports[j].operation_id
        && materiallySeparateTrendRegions(supports[i].region_bounds, supports[j].region_bounds)
      ) {
        return {
          scale: 'global',
          region: 'multiple materially separate regions',
          promotion_reason: 'materially_separate_regions',
        };
      }
    }
  }
  const namedRegions = [...new Set(supports.map(support => textOrUndefined(support.named_region)).filter(Boolean))];
  return {
    scale: localizedTrendScale(supports),
    region: namedRegions.length === 1 ? namedRegions[0] : 'localized repeated region',
    promotion_reason: 'localized_repeated_evidence',
  };
}
function trendRepeatLimit(signal, supports) {
  return signal === 'global-readability-degraded' && supports.some(support => support.whole_frame_global)
    ? 1
    : TREND_SIGNAL_REPEAT_LIMIT;
}
function ageSeconds(value, nowMs = Date.now()) {
  const parsed = Date.parse(value ?? '');
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 1000));
}
function checkpointDebtPoints(record) {
  if (!record?.visual) return 0;
  const micro = record.tool === 'photoshop_execute_visual_microplan' && record.args && typeof record.args === 'object'
    ? record.args : {};
  const risk = textOrUndefined(micro.risk)?.toLowerCase();
  let points = risk === 'high' ? 4 : risk === 'moderate' ? 2 : 1;
  const mutationTools = new Set([
    'photoshop_paint_strokes', 'photoshop_paint_dabs', 'photoshop_paint_regions',
    'photoshop_fill_layer', 'photoshop_undo',
  ]);
  const mutationCount = Array.isArray(micro.steps)
    ? micro.steps.filter(step => mutationTools.has(String(step?.tool ?? ''))).length
    : 1;
  points += Math.max(0, mutationCount - 1);
  const actionClass = textOrUndefined(micro.action_class)?.toUpperCase();
  if (['ERASE', 'REPLACE', 'ROLLBACK'].includes(actionClass ?? '')) points += 2;
  if (record.tool !== 'photoshop_execute_visual_microplan') points += 1;
  const layerDecision = textOrUndefined(micro.logical_layer?.decision)?.toLowerCase();
  if (['create-new', 'temporary-hypothesis'].includes(layerDecision ?? '')) {
    points = Math.max(1, points - 1);
  }
  return points;
}
function activeJobsForDocument(activeJobs: GuardActiveJobProjection[], documentId) {
  if (!Number.isSafeInteger(documentId) || documentId <= 0) return activeJobs;
  return activeJobs.filter(job => job.document_id === documentId);
}
function latestTimestamp(values = []) {
  let latest;
  let latestMs = -Infinity;
  for (const value of values) {
    const parsed = Date.parse(value ?? '');
    if (!Number.isFinite(parsed) || parsed <= latestMs) continue;
    latestMs = parsed;
    latest = new Date(parsed).toISOString();
  }
  return latest ?? null;
}
function isRecognitionBlockInStage(value) {
  const stage = textOrUndefined(value)?.toUpperCase().replace(/[\s-]+/g, '_');
  return stage === 'RECOGNITION_BLOCK_IN';
}
function recognitionStringArray(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
  return [...new Set(value.map(item => item.trim()))];
}
function normalizeRecognitionVerdict(value, required = false) {
  if (value === undefined) {
    if (required) throw new Error('recognition verdict is required for RECOGNITION_BLOCK_IN');
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('recognition must be an object');
  }
  const subject = textOrUndefined(value.subject)?.toLowerCase();
  const style = textOrUndefined(value.style)?.toLowerCase();
  const evaluator = (textOrUndefined(value.evaluator)?.toLowerCase() ?? 'producer');
  if (!RECOGNITION_SUBJECT.has(subject)) throw new Error('recognition.subject must be yes|no|uncertain');
  if (!RECOGNITION_STYLE.has(style)) throw new Error('recognition.style must be yes|no|uncertain|not_applicable');
  if (!RECOGNITION_EVALUATOR.has(evaluator)) throw new Error('recognition.evaluator must be producer|blinded|human|external');
  return {
    subject,
    style,
    evaluator,
    visible_features: recognitionStringArray(value.visible_features, 'recognition.visible_features'),
    lost_features: recognitionStringArray(value.lost_features, 'recognition.lost_features'),
  };
}
function normalizeVisualObservations(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw new Error('observations must contain 1-6 concise visible observations');
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`observations[${index}] must be an object`);
    }
    const region = textOrUndefined(entry.region);
    const visible = textOrUndefined(entry.visible);
    if (!region || !visible || visible.length < 4) {
      throw new Error(`observations[${index}] requires region and concrete visible text`);
    }
    return { region, visible };
  });
}
function hasWholeFrameObservation(observations) {
  return observations.some(observation => {
    const region = String(observation?.region ?? '').trim().toLowerCase();
    return region === 'whole frame' || region === 'whole-frame';
  });
}
function goalAssessment(input) {
  const confirmed = input.target_resolved === 'yes'
    && input.verdict === 'improvement'
    && input.disposition === 'accept';
  return {
    scope: 'operation_goal',
    status: confirmed
      ? 'confirmed_by_visual_verdict'
      : input.target_resolved === 'no'
        ? 'unresolved'
        : input.target_resolved === 'uncertain'
          ? 'uncertain'
          : 'unconfirmed',
    target_resolved: input.target_resolved,
    pixels_retained: input.disposition === 'accept',
    note: 'This assessment confirms only the local operation goal. Pixel retention and planner-task completion are separate decisions.',
  };
}

function plannerTaskAssessment(input) {
  const raw = input?.planner_task_assessment;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('planner_task_assessment must be an object');
  }
  const status = textOrUndefined(raw.status)?.toLowerCase();
  if (!['continue', 'completed', 'blocked'].includes(status)) {
    throw new Error('planner_task_assessment.status must be continue|completed|blocked');
  }
  if (raw.evidence_scope !== 'task') {
    throw new Error('planner_task_assessment.evidence_scope must be task');
  }
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map((value, index) => {
        const parsed = textOrUndefined(value);
        if (!parsed) throw new Error(`planner_task_assessment.evidence[${index}] must be non-empty`);
        return parsed;
      })
    : [];
  if ((status === 'completed' || status === 'blocked') && evidence.length === 0) {
    throw new Error(`planner_task_assessment.status=${status} requires task-level evidence`);
  }
  return { status, evidence_scope: 'task', evidence };
}
function significanceHasDetectedChange(significance) {
  for (const metrics of [significance?.global, significance?.local]) {
    if (!metrics) continue;
    if (Number(metrics.mean_abs_rgb_delta) > 0.001) return true;
    if (Number(metrics.p95_abs_rgb_delta) > 0) return true;
    if (Number(metrics.changed_ratio_delta_ge_2) > 0) return true;
  }
  return false;
}
function normalizeDocumentInstanceWitness(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const protocol = textOrUndefined(raw.protocol);
  const sessionId = textOrUndefined(raw.session_id);
  const token = textOrUndefined(raw.token);
  if (protocol !== 'photoshop.uxp.document_instance_witness.v1' || !sessionId || !token) return null;
  return { protocol, session_id: sessionId, token };
}
function sameDocumentInstanceWitness(a, b) {
  return !!a && !!b
    && a.protocol === b.protocol
    && a.session_id === b.session_id
    && a.token === b.token;
}

function elapsedMs(start, end) {
  const a = Date.parse(start ?? '');
  const b = Date.parse(end ?? '');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
}
function continuationLatencySegments(record) {
  const latency = record?.latency ?? {};
  const timing = record?.continuation_timing ?? {};
  const responseReadyAt = textOrUndefined(latency.response_ready_at);
  const reviewRequestAt = textOrUndefined(timing.review_image_request_received_at);
  const reviewReadyAt = textOrUndefined(timing.review_image_result_ready_at);
  const reviewFinishedAt = textOrUndefined(timing.review_finished_marker_received_at);
  const nextPassReadyAt = textOrUndefined(timing.next_pass_ready_marker_received_at);
  const nextGuardAt = textOrUndefined(latency.next_cycle_received_at);
  return {
    guard_response_to_review_request_ms: responseReadyAt && reviewRequestAt
      ? elapsedMs(responseReadyAt, reviewRequestAt)
      : null,
    review_image_service_ms: reviewRequestAt && reviewReadyAt
      ? elapsedMs(reviewRequestAt, reviewReadyAt)
      : null,
    review_delivery_to_review_finished_marker_ms: reviewReadyAt && reviewFinishedAt
      ? elapsedMs(reviewReadyAt, reviewFinishedAt)
      : null,
    review_finished_to_next_pass_ready_marker_ms: reviewFinishedAt && nextPassReadyAt
      ? elapsedMs(reviewFinishedAt, nextPassReadyAt)
      : null,
    next_pass_ready_marker_to_guard_ms: nextPassReadyAt && nextGuardAt
      ? elapsedMs(nextPassReadyAt, nextGuardAt)
      : null,
    review_delivery_to_next_guard_ms: reviewReadyAt && nextGuardAt
      ? elapsedMs(reviewReadyAt, nextGuardAt)
      : null,
  };
}
function percentile(values, fraction) {
  const sorted = values.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}
function reportedToolExecutionMs(record) {
  for (const body of parseTexts(record?.result)) {
    for (const candidate of [
      body?.execution_duration_ms,
      body?.details?.execution_duration_ms,
      body?.mutation_result?.execution_duration_ms,
      body?.mutation_result?.details?.execution_duration_ms,
    ]) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) return candidate;
    }
  }
  return null;
}
export class SessionStore {
  constructor(directory, options = {}) {
    this.directory = directory;
    this.workspaceRoot = options.workspaceRoot
      ? path.resolve(options.workspaceRoot)
      : path.resolve(directory, '..', '..');
    this.visualBarrierDirectory = options.visualBarrierDirectory
      ?? path.join(directory, 'preview-barriers');
    assertCurrentRuntimeStateDirectory(this.directory);
  }
  file(id) { return path.join(this.directory, 'operations', `${validId(id)}.json`); }
  paintingStateFile() { return path.join(this.directory, 'painting-state.json'); }
  visualBarrierFile(documentId) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('Positive document_id required for visual barrier');
    return path.join(this.visualBarrierDirectory, `${documentId}.json`);
  }
  visualBarrier(documentId) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    try {
      const value = JSON.parse(fs.readFileSync(this.visualBarrierFile(documentId), 'utf8'));
      if (typeof value.planId !== 'string' || typeof value.requiresExternalPreview !== 'boolean' ||
          (value.operationId !== undefined && typeof value.operationId !== 'string') ||
          (value.operationSequence !== undefined && (!Number.isSafeInteger(value.operationSequence) || value.operationSequence <= 0)) ||
          (value.sha256 !== undefined && typeof value.sha256 !== 'string')) {
        throw new Error(`Corrupt visual barrier for document ${documentId}`);
      }
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  }
  setVisualBarrier(documentId, value) {
    atomicJson(this.visualBarrierFile(documentId), value);
    return value;
  }
  clearVisualBarrier(documentId) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return false;
    try { fs.unlinkSync(this.visualBarrierFile(documentId)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  visualPlanId(record) {
    return textOrUndefined(record?.args?.plan_id) ?? record?.id;
  }
  barrierOwnedByRecord(barrier, record, suppliedRecords) {
    if (!barrier || !record) return false;
    if (barrier.operationId !== undefined) {
      if (barrier.operationId !== record.id) return false;
      return barrier.operationSequence === undefined || barrier.operationSequence === record.sequence;
    }
    if (barrier.planId !== this.visualPlanId(record)) return false;
    const records = suppliedRecords ?? this.records();
    const sequence = Number(record.sequence ?? 0);
    return !records.some(candidate =>
      candidate.id !== record.id &&
      candidate.args?.document_id === record.args?.document_id &&
      candidate.visual &&
      this.visualPlanId(candidate) === barrier.planId &&
      Number(candidate.sequence ?? 0) > sequence &&
      !candidate.verdict &&
      candidate.resolved?.outcome !== 'abandoned'
    );
  }
  hasPositiveMutationEvidence(record) {
    if (!record) return false;
    if (record.phase === 'completed' && record.failed === false && record.tool === 'photoshop_execute_visual_microplan') {
      return true;
    }
    return parseTexts(record.result).some(body => {
      if (body?.visual_mutation_started === true) return true;
      if (typeof body?.mutation_ok === 'boolean') return true;
      const mutationResults = body?.mutation_results;
      if (mutationResults && typeof mutationResults === 'object' && !Array.isArray(mutationResults)
        && Object.keys(mutationResults).length > 0) return true;
      return false;
    });
  }
  hasDurableNotExecutedProof(record) {
    if (!record || this.hasPositiveMutationEvidence(record)) return false;
    if (record.execution === 'not-executed') return true;
    const guaranteedPreDispatchCodes = new Set([
      'invalid_visual_microplan',
      'preview_verdict_required',
      'method_execution_preflight_failed',
    ]);
    const failedResult = record.result?.isError === true || parseTexts(record.result).some(body => body?.ok === false);
    return parseTexts(record.result).some(body => {
      if (body?.execution === 'not-executed') return true;
      if (body?.visual_mutation_started === false && guaranteedPreDispatchCodes.has(body?.code)) return true;
      // Legacy explicit-document navigation failures predate the execution marker.
      // UXP resolves document_not_found / ambiguous_name before activating any
      // document, so these exact failures are terminal zero-side-effect outcomes.
      if (failedResult && record.tool === 'photoshop_set_active_document'
        && (body?.code === 'document_not_found' || body?.code === 'ambiguous_name')) return true;
      // Legacy parser/method rejections predate the explicit execution marker.
      // Those two codes were emitted before any mutation dispatch. Keep the
      // compatibility proof narrow and refuse it when any positive mutation
      // evidence is present above.
      return failedResult
        && (body?.code === 'invalid_visual_microplan' || body?.code === 'method_execution_preflight_failed');
    });
  }
  finalizeDurableNotExecuted(record, reason = 'durable_pre_dispatch_proof') {
    if (!this.hasDurableNotExecutedProof(record)) return record;
    const updated = {
      ...record,
      phase: 'completed',
      visual: false,
      execution: 'not-executed',
      guard_ack_required: false,
      not_executed_reason: record.not_executed_reason ?? reason,
    };
    if (record.phase !== 'completed' || record.visual !== false || record.execution !== 'not-executed'
      || record.guard_ack_required !== false || !record.not_executed_reason) {
      this.write(updated);
    }
    const documentId = updated.args?.document_id;
    if (Number.isSafeInteger(documentId) && documentId > 0) {
      const barrier = this.visualBarrier(documentId);
      if (this.barrierOwnedByRecord(barrier, updated)) this.clearVisualBarrier(documentId);
    }
    return updated;
  }
  synchronizeVisualBarrier(documentId, suppliedRecords, projectionContext) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    );
    let barrier = this.visualBarrier(documentId);
    if (barrier) {
      const owner = barrier.operationId
        ? records.find(r => r.id === barrier.operationId)
        : [...records].reverse().find(r => r.id === barrier.planId || this.visualPlanId(r) === barrier.planId);
      if (owner && this.hasDurableNotExecutedProof(owner)) {
        this.finalizeDurableNotExecuted(owner, 'legacy_barrier_auto_closed_not_executed');
        barrier = undefined;
      }
      // Legacy split-brain repair: the journal already contains the authoritative
      // classification, so an old server barrier must not resurrect that verdict.
      if (barrier && owner?.verdict) {
        this.clearVisualBarrier(documentId);
        barrier = undefined;
      }
    }
    if (!barrier) {
      const pending = [...records].reverse().find(r =>
        r.visual && !r.verdict
        && r.resolved?.outcome !== 'abandoned' && !this.hasDurableNotExecutedProof(r)
      );
      if (pending) {
        barrier = this.setVisualBarrier(documentId, {
          planId: this.visualPlanId(pending),
          operationId: pending.id,
          operationSequence: pending.sequence,
          ...(pending.preview?.sha256 ? { sha256: pending.preview.sha256 } : {}),
          requiresExternalPreview: !pending.preview?.sha256,
        });
      }
    }
    return barrier;
  }
  paintingState() {
    try {
      const state = JSON.parse(fs.readFileSync(this.paintingStateFile(), 'utf8'));
      if (state.schema_version !== RUNTIME_STATE_VERSION) throw runtimeStateSchemaError(state.schema_version);
      return state;
    }
    catch (e) { if (e.code === 'ENOENT') throw runtimeStateSchemaError('missing-painting-state'); throw e; }
  }
  captureProjectionContext(options: GuardProjectionContextOptions = {}): GuardProjectionContext {
    const capturedAt = Number.isFinite(options.capturedAt) ? options.capturedAt : Date.now();
    const records = options.records ?? this.records();
    const paintingState = options.paintingState ?? this.paintingState();
    const activeJobs = options.activeJobs ?? this.activeJobs(undefined, undefined, capturedAt);
    return { records, paintingState, activeJobs, capturedAt };
  }
  readJobProjection(jobId, capturedAt) {
    return readJob(this.directory, jobId, capturedAt);
  }
  normalizeProcessDir(value) {
    const raw = textOrUndefined(value);
    if (!raw) throw new Error('process_dir is required');
    if (path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw) || raw.startsWith('\\\\') || raw.includes('\\')) {
      throw new Error('process_dir must be a repository-relative POSIX path under processes/');
    }
    const segments = raw.split('/').filter(Boolean);
    if (segments.length !== 3 || segments[0] !== 'processes') {
      throw new Error('process_dir must be exactly processes/<subject>-process/<run-name>');
    }
    const family = segments[1];
    const run = segments[2];
    const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!family.endsWith('-process') || !kebab.test(family) || !kebab.test(run)) {
      throw new Error('process_dir family/run must use lowercase kebab-case and family must end in -process');
    }
    if (segments.some(segment => segment === '.' || segment === '..' || WINDOWS_RESERVED_SEGMENT.test(segment))) {
      throw new Error('process_dir contains a reserved or unsafe path segment');
    }
    return segments.join('/');
  }
  resolveProcessDir(processDir, { create = false } = {}) {
    const normalized = this.normalizeProcessDir(processDir);
    const processesRoot = path.resolve(this.workspaceRoot, 'processes');
    if (create) fs.mkdirSync(processesRoot, { recursive: true });
    const target = path.resolve(this.workspaceRoot, ...normalized.split('/'));
    const rel = path.relative(processesRoot, target);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Resolved process_dir escapes repository processes/');
    }
    if (create) {
      fs.mkdirSync(target, { recursive: true });
      for (const name of ['frames', 'checkpoints', 'final']) {
        fs.mkdirSync(path.join(target, name), { recursive: true });
      }
      const realRoot = fs.realpathSync(processesRoot);
      const realTarget = fs.realpathSync(target);
      const realRel = path.relative(realRoot, realTarget);
      if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel)) {
        throw new Error('Resolved process_dir escapes repository processes/ through a symlink');
      }
    }
    return { normalized, target };
  }
  projectDirectory(documentId) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    const doc = this.paintingState().documents?.[String(documentId)];
    if (!doc?.process_dir) return undefined;
    return this.resolveProcessDir(doc.process_dir, { create: true }).target;
  }
  persistProjectState(documentId, documentState) {
    if (!documentState?.process_dir) return;
    const { target } = this.resolveProcessDir(documentState.process_dir, { create: true });
    atomicJson(path.join(target, 'painting-state.json'), {
      schema_version: RUNTIME_STATE_VERSION,
      version: 2,
      document_id: documentId,
      ...documentState,
    });
  }
  setArtRunState(input) {
    const documentId = Number(input?.document_id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      throw new Error('Art run requires a positive document_id');
    }
    const { normalized, target } = this.resolveProcessDir(input?.process_dir, { create: true });
    const existing = this.paintingState().documents?.[String(documentId)];
    const mode = textOrUndefined(input?.commentary_mode)?.toLowerCase()
      ?? existing?.commentary_mode
      ?? 'mixed';
    const detail = textOrUndefined(input?.commentary_detail)?.toLowerCase()
      ?? existing?.commentary_detail
      ?? 'normal';
    const paintingProfile = textOrUndefined(input?.painting_profile)?.toLowerCase()
      ?? existing?.painting_profile
      ?? 'nontrivial_painting';
    if (!ART_RUN_COMMENTARY_MODES.has(mode)) {
      throw new Error('commentary_mode must be technical|artistic|mixed');
    }
    if (!ART_RUN_COMMENTARY_DETAILS.has(detail)) {
      throw new Error('commentary_detail must be short|normal|detailed');
    }
    if (!ART_RUN_PAINTING_PROFILES.has(paintingProfile)) {
      throw new Error('painting_profile must be nontrivial_painting|simple_graphic');
    }
    if (existing?.process_dir && existing.process_dir !== normalized) {
      throw new Error(
        `process_dir is immutable for document ${documentId}; current run is already bound to ${existing.process_dir}`
      );
    }
    const brushPreflight = input?.brush_preflight === undefined
      ? existing?.brush_preflight
      : parseBrushPreflight(input.brush_preflight);
    const brushPackPolicy = input?.brush_pack_policy === undefined
      ? existing?.brush_pack_policy
      : parseBrushPackPolicy(input.brush_pack_policy, brushPreflight);
    const profileTransition = evaluatePaintingProfileTransition({
      current: existing?.painting_profile,
      requested: paintingProfile,
      brush_preflight: brushPreflight,
    });
    if (!profileTransition.allowed) {
      throw new Error(
        `painting_profile transition rejected: current=${profileTransition.current ?? 'unset'} requested=${profileTransition.requested}; `
        + `allowed_transition=${profileTransition.allowed_transition ?? 'none'}; unmet_obligations=${profileTransition.unmet_obligations.join('; ')}`
      );
    }
    const transitionReason = textOrUndefined(input?.profile_transition_reason);
    const transitionRecord = profileTransition.transition ? {
      ...profileTransition.transition,
      ...(transitionReason ? { reason: transitionReason } : {}),
      at: new Date().toISOString(),
    } : undefined;
    const document = this.updatePaintingState(documentId, current => ({
      ...current,
      process_dir: normalized,
      painting_profile: paintingProfile,
      commentary_mode: mode,
      commentary_detail: detail,
      ...(brushPreflight ? { brush_preflight: brushPreflight } : {}),
      ...(brushPackPolicy ? { brush_pack_policy: brushPackPolicy } : {}),
      ...(transitionRecord ? { profile_transition: transitionRecord } : {}),
      project_started_at: current.project_started_at ?? new Date().toISOString(),
      frame_counter: Number(current.frame_counter ?? 0),
    }));
    return {
      document_id: documentId,
      process_dir: normalized,
      project_directory: target,
      frames_directory: path.join(target, 'frames'),
      checkpoints_directory: path.join(target, 'checkpoints'),
      final_directory: path.join(target, 'final'),
      commentary_mode: mode,
      commentary_detail: detail,
      painting_profile: paintingProfile,
      brush_preflight: brushPreflight ?? null,
      brush_pack_policy: brushPackPolicy ?? null,
      profile_transition: transitionRecord ?? existing?.profile_transition ?? null,
      document,
    };
  }
  updatePaintingState(documentId, updater) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    const state = this.paintingState();
    const key = String(documentId);
    const current = state.documents?.[key] ?? { document_id: documentId };
    state.documents ??= {};
    state.documents[key] = updater(current);
    state.revision = Number(state.revision ?? 0) + 1;
    state.updated_at = new Date().toISOString();
    atomicJson(this.paintingStateFile(), state);
    this.persistProjectState(documentId, state.documents[key]);
    return state.documents[key];
  }
  artRunState(documentId, projectionContext) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    const state = projectionContext ? projectionContext.paintingState : this.paintingState();
    return state.documents?.[String(documentId)];
  }
  currentDocumentRecords(documentId, suppliedRecords, projectionContext) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return [];
    const records = suppliedRecords ?? projectionContext?.records ?? this.records();
    const state = projectionContext ? projectionContext.paintingState : this.paintingState();
    const documentState = state.documents?.[String(documentId)];
    const supersededThroughSequence = Number(
      documentState?.document_instance?.superseded_through_sequence
      ?? documentState?.document_instance?.bootstrap_sequence
      ?? 0
    );
    return records.filter(record => {
      if (record.args?.document_id !== documentId) return false;
      if (!Number.isSafeInteger(supersededThroughSequence) || supersededThroughSequence <= 0) return true;
      return Number(record.sequence ?? 0) > supersededThroughSequence;
    });
  }
  observeDocumentInstance(documentId, rawWitness, observation = {}) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      return { status: 'invalid_document_id', reset_performed: false };
    }
    const witness = normalizeDocumentInstanceWitness(rawWitness);
    if (!witness) return { status: 'witness_missing', reset_performed: false };
    const state = this.paintingState();
    const key = String(documentId);
    state.documents ??= {};
    const existing = state.documents[key];
    const existingWitness = normalizeDocumentInstanceWitness(existing?.document_instance?.host_witness);
    const observedAt = textOrUndefined(observation.observed_at) ?? new Date().toISOString();

    if (!existingWitness) {
      state.documents[key] = {
        ...(existing ?? { document_id: documentId }),
        document_id: documentId,
        document_instance: {
          ...(existing?.document_instance ?? { protocol: 'photoshop.guard.document_instance.v1' }),
          host_witness: witness,
          host_witness_observed_at: observedAt,
        },
      };
      state.revision = Number(state.revision ?? 0) + 1;
      state.updated_at = observedAt;
      atomicJson(this.paintingStateFile(), state);
      this.persistProjectState(documentId, state.documents[key]);
      return {
        status: 'bound',
        reset_performed: false,
        host_witness: witness,
      };
    }

    if (sameDocumentInstanceWitness(existingWitness, witness)) {
      return {
        status: 'match',
        reset_performed: false,
        host_witness: witness,
      };
    }

    const records = this.records();
    const supersededThroughSequence = Math.max(0, ...records.map(record => Number(record.sequence ?? 0)));
    const previousProcessDir = existing?.process_dir ?? null;
    state.documents[key] = {
      document_id: documentId,
      document_instance: {
        protocol: 'photoshop.guard.document_instance.v1',
        host_witness: witness,
        host_witness_observed_at: observedAt,
        superseded_through_sequence: supersededThroughSequence,
        reincarnation_reason: 'host_instance_witness_changed',
        previous_host_witness: existingWitness,
      },
    };
    state.revision = Number(state.revision ?? 0) + 1;
    state.updated_at = observedAt;
    atomicJson(this.paintingStateFile(), state);
    this.clearVisualBarrier(documentId);
    return {
      status: 'reincarnated',
      reset_performed: true,
      host_witness: witness,
      previous_host_witness: existingWitness,
      superseded_process_dir: previousProcessDir,
      superseded_through_sequence: supersededThroughSequence,
    };
  }
  bindBootstrapDocumentInstance(record, documentId) {
    if (!isDocumentBootstrap(record) || !Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    const state = this.paintingState();
    const key = String(documentId);
    const existing = state.documents?.[key];
    const existingInstance = existing?.document_instance;
    if (existingInstance?.bootstrap_operation_id === record.id) {
      return {
        ...existingInstance,
        reset_performed: false,
        replaced_existing_state: false,
      };
    }
    const bootstrapSequence = Number(record.sequence ?? 0);
    const documentInstance = {
      protocol: 'photoshop.guard.document_instance.v1',
      bootstrap_operation_id: record.id,
      bootstrap_tool: record.tool,
      bootstrap_sequence: Number.isSafeInteger(bootstrapSequence) && bootstrapSequence > 0 ? bootstrapSequence : null,
      superseded_through_sequence: Number.isSafeInteger(bootstrapSequence) && bootstrapSequence > 0 ? bootstrapSequence : null,
      established_at: record.completed_at ?? new Date().toISOString(),
    };
    state.documents ??= {};
    state.documents[key] = {
      document_id: documentId,
      document_instance: documentInstance,
    };
    state.revision = Number(state.revision ?? 0) + 1;
    state.updated_at = new Date().toISOString();
    atomicJson(this.paintingStateFile(), state);
    this.clearVisualBarrier(documentId);
    return {
      ...documentInstance,
      reset_performed: true,
      replaced_existing_state: !!existing,
      superseded_process_dir: existing?.process_dir ?? null,
    };
  }
  setWorkflowLifecycle(documentId, status, reason, operationId) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    if (!['active', 'stopped'].includes(status)) throw new Error('workflow lifecycle status must be active|stopped');
    return this.updatePaintingState(documentId, current => ({
      ...current,
      workflow_lifecycle: {
        status,
        reason: textOrUndefined(reason) ?? (status === 'active' ? 'operation_started' : 'close_only_finalization'),
        ...(textOrUndefined(operationId) ? { operation_id: operationId } : {}),
        at: new Date().toISOString(),
      },
    }));
  }
  workflowContinuationActive(documentState, records, lastClassifiedVisual) {
    const status = documentState?.workflow_lifecycle?.status;
    if (status === 'stopped') return false;
    if (status === 'active') return true;
    return legacyVisualContinuationActive(records, lastClassifiedVisual);
  }
  closeOnlyLifecycleOwner(id) {
    const record = this.read(id);
    if (!record) return { ok: false, reason: `Unknown previous_operation_id: ${id}` };
    const documentId = record.args?.document_id;
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return { ok: true, document_id: null };
    const documentState = this.paintingState().documents?.[String(documentId)];
    const bootstrapSequence = Number(documentState?.document_instance?.bootstrap_sequence ?? 0);
    if (Number.isSafeInteger(bootstrapSequence) && bootstrapSequence > 0
      && Number(record.sequence ?? 0) <= bootstrapSequence) {
      return {
        ok: false,
        document_id: documentId,
        reason: `stale_document_instance: ${id} belongs to an earlier Photoshop document that reused document_id=${documentId}`,
      };
    }
    const laterSemantic = this.currentDocumentRecords(documentId).find(candidate =>
      Number(candidate.sequence ?? 0) > Number(record.sequence ?? 0)
      && !isRead(candidate.tool)
      && candidate.execution !== 'not-executed'
      && !isAbandonedRecovery(candidate)
    );
    if (laterSemantic) {
      return {
        ok: false,
        document_id: documentId,
        reason: `stale_close_only: ${id} cannot stop document ${documentId}; newer semantic operation ${laterSemantic.id} exists`,
      };
    }
    return { ok: true, document_id: documentId };
  }
  closeOnlyNextRequiredAction(documentId) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return 'ready';
    const state = this.paintingState().documents?.[String(documentId)];
    if (state?.pending_rollback) {
      const remaining = positiveHistoryStepCount(state.pending_rollback.remaining_undo_steps)
        || positiveHistoryStepCount(state.pending_rollback.required_undo_steps)
        || 1;
      return `rollback required for ${state.pending_rollback.operation_id}: ${remaining} history step${remaining === 1 ? '' : 's'} remaining; execute photoshop_undo or a VisualMicroPlan with action_class=ROLLBACK before any further visual mutation`;
    }
    return 'ready';
  }
  assertProjectSavePath(documentId, file) {
    const projectDir = this.projectDirectory(documentId);
    if (!projectDir) return;
    if (typeof file !== 'string' || !file.trim()) throw new Error('Art-run saves require an explicit path');
    const resolved = path.resolve(file);
    const rel = path.relative(projectDir, resolved);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Art-run save/export path must stay inside ${projectDir}`);
    }
  }
  writeCommentarySidecar(record) {
    const preview = record?.preview;
    const commentPath = preview?.commentary_path;
    if (!commentPath) return undefined;
    const lines = [
      `Кадр: ${path.basename(preview.project_path ?? preview.materialized_path ?? '')}`,
      `Операция: ${record.id}`,
      ...(record.stage ? [`Этап: ${record.stage}`] : []),
      ...(record.region ? [`Область: ${record.region}`] : []),
      '',
      'Перед проходом:',
      textOrUndefined(record.artistic_commentary) ?? 'Художественный комментарий перед проходом не был записан.',
    ];
    if (record.report) {
      lines.push(
        '',
        'После прохода:',
        `Что сделал: ${record.report.did}`,
        `Зачем: ${record.report.why}`,
        `Результат: ${record.report.result}`
      );
    }
    fs.writeFileSync(commentPath, `${lines.join('\n')}\n`, 'utf8');
    return commentPath;
  }
  archiveProjectPreview(record, preview) {
    const documentId = record?.args?.document_id;
    const projectDir = this.projectDirectory(documentId);
    if (!projectDir || !preview?.materialized_path || !fs.existsSync(preview.materialized_path)) {
      return preview;
    }
    const seq = String(Number(record.sequence ?? 0)).padStart(4, '0');
    const stem = `frame_${seq}_${validId(record.id)}`;
    const ext = path.extname(preview.materialized_path) || '.jpg';
    const projectPath = path.join(projectDir, 'frames', `${stem}${ext}`);
    const commentaryPath = path.join(projectDir, 'frames', `${stem}.txt`);
    fs.copyFileSync(preview.materialized_path, projectPath);
    const archived = {
      ...preview,
      project_path: projectPath,
      commentary_path: commentaryPath,
    };
    const previousPreview = record.preview;
    record.preview = archived;
    this.writeCommentarySidecar(record);
    record.preview = previousPreview;
    return archived;
  }
  setArtDirectorState(input) {
    const documentId = Number(input?.document_id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('Art Director state requires a positive document_id');
    const action = textOrUndefined(input?.action)?.toLowerCase();
    if (!['review', 'interrupt', 'complete'].includes(action)) {
      throw new Error('Art Director action must be review|interrupt|complete');
    }
    const artRunForDirective = this.artRunState(documentId);

    if (action === 'interrupt') {
      const reason = textOrUndefined(input.reason)?.toLowerCase();
      const detail = textOrUndefined(input.detail);
      if (!ART_DIRECTOR_INTERRUPT_REASONS.has(reason)) {
        throw new Error(`Art Director interrupt reason must be one of ${[...ART_DIRECTOR_INTERRUPT_REASONS].join(', ')}`);
      }
      if (detail !== undefined && detail.length < 10) throw new Error('Art Director interrupt detail must be concrete when supplied');
      return this.updatePaintingState(documentId, current => {
        const existing = current.art_director;
        if (!existing?.directive_id || existing.status === 'completed') {
          throw new Error('No active Art Director directive to interrupt');
        }
        return {
          ...current,
          art_director: {
            ...existing,
            status: 'interrupted',
            review_due: true,
            review_reason: `early_interrupt:${reason}`,
            interrupt: { reason, ...(detail ? { detail } : {}), at: new Date().toISOString() },
          },
        };
      });
    }

    if (action === 'complete') {
      return this.updatePaintingState(documentId, current => {
        const existing = current.art_director;
        if (!existing?.directive_id) throw new Error('No Art Director directive to complete');
        const openMustFix = this.largestOpenMustFix(current.visual_problems);
        if (openMustFix) {
          throw new Error(
            `Cannot complete Art Director directive while unresolved must-fix visual problem remains: ${openMustFix.problem_id}`
          );
        }
        const unfinished = (existing.tasks ?? []).filter(task => task.status !== 'completed');
        const comparison = input?.final_comparison;
        if (!comparison || typeof comparison !== 'object' || Array.isArray(comparison)) {
          throw new Error('Art Director completion requires final_comparison against the strongest previous accepted state');
        }
        const scope = textOrUndefined(comparison.scope)?.toLowerCase();
        if (!['compared', 'no_previous'].includes(scope)) {
          throw new Error('final_comparison.scope must be compared|no_previous');
        }
        const preferred = textOrUndefined(comparison.preferred)?.toLowerCase();
        if (!['current', 'previous', 'tie'].includes(preferred)) {
          throw new Error('final_comparison.preferred must be current|previous|tie');
        }
        if (preferred === 'previous') {
          throw new Error('final_comparison prefers the previous artistic anchor; restore/reconcile that stronger state before completing');
        }
        const primaryAnchorForRestore = current.primary_artistic_anchor;
        const currentFrameForRestore = current.current_frame;
        const exactPrimaryRestore = !!(
          unfinished.length
          && unfinished.every(task => task.status === 'failed')
          && primaryAnchorForRestore?.operation_id
          && primaryAnchorForRestore?.sha256
          && primaryAnchorForRestore?.path
          && currentFrameForRestore?.operation_id
          && currentFrameForRestore?.sha256
          && currentFrameForRestore?.path
          && currentFrameForRestore.sha256 === primaryAnchorForRestore.sha256
          && textOrUndefined(comparison.scope)?.toLowerCase() === 'compared'
          && textOrUndefined(comparison.current_operation_id) === currentFrameForRestore.operation_id
          && textOrUndefined(comparison.best_previous_operation_id) === primaryAnchorForRestore.operation_id
          && ['current', 'tie'].includes(preferred)
        );
        if (unfinished.length && !exactPrimaryRestore) {
          throw new Error(`Cannot complete Art Director directive while unfinished tasks remain: ${unfinished.map(task => task.task_id).join(', ')}`);
        }
        const paintingProfile = textOrUndefined(artRunForDirective?.painting_profile)
          ?? textOrUndefined(current.painting_profile);
        const refinementCheck = existing.refinement_check ?? null;
        if (paintingProfile === 'nontrivial_painting' && refinementCheck?.status === 'pass') {
          this.validateRefinementCheckEvidence(documentId, refinementCheck);
        }
        const developmentProvenance = paintingDevelopmentProvenance(
          this.currentDocumentRecords(documentId, this.records()),
          documentId,
          current.current_frame?.operation_id
        );
        if (refinementCheck?.status === 'style-not-applicable') {
          const basis = refinementCheck.style_contract_basis;
          const declared = basis ? existing.style_contract?.[basis.field] : undefined;
          if (!basis || declared !== basis.criterion) {
            throw new Error(
              'visual_development_incomplete: style-not-applicable finalization requires the same exact durable style_contract_basis recorded by the Art Director'
            );
          }
        }
        const developmentGate = resolveVisualDevelopmentGate({
          paintingProfile,
          refinementCheck,
          provenance: developmentProvenance,
        });
        if (!developmentGate.ok) {
          throw new Error(developmentGate.errors.join('; '));
        }
        const reason = textOrUndefined(comparison.reason);
        const criteria = comparison.criteria;
        const normalizedCriteria = {};
        if (criteria !== undefined) {
          if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
            throw new Error('final_comparison.criteria must be an object when supplied');
          }
          for (const field of FINAL_COMPARISON_CRITERIA) {
            const value = textOrUndefined(criteria[field]);
            if (value) normalizedCriteria[field] = value;
          }
        }
        const primaryAnchor = current.primary_artistic_anchor;
        const alternativeAnchors = Array.isArray(current.alternative_artistic_anchors)
          ? current.alternative_artistic_anchors
          : [];
        const durableAnchors = [primaryAnchor, ...alternativeAnchors].filter(Boolean);
        if (scope === 'compared') {
          const currentId = textOrUndefined(comparison.current_operation_id);
          const previousId = textOrUndefined(comparison.best_previous_operation_id);
          if (!currentId || !previousId || currentId === previousId) {
            throw new Error('compared final_comparison requires distinct current_operation_id and best_previous_operation_id');
          }
          const currentRecord = this.read(currentId);
          const previousRecord = this.read(previousId);
          if (!currentRecord?.verdict || !previousRecord?.verdict) {
            throw new Error('final_comparison operation ids must reference classified visual operations');
          }
          if (!materializedEvidenceMatches(currentRecord.preview) || !materializedEvidenceMatches(previousRecord.preview)) {
            throw new Error('final_comparison requires durable whole-frame composition evidence for current and previous operations; local crop evidence is supplemental only');
          }
          if (currentRecord.args?.document_id !== documentId || previousRecord.args?.document_id !== documentId) {
            throw new Error('final_comparison operations must belong to the same document');
          }
          if ((previousRecord.sequence ?? 0) >= (currentRecord.sequence ?? Number.MAX_SAFE_INTEGER)) {
            throw new Error('best_previous_operation_id must precede current_operation_id');
          }
          if (durableAnchors.length && !durableAnchors.some(anchor => anchor.operation_id === previousId)) {
            throw new Error('best_previous_operation_id must reference a durable artistic anchor');
          }
          if (current.current_frame?.operation_id && current.current_frame.operation_id !== currentId) {
            throw new Error('final_comparison.current_operation_id must reference the current artistic frame');
          }
        } else if (
          primaryAnchor
          && current.current_frame?.operation_id
          && primaryAnchor.operation_id !== current.current_frame.operation_id
        ) {
          throw new Error('final_comparison.scope=no_previous is invalid when current differs from the primary artistic anchor');
        }
        if (scope === 'no_previous') {
          const currentOperationId = current.current_frame?.operation_id;
          const currentRecord = currentOperationId ? this.read(currentOperationId) : undefined;
          if (!currentRecord?.verdict || !materializedEvidenceMatches(currentRecord.preview)) {
            throw new Error('final_comparison requires durable whole-frame composition evidence for the current operation; local crop evidence is supplemental only');
          }
        }
        const completionGlanceRecord = this.normalizeWholeImageGlance(
          input?.whole_image_glance,
          { directive_id: existing.directive_id, reviewed_at: new Date().toISOString() },
          current
        );
        if (existing.whole_image_glance?.due === true && !completionGlanceRecord) {
          throw new Error(
            `Cannot complete Art Director directive while whole-image review is still due (${existing.whole_image_glance.reason ?? 'pending'}); supply the exact-current whole_image_glance with action=complete`
          );
        }
        const completionWholeImageGlance = completionGlanceRecord ? {
          due: false,
          reason: null,
          last_record: completionGlanceRecord,
          history: [
            ...(existing.whole_image_glance?.history ?? []),
            completionGlanceRecord,
          ].slice(-4),
        } : existing.whole_image_glance;
        const finalFrame = current.current_frame
          ? {
              operation_id: current.current_frame.operation_id,
              sha256: current.current_frame.sha256,
              path: current.current_frame.path,
              selected_at: new Date().toISOString(),
              selection: preferred,
              ...(exactPrimaryRestore && primaryAnchorForRestore?.operation_id
                ? {
                    restored_primary_anchor: true,
                    restored_primary_anchor_operation_id: primaryAnchorForRestore.operation_id,
                  }
                : {}),
            }
          : null;
        const globalBriefAssessment = normalizeGlobalBriefAssessment(
          input?.global_brief_assessment ?? existing.global_brief_assessment,
          {
            contract: existing.artistic_evaluation_contract,
            frame: current.current_frame,
          }
        );
        this.validateNamedRecognitionBriefEvidence(
          documentId,
          globalBriefAssessment,
          existing.artistic_evaluation_contract,
          current.current_frame
        );
        if (['unsatisfied', 'regression'].includes(globalBriefAssessment.outcome)) {
          throw new Error(
            `Cannot complete Art Director directive while global brief outcome is ${globalBriefAssessment.outcome}; `
            + 'relative-best/final-comparison preference is not global brief satisfaction'
          );
        }
        const hasHardBriefItems = Array.isArray(existing.artistic_evaluation_contract?.brief_items)
          && existing.artistic_evaluation_contract.brief_items.some(item => item?.kind === 'hard_perceptual');
        if (hasHardBriefItems && !globalCompletionAllowed(globalBriefAssessment)) {
          throw new Error('Cannot complete Art Director directive while hard brief debt is unresolved or the global brief is not independently satisfied');
        }
        const geometryCompletionDebt = this.geometryCompletionDebt(documentId);
        if (geometryCompletionDebt.length) {
          throw new Error(
            `Cannot complete Art Director directive while E.18 geometry completion debt is unresolved: ${geometryCompletionDebt.map(item => `${item.owner_id ?? 'scene'}:${item.code}`).join(', ')}`
          );
        }
        const physicalEffectCompletionDebt = this.physicalEffectCompletionDebt(documentId);
        if (physicalEffectCompletionDebt.length) {
          throw new Error(
            `Cannot complete Art Director directive while E.17d/E.19 physical-effect debt is unresolved: ${physicalEffectCompletionDebt.map(item => `${item.owner_id ?? 'scene'}:${item.code}`).join(', ')}`
          );
        }
        const preFinalHostileReview = normalizePreFinalHostileReview(
          input?.pre_final_hostile_review,
          {
            contract: existing.artistic_evaluation_contract,
            frame: current.current_frame,
            globalAssessment: globalBriefAssessment,
            geometryDebt: geometryCompletionDebt,
            physicalEffectDebt: physicalEffectCompletionDebt,
          }
        );
        if (preFinalHostileReview.completion_allowed !== true) {
          const defects = Array.isArray(preFinalHostileReview.hard_defects)
            ? preFinalHostileReview.hard_defects.map(defect => defect?.summary).filter(Boolean).join('; ')
            : '';
          throw new Error(
            `Cannot complete Art Director directive while pre-final hostile review has hard defects${defects ? `: ${defects}` : ''}`
          );
        }
        const completionBriefDebtOverrides = { ...(current.brief_debt_overrides ?? {}) };
        for (const row of Array.isArray(globalBriefAssessment.brief_item_results) ? globalBriefAssessment.brief_item_results : []) {
          if (row?.kind !== 'hard_perceptual' || !row?.item_id) continue;
          if (row.state === 'MET') delete completionBriefDebtOverrides[row.item_id];
          else completionBriefDebtOverrides[row.item_id] = structuredClone(row);
        }
        return {
          ...current,
          ...(finalFrame ? { final_artistic_frame: finalFrame } : {}),
          global_brief_assessment: globalBriefAssessment,
          global_brief_outcome: globalBriefAssessment.outcome,
          brief_debt_overrides: completionBriefDebtOverrides,
          art_director: {
            ...existing,
            status: 'completed',
            review_due: false,
            review_reason: null,
            whole_image_glance: completionWholeImageGlance,
            final_comparison: {
              scope,
              preferred,
              ...(reason ? { reason } : {}),
              ...(Object.keys(normalizedCriteria).length ? { criteria: normalizedCriteria } : {}),
              evidence_contract: 'composition-whole-frame',
              ...(exactPrimaryRestore ? { restored_primary_anchor: true } : {}),
              ...(textOrUndefined(comparison.current_operation_id) ? { current_operation_id: comparison.current_operation_id.trim() } : {}),
              ...(textOrUndefined(comparison.best_previous_operation_id) ? { best_previous_operation_id: comparison.best_previous_operation_id.trim() } : {}),
              at: new Date().toISOString(),
            },
            global_brief_assessment: globalBriefAssessment,
            global_brief_completion_allowed: globalCompletionAllowed(globalBriefAssessment),
            pre_final_hostile_review: preFinalHostileReview,
            visual_development_gate: {
              ...developmentGate,
              provenance: developmentProvenance,
              evaluated_frame_operation_id: current.current_frame?.operation_id ?? null,
              evaluated_frame_sha256: current.current_frame?.sha256 ?? null,
            },
            completed_at: new Date().toISOString(),
          },
        };
      });
    }

    const directive = input?.directive;
    if (!directive || typeof directive !== 'object' || Array.isArray(directive)) {
      throw new Error('Art Director review requires directive object');
    }
    const directiveId = textOrUndefined(directive.directive_id);
    const goal = textOrUndefined(directive.goal);
    if (!directiveId || !idPattern.test(directiveId)) throw new Error('directive.directive_id must be a stable 1-80 character id');
    if (!goal) throw new Error('directive.goal is required');
    const assessment = directive.assessment;
    if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) {
      throw new Error('directive.assessment is required');
    }
    const normalizedAssessment = {};
    for (const field of ART_DIRECTOR_ASSESSMENT_FIELDS) {
      const value = textOrUndefined(assessment[field]);
      if (!value) throw new Error(`directive.assessment.${field} is required`);
      normalizedAssessment[field] = value;
    }
    const rawStyleContract = directive.style_contract;
    if (!rawStyleContract || typeof rawStyleContract !== 'object' || Array.isArray(rawStyleContract)) {
      throw new Error('directive.style_contract is required');
    }
    const styleContract = {};
    for (const field of STYLE_CONTRACT_FIELDS) {
      const value = textOrUndefined(rawStyleContract[field]);
      if (value) styleContract[field] = value;
    }
    if (Object.keys(styleContract).length < 3) {
      throw new Error('directive.style_contract must define at least three relevant artistic constraints');
    }
    const rawPromptPreflight = directive.prompt_conflict_preflight;
    if (!rawPromptPreflight || typeof rawPromptPreflight !== 'object' || Array.isArray(rawPromptPreflight)) {
      throw new Error('directive.prompt_conflict_preflight is required before Painter execution');
    }
    const dominantObjective = textOrUndefined(rawPromptPreflight.dominant_objective);
    const chosenRenderingStrategy = textOrUndefined(rawPromptPreflight.chosen_rendering_strategy);
    const resolutionRationale = textOrUndefined(rawPromptPreflight.resolution_rationale);
    const resolutionMode = textOrUndefined(rawPromptPreflight.resolution_mode)?.toLowerCase();
    if (!dominantObjective || dominantObjective.length < 8) {
      throw new Error('prompt_conflict_preflight.dominant_objective must be concrete');
    }
    if (!chosenRenderingStrategy || chosenRenderingStrategy.length < 12) {
      throw new Error('prompt_conflict_preflight.chosen_rendering_strategy must define the structural rendering approach');
    }
    if (!PROMPT_CONFLICT_RESOLUTION_MODES.has(resolutionMode)) {
      throw new Error('prompt_conflict_preflight.resolution_mode must be none|declared-interpretation|user-confirmed');
    }
    const firstPassStrategy = Array.isArray(rawPromptPreflight.first_pass_strategy)
      ? rawPromptPreflight.first_pass_strategy.map((value, index) => {
          const parsed = textOrUndefined(value);
          if (!parsed) throw new Error(`prompt_conflict_preflight.first_pass_strategy[${index}] must be non-empty`);
          return parsed;
        })
      : [];
    if (firstPassStrategy.length < 1 || firstPassStrategy.length > 3) {
      throw new Error('prompt_conflict_preflight.first_pass_strategy must contain 1-3 initial rendering passes');
    }
    const secondaryTraits = Array.isArray(rawPromptPreflight.secondary_traits)
      ? rawPromptPreflight.secondary_traits.map(textOrUndefined).filter(Boolean).slice(0, 8)
      : [];
    const rawConflicts = Array.isArray(rawPromptPreflight.conflicts) ? rawPromptPreflight.conflicts : [];
    const conflicts = rawConflicts.map((conflict, index) => {
      if (!conflict || typeof conflict !== 'object' || Array.isArray(conflict)) {
        throw new Error(`prompt_conflict_preflight.conflicts[${index}] must be an object`);
      }
      const requirementA = textOrUndefined(conflict.requirement_a);
      const requirementB = textOrUndefined(conflict.requirement_b);
      const pipelineConsequence = textOrUndefined(conflict.pipeline_consequence);
      const severity = textOrUndefined(conflict.severity)?.toLowerCase();
      const requiresUserChoice = conflict.requires_user_choice === true;
      if (!requirementA || !requirementB || !pipelineConsequence || !PROMPT_CONFLICT_SEVERITIES.has(severity)) {
        throw new Error(`prompt_conflict_preflight.conflicts[${index}] requires requirement_a, requirement_b, pipeline_consequence, severity=tension|structural and requires_user_choice`);
      }
      return {
        requirement_a: requirementA,
        requirement_b: requirementB,
        pipeline_consequence: pipelineConsequence,
        severity,
        requires_user_choice: requiresUserChoice,
      };
    });
    const structuralConflict = conflicts.some(conflict => conflict.severity === 'structural');
    const userConfirmation = textOrUndefined(rawPromptPreflight.user_confirmation);
    if (structuralConflict && resolutionMode === 'none') {
      throw new Error('structural prompt conflict changes the rendering pipeline; resolve it before Painter mutation');
    }
    if (conflicts.some(conflict => conflict.requires_user_choice) && resolutionMode !== 'user-confirmed') {
      throw new Error('prompt conflict leaves materially different reasonable interpretations; user-confirmed resolution is required before Painter mutation');
    }
    if (resolutionMode === 'user-confirmed' && (!userConfirmation || userConfirmation.length < 4)) {
      throw new Error('prompt_conflict_preflight user-confirmed resolution requires user_confirmation evidence');
    }
    const promptConflictPreflight = {
      dominant_objective: dominantObjective,
      secondary_traits: secondaryTraits,
      conflicts,
      resolution_mode: resolutionMode,
      chosen_rendering_strategy: chosenRenderingStrategy,
      ...(resolutionRationale ? { resolution_rationale: resolutionRationale } : {}),
      first_pass_strategy: firstPassStrategy,
      ...(userConfirmation ? { user_confirmation: userConfirmation } : {}),
    };

    const strategyValidationAfter = Number(directive.strategy_validation_after_microplans);
    if (!Number.isSafeInteger(strategyValidationAfter) || strategyValidationAfter < 1 || strategyValidationAfter > 2) {
      throw new Error('directive.strategy_validation_after_microplans must be 1 or 2');
    }
    const rawStrategyValidation = directive.strategy_validation;
    if (!rawStrategyValidation || typeof rawStrategyValidation !== 'object' || Array.isArray(rawStrategyValidation)) {
      throw new Error('directive.strategy_validation is required');
    }
    const strategyValidationStatus = textOrUndefined(rawStrategyValidation.status)?.toLowerCase();
    if (!STRATEGY_VALIDATION_STATUSES.has(strategyValidationStatus)) {
      throw new Error('directive.strategy_validation.status must be pending|pass|replan');
    }
    const rawEvaluationContract = directive.artistic_evaluation_contract;
    if (!rawEvaluationContract || typeof rawEvaluationContract !== 'object' || Array.isArray(rawEvaluationContract)) {
      throw new Error('directive.artistic_evaluation_contract is required');
    }
    const compositionFreedom = textOrUndefined(directive.composition_freedom)?.toLowerCase();
    if (!COMPOSITION_FREEDOMS.has(compositionFreedom)) {
      throw new Error('directive.composition_freedom must be fixed|constrained|free');
    }
    const rawComposition = directive.composition_exploration ?? {};
    if (!rawComposition || typeof rawComposition !== 'object' || Array.isArray(rawComposition)) {
      throw new Error('directive.composition_exploration must be an object when supplied');
    }
    const rawHypotheses = Array.isArray(rawComposition.hypotheses) ? rawComposition.hypotheses : [];
    const hypotheses = rawHypotheses.map((hypothesis, index) => {
      if (!hypothesis || typeof hypothesis !== 'object' || Array.isArray(hypothesis)) {
        throw new Error(`directive.composition_exploration.hypotheses[${index}] must be an object`);
      }
      const id = textOrUndefined(hypothesis.id);
      const summary = textOrUndefined(hypothesis.summary);
      const largeMasses = textOrUndefined(hypothesis.large_masses);
      const negativeSpace = textOrUndefined(hypothesis.negative_space);
      const lightPattern = textOrUndefined(hypothesis.light_pattern);
      if (!id || !idPattern.test(id) || !summary || !largeMasses || !negativeSpace || !lightPattern) {
        throw new Error(`directive.composition_exploration.hypotheses[${index}] requires id, summary, large_masses, negative_space and light_pattern`);
      }
      return { id, summary, large_masses: largeMasses, negative_space: negativeSpace, light_pattern: lightPattern };
    });
    const selectedId = textOrUndefined(rawComposition.selected_id);
    const selectionReason = textOrUndefined(rawComposition.selection_reason);
    const materialChoiceUnresolved = rawComposition.material_choice_unresolved === true;
    if (compositionFreedom === 'fixed') {
      if (hypotheses.length || selectedId || selectionReason || materialChoiceUnresolved) {
        throw new Error('composition_freedom=fixed forbids composition variant branching');
      }
    }
    if (compositionFreedom === 'free') {
      if (hypotheses.length < 2) throw new Error('composition_freedom=free requires at least two cheap structural hypotheses before commitment');
      if (!selectedId || !hypotheses.some(hypothesis => hypothesis.id === selectedId)) {
        throw new Error('composition_freedom=free selected_id must reference one declared hypothesis');
      }
    }
    if (compositionFreedom === 'constrained' && materialChoiceUnresolved) {
      if (hypotheses.length < 2 || hypotheses.length > 4) {
        throw new Error('composition_freedom=constrained with material_choice_unresolved requires a bounded comparison of 2-4 cheap structural hypotheses');
      }
      if (!selectedId || !hypotheses.some(hypothesis => hypothesis.id === selectedId)) {
        throw new Error('constrained material composition choice requires selected_id from the bounded hypotheses');
      }
    }
    const compositionExploration = {
      hypotheses,
      selected_id: selectedId ?? null,
      selection_reason: selectionReason ?? null,
      material_choice_unresolved: materialChoiceUnresolved,
    };
    const perceptualHierarchy = normalizePerceptualHierarchy(directive.perceptual_hierarchy);
    const physicalStackCheck = normalizePhysicalStackCheck(
      directive.physical_stack_check ?? { status: 'pending', observed: false }
    );
    if (physicalStackCheck.status !== 'pending') {
      this.validatePhysicalStackCheckEvidence(documentId, physicalStackCheck);
      physicalStackCheck.owner_signature = this.physicalStackOwnerSignature(documentId);
      if (
        physicalStackCheck.status === 'pass'
        && textOrUndefined(artRunForDirective?.painting_profile) === 'nontrivial_painting'
        && !this.semanticLayerOwners(documentId).some(owner =>
          PHYSICAL_STACK_SIGNATURE_ROLES.has(textOrUndefined(owner.physical_role)?.toLowerCase())
        )
      ) {
        throw new Error(
          'physical_stack_check.status=pass requires at least one semantically owned physical scene layer in a fresh nontrivial painting'
        );
      }
    }
    const valueCheck = parseValueCheck(directive.value_check);
    if (['override', 'style-not-applicable'].includes(valueCheck.status)) {
      const basis = valueCheck.style_contract_basis;
      const declared = basis ? styleContract[basis.field] : undefined;
      if (!basis || declared !== basis.criterion) {
        throw new Error(
          'value_check exception requires style_contract_basis to exactly match a declared style_contract field'
        );
      }
    }
    if (valueCheck.status !== 'style-not-applicable') {
      this.validateValueCheckEvidence(documentId, valueCheck);
    }
    const refinementCheck = normalizeRefinementCheck(directive.refinement_check);
    if (refinementCheck.status === 'style-not-applicable') {
      const basis = refinementCheck.style_contract_basis;
      const declared = basis ? styleContract[basis.field] : undefined;
      if (!basis || declared !== basis.criterion) {
        throw new Error(
          'refinement_check style-not-applicable requires style_contract_basis to exactly match a declared style_contract field'
        );
      }
    } else if (refinementCheck.status !== 'pending') {
      this.validateRefinementCheckEvidence(documentId, refinementCheck);
      this.validateRefinementLowFrequencyEvidence(documentId, refinementCheck);
    }
    const materialStyleBasis = refinementCheck.material_response?.styleContractBasis;
    if (materialStyleBasis && styleContract[materialStyleBasis.field] !== materialStyleBasis.criterion) {
      throw new Error(
        'refinement_check.material_response style_contract_basis must exactly match the active durable style_contract'
      );
    }
    if (!Array.isArray(directive.priorities) || directive.priorities.length < 1 || directive.priorities.length > 6) {
      throw new Error('directive.priorities must contain 1-6 items');
    }
    const priorities = directive.priorities.map((value, index) => {
      const parsed = textOrUndefined(value);
      if (!parsed) throw new Error(`directive.priorities[${index}] must be non-empty`);
      return parsed;
    });
    if (!Array.isArray(directive.tasks) || directive.tasks.length < 1 || directive.tasks.length > 8) {
      throw new Error('directive.tasks must contain 1-8 bounded Painter tasks');
    }
    const taskIds = new Set();
    const tasks = directive.tasks.map((task, index) => {
      if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error(`directive.tasks[${index}] must be an object`);
      const taskId = textOrUndefined(task.task_id);
      const summary = textOrUndefined(task.summary);
      if (!taskId || !idPattern.test(taskId)) throw new Error(`directive.tasks[${index}].task_id must be a stable id`);
      if (taskIds.has(taskId)) throw new Error(`duplicate directive task_id ${taskId}`);
      taskIds.add(taskId);
      if (!summary) throw new Error(`directive.tasks[${index}].summary is required`);
      const allowedScales = Array.isArray(task.allowed_scales) && task.allowed_scales.length
        ? [...new Set(task.allowed_scales.map(value => normalizeScale(value)).filter(Boolean))]
        : ['medium', 'small'];
      if (!allowedScales.length || allowedScales.includes('global')) {
        throw new Error(`directive.tasks[${index}].allowed_scales must remain within Painter medium/local scope`);
      }
      const allowedGlobalChanges = Array.isArray(task.allowed_global_changes)
        ? [...new Set(task.allowed_global_changes.map(value => textOrUndefined(value)?.toLowerCase()).filter(Boolean))]
        : [];
      for (const domain of allowedGlobalChanges) {
        if (!GLOBAL_CHANGE_DOMAINS.has(domain)) throw new Error(`Unknown allowed_global_changes domain ${domain}`);
      }
      const perceptualZoneIds = Array.isArray(task.perceptual_zone_ids)
        ? [...new Set(task.perceptual_zone_ids.map(value => textOrUndefined(value)).filter(Boolean))]
        : [];
      const knownPerceptualZoneIds = new Set(perceptualHierarchy.zones.map(zone => zone.id));
      for (const zoneId of perceptualZoneIds) {
        if (!knownPerceptualZoneIds.has(zoneId)) throw new Error(`directive.tasks[${index}].perceptual_zone_ids contains unknown zone ${zoneId}`);
      }
      let constructionPlan;
      if (task.construction_plan !== undefined) {
        if (!task.construction_plan || typeof task.construction_plan !== 'object' || Array.isArray(task.construction_plan)) {
          throw new Error(`directive.tasks[${index}].construction_plan must be an object`);
        }
        const plan = task.construction_plan;
        const representationStrategy = textOrUndefined(plan.representation_strategy);
        const structuralFeatures = Array.isArray(plan.structural_features)
          ? [...new Set(plan.structural_features.map(value => textOrUndefined(value)).filter(Boolean))]
          : [];
        const stageExitCondition = textOrUndefined(plan.stage_exit_condition);
        if (!representationStrategy || structuralFeatures.length < 2 || !stageExitCondition) {
          throw new Error(`directive.tasks[${index}].construction_plan requires representation_strategy, at least two structural_features, and stage_exit_condition`);
        }
        const compactList = (value) => Array.isArray(value)
          ? [...new Set(value.map(item => textOrUndefined(item)).filter(Boolean))]
          : [];
        constructionPlan = {
          representation_strategy: representationStrategy,
          structural_features: structuralFeatures,
          recognition_features: compactList(plan.recognition_features),
          negative_spaces: compactList(plan.negative_spaces),
          occlusions: compactList(plan.occlusions),
          ...(textOrUndefined(plan.perspective_or_flow) ? { perspective_or_flow: plan.perspective_or_flow.trim() } : {}),
          primitive_risks: compactList(plan.primitive_risks),
          stage_exit_condition: stageExitCondition,
        };
      }
      return {
        task_id: taskId,
        summary,
        ...(textOrUndefined(task.region) ? { region: task.region.trim() } : {}),
        allowed_scales: allowedScales,
        allowed_global_changes: allowedGlobalChanges,
        ...(perceptualZoneIds.length ? { perceptual_zone_ids: perceptualZoneIds } : {}),
        ...(Array.isArray(task.affected_relations) ? {
          affected_relations: [...new Set(task.affected_relations.map(value => textOrUndefined(value)).filter(Boolean))],
        } : {}),
        ...(Array.isArray(task.affected_qualities) ? {
          affected_qualities: [...new Set(task.affected_qualities.map(value => textOrUndefined(value)).filter(Boolean))],
        } : {}),
        ...(constructionPlan ? { construction_plan: constructionPlan } : {}),
        successful_microplans: 0,
        status: index === 0 ? 'active' : 'pending',
      };
    });
    const activeBrushPackId = textOrUndefined(artRunForDirective?.brush_pack_policy?.brush_pack_id)
      ?? textOrUndefined(artRunForDirective?.brush_preflight?.brush_pack_id);
    const brushPackScenePlan = parseBrushPackScenePlan(directive.brush_pack_scene_plan, {
      brushPackId: activeBrushPackId,
      tasks,
      brushPreflight: artRunForDirective?.brush_preflight,
    });
    const reviewAfter = Number(directive.review_after_microplans);
    if (!Number.isSafeInteger(reviewAfter) || reviewAfter < 1 || reviewAfter > 20) {
      throw new Error('directive.review_after_microplans must be an adaptive integer between 1 and 20 (normally around 5-10)');
    }
    const forbidden = Array.isArray(directive.forbidden_without_review) && directive.forbidden_without_review.length
      ? [...new Set(directive.forbidden_without_review.map(value => textOrUndefined(value)?.toLowerCase()).filter(Boolean))]
      : [...GLOBAL_CHANGE_DOMAINS];
    for (const domain of forbidden) {
      if (!GLOBAL_CHANGE_DOMAINS.has(domain)) throw new Error(`Unknown forbidden_without_review domain ${domain}`);
    }
    const now = new Date().toISOString();
    return this.updatePaintingState(documentId, current => {
      const previous = current.art_director;
      const strategyReviewDue = previous?.directive_id === directiveId
        && previous?.review_due === true
        && String(previous?.review_reason ?? '').startsWith('strategy_validation:');
      let strategyValidation;
      if (!previous || previous.directive_id !== directiveId) {
        if (strategyValidationStatus !== 'pending') {
          throw new Error('initial directive.strategy_validation.status must be pending until early preview evidence exists');
        }
        strategyValidation = { status: 'pending', due_after_microplans: strategyValidationAfter };
      } else if (strategyReviewDue) {
        if (!['pass', 'replan'].includes(strategyValidationStatus)) {
          throw new Error('strategy validation is due: review the exact current preview and record pass or replan before continuing Painter mutation');
        }
        const evidenceOperationId = textOrUndefined(rawStrategyValidation.evidence_operation_id);
        const dominantObjectiveRead = textOrUndefined(rawStrategyValidation.dominant_objective_read);
        const strategyFit = textOrUndefined(rawStrategyValidation.strategy_fit);
        const validationReason = textOrUndefined(rawStrategyValidation.reason);
        if (!evidenceOperationId || evidenceOperationId !== current.current_frame?.operation_id) {
          throw new Error('strategy_validation.evidence_operation_id must reference the exact current artistic frame');
        }
        if (!dominantObjectiveRead || !strategyFit) {
          throw new Error('due strategy validation requires dominant_objective_read and strategy_fit');
        }
        if (strategyValidationStatus === 'replan') {
          const strategyChanged = chosenRenderingStrategy !== previous.prompt_conflict_preflight?.chosen_rendering_strategy
            || JSON.stringify(firstPassStrategy) !== JSON.stringify(previous.prompt_conflict_preflight?.first_pass_strategy ?? []);
          if (!strategyChanged) {
            throw new Error('strategy_validation=replan requires a changed chosen_rendering_strategy or first_pass_strategy');
          }
        }
        strategyValidation = {
          status: strategyValidationStatus === 'replan' ? 'pending' : strategyValidationStatus,
          due_after_microplans: strategyValidationAfter,
          ...(strategyValidationStatus === 'replan' ? { last_result: 'replan' } : {}),
          evidence_operation_id: evidenceOperationId,
          dominant_objective_read: dominantObjectiveRead,
          strategy_fit: strategyFit,
          ...(validationReason ? { reason: validationReason } : {}),
          validated_at: new Date().toISOString(),
        };
      } else {
        strategyValidation = previous.strategy_validation ?? { status: 'pending', due_after_microplans: strategyValidationAfter };
      }
      const revision = previous?.directive_id === directiveId ? Number(previous.revision ?? 0) + 1 : 1;
      const artisticEvaluationContract = normalizeArtisticEvaluationContract(
        rawEvaluationContract,
        previous?.artistic_evaluation_contract
      );
      const globalBriefAssessment = normalizeGlobalBriefAssessment(input?.global_brief_assessment, {
        contract: artisticEvaluationContract,
        frame: current.current_frame,
      });
      this.validateNamedRecognitionBriefEvidence(
        documentId,
        globalBriefAssessment,
        artisticEvaluationContract,
        current.current_frame
      );
      const briefDebtOverrides = { ...(current.brief_debt_overrides ?? {}) };
      if (Array.isArray(globalBriefAssessment.brief_item_results)) {
        for (const row of globalBriefAssessment.brief_item_results) {
          if (row?.kind !== 'hard_perceptual' || !row?.item_id) continue;
          if (row.state === 'MET') delete briefDebtOverrides[row.item_id];
          else briefDebtOverrides[row.item_id] = structuredClone(row);
        }
      }
      const anchorState = this.applyArtisticAnchorDecision(current, input?.anchor_decision, {
        directive_id: directiveId,
        reviewed_at: now,
      });
      const hypothesisState = this.applyIncompleteHypothesisReview(
        current,
        input?.incomplete_hypothesis,
        input?.incomplete_hypothesis_resolution,
        { directive_id: directiveId, reviewed_at: now }
      );
      const glanceRecord = this.normalizeWholeImageGlance(
        input?.whole_image_glance,
        { directive_id: directiveId, reviewed_at: now },
        current
      );
      const previousGlance = current.art_director?.whole_image_glance ?? {
        due: false,
        reason: null,
        last_record: null,
        history: [],
      };
      const wholeImageGlance = glanceRecord ? {
        due: false,
        reason: null,
        last_record: glanceRecord,
        history: [...(previousGlance.history ?? []), glanceRecord].slice(-4),
      } : previousGlance;
      const previousHierarchy = previous?.perceptual_hierarchy;
      const hierarchyChanged = previousHierarchy
        && JSON.stringify(previousHierarchy) !== JSON.stringify(perceptualHierarchy);
      if (previousHierarchy && hierarchyChanged && perceptualHierarchy.revision <= Number(previousHierarchy.revision ?? 0)) {
        throw new Error('directive.perceptual_hierarchy revision must increase when focal ordering or zone budgets change');
      }
      const hierarchyHistory = [
        ...(Array.isArray(previous?.perceptual_hierarchy_history) ? previous.perceptual_hierarchy_history : []),
        ...(previousHierarchy && hierarchyChanged ? [previousHierarchy] : []),
      ].slice(-6);
      return {
        ...current,
        ...anchorState,
        global_brief_assessment: globalBriefAssessment,
        global_brief_outcome: globalBriefAssessment.outcome,
        brief_debt_overrides: briefDebtOverrides,
        art_director: {
          directive_id: directiveId,
          revision,
          status: 'active',
          goal,
          style_contract: styleContract,
          prompt_conflict_preflight: promptConflictPreflight,
          strategy_validation_after_microplans: strategyValidationAfter,
          strategy_validation: strategyValidation,
          strategy_meaningful_microplans: previous?.directive_id !== directiveId || strategyValidationStatus === 'replan'
            ? 0
            : (previous?.strategy_meaningful_microplans ?? 0),
          artistic_evaluation_contract: artisticEvaluationContract,
          global_brief_assessment: globalBriefAssessment,
          composition_freedom: compositionFreedom,
          composition_exploration: compositionExploration,
          perceptual_hierarchy: perceptualHierarchy,
          perceptual_hierarchy_history: hierarchyHistory,
          assessment: normalizedAssessment,
          physical_stack_check: physicalStackCheck,
          value_check: valueCheck,
          refinement_check: refinementCheck,
          priorities,
          tasks,
          ...(brushPackScenePlan ? { brush_pack_scene_plan: brushPackScenePlan } : {}),
          current_task_id: tasks[0].task_id,
          review_after_microplans: reviewAfter,
          task_review_after_microplans: Math.min(reviewAfter, 3),
          task_successful_microplans: 0,
          task_autonomy_remaining: Math.min(reviewAfter, 3),
          completed_microplans: 0,
          review_due: false,
          review_reason: null,
          forbidden_without_review: forbidden,
          issued_at: now,
          reviewed_at: now,
          interrupt: null,
          ...hypothesisState,
          whole_image_glance: wholeImageGlance,
        },
      };
    });
  }
  applyArtisticAnchorDecision(current, rawDecision, review) {
    if (rawDecision === undefined || rawDecision === null) return {};
    if (!rawDecision || typeof rawDecision !== 'object' || Array.isArray(rawDecision)) {
      throw new Error('anchor_decision must be an object');
    }
    const action = textOrUndefined(rawDecision.action)?.toLowerCase();
    if (!['promote_primary', 'retain_primary', 'preserve_alternative'].includes(action)) {
      throw new Error('anchor_decision.action must be promote_primary|retain_primary|preserve_alternative');
    }
    const rationale = textOrUndefined(rawDecision.rationale) ?? null;
    const primary = current.primary_artistic_anchor ?? null;
    const alternatives = Array.isArray(current.alternative_artistic_anchors)
      ? current.alternative_artistic_anchors.filter(Boolean)
      : [];
    if (action === 'retain_primary') {
      if (!primary) throw new Error('anchor_decision retain_primary requires an existing primary artistic anchor');
      return {
        primary_artistic_anchor: primary,
        alternative_artistic_anchors: alternatives,
        last_anchor_decision: {
          action,
          rationale,
          operation_id: primary.operation_id,
          directive_id: review.directive_id,
          at: review.reviewed_at,
        },
      };
    }

    const operationId = textOrUndefined(rawDecision.operation_id)
      ?? current.current_frame?.operation_id
      ?? current.accepted_frame?.operation_id;
    if (!operationId) throw new Error('anchor_decision requires an operation_id or a current classified frame');
    const frame = [current.current_frame, current.accepted_frame, current.confirmed_goal_frame, primary, ...alternatives]
      .find(candidate => candidate?.operation_id === operationId);
    if (!frame || !textOrUndefined(frame.sha256) || !textOrUndefined(frame.path)) {
      throw new Error('anchor_decision operation_id must reference a durable classified frame with sha256 and path');
    }
    const record = this.read(operationId);
    if (
      !record?.visual
      || !record.verdict
      || record.verdict.disposition !== 'accept'
      || record.preview?.sha256 !== frame.sha256
      || !textOrUndefined(record.preview?.project_path ?? record.preview?.materialized_path)
    ) {
      throw new Error('anchor_decision operation_id must reference a retained classified visual operation with matching durable preview evidence');
    }
    const anchor = {
      operation_id: operationId,
      sha256: frame.sha256,
      path: frame.path,
      rationale,
      directive_id: review.directive_id,
      promoted_at: review.reviewed_at,
    };

    if (action === 'preserve_alternative') {
      if (!primary) throw new Error('anchor_decision preserve_alternative requires an existing primary artistic anchor');
      if (primary.operation_id === operationId) {
        throw new Error('primary artistic anchor cannot also be preserved as an alternative');
      }
      const nextAlternatives = [
        ...alternatives.filter(candidate => candidate.operation_id !== operationId),
        anchor,
      ].slice(-2);
      return {
        primary_artistic_anchor: primary,
        alternative_artistic_anchors: nextAlternatives,
        last_anchor_decision: {
          action,
          rationale,
          operation_id: operationId,
          directive_id: review.directive_id,
          at: review.reviewed_at,
        },
      };
    }

    let nextAlternatives = alternatives.filter(candidate => candidate.operation_id !== operationId);
    if (rawDecision.preserve_previous_as_alternative === true && primary && primary.operation_id !== operationId) {
      nextAlternatives = [
        ...nextAlternatives.filter(candidate => candidate.operation_id !== primary.operation_id),
        primary,
      ].slice(-2);
    }
    return {
      primary_artistic_anchor: anchor,
      alternative_artistic_anchors: nextAlternatives,
      last_anchor_decision: {
        action,
        rationale,
        operation_id: operationId,
        directive_id: review.directive_id,
        at: review.reviewed_at,
      },
    };
  }
  applyIncompleteHypothesisReview(current, rawHypothesis, rawResolution, review) {
    const previous = current.art_director?.incomplete_hypothesis ?? null;
    const durableAnchors = [
      current.primary_artistic_anchor,
      ...(Array.isArray(current.alternative_artistic_anchors) ? current.alternative_artistic_anchors : []),
    ].filter(Boolean);
    const resolution = textOrUndefined(rawResolution)?.toLowerCase();
    if (resolution) {
      if (!['resolved', 'accepted', 'reversed'].includes(resolution)) {
        throw new Error('incomplete_hypothesis_resolution must be resolved|accepted|reversed');
      }
      if (!previous) throw new Error('incomplete_hypothesis_resolution requires an active incomplete_hypothesis');
      let restoreProof = {};
      if (resolution === 'reversed') {
        const targetOperationId = textOrUndefined(previous.rollback_operation_id);
        const targetPath = textOrUndefined(previous.rollback_path);
        const targetSha = textOrUndefined(previous.rollback_sha256)?.toLowerCase();
        const targetAnchor = durableAnchors.find(anchor =>
          anchor?.operation_id === targetOperationId
          && anchor?.path === targetPath
          && textOrUndefined(anchor?.sha256)?.toLowerCase() === targetSha
        );
        if (!targetAnchor || !targetSha || !materializedEvidenceMatches(targetAnchor)) {
          throw new Error('incomplete_hypothesis_reversal_unproven: rollback target must still resolve to the exact durable artistic anchor bytes');
        }
        const currentFrame = current.current_frame;
        if (
          !currentFrame
          || textOrUndefined(currentFrame.sha256)?.toLowerCase() !== targetSha
          || !materializedEvidenceMatches(currentFrame)
        ) {
          throw new Error('incomplete_hypothesis_reversal_unproven: current artistic frame does not exactly match the rollback anchor');
        }
        restoreProof = {
          restored_anchor_operation_id: targetOperationId,
          restored_anchor_sha256: targetSha,
          restored_frame_operation_id: currentFrame.operation_id,
          restored_frame_sha256: targetSha,
        };
      }
      return {
        incomplete_hypothesis: null,
        last_incomplete_hypothesis_resolution: {
          ...previous,
          resolution,
          ...restoreProof,
          resolved_at: review.reviewed_at,
          resolved_directive_id: review.directive_id,
        },
      };
    }
    if (rawHypothesis !== undefined) {
      if (!rawHypothesis || typeof rawHypothesis !== 'object' || Array.isArray(rawHypothesis)) {
        throw new Error('incomplete_hypothesis must be an object');
      }
      const lostQuality = textOrUndefined(rawHypothesis.lost_quality);
      const intendedRelationship = textOrUndefined(rawHypothesis.intended_relationship);
      const completionCondition = textOrUndefined(rawHypothesis.observable_completion_condition);
      const rollbackOperationId = textOrUndefined(rawHypothesis.rollback_operation_id)
        ?? current.primary_artistic_anchor?.operation_id;
      const rollbackPath = textOrUndefined(rawHypothesis.rollback_path)
        ?? current.primary_artistic_anchor?.path;
      const rollbackAnchor = durableAnchors.find(anchor =>
        anchor?.operation_id === rollbackOperationId
        && anchor?.path === rollbackPath
        && textOrUndefined(anchor?.sha256)
      );
      const horizon = Number(rawHypothesis.max_review_horizon);
      if (!lostQuality || !intendedRelationship || !completionCondition) {
        throw new Error('incomplete_hypothesis requires lost_quality, intended_relationship and observable_completion_condition');
      }
      if (!rollbackOperationId || !rollbackPath || !rollbackAnchor || !materializedEvidenceMatches(rollbackAnchor)) {
        throw new Error('incomplete_hypothesis requires a real durable rollback anchor operation_id/path with matching materialized bytes');
      }
      if (!Number.isSafeInteger(horizon) || horizon < 1 || horizon > INCOMPLETE_HYPOTHESIS_MAX_REVIEW_HORIZON) {
        throw new Error('incomplete_hypothesis.max_review_horizon must be an integer between 1 and ' + INCOMPLETE_HYPOTHESIS_MAX_REVIEW_HORIZON);
      }
      return {
        incomplete_hypothesis: {
          lost_quality: lostQuality,
          intended_relationship: intendedRelationship,
          observable_completion_condition: completionCondition,
          rollback_operation_id: rollbackOperationId,
          rollback_path: rollbackPath,
          rollback_sha256: textOrUndefined(rollbackAnchor.sha256)?.toLowerCase(),
          max_review_horizon: horizon,
          remaining_reviews: horizon,
          opened_at: review.reviewed_at,
          directive_id: review.directive_id,
        },
      };
    }
    if (!previous) return {};
    const remaining = Number(previous.remaining_reviews ?? previous.max_review_horizon ?? 0) - 1;
    if (remaining <= 0) {
      throw new Error('incomplete_hypothesis_horizon_exhausted: resolve, accept, reverse, or restore the rollback anchor before another review');
    }
    return {
      incomplete_hypothesis: {
        ...previous,
        remaining_reviews: remaining,
        last_reviewed_at: review.reviewed_at,
      },
    };
  }
  normalizeWholeImageGlance(raw, review, current) {
    if (raw === undefined || raw === null) return undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('whole_image_glance must be an object');
    }
    const trigger = textOrUndefined(raw.trigger)?.toLowerCase();
    if (!WHOLE_IMAGE_GLANCE_TRIGGERS.has(trigger)) {
      throw new Error('whole_image_glance.trigger must be stage_boundary|global_change|final_review');
    }
    const observation = textOrUndefined(raw.observation);
    if (!observation || observation.length < 8) {
      throw new Error('whole_image_glance.observation must be concrete');
    }
    const pending = current.art_director?.whole_image_glance ?? null;
    const currentFrame = current.current_frame ?? null;
    const suppliedOperationId = textOrUndefined(raw.operation_id);
    const suppliedFrameSha = textOrUndefined(raw.frame_sha256)?.toLowerCase();
    if (pending?.due) {
      const requiredOperationId = textOrUndefined(pending.required_operation_id);
      const requiredFrameSha = textOrUndefined(pending.required_frame_sha256)?.toLowerCase();
      if (trigger !== pending.reason) {
        throw new Error(`whole_image_glance.trigger must match pending reason ${pending.reason}`);
      }
      if (!requiredOperationId || !requiredFrameSha || !currentFrame) {
        throw new Error('whole_image_glance pending boundary is missing an exact artistic-frame binding');
      }
      if (!suppliedOperationId || suppliedOperationId !== requiredOperationId) {
        throw new Error('whole_image_glance.operation_id must match the exact pending artistic frame');
      }
      if (!suppliedFrameSha || suppliedFrameSha !== requiredFrameSha) {
        throw new Error('whole_image_glance.frame_sha256 must match the exact pending artistic frame');
      }
      if (
        currentFrame.operation_id !== requiredOperationId
        || textOrUndefined(currentFrame.sha256)?.toLowerCase() !== requiredFrameSha
        || !materializedEvidenceMatches(currentFrame)
      ) {
        throw new Error('whole_image_glance evidence is stale: current artistic frame no longer matches the pending boundary');
      }
    }
    const operationId = suppliedOperationId ?? currentFrame?.operation_id ?? null;
    const frameSha = suppliedFrameSha ?? textOrUndefined(currentFrame?.sha256)?.toLowerCase() ?? null;
    return {
      trigger,
      observation,
      operation_id: operationId,
      frame_sha256: frameSha,
      directive_id: review.directive_id,
      at: review.reviewed_at,
    };
  }
  applyArtisticLossUpdates(current, updates, record) {
    if (updates === undefined) return {};
    if (!Array.isArray(updates)) throw new Error('artistic_loss_updates must be an array');
    const losses = { ...(current.artistic_losses ?? {}) };
    for (const [index, raw] of updates.entries()) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('artistic_loss_updates[' + index + '] must be an object');
      }
      const name = textOrUndefined(raw.name);
      const status = textOrUndefined(raw.status)?.toLowerCase();
      if (!name || !['observed', 'resolved', 'accepted', 'reversed'].includes(status)) {
        throw new Error('artistic_loss_updates[' + index + '] requires name and status observed|resolved|accepted|reversed');
      }
      const previous = losses[name];
      const detail = textOrUndefined(raw.detail) ?? previous?.detail;
      if (status === 'observed' && !detail) {
        throw new Error('artistic_loss_updates[' + index + '].detail is required for observed loss');
      }
      losses[name] = {
        ...(previous ?? {}),
        name,
        status,
        ...(detail ? { detail } : {}),
        operation_id: record.id,
        updated_at: record.verdict?.at ?? new Date().toISOString(),
      };
    }
    return { artistic_losses: losses };
  }
  validateValueCheckEvidence(documentId, valueCheck) {
    const evidence = this.read(valueCheck.evidence_operation_id);
    if (!evidence || evidence.phase !== 'completed' || evidence.failed) {
      throw new Error('value_check evidence_operation_id must reference a successful completed grayscale analysis');
    }
    if (evidence.tool !== 'photoshop_analyze_value_structure') {
      throw new Error('value_check evidence_operation_id must reference photoshop_analyze_value_structure');
    }
    if (evidence.args?.document_id !== documentId) {
      throw new Error('value_check grayscale evidence must target the same pinned document');
    }
    const body = parseTexts(evidence.result).find(row =>
      row?.ok === true && typeof row?.source_preview_sha256 === 'string' && typeof row?.grayscale_sha256 === 'string'
    );
    if (!body) throw new Error('value_check grayscale evidence record is missing analyzer hashes');
    const sourceSha = String(body.source_preview_sha256).toLowerCase();
    const grayscaleSha = String(body.grayscale_sha256).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sourceSha) || sourceSha !== valueCheck.preview_sha256) {
      throw new Error('value_check preview_sha256 does not match the analyzer source preview');
    }
    if (!/^[0-9a-f]{64}$/.test(grayscaleSha)) {
      throw new Error('value_check analyzer grayscale_sha256 is invalid');
    }
    const grayscalePath = textOrUndefined(body.materialized_path);
    if (!grayscalePath || !fs.existsSync(grayscalePath) || !fs.statSync(grayscalePath).isFile()) {
      throw new Error('value_check requires a materialized grayscale evidence file');
    }
    if (fingerprintFile(grayscalePath) !== grayscaleSha) {
      throw new Error('value_check grayscale evidence file SHA mismatch');
    }
    const currentFrame = this.paintingState().documents?.[String(documentId)]?.current_frame;
    if (currentFrame?.sha256 && currentFrame.sha256 !== sourceSha) {
      throw new Error('value_check evidence is stale: analyzer source preview is not the current document frame');
    }
    if (currentFrame?.path) {
      if (!fs.existsSync(currentFrame.path) || !fs.statSync(currentFrame.path).isFile()) {
        throw new Error('value_check current document frame is missing from disk');
      }
      if (fingerprintFile(currentFrame.path) !== sourceSha) {
        throw new Error('value_check current document frame SHA mismatch');
      }
    }
    if (currentFrame?.at && evidence.created_at < currentFrame.at) {
      throw new Error('value_check evidence is stale: grayscale analysis predates the current document frame');
    }
    valueCheck.grayscale_sha256 = grayscaleSha;
    valueCheck.grayscale_path = grayscalePath;
    valueCheck.evidence_created_at = evidence.created_at;
    return valueCheck;
  }
  validateRefinementCheckEvidence(documentId, refinementCheck) {
    const evidence = this.read(refinementCheck.evidence_operation_id);
    if (!evidence || evidence.phase !== 'completed' || evidence.failed || !evidence.visual) {
      throw new Error('refinement_check evidence_operation_id must reference a successful completed visual operation');
    }
    if (evidence.args?.document_id !== documentId) {
      throw new Error('refinement_check evidence must target the same pinned document');
    }
    const evidenceSha = textOrUndefined(evidence.preview?.sha256)?.toLowerCase();
    if (!evidenceSha || evidenceSha !== refinementCheck.preview_sha256) {
      throw new Error('refinement_check preview_sha256 must match the referenced visual operation preview');
    }
    const currentFrame = this.paintingState().documents?.[String(documentId)]?.current_frame;
    if (!currentFrame?.sha256 || currentFrame.sha256.toLowerCase() !== refinementCheck.preview_sha256) {
      throw new Error('refinement_check evidence is stale: observed preview is not the current document frame');
    }
    if (currentFrame.operation_id && currentFrame.operation_id !== refinementCheck.evidence_operation_id) {
      throw new Error('refinement_check evidence_operation_id must identify the current document frame operation');
    }
    return refinementCheck;
  }
  validateRefinementLowFrequencyEvidence(documentId, refinementCheck) {
    const low = refinementCheck?.low_frequency_evidence;
    if (!low) {
      if (refinementCheck?.status === 'pass') {
        throw new Error('refinement_check pass requires low_frequency_evidence');
      }
      return refinementCheck;
    }
    const evidence = this.read(low.evidence_operation_id);
    if (!evidence || evidence.phase !== 'completed' || evidence.failed) {
      throw new Error('refinement_check low_frequency_evidence must reference a successful completed analysis');
    }
    if (evidence.tool !== 'photoshop_analyze_value_structure') {
      throw new Error('refinement_check low_frequency_evidence must reference photoshop_analyze_value_structure');
    }
    if (evidence.args?.document_id !== documentId) {
      throw new Error('refinement_check low_frequency_evidence must target the same pinned document');
    }
    const body = parseTexts(evidence.result).find(row =>
      row?.ok === true
      && typeof row?.source_preview_sha256 === 'string'
      && typeof row?.low_frequency_sha256 === 'string'
      && typeof row?.low_frequency_materialized_path === 'string'
    );
    if (!body) {
      throw new Error('refinement_check low_frequency_evidence is missing analyzer low-frequency hashes/path');
    }
    const sourceSha = String(body.source_preview_sha256).toLowerCase();
    const lowSha = String(body.low_frequency_sha256).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sourceSha) || sourceSha !== low.source_preview_sha256) {
      throw new Error('refinement_check low_frequency_evidence source preview SHA mismatch');
    }
    if (sourceSha !== refinementCheck.preview_sha256) {
      throw new Error('refinement_check low_frequency_evidence must analyze the same preview as the refinement check');
    }
    if (!/^[0-9a-f]{64}$/.test(lowSha)) {
      throw new Error('refinement_check low_frequency_evidence SHA is invalid');
    }
    const lowPath = textOrUndefined(body.low_frequency_materialized_path);
    if (!lowPath || !fs.existsSync(lowPath) || !fs.statSync(lowPath).isFile()) {
      throw new Error('refinement_check requires a materialized low-frequency evidence file');
    }
    if (fingerprintFile(lowPath) !== lowSha) {
      throw new Error('refinement_check low-frequency evidence file SHA mismatch');
    }
    const currentFrame = this.paintingState().documents?.[String(documentId)]?.current_frame;
    if (!currentFrame?.sha256 || currentFrame.sha256.toLowerCase() !== sourceSha) {
      throw new Error('refinement_check low_frequency_evidence is stale: analyzer source is not the current frame');
    }
    low.low_frequency_sha256 = lowSha;
    low.low_frequency_path = lowPath;
    return refinementCheck;
  }
  validatePhysicalStackCheckEvidence(documentId, physicalStackCheck) {
    const evidence = this.read(physicalStackCheck.evidence_operation_id);
    if (!evidence || evidence.phase !== 'completed' || evidence.failed || !evidence.visual) {
      throw new Error('physical_stack_check evidence_operation_id must reference a successful completed visual operation');
    }
    if (evidence.args?.document_id !== documentId) {
      throw new Error('physical_stack_check evidence must target the same pinned document');
    }
    const evidenceSha = textOrUndefined(evidence.preview?.sha256)?.toLowerCase();
    if (!evidenceSha || evidenceSha !== physicalStackCheck.preview_sha256) {
      throw new Error('physical_stack_check preview_sha256 must match the referenced visual operation preview');
    }
    const currentFrame = this.paintingState().documents?.[String(documentId)]?.current_frame;
    if (!currentFrame?.sha256 || currentFrame.sha256.toLowerCase() !== physicalStackCheck.preview_sha256) {
      throw new Error('physical_stack_check evidence is stale: observed preview is not the current document frame');
    }
    if (currentFrame.operation_id && currentFrame.operation_id !== physicalStackCheck.evidence_operation_id) {
      throw new Error('physical_stack_check evidence_operation_id must identify the current document frame operation');
    }
    return physicalStackCheck;
  }
  plannerGate(documentId, request, projectionContext) {
    if (!isVisual(request.tool)) return null;
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
    const documentState = (projectionContext ? projectionContext.paintingState : this.paintingState()).documents?.[String(documentId)];
    const art = documentState?.art_director;
    if (!art?.directive_id) return null;
    if (art.status === 'interrupted' || art.review_due) {
      throw new Error(`planner_review_required: directive ${art.directive_id} requires Art Director review before another Painter mutation (${art.review_reason ?? art.status})`);
    }
    if (art.status === 'completed') {
      throw new Error(`planner_review_required: directive ${art.directive_id} is completed; issue a new Art Director directive before more Painter work`);
    }
    const context = visualContext(request);
    const rawMaterialResponse = request?.tool === 'photoshop_execute_visual_microplan'
      ? request?.args?.material_response
      : request?.material_response;
    if (rawMaterialResponse && typeof rawMaterialResponse === 'object' && !Array.isArray(rawMaterialResponse)) {
      const rawBasis = rawMaterialResponse.style_contract_basis ?? rawMaterialResponse.styleContractBasis;
      if (rawBasis && typeof rawBasis === 'object' && !Array.isArray(rawBasis)) {
        const field = textOrUndefined(rawBasis.field);
        const criterion = textOrUndefined(rawBasis.criterion);
        if (!field || !criterion || art.style_contract?.[field] !== criterion) {
          throw new Error(
            'material_response_style_basis_mismatch: material response style_contract_basis must exactly match the active Art Director style_contract'
          );
        }
      }
    }
    if (
      documentState?.painting_profile === 'nontrivial_painting'
      && isPhysicalStackGatedStage(context.stage)
    ) {
      const physicalStackCheck = art.physical_stack_check;
      const durableStageRank = paintingStageRank(documentState.current_stage);
      // Journals created before the physical-stack contract may already be in
      // VALUE or later with no such field. Do not deadlock those continuations;
      // any fresh directive/reset receives an explicit pending check.
      const legacyAlreadyPastGate = !physicalStackCheck
        && durableStageRank !== undefined
        && durableStageRank >= 3;
      if (!legacyAlreadyPastGate) {
        if (!physicalStackCheck || physicalStackCheck.status === 'pending') {
          throw new Error(
            `physical_stack_check_required: ${context.stage} is blocked until Art Director confirms coherent depth/occlusion, opaque mass coverage, intentional transparency and layer-stack order for directive ${art.directive_id}`
          );
        }
        if (physicalStackCheck.status === 'fail') {
          throw new Error(
            `physical_stack_debt_unresolved: ${context.stage} is blocked while physical scene-stack debt remains for directive ${art.directive_id}`
          );
        }
        if (physicalStackCheck.status !== 'pass') {
          throw new Error(
            `physical_stack_check_required: ${context.stage} is blocked by unresolved physical-stack status ${physicalStackCheck.status}`
          );
        }
        const currentOwnerSignature = this.physicalStackOwnerSignature(
          documentId,
          projectionContext?.records,
          projectionContext
        );
        if (
          !textOrUndefined(physicalStackCheck.owner_signature)
          || physicalStackCheck.owner_signature !== currentOwnerSignature
        ) {
          throw new Error(
            `physical_stack_check_stale: ${context.stage} is blocked because the physical semantic layer graph changed after the last accepted physical-stack review`
          );
        }
      }
    }
    if (isDetailStage(context.stage)) {
      const valueCheck = art.value_check;
      if (!valueCheck) {
        throw new Error(`value_check_required: DETAIL is blocked until Art Director records an observed grayscale/value check for directive ${art.directive_id}`);
      }
      if (valueCheck.status === 'fail') {
        throw new Error(`value_structure_unstable: DETAIL is blocked by failed grayscale/value check for directive ${art.directive_id}`);
      }
      if (!['pass', 'override', 'style-not-applicable'].includes(valueCheck.status)) {
        throw new Error(`value_check_required: DETAIL is blocked by unresolved value-check status ${valueCheck.status}`);
      }
    }
    if (isRefinementGatedStage(context.stage)) {
      const refinementCheck = art.refinement_check;
      if (!refinementCheck) {
        throw new Error(
          `refinement_check_required: DETAIL is blocked until Art Director records durable progressive-refinement evidence for directive ${art.directive_id}`
        );
      }
      if (refinementCheck.status === 'pending') {
        throw new Error(
          `refinement_check_required: DETAIL is blocked while progressive-refinement evidence remains pending for directive ${art.directive_id}`
        );
      }
      if (refinementCheck.status === 'fail') {
        throw new Error(
          `refinement_debt_unresolved: DETAIL is blocked while major/secondary form, edge/material, or residual block-in debt remains for directive ${art.directive_id}`
        );
      }
      if (!['pass', 'style-not-applicable'].includes(refinementCheck.status)) {
        throw new Error(
          `refinement_check_required: DETAIL is blocked by unresolved refinement status ${refinementCheck.status}`
        );
      }
      if (
        refinementCheck.status === 'pass'
        && refinementCheck.low_frequency_evidence?.status !== 'resolved'
      ) {
        throw new Error(
          `refinement_low_frequency_required: DETAIL is blocked until major-form modelling is confirmed on exact-current low-frequency evidence for directive ${art.directive_id}`
        );
      }
    }
    if (!context.planner_directive_id || !context.planner_task_id || !context.painter_scope) {
      throw new Error(`painter_contract_gate: active directive ${art.directive_id} requires planner_directive_id, planner_task_id and painter_scope on every visual micro-plan`);
    }
    if (context.planner_directive_id !== art.directive_id) {
      throw new Error(`painter_contract_gate: micro-plan directive ${context.planner_directive_id} does not match active directive ${art.directive_id}`);
    }
    if (!PAINTER_SCOPES.has(context.painter_scope)) throw new Error('painter_contract_gate: painter_scope must be local|medium');
    const task = (art.tasks ?? []).find(row => row.task_id === context.planner_task_id);
    if (!task) throw new Error(`painter_contract_gate: unknown planner_task_id ${context.planner_task_id}`);
    if (task.status !== 'active') {
      throw new Error(`painter_contract_gate: task ${task.task_id} is ${task.status}; only the active task may be executed`);
    }
    const activeBrushPackId = textOrUndefined(documentState?.brush_pack_policy?.brush_pack_id)
      ?? textOrUndefined(documentState?.brush_preflight?.brush_pack_id);
    if (activeBrushPackId && request.tool === 'photoshop_execute_visual_microplan') {
      const micro = request.args && typeof request.args === 'object' && !Array.isArray(request.args) ? request.args : {};
      const strategy = micro.paint_strategy && typeof micro.paint_strategy === 'object' && !Array.isArray(micro.paint_strategy)
        ? micro.paint_strategy
        : {};
      const stampSteps = Array.isArray(micro.steps)
        ? micro.steps.filter(step => step?.tool === 'photoshop_paint_stamp_instances')
        : [];
      const sourceKind = stampSteps.length ? 'stamp-profile' : textOrUndefined(strategy.brush_role) ? 'media-role' : null;
      const sourceId = stampSteps.length
        ? (textOrUndefined(strategy.stamp_profile_id) ?? textOrUndefined(stampSteps[0]?.args?.stamp_profile_id))
        : textOrUndefined(strategy.brush_role);
      if (sourceKind && sourceId) {
        const scenePlan = art.brush_pack_scene_plan;
        const bound = scenePlan?.brush_pack_id === activeBrushPackId
          && (scenePlan.uses ?? []).some(use =>
            use.task_id === task.task_id && use.source_kind === sourceKind && use.source_id === sourceId
          );
        if (!bound) {
          throw new Error(`brush_pack_scene_binding_required: ${sourceKind}=${sourceId} is not causally assigned to active task ${task.task_id}`);
        }
      }
    }
    const requestScale = normalizeScale(context.scale);
    if (!requestScale || requestScale === 'global' || !(task.allowed_scales ?? []).includes(requestScale)) {
      throw new Error(`painter_contract_gate: scale ${requestScale ?? 'missing'} is outside task ${task.task_id} allowed_scales=${(task.allowed_scales ?? []).join(',')}`);
    }
    if (!context.change_domains.length) throw new Error('painter_contract_gate: Painter micro-plan requires change_domains');
    const unresolvedCritique = documentState?.last_critique;
    const unresolvedProblemId = textOrUndefined(unresolvedCritique?.problem_id);
    const materialMismatch = unresolvedCritique
      && unresolvedCritique.target_resolved !== 'yes'
      && textOrUndefined(unresolvedCritique.primary_mismatch);
    if (materialMismatch) {
      const addressesMismatch = context.addresses_primary_mismatch
        || (!!unresolvedProblemId && (
          context.problem_id === unresolvedProblemId
          || context.addresses_problem_id === unresolvedProblemId
        ));
      if (!addressesMismatch) {
        if (!context.independent_region) {
          throw new Error('primary_mismatch_unresolved: dependent Painter continuation must address the unresolved primary mismatch/problem or declare independent_region=true with preservation_facts');
        }
        if (!context.preservation_facts.length) {
          throw new Error('primary_mismatch_unresolved: independent_region=true requires concrete preservation_facts');
        }
      }
    }
    const allowedGlobal = new Set(task.allowed_global_changes ?? []);
    const blocked = context.change_domains.filter(domain =>
      (art.forbidden_without_review ?? []).includes(domain) && !allowedGlobal.has(domain)
    );
    if (blocked.length) {
      throw new Error(`planner_review_required: Painter cannot change ${blocked.join(', ')} under directive ${art.directive_id}; return to Art Director before dispatch`);
    }
    return { directive: art, task, context };
  }
  advanceArtDirectorAfterVerdict(current, context, input, record) {
    const art = current.art_director;
    if (!art?.directive_id || art.status !== 'active') return current;
    if (!context.planner_directive_id || context.planner_directive_id !== art.directive_id) return current;
    const taskId = context.planner_task_id;
    const tasks = (art.tasks ?? []).map(task => ({ ...task }));
    const task = tasks.find(row => row.task_id === taskId);
    if (!task) return current;
    if (context.affected_relations?.length) task.affected_relations = [...context.affected_relations];
    if (context.affected_qualities?.length) task.affected_qualities = [...context.affected_qualities];

    const completedMicroplans = Number(art.completed_microplans ?? 0) + 1;
    const taskAssessment = record.verdict?.planner_task_assessment ?? input.planner_task_assessment;
    const taskResolved = taskAssessment?.status === 'completed';
    const taskBlocked = taskAssessment?.status === 'blocked';
    const taskFailed = input.verdict === 'regression' && input.disposition === 'rollback';
    const passSuccessful = input.verdict === 'improvement'
      && input.disposition === 'accept'
      && input.target_resolved !== 'uncertain';
    if (passSuccessful) task.successful_microplans = Number(task.successful_microplans ?? 0) + 1;
    if (taskResolved) task.status = 'completed';
    else if (taskBlocked) task.status = 'blocked';
    else if (taskFailed) task.status = 'failed';

    let interruptReason = textOrUndefined(input.planner_interrupt_reason)?.toLowerCase();
    if (interruptReason && !ART_DIRECTOR_INTERRUPT_REASONS.has(interruptReason)) interruptReason = undefined;
    if (!interruptReason && input.global_readability === 'degraded') {
      interruptReason = 'unexpected_global_composition_value_shift';
    }
    if (!interruptReason && input.verdict === 'regression' && input.regressions?.length) {
      interruptReason = 'serious_visual_error';
    }
    const normalizedSignals = new Set((record.verdict?.trend_signals ?? []).map(normalizeTrendSignal).filter(Boolean));
    if (!interruptReason && [...normalizedSignals].some(signal => /likeness|main-shape|mainshape/.test(signal))) {
      interruptReason = 'likeness_main_shape_degraded';
    }

    const reviewAfter = Number(art.review_after_microplans ?? 0);
    const taskReviewAfter = Number(art.task_review_after_microplans ?? Math.min(reviewAfter || 3, 3));
    const taskSuccessfulMicroplans = Number(task.successful_microplans ?? 0);
    const cadenceDue = !taskResolved && taskReviewAfter > 0 && taskSuccessfulMicroplans >= taskReviewAfter;
    const strategyMeaningfulMicroplans = Number(art.strategy_meaningful_microplans ?? 0)
      + (record.significance?.execution_effect === 'meaningful' ? 1 : 0);
    // E.7c: strategy-validation cadence is artistic guidance, not execution
    // authority. Keep the configured cadence and meaningful-pass counter as
    // durable telemetry, but do not turn the threshold itself into a review
    // barrier. Observed failure/uncertainty/protected-quality loss and the
    // ordinary task review cadence below remain real review triggers.
    let nextTask;
    if (taskResolved) {
      nextTask = tasks.find(row => row.status === 'pending');
      if (nextTask) nextTask.status = 'active';
    } else if (taskFailed) {
      nextTask = task;
    } else {
      nextTask = task.status === 'active' ? task : tasks.find(row => row.status === 'active');
    }
    const allCompleted = tasks.length > 0 && tasks.every(row => row.status === 'completed');
    const priorPainterStage = textOrUndefined(art.last_painter_stage);
    const currentPainterStage = textOrUndefined(context.stage);
    const stageBoundary = !!priorPainterStage && !!currentPainterStage && priorPainterStage !== currentPainterStage;
    const globalChange = (context.change_domains ?? []).some(domain => GLOBAL_CHANGE_DOMAINS.has(domain));
    const uncertaintyInterrupt = !!textOrUndefined(input.uncertainty)
      && !/^none(?: observed)?$/i.test(String(input.uncertainty).trim());
    const protectedQualityLoss = Array.isArray(input.artistic_loss_updates)
      && input.artistic_loss_updates.some(update => update?.status === 'observed');

    let status = art.status;
    let reviewDue = !!art.review_due;
    let reviewReason = art.review_reason ?? null;
    let interrupt = art.interrupt ?? null;
    let wholeImageGlance = art.whole_image_glance ?? {
      due: false,
      reason: null,
      last_record: null,
      history: [],
    };
    const bindWholeImageGlanceDue = (reason) => ({
      ...wholeImageGlance,
      due: true,
      reason,
      required_operation_id: current.current_frame?.operation_id ?? record.id,
      required_frame_sha256: textOrUndefined(current.current_frame?.sha256 ?? record.preview?.sha256)?.toLowerCase() ?? null,
    });
    if (stageBoundary) {
      wholeImageGlance = bindWholeImageGlanceDue('stage_boundary');
    }
    if (globalChange) {
      wholeImageGlance = bindWholeImageGlanceDue('global_change');
    }
    if (allCompleted) {
      wholeImageGlance = bindWholeImageGlanceDue('final_review');
    }
    if (interruptReason) {
      status = 'interrupted';
      reviewDue = true;
      reviewReason = `early_interrupt:${interruptReason}`;
      interrupt = {
        reason: interruptReason,
        detail: textOrUndefined(input.planner_interrupt_detail)
          ?? `Triggered by classified Painter micro-plan ${record.id}`,
        operation_id: record.id,
        at: record.verdict?.at ?? new Date().toISOString(),
      };
    } else if (taskBlocked) {
      status = 'review_due';
      reviewDue = true;
      reviewReason = `task_blocked:${task.task_id}`;
    } else if (taskFailed) {
      status = 'review_due';
      reviewDue = true;
      reviewReason = `task_failed:${task.task_id}`;
    } else if (uncertaintyInterrupt) {
      status = 'review_due';
      reviewDue = true;
      reviewReason = `task_uncertainty:${task.task_id}`;
    } else if (protectedQualityLoss) {
      status = 'review_due';
      reviewDue = true;
      reviewReason = `protected_quality_loss:${task.task_id}`;
    } else if (allCompleted) {
      status = 'review_due';
      reviewDue = true;
      reviewReason = 'directive_tasks_completed';
    } else if (cadenceDue) {
      status = 'review_due';
      reviewDue = true;
      reviewReason = `cadence:${completedMicroplans}_microplans`;
    }

    return {
      ...current,
      ...((context.affected_relations?.length || context.affected_qualities?.length) ? {
        relation_review: {
          operation_id: record.id,
          ...(context.problem_id ? { problem_id: context.problem_id } : {}),
          affected_relations: context.affected_relations ?? [],
          affected_qualities: context.affected_qualities ?? [],
          primary_mismatch: textOrUndefined(input.primary_mismatch) ?? null,
          uncertainty: textOrUndefined(input.uncertainty) ?? null,
          target_resolved: input.target_resolved ?? null,
          at: record.verdict?.at ?? new Date().toISOString(),
        },
      } : {}),
      art_director: {
        ...art,
        status,
        tasks,
        current_task_id: nextTask?.task_id ?? null,
        completed_microplans: completedMicroplans,
        task_review_after_microplans: taskReviewAfter,
        task_successful_microplans: Number(nextTask?.successful_microplans ?? 0),
        task_autonomy_remaining: nextTask
          ? Math.max(0, taskReviewAfter - Number(nextTask.successful_microplans ?? 0))
          : 0,
        strategy_meaningful_microplans: strategyMeaningfulMicroplans,
        review_due: reviewDue,
        review_reason: reviewReason,
        interrupt,
        whole_image_glance: wholeImageGlance,
        last_painter_stage: currentPainterStage ?? priorPainterStage ?? null,
        last_painter_operation_id: record.id,
        last_painter_verdict_at: record.verdict?.at ?? new Date().toISOString(),
      },
    };
  }
  setPriorityState(input) {
    const documentId = Number(input?.document_id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('priority state requires a positive document_id');
    if (!Array.isArray(input?.problems)) throw new Error('priority state requires problems[]');
    const currentStage = canonicalPaintingStage(textOrUndefined(input.current_stage));
    const evidenceOperationId = textOrUndefined(input.evidence_operation_id);
    const requested = {};
    for (const problem of input.problems) {
      const problemId = textOrUndefined(problem?.problem_id);
      const scale = normalizeScale(problem?.scale);
      const severity = normalizeSeverity(problem?.severity);
      if (!problemId || !scale || !severity) throw new Error('Each priority problem requires problem_id, scale and severity');
      const status = problem.status ?? 'open';
      if (!['open', 'resolved'].includes(status)) throw new Error('priority problem status must be open|resolved');
      requested[problemId] = {
        problem_id: problemId, scale, severity, status,
        ...(textOrUndefined(problem.region) ? { region: problem.region.trim() } : {}),
        ...(textOrUndefined(problem.hypothesis) ? { hypothesis: problem.hypothesis.trim() } : {}),
        ...(Array.isArray(problem.depends_on_problem_ids) ? {
          depends_on_problem_ids: [...new Set(problem.depends_on_problem_ids.map(textOrUndefined).filter(Boolean))],
        } : {}),
        priority_order: Object.keys(requested).length,
      };
    }
    const latestClassifiedSequence = Math.max(
      0,
      ...this.currentDocumentRecords(documentId, this.records())
        .filter(record => record.visual && record.verdict)
        .map(record => Number.isSafeInteger(record.sequence) ? record.sequence : 0)
    );
    return this.updatePaintingState(documentId, current => {
      const durableStage = canonicalPaintingStage(current.current_stage);
      if (currentStage && durableStage && currentStage !== durableStage) {
        throw new Error(
          `priority_state_stage_non_authoritative: current_stage=${currentStage} cannot replace durable painting stage ${durableStage}; stage transitions belong to guarded visual passes`
        );
      }
      const normalized = {};
      for (const [problemId, problem] of Object.entries(requested)) {
        const prior = current.visual_problems?.[problemId];
        const merged = { ...(prior ?? {}), ...problem };
        const isTrend = problemId.startsWith('cumulative-trend-');
        const reclassified = !!prior && (
          prior.status !== merged.status
          || normalizeScale(prior.scale) !== normalizeScale(merged.scale)
          || normalizeSeverity(prior.severity) !== normalizeSeverity(merged.severity)
          || (textOrUndefined(prior.region) ?? null) !== (textOrUndefined(merged.region) ?? null)
        );
        const perceptualReclassification = reclassified && (
          prior.status !== merged.status
          || normalizeScale(prior.scale) !== normalizeScale(merged.scale)
          || normalizeSeverity(prior.severity) !== normalizeSeverity(merged.severity)
        );
        if (perceptualReclassification && prior.status !== 'resolved') {
          if (!evidenceOperationId) {
            throw new Error(
              `priority_reclassification_evidence_required: changing current perceptual status/scale/severity for ${problemId} requires evidence_operation_id from an exact-current visual verdict`
            );
          }
          const evidence = this.currentDocumentRecords(documentId, this.records())
            .find(record => record.id === evidenceOperationId);
          if (!evidence || !evidence.visual || !evidence.verdict) {
            throw new Error(
              `priority_reclassification_evidence_invalid: evidence_operation_id=${evidenceOperationId} must identify a visual operation with a completed verdict on document ${documentId}`
            );
          }
          const documentRecords = this.currentDocumentRecords(documentId, this.records());
          if (!this.recordHasCurrentFrameAuthority(evidence, current, documentRecords)) {
            throw new Error(
              `priority_reclassification_evidence_stale: evidence_operation_id=${evidenceOperationId} no longer has current-frame authority`
            );
          }
          const latestVisualSequence = Math.max(
            0,
            ...documentRecords
              .filter(record => record.visual && record.verdict
                && this.recordHasCurrentFrameAuthority(record, current, documentRecords))
              .map(record => Number.isSafeInteger(record.sequence) ? record.sequence : 0)
          );
          if ((Number(evidence.sequence) || 0) !== latestVisualSequence) {
            throw new Error(
              `priority_reclassification_evidence_not_current: evidence_operation_id=${evidenceOperationId} is not the latest authoritative visual verdict`
            );
          }
          merged.reclassification_evidence_operation_id = evidenceOperationId;
          merged.reclassification_evidence_sequence = Number(evidence.sequence) || latestVisualSequence;
        }
        if (isTrend && reclassified) {
          merged.resolution_epoch = Number(prior.resolution_epoch ?? 0) + 1;
          merged.resolution_cutoff_sequence = latestClassifiedSequence;
          merged.resolution_at = new Date().toISOString();
          merged.resolution_reason = merged.status === 'resolved' ? 'resolved' : 'reclassified';
        }
        normalized[problemId] = merged;
      }
      const primaryBlocker = this.primaryBlockingProblem(normalized);
      return {
        ...current,
        ...(currentStage && !durableStage ? { current_stage: currentStage } : {}),
        visual_problems: normalized,
        active_problem: primaryBlocker ?? undefined,
        ...(primaryBlocker?.scale ? { active_scale: primaryBlocker.scale } : {}),
        priority_review_required: false,
      };
    });
  }
  primaryBlockingProblem(problems) {
    const values = Object.values(problems ?? {}).filter(problem => problem?.status !== 'resolved' && normalizeScale(problem?.scale));
    const byId = problems ?? {};
    const eligible = values.filter(problem => {
      const dependencies = Array.isArray(problem.depends_on_problem_ids) ? problem.depends_on_problem_ids : [];
      return dependencies.every(id => byId[id]?.status === 'resolved');
    });
    const severityRank = { 'must-fix': 0, 'should-fix': 1, 'nice-to-have': 2 };
    eligible.sort((a, b) =>
      (severityRank[normalizeSeverity(a.severity)] ?? 9) - (severityRank[normalizeSeverity(b.severity)] ?? 9)
      || SCALE_RANK[normalizeScale(a.scale)] - SCALE_RANK[normalizeScale(b.scale)]
      || Number(a.priority_order ?? Number.MAX_SAFE_INTEGER) - Number(b.priority_order ?? Number.MAX_SAFE_INTEGER)
      || String(a.problem_id).localeCompare(String(b.problem_id))
    );
    return eligible[0];
  }
  largestOpenMustFix(problems) {
    const byId = problems ?? {};
    const mustFixRoots = Object.values(byId)
      .filter(problem => problem?.status !== 'resolved' && problem?.severity === 'must-fix' && normalizeScale(problem?.scale));
    mustFixRoots.sort((a, b) =>
      SCALE_RANK[normalizeScale(a.scale)] - SCALE_RANK[normalizeScale(b.scale)]
      || Number(a.priority_order ?? Number.MAX_SAFE_INTEGER) - Number(b.priority_order ?? Number.MAX_SAFE_INTEGER)
      || String(a.problem_id).localeCompare(String(b.problem_id))
    );

    const actionableDependency = (problem, visiting = new Set()) => {
      const problemId = String(problem?.problem_id ?? '');
      if (!problemId || visiting.has(problemId)) return undefined;
      const nextVisiting = new Set(visiting);
      nextVisiting.add(problemId);
      const unresolvedDependencies = (Array.isArray(problem.depends_on_problem_ids) ? problem.depends_on_problem_ids : [])
        .map(id => byId[id])
        .filter(dependency => dependency && dependency.status !== 'resolved');
      if (!unresolvedDependencies.length) return problem;
      for (const dependency of unresolvedDependencies) {
        const actionable = actionableDependency(dependency, nextVisiting);
        if (actionable) return actionable;
      }
      return undefined;
    };

    for (const root of mustFixRoots) {
      const actionable = actionableDependency(root);
      if (actionable) return actionable;
    }
    return undefined;
  }
  priorityGate(documentId, request, projectionContext) {
    if (!isVisual(request.tool)) return null;
    const context = visualContext(request);
    const requestScale = normalizeScale(context.scale);
    const rawDoc = (projectionContext ? projectionContext.paintingState : this.paintingState()).documents?.[String(documentId)];
    const lineageRecords = projectionContext?.records ?? this.records();
    const reconciledDoc = this.reconcileDerivedProblemEvidenceToCurrentFrame(
      this.reconcileTrendEvidenceToCurrentFrame(rawDoc ?? {}, lineageRecords),
      lineageRecords
    );
    // Reconciled lineage is durable semantic state, not merely a preflight
    // view. Persist pruning/retirement so restart/status cannot resurrect stale
    // blockers from painting-state. Supplied projection contexts stay pure.
    let doc = reconciledDoc;
    if (!projectionContext && rawDoc && JSON.stringify(reconciledDoc) !== JSON.stringify(rawDoc)) {
      doc = this.updatePaintingState(documentId, () => reconciledDoc) ?? reconciledDoc;
    }
    const blocker = this.largestOpenMustFix(doc?.visual_problems);
    if (!blocker) return null;
    if (blocker.structural_review === true) {
      const addressesBlocker = context.problem_id === blocker.problem_id
        || context.addresses_problem_id === blocker.problem_id;
      if (!addressesBlocker) {
        if (!(context.independent_region && context.preservation_facts.length > 0)) {
          throw new Error(
            `primary_blocker_unresolved: visual mutation must address unresolved structural must-fix "${blocker.problem_id}" or declare independent_region=true with preservation_facts`
          );
        }
      }
      if (addressesBlocker && isCosmeticCorrectiveAttempt(request)) {
        throw new Error(
          `structural_debt_requires_structural_correction: must-fix "${blocker.problem_id}" came from structural whole-frame review; cosmetic/detail masking is blocked until a structural correction resolves or reclassifies it`
        );
      }
    }
    if (!requestScale) throw new Error(`stage_priority_gate: visual mutation must declare scale=global|medium|small while unresolved must-fix "${blocker.problem_id}" is open`);
    const blockerScale = normalizeScale(blocker.scale);
    if (SCALE_RANK[requestScale] <= SCALE_RANK[blockerScale]) return null;
    throw new Error(`stage_priority_gate: ${requestScale} mutation blocked by unresolved ${blockerScale} must-fix "${blocker.problem_id}". Resolve or reclassify the larger problem before finer work.`);
  }
  cumulativeTrendState(documentId, suppliedRecords) {
    const documentRecords = this.currentDocumentRecords(documentId, suppliedRecords ?? this.records());
    const documentState = this.paintingState().documents?.[String(documentId)];
    const records = documentRecords
      // A rolled-back branch remains durable history, but it is no longer evidence
      // about the pixels in the current accepted frame.  Keeping it in the trend
      // window made discarded regressions continue to promote/block current work.
      .filter(r => r.visual && r.verdict && this.recordHasCurrentFrameAuthority(r, documentState, documentRecords))
      .slice(-TREND_SIGNAL_WINDOW);
    const supportsBySignal = new Map();
    for (const record of records) {
      const signals = new Set((record.verdict?.trend_signals ?? []).map(normalizeTrendSignal).filter(Boolean));
      if (record.verdict?.global_readability === 'degraded') signals.add('global-readability-degraded');
      if (record.verdict?.primitive_footprint === 'suspect') signals.add('primitive-footprint-repeating');
      for (const signal of signals) {
        const problemId = `cumulative-trend-${signal}`.slice(0, 80);
        const cutoff = Number(documentState?.visual_problems?.[problemId]?.resolution_cutoff_sequence ?? 0);
        const sequence = Number.isSafeInteger(record.sequence) ? record.sequence : 0;
        if (sequence <= cutoff) continue;
        const supports = supportsBySignal.get(signal) ?? [];
        supports.push(trendSupportForRecord(record, signal));
        supportsBySignal.set(signal, supports);
      }
    }
    const repeated = [...supportsBySignal.entries()]
      .map(([signal, supports]) => ({
        signal,
        count: supports.length,
        supports,
        source_operations: supports.map(support => support.operation_id),
      }))
      .filter(item => item.count >= trendRepeatLimit(item.signal, item.supports))
      .sort((a, b) => b.count - a.count || a.signal.localeCompare(b.signal));
    return {
      window: records.map(r => r.id),
      repeated_signals: repeated,
      triggered: repeated.length > 0,
    };
  }
  promoteCumulativeTrendProblem(documentId, current, trendState) {
    if (!trendState?.triggered) return current;
    const repeatedSignal = trendState.repeated_signals[0];
    const signal = repeatedSignal.signal;
    const problemId = `cumulative-trend-${signal}`.slice(0, 80);
    const problems = { ...(current.visual_problems ?? {}) };
    const existing = problems[problemId];
    const cutoff = Number(existing?.resolution_cutoff_sequence ?? 0);
    const supports = (repeatedSignal.supports ?? []).filter(support =>
      Number(support.sequence ?? 0) > cutoff
    );
    if (supports.length < trendRepeatLimit(signal, supports)) {
      return {
        ...current,
        cumulative_trend_guard: {
          ...trendState,
          triggered: false,
          suppressed_by_resolution_epoch: Number(existing?.resolution_epoch ?? 0),
          resolution_cutoff_sequence: cutoff,
        },
      };
    }
    const scope = trendScopeFromSupports(supports);
    const supportingRegions = supports.map(support => ({
      operation_id: support.operation_id,
      ...(support.named_region ? { named_region: support.named_region } : {}),
      ...(support.scale ? { scale: support.scale } : {}),
      ...(support.region_bounds ? { region_bounds: support.region_bounds } : {}),
      region_source: support.region_source,
    }));
    const supportingEvidence = supports.map(support => ({
      operation_id: support.operation_id,
      sequence: support.sequence,
      signal,
      evidence_identity: support.evidence_identity,
    }));
    problems[problemId] = {
      ...(existing ?? {}),
      problem_id: problemId,
      scale: scope.scale,
      severity: 'must-fix',
      status: 'open',
      region: scope.region,
      hypothesis: `Repeated visual trend detected across classified passes: ${signal}. Resolve the evidence-supported ${scope.scale} defect before dependent finer work.`,
      trend_signal: signal,
      trend_count: supports.length,
      source_operations: supports.map(support => support.operation_id),
      supporting_regions: supportingRegions,
      supporting_evidence: supportingEvidence,
      promotion_reason: scope.promotion_reason,
    };
    const primaryBlocker = this.primaryBlockingProblem(problems);
    return {
      ...current,
      visual_problems: problems,
      active_problem: primaryBlocker ?? problems[problemId],
      active_scale: primaryBlocker?.scale ?? scope.scale,
      priority_review_required: true,
      cumulative_trend_guard: {
        triggered: true,
        problem_id: problemId,
        signal,
        count: supports.length,
        window: trendState.window,
        source_operations: supports.map(support => support.operation_id),
        supporting_regions: supportingRegions,
        promotion_reason: scope.promotion_reason,
      },
    };
  }
  read(id) {
    try {
      const record = JSON.parse(fs.readFileSync(this.file(id), 'utf8'));
      assertCurrentRuntimeRecord(record, id);
      return record;
    } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
  }
  write(record) { atomicJson(this.file(record.id), { ...record, runtime_state_version: RUNTIME_STATE_VERSION }); }
  snapshotClosureState(id) {
    const record = this.read(id);
    if (!record) throw new Error(`Unknown previous_operation_id: ${id}`);
    const paths = new Set([this.file(id), this.paintingStateFile()]);
    const documentId = record.args?.document_id;
    if (Number.isSafeInteger(documentId) && documentId > 0) {
      paths.add(this.visualBarrierFile(documentId));
      const documentState = this.paintingState().documents?.[String(documentId)];
      if (documentState?.process_dir) {
        const { target } = this.resolveProcessDir(documentState.process_dir);
        paths.add(path.join(target, 'painting-state.json'));
      }
    }
    const commentaryPath = record.preview?.commentary_path;
    if (typeof commentaryPath === 'string' && commentaryPath) paths.add(commentaryPath);
    return {
      id,
      files: [...paths].map(file => {
        const existed = fs.existsSync(file);
        return {
          file,
          existed,
          ...(existed ? { bytes: fs.readFileSync(file).toString('base64') } : {}),
        };
      }),
    };
  }
  restoreClosureState(snapshot) {
    if (!snapshot?.files) return false;
    for (const entry of snapshot.files) {
      const existed = entry.existed ?? typeof entry.bytes === 'string';
      if (!existed) {
        try { fs.unlinkSync(entry.file); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        continue;
      }
      if (typeof entry.bytes !== 'string') {
        throw new Error(`Corrupt closure snapshot for ${entry.file}: missing bytes`);
      }
      fs.mkdirSync(path.dirname(entry.file), { recursive: true });
      fs.writeFileSync(entry.file, Buffer.from(entry.bytes, 'base64'));
    }
    return true;
  }
  recordLatency(id, patch = {}) {
    const record = this.read(id);
    if (!record) return undefined;
    const unknownComponents = [...new Set([
      ...(record.latency?.unknown_components ?? []),
      ...(patch.unknown_components ?? []),
    ])];
    record.latency = {
      protocol: 'photoshop.guard.cycle_latency.v1',
      inter_call_unattributed_gap_ms: null,
      decision_model_gap_ms: null,
      guard_preflight_ms: null,
      photoshop_dispatch_wall_ms: null,
      photoshop_reported_execution_ms: reportedToolExecutionMs(record),
      preview_capture_materialization_ms: null,
      guard_response_to_review_request_ms: null,
      review_image_service_ms: null,
      review_delivery_to_review_finished_marker_ms: null,
      review_finished_to_next_pass_ready_marker_ms: null,
      next_pass_ready_marker_to_guard_ms: null,
      review_delivery_to_next_guard_ms: null,
      visual_evaluation_verdict_gap_ms: null,
      report_ack_closure_ms: null,
      recovery_reconciliation_ms: null,
      semantic_cycle_wall_ms: null,
      request_json_bytes: null,
      closure_request_json_bytes: null,
      guard_invocation_count_observed: 1,
      model_call_count: null,
      ...record.latency,
      ...patch,
      unknown_components: unknownComponents,
    };
    Object.assign(record.latency, continuationLatencySegments(record));
    this.write(record);
    return record.latency;
  }
  abandonClosedDocument(documentId, evidence = {}) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      return { abandoned: false, reason: 'invalid_document_id', document_id: documentId ?? null };
    }
    const state = this.paintingState();
    const current = state.documents?.[String(documentId)] ?? { document_id: documentId };
    const expectedWitness = normalizeDocumentInstanceWitness(current.document_instance?.host_witness);
    const observedWitness = normalizeDocumentInstanceWitness(evidence.document_instance_witness);
    if (expectedWitness && observedWitness && !sameDocumentInstanceWitness(expectedWitness, observedWitness)) {
      return {
        abandoned: false,
        reason: 'stale_document_close_event',
        document_id: documentId,
      };
    }
    const at = textOrUndefined(evidence.observed_at) ?? new Date().toISOString();
    const records = this.currentDocumentRecords(documentId, this.records());
    const abandonedOperations = [];
    for (const record of records) {
      if (isAbandonedRecovery(record) || record.execution === 'not-executed') continue;
      const hasClosureDebt = record.phase !== 'completed'
        || !record.report
        || (record.operation_receipt && !record.operation_ack)
        || (record.visual && !record.verdict);
      if (!hasClosureDebt) continue;
      record.resolved = {
        outcome: 'abandoned',
        evidence_mode: textOrUndefined(evidence.evidence_mode) ?? 'uxp_document_close_notification',
        target_document_id: documentId,
        source: textOrUndefined(evidence.source) ?? 'photoshop_document_close',
        ...(textOrUndefined(evidence.command_id) ? { command_id: evidence.command_id } : {}),
        at,
      };
      record.guard_ack_required = false;
      this.write(record);
      abandonedOperations.push(record.id);
    }
    this.clearVisualBarrier(documentId);
    this.updatePaintingState(documentId, documentState => ({
      ...documentState,
      pending_rollback: undefined,
      priority_review_required: false,
      workflow_lifecycle: {
        status: 'stopped',
        reason: 'abandoned_document_absent',
        ...(abandonedOperations.length ? { operation_id: abandonedOperations.at(-1) } : {}),
        at,
      },
      document_close: {
        observed_at: at,
        evidence_mode: textOrUndefined(evidence.evidence_mode) ?? 'uxp_document_close_notification',
        source: textOrUndefined(evidence.source) ?? 'photoshop_document_close',
        ...(observedWitness ? { document_instance_witness: observedWitness } : {}),
      },
    }));
    return {
      abandoned: true,
      document_id: documentId,
      abandoned_operations: abandonedOperations,
      workflow_stopped: true,
    };
  }
  closeLatency(id, cycleReceivedAt, closureGuardMs, closureRequestJsonBytes) {
    const record = this.read(id);
    if (!record) return undefined;
    const responseReadyAt = record.latency?.response_ready_at;
    const externalGapMs = responseReadyAt ? elapsedMs(responseReadyAt, cycleReceivedAt) : null;
    const semanticCycleWallMs = record.latency?.cycle_received_at
      ? elapsedMs(record.latency.cycle_received_at, new Date().toISOString())
      : null;
    return this.recordLatency(id, {
      next_cycle_received_at: cycleReceivedAt,
      inter_call_unattributed_gap_ms: externalGapMs,
      decision_model_gap_ms: record.visual ? null : externalGapMs,
      visual_evaluation_verdict_gap_ms: record.visual ? externalGapMs : null,
      report_ack_closure_ms: closureGuardMs,
      closure_request_json_bytes: Number.isSafeInteger(closureRequestJsonBytes) ? closureRequestJsonBytes : null,
      guard_invocation_count_observed: Math.max(1, Number(record.latency?.guard_invocation_count_observed ?? 1)) + 1,
      model_call_count: null,
      semantic_cycle_wall_ms: semanticCycleWallMs,
      unknown_components: [
        'inter_call_unattributed_gap_ms spans time between Guard response and the next Guard call; host/model/user/report subcomponents are not separately observable',
        ...(record.visual
          ? ['visual_evaluation_verdict_gap_ms is a compatibility projection of the same unattributed inter-call interval for visual operations']
          : ['decision_model_gap_ms is a deprecated compatibility alias; do not interpret it as measured model reasoning time']),
        'model_call_count is not observable at the Guard boundary and therefore remains null',
      ],
    });
  }
  latencySummary(documentId, suppliedRecords, projectionContext) {
    const all = suppliedRecords ?? projectionContext?.records ?? this.records();
    const scoped = Number.isSafeInteger(documentId) && documentId > 0
      ? this.currentDocumentRecords(documentId, all, projectionContext)
      : all;
    const records = scoped.filter(record => record?.latency);
    const visualRecords = records.filter(record => record.visual);
    const fields = [
      'inter_call_unattributed_gap_ms',
      'decision_model_gap_ms',
      'guard_preflight_ms',
      'photoshop_dispatch_wall_ms',
      'photoshop_reported_execution_ms',
      'preview_capture_materialization_ms',
      'guard_response_to_review_request_ms',
      'review_image_service_ms',
      'review_delivery_to_review_finished_marker_ms',
      'review_finished_to_next_pass_ready_marker_ms',
      'next_pass_ready_marker_to_guard_ms',
      'review_delivery_to_next_guard_ms',
      'visual_evaluation_verdict_gap_ms',
      'report_ack_closure_ms',
      'recovery_reconciliation_ms',
      'guard_cycle_total_ms',
      'semantic_cycle_wall_ms',
    ];
    const summarize = sampleRecords => Object.fromEntries(fields.map(field => {
      const values = sampleRecords.map(record => record.latency?.[field])
        .filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
      return [field, {
        samples: values.length,
        median_ms: percentile(values, 0.5),
        p95_ms: percentile(values, 0.95),
      }];
    }));
    return {
      protocol: 'photoshop.guard.cycle_latency_summary.v1',
      operation_samples: records.length,
      visual_operation_samples: visualRecords.length,
      components: summarize(records),
      visual_components: summarize(visualRecords),
    };
  }
  continuationTimelineExport(documentId, suppliedRecords, projectionContext) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      return { protocol: 'photoshop.guard.continuation_timeline_export.v1', document_id: null, document_incarnation: null, operations: [] };
    }
    const all = suppliedRecords ?? projectionContext?.records ?? this.records();
    const records = this.currentDocumentRecords(documentId, all, projectionContext);
    const documentIncarnation = this.currentDocumentIncarnationId(documentId, projectionContext) ?? null;
    const operations = records
      .filter(record => record?.latency && (record.visual || record.latency?.response_ready_at || record.latency?.next_cycle_received_at))
      .map(record => {
        const latency = record.latency ?? {};
        const responseReadyAt = textOrUndefined(latency.response_ready_at);
        const nextGuardAt = textOrUndefined(latency.next_cycle_received_at);
        const continuationTiming = record.continuation_timing ?? {};
        const reviewRequestAt = textOrUndefined(continuationTiming.review_image_request_received_at);
        const reviewReadyAt = textOrUndefined(continuationTiming.review_image_result_ready_at);
        const reviewFinishedAt = textOrUndefined(continuationTiming.review_finished_marker_received_at);
        const nextPassReadyAt = textOrUndefined(continuationTiming.next_pass_ready_marker_received_at);
        return {
          operation_id: record.id,
          visual: !!record.visual,
          join_key: { document_id: documentId, document_incarnation: documentIncarnation, operation_id: record.id },
          boundary_events: [
            ...(responseReadyAt ? [{ kind: 'guard_response_ready', at: responseReadyAt }] : []),
            ...(reviewRequestAt ? [{ kind: 'review_image_request_received', at: reviewRequestAt }] : []),
            ...(reviewReadyAt ? [{ kind: 'review_image_result_ready', at: reviewReadyAt }] : []),
            ...(reviewFinishedAt ? [{ kind: 'review_finished_marker_received', at: reviewFinishedAt }] : []),
            ...(nextPassReadyAt ? [{ kind: 'next_pass_ready_marker_received', at: nextPassReadyAt }] : []),
            ...(nextGuardAt ? [{ kind: 'next_guard_continuation_received', at: nextGuardAt }] : []),
          ],
          inter_call_interval: responseReadyAt && nextGuardAt ? {
            start_at: responseReadyAt,
            end_at: nextGuardAt,
            duration_ms: elapsedMs(responseReadyAt, nextGuardAt),
            classification: 'unattributed_until_host_join',
          } : null,
          diagnostic_partition: {
            marker_semantics: 'server_observed_diagnostic_boundaries_not_pure_model_reasoning_time',
            guard_response_to_review_request_ms: latency.guard_response_to_review_request_ms ?? null,
            review_image_service_ms: latency.review_image_service_ms ?? null,
            review_delivery_to_review_finished_marker_ms: latency.review_delivery_to_review_finished_marker_ms ?? null,
            review_finished_to_next_pass_ready_marker_ms: latency.review_finished_to_next_pass_ready_marker_ms ?? null,
            next_pass_ready_marker_to_guard_ms: latency.next_pass_ready_marker_to_guard_ms ?? null,
            review_delivery_to_next_guard_ms: latency.review_delivery_to_next_guard_ms ?? null,
          },
          guard_latency: latency,
        };
      });
    return {
      protocol: 'photoshop.guard.continuation_timeline_export.v1',
      document_id: documentId,
      document_incarnation: documentIncarnation,
      host_join_contract: {
        key: ['document_id', 'document_incarnation', 'operation_id'],
        inter_call_interval_semantics: 'unattributed_until_host_join',
        guard_latency_protocol: 'photoshop.guard.cycle_latency.v1',
        diagnostic_marker_protocol: 'photoshop.guard.continuation_timing.v1',
        rule: 'Host continuation evidence and opt-in diagnostic markers may partition the inter-call interval; marker intervals are server-observed boundaries, not pure model-reasoning time. Unobserved time stays unattributed and Guard/Photoshop timing fields remain authoritative here.',
      },
      operations,
    };
  }
  recordArtisticThroughputEvent(documentId, event = {}) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    return this.updatePaintingState(documentId, current => {
      const existing = current.artistic_throughput && typeof current.artistic_throughput === 'object'
        ? current.artistic_throughput
        : {};
      const modelVisible = event.model_visible !== false;
      const semanticActions = Number.isFinite(Number(event.semantic_actions))
        ? Math.max(0, Math.trunc(Number(event.semantic_actions)))
        : 0;
      const autoRepairCount = Number.isFinite(Number(event.auto_repair_count))
        ? Math.max(0, Math.trunc(Number(event.auto_repair_count)))
        : 0;
      const autoSplitCount = Number.isFinite(Number(event.auto_split_count))
        ? Math.max(0, Math.trunc(Number(event.auto_split_count)))
        : 0;
      const semanticAmbiguityCount = Number.isFinite(Number(event.model_semantic_ambiguity_count))
        ? Math.max(0, Math.trunc(Number(event.model_semantic_ambiguity_count)))
        : 0;
      const exposedRejectionCount = Number.isFinite(Number(event.preflight_rejection_exposed_to_model_count))
        ? Math.max(0, Math.trunc(Number(event.preflight_rejection_exposed_to_model_count)))
        : 0;
      const kind = textOrUndefined(event.kind) ?? 'bookkeeping';
      const totals = {
        model_visible_guard_round_trips: Number(existing.model_visible_guard_round_trips ?? 0) + (modelVisible ? 1 : 0),
        semantic_dispatch_round_trips: Number(existing.semantic_dispatch_round_trips ?? 0) + (modelVisible && kind === 'semantic-dispatch' ? 1 : 0),
        bookkeeping_only_round_trips: Number(existing.bookkeeping_only_round_trips ?? 0) + (modelVisible && kind === 'bookkeeping' ? 1 : 0),
        recovery_only_round_trips: Number(existing.recovery_only_round_trips ?? 0) + (modelVisible && kind === 'recovery' ? 1 : 0),
        rejected_before_dispatch_round_trips: Number(existing.rejected_before_dispatch_round_trips ?? 0) + (modelVisible && kind === 'rejected' ? 1 : 0),
        semantic_artistic_actions_dispatched: Number(existing.semantic_artistic_actions_dispatched ?? 0) + semanticActions,
        auto_repair_count: Number(existing.auto_repair_count ?? 0) + autoRepairCount,
        auto_split_count: Number(existing.auto_split_count ?? 0) + autoSplitCount,
        model_semantic_ambiguity_count: Number(existing.model_semantic_ambiguity_count ?? 0) + semanticAmbiguityCount,
        preflight_rejection_exposed_to_model_count: Number(existing.preflight_rejection_exposed_to_model_count ?? 0) + exposedRejectionCount,
      };
      const ratio = totals.model_visible_guard_round_trips > 0
        ? totals.semantic_artistic_actions_dispatched / totals.model_visible_guard_round_trips
        : 0;
      const recentEvents = [
        ...(Array.isArray(existing.recent_events) ? existing.recent_events : []),
        {
          at: new Date().toISOString(),
          kind,
          model_visible: modelVisible,
          semantic_actions: semanticActions,
          auto_repair_count: autoRepairCount,
          auto_split_count: autoSplitCount,
          model_semantic_ambiguity_count: semanticAmbiguityCount,
          preflight_rejection_exposed_to_model_count: exposedRejectionCount,
          ...(textOrUndefined(event.operation_id) ? { operation_id: textOrUndefined(event.operation_id) } : {}),
          ...(textOrUndefined(event.job_id) ? { job_id: textOrUndefined(event.job_id) } : {}),
        },
      ].slice(-64);
      return {
        ...current,
        artistic_throughput: {
          protocol: 'photoshop.guard.artistic_throughput.v1',
          ...totals,
          artistic_actions_per_model_visible_guard_round_trip: Number(ratio.toFixed(3)),
          recent_events: recentEvents,
          note: 'Diagnostic only. Do not maximize this ratio by bundling unrelated work or weakening review/recovery.',
        },
      };
    });
  }
  recordCompilerAttemptAudit(documentId, event = {}) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return undefined;
    return this.updatePaintingState(documentId, current => {
      const existing = current.compiler_attempt_audit && typeof current.compiler_attempt_audit === 'object'
        ? current.compiler_attempt_audit
        : {};
      const recent = Array.isArray(existing.recent_attempts) ? existing.recent_attempts : [];
      const problemId = textOrUndefined(event.problem_id);
      const previousRejected = problemId
        ? [...recent].reverse().find(item =>
            item?.outcome === 'rejected'
            && textOrUndefined(item?.problem_id) === problemId
            && textOrUndefined(item?.rejection_fingerprint))
        : undefined;
      const outcome = event.outcome === 'rejected'
        ? 'rejected'
        : event.outcome === 'accepted' ? 'accepted' : 'dispatched';
      const attempt = {
        at: new Date().toISOString(),
        outcome,
        ...(textOrUndefined(event.request_key) ? { request_key: textOrUndefined(event.request_key) } : {}),
        ...(problemId ? { problem_id: problemId } : {}),
        ...(textOrUndefined(event.operation_id) ? { operation_id: textOrUndefined(event.operation_id) } : {}),
        ...(textOrUndefined(event.cycle_fingerprint) ? { cycle_fingerprint: textOrUndefined(event.cycle_fingerprint) } : {}),
        ...(textOrUndefined(event.rejection_fingerprint) ? { rejection_fingerprint: textOrUndefined(event.rejection_fingerprint) } : {}),
        ...(Array.isArray(event.error_codes) ? { error_codes: [...event.error_codes] } : {}),
        ...(event.repair_recipe && typeof event.repair_recipe === 'object' && !Array.isArray(event.repair_recipe)
          ? { repair_recipe: structuredClone(event.repair_recipe) }
          : {}),
        ...(event.compiler_repair_audit && typeof event.compiler_repair_audit === 'object' && !Array.isArray(event.compiler_repair_audit)
          ? { compiler_repair_audit: structuredClone(event.compiler_repair_audit) }
          : {}),
        ...(outcome === 'dispatched' && previousRejected
          ? { corrects_rejection_fingerprint: previousRejected.rejection_fingerprint }
          : {}),
      };
      return {
        ...current,
        compiler_attempt_audit: {
          protocol: 'photoshop.guard.compiler_attempt_audit.v1',
          rejected_attempts: Number(existing.rejected_attempts ?? 0) + (outcome === 'rejected' ? 1 : 0),
          accepted_attempts: Number(existing.accepted_attempts ?? 0) + (outcome === 'accepted' ? 1 : 0),
          dispatched_attempts: Number(existing.dispatched_attempts ?? 0) + (outcome === 'dispatched' ? 1 : 0),
          recent_attempts: [...recent, attempt].slice(-64),
        },
      };
    });
  }
  artisticThroughputMetrics(documentId, suppliedRecords, projectionContext) {
    const state = projectionContext ? projectionContext.paintingState : this.paintingState();
    const stored = state.documents?.[String(documentId)]?.artistic_throughput ?? {};
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    );
    const sumLatency = field => records.reduce((sum, record) => {
      const value = Number(record.latency?.[field]);
      return Number.isFinite(value) && value >= 0 ? sum + value : sum;
    }, 0);
    const guardBookkeepingMs = sumLatency('guard_preflight_ms')
      + sumLatency('report_ack_closure_ms')
      + sumLatency('recovery_reconciliation_ms');
    const photoshopDispatchMs = sumLatency('photoshop_dispatch_wall_ms');
    const visualEvaluationMs = sumLatency('visual_evaluation_verdict_gap_ms');
    const measuredMs = guardBookkeepingMs + photoshopDispatchMs + visualEvaluationMs;
    const regressions = records.filter(record => record.verdict?.verdict === 'regression').length;
    const recoveryRecords = records.filter(record =>
      record.phase !== 'completed'
      || record.resolved?.outcome === 'partial'
      || record.resolved?.outcome === 'not-executed'
    ).length;
    const evidenceFailures = records.filter(record =>
      record.review_evidence?.status === 'artifact_missing_or_corrupt'
      || record.visual_review?.delivery?.delivery_complete === false
    ).length;
    return {
      protocol: 'photoshop.guard.artistic_throughput.v1',
      model_visible_guard_round_trips: Number(stored.model_visible_guard_round_trips ?? 0),
      semantic_dispatch_round_trips: Number(stored.semantic_dispatch_round_trips ?? 0),
      bookkeeping_only_round_trips: Number(stored.bookkeeping_only_round_trips ?? 0),
      recovery_only_round_trips: Number(stored.recovery_only_round_trips ?? 0),
      rejected_before_dispatch_round_trips: Number(stored.rejected_before_dispatch_round_trips ?? 0),
      semantic_artistic_actions_dispatched: Number(stored.semantic_artistic_actions_dispatched ?? 0),
      auto_repair_count: Number(stored.auto_repair_count ?? 0),
      auto_split_count: Number(stored.auto_split_count ?? 0),
      model_semantic_ambiguity_count: Number(stored.model_semantic_ambiguity_count ?? 0),
      preflight_rejection_exposed_to_model_count: Number(stored.preflight_rejection_exposed_to_model_count ?? 0),
      artistic_actions_per_model_visible_guard_round_trip: Number(stored.artistic_actions_per_model_visible_guard_round_trip ?? 0),
      timing: {
        guard_bookkeeping_ms_observed: guardBookkeepingMs,
        photoshop_dispatch_ms_observed: photoshopDispatchMs,
        visual_evaluation_gap_ms_observed: visualEvaluationMs,
        guard_bookkeeping_share_of_measured_time: measuredMs > 0 ? Number((guardBookkeepingMs / measuredMs).toFixed(4)) : null,
        note: 'Visual-evaluation gap remains externally unattributed host/model/user time; only measured components participate in this diagnostic share.',
      },
      outcomes: {
        regression_passes: regressions,
        recovery_or_uncertain_records: recoveryRecords,
        evidence_integrity_failures: evidenceFailures,
      },
      recent_events: Array.isArray(stored.recent_events) ? stored.recent_events : [],
      diagnostic_only: true,
    };
  }
  records() {
    const dir = path.join(this.directory, 'operations');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      assertCurrentRuntimeRecord(r, f);
      if (!r.id || !r.phase || !r.created_at) throw new Error(`Corrupt operation journal: ${f}`);
      return r;
    }).sort((a, b) => (a.sequence && b.sequence ? a.sequence - b.sequence : a.created_at.localeCompare(b.created_at)) || a.id.localeCompare(b.id));
  }
  workflowMetrics(documentId, suppliedRecords, projectionContext) {
    const empty = {
      tracking_started: false,
      primary_metric: 'resolved_visual_problems',
      resolved_visual_problems: 0,
      resolved_problem_ids: [],
      open_problem_ids: [],
      resolution_events: 0,
      meaningful_visual_passes: 0,
      insufficient_visual_passes: 0,
      consecutive_insufficient_visual_passes: 0,
      external_actions_since_last_meaningful_visual_change: 0,
      last_visual_operation_id: null,
      last_visual_verdict_at: null,
      last_meaningful_visual_change_at: null,
      seconds_since_last_visual_operation: null,
      seconds_since_last_meaningful_visual_change: null,
      workflow_stall: false,
      stall_reasons: [],
      artistic_throughput: this.artisticThroughputMetrics(documentId, suppliedRecords, projectionContext),
    };
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return empty;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    );
    const tracked = records.filter(r => r.visual && r.verdict?.significance?.execution_effect);
    if (!tracked.length) return empty;

    const problems = new Map();
    let resolutionEvents = 0;
    let meaningful = 0;
    let insufficient = 0;
    let consecutiveInsufficient = 0;
    for (const record of tracked) {
      const effect = record.verdict.significance.execution_effect;
      const artisticProgress = record.verdict.verdict === 'improvement'
        && record.verdict.disposition === 'accept'
        && significanceHasDetectedChange(record.verdict.significance);
      if (artisticProgress) {
        meaningful++;
        consecutiveInsufficient = 0;
      } else if (effect === 'insufficient') {
        insufficient++;
        consecutiveInsufficient++;
      } else {
        consecutiveInsufficient = 0;
      }
      const problemId = problemIdentity(record);
      if (!problemId) continue;
      const resolved = artisticProgress
        && record.verdict.verdict === 'improvement'
        && record.verdict.disposition === 'accept'
        && record.verdict.target_resolved === 'yes';
      const explicitlyOpen = record.verdict.target_resolved === 'no'
        || record.verdict.verdict === 'regression';
      if (resolved) {
        if (problems.get(problemId) !== 'resolved') resolutionEvents++;
        problems.set(problemId, 'resolved');
      } else if (explicitlyOpen) {
        problems.set(problemId, 'open');
      }
    }

    const lastMeaningful = [...tracked].reverse().find(r =>
      r.verdict?.verdict === 'improvement'
      && r.verdict?.disposition === 'accept'
      && significanceHasDetectedChange(r.verdict?.significance)
    );
    const lastVisual = [...records].reverse().find(r => r.visual);
    const lastVisualAt = lastVisual?.completed_at ?? lastVisual?.created_at;
    const lastMeaningfulAt = lastMeaningful?.completed_at ?? lastMeaningful?.created_at;
    const anchorSequence = lastMeaningful?.sequence ?? ((tracked[0]?.sequence ?? 1) - 1);
    const externalActionsSince = records.filter(r => (r.sequence ?? 0) > anchorSequence).length;
    const stallReasons = [];
    if (externalActionsSince >= WORKFLOW_STALL_ACTION_LIMIT) {
      stallReasons.push(`${externalActionsSince} external actions since the last meaningful visual change`);
    }
    if (consecutiveInsufficient >= WORKFLOW_STALL_INSUFFICIENT_LIMIT) {
      stallReasons.push(`${consecutiveInsufficient} consecutive visually insufficient passes`);
    }
    const resolvedIds = [...problems.entries()].filter(([, status]) => status === 'resolved').map(([id]) => id);
    const openIds = [...problems.entries()].filter(([, status]) => status === 'open').map(([id]) => id);
    return {
      tracking_started: true,
      primary_metric: 'resolved_visual_problems',
      resolved_visual_problems: resolvedIds.length,
      resolved_problem_ids: resolvedIds,
      open_problem_ids: openIds,
      resolution_events: resolutionEvents,
      meaningful_visual_passes: meaningful,
      insufficient_visual_passes: insufficient,
      consecutive_insufficient_visual_passes: consecutiveInsufficient,
      external_actions_since_last_meaningful_visual_change: externalActionsSince,
      last_meaningful_visual_operation_id: lastMeaningful?.id,
      last_visual_operation_id: lastVisual?.id ?? null,
      last_visual_verdict_at: lastVisual?.verdict?.at ?? null,
      last_meaningful_visual_change_at: lastMeaningfulAt ?? null,
      seconds_since_last_visual_operation: ageSeconds(lastVisualAt, projectionContext?.capturedAt),
      seconds_since_last_meaningful_visual_change: ageSeconds(lastMeaningfulAt, projectionContext?.capturedAt),
      workflow_stall: stallReasons.length > 0,
      stall_reasons: stallReasons,
      artistic_throughput: this.artisticThroughputMetrics(documentId, records, projectionContext),
    };
  }
  artisticRecoveryResolution(documentId, facts, projectionContext) {
    const records = this.currentDocumentRecords(
      documentId,
      projectionContext?.records ?? this.records(),
      projectionContext
    );
    const state = projectionContext
      ? (projectionContext.paintingState.documents?.[String(documentId)] ?? {})
      : (this.paintingState().documents?.[String(documentId)] ?? {});
    let normalizedFacts = { ...(facts ?? {}) };
    if (normalizedFacts.kind === 'critic_alarm') {
      const evidence = normalizedFacts.critic_alarm_evidence ?? {};
      const anchorId = textOrUndefined(evidence.anchor_operation_id);
      const observationId = textOrUndefined(evidence.observation_operation_id);
      const observationSha = textOrUndefined(evidence.observation_sha256)?.toLowerCase();
      const durableAnchors = [
        state.primary_artistic_anchor,
        ...(Array.isArray(state.alternative_artistic_anchors) ? state.alternative_artistic_anchors : []),
      ].filter(Boolean);
      const anchor = durableAnchors.find(candidate =>
        candidate?.operation_id === anchorId
        && materializedEvidenceMatches(candidate)
      );
      const observation = records.find(record =>
        record.id === observationId
        && record.args?.document_id === documentId
        && record.preview
      );
      const currentFrameSha = textOrUndefined(state.current_frame?.sha256)?.toLowerCase();
      const verified = !!(
        anchor
        && observation
        && observationSha
        && observation.preview?.sha256 === observationSha
        && currentFrameSha === observationSha
        && materializedEvidenceMatches(observation.preview)
      );
      normalizedFacts = {
        ...normalizedFacts,
        critic_alarm_evidence: {
          ...evidence,
          ...(anchor?.sha256 ? { anchor_sha256: textOrUndefined(anchor.sha256)?.toLowerCase() } : {}),
          evidence_verified: verified,
        },
      };
    }
    return resolveArtisticRecoveryPolicy(normalizedFacts);
  }

  artisticRecoveryForProblem(documentId, problemId, request, suppliedRecords, projectionContext) {
    if (!problemId) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    );
    const lastResolvedSequence = records
      .filter(record => record.visual && record.verdict && problemIdentity(record) === problemId)
      .filter(record =>
        record.verdict?.target_resolved === 'yes'
        && record.verdict?.verdict === 'improvement'
        && record.verdict?.disposition === 'accept'
      )
      .map(record => Number(record.sequence ?? 0))
      .sort((a, b) => b - a)[0] ?? 0;
    const attemptRecords = records
      .filter(record => record.visual && record.verdict && problemIdentity(record) === problemId)
      .filter(record => Number(record.sequence ?? 0) > lastResolvedSequence)
      .filter(record =>
        record.verdict?.target_resolved === 'no'
        || record.verdict?.verdict === 'regression'
        || record.verdict?.significance?.execution_effect === 'insufficient'
      )
      ;
    const attempts = attemptRecords.map(record => ({
        strategy_id: textOrUndefined(record.causal_strategy_id) ?? visualStrategyFingerprint(record),
        method_class: textOrUndefined(record.args?.method_class),
        materially_corrected: significanceHasDetectedChange(record.verdict?.significance),
        useful_partial_work: record.verdict?.verdict === 'improvement'
          || record.verdict?.disposition === 'accept',
        failed: true,
      }));
    if (!attempts.length) return null;
    const context = visualContext(request ?? {});
    const resolution = this.artisticRecoveryResolution(documentId, {
      kind: 'artistic_unresolved',
      attempts,
      dependent_work_remaining: true,
      independent_tasks_available: context.independent_region === true && context.preservation_facts.length > 0,
    }, projectionContext);
    const methodsTried = [...new Set(attemptRecords.map(record =>
      textOrUndefined(record.args?.method_class)
      ?? textOrUndefined(record.args?.steps?.find?.(step => step?.tool !== 'photoshop_get_preview')?.method_id)
    ).filter(Boolean))];
    const strategyFamiliesTried = [...new Set(attemptRecords.map(record =>
      textOrUndefined(record.strategy_family)
      ?? textOrUndefined(record.causal_strategy_id)
      ?? textOrUndefined(record.args?.method_class)
      ?? visualStrategyFingerprint(record)
    ).filter(Boolean))];
    const regressionCount = attemptRecords.filter(record => record.verdict?.verdict === 'regression').length;
    const rollbackCount = attemptRecords.filter(record => record.verdict?.disposition === 'rollback').length;
    const strongestKnown = [...records].reverse().find(record =>
      record.visual
      && record.verdict
      && problemIdentity(record) === problemId
      && Number(record.sequence ?? 0) > lastResolvedSequence
      && (record.verdict?.verdict === 'improvement' || record.verdict?.disposition === 'accept')
    );
    const currentEscalationLevel = Math.max(0, ...attemptRecords.map(record => {
      const explicit = Number(record.causal_escalation_level);
      if (Number.isInteger(explicit) && explicit >= 0 && explicit <= 4) return explicit;
      if (record.causal_level_change === true) return 2;
      return 0;
    }));
    const minimumRequiredNextLevel = resolution.decision === 'retry_same_strategy_once'
      ? currentEscalationLevel
      : resolution.decision === 'require_distinct_strategy'
        ? Math.min(4, currentEscalationLevel + 1)
        : resolution.decision === 'block_dependent_problem'
          ? Math.min(4, Math.max(2, currentEscalationLevel + 1))
          : currentEscalationLevel;
    return {
      ...resolution,
      failed_attempt_count: attempts.length,
      attempt_count: attemptRecords.length,
      consecutive_unresolved: attemptRecords.length,
      same_primary_mismatch_count: attemptRecords.length,
      methods_tried: methodsTried,
      strategy_families_tried: strategyFamiliesTried,
      regression_count: regressionCount,
      rollback_count: rollbackCount,
      strongest_known_frame: strongestKnown?.preview?.sha256 ? {
        operation_id: strongestKnown.id,
        sha256: strongestKnown.preview.sha256,
      } : null,
      current_escalation_level: currentEscalationLevel,
      minimum_required_next_level: minimumRequiredNextLevel,
    };
  }

  recognitionMetrics(documentId, suppliedRecords, projectionContext) {
    const empty = {
      tracking_started: false,
      tracking_started_at: null,
      first_detected_visual_change_at: null,
      seconds_to_first_detected_visual_change: null,
      first_subject_recognizable_at: null,
      seconds_to_subject_recognizable: null,
      first_subject_and_style_recognizable_at: null,
      seconds_to_subject_and_style_recognizable: null,
      recognition_feature_destruction_passes: 0,
      recognition_features_lost_count: 0,
      recognition_features_lost: [],
      recorded_operation_ms: 0,
      between_operation_gap_ms: 0,
      reported_tool_execution_ms: 0,
      reported_tool_execution_operations: 0,
    };
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return empty;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    );
    if (!records.length) return empty;
    const startedAt = records[0].created_at;
    const classifiedVisual = records.filter(r => r.visual && r.verdict);
    const milestoneAt = record => {
      const previewId = record?.verdict?.preview_id;
      const previewRecord = previewId ? records.find(r => r.id === previewId) : undefined;
      return previewRecord?.completed_at ?? record?.completed_at ?? record?.verdict?.at ?? null;
    };
    const firstChange = classifiedVisual.find(r => significanceHasDetectedChange(r.verdict?.significance));
    const firstSubject = classifiedVisual.find(r => r.verdict?.recognition?.subject === 'yes');
    const firstSubjectStyle = classifiedVisual.find(r =>
      r.verdict?.recognition?.subject === 'yes' && r.verdict?.recognition?.style === 'yes'
    );
    const firstChangeAt = firstChange ? milestoneAt(firstChange) : null;
    const firstSubjectAt = firstSubject ? milestoneAt(firstSubject) : null;
    const firstSubjectStyleAt = firstSubjectStyle ? milestoneAt(firstSubjectStyle) : null;
    const destruction = classifiedVisual.filter(r => (r.verdict?.recognition?.lost_features?.length ?? 0) > 0);
    const lost = destruction.flatMap(r => r.verdict.recognition.lost_features);

    let recordedOperationMs = 0;
    let betweenOperationGapMs = 0;
    let reportedExecutionMs = 0;
    let reportedExecutionOperations = 0;
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const duration = elapsedMs(record.created_at, record.completed_at);
      if (duration !== null) recordedOperationMs += duration;
      const reported = reportedToolExecutionMs(record);
      if (reported !== null) {
        reportedExecutionMs += reported;
        reportedExecutionOperations++;
      }
      if (i > 0) {
        const priorEnd = records[i - 1].completed_at ?? records[i - 1].created_at;
        const gap = elapsedMs(priorEnd, record.created_at);
        if (gap !== null) betweenOperationGapMs += gap;
      }
    }

    const secondsFromStart = at => {
      const ms = elapsedMs(startedAt, at);
      return ms === null ? null : Math.round(ms / 100) / 10;
    };
    return {
      tracking_started: true,
      tracking_started_at: startedAt,
      first_detected_visual_change_at: firstChangeAt,
      seconds_to_first_detected_visual_change: secondsFromStart(firstChangeAt),
      first_subject_recognizable_at: firstSubjectAt,
      seconds_to_subject_recognizable: secondsFromStart(firstSubjectAt),
      first_subject_and_style_recognizable_at: firstSubjectStyleAt,
      seconds_to_subject_and_style_recognizable: secondsFromStart(firstSubjectStyleAt),
      recognition_feature_destruction_passes: destruction.length,
      recognition_features_lost_count: lost.length,
      recognition_features_lost: [...new Set(lost)],
      recorded_operation_ms: recordedOperationMs,
      between_operation_gap_ms: betweenOperationGapMs,
      reported_tool_execution_ms: reportedExecutionMs,
      reported_tool_execution_operations: reportedExecutionOperations,
    };
  }
  checkpointState(documentId, suppliedRecords, projectionContext) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      return { due: false, debt_points: 0, debt_limit: CHECKPOINT_DEBT_LIMIT, uncheckpointed_visual_operations: 0, age_seconds: null, reason: null };
    }
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    );
    const lastCheckpointIndex = records.findLastIndex(r => r.checkpoint);
    const uncheckpointed = records.slice(lastCheckpointIndex + 1).filter(r => r.visual);
    if (!uncheckpointed.length) {
      return { due: false, debt_points: 0, debt_limit: CHECKPOINT_DEBT_LIMIT, uncheckpointed_visual_operations: 0, age_seconds: null, reason: null };
    }
    const ageMs = (projectionContext?.capturedAt ?? Date.now()) - Date.parse(uncheckpointed[0].created_at);
    const debtPoints = uncheckpointed.reduce((sum, record) => sum + checkpointDebtPoints(record), 0);
    const due = debtPoints >= CHECKPOINT_DEBT_LIMIT;
    return {
      due,
      debt_points: debtPoints,
      debt_limit: CHECKPOINT_DEBT_LIMIT,
      uncheckpointed_visual_operations: uncheckpointed.length,
      age_seconds: Number.isFinite(ageMs) ? Math.max(0, Math.floor(ageMs / 1000)) : null,
      reason: due ? `checkpoint debt ${debtPoints}/${CHECKPOINT_DEBT_LIMIT}` : null,
    };
  }
  visualCadenceState(documentId, suppliedRecords, projectionContext) {
    const all = suppliedRecords ?? projectionContext?.records ?? this.records();
    const records = this.currentDocumentRecords(documentId, all, projectionContext);
    const metrics = this.workflowMetrics(documentId, all, projectionContext);
    const documentState = projectionContext
      ? projectionContext.paintingState.documents?.[String(documentId)]
      : this.paintingState().documents?.[String(documentId)];
    const activeJobs = projectionContext
      ? activeJobsForDocument(projectionContext.activeJobs, documentId)
      : this.activeJobs(documentId);
    const barrier = this.synchronizeVisualBarrier(documentId, all, projectionContext) ?? null;
    const checkpoint = this.checkpointState(documentId, all, projectionContext);
    const artDirector = documentState?.art_director;
    const pendingReport = records.find(r => !r.report)?.id ?? null;
    const pendingAck = records.find(r => r.operation_receipt && !r.operation_ack)?.id ?? null;
    const uncertain = records.find(r => r.phase !== 'completed' && !r.resolved)?.id ?? null;
    const lastClassifiedVisual = [...records].reverse().find(r => r.visual && r.verdict);
    const hasOpenProblem = Object.values(documentState?.visual_problems ?? {}).some(problem => problem?.status !== 'resolved');
    const activeProblemId = textOrUndefined(documentState?.active_problem?.problem_id);
    const activeProblemOpen = !!activeProblemId
      && documentState?.visual_problems?.[activeProblemId]?.status !== 'resolved';
    const continuationActive = this.workflowContinuationActive(documentState, records, lastClassifiedVisual);
    const activeVisualWorkflow = continuationActive && metrics.tracking_started && !!lastClassifiedVisual && !!(
      activeProblemOpen || hasOpenProblem || lastClassifiedVisual.verdict?.target_resolved !== 'yes'
    );
    const blockers = {
      active_job: activeJobs.at(-1)?.job_id ?? null,
      pending_report: pendingReport,
      pending_operation_ack: pendingAck,
      uncertain_operation: uncertain,
      pending_visual_barrier: barrier?.planId ?? null,
      checkpoint_due: checkpoint.due,
      planner_review_due: !!artDirector?.review_due || artDirector?.status === 'interrupted' || artDirector?.status === 'review_due',
      workflow_stall: metrics.workflow_stall,
    };
    const hasBlocker = !!(blockers.active_job || blockers.pending_report || blockers.pending_operation_ack ||
      blockers.uncertain_operation || blockers.pending_visual_barrier || blockers.checkpoint_due || blockers.planner_review_due || blockers.workflow_stall);
    const secondsSinceVerdict = ageSeconds(
      lastClassifiedVisual?.verdict?.at ?? lastClassifiedVisual?.completed_at ?? lastClassifiedVisual?.created_at,
      projectionContext?.capturedAt
    );
    const decisionLoopStall = activeVisualWorkflow
      && !hasBlocker
      && Number.isFinite(secondsSinceVerdict)
      && secondsSinceVerdict >= DECISION_LOOP_STALL_SECONDS;
    return {
      active_visual_workflow: activeVisualWorkflow,
      threshold_seconds: DECISION_LOOP_STALL_SECONDS,
      seconds_since_last_visual_verdict: secondsSinceVerdict,
      decision_loop_stall: decisionLoopStall,
      workflow_lifecycle: documentState?.workflow_lifecycle ?? {
        status: continuationActive ? 'active' : 'stopped',
        reason: continuationActive ? 'legacy_inferred_visual_continuation' : 'legacy_inferred_closed_continuation',
      },
      blockers,
      checkpoint,
    };
  }
  continuationWatchState(documentId, suppliedRecords, projectionContext) {
    const empty = {
      active_visual_workflow: false,
      threshold_seconds: SILENT_STALL_SECONDS,
      phase: 'ready',
      last_advancement_at: null,
      seconds_since_last_advancement: null,
      seconds_since_last_visual_change: null,
      silent_stall: false,
      silent_stall_reason: null,
      nonvisual_progress_stall: false,
      nonvisual_progress_stall_reason: null,
      next_required_action: 'ready',
    };
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return empty;
    const all = suppliedRecords ?? projectionContext?.records ?? this.records();
    const records = this.currentDocumentRecords(documentId, all, projectionContext);
    if (!records.length) return empty;

    const documentState = projectionContext
      ? projectionContext.paintingState.documents?.[String(documentId)]
      : this.paintingState().documents?.[String(documentId)];
    const activeJobs = projectionContext
      ? activeJobsForDocument(projectionContext.activeJobs, documentId)
      : this.activeJobs(documentId);
    const barrier = this.synchronizeVisualBarrier(documentId, all, projectionContext) ?? null;
    const checkpoint = this.checkpointState(documentId, all, projectionContext);
    const pendingReport = records.find(r => !isAbandonedRecovery(r) && !r.report);
    const pendingAck = records.find(r => !isAbandonedRecovery(r) && r.operation_receipt && !r.operation_ack);
    const uncertain = records.find(r => r.phase !== 'completed' && !r.resolved);
    const pendingVisual = records.find(r => !isAbandonedRecovery(r) && r.visual && !r.verdict);
    const latestClassifiedVisual = [...records].reverse().find(r => r.visual && r.verdict);
    const metrics = this.workflowMetrics(documentId, all, projectionContext);
    const hasOpenProblem = Object.values(documentState?.visual_problems ?? {}).some(problem => problem?.status !== 'resolved');
    const activeProblemId = textOrUndefined(documentState?.active_problem?.problem_id);
    const activeProblemOpen = !!activeProblemId
      && documentState?.visual_problems?.[activeProblemId]?.status !== 'resolved';
    const continuationActive = this.workflowContinuationActive(documentState, records, latestClassifiedVisual);
    const activeVisualWorkflow = !!pendingVisual || !!(continuationActive && latestClassifiedVisual && (
      activeProblemOpen || hasOpenProblem || latestClassifiedVisual.verdict?.target_resolved !== 'yes'
    ));
    const nextRequiredAction = this.documentNextRequiredAction(documentId, all, projectionContext);

    let phase = 'ready';
    if (activeJobs.length) phase = 'active_job';
    else if (pendingReport) phase = 'awaiting_report';
    else if (pendingAck) phase = 'awaiting_operation_ack';
    else if (uncertain) phase = 'awaiting_reconcile';
    else if (barrier) phase = 'awaiting_visual_verdict';
    else if (continuationActive && checkpoint.due) phase = 'awaiting_checkpoint';
    else if (/Art Director review required/i.test(nextRequiredAction)) phase = 'awaiting_art_director_review';
    else if (/strategy change/i.test(nextRequiredAction)) phase = 'awaiting_strategy_change';
    else if (activeVisualWorkflow && nextRequiredAction !== 'ready') phase = 'awaiting_next_visual_pass';

    const advancementTimes = [];
    for (const record of records) {
      // Ordinary reads are intentionally excluded: status/state/schema/preview churn
      // must not hide a stalled continuation loop. A required preview is counted
      // separately below only when it is the evidence attached to the live barrier.
      if (!isRead(record.tool)) {
        advancementTimes.push(record.created_at, record.completed_at);
        advancementTimes.push(record.report?.recorded_at, record.operation_ack?.acknowledged_at, record.verdict?.at);
      }
      // Reconciliation is semantic progress even when its evidence was read-only.
      advancementTimes.push(record.resolved?.at);
    }
    if (barrier?.sha256) {
      const barrierPreview = [...records].reverse().find(record => record.preview?.sha256 === barrier.sha256);
      advancementTimes.push(barrierPreview?.preview_attached_at, barrierPreview?.completed_at);
    }
    const lastAdvancementAt = latestTimestamp(advancementTimes);
    const secondsSinceAdvancement = ageSeconds(lastAdvancementAt, projectionContext?.capturedAt);
    const silentStall = activeVisualWorkflow
      && activeJobs.length === 0
      && nextRequiredAction !== 'ready'
      && Number.isFinite(secondsSinceAdvancement)
      && secondsSinceAdvancement >= SILENT_STALL_SECONDS;
    const art = documentState?.art_director;
    const unfinishedPlannerWork = !!art?.directive_id
      && art.status !== 'completed'
      && (!!art.review_due
        || art.status === 'review_due'
        || art.status === 'interrupted'
        || (art.tasks ?? []).some(task => task?.status !== 'completed'));
    const technicalClosurePending = activeJobs.length > 0
      || !!pendingReport
      || !!pendingAck
      || !!uncertain
      || !!barrier
      || !!pendingVisual;
    const secondsSinceVisualChange = metrics.seconds_since_last_visual_operation;
    const nonvisualProgressStall = continuationActive
      && unfinishedPlannerWork
      && !technicalClosurePending
      && Number.isFinite(secondsSinceVisualChange)
      && secondsSinceVisualChange >= SILENT_STALL_SECONDS;
    const nonvisualProgressStallReason = nonvisualProgressStall
      ? (art?.review_due || art?.status === 'review_due' || art?.status === 'interrupted'
        ? 'planner_review_not_followed_by_visual_pass'
        : 'unfinished_painting_without_visual_pass')
      : null;

    return {
      active_visual_workflow: activeVisualWorkflow,
      workflow_lifecycle: documentState?.workflow_lifecycle ?? {
        status: continuationActive ? 'active' : 'stopped',
        reason: continuationActive ? 'legacy_inferred_visual_continuation' : 'legacy_inferred_closed_continuation',
      },
      threshold_seconds: SILENT_STALL_SECONDS,
      phase,
      last_advancement_at: lastAdvancementAt,
      seconds_since_last_advancement: secondsSinceAdvancement,
      seconds_since_last_visual_change: secondsSinceVisualChange,
      silent_stall: silentStall,
      silent_stall_reason: silentStall ? phase : null,
      nonvisual_progress_stall: nonvisualProgressStall,
      nonvisual_progress_stall_reason: nonvisualProgressStallReason,
      next_required_action: nextRequiredAction,
    };
  }
  documentNextRequiredAction(documentId, suppliedRecords, projectionContext) {
    const all = suppliedRecords ?? projectionContext?.records ?? this.records();
    const records = this.currentDocumentRecords(documentId, all, projectionContext);
    const state = (projectionContext
      ? projectionContext.paintingState.documents?.[String(documentId)]
      : this.paintingState().documents?.[String(documentId)])
      ?? { document_id: documentId };
    const cadence = this.visualCadenceState(documentId, all, projectionContext);
    const activeJob = (projectionContext
      ? activeJobsForDocument(projectionContext.activeJobs, documentId)
      : this.activeJobs(documentId)).at(-1);
    if (activeJob) return activeJob.poll_command;
    const uncertain = records.find(r => r.phase !== 'completed' && !r.resolved);
    if (uncertain) return `reconcile uncertain operation ${uncertain.id}`;
    const pendingClosure = records.find(r => !isAbandonedRecovery(r) && r.execution !== 'not-executed' && r.phase === 'completed'
      && (!r.report || (r.operation_receipt && !r.operation_ack) || (r.visual && !r.verdict)));
    if (pendingClosure) {
      if (pendingClosure.visual && !pendingClosure.preview) {
        return `obtain recovery/required preview for ${pendingClosure.id} before compact finalization`;
      }
      if (pendingClosure.pending_review) {
        return `inspect pending multiscale review evidence for ${pendingClosure.id}, then call photoshop_guard_cycle_auto with previous_operation_id=${pendingClosure.id} + previous_observation; do not replay the artistic mutation`;
      }
      return 'call photoshop_guard_cycle_auto once with previous_operation_id=' + pendingClosure.id
        + ' + previous_observation'
        + '; include next_pass to continue or omit it to finalize the last pass';
    }
    if (state.workflow_lifecycle?.status === 'stopped'
      && state.workflow_lifecycle?.reason === 'abandoned_document_absent') {
      return 'ready';
    }
    if (state.pending_rollback) {
      const remaining = positiveHistoryStepCount(state.pending_rollback.remaining_undo_steps)
        || positiveHistoryStepCount(state.pending_rollback.required_undo_steps)
        || 1;
      return `rollback required for ${state.pending_rollback.operation_id}: ${remaining} history step${remaining === 1 ? '' : 's'} remaining; execute photoshop_undo or a VisualMicroPlan with action_class=ROLLBACK before any further visual mutation`;
    }
    const barrier = this.synchronizeVisualBarrier(documentId, all, projectionContext);
    if (barrier) return barrier.sha256
      ? 'inspect/classify preview before another visual mutation'
      : 'obtain recovery/required preview before another visual mutation';
    const art = state.art_director;
    if (art?.status === 'interrupted' || art?.status === 'review_due' || art?.review_due) {
      return `Art Director review required for directive ${art.directive_id}: ${art.review_reason ?? art.status}`;
    }
    const lastClassifiedVisual = [...records].reverse().find(r => r.visual && r.verdict);
    if (!this.workflowContinuationActive(state, records, lastClassifiedVisual)) {
      return 'ready';
    }
    const checkpoint = this.checkpointState(documentId, all, projectionContext);
    if (checkpoint.due) return 'save required checkpoint, then dispatch next meaningful visual pass';
    if (art?.status === 'completed') {
      return `Art Director directive ${art.directive_id} completed; issue the next directive or end the painting stage`;
    }
    const activeProblemId = textOrUndefined(state.active_problem?.problem_id);
    if (activeProblemId) {
      const recovery = this.artisticRecoveryForProblem(
        documentId,
        activeProblemId,
        undefined,
        records,
        projectionContext
      );
      if (recovery?.decision === 'retry_same_strategy_once') {
        return `retry bounded recovery for ${activeProblemId}; one same-strategy retry remains before a structural change is required`;
      }
      if (recovery?.decision === 'require_distinct_strategy') {
        return `make a causally distinct structural strategy change for ${activeProblemId}; parameter-only variants do not qualify`;
      }
      if (recovery?.decision === 'block_dependent_problem') {
        return `dependent artistic problem ${activeProblemId} is blocked after bounded distinct-strategy recovery; continue only independent work or return to Art Director`;
      }
    }
    const largestMustFix = this.largestOpenMustFix(state.visual_problems);
    if (largestMustFix && state.active_problem?.scale && SCALE_RANK[normalizeScale(state.active_problem.scale)] > SCALE_RANK[normalizeScale(largestMustFix.scale)]) {
      return `review whole-frame priorities; unresolved ${largestMustFix.scale} must-fix ${largestMustFix.problem_id}`;
    }
    if (cadence.decision_loop_stall) return 'decision-loop stall: dispatch next meaningful visual pass or enter explicit diagnostic mode';
    if (art?.status === 'active' && art?.directive_id) {
      return `Painter: execute bounded task ${art.current_task_id ?? 'from directive'} under directive ${art.directive_id}`;
    }
    if (cadence.active_visual_workflow) return 'dispatch next meaningful visual pass';
    return 'ready';
  }
  lock() {
    fs.mkdirSync(this.directory, { recursive: true });
    const file = path.join(this.directory, 'controller.lock');
    let fd;
    try { fd = fs.openSync(file, 'wx'); }
    catch (e) { if (e.code === 'EEXIST') throw new Error('Another controller owns the session. Use status; never start replacement work.'); throw e; }
    try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    return () => fs.unlinkSync(file);
  }
  recoverLock(file = path.join(this.directory, 'controller.lock')) {
    if (!fs.existsSync(file)) return { recovered: false };
    const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (alive(owner.pid)) throw new Error('Controller is still running; poll it, do not clear its lock');
    // No mutation is re-run. Started records remain uncertain until reconciled.
    fs.renameSync(file, `${file}.${randomUUID()}.abandoned`);
    return { recovered: true, owner, warning: 'Photoshop may still be executing. Read state/preview, then reconcile; never replay.' };
  }
  collectPreflightErrors(request, options = {}) {
    const errors = [];
    const capture = (fn) => {
      try { fn(); }
      catch (error) { errors.push(String(error?.message ?? error)); }
    };
    const add = (message) => { if (message) errors.push(message); };
    const projectionContext = options.projectionContext;
    const stateOnly = options.stateOnly === true;
    const compilerDeferredFromOperationId = textOrUndefined(options.compilerDeferredFromOperationId);
    const allowed = new Set([
      'id', 'tool', 'args', 'summary', 'purpose', 'replan', 'timeout_ms',
      'problem_id', 'region', 'hypothesis', 'failure_signals', 'significance_mode',
      'stage', 'stage_reset', 'scale', 'severity',
      'planner_directive_id', 'planner_task_id', 'painter_scope', 'change_domains',
      'affected_relations', 'affected_qualities', 'preservation_facts',
      'independent_region', 'addresses_primary_mismatch', 'addresses_problem_id',
      'preview_args', 'visual_review_profile', 'artistic_commentary', 'accepted_anchor_restore',
      'root_cause_classification', 'root_cause_reason', 'causal_level_change', 'correction_scope',
      'causal_strategy_id', 'strategy_family', 'causal_escalation_level',
      'scene_ownership_plan', 'scene_geometry_model', 'scene_lighting_color_model', 'scene_camera_imaging_model', 'color_gradient_preflight', 'imaging_preflight', 'geometry_preflight', 'cross_layer_correction',
    ]);

    if (!stateOnly) {
      for (const key of Object.keys(request ?? {})) {
        if (!allowed.has(key)) add(`Unsupported request field: ${key}`);
      }
      if (request?.args !== undefined && (!request.args || typeof request.args !== 'object' || Array.isArray(request.args))) {
        add('args must be an object');
      }
      if (request?.preview_args !== undefined && (!request.preview_args || typeof request.preview_args !== 'object' || Array.isArray(request.preview_args))) {
        add('preview_args must be an object');
      }
      if (request?.preview_args && typeof request.preview_args === 'object' && !Array.isArray(request.preview_args)
        && request.preview_args.document_id !== undefined) {
        add('preview_args.document_id is forbidden; previews always use the operation pinned document_id');
      }
      // Legacy replan text is accepted for compatibility but is not a gate.
      // Strategy changes are verified structurally below from the executable request.
      // E.7c: causal escalation is optional artistic/recovery annotation, not
      // execution authority. Admission is determined from observed failure
      // history and the executable candidate below, so even stale/legacy label
      // values must not veto an otherwise safe mutation.
    }
    const significanceMode = significanceModeOf(request ?? {});
    if (!stateOnly) {
      if (!VISUAL_SIGNIFICANCE_MODES.includes(significanceMode)) {
        add(`significance_mode must be one of ${VISUAL_SIGNIFICANCE_MODES.join(', ')}`);
      }
      capture(() => validId(request?.id));
      if (!/^photoshop_[a-z0-9_]+$/.test(request?.tool ?? '')) add('Expected a photoshop_* tool');
      for (const key of ['summary', 'purpose']) {
        if (typeof request?.[key] !== 'string' || !request[key].trim()) add(`${key} is required`);
      }
      if (request?.timeout_ms !== undefined) {
        const timeout = Number(request.timeout_ms);
        if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 180_000) {
          add('timeout_ms must be 1000..180000; split longer work');
        }
      }
    }

    const args = request?.args && typeof request.args === 'object' && !Array.isArray(request.args)
      ? request.args
      : {};
    const documentId = args.document_id;
    const documentState = (projectionContext ? projectionContext.paintingState : this.paintingState()).documents?.[String(documentId)];
    const rollbackMutation = isRollbackMutation(request);
    if (!stateOnly && isVisual(request?.tool) && !rollbackMutation) {
      const context = visualContext(request ?? {});
      const durableStage = canonicalPaintingStage(documentState?.current_stage);
      const requestedStage = canonicalPaintingStage(context.stage);
      // E.7c: stage is artistic guidance/telemetry, not execution authority.
      // A stale, unknown, or backward label must not veto an otherwise safe
      // visual mutation. Only an explicit, well-formed stage_reset may mutate
      // durable stage state backwards; persistence below ignores label-only
      // regressions.
      if (durableStage && requestedStage && isBackwardPaintingStageTransition(durableStage, requestedStage)) {
        const reset = context.stage_reset;
        const validReset = !!reset
          && canonicalPaintingStage(reset.from_stage) === durableStage
          && canonicalPaintingStage(reset.to_stage) === requestedStage
          && PAINTING_STAGE_RESET_REASONS.includes(reset.reason);
        if (reset && !validReset) {
          add(`painting_stage_reset_invalid: explicit stage_reset must match durable stage ${durableStage}, requested stage ${requestedStage}, and an allowed reason`);
        }
      } else if (context.stage_reset) {
        add(`painting_stage_reset_not_applicable: stage_reset is valid only for a backward transition from the durable stage`);
      }
    }
    if (documentState?.pending_rollback && request?.tool === 'photoshop_undo' && !request?.accepted_anchor_restore) {
      const remaining = positiveHistoryStepCount(documentState.pending_rollback.remaining_undo_steps)
        || positiveHistoryStepCount(documentState.pending_rollback.required_undo_steps)
        || 1;
      const requested = positiveHistoryStepCount(args.steps) || 1;
      if (requested !== remaining) {
        add(`rollback_undo_step_mismatch: rollback of ${documentState.pending_rollback.operation_id} requires exactly ${remaining} history step${remaining === 1 ? '' : 's'} in one photoshop_undo call; got steps=${requested}`);
      }
    }
    if (documentState?.pending_rollback && isVisual(request?.tool) && !rollbackMutation) {
      add(`rollback_required: operation ${documentState.pending_rollback.operation_id} was classified for rollback; execute photoshop_undo or a VisualMicroPlan with action_class=ROLLBACK before another visual mutation`);
    }

    const artRun = this.artRunState(documentId, projectionContext);
    if (!stateOnly) {
      if (ART_RUN_ENTRY_TOOLS.has(request?.tool) && !artRun?.process_dir) {
        add('Art project folder is not configured. Call photoshop_guard_set_art_run with processes/<subject>-process/<run-name> before the first paint mutation');
      }
      const paintingProfile = artRun?.painting_profile ?? (artRun?.process_dir ? 'nontrivial_painting' : undefined);
      if (
        artRun?.process_dir
        && paintingProfile === 'nontrivial_painting'
        && !rollbackMutation
        && (request?.tool === 'photoshop_execute_visual_microplan' || NONTRIVIAL_DIRECT_PAINT_TOOLS.has(request?.tool))
      ) {
        const brushPreflightRequired = requestRequiresBrushPreflight(request);
        if (brushPreflightRequired && !artRun.brush_preflight?.completed) {
          add('brush_preflight_required: this brush-dependent mutation is blocked until the same art run records a completed live brush_preflight from the installed Photoshop preset inventory');
        }
        if (NONTRIVIAL_DIRECT_PAINT_TOOLS.has(request?.tool)) {
          add('visual_microplan_required: non-trivial painting must route strokes, dabs and region block-in through photoshop_execute_visual_microplan so method, brush-role and stage contracts are enforced');
        }
        if ((brushPreflightRequired && artRun.brush_preflight?.completed) || requestHasBrushStrategyOrStamp(request)) {
          capture(() => validateBrushStrategyAgainstPreflight(artRun, request));
        }
      }
      // Commentary is presentation metadata, not execution authority. Artistic/mixed
      // runs may retain it for process-video/reporting surfaces, but a missing prose
      // narration must never veto an otherwise safe visual mutation (E.7c).
      if (artRun?.process_dir && (request?.tool === 'photoshop_save_document' || request?.tool === 'photoshop_export_as')) {
        capture(() => this.assertProjectSavePath(documentId, args.path));
      }
    }

    if (!stateOnly) {
      let hash;
      capture(() => { hash = fingerprint(request); });
      const existing = request?.id && idPattern.test(request.id) ? this.read(request.id) : undefined;
      if (existing) {
        if (hash && existing.hash !== hash) add('Operation id already belongs to a different request');
        if (!this.hasDurableNotExecutedProof(existing) && existing.phase !== 'completed') {
          add('Operation outcome uncertain; inspect and reconcile, never replay');
        }
        return [...new Set(errors)];
      }
    }

    const records = projectionContext?.records ?? this.records();
    const currentDocumentRecords = this.currentDocumentRecords(documentId, records, projectionContext);
    const plannedPreviousOperationId = textOrUndefined(options.plannedPreviousOperationId);
    const plannedPreviousVisualVerdict = options.plannedPreviousVisualVerdict === true;
    const recoveryRead = isRead(request?.tool);
    const unreported = records.find(r => r.id !== plannedPreviousOperationId
      && !this.hasDurableNotExecutedProof(r)
      && !isTerminalBootstrapFailure(r)
      && !isAbandonedRecovery(r)
      && r.execution !== 'not-executed'
      // An interrupted/uncertain operation must be recoverable through fresh
      // read-only evidence before report/ack/verdict closure is possible.
      // Blocking those reads on the very debt that reconciliation is meant to
      // resolve creates a recovery dead-end.
      && !(recoveryRead && !r.resolved && r.phase !== 'completed')
      && (!r.report || (r.operation_receipt && !r.operation_ack)));
    if (unreported) {
      const suffix = unreported.report && unreported.operation_receipt && !unreported.operation_ack
        ? 'Guard operation acknowledgement is still required'
        : 'emit real assistant prose, then record it with report';
      add(`Report required for ${unreported.id}: ${suffix}`);
    }
    const uncertain = records.find(r => !this.hasDurableNotExecutedProof(r) && !r.resolved && r.phase !== 'completed');
    if (uncertain && !isRead(request?.tool)) add(`Uncertain operation ${uncertain.id}: read current state/preview and reconcile first`);

    const problemId = problemIdentity(request ?? {});
    if (isVisual(request?.tool) && !rollbackMutation && !problemId) {
      add('Visual mutations require a stable problem_id so progress is measured by resolved visual problems, not tool-call count');
    }
    if (!rollbackMutation) {
      capture(() => this.plannerGate(documentId, request, projectionContext));
      capture(() => this.priorityGate(documentId, request, projectionContext));
    }
    capture(() => {
      let visualBarrier = this.visualBarrier(documentId);
      if (!visualBarrier) {
        const pending = [...currentDocumentRecords].reverse().find(r =>
          r.visual && !r.verdict
          && r.resolved?.outcome !== 'abandoned' && !this.hasDurableNotExecutedProof(r)
        );
        if (pending) {
          visualBarrier = {
            planId: this.visualPlanId(pending),
            operationId: pending.id,
            operationSequence: pending.sequence,
            ...(pending.preview?.sha256 ? { sha256: pending.preview.sha256 } : {}),
            requiresExternalPreview: !pending.preview?.sha256,
          };
        }
      }
      if (visualBarrier && plannedPreviousVisualVerdict && plannedPreviousOperationId) {
        const plannedRecord = currentDocumentRecords.find(r => r.id === plannedPreviousOperationId);
        if (plannedRecord && this.barrierOwnedByRecord(visualBarrier, plannedRecord, currentDocumentRecords)) {
          visualBarrier = undefined;
        }
      }
      if (isVisual(request?.tool) && visualBarrier) {
        const detail = visualBarrier.sha256
          ? `preview ${visualBarrier.sha256} is awaiting verdict`
          : 'a visual mutation is awaiting a verified preview and verdict';
        throw new Error(`Visual barrier for document ${documentId} (${visualBarrier.planId}): ${detail}`);
      }
    });
    if (isVisual(request?.tool) && !rollbackMutation && problemId) {
      const deferredSource = compilerDeferredFromOperationId
        ? this.read(compilerDeferredFromOperationId)
        : undefined;
      const deferredPass = compilerDeferredFromOperationId
        ? this.compilerDeferredNextPass(compilerDeferredFromOperationId)
        : undefined;
      const compilerDeferredContinuation = !!(
        deferredSource
        && deferredPass
        && Number(deferredPass.document_id) === documentId
        && textOrUndefined(deferredPass.problem_id) === problemId
        && deferredSource.current_frame_authority !== false
        && deferredSource.rolled_back !== true
      );
      const recovery = this.artisticRecoveryForProblem(
        documentId,
        problemId,
        request,
        currentDocumentRecords,
        projectionContext
      );
      const recoveryContext = visualContext(request);
      const documentState = (projectionContext ? projectionContext.paintingState : this.paintingState())
        .documents?.[String(documentId)];
      const activeTask = recoveryContext.planner_task_id
        ? documentState?.art_director?.tasks?.find(task => task?.task_id === recoveryContext.planner_task_id)
        : undefined;
      const stageExitCondition = textOrUndefined(activeTask?.construction_plan?.stage_exit_condition);
      if (
        recovery
        && stageExitCondition
        && recovery.same_primary_mismatch_count >= 2
        && recoveryContext.independent_region !== true
        && isCosmeticCorrectiveAttempt(request)
      ) {
        add(
          `causal_strategy_exhausted: problem "${problemId}" remains unresolved against construction_plan.stage_exit_condition="${stageExitCondition}" after ${recovery.same_primary_mismatch_count} same-problem attempts; attempted strategy families=${recovery.strategy_families_tried.join(', ') || 'unknown'}; revise the construction plan, structurally rebuild, or rollback/replan instead of adding dependent cosmetic/detail work`
        );
      }
      const latestSameProblem = currentDocumentRecords
        .filter(record => record.visual && problemIdentity(record) === problemId)
        .at(-1);
      const unresolvedSameProblem = currentDocumentRecords
        .filter(record => record.visual && record.verdict && problemIdentity(record) === problemId)
        .filter(record => record.verdict?.target_resolved === 'no' || record.verdict?.verdict === 'regression');
      const structuralMismatchPersists = unresolvedSameProblem.some(hasStructuralMismatchEvidence);
      const cosmeticExploratoryAttempts = unresolvedSameProblem.filter(record =>
        hasStructuralMismatchEvidence(record) && isCosmeticCorrectiveAttempt(record)
      ).length;
      if (
        structuralMismatchPersists
        && cosmeticExploratoryAttempts >= 1
        && isCosmeticCorrectiveAttempt(request)
      ) {
        add(
          `causal_strategy_exhausted: structural mismatch for problem "${problemId}" already consumed its one bounded cosmetic exploratory correction; use a causally distinct structural rebuild or rollback/replan instead of texture, edge noise, blur, grain, stamps, microdetail, or another surface-masking variant`
        );
      }
      if (!compilerDeferredContinuation && recovery?.decision === 'require_distinct_strategy'
        && !strategyChanged(request, latestSameProblem)) {
        add(`artistic_recovery: problem "${problemId}" requires a causally distinct structural strategy; color/opacity/count/preset variants do not qualify`);
      } else if (!compilerDeferredContinuation && recovery?.decision === 'block_dependent_problem') {
        const requestFingerprint = visualStrategyFingerprint(request);
        const exhausted = new Set(recovery.exhausted_strategy_ids ?? []);
        const declaredStrategy = textOrUndefined(request?.causal_strategy_id);
        const distinctCandidate = strategyChanged(request, latestSameProblem)
          || (declaredStrategy !== undefined
            && !recovery.strategy_families_tried.includes(declaredStrategy));
        const declaredStrategyExhausted = declaredStrategy !== undefined
          && recovery.strategy_families_tried.includes(declaredStrategy);
        const reusesExhaustedStrategy = declaredStrategy !== undefined
          ? declaredStrategyExhausted
          : exhausted.has(requestFingerprint);
        if (reusesExhaustedStrategy || !distinctCandidate) {
          add(`artistic_recovery: problem "${problemId}" cannot reuse an exhausted causal strategy; choose a genuinely distinct visual strategy, rollback/replan, or continue independent work`);
        }
      } else if (!compilerDeferredContinuation && recovery?.decision === 'continue_independent_work') {
        const context = visualContext(request);
        if (!(context.independent_region && context.preservation_facts.length > 0)) {
          add(`artistic_recovery: dependent problem "${problemId}" is exhausted; only explicitly independent work with preservation_facts may continue`);
        }
      }
    }
    const checkpoint = this.checkpointState(documentId, records, projectionContext);
    if (isVisual(request?.tool) && !rollbackMutation && checkpoint.due && options.deferCheckpointDebt !== true) {
      add('Checkpoint due: save a pinned layered PSD before another visual mutation');
    }

    return [...new Set(errors)];
  }
  begin(request, options = {}) {
    const projectionContext = options.projectionContext;
    const compilerDeferredFromOperationId = textOrUndefined(options.compilerDeferredFromOperationId);
    const preflightErrors = this.collectPreflightErrors(request, {
      projectionContext,
      ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
    });
    if (preflightErrors.length) throw new Error(preflightErrors[0]);
    const significanceMode = significanceModeOf(request);
    const documentId = request.args?.document_id;
    const hash = fingerprint(request);
    let existing = this.read(request.id);
    if (existing) {
      if (existing.hash !== hash) throw new Error('Operation id already belongs to a different request');
      if (this.hasDurableNotExecutedProof(existing)) {
        existing = this.finalizeDurableNotExecuted(existing, 'repeat_of_terminal_not_executed_operation');
      }
      if (existing.phase !== 'completed') throw new Error('Operation outcome uncertain; inspect and reconcile, never replay');
      return { replay: true, record: existing };
    }
    const records = (projectionContext?.records ?? this.records()).map(r => this.hasDurableNotExecutedProof(r)
      ? this.finalizeDurableNotExecuted(r, 'pre_begin_not_executed_cleanup')
      : r);
    const sequence = Math.max(0, ...records.map(r => r.sequence ?? 0)) + 1;
    let baselinePreview;
    let baselinePreviewSourceOperationId;
    if (isVisual(request.tool) && Number.isSafeInteger(documentId) && documentId > 0) {
      const state = (projectionContext ? projectionContext.paintingState : this.paintingState()).documents?.[String(documentId)];
      const frame = state?.current_frame ?? state?.accepted_frame;
      const baselineRecord = frame?.operation_id ? this.read(frame.operation_id) : undefined;
      baselinePreview = baselineRecord?.preview
        ?? (frame?.path ? { sha256: frame.sha256, materialized_path: frame.path } : undefined);
      baselinePreviewSourceOperationId = baselineRecord?.id ?? frame?.operation_id;
    }
    const record = {
      ...request,
      hash,
      sequence,
      created_at: new Date().toISOString(),
      phase: 'started',
      visual: isVisual(request.tool),
      significance_mode: significanceMode,
      ...(isVisual(request.tool) ? { comparison_specification: comparisonSpecificationForOperation(request) } : {}),
      guard_ack_required: true,
      ...(DOCUMENT_BOOTSTRAP_TOOLS.has(request.tool) ? {
        bootstrap_exact_outcome: {
          protocol: BOOTSTRAP_EXACT_OUTCOME_PROTOCOL,
          command_id: request.id,
          tool: request.tool,
        },
      } : {}),
      ...(baselinePreview ? { baseline_preview: baselinePreview } : {}),
      ...(baselinePreviewSourceOperationId ? { baseline_preview_source_operation_id: baselinePreviewSourceOperationId } : {}),
      pid: process.pid,
    };
    this.write(record); // Intent must reach disk BEFORE connecting or dispatching.
    return { replay: false, record };
  }
  markDispatched(record) {
    record.dispatched = true;
    this.write(record);
    const documentId = record.args?.document_id;
    if (!isRead(record.tool) && Number.isSafeInteger(documentId) && documentId > 0) {
      this.setWorkflowLifecycle(documentId, 'active', 'operation_dispatched', record.id);
    }
    if (record.visual && Number.isSafeInteger(documentId) && documentId > 0) {
      this.setVisualBarrier(documentId, {
        planId: this.visualPlanId(record),
        operationId: record.id,
        operationSequence: record.sequence,
        requiresExternalPreview: true,
      });
    }
    return record;
  }
  complete(record, result) {
    const bodies = parseTexts(result);
    const failed = result.isError === true || bodies.some(b => b.ok === false);
    const notExecuted = failed && bodies.some(b => b.execution === 'not-executed');
    const bootstrap = isDocumentBootstrap(record);
    const bootstrapOutcome = bootstrapOutcomeFromResult(result);
    const beforePreview = bindPreviewDocument(beforePreviewOf(result), record.args?.document_id);
    const rawPreview = bindPreviewDocument(previewOf(result), record.args?.document_id);
    const archivedPreview = rawPreview ? this.archiveProjectPreview(record, rawPreview) : undefined;
    const observedMotifInstances = record.tool === 'photoshop_execute_visual_microplan'
      ? observedMotifInstancesFromResult(result)
      : [];
    const updated = { ...record, phase: failed && !isRead(record.tool) && !notExecuted ? 'uncertain' : 'completed',
      ...(notExecuted ? { visual: false, execution: 'not-executed' } : {}),
      ...(bootstrapOutcome ? { bootstrap_outcome: bootstrapOutcome } : {}),
      ...(beforePreview ? { before_preview: beforePreview } : {}),
      ...(observedMotifInstances.length ? { observed_motif_instances: observedMotifInstances } : {}),
      completed_at: new Date().toISOString(), result, failed, preview: archivedPreview };
    if (!notExecuted && !(bootstrap && failed)) {
      updated.operation_receipt = record.operation_receipt ?? {
        protocol: OPERATION_RECEIPT_PROTOCOL,
        operation_id: record.id,
        token: randomUUID(),
        issued_at: updated.completed_at,
        phase: updated.phase,
        execution: updated.execution ?? (failed ? 'uncertain' : 'completed'),
      };
    } else {
      delete updated.operation_receipt;
      delete updated.operation_ack;
      updated.guard_ack_required = false;
    }
    if (!failed && record.tool === 'photoshop_save_document' && (record.args?.format ?? 'PSD') === 'PSD') {
      const file = record.args?.path;
      if (typeof file === 'string' && fs.existsSync(file) && fs.statSync(file).size > 0) updated.checkpoint = file;
      else { updated.phase = 'uncertain'; updated.failed = true; updated.checkpoint_error = 'PSD file was not verified on disk'; }
    }
    this.write(updated);
    if (!failed && bootstrap && Number.isSafeInteger(bootstrapOutcome?.document_id) && bootstrapOutcome.document_id > 0) {
      const documentInstanceReset = this.bindBootstrapDocumentInstance(updated, bootstrapOutcome.document_id);
      if (documentInstanceReset) {
        updated.document_instance_reset = documentInstanceReset;
        this.write(updated);
      }
    }
    const documentId = record.args?.document_id;
    if (!failed && updated.phase === 'completed'
      && record.tool === 'photoshop_close_document'
      && Number.isSafeInteger(documentId) && documentId > 0) {
      this.clearVisualBarrier(documentId);
      this.setWorkflowLifecycle(documentId, 'stopped', 'controlled_document_close', record.id);
    }
    if (!failed && isRollbackMutation(record) && Number.isSafeInteger(documentId) && documentId > 0) {
      const pendingBeforeRollback = this.paintingState().documents?.[String(documentId)]?.pending_rollback;
      this.updatePaintingState(documentId, current => {
        const pending = current.pending_rollback;
        if (!pending) return current;
        if (record.tool === 'photoshop_undo') {
          const required = positiveHistoryStepCount(pending.required_undo_steps) || 1;
          const remainingBefore = positiveHistoryStepCount(pending.remaining_undo_steps) || required;
          const applied = positiveHistoryStepCount(record.args?.steps) || 1;
          if (applied !== remainingBefore) return current;
          return this.retireRolledBackTrendEvidence({
            ...current,
            pending_rollback: undefined,
            last_rollback: {
              operation_id: record.id,
              completed_at: updated.completed_at,
              source_operation_id: pending.operation_id,
              required_undo_steps: required,
            },
          }, pending.operation_id, record.id, updated.completed_at);
        }
        return this.retireRolledBackTrendEvidence({
          ...current,
          pending_rollback: undefined,
          last_rollback: {
            operation_id: record.id,
            completed_at: updated.completed_at,
            source_operation_id: pending.operation_id,
            mode: 'explicit_visual_microplan_rollback',
          },
        }, pending.operation_id, record.id, updated.completed_at);
      });
      if (pendingBeforeRollback?.operation_id) {
        const sourceRecord = this.read(pendingBeforeRollback.operation_id);
        if (sourceRecord) {
          sourceRecord.rollback = {
            completed: true,
            rollback_operation_id: record.id,
            completed_at: updated.completed_at,
          };
          this.write(sourceRecord);
        }
      }
    }
    if (notExecuted && Number.isSafeInteger(documentId) && documentId > 0) {
      const barrier = this.visualBarrier(documentId);
      if (this.barrierOwnedByRecord(barrier, record)) this.clearVisualBarrier(documentId);
    }
    if (updated.preview && record.tool === 'photoshop_get_preview' && Number.isSafeInteger(documentId) && documentId > 0) {
      const barrier = this.visualBarrier(documentId);
      if (barrier?.requiresExternalPreview) {
        this.setVisualBarrier(documentId, {
          ...barrier,
          sha256: updated.preview.sha256,
          requiresExternalPreview: false,
        });
      }
    }
    if (!failed && updated.phase === 'completed' && updated.preview && record.visual) {
      const context = visualContext(record);
      this.updatePaintingState(documentId, current => ({
        ...current,
        ...stageResetStatePatch(current, context, record.id, updated.completed_at),
        current_frame: {
          operation_id: record.id,
          sha256: updated.preview.sha256,
          path: updated.preview.project_path ?? updated.preview.materialized_path,
          ...(updated.preview.commentary_path ? { commentary_path: updated.preview.commentary_path } : {}),
          at: updated.completed_at,
          accepted: false,
        },
        ...(() => {
          const durableStage = canonicalPaintingStage(current.current_stage);
          const requestedStage = canonicalPaintingStage(context.stage);
          if (!requestedStage || paintingStageRank(requestedStage) === undefined) return {};
          if (durableStage && isBackwardPaintingStageTransition(durableStage, requestedStage) && !context.stage_reset) return {};
          return { current_stage: requestedStage };
        })(),
        ...(context.scale ? { active_scale: context.scale } : {}),
        visual_problems: context.problem_id ? {
          ...(current.visual_problems ?? {}),
          [context.problem_id]: {
            ...(current.visual_problems?.[context.problem_id] ?? {}),
            problem_id: context.problem_id,
            ...(context.region ? { region: context.region } : {}),
            ...(context.stage ? { stage: context.stage } : {}),
            ...(context.scale ? { scale: context.scale } : {}),
            ...(context.change_domains?.length ? { change_domains: context.change_domains } : {}),
            planned: {
              ...(context.hypothesis ? { hypothesis: context.hypothesis } : {}),
              failure_signals: context.failure_signals ?? [],
            },
            severity: context.severity ?? current.visual_problems?.[context.problem_id]?.severity ?? 'should-fix',
            status: 'open',
          },
        } : current.visual_problems,
        active_problem: context.problem_id ? {
          problem_id: context.problem_id,
          ...(context.region ? { region: context.region } : {}),
          ...(context.stage ? { stage: context.stage } : {}),
          ...(context.scale ? { scale: context.scale } : {}),
          severity: context.severity ?? current.visual_problems?.[context.problem_id]?.severity ?? 'should-fix',
          status: 'open',
          planned: {
            ...(context.hypothesis ? { hypothesis: context.hypothesis } : {}),
            failure_signals: context.failure_signals ?? [],
          },
        } : current.active_problem,
        last_operation_id: record.id,
      }));
    }
    return updated;
  }
  recoverDocumentBootstrap(id, receipt, recoveredResult) {
    const record = this.read(id);
    if (!record) throw new Error(`Unknown bootstrap operation: ${id}`);
    if (!isDocumentBootstrap(record)) {
      throw new Error(`Operation ${id} is not a document bootstrap operation`);
    }
    const state = String(receipt?.state ?? '');
    const commandId = typeof receipt?.command_id === 'string' ? receipt.command_id : id;
    const at = new Date().toISOString();

    if (state === 'completed') {
      if (!recoveredResult) throw new Error('Completed bootstrap receipt requires the exact recovered public tool result');
      const bodies = parseTexts(recoveredResult);
      if (recoveredResult.isError === true || bodies.some(body => body?.ok === false)) {
        throw new Error('Completed bootstrap receipt produced a failed public tool result');
      }
      let updated = this.complete(record, recoveredResult);
      updated = {
        ...updated,
        phase: 'completed',
        failed: false,
        execution: 'completed',
        visual: false,
        bootstrap_receipt: receipt,
        resolved: {
          outcome: 'completed',
          evidence_mode: 'uxp_command_receipt',
          command_id: commandId,
          at,
        },
      };
      this.write(updated);
      return updated;
    }

    if (state === 'failed') {
      const result = recoveredResult ?? {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            code: 'uxp_bootstrap_failed',
            execution: 'failed',
            command_id: commandId,
            message: receipt?.result?.error ?? 'UXP bootstrap command completed with an error',
          }),
        }],
      };
      const updated = {
        ...record,
        phase: 'completed',
        visual: false,
        failed: true,
        execution: 'failed',
        completed_at: at,
        result,
        error: receipt?.result?.error ?? 'UXP bootstrap command completed with an error',
        bootstrap_receipt: receipt,
        guard_ack_required: false,
        resolved: {
          outcome: 'failed',
          evidence_mode: 'uxp_command_receipt',
          command_id: commandId,
          at,
        },
      };
      delete updated.operation_receipt;
      delete updated.operation_ack;
      delete updated.preview;
      this.write(updated);
      return updated;
    }

    if (state === 'not-claimed') {
      const result = {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            code: 'uxp_bootstrap_not_claimed',
            execution: 'not-executed',
            command_id: commandId,
            next_required_action: 'Submit a new guarded bootstrap operation only when UXP readiness is confirmed; the original command did not execute.',
          }),
        }],
      };
      const updated = {
        ...record,
        phase: 'completed',
        visual: false,
        failed: true,
        execution: 'not-executed',
        completed_at: at,
        result,
        bootstrap_receipt: receipt,
        guard_ack_required: false,
        not_executed_reason: 'uxp_command_receipt_not_claimed',
        resolved: {
          outcome: 'not-executed',
          evidence_mode: 'uxp_command_receipt',
          command_id: commandId,
          at,
        },
      };
      delete updated.operation_receipt;
      delete updated.operation_ack;
      delete updated.preview;
      this.write(updated);
      return updated;
    }

    throw new Error(`Bootstrap command ${commandId} is not terminal (state=${state || 'unknown'})`);
  }
  abandonDocumentBootstrap(id, evidence = {}) {
    const record = this.read(id);
    if (!record) throw new Error(`Unknown bootstrap operation: ${id}`);
    if (!isDocumentBootstrap(record)) throw new Error(`Operation ${id} is not a document bootstrap operation`);
    if (record.phase === 'completed') throw new Error(`Bootstrap operation ${id} is already terminal`);
    if (record.bootstrap_exact_outcome?.protocol === BOOTSTRAP_EXACT_OUTCOME_PROTOCOL) {
      throw new Error(
        'Exact-outcome bootstrap cannot be abandoned without a terminal durable receipt; preserve the original command identity and reconcile it'
      );
    }
    if (evidence.current_document_absence_observed !== true) {
      throw new Error('Bootstrap abandonment requires fresh current-document absence evidence');
    }
    const at = new Date().toISOString();
    const updated = {
      ...record,
      phase: 'completed',
      visual: false,
      failed: true,
      execution: 'abandoned',
      completed_at: at,
      guard_ack_required: false,
      bootstrap_outcome: {
        ...(record.bootstrap_outcome ?? {}),
        state: 'abandoned',
        command_id: record.id,
        current_document_absence_observed: evidence.current_document_absence_observed === true,
        at,
      },
      resolved: {
        outcome: 'abandoned',
        evidence_mode: 'explicit_operator_abandonment_after_current_document_absence',
        note:
          'Abandonment closes the workflow without asserting that the original bootstrap never executed. ' +
          'It only establishes that no bootstrap-created document is currently open and the operator chose not to recover/replay it.',
        at,
      },
      error:
        'Bootstrap outcome could not be proved from its durable receipt and was explicitly abandoned after current document absence was confirmed',
    };
    delete updated.operation_receipt;
    delete updated.operation_ack;
    delete updated.report;
    delete updated.preview;
    this.write(updated);
    return updated;
  }
  attachBeforePreview(id, result) {
    const record = this.read(id);
    if (!record) throw new Error('Unknown operation');
    const preview = bindPreviewDocument(previewOf(result), record.args?.document_id);
    if (!preview) throw new Error('A materialized before-preview is required');
    record.before_preview = preview;
    this.write(record);
    return preview;
  }
  attachPreview(id, result) {
    const record = this.read(id);
    if (!record) throw new Error('Unknown operation');
    const rawPreview = bindPreviewDocument(previewOf(result), record.args?.document_id);
    if (!rawPreview) throw new Error('A materialized preview is required');
    const preview = this.archiveProjectPreview(record, rawPreview);
    record.preview = preview;
    record.preview_attached_at = new Date().toISOString();
    this.write(record);
    const documentId = record.args?.document_id;
    if (Number.isSafeInteger(documentId) && documentId > 0) {
      const barrier = this.visualBarrier(documentId);
      if (this.barrierOwnedByRecord(barrier, record)) {
        this.setVisualBarrier(documentId, {
          ...barrier,
          sha256: preview.sha256,
          requiresExternalPreview: false,
        });
      }
      const context = visualContext(record);
      if (record.visual) this.updatePaintingState(documentId, current => ({
        ...current,
        current_frame: {
          operation_id: record.id,
          sha256: preview.sha256,
          path: preview.project_path ?? preview.materialized_path,
          ...(preview.commentary_path ? { commentary_path: preview.commentary_path } : {}),
          at: record.preview_attached_at,
          accepted: false,
        },
        active_problem: context.problem_id ? {
          problem_id: context.problem_id,
          ...(context.region ? { region: context.region } : {}),
          ...(context.stage ? { stage: context.stage } : {}),
          ...(context.scale ? { scale: context.scale } : {}),
          severity: context.severity ?? 'should-fix',
          status: 'open',
          planned: {
            ...(context.hypothesis ? { hypothesis: context.hypothesis } : {}),
            failure_signals: context.failure_signals ?? [],
          },
        } : current.active_problem,
        last_operation_id: record.id,
      }));
    }
    return preview;
  }
  visualSignificance(id) {
    const record = this.read(id);
    if (!record?.visual || !record.preview) return undefined;
    return assessVisualSignificance({
      before: record.before_preview ?? record.baseline_preview,
      after: record.preview,
      mode: significanceModeOf(record),
    });
  }
  normalizeReviewFindings(findings) {
    if (findings === undefined || findings === null) return [];
    if (!Array.isArray(findings)) throw new Error('review_findings must be an array');
    if (findings.length > 6) throw new Error('review_findings may contain at most 6 findings');
    const allowed = new Set(VISUAL_REVIEW_FINDING_KINDS);
    const severityRank = { 'must-fix': 0, 'should-fix': 1, optional: 2 };
    const levelRank = { composition: 0, object: 1, micro: 2 };
    const normalized = findings.map((finding, index) => {
      if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
        throw new Error(`review_findings[${index}] must be an object`);
      }
      const kind = textOrUndefined(finding.kind);
      if (!kind || !allowed.has(kind)) throw new Error(`review_findings[${index}].kind is unsupported`);
      const problemId = textOrUndefined(finding.problem_id);
      if (problemId && !idPattern.test(problemId)) {
        throw new Error(`review_findings[${index}].problem_id must be a stable 1-80 character id`);
      }
      const level = reviewLevelForFinding(kind);
      const severity = textOrUndefined(finding.severity) ?? 'should-fix';
      if (!(severity in severityRank)) {
        throw new Error(`review_findings[${index}].severity must be must-fix|should-fix|optional`);
      }
      let requestedRegion;
      if (finding.region_bounds !== undefined) {
        requestedRegion = normalizeRegion(finding.region_bounds);
      }
      if (level !== 'composition' && !requestedRegion) {
        throw new Error(`review_findings[${index}] kind=${kind} requires exact source-document region_bounds`);
      }
      if (finding.trend_signals !== undefined && !Array.isArray(finding.trend_signals)) {
        throw new Error(`review_findings[${index}].trend_signals must be an array when supplied`);
      }
      const trendSignals = findingTrendSignals(finding);
      if (Array.isArray(finding.trend_signals) && finding.trend_signals.some(signal => !normalizeTrendSignal(signal))) {
        throw new Error(`review_findings[${index}].trend_signals must contain only non-empty stable signal strings`);
      }
      const briefItemId = textOrUndefined(finding.brief_item_id);
      const briefState = textOrUndefined(finding.brief_state)?.toUpperCase();
      if ((briefItemId && !briefState) || (!briefItemId && briefState)) {
        throw new Error(`review_findings[${index}] brief_item_id and brief_state must be supplied together`);
      }
      if (briefState && !['NOT_MET', 'UNCERTAIN'].includes(briefState)) {
        throw new Error(`review_findings[${index}].brief_state must be NOT_MET|UNCERTAIN`);
      }
      return {
        kind,
        level,
        severity,
        ...(problemId ? { problem_id: problemId } : {}),
        ...(requestedRegion ? { requested_region: requestedRegion } : {}),
        ...(trendSignals.length ? { trend_signals: trendSignals } : {}),
        ...(briefItemId ? { brief_item_id: briefItemId, brief_state: briefState } : {}),
        source_index: index,
      };
    });
    return normalized.sort((a, b) => {
      const severityDelta = severityRank[a.severity] - severityRank[b.severity];
      if (severityDelta !== 0) return severityDelta;
      const optionalA = a.severity === 'optional' ? 1 : 0;
      const optionalB = b.severity === 'optional' ? 1 : 0;
      if (optionalA !== optionalB) return optionalA - optionalB;
      const levelDelta = levelRank[b.level] - levelRank[a.level];
      return levelDelta !== 0 ? levelDelta : a.source_index - b.source_index;
    });
  }
  reviewEvidenceSatisfies(record, requirement) {
    return this.reviewEvidenceState(record, requirement) === 'captured';
  }
  recordVisualDeliveryReceipt(id, delivery) {
    const record = this.read(id);
    if (!record) throw new Error(`Unknown visual operation for delivery receipt: ${id}`);
    if (!record.visual || !record.preview?.sha256) {
      throw new Error(`Visual delivery receipt requires a visual operation with a durable preview: ${id}`);
    }
    const incomingExpectedRoles = Array.isArray(delivery?.expected_roles)
      ? delivery.expected_roles.filter(role => typeof role === 'string')
      : [];
    const incomingDelivered = Array.isArray(delivery?.delivered)
      ? delivery.delivered.filter(item => item && typeof item.role === 'string' && typeof item.sha256 === 'string')
      : [];
    const previous = record.visual_delivery?.bound_whole_sha256 === record.preview.sha256
      ? record.visual_delivery
      : null;
    const expectedRoles = [...new Set([...(previous?.expected_roles ?? []), ...incomingExpectedRoles])];
    const deliveredByRole = new Map(
      (previous?.delivered ?? []).map(item => [item.role, item])
    );
    for (const item of incomingDelivered) {
      deliveredByRole.set(item.role, {
        role: item.role,
        sha256: item.sha256,
        image_delivered_for_review: item.image_delivered_for_review === true,
      });
    }
    const delivered = [...deliveredByRole.values()];
    const deliveredRoles = new Set(delivered.map(item => item.role));
    const complete = expectedRoles.length > 0 && expectedRoles.every(role => deliveredRoles.has(role));
    record.visual_delivery = {
      protocol: 'photoshop.guard.visual_delivery.v1',
      operation_id: id,
      bound_whole_sha256: record.preview.sha256,
      transport: delivery?.transport ?? 'metadata_only',
      delivery_complete: complete,
      expected_roles: expectedRoles,
      delivered,
      undelivered_roles: expectedRoles.filter(role => !deliveredRoles.has(role)),
      omitted: complete ? [] : (Array.isArray(delivery?.omitted) ? delivery.omitted : previous?.omitted ?? []),
      recorded_at: new Date().toISOString(),
      guarantee: 'mcp_image_content_delivery_to_model_facing_tool_result',
    };
    const deliveryTiming = delivery?.timing && typeof delivery.timing === 'object'
      ? delivery.timing
      : null;
    const reviewRequestAt = textOrUndefined(deliveryTiming?.request_received_at);
    const reviewReadyAt = textOrUndefined(deliveryTiming?.result_ready_at);
    if (reviewRequestAt && reviewReadyAt) {
      record.continuation_timing = {
        protocol: 'photoshop.guard.continuation_timing.v1',
        ...(record.continuation_timing ?? {}),
        review_image_request_received_at: reviewRequestAt,
        review_image_result_ready_at: reviewReadyAt,
        review_image_delivery_complete: complete,
      };
      if (record.latency) Object.assign(record.latency, continuationLatencySegments(record));
    }
    this.write(record);
    return record.visual_delivery;
  }
  recordContinuationMarker(id, phase, at = new Date().toISOString()) {
    const record = this.read(id);
    if (!record) throw new Error(`Unknown visual operation for continuation marker: ${id}`);
    if (!record.visual || !record.preview?.sha256) {
      throw new Error(`Continuation marker requires a visual operation with a durable preview: ${id}`);
    }
    if (!['review_finished', 'next_pass_ready'].includes(phase)) {
      throw new Error(`Unsupported continuation marker phase: ${phase}`);
    }
    const timing = record.continuation_timing ?? {};
    const reviewReadyAt = textOrUndefined(timing.review_image_result_ready_at);
    if (!reviewReadyAt || record.visual_delivery?.delivery_complete !== true) {
      throw new Error(`Continuation marker ${phase} requires completed explicit review-image delivery for ${id}`);
    }
    if (phase === 'review_finished') {
      if (elapsedMs(reviewReadyAt, at) === null || Date.parse(at) < Date.parse(reviewReadyAt)) {
        throw new Error('review_finished marker cannot precede review-image delivery');
      }
      record.continuation_timing = {
        protocol: 'photoshop.guard.continuation_timing.v1',
        ...timing,
        review_finished_marker_received_at: at,
      };
    } else {
      const reviewFinishedAt = textOrUndefined(timing.review_finished_marker_received_at);
      if (!reviewFinishedAt) {
        throw new Error('next_pass_ready marker requires an earlier review_finished marker');
      }
      if (elapsedMs(reviewFinishedAt, at) === null || Date.parse(at) < Date.parse(reviewFinishedAt)) {
        throw new Error('next_pass_ready marker cannot precede review_finished marker');
      }
      record.continuation_timing = {
        protocol: 'photoshop.guard.continuation_timing.v1',
        ...timing,
        next_pass_ready_marker_received_at: at,
      };
    }
    if (record.latency) Object.assign(record.latency, continuationLatencySegments(record));
    this.write(record);
    return {
      operation_id: id,
      phase,
      marker_received_at: at,
      protocol: 'photoshop.guard.continuation_timing.v1',
      marker_semantics: 'server_observed_diagnostic_boundary',
      segments: continuationLatencySegments(record),
    };
  }
  visualDeliveryDebt(record) {
    if (!record?.visual || !record?.preview?.sha256) return null;
    const receipt = record.visual_delivery;
    if (!receipt) return null;
    if (
      receipt?.protocol === 'photoshop.guard.visual_delivery.v1'
      && receipt.bound_whole_sha256 === record.preview.sha256
      && receipt.delivery_complete === true
    ) return null;
    return {
      protocol: 'photoshop.guard.visual_delivery_debt.v1',
      operation_id: record.id,
      bound_whole_sha256: record.preview.sha256,
      state: 'redelivery_required',
      expected_roles: receipt.expected_roles ?? [],
      undelivered_roles: receipt.undelivered_roles ?? [],
      omitted: receipt.omitted ?? [],
      mutation_replay_allowed: false,
    };
  }
  reviewEvidenceState(record, requirement) {
    if (requirement.level === 'composition') return 'captured';
    const documentId = record.args?.document_id;
    const wholeSha = record.preview?.sha256;
    const requested = requirement.requested_region;
    if (!requested || !wholeSha) return 'never_captured';
    const levelRank = { composition: 0, object: 1, micro: 2 };
    const initialProfileLevel = record.visual_review_profile?.level ?? 'composition';
    const initialRegion = record.preview?.focus?.region;
    let matchingEvidenceExists = false;
    if (
      initialRegion
      && levelRank[initialProfileLevel] >= levelRank[requirement.level]
      && regionContains(initialRegion, requested)
    ) {
      matchingEvidenceExists = true;
      if (materializedEvidenceMatches(record.preview?.focus)) return 'captured';
    }
    for (const evidence of record.review_evidence ?? []) {
      const matchesRequirement = (
      evidence.document_id === documentId
      && evidence.bound_whole_sha256 === wholeSha
      && levelRank[evidence.review_level] >= levelRank[requirement.level]
      && evidence.effective_region
      && regionContains(evidence.effective_region, requested)
      );
      if (!matchesRequirement) continue;
      matchingEvidenceExists = true;
      if (materializedEvidenceMatches(evidence)) return 'captured';
    }
    return matchingEvidenceExists ? 'artifact_missing_or_corrupt' : 'never_captured';
  }
  uncertaintyReviewRequirement(raw, targetResolved) {
    if (raw === undefined || raw === null) return null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('uncertainty_review must be an object');
    }
    if (targetResolved === 'yes') {
      throw new Error('uncertainty_review cannot accompany target_resolved=yes');
    }
    const afterLevel = textOrUndefined(raw.after_level)?.toLowerCase();
    if (!['composition', 'object'].includes(afterLevel)) {
      throw new Error('uncertainty_review.after_level must be composition|object');
    }
    if (afterLevel === 'composition') {
      if (raw.region_bounds === undefined) {
        throw new Error('composition uncertainty escalation requires exact uncertainty_review.region_bounds');
      }
      return {
        kind: 'runtime_uncertainty',
        level: 'object',
        severity: 'should-fix',
        requested_region: normalizeRegion(raw.region_bounds),
        source_index: -200,
        source: 'runtime_uncertainty',
      };
    }
    if (raw.tighter_region_bounds === undefined) {
      throw new Error('object uncertainty escalation requires exact uncertainty_review.tighter_region_bounds');
    }
    const tighter = normalizeRegion(raw.tighter_region_bounds);
    if (raw.region_bounds !== undefined) {
      const objectRegion = normalizeRegion(raw.region_bounds);
      if (!regionContains(objectRegion, tighter)) {
        throw new Error('uncertainty_review.tighter_region_bounds must stay inside region_bounds');
      }
    }
    return {
      kind: 'runtime_uncertainty',
      level: 'micro',
      severity: 'should-fix',
      requested_region: tighter,
      source_index: -200,
      source: 'runtime_uncertainty',
    };
  }
  planReviewEscalation(id, findings = [], options = {}) {
    const record = this.read(id);
    if (!record) throw new Error(`Unknown previous_operation_id: ${id}`);
    if (!record.visual || !record.preview) {
      return { required: false, operation_id: id, captures: [], requirements: [] };
    }
    const documentId = record.args?.document_id;
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      throw new Error('Review escalation requires a positive pinned document_id');
    }
    const canvasWidth = Number(record.preview.canvas_width);
    const canvasHeight = Number(record.preview.canvas_height);
    const mechanicalPatterning = analyzeMechanicalPatterning(record);
    const synthetic = options.context_only === true ? [] : mechanicalPatterning.triggered
      ? this.normalizeReviewFindings(mechanicalPatterning.findings).map((item, index) => ({
          ...item,
          source_index: -100 + index,
          source: 'guard_mechanical_patterning',
        }))
      : [];
    const contextRegion = options.context_review_region === undefined
      ? null
      : normalizeRegion(options.context_review_region);
    const contextRequirement = contextRegion ? [{
      kind: 'micro_context',
      level: 'object',
      severity: 'should-fix',
      requested_region: contextRegion,
      source_index: -250,
      source: 'direct_micro_context',
    }] : [];
    const incoming = this.normalizeReviewFindings(findings).map((item, index) => ({
      ...item,
      source_index: 100 + index,
      source: 'visual_verdict',
    }));
    const uncertaintyRequirement = this.uncertaintyReviewRequirement(
      options.uncertainty_review,
      textOrUndefined(options.target_resolved)?.toLowerCase()
    );
    const uncertaintyDriven = uncertaintyRequirement ? [uncertaintyRequirement] : [];
    const durable = Array.isArray(record.pending_review?.requirements)
      ? record.pending_review.requirements.map((item, index) => ({
          ...item,
          source_index: Number.isSafeInteger(item.source_index) ? item.source_index : 200 + index,
        }))
      : [];
    const all = [...durable, ...contextRequirement, ...uncertaintyDriven, ...synthetic, ...incoming];
    const merged = [];
    for (const requirement of all) {
      if (requirement.level === 'composition') continue;
      const requested = requirement.requested_region;
      const duplicateIndex = merged.findIndex(existing =>
        existing.requested_region
        && requested
        && overlapRatioAgainstSmaller(existing.requested_region, requested) >= 0.6
      );
      if (duplicateIndex < 0) {
        merged.push({ ...requirement });
        continue;
      }
      const current = merged[duplicateIndex];
      const levelRank = { object: 1, micro: 2 };
      const severityRank = { 'must-fix': 0, 'should-fix': 1, optional: 2 };
      const currentRequested = current.requested_region;
      const tighterUncertaintyStep = current.source === 'runtime_uncertainty'
        && requirement.source === 'runtime_uncertainty'
        && levelRank[requirement.level] > levelRank[current.level];
      current.requested_region = tighterUncertaintyStep
        ? requested
        : {
            left: Math.min(currentRequested.left, requested.left),
            top: Math.min(currentRequested.top, requested.top),
            right: Math.max(currentRequested.right, requested.right),
            bottom: Math.max(currentRequested.bottom, requested.bottom),
          };
      if (levelRank[requirement.level] > levelRank[current.level]) {
        current.level = requirement.level;
        current.kind = requirement.kind;
      }
      if (severityRank[requirement.severity] < severityRank[current.severity]) {
        current.severity = requirement.severity;
      }
      const combinedTrendSignals = [...new Set([
        ...(current.trend_signals ?? []),
        ...(requirement.trend_signals ?? []),
      ])];
      if (combinedTrendSignals.length) current.trend_signals = combinedTrendSignals;
      current.source_index = Math.min(current.source_index, requirement.source_index);
    }
    for (const requirement of merged) {
      requirement.requirement_id = fingerprint({
        source_operation_id: id,
        review_level: requirement.level,
        finding_kind: requirement.kind,
        requested_region: requirement.requested_region,
      });
    }
    const unresolved = merged.filter(requirement => !this.reviewEvidenceSatisfies(record, requirement));
    const captureSequenceBase = Math.max(
      Number.isSafeInteger(record.review_capture_sequence) ? record.review_capture_sequence : 0,
      ...(record.review_evidence ?? [])
        .map(evidence => Number.isSafeInteger(evidence.capture_sequence) ? evidence.capture_sequence : 0)
    );
    const captures = unresolved.slice(0, 2).map((requirement, captureIndex) => {
      if (!Number.isFinite(canvasWidth) || canvasWidth <= 0 || !Number.isFinite(canvasHeight) || canvasHeight <= 0) {
        throw new Error('Review escalation requires current preview canvas dimensions');
      }
      const regions = padRegion(
        requirement.requested_region,
        { width: canvasWidth, height: canvasHeight },
        requirement.level
      );
      return {
        ...requirement,
        ...regions,
        role: `${requirement.level}_after_${captureIndex + 1}`,
        capture_sequence: captureSequenceBase + captureIndex + 1,
        capture_id: `capture-${String(captureSequenceBase + captureIndex + 1).padStart(4, '0')}-${requirement.requirement_id.slice(0, 16)}`,
        focus_max_dimension_px: requirement.level === 'micro' ? 1600 : 1200,
      };
    });
    const requirements = merged.map(requirement => {
      const evidenceState = this.reviewEvidenceState(record, requirement);
      return {
        ...requirement,
        status: evidenceState === 'captured' ? 'captured' : 'pending',
        evidence_state: evidenceState,
      };
    });
    const required = captures.length > 0;
    const plan = {
      required,
      operation_id: id,
      document_id: documentId,
      bound_whole_sha256: record.preview.sha256,
      required_review_level: requirements.some(item => item.level === 'micro') ? 'micro'
        : requirements.some(item => item.level === 'object') ? 'object' : 'composition',
      captures,
      requirements,
      remaining_after_round: Math.max(0, unresolved.length - captures.length),
    };
    if (options.persist === true && (requirements.length || record.pending_review)) {
      if (mechanicalPatterning.triggered) {
        record.mechanical_patterning = mechanicalPatterning;
      }
      record.pending_review = {
        operation_id: id,
        document_id: documentId,
        bound_whole_sha256: record.preview.sha256,
        required_review_level: plan.required_review_level,
        requirements,
        state: required ? 'capturing' : 'awaiting_observation',
        ...(uncertaintyRequirement ? {
          trigger: 'runtime_uncertainty',
          uncertainty_after_level: textOrUndefined(options.uncertainty_review?.after_level)?.toLowerCase(),
        } : {}),
        ...(contextRegion ? { context_region_source: 'exact_object_context_region_bounds' } : {}),
        updated_at: new Date().toISOString(),
      };
      if (captures.length) {
        record.review_capture_sequence = captureSequenceBase + captures.length;
      }
      this.write(record);
    }
    return plan;
  }
  attachReviewEvidence(id, capture, preview) {
    const record = this.read(id);
    if (!record?.visual || !record.preview) throw new Error(`Visual operation ${id} is unavailable for review evidence`);
    const documentId = record.args?.document_id;
    if (preview?.document_id !== undefined && preview.document_id !== documentId) {
      throw new Error(`Review evidence document_id ${preview.document_id} does not match pinned document ${documentId}`);
    }
    if (preview?.sha256 !== record.preview.sha256) {
      throw new Error('Review evidence is stale: current whole-frame SHA changed during read-only escalation');
    }
    const focus = preview?.focus;
    if (!focus?.sha256 || !focus?.materialized_path || !focus?.region) {
      throw new Error('Review escalation did not return a materialized focus crop');
    }
    if (!materializedEvidenceMatches(focus)) {
      throw new Error('Review evidence crop file is missing or its SHA does not match the materialized bytes');
    }
    const normalizedEffective = normalizeRegion(capture.effective_region);
    const actual = normalizeRegion(focus.region);
    if (JSON.stringify(actual) !== JSON.stringify(normalizedEffective)) {
      throw new Error('Review evidence crop region does not match the requested effective source-document region');
    }
    const canvasWidth = Number(preview.canvas_width ?? record.preview.canvas_width);
    const canvasHeight = Number(preview.canvas_height ?? record.preview.canvas_height);
    if (!Number.isFinite(canvasWidth) || canvasWidth <= 0 || !Number.isFinite(canvasHeight) || canvasHeight <= 0) {
      throw new Error('Review evidence requires positive source canvas_width/canvas_height provenance');
    }
      const evidence = {
      source_operation_id: id,
      requirement_id: capture.requirement_id,
      capture_id: capture.capture_id,
      capture_sequence: capture.capture_sequence,
      role: capture.role,
        finding_kind: capture.kind,
        ...(capture.brief_item_id ? { brief_item_id: capture.brief_item_id } : {}),
        ...(capture.brief_state ? { brief_state: capture.brief_state } : {}),
        severity: capture.severity,
      review_level: capture.level,
      requested_region: normalizeRegion(capture.requested_region),
      effective_region: actual,
      document_id: documentId,
      canvas_width: canvasWidth,
      canvas_height: canvasHeight,
      bound_whole_sha256: record.preview.sha256,
      sha256: focus.sha256,
      materialized_path: focus.materialized_path,
      mime_type: focus.mime_type ?? 'image/jpeg',
      width: focus.width ?? null,
      height: focus.height ?? null,
      scale: {
        x: focus.scale_x ?? null,
        y: focus.scale_y ?? null,
      },
      resolution_policy: 'native-or-downsampled-no-new-detail-by-upscaling',
      materialized_for_review: true,
      captured_at: new Date().toISOString(),
    };
    evidence.artifact_id = fingerprint({
      source_operation_id: id,
      requirement_id: evidence.requirement_id,
      capture_id: evidence.capture_id,
      sha256: evidence.sha256,
    });
    record.review_evidence ??= [];
    const existingCapture = record.review_evidence.find(existing => existing.capture_id === evidence.capture_id);
    if (existingCapture) {
      if (
        existingCapture.artifact_id === evidence.artifact_id
        && existingCapture.materialized_path === evidence.materialized_path
        && materializedEvidenceMatches(existingCapture)
      ) return existingCapture;
      throw new Error(`Review evidence capture_id ${evidence.capture_id} is already bound to a different artifact`);
    }
    record.review_evidence.push(evidence);
    if (record.pending_review) {
      record.pending_review.requirements = (record.pending_review.requirements ?? []).map(requirement => {
        const evidenceState = this.reviewEvidenceState(
          { ...record, review_evidence: record.review_evidence },
          requirement
        );
        return {
          ...requirement,
          status: evidenceState === 'captured' ? 'captured' : 'pending',
          evidence_state: evidenceState,
        };
      });
      record.pending_review.state = record.pending_review.requirements.every(item => item.status === 'captured')
        ? 'awaiting_observation'
        : 'pending_more_evidence';
      record.pending_review.updated_at = new Date().toISOString();
    }
    this.write(record);
    return evidence;
  }
  compactClosureDefaults(id) {
    const record = this.read(id);
    if (!record) return {};
    const bodies = parseTexts(record.result);
    const bodySummary = bodies
      .map(body => typeof body?.summary === 'string' ? body.summary.trim() : '')
      .find(Boolean);
    const fallbackResult = JSON.stringify(bodies).slice(0, 700);
    const result = bodySummary
      || (fallbackResult.length >= 4 ? fallbackResult : 'Recorded execution completed.');
    return {
      ...(!record.report ? {
        previous_report: {
          did: `Executed ${record.tool}: ${textOrUndefined(record.summary) ?? record.id}`,
          why: textOrUndefined(record.purpose) ?? 'Complete the recorded guarded operation.',
          result,
        },
      } : {}),
      ...(record.operation_receipt && !record.operation_ack ? {
        previous_operation_ack: {
          protocol: OPERATION_ACK_PROTOCOL,
          token: record.operation_receipt.token,
        },
      } : {}),
    };
  }
  compactPassContext(documentId, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return {};
    const paintingState = projectionContext ? projectionContext.paintingState : this.paintingState();
    const records = projectionContext?.records ?? this.records();
    const state = paintingState.documents?.[String(documentId)] ?? {};
    const brush = state.brush_preflight;
    const art = state.art_director;
    const logicalLayerOwners = this.semanticLayerOwners(documentId, records, projectionContext);
    const sceneOwnershipPlan = this.sceneOwnershipPlan(documentId, records, projectionContext);
    const sceneGeometryModel = this.sceneGeometryModel(documentId, records, projectionContext);
    const sceneLightingColorModel = this.sceneLightingColorModel(documentId, records, projectionContext);
    const sceneCameraImagingModel = this.sceneCameraImagingModel(documentId, records, projectionContext);
    const geometryPreflight = this.geometryPreflight(documentId, records, projectionContext);
    const recentBrushByProblem = new Map();
    const recentBrushUsage = [];
    for (const record of this.currentDocumentRecords(documentId, records, projectionContext)) {
      if (record?.phase !== 'completed' || record?.tool !== 'photoshop_execute_visual_microplan') continue;
      const problemId = problemIdentity(record);
      const presetName = textOrUndefined(record?.args?.paint_strategy?.preset_name);
      if (!problemId || !presetName) continue;
      const outcome = record.rolled_back === true
        ? 'rolled-back'
        : record.failed === true
          ? 'failed'
          : record.verdict?.disposition === 'rollback'
            ? 'rollback-required'
            : record.verdict?.disposition === 'accept' ? 'accepted' : 'other';
      const materialRole = textOrUndefined(record?.args?.paint_strategy?.material_role);
      const brushRole = textOrUndefined(record?.args?.paint_strategy?.brush_role);
      recentBrushByProblem.set(problemId, {
        problem_id: problemId,
        preset_name: presetName,
        outcome,
        operation_id: record.id,
        sequence: record.sequence ?? null,
      });
      recentBrushUsage.push({
        problem_id: problemId,
        preset_name: presetName,
        material_role: materialRole ?? null,
        brush_role: brushRole ?? null,
        outcome,
        operation_id: record.id,
        sequence: record.sequence ?? null,
      });
    }
    return {
      stage: textOrUndefined(state.current_stage),
      scale: textOrUndefined(state.active_scale),
      painting_profile: textOrUndefined(state.painting_profile),
      has_visual_frame: !!state.current_frame?.operation_id,
      active_problem_id: textOrUndefined(state.active_problem?.problem_id),
      active_problem_scale: textOrUndefined(state.active_problem?.scale),
      brush_roles: Array.isArray(brush?.roles)
        ? brush.roles.map(role => ({
            role_id: role.role_id,
            material_roles: Array.isArray(role.material_roles) ? [...role.material_roles] : [],
            visual_intents: Array.isArray(role.visual_intents) ? [...role.visual_intents] : [],
            preferred_preset: role.preferred_preset,
            alternative_presets: Array.isArray(role.alternative_presets) ? [...role.alternative_presets] : [],
            candidate_evidence: Array.isArray(role.candidate_evidence) ? structuredClone(role.candidate_evidence) : [],
            working_scale: role.working_scale,
            pressure_policy: role.pressure_policy,
            probe_status: role.probe_status,
            profile_id: role.profile_id ?? null,
          }))
        : [],
      brush_inventory_scope: brush?.inventory_scope ?? null,
      recent_brush_problem_usage: [...recentBrushByProblem.values()].slice(-24),
      recent_brush_usage: recentBrushUsage.slice(-48),
      logical_layer_owners: logicalLayerOwners,
      scene_ownership_plan: sceneOwnershipPlan,
      scene_geometry_model: sceneGeometryModel,
      scene_lighting_color_model: sceneLightingColorModel,
      scene_camera_imaging_model: sceneCameraImagingModel,
      geometry_preflight: geometryPreflight,
      geometry_binding_states: this.geometryBindingStates(documentId, records, projectionContext),
      geometry_completion_debt: this.geometryCompletionDebt(documentId, records, projectionContext),
      lighting_color_binding_states: this.lightingColorBindingStates(documentId, records, projectionContext),
      physical_effect_completion_debt: this.physicalEffectCompletionDebt(documentId, records, projectionContext),
      camera_binding_states: this.cameraBindingStates(documentId, records, projectionContext),
      attention_binding_states: this.attentionBindingStates(documentId, records, projectionContext),
      document_incarnation_id: this.currentDocumentIncarnationId(documentId, projectionContext),
      brush_pack_policy: state.brush_pack_policy ?? null,
      art_director: art?.directive_id ? {
        directive_id: art.directive_id,
        current_task_id: art.current_task_id ?? null,
        status: art.status ?? null,
        review_due: !!art.review_due,
          brush_pack_scene_plan: art.brush_pack_scene_plan ?? null,
          style_contract: art.style_contract ?? null,
          perceptual_hierarchy: art.perceptual_hierarchy ?? null,
          unresolved_hard_brief_debt: this.unresolvedHardBriefDebt(documentId, projectionContext),
        tasks: Array.isArray(art.tasks)
          ? art.tasks.map(task => ({
              task_id: task.task_id,
              summary: task.summary,
              status: task.status,
              allowed_scales: Array.isArray(task.allowed_scales) ? [...task.allowed_scales] : [],
              allowed_global_changes: Array.isArray(task.allowed_global_changes) ? [...task.allowed_global_changes] : [],
              ...(Array.isArray(task.affected_relations) && task.affected_relations.length
                ? { affected_relations: [...task.affected_relations] }
                : {}),
              ...(Array.isArray(task.affected_qualities) && task.affected_qualities.length
                ? { affected_qualities: [...task.affected_qualities] }
                : {}),
              ...(Array.isArray(task.perceptual_zone_ids) ? { perceptual_zone_ids: [...task.perceptual_zone_ids] } : {}),
              ...(task.construction_plan ? { construction_plan: structuredClone(task.construction_plan) } : {}),
            }))
          : [],
      } : null,
    };
  }
  artisticContinuationContext(documentId) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return {};
    const state = this.paintingState().documents?.[String(documentId)] ?? {};
    const art = state.art_director;
    const tasks = Array.isArray(art?.tasks) ? art.tasks : [];
    const currentTaskId = textOrUndefined(art?.current_task_id);
    const currentTask = currentTaskId
      ? tasks.find(task => textOrUndefined(task?.task_id) === currentTaskId)
      : undefined;
    const nextTask = tasks.find(task => task !== currentTask && task?.status === 'pending');
    const activeProblem = state.active_problem?.status === 'resolved' ? undefined : state.active_problem;
    const protectedQualities = Array.isArray(art?.artistic_evaluation_contract?.protected_qualities)
      ? art.artistic_evaluation_contract.protected_qualities.map(value => textOrUndefined(value)).filter(Boolean)
      : [];
    const hierarchyZones = Array.isArray(art?.perceptual_hierarchy?.zones)
      ? art.perceptual_hierarchy.zones
      : [];
    const ownerIdsForTask = task => {
      if (!task || !Array.isArray(task.perceptual_zone_ids)) return [];
      const zoneIds = new Set(task.perceptual_zone_ids.map(value => textOrUndefined(value)).filter(Boolean));
      return [...new Set(hierarchyZones
        .filter(zone => zoneIds.has(textOrUndefined(zone?.id)))
        .flatMap(zone => Array.isArray(zone?.owner_ids) ? zone.owner_ids : [])
        .map(value => textOrUndefined(value))
        .filter(Boolean))];
    };
    const projectTask = task => {
      if (!task) return null;
      const taskId = textOrUndefined(task.task_id);
      if (!taskId) return null;
      const ownerIds = ownerIdsForTask(task);
      return {
        directive_id: textOrUndefined(art?.directive_id) ?? null,
        task_id: taskId,
        summary: textOrUndefined(task.summary) ?? null,
        allowed_scales: Array.isArray(task.allowed_scales) ? [...task.allowed_scales] : [],
        allowed_global_changes: Array.isArray(task.allowed_global_changes) ? [...task.allowed_global_changes] : [],
        ...(Array.isArray(task.affected_relations) && task.affected_relations.length
          ? { affected_relations: [...task.affected_relations] }
          : {}),
        ...(Array.isArray(task.affected_qualities) && task.affected_qualities.length
          ? { affected_qualities: [...task.affected_qualities] }
          : {}),
        ...(ownerIds.length ? { owner_ids: ownerIds } : {}),
      };
    };
    const owners = this.semanticLayerOwners(documentId).map(owner => ({
      owner_id: owner.hypothesis_id,
      ...(textOrUndefined(owner.physical_role) ? { role: owner.physical_role } : {}),
      ...(Number.isSafeInteger(owner.layer_id) && owner.layer_id > 0 ? { layer_id: owner.layer_id } : {}),
    }));
    const nextCandidates = [];
    const currentRecords = this.currentDocumentRecords(documentId, this.records())
      .filter(record => record?.phase === 'completed' && record?.current_frame_authority !== false && record?.rolled_back !== true)
      .sort((a, b) => Number(a?.sequence ?? 0) - Number(b?.sequence ?? 0));
    const deferredRecord = [...currentRecords].reverse().find(record => {
      const deferred = record?.latency?.compiler_repair_audit?.deferred_next_pass;
      return deferred && typeof deferred === 'object' && !Array.isArray(deferred);
    });
    const deferredPass = deferredRecord?.latency?.compiler_repair_audit?.deferred_next_pass;
    const projectedCurrentTask = projectTask(currentTask);
    if (projectedCurrentTask) {
      nextCandidates.push({
        candidate_id: 'A',
        kind: 'continue-current-task',
        ...projectedCurrentTask,
        ...(textOrUndefined(activeProblem?.problem_id) ? { problem_id: activeProblem.problem_id } : {}),
      });
    }
    const projectedNextTask = projectTask(nextTask);
    if (projectedNextTask) {
      nextCandidates.push({
        candidate_id: 'B',
        kind: 'next-planner-task',
        ...projectedNextTask,
      });
    }
    if (textOrUndefined(activeProblem?.problem_id)) {
      nextCandidates.push({
        candidate_id: 'C',
        kind: 'correct-current-problem',
        problem_id: activeProblem.problem_id,
        ...(textOrUndefined(activeProblem.scale) ? { scale: activeProblem.scale } : {}),
        ...(textOrUndefined(activeProblem.severity) ? { severity: activeProblem.severity } : {}),
        ...(textOrUndefined(activeProblem.stage) ? { stage: activeProblem.stage } : {}),
      });
    }
    if (deferredPass && typeof deferredPass === 'object' && !Array.isArray(deferredPass)) {
      const deferredLogicalLayer = deferredPass.logical_layer && typeof deferredPass.logical_layer === 'object'
        && !Array.isArray(deferredPass.logical_layer)
        ? deferredPass.logical_layer
        : undefined;
      nextCandidates.push({
        candidate_id: 'D',
        kind: 'compiler-deferred-sub-pass',
        deferred_from_operation_id: deferredRecord.id,
        problem_id: textOrUndefined(deferredPass.problem_id) ?? null,
        goal: textOrUndefined(deferredPass.goal) ?? null,
        visual_intent: textOrUndefined(deferredPass.visual_intent) ?? null,
        action_class: textOrUndefined(deferredPass.action_class) ?? null,
        action_count: Array.isArray(deferredPass.actions) ? deferredPass.actions.length : 0,
        ...(textOrUndefined(deferredLogicalLayer?.hypothesis_id)
          ? { target_owner_id: textOrUndefined(deferredLogicalLayer.hypothesis_id) }
          : {}),
        requires_post_review_confirmation: true,
      });
    }
    return {
      document_id: documentId,
      current_stage: textOrUndefined(state.current_stage),
      active_scale: textOrUndefined(state.active_scale),
      current_problem: activeProblem && textOrUndefined(activeProblem.problem_id) ? {
        problem_id: activeProblem.problem_id,
        ...(textOrUndefined(activeProblem.scale) ? { scale: activeProblem.scale } : {}),
        ...(textOrUndefined(activeProblem.severity) ? { severity: activeProblem.severity } : {}),
      } : null,
      owners,
      current_task: projectedCurrentTask,
      next_candidates: nextCandidates,
      protected_qualities: protectedQualities,
    };
  }
  compilerDeferredNextPass(operationId) {
    const id = textOrUndefined(operationId);
    if (!id) return undefined;
    const record = this.read(id);
    const deferred = record?.latency?.compiler_repair_audit?.deferred_next_pass;
    return deferred && typeof deferred === 'object' && !Array.isArray(deferred)
      ? structuredClone(deferred)
      : undefined;
  }
  semanticLayerOwners(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return [];
    const byHypothesis = new Map();
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    )
      .sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));

    const removeLayer = layerId => {
      if (!Number.isSafeInteger(layerId) || layerId <= 0) return;
      for (const [hypothesisId, owner] of byHypothesis.entries()) {
        const stack = Array.isArray(owner.physical_layer_ids)
          ? owner.physical_layer_ids.filter(id => Number.isSafeInteger(id) && id > 0 && id !== layerId)
          : (owner.layer_id === layerId ? [] : [owner.layer_id].filter(id => Number.isSafeInteger(id) && id > 0));
        if (!stack.length) {
          byHypothesis.delete(hypothesisId);
          continue;
        }
        if (owner.layer_id === layerId) owner.layer_id = stack[stack.length - 1];
        owner.physical_layer_ids = stack;
      }
    };

    const reconcileObservedLayers = record => {
      if (record.phase !== 'completed' || record.failed || record.tool !== 'photoshop_get_layers') return;
      const bodies = parseTexts(record.result);
      const body = bodies.find(item => item && typeof item === 'object' && !Array.isArray(item));
      if (!body || !Array.isArray(body.layers)) return;
      const observed = new Set();
      const visit = rows => {
        for (const row of rows) {
          const id = Number(row?.id ?? row?.layer_id);
          if (Number.isSafeInteger(id) && id > 0) observed.add(id);
          const children = Array.isArray(row?.layers) ? row.layers : Array.isArray(row?.children) ? row.children : [];
          visit(children);
        }
      };
      visit(body.layers);
      for (const owner of byHypothesis.values()) {
        const stack = (Array.isArray(owner.physical_layer_ids) ? owner.physical_layer_ids : [owner.layer_id])
          .filter(id => Number.isSafeInteger(id) && id > 0 && observed.has(id));
        if (!stack.length) {
          byHypothesis.delete(owner.hypothesis_id);
          continue;
        }
        if (!observed.has(owner.layer_id)) owner.layer_id = stack[stack.length - 1];
        owner.physical_layer_ids = stack;
      }
    };

    for (const record of records) {
      // Rolled-back visual operations are historical evidence, not current-frame
      // ownership authority. In particular, a rolled-back cross-layer migration
      // must not move the authoritative semantic binding on resume/restart.
      if (record.rolled_back === true || record.current_frame_authority === false) continue;
      reconcileObservedLayers(record);
      if (record.phase === 'completed' && !record.failed && record.tool === 'photoshop_delete_layer') {
        removeLayer(Number(record.args?.layer_id));
        continue;
      }
      if (record.phase === 'completed' && !record.failed && record.tool === 'photoshop_merge_layer_down') {
        removeLayer(Number(record.args?.layer_id));
        continue;
      }
      if (record.execution === 'not-executed') continue;
      const crossLayerCorrection = record?.cross_layer_correction;
      if (record.phase === 'completed' && !record.failed
        && crossLayerCorrection?.mode === 'migration') {
        const hypothesisId = Array.isArray(record?.correction_scope?.semantic_owner_ids)
          ? textOrUndefined(record.correction_scope.semantic_owner_ids[0])
          : undefined;
        const postLayerId = Number(crossLayerCorrection.post_authoritative_layer_id);
        const owner = hypothesisId ? byHypothesis.get(hypothesisId) : undefined;
        if (owner && Number.isSafeInteger(postLayerId) && postLayerId > 0
          && Array.isArray(owner.physical_layer_ids) && owner.physical_layer_ids.includes(postLayerId)) {
          owner.layer_id = postLayerId;
          owner.source_operation_id = record.id;
        }
      }
      for (const body of parseTexts(record.result)) {
        const rows = Array.isArray(body?.continuation_layers) ? body.continuation_layers : [];
        for (const row of rows) {
          const hypothesisId = textOrUndefined(row?.hypothesis_id);
          const layerId = Number(row?.layer_id);
          if (!hypothesisId || !Number.isSafeInteger(layerId) || layerId <= 0) continue;
          const prior = byHypothesis.get(hypothesisId);
          const physicalLayerIds = [
            ...(Array.isArray(prior?.physical_layer_ids) ? prior.physical_layer_ids : []),
            ...(Number.isSafeInteger(prior?.layer_id) && prior.layer_id > 0 ? [prior.layer_id] : []),
            layerId,
          ].filter((id, index, all) => Number.isSafeInteger(id) && id > 0 && all.indexOf(id) === index);
          const temporary = typeof row?.temporary === 'boolean'
            ? row.temporary
            : prior?.temporary === true;
          const structuralDomains = new Set([
            'composition', 'large-value', 'silhouette', 'depth-structure', 'local-shape', 'likeness-main-shape',
          ]);
          const changeDomains = Array.isArray(body?.change_domains)
            ? body.change_domains.map(domain => textOrUndefined(domain)?.toLowerCase()).filter(Boolean)
            : [];
          const structuralRevision = !prior || row?.construction_change === true || changeDomains.some(domain => structuralDomains.has(domain))
            ? record.id
            : prior.construction_revision;
          byHypothesis.set(hypothesisId, {
            hypothesis_id: hypothesisId,
            layer_id: layerId,
            physical_layer_ids: physicalLayerIds,
            ...(textOrUndefined(row?.layer_name) ? { layer_name: row.layer_name.trim() } : {}),
            ...(textOrUndefined(row?.hypothesis) ? { hypothesis: row.hypothesis.trim() } : {}),
            ...(textOrUndefined(row?.rollback_value) ? { rollback_value: row.rollback_value.trim() } : {}),
            ...(textOrUndefined(row?.physical_role) ? { physical_role: row.physical_role.trim() } : {}),
            ...(textOrUndefined(row?.opacity_role) ? { opacity_role: row.opacity_role.trim() } : {}),
            ...(textOrUndefined(row?.construction_tier) ? { construction_tier: row.construction_tier.trim() } : {}),
            ...(textOrUndefined(row?.parent_hypothesis_id) ? { parent_hypothesis_id: row.parent_hypothesis_id.trim() } : {}),
            ...(textOrUndefined(row?.parent_construction_revision) ? { parent_construction_revision: row.parent_construction_revision.trim() } : {}),
            ...(row?.negative_space && typeof row.negative_space === 'object' && !Array.isArray(row.negative_space)
              ? { negative_space: structuredClone(row.negative_space) }
              : prior?.negative_space ? { negative_space: structuredClone(prior.negative_space) } : {}),
            ...(row?.causal_effect && typeof row.causal_effect === 'object' && !Array.isArray(row.causal_effect)
              ? { causal_effect: structuredClone(row.causal_effect) }
              : prior?.causal_effect ? { causal_effect: structuredClone(prior.causal_effect) } : {}),
            ...(row?.surface_frame && typeof row.surface_frame === 'object' && !Array.isArray(row.surface_frame)
              ? { surface_frame: structuredClone(row.surface_frame) }
              : prior?.surface_frame ? { surface_frame: structuredClone(prior.surface_frame) } : {}),
            ...(row?.geometry_binding && typeof row.geometry_binding === 'object' && !Array.isArray(row.geometry_binding)
              ? { geometry_binding: structuredClone(row.geometry_binding) }
              : prior?.geometry_binding ? { geometry_binding: structuredClone(prior.geometry_binding) } : {}),
            ...(row?.camera_binding && typeof row.camera_binding === 'object' && !Array.isArray(row.camera_binding)
              ? { camera_binding: structuredClone(row.camera_binding) }
              : prior?.camera_binding ? { camera_binding: structuredClone(prior.camera_binding) } : {}),
            ...(row?.attention_binding && typeof row.attention_binding === 'object' && !Array.isArray(row.attention_binding)
              ? { attention_binding: structuredClone(row.attention_binding) }
              : prior?.attention_binding ? { attention_binding: structuredClone(prior.attention_binding) } : {}),
            ...(textOrUndefined(structuralRevision) ? { construction_revision: structuralRevision } : {}),
            ...(Array.isArray(row?.depth_relations) ? {
              depth_relations: row.depth_relations
                .filter(relation => relation && typeof relation === 'object' && !Array.isArray(relation))
                .map(relation => ({
                  relation: textOrUndefined(relation.relation),
                  target_hypothesis_id: textOrUndefined(relation.target_hypothesis_id),
                }))
                .filter(relation => relation.relation && relation.target_hypothesis_id),
            } : {}),
            temporary,
            ...(textOrUndefined(row?.decision) ? { decision: row.decision.trim() } : {}),
            source_operation_id: record.id,
          });
        }
      }
    }
    return [...byHypothesis.values()].sort((a, b) => a.hypothesis_id.localeCompare(b.hypothesis_id));
  }
  frameParentOperationId(record) {
    return textOrUndefined(record?.verdict?.recovery?.anchor_operation_id)
      ?? textOrUndefined(record?.frame_parent_operation_id)
      ?? textOrUndefined(record?.baseline_preview_source_operation_id);
  }
  currentFrameAncestry(current, records = this.records()) {
    const headId = textOrUndefined(current?.current_frame?.operation_id);
    if (!headId) return null;
    const byId = new Map(records.map(record => [record.id, record]));
    if (!byId.has(headId)) return null;
    const ancestry = new Set();
    let cursor = headId;
    while (cursor && !ancestry.has(cursor)) {
      ancestry.add(cursor);
      const record = byId.get(cursor);
      if (!record) break;
      cursor = this.frameParentOperationId(record);
    }
    return ancestry;
  }
  recordHasCurrentFrameAuthority(record, current = undefined, records = undefined) {
    if (!record
      || record.rollback?.completed === true
      || record.rolled_back === true
      || record.current_frame_authority === false) return false;
    if (!current) return true;
    const ancestry = this.currentFrameAncestry(current, records ?? this.records());
    // Legacy journals may not have a resolvable current-frame head. Preserve
    // their explicit authority semantics rather than guessing ancestry.
    if (!ancestry) return true;
    // Records that predate durable frame-parent capture also remain legacy.
    // Once a record participates in the lineage graph, however, it must be an
    // ancestor of the exact current frame to retain perceptual authority.
    const participatesInLineage = ancestry.has(record.id)
      || !!this.frameParentOperationId(record)
      || [...ancestry].some(id => this.frameParentOperationId((records ?? this.records()).find(row => row.id === id)) === record.id);
    return !participatesInLineage || ancestry.has(record.id);
  }
  reconcileTrendEvidenceToCurrentFrame(current, records = this.records()) {
    const problems = { ...(current.visual_problems ?? {}) };
    const recordsById = new Map(records.map(record => [record.id, record]));
    let changed = false;
    for (const [problemId, problem] of Object.entries(problems)) {
      if (!problemId.startsWith('cumulative-trend-') || !problem || typeof problem !== 'object') continue;
      const sources = Array.isArray(problem.source_operations) ? problem.source_operations : [];
      const liveSources = sources.filter(id => this.recordHasCurrentFrameAuthority(recordsById.get(id), current, records));
      if (liveSources.length === sources.length) continue;
      const live = new Set(liveSources);
      const supportingEvidence = Array.isArray(problem.supporting_evidence)
        ? problem.supporting_evidence.filter(row => live.has(row?.operation_id)) : [];
      const supportingRegions = Array.isArray(problem.supporting_regions)
        ? problem.supporting_regions.filter(row => live.has(row?.operation_id)) : [];
      const supports = liveSources.map(id => recordsById.get(id)).filter(Boolean)
        .map(record => trendSupportForRecord(record, problem.trend_signal));
      const stillSupported = liveSources.length >= trendRepeatLimit(problem.trend_signal, supports);
      problems[problemId] = {
        ...problem,
        source_operations: liveSources,
        supporting_evidence: supportingEvidence,
        supporting_regions: supportingRegions,
        trend_count: liveSources.length,
        ...(stillSupported ? {} : {
          status: 'resolved',
          resolution_epoch: Number(problem.resolution_epoch ?? 0) + 1,
          resolution_at: new Date().toISOString(),
          resolution_reason: 'source_evidence_non_ancestral',
        }),
      };
      changed = true;
    }
    if (!changed) return current;
    const primaryBlocker = this.primaryBlockingProblem(problems);
    return {
      ...current,
      visual_problems: problems,
      active_problem: primaryBlocker ?? undefined,
      priority_review_required: false,
    };
  }
  reconcileDerivedProblemEvidenceToCurrentFrame(current, records = this.records()) {
    const problems = { ...(current.visual_problems ?? {}) };
    const recordsById = new Map(records.map(record => [record.id, record]));
    let changed = false;
    for (const [problemId, problem] of Object.entries(problems)) {
      if (problemId.startsWith('cumulative-trend-') || !problem || typeof problem !== 'object') continue;
      const sourceIds = [
        ...(Array.isArray(problem.source_operations) ? problem.source_operations : []),
        ...(typeof problem.source_operation_id === 'string' ? [problem.source_operation_id] : []),
        ...(typeof problem.observed?.operation_id === 'string' ? [problem.observed.operation_id] : []),
      ].filter((id, index, all) => typeof id === 'string' && all.indexOf(id) === index);
      if (!sourceIds.length) continue;
      const liveSources = sourceIds.filter(id => this.recordHasCurrentFrameAuthority(recordsById.get(id), current, records));
      if (liveSources.length === sourceIds.length) continue;
      const live = new Set(liveSources);
      const supportingEvidence = Array.isArray(problem.supporting_evidence)
        ? problem.supporting_evidence.filter(row => live.has(row?.operation_id)) : problem.supporting_evidence;
      const supportingRegions = Array.isArray(problem.supporting_regions)
        ? problem.supporting_regions.filter(row => live.has(row?.operation_id)) : problem.supporting_regions;
      const hasIndependentLiveSupport = liveSources.length > 0;
      problems[problemId] = {
        ...problem,
        ...(Array.isArray(problem.source_operations) ? { source_operations: liveSources } : {}),
        ...(problem.source_operation_id && !live.has(problem.source_operation_id) ? { source_operation_id: undefined } : {}),
        ...(supportingEvidence ? { supporting_evidence: supportingEvidence } : {}),
        ...(supportingRegions ? { supporting_regions: supportingRegions } : {}),
        ...(!hasIndependentLiveSupport && problem.status !== 'resolved' ? {
          status: 'resolved',
          resolution_epoch: Number(problem.resolution_epoch ?? 0) + 1,
          resolution_at: new Date().toISOString(),
          resolution_reason: 'source_evidence_non_ancestral',
        } : {}),
      };
      changed = true;
    }
    if (!changed) return current;
    const primaryBlocker = this.primaryBlockingProblem(problems);
    return {
      ...current,
      visual_problems: problems,
      active_problem: primaryBlocker ?? undefined,
      priority_review_required: false,
    };
  }
  currentDocumentIncarnationId(documentId, projectionContext = undefined) {
    const state = projectionContext ? projectionContext.paintingState : this.paintingState();
    const instance = state.documents?.[String(documentId)]?.document_instance;
    const witness = normalizeDocumentInstanceWitness(instance?.host_witness);
    return textOrUndefined(witness?.token) ?? textOrUndefined(instance?.bootstrap_operation_id) ?? null;
  }
  sceneGeometryModel(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    let current = null;
    for (const record of records) {
      if (!record?.scene_geometry_model) continue;
      try {
        const model = normalizeSceneGeometryModel(record.scene_geometry_model);
        const incarnation = this.currentDocumentIncarnationId(documentId, projectionContext);
        if (model.source_frame.document_id !== documentId) continue;
        if (!incarnation || model.source_frame.document_incarnation !== incarnation) continue;
        if (current) {
          if (model.model_id !== current.model_id || model.revision <= current.revision) continue;
        }
        current = {
          ...model,
          source_operation_id: record.id,
          source_sequence: record.sequence ?? null,
        };
      } catch {
        continue;
      }
    }
    return current;
  }
  sceneLightingColorModel(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    const incarnation = this.currentDocumentIncarnationId(documentId, projectionContext);
    let current = null;
    for (const record of records) {
      if (!record?.scene_lighting_color_model) continue;
      try {
        const model = normalizeSceneLightingColorModel(record.scene_lighting_color_model);
        if (model.source_frame.document_id !== documentId) continue;
        if (!incarnation || model.source_frame.document_incarnation !== incarnation) continue;
        if (current && (model.model_id !== current.model_id || model.revision <= current.revision)) continue;
        current = { ...model, source_operation_id: record.id, source_sequence: record.sequence ?? null };
      } catch {
        continue;
      }
    }
    return current;
  }
  sceneCameraImagingModel(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    const incarnation = this.currentDocumentIncarnationId(documentId, projectionContext);
    let current = null;
    for (const record of records) {
      if (!record?.scene_camera_imaging_model) continue;
      try {
        const model = normalizeSceneCameraImagingModel(record.scene_camera_imaging_model);
        if (model.source_frame.document_id !== documentId) continue;
        if (!incarnation || model.source_frame.document_incarnation !== incarnation) continue;
        if (current && (model.model_id !== current.model_id || model.revision <= current.revision)) continue;
        current = { ...model, source_operation_id: record.id, source_sequence: record.sequence ?? null };
      } catch {
        continue;
      }
    }
    return current;
  }
  sceneCameraImagingModelRevision(documentId, modelId, revision, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0 || !modelId || !Number.isSafeInteger(revision) || revision <= 0) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    const incarnation = this.currentDocumentIncarnationId(documentId, projectionContext);
    let match = null;
    for (const record of records) {
      if (!record?.scene_camera_imaging_model) continue;
      try {
        const model = normalizeSceneCameraImagingModel(record.scene_camera_imaging_model);
        if (model.source_frame.document_id !== documentId) continue;
        if (!incarnation || model.source_frame.document_incarnation !== incarnation) continue;
        if (model.model_id !== modelId || model.revision !== revision) continue;
        match = model;
      } catch {
        continue;
      }
    }
    return match;
  }
  cameraBindingStates(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    const records = suppliedRecords ?? projectionContext?.records ?? this.records();
    const current = this.sceneCameraImagingModel(documentId, records, projectionContext);
    if (!current) return [];
    const geometryStates = new Map(
      this.geometryBindingStates(documentId, records, projectionContext).map(state => [state.owner_id, state])
    );
    return this.semanticLayerOwners(documentId, records, projectionContext)
      .filter(owner => owner?.camera_binding && typeof owner.camera_binding === 'object' && !Array.isArray(owner.camera_binding))
      .map(owner => {
        try {
          const binding = normalizeCameraBinding(owner.camera_binding);
          const source = binding.sceneCameraRevision === current.revision
            ? current
            : this.sceneCameraImagingModelRevision(documentId, binding.sceneCameraModelId, binding.sceneCameraRevision, records, projectionContext);
          const cameraState = cameraBindingStaleness(binding, current, source);
          const geometryState = binding.geometryBindingOwnerId ? geometryStates.get(binding.geometryBindingOwnerId) : undefined;
          const geometryStale = binding.geometryBindingOwnerId ? geometryState?.stale !== false : false;
          const changed = [...new Set([
            ...cameraState.changed_dependency_ids,
            ...(geometryStale ? ['geometry'] : []),
          ])].sort();
          return {
            owner_id: owner.hypothesis_id,
            binding_revision: binding.sceneCameraRevision,
            current_revision: current.revision,
            stale: cameraState.stale || geometryStale,
            reason: cameraState.stale ? cameraState.reason : geometryStale ? 'geometry_dependency_stale' : 'current',
            changed_dependency_ids: changed,
          };
        } catch (error) {
          return {
            owner_id: owner.hypothesis_id,
            binding_revision: null,
            current_revision: current.revision,
            stale: true,
            reason: 'invalid_binding',
            changed_dependency_ids: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
      .sort((a, b) => String(a.owner_id).localeCompare(String(b.owner_id)));
  }
  attentionBindingStates(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    const paintingState = projectionContext ? projectionContext.paintingState : this.paintingState();
    const art = paintingState.documents?.[String(documentId)]?.art_director;
    if (!art?.perceptual_hierarchy) return [];
    let current;
    try {
      current = normalizePerceptualHierarchy(art.perceptual_hierarchy);
    } catch {
      return [];
    }
    const history = Array.isArray(art.perceptual_hierarchy_history)
      ? art.perceptual_hierarchy_history.map(entry => {
          try { return normalizePerceptualHierarchy(entry); } catch { return null; }
        }).filter(Boolean)
      : [];
    return this.semanticLayerOwners(documentId, suppliedRecords, projectionContext)
      .filter(owner => owner?.attention_binding && typeof owner.attention_binding === 'object' && !Array.isArray(owner.attention_binding))
      .map(owner => {
        try {
          const binding = normalizeAttentionBinding(owner.attention_binding);
          const source = binding.hierarchyRevision === current.revision
            ? current
            : history.find(item => item.revision === binding.hierarchyRevision) ?? null;
          const state = attentionBindingStaleness(binding, current, source);
          const currentZone = current.zones.find(zone => zone.id === binding.zoneId);
          const ownerStillInZone = !!currentZone?.owner_ids?.includes(owner.hypothesis_id);
          return {
            owner_id: owner.hypothesis_id,
            zone_id: binding.zoneId,
            binding_revision: binding.hierarchyRevision,
            current_revision: current.revision,
            stale: state.stale || !ownerStillInZone,
            reason: state.stale ? state.reason : ownerStillInZone ? 'current' : 'zone_owner_allocation_changed',
            changed_dependency_ids: state.stale
              ? state.changed_dependency_ids
              : ownerStillInZone ? [] : [`zone:${binding.zoneId}`],
          };
        } catch (error) {
          return {
            owner_id: owner.hypothesis_id,
            zone_id: null,
            binding_revision: null,
            current_revision: current.revision,
            stale: true,
            reason: 'invalid_binding',
            changed_dependency_ids: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
      .sort((a, b) => String(a.owner_id).localeCompare(String(b.owner_id)));
  }
  sceneLightingColorModelRevision(documentId, modelId, revision, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0 || !modelId || !Number.isSafeInteger(revision) || revision <= 0) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    const incarnation = this.currentDocumentIncarnationId(documentId, projectionContext);
    let match = null;
    for (const record of records) {
      if (!record?.scene_lighting_color_model) continue;
      try {
        const model = normalizeSceneLightingColorModel(record.scene_lighting_color_model);
        if (model.source_frame.document_id !== documentId) continue;
        if (!incarnation || model.source_frame.document_incarnation !== incarnation) continue;
        if (model.model_id !== modelId || model.revision !== revision) continue;
        match = model;
      } catch {
        continue;
      }
    }
    return match;
  }
  lightingColorBindingStates(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    const current = this.sceneLightingColorModel(documentId, records, projectionContext);
    if (!current) return [];
    const currentGeometry = this.sceneGeometryModel(documentId, records, projectionContext);
    const byOwner = new Map();
    for (const record of records) {
      if (record?.rolled_back === true || record?.current_frame_authority === false) continue;
      if (record?.phase !== 'completed' || record?.failed || record?.tool !== 'photoshop_execute_visual_microplan') continue;
      const ownerId = textOrUndefined(record?.args?.logical_layer?.hypothesis_id);
      const rawMaterial = record?.args?.material_response;
      if (!ownerId || !rawMaterial) continue;
      try {
        const binding = normalizeMaterialResponsePlan(rawMaterial).lightingColorBinding;
        if (binding) byOwner.set(ownerId, binding);
      } catch {
        // Invalid historical material evidence cannot become current binding authority.
      }
    }
    return [...byOwner.entries()].map(([ownerId, binding]) => {
      const source = binding.sceneModelRevision === current.revision
        ? current
        : this.sceneLightingColorModelRevision(documentId, binding.sceneModelId, binding.sceneModelRevision, records, projectionContext);
      const lightingState = lightingColorBindingStaleness(binding, current, source);
      const spatial = binding.spatialRelation;
      if (!spatial) {
        return {
          owner_id: ownerId,
          binding_revision: binding.sceneModelRevision,
          current_revision: current.revision,
          ...lightingState,
        };
      }
      let spatialChanged = [];
      let spatialReason = 'current';
      if (!currentGeometry || spatial.sceneGeometryModelId !== currentGeometry.model_id) {
        spatialReason = 'model_identity_changed';
        spatialChanged = ['__projection__'];
      } else if (spatial.sceneGeometryRevision !== currentGeometry.revision) {
        const sourceGeometry = this.sceneGeometryModelRevision(
          documentId,
          spatial.sceneGeometryModelId,
          spatial.sceneGeometryRevision,
          records,
          projectionContext
        );
        if (!sourceGeometry) {
          spatialReason = 'source_revision_unavailable';
        } else {
          const changed = changedSceneGeometryDependencyIds(sourceGeometry, currentGeometry);
          const dependencies = new Set(spatial.dependencyIds);
          spatialChanged = changed.filter(id => id === '__projection__' || dependencies.has(id));
          if (spatialChanged.length) spatialReason = 'dependency_changed';
        }
      }
      const stale = lightingState.stale || spatialReason !== 'current';
      const changedDependencyIds = [...new Set([
        ...lightingState.changed_dependency_ids,
        ...spatialChanged,
      ])].sort();
      return {
        owner_id: ownerId,
        binding_revision: binding.sceneModelRevision,
        current_revision: current.revision,
        stale,
        reason: lightingState.stale ? lightingState.reason : spatialReason,
        changed_dependency_ids: changedDependencyIds,
        spatial_relation: {
          binding_geometry_revision: spatial.sceneGeometryRevision,
          current_geometry_revision: currentGeometry?.revision ?? null,
          stale: spatialReason !== 'current',
          reason: spatialReason,
          changed_dependency_ids: spatialChanged,
        },
      };
    }).sort((a, b) => String(a.owner_id).localeCompare(String(b.owner_id)));
  }
  sceneGeometryModelRevision(documentId, modelId, revision, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0 || !modelId || !Number.isSafeInteger(revision) || revision <= 0) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    const incarnation = this.currentDocumentIncarnationId(documentId, projectionContext);
    let match = null;
    for (const record of records) {
      if (!record?.scene_geometry_model) continue;
      try {
        const model = normalizeSceneGeometryModel(record.scene_geometry_model);
        if (model.source_frame.document_id !== documentId) continue;
        if (!incarnation || model.source_frame.document_incarnation !== incarnation) continue;
        if (model.model_id !== modelId || model.revision !== revision) continue;
        match = model;
      } catch {
        continue;
      }
    }
    return match;
  }
  geometryBindingStates(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    const records = suppliedRecords ?? projectionContext?.records ?? this.records();
    const current = this.sceneGeometryModel(documentId, records, projectionContext);
    if (!current) return [];
    return this.semanticLayerOwners(documentId, records, projectionContext)
      .filter(owner => owner?.geometry_binding && typeof owner.geometry_binding === 'object' && !Array.isArray(owner.geometry_binding))
      .map(owner => {
        try {
          const binding = normalizeGeometryBinding(owner.geometry_binding);
          const source = binding.scene_geometry_revision === current.revision
            ? current
            : this.sceneGeometryModelRevision(documentId, binding.scene_geometry_model_id, binding.scene_geometry_revision, records, projectionContext);
          return {
            owner_id: owner.hypothesis_id,
            binding_revision: binding.scene_geometry_revision,
            current_revision: current.revision,
            exact_geometry_completion_relevant: binding.exact_geometry_completion_relevant,
            ...geometryBindingStaleness(binding, current, source),
          };
        } catch (error) {
          return {
            owner_id: owner.hypothesis_id,
            binding_revision: null,
            current_revision: current.revision,
            stale: true,
            reason: 'invalid_binding',
            changed_dependency_ids: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
      .sort((a, b) => String(a.owner_id).localeCompare(String(b.owner_id)));
  }
  geometryCompletionDebt(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    const records = suppliedRecords ?? projectionContext?.records ?? this.records();
    const scene = this.sceneGeometryModel(documentId, records, projectionContext);
    if (!scene) return [];
    if (scene.applicability === 'insufficient_evidence') {
      return [{
        code: 'scene_geometry_insufficient_evidence',
        owner_id: null,
        scene_geometry_model_id: scene.model_id,
        scene_geometry_revision: scene.revision,
        reason: 'Scene Geometry Model still reports insufficient evidence for committed completion.',
      }];
    }
    if (scene.applicability !== 'coherent_3d') return [];
    const stateByOwner = new Map(this.geometryBindingStates(documentId, records, projectionContext).map(state => [state.owner_id, state]));
    return this.semanticLayerOwners(documentId, records, projectionContext).flatMap(owner => {
      if (!owner?.geometry_binding || typeof owner.geometry_binding !== 'object' || Array.isArray(owner.geometry_binding)) return [];
      try {
        const binding = normalizeGeometryBinding(owner.geometry_binding);
        if (!binding.exact_geometry_completion_relevant) return [];
        const state = stateByOwner.get(owner.hypothesis_id);
        if (!state || state.stale) {
          return [{
            code: 'geometry_completion_binding_stale',
            owner_id: owner.hypothesis_id,
            scene_geometry_model_id: scene.model_id,
            scene_geometry_revision: scene.revision,
            reason: state?.reason ?? 'binding_state_missing',
            changed_dependency_ids: state?.changed_dependency_ids ?? [],
          }];
        }
        const preflight = runGeometryPreflight(binding, scene);
        const blockingIssues = preflight.issues.filter(issue =>
          issue.code === 'geometry_exact_evidence_required'
          || issue.code === 'geometry_exact_evidence_source_mismatch'
          || issue.code === 'geometry_dependency_stale'
        );
        return blockingIssues.length ? [{
          code: 'geometry_completion_preflight_failed',
          owner_id: owner.hypothesis_id,
          scene_geometry_model_id: scene.model_id,
          scene_geometry_revision: scene.revision,
          reason: blockingIssues.map(issue => issue.message).join('; '),
          issue_codes: blockingIssues.map(issue => issue.code),
        }] : [];
      } catch (error) {
        return [{
          code: 'geometry_completion_binding_invalid',
          owner_id: owner.hypothesis_id,
          scene_geometry_model_id: scene.model_id,
          scene_geometry_revision: scene.revision,
          reason: error instanceof Error ? error.message : String(error),
        }];
      }
    });
  }
  physicalEffectCompletionDebt(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    const records = suppliedRecords ?? projectionContext?.records ?? this.records();
    const owners = this.semanticLayerOwners(documentId, records, projectionContext);
    const sceneLighting = this.sceneLightingColorModel(documentId, records, projectionContext);
    const lightingStates = new Map(
      this.lightingColorBindingStates(documentId, records, projectionContext).map(state => [state.owner_id, state])
    );
    const translucentOpacity = new Set(['transmissive', 'transparent-overlay', 'effect-only']);
    const effectRoles = new Set(['transmissive-surface', 'cast-shadow', 'surface-condition', 'optical-effect', 'atmosphere', 'camera-post', 'other']);
    const lightingCausalRoles = new Set(['transmissive-surface', 'cast-shadow', 'surface-condition', 'optical-effect', 'atmosphere']);
    return owners.flatMap(owner => {
      const physicalRole = textOrUndefined(owner?.physical_role)?.toLowerCase();
      const opacityRole = textOrUndefined(owner?.opacity_role)?.toLowerCase();
      const materiallyTranslucent = translucentOpacity.has(opacityRole) || effectRoles.has(physicalRole);
      if (!materiallyTranslucent) return [];
      if (!physicalRole || physicalRole === 'other') {
        return [{
          code: 'physical_effect_role_unexplained', owner_id: owner.hypothesis_id,
          physical_role: physicalRole ?? null, opacity_role: opacityRole ?? null,
          reason: 'Persistent translucent/effect owner lacks a concrete physical or perceptual role.',
        }];
      }
      if (translucentOpacity.has(opacityRole) && ['opaque-mass', 'support-surface'].includes(physicalRole)) {
        return [{
          code: 'physical_effect_opacity_role_conflict', owner_id: owner.hypothesis_id,
          physical_role: physicalRole, opacity_role: opacityRole,
          reason: 'A persistent translucent/effect opacity cannot masquerade as an opaque/support mass at completion.',
        }];
      }
      if (sceneLighting && lightingCausalRoles.has(physicalRole)) {
        const state = lightingStates.get(owner.hypothesis_id);
        if (!state) {
          return [{
            code: 'physical_effect_lighting_binding_missing', owner_id: owner.hypothesis_id,
            physical_role: physicalRole, opacity_role: opacityRole ?? null,
            reason: `Physical role ${physicalRole} is lighting/material-causal but has no current E.19 binding.`,
          }];
        }
        if (state.stale) {
          return [{
            code: 'physical_effect_lighting_binding_stale', owner_id: owner.hypothesis_id,
            physical_role: physicalRole, opacity_role: opacityRole ?? null,
            reason: state.reason,
            changed_dependency_ids: state.changed_dependency_ids ?? [],
          }];
        }
      }
      return [];
    });
  }
  geometryPreflight(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
    const scene = this.sceneGeometryModel(documentId, suppliedRecords, projectionContext);
    if (!scene) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    let current = null;
    for (const record of records) {
      const raw = record?.geometry_preflight;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      if (raw.protocol !== GEOMETRY_PREFLIGHT_PROTOCOL) continue;
      if (raw.scene_geometry_model_id !== scene.model_id || raw.scene_geometry_revision !== scene.revision) continue;
      if (raw.source_frame?.document_id !== documentId) continue;
      if (raw.source_frame?.document_incarnation !== scene.source_frame.document_incarnation) continue;
      current = {
        ...structuredClone(raw),
        source_operation_id: record.id,
        source_sequence: record.sequence ?? null,
      };
    }
    return current;
  }
  sceneOwnershipPlan(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    ).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    for (const record of records) {
      if (!record?.scene_ownership_plan) continue;
      try {
        return {
          ...normalizeSceneOwnershipPlan(record.scene_ownership_plan),
          source_operation_id: record.id,
          source_sequence: record.sequence ?? null,
        };
      } catch {
        // A malformed historical record must not be reinterpreted as a valid
        // ownership plan. Compiler/status will continue fail-closed as if no
        // durable plan exists rather than inventing semantic ownership.
        return null;
      }
    }
    return null;
  }
  retireRolledBackTrendEvidence(current, sourceOperationId, rollbackOperationId, completedAt) {
    const problems = { ...(current.visual_problems ?? {}) };
    let changed = false;
    let survivingTrendProblem;
    for (const [problemId, problem] of Object.entries(problems)) {
      if (!problemId.startsWith('cumulative-trend-') || !problem || typeof problem !== 'object') continue;
      const sources = Array.isArray(problem.source_operations) ? problem.source_operations : [];
      if (!sources.includes(sourceOperationId)) continue;
      const remainingSources = sources.filter(id => id !== sourceOperationId);
      const remainingEvidence = Array.isArray(problem.supporting_evidence)
        ? problem.supporting_evidence.filter(row => row?.operation_id !== sourceOperationId)
        : [];
      const remainingRegions = Array.isArray(problem.supporting_regions)
        ? problem.supporting_regions.filter(row => row?.operation_id !== sourceOperationId)
        : [];
      const requiredSupportCount = problem.promotion_reason === 'whole_frame_global_evidence'
        ? 1
        : TREND_SIGNAL_REPEAT_LIMIT;
      const stillSupported = remainingSources.length >= requiredSupportCount;
      problems[problemId] = {
        ...problem,
        source_operations: remainingSources,
        supporting_evidence: remainingEvidence,
        supporting_regions: remainingRegions,
        trend_count: remainingSources.length,
        ...(stillSupported ? {} : {
          status: 'resolved',
          resolution_epoch: Number(problem.resolution_epoch ?? 0) + 1,
          resolution_at: completedAt,
          resolution_reason: 'source_evidence_rolled_back',
          retired_source_operation_id: sourceOperationId,
          retired_by_rollback_operation_id: rollbackOperationId,
        }),
      };
      if (stillSupported) survivingTrendProblem = problems[problemId];
      changed = true;
    }
    if (!changed) return current;
    const primaryBlocker = this.primaryBlockingProblem(problems);
    return {
      ...current,
      visual_problems: problems,
      active_problem: primaryBlocker ?? undefined,
      priority_review_required: false,
      cumulative_trend_guard: {
        ...(current.cumulative_trend_guard ?? {}),
        triggered: !!survivingTrendProblem,
        ...(survivingTrendProblem ? {
          problem_id: survivingTrendProblem.problem_id,
          signal: survivingTrendProblem.trend_signal,
          count: survivingTrendProblem.trend_count,
          source_operations: survivingTrendProblem.source_operations,
        } : {}),
        retired_source_operation_id: sourceOperationId,
        retired_by_rollback_operation_id: rollbackOperationId,
      },
    };
  }
  physicalStackOwnerSignature(documentId, suppliedRecords = undefined, projectionContext = undefined) {
    const owners = this.semanticLayerOwners(documentId, suppliedRecords, projectionContext)
      .filter(owner => PHYSICAL_STACK_SIGNATURE_ROLES.has(textOrUndefined(owner.physical_role)?.toLowerCase()))
      .map(owner => ({
        hypothesis_id: owner.hypothesis_id,
        physical_role: textOrUndefined(owner.physical_role)?.toLowerCase() ?? null,
        opacity_role: textOrUndefined(owner.opacity_role)?.toLowerCase() ?? null,
        depth_relations: Array.isArray(owner.depth_relations)
          ? owner.depth_relations
              .map(relation => ({
                relation: textOrUndefined(relation?.relation)?.toLowerCase() ?? null,
                target_hypothesis_id: textOrUndefined(relation?.target_hypothesis_id) ?? null,
              }))
              .filter(relation => relation.relation && relation.target_hypothesis_id)
              .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
          : [],
      }))
      .sort((a, b) => a.hypothesis_id.localeCompare(b.hypothesis_id));
    return createHash('sha256').update(JSON.stringify(owners)).digest('hex');
  }
  keepSemanticLayerOwner(input) {
    const documentId = Number(input?.document_id);
    const requestKey = textOrUndefined(input?.request_key);
    const hypothesisId = textOrUndefined(input?.hypothesis_id);
    const layerId = Number(input?.layer_id);
    const rationale = textOrUndefined(input?.rationale);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      throw new Error('semantic layer keep requires a positive document_id');
    }
    if (!requestKey || !idPattern.test(requestKey)) {
      throw new Error('semantic layer keep requires a stable request_key');
    }
    if (!hypothesisId || !idPattern.test(hypothesisId)) {
      throw new Error('semantic layer keep requires a stable hypothesis_id');
    }
    if (!Number.isSafeInteger(layerId) || layerId <= 0) {
      throw new Error('semantic layer keep requires a positive layer_id');
    }

    const durableScenePlan = this.sceneOwnershipPlan(documentId);
    const suppliedScenePlan = input?.scene_ownership_plan === undefined
      ? undefined
      : normalizeSceneOwnershipPlan(input.scene_ownership_plan);
    if (durableScenePlan && suppliedScenePlan) {
      const durableCanonical = normalizeSceneOwnershipPlan(durableScenePlan);
      if (JSON.stringify(durableCanonical) !== JSON.stringify(suppliedScenePlan)) {
        throw new Error(
          `scene_ownership_plan_conflict: document already owns durable plan ${durableCanonical.plan_id}; do not replace it while keeping ${hypothesisId}`
        );
      }
    }
    const scenePlan = durableScenePlan
      ? normalizeSceneOwnershipPlan(durableScenePlan)
      : suppliedScenePlan;
    if (!scenePlan) {
      throw new Error(
        `scene_ownership_plan_required: keeping temporary owner ${hypothesisId} commits it to the scene; supply the durable ownership plan before promotion`
      );
    }
    if (!sceneOwnershipOwnerIds(scenePlan).includes(hypothesisId)) {
      throw new Error(
        `scene_ownership_owner_unplanned: temporary owner ${hypothesisId} is not predeclared by scene_ownership_plan=${scenePlan.plan_id}`
      );
    }

    const existingRequest = this.read(requestKey);
    if (existingRequest) {
      const body = parseTexts(existingRequest.result).find(row => row?.semantic_layer_lifecycle?.action === 'keep');
      if (
        existingRequest.phase === 'completed'
        && !existingRequest.failed
        && body?.semantic_layer_lifecycle?.hypothesis_id === hypothesisId
        && body?.semantic_layer_lifecycle?.layer_id === layerId
      ) {
        return body;
      }
      throw new Error(`Operation id ${requestKey} already belongs to a different semantic layer lifecycle request`);
    }

    const owners = this.semanticLayerOwners(documentId);
    const owner = owners.find(candidate => candidate.hypothesis_id === hypothesisId);
    if (!owner) throw new Error(`semantic_layer_owner_missing: ${hypothesisId} has no durable owner binding`);
    if (owner.layer_id !== layerId) {
      throw new Error(`semantic_layer_pollution: ${hypothesisId} owns layer ${owner.layer_id}, not ${layerId}`);
    }
    if (owner.temporary !== true) {
      throw new Error(`semantic_layer_keep_not_applicable: ${hypothesisId} is already a stable owner`);
    }

    const records = this.records();
    const sequence = Math.max(0, ...records.map(record => Number(record.sequence ?? 0))) + 1;
    const at = new Date().toISOString();
    const lifecycle = {
      protocol: 'photoshop.guard.semantic_layer_lifecycle.v1',
      action: 'keep',
      hypothesis_id: hypothesisId,
      layer_id: layerId,
      ...(rationale ? { rationale } : {}),
      at,
    };
    const resultBody = {
      ok: true,
      semantic_layer_lifecycle: lifecycle,
      continuation_layers: [{
        step_id: 'semantic-layer-keep',
        layer_id: layerId,
        ...(owner.layer_name ? { layer_name: owner.layer_name } : {}),
        hypothesis_id: hypothesisId,
        ...(owner.hypothesis ? { hypothesis: owner.hypothesis } : {}),
        rollback_value: owner.rollback_value ?? 'moderate',
        temporary: false,
        decision: 'keep',
      }],
    };
    const request = {
      id: requestKey,
      tool: 'photoshop_guard_keep_logical_layer',
      args: {
        document_id: documentId,
        hypothesis_id: hypothesisId,
        layer_id: layerId,
        ...(rationale ? { rationale } : {}),
      },
      summary: `Keep semantic layer owner ${hypothesisId} on layer ${layerId}`,
      purpose: 'Resolve one temporary logical-layer hypothesis without a Photoshop pixel mutation.',
      ...(!durableScenePlan && suppliedScenePlan ? { scene_ownership_plan: suppliedScenePlan } : {}),
    };
    const record = {
      ...request,
      hash: fingerprint(request),
      sequence,
      created_at: at,
      completed_at: at,
      phase: 'completed',
      visual: false,
      failed: false,
      result: { content: [{ type: 'text', text: JSON.stringify(resultBody) }] },
      report: {
        did: `Kept semantic owner ${hypothesisId} on existing layer ${layerId}`,
        ...(rationale ? { why: rationale } : {}),
        result: 'Temporary semantic ownership was promoted in Guard metadata only; Photoshop pixels/layers were not mutated.',
        at,
        internal_guard_lifecycle: true,
      },
      guard_ack_required: false,
    };
    this.write(record);
    return resultBody;
  }
  attachAnchorRestoreSnapshot(documentId, anchorOperationId, snapshot) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('anchor restore snapshot requires a positive document_id');
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('anchor restore snapshot must be an object');
    if (snapshot.protocol !== 'photoshop.guard.anchor_restore_snapshot.v1') throw new Error('anchor restore snapshot protocol mismatch');
    if (snapshot.document_id !== documentId) throw new Error('anchor restore snapshot document_id mismatch');
    return this.updatePaintingState(documentId, current => {
      const alternatives = Array.isArray(current.alternative_artistic_anchors)
        ? current.alternative_artistic_anchors
        : [];
      const candidates = [current.primary_artistic_anchor, ...alternatives].filter(Boolean);
      const target = candidates.find(anchor => anchor.operation_id === anchorOperationId);
      if (!target) throw new Error('anchor restore snapshot must reference the current primary or alternative artistic anchor');
      if (!materializedEvidenceMatches(target)) throw new Error('anchor restore snapshot requires intact durable anchor preview bytes');
      if (
        current.current_frame?.operation_id !== anchorOperationId
        || textOrUndefined(current.current_frame?.sha256)?.toLowerCase() !== textOrUndefined(target.sha256)?.toLowerCase()
        || !materializedEvidenceMatches(current.current_frame)
      ) {
        throw new Error('anchor restore snapshot must be captured while the exact anchor frame is still current');
      }
      const nextSnapshot = structuredClone(snapshot);
      const updateAnchor = anchor => anchor?.operation_id === anchorOperationId
        ? { ...anchor, restore_snapshot: nextSnapshot }
        : anchor;
      return {
        ...current,
        primary_artistic_anchor: updateAnchor(current.primary_artistic_anchor),
        alternative_artistic_anchors: alternatives.map(updateAnchor),
        last_anchor_restore_snapshot: {
          anchor_operation_id: anchorOperationId,
          captured_at: snapshot.captured_at ?? new Date().toISOString(),
          protocol: snapshot.protocol,
        },
      };
    });
  }
  acceptedAnchorRestoreSnapshot(documentId, anchorOperationId) {
    const state = this.paintingState().documents?.[String(documentId)] ?? {};
    const anchors = [
      state.primary_artistic_anchor,
      ...(Array.isArray(state.alternative_artistic_anchors) ? state.alternative_artistic_anchors : []),
    ].filter(Boolean);
    const anchor = anchors.find(candidate => candidate.operation_id === anchorOperationId);
    return anchor?.restore_snapshot ? structuredClone(anchor.restore_snapshot) : undefined;
  }
  anchorPreviewCaptureSpec(record) {
    if (!record || typeof record !== 'object') return null;
    const candidates = [];
    if (record.preview_args && typeof record.preview_args === 'object' && !Array.isArray(record.preview_args)) {
      candidates.push(record.preview_args);
    }
    if (record.tool === 'photoshop_execute_visual_microplan') {
      const steps = Array.isArray(record.args?.steps) ? record.args.steps : [];
      for (const step of [...steps].reverse()) {
        if (step?.tool !== 'photoshop_get_preview') continue;
        if (step.args && typeof step.args === 'object' && !Array.isArray(step.args)) candidates.push(step.args);
        break;
      }
    }
    for (const candidate of candidates) {
      const maxDimension = Number(candidate.max_dimension_px);
      const quality = Number(candidate.quality);
      if (!Number.isSafeInteger(maxDimension) || maxDimension < 1) continue;
      if (!Number.isSafeInteger(quality) || quality < 1 || quality > 12) continue;
      return { max_dimension_px: maxDimension, quality };
    }
    return null;
  }
  planAcceptedAnchorRestore(documentId, anchorOperationId, suppliedRecords, projectionContext) {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('accepted_anchor_restore requires a positive document_id');
    const state = (projectionContext ? projectionContext.paintingState : this.paintingState()).documents?.[String(documentId)] ?? {};
    const anchors = [
      state.primary_artistic_anchor,
      ...(Array.isArray(state.alternative_artistic_anchors) ? state.alternative_artistic_anchors : []),
    ].filter(Boolean);
    const anchor = anchors.find(candidate => candidate.operation_id === anchorOperationId);
    if (!anchor) throw new Error('accepted_anchor_restore_unknown_anchor: operation id is not a registered current artistic anchor');
    if (!materializedEvidenceMatches(anchor)) throw new Error('accepted_anchor_restore_stale_anchor: durable anchor preview bytes are missing or SHA-mismatched');
    if (!anchor.restore_snapshot || anchor.restore_snapshot.protocol !== 'photoshop.guard.anchor_restore_snapshot.v1') {
      throw new Error('accepted_anchor_restore_snapshot_required: register exact layer/active-layer/selection state while the anchor frame is current');
    }
    if (anchor.restore_snapshot.document_id !== documentId) throw new Error('accepted_anchor_restore_snapshot_document_mismatch');
    const currentWitness = normalizeDocumentInstanceWitness(state.document_instance?.host_witness);
    const snapshotWitness = normalizeDocumentInstanceWitness(anchor.restore_snapshot.document_instance_witness);
    if (snapshotWitness && currentWitness && !sameDocumentInstanceWitness(snapshotWitness, currentWitness)) {
      throw new Error('accepted_anchor_restore_incarnation_mismatch: anchor snapshot belongs to a different live document instance');
    }

    const records = this.currentDocumentRecords(
      documentId,
      suppliedRecords ?? projectionContext?.records ?? this.records(),
      projectionContext
    );
    const anchorRecord = records.find(record => record.id === anchorOperationId);
    if (!anchorRecord || !anchorRecord.visual || anchorRecord.preview?.sha256 !== anchor.sha256) {
      throw new Error('accepted_anchor_restore_anchor_record_missing: anchor is outside the current document incarnation or lacks exact visual evidence');
    }
    const anchorPreviewArgs = this.anchorPreviewCaptureSpec(anchorRecord);
    if (!anchorPreviewArgs) {
      throw new Error('accepted_anchor_restore_capture_spec_required: exact anchor preview capture parameters are unavailable');
    }
    const later = records.filter(record => Number(record.sequence ?? 0) > Number(anchorRecord.sequence ?? 0));
    for (const record of later) {
      if (record.phase === 'uncertain' || record.execution === 'uncertain') {
        throw new Error(`accepted_anchor_restore_uncertain_history: operation ${record.id} has uncertain execution`);
      }
      if (record.tool === 'photoshop_undo' || record.tool === 'photoshop_redo') {
        throw new Error(`accepted_anchor_restore_ambiguous_history: later ${record.tool} operation ${record.id} makes bounded undo depth ambiguous`);
      }
      if (isDocumentBootstrap(record)) {
        throw new Error('accepted_anchor_restore_incarnation_boundary: document bootstrap after anchor cannot be crossed by restore');
      }
    }
    const historyRecords = later.filter(record => {
      if (record.execution === 'not-executed' || record.failed === true) return false;
      if (isRead(record.tool) || ANCHOR_RESTORE_NO_HISTORY_TOOLS.has(record.tool)) return false;
      return true;
    });
    const requiredUndoSteps = historyRecords.reduce((sum, record) => sum + reportedHistorySteps(record), 0);
    const currentSha = textOrUndefined(state.current_frame?.sha256)?.toLowerCase();
    const anchorSha = textOrUndefined(anchor.sha256)?.toLowerCase();
    if (requiredUndoSteps < 1) {
      if (currentSha === anchorSha) {
        throw new Error('accepted_anchor_restore_already_current: the exact accepted anchor frame is already current');
      }
      throw new Error('accepted_anchor_restore_no_proven_history: current state differs from the anchor but no bounded undoable history is proven');
    }
    return {
      protocol: 'photoshop.guard.accepted_anchor_restore_plan.v1',
      document_id: documentId,
      anchor_operation_id: anchor.operation_id,
      anchor_sha256: anchorSha,
      anchor_path: anchor.path,
      anchor_preview_args: anchorPreviewArgs,
      required_undo_steps: requiredUndoSteps,
      history_operation_ids: historyRecords.map(record => record.id),
      restore_snapshot: structuredClone(anchor.restore_snapshot),
    };
  }
  finalizeAcceptedAnchorRestore(operationId, verification) {
    const record = this.read(operationId);
    if (!record?.accepted_anchor_restore || record.tool !== 'photoshop_undo') {
      throw new Error('accepted_anchor_restore_finalize requires a Guard-owned anchor restore operation');
    }
    const contract = record.accepted_anchor_restore;
    const documentId = record.args?.document_id;
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('accepted_anchor_restore_finalize requires pinned document_id');
    if (!record.preview || record.preview.sha256 !== contract.anchor_sha256 || !materializedEvidenceMatches(record.preview)) {
      throw new Error('accepted_anchor_restore_sha_mismatch: post-restore preview does not exactly match the registered anchor SHA');
    }
    if (!verification || verification.protocol !== 'photoshop.guard.anchor_restore_verification.v1') {
      throw new Error('accepted_anchor_restore verification protocol mismatch');
    }
    if (verification.document_id !== documentId || verification.matches !== true) {
      throw new Error('accepted_anchor_restore_state_mismatch: layered/active-layer/selection parity was not proven');
    }

    this.recordTechnicalReport(operationId, {
      did: `Restored accepted artistic anchor ${contract.anchor_operation_id}.`,
      why: 'Return the pinned Photoshop document to the registered accepted state without replaying artistic mutations.',
      result: 'Exact anchor preview SHA and registered layer/active-layer/selection state all match.',
    });
    const afterReport = this.read(operationId);
    if (afterReport?.operation_receipt && !afterReport.operation_ack) {
      this.ackOperation({ id: operationId, protocol: OPERATION_ACK_PROTOCOL, token: afterReport.operation_receipt.token });
    }
    const closed = this.read(operationId);
    closed.verdict = {
      verdict: 'neutral',
      disposition: 'accept',
      target_resolved: 'yes',
      observed_change: 'Guard verified exact restoration of the registered accepted anchor state.',
      regressions: [],
      uncertainty: 'none observed',
      global_readability: 'unknown',
      primitive_footprint: 'none',
      trend_signals: [],
      recovery: {
        protocol: 'photoshop.guard.accepted_anchor_restore.v1',
        anchor_operation_id: contract.anchor_operation_id,
        anchor_sha256: contract.anchor_sha256,
        state_verification: structuredClone(verification),
      },
      at: new Date().toISOString(),
    };
    delete closed.pending_review;
    this.write(closed);
    this.clearVisualBarrier(documentId);
    this.updatePaintingState(documentId, current => ({
      ...current,
      current_frame: {
        operation_id: operationId,
        sha256: record.preview.sha256,
        path: record.preview.project_path ?? record.preview.materialized_path,
        at: new Date().toISOString(),
        accepted: true,
        acceptance_scope: 'exact_registered_anchor_restore',
      },
      accepted_frame: {
        operation_id: operationId,
        sha256: record.preview.sha256,
        path: record.preview.project_path ?? record.preview.materialized_path,
        at: new Date().toISOString(),
        accepted: true,
        acceptance_scope: 'exact_registered_anchor_restore',
      },
      pending_rollback: undefined,
      last_anchor_restore: {
        restore_operation_id: operationId,
        anchor_operation_id: contract.anchor_operation_id,
        anchor_sha256: contract.anchor_sha256,
        completed_at: new Date().toISOString(),
        verification: structuredClone(verification),
      },
    }));
    return this.read(operationId);
  }
  recordTechnicalReport(id, report) {
    const record = this.read(id);
    if (!record) throw new Error('Unknown operation');
    for (const key of ['did', 'why', 'result']) {
      if (typeof report?.[key] !== 'string' || report[key].trim().length < 4) {
        throw new Error(`Concrete technical report.${key} is required`);
      }
    }
    record.report = {
      id,
      did: report.did,
      why: report.why,
      result: report.result,
      source: 'guard_execution',
      recorded_at: new Date().toISOString(),
      delivery: 'technical_execution_record',
    };
    const commentaryPath = this.writeCommentarySidecar(record);
    if (commentaryPath) record.report.commentary_path = commentaryPath;
    this.write(record);
    return record.report;
  }
  collectClosePreviousErrors(input = {}) {
    const errors = [];
    const id = textOrUndefined(input.previous_operation_id);
    if (!id) return errors;
    const record = this.read(id);
    if (!record) return [`Unknown previous_operation_id: ${id}`];
    if (input.next_operation === undefined) {
      const ownership = this.closeOnlyLifecycleOwner(id);
      if (!ownership.ok) errors.push(ownership.reason);
    }
    if (this.hasDurableNotExecutedProof(record)) return errors;
    if (isTerminalBootstrapFailure(record)) return errors;

    if (!record.report) {
      const report = input.previous_report;
      if (!report || typeof report !== 'object' || Array.isArray(report)) {
        errors.push(`previous_report is required to close ${id}`);
      } else {
        for (const key of ['did', 'why', 'result']) {
          const value = report[key];
          if (typeof value !== 'string' || value.trim().length < 4 || /^(tool called|called|done|ok)[.! ]*$/i.test(value.trim())) {
            errors.push(`Concrete previous_report.${key} is required; a tool card is not a report`);
          }
        }
      }
    }

    if (record.operation_receipt && !record.operation_ack) {
      const ack = input.previous_operation_ack;
      if (!ack || typeof ack !== 'object' || Array.isArray(ack)) {
        errors.push(`previous_operation_ack is required to close ${id}; echo the exact Guard receipt token from the prior controller result`);
      } else {
        if (ack.protocol !== undefined && ack.protocol !== OPERATION_ACK_PROTOCOL) {
          errors.push(`previous_operation_ack.protocol must be ${OPERATION_ACK_PROTOCOL}`);
        }
        if (typeof ack.token !== 'string' || ack.token !== record.operation_receipt.token) {
          errors.push('previous_operation_ack.token does not match the exact Guard receipt');
        }
      }
    }

    if (record.visual && !record.verdict) {
      if (!record.preview) errors.push(`Visual operation ${id} has no attached preview to classify`);
      const deliveryDebt = this.visualDeliveryDebt(record);
      if (deliveryDebt) {
        errors.push(`Visual operation ${id} has unresolved model-facing image delivery debt; re-deliver the same review artifacts before verdict closure`);
      }
      const verdict = input.previous_visual_verdict;
      if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) {
        errors.push(`previous_visual_verdict is required to close visual operation ${id}`);
      } else if (record.preview) {
        try {
          const escalation = this.planReviewEscalation(id, verdict.review_findings ?? [], {
            persist: false,
            uncertainty_review: verdict.uncertainty_review,
            target_resolved: verdict.target_resolved,
          });
          if (!escalation.required) {
            const verdictInput = {
              id,
              preview_id: id,
              sha256: record.preview.sha256,
              ...verdict,
            };
            const validated = this.validateVerdictInput(verdictInput);
            this.cacheValidatedVerdict(verdictInput, validated);
          }
        } catch (error) {
          errors.push(`previous_visual_verdict invalid for ${id}: ${String(error?.message ?? error)}`);
        }
      }
    }
    return [...new Set(errors)];
  }
  closePreviousCycle(input = {}, options = {}) {
    const id = textOrUndefined(input.previous_operation_id);
    if (!id) return { closed: false };
    let record = this.read(id);
    if (!record) throw new Error(`Unknown previous_operation_id: ${id}`);
    if (this.hasDurableNotExecutedProof(record)) {
      record = this.finalizeDurableNotExecuted(record, 'close_previous_terminal_not_executed');
      return {
        closed: true,
        operation_id: id,
        not_executed: true,
        operation_ack: undefined,
        report_delivery: undefined,
        host_delivery_evidence: null,
        verdict_recorded: false,
      };
    }
    if (isTerminalBootstrapFailure(record)) {
      return {
        closed: true,
        operation_id: id,
        terminal_bootstrap_failure: true,
        operation_ack: undefined,
        report_delivery: undefined,
        host_delivery_evidence: null,
        verdict_recorded: false,
      };
    }

    if (!record.report) {
      if (!input.previous_report || typeof input.previous_report !== 'object' || Array.isArray(input.previous_report)) {
        throw new Error(`previous_report is required to close ${id}`);
      }
      if (input._compact_closure === true) {
        this.recordTechnicalReport(id, input.previous_report);
      } else {
        this.report({ id, ...input.previous_report });
      }
    }

    const refreshedAfterReport = this.read(id);
    if (refreshedAfterReport?.operation_receipt && !refreshedAfterReport?.operation_ack) {
      if (!input.previous_operation_ack || typeof input.previous_operation_ack !== 'object' || Array.isArray(input.previous_operation_ack)) {
        throw new Error(`previous_operation_ack is required to close ${id}; echo the exact Guard receipt token from the prior controller result`);
      }
      this.ackOperation({ id, ...input.previous_operation_ack });
    }

    const afterGuardAck = this.read(id);
    if (input.previous_report_ack && options.hostAckVerified === true && !afterGuardAck?.report?.host_ack) {
      this.ackReport({ id, ...input.previous_report_ack }, { hostVerified: true });
    }

    const refreshed = this.read(id);
    if (refreshed.visual && !refreshed.verdict) {
      if (this.visualDeliveryDebt(refreshed)) {
        throw new Error(`Visual operation ${id} has unresolved model-facing image delivery debt; re-deliver the same review artifacts before verdict closure`);
      }
      if (!input.previous_visual_verdict || typeof input.previous_visual_verdict !== 'object' || Array.isArray(input.previous_visual_verdict)) {
        throw new Error(`previous_visual_verdict is required to close visual operation ${id}`);
      }
      if (!refreshed.preview) throw new Error(`Visual operation ${id} has no attached preview to classify`);
      const escalation = this.planReviewEscalation(id, input.previous_visual_verdict.review_findings ?? [], {
        persist: false,
        uncertainty_review: input.previous_visual_verdict.uncertainty_review,
        target_resolved: input.previous_visual_verdict.target_resolved,
      });
      if (escalation.required) {
        throw new Error(`Visual operation ${id} requires read-only review evidence before verdict closure`);
      }
      this.verdict({
        id,
        preview_id: id,
        sha256: refreshed.preview.sha256,
        ...input.previous_visual_verdict,
      });
    }

    const closed = this.read(id);
    return {
      closed: true,
      operation_id: id,
      operation_ack: closed?.operation_ack,
      report_delivery: closed?.report?.delivery,
      host_delivery_evidence: closed?.report?.host_ack ?? null,
      verdict_recorded: !!closed?.verdict,
    };
  }
  fail(record, error) {
    const bootstrap = isDocumentBootstrap(record);
    const updated = { ...record, phase: record.dispatched ? 'uncertain' : 'completed', visual: record.dispatched ? record.visual : false,
      execution: record.dispatched ? 'uncertain' : 'not-executed', error: String(error?.message ?? error), failed: true };
    if (record.dispatched && !bootstrap) {
      updated.operation_receipt = record.operation_receipt ?? {
        protocol: OPERATION_RECEIPT_PROTOCOL,
        operation_id: record.id,
        token: randomUUID(),
        issued_at: new Date().toISOString(),
        phase: updated.phase,
        execution: updated.execution,
      };
    } else {
      delete updated.operation_receipt;
      delete updated.operation_ack;
      updated.guard_ack_required = false;
    }
    this.write(updated);
    return updated;
  }
  report(input) {
    const record = this.read(input.id);
    if (!record) throw new Error('Unknown operation');
    for (const key of ['did', 'why', 'result']) {
      if (typeof input[key] !== 'string' || input[key].trim().length < 4 || /^(tool called|called|done|ok)[.! ]*$/i.test(input[key].trim())) throw new Error(`Concrete report.${key} is required; a tool card is not a report`);
    }
    record.report = {
      ...input,
      recorded_at: new Date().toISOString(),
      delivery: 'recorded_host_verification_optional',
    };
    const commentaryPath = this.writeCommentarySidecar(record);
    if (commentaryPath) record.report.commentary_path = commentaryPath;
    this.write(record);
    return {
      report: `Что сделал: ${input.did}\nЗачем: ${input.why}\nРезультат: ${input.result}`,
      delivery: record.report.delivery,
      ...(commentaryPath ? { commentary_path: commentaryPath } : {}),
    };
  }
  ackReport(input, options = {}) {
    const record = this.read(input.id);
    if (!record?.report) throw new Error('Report must be recorded before host acknowledgement');
    if (options.hostVerified !== true) throw new Error('Host report evidence must be verified by the host receipt boundary');
    if (input.source !== 'chat_on_steroids') throw new Error('Host acknowledgement source must be chat_on_steroids');
    if (typeof input.message_id !== 'string' || input.message_id.trim().length < 4) throw new Error('Host message_id is required');
    if (typeof input.delivered_at !== 'string' || !Number.isFinite(Date.parse(input.delivered_at))) throw new Error('Valid host delivered_at is required');
    record.report.host_ack = {
      source: input.source,
      message_id: input.message_id.trim(),
      delivered_at: new Date(input.delivered_at).toISOString(),
      ...(typeof input.turn_id === 'string' && input.turn_id.trim() ? { turn_id: input.turn_id.trim() } : {}),
      ...(typeof input.text_sha256 === 'string' && /^[0-9a-f]{64}$/i.test(input.text_sha256)
        ? { text_sha256: input.text_sha256.toLowerCase() }
        : {}),
      recorded_at: new Date().toISOString(),
    };
    record.report.delivery = 'host_verified';
    this.write(record);
    return { id: record.id, delivery: record.report.delivery, host_ack: record.report.host_ack };
  }
  ackOperation(input) {
    const record = this.read(input.id);
    if (!record) throw new Error('Unknown operation');
    const receipt = record.operation_receipt;
    if (!receipt) throw new Error('Operation has no Guard receipt to acknowledge');
    if (input.protocol !== undefined && input.protocol !== OPERATION_ACK_PROTOCOL) {
      throw new Error(`operation acknowledgement protocol must be ${OPERATION_ACK_PROTOCOL}`);
    }
    if (typeof input.token !== 'string' || input.token !== receipt.token) {
      throw new Error('Operation acknowledgement token does not match the exact Guard receipt');
    }
    record.operation_ack = {
      protocol: OPERATION_ACK_PROTOCOL,
      receipt_protocol: receipt.protocol,
      receipt_token: receipt.token,
      acknowledged_at: new Date().toISOString(),
    };
    this.write(record);
    return { id: record.id, operation_ack: record.operation_ack };
  }
  validateVerdictInput(input) {
    const record = this.read(input.id);
    const previewRecord = this.read(input.preview_id);
    if (!record?.visual || !previewRecord?.preview || previewRecord.failed) throw new Error('A successful materialized preview and a visual operation are required');
    if (input.preview_id !== record.id) {
      throw new Error('Visual verdict must classify the preview attached to the exact current operation; stale/later/foreign preview ids are not admissible');
    }
    if (previewRecord.created_at < record.created_at || previewRecord.args?.document_id !== record.args?.document_id) throw new Error('Preview must follow the mutation and target the same pinned document');
    if (previewRecord.preview.document_id !== record.args?.document_id) throw new Error('Attached preview provenance does not match the visual operation pinned document');
    if (record.id !== previewRecord.id && record.sequence && previewRecord.sequence <= record.sequence) throw new Error('Preview must follow the mutation');
    const preview = previewRecord.preview;
    if (input.sha256 !== preview.sha256 || fingerprintFile(preview.materialized_path) !== input.sha256) throw new Error('Preview SHA mismatch');
    if (!['improvement', 'neutral', 'regression'].includes(input.verdict)) throw new Error('Visual verdict required');
    if (!['accept', 'correct', 'rollback'].includes(input.disposition)) throw new Error('Visual disposition accept|correct|rollback required');
    if (input.disposition === 'rollback') {
      const semanticOwnership = parseTexts(record?.result)
        .map(body => body?.pass_execution?.history_ownership)
        .find(ownership => ownership?.protocol === 'photoshop.guard.semantic_pass_history_ownership.v1');
      if (semanticOwnership && semanticOwnership.status !== 'exact') {
        throw new Error(
          `semantic_pass_rollback_unproven: pass history ownership is ${semanticOwnership.status ?? 'unknown'}; reconcile the partial/uncertain execution or restore an exact accepted anchor instead of issuing an unbounded Photoshop undo`
        );
      }
    }
    if (typeof input.observed_change !== 'string' || input.observed_change.trim().length < 10) throw new Error('Concrete observed_change required');
    const observations = normalizeVisualObservations(input.observations);
    const primaryMismatch = textOrUndefined(input.primary_mismatch);
    if (!primaryMismatch || primaryMismatch.length < 3) throw new Error('Concrete primary_mismatch is required after observations');
    if (!['yes', 'no', 'uncertain'].includes(input.target_resolved)) throw new Error('target_resolved must be yes|no|uncertain');
    if (!Array.isArray(input.regressions) || input.regressions.some(x => typeof x !== 'string' || !x.trim())) throw new Error('regressions must be an array of non-empty strings');
    if (typeof input.uncertainty !== 'string' || input.uncertainty.trim().length < 3) throw new Error('Concrete uncertainty required');
    if (!GLOBAL_READABILITY.has(input.global_readability)) throw new Error('global_readability must be improved|stable|degraded|unknown');
    if (!PRIMITIVE_FOOTPRINT.has(input.primitive_footprint)) throw new Error('primitive_footprint must be none|acceptable|suspect|unknown');
    if (!Array.isArray(input.trend_signals) || input.trend_signals.some(x => !normalizeTrendSignal(x))) {
      throw new Error('trend_signals must be an array of non-empty stable signal strings');
    }
    this.normalizeReviewFindings(input.review_findings ?? []);
    if (input.planner_interrupt_reason !== undefined) {
      const reason = textOrUndefined(input.planner_interrupt_reason)?.toLowerCase();
      if (!ART_DIRECTOR_INTERRUPT_REASONS.has(reason)) {
        throw new Error(`planner_interrupt_reason must be one of ${[...ART_DIRECTOR_INTERRUPT_REASONS].join(', ')}`);
      }
      if (input.planner_interrupt_detail !== undefined && (!textOrUndefined(input.planner_interrupt_detail) || input.planner_interrupt_detail.trim().length < 10)) {
        throw new Error('planner_interrupt_detail must be concrete when supplied');
      }
    }
    const isVisualMicroPlan = record.tool === 'photoshop_execute_visual_microplan';
    if (!isVisualMicroPlan && input.edge_observations !== undefined) {
      throw new Error('edge_observations are allowed only for photoshop_execute_visual_microplan operations with declared edge intents');
    }
    const edgeIntents = isVisualMicroPlan ? parseEdgeIntents(record.args?.edges) : [];
    if (isVisualMicroPlan && input.edge_observations !== undefined && edgeIntents.length === 0) {
      throw new Error('edge_observations require declared edge intents on the VisualMicroPlan');
    }
    const edgeObservations = edgeIntents.length
      ? validateEdgeObservations(edgeIntents, input.edge_observations)
      : [];
    const context = visualContext(record);
    const documentState = this.paintingState().documents?.[String(record.args?.document_id)] ?? {};
    const softnessRisk = softDominanceRiskForOperation(record);
    const softnessContext = softDominanceContextForOperation(record);
    const softnessReviewRequired = documentState.painting_profile === 'nontrivial_painting'
      && softnessRisk.required;
    if (softnessReviewRequired && input.softness_review === undefined) {
      throw new Error(
        `soft_dominance_review_required: broad soft-dominant ${softnessRisk.scale} work in a nontrivial painting requires previous_observation.softness_review before visual closure (${softnessRisk.reason})`
      );
    }
    const softnessReview = input.softness_review === undefined
      ? undefined
      : normalizeSoftDominanceReview(input.softness_review, {
          previewSha256: preview.sha256,
          constructionRole: softnessContext.constructionRole,
          physicalRole: softnessContext.physicalRole,
          styleContract: documentState.art_director?.style_contract ?? null,
        });
    if (softnessReview?.status === 'fail') {
      if (input.disposition === 'accept') {
        throw new Error('soft_dominance_detected: a failed softness review cannot be accepted; correct or rollback the pass');
      }
      if (input.target_resolved === 'yes') {
        throw new Error('soft_dominance_detected: target_resolved=yes conflicts with failed softness review');
      }
      if (
        softnessReview.criteria.primitive_footprint.status === 'debt'
        && input.primitive_footprint !== 'suspect'
      ) {
        throw new Error(
          'soft_dominance_review primitive_footprint debt requires primitive_footprint=suspect so the existing footprint/trend guard receives the same evidence'
        );
      }
      const structuralSoftDebt = [
        'edge_hierarchy',
        'mass_separation',
        'large_form_readability',
        'focal_hierarchy',
      ].some(key => softnessReview.criteria[key]?.status === 'debt');
      if (structuralSoftDebt && input.global_readability === 'improved') {
        throw new Error(
          'soft_dominance_review structural debt conflicts with global_readability=improved'
        );
      }
    }
    const recognition = normalizeRecognitionVerdict(
      input.recognition,
      isRecognitionBlockInStage(context.stage)
    );
    if (input.verdict === 'regression' && input.disposition === 'accept') throw new Error('A regression cannot be accepted');
    const significance = assessVisualSignificance({
      before: record.before_preview ?? record.baseline_preview,
      after: preview,
      mode: significanceModeOf(record),
    });
    const executionChanged = significanceHasDetectedChange(significance);
    if (significance.execution_effect === 'meaningful' && !hasWholeFrameObservation(observations)) {
      throw new Error(
        'whole_frame_review_required: every meaningful visual pass must include an observation with region="whole frame" before verdict closure'
      );
    }
    const comparisonBefore = record.before_preview ?? record.baseline_preview;
    const comparisonProvenanceMatched = comparisonBefore?.document_id === record.args?.document_id
      && preview?.document_id === record.args?.document_id;
    const comparisonMetric = deriveComparisonMetric({
      before: comparisonBefore,
      after: preview,
      significance,
      specification: record.comparison_specification ?? comparisonSpecificationForOperation(record),
    });
    if (input.global_readability !== 'unknown' && !(comparisonProvenanceMatched && significance.global)) {
      throw new Error('visual_comparison_gate: global_readability comparison requires a comparable whole-frame before preview; use global_readability=unknown otherwise');
    }
    if (!comparisonProvenanceMatched
      && (input.verdict === 'improvement' || input.verdict === 'regression')) {
      throw new Error(
        'visual_comparison_gate: improvement/regression requires a comparable before preview from the same pinned document; ' +
        'an unavailable machine metric may coexist with a directional visual judgment only when BEFORE and AFTER image evidence both exist with matching document provenance'
      );
    }
    if (comparisonMetric.status === 'available' && input.verdict === 'improvement' && input.disposition === 'accept' && !executionChanged) {
      throw new Error(`visual_execution_gate: improvement cannot be accepted because no comparable decoded pixel change was detected. execution_effect=${significance.execution_effect}. ${significance.reason}`);
    }
    if (comparisonMetric.status === 'available' && input.target_resolved === 'yes' && !executionChanged) {
      throw new Error(`visual_execution_gate: target_resolved=yes requires evidence that the operation changed the rendered image; got execution_effect=${significance.execution_effect}`);
    }
    const assessment = goalAssessment(input);
    const taskAssessment = plannerTaskAssessment(input);
    const executionOutcome = deriveExecutionOutcome(record);
    const artisticOutcome = deriveArtisticOutcome(input);
    return {
      record,
      previewRecord,
      preview,
      observations,
      primaryMismatch,
      edgeObservations,
      recognition,
      context,
      significance,
      executionChanged,
      executionOutcome,
      artisticOutcome,
      comparisonMetric,
      assessment,
      taskAssessment,
      softnessReview,
      softnessRisk,
    };
  }
  cacheValidatedVerdict(input, validated) {
    this._validatedVerdictCache ??= new Map();
    this._validatedVerdictCache.set(fingerprint(input), {
      validated,
      evidence_signature: visualEvidenceSignature(validated.record, validated.preview),
    });
  }
  consumeValidatedVerdict(input) {
    const key = fingerprint(input);
    const cached = this._validatedVerdictCache?.get(key);
    if (!cached) return undefined;
    this._validatedVerdictCache.delete(key);
    const current = this.read(input.id);
    if (!current?.preview) return undefined;
    if (cached.evidence_signature !== visualEvidenceSignature(current, current.preview)) return undefined;
    return {
      ...cached.validated,
      record: current,
      previewRecord: current,
      preview: current.preview,
    };
  }
  verdict(input) {
    const {
      record,
      previewRecord,
      preview,
      observations,
      primaryMismatch,
      edgeObservations,
      recognition,
      context,
      significance,
      executionChanged,
      executionOutcome,
      artisticOutcome,
      comparisonMetric,
      assessment,
      taskAssessment,
      softnessReview,
      softnessRisk,
    } = this.consumeValidatedVerdict(input) ?? this.validateVerdictInput(input);
    const softnessTrendSignals = softnessReview?.trend_signals ?? [];
    const mergedTrendSignals = [...new Set([
      ...input.trend_signals.map(normalizeTrendSignal).filter(Boolean),
      ...softnessTrendSignals.map(normalizeTrendSignal).filter(Boolean),
    ])];
    const submittedReviewFindings = Array.isArray(input.review_findings)
      ? input.review_findings
      : [];
    const normalizedReviewFindings = this.normalizeReviewFindings(submittedReviewFindings);
    const syntheticSoftFinding = softnessReview?.status === 'fail'
      ? [{
          kind: 'soft_dominance',
          severity: 'must-fix',
          trend_signals: softnessTrendSignals,
        }]
      : [];
    record.verdict = {
      ...input,
      observations,
      primary_mismatch: primaryMismatch,
      ...(edgeObservations.length ? { edge_observations: edgeObservations.map(row => ({
        boundary_id: row.boundaryId,
        observed_behavior: row.observedBehavior,
        target_met: row.targetMet,
      })) } : {}),
      ...(recognition ? { recognition } : {}),
      ...(softnessReview ? { softness_review: softnessReview } : {}),
      ...(submittedReviewFindings.length || syntheticSoftFinding.length
        ? { review_findings: [...submittedReviewFindings, ...syntheticSoftFinding] }
        : {}),
      trend_signals: mergedTrendSignals,
      significance,
      execution_outcome: executionOutcome,
      artistic_outcome: artisticOutcome,
      comparison_metric: comparisonMetric,
      goal_assessment: assessment,
      ...(taskAssessment ? { planner_task_assessment: taskAssessment } : {}),
      artistic_value: {
        accepted_improvement: input.verdict === 'improvement' && input.disposition === 'accept',
        execution_changed: executionChanged,
        note: 'Pixel delta is execution evidence only; artistic value comes from the visual verdict.',
      },
      at: new Date().toISOString(),
    };
    delete record.pending_review;
    this.write(record);
    const documentId = record.args?.document_id;
    if (Number.isSafeInteger(documentId) && documentId > 0) {
      // This is the canonical release point for controller-driven workflows.
      // The operation journal keeps history; the shared per-document barrier is
      // the one durable gate consulted by both controller and VisualMicroPlan.
      const barrier = this.visualBarrier(documentId);
      if (this.barrierOwnedByRecord(barrier, record)) this.clearVisualBarrier(documentId);
    }
    const workflowMetrics = this.workflowMetrics(documentId);
    const recognitionMetrics = this.recognitionMetrics(documentId);
    const trendState = this.cumulativeTrendState(documentId);
    this.updatePaintingState(documentId, current => {
      const classifiedFrame = {
        operation_id: previewRecord.id,
        sha256: preview.sha256,
        path: preview.project_path ?? preview.materialized_path,
        ...(preview.commentary_path ? { commentary_path: preview.commentary_path } : {}),
        at: new Date().toISOString(),
        accepted: input.disposition === 'accept',
        acceptance_scope: input.disposition === 'accept' ? 'pixels_retained_not_goal_confirmation' : 'not_retained',
        goal_confirmation: assessment.status,
      };
      const problems = { ...(current.visual_problems ?? {}) };
      const briefDebtOverrides = { ...(current.brief_debt_overrides ?? {}) };
      const activeBriefItems = Array.isArray(current.art_director?.artistic_evaluation_contract?.brief_items)
        ? current.art_director.artistic_evaluation_contract.brief_items
        : [];
      for (const finding of normalizedReviewFindings) {
        if (!finding.brief_item_id) continue;
        const briefItem = activeBriefItems.find(item => item.item_id === finding.brief_item_id);
        if (!briefItem) throw new Error(`review finding references unknown active brief item ${finding.brief_item_id}`);
        if (briefItem.kind !== 'hard_perceptual') {
          throw new Error(`review finding brief_item_id=${finding.brief_item_id} must reference a hard_perceptual item to create blocking debt`);
        }
        briefDebtOverrides[finding.brief_item_id] = {
          item_id: briefItem.item_id,
          kind: 'hard_perceptual',
          requirement: briefItem.requirement,
          state: finding.brief_state,
          reason: `Current-frame ${finding.severity} review finding (${finding.kind}) establishes prompt-relevant debt.`,
          evidence: [`operation:${record.id}`, `preview_sha256:${preview.sha256}`],
          source_operation_id: record.id,
          source_sequence: record.sequence ?? null,
        };
      }
      for (const finding of normalizedReviewFindings) {
        if (finding.severity !== 'must-fix') continue;
        const problemId = textOrUndefined(finding.problem_id) ?? `review-${finding.kind}`;
        const priorProblem = problems[problemId];
        const findingScale = finding.level === 'composition'
          ? 'global'
          : finding.level === 'object' ? 'medium' : 'small';
        problems[problemId] = {
          ...(priorProblem ?? {}),
          problem_id: problemId,
          scale: findingScale,
          severity: 'must-fix',
          status: 'open',
          region: finding.level === 'composition' ? 'whole-frame' : (context.region ?? 'review-region'),
          hypothesis: `Current-frame must-fix ${finding.kind} review finding requires correction before dependent work.`,
          source_operation_id: record.id,
          evidence_sha256: preview.sha256,
          source_review_kind: finding.kind,
          source_review_level: finding.level,
          structural_review: STRUCTURAL_REVIEW_FINDING_KINDS.has(finding.kind),
          ...(finding.requested_region ? { review_region_bounds: finding.requested_region } : {}),
        };
      }
      if (softnessReview?.status === 'fail') {
        const problemId = 'soft-dominance';
        const priorSoftProblem = problems[problemId];
        const problemScale = softnessRisk?.scale === 'global' ? 'global' : 'medium';
        problems[problemId] = {
          ...(priorSoftProblem ?? {}),
          problem_id: problemId,
          scale: problemScale,
          severity: 'must-fix',
          status: 'open',
          ...(problemScale === 'medium' && context.region ? { region: context.region } : { region: 'whole-frame' }),
          hypothesis:
            'Broad softness is contradicting the declared structural/edge/focal intent. Restore form-bearing edge/mass separation before finer texture/detail work.',
          source_operation_id: record.id,
          evidence_sha256: softnessReview.evidence_sha256,
          debt_criteria: softnessReview.debt_criteria,
          construction_role: softnessReview.construction_role,
          physical_role: softnessReview.physical_role,
          review_protocol: softnessReview.protocol,
        };
      }
      if (context.problem_id) {
        const priorProblem = problems[context.problem_id];
        const problemStatus = input.target_resolved === 'yes' && input.verdict === 'improvement' && input.disposition === 'accept'
          ? 'resolved' : 'open';
        const resolvesCumulativeTrend = context.problem_id.startsWith('cumulative-trend-')
          && problemStatus === 'resolved'
          && priorProblem?.status !== 'resolved';
        problems[context.problem_id] = {
          ...(priorProblem ?? {}),
          problem_id: context.problem_id,
          ...(context.region ? { region: context.region } : {}),
          ...(context.stage ? { stage: context.stage } : {}),
          ...(context.scale ? { scale: context.scale } : {}),
          ...(context.change_domains?.length ? { change_domains: context.change_domains } : {}),
          planned: {
            ...(context.hypothesis ? { hypothesis: context.hypothesis } : {}),
            failure_signals: context.failure_signals ?? [],
          },
          observed: {
            operation_id: record.id,
            observations,
            primary_mismatch: primaryMismatch,
            uncertainty: input.uncertainty,
          },
          confirmation: assessment,
          severity: context.severity ?? priorProblem?.severity ?? 'should-fix',
          status: problemStatus,
          ...(resolvesCumulativeTrend ? {
            resolution_epoch: Number(priorProblem?.resolution_epoch ?? 0) + 1,
            resolution_cutoff_sequence: Number.isSafeInteger(record.sequence) ? record.sequence : 0,
            resolution_at: record.verdict.at,
            resolution_reason: 'resolved',
          } : {}),
        };
      }
      const nextMustFix = this.largestOpenMustFix(problems);
      const primaryBlocker = this.primaryBlockingProblem(problems);
      const next = {
        ...current,
        ...this.applyArtisticLossUpdates(current, input.artistic_loss_updates, record),
        ...(input.disposition === 'rollback' ? {
          pending_rollback: {
            operation_id: record.id,
            preview_sha256: preview.sha256,
            reason: input.observed_change,
            requested_at: record.verdict.at,
            required_undo_steps: reportedHistorySteps(record),
            remaining_undo_steps: reportedHistorySteps(record),
            ...(parseTexts(record?.result).map(body => body?.pass_execution?.history_ownership).find(ownership =>
              ownership?.protocol === 'photoshop.guard.semantic_pass_history_ownership.v1'
              && ownership?.status === 'exact'
            ) ? {
              rollback_handle: {
                protocol: 'photoshop.guard.semantic_pass_rollback_handle.v1',
                operation_id: record.id,
                history_ownership_protocol: 'photoshop.guard.semantic_pass_history_ownership.v1',
                owned_history_steps: reportedHistorySteps(record),
              },
            } : {}),
          },
        } : {}),
        current_frame: classifiedFrame,
        ...(input.disposition === 'accept' ? { accepted_frame: classifiedFrame } : {}),
        ...(assessment.status === 'confirmed_by_visual_verdict' ? { confirmed_goal_frame: classifiedFrame } : {}),
        ...(context.stage ? { current_stage: context.stage } : {}),
        ...(context.scale ? { active_scale: context.scale } : {}),
        ...((context.affected_relations.length || context.affected_qualities.length) ? {
          relation_review: {
            operation_id: record.id,
            ...(context.problem_id ? { problem_id: context.problem_id } : {}),
            affected_relations: context.affected_relations,
            affected_qualities: context.affected_qualities,
            primary_mismatch: primaryMismatch,
            uncertainty: input.uncertainty,
            target_resolved: input.target_resolved,
            at: record.verdict.at,
          },
        } : {}),
        visual_problems: problems,
        brief_debt_overrides: briefDebtOverrides,
        active_problem: primaryBlocker ?? undefined,
        priority_review_required: !!nextMustFix && !!context.scale && SCALE_RANK[normalizeScale(context.scale)] > SCALE_RANK[normalizeScale(nextMustFix.scale)],
        last_critique: {
          operation_id: record.id,
          ...(context.problem_id ? { problem_id: context.problem_id } : {}),
          ...(context.region ? { region: context.region } : {}),
          ...(context.affected_relations.length ? { affected_relations: context.affected_relations } : {}),
          ...(context.affected_qualities.length ? { affected_qualities: context.affected_qualities } : {}),
          observations,
          primary_mismatch: primaryMismatch,
          observed_change: input.observed_change,
          target_resolved: input.target_resolved,
          regressions: input.regressions,
          uncertainty: input.uncertainty,
          verdict: input.verdict,
          disposition: input.disposition,
          global_readability: input.global_readability,
          primitive_footprint: input.primitive_footprint,
          execution_outcome: executionOutcome,
          artistic_outcome: artisticOutcome,
          comparison_metric: comparisonMetric,
          goal_assessment: assessment,
          ...(taskAssessment ? { planner_task_assessment: taskAssessment } : {}),
          trend_signals: record.verdict.trend_signals,
          ...(softnessReview ? { softness_review: softnessReview } : {}),
          ...(recognition ? { recognition } : {}),
          significance,
        },
        cumulative_trend_guard: trendState,
        workflow_metrics: workflowMetrics,
        recognition_metrics: recognitionMetrics,
        last_operation_id: record.id,
      };
      const withPlanner = this.advanceArtDirectorAfterVerdict(next, context, input, record);
      return this.promoteCumulativeTrendProblem(documentId, withPlanner, trendState);
    });
    return { verdict: record.verdict, warning: 'Hash proves frame identity, not that a person/model actually viewed it.' };
  }
  reconcile(input) {
    let record = this.read(input.id);
    if (!record) throw new Error('Expected an interrupted or uncertain operation');
    if (input.outcome === 'not-executed' && this.hasDurableNotExecutedProof(record)) {
      record = this.finalizeDurableNotExecuted(record, 'reconcile_durable_not_executed_proof');
      record.resolved = {
        ...input,
        evidence_mode: 'durable_pre_dispatch_proof',
        at: new Date().toISOString(),
      };
      this.write(record);
      return {
        resolved: record.resolved,
        warning: 'Durable original-operation evidence proves that no visual mutation executed. No fresh preview/state evidence, visual verdict, report, acknowledgement, or rollback is required.',
      };
    }
    const completedPreviewRecoveryUpgrade =
      record.phase === 'completed'
      && record.visual === true
      && !record.preview
      && !!record.resolved
      && (record.execution === 'completed' || record.execution === 'partial')
      && input.outcome === record.execution;
    if (record.phase === 'completed' && !completedPreviewRecoveryUpgrade) {
      throw new Error('Expected an interrupted or uncertain operation');
    }
    if (typeof input.reason !== 'string' || input.reason.trim().length < 10) throw new Error('Explicit recovery outcome and evidence-based reason required');

    const closedDocumentRecovery = input.documents_id !== undefined || input.document_closed_confirmed !== undefined || input.outcome === 'abandoned';
    if (closedDocumentRecovery) {
      if (input.state_id !== undefined || input.preview_id !== undefined) throw new Error('Use either same-document state/preview evidence or closed-document evidence, not both');
      if (input.outcome !== 'abandoned') throw new Error('Closed-document recovery requires outcome=abandoned');
      if (input.document_closed_confirmed !== true) throw new Error('Closed-document recovery requires document_closed_confirmed=true from an explicit user confirmation');
      if (typeof input.documents_id !== 'string' || !input.documents_id) throw new Error('Closed-document recovery requires a fresh photoshop_list_documents evidence record');

      const targetDocumentId = record.args?.document_id;
      if (!Number.isSafeInteger(targetDocumentId) || targetDocumentId <= 0) throw new Error('Closed-document recovery requires the interrupted operation to have a pinned document_id');
      const documentsRecord = this.read(input.documents_id);
      if (!documentsRecord || documentsRecord.phase !== 'completed' || documentsRecord.failed || documentsRecord.created_at < record.created_at) {
        throw new Error('Fresh successful photoshop_list_documents evidence required');
      }
      if (record.sequence && documentsRecord.sequence <= record.sequence) throw new Error('Recovery evidence must follow the interrupted operation');
      if (documentsRecord.tool !== 'photoshop_list_documents') throw new Error('Closed-document recovery requires photoshop_list_documents evidence');
      const documentsBody = parseTexts(documentsRecord.result).find(body =>
        Array.isArray(body?.documents) || Array.isArray(body?.details?.documents)
      );
      if (!documentsBody) throw new Error('photoshop_list_documents evidence did not contain a documents array');
      const documents = Array.isArray(documentsBody.documents)
        ? documentsBody.documents
        : documentsBody.details.documents;
      const targetStillOpen = documents.some(document => {
        const id = document && typeof document === 'object' ? (document.id ?? document.document_id) : undefined;
        return Number(id) === targetDocumentId;
      });
      if (targetStillOpen) throw new Error(`Document ${targetDocumentId} is still open; use same-document state/preview reconciliation`);

      record.resolved = {
        ...input,
        evidence_mode: 'document_absent',
        target_document_id: targetDocumentId,
        at: new Date().toISOString(),
      };
      this.write(record);
      this.clearVisualBarrier(targetDocumentId);
      this.setWorkflowLifecycle(targetDocumentId, 'stopped', 'abandoned_document_absent', record.id);
      return {
        resolved: record.resolved,
        warning: 'Original operation remains non-replayable. Document absence closes the abandoned workflow but does not prove whether the interrupted action executed before the document was closed.',
      };
    }

    if (!['completed', 'not-executed', 'partial'].includes(input.outcome)) throw new Error('Explicit recovery outcome and evidence-based reason required');
    if (typeof input.state_id !== 'string' || typeof input.preview_id !== 'string') throw new Error('Fresh successful state and preview records required');
    const evidence = [this.read(input.state_id), this.read(input.preview_id)];
    if (evidence.some(r => !r || r.phase !== 'completed' || r.failed || r.created_at < record.created_at)) throw new Error('Fresh successful state and preview records required');
    if (record.sequence && evidence.some(r => r.sequence <= record.sequence)) throw new Error('Recovery evidence must follow the interrupted operation');
    if (evidence[0].tool !== 'photoshop_get_state' || !evidence[1].preview) throw new Error('Expected get_state and a materialized preview');
    if (record.args?.document_id && evidence.some(r => r.args?.document_id !== record.args.document_id)) throw new Error('Recovery evidence must target the same document');
    if (input.outcome === 'not-executed' && !this.hasDurableNotExecutedProof(record)) {
      throw new Error(
        'outcome=not-executed requires durable pre-dispatch evidence from the original operation; fresh state/preview alone cannot prove that no mutation executed'
      );
    }
    if (
      (input.outcome === 'completed' || input.outcome === 'partial')
      && record.visual
      && evidence[1]?.preview
      && !record.preview
    ) {
      const preview = this.archiveProjectPreview(record, evidence[1].preview);
      record.preview = preview;
      record.preview_attached_at = new Date().toISOString();
      const documentId = record.args?.document_id;
      if (Number.isSafeInteger(documentId) && documentId > 0) {
        const barrier = this.visualBarrier(documentId);
        if (this.barrierOwnedByRecord(barrier, record)) {
          this.setVisualBarrier(documentId, {
            ...barrier,
            sha256: preview.sha256,
            requiresExternalPreview: false,
          });
        }
      }
    }
    record.resolved = { ...input, at: new Date().toISOString() };
    if (input.outcome === 'not-executed') {
      record.visual = false;
      record.execution = 'not-executed';
      const documentId = record.args?.document_id;
      if (Number.isSafeInteger(documentId) && documentId > 0) {
        const barrier = this.visualBarrier(documentId);
        if (this.barrierOwnedByRecord(barrier, record)) this.clearVisualBarrier(documentId);
      }
    } else if (input.outcome === 'completed') {
      // Reconciliation is the authoritative classification of an interrupted
      // operation. Once fresh evidence establishes completion, do not leave the
      // durable record in an "uncertain + failed" transport state. This is
      // especially important for non-visual configuration setters/selections:
      // they must be closable through the compact facade without inventing a
      // visual verdict.
      record.phase = 'completed';
      record.failed = false;
      record.execution = 'completed';
      if (!isVisual(record.tool)) {
        record.visual = false;
        const documentId = record.args?.document_id;
        if (Number.isSafeInteger(documentId) && documentId > 0) {
          const barrier = this.visualBarrier(documentId);
          if (this.barrierOwnedByRecord(barrier, record)) this.clearVisualBarrier(documentId);
        }
      }
    } else if (input.outcome === 'partial') {
      // Fresh evidence can settle the recovery state even when the exact
      // Photoshop effect is only partially knowable. Mark the durable
      // operation lifecycle closed so it can receive one bounded visual
      // classification, but preserve the execution uncertainty explicitly.
      record.phase = 'completed';
      record.failed = false;
      record.execution = 'partial';
      if (record.error) {
        record.recovery_original_error = record.error;
        delete record.error;
      }
    }
    this.write(record);
    return {
      resolved: record.resolved,
      warning: input.outcome === 'not-executed'
        ? 'Original operation remains non-replayable. Durable original-operation evidence proves no visual mutation executed; the matching owned barrier is released and no visual verdict is required.'
        : 'Original operation remains non-replayable. Inspect/classify before new work.',
    };
  }
  status(suppliedProjectionContext: GuardProjectionContext | undefined = undefined) {
    const baseProjection = suppliedProjectionContext ?? this.captureProjectionContext();
    const all = baseProjection.records.map(r => this.hasDurableNotExecutedProof(r)
      ? this.finalizeDurableNotExecuted(r, 'status_not_executed_cleanup')
      : r);
    const projectionContext = { ...baseProjection, records: all };
    const state = projectionContext.paintingState;
    const documentIds = [...new Set([
      ...all.map(r => r.args?.document_id).filter(id => Number.isSafeInteger(id) && id > 0),
      ...Object.keys(state.documents ?? {}).map(Number).filter(id => Number.isSafeInteger(id) && id > 0),
    ])];
    const visualBarriers = Object.fromEntries(documentIds.map(id => [String(id), this.synchronizeVisualBarrier(id, all, projectionContext) ?? null]));
    const workflowMetrics = Object.fromEntries(documentIds.map(id => [String(id), this.workflowMetrics(id, all, projectionContext)]));
    const recognitionMetrics = Object.fromEntries(documentIds.map(id => [String(id), this.recognitionMetrics(id, all, projectionContext)]));
    const visualCadence = Object.fromEntries(documentIds.map(id => [String(id), this.visualCadenceState(id, all, projectionContext)]));
    const continuationWatch = Object.fromEntries(documentIds.map(id => [String(id), this.continuationWatchState(id, all, projectionContext)]));
    const continuation = this.statusCompact(projectionContext);
    return {
      route: ROUTE, mode: 'photoshop-mcp', directory: this.directory,
      lock: fs.existsSync(path.join(this.directory, 'controller.lock')) ? JSON.parse(fs.readFileSync(path.join(this.directory, 'controller.lock'), 'utf8')) : null,
      pending_reports: all.filter(r => !isAbandonedRecovery(r) && r.execution !== 'not-executed' && !isTerminalBootstrapFailure(r) && !r.report).map(r => r.id),
      pending_operation_acks: all.filter(r => !isAbandonedRecovery(r) && r.execution !== 'not-executed' && r.operation_receipt && !r.operation_ack).map(r => r.id),
      pending_report_delivery_acks: [],
      operation_ack_gate: 'guard_receipt_required',
      report_delivery_gate: 'host_render_receipt_optional',
      uncertain: all.filter(r => r.phase !== 'completed' && !r.resolved).map(r => r.id),
      pending_visual_verdicts: all.filter(r => !isAbandonedRecovery(r) && r.visual && !r.verdict).map(r => r.id),
      visual_barriers: visualBarriers,
      last_checkpoint: all.filter(r => r.checkpoint).at(-1)?.checkpoint ?? null,
      progress_primary_metric: 'resolved_visual_problems',
      workflow_metrics: workflowMetrics,
      recognition_metrics: recognitionMetrics,
      latency_summary: this.latencySummary(undefined, all, projectionContext),
      continuation_timeline_exports: Object.fromEntries(documentIds.map(id => [String(id), this.continuationTimelineExport(id, all, projectionContext)])),
      visual_cadence: visualCadence,
      continuation_watch: continuationWatch,
      document_next_required_actions: Object.fromEntries(Object.entries(continuation.documents).map(([id, doc]) => [id, doc.next_required_action])),
      next_required_action: continuation.next_required_action,
      painting_state_path: this.paintingStateFile(),
      painting_state: state,
      recent: all.slice(-8).map(r => ({ id: r.id, tool: r.tool, phase: r.phase, failed: r.failed, execution: r.execution, error: r.error,
        result_excerpt: JSON.stringify(parseTexts(r.result)).slice(0, 1000),
        summary: r.summary, report: r.report, preview: r.preview, verdict: r.verdict, latency: r.latency ?? null, file: this.file(r.id) })),
    };
  }
  statusCompact(suppliedProjectionContext: GuardProjectionContext | undefined = undefined) {
    const baseProjection = suppliedProjectionContext ?? this.captureProjectionContext();
    const all = baseProjection.records.map(r => this.hasDurableNotExecutedProof(r)
      ? this.finalizeDurableNotExecuted(r, 'status_compact_not_executed_cleanup')
      : r);
    const projectionContext = { ...baseProjection, records: all };
    const state = projectionContext.paintingState;
    const documentIds = [...new Set([
      ...all.map(r => r.args?.document_id).filter(id => Number.isSafeInteger(id) && id > 0),
      ...Object.keys(state.documents ?? {}).map(Number).filter(id => Number.isSafeInteger(id) && id > 0),
    ])];
    const pendingReports = all.filter(r => !isAbandonedRecovery(r) && r.execution !== 'not-executed' && !isTerminalBootstrapFailure(r) && !r.report).map(r => r.id);
    const pendingAcks = all.filter(r => !isAbandonedRecovery(r) && r.execution !== 'not-executed' && r.operation_receipt && !r.operation_ack).map(r => r.id);
    const pendingOperationAckDetails = all
      .filter(r => !isAbandonedRecovery(r) && r.execution !== 'not-executed' && r.operation_receipt && !r.operation_ack)
      .map(r => ({
        operation_id: r.id,
        protocol: OPERATION_ACK_PROTOCOL,
        receipt_protocol: r.operation_receipt.protocol,
        receipt_token: r.operation_receipt.token,
        issued_at: r.operation_receipt.issued_at,
      }));
    const uncertain = all.filter(r => r.phase !== 'completed' && !r.resolved).map(r => r.id);
    const pendingVerdicts = all.filter(r => !isAbandonedRecovery(r) && r.visual && !r.verdict).map(r => r.id);
    const pendingVisualVerdictDetails = all
      .filter(r => !isAbandonedRecovery(r) && r.visual && !r.verdict && r.preview)
      .map(r => ({
        operation_id: r.id,
        preview_id: r.id,
        sha256: r.preview.sha256,
        materialized_path: r.preview.materialized_path,
        document_id: r.args?.document_id ?? null,
        canvas: {
          width: r.preview.canvas_width ?? null,
          height: r.preview.canvas_height ?? null,
        },
        crop: r.preview.focus?.region ? {
          region: r.preview.focus.region,
          canvas_width: r.preview.canvas_width ?? null,
          canvas_height: r.preview.canvas_height ?? null,
          width: r.preview.focus.width ?? null,
          height: r.preview.focus.height ?? null,
          scale_x: r.preview.focus.scale_x ?? null,
          scale_y: r.preview.focus.scale_y ?? null,
        } : null,
        ...(r.visual_review_profile ? { review_profile: r.visual_review_profile } : {}),
        ...(r.pending_review ? { review_state: r.pending_review } : {}),
        ...(this.visualDeliveryDebt(r) ? { delivery_debt: this.visualDeliveryDebt(r) } : {}),
        ...(Array.isArray(r.review_evidence)
          && r.review_evidence.some(item => item.bound_whole_sha256 === r.preview.sha256)
          ? { review_evidence: r.review_evidence.filter(item => item.bound_whole_sha256 === r.preview.sha256) }
          : {}),
      }));
    const activeJobs = projectionContext.activeJobs;
    const documents = Object.fromEntries(documentIds.map(id => {
      const doc = state.documents?.[String(id)] ?? { document_id: id };
      const barrier = this.synchronizeVisualBarrier(id, all, projectionContext) ?? null;
      const metrics = this.workflowMetrics(id, all, projectionContext);
      const recognition = this.recognitionMetrics(id, all, projectionContext);
      const cadence = this.visualCadenceState(id, all, projectionContext);
      const continuationWatch = this.continuationWatchState(id, all, projectionContext);
      return [String(id), {
        document_id: id,
        current_frame: doc.current_frame ? {
          operation_id: doc.current_frame.operation_id,
          sha256: doc.current_frame.sha256,
          path: doc.current_frame.path,
          accepted: !!doc.current_frame.accepted,
          acceptance_scope: doc.current_frame.acceptance_scope ?? null,
          goal_confirmation: doc.current_frame.goal_confirmation ?? null,
        } : null,
        accepted_frame: doc.accepted_frame ? {
          operation_id: doc.accepted_frame.operation_id,
          sha256: doc.accepted_frame.sha256,
          path: doc.accepted_frame.path,
          acceptance_scope: doc.accepted_frame.acceptance_scope ?? 'legacy_unknown',
          goal_confirmation: doc.accepted_frame.goal_confirmation ?? 'legacy_unknown',
        } : null,
        confirmed_goal_frame: doc.confirmed_goal_frame ? {
          operation_id: doc.confirmed_goal_frame.operation_id,
          sha256: doc.confirmed_goal_frame.sha256,
          path: doc.confirmed_goal_frame.path,
          goal_confirmation: doc.confirmed_goal_frame.goal_confirmation ?? 'confirmed_by_visual_verdict',
        } : null,
        primary_artistic_anchor: doc.primary_artistic_anchor ? {
          operation_id: doc.primary_artistic_anchor.operation_id,
          sha256: doc.primary_artistic_anchor.sha256,
          path: doc.primary_artistic_anchor.path,
          rationale: doc.primary_artistic_anchor.rationale,
          directive_id: doc.primary_artistic_anchor.directive_id ?? null,
          promoted_at: doc.primary_artistic_anchor.promoted_at ?? null,
        } : null,
        alternative_artistic_anchors: Array.isArray(doc.alternative_artistic_anchors)
          ? doc.alternative_artistic_anchors.map(anchor => ({
              operation_id: anchor.operation_id,
              sha256: anchor.sha256,
              path: anchor.path,
              rationale: anchor.rationale,
              directive_id: anchor.directive_id ?? null,
              promoted_at: anchor.promoted_at ?? null,
            }))
          : [],
        final_artistic_frame: doc.final_artistic_frame ? {
          operation_id: doc.final_artistic_frame.operation_id,
          sha256: doc.final_artistic_frame.sha256,
          path: doc.final_artistic_frame.path,
          selection: doc.final_artistic_frame.selection ?? null,
          selected_at: doc.final_artistic_frame.selected_at ?? null,
        } : null,
        active_problem: doc.active_problem?.problem_id ?? null,
        current_stage: doc.current_stage ?? null,
        last_stage_reset: doc.last_stage_reset ?? null,
        logical_layer_owners: this.semanticLayerOwners(id, all, projectionContext),
        scene_ownership_plan: this.sceneOwnershipPlan(id, all, projectionContext),
        scene_geometry_model: this.sceneGeometryModel(id, all, projectionContext),
        scene_lighting_color_model: this.sceneLightingColorModel(id, all, projectionContext),
        scene_camera_imaging_model: this.sceneCameraImagingModel(id, all, projectionContext),
        geometry_preflight: this.geometryPreflight(id, all, projectionContext),
        geometry_binding_states: this.geometryBindingStates(id, all, projectionContext),
        geometry_completion_debt: this.geometryCompletionDebt(id, all, projectionContext),
        lighting_color_binding_states: this.lightingColorBindingStates(id, all, projectionContext),
        physical_effect_completion_debt: this.physicalEffectCompletionDebt(id, all, projectionContext),
        camera_binding_states: this.cameraBindingStates(id, all, projectionContext),
        attention_binding_states: this.attentionBindingStates(id, all, projectionContext),
        active_scale: doc.active_scale ?? null,
        workflow_lifecycle: cadence.workflow_lifecycle,
        checkpoint_due_before_next_visual_mutation: cadence.checkpoint.due,
        checkpoint_due_reason: cadence.checkpoint.reason,
        checkpoint_state: cadence.checkpoint,
        painting_profile: doc.painting_profile ?? (doc.process_dir ? 'nontrivial_painting' : null),
        process_dir: doc.process_dir ?? null,
        profile_transition: doc.profile_transition ?? null,
        global_brief_outcome: doc.global_brief_outcome ?? doc.global_brief_assessment?.outcome ?? 'not-evaluated',
        global_brief_assessment: doc.global_brief_assessment ?? {
          outcome: 'not-evaluated',
          validation: 'not-independently-validated',
        },
        unresolved_hard_brief_debt: this.unresolvedHardBriefDebt(id, projectionContext),
        brush_preflight: doc.brush_preflight ? {
          completed: !!doc.brush_preflight.completed,
          inventory_observed: !!doc.brush_preflight.inventory_observed,
          inventory_total: doc.brush_preflight.inventory_total ?? null,
          inventory_scope: doc.brush_preflight.inventory_scope ?? null,
          brush_pack_id: doc.brush_preflight.brush_pack_id ?? null,
          roles: (doc.brush_preflight.roles ?? []).map(role => ({
            role_id: role.role_id,
            preferred_preset: role.preferred_preset,
            material_roles: role.material_roles ?? [],
            visual_intents: role.visual_intents ?? [],
            pressure_policy: role.pressure_policy,
            probe_status: role.probe_status,
            profile_id: role.profile_id ?? null,
          })),
        } : null,
        brush_pack_policy: doc.brush_pack_policy ?? null,
        art_director: doc.art_director ? {
          directive_id: doc.art_director.directive_id,
          revision: doc.art_director.revision,
          status: doc.art_director.status,
          goal: doc.art_director.goal,
          artistic_evaluation_contract: doc.art_director.artistic_evaluation_contract ?? null,
          global_brief_assessment: doc.art_director.global_brief_assessment ?? null,
          global_brief_completion_allowed: !!doc.art_director.global_brief_completion_allowed,
          composition_freedom: doc.art_director.composition_freedom ?? null,
          composition_exploration: doc.art_director.composition_exploration ? {
            hypotheses: doc.art_director.composition_exploration.hypotheses ?? [],
            selected_id: doc.art_director.composition_exploration.selected_id ?? null,
            selection_reason: doc.art_director.composition_exploration.selection_reason ?? null,
            material_choice_unresolved: !!doc.art_director.composition_exploration.material_choice_unresolved,
            ...(doc.art_director.composition_exploration.normalized_from_legacy_mode
              ? { normalized_from_legacy_mode: doc.art_director.composition_exploration.normalized_from_legacy_mode }
              : {}),
          } : null,
          brush_pack_scene_plan: doc.art_director.brush_pack_scene_plan ?? null,
          perceptual_hierarchy: doc.art_director.perceptual_hierarchy ?? null,
          priorities: doc.art_director.priorities ?? [],
          current_task_id: doc.art_director.current_task_id ?? null,
          review_after_microplans: doc.art_director.review_after_microplans,
          completed_microplans: doc.art_director.completed_microplans ?? 0,
          task_review_after_microplans: doc.art_director.task_review_after_microplans ?? null,
          task_successful_microplans: doc.art_director.task_successful_microplans ?? 0,
          task_autonomy_remaining: doc.art_director.task_autonomy_remaining ?? null,
          review_due: !!doc.art_director.review_due,
          review_reason: doc.art_director.review_reason ?? null,
          interrupt: doc.art_director.interrupt ?? null,
          physical_stack_check: doc.art_director.physical_stack_check ?? null,
          value_check: doc.art_director.value_check ?? null,
          refinement_check: doc.art_director.refinement_check ?? null,
          last_stage_reset: doc.art_director.last_stage_reset ?? null,
          incomplete_hypothesis: doc.art_director.incomplete_hypothesis ?? null,
          last_incomplete_hypothesis_resolution: doc.art_director.last_incomplete_hypothesis_resolution ?? null,
          whole_image_glance: doc.art_director.whole_image_glance ?? {
            due: false,
            reason: null,
            last_record: null,
            history: [],
          },
          tasks: (doc.art_director.tasks ?? []).map(task => ({
            task_id: task.task_id,
            summary: task.summary,
            status: task.status,
            successful_microplans: task.successful_microplans ?? 0,
            region: task.region ?? null,
            allowed_scales: task.allowed_scales ?? [],
            allowed_global_changes: task.allowed_global_changes ?? [],
            ...(Array.isArray(task.perceptual_zone_ids) && task.perceptual_zone_ids.length
              ? { perceptual_zone_ids: task.perceptual_zone_ids }
              : {}),
            ...(Array.isArray(task.affected_relations) && task.affected_relations.length
              ? { affected_relations: task.affected_relations }
              : {}),
            ...(Array.isArray(task.affected_qualities) && task.affected_qualities.length
              ? { affected_qualities: task.affected_qualities }
              : {}),
          })),
        } : null,
        artistic_losses: Object.values(doc.artistic_losses ?? {}),
        relation_review: doc.relation_review ?? null,
        primary_blocker: this.primaryBlockingProblem(doc.visual_problems) ?? null,
        primary_next_action: this.primaryBlockingProblem(doc.visual_problems)
          ? `resolve primary artistic problem ${this.primaryBlockingProblem(doc.visual_problems).problem_id}`
          : null,
        problem_backlog: Object.values(doc.visual_problems ?? {})
          .filter(problem => problem?.status !== 'resolved')
          .filter(problem => problem?.problem_id !== this.primaryBlockingProblem(doc.visual_problems)?.problem_id)
          .map(problem => ({
            problem_id: problem.problem_id,
            scale: problem.scale,
            severity: problem.severity,
            status: problem.status,
            ...(Array.isArray(problem.depends_on_problem_ids) && problem.depends_on_problem_ids.length
              ? { depends_on_problem_ids: problem.depends_on_problem_ids }
              : {}),
          })),
        largest_open_must_fix: this.largestOpenMustFix(doc.visual_problems) ?? null,
        priority_review_required: !!doc.priority_review_required,
        last_critique: doc.last_critique ? {
          operation_id: doc.last_critique.operation_id ?? null,
          verdict: doc.last_critique.verdict,
          disposition: doc.last_critique.disposition,
          execution_outcome: doc.last_critique.execution_outcome ?? 'uncertain',
          artistic_outcome: doc.last_critique.artistic_outcome ?? (
            doc.last_critique.target_resolved === 'yes' ? 'resolved'
              : doc.last_critique.target_resolved === 'no' ? 'unresolved'
                : 'uncertain'
          ),
          comparison_metric: doc.last_critique.comparison_metric ?? null,
          target_resolved: doc.last_critique.target_resolved,
          observations: doc.last_critique.observations ?? [],
          primary_mismatch: doc.last_critique.primary_mismatch ?? null,
          uncertainty: doc.last_critique.uncertainty ?? null,
          ...(Array.isArray(doc.last_critique.affected_relations) && doc.last_critique.affected_relations.length
            ? { affected_relations: doc.last_critique.affected_relations }
            : {}),
          ...(Array.isArray(doc.last_critique.affected_qualities) && doc.last_critique.affected_qualities.length
            ? { affected_qualities: doc.last_critique.affected_qualities }
            : {}),
          global_readability: doc.last_critique.global_readability ?? 'unknown',
          goal_assessment: doc.last_critique.goal_assessment ?? {
            status: doc.last_critique.target_resolved === 'yes' ? 'legacy_claimed_resolved' :
              doc.last_critique.target_resolved === 'no' ? 'unresolved' :
                doc.last_critique.target_resolved === 'uncertain' ? 'uncertain' : 'legacy_unknown',
          },
          execution_effect: doc.last_critique.significance?.execution_effect,
        } : null,
        unresolved_visual_basis: doc.last_critique && doc.last_critique.target_resolved !== 'yes' ? {
          operation_id: doc.last_critique.operation_id ?? null,
          status: doc.last_critique.target_resolved === 'uncertain' ? 'uncertain' : 'unresolved',
          observations: doc.last_critique.observations ?? [],
          primary_mismatch: doc.last_critique.primary_mismatch ?? null,
          uncertainty: doc.last_critique.uncertainty ?? null,
        } : null,
        visual_barrier: barrier,
        workflow_stall: metrics.workflow_stall,
        decision_loop_stall: cadence.decision_loop_stall,
        silent_stall: continuationWatch.silent_stall,
        silent_stall_reason: continuationWatch.silent_stall_reason,
        seconds_since_last_advancement: continuationWatch.seconds_since_last_advancement,
        seconds_since_last_visual_operation: metrics.seconds_since_last_visual_operation,
        seconds_since_last_meaningful_visual_change: metrics.seconds_since_last_meaningful_visual_change,
        artistic_throughput: metrics.artistic_throughput,
        recognition_metrics: recognition,
        method_usage: paintingMethodUsage(all, id),
        latency_summary: this.latencySummary(id, all, projectionContext),
        visual_cadence: cadence,
        continuation_watch: continuationWatch,
        resolved_visual_problems: metrics.resolved_visual_problems,
        next_required_action: this.documentNextRequiredAction(id, all, projectionContext),
      }];
    }));
    const documentAction = Object.values(documents).map(doc => doc.next_required_action).find(action => action !== 'ready');
    const silentStalls = Object.values(documents)
      .filter(doc => doc.silent_stall)
      .map(doc => ({
        document_id: doc.document_id,
        reason: doc.silent_stall_reason,
        seconds_since_last_advancement: doc.seconds_since_last_advancement,
        next_required_action: doc.next_required_action,
      }));
    return {
      route: ROUTE,
      mode: 'photoshop-mcp',
      lock: fs.existsSync(path.join(this.directory, 'controller.lock')) ? JSON.parse(fs.readFileSync(path.join(this.directory, 'controller.lock'), 'utf8')) : null,
      pending_reports: pendingReports,
      pending_operation_acks: pendingAcks,
      pending_operation_ack_details: pendingOperationAckDetails,
      pending_report_delivery_acks: [],
      operation_ack_gate: 'guard_receipt_required',
      report_delivery_gate: 'host_render_receipt_optional',
      uncertain,
      pending_visual_verdicts: pendingVerdicts,
      pending_visual_verdict_details: pendingVisualVerdictDetails,
      active_jobs: activeJobs,
      last_checkpoint: all.filter(r => r.checkpoint).at(-1)?.checkpoint ?? null,
      silent_stalls: silentStalls,
      latency_summary: this.latencySummary(undefined, all, projectionContext),
      documents,
      next_required_action: activeJobs.length ? activeJobs.at(-1).poll_command
        : uncertain.length ? `reconcile uncertain operation ${uncertain[0]}`
          : documentAction ?? 'ready',
    };
  }
  activeJobs(
    documentId: number | undefined,
    suppliedJobs: GuardActiveJobProjection[] | undefined = undefined,
    capturedAt = Date.now()
  ): GuardActiveJobProjection[] {
    if (Array.isArray(suppliedJobs)) {
      return activeJobsForDocument(suppliedJobs, documentId);
    }
    const root = jobsDirectory(this.directory);
    if (!fs.existsSync(root)) return [];
    const jobs = [];
    for (const name of fs.readdirSync(root)) {
      if (!name.startsWith('job-')) continue;
      try {
        const job = this.readJobProjection(name, capturedAt);
        if (!['starting', 'running', 'stalled', 'uncertain'].includes(job.state)) continue;
        const input = JSON.parse(fs.readFileSync(job.files.input, 'utf8'));
        const operation = input?.next_operation;
        if (Number.isSafeInteger(documentId) && documentId > 0 && operation?.args?.document_id !== documentId) continue;
        const operationRecord = typeof operation?.id === 'string' ? this.read(operation.id) : undefined;
        if (isAbandonedRecovery(operationRecord)) continue;
        jobs.push({
          job_id: name,
          state: job.state,
          pid: job.pid ?? null,
          operation_id: operation?.id ?? null,
          document_id: operation?.args?.document_id ?? null,
          summary: operation?.summary ?? null,
          purpose: operation?.purpose ?? null,
          stall_reason: job.stall_reason ?? null,
          heartbeat_age_ms: job.heartbeat_age_ms ?? null,
          deadline_at: job.deadline_at ?? null,
          narrative: operationNarrative(
            operation,
            job.state === 'uncertain' || job.state === 'stalled'
              ? 'uncertain'
              : job.state === 'starting' ? 'starting' : 'running'
          ),
          poll_command: `photoshop_guard_job_poll(job_id="${name}")`,
        });
      } catch {
        // A corrupt/partial job must not make resume itself unavailable. The
        // operation journal remains the authoritative recovery record.
      }
    }
    return jobs.sort((a, b) => String(a.job_id).localeCompare(String(b.job_id)));
  }
  resume(documentId) {
    const baseProjection = this.captureProjectionContext();
    const all = baseProjection.records.map(r => this.hasDurableNotExecutedProof(r)
      ? this.finalizeDurableNotExecuted(r, 'resume_not_executed_cleanup')
      : r);
    const projectionContext = { ...baseProjection, records: all };
    const compact = this.statusCompact(projectionContext);
    const ids = Object.keys(compact.documents).map(Number);
    const selectedId = Number.isSafeInteger(documentId) && documentId > 0
      ? documentId
      : ids.find(id => compact.documents[String(id)]?.current_frame) ?? ids[0];
    const document = selectedId ? compact.documents[String(selectedId)] : undefined;
    if (selectedId && !document) throw new Error(`Unknown document_id ${selectedId}`);
    const latest = selectedId
      ? [...all].reverse().find(r => r.args?.document_id === selectedId)
      : all.at(-1);
    const activeJobs = activeJobsForDocument(projectionContext.activeJobs, selectedId);
    const activeJob = activeJobs.at(-1) ?? null;
    const pendingOperationAck = [...all].reverse().find(r =>
      !isAbandonedRecovery(r) && r.operation_receipt && !r.operation_ack && (!selectedId || r.args?.document_id === selectedId)
    );
    const pendingVisualVerdict = [...all].reverse().find(r =>
      !isAbandonedRecovery(r) && r.visual && !r.verdict && r.preview && (!selectedId || r.args?.document_id === selectedId)
    );
    const latestNarrativeState = activeJob
      ? activeJob.state
      : latest?.phase !== 'completed' ? 'uncertain'
        : 'completed';
    const nextRequiredAction = compact.next_required_action !== 'ready'
      ? compact.next_required_action
      : document?.next_required_action ?? 'ready';
    const baseResumeSummary = activeJob?.narrative ?? (latest ? operationNarrative(latest, latestNarrativeState) : {
        progress_id: 'photoshop-resume:idle',
        operation_id: null,
        state: 'idle',
        now: 'рабочая сессия восстановлена',
        why: 'продолжить с последнего подтверждённого состояния без повторного выполнения действий',
        photoshop: 'активной операции нет',
        next: nextRequiredAction,
      });
    const resumeSummary = {
      ...baseResumeSummary,
      next: nextRequiredAction,
      text: [
        `Сейчас: ${baseResumeSummary.now}`,
        `Почему: ${baseResumeSummary.why}`,
        `Photoshop: ${baseResumeSummary.photoshop}`,
        ...(document?.unresolved_visual_basis?.primary_mismatch
          ? [`Нерешённое визуальное основание: ${document.unresolved_visual_basis.primary_mismatch}`]
          : []),
        `Следом: ${nextRequiredAction}`,
      ].join('\n'),
    };
    return {
      route: ROUTE,
      mode: 'photoshop-mcp-resume',
      document_id: selectedId ?? null,
      document: document ?? null,
      last_checkpoint: compact.last_checkpoint,
      pending_reports: compact.pending_reports,
      pending_operation_acks: compact.pending_operation_acks,
      pending_operation_ack: pendingOperationAck ? {
        operation_id: pendingOperationAck.id,
        protocol: OPERATION_ACK_PROTOCOL,
        receipt_protocol: pendingOperationAck.operation_receipt.protocol,
        receipt_token: pendingOperationAck.operation_receipt.token,
        issued_at: pendingOperationAck.operation_receipt.issued_at,
      } : null,
      pending_report_delivery_acks: compact.pending_report_delivery_acks,
      uncertain: compact.uncertain,
      pending_visual_verdicts: compact.pending_visual_verdicts,
      pending_visual_verdict: pendingVisualVerdict ? {
        operation_id: pendingVisualVerdict.id,
        preview_id: pendingVisualVerdict.id,
        sha256: pendingVisualVerdict.preview.sha256,
        materialized_path: pendingVisualVerdict.preview.materialized_path,
        document_id: pendingVisualVerdict.args?.document_id ?? null,
        canvas: {
          width: pendingVisualVerdict.preview.canvas_width ?? null,
          height: pendingVisualVerdict.preview.canvas_height ?? null,
        },
        crop: pendingVisualVerdict.preview.focus?.region ? {
          region: pendingVisualVerdict.preview.focus.region,
          canvas_width: pendingVisualVerdict.preview.canvas_width ?? null,
          canvas_height: pendingVisualVerdict.preview.canvas_height ?? null,
          width: pendingVisualVerdict.preview.focus.width ?? null,
          height: pendingVisualVerdict.preview.focus.height ?? null,
          scale_x: pendingVisualVerdict.preview.focus.scale_x ?? null,
          scale_y: pendingVisualVerdict.preview.focus.scale_y ?? null,
        } : null,
        ...(pendingVisualVerdict.visual_review_profile ? { review_profile: pendingVisualVerdict.visual_review_profile } : {}),
        ...(pendingVisualVerdict.pending_review ? { review_state: pendingVisualVerdict.pending_review } : {}),
        ...(this.visualDeliveryDebt(pendingVisualVerdict) ? { delivery_debt: this.visualDeliveryDebt(pendingVisualVerdict) } : {}),
        ...(Array.isArray(pendingVisualVerdict.review_evidence)
          && pendingVisualVerdict.review_evidence.some(item => item.bound_whole_sha256 === pendingVisualVerdict.preview.sha256)
          ? { review_evidence: pendingVisualVerdict.review_evidence.filter(item => item.bound_whole_sha256 === pendingVisualVerdict.preview.sha256) }
          : {}),
      } : null,
      active_job: activeJob,
      continuation_watch: document?.continuation_watch ?? null,
      checkpoint_due_before_next_visual_mutation: document?.checkpoint_due_before_next_visual_mutation ?? false,
      checkpoint_due_reason: document?.checkpoint_due_reason ?? null,
      checkpoint_state: document?.checkpoint_state ?? null,
      unresolved_visual_basis: document?.unresolved_visual_basis ?? null,
      resume_summary: resumeSummary,
      last_operation: latest ? {
        id: latest.id,
        tool: latest.tool,
        phase: latest.phase,
        failed: !!latest.failed,
        summary: latest.summary,
        execution: latest.execution,
      } : null,
      next_required_action: nextRequiredAction,
      canonical_next_command: activeJob
        ? activeJob.poll_command
        : 'photoshop_guard_cycle_auto',
    };
  }
  unresolvedHardBriefDebt(documentId, projectionContext = undefined) {
    const paintingState = projectionContext ? projectionContext.paintingState : this.paintingState();
    const doc = paintingState.documents?.[String(documentId)] ?? {};
    const items = doc.art_director?.artistic_evaluation_contract?.brief_items;
    if (!Array.isArray(items)) return [];
    const resultRows = Array.isArray(doc.global_brief_assessment?.brief_item_results)
      ? doc.global_brief_assessment.brief_item_results
      : [];
    const resultById = new Map(resultRows.map(row => [row.item_id, row]));
    const overrides = doc.brief_debt_overrides && typeof doc.brief_debt_overrides === 'object'
      ? doc.brief_debt_overrides
      : {};
    const currentRecords = this.currentDocumentRecords(
      documentId,
      projectionContext?.records ?? this.records(),
      projectionContext
    );
    const currentRecordIds = new Set(currentRecords.map(record => record.id));
    return items.filter(item => item?.kind === 'hard_perceptual').flatMap(item => {
      const override = overrides[item.item_id];
      if (override) {
        const sourceOperationId = textOrUndefined(override.source_operation_id);
        const sourceRecord = sourceOperationId ? this.read(sourceOperationId) : undefined;
        const sourceStillAuthoritative = !sourceOperationId || !!(
          sourceRecord
          && currentRecordIds.has(sourceOperationId)
          && sourceRecord.rolled_back !== true
          && sourceRecord.current_frame_authority !== false
          && sourceRecord.rollback?.completed !== true
        );
        if (sourceStillAuthoritative) return [structuredClone(override)];
      }
      const assessed = resultById.get(item.item_id);
      if (assessed?.state === 'MET') return [];
      if (assessed) return [structuredClone(assessed)];
      return [{
        item_id: item.item_id,
        kind: 'hard_perceptual',
        requirement: item.requirement,
        state: 'UNASSESSED',
        reason: 'No independently validated current-frame brief assessment has resolved this hard perceptual requirement yet.',
        evidence: [],
      }];
    });
  }
  validateNamedRecognitionBriefEvidence(documentId, assessment, contract, frame, projectionContext = undefined) {
    const items = Array.isArray(contract?.brief_items) ? contract.brief_items : [];
    const recognitionItems = items.filter(item => item?.kind === 'hard_perceptual' && textOrUndefined(item?.recognition_target));
    if (!recognitionItems.length) return;
    const rows = Array.isArray(assessment?.brief_item_results) ? assessment.brief_item_results : [];
    const byId = new Map(rows.map(row => [row?.item_id, row]));
    const records = this.currentDocumentRecords(
      documentId,
      projectionContext?.records ?? this.records(),
      projectionContext
    );
    const currentOperationId = textOrUndefined(frame?.operation_id);
    const currentSha = textOrUndefined(frame?.sha256)?.toLowerCase();
    const currentRecord = currentOperationId ? records.find(record => record.id === currentOperationId) : undefined;
    const artifacts = Array.isArray(currentRecord?.review_evidence) ? currentRecord.review_evidence : [];
    for (const item of recognitionItems) {
      const row = byId.get(item.item_id);
      if (row?.state !== 'MET') continue;
      const refs = Array.isArray(row.evidence)
        ? row.evidence.map(value => textOrUndefined(value)).filter(Boolean)
        : [];
      const requestedArtifactIds = refs
        .filter(value => value.startsWith('review_artifact:'))
        .map(value => value.slice('review_artifact:'.length));
      const matching = artifacts.find(evidence =>
        requestedArtifactIds.includes(evidence?.artifact_id)
        && evidence?.brief_item_id === item.item_id
        && ['object', 'micro'].includes(textOrUndefined(evidence?.review_level)?.toLowerCase())
        && textOrUndefined(evidence?.bound_whole_sha256)?.toLowerCase() === currentSha
        && evidence?.source_operation_id === currentOperationId
        && materializedEvidenceMatches(evidence)
      );
      if (!matching) {
        throw new Error(
          `hard recognition brief item ${item.item_id} (${item.recognition_target}) cannot be MET without a materialized current-frame OBJECT/MICRO review artifact bound to that brief item`
        );
      }
    }
  }
  continuationCheckpoint(documentId) {
    const resumed = this.resume(documentId);
    const selectedId = Number(resumed.document_id);
    if (!Number.isSafeInteger(selectedId) || selectedId <= 0 || !resumed.document) {
      throw new Error('continuation_checkpoint_document_required');
    }
    const document = resumed.document;
    const pending = resumed.pending_visual_verdict;
    const currentFrame = document.current_frame ?? null;
    const acceptedFrame = document.accepted_frame ?? null;
    const artisticAnchor = document.primary_artistic_anchor ?? null;
    const artDirector = document.art_director ?? null;
    return {
      protocol: 'photoshop.guard.continuation-checkpoint.v1',
      captured_at: new Date().toISOString(),
      document: { id: selectedId, incarnation: this.currentDocumentIncarnationId(selectedId) ?? null },
      current_operation_id: pending?.operation_id ?? currentFrame?.operation_id ?? resumed.last_operation?.id ?? null,
      delivered_preview: pending ? {
        operation_id: pending.operation_id,
        sha256: pending.sha256,
        materialized_path: pending.materialized_path,
        canvas: pending.canvas ?? null,
        crop: pending.crop ?? null,
      } : currentFrame ? {
        operation_id: currentFrame.operation_id,
        sha256: currentFrame.sha256,
        materialized_path: currentFrame.path,
        canvas: null,
        crop: null,
      } : null,
      visual_verdict_pending: !!pending,
      active_problem: document.active_problem ? {
        id: document.active_problem,
        stage: document.current_stage ?? null,
        scale: document.active_scale ?? null,
        severity: document.largest_open_must_fix?.severity ?? null,
      } : null,
      accepted_anchor: artisticAnchor ?? acceptedFrame,
      last_checkpoint: resumed.last_checkpoint ?? null,
      next_required_action: resumed.next_required_action,
      canonical_next_command: resumed.canonical_next_command,
      art_run: document.process_dir ?? null,
      planner: artDirector?.directive_id ? {
        directive_id: artDirector.directive_id,
        task_id: artDirector.current_task_id ?? null,
      } : null,
    };
  }
  persistContinuationCheckpoint(documentId) {
    const checkpoint = this.continuationCheckpoint(documentId);
    const file = path.join(this.directory, 'continuation-checkpoint.json');
    atomicJson(file, checkpoint);
    return { file, checkpoint };
  }
  verifyContinuationCheckpoint(checkpoint) {
    if (!checkpoint || checkpoint.protocol !== 'photoshop.guard.continuation-checkpoint.v1') {
      return { ok: false, reason: 'continuation_checkpoint_protocol_mismatch' };
    }
    const documentId = Number(checkpoint.document?.id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      return { ok: false, reason: 'continuation_checkpoint_document_required' };
    }
    let current;
    try {
      current = this.continuationCheckpoint(documentId);
    } catch {
      return { ok: false, reason: 'continuation_checkpoint_document_unavailable' };
    }
    const mismatch = (field, expected, actual) => ({
      ok: false,
      reason: 'continuation_checkpoint_stale',
      mismatch: { field, expected: expected ?? null, actual: actual ?? null },
    });
    if (checkpoint.document?.incarnation !== current.document?.incarnation) {
      return mismatch('document.incarnation', checkpoint.document?.incarnation, current.document?.incarnation);
    }
    if (checkpoint.current_operation_id !== current.current_operation_id) {
      return mismatch('current_operation_id', checkpoint.current_operation_id, current.current_operation_id);
    }
    if (!!checkpoint.visual_verdict_pending !== !!current.visual_verdict_pending) {
      return mismatch('visual_verdict_pending', !!checkpoint.visual_verdict_pending, !!current.visual_verdict_pending);
    }
    const expectedPreview = checkpoint.delivered_preview ?? null;
    const actualPreview = current.delivered_preview ?? null;
    for (const field of ['operation_id', 'sha256', 'materialized_path']) {
      if ((expectedPreview?.[field] ?? null) !== (actualPreview?.[field] ?? null)) {
        return mismatch(`delivered_preview.${field}`, expectedPreview?.[field], actualPreview?.[field]);
      }
    }
    if ((checkpoint.art_run ?? null) !== (current.art_run ?? null)) {
      return mismatch('art_run', checkpoint.art_run, current.art_run);
    }
    return {
      ok: true,
      protocol: 'photoshop.guard.continuation-verification.v1',
      document: current.document,
      operation_id: current.current_operation_id,
      delivered_preview: current.delivered_preview,
      visual_verdict_pending: current.visual_verdict_pending,
      next_required_action: current.next_required_action,
      canonical_next_command: current.canonical_next_command,
    };
  }
  loadAndVerifyContinuationCheckpoint() {
    const file = path.join(this.directory, 'continuation-checkpoint.json');
    if (!fs.existsSync(file)) return { ok: false, reason: 'continuation_checkpoint_missing', file };
    let checkpoint;
    try {
      checkpoint = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return { ok: false, reason: 'continuation_checkpoint_invalid_json', file };
    }
    return { ...this.verifyContinuationCheckpoint(checkpoint), file };
  }
}
function fingerprintFile(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function materializedEvidenceMatches(evidence) {
  const sha256 = textOrUndefined(evidence?.sha256)?.toLowerCase();
  const materializedPath = textOrUndefined(evidence?.materialized_path ?? evidence?.path);
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256) || !materializedPath) return false;
  try {
    return fs.existsSync(materializedPath)
      && fs.statSync(materializedPath).isFile()
      && fingerprintFile(materializedPath) === sha256;
  } catch {
    return false;
  }
}
function visualEvidenceSignature(record, preview) {
  const files = [
    record?.before_preview?.materialized_path,
    record?.before_preview?.focus?.materialized_path,
    record?.baseline_preview?.materialized_path,
    record?.baseline_preview?.focus?.materialized_path,
    preview?.materialized_path,
    preview?.focus?.materialized_path,
  ].filter((value, index, all) => typeof value === 'string' && value && all.indexOf(value) === index);
  return files.map(file => {
    try {
      const stat = fs.statSync(file);
      return `${file}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      return `${file}:missing`;
    }
  }).join('|');
}
