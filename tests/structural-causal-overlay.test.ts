import { describe, expect, it } from 'vitest';
import { criticCorrectionIssue } from '../src/core/guard/critic-correction.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sha = 'a550f1ef21ea38c459a3adaf7f64c9e1168f00cb86c4e93330bcdaa4877a34c0';
const operationId = 'rainy-street-20261018-far-roof-planes-v1';
const defect = {
  id: 'roofline-center-distance', kind: 'composition-relation',
  visible: 'Bright repeated chevrons in far roofs pierce gray mist and attract excessive attention.',
  brief_relevance: 'Distant architecture should fade in fog while the warm lamp stays the focal point.',
  recheck: 'On exact updated scene pixels check that roof markings no longer attract focus.',
  part_ids: ['distant-roofline-field', 'distant-alley-fog-veil', 'lamp-glowing-glass'],
  relation_ids: ['roofline-center-distance'],
  region_bounds: { left: 310, top: 260, right: 655, bottom: 390 },
};
function fixture() {
  const state: any = {
    document_id: 625,
    visual_problems: { [defect.id]: { problem_id: defect.id,
      status: 'open', structural_defect: defect, structural_review: true } },
    chat_critic_findings: [{ criterion: 'composition_context', correction_kind: 'composition',
      problem_id: defect.id, visible: defect.visible,
      next_change: 'Remove isolated V-shaped marks in the distant roof layer.',
      structural_defect: defect, source_operation_id: operationId, evidence_sha256: sha }],
    logical_layer_owners: [
      { layer_id: 20, hypothesis_id: 'far-roof-material-owner-v1' },
      { layer_id: 18, hypothesis_id: 'far-city-rooftop-owner-v1' },
      { layer_id: 19, hypothesis_id: 'far-mist-owner-v2' },
      { layer_id: 7, hypothesis_id: 'lamp-warm-bulb' },
    ],
    scene_ownership_plan: { units: [
      { semantic_id: 'far-roof-planar-weathering', owner_id: 'far-roof-material-owner-v1' },
      { semantic_id: 'distant-roofline-field', owner_id: 'far-city-rooftop-owner-v1' },
      { semantic_id: 'distant-alley-fog-veil', owner_id: 'far-mist-owner-v2' },
      { semantic_id: 'lamp-glowing-glass', owner_id: 'lamp-warm-bulb' },
    ] },
    editable_scope_review: { scope: 'whole-scene',
      operation_id: operationId, frame_sha256: sha,
      topology_signature: 'one-retained-review-signature',
      parts: [
        { semantic_id: 'far-roof-planar-weathering', owner_id: 'far-roof-material-owner-v1',
          layer_id: 20, status: 'unknown',
          visible: 'Pale repeated V marks are visible and unconvincing.' },
        { semantic_id: 'distant-roofline-field', owner_id: 'far-city-rooftop-owner-v1',
          layer_id: 18, status: 'unknown', visible: 'Dark roof silhouettes' },
      ] },
  };
  const originalOperation: any = {
    id: operationId, tool: 'photoshop_execute_visual_microplan',
    visual: true, phase: 'completed', failed: false,
    args: { document_id: 625 },
    preview: { sha256: sha },
    result: { content: [{ type: 'text', text: JSON.stringify({
      continuation_layers: [
        { layer_id: 20, hypothesis_id: 'far-roof-material-owner-v1' },
      ],
    }) }] },
  };
  const request: any = {
    tool: 'photoshop_execute_visual_microplan',
    action_class: 'REFINE', visual_intent: 'mass', impact_class: 'construct',
    stage: 'SHAPE', addresses_problem_ids: ['roofline-center-distance'],
    logical_layer: { hypothesis_id: 'far-roof-material-owner-v1', layer_id: 20 },
    structural_correction: {
      defect_id: 'roofline-center-distance',
      part_ids: ['distant-roofline-field'],
      relation_ids: ['roofline-center-distance'],
      target: 'Replace the pale zigzags with subdued roof faceting on layer 20 only.',
      execution: 'brush', sequence: 'partial-rebuild',
      causal_source: {
        semantic_id: 'far-roof-planar-weathering',
        owner_id: 'far-roof-material-owner-v1',
        layer_id: 20, source_operation_id: operationId, frame_sha256: sha,
      },
    },
    args: { steps: [{ tool: 'photoshop_paint_regions', args: {
      layer_id: 20, regions: [{ contours: [{
        points: [{ x: 350, y: 330 }, { x: 400, y: 300 }, { x: 480, y: 360 }],
      }] }],
    } }] },
  };
  return { state, request, originalOperation };
}

