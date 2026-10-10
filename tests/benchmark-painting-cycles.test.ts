import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PROCESS_DIR_WARNING,
  buildBenchmark,
  scopedDeterministicRepairAccounting,
  parseCliArgs,
  renderBenchmark,
} from '../scripts/dev/benchmark-painting-cycles.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'painting-cycle-benchmark-'));
  roots.push(root);
  const operationsDir = path.join(root, '.photoshop-runtime', 'controller', 'operations');
  const runDir = path.join(root, 'processes', 'mixed-prefix-process', 'run-01');
  mkdirSync(operationsDir, { recursive: true });
  mkdirSync(path.join(runDir, 'frames'), { recursive: true });
  mkdirSync(path.join(runDir, 'final'), { recursive: true });
  return { root, operationsDir, runDir };
}

function writeOperation(operationsDir: string, record: Record<string, unknown>) {
  writeFileSync(
    path.join(operationsDir, `${record.id}.json`),
    JSON.stringify(record, null, 2),
    'utf8',
  );
}

function visualOperation({
  id,
  sequence,
  cycleReceivedAt,
  completedAt,
  responseReadyAt,
  commentaryPath,
  visualReviewMs,
  artisticDecisionMs,
  readyToGuardMs,
  photoshopMs,
}: {
  id: string;
  sequence: number;
  cycleReceivedAt: string;
  completedAt: string;
  responseReadyAt: string;
  commentaryPath: string;
  visualReviewMs: number;
  artisticDecisionMs: number;
  readyToGuardMs: number | null;
  photoshopMs: number;
}) {
  return {
    id,
    sequence,
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42 },
    stage: 'FORM',
    scale: 'medium',
    visual: true,
    phase: 'completed',
    created_at: cycleReceivedAt,
    completed_at: completedAt,
    report: { commentary_path: commentaryPath },
    continuation_timing: {
      review_image_request_received_at: responseReadyAt,
      review_image_result_ready_at: responseReadyAt,
      review_finished_marker_received_at: responseReadyAt,
      next_pass_ready_marker_received_at: responseReadyAt,
    },
    latency: {
      cycle_received_at: cycleReceivedAt,
      response_ready_at: responseReadyAt,
      guard_response_to_review_request_ms: 500,
      review_image_service_ms: 5,
      review_delivery_to_review_finished_marker_ms: visualReviewMs,
      review_finished_to_next_pass_ready_marker_ms: artisticDecisionMs,
      next_pass_ready_marker_to_guard_ms: readyToGuardMs,
      review_delivery_to_next_guard_ms: visualReviewMs + artisticDecisionMs + (readyToGuardMs ?? 0),
      guard_preflight_ms: 20,
      photoshop_dispatch_wall_ms: photoshopMs,
      visual_evaluation_verdict_gap_ms: null,
      report_ack_closure_ms: 10,
      semantic_cycle_wall_ms: 9000,
    },
  };
}

