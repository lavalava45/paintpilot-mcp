import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SessionStore,
  visualStrategyFingerprint,
} from '../src/core/guard/session-store.js';

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'artistic-recovery-production-'));
  dirs.push(dir);
  const store = new SessionStore(path.join(dir, 'controller'), {
    visualBarrierDirectory: path.join(dir, 'barriers'),
    workspaceRoot: dir,
  });
  return { dir, store };
}

function sha(bytes: string | Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function microplan(
  id: string,
  {
    stepTool = 'photoshop_paint_strokes',
    color = { red: 80, green: 90, blue: 100 },
    opacity = 50,
    strokeCount = 1,
    preset = 'Preset A',
  }: {
    stepTool?: string;
    color?: Record<string, number>;
    opacity?: number;
    strokeCount?: number;
    preset?: string;
  } = {}
) {
  const strokes = Array.from({ length: strokeCount }, (_, index) => ({
    tool: 'BRUSH',
    points: [{ x: 10 + index, y: 10 }, { x: 30 + index, y: 30 }],
    color,
    opacity,
  }));
  return {
    id,
    tool: 'photoshop_execute_visual_microplan',
    args: {
      document_id: 42,
      problem_id: 'localRegion-edge',
      stage: 'FORM_AND_LIGHT',
      scale: 'small',
      change_domains: ['local-tone'],
      method_class: stepTool === 'photoshop_paint_regions' ? 'region' : 'stroke',
      paint_strategy: {
        brush_role: 'edge-control',
        preset_name: preset,
      },
      steps: [{
        tool: stepTool,
        method_id: stepTool === 'photoshop_paint_regions' ? 'region-shape' : 'edge-stroke',
        region: 'localRegion',
        args: stepTool === 'photoshop_paint_regions'
          ? {
              opacity,
              color,
              regions: [{
                contours: [{
                  points: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }],
                }],
              }],
            }
          : { opacity, color, strokes },
      }],
    },
    problem_id: 'localRegion-edge',
    stage: 'FORM_AND_LIGHT',
    scale: 'small',
    change_domains: ['local-tone'],
    summary: 'Recover the localRegion edge.',
    purpose: 'Resolve the same bounded artistic problem.',
  };
}

function failedRecord(request: Record<string, any>, sequence = 1) {
  return {
    ...request,
    hash: 'fixture-' + sequence,
    sequence,
    created_at: new Date(sequence * 1000).toISOString(),
    completed_at: new Date(sequence * 1000 + 1).toISOString(),
    phase: 'completed',
    visual: true,
    failed: false,
    report: {
      did: 'Applied the bounded recovery pass.',
      why: 'Test recovery behavior.',
      result: 'The problem remained unresolved.',
    },
    verdict: {
      verdict: 'neutral',
      disposition: 'correct',
      target_resolved: 'no',
      significance: {
        execution_effect: 'material',
        global: { mean_abs_rgb_delta: 0.02 },
      },
      at: new Date(sequence * 1000 + 2).toISOString(),
    },
  };
}

