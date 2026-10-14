/** Final canvas-pixel topology preflight for filled paths; never repairs authored geometry. */
type Point = { x: number; y: number; left?: [number, number]; right?: [number, number] };
type Segment = { a: Point; b: Point; source: number };
export type FilledContourIssue = { code: string; part_id: string; contour_index: number;
  segments: number[]; message: string };

const EPS = 1e-7;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (x: number, y: number): Point => ({ x, y });
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const between = (a: number, b: number, p: number) => p >= Math.min(a, b) - EPS && p <= Math.max(a, b) + EPS;
const onSegment = (p: Point, a: Point, b: Point) =>
  Math.abs(cross(a, b, p)) <= EPS * Math.max(1, distance(a, b))
  && between(a.x, b.x, p.x) && between(a.y, b.y, p.y);
function intersects(s: Segment, t: Segment): boolean {
  const { a, b } = s, { a: c, b: d } = t;
  if (Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x)
    || Math.max(c.x, d.x) + EPS < Math.min(a.x, b.x)
    || Math.max(a.y, b.y) + EPS < Math.min(c.y, d.y)
    || Math.max(c.y, d.y) + EPS < Math.min(a.y, b.y)) return false;
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  if ((abC > EPS && abD < -EPS || abC < -EPS && abD > EPS)
    && (cdA > EPS && cdB < -EPS || cdA < -EPS && cdB > EPS)) return true;
  return (Math.abs(abC) <= EPS && onSegment(c, a, b))
    || (Math.abs(abD) <= EPS && onSegment(d, a, b))
    || (Math.abs(cdA) <= EPS && onSegment(a, c, d))
    || (Math.abs(cdB) <= EPS && onSegment(b, c, d));
}
function flattened(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  const add = (a: Point, b: Point, source: number) => {
    if (segments.length >= 2048) throw new Error('curve has more than 2048 final segments; reduce curvature or use linear');
    segments.push({ a, b, source });
  };
  const flatten = (a: Point, b: Point, c: Point, d: Point, source: number, depth: number) => {
    const deviation = Math.max(Math.abs(cross(a, d, b)), Math.abs(cross(a, d, c)))
      / Math.max(EPS, distance(a, d));
    // Collinear cubic handles can double back beyond an endpoint. Treating
    // that cubic as one chord would hide real crossings and collapsed loops.
    const dx = d.x - a.x, dy = d.y - a.y, lengthSquared = dx * dx + dy * dy;
    const projection = (p: Point) => lengthSquared > EPS * EPS
      ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared : NaN;
    const bounded = [b, c].every(p => projection(p) >= -EPS && projection(p) <= 1 + EPS);
    if (deviation <= 0.25 && bounded) { add(a, d, source); return; }
    if (depth >= 16) throw new Error('curve cannot be flattened to 0.25px; reduce curvature');
    const ab = point((a.x + b.x) / 2, (a.y + b.y) / 2);
    const bc = point((b.x + c.x) / 2, (b.y + c.y) / 2);
    const cd = point((c.x + d.x) / 2, (c.y + d.y) / 2);
    const abc = point((ab.x + bc.x) / 2, (ab.y + bc.y) / 2);
    const bcd = point((bc.x + cd.x) / 2, (bc.y + cd.y) / 2);
    const mid = point((abc.x + bcd.x) / 2, (abc.y + bcd.y) / 2);
    flatten(a, ab, abc, mid, source, depth + 1);
    flatten(mid, bcd, cd, d, source, depth + 1);
  };
  for (let i = 0; i < points.length; i++) {
    const a = points[i], d = points[(i + 1) % points.length];
    const b = a.right ? point(a.right[0], a.right[1]) : a;
    const c = d.left ? point(d.left[0], d.left[1]) : d;
    if (distance(a, b) <= EPS && distance(c, d) <= EPS) add(a, d, i);
    else flatten(a, b, c, d, i, 0);
  }
  return segments;
}

/** Every ADD/SUBTRACT contour is checked independently; crossings BETWEEN paths remain legal. */
export function filledContourIssues(partId: string, contours: Array<{
  points: Point[]; intersection_policy?: string;
}>): FilledContourIssue[] {
  const issues: FilledContourIssue[] = [];
  contours.forEach((contour, index) => {
    const add = (code: string, segments: number[], correction: string) => issues.push({
      code, part_id: partId, contour_index: index, segments,
      message: `part=${partId} contour[${index}] segments=${segments.join(',')}: ${correction}`,
    });
    const points = contour.points;
    if (!Array.isArray(points) || points.length < 3) return;
    if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)
      || [p.left, p.right].some(v => v !== undefined && (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite))))) {
      add('filled_contour_invalid_point', [], 'Supply finite canvas-pixel points and handles.'); return;
    }
    let segments: Segment[];
    try { segments = flattened(points); }
    catch (error) { add('filled_contour_complexity', [], String(error)); return; }
    const collapsed = [...new Set(segments.filter(s => distance(s.a, s.b) <= EPS).map(s => s.source))];
    if (collapsed.length) add('filled_contour_degenerate_segment', collapsed,
      'Remove zero-length edges or revise coincident control points; do not auto-simplify.');
    const signedArea = segments.reduce((sum, s) => sum + s.a.x * s.b.y - s.b.x * s.a.y, 0) / 2;
    if (contour.intersection_policy !== 'intentional' && Math.abs(signedArea) <= 1e-6) add('filled_contour_degenerate_area', [],
      'Give the closed fill a nonzero enclosed area.');
    for (let i = 0; i < segments.length; i++) {
      const first = segments[i], second = segments[(i + 1) % segments.length];
      if (distance(first.a, second.b) <= EPS && distance(first.a, first.b) > EPS)
        add('filled_contour_backtrack', [first.source, second.source],
          'Remove the zero-area reversal or explicitly redraw these outline segments.');
    }
    if (contour.intersection_policy === 'intentional') return;
    const seen = new Set<string>();
    for (let a = 0; a < segments.length; a++) for (let b = a + 1; b < segments.length; b++) {
      if (b === a + 1 || (a === 0 && b === segments.length - 1)) continue;
      const first = segments[a], second = segments[b];
      if (!intersects(first, second)) continue;
      const key = `${Math.min(first.source, second.source)}:${Math.max(first.source, second.source)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add('filled_contour_self_intersection', [first.source, second.source],
        'Revise these nonadjacent outline segments before filling, or explicitly mark intentional path crossings.');
    }
  });
  return issues;
}

export function paintRegionTopologyIssues(regions: unknown): FilledContourIssue[] {
  if (!Array.isArray(regions)) return [];
  return regions.flatMap((value, i) => {
    const region = value as { id?: string; contours?: Array<{ points: Point[]; intersection_policy?: string }> };
    return Array.isArray(region?.contours) ? filledContourIssues(region.id || `region-${i}`, region.contours) : [];
  });
}
