/** Exact-image Critic relationship assessments, NOT geometry solver output or a
 * machine-vision classifier. The host observes delivered pixels; Guard validates
 * evidence shape and retains failed named structural relations. */
import { unmetTransitionRequirements, type TransitionRequirement } from '../transition-requirements.js';
import { FrameReviewValidationError, type FrameReviewIssue } from './review-validation.js';
import { wholeObjectDepiction } from '../depiction-detail.js';
type Row = Record<string, any>;

export const VISUAL_RELATIONSHIP_REVIEW_VERSION = 'visual-relationships-v1';
export const VISUAL_RELATION_KINDS = ['anatomy', 'interaction', 'support', 'spatial', 'none'] as const;
export const VISUAL_RELATION_STATUSES = ['pass', 'fail', 'unknown', 'not-applicable'] as const;
// The same mapping drives published guidance and runtime requirements.
export const VISUAL_RELATION_RULES: Record<string, { criterion: string; structural_kinds: readonly string[] }> = {
  anatomy: { criterion: 'form_proportions', structural_kinds: ['relative-size', 'placement-orientation', 'shape-topology', 'attachment'] },
  interaction: { criterion: 'contact_and_protection', structural_kinds: ['attachment'] },
  support: { criterion: 'contact_and_protection', structural_kinds: ['support-contact'] },
  spatial: { criterion: 'composition_context', structural_kinds: ['composition-relation'] },
};
export const VISUAL_RELATION_DEFECT_KIND_GUIDANCE = Object.entries(VISUAL_RELATION_RULES)
  .map(([kind, rule]) => `For failed ${kind}, findings[].criterion must be ${rule.criterion}; structural_defect.kind may be ${rule.structural_kinds.join(', ')} (choose the visible defect).`)
  .join(' ') + ' structural_defect.id, part_ids and relation_ids must link to the failed relationship.';
export const VISUAL_RELATION_SCHEMA = {
  type: 'array', minItems: 1, maxItems: 8,
  description: 'Assess salient visible part-to-part relations on the ALREADY delivered AFTER frame. For figures inspect head/torso; for interaction inspect hand/object grip; for placed objects inspect support/contact. An abstract/cropped scene may justify not-applicable. This is a pixel-observation report, never proof from solved coordinates, shadows alone, layer labels or successful tools. Every fail needs a matching named structural_defect finding, and a previously failed relation needs an explicit recheck before pass. ' + VISUAL_RELATION_DEFECT_KIND_GUIDANCE,
  items: {
    type: 'object', additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' },
      kind: { type: 'string', enum: [...VISUAL_RELATION_KINDS] },
      part_ids: { type: 'array', minItems: 1, maxItems: 6, uniqueItems: true, items: { type: 'string', minLength: 1 } },
      expected: { type: 'string', minLength: 12, maxLength: 400 },
      visible: { type: 'string', minLength: 20, maxLength: 400 },
      status: { type: 'string', enum: [...VISUAL_RELATION_STATUSES] },
    }, required: ['id', 'kind', 'part_ids', 'expected', 'visible', 'status'],
  },
} as const;

