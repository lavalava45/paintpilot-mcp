// @ts-nocheck
// Recognition progress metrics over previously scoped operation records.
// Guard authority, record selection and shared evidence helpers remain in SessionStore.
export function projectRecognitionMetrics(records, significanceHasDetectedChange, elapsedMs, reportedToolExecutionMs) {
  const startedAt = records[0].created_at;
  const classifiedVisual = records.filter(r => r.visual && r.verdict);
  const milestoneAt = record => {
    const previewId = record?.verdict?.preview_id;
    const previewRecord = previewId ? records.find(r => r.id === previewId) : undefined;
    return previewRecord?.completed_at ?? record?.completed_at ?? record?.verdict?.at ?? null;
  };
  const firstChange = classifiedVisual.find(r => significanceHasDetectedChange(r.verdict?.significance));
  const firstSubject = classifiedVisual.find(r => r.verdict?.recognition?.subject === 'yes');
  const firstSubjectStyle = classifiedVisual.find(r =>
    r.verdict?.recognition?.subject === 'yes' && r.verdict?.recognition?.style === 'yes'
  );
  const firstChangeAt = firstChange ? milestoneAt(firstChange) : null;
  const firstSubjectAt = firstSubject ? milestoneAt(firstSubject) : null;
  const firstSubjectStyleAt = firstSubjectStyle ? milestoneAt(firstSubjectStyle) : null;
  const destruction = classifiedVisual.filter(r => (r.verdict?.recognition?.lost_features?.length ?? 0) > 0);
  const lost = destruction.flatMap(r => r.verdict.recognition.lost_features);

  let recordedOperationMs = 0;
  let betweenOperationGapMs = 0;
  let reportedExecutionMs = 0;
  let reportedExecutionOperations = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const duration = elapsedMs(record.created_at, record.completed_at);
    if (duration !== null) recordedOperationMs += duration;
    const reported = reportedToolExecutionMs(record);
    if (reported !== null) {
      reportedExecutionMs += reported;
      reportedExecutionOperations++;
    }
    if (i > 0) {
      const priorEnd = records[i - 1].completed_at ?? records[i - 1].created_at;
      const gap = elapsedMs(priorEnd, record.created_at);
      if (gap !== null) betweenOperationGapMs += gap;
    }
  }

  const secondsFromStart = at => {
    const ms = elapsedMs(startedAt, at);
    return ms === null ? null : Math.round(ms / 100) / 10;
  };
  return {
    tracking_started: true,
    tracking_started_at: startedAt,
    first_detected_visual_change_at: firstChangeAt,
    seconds_to_first_detected_visual_change: secondsFromStart(firstChangeAt),
    first_subject_recognizable_at: firstSubjectAt,
    seconds_to_subject_recognizable: secondsFromStart(firstSubjectAt),
    first_subject_and_style_recognizable_at: firstSubjectStyleAt,
    seconds_to_subject_and_style_recognizable: secondsFromStart(firstSubjectStyleAt),
    recognition_feature_destruction_passes: destruction.length,
    recognition_features_lost_count: lost.length,
    recognition_features_lost: [...new Set(lost)],
    recorded_operation_ms: recordedOperationMs,
    between_operation_gap_ms: betweenOperationGapMs,
    reported_tool_execution_ms: reportedExecutionMs,
    reported_tool_execution_operations: reportedExecutionOperations,
  };
}
