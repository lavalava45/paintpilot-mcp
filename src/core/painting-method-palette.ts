import { ToolRegistry } from './tool-registry.js';
import type { StyleMethodTraitEvidence } from './style-contract-runtime.js';

export const PAINTING_IMPACT_CLASSES = [
  'construct',
  'subtract',
  'edge',
  'tone',
  'texture',
  'transition',
  'transform',
  'isolate',
  'composite',
  'cleanup',
] as const;
export type PaintingImpactClass = (typeof PAINTING_IMPACT_CLASSES)[number];

export const PAINTING_VISUAL_INTENTS = [
  'line',
  'mass',
  'painted-mass',
  'planar-mass',
  'broken-mass',
  'atmospheric-mass',
  'directional-mass',
  'surface-flow',
  'soft-transition',
  'continuous-field',
  'hard-edge',
  'lost-edge',
  'texture',
  'smooth',
  'sharpen',
  'light-sculpt',
  'tonal-contrast',
  'isolate-region',
  'mask-fade',
  'move-scale-rotate',
  'remove-distraction',
  'blend-layers',
] as const;
export type PaintingVisualIntent = (typeof PAINTING_VISUAL_INTENTS)[number];

export const PAINTING_CONSTRUCTION_ROLES = [
  'structured-mass',
  'continuous-field',
  'volumetric-soft-mass',
  'optical-veil',
] as const;
export type PaintingConstructionRole = (typeof PAINTING_CONSTRUCTION_ROLES)[number];

export type MethodAvailability = 'available' | 'conditional' | 'unavailable';

export interface PaintingMethodCapability {
  id: string;
  label: string;
  methodClass: string;
  impactClasses: PaintingImpactClass[];
  visualIntents: PaintingVisualIntent[];
  primaryTool?: string;
  executionTools?: string[];
  preparationTools?: string[];
  preparationAnyOf?: string[];
  fallbackMethodIds?: string[];
  availability: MethodAvailability;
  availabilityReason: string;
  executionHints?: Record<string, unknown>;
  limitations?: string[];
  verificationExpectation: {
    evidence: 'before-after-preview';
    scope: 'whole-frame' | 'local-region';
    expectedSignals: string[];
    stateReadback?: string[];
  };
}

type CapabilitySeed = Omit<PaintingMethodCapability, 'availability' | 'availabilityReason' | 'verificationExpectation'> & {
  requiredTools?: string[];
  conditionalTools?: string[];
  unavailableReason?: string;
};

function verificationExpectationFor(seed: CapabilitySeed): PaintingMethodCapability['verificationExpectation'] {
  const expectedSignals = new Set<string>();
  if (seed.impactClasses.includes('construct')) expectedSignals.add('declared shape/mass is visibly present in the intended region');
  if (seed.impactClasses.includes('subtract') || seed.impactClasses.includes('cleanup')) expectedSignals.add('declared unwanted content is visibly reduced without unexplained replacement damage');
  if (seed.impactClasses.includes('edge')) expectedSignals.add('the targeted boundary behavior visibly changes in the requested direction');
  if (seed.impactClasses.includes('tone')) expectedSignals.add('the intended tonal/light relationship changes while protected structure remains readable');
  if (seed.impactClasses.includes('texture')) expectedSignals.add('surface mark/texture character changes without being treated as proof of structural improvement');
  if (seed.impactClasses.includes('transition')) expectedSignals.add('the targeted transition visibly becomes softer, harder, lost, or otherwise matches the declared intent');
  if (seed.impactClasses.includes('transform')) expectedSignals.add('the intended object/layer placement, scale, or rotation changes while unrelated content remains stable');
  if (seed.impactClasses.includes('isolate')) expectedSignals.add('the intended region is isolated with boundary behavior consistent with the declared mask/selection intent');
  if (seed.impactClasses.includes('composite')) expectedSignals.add('the intended layer relationship changes without an unexplained seam, halo, or depth-order regression');
  if (!expectedSignals.size) expectedSignals.add('the declared visual result is observable in the registered before/after evidence');

  const stateReadback: string[] = [];
  if (seed.preparationTools?.includes('photoshop_set_brush')) {
    stateReadback.push('effective brush settings must match the declared execution hints before painting');
  }
  if (seed.preparationTools?.includes('photoshop_select_brush_preset')) {
    stateReadback.push('effective selected preset/settings must be known from current runtime evidence, not a stale preset name');
  }
  if (seed.preparationTools?.includes('photoshop_create_layer_mask')) {
    stateReadback.push('the target layer/mask identity must remain pinned through mutation and verification');
  }
  if (seed.preparationAnyOf?.some(tool => tool.startsWith('photoshop_select_'))) {
    stateReadback.push('the selection source/geometry must come from one explicit preparation step rather than an inferred region');
  }
  if (seed.methodClass === 'transform' || seed.methodClass === 'blend' || seed.methodClass === 'adjustment') {
    stateReadback.push('the target document/layer identity must be current and pinned before mutation');
  }

  return {
    evidence: 'before-after-preview',
    scope: seed.impactClasses.includes('transform') || seed.impactClasses.includes('composite') ? 'whole-frame' : 'local-region',
    expectedSignals: [...expectedSignals],
    ...(stateReadback.length ? { stateReadback } : {}),
  };
}

