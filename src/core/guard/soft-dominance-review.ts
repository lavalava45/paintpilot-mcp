export const SOFT_DOMINANCE_STATUSES = ['pass', 'fail', 'uncertain', 'style-not-applicable'] as const;
export type SoftDominanceStatus = (typeof SOFT_DOMINANCE_STATUSES)[number];

export const SOFT_DOMINANCE_CRITERION_STATUSES = ['resolved', 'debt', 'uncertain', 'not-applicable'] as const;
export type SoftDominanceCriterionStatus = (typeof SOFT_DOMINANCE_CRITERION_STATUSES)[number];

export const SOFT_DOMINANCE_CRITERIA = [
  'edge_hierarchy',
  'mass_separation',
  'large_form_readability',
  'focal_hierarchy',
  'primitive_footprint',
] as const;
export type SoftDominanceCriterion = (typeof SOFT_DOMINANCE_CRITERIA)[number];

export interface SoftDominanceCriterionEvidence {
  status: SoftDominanceCriterionStatus;
  note: string;
}

export interface SoftDominanceStyleBasis {
  field: string;
  criterion: string;
}

export interface SoftDominanceReview {
  protocol: 'photoshop.guard.soft_dominance.v1';
  status: SoftDominanceStatus;
  observed: true;
  evidence_sha256: string;
  construction_role: string | null;
  physical_role: string | null;
  criteria: Record<SoftDominanceCriterion, SoftDominanceCriterionEvidence>;
  style_contract_basis: SoftDominanceStyleBasis | null;
  debt_criteria: SoftDominanceCriterion[];
  trend_signals: string[];
}

export interface SoftDominanceContext {
  previewSha256: string;
  constructionRole?: string;
  physicalRole?: string;
  styleContract?: Record<string, unknown> | null;
}

export interface SoftDominanceRisk {
  required: boolean;
  reason: string;
  scale: 'global' | 'medium' | null;
  construction_role: string | null;
  visual_intent: string | null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizedText(value: unknown): string | undefined {
  return text(value)?.toLowerCase();
}

function requireSha(value: string): string {
  const sha = value.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) {
    throw new Error('softness_review requires exact current preview SHA-256 provenance');
  }
  return sha;
}

function normalizeCriteria(value: unknown): Record<SoftDominanceCriterion, SoftDominanceCriterionEvidence> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('softness_review.criteria must be an object');
  }
  const record = value as Record<string, unknown>;
  const out = {} as Record<SoftDominanceCriterion, SoftDominanceCriterionEvidence>;
  for (const key of SOFT_DOMINANCE_CRITERIA) {
    const raw = record[key];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`softness_review.criteria.${key} must be an object`);
    }
    const row = raw as Record<string, unknown>;
    const status = normalizedText(row.status) as SoftDominanceCriterionStatus | undefined;
    const note = text(row.note);
    if (!status || !SOFT_DOMINANCE_CRITERION_STATUSES.includes(status)) {
      throw new Error(
        `softness_review.criteria.${key}.status must be ${SOFT_DOMINANCE_CRITERION_STATUSES.join('|')}`
      );
    }
    if (!note) throw new Error(`softness_review.criteria.${key}.note must be concrete`);
    out[key] = { status, note };
  }
  return out;
}

function normalizeStyleBasis(
  value: unknown,
  styleContract: Record<string, unknown> | null | undefined
): SoftDominanceStyleBasis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('softness_review style-not-applicable requires style_contract_basis');
  }
  const row = value as Record<string, unknown>;
  const field = text(row.field);
  const criterion = text(row.criterion);
  if (!field || !criterion) {
    throw new Error('softness_review.style_contract_basis requires field and criterion');
  }
  const declared = styleContract?.[field];
  if (typeof declared !== 'string' || declared.trim() !== criterion) {
    throw new Error(
      'softness_review style-not-applicable requires an exact declared style_contract field/value basis'
    );
  }
  return { field, criterion };
}

function requireResolved(
  criteria: Record<SoftDominanceCriterion, SoftDominanceCriterionEvidence>,
  keys: SoftDominanceCriterion[],
  reason: string
) {
  for (const key of keys) {
    if (criteria[key].status !== 'resolved') {
      throw new Error(`softness_review.status=pass requires ${key}=resolved ${reason}`);
    }
  }
}

