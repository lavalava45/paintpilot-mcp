import { describe, expect, it } from 'vitest';
import { geometryBindingStaleness, normalizeGeometryBinding } from './geometry-binding.js';
import { perspectiveCrossSections } from './geometry-math.js';
import { runGeometryPreflight } from './geometry-preflight.js';
import { normalizeSceneGeometryModel } from './scene-geometry-model.js';

function railwayScene(revision = 1, vpX = 600) {
  return normalizeSceneGeometryModel({
    model_id: 'railway-regression', revision, applicability: 'coherent_3d',
    source_frame: { document_id: 77, document_incarnation: 'railway:77:a', width: 1200, height: 800 },
    projection: { kind: 'one_point', vanishing_points: [
      { id: 'rail_vp', x: vpX, y: 180, evidence: 'derived', derived_from: ['left_rail', 'right_rail'] },
    ] },
    line_families: [{ id: 'rail_family', vanishing_point_id: 'rail_vp', members: [
      { id: 'left_rail', points: [{ x: 250, y: 760 }, { x: vpX, y: 180 }] },
      { id: 'right_rail', points: [{ x: 950, y: 760 }, { x: vpX, y: 180 }] },
    ] }],
    support_planes: [{ id: 'track_plane', role: 'track corridor', vanishing_family_ids: ['rail_family'],
      boundary_relations: ['left_rail', 'right_rail'] }],
    scale_anchors: [{ id: 'train_scale', contact_point: { x: 600, y: 680 }, visible_extent: 180, depth_role: 'near' }],
  });
}

function trainBinding(revision = 1, overrides: Record<string, unknown> = {}) {
  return normalizeGeometryBinding({
    owner_id: 'train', scene_geometry_model_id: 'railway-regression', scene_geometry_revision: revision,
    support_plane_id: 'track_plane', vanishing_family_ids: ['rail_family'],
    dependencies: ['left_rail', 'right_rail', 'train_scale'],
    anchors: { near_contact: { x: 600, y: 680 }, far_extent: { x: 600, y: 300 },
      centerline: { line: [{ x: 600, y: 680 }, { x: 600, y: 300 }] } },
    control_sections: [
      { id: 'near', at: { x: 600, y: 640 }, expected_bounds: { left: 500, top: 550, right: 700, bottom: 730 } },
      { id: 'mid', at: { x: 600, y: 470 }, expected_bounds: { left: 545, top: 420, right: 655, bottom: 520 } },
      { id: 'far', at: { x: 600, y: 320 }, expected_bounds: { left: 575, top: 295, right: 625, bottom: 345 } },
    ],
    constraints: [
      { type: 'converges_to', subject_ref: 'train', target_ref: 'rail_family', evidence: ['centerline'] },
      { type: 'supported_by', subject_ref: 'train', target_ref: 'track_plane', evidence: ['near_contact'] },
      { type: 'scales_with_depth', subject_ref: 'train', target_ref: 'train_scale', evidence: ['near/mid/far'] },
    ],
    local_exceptions: [], ...overrides,
  });
}

describe('E.18i maintained railway regression', () => {
  it('derives the accepted track corridor deterministically from exact rail edges', () => {
    const scene = railwayScene();
    const [left, right] = scene.line_families[0].members.map(member => member.points);
    const sections = perspectiveCrossSections(left, right, 'y', 680, 300);
    expect(sections).not.toBeNull();
    expect(sections!.near.center.x).toBeCloseTo(600, 8);
    expect(sections!.far.center.x).toBeCloseTo(600, 8);
    expect(sections!.near.width_px).toBeGreaterThan(sections!.mid.width_px);
    expect(sections!.mid.width_px).toBeGreaterThan(sections!.far.width_px);
  });

  it('rejects a train whose near contact is outside the accepted track corridor', () => {
    const bad = trainBinding(1, { anchors: {
      near_contact: { x: 1080, y: 680 }, far_extent: { x: 600, y: 300 },
      centerline: { line: [{ x: 1080, y: 680 }, { x: 600, y: 300 }] },
    } });
    expect(runGeometryPreflight(bad, railwayScene()).issues.map(issue => issue.code))
      .toContain('support_contact_conflict');
  });

  it('rejects a front-only correction when the far termination still follows an obsolete guess', () => {
    const bad = trainBinding(1, {
      anchors: { near_contact: { x: 600, y: 680 }, far_extent: { x: 760, y: 300 },
        centerline: { line: [{ x: 600, y: 680 }, { x: 760, y: 300 }] } },
      control_sections: [
        { id: 'near', at: { x: 600, y: 640 }, expected_bounds: { left: 500, top: 550, right: 700, bottom: 730 } },
        { id: 'mid', at: { x: 670, y: 470 }, expected_bounds: { left: 615, top: 420, right: 725, bottom: 520 } },
        { id: 'far', at: { x: 750, y: 320 }, expected_bounds: { left: 725, top: 295, right: 775, bottom: 345 } },
      ],
    });
    const codes = runGeometryPreflight(bad, railwayScene()).issues.map(issue => issue.code);
    expect(codes).toContain('projection_family_conflict');
    expect(codes).toContain('geometry_constraint_conflict');
  });

  it('stales the train after convergence changes and accepts only a full current-revision rebuild', () => {
    const before = railwayScene(1, 600);
    const accepted = trainBinding(1);
    expect(runGeometryPreflight(accepted, before).issues).toEqual([]);
    const after = railwayScene(2, 640);
    const stale = geometryBindingStaleness(accepted, after, before);
    expect(stale).toMatchObject({ stale: true, reason: 'dependency_changed' });
    expect(stale.changed_dependency_ids).toEqual(expect.arrayContaining(['rail_family', 'track_plane']));
    expect(runGeometryPreflight(trainBinding(2), after).issues.map(issue => issue.code))
      .toContain('projection_family_conflict');

    const rebuilt = trainBinding(2, {
      anchors: { near_contact: { x: 600, y: 680 }, far_extent: { x: 630.4, y: 300 },
        centerline: { line: [{ x: 600, y: 680 }, { x: 640, y: 180 }] } },
      control_sections: [
        { id: 'near', at: { x: 603.2, y: 640 }, expected_bounds: { left: 503, top: 550, right: 703, bottom: 730 } },
        { id: 'mid', at: { x: 616.8, y: 470 }, expected_bounds: { left: 562, top: 420, right: 672, bottom: 520 } },
        { id: 'far', at: { x: 628.8, y: 320 }, expected_bounds: { left: 604, top: 295, right: 654, bottom: 345 } },
      ],
    });
    expect(runGeometryPreflight(rebuilt, after).issues).toEqual([]);
    expect(geometryBindingStaleness(rebuilt, after, before)).toEqual({
      stale: false, reason: 'current', changed_dependency_ids: [],
    });
  });
});
