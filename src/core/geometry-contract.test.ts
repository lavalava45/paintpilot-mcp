import { describe, expect, it } from 'vitest';
import { prepareGeometryContract } from './geometry-contract.js';

function sceneGeometry() {
  return {
    model_id: 'scene-1', revision: 1, applicability: 'coherent_3d',
    source_frame: { document_id: 42, document_incarnation: 'witness-42', width: 400, height: 300 },
    projection: {
      kind: 'two_point',
      vanishing_points: [
        { id: 'vp-left', x: -200, y: 100, evidence: 'proposed' },
        { id: 'vp-right', x: 600, y: 100, evidence: 'proposed' },
      ],
    },
    line_families: [
      { id: 'family-left', vanishing_point_id: 'vp-left', members: [] },
      { id: 'family-right', vanishing_point_id: 'vp-right', members: [] },
    ],
    support_planes: [{ id: 'ground', role: 'floor', vanishing_family_ids: ['family-left'] }],
  };
}

function constructionPass() {
  return {
    document_id: 42,
    scene_geometry_model: sceneGeometry(),
    construction_role: 'structured-mass',
    logical_layer: { hypothesis_id: 'object-1', decision: 'create-new', construction_tier: 'primary' },
    actions: [{ tool: 'photoshop_paint_regions', args: { regions: [] } }],
  };
}

describe('early geometry contract diagnostics', () => {
  it('reports a missing binding and an independent two-point basis defect together', () => {
    const pass = constructionPass();
    pass.scene_geometry_model.line_families[1].vanishing_point_id = 'vp-left';
    const result = prepareGeometryContract(pass, { painting_profile: 'nontrivial_painting' });
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'geometry_binding_required', 'perspective_basis_required',
    ]));
    expect(result.issues.find(issue => issue.code === 'perspective_basis_required')?.message)
      .toContain('covered_vanishing_points=1');
  });

  it('preserves exact missing-reference and insufficient-control diagnostics', () => {
    const pass = constructionPass();
    (pass.logical_layer as Record<string, unknown>).geometry_binding = {
      owner_id: 'object-1', scene_geometry_model_id: 'scene-1', scene_geometry_revision: 1,
      support_plane_id: 'ground', vanishing_family_ids: ['family-left'],
      dependencies: ['unknown-dependency'], anchors: { near_contact: { x: 30, y: 40 }, far_extent: { x: 100, y: 100 } },
      control_sections: [],
    };
    const result = prepareGeometryContract(pass, { painting_profile: 'nontrivial_painting' });
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'geometry_dependency_missing', 'geometry_preflight_insufficient',
    ]));
    expect(result.issues.find(issue => issue.code === 'geometry_dependency_missing')?.path)
      .toContain('dependencies[0]');
  });

  it('does not invent a perspective-basis defect for two distinct declared families', () => {
    const pass = constructionPass();
    const result = prepareGeometryContract(pass, { painting_profile: 'nontrivial_painting' });
    expect(result.issues.map(issue => issue.code)).not.toContain('perspective_basis_required');
    expect(result.issues.map(issue => issue.code)).toContain('geometry_binding_required');
  });
});
