import { createHash } from 'node:crypto';
import { activeCriticFindings } from './critic-finding-status.js';
import { criticObligationState } from './critic-obligations.js';
import { sceneFoundationState, SCENE_FOUNDATION_GUIDANCE } from './scene-foundation.js';
import { CHAT_CRITIC_CRITERIA, CHAT_CRITIC_PROTOCOL, CONTACT_REVIEW_DESCRIPTION,
  CRITIC_CORRECTION_VERSION, SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION } from './chat-critic.js';
import { VISUAL_RELATIONSHIP_REVIEW_VERSION } from './visual-relationship-review.js';

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
          { type: 'string', enum: ['pass', 'fail', 'unknown'],
            ...(key === 'contact_and_protection' ? { description: CONTACT_REVIEW_DESCRIPTION }
              : key === 'editable_parts' ? { description: 'pass requires the same exact whole-scene editable_scope_review: independently editable visible parts match the inventory and actual layers, with no unresolved missing/combined/unknown/unmapped parts. Saved files and labels are not proof.' } : {}) },
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

/** A Painter completion may agree with a Critic only when both judged these exact pixels.
 * The same-chat Critic role is a second review, not an independent image evaluator. */
export function currentFrameCriticApproval(state: any): boolean {
  const critic = state?.chat_critic_review;
  const frameSha = state?.current_frame?.sha256;
  const brief = state?.original_brief;
  const incarnation = state?.document_incarnation_id ?? state?.document_instance?.host_witness?.token;
  return Boolean(critic && typeof frameSha === 'string' && frameSha
    && typeof brief === 'string' && brief.trim()
    && critic.protocol === CHAT_CRITIC_PROTOCOL
    && ['same-chat-role-review', 'host-reported-delegation'].includes(critic.validation)
    && critic.independent === false
    && typeof critic.operation_id === 'string' && critic.operation_id
    && critic.frame_sha256 === frameSha
    && critic.brief_sha256 === createHash('sha256').update(brief).digest('hex')
    && critic.support_review_version === SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION
    && critic.correction_version === CRITIC_CORRECTION_VERSION
    && critic.visual_relationship_review_version === VISUAL_RELATIONSHIP_REVIEW_VERSION
    && Array.isArray(critic.visual_relationships) && critic.visual_relationships.length > 0
    && critic.visual_relationships.every((relation: any) =>
      relation.status === 'pass' || relation.status === 'not-applicable')
    && (!incarnation || critic.document_incarnation_id === incarnation)
    && CHAT_CRITIC_CRITERIA.every(key => critic.criteria?.[key] === 'pass')
    && criticObligationState(state).every(row => row.status === 'pass')
    && !activeCriticFindings(state ?? {}).length);
}

/** Saving/exporting closes a technical operation, never the unfinished painting. */
export function documentArtisticDebt(state: any, lastRecord?: any): string[] {
  const reasons: string[] = [];
  if (!sceneFoundationState(state ?? {}).ready) reasons.push('scene_foundation_incomplete');
  if (criticObligationState(state).some(row => row.status !== 'pass'))
    reasons.push('critic_obligations_unresolved');
  if (Object.values(state?.editable_scope_debt ?? {}).some((row: any) => row.status !== 'replaced'))
    reasons.push('editable_scope_unresolved');
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
    else if (!currentFrameCriticApproval(state))
      reasons.push('whole_brief_critic_review_required');
  }
  if (state?.chat_critic_review && (Object.values(state.chat_critic_review.criteria ?? {}).some(value => value !== 'pass')
    || activeCriticFindings(state).length)) reasons.push('chat_critic_scene_unfinished');
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
  if (reasons.includes('scene_foundation_incomplete')) return SCENE_FOUNDATION_GUIDANCE;
  if (reasons.length === 1 && reasons[0] === 'whole_brief_review_required')
    return 'Whole-brief completion is unconfirmed. In the existing exact whole-frame review supply previous_observation.painting_completion={scope:"whole-brief",summary:"concrete observed outcome against original_brief",criteria:{brief_fidelity:"pass|fail|unknown",form_proportions:"pass|fail|unknown",light_material:"pass|fail|unknown",composition_context:"pass|fail|unknown",editable_parts:"pass|fail|unknown",contact_and_protection:"pass|fail|unknown"}}. Correct failed/unknown criteria with one bounded visual pass; no extra reviewer or source reads. An explicit user pause/stop remains allowed.';
  if (reasons.length === 1 && reasons[0] === 'whole_brief_critic_review_required')
    return 'The Painter completion is not yet corroborated by the Critic role on this exact accepted frame and original brief. Request the current whole-frame Critic review in the existing Guard review (no new pixel operation); all five criteria must pass. Same-chat Critic is not independent image evaluation. Correct any failed/unknown criteria before declaring completion.';
  const failed = COMPLETION_CRITERIA.filter(
    (key) =>
      state?.painting_completion?.criteria?.[key] &&
      state.painting_completion.criteria[key] !== 'pass'
  );
  const defect = failed.length
    ? `whole-brief criteria: ${failed.join(', ')}`
    : (state?.active_problem?.summary ?? activeCriticFindings(state ?? {})[0]?.next_change
      ?? state?.last_critique?.primary_mismatch);
  return `Painting remains unfinished after technical closure/save. Continue with one bounded visual pass addressing ${
    typeof defect === 'string' && defect.trim()
      ? defect.slice(0, 400)
      : 'the largest unresolved form/proportion/light defect'
  }. Repeated primitive form needs reconstruction, not more accents. Preserve intermediate saves; stop only for an explicit user pause/stop or a concrete blocker. Never claim whole-image completion from a save receipt.`;
}

