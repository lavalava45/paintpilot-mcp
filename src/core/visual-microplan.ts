import type { ToolResult } from './tool-registry.js';
import { parseEdgeIntents, type EdgeIntent } from './edge-control.js';
import {
  PAINTING_CONSTRUCTION_ROLES,
  PAINTING_VISUAL_INTENTS,
  type PaintingConstructionRole,
  type PaintingVisualIntent,
} from './painting-method-palette.js';
import {
  normalizeMaterialResponsePlan,
  type MaterialResponsePlan,
} from './material-response.js';
import { normalizeGeometryBinding, type GeometryBinding } from './geometry-binding.js';
import { normalizeCameraBinding, type CameraBinding } from './scene-camera-imaging-model.js';
import { normalizeAttentionBinding, type AttentionBinding } from './perceptual-hierarchy.js';
import { normalizeProblemLinks } from './guard/problem-links.js';

export const VISUAL_MICROPLAN_ACTION_CLASSES = [
  'ADD',
  'REFINE',
  'REPLACE',
  'ERASE',
  'ROLLBACK',
] as const;

export type VisualMicroPlanActionClass = (typeof VISUAL_MICROPLAN_ACTION_CLASSES)[number];

export const VISUAL_MICROPLAN_VERDICTS = ['improvement', 'neutral', 'regression'] as const;
export type VisualMicroPlanVerdict = (typeof VISUAL_MICROPLAN_VERDICTS)[number];

export const VISUAL_MICROPLAN_TARGET_RESOLUTION = ['yes', 'no', 'uncertain'] as const;
export type VisualMicroPlanTargetResolution = (typeof VISUAL_MICROPLAN_TARGET_RESOLUTION)[number];

export const VISUAL_MICROPLAN_DISPOSITIONS = ['accept', 'correct', 'rollback'] as const;
export type VisualMicroPlanDisposition = (typeof VISUAL_MICROPLAN_DISPOSITIONS)[number];

export const VISUAL_MICROPLAN_SIGNIFICANCE_MODES = ['normal', 'subtle_local'] as const;
export type VisualMicroPlanSignificanceMode = (typeof VISUAL_MICROPLAN_SIGNIFICANCE_MODES)[number];

export const VISUAL_MICROPLAN_RISKS = ['low', 'moderate', 'high'] as const;
export type VisualMicroPlanRisk = (typeof VISUAL_MICROPLAN_RISKS)[number];

export const VISUAL_MICROPLAN_METHOD_CLASSES = [
  'paint',
  'line',
  'region',
  'smudge',
  'erase',
  'preset-brush',
  'fill',
  'gradient',
  'mask',
  'filter',
  'transform',
  'rollback',
] as const;
export type VisualMicroPlanMethodClass = (typeof VISUAL_MICROPLAN_METHOD_CLASSES)[number];

export const VISUAL_MICROPLAN_LOGICAL_LAYER_DECISIONS = [
  'create-new',
  'continue-logical-layer',
  'temporary-hypothesis',
  'keep',
  'adjust',
  'discard',
  'merge',
] as const;
export type VisualMicroPlanLogicalLayerDecision = (typeof VISUAL_MICROPLAN_LOGICAL_LAYER_DECISIONS)[number];

export const VISUAL_MICROPLAN_ROLLBACK_VALUES = ['low', 'moderate', 'high'] as const;
export type VisualMicroPlanRollbackValue = (typeof VISUAL_MICROPLAN_ROLLBACK_VALUES)[number];

export const VISUAL_MICROPLAN_LAYER_CHANGE_KINDS = [
  'continuation',
  'new-object',
  'new-material',
  'new-light',
  'new-plane',
  'other',
] as const;
export type VisualMicroPlanLayerChangeKind = (typeof VISUAL_MICROPLAN_LAYER_CHANGE_KINDS)[number];

export const VISUAL_MICROPLAN_PHYSICAL_ROLES = [
  'opaque-mass',
  'support-surface',
  'transmissive-surface',
  'cast-shadow',
  'surface-condition',
  'optical-effect',
  'atmosphere',
  'camera-post',
  'other',
] as const;
export type VisualMicroPlanPhysicalRole = (typeof VISUAL_MICROPLAN_PHYSICAL_ROLES)[number];

export const VISUAL_MICROPLAN_OPACITY_ROLES = [
  'opaque',
  'transmissive',
  'transparent-overlay',
  'effect-only',
  'not-applicable',
] as const;
export type VisualMicroPlanOpacityRole = (typeof VISUAL_MICROPLAN_OPACITY_ROLES)[number];

export const VISUAL_MICROPLAN_CONSTRUCTION_TIERS = [
  'primary',
  'secondary',
  'tertiary',
  'surface',
] as const;
export type VisualMicroPlanConstructionTier = (typeof VISUAL_MICROPLAN_CONSTRUCTION_TIERS)[number];

export const VISUAL_MICROPLAN_NEGATIVE_SPACE_RELATIONS = [
  'aperture-of',
  'negative-space-of',
] as const;
export type VisualMicroPlanNegativeSpaceRelation =
  (typeof VISUAL_MICROPLAN_NEGATIVE_SPACE_RELATIONS)[number];

export const VISUAL_MICROPLAN_CAUSAL_EFFECT_RELATIONS = [
  'reflection_of',
  'shadow_from',
  'emission_from',
] as const;
export type VisualMicroPlanCausalEffectRelation =
  (typeof VISUAL_MICROPLAN_CAUSAL_EFFECT_RELATIONS)[number];

export const VISUAL_MICROPLAN_SURFACE_FRAME_DISTRIBUTIONS = [
  'free',
  'directional',
  'perspective-regular',
] as const;
/** The wire fields and ranges enforced by the VisualMicroPlan surface-frame parser. */
export const VISUAL_MICROPLAN_SURFACE_FRAME_SCHEMA = {
  type: 'object',
  properties: {
    axes: { type: 'array', minItems: 1, maxItems: 3, items: {
      type: 'object', properties: {
        id: { type: 'string', minLength: 1 },
        angle_degrees: { type: 'number', minimum: -180, maximum: 180 },
        weight: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
      }, required: ['id', 'angle_degrees'], additionalProperties: false,
    } },
    convergence_anchor: { type: 'object', properties: {
      x: { type: 'number' }, y: { type: 'number' },
    }, required: ['x', 'y'], additionalProperties: false },
    scene_vanishing_family_ids: { type: 'array', items: { type: 'string' } },
    scene_support_plane_id: { type: 'string' },
    depth_progression: { type: 'object', properties: {
      near_scale: { type: 'number', exclusiveMinimum: 0 },
      far_scale: { type: 'number', exclusiveMinimum: 0 },
      direction: { type: 'string', enum: ['toward-anchor', 'away-from-anchor'] },
    }, required: ['near_scale', 'far_scale', 'direction'], additionalProperties: false },
    distribution: { type: 'string', enum: [...VISUAL_MICROPLAN_SURFACE_FRAME_DISTRIBUTIONS] },
    local_exceptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['axes'],
  additionalProperties: false,
  description: 'For perspective-regular supply convergence_anchor; axes ids must be unique. All geometry/direction values are artist-chosen.',
};
export type VisualMicroPlanSurfaceFrameDistribution =
  (typeof VISUAL_MICROPLAN_SURFACE_FRAME_DISTRIBUTIONS)[number];
export interface VisualMicroPlanSurfaceFrame {
  axes: Array<{ id: string; angleDegrees: number; weight: number }>;
  convergenceAnchor?: { x: number; y: number };
  sceneVanishingFamilyIds?: string[];
  sceneSupportPlaneId?: string;
  depthProgression?: { nearScale: number; farScale: number; direction: 'toward-anchor' | 'away-from-anchor' };
  distribution: VisualMicroPlanSurfaceFrameDistribution;
  localExceptions: string[];
}

export const VISUAL_MICROPLAN_DEPTH_RELATIONS = [
  'in-front-of',
  'behind',
  'same-plane',
] as const;
export type VisualMicroPlanDepthRelation = (typeof VISUAL_MICROPLAN_DEPTH_RELATIONS)[number];

export const VISUAL_MICROPLAN_PAINTER_SCOPES = ['local', 'medium'] as const;
export type VisualMicroPlanPainterScope = (typeof VISUAL_MICROPLAN_PAINTER_SCOPES)[number];

export const VISUAL_MICROPLAN_PRESSURE_POLICIES = [
  'none',
  'native-preset',
  'simulated-size',
  'simulated-opacity',
  'simulated-size-opacity',
] as const;
export type VisualMicroPlanPressurePolicy = (typeof VISUAL_MICROPLAN_PRESSURE_POLICIES)[number];

export const VISUAL_MICROPLAN_CHANGE_DOMAINS = [
  'local-tone',
  'local-edge',
  'local-texture',
  'local-shape',
  'composition',
  'large-value',
  'lighting-structure',
  'silhouette',
  'depth-structure',
  'likeness-main-shape',
  'background-scope',
] as const;
export type VisualMicroPlanChangeDomain = (typeof VISUAL_MICROPLAN_CHANGE_DOMAINS)[number];

/**
 * Tools that may run before the one visual mutation. They can read state or
 * configure execution, but they must not alter visible canvas pixels.
 */
export const VISUAL_MICROPLAN_PREPARE_TOOLS = new Set([
  'photoshop_get_state',
  'photoshop_get_layers',
  'photoshop_select_layer_by_name',
  'photoshop_create_layer',
  'photoshop_get_history',
  'photoshop_list_brush_presets',
  'photoshop_select_brush_preset',
  'photoshop_get_brush_settings',
  'photoshop_set_brush',
  'photoshop_set_foreground_color',
  'photoshop_sample_color',
  'photoshop_geometry_calculate',
  'photoshop_measure_points',
  'photoshop_transform_landmarks',
  'photoshop_compare_landmarks',
  'photoshop_list_guides',
  'photoshop_select_rectangle',
  'photoshop_select_ellipse',
  'photoshop_select_subject',
  'photoshop_feather_selection',
]);

/** One semantic micro-plan may contain a small contiguous bundle of these mutations. */
export const VISUAL_MICROPLAN_MUTATION_TOOLS = new Set([
  'photoshop_source_bound_reflection',
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_paint_stamp_instances',
  'photoshop_paint_regions',
  'photoshop_fill_layer',
  'photoshop_paint_color_gradient',
  'photoshop_create_layer_mask',
  'photoshop_apply_gaussian_blur',
  'photoshop_move_layer',
  'photoshop_scale_layer',
  'photoshop_rotate_layer',
  'photoshop_undo',
]);

export const VISUAL_MICROPLAN_CAPTURE_TOOL = 'photoshop_get_preview';
export const VISUAL_MICROPLAN_MAX_STEPS = 12;
export const VISUAL_MICROPLAN_MAX_MUTATIONS = 8;
export const VISUAL_MICROPLAN_MAX_LAYER_CREATIONS = 1;

export interface VisualMicroPlanMutationBudget {
  allowedMutations: number;
  hardCap: number;
  reason: string;
}

export function resolveVisualMicroPlanMutationBudget(input: {
  risk: VisualMicroPlanRisk;
  stage?: string;
  scale?: string;
  actionClass?: string;
  protectedLayerCount?: number;
  affectedRelationCount?: number;
  affectedQualityCount?: number;
}): VisualMicroPlanMutationBudget {
  const risk = input.risk;
  const stage = (input.stage ?? '').trim().toUpperCase();
  const scale = (input.scale ?? '').trim().toLowerCase();
  const actionClass = (input.actionClass ?? '').trim().toUpperCase();
  const protectedCount = Math.max(0, Number(input.protectedLayerCount ?? 0));
  const affectedCount = Math.max(0, Number(input.affectedRelationCount ?? 0))
    + Math.max(0, Number(input.affectedQualityCount ?? 0));

  let allowed = risk === 'high' ? 1 : risk === 'moderate' ? 4 : 8;
  const reasons = [`risk=${risk}`];

  if (scale === 'global') {
    allowed = Math.min(allowed, 2);
    reasons.push('global-scale');
  } else if (scale === 'medium') {
    allowed = Math.min(allowed, 6);
    reasons.push('medium-scale');
  }
  if (['REPLACE', 'ERASE', 'ROLLBACK'].includes(actionClass)) {
    allowed = Math.min(allowed, 1);
    reasons.push(`action=${actionClass.toLowerCase()}`);
  }
  if (/FINAL|DELIVERY|EXPORT/.test(stage)) {
    allowed = Math.min(allowed, 3);
    reasons.push('late-stage');
  }
  if (protectedCount > 0) {
    allowed = Math.min(allowed, Math.max(1, allowed - 1));
    reasons.push(`protected_layers=${protectedCount}`);
  }
  if (affectedCount >= 3) {
    allowed = Math.min(allowed, Math.max(1, allowed - 1));
    reasons.push(`affected_contracts=${affectedCount}`);
  }

  return {
    allowedMutations: Math.max(1, Math.min(VISUAL_MICROPLAN_MAX_MUTATIONS, allowed)),
    hardCap: VISUAL_MICROPLAN_MAX_MUTATIONS,
    reason: reasons.join(';'),
  };
}

export interface VisualMicroPlanStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  region?: string;
  description?: string;
  methodClass?: VisualMicroPlanMethodClass;
  risk?: VisualMicroPlanRisk;
  methodId?: string;
  edgeBoundaryIds?: string[];
}

