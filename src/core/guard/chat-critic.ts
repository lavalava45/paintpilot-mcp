import { createHash } from 'node:crypto';
import { CORRECTION_KINDS, CORRECTION_KIND_SCHEMA, STRUCTURAL_DEFECT_SCHEMA, structuralDefectIssue, correctionFinding } from './critic-correction.js';
import { canonicalPaintingStage } from '../painting-stage-policy.js';
import { CRITIC_OBLIGATIONS_SCHEMA, validateCriticObligations, persistCriticObligations,
  criticObligationState, criticObligationNeedsRecheck } from './critic-obligations.js';
import { VISUAL_RELATIONSHIP_REVIEW_VERSION, VISUAL_RELATION_SCHEMA,
  validateVisualRelationships, requiredVisualRelationKinds } from './visual-relationship-review.js';

type Row = Record<string, any>;
export const CHAT_CRITIC_PROTOCOL = 'photoshop.guard.chat_critic.v1';
export const CRITIC_CORRECTION_VERSION = 'critic-correction-v1';
export const SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION = 'support-contact-weight-v1';
export const CONTACT_REVIEW_DESCRIPTION = 'Visually assess support, contact and plausible weight distribution for every relevant depicted object, plus protected content. Respect brief-authorized stylization, motion and suspension. A critic_review contact_and_protection pass requires one findings[] entry of that criterion: visible describes concrete support/contact/balance evidence (or justified non-applicability); next_change states what to preserve. Judge relationships shown or implied by the scene: a cropped portrait or abstract study may justify non-applicability, but required support that cannot be assessed is unknown, not pass.';

