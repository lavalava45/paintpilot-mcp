import { describe, expect, it } from 'vitest';
import { normalizeSceneGeometryModel } from './scene-geometry-model.js';
import { perspectiveEvidenceIssues } from './scene-perspective-validation.js';

function scene(kind: 'one_point' | 'two_point' | 'three_point' = 'one_point') {
  const raw: any = {
    model_id: 'perspective-audit', revision: 1, applicability: 'coherent_3d',
    source_frame: { document_id: 42, document_incarnation: 'doc:42:a', width: 1000, height: 800 },
    projection: { kind, horizon: { line: [{ x: 0, y: 200 }, { x: 1000, y: 200 }] },
      vanishing_points: [{ id: 'vp', x: 500, y: 200, evidence: 'derived',
        derived_from: ['left', 'right'] }] },
    line_families: [{ id: 'rails', vanishing_point_id: 'vp', members: [
      { id: 'left', points: [{ x: 100, y: 700 }, { x: 500, y: 200 }] },
      { id: 'right', points: [{ x: 900, y: 700 }, { x: 500, y: 200 }] },
    ] }], support_planes: [], scale_anchors: [],
  };
  return raw;
}

const problems = (raw: unknown, committed = true) =>
  perspectiveEvidenceIssues(normalizeSceneGeometryModel(raw), { committed })
    .map(issue => issue.code);

describe('Perspective evidence must agree with the actual image geometry', () => {
  it('accepts real perspective lines and the derived intersection on the horizon', () => {
    expect(problems(scene())).toEqual([]);
  });
  it('rejects a declared derived VP 474px away from its exact source line intersection', () => {
    const raw = scene();
    raw.projection.vanishing_points[0].x = 500;
    raw.projection.vanishing_points[0].y = 200;
    raw.line_families[0].members = [
      { id: 'left', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
      { id: 'right', points: [{ x: 0, y: 100 }, { x: 100, y: 0 }] },
    ];
    expect(problems(raw)).toContain('perspective_vanishing_point_conflict');
  });
  it('rejects missing/wrong-family source lines, not just fewer than two source IDs', () => {
    const raw = scene();
    raw.projection.vanishing_points[0].derived_from = ['missing-left', 'missing-right'];
    expect(problems(raw)).toContain('perspective_derived_source_missing');
    raw.projection.vanishing_points[0].derived_from = ['left', 'outside'];
    raw.projection.vanishing_points.push({ id: 'other-vp', x: 700, y: 200,
      evidence: 'proposed', derived_from: [] });
    raw.line_families.push({ id: 'other', vanishing_point_id: 'other-vp', members: [
      { id: 'outside', points: [{ x: 0, y: 0 }, { x: 90, y: 90 }] },
    ] });
    expect(problems(raw)).toContain('perspective_derived_source_missing');
  });
  it('rejects near-parallel source lines that cannot establish a stable finite VP', () => {
    const raw = scene();
    raw.line_families[0].members = [
      { id: 'left', points: [{ x: 0, y: 100 }, { x: 1000, y: 100.01 }] },
      { id: 'right', points: [{ x: 0, y: 150 }, { x: 1000, y: 150.01 }] },
    ];
    expect(problems(raw)).toContain('perspective_derived_source_unstable');
  });
  it('rejects a stray member of a valid perspective family', () => {
    const raw = scene();
    raw.line_families[0].members.push({ id: 'wrong-roof', points: [
      { x: 0, y: 50 }, { x: 1000, y: 50 },
    ] });
    expect(problems(raw)).toContain('perspective_family_line_conflict');
  });
  it('requires horizontal vanishing points on the explicit horizon for one- and two-point perspective', () => {
    const one = scene();
    one.projection.vanishing_points[0].y = 350;
    expect(problems(one)).toContain('perspective_horizon_conflict');
    const two = scene('two_point');
    two.projection.vanishing_points.push({ id: 'vp2', x: 1500, y: 350,
      evidence: 'proposed', derived_from: [] });
    two.line_families.push({ id: 'facade', vanishing_point_id: 'vp2', members: [
      { id: 'facade-line', points: [{ x: 700, y: 600 }, { x: 1500, y: 350 }] },
    ] });
    expect(problems(two)).toContain('perspective_horizon_conflict');
  });
  it('allows the vertical third VP off the horizon in three-point perspective', () => {
    const three = scene('three_point');
    three.projection.vanishing_points.push(
      { id: 'vp2', x: 1400, y: 200, evidence: 'proposed', derived_from: [] },
      { id: 'vertical', x: 500, y: -850, evidence: 'proposed', derived_from: [] },
    );
    three.line_families.push(
      { id: 'facade', vanishing_point_id: 'vp2', members: [
        { id: 'facade-line', points: [{ x: 700, y: 600 }, { x: 1400, y: 200 }] },
      ] },
      { id: 'verticals', vanishing_point_id: 'vertical', members: [
        { id: 'vertical-line', points: [{ x: 500, y: 700 }, { x: 500, y: -850 }] },
      ] },
    );
    expect(problems(three)).toEqual([]);
  });
  it('does not certify empty proposed line families as a committed perspective basis', () => {
    const raw = scene('two_point');
    raw.projection.vanishing_points = [
      { id: 'vp1', x: 0, y: 200, evidence: 'proposed', derived_from: [] },
      { id: 'vp2', x: 900, y: 200, evidence: 'proposed', derived_from: [] },
    ];
    raw.line_families = [
      { id: 'axis1', vanishing_point_id: 'vp1', members: [] },
      { id: 'axis2', vanishing_point_id: 'vp2', members: [] },
    ];
    expect(problems(raw, false)).toEqual([]);
    expect(problems(raw, true)).toContain('perspective_basis_required');
  });
  it('keeps orthographic and flat scenes free from synthetic vanishing-point requirements', () => {
    const flat = scene();
    flat.applicability = 'flat_or_collage';
    flat.projection.kind = 'orthographic';
    flat.projection.vanishing_points = [];
    flat.line_families = [];
    expect(problems(flat)).toEqual([]);
  });
});
