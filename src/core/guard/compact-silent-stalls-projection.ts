// @ts-nocheck
// Read-only compact diagnostics for silent stalls in already projected documents.
// Stall detection and next-action decisions remain in SessionStore.
export function projectCompactSilentStalls(documents) {
  const silentStalls = Object.values(documents)
    .filter(doc => doc.silent_stall)
    .map(doc => ({
      document_id: doc.document_id,
      reason: doc.silent_stall_reason,
      seconds_since_last_advancement: doc.seconds_since_last_advancement,
      next_required_action: doc.next_required_action,
    }));
  return silentStalls;
}
