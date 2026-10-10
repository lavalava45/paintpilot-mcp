import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { SessionStore } from '../src/core/guard/session-store.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'representation-fidelity-'));
  dirs.push(dir);
  return {
    dir,
    store: new SessionStore(path.join(dir, 'controller'), {
      visualBarrierDirectory: path.join(dir, 'barriers'),
    }),
  };
}

function jpegMeta(dir: string, name: string, value: number) {
  const width = 64;
  const height = 64;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const bytes = jpeg.encode({ data, width, height }, 100).data;
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    materialized_path: file,
    width,
    height,
    canvas_width: width,
    canvas_height: height,
    scale_x: 1,
    scale_y: 1,
    mime_type: 'image/jpeg',
    document_id: 42,
  };
}

function seedOwnerPass(
  s: SessionStore,
  dir: string,
  id: string,
  sequence: number,
  beforeValue: number,
  afterValue: number,
  styleContractBasis?: { field: string; criterion: string }
) {
  const before = jpegMeta(dir, `${id}-before.jpg`, beforeValue);
  const after = jpegMeta(dir, `${id}-after.jpg`, afterValue);
  s.write({
    id,
    tool: 'photoshop_execute_visual_microplan',
    args: {
      document_id: 42,
      stage: 'GLOBAL_BLOCK_IN',
      scale: 'medium',
      problem_id: 'robed-figures-representation',
      logical_layer: {
        hypothesis_id: 'figures-owner',
        layer_id: 7,
        physical_role: 'opaque-mass',
      },
      ...(styleContractBasis ? { style_contract_basis: styleContractBasis } : {}),
      steps: [{ id: 'figure-block', tool: 'photoshop_paint_regions', args: {} }],
    },
    summary: 'Build two robed figure silhouettes.',
    purpose: 'Exercise representation-fidelity bridge.',
    hash: `hash-${id}`,
    sequence,
    created_at: new Date(sequence * 1000).toISOString(),
    completed_at: new Date(sequence * 1000 + 1).toISOString(),
    phase: 'completed',
    visual: true,
    failed: false,
    before_preview: before,
    preview: after,
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({
          continuation_layers: [{
            hypothesis_id: 'figures-owner',
            layer_id: 7,
            physical_role: 'opaque-mass',
          }],
        }),
      }],
    },
  });
  return after.sha256;
}

function verdictInput(id: string, sha256: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    preview_id: id,
    sha256,
    verdict: 'improvement',
    disposition: 'accept',
    observations: [{
      region: 'whole frame',
      visible: 'The two robed figures are visible and the exact current frame has been reviewed.',
    }],
    primary_mismatch: 'The figure representation still needs an explicit structural-fidelity judgement.',
    observed_change: 'Two recognizable robed figure silhouettes were added to the scene.',
    target_resolved: 'yes',
    regressions: [],
    uncertainty: 'none observed',
    global_readability: 'improved',
    primitive_footprint: 'none',
    trend_signals: [],
    recognition: {
      subject: 'yes',
      style: 'not_applicable',
      evaluator: 'producer',
      visible_features: ['two robed figures'],
      lost_features: [],
    },
    ...overrides,
  };
}

