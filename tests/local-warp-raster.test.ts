import { describe, expect, it } from 'vitest';
import { warpRasterOffline } from '../src/core/local-warp-raster.js';

const width = 32, height = 32;
function fixture() {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    pixels[i] = x * 7; pixels[i + 1] = y * 7;
    pixels[i + 2] = 80; pixels[i + 3] = 255;
  }
  return pixels;
}
const roi = { left: 2, top: 2, right: 30, bottom: 30 };
function field(p: { x: number; y: number }) {
  const dx = 0.9 * Math.sin(Math.PI * (p.x - 2) / 28) ** 2
    * Math.sin(Math.PI * (p.y - 2) / 28) ** 2;
  return { x: p.x + dx, y: p.y };
}

describe('offline warp raster isolation', () => {
  it('preserves identical geometry byte for byte', () => {
    const pixels = fixture();
    const result = warpRasterOffline({ width, height, components: 4, pixels, roi,
      protectedRects: [], maxDisplacementPx: 2, map: p => p });
    expect(result.pixels).toEqual(pixels);
    expect(result.changedPixels).toBe(0);
    expect(result.changedBounds).toBeNull();
  });
  it('changes only interior ROI pixels and preserves source and protected zone', () => {
    const pixels = fixture();
    const protectedRect = { left: 14, top: 14, right: 18, bottom: 18 };
    // Smoothly zero the displacement at protected area to avoid sampling across it.
    const map = (p: { x: number; y: number }) => {
      const d = field(p);
      if (p.y >= 12 && p.y <= 20) return p;
      return d;
    };
    const result = warpRasterOffline({ width, height, components: 4, pixels, roi,
      protectedRects: [protectedRect], maxDisplacementPx: 2, map });
    expect(result.changedPixels).toBeGreaterThan(0);
    expect(result.changedBounds!.left).toBeGreaterThanOrEqual(roi.left);
    expect(result.changedBounds!.right).toBeLessThanOrEqual(roi.right);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (x >= roi.left && x < roi.right && y >= roi.top && y < roi.bottom
        && !(x >= 14 && x < 18 && y >= 14 && y < 18)) continue;
      const i = (y * width + x) * 4;
      expect(result.pixels.subarray(i, i + 4)).toEqual(pixels.subarray(i, i + 4));
    }
    expect(pixels).toEqual(fixture());
  });
  it('rejects dangerous maps and invalid buffer sizes', () => {
    const args = { width, height, components: 4 as const, pixels: fixture(), roi,
      protectedRects: [], maxDisplacementPx: 2 };
    expect(() => warpRasterOffline({ ...args, map: () => ({ x: Infinity, y: 3 }) }))
      .toThrow('local_warp_raster_nonfinite_map');
    expect(() => warpRasterOffline({ ...args, pixels: new Uint8Array(4), map: p => p }))
      .toThrow('local_warp_raster_invalid_contract');
    expect(() => warpRasterOffline({ ...args, map: p => ({ x: p.x + 4, y: p.y }) }))
      .toThrow('local_warp_raster_displacement_exceeded');
  });
});
