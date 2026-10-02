import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { guardCapabilities } from '../src/core/guard/guard-capabilities.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'visual-review-escalation-state-'));
  dirs.push(dir);
  const controller = path.join(dir, 'controller');
  const store = new SessionStore(controller, {
    visualBarrierDirectory: path.join(dir, 'barriers'),
    workspaceRoot: dir,
  });
  const whole = path.join(dir, 'whole.jpg');
  writeFileSync(whole, 'whole-frame');
  store.write({
    id: 'review-op',
    tool: 'photoshop_set_layer_opacity',
    args: { document_id: 42, opacity: 70 },
    summary: 'Review state fixture',
    purpose: 'Exercise durable multiscale review state',
    hash: 'review-op-hash',
    sequence: 1,
    created_at: '2026-09-24T07:00:00.000Z',
    completed_at: '2026-09-24T07:00:01.000Z',
    phase: 'completed',
    execution: 'completed',
    visual: true,
    failed: false,
    visual_review_profile: {
      level: 'composition',
      whole_max_dimension_px: 1600,
      require_region: false,
      require_before_after: false,
      focus_max_dimension_px: null,
      reasons: ['global scale uses composition review'],
    },
    preview: {
      sha256: 'a'.repeat(64),
      materialized_path: whole,
      document_id: 42,
      width: 400,
      height: 300,
      canvas_width: 400,
      canvas_height: 300,
      scale_x: 1,
      scale_y: 1,
    },
  });
  return { dir, controller, store };
}

function capturedPreview(dir: string, capture: any, patch: Record<string, unknown> = {}) {
  const crop = path.join(dir, `${capture.capture_id ?? capture.role}.jpg`);
  const cropBytes = Buffer.from(`${capture.role}:${JSON.stringify(capture.requested_region)}`);
  writeFileSync(crop, cropBytes);
  return {
    sha256: 'a'.repeat(64),
    materialized_path: path.join(dir, 'whole.jpg'),
    document_id: 42,
    width: 400,
    height: 300,
    canvas_width: 400,
    canvas_height: 300,
    focus: {
      sha256: createHash('sha256').update(cropBytes).digest('hex'),
      materialized_path: crop,
      region: capture.effective_region,
      width: capture.effective_region.right - capture.effective_region.left,
      height: capture.effective_region.bottom - capture.effective_region.top,
      scale_x: 1,
      scale_y: 1,
    },
    ...patch,
  };
}