describe('structural causal source overlay — exact-frame provenance, no arbitrary owner transfer', () => {
  it('accepts only the pinned failed roof overlay with a complete exact source receipt', () => {
    const f = fixture();
    expect(criticCorrectionIssue(f.state, f.request, f.originalOperation)).toBeUndefined();
    expect(f.state.visual_problems[defect.id].structural_defect.part_ids).toEqual(defect.part_ids);
    expect(f.state.editable_scope_review.parts[0].layer_id).toBe(20);
  });
  it('old behavior still refuses the unrelated overlay without verified causal_source', () => {
    const f = fixture();
    delete f.request.structural_correction.causal_source;
    expect(criticCorrectionIssue(f.state, f.request, f.originalOperation)?.code)
      .toBe('structural_correction_owner_mismatch');
  });
  it.each([
    'missing-source-record', 'stale-reviewed-frame', 'wrong-owner', 'wrong-layer',
    'wrong-source-operation', 'missing-receipt', 'no-scene-owner',
    'duplicate-owner', 'foreign-mutation', 'unreviewed-layer',
    'resolved-defect', 'wrong-document', 'implicit-layer-target',
    'duplicate-owner-receipt', 'same-owner-second-layer',
  ])('refuses an unauthenticated correction: %s', variant => {
    const f = fixture();
    let source: any = f.originalOperation;
    const proof = f.request.structural_correction.causal_source;
    switch (variant) {
      case 'missing-source-record': source = undefined; break;
      case 'stale-reviewed-frame': f.state.editable_scope_review.frame_sha256 = 'b'.repeat(64); break;
      case 'wrong-owner': proof.owner_id = 'far-city-rooftop-owner-v1'; break;
      case 'wrong-layer': proof.layer_id = 18; break;
      case 'wrong-source-operation': proof.source_operation_id = 'some-other-operation'; break;
      case 'missing-receipt': source.result.content = []; break;
      case 'no-scene-owner': f.state.scene_ownership_plan.units = []; break;
      case 'duplicate-owner': f.state.logical_layer_owners.push({
        layer_id: 20, hypothesis_id: 'foreign-owner',
      }); break;
      case 'foreign-mutation': f.request.args.steps.push({
        tool: 'photoshop_paint_regions', args: { layer_id: 7,
          regions: [{ contours: [{ points: [
            { x: 350, y: 330 }, { x: 400, y: 300 }, { x: 480, y: 360 },
          ] }] }] },
      }); break;
      case 'unreviewed-layer': f.state.editable_scope_review.parts = []; break;
      case 'resolved-defect': f.state.visual_problems[defect.id].status = 'resolved'; break;
      case 'wrong-document': source.args.document_id = 42; break;
      case 'implicit-layer-target': f.request.args.steps.push({
        tool: 'photoshop_paint_regions',
        args: { regions: [{ contours: [{ points: [
          { x: 350, y: 330 }, { x: 400, y: 300 }, { x: 480, y: 360 },
        ] }] }] },
      }); break;
      case 'duplicate-owner-receipt': source.result.content[0].text = JSON.stringify({
        continuation_layers: [
          { layer_id: 20, hypothesis_id: 'far-roof-material-owner-v1' },
          { layer_id: 21, hypothesis_id: 'far-roof-material-owner-v1' },
        ],
      }); break;
      case 'same-owner-second-layer': f.state.logical_layer_owners.push({
        layer_id: 21, hypothesis_id: 'far-roof-material-owner-v1',
      }); break;
    }
    expect(criticCorrectionIssue(f.state, f.request, source)?.code).toBe(
      'structural_correction_owner_mismatch',
    );
  });
  it('does not use causal source to waive relationship/geometry method requirements', () => {
    const f = fixture();
    f.request.structural_correction.relation_ids = ['not-the-reviewed-relation'];
    expect(criticCorrectionIssue(f.state, f.request, f.originalOperation)?.code)
      .toBe('structural_correction_target_missing');
    f.request.structural_correction.relation_ids = ['roofline-center-distance'];
    f.request.args.steps[0].args.regions = [];
    expect(criticCorrectionIssue(f.state, f.request, f.originalOperation)?.code)
      .toBe('structural_correction_no_geometric_execution');
  });
  it('propagates the same provenance into the early bounded medium-priority gate', () => {
    const f = fixture();
    const dir = mkdtempSync(path.join(tmpdir(), 'structural-causal-priority-'));
    try {
      const store = new SessionStore(path.join(dir, 'controller'), { workspaceRoot: dir });
      (store as any).read = (id: string) => id === operationId ? f.originalOperation : undefined;
      (store as any).semanticLayerOwners = () => f.state.logical_layer_owners;
      (store as any).sceneOwnershipPlan = () => f.state.scene_ownership_plan;
      const request: any = { ...f.request,
        problem_id: 'subpass-remove-roof-chevrons',
        scale: 'small',
        region_bounds: { left: 340, top: 280, right: 520, bottom: 370 },
      };
      const blocker = {
        ...f.state.visual_problems[defect.id], scale: 'medium',
        review_region_bounds: defect.region_bounds,
      };
      expect(store.boundedMediumCorrectionIssue(f.state, request, blocker)).toBeUndefined();
      f.originalOperation.result.content = [];
      expect(store.boundedMediumCorrectionIssue(f.state, request, blocker)).toContain(
        'structural_correction_owner_mismatch');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
