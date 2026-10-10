import { createHash } from 'node:crypto';

export const COMPLETION_CRITERIA = [
  'brief_fidelity',
  'form_proportions',
  'light_material',
  'composition_context',
  'editable_parts',
  'contact_and_protection',
] as const;
export const PAINTING_COMPLETION_SCHEMA = {
  type: 'object',
  description:
    'Optional final whole-frame assessment against original_brief in the existing exact image review. Local target success is not whole-painting completion. Honest pass/fail/unknown, no new reviewer/tool call.',
  properties: {
    scope: { type: 'string', enum: ['whole-brief'] },
    summary: { type: 'string', minLength: 10 },
    criteria: {
      type: 'object',
      properties: Object.fromEntries(
        COMPLETION_CRITERIA.map((key) => [
          key,
          { type: 'string', enum: ['pass', 'fail', 'unknown'] },
        ])
      ),
      required: [...COMPLETION_CRITERIA],
      additionalProperties: false,
    },
  },
  required: ['scope', 'summary', 'criteria'],
  additionalProperties: false,
};

export function normalizePaintingCompletion(value: any) {
  if (value === undefined) return undefined;
  if (
    !value ||
    value.scope !== 'whole-brief' ||
    typeof value.summary !== 'string' ||
    value.summary.trim().length < 10 ||
    !value.criteria ||
    COMPLETION_CRITERIA.some((key) => !['pass', 'fail', 'unknown'].includes(value.criteria[key])) ||
    Object.keys(value.criteria).some((key) => !COMPLETION_CRITERIA.includes(key as any)) ||
    Object.keys(value).some((key) => !['scope', 'summary', 'criteria'].includes(key))
  ) {
    throw new Error(
      'painting_completion requires scope=whole-brief, concrete summary and all six public criteria pass|fail|unknown'
    );
  }
  return {
    scope: 'whole-brief',
    summary: value.summary.trim(),
    criteria: Object.fromEntries(COMPLETION_CRITERIA.map((key) => [key, value.criteria[key]])),
  };
}

export function bindPaintingCompletion(value: any, state: any, frameSha: string) {
  const completion = normalizePaintingCompletion(value);
  if (!completion) return undefined;
  if (typeof state?.original_brief !== 'string' || !state.original_brief.trim())
    throw new Error('painting_completion needs the unchanged original_brief before final review');
  return {
    ...completion,
    frame_sha256: frameSha,
    brief_sha256: createHash('sha256').update(state.original_brief).digest('hex'),
  };
}

/** Saving/exporting closes a technical operation, never the unfinished painting. */
export function documentArtisticDebt(state: any, lastRecord?: any): string[] {
  const reasons: string[] = [];
  if (Object.values(state?.visual_problems ?? {}).some((p: any) => p?.status !== 'resolved'))
    reasons.push('unresolved_visual_problem');
  const critique = state?.last_critique ?? (lastRecord?.visual ? lastRecord.verdict : undefined);
  if (critique && critique.target_resolved !== 'yes') reasons.push('unresolved_visual_target');
  if (critique?.primitive_footprint === 'suspect')
    reasons.push('primitive_form_requires_reconstruction');
  if (state?.construction_policy === 'enforced') {
    const completion = state.painting_completion;
    const briefHash =
      typeof state.original_brief === 'string'
        ? createHash('sha256').update(state.original_brief).digest('hex')
        : undefined;
    if (
      !completion ||
      completion.scope !== 'whole-brief' ||
      !state.current_frame?.sha256 ||
      completion.frame_sha256 !== state.current_frame.sha256 ||
      completion.brief_sha256 !== briefHash
    )
      reasons.push('whole_brief_review_required');
    else if (COMPLETION_CRITERIA.some((key) => completion.criteria?.[key] !== 'pass'))
      reasons.push('whole_brief_criteria_unmet');
  }
  if (state?.chat_critic_review && (Object.values(state.chat_critic_review.criteria ?? {}).some(value => value !== 'pass')
    || state.chat_critic_findings?.length)) reasons.push('chat_critic_scene_unfinished');
  const art = state?.art_director;
  if (
    art &&
    art.status !== 'completed' &&
    (art.status === 'active' ||
      art.review_due ||
      ['review_due', 'interrupted'].includes(art.status) ||
      (art.tasks ?? []).some((t: any) => t?.status !== 'completed'))
  )
    reasons.push('unfinished_directive');
  return reasons;
}

export function artisticContinuation(state: any, lastRecord?: any): string | undefined {
  const reasons = documentArtisticDebt(state, lastRecord);
  if (!reasons.length) return undefined;
  if (reasons.length === 1 && reasons[0] === 'whole_brief_review_required')
    return 'Whole-brief completion is unconfirmed. In the existing exact whole-frame review supply previous_observation.painting_completion={scope:"whole-brief",summary:"concrete observed outcome against original_brief",criteria:{brief_fidelity:"pass|fail|unknown",form_proportions:"pass|fail|unknown",light_material:"pass|fail|unknown",composition_context:"pass|fail|unknown",editable_parts:"pass|fail|unknown",contact_and_protection:"pass|fail|unknown"}}. Correct failed/unknown criteria with one bounded visual pass; no extra reviewer or source reads. An explicit user pause/stop remains allowed.';
  const failed = COMPLETION_CRITERIA.filter(
    (key) =>
      state?.painting_completion?.criteria?.[key] &&
      state.painting_completion.criteria[key] !== 'pass'
  );
  const defect = failed.length
    ? `whole-brief criteria: ${failed.join(', ')}`
    : (state?.active_problem?.summary ?? state?.chat_critic_findings?.[0]?.next_change
      ?? state?.last_critique?.primary_mismatch);
  return `Painting remains unfinished after technical closure/save. Continue with one bounded visual pass addressing ${
    typeof defect === 'string' && defect.trim()
      ? defect.slice(0, 400)
      : 'the largest unresolved form/proportion/light defect'
  }. Repeated primitive form needs reconstruction, not more accents. Preserve intermediate saves; stop only for an explicit user pause/stop or a concrete blocker. Never claim whole-image completion from a save receipt.`;
}
