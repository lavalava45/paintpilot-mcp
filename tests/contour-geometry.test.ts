import { expect, it } from 'vitest';
import {
  smoothClosedContour,
  compileContourMask,
  insetContourMask,
  contourMaskContains,
} from '../src/core/contour-geometry.js';
import {
  normalizePainterly,
  planPainterlyStrokes,
  painterlyClearance,
  PAINTERLY_PASS_SCHEMA,
} from '../src/core/painterly-strokes.js';
import { collectSchemaErrors } from '../src/core/guard/cycle-compiler.js';
const rectangle = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
it('preserves the existing closed curve shape with <=0.25-pixel flattening error rather than four samples per segment', () => {
  const anchors = rectangle(0, 0, 500, 250),
    flattened = smoothClosedContour(anchors);
  expect(flattened.length).toBeGreaterThan(16);
  expect(flattened.length).toBeLessThanOrEqual(256);
  for (const anchor of anchors) expect(flattened).toContainEqual(anchor);
  const segmentDistance = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (let i = 0; i < anchors.length; i++)
    for (let j = 0; j <= 100; j++) {
      const p = [anchors[(i + 3) % 4], anchors[i], anchors[(i + 1) % 4], anchors[(i + 2) % 4]],
        t = j / 100;
      const coordinate = (axis: 'x' | 'y') =>
        0.5 *
        (2 * p[1][axis] +
          (-p[0][axis] + p[2][axis]) * t +
          (2 * p[0][axis] - 5 * p[1][axis] + 4 * p[2][axis] - p[3][axis]) * t * t +
          (-p[0][axis] + 3 * p[1][axis] - 3 * p[2][axis] + p[3][axis]) * t * t * t);
      const sample = { x: coordinate('x'), y: coordinate('y') };
      expect(
        Math.min(
          ...flattened.map((a, k) =>
            segmentDistance(sample, a, flattened[(k + 1) % flattened.length])
          )
        )
      ).toBeLessThanOrEqual(0.250001);
    }
});
it('reports a bounded curve failure instead of silently lowering accuracy', () => {
  expect(() => smoothClosedContour(rectangle(0, 0, 1e6, 1e6))).toThrow(/256 points/);
  expect(() => smoothClosedContour([{ x: NaN, y: 0 }, ...rectangle(0, 0, 10, 10)])).toThrow(
    /finite/
  );
});
it('subtracts the union of overlapping exclusions independently of input winding', () => {
  const a = rectangle(20, 20, 40, 40),
    b = rectangle(40, 20, 40, 40).reverse();
  for (const outer of [rectangle(0, 0, 100, 100), rectangle(0, 0, 100, 100).reverse()]) {
    const mask = compileContourMask(outer, [a, b]);
    expect(contourMaskContains(mask, { x: 10, y: 50 })).toBe(true);
    for (const x of [30, 50, 70]) expect(contourMaskContains(mask, { x, y: 50 })).toBe(false);
    expect(contourMaskContains(mask, { x: 110, y: 50 })).toBe(false);
  }
});
it('retains disconnected brush-center islands after a narrow bridge disappears', () => {
  const outer = [
    [0, 0],
    [40, 0],
    [40, 45],
    [60, 45],
    [60, 0],
    [100, 0],
    [100, 100],
    [60, 100],
    [60, 55],
    [40, 55],
    [40, 100],
    [0, 100],
  ].map(([x, y]) => ({ x, y }));
  const mask = insetContourMask(compileContourMask(outer), 6);
  expect(mask.paths).toHaveLength(2);
  expect(contourMaskContains(mask, { x: 20, y: 50 })).toBe(true);
  expect(contourMaskContains(mask, { x: 80, y: 50 })).toBe(true);
  expect(contourMaskContains(mask, { x: 50, y: 50 })).toBe(false);
  expect(insetContourMask(compileContourMask(rectangle(0, 0, 10, 10)), 6).paths).toEqual([]);
});
it('rejects unsafe/oversized mask input without truncating it', () => {
  expect(() => compileContourMask(rectangle(1e8, 0, 10, 10))).toThrow(/10,000,000/);
  expect(() =>
    compileContourMask(
      rectangle(0, 0, 10, 10),
      Array.from({ length: 9 }, () => rectangle(1, 1, 2, 2))
    )
  ).toThrow(/at most 8/);
});
it('uses protected cutouts in the actual bounded painterly plan and exposes their complete public schema', () => {
  const hole = rectangle(22, 18, 22, 28),
    settings = {
      reference_bounds: { left: 0, top: 0, right: 64, bottom: 64 },
      clip_contour: rectangle(0, 0, 64, 64),
      clip_exclusions: [hole],
      brush_radii: [3, 1.5],
      max_strokes: 12,
      max_dimension: 64,
      error_threshold: 10,
    };
  expect(
    collectSchemaErrors(
      { owner_id: 'cloth', reference: { path: 'reference.jpg' }, ...settings },
      PAINTERLY_PASS_SCHEMA
    )
  ).toEqual([]);
  const image = (color: number[]) => ({
    width: 64,
    height: 64,
    data: new Uint8Array(Array.from({ length: 64 * 64 }, () => [...color, 255]).flat()),
  });
  const result = planPainterlyStrokes(
    image([40, 60, 100]),
    image([240, 240, 240]),
    { width: 64, height: 64 },
    normalizePainterly(settings)
  );
  expect(result.strokes.length).toBeGreaterThan(0);
  expect(result.summary.clip_exclusion_count).toBe(1);
  for (const stroke of result.strokes)
    for (let i = 0; i < stroke.points.length; i++) {
      const a = stroke.points[Math.max(0, i - 1)],
        b = stroke.points[i];
      for (let k = 0; k <= 20; k++)
        expect(
          painterlyClearance(
            { x: a.x + ((b.x - a.x) * k) / 20, y: a.y + ((b.y - a.y) * k) / 20 },
            settings.clip_contour,
            [hole]
          )
        ).toBeGreaterThanOrEqual(stroke.size / 2);
    }
  expect(() =>
    normalizePainterly({ ...settings, clip_exclusions: [[...hole, { x: Infinity, y: 3 }]] })
  ).toThrow(/finite/);
});
