#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { benchmarkArchiveEvidence } from './benchmark-throughput-archive.mjs';

const GENERATED_START = '<!-- BEGIN GENERATED PAINTING CYCLE BENCHMARK -->';
const GENERATED_END = '<!-- END GENERATED PAINTING CYCLE BENCHMARK -->';
export const PROCESS_DIR_WARNING =
  'Process-directory run selection is intentionally unavailable: operation journals do not persist a durable process_dir run identity, so a reused process directory cannot safely isolate one benchmark. Use --operation-prefix.';
const KEYED_THROUGHPUT_TAIL_MS = 1000;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function valuesStat(values) {
  const finiteValues = values.map(finite).filter(value => value !== null);
  return { n: finiteValues.length, median: percentile(finiteValues, 50), p95: percentile(finiteValues, 95) };
}

function stat(rows, key) {
  return valuesStat(rows.map(row => row.latency?.[key]));
}

function fmt(value) {
  return value === null || value === undefined ? 'unknown' : String(Math.round(value));
}

function fmtRatio(value) {
  return value === null || value === undefined ? 'unknown' : value.toFixed(3);
}

function fmtPercent(value) {
  return value === null || value === undefined ? 'unknown' : `${(value * 100).toFixed(2)}%`;
}

function parseTimestamp(value) {
  const parsed = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedMs(start, end) {
  const a = parseTimestamp(start);
  const b = parseTimestamp(end);
  return a !== null && b !== null && b >= a ? b - a : null;
}

function earliestIso(values) {
  const parsed = values
    .map(value => ({ value, at: parseTimestamp(value) }))
    .filter(item => item.at !== null)
    .sort((a, b) => a.at - b.at);
  return parsed[0]?.value ?? null;
}

function latestIso(values) {
  const parsed = values
    .map(value => ({ value, at: parseTimestamp(value) }))
    .filter(item => item.at !== null)
    .sort((a, b) => b.at - a.at);
  return parsed[0]?.value ?? null;
}

function recordStartAt(record) {
  return earliestIso([record?.latency?.cycle_received_at, record?.created_at]);
}

function recordEndAt(record) {
  return latestIso([record?.completed_at, record?.latency?.response_ready_at, record?.created_at]);
}

function dominant(rows) {
  const candidates = [
    ['guard_preflight_ms', 'Guard preflight'],
    ['photoshop_dispatch_wall_ms', 'Photoshop dispatch + embedded preview'],
    ['visual_evaluation_verdict_gap_ms', 'unattributed host/model/visual-evaluation gap'],
    ['report_ack_closure_ms', 'closure'],
    ['recovery_reconciliation_ms', 'recovery'],
  ].map(([key, label]) => ({ key, label, median: stat(rows, key).median }))
    .filter(item => item.median !== null)
    .sort((a, b) => b.median - a.median);
  return candidates[0] ?? { label: 'unknown', median: null };
}

function operationDocumentId(record) {
  for (const candidate of [record?.args?.document_id, record?.document_target?.id]) {
    const id = Number(candidate);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const aSequence = Number(a?.sequence);
    const bSequence = Number(b?.sequence);
    if (Number.isFinite(aSequence) && Number.isFinite(bSequence) && aSequence !== bSequence) {
      return aSequence - bSequence;
    }
    const aAt = parseTimestamp(recordStartAt(a)) ?? 0;
    const bAt = parseTimestamp(recordStartAt(b)) ?? 0;
    return aAt - bAt || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
}

export function parseCliArgs(argv = process.argv.slice(2), root = process.cwd()) {
  let outputArgument = null;
  let operationPrefix = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--operation-prefix') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--operation-prefix requires a non-empty value');
      operationPrefix = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--operation-prefix=')) {
      operationPrefix = argument.slice('--operation-prefix='.length);
      if (!operationPrefix) throw new Error('--operation-prefix requires a non-empty value');
      continue;
    }
    if (argument === '--process-dir' || argument.startsWith('--process-dir=')) {
      throw new Error(PROCESS_DIR_WARNING);
    }
    if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
    if (outputArgument) throw new Error(`Unexpected extra positional argument: ${argument}`);
    outputArgument = argument;
  }

  const defaultOutputPath = path.join(root, 'docs', 'performance-and-latency.md');
  const outputPath = outputArgument ? path.resolve(root, outputArgument) : defaultOutputPath;
  if (operationPrefix && !outputArgument) {
    throw new Error('--operation-prefix requires an explicit positional output path so run-scoped output cannot replace the maintained global benchmark by accident');
  }
  if (operationPrefix && outputPath === defaultOutputPath) {
    throw new Error('--operation-prefix requires a standalone output path; docs/performance-and-latency.md is reserved for the global benchmark');
  }

  return {
    root,
    outputPath,
    embeddedOutput: outputPath === defaultOutputPath,
    operationPrefix,
  };
}

export function loadOperationJournals(operationsDir) {
  if (!existsSync(operationsDir)) return [];
  const records = [];
  for (const name of readdirSync(operationsDir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const record = JSON.parse(readFileSync(path.join(operationsDir, name), 'utf8'));
      if (record && typeof record === 'object') records.push(record);
    } catch {
      // Historical runtime folders may contain partially written/corrupt diagnostics. Skip them.
    }
  }
  return sortRecords(records);
}

function runBoundaries(records) {
  const startAt = earliestIso(records.map(recordStartAt));
  const endAt = latestIso(records.map(recordEndAt));
  return {
    start_at: startAt,
    end_at: endAt,
    wall_ms: elapsedMs(startAt, endAt),
    rule: 'earliest selected journal cycle_received_at/created_at through latest selected journal completed_at/response_ready_at; next_cycle_received_at is excluded because a later unrelated call may close that interval',
  };
}

