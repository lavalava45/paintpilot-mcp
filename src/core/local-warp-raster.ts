/** Pure, offline raster proof of a bounded inverse displacement field.
 * This module intentionally has no Photoshop access or execution authority.
 */
export interface RasterRect { left: number; top: number; right: number; bottom: number }
export interface RasterPoint { x: number; y: number }
export interface RasterWarpRequest {
  width: number;
  height: number;
  components: 4;
  pixels: Uint8Array;
  roi: RasterRect;
  protectedRects: readonly RasterRect[];
  maxDisplacementPx: number;
  map: (point: RasterPoint) => RasterPoint;
}
export interface RasterWarpResult {
  pixels: Uint8Array;
  changedPixels: number;
  changedBounds: RasterRect | null;
}

function validRect(r: RasterRect, w: number, h: number): boolean {
  return !!r && [r.left, r.top, r.right, r.bottom].every(Number.isSafeInteger)
    && r.left >= 0 && r.top >= 0 && r.left < r.right && r.top < r.bottom
    && r.right <= w && r.bottom <= h;
}
function contained(x: number, y: number, r: RasterRect): boolean {
  return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
}
function sample(pixels: Uint8Array, width: number, height: number, x: number, y: number, channel: number): number {
  const xx = Math.max(0, Math.min(width - 1, x));
  const yy = Math.max(0, Math.min(height - 1, y));
  return pixels[(yy * width + xx) * 4 + channel]!;
}

/**
 * Inverse sample a forward map. Alpha is interpolated premultiplied to avoid
 * transparent-color fringes. Every destination pixel outside ROI/protection is
 * copied byte-for-byte. A forward image is NEVER written to Photoshop here.
 */
export function warpRasterOffline(req: RasterWarpRequest): RasterWarpResult {
  const { width, height, pixels, roi, protectedRects, map, maxDisplacementPx } = req;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width * height > 16_777_216 || req.components !== 4
    || !(pixels instanceof Uint8Array) || pixels.length !== width * height * 4
    || !validRect(roi, width, height) || !Array.isArray(protectedRects)
    || protectedRects.length > 16 || !protectedRects.every(r => validRect(r, width, height))
    || !Number.isFinite(maxDisplacementPx) || maxDisplacementPx <= 0 || maxDisplacementPx > 64
    || typeof map !== 'function') throw new Error('local_warp_raster_invalid_contract');
  const output = pixels.slice();
  let changedPixels = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = roi.top; y < roi.bottom; y++) for (let x = roi.left; x < roi.right; x++) {
    if (protectedRects.some(rect => contained(x, y, rect))) continue;
    const dest = { x: x + 0.5, y: y + 0.5 };
    let source = dest;
    // Fixed point inversion only for sufficiently gentle displacements.
    for (let n = 0; n < 16; n++) {
      const forward = map(source);
      if (!Number.isFinite(forward?.x) || !Number.isFinite(forward?.y))
        throw new Error('local_warp_raster_nonfinite_map');
      const shift = { x: forward.x - source.x, y: forward.y - source.y };
      if (Math.hypot(shift.x, shift.y) > maxDisplacementPx + 1e-6)
        throw new Error('local_warp_raster_displacement_exceeded');
      source = { x: dest.x - shift.x, y: dest.y - shift.y };
    }
    const forward = map(source);
    if (!Number.isFinite(forward?.x) || !Number.isFinite(forward?.y)
      || Math.hypot(forward.x - dest.x, forward.y - dest.y) > 0.05)
      throw new Error('local_warp_raster_inverse_unstable');
    if (Math.hypot(source.x - dest.x, source.y - dest.y) < 1e-7) continue;
    // A sample outside ROI or in a protected region could import another owner's pixels.
    if (source.x < roi.left + 0.5 || source.x > roi.right - 0.5
      || source.y < roi.top + 0.5 || source.y > roi.bottom - 0.5
      || protectedRects.some(r => contained(source.x - 0.5, source.y - 0.5, r)))
      continue;
    const sx = source.x - 0.5, sy = source.y - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const fx = sx - x0, fy = sy - y0;
    const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    const corners = [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]];
    let alpha = 0;
    const rgb = [0, 0, 0];
    if (corners.some(([cx, cy], i) => weights[i]! > 1e-8
      && (!contained(cx!, cy!, roi) || protectedRects.some(r => contained(cx!, cy!, r))))) continue;
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i]!;
      const a = sample(pixels, width, height, cx!, cy!, 3) / 255;
      alpha += weights[i]! * a;
      for (let c = 0; c < 3; c++) rgb[c] += weights[i]! * a * sample(pixels, width, height, cx!, cy!, c);
    }
    const base = (y * width + x) * 4;
    const values = [alpha ? rgb[0]! / alpha : 0, alpha ? rgb[1]! / alpha : 0, alpha ? rgb[2]! / alpha : 0, alpha * 255];
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const next = Math.max(0, Math.min(255, Math.round(values[c]!)));
      if (next !== pixels[base + c]) changed = true;
      output[base + c] = next;
    }
    if (changed) {
      changedPixels++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return { pixels: output, changedPixels,
    changedBounds: changedPixels ? { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 } : null };
}
