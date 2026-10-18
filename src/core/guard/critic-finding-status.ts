type Review = {
  criteria?: Record<string, string>;
  visual_relationships?: Array<{ id: string; status: string }>;
};
type Finding = { criterion?: string; structural_defect?: { id: string }; next_change?: string };
export const CRITIC_FINDING_STATUS_GUIDANCE = 'A criterion may remain fail for another deficit while a named relationship passes. Recheck the same structural_defect in findings and the same visual_relationships id/kind/parts with status=pass to resolve only that defect; preserve separate failed findings.';

/** A criterion summarizes several defects. Its aggregate failure must not
 * override an explicit exact-frame recheck of one named relationship. Only
 * validated matching reports may use this projection; prose is never parsed. */
export function criticFindingStatus(review: Review, finding: Finding): string {
  const id = finding.structural_defect?.id;
  const relation = id && review.visual_relationships?.find(row => row.id === id);
  return relation ? (relation.status === 'not-applicable' ? 'unknown' : relation.status)
    : review.criteria?.[finding.criterion ?? ''] ?? 'unknown';
}

/** Resolved named problems are historical evidence, never a pending correction
 * merely because a legacy findings cache still contains the old description. */
export function activeCriticFindings<T extends Finding>(state: {
  chat_critic_findings?: T[];
  visual_problems?: Record<string, { status?: string }>;
}): T[] {
  return (state.chat_critic_findings ?? []).filter(finding => !finding.structural_defect
    || state.visual_problems?.[finding.structural_defect.id]?.status !== 'resolved');
}
