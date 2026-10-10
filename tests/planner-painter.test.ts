import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { parseVisualMicroPlan } from '../src/core/visual-microplan.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'planner-painter-'));
  dirs.push(dir);
  return storeAt(dir);
}

function storeAt(dir: string) {
  return new SessionStore(path.join(dir, 'controller'), {
    visualBarrierDirectory: path.join(dir, 'barriers'),
  });
}

it.each([
  { disposition: 'correct', verdict: 'neutral', completed: false },
  { disposition: 'rollback', verdict: 'regression', completed: false },
  { disposition: 'accept', verdict: 'neutral', completed: true },
])('keeps Planner completion on retained pixels: $disposition/$verdict', ({ disposition, verdict, completed }) => {
  const s = store();
  const state = s.advanceArtDirectorAfterVerdict({
    art_director: {
      directive_id: 'retained-task', status: 'active', current_task_id: 'form', review_after_microplans: 8,
      tasks: [{ task_id: 'form', status: 'active' }, { task_id: 'material', status: 'pending' }],
    },
  }, {
    planner_directive_id: 'retained-task', planner_task_id: 'form', stage: 'FORM',
  }, {
    disposition, verdict, target_resolved: 'yes', regressions: [],
    planner_task_assessment: { status: 'completed', evidence_scope: 'task', evidence: ['The form task appears complete.'] },
  }, { id: 'form-attempt', verdict: {} });
  expect(state.art_director.tasks[0].status).toBe(completed ? 'completed' : disposition === 'rollback' ? 'failed' : 'active');
  expect(state.art_director.current_task_id).toBe(completed ? 'material' : 'form');
  expect(state.art_director.tasks[1].status).toBe(completed ? 'active' : 'pending');
});

function seedClassifiedFrame(
  s: SessionStore,
  id: string,
  sequence: number,
  options: { current?: boolean; accepted?: boolean } = { current: true, accepted: true }
) {
  const frameBytes = Buffer.from('planner-painter-frame:' + id);
  const framePath = path.join(s.directory, 'frames', id + '.jpg');
  mkdirSync(path.dirname(framePath), { recursive: true });
  writeFileSync(framePath, frameBytes);
  const frame = {
    operation_id: id,
    sha256: createHash('sha256').update(frameBytes).digest('hex'),
    path: framePath,
    accepted: options.accepted !== false,
    acceptance_scope: 'pixels_retained_not_goal_confirmation',
    goal_confirmation: 'unresolved',
  };
  s.write({
    id,
    tool: 'photoshop_set_layer_opacity',
    args: { document_id: 42, opacity: 50 },
    summary: 'Fixture ' + id,
    purpose: 'Provide classified artistic frame evidence for Planner tests',
    hash: 'hash-' + id,
    sequence,
    created_at: new Date(sequence * 1000).toISOString(),
    completed_at: new Date(sequence * 1000 + 1).toISOString(),
    phase: 'completed',
    visual: true,
    failed: false,
    preview: {
      sha256: frame.sha256,
      materialized_path: frame.path,
      document_id: 42,
    },
    verdict: {
      disposition: options.accepted === false ? 'correct' : 'accept',
      verdict: options.accepted === false ? 'neutral' : 'improvement',
      at: new Date(sequence * 1000 + 2).toISOString(),
    },
  });
  s.updatePaintingState(42, current => ({
    ...current,
    ...(options.current === false ? {} : { current_frame: frame }),
    ...(options.accepted === false ? {} : { accepted_frame: frame }),
  }));
  return frame;
}

function assessment() {
  return {
    composition: 'Stable centered focalStudy with enough breathing room.',
    focal_hierarchy: 'FocalForm is primary, segmentsB secondary, background tertiary.',
    large_value_masses: 'FocalForm/light mass needs separation from dark coat and backgroundField.',
    lighting: 'Warm key from upper left; shadow side should stay coherent.',
    silhouette: 'PrimaryForm and shoulder silhouette is readable against the backgroundField.',
    depth: 'FocalForm forward, segmentsB middle, secondaryForm and backgroundField back.',
    likeness_main_shape: 'Main primaryForm proportions are stable and must not drift.',
    overall_detail_level: 'Medium development; avoid premature textureRegion detail.',
    mood: 'Quiet, weathered, contemplative rather than theatrical.',
    color_relationships: 'Warm focalForm accents against restrained cool backgroundField and raincoat notes.',
    shape_language: 'Broad naturalistic masses with selective angular weathered accents.',
    edge_hierarchy: 'Hardest edges stay near the focalForm and segmentsB; background transitions remain soft or lost.',
    intentional_omission: 'Background detail and secondary texture stay understated to preserve focus.',
    next_priority: 'Strengthen the focalForm focal hierarchy without moving major masses.',
  };
}

function passingValueCheck() {
  return {
    status: 'style-not-applicable',
    observed: false,
    applicability_reason: 'Planner/Painter unit tests isolate directive routing and do not exercise the separate grayscale evidence gate.',
    style_contract_basis: {
      field: 'finish_criteria',
      criterion: 'coherent expressive hierarchy without over-rendering the background',
    },
    limitations: ['Synthetic controller test; value evidence is covered by value-check.test.ts.'],
  };
}

function directive(id = 'focalForm-focus', reviewAfter = 3) {
  return {
    directive_id: id,
    goal: 'Strengthen the focalForm as the primary focal center.',
    style_contract: {
      realism_level: 'naturalistic painterly realism',
      edge_policy: 'selective hard focal edges with soft/lost peripheral transitions',
      color_policy: 'restrained cool-warm harmony with warm focal accents',
      detail_density: 'high only near focal focalForm and segmentsB',
      finish_criteria: 'coherent expressive hierarchy without over-rendering the background',
    },
    prompt_conflict_preflight: {
      dominant_objective: 'Naturalistic painterly focal hierarchy on the focalForm.',
      secondary_traits: ['restrained cool-warm harmony', 'selective detail'],
      conflicts: [],
      resolution_mode: 'none',
      chosen_rendering_strategy: 'Build form and focal hierarchy with value, light and selective edges before decorative detail.',
      resolution_rationale: 'The synthetic brief has no pipeline-level contradiction, so one form-first strategy is sufficient.',
      first_pass_strategy: ['establish value/form hierarchy', 'refine selective focal edges'],
    },
    strategy_validation_after_microplans: 2,
    strategy_validation: { status: 'pending' },
    artistic_evaluation_contract: {
      contract_id: 'synthetic-planner-brief-contract',
      revision: 1,
      positive_criteria: ['The focal hierarchy and requested local relationship must be visibly readable in the current frame.'],
      failure_signals: ['The requested relationship remains visually unresolved or is replaced by decorative detail.'],
      protected_qualities: ['Preserve the broader coherent composition while resolving the bounded task.'],
      stage_transition_expectations: ['Advance only when the current bounded representation problem is visibly resolved.'],
      final_evidence_requirements: ['Use the exact current full-frame evidence for final brief evaluation.'],
      provenance: [{ source: 'user_brief', detail: 'Synthetic planner fixture standing in for an open-ended user brief.' }],
    },
    composition_freedom: 'fixed',
    composition_exploration: { hypotheses: [] },
    perceptual_hierarchy: {
      revision: 1,
      mode: 'ranked',
      zones: [
        { id: 'focalForm-zone', owner_ids: ['focalForm-owner'], priority: 'primary', contrast_budget: 'high', detail_budget: 'high', edge_certainty: 'high', chroma_accent: 'allowed' },
        { id: 'background-zone', owner_ids: ['background-owner'], priority: 'support', contrast_budget: 'low', detail_budget: 'low', edge_certainty: 'low', chroma_accent: 'restricted' },
      ],
      ordering: ['focalForm-zone', 'background-zone'],
    },
    assessment: assessment(),
    value_check: passingValueCheck(),
    refinement_check: {
      status: 'pending',
      observed: false,
      limitations: ['Synthetic Planner/Painter fixture; Task 23 gate is exercised in refinement-check.test.ts.'],
    },
    priorities: ['focalForm value hierarchy', 'localRegion edge integration'],
    review_after_microplans: reviewAfter,
    tasks: [
      {
        task_id: 'shadow-side',
        summary: 'Darken the right side of the focalForm locally.',
        region: 'focalForm',
        allowed_scales: ['medium', 'small'],
        perceptual_zone_ids: ['focalForm-zone'],
      },
      {
        task_id: 'localRegion-edge',
        summary: 'Lose the localRegion edge into the background without changing silhouette.',
        region: 'localRegion',
        allowed_scales: ['small'],
        perceptual_zone_ids: ['focalForm-zone'],
      },
    ],
  };
}

function painterRequest(overrides: Record<string, unknown> = {}) {
  const { args: rawArgOverrides, ...restOverrides } = overrides;
  const argOverrides = (rawArgOverrides as Record<string, unknown> | undefined) ?? {};
  return {
    id: 'paint-one',
    tool: 'photoshop_execute_visual_microplan',
    args: {
      document_id: 42,
      planner_directive_id: 'focalForm-focus',
      planner_task_id: 'shadow-side',
      painter_scope: 'medium',
      change_domains: ['local-tone'],
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      region: 'focalForm',
      problem_id: 'focalForm-shadow-side',
      ...argOverrides,
    },
    summary: 'Execute one bounded Painter task.',
    purpose: 'Test the Planner/Painter execution contract.',
    problem_id: 'focalForm-shadow-side',
    stage: 'FORM_AND_LIGHT',
    scale: 'medium',
    ...restOverrides,
  };
}

function context(taskId = 'shadow-side') {
  return {
    problem_id: `problem-${taskId}`,
    region: 'focalForm',
    stage: 'FORM_AND_LIGHT',
    scale: 'medium',
    planner_directive_id: 'focalForm-focus',
    planner_task_id: taskId,
    painter_scope: 'medium',
    change_domains: ['local-tone'],
  };
}

function acceptedVerdict() {
  return {
    verdict: 'improvement',
    disposition: 'accept',
    target_resolved: 'no',
    regressions: [],
    global_readability: 'stable',
  };
}

function completionReviewEvidence(s: SessionStore) {
  const state = s.paintingState().documents['42'];
  const art = state.art_director;
  const frame = state.current_frame;
  const contract = art.artistic_evaluation_contract;
  const pendingGlance = art.whole_image_glance?.due === true
    ? {
        whole_image_glance: {
          trigger: art.whole_image_glance.reason,
          observation: 'Exact-current whole-frame review finds no unresolved global defect beyond the completion checks.',
          operation_id: art.whole_image_glance.required_operation_id,
          frame_sha256: art.whole_image_glance.required_frame_sha256,
        },
      }
    : {};
  return {
    ...pendingGlance,
    pre_final_hostile_review: {
      contract_id: contract.contract_id,
      contract_revision: contract.revision,
      frame_sha256: frame.sha256,
      checks: [
        { area: 'whole_frame_brief', status: 'clear', reason: 'Whole-frame brief read is coherent on the exact current frame.' },
        { area: 'named_subject_recognition', status: 'not_applicable', reason: 'This synthetic fixture has no named-subject recognition requirement.' },
        { area: 'geometry_completion', status: 'clear', reason: 'No unresolved geometry completion debt remains in this successful fixture.' },
        { area: 'physical_effect_accountability', status: 'clear', reason: 'No unresolved physical-effect debt remains in this successful fixture.' },
        { area: 'material_differentiation', status: 'clear', reason: 'No material-differentiation hard defect is visible in this synthetic fixture.' },
        { area: 'style_realism', status: 'clear', reason: 'The exact current frame remains consistent with the synthetic style contract.' },
      ],
      major_defects: [],
    },
  };
}

function suppliedPackPreflight() {
  return {
    completed: true,
    inventory_observed: true,
    inventory_total: 4,
    brush_pack_id: 'brush-pack-sha256:scene-pack',
    roles: [{
      role_id: 'broad-form',
      purpose: 'Build broad and medium form from the supplied pack.',
      material_roles: ['form'],
      visual_intents: ['directional-mass'],
      preferred_preset: 'Pack Form Brush',
      alternative_presets: [],
      effective_settings: {
        size: 90, hardness: 55, roundness: 100, opacity: 80, flow: 55, spacing: 12,
        use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
        smoothing_enabled: true, smoothing: 12,
      },
      working_scale: 'medium',
      pressure_policy: 'none',
      probe_status: 'cached',
      profile_id: 'media-profile-sha256:broad-form',
    }],
  };
}

function seedTrendSignal(
  s: SessionStore,
  id: string,
  sequence: number,
  options: {
    bounds?: { left: number; top: number; right: number; bottom: number };
    findingBounds?: { left: number; top: number; right: number; bottom: number };
    findingKind?: string;
    findingTrendSignals?: string[];
    region?: string;
    scale?: 'global' | 'medium' | 'small';
    signal?: string;
    primitiveFootprint?: 'none' | 'acceptable' | 'suspect' | 'unknown';
    globalReadability?: 'improved' | 'stable' | 'degraded' | 'unknown';
  } = {}
) {
  const frameBytes = Buffer.from('trend-frame:' + id);
  const framePath = path.join(s.directory, 'trend-frames', id + '.jpg');
  mkdirSync(path.dirname(framePath), { recursive: true });
  writeFileSync(framePath, frameBytes);
  const sha256 = createHash('sha256').update(frameBytes).digest('hex');
  s.write({
    id,
    tool: 'photoshop_set_layer_opacity',
    args: { document_id: 42, opacity: 50 },
    summary: 'Trend fixture ' + id,
    purpose: 'Provide cumulative visual trend provenance',
    hash: 'trend-hash-' + id,
    sequence,
    created_at: new Date(sequence * 1000).toISOString(),
    completed_at: new Date(sequence * 1000 + 1).toISOString(),
    phase: 'completed',
    execution: 'completed',
    visual: true,
    failed: false,
    region: options.region ?? 'focalForm',
    scale: options.scale ?? 'medium',
    ...(options.bounds ? { region_bounds: options.bounds } : {}),
    preview: {
      sha256,
      materialized_path: framePath,
      document_id: 42,
      width: 1000,
      height: 800,
      canvas_width: 1000,
      canvas_height: 800,
    },
    verdict: {
      verdict: 'neutral',
      disposition: 'correct',
      target_resolved: 'no',
      trend_signals: options.signal ? [options.signal] : [],
      primitive_footprint: options.primitiveFootprint ?? 'suspect',
      global_readability: options.globalReadability ?? 'stable',
      review_findings: (options.findingBounds ?? options.bounds) ? [{
        kind: options.findingKind ?? 'object_readability',
        severity: 'must-fix',
        region_bounds: options.findingBounds ?? options.bounds,
        ...(options.findingTrendSignals ? { trend_signals: options.findingTrendSignals } : {}),
      }] : [],
      at: new Date(sequence * 1000 + 2).toISOString(),
    },
  });
}

