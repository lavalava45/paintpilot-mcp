import { describe, expect, it } from 'vitest';
import { normalizeGeometryBinding } from './geometry-binding.js';
import { runGeometryPreflight } from './geometry-preflight.js';
import { normalizeSceneGeometryModel } from './scene-geometry-model.js';

const frame = { document_id: 88, document_incarnation: 'e18i:88:a', width: 1200, height: 800 };

describe('E.18i additional scene-geometry regressions', () => {
  it('keeps two-point facade openings on the facade-owned vanishing families', () => {
    const scene = normalizeSceneGeometryModel({
      model_id: 'facade-regression', revision: 1, applicability: 'coherent_3d', source_frame: frame,
      projection: { kind: 'two_point', vanishing_points: [
        { id: 'vp_left', x: 100, y: 220, evidence: 'proposed', derived_from: [] },
        { id: 'vp_right', x: 1100, y: 220, evidence: 'proposed', derived_from: [] },
      ] },
      line_families: [
        { id: 'facade_left', vanishing_point_id: 'vp_left', members: [{ id: 'sill_left', points: [{ x: 100, y: 220 }, { x: 600, y: 500 }] }] },
        { id: 'facade_right', vanishing_point_id: 'vp_right', members: [{ id: 'sill_right', points: [{ x: 1100, y: 220 }, { x: 600, y: 500 }] }] },
      ],
      support_planes: [{ id: 'facade_plane', role: 'wall', vanishing_family_ids: ['facade_left', 'facade_right'], boundary_relations: [] }],
      scale_anchors: [],
    });
    const opening = normalizeGeometryBinding({
      owner_id: 'window_row', scene_geometry_model_id: scene.model_id, scene_geometry_revision: 1,
      support_plane_id: 'facade_plane', vanishing_family_ids: ['facade_left'],
      dependencies: ['sill_left'], anchors: {
        near_contact: { x: 600, y: 500 }, far_extent: { x: 200, y: 276 },
        centerline: { line: [{ x: 600, y: 500 }, { x: 100, y: 220 }] },
      },
      control_sections: [{ id: 'near', at: { x: 600, y: 500 } }, { id: 'far', at: { x: 200, y: 276 } }],
      constraints: [{ type: 'converges_to', subject_ref: 'window_row', target_ref: 'facade_left', evidence: ['sill'] }],
      local_exceptions: [],
    });
    expect(runGeometryPreflight(opening, scene).issues).toEqual([]);
    const privatePerspective = normalizeGeometryBinding({
      ...opening, anchors: { ...opening.anchors, centerline: { line: [{ x: 600, y: 500 }, { x: 300, y: 220 }] } },
    });
    expect(runGeometryPreflight(privatePerspective, scene).issues.map(issue => issue.code))
      .toContain('projection_family_conflict');
  });

  it('allows platform owners to use different quantitative strength on one shared support plane', () => {
    const scene = normalizeSceneGeometryModel({
      model_id: 'platform-regression', revision: 1, applicability: 'coherent_3d', source_frame: frame,
      projection: { kind: 'one_point', vanishing_points: [{ id: 'platform_vp', x: 600, y: 200, evidence: 'proposed', derived_from: [] }] },
      line_families: [{ id: 'platform_depth', vanishing_point_id: 'platform_vp', members: [
        { id: 'platform_left', points: [{ x: 180, y: 760 }, { x: 600, y: 200 }] },
        { id: 'platform_right', points: [{ x: 1020, y: 760 }, { x: 600, y: 200 }] },
      ] }],
      support_planes: [{ id: 'platform_plane', role: 'ground', vanishing_family_ids: ['platform_depth'], boundary_relations: ['platform_left', 'platform_right'] }],
      scale_anchors: [],
    });
    const prop = (owner: string, x: number) => normalizeGeometryBinding({
      owner_id: owner, scene_geometry_model_id: scene.model_id, scene_geometry_revision: 1,
      support_plane_id: 'platform_plane', vanishing_family_ids: [], dependencies: ['platform_plane'],
      anchors: { near_contact: { x, y: 680 } }, control_sections: [{ id: 'contact', at: { x, y: 680 } }],
      constraints: [{ type: 'supported_by', subject_ref: owner, target_ref: 'platform_plane', evidence: ['contact'] }],
      local_exceptions: [],
    });
    for (const [owner, x] of [['bench', 420], ['sign', 700], ['person', 620]] as const) {
      expect(runGeometryPreflight(prop(owner, x), scene).issues).toEqual([]);
    }
    expect(runGeometryPreflight(prop('off_platform', 1150), scene).issues.map(issue => issue.code))
      .toContain('support_contact_conflict');
  });

  it.each([
    ['orthographic_or_diagrammatic', 'orthographic', 'Intentional orthographic information graphic.'],
    ['flat_or_collage', 'custom', 'Intentional flat collage with no shared 3D projection.'],
    ['intentional_non_euclidean', 'custom', 'Prompt explicitly requests impossible non-Euclidean space.'],
  ] as const)('records %s applicability without inventing vanishing points', (applicability, kind, rationale) => {
    const scene = normalizeSceneGeometryModel({
      model_id: `optout-${applicability}`, revision: 1, applicability, applicability_rationale: rationale,
      source_frame: frame, projection: { kind, vanishing_points: [] }, line_families: [], support_planes: [], scale_anchors: [],
    });
    expect(scene.applicability).toBe(applicability);
    expect(scene.applicability_rationale).toBe(rationale);
    expect(scene.projection.vanishing_points).toEqual([]);
    expect(scene.line_families).toEqual([]);
  });

  it('constrains organic foliage by support/depth without forcing analytic contour vertices', () => {
    const scene = normalizeSceneGeometryModel({
      model_id: 'organic-regression', revision: 1, applicability: 'coherent_3d', source_frame: frame,
      projection: { kind: 'weak_perspective', vanishing_points: [] }, line_families: [],
      support_planes: [{ id: 'ground_band', role: 'terrain support', vanishing_family_ids: [], boundary_relations: ['ground_left', 'ground_right'] }],
      scale_anchors: [{ id: 'tree_scale', contact_point: { x: 520, y: 650 }, visible_extent: 220, depth_role: 'mid' }],
    });
    const foliage = normalizeGeometryBinding({
      owner_id: 'foliage_mass', scene_geometry_model_id: scene.model_id, scene_geometry_revision: 1,
      support_plane_id: 'ground_band', vanishing_family_ids: [], dependencies: ['tree_scale'],
      anchors: { near_contact: { x: 520, y: 650 } }, control_sections: [{ id: 'support', at: { x: 520, y: 650 } }],
      constraints: [], local_exceptions: ['organic contour remains perceptual; only support/depth/scale anchors are scene-bound'],
    });
    const result = runGeometryPreflight(foliage, scene);
    expect(result.issues).toEqual([]);
    expect(result.report.control_sections).toHaveLength(1);
    expect(result.report.vanishing_family_ids).toEqual([]);
  });
});