describe('durable multiscale review escalation state', () => {
  it('carries named-object brief identity through OBJECT crop capture provenance', () => {
    const { dir, store } = fixture();
    const plan = store.planReviewEscalation('review-op', [{
      kind: 'object_readability',
      severity: 'must-fix',
      region_bounds: { left: 40, top: 50, right: 180, bottom: 210 },
      brief_item_id: 'guardian-lion',
      brief_state: 'UNCERTAIN',
    }], { persist: true }) as any;
    expect(plan.captures).toHaveLength(1);
    expect(plan.captures[0]).toMatchObject({
      level: 'object',
      brief_item_id: 'guardian-lion',
      brief_state: 'UNCERTAIN',
    });
    const evidence = store.attachReviewEvidence('review-op', plan.captures[0], capturedPreview(dir, plan.captures[0])) as any;
    expect(evidence).toMatchObject({
      review_level: 'object',
      brief_item_id: 'guardian-lion',
      brief_state: 'UNCERTAIN',
      bound_whole_sha256: expect.any(String),
      artifact_id: expect.any(String),
    });
  });
  it('persists structured overview uncertainty as OBJECT review debt across restart without parsing free text', () => {
    const { dir, controller, store } = fixture();
    const region = { left: 80, top: 60, right: 220, bottom: 190 };
    const plan = store.planReviewEscalation('review-op', [], {
      persist: true,
      target_resolved: 'uncertain',
      uncertainty_review: { after_level: 'composition', region_bounds: region },
    }) as any;
    expect(plan.required).toBe(true);
    expect(plan.required_review_level).toBe('object');
    expect(plan.captures[0]).toMatchObject({
      kind: 'runtime_uncertainty',
      level: 'object',
      requested_region: region,
    });
    expect(store.read('review-op')?.pending_review).toMatchObject({
      trigger: 'runtime_uncertainty',
      uncertainty_after_level: 'composition',
      required_review_level: 'object',
    });

    const restarted = new SessionStore(controller, dir);
    expect((restarted.read('review-op') as any).pending_review).toMatchObject({
      trigger: 'runtime_uncertainty',
      required_review_level: 'object',
    });
    expect((restarted.planReviewEscalation as any)('review-op', [], { persist: false }).required).toBe(true);
  });

  it('requires explicit structured coordinates for uncertainty escalation and never derives them from prose', () => {
    const { store } = fixture();
    expect(() => store.planReviewEscalation('review-op', [], {
      persist: false,
      target_resolved: 'uncertain',
      uncertainty_review: { after_level: 'composition' },
    })).toThrow(/requires exact uncertainty_review\.region_bounds/);
    expect(store.planReviewEscalation('review-op', [], { persist: false })).toMatchObject({ required: false });
  });

  it('bounds each round to two captures, prioritizes blocking findings and deduplicates overlapping regions', () => {
    const { store } = fixture();
    const plan = store.planReviewEscalation('review-op', [
      {
        kind: 'object_readability',
        severity: 'must-fix',
        region_bounds: { left: 50, top: 50, right: 150, bottom: 150 },
      },
      {
        kind: 'edge_transition',
        severity: 'should-fix',
        region_bounds: { left: 60, top: 60, right: 140, bottom: 140 },
      },
      {
        kind: 'proportion',
        severity: 'should-fix',
        region_bounds: { left: 220, top: 80, right: 300, bottom: 180 },
      },
      {
        kind: 'small_artifact',
        severity: 'optional',
        region_bounds: { left: 320, top: 200, right: 350, bottom: 230 },
      },
    ]) as any;

    expect(plan.required).toBe(true);
    expect(plan.captures).toHaveLength(2);
    expect(plan.captures[0]).toMatchObject({
      kind: 'edge_transition',
      severity: 'must-fix',
      level: 'micro',
      requested_region: { left: 50, top: 50, right: 150, bottom: 150 },
    });
    expect(plan.captures[1]).toMatchObject({ kind: 'proportion', level: 'object' });
    expect(plan.remaining_after_round).toBe(1);
  });

  it('rejects wrong-document and stale-whole-SHA crop evidence', () => {
    const { dir, store } = fixture();
    const plan = store.planReviewEscalation('review-op', [{
      kind: 'edge_transition',
      region_bounds: { left: 100, top: 80, right: 160, bottom: 140 },
    }], { persist: true }) as any;
    const capture = plan.captures[0];

    expect(() => store.attachReviewEvidence('review-op', capture, capturedPreview(dir, capture, {
      document_id: 99,
    }))).toThrow(/does not match pinned document/);
    expect(() => store.attachReviewEvidence('review-op', capture, capturedPreview(dir, capture, {
      sha256: 'd'.repeat(64),
    }))).toThrow(/whole-frame SHA changed/);
  });

  it('restores pending review requirements and exact crop evidence after restart without replaying mutation state', () => {
    const { dir, controller, store } = fixture();
    const requested = { left: 100, top: 80, right: 160, bottom: 140 };
    const plan = store.planReviewEscalation('review-op', [{
      kind: 'edge_transition',
      severity: 'must-fix',
      region_bounds: requested,
    }], { persist: true }) as any;
    const capture = plan.captures[0];
    store.attachReviewEvidence('review-op', capture, capturedPreview(dir, capture));

    const restarted = new SessionStore(controller, {
      visualBarrierDirectory: path.join(dir, 'barriers'),
      workspaceRoot: dir,
    });
    const status = restarted.statusCompact() as any;
    const pending = status.pending_visual_verdict_details.find((item: any) => item.operation_id === 'review-op');
    expect(pending.review_state).toMatchObject({
      operation_id: 'review-op',
      document_id: 42,
      bound_whole_sha256: 'a'.repeat(64),
      required_review_level: 'micro',
      state: 'awaiting_observation',
    });
    expect(pending.review_evidence[0]).toMatchObject({
      requested_region: requested,
      effective_region: { left: 88, top: 68, right: 172, bottom: 152 },
      canvas_width: 400,
      canvas_height: 300,
      bound_whole_sha256: 'a'.repeat(64),
      review_level: 'micro',
      scale: { x: 1, y: 1 },
      resolution_policy: 'native-or-downsampled-no-new-detail-by-upscaling',
    });
    expect((restarted.planReviewEscalation as any)('review-op', [], { persist: false }).required).toBe(false);
    expect((restarted.resume(42) as any).pending_visual_verdict.review_state.state).toBe('awaiting_observation');
    expect((restarted.resume(42) as any).pending_visual_verdict.review_evidence[0]).toMatchObject({
      canvas_width: 400,
      canvas_height: 300,
      requested_region: requested,
      effective_region: { left: 88, top: 68, right: 172, bottom: 152 },
      scale: { x: 1, y: 1 },
    });
  });

  it('keeps source-document crop coordinates invariant when the whole-frame overview resolution changes', () => {
    const high = fixture();
    const low = fixture();
    const highRecord = high.store.read('review-op')!;
    highRecord.visual_review_profile.whole_max_dimension_px = 1600;
    highRecord.preview.width = 400;
    highRecord.preview.height = 300;
    highRecord.preview.scale_x = 1;
    highRecord.preview.scale_y = 1;
    high.store.write(highRecord);
    const lowRecord = low.store.read('review-op')!;
    lowRecord.visual_review_profile.whole_max_dimension_px = 800;
    lowRecord.preview.width = 200;
    lowRecord.preview.height = 150;
    lowRecord.preview.scale_x = 0.5;
    lowRecord.preview.scale_y = 0.5;
    low.store.write(lowRecord);

    const finding = {
      kind: 'edge_transition',
      severity: 'must-fix',
      region_bounds: { left: 2.4, top: 3.6, right: 52.1, bottom: 43.2 },
    };
    const highPlan = high.store.planReviewEscalation('review-op', [finding], { persist: true }) as any;
    const lowPlan = low.store.planReviewEscalation('review-op', [finding], { persist: true }) as any;
    expect(highPlan.captures[0].requested_region).toEqual({ left: 2, top: 3, right: 53, bottom: 44 });
    expect(highPlan.captures[0].effective_region).toEqual({ left: 0, top: 0, right: 65, bottom: 56 });
    expect(lowPlan.captures[0].requested_region).toEqual(highPlan.captures[0].requested_region);
    expect(lowPlan.captures[0].effective_region).toEqual(highPlan.captures[0].effective_region);

    const highPreview = capturedPreview(high.dir, highPlan.captures[0]);
    const lowPreview = capturedPreview(low.dir, lowPlan.captures[0]);
    lowPreview.width = 200;
    lowPreview.height = 150;
    lowPreview.scale_x = 0.5;
    lowPreview.scale_y = 0.5;
    lowPreview.focus.width = Math.ceil(lowPreview.focus.width / 2);
    lowPreview.focus.height = Math.ceil(lowPreview.focus.height / 2);
    lowPreview.focus.scale_x = 0.5;
    lowPreview.focus.scale_y = 0.5;
    const highEvidence = high.store.attachReviewEvidence('review-op', highPlan.captures[0], highPreview) as any;
    const lowEvidence = low.store.attachReviewEvidence('review-op', lowPlan.captures[0], lowPreview) as any;

    expect(lowEvidence.requested_region).toEqual(highEvidence.requested_region);
    expect(lowEvidence.effective_region).toEqual(highEvidence.effective_region);
    expect(highEvidence).toMatchObject({ canvas_width: 400, canvas_height: 300, scale: { x: 1, y: 1 } });
    expect(lowEvidence).toMatchObject({ canvas_width: 400, canvas_height: 300, scale: { x: 0.5, y: 0.5 } });
    expect(lowEvidence.resolution_policy).toBe('native-or-downsampled-no-new-detail-by-upscaling');

    const restartedLow = new SessionStore(low.controller, {
      visualBarrierDirectory: path.join(low.dir, 'barriers'),
      workspaceRoot: low.dir,
    });
    const durable = (restartedLow.read('review-op') as any).review_evidence[0];
    expect(durable.requested_region).toEqual(highEvidence.requested_region);
    expect(durable.effective_region).toEqual(highEvidence.effective_region);
    expect(durable).toMatchObject({ canvas_width: 400, canvas_height: 300, scale: { x: 0.5, y: 0.5 } });
  });

  it('invalidates persisted crop evidence after deletion or byte replacement and accepts only the unchanged file', () => {
    const { dir, controller, store } = fixture();
    const finding = {
      kind: 'edge_transition',
      severity: 'must-fix',
      region_bounds: { left: 100, top: 80, right: 160, bottom: 140 },
    };
    const plan = store.planReviewEscalation('review-op', [finding], { persist: true }) as any;
    const capture = plan.captures[0];
    const preview = capturedPreview(dir, capture);
    store.attachReviewEvidence('review-op', capture, preview);
    const cropPath = preview.focus.materialized_path;

    const unchanged = new SessionStore(controller, {
      visualBarrierDirectory: path.join(dir, 'barriers'),
      workspaceRoot: dir,
    });
    expect((unchanged.planReviewEscalation as any)('review-op', [], { persist: false }).required).toBe(false);

    rmSync(cropPath);
    const afterDeletion = new SessionStore(controller, {
      visualBarrierDirectory: path.join(dir, 'barriers'),
      workspaceRoot: dir,
    });
    const deletedPlan = (afterDeletion.planReviewEscalation as any)('review-op', [], { persist: false });
    expect(deletedPlan.required).toBe(true);
    expect(deletedPlan.requirements[0]).toMatchObject({
      status: 'pending',
      evidence_state: 'artifact_missing_or_corrupt',
    });

    writeFileSync(cropPath, 'replacement-bytes');
    const afterReplacement = new SessionStore(controller, {
      visualBarrierDirectory: path.join(dir, 'barriers'),
      workspaceRoot: dir,
    });
    const replacementPlan = (afterReplacement.planReviewEscalation as any)('review-op', [], { persist: true });
    expect(replacementPlan.required).toBe(true);
    expect(replacementPlan.requirements[0]).toMatchObject({
      status: 'pending',
      evidence_state: 'artifact_missing_or_corrupt',
    });
    expect(replacementPlan.captures[0].capture_id).not.toBe(capture.capture_id);
    afterReplacement.attachReviewEvidence(
      'review-op',
      replacementPlan.captures[0],
      capturedPreview(dir, replacementPlan.captures[0])
    );
    const recaptured = afterReplacement.read('review-op') as any;
    expect(recaptured.review_evidence).toHaveLength(2);
    expect(recaptured.review_evidence[0].materialized_path).toBe(cropPath);
    expect(recaptured.review_evidence[1].materialized_path).not.toBe(cropPath);
    expect((afterReplacement.planReviewEscalation as any)('review-op', [], { persist: false }).required).toBe(false);
  });

  it('requires fresh evidence when the requested region changes', () => {
    const { dir, store } = fixture();
    const firstPlan = store.planReviewEscalation('review-op', [{
      kind: 'edge_transition',
      region_bounds: { left: 100, top: 80, right: 160, bottom: 140 },
    }], { persist: true }) as any;
    store.attachReviewEvidence('review-op', firstPlan.captures[0], capturedPreview(dir, firstPlan.captures[0]));

    const changed = store.planReviewEscalation('review-op', [{
      kind: 'edge_transition',
      region_bounds: { left: 220, top: 120, right: 270, bottom: 170 },
    }], { persist: false }) as any;
    expect(changed.required).toBe(true);
    expect(changed.captures.some((capture: any) => capture.requested_region.left === 220)).toBe(true);
  });

  it('keeps accepted review artifacts immutable across escalation rounds and restart', () => {
    const { dir, controller, store } = fixture();
    const findings = [
      {
        kind: 'proportion',
        severity: 'must-fix',
        region_bounds: { left: 20, top: 30, right: 90, bottom: 120 },
      },
      {
        kind: 'proportion',
        severity: 'must-fix',
        region_bounds: { left: 150, top: 40, right: 220, bottom: 130 },
      },
      {
        kind: 'proportion',
        severity: 'must-fix',
        region_bounds: { left: 280, top: 70, right: 350, bottom: 160 },
      },
    ];

    const firstRound = store.planReviewEscalation('review-op', findings, { persist: true }) as any;
    expect(firstRound.captures).toHaveLength(2);
    for (const capture of firstRound.captures) {
      store.attachReviewEvidence('review-op', capture, capturedPreview(dir, capture));
    }

    const afterFirstRound = store.read('review-op') as any;
    const firstEvidence = afterFirstRound.review_evidence[0];
    const secondEvidence = afterFirstRound.review_evidence[1];
    const firstBytesBefore = readFileSync(firstEvidence.materialized_path);
    const secondBytesBefore = readFileSync(secondEvidence.materialized_path);
    expect(afterFirstRound.pending_review.requirements.filter((item: any) => item.status === 'captured')).toHaveLength(2);
    expect(afterFirstRound.pending_review.requirements.filter((item: any) => item.status === 'pending')).toHaveLength(1);

    const secondRound = store.planReviewEscalation('review-op', [], { persist: true }) as any;
    expect(secondRound.captures).toHaveLength(1);
    store.attachReviewEvidence('review-op', secondRound.captures[0], capturedPreview(dir, secondRound.captures[0]));

    const complete = store.read('review-op') as any;
    expect(complete.review_evidence).toHaveLength(3);
    expect(new Set(complete.review_evidence.map((item: any) => item.materialized_path)).size).toBe(3);
    expect(new Set(complete.review_evidence.map((item: any) => item.capture_id)).size).toBe(3);
    expect(complete.review_evidence.every((item: any) =>
      item.source_operation_id === 'review-op'
      && typeof item.requirement_id === 'string'
      && item.requirement_id.length === 64
      && typeof item.artifact_id === 'string'
      && item.artifact_id.length === 64
    )).toBe(true);
    expect(readFileSync(firstEvidence.materialized_path)).toEqual(firstBytesBefore);
    expect(readFileSync(secondEvidence.materialized_path)).toEqual(secondBytesBefore);
    expect(complete.pending_review.requirements.every((item: any) => item.status === 'captured')).toBe(true);
    expect((store.planReviewEscalation as any)('review-op', [], { persist: false }).required).toBe(false);

    const restarted = new SessionStore(controller, {
      visualBarrierDirectory: path.join(dir, 'barriers'),
      workspaceRoot: dir,
    });
    const restartedRecord = restarted.read('review-op') as any;
    expect(restartedRecord.review_evidence).toHaveLength(3);
    expect(new Set(restartedRecord.review_evidence.map((item: any) => item.materialized_path)).size).toBe(3);
    expect(restartedRecord.review_capture_sequence).toBe(3);
    expect((restarted.planReviewEscalation as any)('review-op', [], { persist: false }).required).toBe(false);
  });

  it('reports review_findings as an additive compact-v2 capability rather than a protocol replacement', () => {
    const caps = guardCapabilities() as any;
    const compact = caps.cycle_compiler.compact_model_contract;
    expect(compact.optional_previous_observation).toContain('review_findings');
    expect(compact.optional_previous_observation).toContain('softness_review');
    expect(compact.multiscale_visual_review).toMatchObject({
      levels: ['composition', 'object', 'micro'],
      whole_frame_always_required: true,
      structured_review_findings: true,
      read_only_crop_escalation_same_operation: true,
      review_findings_additive_to_compact_v2: true,
      max_new_escalation_crops_per_round: 2,
    });
    expect(compact.soft_dominance_review).toMatchObject({
      exact_current_frame: true,
      contextual_not_sharpness_score: true,
      broad_soft_nontrivial_required: true,
      visual_problem_integration: true,
      primitive_footprint_integration: true,
    });
  });
});