describe('Art Director / Painter controller contract', () => {
  it('surfaces hard-perceptual brief items as UNASSESSED durable debt before final assessment', () => {
    const s = store();
    const d = directive('brief-debt', 5) as any;
    d.artistic_evaluation_contract.brief_items = [
      { item_id: 'targetForm-recognition', kind: 'hard_perceptual', requirement: 'Guardian targetForm must be visibly recognizable as a targetForm.', provenance: 'user_brief:named subject' },
      { item_id: 'snow-polish', kind: 'soft_preference', requirement: 'Fine snow sparkle may be added if useful.', provenance: 'user_brief:optional polish' },
    ];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    expect(s.compactPassContext(42).art_director.unresolved_hard_brief_debt).toEqual([
      expect.objectContaining({ item_id: 'targetForm-recognition', state: 'UNASSESSED', kind: 'hard_perceptual' }),
    ]);
    expect(s.statusCompact().documents['42'].unresolved_hard_brief_debt).toEqual([
      expect.objectContaining({ item_id: 'targetForm-recognition', state: 'UNASSESSED' }),
    ]);
  });

  it('requires current-frame OBJECT/MICRO crop evidence before a named recognition hard item can be MET', () => {
    const s = store();
    const frame = seedClassifiedFrame(s, 'recognition-frame', 1);
    const makeDirective = () => {
      const d = directive('recognition-gate', 5) as any;
      d.artistic_evaluation_contract.brief_items = [{
        item_id: 'guardian-targetForm', kind: 'hard_perceptual',
        requirement: 'The guardian rigidForm must visibly read as a targetForm rather than an abstract floatingForm mass.',
        provenance: 'user_brief:named subject', recognition_target: 'guardian targetForm',
      }];
      return d;
    };
    const assessment = {
      outcome: 'satisfied', contract_id: 'synthetic-planner-brief-contract', contract_revision: 1,
      frame_sha256: frame.sha256, critic_authority: 'authorized', critic_result_id: 'recognition-critic',
      brief_item_results: [{
        item_id: 'guardian-targetForm', state: 'MET', reason: 'The held-out crop supports a targetForm identity.',
        evidence: ['review_artifact:targetForm-crop-artifact'],
      }],
      reason: 'Named-object recognition is supported by exact current-frame crop evidence.',
    };
    s.registerAuthorizedCriticResult(42, {
      result_id: 'recognition-critic', authority_class: 'authorized', authority_source: 'human-calibration:test-fixture',
      frame_sha256: frame.sha256, contract_id: 'synthetic-planner-brief-contract', contract_revision: 1,
    });
    expect(() => s.setArtDirectorState({
      document_id: 42, action: 'review', directive: makeDirective(), global_brief_assessment: assessment,
    })).toThrow(/cannot be MET without a materialized current-frame OBJECT\/MICRO review artifact/);

    const cropBytes = Buffer.from('guardian-targetForm-object-crop');
    const cropPath = path.join(s.directory, 'guardian-targetForm-crop.jpg');
    writeFileSync(cropPath, cropBytes);
    const cropSha = createHash('sha256').update(cropBytes).digest('hex');
    const source = s.read('recognition-frame')! as any;
    source.review_evidence = [{
      artifact_id: 'targetForm-crop-artifact', source_operation_id: 'recognition-frame',
      requirement_id: 'recognition-requirement', capture_id: 'recognition-capture', capture_sequence: 1,
      finding_kind: 'object_readability', brief_item_id: 'guardian-targetForm', severity: 'must-fix', review_level: 'object',
      requested_region: { left: 10, top: 10, right: 100, bottom: 100 },
      effective_region: { left: 10, top: 10, right: 100, bottom: 100 },
      document_id: 42, canvas_width: 800, canvas_height: 600,
      bound_whole_sha256: frame.sha256, sha256: cropSha, materialized_path: cropPath,
      mime_type: 'image/jpeg', width: 90, height: 90, materialized_for_review: true,
    }];
    s.write(source);
    expect(() => s.setArtDirectorState({
      document_id: 42, action: 'review', directive: makeDirective(), global_brief_assessment: assessment,
    })).not.toThrow();
    expect(s.statusCompact().documents['42'].unresolved_hard_brief_debt).toEqual([]);
  });

  it('promotes a current-frame must-fix finding into durable hard brief debt', () => {
    const s = store();
    const d = directive('brief-finding', 5) as any;
    d.artistic_evaluation_contract.brief_items = [
      { item_id: 'targetForm-recognition', kind: 'hard_perceptual', requirement: 'Guardian targetForm must be visibly recognizable as a targetForm.', provenance: 'user_brief:named subject' },
    ];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    const bytes = Buffer.from('brief-finding-frame');
    const framePath = path.join(s.directory, 'brief-finding.jpg');
    writeFileSync(framePath, bytes);
    const sha = createHash('sha256').update(bytes).digest('hex');
    s.write({
      id: 'brief-finding-op', tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 50 },
      summary: 'Brief finding fixture', purpose: 'Prove current-frame defect becomes durable prompt debt',
      hash: 'hash-brief-finding', sequence: 1, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', visual: true, failed: false,
      preview: { sha256: sha, materialized_path: framePath, document_id: 42, width: 800, height: 600 },
    } as any);
    s.verdict({
      id: 'brief-finding-op', preview_id: 'brief-finding-op', sha256: sha,
      verdict: 'neutral', disposition: 'correct',
      observations: [{ region: 'whole frame', visible: 'The two floatingForm masses remain visibly ambiguous as guardian targetForms.' }],
      primary_mismatch: 'Required guardian targetForms are not recognizable.',
      observed_change: 'The current frame still shows ambiguous symmetric floatingForm masses instead of readable targetForm forms.',
      target_resolved: 'no', regressions: [], uncertainty: 'identity remains ambiguous',
      global_readability: 'unknown', primitive_footprint: 'none', trend_signals: [],
      review_findings: [{
        kind: 'subject_recognition', severity: 'must-fix', brief_item_id: 'targetForm-recognition', brief_state: 'NOT_MET',
      }],
    });
    expect(s.statusCompact().documents['42'].unresolved_hard_brief_debt).toEqual([
      expect.objectContaining({ item_id: 'targetForm-recognition', state: 'NOT_MET', source_operation_id: 'brief-finding-op' }),
    ]);

    const source = s.read('brief-finding-op')! as any;
    source.rollback = { completed: true, rollback_operation_id: 'brief-finding-undo' };
    s.write(source);
    expect(s.statusCompact().documents['42'].unresolved_hard_brief_debt).toEqual([
      expect.objectContaining({ item_id: 'targetForm-recognition', state: 'UNASSESSED' }),
    ]);
  });
  it('fails closed when the mandatory prompt-conflict preflight is missing', () => {
    const s = store();
    const d = directive();
    delete (d as any).prompt_conflict_preflight;
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: d }))
      .toThrow(/prompt_conflict_preflight is required/);
  });

  it('treats prompt-conflict resolution rationale as optional artistic guidance', () => {
    const s = store();
    const d = directive();
    delete (d.prompt_conflict_preflight as any).resolution_rationale;
    d.style_contract = { finish_criteria: d.style_contract.finish_criteria } as any;
    d.prompt_conflict_preflight.dominant_objective = 'Объём';
    d.prompt_conflict_preflight.chosen_rendering_strategy = 'Кисть';
    delete (d.prompt_conflict_preflight as any).first_pass_strategy;
    const state = s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    expect(state.art_director.prompt_conflict_preflight).toMatchObject({
      dominant_objective: d.prompt_conflict_preflight.dominant_objective,
      resolution_mode: d.prompt_conflict_preflight.resolution_mode,
      chosen_rendering_strategy: d.prompt_conflict_preflight.chosen_rendering_strategy,
      first_pass_strategy: [],
    });
    expect(state.art_director.prompt_conflict_preflight).not.toHaveProperty('resolution_rationale');
    d.prompt_conflict_preflight.first_pass_strategy = ['Свет', 'Тень', 'Объём', 'Край'];
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: d })).not.toThrow();
    (d.prompt_conflict_preflight as any).first_pass_strategy = 'Кисть';
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: d })).toThrow(/must be an array/);
  });

  it('requires a pipeline-level prompt conflict to be resolved before Painter mutation', () => {
    const s = store();
    const d = directive();
    d.prompt_conflict_preflight = {
      dominant_objective: 'Photorealistic materially convincing old-town environment.',
      secondary_traits: ['intricate linework'],
      conflicts: [{
        requirement_a: 'photorealistic material rendering',
        requirement_b: 'intricate linework as a dominant visual language',
        pipeline_consequence: 'A value/material-first pipeline and a line-first pipeline require different first passes.',
        severity: 'structural',
        requires_user_choice: false,
      }],
      resolution_mode: 'none',
      chosen_rendering_strategy: 'Build value, light and material first; reserve line for selective late accents.',
      resolution_rationale: 'Photorealism is the dominant objective and must determine the structural representation strategy.',
      first_pass_strategy: ['large value and light masses', 'material/form modelling'],
    } as any;
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: d }))
      .toThrow(/structural prompt conflict changes the rendering pipeline/);

    d.prompt_conflict_preflight.resolution_mode = 'declared-interpretation';
    const state = s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    expect(state.art_director.prompt_conflict_preflight).toMatchObject({
      dominant_objective: 'Photorealistic materially convincing old-town environment.',
      resolution_mode: 'declared-interpretation',
      first_pass_strategy: ['large value and light masses', 'material/form modelling'],
    });
  });

  it('requires evidence when a prompt conflict was resolved by asking the user', () => {
    const s = store();
    const d = directive();
    d.prompt_conflict_preflight = {
      ...d.prompt_conflict_preflight,
      conflicts: [{
        requirement_a: 'flat poster-like shapes',
        requirement_b: 'photorealistic volumetric lighting',
        pipeline_consequence: 'The first rendering passes diverge between flat graphic construction and volumetric form modelling.',
        severity: 'structural',
        requires_user_choice: true,
      }],
      resolution_mode: 'declared-interpretation',
      chosen_rendering_strategy: 'Use volumetric form modelling because the user selected photorealistic depth as primary.',
      resolution_rationale: 'The prompt supports two materially different pipelines, so the user choice controls the dominant objective.',
      first_pass_strategy: ['value/light block-in', 'volumetric form modelling'],
    } as any;
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: d }))
      .toThrow(/user-confirmed resolution is required/);
    d.prompt_conflict_preflight.resolution_mode = 'user-confirmed';
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: d }))
      .toThrow(/requires user_confirmation evidence/);
    d.prompt_conflict_preflight.user_confirmation = 'Да';
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: d })).not.toThrow();
  });

  it('defaults omitted advisory strategy fields without forcing a review at the threshold', () => {
    const s = store();
    const { strategy_validation_after_microplans: _cadence, strategy_validation: _validation, ...d } = directive('focalForm-focus', 8);
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    expect(s.paintingState().documents['42'].art_director).toMatchObject({
      strategy_validation_after_microplans: 2, strategy_validation: { status: 'pending' },
    });
    for (const id of ['first', 'second']) {
      const next = s.advanceArtDirectorAfterVerdict(s.paintingState().documents['42'], context(), acceptedVerdict(), {
        id, significance: { execution_effect: 'meaningful' }, verdict: { trend_signals: [], at: new Date().toISOString() },
      });
      s.updatePaintingState(42, () => next);
    }
    expect(s.paintingState().documents['42'].art_director).toMatchObject({
      strategy_meaningful_microplans: 2, status: 'active', review_due: false,
    });
    const configured = { ...d, strategy_validation_after_microplans: 1 };
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: configured });
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    expect(s.paintingState().documents['42'].art_director.strategy_validation_after_microplans).toBe(1);
  });

  it('keeps strategy-validation cadence as guidance without blocking Painter mutation', () => {
    const s = store();
    const d = directive('focalForm-focus', 8);
    d.strategy_validation_after_microplans = 1;
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });

    let current = s.paintingState().documents['42'];
    let next = s.advanceArtDirectorAfterVerdict(current, context(), acceptedVerdict(), {
      id: 'weak-first',
      significance: { execution_effect: 'insufficient' },
      verdict: { trend_signals: [], at: new Date().toISOString() },
    });
    s.updatePaintingState(42, () => next);
    expect(next.art_director.strategy_meaningful_microplans).toBe(0);
    expect(next.art_director.review_due).toBe(false);

    current = s.paintingState().documents['42'];
    next = s.advanceArtDirectorAfterVerdict(current, context(), acceptedVerdict(), {
      id: 'meaningful-one',
      significance: { execution_effect: 'meaningful' },
      verdict: { trend_signals: [], at: new Date().toISOString() },
    });
    s.updatePaintingState(42, () => next);
    expect(next.art_director.strategy_meaningful_microplans).toBe(1);
    expect(next.art_director.status).toBe('active');
    expect(next.art_director.review_due).toBe(false);
    expect(next.art_director.review_reason).toBeNull();
  });

  it('requires exact-current-frame strategy validation and forces a changed strategy on replan', () => {
    const s = store();
    const d = directive('focalForm-focus', 8);
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    s.updatePaintingState(42, current => ({
      ...current,
      current_frame: { operation_id: 'strategy-frame', sha256: 'a'.repeat(64), path: 'frame.jpg' },
      art_director: {
        ...current.art_director,
        status: 'review_due',
        review_due: true,
        review_reason: 'strategy_validation:2_meaningful_microplans',
        strategy_meaningful_microplans: 2,
      },
    }));

    const pending = directive('focalForm-focus', 8);
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: pending }))
      .toThrow(/strategy validation is due/);

    const stale = directive('focalForm-focus', 8);
    stale.strategy_validation = {
      status: 'pass', evidence_operation_id: 'other-frame',
      dominant_objective_read: 'The dominant objective is visibly advancing.',
      strategy_fit: 'The chosen rendering strategy matches the intended representation.',
      reason: 'The current preview confirms the strategy is producing the intended visual signal.',
    } as any;
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: stale }))
      .toThrow(/exact current artistic frame/);

    const unchangedReplan = directive('focalForm-focus', 8);
    unchangedReplan.strategy_validation = {
      status: 'replan', evidence_operation_id: 'strategy-frame',
      dominant_objective_read: 'The dominant objective is not advancing strongly enough.',
      strategy_fit: 'The current approach optimizes secondary traits instead of the dominant representation objective.',
      reason: 'The exact current preview shows a strategy mismatch that requires a different rendering pipeline.',
    } as any;
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: unchangedReplan }))
      .toThrow(/requires a changed chosen_rendering_strategy or first_pass_strategy/);

    const replanned = directive('focalForm-focus', 8);
    replanned.prompt_conflict_preflight.chosen_rendering_strategy = 'Rebuild broad value and material masses first; defer all contour accents until form reads without them.';
    replanned.prompt_conflict_preflight.first_pass_strategy = ['broad value/material rebuild', 'preview strategy validation'];
    replanned.strategy_validation = {
      status: 'replan', evidence_operation_id: 'strategy-frame',
      dominant_objective_read: 'The dominant objective is not advancing strongly enough.',
      strategy_fit: 'The current approach optimizes secondary traits instead of the dominant representation objective.',
      reason: 'The exact current preview shows a strategy mismatch that requires a different rendering pipeline.',
    } as any;
    const reviewed = s.setArtDirectorState({ document_id: 42, action: 'review', directive: replanned });
    expect(reviewed.art_director.strategy_validation).toMatchObject({ status: 'pending', last_result: 'replan' });
    expect(reviewed.art_director.strategy_meaningful_microplans).toBe(0);

    s.updatePaintingState(42, state => ({
      ...state,
      current_frame: { operation_id: 'strategy-frame', sha256: 'a'.repeat(64), path: 'frame.jpg' },
      art_director: {
        ...state.art_director,
        status: 'review_due',
        review_due: true,
        review_reason: 'strategy_validation:legacy_durable_barrier',
      },
    }));
    const passWithoutNarrativeReason = directive('focalForm-focus', 8);
    passWithoutNarrativeReason.strategy_validation = {
      status: 'pass', evidence_operation_id: 'strategy-frame',
      dominant_objective_read: 'The dominant objective is visibly advancing in the exact current frame.',
      strategy_fit: 'The chosen rendering strategy is visibly producing the intended representation.',
    } as any;
    const passed = s.setArtDirectorState({ document_id: 42, action: 'review', directive: passWithoutNarrativeReason });
    expect(passed.art_director.strategy_validation).toMatchObject({ status: 'pass', evidence_operation_id: 'strategy-frame' });
    expect(passed.art_director.strategy_validation).not.toHaveProperty('reason');
  });

  it('keeps a repeated localized cumulative trend medium-scoped and allows unrelated medium work', () => {
    const s = store();
    seedTrendSignal(s, 'trend-local-1', 1, {
      bounds: { left: 100, top: 100, right: 260, bottom: 300 },
      region: 'focalForm',
    });
    seedTrendSignal(s, 'trend-local-2', 2, {
      bounds: { left: 120, top: 120, right: 280, bottom: 315 },
      region: 'focalForm',
    });

    const trend = (s as any).cumulativeTrendState(42);
    expect(trend.triggered).toBe(true);
    const promoted = (s as any).promoteCumulativeTrendProblem(
      42,
      s.paintingState().documents['42'] ?? {},
      trend
    );
    s.updatePaintingState(42, () => promoted);

    const problem = promoted.visual_problems['cumulative-trend-primitive-footprint-repeating'];
    expect(problem).toMatchObject({
      scale: 'medium',
      severity: 'must-fix',
      status: 'open',
      promotion_reason: 'localized_repeated_evidence',
      source_operations: ['trend-local-1', 'trend-local-2'],
    });
    expect(problem.supporting_regions).toHaveLength(2);
    expect(promoted.active_problem.problem_id).toBe(problem.problem_id);
    expect((s as any).largestOpenMustFix(promoted.visual_problems)).toMatchObject({
      problem_id: problem.problem_id,
      scale: 'medium',
    });
    expect((s as any).priorityGate(42, painterRequest({
      id: 'unrelated-medium',
      args: {
        planner_directive_id: 'focalForm-focus',
        planner_task_id: 'shadow-side',
        painter_scope: 'medium',
        change_domains: ['local-tone'],
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'background',
        problem_id: 'background-tone',
      },
    }))).toBeNull();
  });

  it('schedules one dependency-aware primary blocker while retaining the rest as backlog', () => {
    const s = store();
    const first = s.setPriorityState({
      document_id: 42,
      problems: [
        {
          problem_id: 'form-foundation', scale: 'medium', severity: 'must-fix', status: 'open',
          region: 'subject', hypothesis: 'The major form structure must read before dependent light/detail work.',
        },
        {
          problem_id: 'lighting-model', scale: 'medium', severity: 'must-fix', status: 'open',
          region: 'subject', hypothesis: 'Lighting depends on the established form planes.',
          depends_on_problem_ids: ['form-foundation'],
        },
        {
          problem_id: 'texture-finish', scale: 'small', severity: 'should-fix', status: 'open',
          region: 'subject', hypothesis: 'Texture follows form and lighting.',
          depends_on_problem_ids: ['lighting-model'],
        },
      ],
    });
    expect(first.active_problem.problem_id).toBe('form-foundation');
    let compact = s.statusCompact().documents['42'] as any;
    expect(compact.primary_blocker.problem_id).toBe('form-foundation');
    expect(compact.primary_next_action).toBe('resolve primary artistic problem form-foundation');
    expect(compact.problem_backlog.map((problem: any) => problem.problem_id)).toEqual([
      'lighting-model', 'texture-finish',
    ]);

    expect(() => s.setPriorityState({
      document_id: 42,
      problems: [
        { problem_id: 'form-foundation', scale: 'medium', severity: 'must-fix', status: 'resolved', region: 'subject' },
        { problem_id: 'lighting-model', scale: 'medium', severity: 'must-fix', status: 'open', region: 'subject', depends_on_problem_ids: ['form-foundation'] },
        { problem_id: 'texture-finish', scale: 'small', severity: 'should-fix', status: 'open', region: 'subject', depends_on_problem_ids: ['lighting-model'] },
      ],
    })).toThrow(/priority_reclassification_evidence_required/);

    seedClassifiedFrame(s, 'form-foundation-review', 1);
    const second = s.setPriorityState({
      document_id: 42,
      evidence_operation_id: 'form-foundation-review',
      problems: [
        { problem_id: 'form-foundation', scale: 'medium', severity: 'must-fix', status: 'resolved', region: 'subject' },
        {
          problem_id: 'lighting-model', scale: 'medium', severity: 'must-fix', status: 'open', region: 'subject',
          depends_on_problem_ids: ['form-foundation'],
        },
        {
          problem_id: 'texture-finish', scale: 'small', severity: 'should-fix', status: 'open', region: 'subject',
          depends_on_problem_ids: ['lighting-model'],
        },
      ],
    });
    expect(second.active_problem.problem_id).toBe('lighting-model');
    compact = s.statusCompact().documents['42'] as any;
    expect(compact.primary_blocker.problem_id).toBe('lighting-model');
    expect(compact.primary_next_action).toBe('resolve primary artistic problem lighting-model');
    expect(compact.problem_backlog.map((problem: any) => problem.problem_id)).toEqual(['texture-finish']);
    expect(second.visual_problems['form-foundation']).toMatchObject({
      reclassification_evidence_operation_id: 'form-foundation-review',
      reclassification_evidence_sequence: 1,
    });
  });

  it('keeps must-fix debt visible through a lower-severity unresolved prerequisite', () => {
    const s = store();
    const state = s.setPriorityState({
      document_id: 42,
      problems: [
        {
          problem_id: 'support-plane', scale: 'medium', severity: 'should-fix', status: 'open',
          region: 'subject', hypothesis: 'The support plane must be corrected before the dependent silhouette can be judged.',
        },
        {
          problem_id: 'subject-silhouette', scale: 'global', severity: 'must-fix', status: 'open',
          region: 'subject', hypothesis: 'The subject silhouette is the completion blocker.',
          depends_on_problem_ids: ['support-plane'],
        },
      ],
    });

    expect(state.visual_problems['subject-silhouette']).toMatchObject({
      severity: 'must-fix',
      status: 'open',
      depends_on_problem_ids: ['support-plane'],
    });
    expect((s as any).largestOpenMustFix(state.visual_problems)).toMatchObject({
      problem_id: 'support-plane',
      severity: 'should-fix',
      status: 'open',
    });
    const compact = s.statusCompact().documents['42'] as any;
    expect(compact.primary_blocker).toMatchObject({ problem_id: 'support-plane' });
    expect(compact.primary_next_action).toBe('resolve primary artistic problem support-plane');
    expect(compact.problem_backlog.map((problem: any) => problem.problem_id)).toContain('subject-silhouette');
  });

  it('allows a new severe whole-frame regression to pre-empt a smaller active problem', () => {
    const s = store();
    s.setPriorityState({
      document_id: 42,
      problems: [
        { problem_id: 'local-light', scale: 'medium', severity: 'must-fix', status: 'open', region: 'subject' },
        { problem_id: 'texture', scale: 'small', severity: 'should-fix', status: 'open', region: 'subject' },
      ],
    });
    const preempted = s.setPriorityState({
      document_id: 42,
      problems: [
        { problem_id: 'local-light', scale: 'medium', severity: 'must-fix', status: 'open', region: 'subject' },
        { problem_id: 'texture', scale: 'small', severity: 'should-fix', status: 'open', region: 'subject' },
        {
          problem_id: 'global-readability-regression', scale: 'global', severity: 'must-fix', status: 'open',
          region: 'whole image', hypothesis: 'A new whole-frame regression outranks the smaller current task.',
        },
      ],
    });
    expect(preempted.active_problem.problem_id).toBe('global-readability-regression');
    const compact = s.statusCompact().documents['42'] as any;
    expect(compact.primary_blocker.problem_id).toBe('global-readability-regression');
    expect(compact.problem_backlog.map((problem: any) => problem.problem_id).sort()).toEqual([
      'local-light', 'texture',
    ]);
  });

  it('promotes a repeated cumulative trend to global only when source regions are materially separate', () => {
    const s = store();
    seedTrendSignal(s, 'trend-left', 1, {
      bounds: { left: 50, top: 100, right: 180, bottom: 260 },
      region: 'left-focalForm',
    });
    seedTrendSignal(s, 'trend-right', 2, {
      bounds: { left: 760, top: 480, right: 900, bottom: 660 },
      region: 'lower-right',
    });

    const trend = (s as any).cumulativeTrendState(42);
    const promoted = (s as any).promoteCumulativeTrendProblem(
      42,
      s.paintingState().documents['42'] ?? {},
      trend
    );
    expect(promoted.visual_problems['cumulative-trend-primitive-footprint-repeating']).toMatchObject({
      scale: 'global',
      region: 'multiple materially separate regions',
      promotion_reason: 'materially_separate_regions',
      source_operations: ['trend-left', 'trend-right'],
    });
  });

  it('does not use unrelated distant review findings as spatial evidence for primitive-footprint trend scope', () => {
    const s = store();
    seedTrendSignal(s, 'trend-focalForm-a', 1, {
      bounds: { left: 100, top: 100, right: 280, bottom: 320 },
      findingBounds: { left: 20, top: 40, right: 140, bottom: 180 },
      findingKind: 'proportion',
      region: 'focalForm',
    });
    seedTrendSignal(s, 'trend-focalForm-b', 2, {
      bounds: { left: 120, top: 115, right: 300, bottom: 335 },
      findingBounds: { left: 780, top: 520, right: 920, bottom: 700 },
      findingKind: 'proportion',
      region: 'focalForm',
    });

    const trend = (s as any).cumulativeTrendState(42);
    const promoted = (s as any).promoteCumulativeTrendProblem(
      42,
      s.paintingState().documents['42'] ?? {},
      trend
    );
    expect(promoted.visual_problems['cumulative-trend-primitive-footprint-repeating']).toMatchObject({
      scale: 'medium',
      region: 'focalForm',
      promotion_reason: 'localized_repeated_evidence',
      source_operations: ['trend-focalForm-a', 'trend-focalForm-b'],
    });
  });

  it('allows explicitly signal-bound distant findings to support global trend promotion', () => {
    const s = store();
    seedTrendSignal(s, 'trend-bound-a', 1, {
      bounds: { left: 100, top: 100, right: 280, bottom: 320 },
      findingBounds: { left: 20, top: 40, right: 140, bottom: 180 },
      findingKind: 'object_readability',
      findingTrendSignals: ['primitive-footprint-repeating'],
      region: 'focalForm',
    });
    seedTrendSignal(s, 'trend-bound-b', 2, {
      bounds: { left: 120, top: 115, right: 300, bottom: 335 },
      findingBounds: { left: 780, top: 520, right: 920, bottom: 700 },
      findingKind: 'object_readability',
      findingTrendSignals: ['primitive-footprint-repeating'],
      region: 'focalForm',
    });

    const trend = (s as any).cumulativeTrendState(42);
    const promoted = (s as any).promoteCumulativeTrendProblem(
      42,
      s.paintingState().documents['42'] ?? {},
      trend
    );
    expect(promoted.visual_problems['cumulative-trend-primitive-footprint-repeating']).toMatchObject({
      scale: 'global',
      region: 'multiple materially separate regions',
      promotion_reason: 'materially_separate_regions',
      source_operations: ['trend-bound-a', 'trend-bound-b'],
    });
  });

  it('allows explicit whole-frame degradation evidence to create a global trend immediately', () => {
    const s = store();
    seedTrendSignal(s, 'trend-global', 1, {
      region: 'whole image',
      scale: 'global',
      primitiveFootprint: 'acceptable',
      globalReadability: 'degraded',
    });

    const trend = (s as any).cumulativeTrendState(42);
    expect(trend.triggered).toBe(true);
    const promoted = (s as any).promoteCumulativeTrendProblem(
      42,
      s.paintingState().documents['42'] ?? {},
      trend
    );
    expect(promoted.visual_problems['cumulative-trend-global-readability-degraded']).toMatchObject({
      scale: 'global',
      region: 'whole image',
      promotion_reason: 'whole_frame_global_evidence',
      source_operations: ['trend-global'],
    });
  });

  it('does not resurrect a resolved trend from pre-resolution evidence and reopens only from fresh evidence', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'planner-painter-trend-resolution-'));
    dirs.push(dir);
    const s = storeAt(dir);
    seedTrendSignal(s, 'trend-old-1', 1, {
      bounds: { left: 100, top: 100, right: 250, bottom: 300 },
    });
    seedTrendSignal(s, 'trend-old-2', 2, {
      bounds: { left: 120, top: 110, right: 270, bottom: 310 },
    });
    const initialTrend = (s as any).cumulativeTrendState(42);
    const initialPromoted = (s as any).promoteCumulativeTrendProblem(
      42,
      s.paintingState().documents['42'] ?? {},
      initialTrend
    );
    s.updatePaintingState(42, () => initialPromoted);

    s.setPriorityState({
      document_id: 42,
      evidence_operation_id: 'trend-old-2',
      problems: [{
        problem_id: 'cumulative-trend-primitive-footprint-repeating',
        scale: 'medium',
        severity: 'must-fix',
        status: 'resolved',
        region: 'focalForm',
      }],
    });

    const restarted = storeAt(dir);
    const resolvedProblem = restarted.paintingState().documents['42'].visual_problems['cumulative-trend-primitive-footprint-repeating'];
    expect(resolvedProblem.status).toBe('resolved');
    expect(resolvedProblem.resolution_epoch).toBe(1);
    expect(resolvedProblem.resolution_cutoff_sequence).toBe(2);
    const resumed = restarted.resume(42) as any;
    expect(resumed.document.active_problem).toBeNull();
    expect(resumed.document.largest_open_must_fix).toBeNull();
    expect((restarted as any).cumulativeTrendState(42).triggered).toBe(false);

    seedTrendSignal(restarted, 'trend-new-1', 3, {
      bounds: { left: 130, top: 120, right: 275, bottom: 315 },
    });
    expect((restarted as any).cumulativeTrendState(42).triggered).toBe(false);

    seedTrendSignal(restarted, 'trend-new-2', 4, {
      bounds: { left: 140, top: 125, right: 285, bottom: 320 },
    });
    const freshTrend = (restarted as any).cumulativeTrendState(42);
    expect(freshTrend.triggered).toBe(true);
    const reopened = (restarted as any).promoteCumulativeTrendProblem(
      42,
      restarted.paintingState().documents['42'],
      freshTrend
    );
    expect(reopened.visual_problems['cumulative-trend-primitive-footprint-repeating']).toMatchObject({
      status: 'open',
      resolution_epoch: 1,
      source_operations: ['trend-new-1', 'trend-new-2'],
    });
  });

  it('upgrades simple_graphic to nontrivial_painting in place only after stronger obligations are present', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/profile-upgrade-process/run-01',
      painting_profile: 'simple_graphic',
    });
    expect(() => s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/profile-upgrade-process/run-01',
      painting_profile: 'nontrivial_painting',
      profile_transition_reason: 'The user expanded the task into a materially developed painting.',
    })).toThrow(/unmet_obligations=.*brush_preflight/);

    const upgraded = s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/profile-upgrade-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: {
        completed: true,
        inventory_observed: true,
        inventory_total: 3,
        roles: [{
          role_id: 'broad-form',
          purpose: 'Build medium-scale form masses.',
          material_roles: ['form'],
          visual_intents: ['directional-mass'],
          preferred_preset: 'Round Form Brush',
          alternative_presets: [],
          effective_settings: {
            size: 120, hardness: 60, roundness: 100, opacity: 80, flow: 60, spacing: 10,
            use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
            smoothing_enabled: true, smoothing: 10,
          },
          working_scale: 'medium',
          pressure_policy: 'none',
          probe_status: 'pass',
        }],
      },
    });
    expect(upgraded.painting_profile).toBe('nontrivial_painting');
    expect(upgraded.profile_transition).toMatchObject({
      from: 'simple_graphic',
      to: 'nontrivial_painting',
    });
    expect(upgraded.profile_transition).not.toHaveProperty('reason');
    expect(upgraded.process_dir).toBe('processes/profile-upgrade-process/run-01');
    expect(upgraded.profile_transition).toMatchObject({
      from: 'simple_graphic',
      to: 'nontrivial_painting',
      monotonic: true,
    });
    expect(() => s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/profile-upgrade-process/run-01',
      painting_profile: 'simple_graphic',
    })).toThrow(/downgrade is forbidden/);
  });

  it('requires a scene-first causal brush-pack plan and persists its task bindings', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/scene-pack-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
      brush_preflight: suppliedPackPreflight(),
      brush_pack_policy: { mode: 'exclusive', brush_pack_id: 'brush-pack-sha256:scene-pack' },
    });

    const missing = directive('scene-pack-directive', 5) as any;
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: missing }))
      .toThrow(/brush_pack_scene_plan is required/);

    const badHero = directive('scene-pack-directive', 5) as any;
    badHero.brush_pack_scene_plan = {
      brush_pack_id: 'brush-pack-sha256:scene-pack',
      scene_first: true,
      uses: [{
        task_id: 'shadow-side', source_kind: 'stamp-profile', source_id: 'stamp-profile-sha256:hero',
        causal_use: 'Place the primary hero silhouette directly.', integration_mode: 'raw-style-contract',
        subject_importance: 'hero',
      }],
    };
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: badHero }))
      .toThrow(/hero raw stamp placement requires explicit user_authorization/);

    const valid = directive('scene-pack-directive', 5) as any;
    valid.brush_pack_scene_plan = {
      brush_pack_id: 'brush-pack-sha256:scene-pack',
      scene_first: true,
      uses: [{
        task_id: 'shadow-side', source_kind: 'media-role', source_id: 'broad-form',
        causal_use: 'Model the shadow-side form using the supplied pack after scene structure is fixed.',
        integration_mode: 'integrate', subject_importance: 'hero',
      }],
    };
    const state = s.setArtDirectorState({ document_id: 42, action: 'review', directive: valid });
    expect(state.art_director.brush_pack_scene_plan).toEqual(valid.brush_pack_scene_plan);
    expect(s.statusCompact().documents['42'].brush_pack_policy).toMatchObject({ mode: 'exclusive' });
    expect(s.statusCompact().documents['42'].art_director.brush_pack_scene_plan.uses[0]).toMatchObject({
      task_id: 'shadow-side', source_kind: 'media-role', source_id: 'broad-form',
    });
  });

  it('blocks pack vocabulary that was not causally assigned to the active Painter task', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/scene-pack-binding-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
      brush_preflight: suppliedPackPreflight(),
      brush_pack_policy: { mode: 'exclusive', brush_pack_id: 'brush-pack-sha256:scene-pack' },
    });
    const d = directive('focalForm-focus', 5) as any;
    d.brush_pack_scene_plan = {
      brush_pack_id: 'brush-pack-sha256:scene-pack', scene_first: true,
      uses: [{
        task_id: 'localRegion-edge', source_kind: 'media-role', source_id: 'broad-form',
        causal_use: 'Reserve this pack role for the later localRegion integration task.',
        integration_mode: 'integrate', subject_importance: 'hero',
      }],
    };
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    // This fixture isolates the independent brush-pack task-binding rejection.
    // Simulate a pre-Physical-Stack journal already past the new gate so that
    // the older contract remains directly testable; dedicated physical-stack
    // tests cover fresh nontrivial admission.
    s.updatePaintingState(42, current => ({
      ...current,
      current_stage: 'FORM_AND_LIGHT',
      physical_stack_check: undefined,
      art_director: {
        ...current.art_director,
        physical_stack_check: undefined,
      },
    }));

    expect(() => s.begin(painterRequest({ args: {
      method_class: 'preset-brush',
      paint_strategy: {
        material_role: 'form', visual_intent: 'directional-mass', brush_role: 'broad-form',
        preset_name: 'Pack Form Brush', pressure_policy: 'none',
      },
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Pack Form Brush' } },
        { id: 'paint', tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }] } },
      ],
    } }))).toThrow(/brush_pack_scene_binding_required/);
  });

  it('binds global brief claims to the exact contract revision, frame SHA and authorized critic', () => {
    const s = store();
    const frame = seedClassifiedFrame(s, 'global-claim-frame', 1);
    const brief = directive('global-claim', 5);
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: brief,
      global_brief_assessment: {
        outcome: 'satisfied',
        contract_id: brief.artistic_evaluation_contract.contract_id,
        contract_revision: 1,
        frame_sha256: frame.sha256,
        critic_authority: 'shadow',
        critic_result_id: 'shadow-claim',
        reason: 'Shadow critic observed the frame but does not have completion authority.',
      },
    });
    expect(s.paintingState().documents['42'].global_brief_assessment).toMatchObject({
      outcome: 'not-evaluated',
      requested_outcome: 'satisfied',
      validation: 'not-independently-validated',
    });

    s.registerAuthorizedCriticResult(42, {
      result_id: 'authorized-claim', authority_class: 'authorized', authority_source: 'human-calibration:test-fixture',
      frame_sha256: frame.sha256, contract_id: brief.artistic_evaluation_contract.contract_id, contract_revision: 1,
    });

    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: brief,
      global_brief_assessment: {
        outcome: 'satisfied',
        contract_id: brief.artistic_evaluation_contract.contract_id,
        contract_revision: 1,
        frame_sha256: frame.sha256,
        critic_authority: 'authorized',
        critic_result_id: 'authorized-claim',
        criteria: ['The exact current frame satisfies the active brief criteria.'],
        reason: 'Authorized bounded critic evaluated the exact current frame against the frozen contract.',
      },
    });
    expect(s.statusCompact().documents['42']).toMatchObject({
      global_brief_outcome: 'satisfied',
      global_brief_assessment: { validation: 'independently-validated' },
      art_director: {
        artistic_evaluation_contract: { contract_id: brief.artistic_evaluation_contract.contract_id, revision: 1 },
      },
    });
  });

  it('does not let a relative-best final comparison complete an explicitly unsatisfied global brief', () => {
    const s = store();
    const frame = seedClassifiedFrame(s, 'relative-best-unsatisfied', 1);
    const single = directive('relative-best-directive', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: single });
    s.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        ...current.art_director,
        tasks: current.art_director.tasks.map(task => ({ ...task, status: 'completed' })),
        current_task_id: null,
      },
    }));
    s.registerAuthorizedCriticResult(42, {
      result_id: 'authorized-unsatisfied', authority_class: 'authorized', authority_source: 'human-calibration:test-fixture',
      frame_sha256: frame.sha256, contract_id: single.artistic_evaluation_contract.contract_id, contract_revision: 1,
    });
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      final_comparison: {
        scope: 'no_previous',
        preferred: 'current',
        reason: 'This is the strongest state seen so far, but that relative preference does not satisfy the brief.',
        criteria: {
          coherence: 'Current state is internally coherent relative to prior work.',
          expressiveness: 'Current state is relatively stronger but still misses the requested read.',
          color: 'Color is the best current attempt but remains insufficient.',
          rhythm: 'Rhythm improved relative to prior attempts.',
          detail_selectivity: 'Detail is selective but cannot cure the global mismatch.',
        },
      },
      global_brief_assessment: {
        outcome: 'unsatisfied',
        contract_id: single.artistic_evaluation_contract.contract_id,
        contract_revision: 1,
        frame_sha256: frame.sha256,
        critic_authority: 'authorized',
        critic_result_id: 'authorized-unsatisfied',
        criteria: ['Current frame is best so far while still materially short of the brief.'],
        reason: 'The exact current frame remains materially short of the active brief despite being relatively strongest.',
      },
    })).toThrow(/global brief outcome is unsatisfied/);
  });

  it('keeps local Painter verification running while global review waits for adaptive cadence', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('focalForm-focus', 3) });

    for (let i = 1; i <= 2; i++) {
      const current = s.paintingState().documents['42'];
      const record = { id: `local-${i}`, verdict: { trend_signals: [], at: new Date().toISOString() } };
      const next = s.advanceArtDirectorAfterVerdict(current, context(), acceptedVerdict(), record);
      s.updatePaintingState(42, () => next);
      expect(next.art_director.completed_microplans).toBe(i);
      expect(next.art_director.status).toBe('active');
      expect(next.art_director.review_due).toBe(false);
      expect(next.art_director.current_task_id).toBe('shadow-side');
      expect(next.art_director.tasks[0].status).toBe('active');
      expect(next.art_director.tasks[1].status).toBe('pending');
    }

    const current = s.paintingState().documents['42'];
    const third = s.advanceArtDirectorAfterVerdict(
      current,
      context(),
      acceptedVerdict(),
      { id: 'local-3', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(third.art_director.completed_microplans).toBe(3);
    expect(third.art_director.status).toBe('review_due');
    expect(third.art_director.review_reason).toBe('cadence:3_microplans');
  });

  it('keeps evidence-bound brief states and hostile-review statuses executable without prose reasons', () => {
    const s = store();
    const frame = seedClassifiedFrame(s, 'reason-free-completion', 1);
    const brief = directive('reason-free-completion', 5) as any;
    brief.tasks = [brief.tasks[0]];
    brief.artistic_evaluation_contract.brief_items = [{
      item_id: 'whole-frame-read', kind: 'hard_perceptual',
      requirement: 'The whole frame must satisfy the requested composition.',
      provenance: 'user_brief:composition',
    }];
    s.registerAuthorizedCriticResult(42, {
      result_id: 'reason-free-critic', authority_class: 'authorized', authority_source: 'human-calibration:test-fixture',
      frame_sha256: frame.sha256, contract_id: brief.artistic_evaluation_contract.contract_id, contract_revision: 1,
    });
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: brief,
      global_brief_assessment: {
        outcome: 'satisfied',
        contract_id: brief.artistic_evaluation_contract.contract_id,
        contract_revision: 1,
        frame_sha256: frame.sha256,
        critic_authority: 'authorized',
        critic_result_id: 'reason-free-critic',
        brief_item_results: [{ item_id: 'whole-frame-read', state: 'MET' }],
      },
    });
    expect(s.paintingState().documents['42'].global_brief_assessment?.brief_item_results).toEqual([
      expect.objectContaining({ item_id: 'whole-frame-read', state: 'MET' }),
    ]);
    expect((s.paintingState().documents['42'].global_brief_assessment?.brief_item_results as any[])[0]).not.toHaveProperty('reason');

    s.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        ...current.art_director,
        tasks: current.art_director.tasks.map((task: any) => ({ ...task, status: 'completed' })),
        current_task_id: null,
      },
    }));
    const review = completionReviewEvidence(s) as any;
    review.pre_final_hostile_review.checks = review.pre_final_hostile_review.checks
      .map(({ reason: _reason, ...check }: any) => check);
    s.registerAuthorizedCriticResult(42, {
      result_id: 'reason-free-final-critic', authority_class: 'authorized', authority_source: 'human-calibration:test-fixture',
      frame_sha256: frame.sha256, contract_id: brief.artistic_evaluation_contract.contract_id, contract_revision: 1,
    });
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      ...review,
      final_comparison: {
        scope: 'no_previous',
        preferred: 'current',
        reason: 'The current frame is the only accepted completion candidate in this fixture.',
        criteria: {
          coherence: 'Current frame is coherent.',
          expressiveness: 'Current frame satisfies the bounded fixture.',
          color: 'No color regression is present.',
          rhythm: 'No rhythm regression is present.',
          detail_selectivity: 'No detail-selectivity regression is present.',
        },
      },
      global_brief_assessment: {
        outcome: 'satisfied',
        contract_id: brief.artistic_evaluation_contract.contract_id,
        contract_revision: 1,
        frame_sha256: frame.sha256,
        critic_authority: 'authorized',
        critic_result_id: 'reason-free-final-critic',
        brief_item_results: [{ item_id: 'whole-frame-read', state: 'MET' }],
      },
    })).not.toThrow();
  });

  it('persists the task-scoped three-pass autonomy openingForm across restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'planner-task-autonomy-'));
    dirs.push(dir);
    const s = storeAt(dir);
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('task-openingForm', 8) });

    for (let i = 1; i <= 2; i++) {
      const current = s.paintingState().documents['42'];
      const next = s.advanceArtDirectorAfterVerdict(
        current,
        { ...context(), planner_directive_id: 'task-openingForm' },
        acceptedVerdict(),
        { id: `openingForm-${i}`, verdict: { trend_signals: [], at: new Date().toISOString() } }
      );
      s.updatePaintingState(42, () => next);
    }
    let compact = s.statusCompact().documents['42'] as any;
    expect(compact.art_director).toMatchObject({
      current_task_id: 'shadow-side',
      task_review_after_microplans: 3,
      task_successful_microplans: 2,
      task_autonomy_remaining: 1,
      review_due: false,
    });

    const restarted = storeAt(dir);
    compact = restarted.statusCompact().documents['42'] as any;
    expect(compact.art_director).toMatchObject({
      current_task_id: 'shadow-side',
      task_successful_microplans: 2,
      task_autonomy_remaining: 1,
    });

    const current = restarted.paintingState().documents['42'];
    const third = restarted.advanceArtDirectorAfterVerdict(
      current,
      { ...context(), planner_directive_id: 'task-openingForm' },
      acceptedVerdict(),
      { id: 'openingForm-3', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(third.art_director).toMatchObject({
      current_task_id: 'shadow-side',
      task_successful_microplans: 3,
      task_autonomy_remaining: 0,
      review_due: true,
      review_reason: 'cadence:3_microplans',
    });
  });

  it('keeps the planner task active when only the local operation goal is resolved', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('scene-directive', 8) });
    const current = s.paintingState().documents['42'];
    const next = s.advanceArtDirectorAfterVerdict(
      current,
      { ...context(), planner_directive_id: 'scene-directive' },
      { ...acceptedVerdict(), target_resolved: 'yes' },
      { id: 'foundation-fill', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );

    expect(next.art_director.tasks[0].status).toBe('active');
    expect(next.art_director.current_task_id).toBe('shadow-side');
    expect(next.art_director.status).toBe('active');
  });

  it('completes the planner task only from explicit task-level evidence', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('scene-directive', 8) });
    const current = s.paintingState().documents['42'];
    const next = s.advanceArtDirectorAfterVerdict(
      current,
      { ...context(), planner_directive_id: 'scene-directive' },
      {
        ...acceptedVerdict(),
        target_resolved: 'yes',
        planner_task_assessment: {
          status: 'completed',
          evidence_scope: 'task',
          evidence: ['The full bounded task objective is visible in the reviewed frame.'],
        },
      },
      { id: 'task-complete-pass', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );

    expect(next.art_director.tasks[0].status).toBe('completed');
    expect(next.art_director.tasks[1].status).toBe('active');
    expect(next.art_director.current_task_id).toBe('localRegion-edge');
  });

  it('interrupts early when a local pass unexpectedly degrades global readability', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('focalForm-focus', 8) });
    const current = s.paintingState().documents['42'];
    const next = s.advanceArtDirectorAfterVerdict(
      current,
      context(),
      { ...acceptedVerdict(), global_readability: 'degraded' },
      { id: 'bad-local', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(next.art_director.completed_microplans).toBe(1);
    expect(next.art_director.status).toBe('interrupted');
    expect(next.art_director.review_reason).toBe('early_interrupt:unexpected_global_composition_value_shift');
  });

  it('stores declared relation/quality scope only when the pass declares it', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('relation-scope', 8) });
    const initial = s.paintingState().documents['42'];
    const declared = s.advanceArtDirectorAfterVerdict(
      initial,
      {
        ...context(),
        planner_directive_id: 'relation-scope',
        affected_relations: ['focalForm-to-background separation'],
        affected_qualities: ['quiet focal restraint'],
      },
      acceptedVerdict(),
      { id: 'relation-pass', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(declared.art_director.tasks[0]).toMatchObject({
      affected_relations: ['focalForm-to-background separation'],
      affected_qualities: ['quiet focal restraint'],
    });
    expect(declared.relation_review).toMatchObject({
      operation_id: 'relation-pass',
      affected_relations: ['focalForm-to-background separation'],
      affected_qualities: ['quiet focal restraint'],
    });

    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('relation-scope-clean', 8) });
    const clean = s.paintingState().documents['42'];
    const undeclared = s.advanceArtDirectorAfterVerdict(
      clean,
      { ...context(), planner_directive_id: 'relation-scope-clean' },
      acceptedVerdict(),
      { id: 'plain-pass', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(undeclared.art_director.tasks[0].affected_relations).toBeUndefined();
    expect(undeclared.art_director.tasks[0].affected_qualities).toBeUndefined();
    expect(undeclared.relation_review).toBeUndefined();
  });

  it('keeps named artistic losses durable until explicitly resolved accepted or reversed', () => {
    const s = store();
    const record = { id: 'loss-pass', verdict: { at: new Date().toISOString() } };
    s.updatePaintingState(42, current => ({
      ...current,
      ...s.applyArtisticLossUpdates(current, [{
        name: 'edge-breathing-room',
        status: 'observed',
        detail: 'The localRegion edge became too uniformly hard and lost breathing room.',
      }], record),
    }));
    expect(s.paintingState().documents['42'].artistic_losses['edge-breathing-room']).toMatchObject({
      status: 'observed',
      detail: 'The localRegion edge became too uniformly hard and lost breathing room.',
    });

    s.updatePaintingState(42, current => ({
      ...current,
      unrelated_state: 'preserved',
    }));
    expect(s.paintingState().documents['42'].artistic_losses['edge-breathing-room'].status).toBe('observed');

    s.updatePaintingState(42, current => ({
      ...current,
      ...s.applyArtisticLossUpdates(current, [{
        name: 'edge-breathing-room',
        status: 'resolved',
      }], { id: 'loss-repair', verdict: { at: new Date().toISOString() } }),
    }));
    expect(s.paintingState().documents['42'].artistic_losses['edge-breathing-room']).toMatchObject({
      status: 'resolved',
      operation_id: 'loss-repair',
    });
  });

  it('bounds one incomplete artistic hypothesis to a finite review horizon with anchor rollback evidence', () => {
    const s = store();
    const anchor = seedClassifiedFrame(s, 'hypothesis-anchor', 1);
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('hypothesis-anchor-review', 8),
      anchor_decision: {
        action: 'promote_primary',
        operation_id: anchor.operation_id,
        rationale: 'Whole-image review establishes a safe rollback anchor before the bounded experiment.',
      },
    });
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('hypothesis-open', 8),
      incomplete_hypothesis: {
        lost_quality: 'quiet edge rhythm',
        intended_relationship: 'localRegion edge should dissolve into the background without weakening the focalForm silhouette',
        observable_completion_condition: 'the localRegion transition is visibly softer while the primaryForm silhouette remains readable',
        max_review_horizon: 2,
      },
    });
    let state = s.paintingState().documents['42'];
    expect(state.art_director.incomplete_hypothesis).toMatchObject({
      rollback_operation_id: anchor.operation_id,
      rollback_path: anchor.path,
      max_review_horizon: 2,
      remaining_reviews: 2,
    });

    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('hypothesis-review-1', 8),
    });
    state = s.paintingState().documents['42'];
    expect(state.art_director.incomplete_hypothesis.remaining_reviews).toBe(1);
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('hypothesis-review-exhausted', 8),
    })).toThrow(/incomplete_hypothesis_horizon_exhausted/);

    const resolved = s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('hypothesis-resolved', 8),
      incomplete_hypothesis_resolution: 'reversed',
    });
    expect(resolved.art_director.incomplete_hypothesis).toBeNull();
    expect(resolved.art_director.last_incomplete_hypothesis_resolution).toMatchObject({
      resolution: 'reversed',
      rollback_operation_id: anchor.operation_id,
    });
  });

  it('requires dependent Painter work to address an unresolved primary mismatch while allowing preserved independent work', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('mismatch-gate', 8) });
    s.updatePaintingState(42, current => ({
      ...current,
      last_critique: {
        operation_id: 'mismatch-source',
        problem_id: 'focalForm-shadow-side',
        region: 'focalForm',
        primary_mismatch: 'The focalForm shadow still flattens the localRegion plane.',
        target_resolved: 'no',
        uncertainty: 'none observed',
      },
    }));

    expect(() => s.plannerGate(42, painterRequest({
      problem_id: 'unrelated-dependent',
      args: { planner_directive_id: 'mismatch-gate', problem_id: 'unrelated-dependent' },
    }))).toThrow(/primary_mismatch_unresolved/);

    expect(() => s.plannerGate(42, painterRequest({
      args: { planner_directive_id: 'mismatch-gate', problem_id: 'focalForm-shadow-side' },
    }))).not.toThrow();

    expect(() => s.plannerGate(42, painterRequest({
      problem_id: 'background-rain',
      args: {
        planner_directive_id: 'mismatch-gate',
        problem_id: 'background-rain',
        independent_region: true,
        preservation_facts: ['The focalForm layer and silhouette are excluded from this background-only pass.'],
      },
    }))).not.toThrow();

    expect(() => s.plannerGate(42, painterRequest({
      problem_id: 'background-rain',
      args: {
        planner_directive_id: 'mismatch-gate',
        problem_id: 'background-rain',
        independent_region: true,
      },
    }))).toThrow(/requires concrete preservation_facts/);
  });

  it('records whole-image glances only at stage/global/final boundaries and does not require them per local pass', () => {
    const s = store();
    const glanceFrame = seedClassifiedFrame(s, 'glance-frame', 1);
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('glance-review', 8) });
    let state = s.paintingState().documents['42'];
    state = s.advanceArtDirectorAfterVerdict(
      state,
      { ...context(), planner_directive_id: 'glance-review', stage: 'FORM_AND_LIGHT' },
      acceptedVerdict(),
      { id: 'glance-local-1', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(state.art_director.whole_image_glance.due).toBe(false);

    state = s.advanceArtDirectorAfterVerdict(
      state,
      { ...context(), planner_directive_id: 'glance-review', stage: 'EDGE_CONTROL' },
      acceptedVerdict(),
      { id: 'glance-stage-change', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(state.art_director.whole_image_glance).toMatchObject({
      due: true,
      reason: 'stage_boundary',
    });
    s.updatePaintingState(42, () => state);
    expect(() => s.plannerGate(42, painterRequest({
      args: {
        planner_directive_id: 'glance-review',
        problem_id: 'focalForm-shadow-side',
      },
    }))).toThrow(/whole_image_glance_required:.*glance-frame.*stage_boundary/);

    const reviewed = s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('glance-after-stage', 8),
      whole_image_glance: {
        trigger: 'stage_boundary',
        observation: 'The whole image keeps a clear focalForm focus and stable large-value grouping.',
        operation_id: glanceFrame.operation_id,
        frame_sha256: glanceFrame.sha256,
      },
    });
    expect(reviewed.art_director.whole_image_glance).toMatchObject({
      due: false,
      reason: null,
      last_record: expect.objectContaining({ trigger: 'stage_boundary' }),
    });
    expect(reviewed.art_director.whole_image_glance.history).toHaveLength(1);
    expect(() => s.plannerGate(42, painterRequest({
      args: {
        planner_directive_id: 'glance-after-stage',
        problem_id: 'focalForm-shadow-side',
      },
    }))).not.toThrow();

    let globalState = s.advanceArtDirectorAfterVerdict(
      reviewed,
      {
        ...context(),
        planner_directive_id: 'glance-after-stage',
        stage: 'EDGE_CONTROL',
        change_domains: ['large-value'],
      },
      acceptedVerdict(),
      { id: 'glance-global-change', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(globalState.art_director.whole_image_glance).toMatchObject({
      due: true,
      reason: 'global_change',
    });

    const finalDirective = directive('glance-final', 8);
    finalDirective.tasks = [finalDirective.tasks[0]];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: finalDirective });
    const beforeFinal = s.paintingState().documents['42'];
    const finalState = s.advanceArtDirectorAfterVerdict(
      beforeFinal,
      { ...context(), planner_directive_id: 'glance-final' },
      {
        ...acceptedVerdict(),
        target_resolved: 'yes',
        planner_task_assessment: {
          status: 'completed',
          evidence_scope: 'task',
          evidence: ['The bounded task is complete at task scope.'],
        },
      },
      { id: 'glance-final-pass', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(finalState.art_director.whole_image_glance).toMatchObject({
      due: true,
      reason: 'final_review',
    });
  });

  it('requires applicable scene-relation audit at whole-frame review and persists structural defects as blocking debt', () => {
    const s = store();
    const frame = seedClassifiedFrame(s, 'relation-audit-frame', 1);
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('relation-audit', 8) });
    let state = s.paintingState().documents['42'];
    state = s.advanceArtDirectorAfterVerdict(
      state,
      { ...context(), planner_directive_id: 'relation-audit', stage: 'FORM_AND_LIGHT' },
      acceptedVerdict(),
      { id: 'relation-audit-local', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    state = s.advanceArtDirectorAfterVerdict(
      state,
      {
        ...context(),
        planner_directive_id: 'relation-audit',
        stage: 'EDGE_CONTROL',
        affected_relations: ['figure support/contact'],
      },
      acceptedVerdict(),
      { id: 'relation-audit-stage', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    s.updatePaintingState(42, () => state);
    expect(state.art_director.whole_image_glance).toMatchObject({
      due: true,
      reason: 'stage_boundary',
      required_relations: ['figure support/contact'],
    });

    const nextDirective = directive('relation-audit-reviewed', 8);
    const glance = {
      trigger: 'stage_boundary',
      observation: 'Whole-frame review checks the figure grounding against the supporting surface.',
      operation_id: frame.operation_id,
      frame_sha256: frame.sha256,
    };
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: nextDirective,
      whole_image_glance: glance,
    })).toThrow(/relationship_audit must cover the applicable scene relations/);

    const reviewed = s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: nextDirective,
      whole_image_glance: {
        ...glance,
        relationship_audit: {
          checks: [{
            relation: 'figure support/contact',
            status: 'defect',
            review_finding: {
              kind: 'contact_support',
              severity: 'must-fix',
              problem_id: 'figure-contact-gap',
              region_bounds: { left: 10, top: 10, right: 80, bottom: 90 },
            },
          }],
        },
      },
    });
    expect(reviewed.art_director.whole_image_glance.last_record.relationship_audit).toMatchObject({
      required_relations: ['figure support/contact'],
      checks: [{ relation: 'figure support/contact', status: 'defect' }],
    });
    expect(reviewed.visual_problems['figure-contact-gap']).toMatchObject({
      severity: 'must-fix',
      status: 'open',
      structural_review: true,
      source_operation_id: frame.operation_id,
      evidence_sha256: frame.sha256,
      review_source: 'whole_image_glance.relationship_audit',
    });
    expect(() => s.priorityGate(42, painterRequest({
      strategy_family: 'cosmetic-texture',
      problem_id: 'figure-contact-gap',
      args: {
        planner_directive_id: 'relation-audit-reviewed',
        planner_task_id: 'shadow-side',
        problem_id: 'figure-contact-gap',
      },
    }))).toThrow(/structural_debt_requires_structural_correction/);
  });

  it('blocks Painter from global/compositional changes unless the directive task explicitly permits them', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive() });
    expect(() => s.plannerGate(42, painterRequest({
      args: { change_domains: ['composition'] },
    }))).toThrow(/planner_review_required: Painter cannot change composition/);

    const permitted = directive('focalForm-focus-allowed', 5);
    permitted.tasks[0].allowed_global_changes = ['large-value'];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: permitted });
    expect(() => s.plannerGate(42, painterRequest({
      args: {
        planner_directive_id: 'focalForm-focus-allowed',
        change_domains: ['large-value'],
      },
    }))).not.toThrow();
  });

  it('allows directive-bound standalone Curves while rejecting an unbound artistic adjustment', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive() });

    expect(() => s.plannerGate(42, {
      id: 'curves-bound',
      tool: 'photoshop_adjust_curves',
      args: { document_id: 42, preset: 'auto_tone' },
      planner_directive_id: 'focalForm-focus',
      planner_task_id: 'shadow-side',
      painter_scope: 'medium',
      change_domains: ['local-tone'],
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      problem_id: 'focalForm-shadow-side',
    })).not.toThrow();

    expect(() => s.plannerGate(42, {
      id: 'curves-unbound',
      tool: 'photoshop_adjust_curves',
      args: { document_id: 42, preset: 'auto_tone' },
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      problem_id: 'focalForm-shadow-side',
    })).toThrow(/painter_contract_gate/);
  });

  it('requires multiple cheap alternatives before committing a free composition', () => {
    const s = store();
    const free = directive();
    free.composition_freedom = 'free';
    free.composition_exploration = {
      hypotheses: [{
        id: 'single',
        summary: 'One centered composition only.',
        large_masses: 'Single centered figure mass.',
        negative_space: 'Balanced space on both sides.',
        light_pattern: 'Single frontal light mass.',
      }],
      selected_id: 'single',
      selection_reason: 'Only one option was considered.',
    };
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: free }))
      .toThrow(/at least two cheap structural hypotheses/);

    free.composition_exploration.hypotheses.push({
      id: 'offset',
      summary: 'Offset figure with stronger directional tension.',
      large_masses: 'Figure occupies left third against a broad backgroundField mass.',
      negative_space: 'Open right-side space reinforces gaze direction.',
      light_pattern: 'Diagonal warm light cuts across the focalForm and segmentsB.',
    });
    free.composition_exploration.selected_id = 'offset';
    delete free.composition_exploration.selection_reason;
    const freeState = s.setArtDirectorState({ document_id: 42, action: 'review', directive: free });
    expect(freeState.art_director.composition_exploration.selection_reason).toBeNull();

    for (let index = 3; index <= 5; index += 1) {
      free.composition_exploration.hypotheses.push({
        id: `free-${index}`,
        summary: `Free composition alternative ${index}.`,
        large_masses: `Alternative ${index} changes the large mass balance.`,
        negative_space: `Alternative ${index} changes the negative-space rhythm.`,
        light_pattern: `Alternative ${index} changes the broad light pattern.`,
      });
    }
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: free })).not.toThrow();
  });

  it('admits fixed/reference composition with zero alternatives and forbids branch ceremony', () => {
    const s = store();
    const fixed = directive('fixed-reference', 5);
    fixed.composition_freedom = 'fixed';
    fixed.composition_exploration = { hypotheses: [] };
    const state = s.setArtDirectorState({ document_id: 42, action: 'review', directive: fixed });
    expect(state.art_director.composition_freedom).toBe('fixed');
    expect(state.art_director.composition_exploration).toMatchObject({
      hypotheses: [],
      selected_id: null,
      selection_reason: null,
      material_choice_unresolved: false,
    });

    fixed.composition_exploration = {
      hypotheses: [{
        id: 'unneeded-branch',
        summary: 'Unneeded variant.',
        large_masses: 'Same reference masses.',
        negative_space: 'Same reference negative space.',
        light_pattern: 'Same reference light pattern.',
      }],
      selected_id: 'unneeded-branch',
      selection_reason: 'This should never be required for a fixed composition.',
    };
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: fixed }))
      .toThrow(/fixed forbids composition variant branching/);
  });

  it('allows constrained composition with no unresolved material choice to skip alternatives entirely', () => {
    const s = store();
    const constrained = directive('constrained-no-choice', 5);
    constrained.composition_freedom = 'constrained';
    constrained.composition_exploration = {
      hypotheses: [],
      material_choice_unresolved: false,
    };
    const state = s.setArtDirectorState({ document_id: 42, action: 'review', directive: constrained });
    expect(state.art_director.composition_freedom).toBe('constrained');
    expect(state.art_director.composition_exploration.hypotheses).toEqual([]);
    expect(state.art_director.composition_exploration.material_choice_unresolved).toBe(false);
  });

  it('requires a bounded cheap comparison only when constrained composition declares an unresolved material choice', () => {
    const s = store();
    const constrained = directive('constrained-material-choice', 5);
    constrained.composition_freedom = 'constrained';
    constrained.composition_exploration = {
      hypotheses: [{
        id: 'left-bias',
        summary: 'Figure held left against broad open space.',
        large_masses: 'Primary figure mass on left third.',
        negative_space: 'Open right field remains dominant.',
        light_pattern: 'Warm diagonal enters from upper left.',
      }],
      material_choice_unresolved: true,
      selected_id: 'left-bias',
      selection_reason: 'A material placement choice still needs comparison.',
    };
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: constrained }))
      .toThrow(/bounded comparison of 2-4 cheap structural hypotheses/);

    constrained.composition_exploration.hypotheses.push({
      id: 'center-bias',
      summary: 'Figure held centrally with tighter flanking space.',
      large_masses: 'Primary figure mass near center.',
      negative_space: 'Narrower side fields balance the figure.',
      light_pattern: 'Warm light remains diagonal but more symmetrical.',
    });
    constrained.composition_exploration.selected_id = 'left-bias';
    delete constrained.composition_exploration.selection_reason;
    const state = s.setArtDirectorState({ document_id: 42, action: 'review', directive: constrained });
    expect(state.art_director.composition_exploration.hypotheses).toHaveLength(2);
    expect(state.art_director.composition_exploration.selected_id).toBe('left-bias');
    expect(state.art_director.composition_exploration.selection_reason).toBeNull();

    for (let index = 3; index <= 5; index += 1) {
      constrained.composition_exploration.hypotheses.push({
        id: `constrained-${index}`,
        summary: `Constrained alternative ${index}.`,
        large_masses: `Alternative ${index} changes the bounded mass placement.`,
        negative_space: `Alternative ${index} changes the bounded negative-space option.`,
        light_pattern: `Alternative ${index} changes the bounded light-pattern option.`,
      });
    }
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: constrained }))
      .toThrow(/bounded comparison of 2-4 cheap structural hypotheses/);
  });

  it('keeps cheap composition exploration as controller data with zero Photoshop operation records', () => {
    const s = store();
    const free = directive('cheap-data-only', 5);
    free.composition_freedom = 'free';
    free.composition_exploration = {
      hypotheses: [
        {
          id: 'quiet-center',
          summary: 'Quiet centered arrangement.',
          large_masses: 'Centered figure against a broad background mass.',
          negative_space: 'Even lateral breathing room.',
          light_pattern: 'Soft frontal light grouping.',
        },
        {
          id: 'open-right',
          summary: 'Offset figure with open right field.',
          large_masses: 'Figure mass shifted left.',
          negative_space: 'Large open field on right.',
          light_pattern: 'Diagonal light reinforces the offset.',
        },
      ],
      selected_id: 'open-right',
      selection_reason: 'The offset hypothesis produces clearer directional tension before any rendering task starts.',
    };
    expect(s.records()).toHaveLength(0);
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: free });
    expect(s.records()).toHaveLength(0);
  });

  it('persists and reconstructs composition freedom and selected cheap hypotheses across restart/status', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'planner-composition-restart-'));
    dirs.push(dir);
    const first = storeAt(dir);
    const free = directive('restart-free', 5);
    free.composition_freedom = 'free';
    free.composition_exploration = {
      hypotheses: [
        {
          id: 'a',
          summary: 'Centered structural option.',
          large_masses: 'Centered dominant mass.',
          negative_space: 'Balanced flanks.',
          light_pattern: 'Broad centered light.',
        },
        {
          id: 'b',
          summary: 'Offset structural option.',
          large_masses: 'Dominant mass shifted left.',
          negative_space: 'Open right field.',
          light_pattern: 'Diagonal light rhythm.',
        },
      ],
      selected_id: 'b',
      selection_reason: 'The offset structural option creates the clearer large-scale read.',
    };
    first.setArtDirectorState({ document_id: 42, action: 'review', directive: free });

    const restarted = storeAt(dir);
    const compact = restarted.statusCompact() as any;
    expect(compact.documents['42'].art_director.composition_freedom).toBe('free');
    expect(compact.documents['42'].art_director.composition_exploration).toMatchObject({
      selected_id: 'b',
      hypotheses: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })],
    });
    const resumed = restarted.resume(42) as any;
    expect(resumed.document.art_director.composition_freedom).toBe('free');
    expect(resumed.document.art_director.composition_exploration.selected_id).toBe('b');
  });

  it('does not infer new composition_freedom semantics from a legacy durable mode on v2 read', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'planner-composition-legacy-'));
    dirs.push(dir);
    const first = storeAt(dir);
    first.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        directive_id: 'legacy-free',
        status: 'active',
        composition_exploration: {
          mode: 'free_composition',
          hypotheses: [{
            id: 'legacy-a',
            summary: 'Legacy option A.',
            large_masses: 'A masses.',
            negative_space: 'A space.',
            light_pattern: 'A light.',
          }, {
            id: 'legacy-b',
            summary: 'Legacy option B.',
            large_masses: 'B masses.',
            negative_space: 'B space.',
            light_pattern: 'B light.',
          }],
          selected_id: 'legacy-b',
          selection_reason: 'Legacy selected structural direction.',
        },
      },
    }));

    const restarted = storeAt(dir);
    const state = restarted.paintingState().documents['42'];
    expect(state.art_director.composition_freedom).toBeUndefined();
    expect(state.art_director.composition_exploration).toMatchObject({
      mode: 'free_composition',
      selected_id: 'legacy-b',
    });
  });

  it('blocks completion when final comparison says a previous accepted state is stronger', () => {
    const s = store();
    const single = directive('compare-finish', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: single });
    const current = s.paintingState().documents['42'];
    const resolved = s.advanceArtDirectorAfterVerdict(
      current,
      { ...context(), planner_directive_id: 'compare-finish' },
      {
        ...acceptedVerdict(),
        target_resolved: 'yes',
        planner_task_assessment: {
          status: 'completed',
          evidence_scope: 'task',
          evidence: ['The full bounded task objective is complete.'],
        },
      },
      { id: 'resolved-pass', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    s.updatePaintingState(42, () => resolved);
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      final_comparison: {
        scope: 'no_previous',
        preferred: 'previous',
        reason: 'The earlier state had stronger unity and a cleaner focal rhythm than the current finish.',
        criteria: {
          coherence: 'Earlier state grouped the masses more clearly.',
          expressiveness: 'Earlier state felt less overworked and more immediate.',
          color: 'Earlier state preserved cleaner warm-cool relationships.',
          rhythm: 'Earlier accents produced a stronger visual cadence.',
          detail_selectivity: 'Earlier state concentrated detail more selectively.',
        },
      },
    })).toThrow(/restore\/reconcile that stronger state/);
  });

  it('blocks Art Director completion while an unresolved structural must-fix problem remains', () => {
    const s = store();
    seedClassifiedFrame(s, 'structural-debt-final-frame', 1);
    const single = directive('structural-debt-final', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: single });
    s.updatePaintingState(42, current => ({
      ...current,
      visual_problems: {
        ...(current.visual_problems ?? {}),
        'facade-perspective': {
          problem_id: 'facade-perspective',
          scale: 'global',
          severity: 'must-fix',
          status: 'open',
          region: 'whole-frame',
          structural_review: true,
          source_review_kind: 'perspective_geometry',
        },
      },
      art_director: {
        ...current.art_director,
        tasks: current.art_director.tasks.map(task => ({ ...task, status: 'completed' })),
        current_task_id: null,
      },
    }));

    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      ...completionReviewEvidence(s),
      final_comparison: {
        scope: 'no_previous', preferred: 'current',
        reason: 'The current frame is the only final candidate.',
        criteria: {
          coherence: 'Current candidate only.', expressiveness: 'Current candidate only.',
          color: 'Current candidate only.', rhythm: 'Current candidate only.', detail_selectivity: 'Current candidate only.',
        },
      },
    })).toThrow(/unresolved must-fix visual problem remains: facade-perspective/);
  });

  it('keeps a locally accepted weaker frame without overwriting the primary artistic anchor', () => {
    const s = store();
    const anchorFrame = seedClassifiedFrame(s, 'anchor-strong', 1);
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('anchor-review', 5),
      anchor_decision: {
        action: 'promote_primary',
        operation_id: anchorFrame.operation_id,
        rationale: 'Whole-image review identifies this frame as the strongest coherent direction.',
      },
    });

    const keptFrame = seedClassifiedFrame(s, 'kept-local-repair', 2);
    const state = s.paintingState().documents['42'];
    expect(state.accepted_frame.operation_id).toBe(keptFrame.operation_id);
    expect(state.primary_artistic_anchor).toMatchObject({
      operation_id: anchorFrame.operation_id,
      sha256: anchorFrame.sha256,
      path: anchorFrame.path,
    });
  });

  it('allows an explicit durable anchor choice without prose rationale', () => {
    const s = store();
    const anchorFrame = seedClassifiedFrame(s, 'anchor-without-prose', 1);
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('anchor-without-prose-review', 5),
      anchor_decision: {
        action: 'promote_primary',
        operation_id: anchorFrame.operation_id,
      },
    });

    const state = s.paintingState().documents['42'];
    expect(state.primary_artistic_anchor).toMatchObject({
      operation_id: anchorFrame.operation_id,
      sha256: anchorFrame.sha256,
      path: anchorFrame.path,
      rationale: null,
    });
    expect(state.last_anchor_decision).toMatchObject({
      action: 'promote_primary',
      operation_id: anchorFrame.operation_id,
      rationale: null,
    });
  });

  it('preserves primary and bounded alternative anchors across restart and resume', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'planner-painter-restart-'));
    dirs.push(dir);
    const first = storeAt(dir);
    const primary = seedClassifiedFrame(first, 'primary-anchor', 1);
    first.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('primary-anchor-review', 5),
      anchor_decision: {
        action: 'promote_primary',
        operation_id: primary.operation_id,
        rationale: 'Whole-image review promotes the strongest current composition as the primary anchor.',
      },
    });
    const alternative = seedClassifiedFrame(first, 'atmosphere-alternative', 2);
    first.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('alternative-anchor-review', 5),
      anchor_decision: {
        action: 'preserve_alternative',
        operation_id: alternative.operation_id,
        rationale: 'This variant preserves a distinct atmospheric strength worth retaining as an alternative.',
      },
    });

    const restarted = storeAt(dir);
    const compact = restarted.statusCompact() as any;
    expect(compact.documents['42'].primary_artistic_anchor.operation_id).toBe(primary.operation_id);
    expect(compact.documents['42'].alternative_artistic_anchors).toEqual([
      expect.objectContaining({ operation_id: alternative.operation_id }),
    ]);
    const resumed = restarted.resume(42) as any;
    expect(resumed.document.primary_artistic_anchor.operation_id).toBe(primary.operation_id);
    expect(resumed.document.alternative_artistic_anchors[0].operation_id).toBe(alternative.operation_id);
  });

  it('promotes a new primary while retaining the previous primary as a bounded alternative', () => {
    const s = store();
    const first = seedClassifiedFrame(s, 'first-primary', 1);
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('first-primary-review', 5),
      anchor_decision: {
        action: 'promote_primary',
        operation_id: first.operation_id,
        rationale: 'Initial whole-image review establishes the first strong artistic reference.',
      },
    });
    const second = seedClassifiedFrame(s, 'second-primary', 2);
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('second-primary-review', 5),
      anchor_decision: {
        action: 'promote_primary',
        operation_id: second.operation_id,
        preserve_previous_as_alternative: true,
        rationale: 'The new frame is stronger overall while the previous frame retains a distinct useful quality.',
      },
    });
    const state = s.paintingState().documents['42'];
    expect(state.primary_artistic_anchor.operation_id).toBe(second.operation_id);
    expect(state.alternative_artistic_anchors).toEqual([
      expect.objectContaining({ operation_id: first.operation_id }),
    ]);
  });

  it('requires final comparison to reference the durable primary anchor and cannot ignore a stronger anchor', () => {
    const s = store();
    const primary = seedClassifiedFrame(s, 'finish-primary', 1);
    const single = directive('finish-anchor-directive', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: single,
      anchor_decision: {
        action: 'promote_primary',
        operation_id: primary.operation_id,
        rationale: 'Whole-image review establishes the strongest prior state for final comparison.',
      },
    });
    const current = seedClassifiedFrame(s, 'finish-current', 2);
    s.updatePaintingState(42, state => ({
      ...state,
      art_director: {
        ...state.art_director,
        tasks: state.art_director.tasks.map(task => ({ ...task, status: 'completed' })),
        current_task_id: null,
      },
    }));

    const finalComparison = {
      scope: 'compared',
      current_operation_id: current.operation_id,
      best_previous_operation_id: primary.operation_id,
      preferred: 'previous',
      reason: 'The primary anchor remains stronger because the current frame is more detailed but less coherent.',
      criteria: {
        coherence: 'The primary anchor groups the large masses more clearly.',
        expressiveness: 'The primary anchor has a more immediate expressive read.',
        color: 'The primary anchor preserves cleaner warm-cool relationships.',
        rhythm: 'The primary anchor retains a stronger visual cadence.',
        detail_selectivity: 'The current frame spreads detail too evenly.',
      },
    };
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      final_comparison: finalComparison,
    })).toThrow(/previous artistic anchor/);

    seedClassifiedFrame(s, 'not-an-anchor', 1.5, { current: false, accepted: true });
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      final_comparison: {
        ...finalComparison,
        best_previous_operation_id: 'not-an-anchor',
        preferred: 'current',
      },
    })).toThrow(/durable artistic anchor/);

    const completed = s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      ...completionReviewEvidence(s),
      final_comparison: {
        ...finalComparison,
        preferred: 'current',
        reason: 'After explicit comparison, the current state is selected as the stronger final artistic state.',
      },
    });
    expect(completed.final_artistic_frame).toMatchObject({
      operation_id: current.operation_id,
      sha256: current.sha256,
      path: current.path,
      selection: 'current',
    });
    expect(completed.art_director.final_comparison).toMatchObject({
      evidence_contract: 'composition-whole-frame',
    });
  });

  it('completes a structurally evidenced final comparison without narrative reason or criteria prose', () => {
    const s = store();
    const primary = seedClassifiedFrame(s, 'finish-prose-free-primary', 1);
    const single = directive('finish-prose-free-directive', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: single,
      anchor_decision: {
        action: 'promote_primary',
        operation_id: primary.operation_id,
      },
    });
    const current = seedClassifiedFrame(s, 'finish-prose-free-current', 2);
    s.updatePaintingState(42, state => ({
      ...state,
      art_director: {
        ...state.art_director,
        tasks: state.art_director.tasks.map(task => ({ ...task, status: 'completed' })),
        current_task_id: null,
      },
    }));

    const completed = s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      ...completionReviewEvidence(s),
      final_comparison: {
        scope: 'compared',
        current_operation_id: current.operation_id,
        best_previous_operation_id: primary.operation_id,
        preferred: 'current',
      },
    });

    expect(completed.final_artistic_frame).toMatchObject({
      operation_id: current.operation_id,
      selection: 'current',
    });
    expect(completed.art_director.final_comparison).toMatchObject({
      scope: 'compared',
      preferred: 'current',
      evidence_contract: 'composition-whole-frame',
    });
    expect(completed.art_director.final_comparison.reason).toBeUndefined();
    expect(completed.art_director.final_comparison.criteria).toBeUndefined();
  });

  it('rejects final comparison when only local/crop evidence survives but the whole-frame artifact is missing', () => {
    const s = store();
    const primary = seedClassifiedFrame(s, 'crop-only-primary', 1);
    const single = directive('crop-only-final-directive', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: single,
      anchor_decision: {
        action: 'promote_primary',
        operation_id: primary.operation_id,
        rationale: 'Establish durable whole-frame anchor before crop-only final comparison control.',
      },
    });
    const current = seedClassifiedFrame(s, 'crop-only-current', 2);
    const currentRecord = s.read(current.operation_id)!;
    currentRecord.review_evidence = [{
      capture_id: 'crop-only-evidence',
      source_operation_id: current.operation_id,
      document_id: 42,
      bound_whole_sha256: current.sha256,
      review_level: 'object',
      requested_region: { left: 10, top: 10, right: 40, bottom: 40 },
      effective_region: { left: 5, top: 5, right: 45, bottom: 45 },
      sha256: 'f'.repeat(64),
      materialized_path: current.path + '.crop.jpg',
    }];
    s.write(currentRecord);
    unlinkSync(current.path);
    s.updatePaintingState(42, state => ({
      ...state,
      art_director: {
        ...state.art_director,
        tasks: state.art_director.tasks.map(task => ({ ...task, status: 'completed' })),
        current_task_id: null,
      },
    }));

    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      final_comparison: {
        scope: 'compared',
        current_operation_id: current.operation_id,
        best_previous_operation_id: primary.operation_id,
        preferred: 'current',
        reason: 'Crop-only evidence must not substitute for the missing whole-frame final comparison artifact.',
        criteria: {
          coherence: 'Local crop is insufficient to judge whole-image coherence.',
          expressiveness: 'Local crop is insufficient to judge whole-image expressiveness.',
          color: 'Local crop is insufficient to judge whole-image color relationships.',
          rhythm: 'Local crop is insufficient to judge whole-image rhythm.',
          detail_selectivity: 'Local crop is insufficient to judge global detail selectivity.',
        },
      },
    })).toThrow(/whole-frame composition evidence/);
  });

  it('allows canonical completion after a failed experiment is really restored to the primary anchor', () => {
    const s = store();
    const primary = seedClassifiedFrame(s, 'restore-primary', 1);
    const single = directive('restore-primary-directive', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: single,
      anchor_decision: {
        action: 'promote_primary',
        operation_id: primary.operation_id,
        rationale: 'Establish the strongest verified frame before the bounded reversible experiment.',
      },
    });
    const restored = seedClassifiedFrame(s, 'restore-current', 3);
    s.updatePaintingState(42, state => ({
      ...state,
      current_frame: {
        ...state.current_frame,
        operation_id: restored.operation_id,
        sha256: primary.sha256,
        path: restored.path,
      },
      art_director: {
        ...state.art_director,
        status: 'interrupted',
        tasks: state.art_director.tasks.map(task => ({ ...task, status: 'failed' })),
        current_task_id: state.art_director.tasks[0].task_id,
      },
    }));

    const completed = s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      ...completionReviewEvidence(s),
      final_comparison: {
        scope: 'compared',
        current_operation_id: restored.operation_id,
        best_previous_operation_id: primary.operation_id,
        preferred: 'tie',
        reason: 'A real rollback restored the exact primary-anchor pixels, so the canonical final is the restored anchor state.',
        criteria: {
          coherence: 'Exact anchor restoration preserves the same coherent mass grouping.',
          expressiveness: 'Exact anchor restoration preserves the same expressive state.',
          color: 'Exact anchor restoration preserves the same color relationships.',
          rhythm: 'Exact anchor restoration preserves the same visual rhythm.',
          detail_selectivity: 'Exact anchor restoration preserves the same detail selectivity.',
        },
      },
    });
    expect(completed.final_artistic_frame).toMatchObject({
      operation_id: restored.operation_id,
      sha256: primary.sha256,
      selection: 'tie',
      restored_primary_anchor: true,
      restored_primary_anchor_operation_id: primary.operation_id,
    });
    expect(completed.art_director.final_comparison).toMatchObject({
      restored_primary_anchor: true,
      best_previous_operation_id: primary.operation_id,
    });
  });

  it('does not use anchor hash equality to bypass active unfinished work', () => {
    const s = store();
    const primary = seedClassifiedFrame(s, 'restore-primary-active', 1);
    const single = directive('restore-active-directive', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: single,
      anchor_decision: {
        action: 'promote_primary',
        operation_id: primary.operation_id,
        rationale: 'Establish the primary frame for the active-task bypass regression test.',
      },
    });
    const current = seedClassifiedFrame(s, 'restore-active-current', 2);
    s.updatePaintingState(42, state => ({
      ...state,
      current_frame: { ...state.current_frame, sha256: primary.sha256, path: current.path },
    }));
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      final_comparison: {
        scope: 'compared',
        current_operation_id: current.operation_id,
        best_previous_operation_id: primary.operation_id,
        preferred: 'tie',
        reason: 'This should remain blocked because the task is still active despite matching pixels.',
        criteria: {
          coherence: 'same',
          expressiveness: 'same',
          color: 'same',
          rhythm: 'same',
          detail_selectivity: 'same',
        },
      },
    })).toThrow(/unfinished tasks remain/);
  });

  it('requires every Painter mutation to bind to the active directive and bounded task', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive() });
    expect(() => s.plannerGate(42, painterRequest({
      args: { planner_directive_id: undefined, planner_task_id: undefined, painter_scope: undefined, change_domains: [] },
    }))).toThrow(/painter_contract_gate/);
    expect(() => s.plannerGate(42, painterRequest({
      args: { planner_task_id: 'not-a-task' },
    }))).toThrow(/unknown planner_task_id/);
  });

  it('turns a failed directive pass into an early Planner interrupt', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('focalForm-focus', 8) });
    const current = s.paintingState().documents['42'];
    const next = s.advanceArtDirectorAfterVerdict(
      current,
      context(),
      {
        verdict: 'regression',
        disposition: 'rollback',
        target_resolved: 'no',
        regressions: ['focalForm shape became visibly worse'],
        global_readability: 'stable',
      },
      { id: 'failed-pass', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    expect(next.art_director.tasks[0].status).toBe('failed');
    expect(next.art_director.status).toBe('interrupted');
    expect(next.art_director.review_reason).toBe('early_interrupt:serious_visual_error');
  });

  it('returns a failed Painter task to Art Director review instead of activating a pending task', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive('focalForm-focus', 8) });
    const current = s.paintingState().documents['42'];
    const next = s.advanceArtDirectorAfterVerdict(
      current,
      context(),
      {
        verdict: 'regression',
        disposition: 'rollback',
        target_resolved: 'no',
        regressions: [],
        global_readability: 'stable',
      },
      { id: 'failed-pass-no-interrupt', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    s.updatePaintingState(42, () => next);

    expect(next.art_director.tasks[0].status).toBe('failed');
    expect(next.art_director.tasks[1].status).toBe('pending');
    expect(next.art_director.current_task_id).toBe('shadow-side');
    expect(next.art_director.status).toBe('review_due');
    expect(next.art_director.review_due).toBe(true);
    expect(next.art_director.review_reason).toBe('task_failed:shadow-side');
    expect(() => s.plannerGate(42, painterRequest({
      args: { planner_task_id: 'localRegion-edge', scale: 'small', region: 'localRegion' },
    }))).toThrow(/review required|planner_review_required/);
  });

  it('supports directive completion and a fresh replan as a new Planner review', () => {
    const s = store();
    seedClassifiedFrame(s, 'single-task-current-frame', 1);
    const single = directive('single-task', 5);
    single.tasks = [single.tasks[0]];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: single });
    const current = s.paintingState().documents['42'];
    const resolved = s.advanceArtDirectorAfterVerdict(
      current,
      { ...context(), planner_directive_id: 'single-task' },
      {
        ...acceptedVerdict(),
        target_resolved: 'yes',
        planner_task_assessment: {
          status: 'completed',
          evidence_scope: 'task',
          evidence: ['The full bounded task objective is complete.'],
        },
      },
      { id: 'resolved-pass', verdict: { trend_signals: [], at: new Date().toISOString() } }
    );
    s.updatePaintingState(42, () => resolved);
    expect(resolved.art_director.review_reason).toBe('directive_tasks_completed');
    const completed = s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      ...completionReviewEvidence(s),
      final_comparison: {
        scope: 'no_previous',
        preferred: 'current',
        reason: 'This isolated planner test has no earlier accepted visual state to compare against.',
        criteria: {
          coherence: 'Current state remains internally coherent.',
          expressiveness: 'No contradictory expressive regression is present.',
          color: 'No competing color state exists in this isolated test.',
          rhythm: 'No earlier rhythm variant exists for comparison.',
          detail_selectivity: 'No prior accepted detail state exists for comparison.',
        },
      },
    });
    expect(completed.art_director.status).toBe('completed');

    const replanned = s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive('next-directive', 6),
    });
    expect(replanned.art_director.directive_id).toBe('next-directive');
    expect(replanned.art_director.status).toBe('active');
    expect(replanned.art_director.completed_microplans).toBe(0);
  });

  it('blocks Art Director completion on E.18 insufficient geometry but allows an explicit flat applicability opt-out', () => {
    const s = store();
    const frame = seedClassifiedFrame(s, 'e17c-final-frame', 1);
    s.updatePaintingState(42, current => ({
      ...current,
      document_instance: {
        protocol: 'photoshop.guard.document_instance.v1',
        host_witness: {
          protocol: 'photoshop.uxp.document_instance_witness.v1',
          session_id: 'planner-e17c', token: 'planner-e17c:42',
        },
      },
    }));
    const d = directive('e17c-completion', 5);
    d.tasks = [d.tasks[0]];
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: d });
    s.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        ...current.art_director,
        current_task_id: null,
        review_reason: 'directive_tasks_completed',
        tasks: current.art_director.tasks.map((task: any) => ({ ...task, status: 'completed' })),
      },
    }));
    const writeGeometry = (id: string, sequence: number, model: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'E17c final gate',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, scene_geometry_model: model,
    } as any);
    writeGeometry('e17c-insufficient', 2, {
      model_id: 'planner-e17c-scene', revision: 1, applicability: 'insufficient_evidence',
      applicability_rationale: 'Current frame does not yet establish enough shared geometry for a completion claim.',
      source_frame: { document_id: 42, document_incarnation: 'planner-e17c:42', width: 1000, height: 800 },
      projection: { kind: 'custom', vanishing_points: [] },
    });
    const finalComparison = {
      scope: 'no_previous', preferred: 'current',
      reason: 'No earlier accepted whole-frame state exists in this isolated completion-gate regression.',
      criteria: {
        coherence: 'Current state is the only candidate.', expressiveness: 'No earlier candidate exists.',
        color: 'No earlier candidate exists.', rhythm: 'No earlier candidate exists.', detail_selectivity: 'No earlier candidate exists.',
      },
    };
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'complete', final_comparison: finalComparison }))
      .toThrow(/E\.18 geometry completion debt.*scene_geometry_insufficient_evidence/);

    writeGeometry('e17c-flat-optout', 3, {
      model_id: 'planner-e17c-scene', revision: 2, applicability: 'flat_or_collage',
      applicability_rationale: 'The requested graphic is intentionally flat and does not claim coherent perspective depth.',
      source_frame: { document_id: 42, document_incarnation: 'planner-e17c:42', width: 1000, height: 800 },
      projection: { kind: 'custom', vanishing_points: [] },
    });
    const completed = s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      ...completionReviewEvidence(s),
      final_comparison: finalComparison,
    });
    expect(completed.art_director.status).toBe('completed');
    expect(completed.final_artistic_frame).toMatchObject({ operation_id: frame.operation_id });
  });

  it('supports Painter-declared unsafe execution as an event-driven interrupt without a Photoshop mutation', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive() });
    const interrupted = s.setArtDirectorState({
      document_id: 42,
      action: 'interrupt',
      reason: 'unsafe_to_execute_directive',
      detail: 'The requested localRegion edit would require moving the protected primaryForm silhouette.',
    });
    expect(interrupted.art_director.status).toBe('interrupted');
    expect(interrupted.art_director.interrupt.reason).toBe('unsafe_to_execute_directive');
  });

  it('allows a structurally classified Art Director interrupt without narrative detail', () => {
    const s = store();
    s.setArtDirectorState({ document_id: 42, action: 'review', directive: directive() });
    const interrupted = s.setArtDirectorState({
      document_id: 42,
      action: 'interrupt',
      reason: 'serious_visual_error',
    });
    expect(interrupted.art_director.status).toBe('interrupted');
    expect(interrupted.art_director.interrupt).toMatchObject({ reason: 'serious_visual_error' });
    expect(interrupted.art_director.interrupt).not.toHaveProperty('detail');
  });
});

