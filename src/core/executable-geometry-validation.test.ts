import { describe, expect, it } from 'vitest';
import { normalizeGeometryBinding } from './geometry-binding.js';
import { normalizeSceneGeometryModel } from './scene-geometry-model.js';
import { deriveBoundarySection, deriveLineFamilyGrid, deriveLineFamilyModule, generatedGeometryProvenanceState, inspectExecutableGeometry, materializeBoundaryDerivedGeometry, materializeBoundaryDerivedRegionBands, materializeBoundaryDerivedStrokeSections, materializeOrientationDerivedRotate, observedLayerBoundsIssue, validateExecutableGeometry } from './executable-geometry-validation.js';

const scene = normalizeSceneGeometryModel({
  model_id: 'scene', revision: 1, applicability: 'coherent_3d',
  source_frame: { document_id: 1, document_incarnation: 'inc', width: 400, height: 300 },
  projection: { kind: 'one_point', vanishing_points: [{ id: 'vp', x: 200, y: 80, evidence: 'proposed', derived_from: [] }] },
  line_families: [{ id: 'depth', vanishing_point_id: 'vp', members: [
    { id: 'left', points: [{ x: 40, y: 280 }, { x: 200, y: 80 }] },
    { id: 'right', points: [{ x: 160, y: 280 }, { x: 200, y: 80 }] },
  ] }],
  support_planes: [], scale_anchors: [],
});

const binding = normalizeGeometryBinding({
  owner_id: 'facade', scene_geometry_model_id: 'scene', scene_geometry_revision: 1,
  vanishing_family_ids: ['depth'], dependencies: ['left', 'right'],
  anchors: {}, control_sections: [], constraints: [],
  exact_geometry_completion_relevant: true,
  exact_evidence: [{ id: 'measure', method: 'photoshop_measure_points', source_frame: { document_id: 1, document_incarnation: 'inc', width: 400, height: 300 } }],
  local_exceptions: [],
});

function region(points: Array<{ x: number; y: number }>) {
  return [{ tool: 'photoshop_paint_regions', args: { regions: [{ contours: [{ points }] }] } }];
}

