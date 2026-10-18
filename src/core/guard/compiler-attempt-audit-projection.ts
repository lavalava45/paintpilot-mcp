// @ts-nocheck
// Read-only compiler attempt diagnostics over an existing audit snapshot.
export function projectCompilerAttemptAudit(compilerAudit) {
  const attempts = Array.isArray(compilerAudit.recent_attempts) ? compilerAudit.recent_attempts : [];
  const lastWithProvenance = attempts.findLast(attempt =>
    attempt?.outcome === 'rejected'
    && attempt?.contract_error_provenance?.protocol === 'paintpilot.contract_error_provenance.v1');
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
    // Compact, read-only access to last *proven* attribution. The full
    // bounded hash witnesses remain on the rejection and in the audit journal;
    // they do not get repeated in every hot-loop status projection.
    ...(lastWithProvenance ? {
      last_rejection_origin: {
        protocol: 'paintpilot.contract_error_provenance.v1',
        request_key: lastWithProvenance.request_key ?? null,
        rejection_fingerprint: lastWithProvenance.rejection_fingerprint ?? null,
        instruction_delivery: 'not-observed',
        findings: lastWithProvenance.contract_error_provenance.findings.slice(0, 6).map(item => ({
          code: item.code, path: item.path, finding: item.finding, certainty: item.certainty,
          ...(item.state_binding ? { state_binding: item.state_binding } : {}),
        })),
        remaining_count: Math.max(0, lastWithProvenance.contract_error_provenance.findings.length - 6)
          + (lastWithProvenance.contract_error_provenance.remaining_count ?? 0),
      },
    } : {}),
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