describe('production artistic recovery policy', () => {
  it('delivers same-problem strategy outcomes through the existing continuation without fresh journal/state reads', () => {
    const { store } = fixture();
    store.write({ ...failedRecord(microplan('feedback-failed'), 1), strategy_family: 'cosmetic-surface' });
    const regressive = failedRecord(microplan('feedback-regressive'), 2);
    store.write({ ...regressive, strategy_family: 'contour-rebuild', rolled_back: true,
      verdict: { ...regressive.verdict, verdict: 'regression', disposition: 'rollback' },
    });
    const promising = failedRecord(microplan('feedback-promising'), 3);
    store.write({ ...promising, strategy_family: 'tonal-modeling', preview: { sha256: 'retained-frame' },
      verdict: { ...promising.verdict, verdict: 'improvement', disposition: 'accept' },
    });
    const unrelated = failedRecord(microplan('unrelated-failure'), 4);
    store.write({ ...unrelated, problem_id: 'other-problem', args: { ...unrelated.args, problem_id: 'other-problem' }, strategy_family: 'other-family' });
    store.updatePaintingState(42, current => ({ ...current,
      workflow_lifecycle: { status: 'active' }, active_problem: { problem_id: 'localRegion-edge', scale: 'small' },
    }));
    const projection = store.captureProjectionContext();
    const recovery = store.artisticRecoveryForProblem(42, 'localRegion-edge', undefined, projection.records, projection);
    expect(recovery.strategy_feedback).toMatchObject({
      failed: { families: ['cosmetic-surface'], omitted: 0 },
      regressive: { families: ['contour-rebuild'], omitted: 0 },
      promising: { families: ['tonal-modeling'], omitted: 0 },
      required_change: 'distinct_executable_strategy',
    });
    expect(recovery.strongest_known_frame).toEqual({ operation_id: 'feedback-promising', sha256: 'retained-frame' });
    vi.spyOn(store, 'records').mockImplementation(() => { throw new Error('unexpected journal rescan'); });
    vi.spyOn(store, 'paintingState').mockImplementation(() => { throw new Error('unexpected state reload'); });
    const action = store.closeOnlyNextRequiredAction(42, projection);
    expect(action).toContain('strategy_history=' + JSON.stringify(recovery.strategy_feedback));
    expect(action).not.toContain('other-family');
  });

  it('bounds strategy feedback bytes while retaining complete strategy identities for admission', () => {
    const { store } = fixture();
    for (let index = 0; index < 24; index++) {
      const record = failedRecord(microplan('bounded-family-' + index), index + 1);
      store.write({ ...record, strategy_family: index + '-' + '🔥'.repeat(100),
        verdict: { ...record.verdict,
          verdict: index % 3 === 1 ? 'regression' : index % 3 === 2 ? 'improvement' : 'neutral',
          disposition: index % 3 === 1 ? 'rollback' : index % 3 === 2 ? 'accept' : 'correct',
        },
      });
    }
    const recovery = store.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('next'));
    expect(recovery.strategy_families_tried).toHaveLength(24);
    for (const outcome of ['failed', 'regressive', 'promising']) {
      expect(recovery.strategy_feedback[outcome]).toMatchObject({ families: expect.any(Array), omitted: 5 });
      expect(recovery.strategy_feedback[outcome].families).toHaveLength(3);
      expect(recovery.strategy_feedback[outcome].families.every(label => label.endsWith('…'))).toBe(true);
    }
    expect(Buffer.byteLength(JSON.stringify(recovery.strategy_feedback), 'utf8')).toBeLessThan(1024);
  });

  it.each([
    { rolled_back: true },
    { current_frame_authority: false },
  ])('keeps failed history when a resolved attempt loses retained-frame authority: %j', invalidation => {
    const { store } = fixture();
    store.write(failedRecord(microplan('retained-stroke-failure'), 1));
    store.write(failedRecord(microplan('retained-region-failure', { stepTool: 'photoshop_paint_regions' }), 2));
    const candidate = failedRecord(microplan('invalidated-resolution'), 3);
    store.write({ ...candidate, ...invalidation,
      preview: { sha256: 'invalidated-frame' },
      verdict: { ...candidate.verdict, verdict: 'improvement', disposition: 'accept', target_resolved: 'yes' },
    });
    const projection = store.captureProjectionContext();
    const recovery = store.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('next'), projection.records, projection);
    expect(recovery).toMatchObject({
      attempt_count: 3, decision: 'block_dependent_problem', strongest_known_frame: null,
      preserve_useful_partial_work: false,
    });
    expect(store.read('invalidated-resolution').verdict.target_resolved).toBe('yes');
    const resolved = failedRecord(microplan('retained-resolution'), 4);
    store.write({ ...resolved,
      verdict: { ...resolved.verdict, verdict: 'improvement', disposition: 'accept', target_resolved: 'yes' },
    });
    expect(store.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('after-resolution'))).toBeNull();
  });

  it('does not advertise an accepted neutral or rolled-back improvement as useful retained work', () => {
    const { store } = fixture();
    const neutral = failedRecord(microplan('neutral-accepted'), 1);
    store.write({ ...neutral, preview: { sha256: 'neutral-frame' },
      verdict: { ...neutral.verdict, disposition: 'accept' },
    });
    const improvement = failedRecord(microplan('rolled-improvement'), 2);
    store.write({ ...improvement, rolled_back: true, preview: { sha256: 'rolled-frame' },
      verdict: { ...improvement.verdict, verdict: 'improvement', disposition: 'accept' },
    });
    expect(store.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('next'))).toMatchObject({
      attempt_count: 2, strongest_known_frame: null, preserve_useful_partial_work: false,
    });
  });

  it('does not treat color, opacity, preset, or primitive-count jitter as a distinct strategy', () => {
    const base = microplan('base');
    const jittered = microplan('jittered', {
      color: { red: 200, green: 30, blue: 60 },
      opacity: 83,
      strokeCount: 5,
      preset: 'Preset B',
    });
    const structurallyDifferent = microplan('region-strategy', {
      stepTool: 'photoshop_paint_regions',
      color: { red: 200, green: 30, blue: 60 },
      opacity: 83,
      preset: 'Preset B',
    });

    expect(visualStrategyFingerprint(jittered)).toBe(visualStrategyFingerprint(base));
    expect(visualStrategyFingerprint(structurallyDifferent)).not.toBe(visualStrategyFingerprint(base));
  });

  it('uses the authoritative policy in SessionStore preflight to block a parameter variant and admit a distinct strategy', () => {
    const { store } = fixture();
    const first = microplan('first-attempt');
    store.write(failedRecord(first));

    const jittered = microplan('parameter-variant', {
      color: { red: 210, green: 20, blue: 50 },
      opacity: 91,
      strokeCount: 7,
      preset: 'Different Preset',
    });
    const jitterErrors = store.collectPreflightErrors(jittered, { stateOnly: true });
    expect(jitterErrors.some(error => /artistic_recovery:.*distinct structural strategy/.test(error))).toBe(true);

    const distinct = microplan('distinct-region-strategy', { stepTool: 'photoshop_paint_regions' });
    const distinctErrors = store.collectPreflightErrors(distinct, { stateOnly: true });
    expect(distinctErrors.some(error => /artistic_recovery:/.test(error))).toBe(false);
  });

  it('reaches finite dependent termination after two distinct failed structural strategies while allowing explicit independent work', () => {
    const { store } = fixture();
    store.write(failedRecord(microplan('stroke-failure'), 1));
    store.write(failedRecord(microplan('region-failure', { stepTool: 'photoshop_paint_regions' }), 2));

    const dependent = microplan('third-dependent', { stepTool: 'photoshop_paint_regions' });
    const dependentResolution = store.artisticRecoveryForProblem(
      42,
      'localRegion-edge',
      dependent,
      undefined,
      undefined
    );
    expect(dependentResolution).toMatchObject({
      decision: 'block_dependent_problem',
      retry_allowed: false,
    });

    const independent = {
      ...microplan('independent-background'),
      independent_region: true,
      preservation_facts: ['The localRegion and focalForm layers are excluded from this background-only pass.'],
    };
    const independentResolution = store.artisticRecoveryForProblem(
      42,
      'localRegion-edge',
      independent,
      undefined,
      undefined
    );
    expect(independentResolution).toMatchObject({
      decision: 'continue_independent_work',
      retry_allowed: false,
    });
  });

  it('requires durable anchor bytes plus exact fresh current-frame observation before ignoring a critic alarm', () => {
    const { dir, store } = fixture();
    const anchorBytes = 'durable-anchor';
    const anchorPath = path.join(dir, 'anchor.jpg');
    writeFileSync(anchorPath, anchorBytes);
    const currentBytes = 'current-observation';
    const currentPath = path.join(dir, 'current.jpg');
    writeFileSync(currentPath, currentBytes);
    const currentSha = sha(currentBytes);

    store.updatePaintingState(42, current => ({
      ...current,
      primary_artistic_anchor: {
        operation_id: 'anchor-op',
        sha256: sha(anchorBytes),
        path: anchorPath,
      },
      current_frame: {
        operation_id: 'current-mutation',
        sha256: currentSha,
        path: currentPath,
      },
    }));
    store.write({
      id: 'fresh-observation',
      tool: 'photoshop_get_preview',
      args: { document_id: 42 },
      summary: 'Observe the current frame.',
      purpose: 'Provide exact counterevidence.',
      hash: 'fresh-observation',
      sequence: 1,
      created_at: '2026-09-25T00:00:00.000Z',
      completed_at: '2026-09-25T00:00:01.000Z',
      phase: 'completed',
      visual: false,
      failed: false,
      preview: {
        document_id: 42,
        sha256: currentSha,
        materialized_path: currentPath,
      },
    });

    const bare = store.artisticRecoveryResolution(42, {
      kind: 'critic_alarm',
      critic_alarm_evidence: {
        anchor_operation_id: 'anchor-op',
        observed_counterevidence: 'The current frame still preserves the protected large-value relationship.',
      },
    });
    expect(bare.decision).not.toBe('ignore_false_alarm');

    const verified = store.artisticRecoveryResolution(42, {
      kind: 'critic_alarm',
      critic_alarm_evidence: {
        anchor_operation_id: 'anchor-op',
        observation_operation_id: 'fresh-observation',
        observation_sha256: currentSha,
        observed_counterevidence: 'The current frame still preserves the protected large-value relationship.',
      },
    });
    expect(verified.decision).toBe('ignore_false_alarm');

    writeFileSync(currentPath, 'tampered-current-observation');
    const tampered = store.artisticRecoveryResolution(42, {
      kind: 'critic_alarm',
      critic_alarm_evidence: {
        anchor_operation_id: 'anchor-op',
        observation_operation_id: 'fresh-observation',
        observation_sha256: currentSha,
        observed_counterevidence: 'This prose alone must not override stale bytes.',
      },
    });
    expect(tampered.decision).not.toBe('ignore_false_alarm');
  });

  it('derives the same bounded recovery state after SessionStore restart', () => {
    const { dir, store } = fixture();
    store.write(failedRecord(microplan('restart-stroke-failure'), 1));
    store.write(failedRecord(microplan('restart-region-failure', { stepTool: 'photoshop_paint_regions' }), 2));
    const before = store.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('next'), undefined, undefined);

    const restarted = new SessionStore(path.join(dir, 'controller'), {
      visualBarrierDirectory: path.join(dir, 'barriers'),
      workspaceRoot: dir,
    });
    const after = restarted.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('next'), undefined, undefined);
    expect(after).toEqual(before);
    expect(after?.decision).toBe('block_dependent_problem');
  });

  it('projects durable per-problem corrective history and escalation debt from the journal', () => {
    const { store } = fixture();
    const first = {
      ...microplan('history-stroke'),
      causal_strategy_id: 'surface-mask',
      strategy_family: 'surface-cosmetic',
      causal_escalation_level: 0,
    };
    const second = {
      ...microplan('history-region', { stepTool: 'photoshop_paint_regions' }),
      causal_strategy_id: 'shape-rebuild',
      strategy_family: 'structural-shape',
      causal_escalation_level: 2,
      causal_level_change: true,
    };
    store.write(failedRecord(first, 1));
    store.write({
      ...failedRecord(second, 2),
      verdict: {
        ...failedRecord(second, 2).verdict,
        verdict: 'regression',
        disposition: 'rollback',
      },
    });

    const recovery = store.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('history-next'));
    expect(recovery).toMatchObject({
      attempt_count: 2,
      consecutive_unresolved: 2,
      same_primary_mismatch_count: 2,
      strategy_families_tried: ['surface-cosmetic', 'structural-shape'],
      regression_count: 1,
      rollback_count: 1,
      current_escalation_level: 2,
      minimum_required_next_level: 3,
    });
  });

  it('binds repeated unresolved correction to the active construction-plan stage exit condition', () => {
    const { store } = fixture();
    store.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        directive_id: 'primaryForm-rebuild',
        status: 'active',
        review_due: false,
        tasks: [{
          task_id: 'localRegion-edge',
          status: 'active',
          allowed_scales: ['small'],
          construction_plan: {
            representation_strategy: 'Rebuild the primary silhouette before surface breakup.',
            structural_features: ['readable outer contour', 'intentional negative-space cuts'],
            stage_exit_condition: 'The primary silhouette reads without texture or edge noise.',
          },
        }],
      },
    }));
    const first = {
      ...microplan('exit-soften-1'),
      planner_directive_id: 'primaryForm-rebuild',
      planner_task_id: 'localRegion-edge',
      painter_scope: 'local',
      causal_strategy_id: 'surface-soften',
      strategy_family: 'surface-cosmetic',
      causal_escalation_level: 0,
    };
    const second = {
      ...microplan('exit-soften-2', { preset: 'Preset B' }),
      planner_directive_id: 'primaryForm-rebuild',
      planner_task_id: 'localRegion-edge',
      painter_scope: 'local',
      causal_strategy_id: 'surface-breakup',
      strategy_family: 'surface-cosmetic',
      causal_escalation_level: 1,
    };
    store.write(failedRecord(first, 1));
    store.write(failedRecord(second, 2));

    const dependentDetail = {
      ...microplan('exit-more-detail'),
      planner_directive_id: 'primaryForm-rebuild',
      planner_task_id: 'localRegion-edge',
      painter_scope: 'local',
      causal_strategy_id: 'surface-detail',
      strategy_family: 'surface-cosmetic',
      causal_escalation_level: 1,
    };
    const errors = store.collectPreflightErrors(dependentDetail, { stateOnly: true });
    expect(errors.some(error =>
      error.includes('causal_strategy_exhausted:')
      && error.includes('The primary silhouette reads without texture or edge noise.')
      && error.includes('dependent cosmetic/detail work')
    )).toBe(true);

    const structuralRebuild = {
      ...dependentDetail,
      id: 'exit-structural-rebuild',
      causal_strategy_id: 'silhouette-rebuild',
      strategy_family: 'structural-shape',
    };
    expect(store.collectPreflightErrors(structuralRebuild, { stateOnly: true }).some(error =>
      error.startsWith('causal_strategy_exhausted:')
    )).toBe(false);
  });

  it('allows only one cosmetic exploratory correction for a persistent structural mismatch', () => {
    const { store } = fixture();
    const cosmetic = {
      ...microplan('primaryForm-cosmetic-1'),
      problem_id: 'primaryForm-silhouette',
      args: { ...microplan('primaryForm-cosmetic-1').args, problem_id: 'primaryForm-silhouette' },
      causal_strategy_id: 'surface-breakup',
      strategy_family: 'surface-cosmetic',
      causal_escalation_level: 1,
    };
    store.write({
      ...failedRecord(cosmetic, 1),
      verdict: {
        ...failedRecord(cosmetic, 1).verdict,
        primary_mismatch: 'The polygonal primaryForm silhouette and negative space remain structurally wrong.',
      },
    });

    const anotherCosmetic = {
      ...microplan('primaryForm-cosmetic-2', { preset: 'Preset B' }),
      problem_id: 'primaryForm-silhouette',
      args: { ...microplan('primaryForm-cosmetic-2', { preset: 'Preset B' }).args, problem_id: 'primaryForm-silhouette' },
      causal_strategy_id: 'edge-noise-stamps',
      strategy_family: 'surface-cosmetic',
      causal_escalation_level: 2,
    };
    expect(store.collectPreflightErrors(anotherCosmetic, { stateOnly: true }).some(error =>
      error.includes('already consumed its one bounded cosmetic exploratory correction')
    )).toBe(true);

    const structuralRebuild = {
      ...anotherCosmetic,
      id: 'primaryForm-structural-rebuild',
      causal_strategy_id: 'negative-space-carve',
      strategy_family: 'structural-shape',
    };
    expect(store.collectPreflightErrors(structuralRebuild, { stateOnly: true }).some(error =>
      error.includes('bounded cosmetic exploratory correction')
    )).toBe(false);
  });

  it('does not require a numerical causal escalation label for a safe structural repair', () => {
    const { store } = fixture();
    const cosmetic = {
      ...microplan('primaryForm-label-free-cosmetic'),
      problem_id: 'primaryForm-label-free',
      args: { ...microplan('primaryForm-label-free-cosmetic').args, problem_id: 'primaryForm-label-free' },
      causal_strategy_id: 'surface-breakup',
      strategy_family: 'surface-cosmetic',
    };
    store.write({
      ...failedRecord(cosmetic, 1),
      verdict: {
        ...failedRecord(cosmetic, 1).verdict,
        primary_mismatch: 'The polygonal primaryForm silhouette and negative space remain structurally wrong.',
      },
    });

    const structuralBase = microplan('primaryForm-label-free-structural', { stepTool: 'photoshop_paint_regions' });
    const structural = {
      ...structuralBase,
      problem_id: 'primaryForm-label-free',
      args: { ...structuralBase.args, problem_id: 'primaryForm-label-free' },
      causal_strategy_id: 'negative-space-rebuild',
      strategy_family: 'structural-shape',
    };
    expect(store.collectPreflightErrors(structural, { stateOnly: true }).some(error =>
      error.startsWith('causal_strategy_exhausted:')
    )).toBe(false);
  });

  it('does not turn attempt count into an artistic veto for a genuinely distinct visual strategy', () => {
    // The maintained sceneA-primaryForm benchmark below keeps the motivating
    // bad-scaffold failure shape measurable rather than only testing the gate in isolation.
    const { store } = fixture();
    store.write(failedRecord(microplan('stroke-failure'), 1));
    store.write(failedRecord(microplan('region-failure', { stepTool: 'photoshop_paint_regions' }), 2));

    const distinctBase = microplan('third-distinct', {
      stepTool: 'photoshop_paint_regions',
      color: { red: 12, green: 34, blue: 56 },
    });
    const distinct = {
      ...distinctBase,
      causal_strategy_id: 'topology-rebuild',
      strategy_family: 'structural-topology',
    };
    expect(store.collectPreflightErrors(distinct, { stateOnly: true })).toEqual([]);

    store.write(failedRecord(distinct, 3));
    const fourthBase = microplan('fourth-causal', {
      stepTool: 'photoshop_paint_regions',
      color: { red: 210, green: 180, blue: 140 },
    });
    const fourth = {
      ...fourthBase,
      causal_strategy_id: 'negative-space-recompose',
      strategy_family: 'structural-negative-space',
    };
    expect(store.collectPreflightErrors(fourth, { stateOnly: true })).toEqual([]);

    const exhaustedReuse = microplan('reuse-exhausted', { stepTool: 'photoshop_paint_regions' });
    expect(store.collectPreflightErrors(exhaustedReuse, { stateOnly: true }).some(error =>
      /cannot reuse an exhausted causal strategy/.test(error)
    )).toBe(true);
  });

  it('benchmarks sceneA primaryForm correction and forces structural escalation after one cosmetic attempt', () => {
    const { store } = fixture();
    const problemId = 'sceneA-primaryForm-silhouette';
    const makeAttempt = (id: string, strategy: string, family: string, level: number) => {
      const base = microplan(id);
      return { ...base, problem_id: problemId, args: { ...base.args, problem_id: problemId },
        causal_strategy_id: strategy, strategy_family: family, causal_escalation_level: level,
        causal_level_change: level >= 3 };
    };
    const first = makeAttempt('primaryForm-surface-breakup', 'surface-breakup', 'surface-cosmetic', 1);
    const failed = failedRecord(first, 1);
    store.write({ ...failed, verdict: { ...failed.verdict,
      primary_mismatch: 'The polygonal primaryForm silhouette and negative space remain structurally wrong.' } });

    const second = makeAttempt('primaryForm-edge-noise', 'edge-noise-stamps', 'surface-cosmetic', 2);
    const structural = makeAttempt('primaryForm-negative-space-rebuild', 'negative-space-carve', 'structural-shape', 3);
    const secondBlocked = store.collectPreflightErrors(second, { stateOnly: true })
      .some(error => error.startsWith('causal_strategy_exhausted:'));
    const structuralBlocked = store.collectPreflightErrors(structural, { stateOnly: true })
      .some(error => error.startsWith('causal_strategy_exhausted:'));
    const history = store.artisticRecoveryForProblem(42, problemId, structural);

    expect({
      total_attempts_considered: 3,
      same_problem_attempts_before_structural_escalation: 2,
      admitted_failed_attempts_before_structural_escalation: history?.attempt_count,
      second_cosmetic_rejected_before_dispatch: secondBlocked,
      structural_escalation_admitted: !structuralBlocked,
    }).toEqual({
      total_attempts_considered: 3,
      same_problem_attempts_before_structural_escalation: 2,
      admitted_failed_attempts_before_structural_escalation: 1,
      second_cosmetic_rejected_before_dispatch: true,
      structural_escalation_admitted: true,
    });
  });

  it('clears strategy debt after a successful resolution without erasing unrelated history', () => {
    const { store } = fixture();
    store.write(failedRecord(microplan('failed-before-success'), 1));
    store.write({
      ...failedRecord(microplan('successful-resolution'), 2),
      verdict: {
        verdict: 'improvement',
        disposition: 'accept',
        target_resolved: 'yes',
        significance: {
          execution_effect: 'material',
          global: { mean_abs_rgb_delta: 0.03 },
        },
        at: new Date(2002).toISOString(),
      },
    });
    store.write(failedRecord({
      ...microplan('unrelated-history'),
      problem_id: 'unrelated-problem',
      args: { ...microplan('unrelated-history').args, problem_id: 'unrelated-problem' },
    }, 3));

    expect(store.artisticRecoveryForProblem(42, 'localRegion-edge', microplan('next'))).toBeNull();
    expect(store.artisticRecoveryForProblem(42, 'unrelated-problem', {
      ...microplan('next-unrelated'),
      problem_id: 'unrelated-problem',
      args: { ...microplan('next-unrelated').args, problem_id: 'unrelated-problem' },
    })?.decision).toBe('require_distinct_strategy');
  });
});