export interface PreviousPreviewVerdict {
  sha256: string;
  observedChange: string;
  targetResolved: VisualMicroPlanTargetResolution;
  regressions: string[];
  uncertainty: string;
  verdict: VisualMicroPlanVerdict;
  disposition: VisualMicroPlanDisposition;
}

export interface VisualMicroPlan {
  planId: string;
  summary: string;
  stage: string;
  scale: string;
  region: string;
  regionBounds?: Record<string, number>;
  objectContextRegionBounds?: Record<string, number>;
  intent: string;
  methodClass: VisualMicroPlanMethodClass;
  risk: VisualMicroPlanRisk;
  mutationBudget: VisualMicroPlanMutationBudget;
  expectedVisualDelta: string;
  verificationEnvelope: {
    mode: 'after_only' | 'before_after';
    minFocusDimensionPx?: number;
  };
  layerSeparationCheck: {
    changeKind: VisualMicroPlanLayerChangeKind;
    substantial: boolean;
    rollbackValue: VisualMicroPlanRollbackValue;
    independentAdjustmentExpected: boolean;
    reasons: string[];
    requiresIsolation: boolean;
  };
  logicalLayer?: {
    decision: VisualMicroPlanLogicalLayerDecision;
    hypothesisId: string;
    hypothesis: string;
    rollbackValue: VisualMicroPlanRollbackValue;
    expectedIndependentRollback: boolean;
    separationReasons: string[];
    layerId?: number;
    bindingSourceOperationId?: string;
    layerName?: string;
    mergeTargetLayerId?: number;
    createStepId?: string;
    physicalRole?: VisualMicroPlanPhysicalRole;
    opacityRole?: VisualMicroPlanOpacityRole;
    componentSpace?: 'canvas' | 'world';
    constructionTier?: VisualMicroPlanConstructionTier;
    parentHypothesisId?: string;
    parentConstructionRevision?: string;
    constructionChange: boolean;
    geometryBinding?: GeometryBinding;
    cameraBinding?: CameraBinding;
    attentionBinding?: AttentionBinding;
    negativeSpace?: {
      relation: VisualMicroPlanNegativeSpaceRelation;
      parentHypothesisId: string;
      parentConstructionRevision?: string;
      topology: string;
      evidence: string[];
    };
    causalEffect?: {
      relation: VisualMicroPlanCausalEffectRelation;
      sourceHypothesisId: string;
      sourceConstructionRevision?: string;
      receiverHypothesisId?: string;
      receiverConstructionRevision?: string;
      causalStatement: string;
      evidence: string[];
    };
    preserveNegativeSpaceIds: string[];
    surfaceFrame?: VisualMicroPlanSurfaceFrame;
    depthRelations: Array<{
      relation: VisualMicroPlanDepthRelation;
      targetHypothesisId: string;
    }>;
  };
  crossLayerCorrection?: {
    mode: 'correction' | 'migration';
    currentLayerId: number;
    targetLayerIds: number[];
    postAuthoritativeLayerId: number;
    reason?: string;
  };
  plannerDirectiveId?: string;
  plannerTaskId?: string;
  painterScope?: VisualMicroPlanPainterScope;
  changeDomains: VisualMicroPlanChangeDomain[];
  affectedRelations: string[];
  affectedQualities: string[];
  preservationFacts: string[];
  independentRegion: boolean;
  addressesPrimaryMismatch: boolean;
  addressesProblemId?: string;
  addressesProblemIds: string[];
  paintStrategy?: {
    constructionRole?: PaintingConstructionRole;
    materialRole?: string;
    visualIntent: PaintingVisualIntent;
    fallbackFromMethodId?: string;
    fallbackReason?: string;
    brushRole?: string;
    brushUseReason?: string;
    brushTrialBounds?: {left: number; top: number; right: number; bottom: number};
    brushFitnessKey?: string;
    presetName?: string;
    selectionReason?: string;
    brushPackId?: string;
    stampProfileId?: string;
    pressurePolicy: VisualMicroPlanPressurePolicy;
  };
  materialResponse?: MaterialResponsePlan;
  edges: EdgeIntent[];
  problemId?: string;
  actionClass: VisualMicroPlanActionClass;
  expectedVisualResult: string;
  failureSignals: string[];
  recognitionFeatures: string[];
  styleRecognitionFeatures: string[];
  protectedRegions: string[];
  protectedLayerIds: number[];
  replaceProtectedLayerIds: number[];
  documentId: number;
  significanceMode: VisualMicroPlanSignificanceMode;
  previousPreview?: PreviousPreviewVerdict;
  steps: VisualMicroPlanStep[];
  mutationIndex: number;
  mutationIndexes: number[];
  lastMutationIndex: number;
  beforeCaptureIndex?: number;
  captureIndex: number;
}

