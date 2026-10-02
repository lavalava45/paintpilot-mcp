import type { GeometryBounds } from './geometry-binding.js';
import type { GeometryPoint } from './scene-geometry-model.js';

export type GeometryLine = [GeometryPoint, GeometryPoint];
export interface GeometryRay {
  origin: GeometryPoint;
  through: GeometryPoint;
}
export type GeometryAxis = 'x' | 'y';

export interface NormalizedLineEquation {
  a: number;
  b: number;
  c: number;
}

export interface LineIntersectionResult {
  status: 'intersect' | 'near_parallel' | 'parallel';
  point?: GeometryPoint;
  determinant: number;
}

export interface LineFamilyFitResult {
  status: 'fit' | 'near_parallel' | 'parallel';
  point?: GeometryPoint;
  rms_residual_px?: number;
  max_residual_px?: number;
  residuals_px?: number[];
  condition_determinant: number;
}

export interface CorridorSection {
  axis: GeometryAxis;
  value: number;
  first: GeometryPoint;
  second: GeometryPoint;
  center: GeometryPoint;
  width_px: number;
}

export interface PerspectiveCrossSections {
  near: CorridorSection;
  mid: CorridorSection;
  far: CorridorSection;
}

const EPSILON = 1e-9;

function finitePoint(point: GeometryPoint): GeometryPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error('geometry point coordinates must be finite');
  }
  return { x: point.x, y: point.y };
}

export function lineFromPoints(first: GeometryPoint, second: GeometryPoint): GeometryLine {
  const a = finitePoint(first);
  const b = finitePoint(second);
  if (geometryDistance(a, b) < EPSILON) throw new Error('geometry line requires two distinct finite points');
  return [a, b];
}

export function rayFromPoints(origin: GeometryPoint, through: GeometryPoint): GeometryRay {
  const [a, b] = lineFromPoints(origin, through);
  return { origin: a, through: b };
}

export function geometryDistance(a: GeometryPoint, b: GeometryPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizedLineEquation(line: GeometryLine): NormalizedLineEquation {
  const [p1, p2] = line;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < EPSILON) throw new Error('geometry line requires two distinct finite points');
  const a = dy / length;
  const b = -dx / length;
  return { a, b, c: -(a * p1.x + b * p1.y) };
}

export function pointToLineDistance(point: GeometryPoint, line: GeometryLine): number {
  const eq = normalizedLineEquation(line);
  return Math.abs(eq.a * point.x + eq.b * point.y + eq.c);
}

export function intersectLines(
  first: GeometryLine,
  second: GeometryLine,
  nearParallelThreshold = 1e-3
): LineIntersectionResult {
  const a = normalizedLineEquation(first);
  const b = normalizedLineEquation(second);
  const determinant = a.a * b.b - b.a * a.b;
  const absDet = Math.abs(determinant);
  if (absDet < EPSILON) return { status: 'parallel', determinant };
  const point = {
    x: (a.b * b.c - b.b * a.c) / determinant,
    y: (b.a * a.c - a.a * b.c) / determinant,
  };
  return {
    status: absDet < nearParallelThreshold ? 'near_parallel' : 'intersect',
    point,
    determinant,
  };
}

export function fitLineIntersection(
  lines: GeometryLine[],
  nearParallelThreshold = 1e-4
): LineFamilyFitResult {
  if (lines.length < 2) throw new Error('fitLineIntersection requires at least two lines');
  const equations = lines.map(normalizedLineEquation);
  let aa = 0;
  let ab = 0;
  let bb = 0;
  let ac = 0;
  let bc = 0;
  for (const line of equations) {
    aa += line.a * line.a;
    ab += line.a * line.b;
    bb += line.b * line.b;
    ac += line.a * line.c;
    bc += line.b * line.c;
  }
  const determinant = aa * bb - ab * ab;
  if (Math.abs(determinant) < EPSILON) {
    return { status: 'parallel', condition_determinant: determinant };
  }
  const point = {
    x: (ab * bc - bb * ac) / determinant,
    y: (ab * ac - aa * bc) / determinant,
  };
  const residuals = lines.map(line => pointToLineDistance(point, line));
  const rms = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length);
  return {
    status: Math.abs(determinant) < nearParallelThreshold ? 'near_parallel' : 'fit',
    point,
    rms_residual_px: rms,
    max_residual_px: Math.max(...residuals),
    residuals_px: residuals,
    condition_determinant: determinant,
  };
}

export function pointOnLineAtParameter(line: GeometryLine, parameter: number): GeometryPoint {
  return {
    x: line[0].x + (line[1].x - line[0].x) * parameter,
    y: line[0].y + (line[1].y - line[0].y) * parameter,
  };
}

export function pointOnLineAtX(line: GeometryLine, x: number): GeometryPoint | undefined {
  const dx = line[1].x - line[0].x;
  if (Math.abs(dx) < EPSILON) return undefined;
  return pointOnLineAtParameter(line, (x - line[0].x) / dx);
}

export function pointOnLineAtY(line: GeometryLine, y: number): GeometryPoint | undefined {
  const dy = line[1].y - line[0].y;
  if (Math.abs(dy) < EPSILON) return undefined;
  return pointOnLineAtParameter(line, (y - line[0].y) / dy);
}