const SEEDS: CapabilitySeed[] = [
  {
    id: 'generative-fill',
    label: 'Generative Fill',
    methodClass: 'generative',
    impactClasses: ['construct', 'composite'],
    visualIntents: ['mass', 'blend-layers'],
    primaryTool: 'photoshop_generative_fill',
    unavailableReason: 'Disabled by contract: generative painting methods are unavailable in this MCP runtime.',
  },
  {
    id: 'generative-remove',
    label: 'Generative Remove',
    methodClass: 'generative',
    impactClasses: ['cleanup', 'subtract'],
    visualIntents: ['remove-distraction'],
    primaryTool: 'photoshop_generative_remove',
    unavailableReason: 'Disabled by contract: generative painting methods are unavailable in this MCP runtime.',
  },
  {
    id: 'generative-expand',
    label: 'Generative Expand',
    methodClass: 'generative',
    impactClasses: ['construct', 'composite'],
    visualIntents: ['mass', 'blend-layers'],
    primaryTool: 'photoshop_generative_expand',
    unavailableReason: 'Disabled by contract: generative painting methods are unavailable in this MCP runtime.',
  },
  {
    id: 'generative-upscale',
    label: 'Generative Upscale',
    methodClass: 'generative',
    impactClasses: ['texture'],
    visualIntents: ['texture', 'sharpen'],
    primaryTool: 'photoshop_generative_upscale',
    unavailableReason: 'Disabled by contract: generative painting methods are unavailable in this MCP runtime.',
  },
  {
    id: 'generate-image',
    label: 'Generate Image',
    methodClass: 'generative',
    impactClasses: ['construct'],
    visualIntents: ['mass'],
    primaryTool: 'photoshop_generate_image',
    unavailableReason: 'Disabled by contract: generative painting methods are unavailable in this MCP runtime.',
  },
  {
    id: 'pencil-line',
    label: 'Pencil / hard line',
    methodClass: 'line',
    impactClasses: ['construct', 'edge'],
    visualIntents: ['line', 'hard-edge'],
    primaryTool: 'photoshop_paint_strokes',
    requiredTools: ['photoshop_paint_strokes'],
    executionHints: { stroke_tool: 'PENCIL' },
    fallbackMethodIds: ['hard-brush-line'],
  },
  {
    id: 'hard-brush-line',
    label: 'Hard brush line',
    methodClass: 'paint',
    impactClasses: ['construct', 'edge'],
    visualIntents: ['line', 'hard-edge'],
    primaryTool: 'photoshop_paint_strokes',
    preparationTools: ['photoshop_set_brush'],
    requiredTools: ['photoshop_paint_strokes', 'photoshop_set_brush'],
    executionHints: { stroke_tool: 'BRUSH', brush: { hardness: 100 } },
  },
  {
    id: 'region-block-in',
    label: 'Closed region block-in',
    methodClass: 'region',
    impactClasses: ['construct'],
    visualIntents: ['mass', 'hard-edge'],
    primaryTool: 'photoshop_paint_regions',
    requiredTools: ['photoshop_paint_regions'],
    fallbackMethodIds: ['hard-brush-line'],
  },
  {
    id: 'soft-brush-build',
    label: 'Soft brush/dab buildup',
    methodClass: 'paint',
    impactClasses: ['construct', 'tone', 'transition'],
    visualIntents: ['continuous-field', 'painted-mass', 'soft-transition', 'lost-edge', 'light-sculpt'],
    primaryTool: 'photoshop_paint_dabs',
    preparationTools: ['photoshop_set_brush'],
    requiredTools: ['photoshop_paint_dabs', 'photoshop_set_brush'],
    executionHints: { brush: { hardness: 0, flow: 10 } },
  },
  {
    id: 'smudge-shape',
    label: 'Smudge stroke',
    methodClass: 'smudge',
    impactClasses: ['transition', 'edge'],
    visualIntents: ['smooth', 'soft-transition', 'lost-edge'],
    primaryTool: 'photoshop_paint_strokes',
    requiredTools: ['photoshop_paint_strokes'],
    executionHints: { stroke_tool: 'SMUDGE' },
    fallbackMethodIds: ['smart-blur', 'soft-brush-build'],
  },
  {
    id: 'eraser-carve',
    label: 'Eraser carve',
    methodClass: 'erase',
    impactClasses: ['subtract', 'edge'],
    visualIntents: ['hard-edge', 'lost-edge'],
    primaryTool: 'photoshop_paint_strokes',
    requiredTools: ['photoshop_paint_strokes'],
    executionHints: { stroke_tool: 'ERASER' },
    fallbackMethodIds: ['selection-mask'],
  },
  {
    id: 'installed-brush-preset',
    label: 'Installed textured/dry/scatter/bristle-like brush preset',
    methodClass: 'preset-brush',
    impactClasses: ['construct', 'tone', 'transition', 'texture', 'edge'],
    visualIntents: [
      'mass',
      'painted-mass',
      'planar-mass',
      'broken-mass',
      'atmospheric-mass',
      'directional-mass',
      'surface-flow',
      'continuous-field',
      'texture',
      'line',
      'hard-edge',
      'soft-transition',
      'lost-edge',
      'light-sculpt',
    ],
    primaryTool: 'photoshop_paint_strokes',
    preparationTools: ['photoshop_select_brush_preset'],
    requiredTools: ['photoshop_paint_strokes'],
    conditionalTools: ['photoshop_list_brush_presets', 'photoshop_select_brush_preset'],
    fallbackMethodIds: ['noise-texture', 'hard-brush-line'],
    limitations: ['Availability of a suitable textured/dry/scatter/bristle preset depends on the installed Photoshop brush library.'],
  },
  {
    id: 'continuous-color-field',
    label: 'Continuous solid or linear color/value field',
    methodClass: 'gradient',
    impactClasses: ['construct', 'tone', 'transition'],
    visualIntents: ['continuous-field', 'soft-transition'],
    primaryTool: 'photoshop_paint_color_gradient',
    executionTools: ['photoshop_paint_color_gradient', 'photoshop_fill_layer'],
    requiredTools: ['photoshop_paint_color_gradient'],
    limitations: ['Use fill_layer for an explicitly uniform base, or a linear gradient with 2–4 bounded stops only when spatial color variation is intended. Distinct from transparency/mask gradients. A base field does not prove that a depicted area or its required form/light/material structure is finished.'],
  },
  {
    id: 'gradient-mask',
    label: 'Linear gradient on layer mask',
    methodClass: 'mask-gradient',
    impactClasses: ['transition', 'composite'],
    visualIntents: ['mask-fade', 'soft-transition', 'blend-layers'],
    primaryTool: 'photoshop_apply_gradient_mask',
    preparationTools: ['photoshop_create_layer_mask'],
    requiredTools: ['photoshop_apply_gradient_mask'],
    fallbackMethodIds: ['soft-brush-build'],
    limitations: ['Current primitive is linear mask gradient; arbitrary radial paint-gradient is not exposed.'],
  },
  {
    id: 'selection-mask',
    label: 'Selection + layer mask',
    methodClass: 'mask',
    impactClasses: ['isolate', 'subtract', 'composite'],
    visualIntents: ['isolate-region', 'hard-edge', 'blend-layers'],
    primaryTool: 'photoshop_create_layer_mask',
    preparationAnyOf: ['photoshop_select_rectangle', 'photoshop_select_ellipse', 'photoshop_select_subject'],
    requiredTools: ['photoshop_create_layer_mask'],
    limitations: ['Requires one explicit selection source before mask creation; optional feathering may refine that selection but is never inferred by the compiler.'],
  },
  {
    id: 'gaussian-blur',
    label: 'Gaussian blur',
    methodClass: 'filter',
    impactClasses: ['transition'],
    visualIntents: ['smooth', 'soft-transition', 'lost-edge'],
    primaryTool: 'photoshop_apply_gaussian_blur',
    requiredTools: ['photoshop_apply_gaussian_blur'],
    fallbackMethodIds: ['smart-blur', 'smudge-shape'],
  },
  {
    id: 'smart-blur',
    label: 'Smart blur',
    methodClass: 'filter',
    impactClasses: ['transition', 'edge'],
    visualIntents: ['smooth', 'soft-transition'],
    primaryTool: 'photoshop_apply_smart_blur',
    requiredTools: ['photoshop_apply_smart_blur'],
    fallbackMethodIds: ['gaussian-blur', 'smudge-shape'],
  },
  {
    id: 'unsharp-sharpen',
    label: 'Unsharp mask',
    methodClass: 'filter',
    impactClasses: ['edge'],
    visualIntents: ['sharpen', 'hard-edge'],
    primaryTool: 'photoshop_apply_sharpen',
    requiredTools: ['photoshop_apply_sharpen'],
    fallbackMethodIds: ['high-pass-sharpen'],
  },
  {
    id: 'high-pass-sharpen',
    label: 'High-pass detail extraction',
    methodClass: 'filter',
    impactClasses: ['edge', 'texture'],
    visualIntents: ['sharpen', 'texture'],
    primaryTool: 'photoshop_apply_high_pass',
    preparationTools: ['photoshop_set_layer_blend_mode'],
    requiredTools: ['photoshop_apply_high_pass', 'photoshop_set_layer_blend_mode'],
  },
  {
    id: 'noise-texture',
    label: 'Procedural noise texture',
    methodClass: 'texture',
    impactClasses: ['texture'],
    visualIntents: ['texture'],
    primaryTool: 'photoshop_apply_noise',
    requiredTools: ['photoshop_apply_noise'],
    fallbackMethodIds: ['installed-brush-preset'],
  },
  {
    id: 'curves-tone',
    label: 'Curves tonal adjustment',
    methodClass: 'adjustment',
    impactClasses: ['tone'],
    visualIntents: ['tonal-contrast', 'light-sculpt'],
    primaryTool: 'photoshop_adjust_curves',
    requiredTools: ['photoshop_adjust_curves'],
    fallbackMethodIds: ['auto-levels', 'dodge-burn-layer'],
  },
  {
    id: 'auto-levels',
    label: 'Auto levels',
    methodClass: 'adjustment',
    impactClasses: ['tone'],
    visualIntents: ['tonal-contrast'],
    primaryTool: 'photoshop_auto_levels',
    requiredTools: ['photoshop_auto_levels'],
    fallbackMethodIds: ['curves-tone'],
  },
  {
    id: 'dodge-burn-layer',
    label: 'Dodge/burn equivalent via gray blend layer',
    methodClass: 'light-sculpt',
    impactClasses: ['tone'],
    visualIntents: ['light-sculpt'],
    primaryTool: 'photoshop_create_layer',
    executionTools: ['photoshop_create_layer', 'photoshop_fill_layer', 'photoshop_set_layer_blend_mode'],
    requiredTools: ['photoshop_create_layer', 'photoshop_fill_layer', 'photoshop_set_layer_blend_mode'],
    fallbackMethodIds: ['soft-brush-build', 'curves-tone'],
    limitations: ['Runtime uses a semantic gray-layer + blend-mode setup, not dedicated Dodge/Burn brush primitives.'],
  },
  {
    id: 'blend-mode',
    label: 'Layer blend mode',
    methodClass: 'blend',
    impactClasses: ['composite', 'tone', 'texture'],
    visualIntents: ['blend-layers', 'light-sculpt', 'texture'],
    primaryTool: 'photoshop_set_layer_blend_mode',
    requiredTools: ['photoshop_set_layer_blend_mode'],
  },
  {
    id: 'transform-layer',
    label: 'Layer move/scale/rotate',
    methodClass: 'transform',
    impactClasses: ['transform'],
    visualIntents: ['move-scale-rotate'],
    primaryTool: 'photoshop_move_layer',
    executionTools: ['photoshop_move_layer', 'photoshop_scale_layer', 'photoshop_rotate_layer'],
    requiredTools: ['photoshop_move_layer', 'photoshop_scale_layer', 'photoshop_rotate_layer'],
  },
  {
    id: 'content-aware-cleanup',
    label: 'Selection + content-aware fill',
    methodClass: 'cleanup',
    impactClasses: ['cleanup', 'subtract'],
    visualIntents: ['remove-distraction'],
    primaryTool: 'photoshop_content_aware_fill',
    preparationTools: ['photoshop_select_rectangle', 'photoshop_select_ellipse'],
    requiredTools: ['photoshop_content_aware_fill'],
  },
  {
    id: 'clone-stamp',
    label: 'Clone Stamp',
    methodClass: 'clone',
    impactClasses: ['cleanup', 'texture'],
    visualIntents: ['remove-distraction', 'texture'],
    fallbackMethodIds: ['content-aware-cleanup', 'installed-brush-preset'],
    unavailableReason: 'No dedicated Clone Stamp execution primitive is registered in the current runtime.',
  },
  {
    id: 'mixer-brush',
    label: 'Mixer Brush',
    methodClass: 'mixer',
    impactClasses: ['construct', 'transition', 'texture'],
    visualIntents: ['smooth', 'texture', 'soft-transition'],
    fallbackMethodIds: ['smudge-shape', 'installed-brush-preset'],
    unavailableReason: 'No dedicated Mixer Brush execution primitive is registered in the current runtime.',
  },
  {
    id: 'radial-gradient',
    label: 'Radial gradient paint/fill',
    methodClass: 'gradient',
    impactClasses: ['tone', 'transition'],
    visualIntents: ['soft-transition', 'light-sculpt'],
    fallbackMethodIds: ['soft-brush-build', 'gradient-mask'],
    unavailableReason: 'Current runtime exposes linear gradient masks but no verified arbitrary radial gradient paint/fill primitive.',
  },
];