const PLACEHOLDER_RE = /^\$steps\.([^.]+)(?:\.(.+))?$/;
const GUARANTEED_STEP_RESULTS: Record<string, Record<string, { type: 'positive-integer'; target: 'layer_id' }>> = {
  photoshop_create_layer: { 'details.layerId': { type: 'positive-integer', target: 'layer_id' } },
  photoshop_source_bound_reflection: { 'details.layerId': { type: 'positive-integer', target: 'layer_id' } },
};

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function parseStringArray(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array of strings`);
  return value.map((item, index) => requireString(item, `${name}[${index}]`));
}

function parseEnum<T extends readonly string[]>(value: unknown, name: string, values: T): T[number] {
  const parsed = requireString(value, name).toLowerCase();
  if (!values.includes(parsed as T[number])) {
    throw new Error(`${name} must be one of ${values.join(', ')}`);
  }
  return parsed as T[number];
}

export function visualMicroPlanMethodClassForStep(
  step: Pick<VisualMicroPlanStep, 'tool' | 'args'>
): VisualMicroPlanMethodClass | undefined {
  if (step.tool === 'photoshop_undo') return 'rollback';
  if (step.tool === 'photoshop_fill_layer') return 'fill';
  if (step.tool === 'photoshop_paint_color_gradient') return 'gradient';
  if (step.tool === 'photoshop_create_layer_mask') return 'mask';
  if (step.tool === 'photoshop_apply_gaussian_blur') return 'filter';
  if (step.tool === 'photoshop_move_layer' || step.tool === 'photoshop_scale_layer'
    || step.tool === 'photoshop_rotate_layer' || step.tool === 'photoshop_source_bound_reflection') return 'transform';
  if (step.tool === 'photoshop_paint_regions') return 'region';
  if (step.tool === 'photoshop_paint_dabs') return 'paint';
  if (step.tool === 'photoshop_paint_stamp_instances') return 'paint';
  if (step.tool === 'photoshop_paint_strokes') {
    const strokes = step.args.strokes;
    if (!Array.isArray(strokes) || strokes.length === 0) return undefined;
    const modes = new Set(strokes.map(stroke => {
      if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke)) return 'INVALID';
      const raw = (stroke as Record<string, unknown>).tool;
      return typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : 'BRUSH';
    }));
    if (modes.size !== 1) return undefined;
    const mode = [...modes][0];
    if (mode === 'PENCIL') return 'line';
    if (mode === 'SMUDGE') return 'smudge';
    if (mode === 'ERASER') return 'erase';
    if (mode === 'BRUSH') return 'paint';
  }
  return undefined;
}

export function visualMicroPlanRequiresBrushPreflight(args: unknown): boolean {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  const record = args as Record<string, unknown>;
  const declaredMethodClass = typeof record.method_class === 'string'
    ? record.method_class.trim().toLowerCase()
    : undefined;
  const steps = record.steps;
  if (!Array.isArray(steps)) return declaredMethodClass === 'paint' || declaredMethodClass === 'preset-brush';
  const hasStamp = steps.some(step =>
    !!step && typeof step === 'object' && !Array.isArray(step)
      && (step as Record<string, unknown>).tool === 'photoshop_paint_stamp_instances'
  );
  const hasMediaBrushMutation = steps.some(step => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return false;
    const stepRecord = step as Record<string, unknown>;
    const tool = stepRecord.tool;
    if (tool === 'photoshop_paint_dabs') return true;
    if (tool === 'photoshop_paint_stamp_instances') return false;
    if (tool !== 'photoshop_paint_strokes') return false;
    const stepArgs = stepRecord.args && typeof stepRecord.args === 'object' && !Array.isArray(stepRecord.args)
      ? stepRecord.args as Record<string, unknown>
      : {};
    return visualMicroPlanMethodClassForStep({ tool, args: stepArgs }) === 'paint';
  });
  // A stamp-only preset is evidence-bound by brush_pack_id + stamp_profile_id rather than a
  // media-brush role. Mixed or ordinary brush painting still requires the media preflight.
  if (hasStamp && !hasMediaBrushMutation) return false;
  if (declaredMethodClass === 'paint' || declaredMethodClass === 'preset-brush') return true;
  return hasMediaBrushMutation;
}

function riskRank(risk: VisualMicroPlanRisk): number {
  return VISUAL_MICROPLAN_RISKS.indexOf(risk);
}

function positiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function rawMutationTargetRefs(step: VisualMicroPlanStep): unknown[] {
  // This first visual mutation *creates* its owner; source_layer_id and
  // receiver_layer_id are provenance dependencies, not mutation destinations.
  if (step.tool === 'photoshop_source_bound_reflection') return [];
  if (step.tool === 'photoshop_paint_regions') {
    const regions = step.args.regions;
    if (!Array.isArray(regions)) return [];
    return regions.map(region =>
      region && typeof region === 'object' && !Array.isArray(region)
        ? (region as Record<string, unknown>).layer_id
        : undefined
    );
  }
  return [step.args.layer_id];
}

function parsePositiveIntegerArray(value: unknown, name: string): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array of positive integers`);
  const seen = new Set<number>();
  return value.map((item, index) => {
    if (typeof item !== 'number' || !Number.isSafeInteger(item) || item <= 0) {
      throw new Error(`${name}[${index}] must be a positive integer`);
    }
    if (seen.has(item)) throw new Error(`${name} must not contain duplicate layer ids`);
    seen.add(item);
    return item;
  });
}



export function isRegionBlockInStage(stage: string): boolean {
  const normalized = stage.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return normalized === 'RECOGNITION_BLOCK_IN'
    || normalized === 'COMPOSITION'
    || normalized === 'SHAPE'
    || normalized === 'GLOBAL_BLOCK_IN';
}

