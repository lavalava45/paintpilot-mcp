import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SessionStore } from '../src/core/guard/session-store.js';
import {
  normalizeRefinementCheck,
  REFINEMENT_CRITERIA,
  resolveVisualDevelopmentGate,
} from '../src/core/refinement-check.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'refinement-check-'));
  dirs.push(dir);
  return new SessionStore(path.join(dir, 'controller'), {
    visualBarrierDirectory: path.join(dir, 'barriers'),
  });
}

function criteria(overrides: Record<string, string> = {}) {
  return Object.fromEntries(REFINEMENT_CRITERIA.map(key => [
    key,
    {
      status: overrides[key] ?? (key === 'selective_detail' ? 'not-applicable' : 'resolved'),
      note: `${key} fixture observation`,
    },
  ]));
}

function resolvedMaterialResponse(overrides: Record<string, string> = {}) {
  const component = (key: string) => ({
    status: overrides[key] ?? 'resolved',
    note: `${key} is qualitatively coherent with the visible form and material role.`,
  });
  return {
    response_role: 'base-material',
    components: {
      base_response: component('base_response'),
      form_light_response: component('form_light_response'),
      specular_reflection: component('specular_reflection'),
      transmission: { status: 'not-applicable', note: 'The represented base material is opaque in this fixture.' },
      surface_condition: { status: 'not-applicable', note: 'No distinct surface-condition layer is required in this fixture.' },
      variation_scale: component('variation_scale'),
      edge_contact: component('edge_contact'),
    },
    microtexture: {
      status: 'deferred',
      note: 'Microtexture remains subordinate until the larger material response is established.',
    },
    texture_only_treatment: false,
  };
}

function passingRefinement(operationId = 'form-frame', sha = 'a'.repeat(64)) {
  return {
    status: 'pass',
    observed: true,
    preview_sha256: sha,
    evidence_operation_id: operationId,
    representation_change: 'meaningful',
    low_frequency_evidence: {
      status: 'resolved',
      observed: true,
      source_preview_sha256: sha,
      evidence_operation_id: operationId + '-low-frequency',
      note: 'Major form remains readable after low-frequency/thumbnail suppression of small texture.',
    },
    criteria: criteria(),
    material_response: resolvedMaterialResponse(),
    confidence: 0.85,
    limitations: [],
  };
}

function seedLowFrequencyEvidence(
  s: SessionStore,
  sourceOperationId = 'form-frame',
  sourceSha = 'a'.repeat(64)
) {
  const root = path.dirname((s as any).directory);
  const lowPath = path.join(root, sourceOperationId + '.low-frequency.jpg');
  const bytes = Buffer.from('low-frequency-evidence-' + sourceOperationId);
  writeFileSync(lowPath, bytes);
  const lowSha = createHash('sha256').update(bytes).digest('hex');
  s.write({
    id: sourceOperationId + '-low-frequency',
    tool: 'photoshop_analyze_value_structure',
    args: { document_id: 42, materialize_path: path.join(root, sourceOperationId + '.grayscale.jpg') },
    summary: 'Low-frequency structure evidence',
    purpose: 'Verify that major-form modelling survives suppression of small texture/noise',
    hash: 'hash-' + sourceOperationId + '-low-frequency',
    sequence: 2,
    created_at: new Date(1003).toISOString(),
    completed_at: new Date(1004).toISOString(),
    phase: 'completed',
    visual: false,
    failed: false,
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          observed: true,
          source_preview_sha256: sourceSha,
          grayscale_sha256: 'd'.repeat(64),
          low_frequency_sha256: lowSha,
          low_frequency_materialized_path: lowPath,
        }),
      }],
    },
  });
}

