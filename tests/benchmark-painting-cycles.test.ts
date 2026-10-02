import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PROCESS_DIR_WARNING,
  buildBenchmark,
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
          { at: '2026-10-02T10:00:05.000Z', kind: 'recovery', model_visible: true, semantic_actions: 0 },
          { at: '2026-10-02T10:00:10.000Z', kind: 'rejected', model_visible: true, semantic_actions: 0, operation_id: 'run-a-pass01-v0', auto_repair_count: 0, auto_split_count: 0, model_semantic_ambiguity_count: 1, preflight_rejection_exposed_to_model_count: 1 },
          { at: '2026-10-02T10:00:15.000Z', kind: 'rejected', model_visible: true, semantic_actions: 0, operation_id: 'run-b-pass01-v0', auto_repair_count: 99, auto_split_count: 99, model_semantic_ambiguity_count: 99, preflight_rejection_exposed_to_model_count: 99 },
          { at: '2026-10-02T10:00:19.000Z', kind: 'semantic-dispatch', model_visible: true, semantic_actions: 1, operation_id: 'run-a-pass01', auto_repair_count: 2, auto_split_count: 1, model_semantic_ambiguity_count: 0, preflight_rejection_exposed_to_model_count: 0 },
          { at: '2026-10-02T10:00:25.000Z', kind: 'semantic-dispatch', model_visible: true, semantic_actions: 1, operation_id: 'run-b-pass01', auto_repair_count: 99, auto_split_count: 99, model_semantic_ambiguity_count: 99, preflight_rejection_exposed_to_model_count: 99 },
          { at: '2026-10-02T10:00:35.000Z', kind: 'recovery', model_visible: true, semantic_actions: 0 },
          { at: '2026-10-02T10:00:39.000Z', kind: 'semantic-dispatch', model_visible: true, semantic_actions: 1, operation_id: 'run-a-pass02' },
          { at: '2026-10-02T10:00:45.000Z', kind: 'bookkeeping', model_visible: true, semantic_actions: 0 },
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
      model_visible_guard_round_trips: 7,
      semantic_dispatch_round_trips: 3,
      bookkeeping_only_round_trips: 1,
      recovery_only_round_trips: 2,
      rejected_before_dispatch_round_trips: 1,
      auto_repair_count: 2,
      auto_split_count: 1,
      model_semantic_ambiguity_count: 1,
      preflight_rejection_exposed_to_model_count: 1,
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
      auto_repair_count: 2,
      auto_split_count: 1,
      model_semantic_ambiguity_count: 1,
      preflight_rejection_exposed_to_model_count: 1,
      deterministic_violations_repaired_locally_percent: null,
    });
    expect(aggregate?.largest_observed_stall).toMatchObject({
      operation_id: 'run-a-pass02',
      field: 'review_finished_to_next_pass_ready_marker_ms',
      ms: 6000,
    });

    const rendered = renderBenchmark(result);
    expect(rendered).toContain(PROCESS_DIR_WARNING);
    expect(rendered).toContain('| auto repairs applied | 2 |');
    expect(rendered).toContain('Exact deterministic-violation repair percentage is unavailable');
    expect(rendered).toContain('not labelled model reasoning time');
    expect(rendered).not.toContain('run-b-pass01');
    expect(rendered).not.toContain('7200000 ms');
  });
});
