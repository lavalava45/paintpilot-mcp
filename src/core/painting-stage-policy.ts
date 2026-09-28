export const PAINTING_POLICY_MODULES = [
  'invariants',
  'recognition_block_in',
  'composition',
  'value_form',
  'edge_control',
  'material_texture',
  'detail',
  'final_selection',
  'recovery_diagnostics',
] as const;

export type PaintingPolicyModule = (typeof PAINTING_POLICY_MODULES)[number];

export interface PaintingStagePolicyFacts {
  stage: string;
  recoveryActive?: boolean;
  referenceMeasurementActive?: boolean;
}

export interface PaintingStagePolicyProjection {
  stage: string;
  activeModules: PaintingPolicyModule[];
  unknownStage: boolean;
  compactPolicy: {
    invariant_rules: string[];
    stage_rules: string[];
    unknown_stage_marker?: string;
  };
}

export const PAINTING_STAGE_RESET_REASONS = [
  'composition_invalidated',
  'silhouette_reconstruction',
  'user_requested_structural_redesign',
  'accepted_anchor_rollback_changed_stage_basis',
  'structural_regression_recovery',
] as const;

export type PaintingStageResetReason = (typeof PAINTING_STAGE_RESET_REASONS)[number];

const STAGE_RANKS: Record<string, number> = {
  RECOGNITION_BLOCK_IN: 0,
  GLOBAL_BLOCK_IN: 0,
  BLOCK_IN: 0,
  BLOCKIN: 0,
  COMPOSITION: 1,
  SHAPE: 2,
  VALUE: 3,
  FORM: 4,
  MEDIUM_FORM: 4,
  FORM_AND_LIGHT: 4,
  EDGE: 5,
  EDGE_CONTROL: 5,
  MATERIAL: 6,
  DETAIL: 7,
  MICRO_DETAIL: 8,
  FINAL: 9,
  FINISH: 9,
  FINAL_SELECTION: 9,
  ACCEPTANCE: 9,
};

export function canonicalPaintingStage(stage: unknown): string | undefined {
  if (typeof stage !== 'string' || !stage.trim()) return undefined;
  const normalized = stage.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'MASS_BLOCK_IN') return 'GLOBAL_BLOCK_IN';
  if (normalized === 'EDGE_CONTROL') return 'EDGE';
  if (normalized === 'ACCEPTANCE') return 'FINAL_SELECTION';
  return normalized === 'BLOCKIN' || normalized === 'BLOCK_IN'
    ? 'GLOBAL_BLOCK_IN'
    : normalized;
}

export function paintingStageRank(stage: unknown): number | undefined {
  const canonical = canonicalPaintingStage(stage);
  return canonical === undefined ? undefined : STAGE_RANKS[canonical];
}

export function isBackwardPaintingStageTransition(fromStage: unknown, toStage: unknown): boolean {
  const fromRank = paintingStageRank(fromStage);
  const toRank = paintingStageRank(toStage);
  return fromRank !== undefined && toRank !== undefined && toRank < fromRank;
}

const INVARIANT_RULES = [
  'Use the established Photoshop execution route; do not substitute external image generation.',
  'Preserve document identity and provenance; fail closed when the target cannot be proven.',
  'Keep preview/report/rollback and reconciliation obligations intact across continuation and resume.',
  'Treat current directive/task and current/kept/artistic-anchor identities as authoritative compact state.',
  'Recover from durable state without replaying an uncertain or already-successful mutation.',
] as const;

const STAGE_RULES: Record<Exclude<PaintingPolicyModule, 'invariants' | 'recovery_diagnostics'>, readonly string[]> = {
  recognition_block_in: [
    'Establish recognizability, large masses, silhouette, and principal spatial relationships before detail.',
    'Do not spend the pass on local texture, micro-detail, or final polish.',
  ],
  composition: [
    'Judge large placement, negative space, directional flow, and major light pattern before local rendering.',
  ],
  value_form: [
    'Prioritize large value grouping, plane/form readability, and coherent lighting before texture/detail.',
  ],
  edge_control: [
    'Use edge hierarchy intentionally; hard/soft/lost/broken boundaries must support form and focus.',
  ],
  material_texture: [
    'Texture and material cues must remain subordinate to established form, value, and focal hierarchy.',
  ],
  detail: [
    'Add only selective local detail after larger form/value relationships are already established.',
    'Do not let micro-detail replace unresolved silhouette, structure, value, or edge problems.',
  ],
  final_selection: [
    'Evaluate the whole painting against the brief, strongest artistic anchor, regressions, and unresolved must-fix issues.',
    'Final selection may choose the strongest frame but must not relabel an unsatisfied brief as complete.',
  ],
};

const RECOVERY_RULES = [
  'Diagnose route/state/provenance uncertainty before continuing.',
  'Resume from durable state and fresh evidence; do not repaint solely to reconstruct context.',
] as const;

function stageModules(stage: string): PaintingPolicyModule[] | undefined {
  switch (canonicalPaintingStage(stage)) {
    case 'RECOGNITION_BLOCK_IN':
    case 'GLOBAL_BLOCK_IN':
    case 'BLOCK_IN':
    case 'BLOCKIN':
      return ['recognition_block_in'];
    case 'COMPOSITION':
      return ['composition'];
    case 'SHAPE':
    case 'VALUE':
    case 'FORM':
    case 'MEDIUM_FORM':
    case 'FORM_AND_LIGHT':
      return ['value_form'];
    case 'EDGE':
      return ['edge_control'];
    case 'MATERIAL':
      return ['material_texture'];
    case 'DETAIL':
    case 'MICRO_DETAIL':
      return ['detail'];
    case 'FINAL':
    case 'FINISH':
    case 'FINAL_SELECTION':
      return ['final_selection'];
    case 'RECOVERY':
    case 'DIAGNOSTIC':
    case 'RECONCILE':
      return [];
    default:
      return undefined;
  }
}

function policyRulesFor(modules: PaintingPolicyModule[]): string[] {
  const rules: string[] = [];
  for (const module of modules) {
    if (module === 'invariants') continue;
    if (module === 'recovery_diagnostics') {
      rules.push(...RECOVERY_RULES);
      continue;
    }
    rules.push(...STAGE_RULES[module]);
  }
  return rules;
}

/**
 * Pure deterministic projection from compact durable facts. No source/schema/runtime reads.
 */
export function projectPaintingStagePolicy(facts: PaintingStagePolicyFacts): PaintingStagePolicyProjection {
  const stage = canonicalPaintingStage(facts.stage) ?? '';
  const scoped = stageModules(stage);
  const unknownStage = scoped === undefined;
  const activeModules: PaintingPolicyModule[] = ['invariants'];

  if (scoped) activeModules.push(...scoped);
  if (facts.recoveryActive === true || ['RECOVERY', 'DIAGNOSTIC', 'RECONCILE'].includes(stage)) {
    activeModules.push('recovery_diagnostics');
  }

  const deduped = [...new Set(activeModules)];
  return {
    stage,
    activeModules: deduped,
    unknownStage,
    compactPolicy: {
      invariant_rules: [...INVARIANT_RULES],
      stage_rules: policyRulesFor(deduped),
      ...(unknownStage
        ? { unknown_stage_marker: `UNKNOWN_STAGE:${stage || '<empty>'}; invariant kernel only` }
        : {}),
    },
  };
}

export function serializePaintingStagePolicy(facts: PaintingStagePolicyFacts): string {
  return JSON.stringify(projectPaintingStagePolicy(facts));
}
