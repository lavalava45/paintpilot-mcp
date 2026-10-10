import { Bezier } from 'bezier-js';
import {
  difference,
  union,
  inflatePaths,
  pointInPolygon,
  area,
  FillRule,
  JoinType,
  EndType,
  PointInPolygonResult,
  type Paths64,
} from 'clipper2-ts';

// Project-authored adapters. Upstream authors, pinned revisions and licenses:
// THIRD_PARTY_NOTICES.md and licenses/. No upstream implementation is copied here.
export const CONTOUR_GEOMETRY = {
  revision: 'clipper-bezier-v1',
  bezier_js: '6.1.4',
  clipper2_ts: '2.0.1-18',
  curve_tolerance_pixels: 0.25,
  integer_scale: 1024,
} as const;
export type ContourPoint = { x: number; y: number };
export class ContourGeometryError extends Error {}
const SCALE = CONTOUR_GEOMETRY.integer_scale;
function validatePoint(p: ContourPoint) {
  if (!p || ![p.x, p.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e7))
    throw new ContourGeometryError(
      'Coordinates must be finite and within +/-10,000,000 canvas pixels'
    );
}
function distanceToSegment(p: ContourPoint, a: ContourPoint, b: ContourPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / square)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Same closed Catmull-Rom shape as before, flattened to a bounded canvas-pixel error. */
export function smoothClosedContour(points: ContourPoint[], maxPoints = 256): ContourPoint[] {
  if (
    points.length < 3 ||
    points.length > 64 ||
    !Number.isInteger(maxPoints) ||
    maxPoints < 3 ||
    maxPoints > 500
  )
    throw new ContourGeometryError('Use 3..64 anchors and a 3..500 output-point budget');
  points.forEach(validatePoint);
  const result: ContourPoint[] = [];
  const flatten = (curve: Bezier, depth: number) => {
    const [a, b, c, d] = curve.points;
    if (
      Math.max(distanceToSegment(b, a, d), distanceToSegment(c, a, d)) <=
      CONTOUR_GEOMETRY.curve_tolerance_pixels
    ) {
      if (result.length >= maxPoints)
        throw new ContourGeometryError(
          `Smooth contour exceeds ${maxPoints} points at 0.25-pixel accuracy; reduce projected size/curvature or use linear`
        );
      result.push({ x: a.x, y: a.y });
      return;
    }
    if (depth >= 16)
      throw new ContourGeometryError(
        'Curve subdivision limit reached; reduce projected size/curvature or use linear'
      );
    const halves = curve.split(0.5);
    flatten(halves.left, depth + 1);
    flatten(halves.right, depth + 1);
  };
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length],
      a = points[i],
      d = points[(i + 1) % points.length],
      next = points[(i + 2) % points.length];
    const controls = [
      a,
      { x: a.x + (d.x - previous.x) / 6, y: a.y + (d.y - previous.y) / 6 },
      { x: d.x - (next.x - a.x) / 6, y: d.y - (next.y - a.y) / 6 },
      d,
    ];
    controls.forEach(validatePoint);
    flatten(new Bezier(controls), 0);
  }
  return result;
}

function quantize(contour: ContourPoint[]) {
  if (contour.length < 3 || contour.length > 256)
    throw new ContourGeometryError('Mask contours require 3..256 points');
  return contour.map((p) => {
    validatePoint(p);
    return { x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) };
  });
}
function bounded(paths: Paths64) {
  if (paths.length > 32 || paths.reduce((n, p) => n + p.length, 0) > 4096)
    throw new ContourGeometryError(
      'Mask exceeds 32 contours / 4096 vertices; simplify the declared clip/exclusions'
    );
  if (paths.some((p) => p.some((v) => ![v.x, v.y].every(Number.isSafeInteger))))
    throw new ContourGeometryError('Polygon operation produced an unsafe coordinate');
  return paths;
}
export type ContourMask = { paths: Paths64 };

/** Exclusions are combined as a union (overlap cannot reopen a protected hole). */
export function compileContourMask(
  outer: ContourPoint[],
  exclusions: ContourPoint[][] = []
): ContourMask {
  if (exclusions.length > 8) throw new ContourGeometryError('Use at most 8 clip_exclusions');
  let paths = union([quantize(outer)], FillRule.EvenOdd);
  if (exclusions.length) {
    const subtract = exclusions.map((p) => {
      const q = quantize(p);
      return area(q) < 0 ? q.reverse() : q;
    });
    paths = difference(paths, union(subtract, FillRule.NonZero), FillRule.EvenOdd);
  }
  return { paths: bounded(paths) };
}

/** Offset once per brush scale, retaining disconnected islands and holes. */
export function insetContourMask(mask: ContourMask, radius: number): ContourMask {
  if (!Number.isFinite(radius) || radius < 0 || radius > 1e7)
    throw new ContourGeometryError('Inset radius must be finite and within [0,10000000]');
  return {
    paths: bounded(
      inflatePaths(
        mask.paths,
        -(radius + 2 / SCALE) * SCALE,
        JoinType.Round,
        EndType.Polygon,
        2,
        SCALE / 64
      )
    ),
  };
}
export function contourMaskContains(mask: ContourMask, p: ContourPoint): boolean {
  validatePoint(p);
  const point = { x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) };
  let inside = false;
  for (const path of mask.paths) {
    const hit = pointInPolygon(point, path);
    if (hit === PointInPolygonResult.IsOn) return false;
    if (hit === PointInPolygonResult.IsInside) inside = !inside;
  }
  return inside;
}