export function crossSectionBetweenLines(
  first: GeometryLine,
  second: GeometryLine,
  axis: GeometryAxis,
  value: number
): CorridorSection | undefined {
  const a = axis === 'y' ? pointOnLineAtY(first, value) : pointOnLineAtX(first, value);
  const b = axis === 'y' ? pointOnLineAtY(second, value) : pointOnLineAtX(second, value);
  if (!a || !b) return undefined;
  return {
    axis,
    value,
    first: a,
    second: b,
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    width_px: geometryDistance(a, b),
  };
}

export function perspectiveCrossSections(
  first: GeometryLine,
  second: GeometryLine,
  axis: GeometryAxis,
  nearValue: number,
  farValue: number
): PerspectiveCrossSections | undefined {
  if (!Number.isFinite(nearValue) || !Number.isFinite(farValue) || Math.abs(farValue - nearValue) < EPSILON) {
    return undefined;
  }
  const midValue = nearValue + (farValue - nearValue) * 0.5;
  const near = crossSectionBetweenLines(first, second, axis, nearValue);
  const mid = crossSectionBetweenLines(first, second, axis, midValue);
  const far = crossSectionBetweenLines(first, second, axis, farValue);
  if (!near || !mid || !far) return undefined;
  return { near, mid, far };
}

export function corridorContainsPoint(
  point: GeometryPoint,
  first: GeometryLine,
  second: GeometryLine,
  tolerance = 0
): boolean | undefined {
  const horizontalSection = crossSectionBetweenLines(first, second, 'y', point.y);
  if (horizontalSection && Math.abs(horizontalSection.first.x - horizontalSection.second.x) > EPSILON) {
    return point.x >= Math.min(horizontalSection.first.x, horizontalSection.second.x) - tolerance
      && point.x <= Math.max(horizontalSection.first.x, horizontalSection.second.x) + tolerance;
  }
  const verticalSection = crossSectionBetweenLines(first, second, 'x', point.x);
  if (verticalSection && Math.abs(verticalSection.first.y - verticalSection.second.y) > EPSILON) {
    return point.y >= Math.min(verticalSection.first.y, verticalSection.second.y) - tolerance
      && point.y <= Math.max(verticalSection.first.y, verticalSection.second.y) + tolerance;
  }
  return undefined;
}

export function boundsFromPoints(points: GeometryPoint[]): GeometryBounds {
  if (!points.length) throw new Error('boundsFromPoints requires at least one point');
  return {
    left: Math.min(...points.map(point => point.x)),
    top: Math.min(...points.map(point => point.y)),
    right: Math.max(...points.map(point => point.x)),
    bottom: Math.max(...points.map(point => point.y)),
  };
}

export function pointInBounds(point: GeometryPoint, bounds: GeometryBounds, tolerance = 0): boolean {
  return point.x >= bounds.left - tolerance
    && point.x <= bounds.right + tolerance
    && point.y >= bounds.top - tolerance
    && point.y <= bounds.bottom + tolerance;
}

export function boundsIntersect(a: GeometryBounds, b: GeometryBounds, tolerance = 0): boolean {
  return a.left <= b.right + tolerance
    && a.right >= b.left - tolerance
    && a.top <= b.bottom + tolerance
    && a.bottom >= b.top - tolerance;
}

function orientation(a: GeometryPoint, b: GeometryPoint, c: GeometryPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: GeometryPoint, a: GeometryPoint, b: GeometryPoint, tolerance: number): boolean {
  return Math.abs(orientation(a, b, point)) <= tolerance
    && point.x >= Math.min(a.x, b.x) - tolerance
    && point.x <= Math.max(a.x, b.x) + tolerance
    && point.y >= Math.min(a.y, b.y) - tolerance
    && point.y <= Math.max(a.y, b.y) + tolerance;
}

export function segmentsIntersect(
  first: GeometryLine,
  second: GeometryLine,
  tolerance = 1e-6
): boolean {
  const [a, b] = first;
  const [c, d] = second;
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > tolerance && o2 < -tolerance) || (o1 < -tolerance && o2 > tolerance))
      && ((o3 > tolerance && o4 < -tolerance) || (o3 < -tolerance && o4 > tolerance))) return true;
  return pointOnSegment(c, a, b, tolerance)
    || pointOnSegment(d, a, b, tolerance)
    || pointOnSegment(a, c, d, tolerance)
    || pointOnSegment(b, c, d, tolerance);
}

export function pointInPolygon(point: GeometryPoint, polygon: GeometryPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (pointOnSegment(point, a, b, 1e-6)) return true;
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function polygonsIntersect(first: GeometryPoint[], second: GeometryPoint[]): boolean {
  if (first.length < 3 || second.length < 3) return false;
  if (!boundsIntersect(boundsFromPoints(first), boundsFromPoints(second))) return false;
  for (let i = 0; i < first.length; i += 1) {
    const a: GeometryLine = [first[i], first[(i + 1) % first.length]];
    for (let j = 0; j < second.length; j += 1) {
      const b: GeometryLine = [second[j], second[(j + 1) % second.length]];
      if (segmentsIntersect(a, b)) return true;
    }
  }
  return pointInPolygon(first[0], second) || pointInPolygon(second[0], first);
}

export function fitVanishingFamily(lines: GeometryLine[], nearParallelThreshold = 1e-4): LineFamilyFitResult {
  return fitLineIntersection(lines, nearParallelThreshold);
}