describe('Painter VisualMicroPlan envelope', () => {
  it('requires complete planner binding when a micro-plan is Painter-bound', () => {
    const base = {
      plan_id: 'planner-bound-plan',
      summary: 'Bounded focalForm correction',
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      region: 'focalForm',
      intent: 'darken local focalForm shadow',
      method_class: 'paint',
      risk: 'low',
      expected_visual_delta: 'Right focalForm shadow becomes slightly darker.',
      verification_envelope: { mode: 'after_only' },
      layer_separation_check: {
        change_kind: 'continuation',
        substantial: true,
        rollback_value: 'low',
        independent_adjustment_expected: false,
        reasons: ['This bounded Painter pass continues the existing focalForm shadow unit.'],
      },
      planner_directive_id: 'focalForm-focus',
      planner_task_id: 'shadow-side',
      painter_scope: 'medium',
      change_domains: ['local-tone'],
      problem_id: 'focalForm-shadow-side',
      action_class: 'REFINE',
      expected_visual_result: 'Local focalForm shadow is darker.',
      document_id: 42,
      steps: [
        { id: 'dab', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    };
    const parsed = parseVisualMicroPlan(base);
    expect(parsed.plannerDirectiveId).toBe('focalForm-focus');
    expect(parsed.plannerTaskId).toBe('shadow-side');
    expect(parsed.changeDomains).toEqual(['local-tone']);

    expect(() => parseVisualMicroPlan({ ...base, planner_task_id: undefined })).toThrow(/supplied together/);
    expect(() => parseVisualMicroPlan({ ...base, change_domains: [] })).toThrow(/requires at least one change_domains/);
  });
});