/** Same visual boundary for ordinary Painter review, Critic and optional delegation. */
export function supportContactWeightInstruction(language: string, compact = false): string {
  if (compact) return language === 'ru'
    ? 'В observed подтверди видимые опору, контакт и баланс веса значимых объектов. Учитывай движение, подвес и стилизацию задания; неясная требуемая опора — unknown; крупный план может обосновывать неприменимость. Для critic_review contact_and_protection=pass нужна одна findings-запись: visible — конкретное подтверждение, next_change — что сохранить; fail требует структурной правки. Без новых кадров или вызовов.'
    : 'In observed confirm visible support, contact and weight balance of relevant objects. Respect motion, suspension and brief-authorized stylization; unclear required support is unknown; a close-up may justify non-applicability. critic_review contact_and_protection=pass needs one findings entry: visible evidence and next_change saying what to preserve; fail needs structural correction. No new frames or calls.';
  return language === 'ru'
    ? 'Проверь у каждого значимого изображённого объекта опору (что держит нагрузку), контакт (соприкосновение без необъяснимого зазора) и распределение веса (правдоподобный баланс позы или конструкции). Учитывай наклон, подвес, противовес, движение и намеренную стилизацию из задания; не требуй стоять на земле. Оцени отношения, показанные или подразумеваемые сценой. Крупный план или абстракция могут обосновывать неприменимость; если требуемая опора скрыта или неясна, оцени unknown. Тень, IK и расчёт геометрии сами по себе не доказывают устойчивость на изображении. Кратко назови видимое подтверждение в observed; при critic_review с contact_and_protection=pass добавь одну findings-запись этого критерия: visible — конкретная опора, контакт и баланс либо обоснованная неприменимость; next_change — что сохранить. При дефекте укажи изменение опоры/контакта/позы, а не только новую тень; открытый дефект сохраняется. Используй уже доставленный кадр, без отдельного вызова оценки.'
    : 'For every relevant depicted object inspect support (what carries the load), contact (a meeting without unexplained gaps), and weight distribution (plausible balance of pose or structure). Account for leaning, suspension, counterweights, motion and brief-authorized stylization; ground contact is not mandatory. Assess relationships shown or implied by the scene. A close-up or abstraction may justify non-applicability; required support that is hidden or ambiguous is unknown. A shadow, IK or calculated geometry alone does not prove visible stability. Briefly report visible evidence in observed; when critic_review marks contact_and_protection=pass, include one findings entry of that criterion: visible names concrete support/contact/balance evidence or justified non-applicability; next_change says what to preserve. For a defect name a support/contact/pose correction, not just another shadow; retain unresolved debt. Use the already delivered frame without a separate evaluation call.';
}
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
      properties: Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key => [key, { type: 'string', enum: statuses,
        ...(key === 'contact_and_protection' ? { description: CONTACT_REVIEW_DESCRIPTION } : {}) }])),
      required: [...CHAT_CRITIC_CRITERIA] },
    findings: { type: 'array', description: 'Every fail needs a concrete deficit/correction. Multiple independently identified structural defects may share a criterion but need distinct structural_defect.id. A pass for a retained structural defect must explicitly recheck the same id on current pixels.', maxItems: 12, items: { type: 'object', additionalProperties: false,
      properties: { criterion: { type: 'string', enum: [...CHAT_CRITIC_CRITERIA] },
        correction_kind: CORRECTION_KIND_SCHEMA,
        structural_defect: STRUCTURAL_DEFECT_SCHEMA,
        visible: { type: 'string', minLength: 10, maxLength: 400 },
        next_change: { type: 'string', minLength: 10, maxLength: 400 } },
      required: ['criterion', 'visible', 'next_change'] } },
    visual_relationships: VISUAL_RELATION_SCHEMA,
    obligations: CRITIC_OBLIGATIONS_SCHEMA,
  }, required: ['request_id', 'reviewer', 'criteria', 'findings', 'visual_relationships'],
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Reviews created before 2026-10-16 used a JSON-escaped brief hash. They cannot
// approve a NEW completion, but their unresolved findings must not disappear on
// the first review after deployment solely because the hash format was corrected.
const compatiblePriorBrief = (state: Row, briefSha: string): boolean =>
  state.chat_critic_review?.brief_sha256 === briefSha
  || (typeof state.original_brief === 'string'
    && state.chat_critic_review?.brief_sha256 === hash(state.original_brief));
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
    && review.support_review_version === SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION
    && review.correction_version === CRITIC_CORRECTION_VERSION
    && review.visual_relationship_review_version === VISUAL_RELATIONSHIP_REVIEW_VERSION
    && review.document_id === request.document_id
    && review.document_incarnation_id === request.document_incarnation_id ? review : undefined;
};

