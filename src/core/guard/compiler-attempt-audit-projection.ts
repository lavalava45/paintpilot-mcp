// @ts-nocheck
// Read-only compiler attempt diagnostics over an existing audit snapshot.
export function projectCompilerAttemptAudit(compilerAudit) {
  const attempts = Array.isArray(compilerAudit.recent_attempts) ? compilerAudit.recent_attempts : [];
  const reasonCounts = {};
  for (const attempt of attempts) {
    if (attempt?.outcome !== 'rejected') continue;
    const reasons = Array.isArray(attempt.error_codes) && attempt.error_codes.length
      ? attempt.error_codes : ['unspecified_rejection'];
    for (const reason of [...new Set(reasons)]) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  return {
    compiler_attempts: attempts.slice(-16).map(attempt => ({
      at: attempt.at,
      outcome: attempt.outcome,
      ...(attempt.request_key ? { request_key: attempt.request_key } : {}),
      ...(attempt.problem_id ? { problem_id: attempt.problem_id } : {}),
      ...(attempt.operation_id ? { operation_id: attempt.operation_id } : {}),
      ...(attempt.error_codes ? { error_codes: attempt.error_codes } : {}),
      ...(attempt.rejection_fingerprint ? { rejection_fingerprint: attempt.rejection_fingerprint } : {}),
      ...(attempt.corrects_rejection_fingerprint ? { corrects_rejection_fingerprint: attempt.corrects_rejection_fingerprint } : {}),
      ...(attempt.rejected_attempts_before_correction !== undefined
        ? { rejected_attempts_before_correction: attempt.rejected_attempts_before_correction } : {}),
      ...(attempt.correction_wall_ms !== undefined ? { correction_wall_ms: attempt.correction_wall_ms } : {}),
    })),
    guard_rejections: {
      total_rejected_attempts: Number(compilerAudit.rejected_attempts ?? 0),
      recent_rejected_attempts: attempts.filter(attempt => attempt.outcome === 'rejected').length,
      recent_reason_counts: reasonCounts,
      corrections_with_measured_wall_time: attempts.filter(attempt => typeof attempt.correction_wall_ms === 'number').length,
      correction_wall_ms_total_observed: attempts.reduce((sum, attempt) =>
        sum + (typeof attempt.correction_wall_ms === 'number' ? attempt.correction_wall_ms : 0), 0),
      measurement_note: 'Correction wall time is elapsed server time from the first linked rejection to a later accepted/dispatched request, not isolated GPT/Guard processing time. Unkeyed and unresolved retries remain unmeasured.',
    },
  };
}