function directive(refinementCheck: Record<string, unknown>) {
  return {
    directive_id: 'refinement-directive',
    composition_freedom: 'fixed',
    goal: 'Advance from modelled form to selective detail without preserving temporary block-in geometry.',
    artistic_evaluation_contract: {
      contract_id: 'refinement-contract',
      revision: 1,
      positive_criteria: ['Large and secondary forms are modelled before selective detail.'],
      failure_signals: ['Texture or small marks increase while lower-frequency form debt remains.'],
      protected_qualities: ['coherent whole-image structure'],
      stage_transition_expectations: ['DETAIL begins only after durable progressive-refinement evidence passes.'],
      final_evidence_requirements: ['Use the exact current frame for refinement judgement.'],
      provenance: [{ source: 'task-23-fixture', detail: 'Generic controlled representation-transition fixture.' }],
    },
    style_contract: {
      realism_level: 'materially modelled representational target',
      edge_policy: 'intentional hard/firm/soft/lost/broken hierarchy',
      material_treatment: 'surface response follows form and light rather than texture noise',
      detail_density: 'selective focal detail only after lower-frequency structure is resolved',
      primitive_footprint_tolerance: 'temporary block-in primitives should not dominate the finished representation',
    },
    prompt_conflict_preflight: {
      dominant_objective: 'Materially modelled representational form before selective detail.',
      secondary_traits: ['intentional edge hierarchy', 'selective focal detail'],
      conflicts: [],
      resolution_mode: 'none',
      chosen_rendering_strategy: 'Resolve lower-frequency form and material response before any selective detail pass.',
      resolution_rationale: 'The refinement fixture has no conflicting pipeline interpretation.',
      first_pass_strategy: ['resolve form debt', 'model secondary forms'],
    },
    strategy_validation_after_microplans: 2,
    strategy_validation: { status: 'pending' },
    composition_exploration: { hypotheses: [] },
    perceptual_hierarchy: {
      revision: 1,
      mode: 'distributed',
      zones: [{
        id: 'whole-frame',
        owner_ids: ['whole-frame'],
        priority: 'distributed',
        contrast_budget: 'medium',
        detail_budget: 'medium',
        edge_certainty: 'medium',
        chroma_accent: 'restricted',
      }],
      ordering: [],
    },
    assessment: {
      composition: 'Stable.',
      focal_hierarchy: 'Stable.',
      large_value_masses: 'Stable.',
      lighting: 'Coherent.',
      silhouette: 'Readable.',
      depth: 'Readable.',
      likeness_main_shape: 'Stable.',
      overall_detail_level: 'Form stage before detail.',
      mood: 'Stable.',
      color_relationships: 'Stable.',
      shape_language: 'Representational masses.',
      edge_hierarchy: 'Mixed by form and depth.',
      intentional_omission: 'Micro detail deferred.',
      next_priority: 'Resolve form debt before detail.',
    },
    value_check: {
      status: 'style-not-applicable',
      observed: false,
      applicability_reason: 'Task 23 fixture isolates refinement-gate mechanics from the independent grayscale Value Gate.',
      style_contract_basis: { field: 'detail_density', criterion: 'selective focal detail only after lower-frequency structure is resolved' },
      limitations: [],
    },
    refinement_check: refinementCheck,
    priorities: ['major form modelling', 'secondary forms', 'residual block-in'],
    review_after_microplans: 5,
    tasks: [{
      task_id: 'detail-pass',
      summary: 'Add only selective structurally useful detail.',
      region: 'focal-region',
      allowed_scales: ['detail', 'small'],
    }],
  };
}

function detailRequest() {
  return {
    id: 'detail-pass-1',
    tool: 'photoshop_execute_visual_microplan',
    args: {
      document_id: 42,
      planner_directive_id: 'refinement-directive',
      planner_task_id: 'detail-pass',
      painter_scope: 'local',
      change_domains: ['local-texture'],
      stage: 'DETAIL',
      scale: 'detail',
      region: 'focal-region',
      problem_id: 'selective-detail',
    },
    summary: 'Selective detail after form refinement.',
    purpose: 'Exercise Task 23 stage gate.',
    problem_id: 'selective-detail',
    stage: 'DETAIL',
    scale: 'detail',
  };
}

function seedCurrentVisualFrame(s: SessionStore, id = 'form-frame', sha = 'a'.repeat(64)) {
  s.write({
    id,
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42, stage: 'FORM_AND_LIGHT' },
    summary: 'Generic form refinement fixture',
    purpose: 'Provide exact current-frame evidence for Task 23',
    hash: 'hash-' + id,
    sequence: 1,
    created_at: new Date(1000).toISOString(),
    completed_at: new Date(1001).toISOString(),
    phase: 'completed',
    visual: true,
    failed: false,
    preview: { sha256: sha, document_id: 42 },
    verdict: { disposition: 'accept', verdict: 'improvement', at: new Date(1002).toISOString() },
  });
  s.updatePaintingState(42, current => ({
    ...current,
    current_frame: {
      operation_id: id,
      sha256: sha,
      accepted: true,
      acceptance_scope: 'pixels_retained_not_goal_confirmation',
      goal_confirmation: 'unresolved',
    },
  }));
  seedLowFrequencyEvidence(s, id, sha);
}