export function normalizeSoftDominanceReview(
  value: unknown,
  context: SoftDominanceContext
): SoftDominanceReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('softness_review must be an object');
  }
  const record = value as Record<string, unknown>;
  const status = normalizedText(record.status) as SoftDominanceStatus | undefined;
  if (!status || !SOFT_DOMINANCE_STATUSES.includes(status)) {
    throw new Error(`softness_review.status must be ${SOFT_DOMINANCE_STATUSES.join('|')}`);
  }
  if (record.observed !== true) {
    throw new Error('softness_review requires observed=true; unobserved softness review cannot classify the frame');
  }
  const criteria = normalizeCriteria(record.criteria);
  const constructionRole = normalizedText(context.constructionRole) ?? null;
  const physicalRole = normalizedText(context.physicalRole) ?? null;
  const debtCriteria = SOFT_DOMINANCE_CRITERIA.filter(key => criteria[key].status === 'debt');
  const uncertainCriteria = SOFT_DOMINANCE_CRITERIA.filter(key => criteria[key].status === 'uncertain');
  const styleBasis = status === 'style-not-applicable'
    ? normalizeStyleBasis(record.style_contract_basis, context.styleContract)
    : null;

  if (status === 'pass') {
    if (debtCriteria.length || uncertainCriteria.length) {
      throw new Error('softness_review.status=pass cannot contain debt or uncertain criteria');
    }
    requireResolved(
      criteria,
      ['large_form_readability', 'focal_hierarchy'],
      'so softness never substitutes for large-form or focal readability'
    );
    if (constructionRole === 'optical-veil') {
      requireResolved(
        criteria,
        ['mass_separation'],
        'for an optical veil so underlying masses remain distinguishable'
      );
    } else if (constructionRole === 'volumetric-soft-mass') {
      requireResolved(
        criteria,
        ['edge_hierarchy', 'mass_separation'],
        'for a form-bearing volumetric soft mass'
      );
    } else if (constructionRole !== 'continuous-field') {
      requireResolved(
        criteria,
        ['edge_hierarchy', 'mass_separation'],
        'for non-optical form-bearing structure'
      );
    }
  } else if (status === 'fail') {
    if (!debtCriteria.length) {
      throw new Error('softness_review.status=fail requires at least one debt criterion');
    }
  } else if (status === 'uncertain') {
    if (debtCriteria.length) {
      throw new Error('softness_review.status=uncertain cannot hide known debt; use fail');
    }
    if (!uncertainCriteria.length) {
      throw new Error('softness_review.status=uncertain requires at least one uncertain criterion');
    }
  } else {
    if (SOFT_DOMINANCE_CRITERIA.some(key => criteria[key].status !== 'not-applicable')) {
      throw new Error(
        'softness_review.status=style-not-applicable requires every criterion to be not-applicable'
      );
    }
  }

  const trendSignals = status === 'fail'
    ? [
        'soft-dominance',
        ...(criteria.primitive_footprint.status === 'debt' ? ['soft-round-footprint'] : []),
      ]
    : [];

  return {
    protocol: 'photoshop.guard.soft_dominance.v1',
    status,
    observed: true,
    evidence_sha256: requireSha(context.previewSha256),
    construction_role: constructionRole,
    physical_role: physicalRole,
    criteria,
    style_contract_basis: styleBasis,
    debt_criteria: debtCriteria,
    trend_signals: trendSignals,
  };
}

function operationArgs(record: Record<string, unknown>): Record<string, unknown> {
  return record.tool === 'photoshop_execute_visual_microplan'
    && record.args
    && typeof record.args === 'object'
    && !Array.isArray(record.args)
    ? record.args as Record<string, unknown>
    : {};
}

export function softDominanceContextForOperation(record: Record<string, unknown>) {
  const args = operationArgs(record);
  const paint = args.paint_strategy && typeof args.paint_strategy === 'object' && !Array.isArray(args.paint_strategy)
    ? args.paint_strategy as Record<string, unknown>
    : {};
  const logical = args.logical_layer && typeof args.logical_layer === 'object' && !Array.isArray(args.logical_layer)
    ? args.logical_layer as Record<string, unknown>
    : {};
  return {
    constructionRole: normalizedText(paint.construction_role),
    visualIntent: normalizedText(paint.visual_intent),
    physicalRole: normalizedText(logical.physical_role),
  };
}

export function softDominanceRiskForOperation(record: Record<string, unknown>): SoftDominanceRisk {
  const args = operationArgs(record);
  const scaleRaw = normalizedText(args.scale ?? record.scale);
  const scale = scaleRaw === 'global' ? 'global' : scaleRaw === 'medium' ? 'medium' : null;
  const context = softDominanceContextForOperation(record);
  const methodClass = normalizedText(args.method_class);
  const steps = Array.isArray(args.steps)
    ? args.steps.filter(step => step && typeof step === 'object' && !Array.isArray(step)) as Array<Record<string, unknown>>
    : [];
  const tools = new Set([
    normalizedText(record.tool),
    ...steps.map(step => normalizedText(step.tool)),
  ].filter(Boolean));
  const methodIds = new Set(steps.map(step => normalizedText(step.method_id)).filter(Boolean));
  const softMechanism =
    context.constructionRole === 'volumetric-soft-mass'
    || context.constructionRole === 'optical-veil'
    || ['atmospheric-mass', 'soft-transition', 'lost-edge', 'smooth'].includes(context.visualIntent ?? '')
    || methodClass === 'smudge'
    || tools.has('photoshop_apply_gaussian_blur')
    || tools.has('photoshop_apply_smart_blur')
    || methodIds.has('soft-brush-build')
    || methodIds.has('smudge-shape')
    || methodIds.has('gaussian-blur')
    || methodIds.has('smart-blur');

  return {
    required: !!scale && softMechanism,
    reason: !scale
      ? 'soft-dominance review is reserved for global/medium passes; local edge softness is handled by ordinary edge review'
      : softMechanism
        ? 'broad soft/form-transition execution can erase structural edge, mass, or focal hierarchy'
        : 'the operation does not use a broad softness-dominant mechanism',
    scale,
    construction_role: context.constructionRole ?? null,
    visual_intent: context.visualIntent ?? null,
  };
}
