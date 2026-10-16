// @ts-nocheck
// Read-only compact critique and unresolved-basis fields from an already stored document state.
// Critic evaluation, Guard admission, and durable evidence stay in SessionStore.
export function projectCompactCritiqueSummary(doc) {
  return {
    last_critique: doc.last_critique ? {
      operation_id: doc.last_critique.operation_id ?? null,
      verdict: doc.last_critique.verdict,
      disposition: doc.last_critique.disposition,
      execution_outcome: doc.last_critique.execution_outcome ?? 'uncertain',
      artistic_outcome: doc.last_critique.artistic_outcome ?? (
        doc.last_critique.target_resolved === 'yes' ? 'resolved'
          : doc.last_critique.target_resolved === 'no' ? 'unresolved'
            : 'uncertain'
      ),
      comparison_metric: doc.last_critique.comparison_metric ?? null,
      target_resolved: doc.last_critique.target_resolved,
      observations: doc.last_critique.observations ?? [],
      primary_mismatch: doc.last_critique.primary_mismatch ?? null,
      uncertainty: doc.last_critique.uncertainty ?? null,
      ...(Array.isArray(doc.last_critique.affected_relations) && doc.last_critique.affected_relations.length
        ? { affected_relations: doc.last_critique.affected_relations }
        : {}),
      ...(Array.isArray(doc.last_critique.affected_qualities) && doc.last_critique.affected_qualities.length
        ? { affected_qualities: doc.last_critique.affected_qualities }
        : {}),
      global_readability: doc.last_critique.global_readability ?? 'unknown',
      goal_assessment: doc.last_critique.goal_assessment ?? {
        status: doc.last_critique.target_resolved === 'yes' ? 'legacy_claimed_resolved' :
          doc.last_critique.target_resolved === 'no' ? 'unresolved' :
            doc.last_critique.target_resolved === 'uncertain' ? 'uncertain' : 'legacy_unknown',
      },
      execution_effect: doc.last_critique.significance?.execution_effect,
    } : null,
    unresolved_visual_basis: doc.last_critique && doc.last_critique.target_resolved !== 'yes' ? {
      operation_id: doc.last_critique.operation_id ?? null,
      status: doc.last_critique.target_resolved === 'uncertain' ? 'uncertain' : 'unresolved',
      observations: doc.last_critique.observations ?? [],
      primary_mismatch: doc.last_critique.primary_mismatch ?? null,
      uncertainty: doc.last_critique.uncertainty ?? null,
    } : null,
  };
}
