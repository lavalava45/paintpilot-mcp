// Compact artistic-state semantics shared by the public Guard facade and durable state.
// This module deliberately treats artistic vocabulary as opaque user/run data.

export type ExecutionOutcome = 'not-executed' | 'completed' | 'failed' | 'uncertain';
export type ArtisticOutcome = 'resolved' | 'unresolved' | 'regression' | 'uncertain';
export type GlobalBriefOutcome = 'satisfied' | 'unsatisfied' | 'regression' | 'uncertain' | 'not-evaluated';
export const PRE_FINAL_HOSTILE_REVIEW_AREAS = [
  'whole_frame_brief', 'named_subject_recognition', 'geometry_completion',
  'physical_effect_accountability', 'material_differentiation', 'style_realism',
] as const;

const GLOBAL_BRIEF_OUTCOMES = new Set<GlobalBriefOutcome>([
  'satisfied', 'unsatisfied', 'regression', 'uncertain', 'not-evaluated',
]);

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function strings(value: unknown, field: string, options: { min?: number; max?: number } = {}): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const normalized = value.map((item, index) => {
    const parsed = text(item);
    if (!parsed) throw new Error(`${field}[${index}] must be non-empty`);
    return parsed;
  });
  if (options.min !== undefined && normalized.length < options.min) {
    throw new Error(`${field} must contain at least ${options.min} item${options.min === 1 ? '' : 's'}`);
  }
  if (options.max !== undefined && normalized.length > options.max) {
    throw new Error(`${field} must contain at most ${options.max} items`);
  }
  return [...new Set(normalized)];
}

export interface ArtisticEvaluationContract {
  contract_id: string;
  revision: number;
  positive_criteria: string[];
  failure_signals: string[];
  protected_qualities: string[];
  stage_transition_expectations: string[];
  final_evidence_requirements: string[];
  provenance: Array<{ source: string; detail: string }>;
  brief_items: Array<{
    item_id: string;
    kind: 'hard_perceptual' | 'soft_preference' | 'technical_non_visual';
    requirement: string;
    provenance: string;
    recognition_target?: string;
  }>;
}

export function normalizeArtisticEvaluationContract(
  raw: unknown,
  previous?: ArtisticEvaluationContract | null
): ArtisticEvaluationContract {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('artistic_evaluation_contract must be an object');
  }
  const input = raw as Record<string, unknown>;
  const contractId = text(input.contract_id);
  const revision = Number(input.revision);
  if (!contractId || contractId.length > 80) throw new Error('artistic_evaluation_contract.contract_id must be a stable 1-80 character id');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('artistic_evaluation_contract.revision must be a positive integer');

  const provenanceRaw = input.provenance;
  if (!Array.isArray(provenanceRaw) || provenanceRaw.length < 1 || provenanceRaw.length > 8) {
    throw new Error('artistic_evaluation_contract.provenance must contain 1-8 entries');
  }
  const provenance = provenanceRaw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`artistic_evaluation_contract.provenance[${index}] must be an object`);
    }
    const source = text((entry as Record<string, unknown>).source);
    const detail = text((entry as Record<string, unknown>).detail);
    if (!source || !detail) throw new Error(`artistic_evaluation_contract.provenance[${index}] requires source and detail`);
    return { source, detail };
  });

  const normalized: ArtisticEvaluationContract = {
    contract_id: contractId,
    revision,
    positive_criteria: strings(input.positive_criteria, 'artistic_evaluation_contract.positive_criteria', { min: 1, max: 8 }),
    failure_signals: strings(input.failure_signals, 'artistic_evaluation_contract.failure_signals', { min: 1, max: 8 }),
    protected_qualities: input.protected_qualities === undefined
      ? []
      : strings(input.protected_qualities, 'artistic_evaluation_contract.protected_qualities', { max: 8 }),
    stage_transition_expectations: strings(input.stage_transition_expectations, 'artistic_evaluation_contract.stage_transition_expectations', { min: 1, max: 8 }),
    final_evidence_requirements: strings(input.final_evidence_requirements, 'artistic_evaluation_contract.final_evidence_requirements', { min: 1, max: 8 }),
    provenance,
    brief_items: input.brief_items === undefined
      ? []
      : (() => {
          if (!Array.isArray(input.brief_items) || input.brief_items.length > 24) {
            throw new Error('artistic_evaluation_contract.brief_items must contain at most 24 items');
          }
          const seen = new Set<string>();
          return input.brief_items.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              throw new Error(`artistic_evaluation_contract.brief_items[${index}] must be an object`);
            }
            const row = entry as Record<string, unknown>;
            const itemId = text(row.item_id);
            const kind = text(row.kind)?.toLowerCase();
            const requirement = text(row.requirement);
            const itemProvenance = text(row.provenance);
            if (!itemId || itemId.length > 80 || seen.has(itemId)) throw new Error(`artistic_evaluation_contract.brief_items[${index}].item_id must be unique`);
            if (!['hard_perceptual', 'soft_preference', 'technical_non_visual'].includes(kind ?? '')) {
              throw new Error(`artistic_evaluation_contract.brief_items[${index}].kind is invalid`);
            }
            if (!requirement || !itemProvenance) throw new Error(`artistic_evaluation_contract.brief_items[${index}] requires requirement and provenance`);
            seen.add(itemId);
            const recognitionTarget = row.recognition_target === undefined ? undefined : text(row.recognition_target);
            if (row.recognition_target !== undefined && !recognitionTarget) {
              throw new Error(`artistic_evaluation_contract.brief_items[${index}].recognition_target must be non-empty when supplied`);
            }
            if (recognitionTarget && kind !== 'hard_perceptual') {
              throw new Error(`artistic_evaluation_contract.brief_items[${index}].recognition_target is only valid for hard_perceptual items`);
            }
            return {
              item_id: itemId,
              kind: kind as ArtisticEvaluationContract['brief_items'][number]['kind'],
              requirement,
              provenance: itemProvenance,
              ...(recognitionTarget ? { recognition_target: recognitionTarget } : {}),
            };
          });
        })(),
  };

  if (previous) {
    const priorBody = JSON.stringify({ ...previous, revision: undefined });
    const nextBody = JSON.stringify({ ...normalized, revision: undefined });
    if (priorBody !== nextBody && normalized.revision <= previous.revision) {
      throw new Error('artistic_evaluation_contract changes require a higher revision and explicit provenance');
    }
    if (normalized.revision < previous.revision) {
      throw new Error('artistic_evaluation_contract revision cannot decrease');
    }
  }
  return normalized;
}