/** Scheduling and evidence only. The server neither sees the picture nor generates a Critic judgment. */
export function chatCriticRequest(record: Row, state: Row, records: Row[], final = false): Row | undefined {
  const profile = state.painting_profile ?? (state.process_dir ? 'nontrivial_painting' : undefined);
  if (!['nontrivial_painting', 'simple_graphic'].includes(profile) || !state.original_brief?.trim()
    || !record?.visual || record.failed || record.rolled_back || record.current_frame_authority === false
    || record.verdict?.disposition === 'rollback' || !record.preview?.sha256 || record.phase !== 'completed') return undefined;
  // The caller supplies only records belonging to the current document incarnation.
  // A stale operation id may still be readable from the durable journal after a
  // Photoshop numeric document id is reused; it must not acquire a new Critic
  // request (or a final-review approval) under the replacement document's brief.
  if (!records.some(row => row.id === record.id)) return undefined;
  const count = records.filter(row => row.visual && row.preview && !row.failed && !row.rolled_back
    && row.current_frame_authority !== false && row.phase === 'completed'
    && row.args?.document_id === record.args?.document_id
    && !['photoshop_get_preview', 'photoshop_undo', 'photoshop_redo'].includes(row.tool)).length;
  // Completion contracts hash the original UTF-8 brief directly. Critic must bind
  // the same bytes, not JSON.stringify(brief), or exact-frame corroboration fails.
  const briefSha = createHash('sha256').update(state.original_brief).digest('hex');
  const incarnation = incarnationOf(state);
  const request: Row = { protocol: CHAT_CRITIC_PROTOCOL, support_review_version: SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION,
    correction_version: CRITIC_CORRECTION_VERSION,
    visual_relationship_review_version: VISUAL_RELATIONSHIP_REVIEW_VERSION,
    request_id: hash([CHAT_CRITIC_PROTOCOL, SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION, CRITIC_CORRECTION_VERSION,
      VISUAL_RELATIONSHIP_REVIEW_VERSION, record.id, record.args?.document_id,
      incarnation, record.preview.sha256, briefSha]),
    operation_id: record.id, after_sha256: record.preview.sha256, brief_sha256: briefSha,
    document_id: record.args?.document_id, document_incarnation_id: incarnation,
    scope: 'whole-scene-against-original-brief', stage: stageOf(record), visual_count: count,
    default_reviewer: 'same-chat-role', provider_call_required: false,
    response_field: 'previous_observation.critic_review', criteria: [...CHAT_CRITIC_CRITERIA] };
  request.retained_findings = (state.chat_critic_findings ?? []).map(correctionFinding);
  request.obligation_contract = CRITIC_OBLIGATIONS_SCHEMA;
  request.visual_relationship_contract = VISUAL_RELATION_SCHEMA;
  request.visual_relationship_required_kinds = requiredVisualRelationKinds(state);
  request.visual_relationship_guidance = 'On this exact delivered AFTER, inspect salient visible part-to-part relationships: for people/animals head-to-torso shape and scale; for gripping/using tools hand-to-object placement/contact; for resting or leaning objects actual supporting surface, balance and contact; plus scene depth and relative scale. Compare to the original brief and authorized style, never to a generic anatomy template. Return 1–8 visual_relationships with stable id, kind, named part_ids, expected, concrete AFTER-visible evidence and pass|fail|unknown|not-applicable. For each fail include a matching named structural_defect in findings (id and relation_ids contain the relationship id); for rechecking a prior failure return the same id and same structural_defect. If no relation applies (e.g. abstract field), one none/not-applicable with concrete reason is allowed. Unclear hidden contact/proportions are unknown. Native construction constraints, shadows and executed tool receipts are NOT visual evidence.';
  request.open_obligations = criticObligationState(state).filter(row => row.status !== 'pass');
  request.obligation_guidance = 'If an older single finding contains independently verifiable prerequisites, explicitly declare stable critic_review.obligations here on the already delivered frame; choose component IDs and dependencies, retain parent_problem_id from retained_findings, choose correction_kind separately for each subrequirement, and mark each pass/fail/unknown from visible evidence. List all subrequirements of a replaced parent; unrelated findings remain open. If the split is ambiguous, keep it unknown and ask for clarification in this existing review, not an extra tool call.';
  request.obligation_rechecks = criticObligationState(state)
    .filter(row => row.status === 'pass'
      && criticObligationNeedsRecheck(row, record))
    .map(row => ({ id: row.id, component_ids: row.component_ids, last_frame_sha256: row.frame_sha256 }));
  // Numeric Photoshop document ids can be reused after reconnect/reopen. A review from an
  // earlier incarnation must not suppress the first whole-scene checkpoint of a new canvas.
  const last = incarnation && state.chat_critic_review?.support_review_version === SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION
    && state.chat_critic_review?.correction_version === CRITIC_CORRECTION_VERSION
    && state.chat_critic_review?.visual_relationship_review_version === VISUAL_RELATIONSHIP_REVIEW_VERSION
    && state.chat_critic_review.brief_sha256 === briefSha
    && state.chat_critic_review.document_id === request.document_id
    && state.chat_critic_review.document_incarnation_id === request.document_incarnation_id
    ? state.chat_critic_review : undefined;
  const finalReview = final || ['FINAL_SELECTION', 'FINAL', 'FINISH'].includes(stageOf(record));
  request.trigger = finalReview ? 'final-review'
    : criticObligationState(state).some(row => row.status === 'pass'
      && criticObligationNeedsRecheck(row, record)) ? 'obligation-recheck'
    : !last && stageOf(record) !== 'GLOBAL_BLOCK_IN' ? 'stage-boundary'
    : !last && count >= 3 ? 'early-scene'
    : last && stageOf(record) !== last.stage ? 'stage-boundary'
    : last && count >= last.visual_count + 6 ? 'scene-checkpoint' : 'optional';
  request.required = request.trigger !== 'optional' && !currentCritic(record, state, request);
  return request;
}

