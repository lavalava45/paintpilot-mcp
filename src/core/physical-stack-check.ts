import { paintingStageRank } from './painting-stage-policy.js';

export const PHYSICAL_STACK_CHECK_STATUSES = [
  'pending',
  'pass',
  'fail',
] as const;
export type PhysicalStackCheckStatus = (typeof PHYSICAL_STACK_CHECK_STATUSES)[number];

export const PHYSICAL_STACK_CRITERIA = [
  'depth_order',
  'occlusion_integrity',
  'opaque_mass_coverage',
  'transparency_intent',
  'layer_stack_alignment',
] as const;
export type PhysicalStackCriterion = (typeof PHYSICAL_STACK_CRITERIA)[number];

export const PHYSICAL_STACK_CRITERION_STATUSES = [
  'resolved',
  'debt',
  'uncertain',
  'not-applicable',
] as const;
export type PhysicalStackCriterionStatus = (typeof PHYSICAL_STACK_CRITERION_STATUSES)[number];

export interface PhysicalStackCriterionEvidence {
  status: PhysicalStackCriterionStatus;
  note: string;
}

export interface PhysicalStackCheck {
  status: PhysicalStackCheckStatus;
  observed: boolean;
  preview_sha256: string | null;
  evidence_operation_id: string | null;
  criteria: Partial<Record<PhysicalStackCriterion, PhysicalStackCriterionEvidence>>;
  confidence: number | null;
  limitations: string[];
  owner_signature: string | null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseLimitations(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error('physical_stack_check.limitations must be an array');
  }
  return value.map((item, index) => {
    const parsed = text(item);
    if (!parsed) {
      throw new Error(`physical_stack_check.limitations[${index}] must be non-empty`);
    }
    return parsed;
  });
}

function parseConfidence(value: unknown): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error('physical_stack_check.confidence must be between 0 and 1');
  }
  return parsed;
}

function parseCriteria(
  value: unknown
): Record<PhysicalStackCriterion, PhysicalStackCriterionEvidence> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('physical_stack_check.criteria is required for pass/fail');
  }
  const raw = value as Record<string, unknown>;
  const parsed = {} as Record<PhysicalStackCriterion, PhysicalStackCriterionEvidence>;
  for (const key of PHYSICAL_STACK_CRITERIA) {
    const row = raw[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`physical_stack_check.criteria.${key} is required`);
    }
    const record = row as Record<string, unknown>;
    const status = text(record.status)?.toLowerCase() as PhysicalStackCriterionStatus | undefined;
    const note = text(record.note);
    if (!status || !PHYSICAL_STACK_CRITERION_STATUSES.includes(status)) {
      throw new Error(
        `physical_stack_check.criteria.${key}.status must be one of ${PHYSICAL_STACK_CRITERION_STATUSES.join(', ')}`
      );
    }
    if (!note) throw new Error(`physical_stack_check.criteria.${key}.note is required`);
    parsed[key] = { status, note };
  }
  return parsed;
}

export function normalizePhysicalStackCheck(raw: unknown): PhysicalStackCheck {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('physical_stack_check is required');
  }
  const record = raw as Record<string, unknown>;
  const status = text(record.status)?.toLowerCase() as PhysicalStackCheckStatus | undefined;
  if (!status || !PHYSICAL_STACK_CHECK_STATUSES.includes(status)) {
    throw new Error(
      `physical_stack_check.status must be one of ${PHYSICAL_STACK_CHECK_STATUSES.join(', ')}`
    );
  }
  const observed = record.observed === true;
  const confidence = parseConfidence(record.confidence);
  const limitations = parseLimitations(record.limitations);

  if (status === 'pending') {
    if (observed) throw new Error('physical_stack_check.status=pending requires observed=false');
    return {
      status,
      observed: false,
      preview_sha256: null,
      evidence_operation_id: null,
      criteria: {},
      confidence,
      limitations,
      owner_signature: null,
    };
  }

  if (!observed) throw new Error(`physical_stack_check.status=${status} requires observed=true`);
  const previewSha = text(record.preview_sha256)?.toLowerCase();
  const evidenceOperationId = text(record.evidence_operation_id);
  if (!previewSha || !/^[0-9a-f]{64}$/.test(previewSha) || !evidenceOperationId) {
    throw new Error(
      `physical_stack_check.status=${status} requires a 64-hex preview_sha256 and evidence_operation_id tied to the observed current frame`
    );
  }
  const criteria = parseCriteria(record.criteria);
  const unresolved = PHYSICAL_STACK_CRITERIA.filter(key => {
    const criterion = criteria[key];
    return criterion.status === 'debt' || criterion.status === 'uncertain';
  });

  if (status === 'pass') {
    if (unresolved.length) {
      throw new Error(
        `physical_stack_check.status=pass cannot leave physical-stack debt: ${unresolved.join(', ')}`
      );
    }
    for (const key of ['depth_order', 'occlusion_integrity', 'transparency_intent'] as const) {
      if (criteria[key].status !== 'resolved') {
        throw new Error(`physical_stack_check.status=pass requires ${key}=resolved`);
      }
    }
  }

  if (status === 'fail' && unresolved.length === 0) {
    throw new Error('physical_stack_check.status=fail requires debt or uncertain criteria');
  }

  return {
    status,
    observed,
    preview_sha256: previewSha,
    evidence_operation_id: evidenceOperationId,
    criteria,
    confidence,
    limitations,
    owner_signature: null,
  };
}

/**
 * Physical stack is established after SHAPE/block-in and before VALUE.
 */
export function isPhysicalStackGatedStage(stage: unknown): boolean {
  const rank = paintingStageRank(stage);
  return rank !== undefined && rank >= 3;
}