export function deriveExecutionOutcome(record: Record<string, unknown>): ExecutionOutcome {
  if (record.execution === 'not-executed') return 'not-executed';
  if ((record.resolved as Record<string, unknown> | undefined)?.outcome === 'partial' || record.execution === 'partial') {
    return 'uncertain';
  }
  if (record.phase === 'uncertain') return 'uncertain';
  if (record.failed === true) return 'failed';
  if (record.phase === 'completed') return 'completed';
  return 'uncertain';
}

export function deriveArtisticOutcome(input: Record<string, unknown>): ArtisticOutcome {
  if (input.verdict === 'regression' || (Array.isArray(input.regressions) && input.regressions.length > 0)) return 'regression';
  if (input.target_resolved === 'yes') return 'resolved';
  if (input.target_resolved === 'no') return 'unresolved';
  return 'uncertain';
}

export function evaluatePaintingProfileTransition(input: {
  current?: string | null;
  requested: string;
  brush_preflight?: unknown;
}): { allowed: true; profile: string; transition?: Record<string, unknown> } | {
  allowed: false;
  current: string | null;
  requested: string;
  allowed_transition: string | null;
  unmet_obligations: string[];
} {
  const current = text(input.current)?.toLowerCase() ?? null;
  const requested = text(input.requested)?.toLowerCase() ?? '';
  if (!['simple_graphic', 'nontrivial_painting'].includes(requested)) {
    return { allowed: false, current, requested, allowed_transition: current === 'simple_graphic' ? 'simple_graphic -> nontrivial_painting' : null, unmet_obligations: ['requested painting_profile is invalid'] };
  }
  if (!current || current === requested) return { allowed: true, profile: requested };
  if (current === 'simple_graphic' && requested === 'nontrivial_painting') {
    const preflight = input.brush_preflight as Record<string, unknown> | undefined;
    const unmet: string[] = [];
    if (preflight?.completed !== true) unmet.push('brush_preflight.completed=true');
    if (preflight?.inventory_observed !== true) unmet.push('brush_preflight.inventory_observed=true');
    if (!Array.isArray(preflight?.roles) || preflight.roles.length < 1) unmet.push('brush_preflight.roles must contain at least one live role');
    if (unmet.length) {
      return {
        allowed: false,
        current,
        requested,
        allowed_transition: 'simple_graphic -> nontrivial_painting',
        unmet_obligations: unmet,
      };
    }
    return {
      allowed: true,
      profile: requested,
      transition: {
        from: current,
        to: requested,
        monotonic: true,
        obligations_activated: ['brush_preflight', 'nontrivial_visual_microplan_policy'],
      },
    };
  }
  return {
    allowed: false,
    current,
    requested,
    allowed_transition: null,
    unmet_obligations: ['painting_profile downgrade is forbidden'],
  };
}