export function criticRoleInstruction(language: string): string {
  return (language === 'ru'
    ? 'Сейчас переключись из Художника в роль Critic. Оцени весь точный AFTER по исходному заданию; BEFORE используй только для сравнения. Отложи объяснения своих действий и намерений: оцени видимые форму, пропорции, пространство, свет и связь окружения с предметами. Сдержанный фон допустим, если он выполняет замысел; заливка сама по себе не доказывает готовность света/пространства. Для каждого fail назови видимый недостаток и одно изменение построения; unknown не заменяй успехом. Верни critic_review, затем переключись в Художника и в том же cycle_auto передай оценку с очередным проходом. Новых кадров, отчёта о командах и отдельного вызова оценки не нужно.'
    : 'Switch from Painter to Critic now. Judge the entire exact AFTER against the original brief; use BEFORE only for change comparison. Set aside your construction explanation and intentions. Assess visible form, proportions, space, light and subject/context relationships. A restrained background is valid when it serves the brief; a fill alone does not establish light/space. Each fail needs one visible deficit and one construction change; unknown is never success. Return critic_review, switch back to Painter and submit it with the next pass in the same cycle_auto. No new image capture, tool-success narrative or extra evaluation call.') + ' ' + supportContactWeightInstruction(language)
    + (language === 'ru'
      ? ' Заполни critic_review.visual_relationships для видимых связей частей: голова–туловище, кисть–предмет, предмет–опора, масштаб/глубина. Для каждой назови стабильный id, kind, part_ids, ожидаемую связь из задания, видимое подтверждение НА КАДРЕ AFTER и pass/fail/unknown/not-applicable. Для fail укажи связанный findings[].structural_defect с тем же id; проверяй исправление на новых пикселях, а не по IK, координатам или логу команд. Для сцены без таких связей обоснуй none/not-applicable. Никакого нового вызова или кадра.'
      : ' Fill critic_review.visual_relationships for salient visible part relations: head–torso, hand–object, object–support, scene scale/depth. Give stable id, kind, part_ids, brief-grounded expected relation, concrete visible evidence on exact AFTER and pass/fail/unknown/not-applicable. A failed relationship needs matching findings[].structural_defect with the SAME id, and correction must be rechecked on new pixels, not inferred from IK, coordinates or tool logs. For genuinely inapplicable scenes justify none/not-applicable. No new call or frame.')
    + ' Rank unresolved findings by actual whole-scene urgency (highest first); declare real prerequisite dependencies in obligations, not an implicit rule that every form defect precedes every material pass. Named structural part/relation defects keep their exact geometry/recheck gates. Set correction_kind to missing-object|composition|form|light|material|contact|brief. Judge visible gain after the bounded repair; local target success does not clear the whole-scene defect. Select a real construction change after repeated no gain, not another cosmetic pass. Keep the original brief as the task.';
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
      workers: [{ label: 'Critic', task: `Judge the whole image against the original brief appended by the parent. Read only the exact image paths ${JSON.stringify(paths)}; AFTER SHA=${request.after_sha256}. Do not use Painter reasoning/tool logs as proof. Return JSON with request_id=${request.request_id}, reviewer=spawned-reviewer, criteria (all ${CHAT_CRITIC_CRITERIA.join(',')}: pass|fail|unknown), findings (up to 12; criterion, visible deficit, next_change; 10-400 chars each), visual_relationships (1–8 with stable id, kind=anatomy|interaction|support|spatial|none, part_ids, expected, AFTER-visible evidence, status=pass|fail|unknown|not-applicable). Inspect head/torso, hand/object, object/support as applicable. Every failed relation needs a matching named structural_defect finding with relation id in relation_ids. Recheck same id on repaired pixels, never infer success from IK/coordinate solve. A genuinely inapplicable abstract scene may report one none/not-applicable with visible justification. Every fail needs its finding. contact_and_protection pass also needs a finding describing positive visible support/contact/weight evidence and what to preserve; other pass criteria need none. ${supportContactWeightInstruction('en')} If image unavailable use unknown, never inferred image success. Then finish with RESULT/VALIDATION/BLOCKERS. Parent collects status once; if pending do not invent the verdict.` }] } };
}

