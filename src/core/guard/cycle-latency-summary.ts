// @ts-nocheck
// Pure latency distribution projection over previously selected session records.
function percentile(values, fraction) {
  const sorted = values.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}
export function summarizeCycleLatency(scoped) {
  const records = scoped.filter(record => record?.latency);
  const visualRecords = records.filter(record => record.visual);
  const fields = [
    'inter_call_unattributed_gap_ms',
    'decision_model_gap_ms',
    'guard_preflight_ms',
    'photoshop_dispatch_wall_ms',
    'automatic_checkpoint_wall_ms',
    'recorder_prepare_ms',
    'recorder_finalize_ms',
    'recorder_settle_ms',
    'recorder_stop_ms',
    'recorder_postprocess_ms',
    'photoshop_reported_execution_ms',
    'preview_capture_materialization_ms',
    'guard_response_to_review_request_ms',
    'review_image_service_ms',
    'review_image_service_prefix_ms',
    'review_delivery_to_review_finished_marker_ms',
    'review_finished_to_next_pass_ready_marker_ms',
    'next_pass_ready_marker_to_guard_ms',
    'review_delivery_to_next_guard_ms',
    'visual_evaluation_verdict_gap_ms',
    'report_ack_closure_ms',
    'recovery_reconciliation_ms',
    'guard_cycle_total_ms',
    'semantic_cycle_wall_ms',
  ];
  const summarize = sampleRecords => Object.fromEntries(fields.map(field => {
    const values = sampleRecords.map(record => record.latency?.[field])
      .filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    return [field, {
      samples: values.length,
      median_ms: percentile(values, 0.5),
      p95_ms: percentile(values, 0.95),
    }];
  }));
  return {
    protocol: 'photoshop.guard.cycle_latency_summary.v1',
    operation_samples: records.length,
    visual_operation_samples: visualRecords.length,
    components: summarize(records),
    visual_components: summarize(visualRecords),
  };
}