export interface ComparisonSpecification {
  protocol: 'photoshop.guard.comparison_spec.v1';
  document_id: number | null;
  frame_kind: string;
  crop: unknown;
  output_dimensions: { width: number | null; height: number | null };
  max_dimension: number | null;
  color_mode: string | null;
  revision: string;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function comparisonSpecificationForOperation(request: Record<string, unknown>): ComparisonSpecification {
  const preview = request.preview_args && typeof request.preview_args === 'object' && !Array.isArray(request.preview_args)
    ? request.preview_args as Record<string, unknown>
    : {};
  const args = request.args && typeof request.args === 'object' && !Array.isArray(request.args)
    ? request.args as Record<string, unknown>
    : {};
  return {
    protocol: 'photoshop.guard.comparison_spec.v1',
    document_id: Number.isSafeInteger(args.document_id) ? Number(args.document_id) : null,
    frame_kind: text(preview.frame_kind) ?? (preview.region || preview.crop || preview.focus_region ? 'focused' : 'whole-frame'),
    crop: preview.region ?? preview.crop ?? preview.focus_region ?? null,
    output_dimensions: {
      width: positiveNumber(preview.width),
      height: positiveNumber(preview.height),
    },
    max_dimension: positiveNumber(preview.max_dimension),
    color_mode: text(preview.color_mode) ?? null,
    revision: text(preview.revision) ?? 'guard-comparison-v1',
  };
}

export function deriveComparisonMetric(input: {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  significance?: Record<string, unknown> | null;
  specification: ComparisonSpecification;
}): { status: 'available' | 'unavailable'; reason: string; specification: ComparisonSpecification } {
  const { before, after, significance, specification } = input;
  if (!before || !after) return { status: 'unavailable', reason: 'BEFORE and AFTER evidence are both required for machine comparison.', specification };
  if (before.document_id !== specification.document_id || after.document_id !== specification.document_id) {
    return { status: 'unavailable', reason: 'BEFORE/AFTER document provenance does not match the canonical comparison specification.', specification };
  }
  const beforeWidth = positiveNumber(before.width);
  const beforeHeight = positiveNumber(before.height);
  const afterWidth = positiveNumber(after.width);
  const afterHeight = positiveNumber(after.height);
  if (beforeWidth && afterWidth && beforeWidth !== afterWidth || beforeHeight && afterHeight && beforeHeight !== afterHeight) {
    return { status: 'unavailable', reason: 'BEFORE/AFTER output geometry differs; unrelated scales are not machine-compared.', specification };
  }
  if (significance?.global || significance?.local) {
    return { status: 'available', reason: text(significance.reason) ?? 'Comparable decoded BEFORE/AFTER evidence is available.', specification };
  }
  return { status: 'unavailable', reason: text(significance?.reason) ?? 'Decoded comparison metric could not be established for the canonical evidence pair.', specification };
}

export function normalizeGlobalBriefAssessment(
  raw: unknown,
  input: {
    contract?: ArtisticEvaluationContract | null;
    frame?: { sha256?: string | null } | null;
    criticResult?: {
      result_id?: string | null;
      authority_class?: string | null;
      frame_sha256?: string | null;
      contract_id?: string | null;
      contract_revision?: number | null;
    } | null;
  }
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      outcome: 'not-evaluated',
      validation: 'not-independently-validated',
      reason: 'No global brief assessment was supplied.',
    };
  }
  const assessment = raw as Record<string, unknown>;
  const requested = text(assessment.outcome)?.toLowerCase() as GlobalBriefOutcome | undefined;
  if (!requested || !GLOBAL_BRIEF_OUTCOMES.has(requested)) throw new Error('global_brief_assessment.outcome is invalid');
  const reason = text(assessment.reason) ?? 'No global reason supplied.';
  if (requested === 'not-evaluated') {
    return { outcome: 'not-evaluated', validation: 'not-independently-validated', reason };
  }

  const contractId = text(assessment.contract_id);
  const contractRevision = Number(assessment.contract_revision);
  const frameSha = text(assessment.frame_sha256)?.toLowerCase();
  const criticAuthority = text(assessment.critic_authority)?.toLowerCase();
  const criticResultId = text(assessment.critic_result_id);
  const exactContract = !!input.contract
    && contractId === input.contract.contract_id
    && contractRevision === input.contract.revision;
  const exactFrame = !!input.frame?.sha256 && frameSha === String(input.frame.sha256).toLowerCase();
  const registeredCritic = input.criticResult;
  const authorizedCritic = criticAuthority === 'authorized'
    && !!criticResultId
    && text(registeredCritic?.result_id) === criticResultId
    && text(registeredCritic?.authority_class)?.toLowerCase() === 'authorized'
    && text(registeredCritic?.frame_sha256)?.toLowerCase() === frameSha
    && text(registeredCritic?.contract_id) === contractId
    && Number(registeredCritic?.contract_revision) === contractRevision;
  const criteria = assessment.criteria === undefined
    ? []
    : strings(assessment.criteria, 'global_brief_assessment.criteria', { max: 16 });
  const briefItems = input.contract?.brief_items ?? [];
  const hardItems = briefItems.filter(item => item.kind === 'hard_perceptual');
  const rawResults = assessment.brief_item_results;
  const resultRows = rawResults === undefined ? [] : (() => {
    if (!Array.isArray(rawResults) || rawResults.length > 24) throw new Error('global_brief_assessment.brief_item_results must contain at most 24 items');
    const byId = new Map(briefItems.map(item => [item.item_id, item]));
    const seen = new Set<string>();
    return rawResults.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`brief_item_results[${index}] must be an object`);
      const row = entry as Record<string, unknown>;
      const itemId = text(row.item_id);
      const state = text(row.state)?.toUpperCase();
      const reason = text(row.reason);
      const evidence = row.evidence === undefined ? [] : strings(row.evidence, `global_brief_assessment.brief_item_results[${index}].evidence`, { max: 8 });
      const item = itemId ? byId.get(itemId) : undefined;
      if (!itemId || seen.has(itemId) || !item) throw new Error(`brief_item_results[${index}].item_id must reference one unique active brief item`);
      if (!['UNASSESSED', 'MET', 'NOT_MET', 'UNCERTAIN'].includes(state ?? '')) throw new Error(`brief_item_results[${index}].state is invalid`);
      seen.add(itemId);
      return { item_id: itemId, kind: item.kind, requirement: item.requirement, state, ...(reason ? { reason } : {}), evidence };
    });
  })();

  if (!exactContract || !exactFrame || !authorizedCritic) {
    return {
      outcome: 'not-evaluated',
      requested_outcome: requested,
      validation: 'not-independently-validated',
      reason,
      missing_evidence: [
        ...(!exactContract ? ['exact active contract revision'] : []),
        ...(!exactFrame ? ['exact current frame SHA'] : []),
        ...(!authorizedCritic ? ['authorized critic result'] : []),
      ],
    };
  }
  const resultsById = new Map(resultRows.map(row => [row.item_id, row]));
  const missingHard = hardItems.filter(item => !resultsById.has(item.item_id));
  if (missingHard.length) {
    throw new Error(`global_brief_assessment requires evidence-bound states for every hard_perceptual brief item: ${missingHard.map(item => item.item_id).join(', ')}`);
  }
  const unresolvedHard = resultRows.filter(row => row.kind === 'hard_perceptual' && row.state !== 'MET');
  if (requested === 'satisfied' && unresolvedHard.length) {
    throw new Error(`global_brief_assessment outcome=satisfied conflicts with unresolved hard brief debt: ${unresolvedHard.map(row => `${row.item_id}:${row.state}`).join(', ')}`);
  }
  return {
    outcome: requested,
    validation: 'independently-validated',
    contract_id: contractId,
    contract_revision: contractRevision,
    frame_sha256: frameSha,
    critic_authority: 'authorized',
    critic_result_id: criticResultId,
    criteria,
    brief_item_results: resultRows,
    unresolved_hard_brief_debt: unresolvedHard,
    reason,
  };
}

