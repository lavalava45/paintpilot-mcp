import { describe, expect, it } from 'vitest';
import { sourceBoundReflectionGeometry } from '../src/core/source-bound-reflection.js';

const basis = { source_bounds: { left: 80, top: 40, right: 250, bottom: 300 }, waterline_y: 300,
  canvas_width: 400, canvas_height: 700 };

describe('source-bound water reflection geometry', () => {
  it('mirrors the exact source silhouette across the waterline without creating an invented shape', () => {
    const mirrored = sourceBoundReflectionGeometry(basis);
    expect(mirrored.translation).toEqual({ x: 0, y: 260 });
    expect(mirrored.reflected_bounds).toEqual({ left: 80, top: 300, right: 250, bottom: 560 });
    expect(sourceBoundReflectionGeometry({ ...basis, horizontal_offset: 12 }).reflected_bounds)
      .toEqual({ left: 92, top: 300, right: 262, bottom: 560 });
  });
  it.each([
    { waterline_y: 0 }, { waterline_y: 700 },
    { source_bounds: { left: 80, top: 40, right: 250, bottom: 310 } },
    { source_bounds: { left: 80, top: 40, right: 80, bottom: 300 } },
    { source_bounds: { left: -1, top: 40, right: 250, bottom: 300 } },
    { canvas_height: 400 }, { horizontal_offset: Infinity }, { horizontal_offset: 129 },
  ])('refuses invalid/stale/out-of-canvas geometry before any image mutation', (variant) => {
    expect(() => sourceBoundReflectionGeometry({ ...basis, ...variant })).toThrow();
  });
});