function parseArgsObject(value: unknown, name: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function focusRegion(args: Record<string, unknown>, name: string): Record<string, number> | undefined {
  const value = args.focus_region;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name}.focus_region must be an object`);
  }
  const source = value as Record<string, unknown>;
  const region = {
    left: Number(source.left),
    top: Number(source.top),
    right: Number(source.right),
    bottom: Number(source.bottom),
  };
  if (!Object.values(region).every(Number.isFinite) || region.right <= region.left || region.bottom <= region.top) {
    throw new Error(`${name}.focus_region must contain finite positive bounds`);
  }
  return region;
}

function sameFocusRegion(a: Record<string, number>, b: Record<string, number>): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

export function visualMicroPlanRequiresLocalInspection(
  scale: string,
  significanceMode: VisualMicroPlanSignificanceMode
): boolean {
  return significanceMode === 'subtle_local' || /(^|[-_\s])(small|micro|detail|local)([-_\s]|$)/i.test(scale);
}

function parsePreviousPreview(value: unknown): PreviousPreviewVerdict | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('previous_preview must be an object');
  }
  const record = value as Record<string, unknown>;
  const sha256 = requireString(record.sha256, 'previous_preview.sha256');
  const observedChange = requireString(record.observed_change, 'previous_preview.observed_change');
  const targetResolved = requireString(record.target_resolved, 'previous_preview.target_resolved').toLowerCase();
  if (!VISUAL_MICROPLAN_TARGET_RESOLUTION.includes(targetResolved as VisualMicroPlanTargetResolution)) {
    throw new Error(
      `previous_preview.target_resolved must be one of ${VISUAL_MICROPLAN_TARGET_RESOLUTION.join(', ')}`
    );
  }
  const regressions = parseStringArray(record.regressions, 'previous_preview.regressions');
  const uncertainty = requireString(record.uncertainty, 'previous_preview.uncertainty');
  const verdict = requireString(record.verdict, 'previous_preview.verdict');
  const disposition = requireString(record.disposition, 'previous_preview.disposition');
  if (!VISUAL_MICROPLAN_VERDICTS.includes(verdict as VisualMicroPlanVerdict)) {
    throw new Error(`previous_preview.verdict must be one of ${VISUAL_MICROPLAN_VERDICTS.join(', ')}`);
  }
  if (!VISUAL_MICROPLAN_DISPOSITIONS.includes(disposition as VisualMicroPlanDisposition)) {
    throw new Error(
      `previous_preview.disposition must be one of ${VISUAL_MICROPLAN_DISPOSITIONS.join(', ')}`
    );
  }
  if (verdict === 'regression' && disposition === 'accept') {
    throw new Error('a regression preview cannot be accepted; use correct or rollback');
  }
  return {
    sha256,
    observedChange,
    targetResolved: targetResolved as VisualMicroPlanTargetResolution,
    regressions,
    uncertainty,
    verdict: verdict as VisualMicroPlanVerdict,
    disposition: disposition as VisualMicroPlanDisposition,
  };
}

/** Single static contract for deferred results. Returned args are schema-only
 * stand-ins; caller must retain the original references for runtime resolution. */
export function preflightDeferredStepReferences(
  steps: ReadonlyArray<{ id?: unknown; tool?: unknown; args?: unknown }>
): { schemaArgs: unknown[]; errors: string[] } {
  const errors: string[] = [];
  const positions = new Map<string, number>();
  steps.forEach((step, index) => {
    if (typeof step.id === 'string') positions.set(step.id, index);
  });
  const schemaArgs = steps.map((step, index) => {
    const id = String(step.id ?? index);
    const visit = (value: unknown, argumentPath: string): unknown => {
      if (typeof value === 'string' && value.startsWith('$steps.')) {
        const match = /^\$steps\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_.]+)$/.exec(value);
        const producer = match?.[1];
        const producerIndex = producer === undefined ? undefined : positions.get(producer);
        const location = `step "${id}" args.${argumentPath}`;
        if (!match) {
          errors.push(`${location}: malformed deferred step reference ${JSON.stringify(value)}`);
        } else if (producerIndex === undefined) {
          const eligible = steps.slice(0, index).filter(source => (source.tool === 'photoshop_create_layer'
            || source.tool === 'photoshop_source_bound_reflection')
            && typeof source.id === 'string').map(source => String(source.id));
          errors.push(`${location}: step "${id}" references unknown step "${producer}"; `
            + `available earlier photoshop_create_layer producer ids=${JSON.stringify(eligible)}; `
            + 'for a layer_id reference use $steps.<producer-id>.details.layerId');
        } else if (producerIndex >= index) {
          errors.push(`${location}: step "${id}" may reference only an earlier step, not "${producer}"`);
        } else {
          const source = steps[producerIndex]!;
          const result = GUARANTEED_STEP_RESULTS[String(source.tool)]?.[match[2]!];
          if (!result || argumentPath.split('.').at(-1) !== result.target) {
            errors.push(`${location}: ${JSON.stringify(value)} has no guaranteed compatible result; `
              + 'use details.layerId of an earlier verified layer-producing step in layer_id only');
          } else {
            return 1; // guaranteed positive-integer layerId, for pre-execution schema validation only
          }
        }
        return value;
      }
      if (Array.isArray(value)) return value.map((item, offset) => visit(item, `${argumentPath}[${offset}]`));
      if (value && typeof value === 'object') return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key, visit(item, argumentPath ? `${argumentPath}.${key}` : key),
        ])
      );
      return value;
    };
    return visit(step.args, '');
  });
  return { schemaArgs, errors };
}

/** Collect independent construction requirements even when an earlier field is invalid. */
export function collectVisualMicroPlanConstructionErrors(_args: Record<string, unknown>): string[] {
  // Artistic construction guidance does not determine executable Photoshop safety.
  return [];
}

export function parseVisualMicroPlan(args: Record<string, unknown>): VisualMicroPlan {
  const documentId = args.document_id;
  if (
    typeof documentId !== 'number' ||
    !Number.isFinite(documentId) ||
    !Number.isInteger(documentId) ||
    documentId <= 0
  ) {
    throw new Error('document_id is required and must be a positive integer');
  }

  const planId = requireString(args.plan_id, 'plan_id');
  const summary = requireString(args.summary, 'summary');
  const stage = requireString(args.stage, 'stage');
  const scale = requireString(args.scale, 'scale');
  const region = requireString(args.region, 'region');
  const regionBounds = args.region_bounds === undefined ? undefined : focusRegion({ focus_region: args.region_bounds }, 'region_bounds');
  const objectContextRegionBounds = args.object_context_region_bounds === undefined
    ? undefined
    : focusRegion({ focus_region: args.object_context_region_bounds }, 'object_context_region_bounds');
  if (objectContextRegionBounds && !regionBounds) {
    throw new Error('object_context_region_bounds requires exact region_bounds for the tighter MICRO target');
  }
  if (objectContextRegionBounds && regionBounds) {
    const contains = objectContextRegionBounds.left <= regionBounds.left
      && objectContextRegionBounds.top <= regionBounds.top
      && objectContextRegionBounds.right >= regionBounds.right
      && objectContextRegionBounds.bottom >= regionBounds.bottom;
    if (!contains) throw new Error('object_context_region_bounds must contain region_bounds');
  }
  const intent = requireString(args.intent, 'intent');
  const methodClass = parseEnum(args.method_class, 'method_class', VISUAL_MICROPLAN_METHOD_CLASSES) as VisualMicroPlanMethodClass;
  const risk = parseEnum(args.risk, 'risk', VISUAL_MICROPLAN_RISKS) as VisualMicroPlanRisk;
  const expectedVisualDelta = requireString(args.expected_visual_delta, 'expected_visual_delta');
  const edges = parseEdgeIntents(args.edges);
  const plannerDirectiveId = args.planner_directive_id === undefined
    ? undefined
    : requireString(args.planner_directive_id, 'planner_directive_id');
  const plannerTaskId = args.planner_task_id === undefined
    ? undefined
    : requireString(args.planner_task_id, 'planner_task_id');
  if ((plannerDirectiveId && !plannerTaskId) || (!plannerDirectiveId && plannerTaskId)) {
    throw new Error('planner_directive_id and planner_task_id must be supplied together');
  }
  const painterScope = args.painter_scope === undefined
    ? undefined
    : parseEnum(args.painter_scope, 'painter_scope', VISUAL_MICROPLAN_PAINTER_SCOPES) as VisualMicroPlanPainterScope;
  if ((plannerDirectiveId || plannerTaskId) && !painterScope) {
    throw new Error('Painter-bound VisualMicroPlan requires painter_scope');
  }
  const changeDomains = args.change_domains === undefined
    ? []
    : parseStringArray(args.change_domains, 'change_domains').map((value, index) => {
        const parsed = value.toLowerCase();
        if (!VISUAL_MICROPLAN_CHANGE_DOMAINS.includes(parsed as VisualMicroPlanChangeDomain)) {
          throw new Error(`change_domains[${index}] must be one of ${VISUAL_MICROPLAN_CHANGE_DOMAINS.join(', ')}`);
        }
        return parsed as VisualMicroPlanChangeDomain;
      });
  const affectedRelations = args.affected_relations === undefined
    ? []
    : parseStringArray(args.affected_relations, 'affected_relations');
  const affectedQualities = args.affected_qualities === undefined
    ? []
    : parseStringArray(args.affected_qualities, 'affected_qualities');
  const preservationFacts = args.preservation_facts === undefined
    ? []
    : parseStringArray(args.preservation_facts, 'preservation_facts');
  const independentRegion = args.independent_region === true;
  if (args.independent_region !== undefined && typeof args.independent_region !== 'boolean') {
    throw new Error('independent_region must be boolean');
  }
  const addressesPrimaryMismatch = args.addresses_primary_mismatch === true;
  if (args.addresses_primary_mismatch !== undefined && typeof args.addresses_primary_mismatch !== 'boolean') {
    throw new Error('addresses_primary_mismatch must be boolean');
  }
  const addressesProblemId = args.addresses_problem_id === undefined
    ? undefined
    : requireString(args.addresses_problem_id, 'addresses_problem_id');
  const addressesProblemIds = normalizeProblemLinks(addressesProblemId, args.addresses_problem_ids);
  if ((plannerDirectiveId || plannerTaskId) && changeDomains.length === 0) {
    throw new Error('Painter-bound VisualMicroPlan requires at least one change_domains entry');
  }
  let paintStrategy: VisualMicroPlan['paintStrategy'];
  if (args.paint_strategy !== undefined) {
    const raw = parseArgsObject(args.paint_strategy, 'paint_strategy');
    const constructionRole = raw.construction_role === undefined
      ? undefined
      : parseEnum(
          raw.construction_role,
          'paint_strategy.construction_role',
          PAINTING_CONSTRUCTION_ROLES
        ) as PaintingConstructionRole;
    const visualIntent = parseEnum(
      raw.visual_intent,
      'paint_strategy.visual_intent',
      PAINTING_VISUAL_INTENTS
    ) as PaintingVisualIntent;
    const pressurePolicy = parseEnum(
      raw.pressure_policy,
      'paint_strategy.pressure_policy',
      VISUAL_MICROPLAN_PRESSURE_POLICIES
    ) as VisualMicroPlanPressurePolicy;
    const fallbackFromMethodId = raw.fallback_from_method_id === undefined
      ? undefined
      : requireString(raw.fallback_from_method_id, 'paint_strategy.fallback_from_method_id');
    const fallbackReason = raw.fallback_reason === undefined
      ? undefined
      : requireString(raw.fallback_reason, 'paint_strategy.fallback_reason');
    // E.7c: fallback_from_method_id is executable routing authority; fallback_reason is
    // optional artistic/audit guidance and must not be a mutation-admission certificate.
    const materialRole = raw.material_role === undefined
      ? undefined : requireString(raw.material_role, 'paint_strategy.material_role');
    // A material label is artistic metadata, not proof that a brush can execute.
    paintStrategy = {
      ...(constructionRole ? { constructionRole } : {}),
      ...(materialRole ? { materialRole } : {}),
      visualIntent,
      ...(fallbackFromMethodId ? { fallbackFromMethodId } : {}),
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(raw.brush_role === undefined ? {} : { brushRole: requireString(raw.brush_role, 'paint_strategy.brush_role') }),
      ...(raw.brush_use_reason === undefined ? {} : { brushUseReason: requireString(raw.brush_use_reason, 'paint_strategy.brush_use_reason') }),
      ...(raw.brush_trial_bounds === undefined ? {} : { brushTrialBounds: raw.brush_trial_bounds as {left: number; top: number; right: number; bottom: number} }),
      ...(raw.brush_fitness_key === undefined ? {} : { brushFitnessKey: requireString(raw.brush_fitness_key, 'paint_strategy.brush_fitness_key') }),
      ...(raw.preset_name === undefined ? {} : { presetName: requireString(raw.preset_name, 'paint_strategy.preset_name') }),
      ...(raw.selection_reason === undefined ? {} : { selectionReason: requireString(raw.selection_reason, 'paint_strategy.selection_reason') }),
      ...(raw.brush_pack_id === undefined ? {} : { brushPackId: requireString(raw.brush_pack_id, 'paint_strategy.brush_pack_id') }),
      ...(raw.stamp_profile_id === undefined ? {} : { stampProfileId: requireString(raw.stamp_profile_id, 'paint_strategy.stamp_profile_id') }),
      pressurePolicy,
    };
  }
  const verificationRaw = parseArgsObject(args.verification_envelope, 'verification_envelope');
  const verificationMode = parseEnum(
    verificationRaw.mode,
    'verification_envelope.mode',
    ['after_only', 'before_after'] as const
  ) as 'after_only' | 'before_after';
  const minFocusDimensionPxRaw = verificationRaw.min_focus_dimension_px;
  const minFocusDimensionPx = minFocusDimensionPxRaw === undefined ? undefined : Number(minFocusDimensionPxRaw);
  if (minFocusDimensionPx !== undefined && (!Number.isFinite(minFocusDimensionPx) || minFocusDimensionPx <= 0)) {
    throw new Error('verification_envelope.min_focus_dimension_px must be a positive number');
  }

  const separationRaw = parseArgsObject(args.layer_separation_check, 'layer_separation_check');
  const separationChangeKind = parseEnum(
    separationRaw.change_kind,
    'layer_separation_check.change_kind',
    VISUAL_MICROPLAN_LAYER_CHANGE_KINDS
  ) as VisualMicroPlanLayerChangeKind;
  if (typeof separationRaw.substantial !== 'boolean') {
    throw new Error('layer_separation_check.substantial must be boolean');
  }
  const separationRollbackValue = parseEnum(
    separationRaw.rollback_value,
    'layer_separation_check.rollback_value',
    VISUAL_MICROPLAN_ROLLBACK_VALUES
  ) as VisualMicroPlanRollbackValue;
  if (typeof separationRaw.independent_adjustment_expected !== 'boolean') {
    throw new Error('layer_separation_check.independent_adjustment_expected must be boolean');
  }
  const separationReasons = separationRaw.reasons === undefined
    ? []
    : parseStringArray(separationRaw.reasons, 'layer_separation_check.reasons');
  const independentNewKinds = new Set<VisualMicroPlanLayerChangeKind>([
    'new-object',
    'new-material',
    'new-light',
    'new-plane',
  ]);
  const requiresIsolation =
    separationRaw.substantial &&
    independentNewKinds.has(separationChangeKind) &&
    (separationRollbackValue !== 'low' || separationRaw.independent_adjustment_expected);
  const layerSeparationCheck: VisualMicroPlan['layerSeparationCheck'] = {
    changeKind: separationChangeKind,
    substantial: separationRaw.substantial,
    rollbackValue: separationRollbackValue,
    independentAdjustmentExpected: separationRaw.independent_adjustment_expected,
    reasons: separationReasons,
    requiresIsolation,
  };

  let logicalLayer: VisualMicroPlan['logicalLayer'];
  if (args.logical_layer !== undefined) {
    const raw = parseArgsObject(args.logical_layer, 'logical_layer');
    const decision = parseEnum(
      raw.decision,
      'logical_layer.decision',
      VISUAL_MICROPLAN_LOGICAL_LAYER_DECISIONS
    ) as VisualMicroPlanLogicalLayerDecision;
    const hypothesisId = requireString(raw.hypothesis_id, 'logical_layer.hypothesis_id');
    const hypothesis = requireString(raw.hypothesis, 'logical_layer.hypothesis');
    const rollbackValue = parseEnum(
      raw.rollback_value,
      'logical_layer.rollback_value',
      VISUAL_MICROPLAN_ROLLBACK_VALUES
    ) as VisualMicroPlanRollbackValue;
    if (typeof raw.expected_independent_rollback !== 'boolean') {
      throw new Error('logical_layer.expected_independent_rollback must be boolean');
    }
    const physicalRole = raw.physical_role === undefined
      ? undefined
      : parseEnum(
          raw.physical_role,
          'logical_layer.physical_role',
          VISUAL_MICROPLAN_PHYSICAL_ROLES
        ) as VisualMicroPlanPhysicalRole;
    const opacityRole = raw.opacity_role === undefined
      ? undefined
      : parseEnum(
          raw.opacity_role,
          'logical_layer.opacity_role',
          VISUAL_MICROPLAN_OPACITY_ROLES
        ) as VisualMicroPlanOpacityRole;
    const componentSpace = raw.component_space === undefined ? undefined
      : parseEnum(raw.component_space, 'logical_layer.component_space', ['canvas', 'world']) as 'canvas' | 'world';
    const constructionTier = raw.construction_tier === undefined
      ? undefined
      : parseEnum(
          raw.construction_tier,
          'logical_layer.construction_tier',
          VISUAL_MICROPLAN_CONSTRUCTION_TIERS
        ) as VisualMicroPlanConstructionTier;
    const parentHypothesisId = raw.parent_hypothesis_id === undefined
      ? undefined
      : requireString(raw.parent_hypothesis_id, 'logical_layer.parent_hypothesis_id');
    const parentConstructionRevision = raw.parent_construction_revision === undefined
      ? undefined
      : requireString(raw.parent_construction_revision, 'logical_layer.parent_construction_revision');
    if (raw.construction_change !== undefined && typeof raw.construction_change !== 'boolean') {
      throw new Error('logical_layer.construction_change must be boolean');
    }
    const constructionChange = raw.construction_change === true;
    const geometryBinding = raw.geometry_binding === undefined
      ? undefined
      : normalizeGeometryBinding(raw.geometry_binding);
    const cameraBinding = raw.camera_binding === undefined
      ? undefined
      : normalizeCameraBinding(raw.camera_binding);
    const attentionBinding = raw.attention_binding === undefined
      ? undefined
      : normalizeAttentionBinding(raw.attention_binding);
    let negativeSpace: NonNullable<VisualMicroPlan['logicalLayer']>['negativeSpace'];
    if (raw.negative_space !== undefined) {
      const negative = parseArgsObject(raw.negative_space, 'logical_layer.negative_space');
      const relation = parseEnum(
        negative.relation,
        'logical_layer.negative_space.relation',
        VISUAL_MICROPLAN_NEGATIVE_SPACE_RELATIONS
      ) as VisualMicroPlanNegativeSpaceRelation;
      const negativeParent = requireString(negative.parent_hypothesis_id, 'logical_layer.negative_space.parent_hypothesis_id');
      const negativeParentRevision = negative.parent_construction_revision === undefined
        ? undefined
        : requireString(negative.parent_construction_revision, 'logical_layer.negative_space.parent_construction_revision');
      const topology = requireString(negative.topology, 'logical_layer.negative_space.topology');
      const evidence = parseStringArray(negative.evidence, 'logical_layer.negative_space.evidence');
      if (!evidence.length) throw new Error('logical_layer.negative_space.evidence must contain structural evidence');
      if (evidence.every(item => /(?:background|sampled?\s+colou?r|colou?r\s+sample)/i.test(item))) {
        throw new Error('logical_layer.negative_space requires structural/topological evidence; background-color sampling alone is insufficient');
      }
      if (negativeParent === hypothesisId) throw new Error('logical_layer.negative_space cannot target its own hypothesis_id');
      negativeSpace = { relation, parentHypothesisId: negativeParent, ...(negativeParentRevision ? { parentConstructionRevision: negativeParentRevision } : {}), topology, evidence };
    }
    let causalEffect: NonNullable<VisualMicroPlan['logicalLayer']>['causalEffect'];
    if (raw.causal_effect !== undefined) {
      const effect = parseArgsObject(raw.causal_effect, 'logical_layer.causal_effect');
      const relation = parseEnum(effect.relation, 'logical_layer.causal_effect.relation', VISUAL_MICROPLAN_CAUSAL_EFFECT_RELATIONS) as VisualMicroPlanCausalEffectRelation;
      const sourceHypothesisId = requireString(effect.source_hypothesis_id, 'logical_layer.causal_effect.source_hypothesis_id');
      const receiverHypothesisId = effect.receiver_hypothesis_id === undefined ? undefined : requireString(effect.receiver_hypothesis_id, 'logical_layer.causal_effect.receiver_hypothesis_id');
      if (sourceHypothesisId === hypothesisId || receiverHypothesisId === hypothesisId) throw new Error('logical_layer.causal_effect source/receiver cannot be the effect owner itself');
      if (receiverHypothesisId && receiverHypothesisId === sourceHypothesisId) throw new Error('logical_layer.causal_effect receiver must differ from source');
      if (relation !== 'emission_from' && !receiverHypothesisId) throw new Error(`logical_layer.causal_effect relation=${relation} requires receiver_hypothesis_id`);
      const causalStatement = requireString(effect.causal_statement, 'logical_layer.causal_effect.causal_statement');
      const evidence = parseStringArray(effect.evidence, 'logical_layer.causal_effect.evidence');
      if (!evidence.length) throw new Error('logical_layer.causal_effect.evidence must describe source/receiver causality');
      causalEffect = {
        relation, sourceHypothesisId,
        ...(effect.source_construction_revision === undefined ? {} : { sourceConstructionRevision: requireString(effect.source_construction_revision, 'logical_layer.causal_effect.source_construction_revision') }),
        ...(receiverHypothesisId ? { receiverHypothesisId } : {}),
        ...(effect.receiver_construction_revision === undefined ? {} : { receiverConstructionRevision: requireString(effect.receiver_construction_revision, 'logical_layer.causal_effect.receiver_construction_revision') }),
        causalStatement, evidence,
      };
    }
    let surfaceFrame: VisualMicroPlanSurfaceFrame | undefined;
    if (raw.surface_frame !== undefined) {
      const frame = parseArgsObject(raw.surface_frame, 'logical_layer.surface_frame');
      if (!Array.isArray(frame.axes) || frame.axes.length < 1 || frame.axes.length > 3) {
        throw new Error('logical_layer.surface_frame.axes must contain 1-3 dominant axes');
      }
      const axisIds = new Set<string>();
      const axes = frame.axes.map((entry, index) => {
        const axis = parseArgsObject(entry, `logical_layer.surface_frame.axes[${index}]`);
        const id = requireString(axis.id, `logical_layer.surface_frame.axes[${index}].id`);
        if (axisIds.has(id)) throw new Error('logical_layer.surface_frame axis ids must be unique');
        axisIds.add(id);
        const angleDegrees = Number(axis.angle_degrees);
        const weight = axis.weight === undefined ? 1 : Number(axis.weight);
        if (!Number.isFinite(angleDegrees) || angleDegrees < -180 || angleDegrees > 180) {
          throw new Error('logical_layer.surface_frame axis angle_degrees must be within -180..180');
        }
        if (!Number.isFinite(weight) || weight <= 0 || weight > 1) {
          throw new Error('logical_layer.surface_frame axis weight must be > 0 and <= 1');
        }
        return { id, angleDegrees, weight };
      });
      let convergenceAnchor: { x: number; y: number } | undefined;
      if (frame.convergence_anchor !== undefined) {
        const anchor = parseArgsObject(frame.convergence_anchor, 'logical_layer.surface_frame.convergence_anchor');
        const x = Number(anchor.x); const y = Number(anchor.y);
        if (![x, y].every(Number.isFinite)) throw new Error('logical_layer.surface_frame.convergence_anchor requires finite x/y');
        convergenceAnchor = { x, y };
      }
      const sceneVanishingFamilyIds = frame.scene_vanishing_family_ids === undefined
        ? []
        : parseStringArray(frame.scene_vanishing_family_ids, 'logical_layer.surface_frame.scene_vanishing_family_ids');
      const sceneSupportPlaneId = frame.scene_support_plane_id === undefined
        ? undefined
        : requireString(frame.scene_support_plane_id, 'logical_layer.surface_frame.scene_support_plane_id');
      let depthProgression: VisualMicroPlanSurfaceFrame['depthProgression'];
      if (frame.depth_progression !== undefined) {
        const depth = parseArgsObject(frame.depth_progression, 'logical_layer.surface_frame.depth_progression');
        const nearScale = Number(depth.near_scale); const farScale = Number(depth.far_scale);
        const direction = parseEnum(depth.direction, 'logical_layer.surface_frame.depth_progression.direction', ['toward-anchor', 'away-from-anchor'] as const);
        if (![nearScale, farScale].every(value => Number.isFinite(value) && value > 0)) {
          throw new Error('logical_layer.surface_frame.depth_progression scales must be finite and > 0');
        }
        depthProgression = { nearScale, farScale, direction };
      }
      const distribution = parseEnum(
        frame.distribution ?? 'directional',
        'logical_layer.surface_frame.distribution',
        VISUAL_MICROPLAN_SURFACE_FRAME_DISTRIBUTIONS
      ) as VisualMicroPlanSurfaceFrameDistribution;
      // A perspective-regular style label is not proof of a vanishing-point
      // construction. An anchor is useful evaluation data, not paint admission.
      const localExceptions = frame.local_exceptions === undefined
        ? []
        : parseStringArray(frame.local_exceptions, 'logical_layer.surface_frame.local_exceptions');
      surfaceFrame = {
        axes, ...(convergenceAnchor ? { convergenceAnchor } : {}), sceneVanishingFamilyIds,
        ...(sceneSupportPlaneId ? { sceneSupportPlaneId } : {}),
        ...(depthProgression ? { depthProgression } : {}), distribution, localExceptions,
      };
    }
    // Artistic construction tiers are open-ended guidance. Parent IDs are
    // checked for self-aliasing and physical ownership elsewhere; a missing
    // tier or parent is not a Photoshop execution failure.
    if (parentHypothesisId === hypothesisId) {
      throw new Error('logical_layer.parent_hypothesis_id cannot equal hypothesis_id');
    }
    // Negative-space hierarchy and optical role are interpretations of the
    // scene, not preconditions of a specific native Photoshop mutation.
    const rawDepthRelations = raw.depth_relations === undefined ? [] : raw.depth_relations;
    if (!Array.isArray(rawDepthRelations)) {
      throw new Error('logical_layer.depth_relations must be an array');
    }
    if (rawDepthRelations.length > 1) {
      throw new Error('logical_layer.depth_relations supports at most one direct stack anchor per logical layer');
    }
    const depthRelations = rawDepthRelations.map((entry, index) => {
      const relationRaw = parseArgsObject(entry, `logical_layer.depth_relations[${index}]`);
      const relation = parseEnum(
        relationRaw.relation,
        `logical_layer.depth_relations[${index}].relation`,
        VISUAL_MICROPLAN_DEPTH_RELATIONS
      ) as VisualMicroPlanDepthRelation;
      const targetHypothesisId = requireString(
        relationRaw.target_hypothesis_id,
        `logical_layer.depth_relations[${index}].target_hypothesis_id`
      );
      if (targetHypothesisId === hypothesisId) {
        throw new Error('logical_layer.depth_relations cannot target the same hypothesis_id');
      }
      return { relation, targetHypothesisId };
    });
    // Do not enforce one ontology of opacity/support/camera/atmosphere. These
    // labels assist Critic and organization; native blend, layer and mask
    // operations validate their own technical argument contracts.
    logicalLayer = {
      decision,
      hypothesisId,
      hypothesis,
      rollbackValue,
      expectedIndependentRollback: raw.expected_independent_rollback,
      // E.7c: rollback/isolation structure is executable authority. Free-form separation
      // prose is retained only as optional audit/artistic guidance.
      separationReasons: raw.separation_reasons === undefined
        ? []
        : parseStringArray(raw.separation_reasons, 'logical_layer.separation_reasons'),
      ...(positiveInteger(raw.layer_id, 'logical_layer.layer_id') === undefined ? {} : { layerId: positiveInteger(raw.layer_id, 'logical_layer.layer_id') }),
      ...(raw.binding_source_operation_id === undefined ? {} : {
        bindingSourceOperationId: requireString(raw.binding_source_operation_id, 'logical_layer.binding_source_operation_id') }),
      ...(raw.layer_name === undefined ? {} : { layerName: requireString(raw.layer_name, 'logical_layer.layer_name') }),
      ...(positiveInteger(raw.merge_target_layer_id, 'logical_layer.merge_target_layer_id') === undefined
        ? {}
        : { mergeTargetLayerId: positiveInteger(raw.merge_target_layer_id, 'logical_layer.merge_target_layer_id') }),
      ...(physicalRole ? { physicalRole } : {}),
      ...(opacityRole ? { opacityRole } : {}),
      ...(componentSpace ? { componentSpace } : {}),
      ...(constructionTier ? { constructionTier } : {}),
      ...(parentHypothesisId ? { parentHypothesisId } : {}),
      ...(parentConstructionRevision ? { parentConstructionRevision } : {}),
      constructionChange,
      ...(geometryBinding ? { geometryBinding } : {}),
      ...(cameraBinding ? { cameraBinding } : {}),
      ...(attentionBinding ? { attentionBinding } : {}),
      ...(negativeSpace ? { negativeSpace } : {}),
      ...(causalEffect ? { causalEffect } : {}),
      preserveNegativeSpaceIds: raw.preserve_negative_space_ids === undefined
        ? []
        : parseStringArray(raw.preserve_negative_space_ids, 'logical_layer.preserve_negative_space_ids'),
      ...(surfaceFrame ? { surfaceFrame } : {}),
      depthRelations,
    };
  }

  let crossLayerCorrection: VisualMicroPlan['crossLayerCorrection'];
  if (args.cross_layer_correction !== undefined) {
    const raw = parseArgsObject(args.cross_layer_correction, 'cross_layer_correction');
    const mode = parseEnum(raw.mode, 'cross_layer_correction.mode', ['correction', 'migration'] as const);
    const currentLayerId = positiveInteger(raw.current_layer_id, 'cross_layer_correction.current_layer_id');
    const postAuthoritativeLayerId = positiveInteger(raw.post_authoritative_layer_id, 'cross_layer_correction.post_authoritative_layer_id');
    if (!currentLayerId || !postAuthoritativeLayerId) throw new Error('cross_layer_correction requires positive current/post layer ids');
    if (!Array.isArray(raw.target_layer_ids) || raw.target_layer_ids.length < 1) {
      throw new Error('cross_layer_correction.target_layer_ids requires at least one physical layer');
    }
    const targetLayerIds = raw.target_layer_ids.map((value, index) => {
      const id = positiveInteger(value, `cross_layer_correction.target_layer_ids[${index}]`);
      if (!id) throw new Error('cross_layer_correction target layer ids must be positive integers');
      return id;
    });
    if (new Set(targetLayerIds).size !== targetLayerIds.length) throw new Error('cross_layer_correction.target_layer_ids must be unique');
    const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : undefined;
    crossLayerCorrection = { mode, currentLayerId, targetLayerIds, postAuthoritativeLayerId, ...(reason ? { reason } : {}) };
  }

  if (logicalLayer && logicalLayer.rollbackValue !== layerSeparationCheck.rollbackValue) {
    throw new Error(
      'layer_separation_check.rollback_value must match logical_layer.rollback_value when a logical layer is declared'
    );
  }
  if (
    layerSeparationCheck.requiresIsolation &&
    (!logicalLayer ||
      (logicalLayer.decision !== 'create-new' &&
        logicalLayer.decision !== 'temporary-hypothesis' && !logicalLayer.bindingSourceOperationId))
  ) {
    throw new Error(
      'Layer Separation Check requires logical_layer.decision=create-new or temporary-hypothesis before this substantial independent change'
    );
  }
  const problemId = args.problem_id === undefined ? undefined : requireString(args.problem_id, 'problem_id');
  const significanceModeRaw = args.significance_mode === undefined
    ? 'normal'
    : requireString(args.significance_mode, 'significance_mode').toLowerCase();
  if (!VISUAL_MICROPLAN_SIGNIFICANCE_MODES.includes(significanceModeRaw as VisualMicroPlanSignificanceMode)) {
    throw new Error(`significance_mode must be one of ${VISUAL_MICROPLAN_SIGNIFICANCE_MODES.join(', ')}`);
  }
  const significanceMode = significanceModeRaw as VisualMicroPlanSignificanceMode;
  if (significanceMode === 'subtle_local' && !problemId) {
    throw new Error('subtle_local VisualMicroPlan requires problem_id');
  }
  const actionClassRaw = requireString(args.action_class, 'action_class').toUpperCase();
  if (!VISUAL_MICROPLAN_ACTION_CLASSES.includes(actionClassRaw as VisualMicroPlanActionClass)) {
    throw new Error(`action_class must be one of ${VISUAL_MICROPLAN_ACTION_CLASSES.join(', ')}`);
  }
  const materialResponse = args.material_response === undefined
    ? undefined
    : normalizeMaterialResponsePlan(args.material_response, {
        physicalRole: logicalLayer?.physicalRole,
        opacityRole: logicalLayer?.opacityRole,
        constructionRole: paintStrategy?.constructionRole,
      });
  // Planning prose is optional; a supplied plan still validates against owner roles.
  // Exact-frame material assessment remains the authority for refinement completion.
  const expectedVisualResult = requireString(
    args.expected_visual_result,
    'expected_visual_result'
  );
  const failureSignals = parseStringArray(args.failure_signals, 'failure_signals');
  const recognitionFeatures = parseStringArray(args.recognition_features, 'recognition_features');
  const styleRecognitionFeatures = parseStringArray(
    args.style_recognition_features,
    'style_recognition_features'
  );
  const protectedRegions = parseStringArray(args.protected_regions, 'protected_regions');
  const protectedLayerIds = parsePositiveIntegerArray(args.protected_layer_ids, 'protected_layer_ids');
  const replaceProtectedLayerIds = parsePositiveIntegerArray(
    args.replace_protected_layer_ids,
    'replace_protected_layer_ids'
  );
  for (const layerId of replaceProtectedLayerIds) {
    if (!protectedLayerIds.includes(layerId)) {
      throw new Error('replace_protected_layer_ids may contain only ids also declared in protected_layer_ids');
    }
  }
  const previousPreview = parsePreviousPreview(args.previous_preview);


  if (!Array.isArray(args.steps)) throw new Error('steps must be an array');
  if (args.steps.length < 2 || args.steps.length > VISUAL_MICROPLAN_MAX_STEPS) {
    throw new Error(`steps must contain 2-${VISUAL_MICROPLAN_MAX_STEPS} entries`);
  }

  const seenIds = new Set<string>();
  for (const step of args.steps as Array<Record<string, any>>) {
    if (step?.tool !== 'photoshop_paint_regions' || step.args?.replace_contents !== true) continue;
    const layerId = Number((args.logical_layer as Record<string, unknown>)?.layer_id);
    const regions = step.args.regions;
    if (args.action_class !== 'REPLACE' || !Number.isSafeInteger(layerId) || layerId <= 0
      || !Array.isArray(regions) || !regions.length || regions.some((r: any) => r.layer_id !== layerId))
      throw new Error('component_rebuild_target_required: REPLACE requires one exact owned layer and every region pinned to it');
  }
  const steps = args.steps.map((value, index): VisualMicroPlanStep => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`steps[${index}] must be an object`);
    }
    const record = value as Record<string, unknown>;
    const id = requireString(record.id, `steps[${index}].id`);
    if (seenIds.has(id)) throw new Error(`duplicate step id "${id}"`);
    seenIds.add(id);
    const tool = requireString(record.tool, `steps[${index}].tool`);
    const allowed =
      VISUAL_MICROPLAN_PREPARE_TOOLS.has(tool) ||
      VISUAL_MICROPLAN_MUTATION_TOOLS.has(tool) ||
      tool === VISUAL_MICROPLAN_CAPTURE_TOOL;
    if (!allowed) {
      throw new Error(`tool "${tool}" is not allowed inside a VisualMicroPlan`);
    }
    return {
      id,
      tool,
      args: parseArgsObject(record.args, `steps[${index}].args`),
      ...(record.region === undefined ? {} : { region: requireString(record.region, `steps[${index}].region`) }),
      ...(record.description === undefined ? {} : { description: requireString(record.description, `steps[${index}].description`) }),
      ...(record.method_class === undefined ? {} : {
        methodClass: parseEnum(record.method_class, `steps[${index}].method_class`, VISUAL_MICROPLAN_METHOD_CLASSES) as VisualMicroPlanMethodClass,
      }),
      ...(record.risk === undefined ? {} : {
        risk: parseEnum(record.risk, `steps[${index}].risk`, VISUAL_MICROPLAN_RISKS) as VisualMicroPlanRisk,
      }),
      ...(record.method_id === undefined ? {} : { methodId: requireString(record.method_id, `steps[${index}].method_id`) }),
      ...(record.edge_boundary_ids === undefined ? {} : {
        edgeBoundaryIds: parseStringArray(record.edge_boundary_ids, `steps[${index}].edge_boundary_ids`),
      }),
    };
  });

  const deferred = preflightDeferredStepReferences(steps);
  if (deferred.errors.length) throw new Error(deferred.errors.join('\n'));

  const mutationIndexes = steps
    .map((step, index) => (VISUAL_MICROPLAN_MUTATION_TOOLS.has(step.tool) ? index : -1))
    .filter((index) => index >= 0);
  if (mutationIndexes.length < 1 || mutationIndexes.length > VISUAL_MICROPLAN_MAX_MUTATIONS) {
    throw new Error(`VisualMicroPlan requires 1-${VISUAL_MICROPLAN_MAX_MUTATIONS} visual mutations; found ${mutationIndexes.length}`);
  }
  const mutationBudget = resolveVisualMicroPlanMutationBudget({
    risk,
    stage,
    scale,
    actionClass: args.action_class === undefined ? undefined : String(args.action_class),
    protectedLayerCount: protectedLayerIds.length,
    affectedRelationCount: affectedRelations.length,
    affectedQualityCount: affectedQualities.length,
  });
  if (mutationIndexes.length > mutationBudget.allowedMutations) {
    throw new Error(
      `VisualMicroPlan mutation budget exceeded: requested=${mutationIndexes.length} allowed=${mutationBudget.allowedMutations} (${mutationBudget.reason})`
    );
  }
  const mutationIndex = mutationIndexes[0]!;
  const lastMutationIndex = mutationIndexes[mutationIndexes.length - 1]!;
  // Layer masks are native selection-sensitive mutations. A method label is
  // never evidence for the selection or the active layer; require an exact
  // executor target and an explicit native mode, independently of paint style.
  for (const index of mutationIndexes) {
    const step = steps[index]!;
    if (step.tool !== 'photoshop_create_layer_mask') continue;
    const target = step.args.layer_id;
    if (!((typeof target === 'number' && Number.isSafeInteger(target) && target > 0)
      || (typeof target === 'string' && /^\$steps\.[A-Za-z0-9_-]+\.details\.layerId$/.test(target)))) {
      throw new Error('mask_target_layer_required: create_layer_mask requires a pinned layer_id, not the mutable active layer');
    }
    const mode = step.args.mask_mode;
    if (mode !== 'revealAll' && mode !== 'revealSelection') {
      throw new Error('mask_mode_required: explicitly choose revealAll or revealSelection; no native implicit fallback');
    }
    if (mode === 'revealSelection') {
      const selected = steps.slice(0, mutationIndex).some(candidate => [
        'photoshop_select_rectangle', 'photoshop_select_ellipse', 'photoshop_select_subject',
      ].includes(candidate.tool));
      if (!selected) throw new Error('mask_selection_provenance_required: revealSelection requires a selection prepared in this same bounded visual plan');
      const bounds = step.args.expected_selection_bounds;
      if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)
        || !['left', 'top', 'right', 'bottom'].every(key =>
          Number.isFinite((bounds as Record<string, unknown>)[key] as number))
        || !((bounds as Record<string, number>).right > (bounds as Record<string, number>).left
          && (bounds as Record<string, number>).bottom > (bounds as Record<string, number>).top)) {
        throw new Error('mask_selection_bounds_required: revealSelection needs exact finite bounds for native pre-mutation readback');
      }
    }
  }
  const constructionErrors = collectVisualMicroPlanConstructionErrors(args);
  if (constructionErrors.length) throw new Error(constructionErrors.join('\n'));
  const captureIndex = steps.length - 1;
  if (steps[captureIndex]!.tool !== VISUAL_MICROPLAN_CAPTURE_TOOL) {
    throw new Error('the final VisualMicroPlan step must be photoshop_get_preview');
  }
  const captureIndexes = steps
    .map((step, index) => (step.tool === VISUAL_MICROPLAN_CAPTURE_TOOL ? index : -1))
    .filter((index) => index >= 0);
  if (captureIndexes.length > 2) throw new Error('VisualMicroPlan allows at most one before preview plus the final preview');
  const beforeCaptureIndex = captureIndexes.length === 2 ? captureIndexes[0] : undefined;
  if (lastMutationIndex !== captureIndex - 1) {
    throw new Error('the final visual mutation must be immediately followed by the final preview');
  }
  if (beforeCaptureIndex !== undefined && beforeCaptureIndex !== mutationIndex - 1) {
    throw new Error('the optional before preview must be immediately before the visual mutation');
  }

  if (logicalLayer) {
    const createSteps = steps
      .filter((step, index) => step.tool === 'photoshop_create_layer' && index < mutationIndex
        || step.tool === 'photoshop_source_bound_reflection' && index === mutationIndex);
    const isCreateDecision = logicalLayer.decision === 'create-new' || logicalLayer.decision === 'temporary-hypothesis';
    const isContinueDecision = logicalLayer.decision === 'continue-logical-layer' || logicalLayer.decision === 'adjust';

    if (isCreateDecision) {
      if (!logicalLayer.expectedIndependentRollback) {
        throw new Error('create-new/temporary-hypothesis requires expected_independent_rollback=true');
      }
      if (!logicalLayer.layerName) {
        throw new Error('create-new/temporary-hypothesis requires logical_layer.layer_name');
      }
      if (logicalLayer.layerId !== undefined) {
        throw new Error('create-new/temporary-hypothesis must not supply an existing logical_layer.layer_id');
      }
      if (createSteps.length !== 1) {
        throw new Error('anti-layer-explosion: create-new/temporary-hypothesis requires exactly one photoshop_create_layer step or one source-bound reflection mutation');
      }
      const createStep = createSteps[0]!;
      const createName = typeof createStep.args.name === 'string' ? createStep.args.name.trim() : '';
      if (createName !== logicalLayer.layerName) {
        throw new Error('logical_layer.layer_name must match the physical layer producer name');
      }
      if (createStep.tool === 'photoshop_source_bound_reflection') {
        if (mutationIndexes.length !== 1 || mutationIndexes[0] !== mutationIndex
          || logicalLayer.causalEffect?.relation !== 'reflection_of') {
          throw new Error('reflection_source_binding_required: reflection must be the sole mutation of a new reflection_of semantic owner');
        }
      }
      logicalLayer.createStepId = createStep.id;
      const expectedRef = `$steps.${createStep.id}.details.layerId`;
      for (const index of mutationIndexes) {
        for (const ref of rawMutationTargetRefs(steps[index]!)) {
          if (ref !== expectedRef) {
            throw new Error(`new logical layer mutations must target ${expectedRef}; unrelated targets must be split`);
          }
        }
      }
    } else if (isContinueDecision) {
      if (!logicalLayer.layerId) {
        throw new Error('continue-logical-layer/adjust requires logical_layer.layer_id');
      }
      if (createSteps.length) {
        throw new Error('anti-layer-explosion: continuing/adjusting a logical layer must not create another layer');
      }
      for (const index of mutationIndexes) {
        for (const ref of rawMutationTargetRefs(steps[index]!)) {
          if (ref !== logicalLayer.layerId && !crossLayerCorrection?.targetLayerIds.includes(Number(ref))) {
            throw new Error(`continue-logical-layer/adjust mutations must target logical_layer.layer_id=${logicalLayer.layerId}`);
          }
        }
      }
    } else if (logicalLayer.decision === 'keep' || logicalLayer.decision === 'discard' || logicalLayer.decision === 'merge') {
      throw new Error(`logical_layer.decision=${logicalLayer.decision} is a lifecycle decision; use the guarded layer lifecycle tool rather than hiding it inside a paint micro-plan`);
    }
  }

  for (let index = 0; index < mutationIndex; index++) {
    if (index !== beforeCaptureIndex && !VISUAL_MICROPLAN_PREPARE_TOOLS.has(steps[index]!.tool)) {
      throw new Error(`step "${steps[index]!.id}" is not a permitted preparation step`);
    }
  }

  if (methodClass === 'preset-brush') {
    if (!paintStrategy) {
      throw new Error('method_class=preset-brush requires paint_strategy');
    }
    if (!paintStrategy.presetName) {
      throw new Error('method_class=preset-brush requires paint_strategy.preset_name');
    }
    const selectedPreset = [...steps.slice(0, mutationIndex)]
      .reverse()
      .find(step => step.tool === 'photoshop_select_brush_preset');
    if (!selectedPreset || selectedPreset.args.name !== paintStrategy.presetName) {
      throw new Error('paint_strategy.preset_name must match the selected Photoshop brush preset before mutation');
    }
    const stampSteps = mutationIndexes
      .map(index => steps[index]!)
      .filter(step => step.tool === 'photoshop_paint_stamp_instances');
    const stampOnly = stampSteps.length > 0 && stampSteps.length === mutationIndexes.length;
    if (stampOnly) {
      if (!paintStrategy.brushPackId || !paintStrategy.stampProfileId) {
        throw new Error('stamp-instance preset-brush mutation requires paint_strategy.brush_pack_id and stamp_profile_id');
      }
    }
    for (const step of stampSteps) {
      if (step.args.preset_name !== paintStrategy.presetName) {
        throw new Error('stamp-instance preset_name must match paint_strategy.preset_name');
      }
      if (paintStrategy.brushPackId && step.args.brush_pack_id !== paintStrategy.brushPackId) {
        throw new Error('stamp-instance brush_pack_id must match paint_strategy.brush_pack_id');
      }
      if (paintStrategy.stampProfileId && step.args.stamp_profile_id !== paintStrategy.stampProfileId) {
        throw new Error('stamp-instance stamp_profile_id must match paint_strategy.stamp_profile_id');
      }
    }
  }
  for (let index = mutationIndex; index <= lastMutationIndex; index++) {
    const step = steps[index]!;
    if (!VISUAL_MICROPLAN_MUTATION_TOOLS.has(step.tool)) {
      throw new Error('visual mutations must form one contiguous bounded transaction with no preparation/read steps between them');
    }
    if (step.region !== undefined && step.region !== region) {
      throw new Error(`step "${step.id}" region must match micro-plan region "${region}"`);
    }
    if (step.risk !== undefined && riskRank(step.risk) > riskRank(risk)) {
      throw new Error(`step "${step.id}" risk=${step.risk} cannot be hidden inside micro-plan risk=${risk}`);
    }
  }
  if (edges.length) {
    const edgeIds = new Set(edges.map(edge => edge.boundaryId));
    const referenced = new Set<string>();
    for (const index of mutationIndexes) {
      const step = steps[index]!;
      for (const boundaryId of step.edgeBoundaryIds ?? []) {
        if (!edgeIds.has(boundaryId)) throw new Error(`step "${step.id}" references unknown edge boundary_id ${boundaryId}`);
        referenced.add(boundaryId);
      }
    }
    const unbound = [...edgeIds].filter(boundaryId => !referenced.has(boundaryId));
    if (unbound.length) throw new Error(`every edge intent must bind to at least one mutation step; missing: ${unbound.join(', ')}`);
  }

  if (paintStrategy && paintStrategy.pressurePolicy.startsWith('simulated-')) {
    const strokes = mutationIndexes
      .flatMap(index => Array.isArray(steps[index]!.args.strokes) ? steps[index]!.args.strokes as unknown[] : [])
      .filter(value => value && typeof value === 'object' && !Array.isArray(value)) as Array<Record<string, unknown>>;
    if (!strokes.length) {
      throw new Error('simulated pressure policy requires photoshop_paint_strokes');
    }
    const hasSize = strokes.some(stroke => {
      const dynamics = stroke.dynamics;
      return stroke.simulate_pressure === true
        || (!!dynamics && typeof dynamics === 'object' && !Array.isArray(dynamics) && Array.isArray((dynamics as Record<string, unknown>).size));
    });
    const hasOpacity = strokes.some(stroke => {
      const dynamics = stroke.dynamics;
      return stroke.simulate_pressure === true
        || (!!dynamics && typeof dynamics === 'object' && !Array.isArray(dynamics) && Array.isArray((dynamics as Record<string, unknown>).opacity));
    });
    if ((paintStrategy.pressurePolicy === 'simulated-size' || paintStrategy.pressurePolicy === 'simulated-size-opacity') && !hasSize) {
      throw new Error('simulated size pressure requires simulate_pressure=true or stroke dynamics.size');
    }
    if ((paintStrategy.pressurePolicy === 'simulated-opacity' || paintStrategy.pressurePolicy === 'simulated-size-opacity') && !hasOpacity) {
      throw new Error('simulated opacity pressure requires simulate_pressure=true or stroke dynamics.opacity');
    }
  }

  const previewArgs = steps[captureIndex]!.args;
  if (previewArgs.include_image === false && typeof previewArgs.materialize_path !== 'string') {
    throw new Error('VisualMicroPlan preview must include the image or materialize it for inspection');
  }
  if (beforeCaptureIndex !== undefined) {
    const beforeArgs = steps[beforeCaptureIndex]!.args;
    if (beforeArgs.include_image === false && typeof beforeArgs.materialize_path !== 'string') {
      throw new Error('VisualMicroPlan before preview must include the image or materialize it for inspection');
    }
  }

  if (visualMicroPlanRequiresLocalInspection(scale, significanceMode)) {
    if (beforeCaptureIndex === undefined) {
      throw new Error('small/local VisualMicroPlan requires an immediately-before preview for visual significance measurement');
    }
    const beforeArgs = steps[beforeCaptureIndex]!.args;
    const beforeFocus = focusRegion(beforeArgs, 'before preview');
    const afterFocus = focusRegion(previewArgs, 'final preview');
    if (!beforeFocus || !afterFocus) {
      throw new Error('small/local VisualMicroPlan requires focus_region on both before and final previews');
    }
    if (!sameFocusRegion(beforeFocus, afterFocus)) {
      throw new Error('small/local VisualMicroPlan requires the same focus_region before and after mutation');
    }
    const beforeMax = Number(beforeArgs.focus_max_dimension_px ?? 1200);
    const afterMax = Number(previewArgs.focus_max_dimension_px ?? 1200);
    if (beforeMax < 800 || afterMax < 800) {
      throw new Error('small/local VisualMicroPlan requires focus_max_dimension_px >= 800 for local inspection');
    }
    if (verificationMode !== 'before_after') {
      throw new Error('small/local VisualMicroPlan requires verification_envelope.mode=before_after');
    }
    if ((minFocusDimensionPx ?? 800) < 800) {
      throw new Error('small/local VisualMicroPlan requires verification_envelope.min_focus_dimension_px >= 800');
    }
  }

  const actionClass = actionClassRaw as VisualMicroPlanActionClass;
  if (replaceProtectedLayerIds.length && actionClass !== 'REPLACE' && actionClass !== 'ERASE') {
    throw new Error('replace_protected_layer_ids requires action_class=REPLACE or ERASE');
  }
  const mutationTool = steps[mutationIndex]!.tool;
  if (actionClass === 'ROLLBACK' && (mutationIndexes.length !== 1 || mutationTool !== 'photoshop_undo')) {
    throw new Error('ROLLBACK micro-plans must use photoshop_undo as their visual mutation');
  }
  if (mutationIndexes.some(index => steps[index]!.tool === 'photoshop_undo') && actionClass !== 'ROLLBACK') {
    throw new Error('photoshop_undo is allowed only for action_class=ROLLBACK');
  }

  return {
    planId,
    summary,
    stage,
    scale,
    region,
    regionBounds,
    objectContextRegionBounds,
    intent,
    methodClass,
    risk,
    mutationBudget,
    expectedVisualDelta,
    verificationEnvelope: {
      mode: verificationMode,
      ...(minFocusDimensionPx === undefined ? {} : { minFocusDimensionPx }),
    },
    layerSeparationCheck,
    logicalLayer,
    crossLayerCorrection,
    plannerDirectiveId,
    plannerTaskId,
    painterScope,
    changeDomains,
    affectedRelations,
    affectedQualities,
    preservationFacts,
    independentRegion,
    addressesPrimaryMismatch,
    addressesProblemId,
    addressesProblemIds,
    paintStrategy,
    ...(materialResponse ? { materialResponse } : {}),
    edges,
    problemId,
    actionClass,
    expectedVisualResult,
    failureSignals,
    recognitionFeatures,
    styleRecognitionFeatures,
    protectedRegions,
    protectedLayerIds,
    replaceProtectedLayerIds,
    documentId,
    significanceMode,
    previousPreview,
    steps,
    mutationIndex,
    mutationIndexes,
    lastMutationIndex,
    beforeCaptureIndex,
    captureIndex,
  };
}

function getByPath(root: unknown, path: string): unknown {
  let current = root;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function resolveVisualMicroPlanArgs(
  value: unknown,
  results: Record<string, unknown>
): unknown {
  if (typeof value === 'string') {
    const match = PLACEHOLDER_RE.exec(value);
    if (!match) return value;
    const stepId = match[1]!;
    if (!Object.prototype.hasOwnProperty.call(results, stepId)) {
      throw new Error(`step "${stepId}" has no result yet for placeholder "${value}"`);
    }
    const path = match[2];
    const resolved = path ? getByPath(results[stepId], path) : results[stepId];
    if (resolved === undefined) {
      throw new Error(`placeholder path "${path ?? ''}" was not found in step "${stepId}"`);
    }
    return resolved;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveVisualMicroPlanArgs(item, results));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveVisualMicroPlanArgs(item, results);
    }
    return out;
  }
  return value;
}

/** Extract a compact JSON-like root for later `$steps.*` references. */
export function normalizeToolResultForPlaceholders(result: ToolResult): unknown {
  const texts = result.content
    .filter((item): item is Extract<ToolResult['content'][number], { type: 'text' }> => item.type === 'text')
    .map((item) => item.text);

  for (const text of texts) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // Native connector hosts may append a non-JSON identity footer to an
      // otherwise valid JSON tool payload. Keep placeholder/preflight parsing
      // compatible with the raw semantic tool result instead of treating that
      // presentation footer as a malformed Photoshop response.
      const identityMarker = '\n\n--- Identity notice ---';
      const markerIndex = text.indexOf(identityMarker);
      if (markerIndex > 0) {
        try {
          return JSON.parse(text.slice(0, markerIndex)) as unknown;
        } catch {
          // Fall through and try the next text block.
        }
      }
      // Try the next text block; preview results contain image + JSON metadata.
    }
  }

  return { text: texts.join('\n'), is_error: result.isError === true };
}
