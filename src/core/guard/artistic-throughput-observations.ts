// @ts-nocheck
// Read-only timings and observed outcomes over already selected operation records.
// Guard admission and throughput journal/accounting-integrity policy remain in SessionStore.
export function projectArtisticThroughputObservations(records) {
  const sumLatency = field => records.reduce((sum, record) => {
    const value = Number(record.latency?.[field]);
    return Number.isFinite(value) && value >= 0 ? sum + value : sum;
  }, 0);
  const guardBookkeepingMs = sumLatency('guard_preflight_ms')
    + sumLatency('report_ack_closure_ms')
    + sumLatency('recovery_reconciliation_ms');
  const photoshopDispatchMs = sumLatency('photoshop_dispatch_wall_ms');
  const visualEvaluationMs = sumLatency('visual_evaluation_verdict_gap_ms');
  const recorderOverheadMs = sumLatency('recorder_prepare_ms') + sumLatency('recorder_finalize_ms');
  const checkpointRecords = records.filter(record => typeof record.latency?.automatic_checkpoint_wall_ms === 'number');
  const checkpointWallMs = checkpointRecords.reduce((sum, record) => sum + record.latency.automatic_checkpoint_wall_ms, 0);
  const checkpointDispatchMs = checkpointRecords.reduce((sum, record) => sum + (record.latency.photoshop_dispatch_wall_ms ?? 0), 0);
  const measuredMs = guardBookkeepingMs + photoshopDispatchMs + visualEvaluationMs
    + recorderOverheadMs + Math.max(0, checkpointWallMs - checkpointDispatchMs);
  const regressions = records.filter(record => record.verdict?.verdict === 'regression').length;
  const recoveryRecords = records.filter(record =>
    record.phase !== 'completed'
    || record.resolved?.outcome === 'partial'
    || record.resolved?.outcome === 'not-executed'
  ).length;
  const evidenceFailures = records.filter(record =>
    record.review_evidence?.status === 'artifact_missing_or_corrupt'
    || record.visual_review?.delivery?.delivery_complete === false
  ).length;
  return {
    timing: {
      guard_bookkeeping_ms_observed: guardBookkeepingMs,
      photoshop_dispatch_ms_observed: photoshopDispatchMs,
      recorder_overhead_ms_observed: recorderOverheadMs,
      automatic_checkpoint_wall_ms_observed: checkpointWallMs,
      automatic_checkpoint_dispatch_ms_observed: checkpointDispatchMs,
      visual_evaluation_gap_ms_observed: visualEvaluationMs,
      guard_bookkeeping_share_of_measured_time: measuredMs > 0 ? Number((guardBookkeepingMs / measuredMs).toFixed(4)) : null,
      note: 'Recorder phase timings are children of recorder overhead; checkpoint dispatch is already in Photoshop dispatch. Do not sum these overlaps. Visual-evaluation gap remains externally unattributed host/model/user time; only measured components participate in this diagnostic share.',
    },
    outcomes: {
      regression_passes: regressions,
      recovery_or_uncertain_records: recoveryRecords,
      evidence_integrity_failures: evidenceFailures,
    },
  };
}
