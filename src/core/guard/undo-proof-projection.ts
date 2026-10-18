type Row = Record<string, any>;

/**
 * Read-only warning for a pending visual verdict. A counted source pass is
 * only a candidate for later bounded-Undo admission, NOT permission to Undo.
 * Never synthesize a missing history receipt from tool success, pixel delta,
 * number of steps in the request or a saved preview.
 */
export function undoProofForPendingVerdict(
  tool: unknown,
  parsedResultBodies: readonly Row[],
): {
  status: 'candidate-exact' | 'unproven';
  source: 'native-history-receipt' | 'missing-or-inexact-history-receipt';
  owned_history_steps?: number;
  missing_history_step_ids?: string[];
  guidance: string;
} {
  const ownership = parsedResultBodies.map(body => body?.pass_execution?.history_ownership)
    .find(row => row?.protocol === 'photoshop.guard.semantic_pass_history_ownership.v1');
  const count = ownership?.owned_history_steps;
  if (tool === 'photoshop_execute_visual_microplan'
    && ownership?.status === 'exact' && Number.isSafeInteger(count) && count > 0) {
    return {
      status: 'candidate-exact',
      source: 'native-history-receipt',
      owned_history_steps: count,
      guidance: 'History span is recorded, but Undo still requires fresh document, frame, ownership and no-intervening-writer checks. Never replay an uncertain mutation.',
    };
  }
  const missing = Array.isArray(ownership?.actions)
    ? ownership.actions.filter((action: Row) => action?.history_steps === null
      || action?.history_steps === undefined)
      .map((action: Row) => action?.step_id)
      .filter((id: unknown): id is string => typeof id === 'string')
    : [];
  return {
    status: 'unproven',
    source: 'missing-or-inexact-history-receipt',
    ...(missing.length ? { missing_history_step_ids: missing } : {}),
    guidance: 'Do NOT use disposition=rollback or issue Photoshop Undo for this unproven pass. Review the exact frame and use a truthful accept/correct disposition; if pixels need revision, correct the pinned owned layer with a new guarded operation or use independently verified accepted-anchor restoration.',
  };
}