function resolveSeed(seed: CapabilitySeed, registry: ToolRegistry): PaintingMethodCapability {
  const verificationExpectation = verificationExpectationFor(seed);
  if (seed.unavailableReason) {
    return {
      ...seed,
      verificationExpectation,
      availability: 'unavailable',
      availabilityReason: seed.unavailableReason,
    };
  }
  const missingRequired = (seed.requiredTools ?? []).filter(tool => !registry.has(tool));
  if (missingRequired.length) {
    return {
      ...seed,
      verificationExpectation,
      availability: 'unavailable',
      availabilityReason: `Required runtime tool(s) not registered: ${missingRequired.join(', ')}`,
    };
  }
  if (seed.preparationAnyOf?.length && !seed.preparationAnyOf.some(tool => registry.has(tool))) {
    return {
      ...seed,
      verificationExpectation,
      availability: 'unavailable',
      availabilityReason: `No alternative preparation tool is registered; need one of: ${seed.preparationAnyOf.join(', ')}`,
    };
  }
  if (seed.conditionalTools?.length) {
    const missingConditional = seed.conditionalTools.filter(tool => !registry.has(tool));
    if (missingConditional.length) {
      return {
        ...seed,
        verificationExpectation,
        availability: 'unavailable',
        availabilityReason: `Discovery/selection tool(s) not registered: ${missingConditional.join(', ')}`,
      };
    }
    return {
      ...seed,
      verificationExpectation,
      availability: 'conditional',
      availabilityReason: 'Runtime path exists, but the concrete method depends on installed Photoshop presets/capability discovered at execution time.',
    };
  }
  return {
    ...seed,
    verificationExpectation,
    availability: 'available',
    availabilityReason: 'All required runtime tools are currently registered.',
  };
}

