import { describe, expect, it } from 'vitest';
import {
  boundsFromPoints,
  corridorContainsPoint,
  crossSectionBetweenLines,
  fitVanishingFamily,
  intersectLines,
  lineFromPoints,
  perspectiveCrossSections,
  pointInPolygon,
  pointOnLineAtParameter,
  pointOnLineAtX,
  pointToLineDistance,
  polygonsIntersect,
  rayFromPoints,
} from './geometry-math.js';

describe('deterministic geometry helpers', () => {
  it('constructs/interpolates a line deterministically', () => {
    const line = lineFromPoints({ x: 0, y: 0 }, { x: 10, y: 20 });
    expect(pointOnLineAtParameter(line, 0.5)).toEqual({ x: 5, y: 10 });
    expect(pointOnLineAtX(line, 15)).toEqual({ x: 15, y: 30 });
    expect(pointToLineDistance({ x: 5, y: 10 }, line)).toBeCloseTo(0, 8);
    expect(rayFromPoints({ x: 2, y: 3 }, { x: 4, y: 7 })).toEqual({
      origin: { x: 2, y: 3 },
      through: { x: 4, y: 7 },
    });
    expect(() => lineFromPoints({ x: 1, y: 1 }, { x: 1, y: 1 })).toThrow(/distinct/);
    expect(() => rayFromPoints({ x: 0, y: 0 }, { x: Number.NaN, y: 2 })).toThrow(/finite/);
  });

  it('intersects stable lines and marks near-parallel uncertainty', () => {
    const crossing = intersectLines(
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      [{ x: 0, y: 10 }, { x: 10, y: 0 }]
    );
    expect(crossing.status).toBe('intersect');
    expect(crossing.point?.x).toBeCloseTo(5, 8);
    expect(crossing.point?.y).toBeCloseTo(5, 8);
    const nearParallel = intersectLines(
      [{ x: 0, y: 0 }, { x: 1000, y: 1 }],
      [{ x: 0, y: 10 }, { x: 1000, y: 12 }],
      0.01
    );
    expect(nearParallel.status).toBe('near_parallel');
  });

  it('fits a vanishing point from more than two visible line candidates with residual diagnostics', () => {
    const fit = fitVanishingFamily([
      [{ x: 0, y: 100 }, { x: 50, y: 50 }],
      [{ x: 100, y: 100 }, { x: 50, y: 50 }],
      [{ x: 20, y: 100 }, { x: 50, y: 50.5 }],
    ]);
    expect(fit.status).toBe('fit');
    expect(fit.point?.x).toBeCloseTo(50, 0);
    expect(fit.point?.y).toBeCloseTo(50, 0);
    expect(fit.rms_residual_px).toBeLessThan(1);
  });

  it('derives a corridor cross-section and tests point membership', () => {
    const left = [{ x: 0, y: 100 }, { x: 50, y: 0 }] as const;
    const right = [{ x: 100, y: 100 }, { x: 50, y: 0 }] as const;
    const section = crossSectionBetweenLines(left, right, 'y', 50)!;
    expect(section.first.x).toBeCloseTo(25, 8);
    expect(section.second.x).toBeCloseTo(75, 8);
    expect(section.center).toEqual({ x: 50, y: 50 });
    expect(corridorContainsPoint({ x: 50, y: 50 }, left, right)).toBe(true);
    expect(corridorContainsPoint({ x: 90, y: 50 }, left, right)).toBe(false);
    const sections = perspectiveCrossSections(left, right, 'y', 80, 20)!;
    expect(sections.near.value).toBe(80);
    expect(sections.mid.value).toBe(50);
    expect(sections.far.value).toBe(20);
    expect(sections.near.width_px).toBeGreaterThan(sections.mid.width_px);
    expect(sections.mid.width_px).toBeGreaterThan(sections.far.width_px);
  });

  it('computes bounded envelopes and polygon intersection without semantic inference', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const b = [{ x: 8, y: 8 }, { x: 20, y: 8 }, { x: 20, y: 20 }, { x: 8, y: 20 }];
    const c = [{ x: 30, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 40 }, { x: 30, y: 40 }];
    expect(boundsFromPoints(a)).toEqual({ left: 0, top: 0, right: 10, bottom: 10 });
    expect(pointInPolygon({ x: 5, y: 5 }, a)).toBe(true);
    expect(polygonsIntersect(a, b)).toBe(true);
    expect(polygonsIntersect(a, c)).toBe(false);
  });
});
