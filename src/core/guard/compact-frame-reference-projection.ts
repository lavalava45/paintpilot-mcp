// @ts-nocheck
// Read-only compact status representation of already stored frame and anchor references.
// Frame authority, Photoshop evidence and Guard admission stay in SessionStore.
export function projectCompactFrameReferences(doc) {
  return {
    current_frame: doc.current_frame ? {
      operation_id: doc.current_frame.operation_id,
      sha256: doc.current_frame.sha256,
      path: doc.current_frame.path,
      accepted: !!doc.current_frame.accepted,
      acceptance_scope: doc.current_frame.acceptance_scope ?? null,
      goal_confirmation: doc.current_frame.goal_confirmation ?? null,
    } : null,
    accepted_frame: doc.accepted_frame ? {
      operation_id: doc.accepted_frame.operation_id,
      sha256: doc.accepted_frame.sha256,
      path: doc.accepted_frame.path,
      acceptance_scope: doc.accepted_frame.acceptance_scope ?? 'legacy_unknown',
      goal_confirmation: doc.accepted_frame.goal_confirmation ?? 'legacy_unknown',
    } : null,
    confirmed_goal_frame: doc.confirmed_goal_frame ? {
      operation_id: doc.confirmed_goal_frame.operation_id,
      sha256: doc.confirmed_goal_frame.sha256,
      path: doc.confirmed_goal_frame.path,
      goal_confirmation: doc.confirmed_goal_frame.goal_confirmation ?? 'confirmed_by_visual_verdict',
    } : null,
    primary_artistic_anchor: doc.primary_artistic_anchor ? {
      operation_id: doc.primary_artistic_anchor.operation_id,
      sha256: doc.primary_artistic_anchor.sha256,
      path: doc.primary_artistic_anchor.path,
      rationale: doc.primary_artistic_anchor.rationale,
      directive_id: doc.primary_artistic_anchor.directive_id ?? null,
      promoted_at: doc.primary_artistic_anchor.promoted_at ?? null,
    } : null,
    alternative_artistic_anchors: Array.isArray(doc.alternative_artistic_anchors)
      ? doc.alternative_artistic_anchors.map(anchor => ({
          operation_id: anchor.operation_id,
          sha256: anchor.sha256,
          path: anchor.path,
          rationale: anchor.rationale,
          directive_id: anchor.directive_id ?? null,
          promoted_at: anchor.promoted_at ?? null,
        }))
      : [],
    final_artistic_frame: doc.final_artistic_frame ? {
      operation_id: doc.final_artistic_frame.operation_id,
      sha256: doc.final_artistic_frame.sha256,
      path: doc.final_artistic_frame.path,
      selection: doc.final_artistic_frame.selection ?? null,
      selected_at: doc.final_artistic_frame.selected_at ?? null,
    } : null,
  };
}