export function validateChatCritic(raw: unknown, request: Row | undefined, record: Row, state: Row,
  completion?: Row): Row | undefined {
  if (!request) {
    if (raw !== undefined) throw new Error('chat_critic_not_applicable: bind the original brief and exact visual frame in a supported painting profile first');
    return undefined;
  }
  let review: Row | undefined;
  if (raw === undefined) {
    review = currentCritic(record, state, request);
    if (!review && request.required) {
      const example = { request_id: request.request_id, reviewer: 'same-chat-role',
        criteria: Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key => [key, 'unknown'])), findings: [],
        visual_relationships: [{ id: 'visible-relation-id', kind: 'spatial', part_ids: ['subject','environment'],
          expected: 'Describe a brief-grounded relative size or spatial relationship',
          visible: 'Describe what actually appears on the delivered AFTER image, not planned geometry', status: 'unknown' }] };
      throw new Error(`chat_critic_review_required (${request.trigger}): inspect the ALREADY delivered exact whole frame as Critic, then add previous_observation.critic_review=${JSON.stringify(example)} with actual judgments. Same cycle; no source reads, new capture or close-only call.`);
    }
  } else {
    const value = raw as Row;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.request_id !== request.request_id) throw new Error('chat_critic_binding_mismatch: use the current critic_role.request_id; operation/frame/brief/document changed');
    if (!['same-chat-role', 'spawned-reviewer'].includes(value.reviewer)
      || Object.keys(value).some(key => !['request_id', 'reviewer', 'criteria', 'findings', 'visual_relationships', 'obligations'].includes(key))
      || !value.criteria || typeof value.criteria !== 'object' || Array.isArray(value.criteria)
      || CHAT_CRITIC_CRITERIA.some(key => !statuses.includes(value.criteria[key]))
      || Object.keys(value.criteria).some(key => !(CHAT_CRITIC_CRITERIA as readonly string[]).includes(key))
      || !Array.isArray(value.findings) || value.findings.length > 12)
      throw new Error('chat_critic_contract_invalid: reviewer, all five criteria pass|fail|unknown and findings[] are required');
    const seen = new Set<string>();
    for (const finding of value.findings) {
      if (!finding || typeof finding !== 'object' || Array.isArray(finding)
        || Object.keys(finding).some(key => !['criterion', 'visible', 'next_change', 'correction_kind', 'structural_defect'].includes(key))
        || (finding.structural_defect !== undefined && structuralDefectIssue(finding.structural_defect))
        || !(CHAT_CRITIC_CRITERIA as readonly string[]).includes(finding.criterion)
        || seen.has(finding.structural_defect?.id ?? finding.criterion)
        || (finding.correction_kind !== undefined && !CORRECTION_KINDS.includes(finding.correction_kind))
        || (value.criteria[finding.criterion] === 'pass'
          && finding.criterion !== 'contact_and_protection'
          && !(finding.structural_defect
            && state.chat_critic_findings?.some((old: Row) =>
              old.structural_defect?.id === finding.structural_defect.id
              && old.criterion === finding.criterion)
            || finding.structural_defect
              && state.visual_problems?.[finding.structural_defect.id]?.structural_defect?.id === finding.structural_defect.id))
        || ['visible', 'next_change'].some(key => typeof finding[key] !== 'string'
          || finding[key].trim().length < 10 || finding[key].length > 400))
        throw new Error('chat_critic_findings_invalid: unique non-pass criterion (or positive contact_and_protection evidence) with concrete visible/next_change (10-400 characters)');
      seen.add(finding.structural_defect?.id ?? finding.criterion);
    }
    if (CHAT_CRITIC_CRITERIA.some(key => value.criteria[key] === 'fail'
      && !value.findings.some((item: Row) => item.criterion === key)))
      throw new Error('chat_critic_findings_required: every failed criterion needs its visible deficit and next construction change');
    validateVisualRelationships(value.visual_relationships, value.criteria, value.findings, state,
      request.visual_relationship_required_kinds ?? []);
    const currentObligations = state.chat_critic_review
      && state.chat_critic_review.document_incarnation_id !== request.document_incarnation_id
      ? { ...state, critic_obligations: [] } : state;
    validateCriticObligations(value.obligations, currentObligations, record);
    const retainedStructural = Object.values(state.visual_problems ?? {})
      .filter((p: any) => p?.structural_defect && p.status !== 'resolved') as Row[];
    for (const problem of retainedStructural) {
      const existing = problem.structural_defect;
      const reported = value.findings.find((item: Row) => item.structural_defect?.id === existing.id);
      if (reported && JSON.stringify(reported.structural_defect) !== JSON.stringify(existing))
        throw new Error(`chat_critic_structural_identity_conflict: retain the original relation and recheck criterion for ${existing.id}; a new target needs a separately identified defect`);
      const previousCriterion = state.chat_critic_findings?.find((item: Row) => item.structural_defect?.id === existing.id)?.criterion
        ?? (existing.kind === 'support-contact' ? 'contact_and_protection'
          : existing.kind === 'composition-relation' ? 'composition_context' : 'form_proportions');
      if (value.criteria[previousCriterion] === 'pass' && !reported)
        throw new Error(`chat_critic_structural_recheck_required: current-frame pass of ${previousCriterion} must explicitly recheck unresolved ${existing.id}, not silently clear it`);
    }
    if (value.criteria.contact_and_protection === 'pass'
      && !value.findings.some((item: Row) => item.criterion === 'contact_and_protection'))
      throw new Error('chat_critic_support_observation_required: contact_and_protection pass needs one findings entry with concrete visible support/contact/weight evidence (or brief-grounded non-applicability) and next_change describing what to preserve; use unknown if support cannot be assessed. Same delivered frame and cycle, no new capture.');
    review = { ...structuredClone(value), protocol: CHAT_CRITIC_PROTOCOL,
      support_review_version: SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION, correction_version: CRITIC_CORRECTION_VERSION,
      visual_relationship_review_version: VISUAL_RELATIONSHIP_REVIEW_VERSION, operation_id: record.id,
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

export function persistChatCritic(state: Row, review?: Row, record?: Row): Row {
  if (!review) return criticObligationState(state).length && record
    ? { critic_obligations: persistCriticObligations(state, undefined, record) } : {};
  const old = review.document_incarnation_id && compatiblePriorBrief(state, review.brief_sha256)
    && state.chat_critic_review.document_id === review.document_id
    && state.chat_critic_review.document_incarnation_id === review.document_incarnation_id
    ? state.chat_critic_findings ?? [] : [];
  const keyOf = (finding: Row) => finding.structural_defect?.id ?? finding.criterion;
  const findings = new Map<string, Row>(old.map((finding: Row) => [keyOf(finding), finding]));
  for (const key of CHAT_CRITIC_CRITERIA) {
    if (review.criteria[key] === 'pass') {
      for (const [id, previous] of findings) {
        if (previous.criterion !== key) continue;
        const positive = review.findings.some((item: Row) =>
          item.criterion === key && item.structural_defect?.id === previous.structural_defect?.id);
        if (!previous.structural_defect || positive) findings.delete(id);
      }
    }
    else {
      for (const finding of review.findings.filter((item: Row) => item.criterion === key))
        findings.set(keyOf(finding), { ...correctionFinding(finding), source_operation_id: review.operation_id,
        evidence_sha256: review.frame_sha256 });
    }
  }
  const rank = new Map(review.findings.map((item: Row, index: number) => [keyOf(item), index]));
  const problems = { ...(state.visual_problems ?? {}) };
  for (const finding of review.findings) {
    const defect = finding.structural_defect;
    if (!defect) continue;
    const prior = problems[defect.id];
    const relation = (review.visual_relationships ?? []).find((row: Row) => row.id === defect.id);
    const resolved = review.criteria[finding.criterion] === 'pass'
      && prior?.structural_defect?.id === defect.id;
    problems[defect.id] = {
      ...(prior ?? {}),
      problem_id: defect.id,
      structural_defect: structuredClone(defect),
      scale: prior?.scale ?? (defect.kind === 'composition-relation' ? 'global' : 'medium'),
      severity: prior?.severity ?? 'must-fix',
      status: resolved ? 'resolved' : 'open',
      structural_review: true,
      ...(relation ? { visual_relationship_kind: relation.kind } : {}),
      hypothesis: defect.visible,
      ...(defect.region_bounds ? { review_region_bounds: structuredClone(defect.region_bounds) } : {}),
      ...(resolved ? { resolution_evidence_sha256: review.frame_sha256,
        resolution_operation_id: review.operation_id } : {}),
    };
  }
  const compatibleObligations = review.document_incarnation_id
    && state.chat_critic_review?.document_incarnation_id === review.document_incarnation_id
    && compatiblePriorBrief(state, review.brief_sha256)
    && state.chat_critic_review?.document_id === review.document_id;
  const obligationSource = compatibleObligations ? state : { ...state, critic_obligations: [] };
  const previousFailures = compatibleObligations ? state.critic_scene_failures ?? {} : {};
  const sceneFailures: Row = {};
  for (const finding of findings.values()) {
    const id = keyOf(finding);
    const criterion = finding.criterion;
    if (review.criteria[criterion] === 'pass') continue;
    const prior = previousFailures[id];
    if (review.criteria[criterion] === 'unknown') {
      if (prior) sceneFailures[id] = prior;
      continue;
    }
    const previousFinding = compatibleObligations && (state.chat_critic_findings ?? [])
      .some((row: Row) => keyOf(row) === id);
    const distinct = previousFinding && prior?.last_failed_frame_sha256
      && prior.last_failed_frame_sha256 !== review.frame_sha256;
    sceneFailures[id] = {
      consecutive_failed_frames: distinct ? (prior?.consecutive_failed_frames ?? 1) + 1
        : prior?.consecutive_failed_frames ?? 1,
      last_failed_frame_sha256: review.frame_sha256,
      last_review_operation_id: review.operation_id,
    };
  }
  return { chat_critic_review: review,
    ...(review.obligations !== undefined || criticObligationState(state).length
      ? { critic_obligations: persistCriticObligations(obligationSource, review, record) } : {}),
    chat_critic_findings: [...findings.values()].sort((a, b) => Number(rank.get(keyOf(a)) ?? 99) - Number(rank.get(keyOf(b)) ?? 99)),
    critic_scene_failures: sceneFailures,
    ...(Object.keys(problems).length ? { visual_problems: problems } : {}),
  };
}