export function globalCompletionAllowed(assessment: Record<string, unknown> | null | undefined): boolean {
  return assessment?.outcome === 'satisfied'
    && assessment?.validation === 'independently-validated'
    && (!Array.isArray(assessment?.unresolved_hard_brief_debt) || assessment.unresolved_hard_brief_debt.length === 0);
}

export function normalizePreFinalHostileReview(
  raw: unknown,
  input: {
    contract: ArtisticEvaluationContract;
    frame?: { sha256?: string | null } | null;
    globalAssessment?: Record<string, unknown> | null;
    geometryDebt?: unknown[];
    physicalEffectDebt?: unknown[];
  }
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('pre_final_hostile_review must be an object');
  const review = raw as Record<string, unknown>;
  const contractId = text(review.contract_id);
  const contractRevision = Number(review.contract_revision);
  const frameSha = text(review.frame_sha256)?.toLowerCase();
  if (contractId !== input.contract.contract_id || contractRevision !== input.contract.revision) {
    throw new Error('pre_final_hostile_review must reference the exact active artistic contract revision');
  }
  if (!input.frame?.sha256 || frameSha !== String(input.frame.sha256).toLowerCase()) {
    throw new Error('pre_final_hostile_review must reference the exact current frame SHA');
  }
  if (!Array.isArray(review.checks) || review.checks.length !== PRE_FINAL_HOSTILE_REVIEW_AREAS.length) {
    throw new Error(`pre_final_hostile_review.checks must contain exactly ${PRE_FINAL_HOSTILE_REVIEW_AREAS.length} required review areas`);
  }
  const seenAreas = new Set<string>();
  const checks = review.checks.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`pre_final_hostile_review.checks[${index}] must be an object`);
    const row = entry as Record<string, unknown>;
    const area = text(row.area);
    const status = text(row.status)?.toLowerCase();
    const reason = text(row.reason);
    if (!area || !PRE_FINAL_HOSTILE_REVIEW_AREAS.includes(area as typeof PRE_FINAL_HOSTILE_REVIEW_AREAS[number]) || seenAreas.has(area)) {
      throw new Error(`pre_final_hostile_review.checks[${index}].area must be one unique required area`);
    }
    if (!['clear', 'defect', 'not_applicable'].includes(status ?? '')) throw new Error(`pre_final_hostile_review.checks[${index}].status is invalid`);
    seenAreas.add(area);
    return { area, status, ...(reason ? { reason } : {}) };
  });
  for (const area of PRE_FINAL_HOSTILE_REVIEW_AREAS) {
    if (!seenAreas.has(area)) throw new Error(`pre_final_hostile_review is missing required area ${area}`);
  }
  if (!Array.isArray(review.major_defects) || review.major_defects.length > 12) {
    throw new Error('pre_final_hostile_review.major_defects must contain at most 12 items');
  }
  const briefItems = new Map(input.contract.brief_items.map(item => [item.item_id, item]));
  const majorDefects = review.major_defects.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`pre_final_hostile_review.major_defects[${index}] must be an object`);
    const row = entry as Record<string, unknown>;
    const summary = text(row.summary);
    const debtClass = text(row.debt_class)?.toLowerCase();
    const briefItemId = text(row.brief_item_id);
    if (!summary || !['hard', 'soft'].includes(debtClass ?? '')) throw new Error(`pre_final_hostile_review.major_defects[${index}] requires summary and debt_class=hard|soft`);
    if (debtClass === 'hard') {
      const item = briefItemId ? briefItems.get(briefItemId) : undefined;
      if (!item || item.kind !== 'hard_perceptual') {
        throw new Error(`pre_final_hostile_review hard defect ${index} must map to an active hard_perceptual brief item`);
      }
    }
    return { summary, debt_class: debtClass, ...(briefItemId ? { brief_item_id: briefItemId } : {}) };
  });
  if (checks.some(check => check.status === 'defect') && !majorDefects.length) {
    throw new Error('pre_final_hostile_review defect checks require at least one mapped major_defect');
  }
  if ((input.geometryDebt?.length ?? 0) > 0) {
    const geometryCheck = checks.find(check => check.area === 'geometry_completion');
    if (geometryCheck?.status === 'clear') throw new Error('pre_final_hostile_review cannot mark geometry clear while E.18 completion debt exists');
  }
  if ((input.physicalEffectDebt?.length ?? 0) > 0) {
    const effectCheck = checks.find(check => check.area === 'physical_effect_accountability');
    if (effectCheck?.status === 'clear') throw new Error('pre_final_hostile_review cannot mark physical effects clear while E.17d/E.19 debt exists');
  }
  const hardDefects = majorDefects.filter(defect => defect.debt_class === 'hard');
  const completionBlockingChecks = checks.filter(check => check.status === 'defect');
  const resultRows = Array.isArray(input.globalAssessment?.brief_item_results) ? input.globalAssessment.brief_item_results : [];
  const resultById = new Map(resultRows.map(row => [row?.item_id, row]));
  for (const defect of hardDefects) {
    if (resultById.get(defect.brief_item_id)?.state === 'MET') {
      throw new Error(`pre_final_hostile_review hard defect conflicts with brief item ${defect.brief_item_id} being assessed MET on the same frame`);
    }
  }
  return {
    protocol: 'photoshop.guard.pre_final_hostile_review.v1',
    contract_id: contractId,
    contract_revision: contractRevision,
    frame_sha256: frameSha,
    checks,
    major_defects: majorDefects,
    hard_defects: hardDefects,
    completion_allowed: completionBlockingChecks.length === 0 && hardDefects.length === 0,
  };
}