describe('executable geometry validation', () => {
  it('derives facade/module section coordinates from boundary dependencies and changes them with source geometry', () => {
    expect(deriveBoundarySection(binding, scene, 180)).toEqual({
      y: 180,
      left: { x: 120, y: 180 },
      right: { x: 180, y: 180 },
      dependency_ids: ['left', 'right'],
    });

    const revisedScene = {
      ...scene,
      revision: 2,
      line_families: scene.line_families.map(family => ({
        ...family,
        members: family.members.map(member => member.id === 'left'
          ? { ...member, points: [{ x: 20, y: 280 }, { x: 200, y: 80 }] as typeof member.points }
          : member),
      })),
    };
    expect(deriveBoundarySection(binding, revisedScene, 180)).toEqual({
      y: 180,
      left: { x: 110, y: 180 },
      right: { x: 180, y: 180 },
      dependency_ids: ['left', 'right'],
    });
  });

  it('materializes horizontal stroke endpoints from boundary dependencies before dispatch', () => {
    const curved = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [
      { x: 120, y: 180, right: [130, 100], smooth: true },
      { x: 180, y: 180, left: [170, 100] },
    ] }] } }];
    const authored = structuredClone(curved);
    expect(materializeBoundaryDerivedGeometry(curved, binding, scene)).toBeUndefined();
    expect(curved).toEqual(authored); // Cubic midpoint stays (150,120), not (150,180).
    const steps = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ size: 2, points: [
      { x: 1, y: 180 }, { x: 399, y: 180 },
    ] }] } }];
    const provenance = materializeBoundaryDerivedStrokeSections(steps, binding, scene);
    expect((steps[0].args.strokes[0] as { points: unknown[] }).points).toEqual([
      { x: 120, y: 180 }, { x: 180, y: 180 },
    ]);
    expect(provenance).toMatchObject({
      mode: 'derived-boundary-sections', dependency_ids: ['left', 'right'],
      tools: ['photoshop_paint_strokes'], dispatched_point_count: 2,
    });
    expect(validateExecutableGeometry(steps, binding, scene)).toEqual([]);

    const revisedScene = {
      ...scene, revision: 2,
      line_families: scene.line_families.map(family => ({ ...family, members: family.members.map(member =>
        member.id === 'left' ? { ...member, points: [{ x: 20, y: 280 }, { x: 200, y: 80 }] as typeof member.points } : member) })),
    };
    materializeBoundaryDerivedStrokeSections(steps, binding, revisedScene);
    expect((steps[0].args.strokes[0] as { points: unknown[] }).points).toEqual([
      { x: 110, y: 180 }, { x: 180, y: 180 },
    ]);
  });

  it('does not partially rewrite derived sections when a sibling paint payload is malformed', () => {
    const invalidStrokes = [{ tool: 'photoshop_paint_strokes', args: { strokes: [
      { size: 2, points: [{ x: 1, y: 180 }, { x: 399, y: 180 }] },
      { size: 2, points: [{ x: 1, y: 200 }, { x: 'not-a-number', y: 200 }] },
    ] } }];
    const originalStrokes = structuredClone(invalidStrokes);
    expect(materializeBoundaryDerivedStrokeSections(invalidStrokes, binding, scene)).toBeUndefined();
    expect(invalidStrokes).toEqual(originalStrokes);

    const mixed = [
      { tool: 'photoshop_paint_strokes', args: { strokes: [
        { size: 2, points: [{ x: 1, y: 180 }, { x: 399, y: 180 }] },
      ] } },
      { tool: 'photoshop_paint_regions', args: { regions: [
        { contours: [{ points: [{ x: 1, y: 240 }, { x: null, y: 240 }] }] },
      ] } },
    ];
    const originalMixed = structuredClone(mixed);
    expect(materializeBoundaryDerivedGeometry(mixed, binding, scene)).toBeUndefined();
    expect(mixed).toEqual(originalMixed);
  });

  it('invalidates generated geometry only when one of its recorded source dependencies changes', () => {
    const steps = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [
      { x: 1, y: 180 }, { x: 399, y: 180 },
    ] }] } }];
    const provenance = materializeBoundaryDerivedStrokeSections(steps, binding, scene);
    expect(provenance).toBeDefined();

    const unrelatedRevision = normalizeSceneGeometryModel({
      ...scene,
      revision: 2,
      scale_anchors: [{ id: 'unrelated_scale', contact_point: { x: 10, y: 10 }, visible_extent: 10, depth_role: 'near' }],
    });
    expect(generatedGeometryProvenanceState(provenance!, unrelatedRevision, scene)).toEqual({
      stale: false, reason: 'current', changed_dependency_ids: [],
    });

    const boundaryRevision = normalizeSceneGeometryModel({
      ...scene,
      revision: 2,
      line_families: scene.line_families.map(family => ({
        ...family,
        members: family.members.map(member => member.id === 'left'
          ? { ...member, points: [{ x: 20, y: 280 }, { x: 200, y: 80 }] as typeof member.points }
          : member),
      })),
    });
    expect(generatedGeometryProvenanceState(provenance!, boundaryRevision, scene)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['left'],
    });
    expect(generatedGeometryProvenanceState(provenance!, boundaryRevision)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['left'],
    });
    expect(generatedGeometryProvenanceState(provenance!, unrelatedRevision)).toEqual({
      stale: false, reason: 'current', changed_dependency_ids: [],
    });

    // The same analytic lines do not authorize reusing generated pixels when
    // their camera/projection authority or source canvas has changed.
    const horizonRevision = normalizeSceneGeometryModel({
      ...scene, revision: 3,
      projection: { ...scene.projection, kind: 'two_point' },
    });
    expect(generatedGeometryProvenanceState(provenance!, horizonRevision)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['__projection__'],
    });
    const canvasRevision = normalizeSceneGeometryModel({
      ...scene, revision: 4,
      source_frame: { ...scene.source_frame, width: 500 },
    });
    expect(generatedGeometryProvenanceState(provenance!, canvasRevision)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['__projection__'],
    });
    expect(generatedGeometryProvenanceState(provenance!, {
      ...scene, source_frame: { ...scene.source_frame, width: 500 },
    })).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['__projection__'],
    });

    const oldSnapshots = structuredClone(provenance!);
    delete oldSnapshots.dependency_snapshots?.__projection__;
    expect(generatedGeometryProvenanceState(oldSnapshots, horizonRevision)).toEqual({
      stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [],
    });
    expect(generatedGeometryProvenanceState(oldSnapshots, horizonRevision, scene)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['__projection__'],
    });
    expect(generatedGeometryProvenanceState(oldSnapshots, unrelatedRevision, scene)).toEqual({
      stale: false, reason: 'current', changed_dependency_ids: [],
    });
    // Legacy records have no projection snapshot. Reusing the same revision
    // number does not prove that the camera/canvas is still the same.
    const sameRevisionDifferentCamera = normalizeSceneGeometryModel({
      ...scene, projection: { ...scene.projection, kind: 'two_point' },
    });
    expect(generatedGeometryProvenanceState(oldSnapshots, sameRevisionDifferentCamera)).toEqual({
      stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [],
    });
    expect(generatedGeometryProvenanceState(oldSnapshots, sameRevisionDifferentCamera, scene)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['__projection__'],
    });
    expect(generatedGeometryProvenanceState(oldSnapshots, scene, scene)).toEqual({
      stale: false, reason: 'current', changed_dependency_ids: [],
    });

    const legacyProvenance = { ...provenance! };
    delete legacyProvenance.dependency_snapshots;
    expect(generatedGeometryProvenanceState(legacyProvenance, boundaryRevision)).toEqual({
      stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [],
    });
    expect(generatedGeometryProvenanceState(legacyProvenance, sameRevisionDifferentCamera)).toEqual({
      stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [],
    });
    expect(generatedGeometryProvenanceState(legacyProvenance, sameRevisionDifferentCamera, scene)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['__projection__'],
    });
  });

  it('materializes four-point facade region bands from boundary dependencies before dispatch', () => {
    const steps = [{ tool: 'photoshop_paint_regions', args: { regions: [{ contours: [{ points: [
      { x: 1, y: 240 }, { x: 399, y: 240 }, { x: 390, y: 160 }, { x: 10, y: 160 },
    ] }] }] } }];
    const provenance = materializeBoundaryDerivedRegionBands(steps, binding, scene);
    expect((steps[0].args.regions[0].contours[0] as { points: unknown[] }).points).toEqual([
      { x: 72, y: 240 }, { x: 168, y: 240 }, { x: 184, y: 160 }, { x: 136, y: 160 },
    ]);
    expect(provenance).toMatchObject({
      mode: 'derived-boundary-sections', dependency_ids: ['left', 'right'],
      tools: ['photoshop_paint_regions'], dispatched_point_count: 4,
    });
    expect(validateExecutableGeometry(steps, binding, scene)).toEqual([]);

    const revisedScene = {
      ...scene, revision: 2,
      line_families: scene.line_families.map(family => ({ ...family, members: family.members.map(member =>
        member.id === 'left' ? { ...member, points: [{ x: 20, y: 280 }, { x: 200, y: 80 }] as typeof member.points } : member) })),
    };
    materializeBoundaryDerivedRegionBands(steps, binding, revisedScene);
    expect((steps[0].args.regions[0].contours[0] as { points: Array<{ x: number; y: number }> }).points[0])
      .toEqual({ x: 56, y: 240 });
  });

  it('does not guess ambiguous or non-band region contours', () => {
    const curved = [{ tool: 'photoshop_paint_regions', args: { regions: [{ contours: [{ points: [
      { x: 120, y: 180, right: [130, 100] }, { x: 180, y: 180, left: [170, 100] },
      { x: 168, y: 240 }, { x: 72, y: 240 },
    ] }] }] } }];
    const authored = structuredClone(curved);
    expect(materializeBoundaryDerivedGeometry(curved, binding, scene)).toBeUndefined();
    expect(curved).toEqual(authored);
    const ambiguous = [{ tool: 'photoshop_paint_regions', args: { regions: [{ contours: [{ points: [
      { x: 100, y: 240 }, { x: 100, y: 240 }, { x: 160, y: 160 }, { x: 140, y: 160 },
    ] }] }] } }];
    const triangle = [{ tool: 'photoshop_paint_regions', args: { regions: [{ contours: [{ points: [
      { x: 100, y: 240 }, { x: 160, y: 240 }, { x: 150, y: 160 },
    ] }] }] } }];
    expect(materializeBoundaryDerivedRegionBands(ambiguous, binding, scene)).toBeUndefined();
    expect(materializeBoundaryDerivedRegionBands(triangle, binding, scene)).toBeUndefined();
  });

  it('derives a four-corner module from two analytic line families and invalidates it selectively', () => {
    const moduleScene = normalizeSceneGeometryModel({
      model_id: 'module-scene', revision: 1, applicability: 'coherent_3d',
      source_frame: { document_id: 1, document_incarnation: 'inc', width: 400, height: 300 },
      projection: { kind: 'two_point', vanishing_points: [] },
      line_families: [
        { id: 'vertical-family', members: [
          { id: 'v-left', points: [{ x: 100, y: 50 }, { x: 100, y: 250 }] },
          { id: 'v-right', points: [{ x: 260, y: 50 }, { x: 260, y: 250 }] },
        ] },
        { id: 'course-family', members: [
          { id: 'course-top', points: [{ x: 50, y: 100 }, { x: 320, y: 130 }] },
          { id: 'course-bottom', points: [{ x: 50, y: 210 }, { x: 320, y: 190 }] },
        ] },
      ], support_planes: [], scale_anchors: [],
    });
    const moduleBinding = normalizeGeometryBinding({
      owner_id: 'window-module', scene_geometry_model_id: 'module-scene', scene_geometry_revision: 1,
      vanishing_family_ids: ['course-family', 'vertical-family'],
      dependencies: ['v-left', 'v-right', 'course-top', 'course-bottom'],
      anchors: {}, control_sections: [], constraints: [], exact_geometry_completion_relevant: true,
      exact_evidence: [{ id: 'module-measure', method: 'photoshop_measure_points', source_frame: { document_id: 1, document_incarnation: 'inc', width: 400, height: 300 } }],
      local_exceptions: [],
    });
    const derived = deriveLineFamilyModule(moduleBinding, moduleScene);
    expect(derived?.dependency_ids).toEqual(['course-bottom', 'course-top', 'v-left', 'v-right']);
    expect(derived?.points).toHaveLength(4);

    const curved = region([
      { x: 100, y: 100 }, { x: 260, y: 100 }, { x: 260, y: 220 }, { x: 100, y: 220 },
    ]);
    Object.assign(curved[0].args.regions[0].contours[0].points[0], { right: [120, 80], smooth: true });
    const authored = structuredClone(curved);
    expect(materializeBoundaryDerivedGeometry(curved, moduleBinding, moduleScene)).toBeUndefined();
    expect(curved).toEqual(authored);

    const steps = region([
      { x: 1, y: 1 }, { x: 399, y: 1 }, { x: 399, y: 299 }, { x: 1, y: 299 },
    ]);
    const provenance = materializeBoundaryDerivedGeometry(steps, moduleBinding, moduleScene);
    expect(provenance).toMatchObject({
      mode: 'derived-boundary-sections',
      dependency_ids: ['course-bottom', 'course-top', 'v-left', 'v-right'],
      tools: ['photoshop_paint_regions'], dispatched_point_count: 4,
    });
    expect(validateExecutableGeometry(steps, moduleBinding, moduleScene)).toEqual([]);
    const dispatched = (steps[0].args.regions[0].contours[0] as { points: Array<{ x: number; y: number }> }).points;
    expect(dispatched).toEqual(expect.arrayContaining(derived!.points));

    // A repeated module contour still consists entirely of valid derived
    // corners. Do not certify two overpainted copies as one constructed module.
    const duplicateModule = structuredClone(steps);
    duplicateModule[0].args.regions.push(structuredClone(duplicateModule[0].args.regions[0]));
    expect(inspectExecutableGeometry(duplicateModule, moduleBinding, moduleScene).provenance).toBeUndefined();
    expect(validateExecutableGeometry(duplicateModule, moduleBinding, moduleScene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');

    // Materialization must also fail without rewriting either duplicate.
    const unmaterializedDuplicate = region([
      { x: 1, y: 1 }, { x: 399, y: 1 }, { x: 399, y: 299 }, { x: 1, y: 299 },
    ]);
    unmaterializedDuplicate[0].args.regions.push(structuredClone(unmaterializedDuplicate[0].args.regions[0]));
    const duplicateBefore = structuredClone(unmaterializedDuplicate);
    expect(materializeBoundaryDerivedGeometry(unmaterializedDuplicate, moduleBinding, moduleScene)).toBeUndefined();
    expect(unmaterializedDuplicate).toEqual(duplicateBefore);

    const revised = normalizeSceneGeometryModel({
      ...moduleScene, revision: 2,
      line_families: moduleScene.line_families.map(family => ({
        ...family,
        members: family.members.map(member => member.id === 'v-right'
          ? { ...member, points: [{ x: 280, y: 50 }, { x: 280, y: 250 }] as typeof member.points }
          : member),
      })),
    });
    expect(generatedGeometryProvenanceState(provenance!, revised)).toEqual({
      stale: true, reason: 'dependency_changed', changed_dependency_ids: ['v-right'],
    });
    materializeBoundaryDerivedGeometry(steps, moduleBinding, revised);
    const revisedPoints = (steps[0].args.regions[0].contours[0] as { points: Array<{ x: number; y: number }> }).points;
    expect(revisedPoints).not.toEqual(dispatched);
    expect(validateExecutableGeometry(steps, moduleBinding, revised)).toEqual([]);

    const curvedModule = region(derived!.points.map(value => ({ ...value })));
    const curvedPoints = (curvedModule[0].args.regions[0].contours[0] as { points: Array<GeometryPoint & { right?: number[] }> }).points;
    const center = derived!.points.reduce((sum, value) => ({ x: sum.x + value.x / 4, y: sum.y + value.y / 4 }), { x: 0, y: 0 });
    curvedPoints[0].right = [
      curvedPoints[0].x + (center.x - curvedPoints[0].x) * 0.6,
      curvedPoints[0].y + (center.y - curvedPoints[0].y) * 0.6,
    ];
    expect(validateExecutableGeometry(curvedModule, moduleBinding, moduleScene)).toEqual([]);
    curvedPoints[0].right = [
      curvedPoints[0].x + (curvedPoints[0].x - center.x) * 3,
      curvedPoints[0].y + (curvedPoints[0].y - center.y) * 3,
    ];
    expect(validateExecutableGeometry(curvedModule, moduleBinding, moduleScene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');
  });

  it('derives a repeated multi-cell layout from adjacent members of two analytic line families', () => {
    const gridScene = normalizeSceneGeometryModel({
      model_id: 'grid-scene', revision: 1, applicability: 'coherent_3d',
      source_frame: { document_id: 1, document_incarnation: 'inc', width: 400, height: 300 },
      projection: { kind: 'two_point', vanishing_points: [] },
      line_families: [
        { id: 'verticals', members: [
          { id: 'v0', points: [{ x: 80, y: 40 }, { x: 80, y: 260 }] },
          { id: 'v1', points: [{ x: 180, y: 40 }, { x: 180, y: 260 }] },
          { id: 'v2', points: [{ x: 300, y: 40 }, { x: 300, y: 260 }] },
        ] },
        { id: 'courses', members: [
          { id: 'h0', points: [{ x: 40, y: 90 }, { x: 340, y: 110 }] },
          { id: 'h1', points: [{ x: 40, y: 210 }, { x: 340, y: 190 }] },
        ] },
      ], support_planes: [], scale_anchors: [],
    });
    const gridBinding = normalizeGeometryBinding({
      owner_id: 'window-row', scene_geometry_model_id: 'grid-scene', scene_geometry_revision: 1,
      vanishing_family_ids: ['courses', 'verticals'], dependencies: ['v0', 'v1', 'v2', 'h0', 'h1'],
      anchors: {}, control_sections: [], constraints: [], exact_geometry_completion_relevant: true,
      exact_evidence: [{ id: 'grid-measure', method: 'photoshop_measure_points', source_frame: { document_id: 1, document_incarnation: 'inc', width: 400, height: 300 } }],
      local_exceptions: [],
    });
    const grid = deriveLineFamilyGrid(gridBinding, gridScene);
    expect(grid?.cells).toHaveLength(2);
    const curvedGrid = [{ tool: 'photoshop_paint_regions', args: { regions: [
      { contours: [{ points: [{ x: 80, y: 100, right: [100, 70] }, { x: 180, y: 100 }, { x: 180, y: 200 }, { x: 80, y: 200 }] }] },
      { contours: [{ points: [{ x: 180, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 180, y: 200 }] }] },
    ] } }];
    const authoredGrid = structuredClone(curvedGrid);
    expect(materializeBoundaryDerivedGeometry(curvedGrid, gridBinding, gridScene)).toBeUndefined();
    expect(curvedGrid).toEqual(authoredGrid); // No partially rewritten grid.
    const steps = [
      { tool: 'photoshop_paint_regions', args: { regions: [{ contours: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }] }] },
        { contours: [{ points: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }] }] }] } },
    ];
    const provenance = materializeBoundaryDerivedGeometry(steps, gridBinding, gridScene);
    expect(provenance).toMatchObject({ dependency_ids: ['h0', 'h1', 'v0', 'v1', 'v2'], dispatched_point_count: 8 });
    expect(validateExecutableGeometry(steps, gridBinding, gridScene)).toEqual([]);
    expect((steps[0].args.regions[0].contours[0] as { points: GeometryPoint[] }).points).toEqual(grid!.cells[0].points);
    expect((steps[0].args.regions[1].contours[0] as { points: GeometryPoint[] }).points).toEqual(grid!.cells[1].points);

    const bowTie = structuredClone(steps);
    const bowTiePoints = (bowTie[0].args.regions[0].contours[0] as { points: GeometryPoint[] }).points;
    (bowTie[0].args.regions[0].contours[0] as { points: GeometryPoint[] }).points =
      [bowTiePoints[0], bowTiePoints[2], bowTiePoints[1], bowTiePoints[3]];
    expect(validateExecutableGeometry(bowTie, gridBinding, gridScene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');

    const duplicateCorner = structuredClone(steps);
    const duplicatePoints = (duplicateCorner[0].args.regions[0].contours[0] as { points: GeometryPoint[] }).points;
    duplicatePoints[2] = duplicatePoints[1];
    expect(validateExecutableGeometry(duplicateCorner, gridBinding, gridScene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');

    // A partial grid still consists entirely of valid derived corners. Corner
    // membership alone must not certify the missing cell as constructed.
    const missingCell = structuredClone(steps);
    missingCell[0].args.regions.pop();
    expect(inspectExecutableGeometry(missingCell, gridBinding, gridScene).provenance).toBeUndefined();
    expect(validateExecutableGeometry(missingCell, gridBinding, gridScene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');

    const duplicateCell = structuredClone(steps);
    duplicateCell[0].args.regions.push(structuredClone(duplicateCell[0].args.regions[0]));
    expect(inspectExecutableGeometry(duplicateCell, gridBinding, gridScene).provenance).toBeUndefined();
    expect(validateExecutableGeometry(duplicateCell, gridBinding, gridScene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');

    const curvedCell = structuredClone(steps);
    const firstCell = (curvedCell[0].args.regions[0].contours[0] as { points: Array<GeometryPoint & { right?: number[] }> }).points;
    const cellCenter = grid!.cells[0].points.reduce((sum, value) => ({ x: sum.x + value.x / 4, y: sum.y + value.y / 4 }), { x: 0, y: 0 });
    firstCell[0].right = [firstCell[0].x + (firstCell[0].x - cellCenter.x) * 3, firstCell[0].y + (firstCell[0].y - cellCenter.y) * 3];
    expect(validateExecutableGeometry(curvedCell, gridBinding, gridScene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');
  });

  it('accepts actual dispatched region vertices inside the bound perspective corridor', () => {
    expect(validateExecutableGeometry(region([
      { x: 90, y: 240 }, { x: 140, y: 240 }, { x: 165, y: 150 }, { x: 145, y: 150 },
    ]), binding, scene)).toEqual([]);
  });

  it('does not certify exact paint geometry across a layer switch or an unverified pixel mutation', () => {
    const paint = region([
      { x: 90, y: 240 }, { x: 140, y: 240 }, { x: 165, y: 150 }, { x: 145, y: 150 },
    ])[0];
    const unsafe = [
      { tool: 'photoshop_select_layer_by_name', args: { name: 'Other owner' } },
      { tool: 'photoshop_create_layer', args: { name: 'Unbound owner' } },
      { tool: 'photoshop_fill_layer', args: { red: 10, green: 20, blue: 30 } },
      { tool: 'photoshop_paint_color_gradient', args: { layer_id: 3 } },
      { tool: 'photoshop_undo', args: {} },
    ];
    for (const extra of unsafe) {
      for (const steps of [[extra, paint], [paint, extra]]) {
        const result = inspectExecutableGeometry(steps, binding, scene);
        expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
        expect(result.provenance).toBeUndefined();
      }
    }
    const derivedStroke = { tool: 'photoshop_paint_strokes', args: { strokes: [{ size: 2, points: [
      { x: 1, y: 180 }, { x: 399, y: 180 },
    ] }] } };
    const mixed = [derivedStroke, unsafe[0]];
    const before = structuredClone(mixed);
    expect(materializeBoundaryDerivedGeometry(mixed, binding, scene)).toBeUndefined();
    expect(mixed).toEqual(before); // No partial rewrite when evidence scope is invalid.

    // Brush setup and other non-target-changing preparation remain compatible.
    const safe = [{ tool: 'photoshop_set_foreground_color', args: { red: 10, green: 20, blue: 30 } }, paint];
    expect(inspectExecutableGeometry(safe, binding, scene).issues).toEqual([]);
    expect(inspectExecutableGeometry(safe, binding, scene).provenance?.mode).toBe('validated-boundary-corridor');
    expect(inspectExecutableGeometry([unsafe[2]], binding, scene).issues).toEqual([]);
    expect(inspectExecutableGeometry([unsafe[2]], binding, scene).provenance).toBeUndefined();
  });

  it('does not certify one exact owner across conflicting or ambiguous physical paint targets', () => {
    const points = [
      { x: 90, y: 240 }, { x: 140, y: 240 }, { x: 165, y: 150 }, { x: 145, y: 150 },
    ];
    const paint = (layerId?: number) => ({ tool: 'photoshop_paint_regions', args: {
      regions: [{ ...(layerId === undefined ? {} : { layer_id: layerId }), contours: [{ points }] }],
    } });
    const differentRegions = [{ tool: 'photoshop_paint_regions', args: {
      regions: [
        { layer_id: 7, contours: [{ points }] },
        { layer_id: 8, contours: [{ points }] },
      ],
    } }];
    const differentSteps = [paint(7), paint(8)];
    const mixedImplicit = [paint(7), paint()];
    const crossToolTarget = [paint(7), { tool: 'photoshop_paint_dabs', args: {
      layer_id: 8, dabs: [{ x: 130, y: 200, size: 2 }],
    } }];
    const invalidTarget = [{ ...paint(7), args: { regions: [{
      layer_id: null, contours: [{ points }],
    }] } }];
    for (const steps of [differentRegions, differentSteps, mixedImplicit, crossToolTarget, invalidTarget]) {
      const result = inspectExecutableGeometry(steps, binding, scene);
      expect(result.issues.map(issue => issue.code)).toContain('executable_geometry_unverifiable');
      expect(result.provenance).toBeUndefined();
      const before = structuredClone(steps);
      expect(materializeBoundaryDerivedGeometry(steps, binding, scene)).toBeUndefined();
      expect(steps).toEqual(before);
    }
    expect(inspectExecutableGeometry([paint(7), paint(7)], binding, scene).issues).toEqual([]);
    expect(inspectExecutableGeometry([paint()], binding, scene).issues).toEqual([]);
  });

  it('rejects hand-guessed dispatched vertices outside the accepted perspective corridor', () => {
    const issues = validateExecutableGeometry(region([
      { x: 10, y: 240 }, { x: 140, y: 240 }, { x: 165, y: 150 }, { x: 145, y: 150 },
    ]), binding, scene);
    expect(issues.map(issue => issue.code)).toContain('executable_geometry_constraint_conflict');
    expect(issues[0].message).toContain('dispatched geometry point[0]=(10,240)');
  });

  it('validates the actual dispatched paint-stroke path points against the same exact binding', () => {
    const curveEscapes = [{ tool:'photoshop_paint_strokes', args:{ strokes:[{ size: 4, points:[
      { x:130,y:200,right:[350,200] }, { x:150,y:180,left:[350,180] }, { x:175,y:160 },
    ] }] } }];
    const escaped = inspectExecutableGeometry(curveEscapes,binding,scene);
    expect(escaped.issues.map(issue=>issue.code)).toContain('executable_geometry_constraint_conflict');
    expect(escaped.provenance).toBeUndefined();
    const curveInside = [{ tool:'photoshop_paint_strokes', args:{ strokes:[{ size: 4, points:[
      { x:130,y:200,right:[100,200] }, { x:150,y:180,left:[150,200] }, { x:175,y:160 },
    ] }] } }];
    expect(validateExecutableGeometry(curveInside,binding,scene)).toEqual([]);
    const inside = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ size: 4, points: [
      { x: 90, y: 240 }, { x: 150, y: 180 }, { x: 175, y: 120 },
    ] }] } }];
    expect(validateExecutableGeometry(inside, binding, scene)).toEqual([]);

    const outside = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ size: 4, points: [
      { x: 8, y: 240 }, { x: 150, y: 180 },
    ] }] } }];
    expect(validateExecutableGeometry(outside, binding, scene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');
  });

  it('validates the full explicit stroke footprint against an exact corridor', () => {
    const centerlineInsideButBrushEscapes = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{
      size: 40, points: [{ x: 82, y: 240 }, { x: 105, y: 220 }],
    }] } }];
    expect(validateExecutableGeometry(centerlineInsideButBrushEscapes, binding, scene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');

    const contained = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{
      size: 8, points: [{ x: 120, y: 240 }, { x: 145, y: 200 }],
    }] } }];
    expect(validateExecutableGeometry(contained, binding, scene)).toEqual([]);

    const dynamic = structuredClone(contained);
    delete dynamic[0].args.strokes[0].size;
    dynamic[0].args.strokes[0].dynamics = { size: [6, 10] };
    expect(validateExecutableGeometry(dynamic, binding, scene)).toEqual([]);

    const unknownWidth = structuredClone(contained);
    delete unknownWidth[0].args.strokes[0].size;
    expect(validateExecutableGeometry(unknownWidth, binding, scene).map(issue => issue.code))
      .toEqual(['executable_geometry_unverifiable']);
  });

  it('validates the painted dab footprint rather than certifying only its center point', () => {
    const centeredButEscaping = [{ tool: 'photoshop_paint_dabs', args: { dabs: [
      { x: 82, y: 240, size: 40 },
    ] } }];
    const escaped = inspectExecutableGeometry(centeredButEscaping, binding, scene);
    expect(escaped.issues.map(issue => issue.code)).toContain('executable_geometry_constraint_conflict');
    expect(escaped.provenance).toBeUndefined();

    const contained = [{ tool: 'photoshop_paint_dabs', args: { dabs: [
      { x: 120, y: 240, size: 20 },
    ] } }];
    const accepted = inspectExecutableGeometry(contained, binding, scene);
    expect(accepted.issues).toEqual([]);
    expect(accepted.provenance).toMatchObject({
      mode: 'validated-boundary-corridor', tools: ['photoshop_paint_dabs'], dispatched_point_count: 5,
    });

    const unknownFootprint = [{ tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 120, y: 240 }] } }];
    expect(validateExecutableGeometry(unknownFootprint, binding, scene).map(issue => issue.code))
      .toEqual(['executable_geometry_unverifiable']);
  });

  it('validates the conservative stamp-instance footprint against an exact corridor', () => {
    const escaping = [{ tool: 'photoshop_paint_stamp_instances', args: { instances: [
      { instance_id: 'motif', x: 82, y: 240, size: 40, angle: 35 },
    ] } }];
    expect(validateExecutableGeometry(escaping, binding, scene).map(issue => issue.code))
      .toContain('executable_geometry_constraint_conflict');

    const contained = [{ tool: 'photoshop_paint_stamp_instances', args: { instances: [
      { instance_id: 'motif', x: 120, y: 240, size: 20, angle: 35, flip_x: true },
    ] } }];
    expect(validateExecutableGeometry(contained, binding, scene)).toEqual([]);

    const unknownSize = structuredClone(contained);
    delete unknownSize[0].args.instances[0].size;
    expect(validateExecutableGeometry(unknownSize, binding, scene).map(issue => issue.code))
      .toEqual(['executable_geometry_unverifiable']);
  });

  it('requires native finite geometry numbers for exact dab/stamp and stroke footprints', () => {
    // Coercing a string or boolean to a number is not pixel evidence: it can
    // mint provenance for a payload that the Photoshop executor may reject.
    for (const tool of ['photoshop_paint_dabs', 'photoshop_paint_stamp_instances'] as const) {
      const key = tool === 'photoshop_paint_dabs' ? 'dabs' : 'instances';
      const valid = { x: 120, y: 240, size: 20 };
      const accepted = inspectExecutableGeometry([{ tool, args: { [key]: [valid] } }], binding, scene);
      expect(accepted.issues).toEqual([]);
      expect(accepted.provenance).toBeDefined();
      for (const patch of [
        { x: '120' }, { y: false }, { x: null }, { size: '20' }, { size: true },
      ]) {
        const result = inspectExecutableGeometry([
          { tool, args: { [key]: [{ ...valid, ...patch }] } },
        ], binding, scene);
        expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
        expect(result.provenance).toBeUndefined();
      }
    }
    const validStroke = { points: [{ x: 120, y: 240 }, { x: 145, y: 200 }] };
    for (const invalidSize of ['8', true, null]) {
      const result = inspectExecutableGeometry([{
        tool: 'photoshop_paint_strokes',
        args: { strokes: [{ ...validStroke, size: invalidSize }] },
      }], binding, scene);
      expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(result.provenance).toBeUndefined();
    }
    for (const dynamics of [{ size: ['6', 10] }, { size: [false, 10] }, { size: [6] }]) {
      const result = inspectExecutableGeometry([{
        tool: 'photoshop_paint_strokes',
        args: { strokes: [{ ...validStroke, size: 8, dynamics }] },
      }], binding, scene);
      expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(result.provenance).toBeUndefined();
    }
  });

  it('rejects diagonal circular-footprint escapes missed by cardinal-only samples', () => {
    // At y=240 the left boundary is x=72, with slope dx/dy=-0.8.
    // Radius 24 fits the four axis-aligned samples at (98,240), but its
    // boundary-normal extremum crosses the slanted line by >2px.
    for (const step of [
      { tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 98, y: 240, size: 48 }] } },
      { tool: 'photoshop_paint_stamp_instances', args: { instances: [
        { instance_id: 'diagonal', x: 98, y: 240, size: 48, angle: 35, flip_x: true },
      ] } },
    ]) {
      const result = inspectExecutableGeometry([step], binding, scene);
      expect(result.issues.map(issue => issue.code)).toContain('executable_geometry_constraint_conflict');
      expect(result.provenance).toBeUndefined();
    }
  });

  it('records deterministic provenance for the exact executable coordinates that passed validation', () => {
    const result = inspectExecutableGeometry(region([
      { x: 90, y: 240 }, { x: 140, y: 240 }, { x: 165, y: 150 }, { x: 145, y: 150 },
    ]), binding, scene);
    expect(result.issues).toEqual([]);
    expect(result.provenance).toEqual({
      mode: 'validated-boundary-corridor',
      owner_id: 'facade',
      scene_geometry_model_id: 'scene',
      scene_geometry_revision: 1,
      dependency_ids: ['left', 'right'],
      tools: ['photoshop_paint_regions'],
      dispatched_point_count: 4,
      tolerance_px: 2,
    });
  });

  it('does not mint executable provenance for rejected geometry', () => {
    const result = inspectExecutableGeometry(region([{ x: 10, y: 240 }]), binding, scene);
    expect(result.issues).toHaveLength(1);
    expect(result.provenance).toBeUndefined();
  });

  it('refuses non-finite or unbounded pixel tolerances rather than certifying distant pixels', () => {
    const outside = region([{ x: 10, y: 240 }]);
    for (const tolerance of [Infinity, NaN, -1, 1000]) {
      const result = inspectExecutableGeometry(outside, binding, scene, tolerance);
      expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(result.provenance).toBeUndefined();
    }
    const inside = region([{ x: 120, y: 240 }]);
    expect(inspectExecutableGeometry(inside, binding, scene, 1).provenance?.mode)
      .toBe('validated-boundary-corridor');
  });

  it('fails closed instead of silently dropping malformed exact executable points', () => {
    const malformed = [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [
      { x: 90, y: 240 }, { x: 'not-a-coordinate', y: 180 },
    ] }] } }];
    const result = inspectExecutableGeometry(malformed, binding, scene);
    expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
    expect(result.issues[0].message).toContain('non-finite executable point');
    expect(result.provenance).toBeUndefined();
  });

  it('fails closed when an exact region/stroke action has no executable point list', () => {
    for (const malformed of [
      [{ tool: 'photoshop_paint_regions', args: { regions: [{ contours: [] }] } }],
      [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [] }] } }],
    ]) {
      expect(validateExecutableGeometry(malformed, binding, scene).map(issue => issue.code))
        .toEqual(['executable_geometry_unverifiable']);
    }
  });

  it('fails closed for exact layer transforms until source bounds/landmarks make the destination numerically verifiable', () => {
    for (const step of [
      { tool: 'photoshop_move_layer', args: { deltaX: 12, deltaY: -4 } },
      { tool: 'photoshop_scale_layer', args: { scalePercent: 110, centerAnchor: true } },
      { tool: 'photoshop_rotate_layer', args: { degrees: 5 } },
      { tool: 'photoshop_fit_layer_to_document', args: { fillDocument: false } },
    ]) {
      const issues = validateExecutableGeometry([step], binding, scene);
      expect(issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(issues[0].message).toContain(String(step.tool));
    }
  });

  it('validates exact rotation from a durable owner centerline to one bound analytic orientation', () => {
    const orientedBinding = normalizeGeometryBinding({
      ...binding,
      anchors: { centerline: { line: [{ x: 20, y: 100 }, { x: 120, y: 100 }] } },
      dependencies: ['left'],
      constraints: [{ type: 'parallel_family', target_ref: 'left', evidence: ['measure'] }],
    });
    const expected = Math.atan2(80 - 280, 200 - 40) * 180 / Math.PI;
    const accepted = inspectExecutableGeometry([
      { tool: 'photoshop_rotate_layer', args: { degrees: expected } },
    ], orientedBinding, scene);
    expect(accepted.issues).toEqual([]);
    expect(accepted.provenance?.mode).toBe('validated-orientation-transform');
    expect(accepted.provenance?.dependency_ids).toEqual(['left']);
    expect(accepted.provenance?.dependency_snapshots?.left).toBeTruthy();

    const rejected = validateExecutableGeometry([
      { tool: 'photoshop_rotate_layer', args: { degrees: expected + 8 } },
    ], orientedBinding, scene);
    expect(rejected.map(issue => issue.code)).toEqual(['executable_geometry_constraint_conflict']);
    expect(rejected[0].message).toContain('orientation-derived rotation');

    // An executable rotation must carry a numeric angle; a string that happens
    // to parse to the derived angle is not independent executable evidence.
    expect(validateExecutableGeometry([
      { tool: 'photoshop_rotate_layer', args: { degrees: String(expected) } },
    ], orientedBinding, scene).map(issue => issue.code))
      .toEqual(['executable_geometry_unverifiable']);

    const hostile = [{ tool: 'photoshop_rotate_layer', args: { degrees: 73 } }];
    const provenance = materializeOrientationDerivedRotate(hostile, orientedBinding, scene);
    expect((hostile[0].args as { degrees: number }).degrees).toBeCloseTo(expected, 8);
    expect(provenance?.mode).toBe('validated-orientation-transform');
    expect(validateExecutableGeometry(hostile, orientedBinding, scene)).toEqual([]);
  });

  it('keeps rotation fail-closed when orientation authority is ambiguous or not current', () => {
    const ambiguous = normalizeGeometryBinding({
      ...binding,
      anchors: { centerline: { line: [{ x: 20, y: 100 }, { x: 120, y: 100 }] } },
      constraints: [
        { type: 'parallel_family', target_ref: 'left', evidence: ['measure'] },
        { type: 'parallel_family', target_ref: 'right', evidence: ['measure'] },
      ],
    });
    expect(validateExecutableGeometry([
      { tool: 'photoshop_rotate_layer', args: { degrees: -45 } },
    ], ambiguous, scene).map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);

    const stale = normalizeGeometryBinding({
      ...binding,
      anchors: { centerline: { line: [{ x: 20, y: 100 }, { x: 120, y: 100 }] } },
      dependencies: ['left'],
      constraints: [{ type: 'parallel_family', target_ref: 'left', evidence: ['measure'] }],
      exact_evidence: [{ ...binding.exact_evidence[0], source_frame: {
        ...binding.exact_evidence[0].source_frame, document_incarnation: 'stale-inc',
      } }],
    });
    expect(validateExecutableGeometry([
      { tool: 'photoshop_rotate_layer', args: { degrees: -45 } },
    ], stale, scene).map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
  });

  it('does not certify exact transforms when another action changes the layer or paints outside the transform proof', () => {
    const orientedBinding = normalizeGeometryBinding({
      ...binding,
      anchors: { centerline: { line: [{ x: 20, y: 100 }, { x: 120, y: 100 }] } },
      dependencies: ['left'],
      constraints: [{ type: 'parallel_family', target_ref: 'left', evidence: ['measure'] }],
    });
    const rotation = { tool: 'photoshop_rotate_layer', args: { degrees: Math.atan2(-200, 160) * 180 / Math.PI } };
    const paint = { tool: 'photoshop_paint_strokes', args: { strokes: [{ size: 5, points: [
      { x: 20, y: 100 }, { x: 100, y: 100 },
    ] }] } };
    const mixedRotation = inspectExecutableGeometry([rotation, paint], orientedBinding, scene);
    expect(mixedRotation.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
    expect(mixedRotation.provenance).toBeUndefined();
    const materialization = [{ ...rotation, args: { degrees: 42 } }, paint];
    expect(materializeBoundaryDerivedGeometry(materialization, orientedBinding, scene)).toBeUndefined();
    expect(materialization[0].args.degrees).toBe(42);
    const combinedTransforms = [{ ...rotation, args: { degrees: 42 } },
      { tool: 'photoshop_move_layer', args: { deltaX: 0, deltaY: 0 } }];
    expect(materializeBoundaryDerivedGeometry(combinedTransforms, orientedBinding, scene)).toBeUndefined();
    expect(combinedTransforms[0].args.degrees).toBe(42);

    const sameFrame = { left: 10, top: 20, right: 110, bottom: 120 };
    const derivation = { tool: 'photoshop_transform_landmarks', args: {
      points: [{ name: 'corner', x: 10, y: 20 }], source_frame: sameFrame, target_frame: sameFrame,
    } };
    const move = { tool: 'photoshop_move_layer', args: { deltaX: 0, deltaY: 0 } };
    for (const steps of [
      [{ tool: 'photoshop_select_layer_by_name', args: { name: 'Different layer' } }, derivation, move],
      [derivation, move, paint],
    ]) {
      const result = inspectExecutableGeometry(steps, binding, scene);
      expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(result.provenance).toBeUndefined();
    }
    expect(inspectExecutableGeometry([derivation, move], binding, scene).issues).toEqual([]);
  });

  it('accepts move/scale payloads that numerically match one explicit landmark frame derivation', () => {
    const derivation = { tool: 'photoshop_transform_landmarks', args: {
      points: [{ name: 'corner', x: 10, y: 20 }],
      source_frame: { left: 10, top: 20, right: 110, bottom: 120 },
      target_frame: { left: 30, top: 50, right: 230, bottom: 250 },
    } };
    const result = inspectExecutableGeometry([
      derivation,
      { tool: 'photoshop_move_layer', args: { deltaX: 20, deltaY: 30 } },
      { tool: 'photoshop_scale_layer', args: { scalePercent: 200, centerAnchor: false } },
    ], binding, scene);
    expect(result.issues).toEqual([]);
    expect(result.provenance?.mode).toBe('validated-landmark-transform');
    expect(result.provenance?.tools).toEqual(['photoshop_move_layer', 'photoshop_scale_layer']);
    expect(result.provenance?.source_bounds).toEqual({ left: 10, top: 20, right: 110, bottom: 120 });
    expect(observedLayerBoundsIssue(result.provenance, {
      bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    })).toBeUndefined();
    // Identical bounds do not establish physical owner identity. A pinned
    // logical layer must match the live active layer before any transform.
    expect(observedLayerBoundsIssue(result.provenance, {
      id: 8, bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    }, 7)?.code).toBe('executable_geometry_constraint_conflict');
    expect(observedLayerBoundsIssue(result.provenance, {
      bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    }, 7)?.code).toBe('executable_geometry_unverifiable');
    expect(observedLayerBoundsIssue(result.provenance, {
      id: 7, bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    }, 7)).toBeUndefined();
    expect(observedLayerBoundsIssue(result.provenance, {
      bounds: { left: 13, top: 20, right: 113, bottom: 120 },
    })?.code).toBe('executable_geometry_constraint_conflict');
    expect(observedLayerBoundsIssue(result.provenance, { id: 7 })?.code)
      .toBe('executable_geometry_unverifiable');
    // A persisted/externally supplied landmark provenance may be incomplete.
    // An empty source_bounds object previously passed the vacuous Object.keys
    // comparison, silently bypassing the live Photoshop layer check.
    expect(observedLayerBoundsIssue({ ...result.provenance!, source_bounds: undefined }, {
      bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    })?.code).toBe('executable_geometry_unverifiable');
    expect(observedLayerBoundsIssue({ ...result.provenance!, source_bounds: {} as never }, {
      bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    })?.code).toBe('executable_geometry_unverifiable');
    expect(observedLayerBoundsIssue({ ...result.provenance!, source_bounds: { left: 10 } as never }, {
      bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    })?.code).toBe('executable_geometry_unverifiable');
    // Persisted JSON can contain null, strings and booleans. Number(null) === 0
    // must not turn a missing source coordinate into a verified zero-origin.
    for (const invalid of [null, '10', true]) {
      expect(observedLayerBoundsIssue({ ...result.provenance!, source_bounds: {
        left: invalid, top: 20, right: 110, bottom: 120,
      } as never }, { bounds: { left: 0, top: 20, right: 110, bottom: 120 } })?.code)
        .toBe('executable_geometry_unverifiable');
      expect(observedLayerBoundsIssue(result.provenance, {
        bounds: { left: invalid, top: 20, right: 110, bottom: 120 },
      })?.code).toBe('executable_geometry_unverifiable');
    }
    expect(observedLayerBoundsIssue({ ...result.provenance!, tolerance_px: -1 }, {
      bounds: { left: 10, top: 20, right: 110, bottom: 120 },
    })?.code).toBe('executable_geometry_unverifiable');
    // The dispatch validator caps exact raster tolerance at 2 px, but persisted
    // provenance can be loaded independently. A forged large tolerance must not
    // certify a physically displaced Photoshop layer during live preflight.
    for (const invalidTolerance of [2.01, 1000, Infinity, NaN]) {
      expect(observedLayerBoundsIssue({ ...result.provenance!, tolerance_px: invalidTolerance }, {
        id: 7, bounds: { left: 60, top: 20, right: 160, bottom: 120 },
      }, 7)?.code).toBe('executable_geometry_unverifiable');
    }
    const displaced = { ...derivation, args: { ...derivation.args,
      target_frame: { left: 90, top: 50, right: 290, bottom: 250 },
    } };
    const scale = { tool: 'photoshop_scale_layer', args: { scalePercent: 200, centerAnchor: false } };
    const missingMove = inspectExecutableGeometry([displaced, scale], binding, scene);
    expect(missingMove.issues.map(issue => issue.code)).toEqual(['executable_geometry_constraint_conflict']);
    expect(missingMove.issues[0].message).toContain('remaining move=(80,30)px');
    expect(missingMove.provenance).toBeUndefined();
    expect(inspectExecutableGeometry([displaced, scale,
      { tool: 'photoshop_move_layer', args: { deltaX: 80, deltaY: 30 } },
    ], binding, scene).issues).toEqual([]);
    const mixedAnchors = { ...derivation, args: { ...derivation.args,
      target_frame: { left: -40, top: -30, right: 60, bottom: 70 },
    } };
    const center = { tool: 'photoshop_scale_layer', args: { scalePercent: 200 } };
    const topLeft = { tool: 'photoshop_scale_layer', args: { scalePercent: 50, centerAnchor: false } };
    expect(inspectExecutableGeometry([mixedAnchors, center, topLeft], binding, scene).issues).toEqual([]);
    expect(inspectExecutableGeometry([mixedAnchors, topLeft, center], binding, scene).issues[0].code)
      .toBe('executable_geometry_constraint_conflict');
    expect(inspectExecutableGeometry([displaced, scale,
      { tool: 'photoshop_select_layer_by_name', args: { name: 'Other' } },
      { tool: 'photoshop_move_layer', args: { deltaX: 80, deltaY: 30 } },
    ], binding, scene).issues[0].code).toBe('executable_geometry_unverifiable');
  });

  it('does not certify coercible nonnumeric move or scale arguments as exact geometry', () => {
    const sameFrame = { left: 10, top: 20, right: 110, bottom: 120 };
    const derivation = { tool: 'photoshop_transform_landmarks', args: {
      points: [{ name: 'corner', x: 10, y: 20 }],
      source_frame: sameFrame, target_frame: sameFrame,
    } };
    for (const invalid of [null, '0', false]) {
      const move = inspectExecutableGeometry([derivation, {
        tool: 'photoshop_move_layer', args: { deltaX: invalid, deltaY: 0 },
      }], binding, scene);
      expect(move.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(move.provenance).toBeUndefined();
    }
    for (const invalid of ['100', true]) {
      const scale = inspectExecutableGeometry([derivation, {
        tool: 'photoshop_scale_layer', args: { scalePercent: invalid, centerAnchor: false },
      }], binding, scene);
      expect(scale.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(scale.provenance).toBeUndefined();
    }
  });

  it('does not treat caller-supplied transform landmarks as independent evidence for a stale source frame', () => {
    const staleEvidenceBinding = {
      ...binding,
      exact_evidence: binding.exact_evidence.map(evidence => ({
        ...evidence,
        source_frame: { ...evidence.source_frame, document_incarnation: 'stale-incarnation' },
      })),
    };
    const issues = validateExecutableGeometry([
      { tool: 'photoshop_transform_landmarks', args: {
        points: [{ name: 'corner', x: 10, y: 20 }],
        source_frame: { left: 10, top: 20, right: 110, bottom: 120 },
        target_frame: { left: 30, top: 50, right: 230, bottom: 250 },
      } },
      { tool: 'photoshop_move_layer', args: { deltaX: 20, deltaY: 30 } },
    ], staleEvidenceBinding, scene);
    expect(issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
    expect(issues[0].message).toContain('photoshop_move_layer');
  });

  it('rejects a dispatched transform that disagrees with its explicit landmark frame derivation', () => {
    const issues = validateExecutableGeometry([
      { tool: 'photoshop_transform_landmarks', args: {
        points: [{ name: 'corner', x: 10, y: 20 }],
        source_frame: { left: 10, top: 20, right: 110, bottom: 120 },
        target_frame: { left: 30, top: 50, right: 230, bottom: 250 },
      } },
      { tool: 'photoshop_move_layer', args: { deltaX: 7, deltaY: 30 } },
    ], binding, scene);
    expect(issues.map(issue => issue.code)).toEqual(['executable_geometry_constraint_conflict']);
    expect(issues[0].message).toContain('size mismatch; target origin delta=(13,0)px');
  });

  it('accepts center-anchored uniform scale only when source and target frames prove the same center', () => {
    const accepted = inspectExecutableGeometry([
      { tool: 'photoshop_transform_landmarks', args: {
        points: [{ name: 'corner', x: 10, y: 20 }],
        source_frame: { left: 10, top: 20, right: 110, bottom: 120 },
        target_frame: { left: -40, top: -30, right: 160, bottom: 170 },
      } },
      { tool: 'photoshop_scale_layer', args: { scalePercent: 200, centerAnchor: true } },
    ], binding, scene);
    expect(accepted.issues).toEqual([]);
    expect(accepted.provenance?.mode).toBe('validated-landmark-transform');

    const rejected = validateExecutableGeometry([
      { tool: 'photoshop_transform_landmarks', args: {
        points: [{ name: 'corner', x: 10, y: 20 }],
        source_frame: { left: 10, top: 20, right: 110, bottom: 120 },
        target_frame: { left: 10, top: 20, right: 210, bottom: 220 },
      } },
      { tool: 'photoshop_scale_layer', args: { scalePercent: 200, centerAnchor: true } },
    ], binding, scene);
    expect(rejected.map(issue => issue.code)).toEqual(['executable_geometry_constraint_conflict']);
    expect(rejected[0].message).toContain('remaining move=(50,50)px');
  });

  it('accepts fit-to-document only when landmark frames prove the dispatched fit/fill policy', () => {
    const fit = inspectExecutableGeometry([
      { tool: 'photoshop_transform_landmarks', args: {
        points: [{ name: 'corner', x: 0, y: 0 }],
        source_frame: { left: 0, top: 0, right: 100, bottom: 100 },
        target_frame: { left: 50, top: 0, right: 350, bottom: 300 },
      } },
      { tool: 'photoshop_fit_layer_to_document', args: { fillDocument: false } },
    ], binding, scene);
    expect(fit.issues).toEqual([]);
    expect(fit.provenance?.mode).toBe('validated-landmark-transform');

    const wrongPolicy = validateExecutableGeometry([
      { tool: 'photoshop_transform_landmarks', args: {
        points: [{ name: 'corner', x: 0, y: 0 }],
        source_frame: { left: 0, top: 0, right: 100, bottom: 100 },
        target_frame: { left: 0, top: -50, right: 400, bottom: 350 },
      } },
      { tool: 'photoshop_fit_layer_to_document', args: { fillDocument: false } },
    ], binding, scene);
    expect(wrongPolicy.map(issue => issue.code)).toEqual(['executable_geometry_constraint_conflict']);
    expect(wrongPolicy[0].message).toContain('size mismatch');
    const shiftedTarget = { tool: 'photoshop_transform_landmarks', args: {
      points: [{ name: 'corner', x: 0, y: 0 }],
      source_frame: { left: 0, top: 0, right: 100, bottom: 100 },
      target_frame: { left: 60, top: 20, right: 360, bottom: 320 },
    } };
    const fitStep = { tool: 'photoshop_fit_layer_to_document', args: {} };
    const moveStep = { tool: 'photoshop_move_layer', args: { deltaX: 10, deltaY: 20 } };
    expect(inspectExecutableGeometry([shiftedTarget, fitStep, moveStep], binding, scene).issues).toEqual([]);
    expect(inspectExecutableGeometry([shiftedTarget, moveStep, fitStep], binding, scene).issues[0].code)
      .toBe('executable_geometry_constraint_conflict');
  });

  it('does not certify fit-to-document from coercible or invalid persisted canvas dimensions', () => {
    const steps = [
      { tool: 'photoshop_transform_landmarks', args: {
        points: [{ name: 'corner', x: 0, y: 0 }],
        source_frame: { left: 0, top: 0, right: 100, bottom: 100 },
        target_frame: { left: 50, top: 0, right: 350, bottom: 300 },
      } },
      { tool: 'photoshop_fit_layer_to_document', args: { fillDocument: false } },
    ];
    expect(inspectExecutableGeometry(steps, binding, scene).provenance?.mode)
      .toBe('validated-landmark-transform');
    for (const invalidWidth of ['400', true, null, Infinity]) {
      const malformedScene = {
        ...scene,
        source_frame: { ...scene.source_frame, width: invalidWidth },
      } as unknown as typeof scene;
      const malformedBinding = {
        ...binding,
        exact_evidence: binding.exact_evidence.map(evidence => ({
          ...evidence,
          source_frame: { ...evidence.source_frame, width: invalidWidth },
        })),
      } as unknown as typeof binding;
      const result = inspectExecutableGeometry(steps, malformedBinding, malformedScene);
      expect(result.issues.map(issue => issue.code)).toEqual(['executable_geometry_unverifiable']);
      expect(result.provenance).toBeUndefined();
    }
  });

  it('does not impose the exact-geometry transform barrier on a non-completion-relevant binding', () => {
    const advisoryBinding = { ...binding, exact_geometry_completion_relevant: false };
    expect(validateExecutableGeometry([
      { tool: 'photoshop_move_layer', args: { deltaX: 12, deltaY: -4 } },
    ], advisoryBinding, scene)).toEqual([]);
  });
});
