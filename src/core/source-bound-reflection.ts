/** Pixel-space geometry for copying an existing raster owner into a water reflection.
 * This is a deterministic mirror, not an instruction to invent a similar image.
 * Water distortion, masking and tonal treatment belong to separately reviewed passes.
 */
export interface ReflectionBounds { left: number; top: number; right: number; bottom: number }

export interface SourceBoundReflectionGeometry {
  source_bounds: ReflectionBounds;
  reflected_bounds: ReflectionBounds;
  translation: { x: number; y: number };
  waterline_y: number;
}

export function sourceBoundReflectionGeometry(input: {
  source_bounds: ReflectionBounds;
  waterline_y: number;
  horizontal_offset?: number;
  canvas_width: number;
  canvas_height: number;
}): SourceBoundReflectionGeometry {
  const b = input.source_bounds;
  const numbers = [b?.left, b?.top, b?.right, b?.bottom, input.waterline_y,
    input.horizontal_offset ?? 0, input.canvas_width, input.canvas_height];
  if (!numbers.every(value => typeof value === 'number' && Number.isFinite(value))
      || b.right <= b.left || b.bottom <= b.top
      || input.canvas_width <= 0 || input.canvas_height <= 0
      || input.waterline_y <= 0 || input.waterline_y >= input.canvas_height
      || b.left < 0 || b.top < 0 || b.right > input.canvas_width || b.bottom > input.canvas_height
      || b.bottom > input.waterline_y + 1) {
    throw new Error('reflection_geometry_invalid: source must have finite nonempty bounds above the waterline on the canvas');
  }
  const x = input.horizontal_offset ?? 0;
  if (Math.abs(x) > 128) throw new Error('reflection_horizontal_offset_exceeded: maximum 128px');
  // After a vertical flip about the source's own center, move the duplicate
  // until its top equals (2*waterline - source.bottom). The resulting pixel
  // mapping is x' = x + offset, y' = 2*waterline - y.
  const y = 2 * input.waterline_y - b.top - b.bottom;
  const reflected_bounds = {
    left: b.left + x,
    top: b.top + y,
    right: b.right + x,
    bottom: b.bottom + y,
  };
  if (reflected_bounds.left < 0 || reflected_bounds.right > input.canvas_width
      || reflected_bounds.top < input.waterline_y - 1 || reflected_bounds.bottom > input.canvas_height) {
    throw new Error('reflection_target_out_of_canvas: reflected pixels must fit below the waterline; split or crop the source first');
  }
  return { source_bounds: { ...b }, reflected_bounds, translation: { x, y }, waterline_y: input.waterline_y };
}
