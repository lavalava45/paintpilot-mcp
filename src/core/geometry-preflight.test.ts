import { describe, expect, it } from 'vitest';
import { normalizeGeometryBinding } from './geometry-binding.js';
import { runGeometryPreflight } from './geometry-preflight.js';
import { normalizeSceneGeometryModel } from './scene-geometry-model.js';

function scene() {
  return normalizeSceneGeometryModel({
    model_id: 'rail-scene', revision: 3, applicability: 'coherent_3d',
    source_frame: { document_id: 42, document_incarnation: 'doc:42:a', width: 1200, height: 800 },
    projection: {
      kind: 'one_point',
      vanishing_points: [{ id: 'vp', x: 600, y: 200, evidence: 'derived', derived_from: ['rail_left', 'rail_right'] }],
    },
    line_families: [{
      id: 'rail_family', vanishing_point_id: 'vp',
      members: [
        { id: 'rail_left', points: [{ x: 300, y: 760 }, { x: 600, y: 200 }] },
        { id: 'rail_right', points: [{ x: 900, y: 760 }, { x: 600, y: 200 }] },
      ],
    }],
    support_planes: [{
      id: 'track_plane', role: 'track support corridor', vanishing_family_ids: ['rail_family'],
      boundary_relations: ['rail_left', 'rail_right'],
    }],
    scale_anchors: [{ id: 'near_scale', contact_point: { x: 600, y: 700 }, visible_extent: 180, depth_role: 'near' }],
  });
}

function binding(overrides: Record<string, unknown> = {}) {
  return normalizeGeometryBinding({
    owner_id: 'train', scene_geometry_model_id: 'rail-scene', scene_geometry_revision: 3,
    support_plane_id: 'track_plane', vanishing_family_ids: ['rail_family'], dependencies: ['rail_left', 'rail_right', 'near_scale'],
    anchors: {
      near_contact: { x: 600, y: 700 }, far_extent: { x: 600, y: 360 },
      centerline: { line: [{ x: 600, y: 700 }, { x: 600, y: 360 }] },
    },
    control_sections: [
      { id: 'near', at: { x: 600, y: 650 }, expected_bounds: { left: 500, top: 560, right: 700, bottom: 740 } },
      { id: 'mid', at: { x: 600, y: 470 }, expected_bounds: { left: 545, top: 420, right: 655, bottom: 520 } },
    ],
    constraints: [
      { type: 'converges_to', subject_ref: 'train', target_ref: 'rail_family', evidence: ['centerline'] },
      { type: 'supported_by', subject_ref: 'train', target_ref: 'track_plane', evidence: ['contact'] },
      { type: 'scales_with_depth', subject_ref: 'train', target_ref: 'near_scale', evidence: ['near/mid sections'] },
    ],
    local_exceptions: [],
    ...overrides,
  });
}

describe('geometry preflight', () => {
  it('resolves a quantitative coherent-3D binding against the exact scene revision', () => {
    const result = runGeometryPreflight(binding(), scene());
    expect(result.issues).toEqual([]);
    expect(result.report).toMatchObject({
      protocol: 'photoshop.guard.geometry_preflight.v1', owner_id: 'train',
      scene_geometry_model_id: 'rail-scene', scene_geometry_revision: 3,
      support_plane_id: 'track_plane', vanishing_family_ids: ['rail_family'],
      uncertainty: [], uncertainty_acceptable: true,
    });
    expect(result.report.checks.map(check => check.kind)).toEqual(expect.arrayContaining([
      'projection-family', 'support-contact', 'depth-scale',
    ]));
  });

  it('rejects a centerline that contradicts the accepted vanishing family', () => {
    const bad = binding({
      anchors: {
        near_contact: { x: 600, y: 700 }, far_extent: { x: 800, y: 360 },
        centerline: { line: [{ x: 600, y: 700 }, { x: 800, y: 360 }] },
      },
    });
    expect(runGeometryPreflight(bad, scene()).issues.map(issue => issue.code))
      .toContain('projection_family_conflict');
  });

  it('rejects support contact outside an accepted two-boundary corridor', () => {
    const bad = binding({
      anchors: {
        near_contact: { x: 1000, y: 700 }, far_extent: { x: 600, y: 360 },
        centerline: { line: [{ x: 600, y: 700 }, { x: 600, y: 360 }] },
      },
    });
    expect(runGeometryPreflight(bad, scene()).issues.map(issue => issue.code))
      .toContain('support_contact_conflict');
  });

  it('fails closed when perspective-sensitive construction omits bounded depth sections or far termination', () => {
    const insufficient = binding({ anchors: { near_contact: { x: 600, y: 700 } }, control_sections: [] });
    const codes = runGeometryPreflight(insufficient, scene()).issues.map(issue => issue.code);
    expect(codes).toContain('geometry_preflight_insufficient');
  });

  it('requires exact measurement/landmark evidence when exact geometry is completion-relevant', () => {
    const exact = binding({ exact_geometry_completion_relevant: true, exact_evidence: [] });
    expect(runGeometryPreflight(exact, scene()).issues.map(issue => issue.code))
      .toContain('geometry_exact_evidence_required');
  });

  it('accepts exact measurement evidence only from the Scene Geometry Model source frame', () => {
    const evidence = {
      id: 'train-measurement',
      method: 'photoshop_measure_points',
      source_frame: { document_id: 42, document_incarnation: 'doc:42:a', width: 1200, height: 800 },
    };
    const exact = binding({ exact_geometry_completion_relevant: true, exact_evidence: [evidence] });
    const accepted = runGeometryPreflight(exact, scene());
    expect(accepted.issues).toEqual([]);
    expect(accepted.report.checks).toContainEqual(expect.objectContaining({
      id: 'exact-evidence:train-measurement', kind: 'exact-evidence', status: 'pass',
    }));

    const wrongSource = binding({
      exact_geometry_completion_relevant: true,
      exact_evidence: [{ ...evidence, source_frame: { ...evidence.source_frame, document_incarnation: 'doc:42:other' } }],
    });
    expect(runGeometryPreflight(wrongSource, scene()).issues.map(issue => issue.code))
      .toContain('geometry_exact_evidence_source_mismatch');
  });
});