/**
 * Read-only, document-scoped completion signal for MCP hosts. A transport
 * success, completed local pass, PSD save or stopped cadence is not approval to
 * claim that the original painting brief is finished. This projection consumes
 * existing Guard evidence; it never invents an independent completion ledger.
 */
export function wholeBriefCompletionContract(state: any, guardAction: string) {
  const reasons = documentArtisticDebt(state);
  const brief = typeof state?.original_brief === 'string' ? state.original_brief : '';
  const briefSha = brief.trim() ? createHash('sha256').update(brief).digest('hex') : null;
  const frameSha = typeof state?.current_frame?.sha256 === 'string' ? state.current_frame.sha256 : null;
  const review = state?.painting_completion;
  if (!state?.process_dir) reasons.push('art_run_missing');
  if (!briefSha) reasons.push('original_brief_missing');
  if (!frameSha) reasons.push('current_frame_missing');
  if (frameSha && state?.current_frame?.accepted !== true)
    reasons.push('current_frame_not_accepted');
  if (briefSha && frameSha && (!review || review.scope !== 'whole-brief'
    || review.frame_sha256 !== frameSha || review.brief_sha256 !== briefSha))
    reasons.push('whole_brief_review_required');
  else if (review && COMPLETION_CRITERIA.some(key => review.criteria?.[key] !== 'pass'))
    reasons.push('whole_brief_criteria_unmet');
  if (review && frameSha && briefSha && review.frame_sha256 === frameSha
    && review.brief_sha256 === briefSha
    && COMPLETION_CRITERIA.every(key => review.criteria?.[key] === 'pass')
    && !currentFrameCriticApproval(state)) reasons.push('whole_brief_critic_review_required');

  const uniqueReasons = [...new Set(reasons)];
  const guardPending = guardAction !== 'ready'
    && !(/^Art Director directive .+ completed; issue the next directive or end the painting stage$/.test(guardAction));
  if (guardPending) uniqueReasons.push('guard_action_pending');
  if (state?.document_instance?.identity_pending) uniqueReasons.push('document_identity_unverified');
  const blocked = state?.document_instance?.identity_pending === true
    || /\b(reconcile|uncertain|rollback|poll|recovery|identity|not-executed)\b/i.test(guardAction);
  const allowed = uniqueReasons.length === 0;
  const nextAction = guardPending ? guardAction
    : uniqueReasons.includes('art_run_missing') || uniqueReasons.includes('original_brief_missing')
      ? 'Bind the existing document art run and unchanged original user brief with photoshop_guard_set_art_run; no Photoshop pixel mutation is needed.'
      : artisticContinuation(state)
          ?? (uniqueReasons.includes('whole_brief_review_required')
            ? 'Review the exact current whole frame against original_brief; record painting_completion with all six honest criteria in the existing Guard review. No new painting mutation is required for review metadata alone.'
            : uniqueReasons.length ? 'Resolve the listed whole-brief completion debts in a bounded reviewed pass, or report the concrete blocker without claiming completion.'
              : 'Whole-brief completion is confirmed for the current frame; no further painting is required.');
  return {
    protocol: 'paintpilot.whole-brief-completion.v1',
    status: allowed ? 'completed' : blocked ? 'blocked' : 'incomplete',
    completion_allowed: allowed,
    evidence: {
      brief_sha256: briefSha,
      current_frame_sha256: frameSha,
      review_frame_sha256: typeof review?.frame_sha256 === 'string' ? review.frame_sha256 : null,
      review_kind: 'painter_self_assessment',
      critic_frame_sha256: typeof state?.chat_critic_review?.frame_sha256 === 'string'
        ? state.chat_critic_review.frame_sha256 : null,
      critic_role_approved: currentFrameCriticApproval(state),
      critic_independent: false,
    },
    reasons: uniqueReasons,
    next_required_action: nextAction,
    host_turn_policy: allowed
      ? 'The artist may report the whole brief complete, limited to the current reviewed frame.'
      : 'Do not report the whole painting finished. Continue via the existing host Goal if enabled, or state the exact pending work/blocker. Never retry an uncertain mutation or override user Stop.',
  };
}