export function paintingMethodCapabilities(registry: ToolRegistry): PaintingMethodCapability[] {
  return SEEDS.map(seed => resolveSeed(seed, registry));
}

const INTENT_PREFERENCE: Record<PaintingVisualIntent, string[]> = {
  line: ['pencil-line', 'hard-brush-line', 'installed-brush-preset'],
  mass: ['installed-brush-preset', 'region-block-in', 'hard-brush-line'],
  'painted-mass': ['installed-brush-preset', 'soft-brush-build', 'region-block-in'],
  'planar-mass': ['installed-brush-preset', 'hard-brush-line', 'region-block-in'],
  'broken-mass': ['installed-brush-preset', 'hard-brush-line', 'noise-texture'],
  'atmospheric-mass': ['installed-brush-preset', 'soft-brush-build', 'smudge-shape', 'gradient-mask'],
  'directional-mass': ['installed-brush-preset', 'hard-brush-line', 'soft-brush-build'],
  'surface-flow': ['installed-brush-preset', 'soft-brush-build', 'smudge-shape'],
  'continuous-field': ['continuous-color-field', 'installed-brush-preset', 'soft-brush-build'],
  'soft-transition': ['gradient-mask', 'smudge-shape', 'soft-brush-build', 'smart-blur', 'gaussian-blur', 'radial-gradient'],
  'hard-edge': ['region-block-in', 'pencil-line', 'hard-brush-line', 'selection-mask', 'unsharp-sharpen'],
  'lost-edge': ['smudge-shape', 'soft-brush-build', 'gaussian-blur', 'eraser-carve'],
  texture: ['installed-brush-preset', 'noise-texture', 'high-pass-sharpen', 'mixer-brush'],
  smooth: ['smudge-shape', 'smart-blur', 'gaussian-blur', 'mixer-brush'],
  sharpen: ['unsharp-sharpen', 'high-pass-sharpen'],
  'light-sculpt': ['dodge-burn-layer', 'curves-tone', 'soft-brush-build', 'blend-mode', 'radial-gradient'],
  'tonal-contrast': ['curves-tone', 'auto-levels', 'blend-mode'],
  'isolate-region': ['selection-mask', 'region-block-in'],
  'mask-fade': ['gradient-mask', 'soft-brush-build'],
  'move-scale-rotate': ['transform-layer'],
  'remove-distraction': ['content-aware-cleanup', 'clone-stamp', 'eraser-carve'],
  'blend-layers': ['gradient-mask', 'blend-mode', 'selection-mask'],
};

