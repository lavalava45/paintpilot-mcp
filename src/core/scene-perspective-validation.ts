import { fitVanishingFamily, geometryDistance, pointToLineDistance, type GeometryLine } from './geometry-math.js';
import type { SceneGeometryModel, SceneLineMember } from './scene-geometry-model.js';

export interface PerspectiveEvidenceIssue {
  code: 'perspective_derived_source_missing' | 'perspective_derived_source_unstable'
    | 'perspective_vanishing_point_conflict' | 'perspective_family_line_conflict'
    | 'perspective_horizon_conflict' | 'perspective_basis_required';
  path: string;
  message: string;
}

/**
 * Audit the actual numeric basis of a perspective scene, not the count of
 * asserted vanishing point IDs. Proposed VPs are artistic plans, not measured
 * intersections; they may be unpopulated while planning, but cannot certify a
 * committed 3D construction without at least one line in each required family.
 * No value is repaired or inferred here.
 */
export function perspectiveEvidenceIssues(
  scene: SceneGeometryModel,
  options: { committed?: boolean } = {},
): PerspectiveEvidenceIssue[] {
  if (scene.applicability !== 'coherent_3d') return [];
  const issues: PerspectiveEvidenceIssue[] = [];
  const tolerance = Math.max(2, Math.hypot(scene.source_frame.width, scene.source_frame.height) * 0.005);
  const vpById = new Map(scene.projection.vanishing_points.map(vp => [vp.id, vp]));
  const membersByVp = new Map<string, Map<string, SceneLineMember>>();
  const add = (code: PerspectiveEvidenceIssue['code'], path: string, message: string) =>
    issues.push({ code, path, message: `${code}: ${message}` });
  for (const [familyIndex, family] of scene.line_families.entries()) {
    const vpId = family.vanishing_point_id;
    if (!vpId || !vpById.has(vpId)) continue; // Foreign references have their own schema gate.
    const vp = vpById.get(vpId)!;
    const members = membersByVp.get(vpId) ?? new Map<string, SceneLineMember>();
    membersByVp.set(vpId, members);
    for (const [index, member] of family.members.entries()) {
      members.set(member.id, member);
      const line = member.points as GeometryLine;
      if (geometryDistance(line[0], line[1]) < 1e-9) {
        add('perspective_derived_source_unstable',
          `scene_geometry_model.line_families[${familyIndex}].members[${index}].points`,
          `family=${family.id} member=${member.id} is a degenerate line`);
        continue;
      }
      const residual = pointToLineDistance(vp, line);
      if (residual > tolerance) add('perspective_family_line_conflict',
        `scene_geometry_model.line_families[${familyIndex}].members[${index}].points`,
        `family=${family.id} member=${member.id} misses declared VP=${vp.id} by ${residual.toFixed(2)}px (tolerance=${tolerance.toFixed(2)}px)`);
    }
  }
  for (const [index, vp] of scene.projection.vanishing_points.entries()) {
    if (vp.evidence !== 'derived') continue;
    const members = membersByVp.get(vp.id) ?? new Map<string, SceneLineMember>();
    const absent = vp.derived_from.filter(id => !members.has(id));
    if (absent.length || vp.derived_from.length < 2) {
      add('perspective_derived_source_missing',
        `scene_geometry_model.projection.vanishing_points[${index}].derived_from`,
        `derived VP=${vp.id} requires at least two EXISTING members of families assigned to that VP; missing=${absent.join(',') || 'insufficient source lines'}`);
      continue;
    }
    const lines = vp.derived_from.map(id => members.get(id)!.points as GeometryLine);
    try {
      const fit = fitVanishingFamily(lines);
      if (fit.status !== 'fit' || !fit.point || !Number.isFinite(fit.point.x) || !Number.isFinite(fit.point.y)) {
        add('perspective_derived_source_unstable',
          `scene_geometry_model.projection.vanishing_points[${index}].derived_from`,
          `derived VP=${vp.id} has parallel or ill-conditioned source directions; cannot prove a finite point`);
      } else if (geometryDistance(vp, fit.point) > tolerance || (fit.max_residual_px ?? Infinity) > tolerance) {
        add('perspective_vanishing_point_conflict',
          `scene_geometry_model.projection.vanishing_points[${index}]`,
          `derived VP=${vp.id} at (${vp.x},${vp.y}) does not match intersection (${fit.point.x.toFixed(2)},${fit.point.y.toFixed(2)}) within ${tolerance.toFixed(2)}px`);
      }
    } catch {
      add('perspective_derived_source_unstable',
        `scene_geometry_model.projection.vanishing_points[${index}].derived_from`,
        `derived VP=${vp.id} includes degenerate source lines`);
    }
  }

  const horizon = scene.projection.horizon?.line;
  const kind = scene.projection.kind;
  if (horizon && ['one_point', 'two_point', 'three_point'].includes(kind)) {
    if (geometryDistance(horizon[0], horizon[1]) < 1e-9) {
      add('perspective_horizon_conflict', 'scene_geometry_model.projection.horizon',
        'declared horizon is degenerate');
    } else {
      const onHorizon = scene.projection.vanishing_points.filter(vp =>
        pointToLineDistance(vp, horizon) <= tolerance);
      const required = kind === 'one_point' ? 1 : 2;
      if (kind === 'three_point' ? onHorizon.length < required
        : scene.projection.vanishing_points.some(vp => pointToLineDistance(vp, horizon) > tolerance)) {
        add('perspective_horizon_conflict', 'scene_geometry_model.projection.horizon',
          `projection.kind=${kind} requires ${required} horizontal vanishing point(s) on the declared horizon (third vertical VP may be off it)`);
      }
    }
  }

  if (options.committed) {
    const required = kind === 'one_point' ? 1 : kind === 'two_point' ? 2 : kind === 'three_point' ? 3 : 0;
    if (required) {
      const covered = [...membersByVp].filter(([id, members]) => vpById.has(id)
        && [...members.values()].some(member => geometryDistance(member.points[0], member.points[1]) >= 1e-9));
      if (covered.length < required) add('perspective_basis_required',
        'scene_geometry_model.projection',
        `projection.kind=${kind} needs ${required} distinct VP families with real nondegenerate line evidence before committed construction; covered_vanishing_points=${covered.length}`);
    }
  }
  return issues;
}