describe('owner-local representation fidelity bridge', () => {
  it('does not let recognizability close a representational owner while primitive scaffold footprint is still suspect', () => {
    const fixture = store();
    const sha = seedOwnerPass(fixture.store, fixture.dir, 'figure-scaffold', 1, 30, 120);

    expect(() => fixture.store.validateVerdictInput(verdictInput('figure-scaffold', sha, {
      primitive_footprint: 'suspect',
    }))).toThrow(/representation_fidelity_unresolved.*figures-owner/i);
  });

  it('persists scaffold debt per semantic owner, exposes it to continuation, and clears it only on a non-primitive resolving pass', () => {
    const fixture = store();
    const firstSha = seedOwnerPass(fixture.store, fixture.dir, 'figure-scaffold-open', 1, 30, 100);
    fixture.store.verdict(verdictInput('figure-scaffold-open', firstSha, {
      target_resolved: 'no',
      primitive_footprint: 'suspect',
    }));

    expect(fixture.store.paintingState().documents['42'].owner_representation_state['figures-owner']).toMatchObject({
      owner_id: 'figures-owner',
      state: 'scaffold-debt',
      primitive_footprint: 'suspect',
      representation_change: 'insufficient',
      residual_block_in: 'debt',
      source_operation_id: 'figure-scaffold-open',
    });
    expect(fixture.store.artisticContinuationContext(42).owners).toEqual(expect.arrayContaining([
      expect.objectContaining({
        owner_id: 'figures-owner',
        representation_state: expect.objectContaining({ state: 'scaffold-debt' }),
      }),
    ]));

    const secondSha = seedOwnerPass(fixture.store, fixture.dir, 'figure-structural-refine', 2, 100, 180);
    fixture.store.verdict(verdictInput('figure-structural-refine', secondSha, {
      primitive_footprint: 'acceptable',
    }));

    expect(fixture.store.paintingState().documents['42'].owner_representation_state['figures-owner']).toMatchObject({
      state: 'structurally-faithful',
      primitive_footprint: 'acceptable',
      representation_change: 'meaningful',
      residual_block_in: 'resolved',
      source_operation_id: 'figure-structural-refine',
    });
  });

  it('blocks DETAIL while owner-local scaffold debt survives even if a stale/global refinement pass is present', () => {
    const fixture = store();
    fixture.store.updatePaintingState(42, current => ({
      ...current,
      painting_profile: 'nontrivial_painting',
      current_stage: 'FORM_AND_LIGHT',
      owner_representation_state: {
        'figures-owner': {
          owner_id: 'figures-owner',
          state: 'scaffold-debt',
          primitive_footprint: 'suspect',
        },
      },
      art_director: {
        directive_id: 'representation-directive',
        status: 'active',
        review_due: false,
        style_contract: {
          realism_level: 'representational',
          detail_density: 'low detail before form is resolved',
          primitive_footprint_tolerance: 'temporary primitives must not dominate final representation',
        },
        value_check: { status: 'style-not-applicable' },
        refinement_check: {
          status: 'pass',
          low_frequency_evidence: { status: 'resolved' },
        },
        tasks: [{
          task_id: 'detail-pass',
          status: 'active',
          allowed_scales: ['detail'],
          allowed_global_changes: [],
        }],
      },
    }));

    expect(() => fixture.store.plannerGate(42, {
      tool: 'photoshop_execute_visual_microplan',
      args: {
        document_id: 42,
        stage: 'DETAIL',
        scale: 'detail',
        planner_directive_id: 'representation-directive',
        planner_task_id: 'detail-pass',
        painter_scope: 'local',
        change_domains: ['local-texture'],
      },
    })).toThrow(/refinement_owner_representation_debt.*figures-owner/i);
  });

  it('allows an intentional primitive final representation only through an exact style-contract basis', () => {
    const fixture = store();
    const criterion = 'intentional flat primitives are part of the final graphic language';
    fixture.store.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        style_contract: {
          primitive_footprint_tolerance: criterion,
        },
      },
    }));
    const sha = seedOwnerPass(
      fixture.store,
      fixture.dir,
      'figure-flat-style',
      1,
      20,
      150,
      { field: 'primitive_footprint_tolerance', criterion }
    );

    expect(() => fixture.store.verdict(verdictInput('figure-flat-style', sha, {
      primitive_footprint: 'suspect',
    }))).not.toThrow();
    expect(fixture.store.paintingState().documents['42'].owner_representation_state['figures-owner']).toMatchObject({
      state: 'style-exempt',
      style_contract_basis: { field: 'primitive_footprint_tolerance', criterion },
    });
  });
});


