import { describe, expect, it } from 'vitest';
import {
  changedSceneGeometryDependencyIds,
  geometryBindingStaleness,
  normalizeGeometryBinding,
  transformGeometryBinding,
} from './geometry-binding.js';
import { normalizeSceneGeometryModel } from './scene-geometry-model.js';
import { previewToCanvasAffine } from './spatial-support.js';

function scene(revision: number, mutate?: (value: any) => void) {
  const value: any = {
    model_id: 'station', revision, applicability: 'coherent_3d',
    source_frame: { document_id: 42, document_incarnation: 'doc-42', width: 1000, height: 700 },
    projection: { kind: 'two_point', vanishing_points: [
      { id: 'rail_vp', x: 500, y: 200, evidence: 'proposed', derived_from: [] },
      { id: 'facade_vp', x: 900, y: 210, evidence: 'proposed', derived_from: [] },
    ] },
    line_families: [
      { id: 'rails', vanishing_point_id: 'rail_vp', members: [
        { id: 'left_rail', points: [{ x: 100, y: 650 }, { x: 500, y: 200 }] },
        { id: 'right_rail', points: [{ x: 300, y: 650 }, { x: 500, y: 200 }] },
      ] },
      { id: 'facade', vanishing_point_id: 'facade_vp', members: [
        { id: 'roof_edge', points: [{ x: 600, y: 300 }, { x: 900, y: 210 }] },
      ] },
    ],
    support_planes: [
      { id: 'track_plane', role: 'track', vanishing_family_ids: ['rails'], boundary_relations: ['left_rail', 'right_rail'] },
      { id: 'wall_plane', role: 'wall', vanishing_family_ids: ['facade'], boundary_relations: ['roof_edge'] },
    ],
    scale_anchors: [],
  };
  mutate?.(value);
  return normalizeSceneGeometryModel(value);
}

function binding(ownerId: string, family: string, plane: string, dependencies: string[]) {
  return normalizeGeometryBinding({
    owner_id: ownerId,
    scene_geometry_model_id: 'station',
    scene_geometry_revision: 1,
    support_plane_id: plane,
    vanishing_family_ids: [family],
    dependencies,
    anchors: { near_contact: { x: 200, y: 600 } },
    control_sections: [{ id: 'near', at: { x: 200, y: 600 } }, { id: 'far', at: { x: 450, y: 260 } }],
    constraints: [{ type: 'supported_by', subject_ref: ownerId, target_ref: plane, evidence: ['contact'] }],
    local_exceptions: [],
  });
}

describe('geometry binding dependency invalidation', () => {
  it('propagates a changed rail member through its family and support plane', () => {
    const before = scene(1);
    const after = scene(2, value => { value.line_families[0].members[0].points[1].x = 540; });
    expect(changedSceneGeometryDependencyIds(before, after)).toEqual(expect.arrayContaining([
      'left_rail', 'rails', 'track_plane',
    ]));
    expect(geometryBindingStaleness(binding('train', 'rails', 'track_plane', ['left_rail', 'right_rail']), after, before))
      .toMatchObject({ stale: true, reason: 'dependency_changed' });
  });

  it('does not stale an unrelated facade owner when only rail geometry changes', () => {
    const before = scene(1);
    const after = scene(2, value => { value.line_families[0].members[1].points[0].x = 330; });
    expect(geometryBindingStaleness(binding('window', 'facade', 'wall_plane', ['roof_edge']), after, before))
      .toEqual({ stale: false, reason: 'current', changed_dependency_ids: [] });
  });

  it('treats a revision-only/texture-only scene update as geometry-neutral', () => {
    const before = scene(1);
    const after = scene(2);
    expect(changedSceneGeometryDependencyIds(before, after)).toEqual([]);
    expect(geometryBindingStaleness(binding('train', 'rails', 'track_plane', ['left_rail']), after, before).stale)
      .toBe(false);
  });

  it('fails closed when the binding source revision cannot be reconstructed', () => {
    const current = scene(3);
    expect(geometryBindingStaleness(binding('train', 'rails', 'track_plane', ['left_rail']), current, null))
      .toMatchObject({ stale: true, reason: 'source_revision_unavailable' });
  });

  it('treats a horizon/projection change as global geometry invalidation', () => {
    const before = scene(1);
    const after = scene(2, value => {
      value.projection.horizon = { line: [{ x: 0, y: 180 }, { x: 1000, y: 180 }] };
    });
    expect(geometryBindingStaleness(binding('window', 'facade', 'wall_plane', ['roof_edge']), after, before))
      .toMatchObject({ stale: true, changed_dependency_ids: ['__projection__'] });
  });

  it('reprojects connected owner anchors and control sections through a parent move/scale without rewriting dependencies', () => {
    const source = binding('handle', 'rails', 'track_plane', ['left_rail', 'right_rail']);
    source.anchors.far_extent = { x: 300, y: 500 };
    source.anchors.centerline = { line: [{ x: 200, y: 600 }, { x: 300, y: 500 }] };
    source.control_sections.find(section => section.id === 'near')!.expected_bounds = { left: 190, top: 590, right: 210, bottom: 610 };
    const projected = transformGeometryBinding(source, {
      scale_x: 2,
      scale_y: 0.5,
      origin: { x: 200, y: 600 },
      translate_x: 80,
      translate_y: 30,
    });

    expect(projected.anchors).toEqual({
      near_contact: { x: 280, y: 630 },
      far_extent: { x: 480, y: 580 },
      centerline: { line: [{ x: 280, y: 630 }, { x: 480, y: 580 }] },
    });
    expect(projected.control_sections.find(section => section.id === 'near')).toMatchObject({
      at: { x: 280, y: 630 },
      expected_bounds: { left: 260, top: 625, right: 300, bottom: 635 },
    });
    expect(projected.dependencies).toEqual(source.dependencies);
    expect(projected.constraints).toEqual(source.constraints);
    expect(projected.exact_evidence).toEqual(source.exact_evidence);
    expect(source.anchors.near_contact).toEqual({ x: 200, y: 600 });
  });

  it('fails closed for invalid parent affine transforms', () => {
    const source = binding('handle', 'rails', 'track_plane', ['left_rail']);
    expect(() => transformGeometryBinding(source, { scale_x: 0 }))
      .toThrow(/finite positive scales/);
    expect(() => transformGeometryBinding(source, { translate_x: Number.NaN }))
      .toThrow(/finite positive scales/);
  });

  it('maps crop-preview connected construction back into canvas coordinates before persistence', () => {
    const source = binding('handle', 'rails', 'track_plane', ['left_rail']);
    source.anchors.near_contact = { x: 100, y: 75 };
    source.control_sections = [{ id: 'near', at: { x: 100, y: 75 }, expected_bounds: { left: 90, top: 65, right: 110, bottom: 85 } }];
    const projected = transformGeometryBinding(source, previewToCanvasAffine({
      documentId: 42, canvasWidth: 1200, canvasHeight: 800,
      outputWidth: 400, outputHeight: 300,
      crop: { left: 200, top: 100, right: 1000, bottom: 700 },
    }));
    expect(projected.anchors.near_contact).toEqual({ x: 400, y: 250 });
    expect(projected.control_sections[0]).toMatchObject({
      at: { x: 400, y: 250 }, expected_bounds: { left: 380, top: 230, right: 420, bottom: 270 },
    });
  });
});
