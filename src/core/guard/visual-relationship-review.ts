/** Exact-image Critic relationship assessments, NOT geometry solver output or a
 * machine-vision classifier. The host observes delivered pixels; Guard validates
 * evidence shape and retains failed named structural relations. */
type Row = Record<string, any>;

export const VISUAL_RELATIONSHIP_REVIEW_VERSION = 'visual-relationships-v1';
export const VISUAL_RELATION_KINDS = ['anatomy', 'interaction', 'support', 'spatial', 'none'] as const;
export const VISUAL_RELATION_STATUSES = ['pass', 'fail', 'unknown', 'not-applicable'] as const;
export const VISUAL_RELATION_SCHEMA = {
  type: 'array', minItems: 1, maxItems: 8,
  description: 'Assess salient visible part-to-part relations on the ALREADY delivered AFTER frame. For figures inspect head/torso; for interaction inspect hand/object grip; for placed objects inspect support/contact. An abstract/cropped scene may justify not-applicable. This is a pixel-observation report, never proof from solved coordinates, shadows alone, layer labels or successful tools. Every fail needs a matching named structural_defect finding, and a previously failed relation needs an explicit recheck before pass.',
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

const criterionOf: Row = {
  anatomy: 'form_proportions', interaction: 'contact_and_protection',
  support: 'contact_and_protection', spatial: 'composition_context',
};
const structuralKindOf: Row = {
  anatomy: 'relative-size', interaction: 'attachment',
  support: 'support-contact', spatial: 'composition-relation',
};
const exactKeys = (value: Row, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const validText = (value: unknown, min: number) => typeof value === 'string'
  && value.trim().length >= min && value.length <= 400;

/** Semantic scene declarations indicate which categories MUST be examined.
 * They do not supply correct geometry, anatomy or pixel evidence. */
export function requiredVisualRelationKinds(state: Row): string[] {
  const required = new Set<string>();
  for (const object of state.scene_ownership_plan?.objects ?? []) {
    if (object?.kind !== 'compound-object') continue;
    if (object.subject_kind === 'person' || object.subject_kind === 'animal') {
      required.add('anatomy');
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
    if ((item.status === 'fail' || item.status === 'unknown') && criteria[criterion] === 'pass')
      throw new Error(`chat_critic_visual_relationship_criteria_conflict: ${item.id} is ${item.status}; ${criterion} cannot be pass`);
    if (item.status === 'fail') {
      const linked = findings.find(finding => finding.criterion === criterion && finding.structural_defect?.id === item.id);
      if (!linked || linked.structural_defect.kind !== structuralKindOf[item.kind]
        || !item.part_ids.every((part: string) => linked.structural_defect.part_ids?.includes(part))
        || !linked.structural_defect.relation_ids?.includes(item.id))
        throw new Error(`chat_critic_visual_relationship_defect_required: ${item.id} failed on visible pixels; add findings[].structural_defect with matching id, generic relation kind, named parts and relation_ids; geometry success is not a recheck`);
    }
    if (item.status === 'pass') {
      const unresolved = Object.values(state.visual_problems ?? {}).some((problem: any) =>
        problem?.structural_defect?.id === item.id && problem.status !== 'resolved');
      if (unresolved && !findings.some(finding => finding.criterion === criterion
        && finding.structural_defect?.id === item.id))
        throw new Error(`chat_critic_visual_relationship_recheck_required: ${item.id} was unresolved; a current-frame pass must explicitly recheck its stable structural_defect in findings[]`);
    }
  }
  for (const kind of requiredKinds)
    if (!Array.isArray(value) || !value.some(item => item.kind === kind))
      throw new Error(`chat_critic_visual_relationship_coverage_required: a declared person/animal/furniture needs an explicit ${kind} review on AFTER; use unknown if hidden, or justified not-applicable when the brief deliberately omits it. Do not skip by reporting none.`);
  // A matching structural_defect finding alone is no longer enough to clear a
  // *visual-relationship* failure; the relationship must be reassessed on AFTER.
  for (const problem of Object.values(state.visual_problems ?? {}) as Row[]) {
    if (problem?.status === 'resolved' || !problem?.visual_relationship_kind) continue;
    const defect = problem.structural_defect;
    const priorCriterion = criterionOf[problem.visual_relationship_kind];
    if (!defect || criteria[priorCriterion] !== 'pass') continue;
    if (!value.some(item => item.id === defect.id
      && item.kind === problem.visual_relationship_kind && item.status === 'pass'))
      throw new Error(`chat_critic_visual_relationship_recheck_required: ${defect.id} needs an explicit pass on the same relation kind and current AFTER, not only a positive finding or tool receipt`);
  }
  return structuredClone(value);
}