export interface PaintingMethodSelection {
  constructionRole?: PaintingConstructionRole;
  visualIntent: PaintingVisualIntent;
  impactClass: PaintingImpactClass;
  selected: PaintingMethodCapability;
  fallbacks: PaintingMethodCapability[];
  rejected: Array<{ id: string; availability: MethodAvailability; reason: string }>;
}

const CONSTRUCTION_ROLE_INTENT: Record<PaintingConstructionRole, PaintingVisualIntent> = {
  'structured-mass': 'mass',
  'continuous-field': 'continuous-field',
  'volumetric-soft-mass': 'painted-mass',
  'optical-veil': 'atmospheric-mass',
};

/**
 * Select the Photoshop mechanism only after the semantic construction role is fixed.
 * The role vocabulary is intentionally subject-agnostic: it describes how a visual
 * thing is constructed, not what the depicted thing is called.
 */
export function selectPaintingConstructionMethod(
  registry: ToolRegistry,
  constructionRole: PaintingConstructionRole,
  impactClass: PaintingImpactClass,
  avoidMethodIds: string[] = [],
  options: PaintingMethodSelectionOptions = {},
): PaintingMethodSelection {
  const visualIntent = CONSTRUCTION_ROLE_INTENT[constructionRole];
  const selection = selectPaintingMethod(registry, visualIntent, impactClass, avoidMethodIds, options);
  return { ...selection, constructionRole };
}