describe('painting-cycle run-scoped benchmark', () => {
  it('does not promote partially measured event counters or visual-pass fallbacks to exact run totals', () => {
    const { root, operationsDir, runDir } = fixtureRoot();
    writeOperation(operationsDir, {
      id: 'run-a-create', sequence: 1, args: { document_id: 42, path: path.join(runDir, 'final', 'frame.psd') },
      phase: 'completed', created_at: '2026-10-02T10:00:00.000Z', completed_at: '2026-10-02T10:00:01.000Z',
      latency: { cycle_received_at: '2026-10-02T10:00:00.000Z', response_ready_at: '2026-10-02T10:00:01.000Z' },
    });
    const pass = visualOperation({
      id: 'run-a-pass01', sequence: 2,
      cycleReceivedAt: '2026-10-02T10:00:02.000Z', completedAt: '2026-10-02T10:00:04.000Z',
      responseReadyAt: '2026-10-02T10:00:05.000Z', commentaryPath: path.join(runDir, 'frames', 'frame.txt'),
      visualReviewMs: 100, artisticDecisionMs: 200, readyToGuardMs: 10, photoshopMs: 20,
    });
    pass.latency.auto_repair_count = 99; // A visual-pass receipt cannot measure an earlier rejected call.
    writeOperation(operationsDir, pass);
    const events: Record<string, unknown>[] = [
      { at: '2026-10-02T09:59:59.000Z', kind: 'bookkeeping', model_visible: true, operation_id: 'run-a-create' },
      { at: '2026-10-02T10:00:02.100Z', kind: 'semantic-dispatch', model_visible: true,
        operation_id: 'run-a-pass01', auto_repair_count: 2, auto_split_count: 1 },
      { at: '2026-10-02T10:00:03.100Z', kind: 'rejected', model_visible: true,
        operation_id: 'run-a-pass01-retry' },
    ];
    const statePath = path.join(runDir, 'painting-state.json');
    const writeState = () => writeFileSync(statePath, JSON.stringify({
      document_id: 42, document_instance: { bootstrap_operation_id: 'run-a-create' },
      process_dir: 'processes/mixed-prefix-process/run-01',
      artistic_throughput: { recent_events: events },
    }), 'utf8');
    writeState();
    const partial = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope;
    expect(partial?.throughput).toMatchObject({ complete: true, model_visible_guard_round_trips: 2,
      auto_repair_count: null, auto_split_count: null });
    expect(partial?.hot_loop.aggregate).toMatchObject({ auto_repair_count: null, auto_split_count: null });

    Object.assign(events[2], { auto_repair_count: 0, auto_split_count: 0 });
    writeState();
    const measured = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope;
    expect(measured?.throughput).toMatchObject({ complete: true, auto_repair_count: 2, auto_split_count: 1 });
    expect(measured?.hot_loop.aggregate).toMatchObject({ auto_repair_count: 2, auto_split_count: 1 });

    events[2].auto_repair_count = '0'; // Legacy/malformed text is not a measured numeric zero.
    writeState();
    const malformed = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' }).runScope;
    expect(malformed?.throughput).toMatchObject({ complete: true, auto_repair_count: null, auto_split_count: 1 });
    expect(malformed?.hot_loop.aggregate.auto_repair_count).toBeNull();
    expect(malformed?.throughput.warning).toContain('incompletely measured event fields');
  });

  it('keeps positional output compatibility and exposes only proven operation-prefix run selection', () => {
    const root = path.resolve('C:/benchmark-fixture');
    const legacy = parseCliArgs(['reports/out.md'], root);
    expect(legacy.outputPath).toBe(path.resolve(root, 'reports/out.md'));
    expect(legacy.operationPrefix).toBeNull();

    const scoped = parseCliArgs(['reports/run-a.md', '--operation-prefix', 'run-a-'], root);
    expect(scoped.outputPath).toBe(path.resolve(root, 'reports/run-a.md'));
    expect(scoped.operationPrefix).toBe('run-a-');

    expect(() => parseCliArgs(['--operation-prefix', 'run-a-'], root))
      .toThrow(/explicit positional output path/);
    expect(() => parseCliArgs(['reports/run-a.md', '--process-dir', 'processes/example/run-01'], root))
      .toThrow(PROCESS_DIR_WARNING);
  });

  it('isolates a mixed-prefix run, derives closed journal boundaries, and excludes later throughput contamination', () => {
    const { root, operationsDir, runDir } = fixtureRoot();
    const frame1 = path.join(runDir, 'frames', 'run-a-pass01.txt');
    const frame2 = path.join(runDir, 'frames', 'run-a-pass02.txt');

    writeOperation(operationsDir, {
      id: 'run-a-create', sequence: 1, tool: 'photoshop_create_document', phase: 'completed', visual: false,
      created_at: '2026-10-02T10:00:00.100Z', completed_at: '2026-10-02T10:00:00.500Z',
      latency: {
        cycle_received_at: '2026-10-02T10:00:00.000Z', response_ready_at: '2026-10-02T10:00:00.600Z',
        guard_preflight_ms: 5, photoshop_dispatch_wall_ms: 10,
      },
    });
    const runAPass01 = visualOperation({
      id: 'run-a-pass01', sequence: 2,
      cycleReceivedAt: '2026-10-02T10:00:20.000Z', completedAt: '2026-10-02T10:00:21.000Z',
      responseReadyAt: '2026-10-02T10:00:21.500Z', commentaryPath: frame1,
      visualReviewMs: 1000, artisticDecisionMs: 2000, readyToGuardMs: 100, photoshopMs: 30,
    });
    runAPass01.continuation_timing.review_finished_marker_received_at = '2026-10-02T10:00:19.700Z';
    Object.assign(runAPass01.latency, {
      painting_intent_compile_ms: 12,
      durable_state_injection_ms: 3,
      local_validation_ms: 5,
      auto_repair_ms: 7,
      auto_repair_count: 2,
      auto_split_count: 1,
      model_semantic_ambiguity_count: 0,
      preflight_rejection_exposed_to_model_count: 0,
      intent_received_at: '2026-10-02T10:00:19.800Z',
      compiled_at: '2026-10-02T10:00:19.812Z',
      validated_at: '2026-10-02T10:00:19.817Z',
      repaired_at: '2026-10-02T10:00:19.824Z',
      dispatch_started_at: '2026-10-02T10:00:19.850Z',
    });
    writeOperation(operationsDir, runAPass01);
    writeOperation(operationsDir, visualOperation({
      id: 'run-b-pass01', sequence: 3,
      cycleReceivedAt: '2026-10-02T10:00:30.000Z', completedAt: '2026-10-02T10:00:31.000Z',
      responseReadyAt: '2026-10-02T10:00:31.500Z', commentaryPath: path.join(runDir, 'frames', 'run-b-pass01.txt'),
      visualReviewMs: 9000, artisticDecisionMs: 12000, readyToGuardMs: 400, photoshopMs: 900,
    }));
    writeOperation(operationsDir, visualOperation({
      id: 'run-a-pass02', sequence: 4,
      cycleReceivedAt: '2026-10-02T10:00:40.000Z', completedAt: '2026-10-02T10:00:41.000Z',
      responseReadyAt: '2026-10-02T10:00:41.500Z', commentaryPath: frame2,
      visualReviewMs: 3000, artisticDecisionMs: 6000, readyToGuardMs: null, photoshopMs: 40,
    }));
    writeOperation(operationsDir, {
      id: 'run-a-final-save', sequence: 5, tool: 'photoshop_save_document', args: {
        document_id: 42,
        path: path.join(runDir, 'final', 'result.psd'),
      },
      phase: 'completed', visual: false,
      created_at: '2026-10-02T10:00:50.000Z', completed_at: '2026-10-02T10:00:50.500Z',
      latency: {
        cycle_received_at: '2026-10-02T10:00:49.900Z', response_ready_at: '2026-10-02T10:00:50.800Z',
        next_cycle_received_at: '2026-10-02T12:00:00.000Z',
        semantic_cycle_wall_ms: 7_200_000,
        guard_preflight_ms: 5,
        photoshop_dispatch_wall_ms: 20,
      },
    });

    writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
      schema_version: 'photoshop.guard.runtime-state.v2',
      version: 2,
      document_id: 42,
      document_instance: { bootstrap_operation_id: 'run-a-create' },
      process_dir: 'processes/mixed-prefix-process/run-01',
      artistic_throughput: {
        protocol: 'photoshop.guard.artistic_throughput.v1',
        recent_events: [
          { at: '2026-10-02T10:00:05.000Z', kind: 'recovery', model_visible: true, semantic_actions: 0, operation_id: 'run-a-create' },
          { at: '2026-10-02T10:00:10.000Z', kind: 'rejected', model_visible: true, semantic_actions: 0, operation_id: 'run-a-pass01-v0', auto_repair_count: 0, auto_split_count: 0, model_semantic_ambiguity_count: 1, preflight_rejection_exposed_to_model_count: 1 },
          { at: '2026-10-02T10:00:15.000Z', kind: 'rejected', model_visible: true, semantic_actions: 0, operation_id: 'run-b-pass01-v0', auto_repair_count: 99, auto_split_count: 99, model_semantic_ambiguity_count: 99, preflight_rejection_exposed_to_model_count: 99 },
          { at: '2026-10-02T10:00:19.000Z', kind: 'semantic-dispatch', model_visible: true, semantic_actions: 1, operation_id: 'run-a-pass01', auto_repair_count: 2, auto_split_count: 1, model_semantic_ambiguity_count: 0, preflight_rejection_exposed_to_model_count: 0, deterministic_violations_encountered_count: 3, deterministic_violations_repaired_count: 3, deterministic_violations_unresolved_count: 0 },
          { at: '2026-10-02T10:00:25.000Z', kind: 'semantic-dispatch', model_visible: true, semantic_actions: 1, operation_id: 'run-b-pass01', auto_repair_count: 99, auto_split_count: 99, model_semantic_ambiguity_count: 99, preflight_rejection_exposed_to_model_count: 99 },
          { at: '2026-10-02T10:00:35.000Z', kind: 'recovery', model_visible: true, semantic_actions: 0, operation_id: 'run-a-pass02' },
          { at: '2026-10-02T10:00:39.000Z', kind: 'semantic-dispatch', model_visible: true, semantic_actions: 1, operation_id: 'run-a-pass02' },
          { at: '2026-10-02T10:00:45.000Z', kind: 'bookkeeping', model_visible: true, semantic_actions: 0, operation_id: 'run-a-final-save' },
          { at: '2026-10-02T10:00:50.850Z', kind: 'semantic-dispatch', model_visible: true, semantic_actions: 0, operation_id: 'run-a-final-save' },
          { at: '2026-10-02T10:01:00.000Z', kind: 'rejected', model_visible: true, semantic_actions: 0, operation_id: 'run-a-later-unrelated' },
        ],
      },
    }, null, 2), 'utf8');

    const result = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(result.runScope).not.toBeNull();
    expect(result.runScope?.selected_operation_count).toBe(4);
    expect(result.visualMicroplans.map(row => row.id)).toEqual(['run-a-pass01', 'run-a-pass02']);
    expect(result.continuationObserved).toHaveLength(2);
    expect(result.continuationFullyMarked).toHaveLength(1);

    expect(result.runScope?.boundaries).toMatchObject({
      start_at: '2026-10-02T10:00:00.000Z',
      end_at: '2026-10-02T10:00:50.800Z',
      wall_ms: 50_800,
    });
    expect(result.runScope?.throughput).toMatchObject({
      complete: true,
      unkeyed_time_window_events: 0,
      model_visible_guard_round_trips: 7,
      semantic_dispatch_round_trips: 3,
      bookkeeping_only_round_trips: 1,
      recovery_only_round_trips: 2,
      rejected_before_dispatch_round_trips: 1,
      // The recovery, bookkeeping and second dispatch events lack optional
      // measurements; the first measured dispatch is not the run total.
      auto_repair_count: null,
      auto_split_count: null,
      model_semantic_ambiguity_count: null,
      preflight_rejection_exposed_to_model_count: null,
    });

    const passes = result.runScope?.hot_loop.passes ?? [];
    expect(passes[0]).toMatchObject({
      operation_id: 'run-a-pass01',
      model_visible_rejection_count: 1,
      recovery_only_count: 1,
      artistic_decision_ms: 100,
      intent_compile_ms: 12,
      durable_state_injection_ms: 3,
      local_validation_ms: 5,
      auto_repair_ms: 7,
      auto_repair_count: 2,
      auto_split_count: 1,
      ready_to_dispatch_ms: 26,
    });
    expect(passes[1]).toMatchObject({
      operation_id: 'run-a-pass02',
      model_visible_rejection_count: 0,
      recovery_only_count: 1,
      artistic_decision_ms: 6000,
    });

    const aggregate = result.runScope?.hot_loop.aggregate;
    expect(aggregate?.model_visible_guard_round_trips_per_artistic_mutation).toBe(3.5);
    expect(aggregate?.rejected_before_dispatch_round_trips).toBe(1);
    expect(aggregate?.recovery_only_round_trips).toBe(2);
    expect(aggregate?.painting_intent_compile).toMatchObject({ n: 1, median: 12 });
    expect(aggregate?.review_finished_to_painting_intent_ready).toMatchObject({ n: 1, median: 100 });
    expect(aggregate?.durable_state_injection).toMatchObject({ n: 1, median: 3 });
    expect(aggregate?.local_validation).toMatchObject({ n: 1, median: 5 });
    expect(aggregate?.auto_repair).toMatchObject({ n: 1, median: 7 });
    expect(aggregate?.painting_intent_to_dispatch).toMatchObject({ n: 1, median: 50 });
    expect(aggregate).toMatchObject({
      auto_repair_count: null,
      auto_split_count: null,
      model_semantic_ambiguity_count: null,
      preflight_rejection_exposed_to_model_count: null,
      deterministic_violations_repaired_locally_percent: null,
    });
    expect(aggregate?.largest_observed_stall).toMatchObject({
      operation_id: 'run-a-pass02',
      field: 'review_finished_to_next_pass_ready_marker_ms',
      ms: 6000,
    });

    const rendered = renderBenchmark(result);
    expect(rendered).toContain(PROCESS_DIR_WARNING);
    expect(rendered).toContain('| auto repairs applied | unknown |');
    expect(rendered).toContain('| deterministic violations repaired locally | unknown |');
    expect(rendered).toContain('not labelled model reasoning time');
    expect(rendered).not.toContain('run-b-pass01');
    expect(rendered).not.toContain('7200000 ms');
  });

  it('leaves run-scoped counters unknown when overlapping runs have unkeyed throughput events', () => {
    const { root, operationsDir, runDir } = fixtureRoot();
    writeOperation(operationsDir, {
      id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'final', 'run-a.psd') },
      created_at: '2026-10-02T10:00:00.000Z', completed_at: '2026-10-02T10:00:10.000Z',
      latency: { cycle_received_at: '2026-10-02T10:00:00.000Z', response_ready_at: '2026-10-02T10:00:10.000Z' },
    });
    writeOperation(operationsDir, {
      id: 'run-b-create', args: { document_id: 42 },
      created_at: '2026-10-02T10:00:02.000Z', completed_at: '2026-10-02T10:00:08.000Z',
    });
    const statePath = path.join(runDir, 'painting-state.json');
    const baseState = {
      document_id: 42,
      document_instance: { bootstrap_operation_id: 'run-a-create' },
      process_dir: 'processes/mixed-prefix-process/run-01',
      artistic_throughput: { recent_events: [
        { at: '2026-10-02T10:00:03.000Z', kind: 'semantic-dispatch', model_visible: true, operation_id: 'run-a-create', semantic_actions: 1 },
        { at: '2026-10-02T10:00:04.000Z', kind: 'semantic-dispatch', model_visible: true, operation_id: 'run-b-create', semantic_actions: 1 },
        { at: '2026-10-02T10:00:05.000Z', kind: 'recovery', model_visible: true, semantic_actions: 0 },
      ] },
    };
    writeFileSync(statePath, JSON.stringify(baseState));
    const ambiguous = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(ambiguous.runScope?.throughput).toMatchObject({
      available: true, complete: false, unkeyed_time_window_events: 1,
      model_visible_guard_round_trips: null, recovery_only_round_trips: null,
      semantic_dispatch_round_trips: null, semantic_artistic_actions_dispatched: null,
    });
    expect(ambiguous.runScope?.throughput.events.map((event: { operation_id: string }) => event.operation_id))
      .toEqual(['run-a-create']);
    expect(ambiguous.runScope?.hot_loop.aggregate.model_visible_guard_round_trips).toBeNull();
    expect(renderBenchmark(ambiguous)).toContain('run ownership is unproven');
    expect(renderBenchmark(ambiguous)).toContain('counters are **unknown**, not zero');

    // An unkeyed event outside the run window is not contamination; the
    // retained, explicitly keyed in-window event is sufficient here.
    baseState.artistic_throughput.recent_events[2].at = '2026-10-02T10:00:12.000Z';
    writeFileSync(statePath, JSON.stringify(baseState));
    const clean = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(clean.runScope?.throughput).toMatchObject({
      complete: true, unkeyed_time_window_events: 0,
      model_visible_guard_round_trips: 1, semantic_dispatch_round_trips: 1,
      recovery_only_round_trips: 0,
    });
  });

  it('does not silently count a run with undated owned or unkeyed throughput events as complete', () => {
    const { root, operationsDir, runDir } = fixtureRoot();
    writeOperation(operationsDir, {
      id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'final', 'run-a.psd') },
      created_at: '2026-10-02T10:00:00.000Z', completed_at: '2026-10-02T10:00:10.000Z',
      latency: { cycle_received_at: '2026-10-02T10:00:00.000Z', response_ready_at: '2026-10-02T10:00:10.000Z' },
    });
    const valid = {
      at: '2026-10-02T10:00:03.000Z', kind: 'semantic-dispatch',
      model_visible: true, operation_id: 'run-a-create', semantic_actions: 1,
    };
    const writeEvents = (events: Record<string, unknown>[]) => writeFileSync(
      path.join(runDir, 'painting-state.json'),
      JSON.stringify({
        document_id: 42,
        document_instance: { bootstrap_operation_id: 'run-a-create' },
        process_dir: 'processes/mixed-prefix-process/run-01',
        artistic_throughput: { recent_events: events },
      }),
    );

    writeEvents([valid, { kind: 'rejected', model_visible: true, operation_id: 'run-a-rejection' }]);
    const ownedUndated = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(ownedUndated.runScope?.throughput).toMatchObject({
      complete: false, undated_potential_events: 1,
      model_visible_guard_round_trips: null, rejected_before_dispatch_round_trips: null,
    });

    writeEvents([valid, { kind: 'recovery', model_visible: true, at: 'not-a-date' }]);
    const unkeyedUndated = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(unkeyedUndated.runScope?.throughput).toMatchObject({
      complete: false, undated_potential_events: 1,
      model_visible_guard_round_trips: null, recovery_only_round_trips: null,
    });

    // A provably foreign operation id cannot contaminate this run, even if its
    // timestamp is missing; retain the exact count for the owned valid event.
    writeEvents([valid, { kind: 'recovery', model_visible: true, operation_id: 'run-b-recovery' }]);
    const foreignUndated = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(foreignUndated.runScope?.throughput).toMatchObject({
      complete: true, undated_potential_events: 0,
      model_visible_guard_round_trips: 1, recovery_only_round_trips: 0,
    });
  });

  it('does not report exact zero counters when a linked run has no retained throughput events', () => {
    const { root, operationsDir, runDir } = fixtureRoot();
    writeOperation(operationsDir, {
      id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'final', 'run-a.psd') },
      created_at: '2026-10-02T10:00:00.000Z', completed_at: '2026-10-02T10:00:10.000Z',
      latency: { cycle_received_at: '2026-10-02T10:00:00.000Z', response_ready_at: '2026-10-02T10:00:10.000Z' },
    });
    writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
      document_id: 42,
      document_instance: { bootstrap_operation_id: 'run-a-create' },
      process_dir: 'processes/mixed-prefix-process/run-01',
      artistic_throughput: { recent_events: [] },
    }));

    const result = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(result.runScope?.throughput).toMatchObject({
      available: true, complete: false, model_visible_guard_round_trips: null,
      semantic_dispatch_round_trips: null, rejected_before_dispatch_round_trips: null,
    });
    expect(result.runScope?.hot_loop.aggregate.model_visible_guard_round_trips).toBeNull();
  });

  it('treats a full 64-event window beginning exactly at run start as potentially truncated', () => {
    const { root, operationsDir, runDir } = fixtureRoot();
    writeOperation(operationsDir, {
      id: 'run-a-create', args: { document_id: 42, path: path.join(runDir, 'final', 'run-a.psd') },
      created_at: '2026-10-02T10:00:00.000Z', completed_at: '2026-10-02T10:00:10.000Z',
      latency: { cycle_received_at: '2026-10-02T10:00:00.000Z', response_ready_at: '2026-10-02T10:00:10.000Z' },
    });
    // Two events can share the same millisecond. A full retained window whose
    // first timestamp equals the run boundary does not prove no event was evicted.
    const events = Array.from({ length: 64 }, (_, index) => ({
      at: '2026-10-02T10:00:00.000Z', kind: 'rejected', model_visible: true,
      operation_id: index === 0 ? 'run-a-create' : `run-b-other-${index}`,
    }));
    writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
      document_id: 42,
      document_instance: { bootstrap_operation_id: 'run-a-create' },
      process_dir: 'processes/mixed-prefix-process/run-01',
      artistic_throughput: { recent_events: events },
    }));

    const result = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(result.runScope?.throughput).toMatchObject({
      available: true, complete: false, model_visible_guard_round_trips: null,
      rejected_before_dispatch_round_trips: null,
    });
    expect(result.runScope?.throughput.warning).toMatch(/capped at 64/);

    // A retained event strictly before the run start establishes the window
    // boundary even when the 64-event cap is reached.
    events[0] = { ...events[0], at: '2026-10-02T09:59:59.999Z', operation_id: 'run-b-before' };
    events[1] = { ...events[1], operation_id: 'run-a-create' };
    writeFileSync(path.join(runDir, 'painting-state.json'), JSON.stringify({
      document_id: 42,
      document_instance: { bootstrap_operation_id: 'run-a-create' },
      process_dir: 'processes/mixed-prefix-process/run-01',
      artistic_throughput: { recent_events: events },
    }));
    const covered = buildBenchmark({ root, operationsDir, operationPrefix: 'run-a-' });
    expect(covered.runScope?.throughput).toMatchObject({
      complete: true, model_visible_guard_round_trips: 1,
      rejected_before_dispatch_round_trips: 1,
    });
  });
});


it('uses typed next-operation defects for repair rates and refuses legacy, unowned or inconsistent accounting', () => {
  const row = { scope: 'next_operation', code: 'collision', repair_class: 'AUTO_PATCH', encountered: 2, repaired: 1, unresolved: 1 };
  const event = { kind: 'semantic-dispatch', operation_id: 'pass', violation_accounting: [row,
    { ...row, scope: 'finalization', encountered: 50, repaired: 0, unresolved: 50 },
    { ...row, scope: 'cycle', encountered: 20, repaired: 0, unresolved: 20 },
    { ...row, repair_class: 'MODEL_SEMANTIC_DECISION' }] };
  expect(scopedDeterministicRepairAccounting([event])).toMatchObject({ complete: true, percent: 0.5, encountered: 2 });
  for (const invalid of [
    { ...event, operation_id: undefined },
    { ...event, violation_accounting: undefined, deterministic_violations_encountered_count: 100 },
    { ...event, violation_accounting: [{ ...row, scope: undefined }] },
    { ...event, violation_accounting: [{ ...row, repaired: 3 }] },
  ]) expect(scopedDeterministicRepairAccounting([event, invalid]).percent).toBeNull();
});
