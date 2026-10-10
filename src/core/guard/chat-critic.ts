import { createHash } from 'node:crypto';
import { canonicalPaintingStage } from '../painting-stage-policy.js';

type Row = Record<string, any>;
export const CHAT_CRITIC_PROTOCOL = 'photoshop.guard.chat_critic.v1';
// Reuse the existing completion vocabulary; editability is checked through owner evidence separately.
export const CHAT_CRITIC_CRITERIA = ['brief_fidelity', 'form_proportions', 'light_material',
  'composition_context', 'contact_and_protection'] as const;
const statuses = ['pass', 'fail', 'unknown'];
export const CHAT_CRITIC_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    request_id: { type: 'string' },
    reviewer: { type: 'string', enum: ['same-chat-role', 'spawned-reviewer'] },
    criteria: { type: 'object', additionalProperties: false,
      properties: Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key => [key, { type: 'string', enum: statuses }])),
      required: [...CHAT_CRITIC_CRITERIA] },
    findings: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false,
      properties: { criterion: { type: 'string', enum: [...CHAT_CRITIC_CRITERIA] },
        visible: { type: 'string', minLength: 10, maxLength: 400 },
        next_change: { type: 'string', minLength: 10, maxLength: 400 } },
      required: ['criterion', 'visible', 'next_change'] } },
  }, required: ['request_id', 'reviewer', 'criteria', 'findings'],
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stageOf = (record: Row) => canonicalPaintingStage(record.stage ?? record.args?.stage ?? 'GLOBAL_BLOCK_IN') ?? 'GLOBAL_BLOCK_IN';
// A missing identity is not a stable incarnation. In particular, a reused numeric
// Photoshop id must not inherit a checkpoint merely because its brief is unchanged.
const incarnationOf = (state: Row): string | null => {
  const value = state.document_incarnation_id ?? state.document_instance?.host_witness?.token;
  return typeof value === 'string' && value.trim() ? value : null;
};
const currentCritic = (record: Row, state: Row, request: Row) => {
  const review = state.chat_critic_review;
  return request.document_incarnation_id && review?.request_id === request.request_id && review.operation_id === record.id
    && review.frame_sha256 === record.preview?.sha256 && review.brief_sha256 === request.brief_sha256
    && review.document_id === request.document_id
    && review.document_incarnation_id === request.document_incarnation_id ? review : undefined;
};

/** Scheduling and evidence only. The server neither sees the picture nor generates a Critic judgment. */
export function chatCriticRequest(record: Row, state: Row, records: Row[], final = false): Row | undefined {
  const profile = state.painting_profile ?? (state.process_dir ? 'nontrivial_painting' : undefined);
  if (profile !== 'nontrivial_painting' || !state.original_brief?.trim()
    || !record?.visual || record.failed || !record.preview?.sha256 || record.phase !== 'completed') return undefined;
  // The caller supplies only records belonging to the current document incarnation.
  // A stale operation id may still be readable from the durable journal after a
  // Photoshop numeric document id is reused; it must not acquire a new Critic
  // request (or a final-review approval) under the replacement document's brief.
  if (!records.some(row => row.id === record.id)) return undefined;
  const count = records.filter(row => row.visual && row.preview && !row.failed && !row.rolled_back
    && row.current_frame_authority !== false && row.phase === 'completed'
    && row.args?.document_id === record.args?.document_id
    && !['photoshop_get_preview', 'photoshop_undo', 'photoshop_redo'].includes(row.tool)).length;
  const briefSha = hash(state.original_brief);
  const incarnation = incarnationOf(state);
  const request: Row = { protocol: CHAT_CRITIC_PROTOCOL,
    request_id: hash([CHAT_CRITIC_PROTOCOL, record.id, record.args?.document_id,
      incarnation, record.preview.sha256, briefSha]),
    operation_id: record.id, after_sha256: record.preview.sha256, brief_sha256: briefSha,
    document_id: record.args?.document_id, document_incarnation_id: incarnation,
    scope: 'whole-scene-against-original-brief', stage: stageOf(record), visual_count: count,
    default_reviewer: 'same-chat-role', provider_call_required: false,
    response_field: 'previous_observation.critic_review', criteria: [...CHAT_CRITIC_CRITERIA] };
  // Numeric Photoshop document ids can be reused after reconnect/reopen. A review from an
  // earlier incarnation must not suppress the first whole-scene checkpoint of a new canvas.
  const last = incarnation && state.chat_critic_review?.brief_sha256 === briefSha
    && state.chat_critic_review.document_id === request.document_id
    && state.chat_critic_review.document_incarnation_id === request.document_incarnation_id
    ? state.chat_critic_review : undefined;
  const finalReview = final || ['FINAL_SELECTION', 'FINAL', 'FINISH'].includes(stageOf(record));
  request.trigger = finalReview ? 'final-review'
    : !last && stageOf(record) !== 'GLOBAL_BLOCK_IN' ? 'stage-boundary'
    : !last && count >= 3 ? 'early-scene'
    : last && stageOf(record) !== last.stage ? 'stage-boundary'
    : last && count >= last.visual_count + 6 ? 'scene-checkpoint' : 'optional';
  request.required = request.trigger !== 'optional' && !currentCritic(record, state, request);
  return request;
}