function processArtifactPaths(record) {
  const paths = [
    record?.preview?.project_path,
    record?.report?.commentary_path,
    record?.checkpoint,
    record?.args?.path,
  ];
  for (const entry of record?.visual_delivery?.delivered ?? []) {
    paths.push(entry?.project_path, entry?.commentary_path);
  }
  for (const key of ['previous_review', 'previous_preview']) {
    paths.push(record?.[key]?.project_path, record?.[key]?.commentary_path);
  }
  return paths.filter(value => typeof value === 'string' && value.trim());
}

function pathIsInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function statePathForArtifact(root, artifactPath) {
  const processesRoot = path.join(root, 'processes');
  const resolved = path.isAbsolute(artifactPath) ? path.resolve(artifactPath) : path.resolve(root, artifactPath);
  if (!pathIsInside(processesRoot, resolved)) return null;
  let current = path.dirname(resolved);
  while (pathIsInside(processesRoot, current)) {
    const candidate = path.join(current, 'painting-state.json');
    if (existsSync(candidate)) return candidate;
    if (path.resolve(current) === path.resolve(processesRoot)) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function discoverRunState({ root, selectedRecords, operationPrefix }) {
  const candidatePaths = new Set();
  for (const record of selectedRecords) {
    for (const artifactPath of processArtifactPaths(record)) {
      const statePath = statePathForArtifact(root, artifactPath);
      if (statePath) candidatePaths.add(path.resolve(statePath));
    }
  }
  if (candidatePaths.size !== 1) {
    return {
      state: null,
      path: null,
      warning: candidatePaths.size === 0
        ? 'No uniquely provable mirrored painting-state.json was linked from selected journal artifact paths; run-scoped round-trip counters are unavailable.'
        : `Selected journals link to ${candidatePaths.size} process-state mirrors; run-scoped round-trip counters are unavailable because the run identity is ambiguous.`,
    };
  }

  const statePath = [...candidatePaths][0];
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return { state: null, path: statePath, warning: `Linked process state is unreadable: ${statePath}` };
  }

  const documentIds = [...new Set(selectedRecords.map(operationDocumentId).filter(id => id !== null))];
  if (documentIds.length !== 1 || Number(state?.document_id) !== documentIds[0]) {
    return { state: null, path: statePath, warning: 'Linked process state did not match the single selected journal document id; run-scoped round-trip counters are unavailable.' };
  }
  if (typeof state?.process_dir === 'string') {
    const expectedDir = path.resolve(root, ...state.process_dir.split('/'));
    if (path.resolve(path.dirname(statePath)) !== expectedDir) {
      return { state: null, path: statePath, warning: 'Linked process state path does not match its own process_dir; run-scoped round-trip counters are unavailable.' };
    }
  }
  const bootstrapId = state?.document_instance?.bootstrap_operation_id;
  if (typeof bootstrapId !== 'string' || !bootstrapId.startsWith(operationPrefix)) {
    return { state: null, path: statePath, warning: 'Linked process state bootstrap operation does not match the selected operation prefix; run-scoped round-trip counters are unavailable.' };
  }

  return { state, path: statePath, warning: null };
}

function scopedThroughput({ state, operationPrefix, boundaries, selectedOperationIds, archiveEvidence = null }) {
  const rawEvents = archiveEvidence?.integrity === 'consistent'
    ? archiveEvidence.events
    : Array.isArray(state?.artistic_throughput?.recent_events)
    ? state.artistic_throughput.recent_events
    : null;
  if (!rawEvents || !boundaries.start_at || !boundaries.end_at) {
    return {
      available: false,
      complete: false,
      events: [],
      model_visible_guard_round_trips: null,
      semantic_dispatch_round_trips: null,
      bookkeeping_only_round_trips: null,
      recovery_only_round_trips: null,
      rejected_before_dispatch_round_trips: null,
      semantic_artistic_actions_dispatched: null,
      auto_repair_count: null,
      auto_split_count: null,
      model_semantic_ambiguity_count: null,
      preflight_rejection_exposed_to_model_count: null,
      deterministic_violations_encountered_count: null,
      deterministic_violations_repaired_count: null,
      deterministic_violations_unresolved_count: null,
      unkeyed_time_window_events: null,
      undated_potential_events: null,
      warning: 'Run-scoped artistic-throughput events are unavailable.',
    };
  }

  const startMs = parseTimestamp(boundaries.start_at);
  const endMs = parseTimestamp(boundaries.end_at);
  const datedEvents = rawEvents
    .map(event => ({ ...event, _at_ms: parseTimestamp(event?.at) }))
    .filter(event => event._at_ms !== null)
    .sort((a, b) => a._at_ms - b._at_ms);
  // An empty mirror is not evidence of zero host calls for a journaled run:
  // telemetry may have been lost during interruption or state replacement.
  const emptyRetainedWindow = rawEvents.length === 0;
  // The store retains at most 64 events. At equal millisecond precision an
  // evicted event may share the oldest retained timestamp with the run start.
  // Only an event strictly BEFORE start establishes coverage of that boundary.
  const retainedWindowMayBeTruncated = archiveEvidence?.integrity !== 'consistent' && rawEvents.length >= 64
    && (datedEvents.length === 0 || datedEvents[0]._at_ms >= startMs);
  if (emptyRetainedWindow || retainedWindowMayBeTruncated) {
    return {
      available: true,
      complete: false,
      events: [],
      model_visible_guard_round_trips: null,
      semantic_dispatch_round_trips: null,
      bookkeeping_only_round_trips: null,
      recovery_only_round_trips: null,
      rejected_before_dispatch_round_trips: null,
      semantic_artistic_actions_dispatched: null,
      auto_repair_count: null,
      auto_split_count: null,
      model_semantic_ambiguity_count: null,
      preflight_rejection_exposed_to_model_count: null,
      deterministic_violations_encountered_count: null,
      deterministic_violations_repaired_count: null,
      deterministic_violations_unresolved_count: null,
      unkeyed_time_window_events: null,
      undated_potential_events: null,
      warning: emptyRetainedWindow
        ? 'The linked run has no retained artistic_throughput.recent_events. An empty mirror cannot prove zero model-visible calls; exact run-scoped counters are unavailable.'
        : 'The retained artistic_throughput.recent_events window is capped at 64 and does not establish coverage before the selected run start; exact run-scoped counters are unavailable rather than being reported as zero.',
    };
  }

  // A timestamp and a matching process-state mirror do not prove which run
  // emitted an unkeyed event. In particular, overlapping chats can share the
  // same document/process directory. Never assign those events to this run.
  const unkeyedWindowEvents = datedEvents.filter(event =>
    (typeof event.operation_id !== 'string' || !event.operation_id.trim())
      && event._at_ms >= startMs && event._at_ms <= endMs
  );
  // Missing or malformed timestamps are not evidence that an event occurred
  // outside the selected run. Owned and unkeyed events could fall anywhere in
  // its window; dropping them would silently undercount exact round trips.
  // A foreign operation id is sufficient to exclude an undated event.
  const undatedPotentialEvents = rawEvents.filter(event => {
    if (parseTimestamp(event?.at) !== null) return false;
    const operationId = typeof event?.operation_id === 'string' ? event.operation_id.trim() : '';
    return !operationId || operationId.startsWith(operationPrefix);
  });
  const events = datedEvents.filter(event => {
    if (event._at_ms < startMs) return false;
    const operationId = typeof event.operation_id === 'string' ? event.operation_id.trim() : '';
    if (!operationId || !operationId.startsWith(operationPrefix)) return false;
    if (event._at_ms <= endMs) return true;
    return selectedOperationIds.has(operationId) && event._at_ms <= endMs + KEYED_THROUGHPUT_TAIL_MS;
  });
  if (unkeyedWindowEvents.length || undatedPotentialEvents.length) {
    return {
      available: true,
      complete: false,
      events,
      model_visible_guard_round_trips: null,
      semantic_dispatch_round_trips: null,
      bookkeeping_only_round_trips: null,
      recovery_only_round_trips: null,
      rejected_before_dispatch_round_trips: null,
      semantic_artistic_actions_dispatched: null,
      auto_repair_count: null,
      auto_split_count: null,
      model_semantic_ambiguity_count: null,
      preflight_rejection_exposed_to_model_count: null,
      deterministic_violations_encountered_count: null,
      deterministic_violations_repaired_count: null,
      deterministic_violations_unresolved_count: null,
      unkeyed_time_window_events: unkeyedWindowEvents.length,
      undated_potential_events: undatedPotentialEvents.length,
      warning: `${unkeyedWindowEvents.length} throughput event(s) within the journal window lack operation_id; ${undatedPotentialEvents.length} potentially owned event(s) lack valid timestamps. Exact run ownership is unproven or temporal coverage is missing, so round-trip and repair counters are unknown; dated keyed events are retained only as diagnostic evidence.`,
    };
  }
  const modelVisible = events.filter(event => event.model_visible !== false);
  const countKind = kind => modelVisible.filter(event => event.kind === kind).length;
  const measuredCount = (event, field) => Number.isSafeInteger(event[field]) && event[field] >= 0;
  const sumOptionalCount = field => {
    // One measured event cannot prove the total across the entire run.
    // Missing or malformed values are unknown, not implicit zero. An empty
    // fully covered run is the only case where absence itself proves zero.
    if (modelVisible.some(event => !measuredCount(event, field))) return null;
    return modelVisible.reduce((sum, event) => sum + event[field], 0);
  };
  // This counts dispatched actions, including calls not exposed to the model.
  // Unlike a best-effort diagnostic subtotal, an exact run count cannot treat
  // missing, coerced or invalid measurements as zero. Guard emits integer
  // counts; reject legacy partial mirrors and unsafe aggregate overflow.
  const semanticActions = events.reduce((sum, event) => {
    const value = event.semantic_actions;
    if (sum === null || !Number.isSafeInteger(value) || value < 0) return null;
    const next = sum + value;
    return Number.isSafeInteger(next) ? next : null;
  }, 0);

  const keyedTailEvents = modelVisible.filter(event =>
    typeof event.operation_id === 'string' && event._at_ms > endMs
  );
  const warnings = [];
  const optionalFields = [
    'auto_repair_count', 'auto_split_count', 'model_semantic_ambiguity_count',
    'preflight_rejection_exposed_to_model_count', 'deterministic_violations_encountered_count',
    'deterministic_violations_repaired_count', 'deterministic_violations_unresolved_count',
  ];
  const incompleteFields = optionalFields.filter(field => modelVisible.some(event => !measuredCount(event, field)));
  if (incompleteFields.length) {
    warnings.push(`Exact optional throughput totals are unknown for incompletely measured event fields: ${incompleteFields.join(', ')}.`);
  }
  if (semanticActions === null) {
    warnings.push('Exact semantic_actions total is unknown: at least one selected event has a missing, invalid or unsafe action count.');
  }
  if (keyedTailEvents.length) {
    warnings.push(`Included ${keyedTailEvents.length} selected-operation throughput event(s) within ${KEYED_THROUGHPUT_TAIL_MS} ms after the journal-derived run end to account for Guard state-persistence ordering; run wall time itself remains journal-derived.`);
  }
  return {
    available: true,
    complete: true,
    events,
    model_visible_guard_round_trips: modelVisible.length,
    semantic_dispatch_round_trips: countKind('semantic-dispatch'),
    bookkeeping_only_round_trips: countKind('bookkeeping'),
    recovery_only_round_trips: countKind('recovery'),
    rejected_before_dispatch_round_trips: countKind('rejected'),
    semantic_artistic_actions_dispatched: semanticActions,
    auto_repair_count: sumOptionalCount('auto_repair_count'),
    auto_split_count: sumOptionalCount('auto_split_count'),
    model_semantic_ambiguity_count: sumOptionalCount('model_semantic_ambiguity_count'),
    preflight_rejection_exposed_to_model_count: sumOptionalCount('preflight_rejection_exposed_to_model_count'),
    deterministic_violations_encountered_count: sumOptionalCount('deterministic_violations_encountered_count'),
    deterministic_violations_repaired_count: sumOptionalCount('deterministic_violations_repaired_count'),
    deterministic_violations_unresolved_count: sumOptionalCount('deterministic_violations_unresolved_count'),
    unkeyed_time_window_events: 0,
    undated_potential_events: 0,
    warning: warnings.length ? warnings.join(' ') : null,
  };
}

function passEventCounts(visualRows, throughput, runStartAt) {
  if (!throughput.complete) return visualRows.map(() => ({ rejected: null, recovery: null }));
  const visibleEvents = throughput.events.filter(event => event.model_visible !== false);
  return visualRows.map((row, index) => {
    const startAt = index === 0
      ? runStartAt
      : latestIso([
          visualRows[index - 1]?.latency?.response_ready_at,
          visualRows[index - 1]?.completed_at,
        ]);
    const endAt = recordStartAt(row);
    const startMs = parseTimestamp(startAt);
    const endMs = parseTimestamp(endAt);
    if (startMs === null || endMs === null) return { rejected: null, recovery: null };
    const events = visibleEvents.filter(event => event._at_ms >= startMs && event._at_ms <= endMs);
    return {
      rejected: events.filter(event => event.kind === 'rejected').length,
      recovery: events.filter(event => event.kind === 'recovery').length,
    };
  });
}

function timingValue(record, field, startField, endField) {
  const direct = finite(record?.latency?.[field]);
  if (direct !== null) return direct;
  const start = record?.[startField] ?? record?.latency?.[startField];
  const end = record?.[endField] ?? record?.latency?.[endField];
  return elapsedMs(start, end);
}

export function scopedDeterministicRepairAccounting(events) {
  const result = { complete: true, scope: 'next_operation', encountered: 0, repaired: 0, unresolved: 0 };
  for (const event of events) {
    if (event.model_visible === false) continue;
    const rows = event.violation_accounting;
    if (!Array.isArray(rows)) {
      if (event.deterministic_violations_encountered_count !== 0
        && (['semantic-dispatch', 'rejected'].includes(event.kind)
          || event.deterministic_violations_encountered_count !== undefined)) result.complete = false;
      continue;
    }
    if (rows.length && typeof event.operation_id !== 'string') { result.complete = false; continue; }
    for (const row of rows) {
      if (!['cycle', 'finalization', 'next_operation'].includes(row?.scope)
        || !['AUTO_NORMALIZE', 'AUTO_PATCH', 'SPLIT_DEFER', 'MODEL_SEMANTIC_DECISION', 'SYSTEMIC_FAILURE'].includes(row?.repair_class)
        || typeof row?.code !== 'string'
        || !['encountered', 'repaired', 'unresolved'].every(key => Number.isSafeInteger(row[key]) && row[key] >= 0)
        || row.repaired + row.unresolved !== row.encountered) { result.complete = false; continue; }
      if (row.scope !== 'next_operation'
        || !['AUTO_NORMALIZE', 'AUTO_PATCH', 'SPLIT_DEFER'].includes(row.repair_class)) continue;
      result.encountered += row.encountered;
      result.repaired += row.repaired;
      result.unresolved += row.unresolved;
    }
  }
  return { ...result, percent: result.complete && result.encountered > 0 ? result.repaired / result.encountered : null };
}

function hotLoopPasses(visualRows, throughput, boundaries) {
  const eventCounts = passEventCounts(visualRows, throughput, boundaries.start_at);
  return visualRows.map((record, index) => {
    const continuation = record?.continuation_timing ?? {};
    const intentReceivedAt = record?.intent_received_at ?? record?.latency?.intent_received_at ?? null;
    const compiledAt = record?.compiled_at ?? record?.latency?.compiled_at ?? null;
    const validatedAt = record?.validated_at ?? record?.latency?.validated_at ?? null;
    const repairedAt = record?.repaired_at ?? record?.latency?.repaired_at ?? null;
    const dispatchStartedAt = record?.dispatch_started_at ?? record?.latency?.dispatch_started_at ?? null;
    const artisticDecisionDirect = elapsedMs(continuation.review_finished_marker_received_at, intentReceivedAt);
    const artisticDecisionProxy = finite(record?.latency?.review_finished_to_next_pass_ready_marker_ms);
    const readyAt = repairedAt ?? validatedAt ?? compiledAt;
    return {
      pass: index + 1,
      operation_id: record.id ?? `pass-${index + 1}`,
      review_delivery_ms: finite(record?.latency?.review_image_service_ms),
      visual_review_ms: finite(record?.latency?.review_delivery_to_review_finished_marker_ms),
      artistic_decision_ms: artisticDecisionDirect ?? artisticDecisionProxy,
      artistic_decision_source: artisticDecisionDirect !== null ? 'PaintingIntent intent_received_at' : artisticDecisionProxy !== null ? 'next_pass_ready diagnostic proxy' : 'unknown',
      intent_compile_ms: timingValue(record, 'painting_intent_compile_ms', 'intent_received_at', 'compiled_at'),
      durable_state_injection_ms: finite(record?.latency?.durable_state_injection_ms),
      local_validation_ms: finite(record?.latency?.local_validation_ms),
      auto_repair_ms: timingValue(record, 'auto_repair_ms', 'validated_at', 'repaired_at'),
      auto_repair_count: finite(record?.latency?.auto_repair_count),
      auto_split_count: finite(record?.latency?.auto_split_count),
      model_semantic_ambiguity_count: finite(record?.latency?.model_semantic_ambiguity_count),
      preflight_rejection_exposed_to_model_count: finite(record?.latency?.preflight_rejection_exposed_to_model_count),
      next_pass_ready_to_guard_ms: finite(record?.latency?.next_pass_ready_marker_to_guard_ms),
      ready_to_dispatch_ms: elapsedMs(readyAt, dispatchStartedAt),
      intent_to_dispatch_ms: elapsedMs(intentReceivedAt, dispatchStartedAt),
      guard_ms: finite(record?.latency?.guard_preflight_ms),
      photoshop_ms: finite(record?.latency?.photoshop_dispatch_wall_ms),
      semantic_wall_ms: finite(record?.latency?.semantic_cycle_wall_ms),
      model_visible_rejection_count: eventCounts[index].rejected,
      recovery_only_count: eventCounts[index].recovery,
    };
  });
}

function largestObservedStall(visualRows) {
  const components = [
    ['guard_response_to_review_request_ms', 'Guard response → review-image request'],
    ['review_image_service_ms', 'review-image service'],
    ['review_delivery_to_review_finished_marker_ms', 'review delivery → review-finished marker'],
    ['review_finished_to_next_pass_ready_marker_ms', 'review-finished → next-pass-ready marker'],
    ['next_pass_ready_marker_to_guard_ms', 'next-pass-ready marker → next Guard call'],
    ['guard_preflight_ms', 'Guard preflight'],
    ['photoshop_dispatch_wall_ms', 'Photoshop dispatch + embedded preview'],
    ['report_ack_closure_ms', 'closure'],
    ['recovery_reconciliation_ms', 'recovery reconciliation'],
  ];
  const candidates = [];
  for (const row of visualRows) {
    for (const [field, label] of components) {
      const ms = finite(row?.latency?.[field]);
      if (ms !== null) candidates.push({ operation_id: row.id ?? null, field, label, ms });
    }
    if (
      finite(row?.latency?.review_delivery_to_review_finished_marker_ms) === null
      && finite(row?.latency?.review_finished_to_next_pass_ready_marker_ms) === null
    ) {
      const ms = finite(row?.latency?.visual_evaluation_verdict_gap_ms);
      if (ms !== null) candidates.push({ operation_id: row.id ?? null, field: 'visual_evaluation_verdict_gap_ms', label: 'unattributed visual-evaluation/host/model gap', ms });
    }
  }
  return candidates.sort((a, b) => b.ms - a.ms)[0] ?? null;
}

function sumLatency(records, field) {
  return records.reduce((sum, record) => {
    const value = finite(record?.latency?.[field]);
    return value === null ? sum : sum + value;
  }, 0);
}

function buildHotLoopSummary({ selectedRecords, visualRows, throughput, boundaries }) {
  const scopedAccounting = throughput.complete ? scopedDeterministicRepairAccounting(throughput.events) : null;
  const passes = hotLoopPasses(visualRows, throughput, boundaries);
  const runPhotoshopMs = sumLatency(selectedRecords, 'photoshop_dispatch_wall_ms');
  const visualCount = visualRows.length;
  return {
    passes,
    aggregate: {
      visual_review: valuesStat(passes.map(row => row.visual_review_ms)),
      review_finished_to_next_pass_ready: stat(visualRows, 'review_finished_to_next_pass_ready_marker_ms'),
      review_finished_to_painting_intent_ready: valuesStat(
        passes
          .filter(row => row.artistic_decision_source === 'PaintingIntent intent_received_at')
          .map(row => row.artistic_decision_ms)
      ),
      painting_intent_compile: valuesStat(passes.map(row => row.intent_compile_ms)),
      durable_state_injection: valuesStat(passes.map(row => row.durable_state_injection_ms)),
      local_validation: valuesStat(passes.map(row => row.local_validation_ms)),
      auto_repair: valuesStat(passes.map(row => row.auto_repair_ms)),
      painting_intent_to_dispatch: valuesStat(passes.map(row => row.intent_to_dispatch_ms)),
      model_visible_guard_round_trips_per_artistic_mutation:
        throughput.complete && visualCount > 0
          ? throughput.model_visible_guard_round_trips / visualCount
          : null,
      model_visible_guard_round_trips: throughput.complete ? throughput.model_visible_guard_round_trips : null,
      rejected_before_dispatch_round_trips: throughput.complete ? throughput.rejected_before_dispatch_round_trips : null,
      recovery_only_round_trips: throughput.complete ? throughput.recovery_only_round_trips : null,
      // Visual journals cover only dispatched passes; they cannot fill gaps
      // from rejected/recovery/bookkeeping calls or an incomplete event mirror.
      auto_repair_count: throughput.complete ? throughput.auto_repair_count : null,
      auto_split_count: throughput.complete ? throughput.auto_split_count : null,
      model_semantic_ambiguity_count: throughput.complete ? throughput.model_semantic_ambiguity_count : null,
      preflight_rejection_exposed_to_model_count: throughput.complete ? throughput.preflight_rejection_exposed_to_model_count : null,
      deterministic_violations_repaired_locally_percent: throughput.complete
        ? scopedAccounting.percent : null,
      scoped_violation_accounting: throughput.complete
        ? scopedAccounting : null,
      deterministic_repair_rate_limitation:
        !throughput.complete || !scopedAccounting.complete
          ? 'Exact repair percentage is unavailable: selected events lack owned, typed violation scopes.'
          : scopedAccounting.encountered === 0
            ? 'No deterministic next-operation violations were encountered in the selected run.' : null,
      photoshop_dispatch_ms_observed: runPhotoshopMs,
      photoshop_share_of_run_wall:
        boundaries.wall_ms && boundaries.wall_ms > 0 ? runPhotoshopMs / boundaries.wall_ms : null,
      largest_observed_stall: largestObservedStall(visualRows),
    },
  };
}

export function buildBenchmark({
  root = process.cwd(),
  operationsDir = path.join(root, '.photoshop-runtime', 'controller', 'operations'),
  operationPrefix = null,
} = {}) {
  const allRecords = loadOperationJournals(operationsDir);
  const selectedRecords = operationPrefix
    ? allRecords.filter(record => String(record?.id ?? '').startsWith(operationPrefix))
    : allRecords;
  if (operationPrefix && selectedRecords.length === 0) {
    throw new Error(`No operation journals matched --operation-prefix ${operationPrefix}`);
  }

  const rows = selectedRecords.filter(row => row?.visual === true && row?.phase === 'completed' && row?.latency);
  const groups = new Map();
  for (const row of rows) {
    const key = [row.tool ?? 'unknown-tool', row.stage ?? 'unknown-stage', row.scale ?? 'unknown-scale'].join(' | ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const representative = [...groups.entries()]
    .filter(([, group]) => group.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  const visualMicroplans = rows.filter(row => row.tool === 'photoshop_execute_visual_microplan');
  const continuationObserved = visualMicroplans.filter(
    row => finite(row.latency?.review_delivery_to_next_guard_ms) !== null
  );
  const continuationFullyMarked = continuationObserved.filter(
    row =>
      finite(row.latency?.review_delivery_to_review_finished_marker_ms) !== null
      && finite(row.latency?.review_finished_to_next_pass_ready_marker_ms) !== null
      && finite(row.latency?.next_pass_ready_marker_to_guard_ms) !== null
  );
  const overall = {
    wall: stat(visualMicroplans, 'semantic_cycle_wall_ms'),
    preflight: stat(visualMicroplans, 'guard_preflight_ms'),
    dispatch: stat(visualMicroplans, 'photoshop_dispatch_wall_ms'),
    evaluation: stat(visualMicroplans, 'visual_evaluation_verdict_gap_ms'),
    closure: stat(visualMicroplans, 'report_ack_closure_ms'),
    dominant: dominant(visualMicroplans),
  };

  let runScope = null;
  if (operationPrefix) {
    const boundaries = runBoundaries(selectedRecords);
    const runState = discoverRunState({ root, selectedRecords, operationPrefix });
    const selectedOperationIds = new Set(selectedRecords.map(record => String(record?.id ?? '')).filter(Boolean));
    const archiveEvidence = benchmarkArchiveEvidence(path.dirname(operationsDir), runState.state);
    const throughput = archiveEvidence?.integrity === 'unverified'
      ? { ...scopedThroughput({ state: null, operationPrefix, boundaries, selectedOperationIds }),
        available: true, warning: archiveEvidence.warning, evidence_source: 'unverified_archive' }
      : { ...scopedThroughput({ state: runState.state, operationPrefix, boundaries, selectedOperationIds, archiveEvidence }),
        evidence_source: archiveEvidence?.integrity === 'consistent' ? 'verified_archive' : 'bounded_mirror' };
    const hotLoop = buildHotLoopSummary({ selectedRecords, visualRows: visualMicroplans, throughput, boundaries });
    runScope = {
      operation_prefix: operationPrefix,
      selected_operation_count: selectedRecords.length,
      boundaries,
      process_state_path: runState.path,
      process_state_linked: Boolean(runState.state),
      throughput,
      hot_loop: hotLoop,
      warnings: [PROCESS_DIR_WARNING, runState.warning, throughput.warning].filter(Boolean),
    };
  }

  return {
    rows,
    representative,
    visualMicroplans,
    continuationObserved,
    continuationFullyMarked,
    overall,
    runScope,
  };
}

function renderRepresentativeSections(data, out) {
  const { rows, representative, visualMicroplans, continuationObserved, continuationFullyMarked, overall } = data;
  out.push('Dataset: **' + rows.length + ' completed visual cycles**, including **' + visualMicroplans.length + ' VisualMicroPlan cycles**. Groups below require at least two observed samples.');
  out.push('');
  out.push('Guard telemetry does **not** separately observe model reasoning, host scheduling, user think time, or preview materialization when preview capture is embedded inside the dispatched operation. Those components remain explicitly unknown rather than being re-labelled.');
  out.push('');
  out.push('| workflow | n | semantic wall median / p95 ms | Guard preflight median / p95 | Photoshop dispatch median / p95 | visual-evaluation gap median / p95 | closure median / p95 | observed dominant component |');
  out.push('|---|---:|---:|---:|---:|---:|---:|---|');

  for (const [key, group] of representative) {
    const wall = stat(group, 'semantic_cycle_wall_ms');
    const preflight = stat(group, 'guard_preflight_ms');
    const dispatch = stat(group, 'photoshop_dispatch_wall_ms');
    const evaluation = stat(group, 'visual_evaluation_verdict_gap_ms');
    const closure = stat(group, 'report_ack_closure_ms');
    const dom = dominant(group);
    out.push('| ' + key.replaceAll('|', '\\|') + ' | ' + group.length +
      ' | ' + fmt(wall.median) + ' / ' + fmt(wall.p95) +
      ' | ' + fmt(preflight.median) + ' / ' + fmt(preflight.p95) +
      ' | ' + fmt(dispatch.median) + ' / ' + fmt(dispatch.p95) +
      ' | ' + fmt(evaluation.median) + ' / ' + fmt(evaluation.p95) +
      ' | ' + fmt(closure.median) + ' / ' + fmt(closure.p95) +
      ' | ' + dom.label + ' (' + fmt(dom.median) + ' ms median) |');
  }

  out.push('');
  out.push('## Cross-workflow result');
  out.push('');
  out.push('Across ' + visualMicroplans.length + ' completed VisualMicroPlan cycles, semantic wall time is ' +
    fmt(overall.wall.median) + ' ms median / ' + fmt(overall.wall.p95) + ' ms p95. Guard preflight is ' +
    fmt(overall.preflight.median) + ' / ' + fmt(overall.preflight.p95) + ' ms, Photoshop dispatch (including embedded preview where inseparable) is ' +
    fmt(overall.dispatch.median) + ' / ' + fmt(overall.dispatch.p95) + ' ms, the unattributed visual-evaluation/host/model gap is ' +
    fmt(overall.evaluation.median) + ' / ' + fmt(overall.evaluation.p95) + ' ms, and closure is ' +
    fmt(overall.closure.median) + ' / ' + fmt(overall.closure.p95) + ' ms.');
  out.push('');
  out.push('The largest observed median component is **' + overall.dominant.label + '** at ' + fmt(overall.dominant.median) + ' ms. This is an attribution boundary, not proof that model reasoning alone consumed that interval.');
  out.push('');
  out.push('## Diagnostic continuation-phase split');
  out.push('');
  out.push(
    'Explicit review-image delivery boundaries are available for **' + continuationObserved.length
    + ' VisualMicroPlan cycles**; both opt-in diagnostic markers (review_finished, next_pass_ready) are available for **'
    + continuationFullyMarked.length + ' cycles**.'
  );
  out.push('');
  if (continuationObserved.length) {
    const continuationStats = [
      ['Guard response → review-image request', 'guard_response_to_review_request_ms', continuationObserved],
      ['review-image tool service', 'review_image_service_ms', continuationObserved],
      ['review delivery → review-finished marker', 'review_delivery_to_review_finished_marker_ms', continuationFullyMarked],
      ['review-finished marker → next-pass-ready marker', 'review_finished_to_next_pass_ready_marker_ms', continuationFullyMarked],
      ['next-pass-ready marker → next Guard call', 'next_pass_ready_marker_to_guard_ms', continuationFullyMarked],
      ['review delivery → next Guard call', 'review_delivery_to_next_guard_ms', continuationObserved],
    ];
    out.push('| continuation phase | n | median ms | p95 ms |');
    out.push('|---|---:|---:|---:|');
    for (const [label, key, sample] of continuationStats) {
      const value = stat(sample, key);
      out.push('| ' + label + ' | ' + value.n + ' | ' + fmt(value.median) + ' | ' + fmt(value.p95) + ' |');
    }
    out.push('');
  }
  out.push('These are **server-observed diagnostic boundaries**. Marker intervals include any host/tool transport around the marker call and must not be labelled pure model reasoning time. Normal painting does not require marker calls; enable them only for timing benchmarks.');
  out.push('');
}

function renderRunScope(runScope, out) {
  const { boundaries, throughput, hot_loop: hotLoop } = runScope;
  out.push('## Run-scoped hot-loop efficiency');
  out.push('');
  out.push(`Operation-id prefix: \`${runScope.operation_prefix}\`. Selected journals: **${runScope.selected_operation_count}**.`);
  out.push(`Throughput evidence: **${throughput.evidence_source}** (exact counters only where ownership and measurements are complete).`);
  out.push('');
  out.push(`Run boundary: **${boundaries.start_at ?? 'unknown'} → ${boundaries.end_at ?? 'unknown'}** (${fmt(boundaries.wall_ms)} ms). ${boundaries.rule}.`);
  out.push('');
  for (const warning of runScope.warnings) out.push(`- Warning: ${warning}`);
  if (runScope.warnings.length) out.push('');
  out.push('Per-pass timing keeps server-observed diagnostic markers separate from compiler/runtime timing. `artistic decision` uses a real `intent_received_at` boundary when present; on older journals it is only the `review_finished → next_pass_ready` diagnostic proxy. That proxy includes host/tool transport and is not labelled model reasoning time.');
  out.push('');
  out.push('| pass | operation | review delivery ms | visual review ms | artistic decision / proxy ms | intent compile ms | state inject ms | local validate ms | auto repair ms / count | splits | semantic ambiguities | exposed preflight rejections | next-pass-ready → Guard ms | ready → dispatch ms | Guard ms | Photoshop ms | semantic wall ms | model-visible rejections before dispatch | recovery-only before dispatch |');
  out.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of hotLoop.passes) {
    out.push(`| ${row.pass} | ${String(row.operation_id).replaceAll('|', '\\|')} | ${fmt(row.review_delivery_ms)} | ${fmt(row.visual_review_ms)} | ${fmt(row.artistic_decision_ms)} | ${fmt(row.intent_compile_ms)} | ${fmt(row.durable_state_injection_ms)} | ${fmt(row.local_validation_ms)} | ${fmt(row.auto_repair_ms)} / ${fmt(row.auto_repair_count)} | ${fmt(row.auto_split_count)} | ${fmt(row.model_semantic_ambiguity_count)} | ${fmt(row.preflight_rejection_exposed_to_model_count)} | ${fmt(row.next_pass_ready_to_guard_ms)} | ${fmt(row.ready_to_dispatch_ms)} | ${fmt(row.guard_ms)} | ${fmt(row.photoshop_ms)} | ${fmt(row.semantic_wall_ms)} | ${fmt(row.model_visible_rejection_count)} | ${fmt(row.recovery_only_count)} |`);
  }
  out.push('');
  out.push('| hot-loop aggregate | value |');
  out.push('|---|---:|');
  out.push(`| median visual review | ${fmt(hotLoop.aggregate.visual_review.median)} ms |`);
  out.push(`| median review_finished → PaintingIntent ready | ${fmt(hotLoop.aggregate.review_finished_to_painting_intent_ready.median)} ms |`);
  out.push(`| median review_finished → next_pass_ready diagnostic marker | ${fmt(hotLoop.aggregate.review_finished_to_next_pass_ready.median)} ms |`);
  out.push(`| median PaintingIntent compile | ${fmt(hotLoop.aggregate.painting_intent_compile.median)} ms |`);
  out.push(`| median durable-state injection | ${fmt(hotLoop.aggregate.durable_state_injection.median)} ms |`);
  out.push(`| median local validation | ${fmt(hotLoop.aggregate.local_validation.median)} ms |`);
  out.push(`| median auto repair | ${fmt(hotLoop.aggregate.auto_repair.median)} ms |`);
  out.push(`| median PaintingIntent → dispatch | ${fmt(hotLoop.aggregate.painting_intent_to_dispatch.median)} ms |`);
  out.push(`| model-visible Guard round trips / artistic mutation | ${fmtRatio(hotLoop.aggregate.model_visible_guard_round_trips_per_artistic_mutation)} |`);
  out.push(`| model-visible Guard round trips | ${fmt(hotLoop.aggregate.model_visible_guard_round_trips)} |`);
  out.push(`| rejected-before-dispatch round trips | ${fmt(hotLoop.aggregate.rejected_before_dispatch_round_trips)} |`);
  out.push(`| recovery-only round trips | ${fmt(hotLoop.aggregate.recovery_only_round_trips)} |`);
  out.push(`| auto repairs applied | ${fmt(hotLoop.aggregate.auto_repair_count)} |`);
  out.push(`| automatic safe splits | ${fmt(hotLoop.aggregate.auto_split_count)} |`);
  out.push(`| model semantic ambiguities | ${fmt(hotLoop.aggregate.model_semantic_ambiguity_count)} |`);
  out.push(`| preflight rejections exposed to model | ${fmt(hotLoop.aggregate.preflight_rejection_exposed_to_model_count)} |`);
  out.push(`| deterministic violations repaired locally | ${hotLoop.aggregate.deterministic_violations_repaired_locally_percent === null ? 'unknown' : fmtPercent(hotLoop.aggregate.deterministic_violations_repaired_locally_percent)} |`);
  out.push(`| observed Photoshop dispatch total | ${fmt(hotLoop.aggregate.photoshop_dispatch_ms_observed)} ms |`);
  out.push(`| Photoshop share of run wall clock | ${fmtPercent(hotLoop.aggregate.photoshop_share_of_run_wall)} |`);
  const stall = hotLoop.aggregate.largest_observed_stall;
  out.push(`| largest observed stall | ${stall ? `${stall.label}: ${fmt(stall.ms)} ms (${stall.operation_id ?? 'unknown operation'})` : 'unknown'} |`);
  out.push('');
  if (!throughput.complete) {
    out.push('Run-scoped rejection/recovery/round-trip counters are **unknown**, not zero, because exact event attribution is unavailable.');
    out.push('');
  }
  if (hotLoop.aggregate.painting_intent_compile.n === 0 || hotLoop.aggregate.painting_intent_to_dispatch.n === 0) {
    out.push('PaintingIntent compile/repair/dispatch fields remain **unknown** for journals that predate P1-D telemetry. The benchmark does not infer those server-side intervals from unattributed host/model gaps.');
    out.push('');
  }
  if (hotLoop.aggregate.deterministic_violations_repaired_locally_percent === null) {
    out.push(hotLoop.aggregate.deterministic_repair_rate_limitation);
    out.push('');
  }
}

export function renderBenchmark(data, { embeddedOutput = false } = {}) {
  const out = [];
  out.push(embeddedOutput ? '### Generated dataset' : '# Representative painting-cycle latency benchmark');
  out.push('');
  out.push('Generated by node scripts/dev/benchmark-painting-cycles.mjs from operation journals in .photoshop-runtime/controller/operations' + (data.runScope ? ` scoped by operation-id prefix \`${data.runScope.operation_prefix}\`` : '') + '.');
  out.push('');
  renderRepresentativeSections(data, out);
  if (data.runScope) renderRunScope(data.runScope, out);
  out.push('## Optimization decision supported by the measurements');
  out.push('');
  out.push('- Do not prioritize broad UXP migration merely to shave Photoshop execution time: in the recorded painting cycles, dispatch is materially smaller than the unattributed host/model/visual-evaluation gap for the aggregate VisualMicroPlan workflow.');
  out.push('- Keep the verified preparation cache and compact continuation work: they remove repeated host/Guard work without weakening the preview barrier, and target the higher-latency orchestration side of the cycle.');
  out.push('- Preserve one semantic bundle per bounded artistic thought rather than maximizing mutation count. Bundle size should be increased only where the measured dispatch/round-trip share justifies it and rollback remains coherent.');
  out.push('- Preview optimization should be revisited only after telemetry can separate preview materialization from Photoshop dispatch; the current journals intentionally report that component as unknown.');
  out.push('');
  out.push('This benchmark is historical/repository evidence. The final clean-host acceptance must append fresh compact-v2 cycles from the rebuilt child rather than treating older journals as proof of the new live route.');
  out.push('');
  return out.join('\n');
}

export function writeBenchmarkOutput({ outputPath, embeddedOutput, generated }) {
  if (embeddedOutput) {
    const document = readFileSync(outputPath, 'utf8');
    const start = document.indexOf(GENERATED_START);
    const end = document.indexOf(GENERATED_END);
    if (start < 0 || end < start) {
      throw new Error('performance-and-latency.md is missing generated benchmark markers');
    }
    const afterEnd = end + GENERATED_END.length;
    const next =
      document.slice(0, start + GENERATED_START.length) +
      '\n' +
      generated +
      '\n' +
      document.slice(end, afterEnd) +
      document.slice(afterEnd);
    writeFileSync(outputPath, next, 'utf8');
    return;
  }
  writeFileSync(outputPath, generated, 'utf8');
}

export function runCli(argv = process.argv.slice(2), root = process.cwd()) {
  const options = parseCliArgs(argv, root);
  const data = buildBenchmark({ root, operationPrefix: options.operationPrefix });
  const generated = renderBenchmark(data, { embeddedOutput: options.embeddedOutput });
  writeBenchmarkOutput({ outputPath: options.outputPath, embeddedOutput: options.embeddedOutput, generated });
  const summary = {
    completed_visual_cycles: data.rows.length,
    visual_microplan_cycles: data.visualMicroplans.length,
    continuation_delivery_samples: data.continuationObserved.length,
    continuation_fully_marked_samples: data.continuationFullyMarked.length,
    overall: data.overall,
    ...(data.runScope ? {
      run_scope: {
        operation_prefix: data.runScope.operation_prefix,
        selected_operation_count: data.runScope.selected_operation_count,
        boundaries: data.runScope.boundaries,
        warnings: data.runScope.warnings,
      },
      hot_loop: data.runScope.hot_loop.aggregate,
    } : {}),
  };
  console.log('Wrote ' + options.outputPath);
  console.log(JSON.stringify(summary, null, 2));
  return { options, data, generated, summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