export interface PaintingMethodSelectionOptions {
  stage?: string;
  styleTraitEvidence?: StyleMethodTraitEvidence[];
  preferredMethodId?: string;
  executionTools?: string[];
}

function methodSemanticTraits(capability: PaintingMethodCapability): Set<string> {
  const traits = new Set<string>();
  const cls = capability.methodClass;
  if (cls === 'preset-brush') {
    traits.add('visible-marks');
    traits.add('directional-marks');
    traits.add('texture-capable');
  }
  if (cls === 'region') {
    traits.add('solid-coverage');
    traits.add('hard-edge');
    traits.add('low-mark-visibility');
  }
  if (cls === 'line' || cls === 'erase') {
    traits.add('hard-edge');
    traits.add('visible-marks');
  }
  if (cls === 'paint') {
    const hardness = (capability.executionHints?.brush as { hardness?: number } | undefined)?.hardness;
    if (hardness === 0) {
      traits.add('soft-edge');
      traits.add('low-mark-visibility');
    } else if (hardness === 100) {
      traits.add('hard-edge');
      traits.add('visible-marks');
    }
  }
  if (cls === 'smudge' || cls === 'blur') {
    traits.add('soft-edge');
    traits.add('low-mark-visibility');
  }
  if (cls === 'mask' || cls === 'mask-gradient') {
    traits.add('editable-mask-or-layer');
    if (cls === 'mask-gradient') traits.add('soft-edge');
    else traits.add('hard-edge');
  }
  if (cls === 'adjustment' || cls === 'blend') traits.add('editable-mask-or-layer');
  if (capability.impactClasses.includes('texture')) traits.add('texture-capable');
  return traits;
}