const criterionOf = Object.fromEntries(Object.entries(VISUAL_RELATION_RULES).map(([kind, rule]) => [kind, rule.criterion]));
const exactKeys = (value: Row, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const validText = (value: unknown, min: number) => typeof value === 'string'
  && value.trim().length >= min && value.length <= 400;

/** Semantic scene declarations indicate which categories MUST be examined.
 * They do not supply correct geometry, anatomy or pixel evidence. */
export function requiredVisualRelationKinds(state: Row): string[] {
  const required = new Set<string>();
  for (const object of state.scene_ownership_plan?.objects ?? []) {
    if (!object || (object.kind !== 'compound-object' && !wholeObjectDepiction(object.depiction))) continue;
    if (object.subject_kind === 'person' || object.subject_kind === 'animal') {
      if (!wholeObjectDepiction(object.depiction)) required.add('anatomy');
      required.add('support');
    } else if (object.subject_kind === 'furniture') required.add('support');
  }
  return [...required];
}

export function validateVisualRelationships(value: unknown, criteria: Row, findings: Row[],
  state: Row, requiredKinds: string[] = []): Row[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    throw new Error('chat_critic_visual_relationships_required: report 1–8 exact-AFTER relationships (or one justified none/not-applicable) in critic_review.visual_relationships; do not infer quality from the construction model.');
  const ids = new Set<string>();
  const requirements: TransitionRequirement[] = [];
  const issues: FrameReviewIssue[] = [];
  let missingFindingCount = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !exactKeys(item, ['id','kind','part_ids','expected','visible','status'])
      || typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(item.id)
      || ids.has(item.id) || !VISUAL_RELATION_KINDS.includes(item.kind)
      || !VISUAL_RELATION_STATUSES.includes(item.status)
      || !Array.isArray(item.part_ids) || item.part_ids.length < (item.kind === 'none' ? 1 : 2)
      || item.part_ids.length > 6 || item.part_ids.some((part: unknown) => typeof part !== 'string' || !part.trim())
      || new Set(item.part_ids).size !== item.part_ids.length
      || !validText(item.expected, 12) || !validText(item.visible, 20)
      || (item.kind === 'none' && (value.length !== 1 || item.status !== 'not-applicable'))
      || (item.kind !== 'none' && item.status === 'not-applicable' && item.visible.trim().length < 25))
      throw new Error('chat_critic_visual_relationship_invalid: supply unique stable relation id, 2 named parts, brief/style-relevant expected relation, concrete AFTER-visible evidence and pass|fail|unknown|not-applicable; reserve none for scenes without any applicable relation.');
    ids.add(item.id);
    const criterion = criterionOf[item.kind];
    if (item.status === 'fail' || item.status === 'unknown') requirements.push({
      path: `previous_observation.critic_review.criteria.${criterion}`, actual: criteria[criterion],
      operator: 'one-of', expected: ['fail', 'unknown'], code: 'chat_critic_visual_relationship_criteria_conflict',
      message: `chat_critic_visual_relationship_criteria_conflict: ${item.id} is ${item.status}; ${criterion} cannot be pass`,
    });
    if (item.status === 'fail') {
      const prefix = `chat_critic_visual_relationship_defect_required: ${item.id} failed on visible pixels;`;
      const linkedIndex = findings.findIndex(finding => finding.structural_defect?.id === item.id);
      // Missing link is a prerequisite for addressing its dependent fields.
      // Report the ID to add; never invent a finding or visual evidence.
      const index = linkedIndex < 0 ? findings.length + missingFindingCount++ : linkedIndex;
      const linked = findings[linkedIndex];
      const base = `previous_observation.critic_review.findings[${index}]`;
      const common = { code: 'chat_critic_visual_relationship_defect_required' };
      requirements.push({ ...common, path: `${base}.structural_defect.id`, operator: 'equals',
        actual: linked?.structural_defect?.id, expected: item.id,
        message: `${prefix} structural_defect.id must match ${item.id}; add the named structural defect on the exact AFTER.` });
      requirements.push(
        { ...common, path: `${base}.criterion`, operator: 'equals', actual: linked?.criterion, expected: criterion,
          message: `${prefix} findings[].criterion must be ${criterion} for ${item.kind}.` },
        { ...common, path: `${base}.structural_defect.kind`, operator: 'one-of', actual: linked?.structural_defect?.kind,
          expected: VISUAL_RELATION_RULES[item.kind].structural_kinds,
          message: `${prefix} structural_defect.kind is incompatible with ${item.kind}; choose the kind describing the VISIBLE defect.` },
        { ...common, path: `${base}.structural_defect.part_ids`, operator: 'includes', actual: linked?.structural_defect?.part_ids,
          expected: item.part_ids, message: `${prefix} structural_defect.part_ids must include all named relationship parts.` },
        { ...common, path: `${base}.structural_defect.relation_ids`, operator: 'includes', actual: linked?.structural_defect?.relation_ids,
          expected: [item.id], message: `${prefix} structural_defect.relation_ids must contain ${item.id}.` },
      );
    }
    if (item.status === 'pass') {
      const unresolved = (Object.values(state.visual_problems ?? {}) as Row[]).find(problem =>
        problem?.structural_defect?.id === item.id && problem.status !== 'resolved');
      if (unresolved && !findings.some(finding => finding.criterion === criterion
        && finding.structural_defect?.id === item.id))
        issues.push({ path: 'previous_observation.critic_review.findings', code: 'chat_critic_visual_relationship_recheck_required',
          message: `chat_critic_visual_relationship_recheck_required: ${item.id} was unresolved; a current-frame pass must explicitly recheck its stable structural_defect in findings[]` });
      if (unresolved) {
        const index = value.indexOf(item);
        const path = `previous_observation.critic_review.visual_relationships[${index}]`;
        if (unresolved.visual_relationship_kind) requirements.push({
          path: `${path}.kind`, operator: 'equals', actual: item.kind, expected: unresolved.visual_relationship_kind,
          code: 'chat_critic_visual_relationship_recheck_required',
          message: `chat_critic_visual_relationship_recheck_required: ${item.id} must recheck the same relationship kind.`,
        });
        const previous = (state.chat_critic_review?.visual_relationships ?? []).find((row: Row) => row.id === item.id);
        requirements.push({ path: `${path}.part_ids`, operator: 'includes', actual: item.part_ids,
          expected: previous?.part_ids ?? unresolved.structural_defect.part_ids,
          code: 'chat_critic_visual_relationship_recheck_required',
          message: `chat_critic_visual_relationship_recheck_required: ${item.id} must recheck the same named parts.`,
        });
      }
    }
  }
  for (const kind of requiredKinds)
    if (!Array.isArray(value) || !value.some(item => item.kind === kind))
      issues.push({ path: 'previous_observation.critic_review.visual_relationships', code: 'chat_critic_visual_relationship_coverage_required',
        message: `chat_critic_visual_relationship_coverage_required: a declared person/animal/furniture needs an explicit ${kind} review on AFTER; use unknown if hidden, or justified not-applicable when the brief deliberately omits it. Do not skip by reporting none.` });
  // A matching structural_defect finding alone is no longer enough to clear a
  // *visual-relationship* failure; the relationship must be reassessed on AFTER.
  for (const problem of Object.values(state.visual_problems ?? {}) as Row[]) {
    if (problem?.status === 'resolved' || !problem?.visual_relationship_kind) continue;
    const defect = problem.structural_defect;
    const priorCriterion = criterionOf[problem.visual_relationship_kind];
    if (!defect || criteria[priorCriterion] !== 'pass') continue;
    if (!value.some(item => item.id === defect.id
      && item.kind === problem.visual_relationship_kind && item.status === 'pass'))
      issues.push({ path: 'previous_observation.critic_review.visual_relationships', code: 'chat_critic_visual_relationship_recheck_required',
        message: `chat_critic_visual_relationship_recheck_required: ${defect.id} needs an explicit pass on the same relation kind and current AFTER, not only a positive finding or tool receipt` });
  }
  issues.push(...unmetTransitionRequirements(requirements));
  if (issues.length) throw new FrameReviewValidationError(issues);
  return structuredClone(value);
}