describe('Task 23 progressive refinement contract', () => {
  it('accepts meaningful generic form refinement evidence', () => {
    expect(normalizeRefinementCheck(passingRefinement())).toMatchObject({
      status: 'pass',
      representation_change: 'meaningful',
    });
  });

  it('rejects texture-only pseudo-refinement even when every criterion is claimed resolved', () => {
    expect(() => normalizeRefinementCheck({
      ...passingRefinement(),
      representation_change: 'texture-only',
    })).toThrow(/representation_change=meaningful/);
  });

  it('rejects noisy texture as resolved material when form/light response remains debt', () => {
    expect(() => normalizeRefinementCheck({
      ...passingRefinement(),
      material_response: {
        ...resolvedMaterialResponse({ form_light_response: 'debt' }),
        texture_only_treatment: true,
      },
    })).toThrow(/texture-only material treatment|material_response/i);
  });

  it('permits an intentionally flat material decomposition only through an exact style-contract basis', () => {
    const stylizedResponse = {
      ...resolvedMaterialResponse(),
      components: {
        ...resolvedMaterialResponse().components,
        form_light_response: {
          status: 'not-applicable',
          note: 'The exact flat graphic material treatment intentionally omits volumetric light modelling.',
        },
      },
      style_contract_basis: {
        field: 'material_treatment',
        criterion: 'flat graphic color families with no simulated photoreal surface response',
      },
    };
    const candidate = passingRefinement();
    candidate.material_response = stylizedResponse;

    const s = store();
    seedCurrentVisualFrame(s);
    const stylized = directive(candidate);
    stylized.style_contract = {
      ...stylized.style_contract,
      material_treatment: 'flat graphic color families with no simulated photoreal surface response',
    };
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: stylized })).not.toThrow();

    const mismatch = directive(candidate);
    mismatch.style_contract = {
      ...mismatch.style_contract,
      material_treatment: 'different flat treatment',
    };
    expect(() => s.setArtDirectorState({ document_id: 42, action: 'review', directive: mismatch }))
      .toThrow(/material_response style_contract_basis.*exactly match/i);
  });

  it('rejects a claimed PASS without explicit low-frequency evidence', () => {
    const candidate = { ...passingRefinement() } as Record<string, unknown>;
    delete candidate.low_frequency_evidence;
    expect(() => normalizeRefinementCheck(candidate)).toThrow(/requires low_frequency_evidence/i);
  });

  it('rejects a claimed PASS when low-frequency inspection finds debt', () => {
    expect(() => normalizeRefinementCheck({
      ...passingRefinement(),
      low_frequency_evidence: {
        ...passingRefinement().low_frequency_evidence,
        status: 'debt',
      },
    })).toThrow(/low_frequency_evidence.status=resolved/i);
  });

  it('rejects a pass while major or secondary form debt remains', () => {
    expect(() => normalizeRefinementCheck({
      ...passingRefinement(),
      criteria: criteria({ secondary_forms: 'debt' }),
    })).toThrow(/lower-frequency refinement debt.*secondary_forms/i);
  });

  it('rejects a pass while residual block-in geometry remains unresolved', () => {
    expect(() => normalizeRefinementCheck({
      ...passingRefinement(),
      criteria: criteria({ residual_block_in: 'uncertain' }),
    })).toThrow(/lower-frequency refinement debt.*residual_block_in/i);
  });

  it('permits explicit stylized control only when it is anchored to an exact style-contract criterion', () => {
    const s = store();
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: {
        ...directive({
          status: 'style-not-applicable',
          observed: false,
          applicability_reason: 'The declared flat graphic treatment intentionally preserves simplified planar representation.',
          style_contract_basis: {
            field: 'primitive_footprint_tolerance',
            criterion: 'temporary block-in primitives should not dominate the finished representation',
          },
        }),
        style_contract: {
          realism_level: 'intentionally flat graphic treatment',
          edge_policy: 'clean hard graphic contours',
          detail_density: 'minimal',
          primitive_footprint_tolerance: 'intentional flat primitives are part of the final graphic language',
        },
      },
    })).toThrow(/exactly match/);

    const stylized = directive({
      status: 'style-not-applicable',
      observed: false,
      style_contract_basis: {
        field: 'primitive_footprint_tolerance',
        criterion: 'intentional flat primitives are part of the final graphic language',
      },
    });
    stylized.style_contract = {
      realism_level: 'intentionally flat graphic treatment',
      edge_policy: 'clean hard graphic contours',
      detail_density: 'minimal',
      primitive_footprint_tolerance: 'intentional flat primitives are part of the final graphic language',
    };
    stylized.value_check.style_contract_basis = {
      field: 'detail_density',
      criterion: 'minimal',
    };
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: stylized,
    })).not.toThrow();
    const state = s.paintingState().documents['42'];
    expect(state.art_director.refinement_check.applicability_reason).toBeNull();
    expect(() => s.plannerGate(42, detailRequest())).not.toThrow();
  });

  it('fails closed at DETAIL while refinement evidence is pending', () => {
    const s = store();
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive({ status: 'pending', observed: false }),
    });
    expect(() => s.plannerGate(42, detailRequest())).toThrow(/refinement_check_required/);
  });

  it('blocks DETAIL for durable texture-only/form debt and admits it after a current-frame pass', () => {
    const s = store();
    seedCurrentVisualFrame(s);
    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive({
        status: 'fail',
        observed: true,
        preview_sha256: 'a'.repeat(64),
        evidence_operation_id: 'form-frame',
        representation_change: 'texture-only',
        criteria: criteria({ major_form_modelling: 'debt', secondary_forms: 'debt' }),
        confidence: 0.9,
      }),
    });
    expect(() => s.plannerGate(42, detailRequest())).toThrow(/refinement_debt_unresolved/);

    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive(passingRefinement()),
    });
    expect(() => s.plannerGate(42, detailRequest())).not.toThrow();
  });

  it('rejects stale refinement evidence after the current frame changes', () => {
    const s = store();
    seedCurrentVisualFrame(s);
    s.updatePaintingState(42, current => ({
      ...current,
      current_frame: {
        ...current.current_frame,
        operation_id: 'newer-frame',
        sha256: 'b'.repeat(64),
      },
    }));
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive(passingRefinement()),
    })).toThrow(/stale|current document frame/);
  });

  it('rejects low-frequency evidence from a different current preview', () => {
    const s = store();
    seedCurrentVisualFrame(s);
    const candidate = passingRefinement();
    candidate.low_frequency_evidence.source_preview_sha256 = 'b'.repeat(64);
    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive(candidate),
    })).toThrow(/low_frequency_evidence.*SHA mismatch|same preview/i);
  });

  it('persists the same refinement gate state across a SessionStore restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'refinement-restart-'));
    dirs.push(dir);
    const controllerDir = path.join(dir, 'controller');
    const options = { visualBarrierDirectory: path.join(dir, 'barriers') };
    const first = new SessionStore(controllerDir, options);
    seedCurrentVisualFrame(first);
    first.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive(passingRefinement()),
    });
    const before = first.paintingState().documents['42'].art_director.refinement_check;

    const second = new SessionStore(controllerDir, options);
    const after = second.paintingState().documents['42'].art_director.refinement_check;
    expect(after).toEqual(before);
    expect(() => second.plannerGate(42, detailRequest())).not.toThrow();
  });

  it('contains no subject-specific heuristic table or explicit subject-conditioned branch in the refinement contract module', async () => {
    const source = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('../src/core/refinement-check.ts', import.meta.url), 'utf8')
    );
    expect(source).not.toMatch(/SUBJECT_(?:RE|NAMES|KINDS)|OBJECT_(?:RE|NAMES|KINDS)/i);
    expect(source).not.toMatch(/subject[_-]?specific|object[_-]?specific/i);
  });

  it('blocks a nontrivial final frame whose provenance remains region-dominant with no post-block-in mark-making', () => {
    const result = resolveVisualDevelopmentGate({
      paintingProfile: 'nontrivial_painting',
      refinementCheck: normalizeRefinementCheck(passingRefinement()),
      provenance: {
        region_construction_operations: 4,
        post_blockin_markmaking_operations: 0,
        post_blockin_markmaking_tools: [],
        blockin_primitive_dominance: true,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.bands).toEqual({
      primary_structure: 'resolved',
      secondary_form: 'resolved',
      tertiary_material: 'resolved',
    });
    expect(result.errors.join('\n')).toMatch(/blockin_primitive_dominance/);
  });

  it('admits exact-frame multiscale development when later material mark-making is present', () => {
    const result = resolveVisualDevelopmentGate({
      paintingProfile: 'nontrivial_painting',
      refinementCheck: normalizeRefinementCheck(passingRefinement()),
      provenance: {
        region_construction_operations: 4,
        post_blockin_markmaking_operations: 2,
        post_blockin_markmaking_tools: ['photoshop_paint_strokes'],
        blockin_primitive_dominance: false,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      bands: {
        primary_structure: 'resolved',
        secondary_form: 'resolved',
        tertiary_material: 'resolved',
      },
      primitive_style_exception: false,
    });
  });

  it('allows primitive-dominant provenance only through an explicit representation-style exemption', () => {
    const result = resolveVisualDevelopmentGate({
      paintingProfile: 'nontrivial_painting',
      refinementCheck: normalizeRefinementCheck({
        status: 'style-not-applicable',
        observed: false,
        applicability_reason: 'The declared flat graphic treatment intentionally uses planar primitives as final representation.',
        style_contract_basis: {
          field: 'primitive_footprint_tolerance',
          criterion: 'intentional flat primitives are part of the final graphic language',
        },
      }),
      provenance: {
        region_construction_operations: 8,
        post_blockin_markmaking_operations: 0,
        post_blockin_markmaking_tools: [],
        blockin_primitive_dominance: true,
      },
    });
    expect(result).toMatchObject({ ok: true, primitive_style_exception: true });
  });

  it('blocks Art Director completion when a nontrivial current frame is still objectively region-dominant', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/visual-development-finalization-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const sha = 'a'.repeat(64);
    s.write({
      id: 'region-frame-1',
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42, stage: 'GLOBAL_BLOCK_IN', steps: [{ tool: 'photoshop_paint_regions' }] },
      summary: 'First region scaffold', purpose: 'visual-development fixture', hash: 'r1', sequence: 1,
      created_at: new Date(1000).toISOString(), completed_at: new Date(1001).toISOString(),
      phase: 'completed', visual: true, failed: false,
      preview: { sha256: 'b'.repeat(64), document_id: 42 },
      verdict: {
        disposition: 'accept', verdict: 'improvement', at: new Date(1002).toISOString(),
        artistic_value: { execution_changed: true },
      },
    });
    seedCurrentVisualFrame(s, 'region-frame-2', sha);
    const currentRecord = s.read('region-frame-2')!;
    currentRecord.args = {
      ...currentRecord.args,
      stage: 'SHAPE',
      steps: [{ tool: 'photoshop_paint_regions' }],
    };
    currentRecord.verdict = {
      ...currentRecord.verdict,
      artistic_value: { execution_changed: true },
    };
    s.write(currentRecord);

    s.setArtDirectorState({
      document_id: 42,
      action: 'review',
      directive: directive(passingRefinement('region-frame-2', sha)),
    });
    s.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        ...current.art_director,
        tasks: current.art_director.tasks.map(task => ({ ...task, status: 'completed' })),
        current_task_id: null,
      },
    }));

    expect(() => s.setArtDirectorState({
      document_id: 42,
      action: 'complete',
      final_comparison: {
        scope: 'no_previous',
        preferred: 'current',
        reason: 'The current exact frame is the only available candidate for this finalization-control fixture.',
        criteria: {
          coherence: 'Synthetic fixture coherence.',
          expressiveness: 'Synthetic fixture expressiveness.',
          color: 'Synthetic fixture color.',
          rhythm: 'Synthetic fixture rhythm.',
          detail_selectivity: 'Synthetic fixture detail selectivity.',
        },
      },
    })).toThrow(/blockin_primitive_dominance/);
  });
});