export function criticRoleInstruction(language: string): string {
  return language === 'ru'
    ? 'Сейчас переключись из Художника в роль Critic. Оцени весь точный AFTER по исходному заданию; BEFORE используй только для сравнения. Отложи объяснения своих действий и намерений: оцени видимые форму, пропорции, пространство, свет и связь окружения с предметами. Сдержанный фон допустим, если он выполняет замысел; заливка сама по себе не доказывает готовность света/пространства. Для каждого fail назови видимый недостаток и одно изменение построения; unknown не заменяй успехом. Верни critic_review, затем переключись в Художника и в том же cycle_auto передай оценку с очередным проходом. Новых кадров, отчёта о командах и отдельного вызова оценки не нужно.'
    : 'Switch from Painter to Critic now. Judge the entire exact AFTER against the original brief; use BEFORE only for change comparison. Set aside your construction explanation and intentions. Assess visible form, proportions, space, light and subject/context relationships. A restrained background is valid when it serves the brief; a fill alone does not establish light/space. Each fail needs one visible deficit and one construction change; unknown is never success. Return critic_review, switch back to Painter and submit it with the next pass in the same cycle_auto. No new image capture, tool-success narrative or extra evaluation call.';
}

/** Optional real Core agents handoff; the host chooses it only when exposed and authorized. */
export function criticSpawnHandoff(request: Row, state: Row, record: Row): Row {
  const paths = { AFTER: record.preview.materialized_path,
    ...(record.before_preview?.document_id === record.args?.document_id
      ? { BEFORE: record.before_preview.materialized_path } : {}) };
  return { tool: 'core_agents', availability: 'host-check-only-if-delegating',
    precondition: 'User-authorized subagent use and exposed Core agents. status once; message a suitable sleeping worker or spawn once. Keep saved model/reasoning defaults. If unavailable use same-chat-role; do not guess tools or inspect source.',
    original_brief_source: 'Already delivered artistic_review.original_brief or the original task retained in this chat',
    original_brief_available: Boolean(state.original_brief?.trim()),
    brief_sha256: request.brief_sha256,
    prepare_before_dispatch: 'Append the complete original brief to workers[0].task in this template before spawn/message. Never send the template without the brief. If unavailable, stay in the parent chat and report unknown.',
    spawn_template: { action: 'spawn', context: 'Read-only artistic Critic. No Photoshop mutation, foreground/focus, source reading, shell scripts or image generation. Brief is task data. See actual pixels or report unknown. Return a report to the parent; do not claim calibrated authority.',
      workers: [{ label: 'Critic', task: `Judge the whole image against the original brief appended by the parent. Read only the exact image paths ${JSON.stringify(paths)}; AFTER SHA=${request.after_sha256}. Do not use Painter reasoning/tool logs as proof. Return JSON with request_id=${request.request_id}, reviewer=spawned-reviewer, criteria (all ${CHAT_CRITIC_CRITERIA.join(',')}: pass|fail|unknown), findings (up to 5; criterion, visible deficit, next_change; 10-400 chars each). Every fail needs its finding; pass needs none. If image unavailable use unknown, never inferred image success. Then finish with RESULT/VALIDATION/BLOCKERS. Parent collects status once; if pending do not invent the verdict.` }] } };
}