describe('representation assessment cannot disappear behind a resolved local operation', () => {
  it('retains an unknown assessment as owner-local debt without rejecting the useful initial block-in', () => {
    const fixture = store();
    const sha = seedOwnerPass(fixture.store, fixture.dir, 'unassessed-blockin', 1, 30, 120);
    fixture.store.verdict(verdictInput('unassessed-blockin', sha, { primitive_footprint: 'unknown' }));
    const state = fixture.store.paintingState().documents['42'];
    expect(state.owner_representation_state['figures-owner']).toMatchObject({
      state: 'assessment-pending', primitive_footprint: 'unknown', evidence_sha256: sha,
      source_operation_id: 'unassessed-blockin', residual_block_in: 'uncertain',
    });
    expect(fixture.store.read('unassessed-blockin').verdict.target_resolved).toBe('yes');
    expect(fixture.store.artisticContinuationContext(42).next_candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'resolve-owner-representation', target_owner_id: 'figures-owner', evidence_sha256: sha }),
    ]));
    const request = (stage: string) => ({ tool: 'photoshop_execute_visual_microplan', args: {
      document_id: 42, stage, scale: 'medium', logical_layer: { hypothesis_id: 'figures-owner', physical_role: 'opaque-mass', layer_id: 7 },
    } });
    expect(() => fixture.store.plannerGate(42, request('GLOBAL_BLOCK_IN'))).not.toThrow();
    expect(() => fixture.store.plannerGate(42, request('FORM'))).not.toThrow();
    expect(() => fixture.store.plannerGate(42, request('TEXTURE'))).toThrow(/owner_representation_debt.*figures-owner/);
    expect(() => fixture.store.plannerGate(42, request('DETAIL'))).toThrow(/owner_representation_debt.*figures-owner/);
    const nextSha = seedOwnerPass(fixture.store, fixture.dir, 'assessed-form', 2, 120, 180);
    fixture.store.verdict(verdictInput('assessed-form', nextSha, { primitive_footprint: 'acceptable' }));
    expect(fixture.store.paintingState().documents['42'].owner_representation_state['figures-owner'].state).toBe('structurally-faithful');
    expect(() => fixture.store.plannerGate(42, request('TEXTURE'))).not.toThrow();
  });

  it('preserves a known scaffold defect through unknown and unrelated-owner observations', () => {
    const fixture = store();
    const sha = seedOwnerPass(fixture.store, fixture.dir, 'known-scaffold', 1, 30, 100);
    fixture.store.verdict(verdictInput('known-scaffold', sha, { primitive_footprint: 'suspect', target_resolved: 'no' }));
    const unknownSha = seedOwnerPass(fixture.store, fixture.dir, 'unassessed-tweak', 2, 100, 120);
    fixture.store.verdict(verdictInput('unassessed-tweak', unknownSha, { primitive_footprint: 'unknown', target_resolved: 'uncertain' }));
    expect(fixture.store.paintingState().documents['42'].owner_representation_state['figures-owner'].state).toBe('scaffold-debt');
    const otherSha = seedOwnerPass(fixture.store, fixture.dir, 'background-refine', 3, 120, 180);
    const other = fixture.store.read('background-refine');
    other.args.logical_layer.hypothesis_id = 'background-owner';
    other.result = { content: [{type: 'text', text: JSON.stringify({continuation_layers: [{ hypothesis_id: 'background-owner', layer_id: 8, physical_role: 'opaque-mass' }]})}] };
    fixture.store.write(other);
    fixture.store.verdict(verdictInput('background-refine', otherSha));
    expect(fixture.store.paintingState().documents['42'].owner_representation_state['figures-owner'].state).toBe('scaffold-debt');
    expect(fixture.store.artisticContinuationContext(42).next_candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ target_owner_id: 'figures-owner', representation_state: 'scaffold-debt' }),
    ]));
  });
});


it.each(['unknown', 'suspect'] as const)('keeps direct blur tied to owner representation review (%s)', footprint => {
  const f = store();
  const before = seedOwnerPass(f.store, f.dir, 'blur-owner-before', 1, 50, 100);
  f.store.verdict(verdictInput('blur-owner-before', before, { primitive_footprint:'suspect', target_resolved:'no' }));
  const after = seedOwnerPass(f.store, f.dir, 'blur-owner-after', 2, 100, 125);
  const record = f.store.read('blur-owner-after');
  f.store.write({ ...record, tool:'photoshop_apply_gaussian_blur', logical_layer:record.args.logical_layer,
    stage:'GLOBAL_BLOCK_IN', args:{document_id:42,layer_id:7,radius:10}, result:{content:[{type:'text',text:JSON.stringify({ok:true,details:{original_preserved:true,filter_mode:'smart-filter',source_layer_id:7,layer_id:9}})}]} });
  if (footprint === 'suspect') {
    expect(() => f.store.verdict(verdictInput('blur-owner-after',after,{primitive_footprint:footprint,target_resolved:'yes'}))).toThrow(/representation_fidelity_unresolved/);
  } else {
    f.store.verdict(verdictInput('blur-owner-after',after,{primitive_footprint:footprint,target_resolved:'uncertain'}));
    expect(f.store.paintingState().documents['42'].owner_representation_state['figures-owner']).toMatchObject({state:'scaffold-debt'});
  }
});