function styleTraitScore(
  capability: PaintingMethodCapability,
  evidence: StyleMethodTraitEvidence[] | undefined,
): number {
  if (!evidence?.length) return 0;
  const methodTraits = methodSemanticTraits(capability);
  let score = 0;
  for (const row of evidence) {
    const matches = methodTraits.has(row.trait);
    if (row.preference === 'prefer' && matches) score += 2;
    if (row.preference === 'avoid' && matches) score -= 3;
  }
  return score;
}

export function selectPaintingMethod(
  registry: ToolRegistry,
  visualIntent: PaintingVisualIntent,
  impactClass: PaintingImpactClass,
  avoidMethodIds: string[] = [],
  options: PaintingMethodSelectionOptions = {}
): PaintingMethodSelection {
  const capabilities = paintingMethodCapabilities(registry);
  const byId = new Map(capabilities.map(capability => [capability.id, capability]));
  const preference = INTENT_PREFERENCE[visualIntent] ?? [];
  const ordered = preference
    .map(id => byId.get(id))
    .filter((value): value is PaintingMethodCapability => !!value)
    .filter(capability => capability.impactClasses.includes(impactClass))
    .map((capability, index) => ({ capability, index, score: styleTraitScore(capability, options.styleTraitEvidence) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(row => row.capability);
  const avoided = new Set(avoidMethodIds);
  const usable = (capability: PaintingMethodCapability) => capability.availability !== 'unavailable'
    && !avoided.has(capability.id)
    && capability.visualIntents.includes(visualIntent)
    && capability.impactClasses.includes(impactClass);
  const preferred = options.preferredMethodId ? byId.get(options.preferredMethodId) : undefined;
  if (options.preferredMethodId && (!preferred || !usable(preferred))) {
    throw new Error(`Preferred method ${options.preferredMethodId} is unavailable, avoided or incompatible with ${visualIntent}/${impactClass}`);
  }
  // A recommendation is not an exclusive construction recipe. Preserve a
  // uniquely compatible mechanism already present in the concrete actions.
  const executed = options.executionTools?.length ? ordered.filter(capability => {
    const tools = capability.executionTools?.length ? capability.executionTools
      : capability.primaryTool ? [capability.primaryTool] : [];
    return usable(capability) && options.executionTools!.every(tool => tools.includes(tool));
  }) : [];
  const selected = preferred ?? (executed.length === 1 ? executed[0] : undefined)
    ?? ordered.find(capability => capability.availability !== 'unavailable' && !avoided.has(capability.id));
  if (!selected) {
    throw new Error(`No available method for visual_intent=${visualIntent}, impact_class=${impactClass}`);
  }
  const fallbackIds = [...(selected.fallbackMethodIds ?? []), ...ordered.map(capability => capability.id)];
  const seen = new Set([selected.id]);
  const fallbacks: PaintingMethodCapability[] = [];
  for (const id of fallbackIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const capability = byId.get(id);
    if (capability && capability.availability !== 'unavailable' && !avoided.has(id)) fallbacks.push(capability);
  }
  return {
    visualIntent,
    impactClass,
    selected,
    fallbacks,
    rejected: ordered
      .filter(capability => capability.id !== selected.id && (capability.availability === 'unavailable' || avoided.has(capability.id)))
      .map(capability => ({
        id: capability.id,
        availability: capability.availability,
        reason: avoided.has(capability.id) ? 'explicitly avoided by caller' : capability.availabilityReason,
      })),
  };
}