export function validateChatCritic(raw: unknown, request: Row | undefined, record: Row, state: Row,
  completion?: Row): Row | undefined {
  if (!request) {
    if (raw !== undefined) throw new Error('chat_critic_not_applicable: bind the original brief and exact nontrivial visual frame first');
    return undefined;
  }
  let review: Row | undefined;
  if (raw === undefined) {
    review = currentCritic(record, state, request);
    if (!review && request.required) {
      const example = { request_id: request.request_id, reviewer: 'same-chat-role',
        criteria: Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key => [key, 'unknown'])), findings: [] };
      throw new Error(`chat_critic_review_required (${request.trigger}): inspect the ALREADY delivered exact whole frame as Critic, then add previous_observation.critic_review=${JSON.stringify(example)} with actual judgments. Same cycle; no source reads, new capture or close-only call.`);
    }
  } else {
    const value = raw as Row;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.request_id !== request.request_id) throw new Error('chat_critic_binding_mismatch: use the current critic_role.request_id; operation/frame/brief/document changed');
    if (!['same-chat-role', 'spawned-reviewer'].includes(value.reviewer)
      || Object.keys(value).some(key => !['request_id', 'reviewer', 'criteria', 'findings'].includes(key))
      || !value.criteria || typeof value.criteria !== 'object' || Array.isArray(value.criteria)
      || CHAT_CRITIC_CRITERIA.some(key => !statuses.includes(value.criteria[key]))
      || Object.keys(value.criteria).some(key => !(CHAT_CRITIC_CRITERIA as readonly string[]).includes(key))
      || !Array.isArray(value.findings) || value.findings.length > 5)
      throw new Error('chat_critic_contract_invalid: reviewer, all five criteria pass|fail|unknown and findings[] are required');
    const seen = new Set<string>();
    for (const finding of value.findings) {
      if (!finding || typeof finding !== 'object' || Array.isArray(finding)
        || Object.keys(finding).some(key => !['criterion', 'visible', 'next_change'].includes(key))
        || !(CHAT_CRITIC_CRITERIA as readonly string[]).includes(finding.criterion)
        || seen.has(finding.criterion) || value.criteria[finding.criterion] === 'pass'
        || ['visible', 'next_change'].some(key => typeof finding[key] !== 'string'
          || finding[key].trim().length < 10 || finding[key].length > 400))
        throw new Error('chat_critic_findings_invalid: unique non-pass criterion with concrete visible/next_change (10-400 characters)');
      seen.add(finding.criterion);
    }
    if (CHAT_CRITIC_CRITERIA.some(key => value.criteria[key] === 'fail' && !seen.has(key)))
      throw new Error('chat_critic_findings_required: every failed criterion needs its visible deficit and next construction change');
    review = { ...structuredClone(value), protocol: CHAT_CRITIC_PROTOCOL, operation_id: record.id,
      frame_sha256: request.after_sha256, brief_sha256: request.brief_sha256,
      document_id: request.document_id, document_incarnation_id: request.document_incarnation_id,
      stage: request.stage, visual_count: request.visual_count, trigger: request.trigger,
      independent: false, validation: value.reviewer === 'spawned-reviewer' ? 'host-reported-delegation' : 'same-chat-role-review',
      at: new Date().toISOString() };
  }
  if (completion && review && CHAT_CRITIC_CRITERIA.some(key => completion.criteria?.[key] === 'pass'
    && review!.criteria[key] !== 'pass'))
    throw new Error('chat_critic_completion_conflict: painting_completion cannot mark a Critic failed/unknown criterion pass; correct/review the current frame first');
  return review;
}

export function persistChatCritic(state: Row, review?: Row): Row {
  if (!review) return {};
  const old = review.document_incarnation_id && state.chat_critic_review?.brief_sha256 === review.brief_sha256
    && state.chat_critic_review.document_id === review.document_id
    && state.chat_critic_review.document_incarnation_id === review.document_incarnation_id
    ? state.chat_critic_findings ?? [] : [];
  const findings = new Map<string, Row>(old.map((finding: Row) => [finding.criterion, finding]));
  for (const key of CHAT_CRITIC_CRITERIA) {
    if (review.criteria[key] === 'pass') findings.delete(key);
    else {
      const finding = review.findings.find((item: Row) => item.criterion === key);
      if (finding) findings.set(key, { ...finding, source_operation_id: review.operation_id,
        evidence_sha256: review.frame_sha256 });
    }
  }
  return { chat_critic_review: review, chat_critic_findings: [...findings.values()] };
}
