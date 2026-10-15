// @ts-nocheck
// Pure per-operation continuation timeline projection over already selected records.
function textOrUndefined(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function elapsedMs(start, end) {
  const a = Date.parse(start ?? '');
  const b = Date.parse(end ?? '');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
}
export function projectContinuationTimelineOperations(records, documentId, documentIncarnation) {
  const operations = records
    .filter(record => record?.latency && (record.visual || record.latency?.response_ready_at || record.latency?.next_cycle_received_at))
    .map(record => {
      const latency = record.latency ?? {};
      const responseReadyAt = textOrUndefined(latency.response_ready_at);
      const nextGuardAt = textOrUndefined(latency.next_cycle_received_at);
      const continuationTiming = record.continuation_timing ?? {};
      const reviewRequestAt = textOrUndefined(continuationTiming.review_image_request_received_at);
      const reviewReadyAt = continuationTiming.review_image_response_boundary_complete === false
        ? undefined : textOrUndefined(continuationTiming.review_image_result_ready_at);
      const reviewPrefixAt = continuationTiming.review_image_response_boundary_complete === false
        ? textOrUndefined(continuationTiming.review_image_result_ready_at) : undefined;
      const reviewFinishedAt = textOrUndefined(continuationTiming.review_finished_marker_received_at);
      const nextPassReadyAt = textOrUndefined(continuationTiming.next_pass_ready_marker_received_at);
      const operationEndAt = textOrUndefined(latency.photoshop_operation_end_at);
      const previewReadyAt = textOrUndefined(record.preview_attached_at);
      const criticCompleteAt = textOrUndefined(continuationTiming.critic_complete_marker_received_at);
      const criticReviewReceivedAt = textOrUndefined(continuationTiming.critic_review_received_at);
      const guardAcceptedAt = textOrUndefined(latency.guard_accepted_at);
      const photoshopStartAt = textOrUndefined(latency.photoshop_started_at);
      return {
        operation_id: record.id,
        visual: !!record.visual,
        join_key: { document_id: documentId, document_incarnation: documentIncarnation, operation_id: record.id },
        // Cross-operation timeline: the first four milestones belong to this
        // Photoshop pass; critic_complete/next_pass_ready precede its successor.
        milestones: {
          operation_end: operationEndAt ?? null,
          journal_completed: textOrUndefined(record.completed_at) ?? null,
          preview_ready: previewReadyAt ?? null,
          critic_complete: criticCompleteAt ?? null,
          critic_review_received: criticReviewReceivedAt ?? null,
          next_pass_ready: nextPassReadyAt ?? null,
          guard_accepted: guardAcceptedAt ?? null,
          photoshop_start: photoshopStartAt ?? null,
        },
        milestone_intervals_ms: {
          guard_accepted_to_photoshop_start: elapsedMs(guardAcceptedAt, photoshopStartAt),
          photoshop_start_to_operation_end: elapsedMs(photoshopStartAt, operationEndAt),
          operation_end_to_preview_ready: elapsedMs(operationEndAt, previewReadyAt),
          preview_ready_to_critic_complete: elapsedMs(previewReadyAt, criticCompleteAt),
          critic_complete_to_next_pass_ready: elapsedMs(criticCompleteAt, nextPassReadyAt),
        },
        boundary_events: [
          ...(guardAcceptedAt ? [{ kind: 'guard_accepted', at: guardAcceptedAt }] : []),
          ...(photoshopStartAt ? [{ kind: 'photoshop_start', at: photoshopStartAt }] : []),
          ...(operationEndAt ? [{ kind: 'operation_end', at: operationEndAt }] : []),
          ...(previewReadyAt ? [{ kind: 'preview_ready', at: previewReadyAt }] : []),
          ...(responseReadyAt ? [{ kind: 'guard_response_ready', at: responseReadyAt }] : []),
          ...(reviewRequestAt ? [{ kind: 'review_image_request_received', at: reviewRequestAt }] : []),
          ...(reviewReadyAt ? [{ kind: 'review_image_result_ready', at: reviewReadyAt }] : []),
          ...(reviewPrefixAt ? [{ kind: 'review_image_service_prefix_end', at: reviewPrefixAt }] : []),
          ...(reviewFinishedAt ? [{ kind: 'review_finished_marker_received', at: reviewFinishedAt }] : []),
          ...(criticCompleteAt ? [{ kind: 'critic_complete_marker_received', at: criticCompleteAt }] : []),
          ...(criticReviewReceivedAt ? [{ kind: 'critic_review_received', at: criticReviewReceivedAt }] : []),
          ...(nextPassReadyAt ? [{ kind: 'next_pass_ready_marker_received', at: nextPassReadyAt }] : []),
          ...(nextGuardAt ? [{ kind: 'next_guard_continuation_received', at: nextGuardAt }] : []),
        ],
        inter_call_interval: responseReadyAt && nextGuardAt ? {
          start_at: responseReadyAt,
          end_at: nextGuardAt,
          duration_ms: elapsedMs(responseReadyAt, nextGuardAt),
          classification: 'unattributed_until_host_join',
        } : null,
        diagnostic_partition: {
          marker_semantics: 'server_observed_diagnostic_boundaries_not_pure_model_reasoning_time',
          guard_response_to_review_request_ms: latency.guard_response_to_review_request_ms ?? null,
          review_image_service_ms: latency.review_image_service_ms ?? null,
          ...(reviewPrefixAt ? { review_image_service_prefix_ms: latency.review_image_service_prefix_ms ?? null } : {}),
          review_delivery_to_review_finished_marker_ms: latency.review_delivery_to_review_finished_marker_ms ?? null,
          review_finished_to_next_pass_ready_marker_ms: latency.review_finished_to_next_pass_ready_marker_ms ?? null,
          next_pass_ready_marker_to_guard_ms: latency.next_pass_ready_marker_to_guard_ms ?? null,
          review_delivery_to_next_guard_ms: latency.review_delivery_to_next_guard_ms ?? null,
        },
        guard_latency: latency,
      };
    });
  return operations;
}
