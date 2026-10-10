import { authoredFormField, FORM_FIELD_SCHEMA, FormFieldError } from './authored-form-field.js';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import jpeg from 'jpeg-js';
import {
  CONTOUR_GEOMETRY,
  compileContourMask,
  insetContourMask,
  contourMaskContains,
  ContourGeometryError,
} from './contour-geometry.js';
import { solveConstruction, type ConstructionModel } from './object-construction.js';
import { strokeExecutionBudget } from '../tools/painting-tools.js';

// Original bounded adaptation of Hertzmann (SIGGRAPH 1998), not a copied implementation.
// Native Photoshop brush rendering is deliberately not claimed to match this planning rasterizer.
type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type Image = { width: number; height: number; data: Uint8Array };
export type PainterlyFrame = {
  path: string;
  sha256: string;
  operation_id: string;
  canvas_width: number;
  canvas_height: number;
};
export class PainterlyError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string
  ) {
    super(message);
  }
}
const fail = (code: string, path: string, message: string): never => {
  throw new PainterlyError(code, path, message);
};
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
function number(value: unknown, fallback: number, min: number, max: number, path: string) {
  if (value === undefined) return fallback;
  if (!finite(value) || value < min || value > max)
    fail('painterly_parameter_invalid', path, `Expected a finite value in [${min},${max}]`);
  return value as number;
}
export function readPainterlyJpeg(
  file: unknown,
  expectedSha?: unknown,
  field = 'painterly.reference'
): Image & { sha256: string } {
  if (
    typeof file !== 'string' ||
    !file ||
    (expectedSha !== undefined &&
      (typeof expectedSha !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedSha))) ||
    (field === 'current_frame' && expectedSha === undefined)
  )
    fail(
      'painterly_image_identity_required',
      field,
      'Provide a materialized JPEG path, never base64 or a URL; explicit SHA-256 must be valid'
    );
  try {
    const stat = statSync(file as string);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024)
      throw new Error('JPEG file must be at most 16 MiB');
    const bytes = readFileSync(file as string);
    if (bytes.length > 16 * 1024 * 1024) throw new Error('JPEG file exceeds byte budget');
    const actualSha = sha(bytes);
    if (expectedSha !== undefined && actualSha !== (expectedSha as string).toLowerCase())
      fail(
        'painterly_image_changed',
        `${field}.sha256`,
        field === 'current_frame'
          ? 'Guard frame bytes changed. Obtain fresh evidence/reconcile through public tools; never rewrite a cached frame SHA.'
          : 'Reference bytes changed; confirm the intended reference or supply its exact current SHA'
      );
    if (bytes[0] !== 255 || bytes[1] !== 216)
      throw new Error('First version accepts JPEG only; export the reference as JPEG');
    const image = jpeg.decode(bytes, {
      useTArray: true,
      maxResolutionInMP: 16,
      maxMemoryUsageInMB: 192,
    });
    if (!image.width || !image.height || image.data.length !== image.width * image.height * 4)
      throw new Error('Invalid JPEG');
    return { ...image, sha256: actualSha };
  } catch (error) {
    if (error instanceof PainterlyError) throw error;
    return fail(
      'painterly_image_unreadable',
      `${field}.path`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
function bounds(value: unknown): Bounds {
  const b = object(value);
  if (
    !['left', 'top', 'right', 'bottom'].every((k) => finite(b[k])) ||
    Number(b.left) < 0 ||
    Number(b.top) < 0 ||
    Number(b.right) <= Number(b.left) ||
    Number(b.bottom) <= Number(b.top)
  )
    fail(
      'painterly_bounds_invalid',
      'painterly.reference_bounds',
      'Supply positive canvas-pixel reference bounds {left,top,right,bottom}'
    );
  return b as Bounds;
}
function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    n = dx * dx + dy * dy;
  const t = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / n)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function inside(p: Point, polygon: Point[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}
export function painterlyClearance(p: Point, polygon: Point[], exclusions: Point[][] = []) {
  return inside(p, polygon) && !exclusions.some((hole) => inside(p, hole))
    ? Math.min(
        ...[polygon, ...exclusions].flatMap((poly) =>
          poly.map((a, i) => pointSegmentDistance(p, a, poly[(i + 1) % poly.length]))
        )
      )
    : -1;
}
function clipContour(value: unknown, b: Bounds, field = 'painterly.clip_contour') {
  if (!Array.isArray(value) || value.length < 3 || value.length > 256)
    fail(
      'painterly_clip_required',
      field,
      'Supply 3..256 ordered polygon points for one component, or its durable construction_ref'
    );
  const contour = value as Point[];
  if (
    contour.some(
      (p) =>
        !p ||
        !finite(p.x) ||
        !finite(p.y) ||
        p.x < b.left ||
        p.x > b.right ||
        p.y < b.top ||
        p.y > b.bottom
    )
  )
    fail('painterly_clip_invalid', field, 'Every point must be finite and inside reference_bounds');
  const area =
    Math.abs(
      contour.reduce((s, p, i) => {
        const q = contour[(i + 1) % contour.length];
        return s + p.x * q.y - q.x * p.y;
      }, 0)
    ) / 2;
  if (area < 1)
    fail('painterly_clip_invalid', field, 'Contour must enclose at least one canvas pixel');
  return contour;
}
function sample(image: Image, x: number, y: number, channel: number) {
  // Bilinear sampling in pixel-center coordinates, avoiding phase shifts between equal-size captures.
  x = Math.max(0, Math.min(image.width - 1, x));
  y = Math.max(0, Math.min(image.height - 1, y));
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    x1 = Math.min(x0 + 1, image.width - 1),
    y1 = Math.min(y0 + 1, image.height - 1),
    tx = x - x0,
    ty = y - y0;
  const at = (a: number, c: number) => image.data[(c * image.width + a) * 4 + channel];
  return (
    (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) +
    (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty
  );
}
function blur(input: Float64Array, w: number, h: number, channels: number, sigma: number) {
  // Three separable running-sum box filters approximate a Gaussian in O(pixels),
  // independent of brush radius. Blur RGB*mask and mask together to prevent color leakage.
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  let low = Math.max(1, Math.floor(ideal));
  if (low % 2 === 0) low--;
  const high = low + 2,
    lowCount = Math.max(
      0,
      Math.min(3, Math.round((12 * sigma * sigma - 3 * low * low - 12 * low - 9) / (-4 * low - 4)))
    );
  let current = input;
  for (let pass = 0; pass < 3; pass++) {
    const radius = ((pass < lowCount ? low : high) - 1) / 2;
    if (!radius) continue;
    for (const horizontal of [true, false]) {
      const out = new Float64Array(input.length),
        lines = horizontal ? h : w,
        count = horizontal ? w : h;
      for (let line = 0; line < lines; line++)
        for (let c = 0; c < channels; c++) {
          const index = (position: number) =>
            (horizontal
              ? line * w + Math.max(0, Math.min(count - 1, position))
              : Math.max(0, Math.min(count - 1, position)) * w + line) *
              channels +
            c;
          let sum = 0;
          for (let k = -radius; k <= radius; k++) sum += current[index(k)];
          for (let position = 0; position < count; position++) {
            out[index(position)] = sum / (2 * radius + 1);
            sum += current[index(position + radius + 1)] - current[index(position - radius)];
          }
        }
      current = out;
    }
  }
  return current;
}
export type PainterlyStroke = {
  tool: 'BRUSH';
  simulate_pressure: false;
  closed: false;
  color: { red: number; green: number; blue: number };
  size: number;
  opacity: number;
  flow: 100;
  points: Point[];
};
export interface PainterlySettings {
  reference_bounds: Bounds;
  clip_contour: Point[];
  clip_exclusions: Point[][];
  brush_radii: number[];
  max_strokes: number;
  max_dimension: number;
  error_threshold: number;
  blur_factor: number;
  curvature: number;
  min_length: number;
  max_length: number;
  opacity: number;
  seed: number;
}
export function normalizePainterly(value: unknown): PainterlySettings {
  const p = object(value),
    b = bounds(p.reference_bounds);
  const radii = p.brush_radii ?? [16, 8, 4];
  if (
    !Array.isArray(radii) ||
    !radii.length ||
    radii.length > 4 ||
    radii.some((r, i) => !finite(r) || r < 0.5 || r > 128 || (i > 0 && r >= radii[i - 1]))
  )
    fail(
      'painterly_radii_invalid',
      'painterly.brush_radii',
      'Choose 1..4 strictly descending radii in canvas pixels [0.5,128]'
    );
  const exclusions = p.clip_exclusions ?? [];
  if (!Array.isArray(exclusions) || exclusions.length > 8)
    fail(
      'painterly_clip_invalid',
      'painterly.clip_exclusions',
      'Supply at most 8 explicit excluded contours, each with 3..256 points'
    );
  const settings = {
    reference_bounds: b,
    clip_contour: clipContour(p.clip_contour, b),
    clip_exclusions: (exclusions as unknown[]).map((hole, i) =>
      clipContour(hole, b, `painterly.clip_exclusions[${i}]`)
    ),
    brush_radii: radii as number[],
    max_strokes: number(p.max_strokes, 24, 1, 32, 'painterly.max_strokes'),
    max_dimension: number(p.max_dimension, 192, 32, 384, 'painterly.max_dimension'),
    error_threshold: number(p.error_threshold, 18, 0, 441.7, 'painterly.error_threshold'),
    blur_factor: number(p.blur_factor, 0.5, 0.1, 1, 'painterly.blur_factor'),
    curvature: number(p.curvature, 0.8, 0, 1, 'painterly.curvature'),
    min_length: number(p.min_length, 2, 1, 12, 'painterly.min_length'),
    max_length: number(p.max_length, 12, 2, 24, 'painterly.max_length'),
    opacity: number(p.opacity, 100, 1, 100, 'painterly.opacity'),
    seed: number(p.seed, 0, 0, 0xffffffff, 'painterly.seed'),
  };
  if (
    !['max_strokes', 'max_dimension', 'min_length', 'max_length', 'seed'].every((k) =>
      Number.isInteger(settings[k as keyof typeof settings])
    ) ||
    settings.min_length > settings.max_length
  )
    fail(
      'painterly_parameter_invalid',
      'painterly',
      'Counts/seed must be integers and min_length <= max_length'
    );
  if (settings.max_strokes < settings.brush_radii.length)
    fail(
      'painterly_budget_invalid',
      'painterly.max_strokes',
      'Reserve at least one stroke per brush radius, or choose fewer radii'
    );
  return settings;
}

export function planPainterlyStrokes(
  source: Image,
  before: Image,
  canvas: { width: number; height: number },
  settings: PainterlySettings
) {
  const b = settings.reference_bounds,
    span = b.right - b.left,
    tall = b.bottom - b.top;
  if (
    !finite(canvas.width) ||
    !finite(canvas.height) ||
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    b.right > canvas.width ||
    b.bottom > canvas.height
  )
    fail(
      'painterly_canvas_mismatch',
      'painterly.reference_bounds',
      'Reference bounds must fit the confirmed current canvas'
    );
  if (
    Math.abs(source.width / source.height / (span / tall) - 1) > 0.01 ||
    Math.abs(before.width / before.height / (canvas.width / canvas.height) - 1) > 0.01
  )
    fail(
      'painterly_registration_mismatch',
      'painterly.reference_bounds',
      'Reference and whole-frame captures must keep their aspect ratios; crop/export aligned JPEGs'
    );
  const exclusions = settings.clip_exclusions ?? [];
  const geometry = <T>(run: () => T): T => {
    try {
      return run();
    } catch (error) {
      if (!(error instanceof ContourGeometryError)) throw error;
      return fail('painterly_clip_geometry_invalid', 'painterly', error.message);
    }
  };
  const clipMask = geometry(() => compileContourMask(settings.clip_contour, exclusions));
  const ratio = Math.min(1, settings.max_dimension / Math.max(source.width, source.height));
  const w = Math.max(2, Math.round(source.width * ratio)),
    h = Math.max(2, Math.round(source.height * ratio)),
    unit = span / w;
  // Scale differences after integer thumbnail rounding stay below one sample; canvas coordinates remain exact.
  const toCanvas = (x: number, y: number): Point => ({
    x: b.left + ((x + 0.5) * span) / w,
    y: b.top + ((y + 0.5) * tall) / h,
  });
  const sourceRgb = new Float64Array(w * h * 3),
    painting = new Float64Array(w * h * 3),
    weighted = new Float64Array(w * h * 4),
    clearance = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        p = toCanvas(x, y),
        d = contourMaskContains(clipMask, p)
          ? painterlyClearance(p, settings.clip_contour, exclusions)
          : -1;
      clearance[i] = d;
      for (let c = 0; c < 3; c++) {
        sourceRgb[i * 3 + c] = sample(
          source,
          ((x + 0.5) * source.width) / w - 0.5,
          ((y + 0.5) * source.height) / h - 0.5,
          c
        );
        painting[i * 3 + c] = sample(
          before,
          (p.x * before.width) / canvas.width - 0.5,
          (p.y * before.height) / canvas.height - 0.5,
          c
        );
        weighted[i * 4 + c] = d >= 0 ? sourceRgb[i * 3 + c] : 0;
      }
      weighted[i * 4 + 3] = d >= 0 ? 1 : 0;
    }
  const difference = (array: Float64Array, i: number, color: number[]) =>
    Math.hypot(...color.map((v, c) => array[i * 3 + c] - v));
  const colorAt = (array: Float64Array, i: number) => Array.from(array.slice(i * 3, i * 3 + 3));
  const meanError = () => {
    let sum = 0,
      n = 0;
    for (let i = 0; i < w * h; i++)
      if (clearance[i] >= 0) {
        sum += difference(painting, i, colorAt(sourceRgb, i));
        n++;
      }
    return n ? sum / n : 0;
  };
  const beforeError = meanError(),
    strokes: PainterlyStroke[] = [],
    levels: Array<Record<string, unknown>> = [];
  let randomState = settings.seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  for (let level = 0; level < settings.brush_radii.length; level++) {
    const radius = settings.brush_radii[level],
      analysisRadius = radius / unit;
    const centerMask = geometry(() => insetContourMask(clipMask, radius + 0.5));
    const blurred = blur(
        weighted,
        w,
        h,
        4,
        Math.max(0.5, Math.min(32, analysisRadius * settings.blur_factor))
      ),
      reference = new Float64Array(w * h * 3);
    for (let i = 0; i < w * h; i++)
      for (let c = 0; c < 3; c++)
        reference[i * 3 + c] =
          blurred[i * 4 + 3] > 1e-9
            ? blurred[i * 4 + c] / blurred[i * 4 + 3]
            : sourceRgb[i * 3 + c];
    const luma = (x: number, y: number) => {
      const i = (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 3;
      return 0.3 * reference[i] + 0.59 * reference[i + 1] + 0.11 * reference[i + 2];
    };
    const gradients = new Float64Array(w * h * 2);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        gradients[i * 2] =
          (luma(x + 1, y - 1) +
            2 * luma(x + 1, y) +
            luma(x + 1, y + 1) -
            luma(x - 1, y - 1) -
            2 * luma(x - 1, y) -
            luma(x - 1, y + 1)) /
          (span / w);
        gradients[i * 2 + 1] =
          (luma(x - 1, y + 1) +
            2 * luma(x, y + 1) +
            luma(x + 1, y + 1) -
            luma(x - 1, y - 1) -
            2 * luma(x, y - 1) -
            luma(x + 1, y - 1)) /
          (tall / h);
      }
    const grid = Math.max(1, Math.round(analysisRadius)),
      candidates: Array<{ i: number; error: number }> = [];
    for (let gy = 0; gy < h; gy += grid)
      for (let gx = 0; gx < w; gx += grid) {
        let sum = 0,
          count = 0,
          best = -1,
          max = 0;
        for (let y = gy; y < Math.min(h, gy + grid); y++)
          for (let x = gx; x < Math.min(w, gx + grid); x++) {
            const i = y * w + x;
            if (
              clearance[i] < radius + Math.max(unit, 0.5) ||
              !contourMaskContains(centerMask, toCanvas(x, y))
            )
              continue;
            const d = difference(painting, i, colorAt(reference, i));
            sum += d;
            count++;
            if (d > max) {
              max = d;
              best = i;
            }
          }
        if (count && sum / count > settings.error_threshold && best >= 0)
          candidates.push({ i: best, error: max });
      }
    // Within each scale prioritise the largest residual, then shuffle selected strokes reproducibly.
    // Reserve budget for finer scales rather than silently starving them behind coarse coverage.
    candidates.sort((a, b) => b.error - a.error || a.i - b.i);
    const quota = Math.floor(
        (settings.max_strokes - strokes.length) / (settings.brush_radii.length - level)
      ),
      chosen: PainterlyStroke[] = [];
    for (const candidate of candidates) {
      if (chosen.length >= quota) break;
      const color = colorAt(reference, candidate.i),
        points: Point[] = [toCanvas(candidate.i % w, Math.floor(candidate.i / w))];
      let x = candidate.i % w,
        y = Math.floor(candidate.i / w),
        previous: [number, number] | undefined;
      for (let step = 0; step < settings.max_length; step++) {
        const i =
          Math.max(0, Math.min(h - 1, Math.round(y))) * w +
          Math.max(0, Math.min(w - 1, Math.round(x)));
        if (
          step >= settings.min_length &&
          difference(reference, i, color) > difference(painting, i, colorAt(reference, i))
        )
          break;
        let dx = -gradients[i * 2 + 1],
          dy = gradients[i * 2],
          norm = Math.hypot(dx, dy);
        if (norm < 1e-6) {
          if (!previous) break;
          [dx, dy] = previous;
        } else {
          dx /= norm;
          dy /= norm;
        }
        if (previous) {
          if (dx * previous[0] + dy * previous[1] < 0) {
            dx = -dx;
            dy = -dy;
          }
          dx = settings.curvature * dx + (1 - settings.curvature) * previous[0];
          dy = settings.curvature * dy + (1 - settings.curvature) * previous[1];
        }
        norm = Math.hypot(dx, dy);
        if (norm < 1e-8) break;
        dx /= norm;
        dy /= norm;
        const nx = x + dx * analysisRadius,
          ny = y + (dy * radius) / (tall / h),
          a = points[points.length - 1],
          q = toCanvas(nx, ny);
        // Check the swept nominal round footprint, not just the centreline endpoints.
        const samples = Math.max(
          1,
          Math.ceil(Math.hypot(q.x - a.x, q.y - a.y) / Math.min(0.5, radius / 4))
        );
        let safe = true;
        for (let s = 1; s <= samples; s++) {
          const t = s / samples;
          const samplePoint = { x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t };
          if (
            !contourMaskContains(centerMask, samplePoint) ||
            painterlyClearance(samplePoint, settings.clip_contour, exclusions) < radius + 0.5
          ) {
            safe = false;
            break;
          }
        }
        if (!safe || nx < 0 || ny < 0 || nx >= w || ny >= h) break;
        points.push(q);
        x = nx;
        y = ny;
        previous = [dx, dy];
      }
      chosen.push({
        tool: 'BRUSH',
        simulate_pressure: false,
        closed: false,
        points,
        color: {
          red: Math.round(color[0]),
          green: Math.round(color[1]),
          blue: Math.round(color[2]),
        },
        size: 2 * radius,
        opacity: settings.opacity,
        flow: 100,
      });
    }
    for (let i = chosen.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
    }
    // Surrogate raster updates only guide smaller scales in this package. Real preview guides the next pass.
    for (const stroke of chosen) {
      const covered = new Set<number>();
      for (let k = 0; k < stroke.points.length; k++) {
        const a = stroke.points[Math.max(0, k - 1)],
          q = stroke.points[k],
          steps = Math.max(
            1,
            Math.ceil(Math.hypot(q.x - a.x, q.y - a.y) / Math.max(unit / 2, 0.25))
          );
        for (let s = 0; s <= steps; s++) {
          const t = s / steps,
            cx = ((a.x + (q.x - a.x) * t - b.left) / span) * w - 0.5,
            cy = ((a.y + (q.y - a.y) * t - b.top) / tall) * h - 0.5;
          for (
            let yy = Math.max(0, Math.floor(cy - analysisRadius));
            yy <= Math.min(h - 1, Math.ceil(cy + analysisRadius));
            yy++
          )
            for (
              let xx = Math.max(0, Math.floor(cx - analysisRadius));
              xx <= Math.min(w - 1, Math.ceil(cx + analysisRadius));
              xx++
            ) {
              const i = yy * w + xx;
              if (
                clearance[i] >= 0 &&
                Math.hypot(((xx - cx) * span) / w, ((yy - cy) * tall) / h) <= radius
              )
                covered.add(i);
            }
        }
      }
      for (const i of covered)
        [stroke.color.red, stroke.color.green, stroke.color.blue].forEach(
          (v, c) =>
            (painting[i * 3 + c] =
              (v * settings.opacity) / 100 + painting[i * 3 + c] * (1 - settings.opacity / 100))
        );
      strokes.push(stroke);
    }
    levels.push({
      radius,
      candidates: candidates.length,
      generated: chosen.length,
      deferred_candidates: Math.max(0, candidates.length - chosen.length),
    });
  }
  return {
    strokes,
    summary: {
      algorithm: 'hertzmann-1998-bounded',
      contour_geometry: CONTOUR_GEOMETRY,
      clip_exclusion_count: exclusions.length,
      analysis_width: w,
      analysis_height: h,
      stroke_count: strokes.length,
      levels,
      simulated_mean_error_before: beforeError,
      simulated_mean_error_after: meanError(),
      native_pixels_verified: false,
      artistic_quality_verified: false,
      next: 'Inspect the real preview, then replan from the latest exact frame. Do not replay these strokes or treat surrogate error as image proof.',
    },
  };
}

export interface PainterlyContext {
  painterly_frame?: PainterlyFrame | null;
  logical_layer_owners?: Array<Record<string, unknown>>;
}
export function expandPainterlyPass(
  raw: Record<string, unknown>,
  context: PainterlyContext,
  resolve: (id: string) => ConstructionModel | null
) {
  if (
    raw.construction !== undefined ||
    raw.restore_anchor_operation_id !== undefined ||
    (Array.isArray(raw.actions) && raw.actions.length)
  )
    fail(
      'painterly_actions_conflict',
      'next_pass.painterly',
      'Do not mix painterly generation with authored actions, construction fill or anchor restore'
    );
  const request = object(raw.painterly),
    ownerId = request.owner_id;
  if (typeof ownerId !== 'string' || !ownerId)
    fail(
      'painterly_owner_required',
      'painterly.owner_id',
      'Choose one existing editable component owner'
    );
  const owners = (context.logical_layer_owners ?? []).filter(
    (o) => o.hypothesis_id === ownerId && o.temporary !== true
  );
  if (
    owners.length !== 1 ||
    !Number.isSafeInteger(owners[0].layer_id) ||
    Number(owners[0].layer_id) <= 0
  )
    fail(
      'painterly_owner_unavailable',
      'painterly.owner_id',
      'Require exactly one durable physical component owner; establish/recover it through Guard first'
    );
  const frame = context.painterly_frame;
  if (!frame)
    fail(
      'painterly_frame_required',
      'painterly',
      'Need a current whole-frame preview from a completed Guard pass; establish the component first'
    );
  let clip = request.clip_contour,
    constructionTarget: Record<string, unknown> | undefined;
  if (request.construction_ref !== undefined) {
    if (clip !== undefined)
      fail(
        'painterly_clip_conflict',
        'painterly.clip_contour',
        'Choose construction_ref or clip_contour'
      );
    const ref = object(request.construction_ref),
      model = typeof ref.model_id === 'string' ? resolve(ref.model_id) : null;
    if (
      !model ||
      ref.part_id !== ownerId ||
      (ref.revision !== undefined && ref.revision !== model.revision)
    )
      fail(
        'painterly_construction_stale',
        'painterly.construction_ref',
        'Use the current durable model revision and a part_id identical to owner_id'
      );
    const solved = solveConstruction(model),
      part = solved.parts.find((p) => p.id === ownerId);
    if (!part)
      fail(
        'painterly_construction_part_unknown',
        'painterly.construction_ref.part_id',
        'Part not present in the current model'
      );
    clip = part!.contour;
    constructionTarget = {
      model_id: model!.model_id,
      revision: model!.revision,
      part_id: ownerId,
      target_sha256: part!.target_sha256,
    };
  }
  const settings = normalizePainterly({ ...request, clip_contour: clip }),
    ref = object(request.reference);
  if ((request.reference !== undefined) === (request.form_field !== undefined))
    fail('painterly_source_choice_required', 'painterly', 'Choose exactly one aligned real JPEG reference OR an explicit authored form_field for painting from the text brief');
  let source: ReturnType<typeof readPainterlyJpeg>;
  let authoredField: Record<string, unknown> | undefined;
  if (request.form_field !== undefined) {
    try {
      const field = authoredFormField(request.form_field, settings.reference_bounds, settings.max_dimension);
      source = field;
      authoredField = field.field;
    } catch (error) {
      if (error instanceof FormFieldError) fail('painterly_form_field_invalid', error.path, error.message);
      throw error;
    }
  } else source = readPainterlyJpeg(ref.path, ref.sha256);
  const before = readPainterlyJpeg(frame!.path, frame!.sha256, 'current_frame');
  const generated = planPainterlyStrokes(
    source,
    before,
    { width: frame!.canvas_width, height: frame!.canvas_height },
    settings
  );
  if (!generated.strokes.length)
    fail(
      'painterly_no_strokes',
      'painterly',
      'No eligible residuals/brush footprints. Inspect actual image; lower the threshold/radii or correct the clip only when artistically justified. This is not completion proof.'
    );
  const originalCount = generated.strokes.length;
  let executionBudget = strokeExecutionBudget({ strokes: generated.strokes });
  while (!executionBudget.allowed && generated.strokes.length > 1) {
    const counts = settings.brush_radii.map(
      (r) => generated.strokes.filter((s) => s.size === 2 * r).length
    );
    const largest = Math.max(...counts),
      level = counts.indexOf(largest),
      size = 2 * settings.brush_radii[level];
    const index = generated.strokes.findIndex((s) => s.size === size);
    generated.strokes.splice(index, 1);
    executionBudget = strokeExecutionBudget({ strokes: generated.strokes });
  }
  if (!executionBudget.allowed)
    fail(
      'painterly_execution_budget',
      'painterly',
      'No generated package fits the existing native stroke budget'
    );
  generated.summary.stroke_count = generated.strokes.length;
  for (const level of generated.summary.levels) {
    level.generated = generated.strokes.filter((s) => s.size === 2 * Number(level.radius)).length;
    level.deferred_candidates = Number(level.candidates) - Number(level.generated);
  }
  const layerId = owners[0].layer_id,
    supplied = object(raw.logical_layer);
  if (
    raw.logical_layer !== undefined &&
    (supplied.hypothesis_id !== ownerId ||
      supplied.decision !== 'continue-logical-layer' ||
      (supplied.layer_id !== undefined && supplied.layer_id !== layerId))
  )
    fail(
      'painterly_owner_conflict',
      'next_pass.logical_layer',
      'Must continue the selected component on its exact physical layer'
    );
  const b = settings.reference_bounds,
    clipBounds = {
      left: Math.min(...settings.clip_contour.map((p) => p.x)),
      top: Math.min(...settings.clip_contour.map((p) => p.y)),
      right: Math.max(...settings.clip_contour.map((p) => p.x)),
      bottom: Math.max(...settings.clip_contour.map((p) => p.y)),
    };
  if (raw.region_bounds !== undefined) {
    const declared = object(raw.region_bounds);
    if (
      !['left', 'top', 'right', 'bottom'].every((k) => finite(declared[k])) ||
      Number(declared.left) > clipBounds.left ||
      Number(declared.top) > clipBounds.top ||
      Number(declared.right) < clipBounds.right ||
      Number(declared.bottom) < clipBounds.bottom
    )
      fail(
        'painterly_region_conflict',
        'next_pass.region_bounds',
        'Declared review/edit bounds must contain the selected component contour. Choose a narrower clip_contour to restrict painting; do not hide marks outside the reviewed region.'
      );
  }
  return {
    pass: {
      ...raw,
      actions: [
        {
          id: 'painterly_strokes',
          tool: 'photoshop_paint_strokes',
          args: {
            document_id: raw.document_id,
            layer_id: layerId,
            batch_mode: 'AUTO',
            strokes: generated.strokes,
          },
        },
      ],
      region_bounds: raw.region_bounds ?? clipBounds,
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: ownerId,
        hypothesis: owners[0].hypothesis ?? `Painterly component ${ownerId}`,
        layer_id: layerId,
        ...(typeof owners[0].expected_independent_rollback === 'boolean'
          ? { expected_independent_rollback: owners[0].expected_independent_rollback }
          : ['low', 'moderate', 'high'].includes(String(owners[0].rollback_value))
            ? { expected_independent_rollback: owners[0].rollback_value !== 'low' }
            : {}),
        ...supplied,
      },
    },
    provenance: {
      ...generated.summary,
      simulated_mean_error_after:
        originalCount === generated.strokes.length
          ? generated.summary.simulated_mean_error_after
          : null,
      native_budget_trimmed: originalCount !== generated.strokes.length,
      native_dispatch_budget: executionBudget,
      owner_id: ownerId,
      layer_id: layerId,
      source_kind: authoredField ? 'authored-form-field' : 'aligned-jpeg-reference',
      ...(authoredField ? { authored_form_field: authoredField, form_field_sha256: source.sha256 }
        : { reference_sha256: source.sha256, reference_path: ref.path }),
      reference_bounds: b,
      before_sha256: frame!.sha256,
      before_operation_id: frame!.operation_id,
      clip_sha256: sha(
        JSON.stringify({ contour: settings.clip_contour, exclusions: settings.clip_exclusions })
      ),
      plan_sha256: sha(JSON.stringify(generated.strokes)),
      settings,
      ...(constructionTarget ? { construction_target: constructionTarget } : {}),
    },
  };
}
const pointSchema = {
  type: 'object',
  properties: { x: { type: 'number', minimum: 0 }, y: { type: 'number', minimum: 0 } },
  required: ['x', 'y'],
  additionalProperties: false,
};
const boundsSchema = {
  type: 'object',
  properties: Object.fromEntries(
    ['left', 'top', 'right', 'bottom'].map((k) => [k, { type: 'number', minimum: 0 }])
  ),
  required: ['left', 'top', 'right', 'bottom'],
  additionalProperties: false,
};
export const PAINTERLY_PASS_SCHEMA = {
  type: 'object',
  description:
    'Bounded form/light BRUSH refinement of ONE existing editable component. Choose one aligned real JPEG reference OR explicit authored form_field. The latter works from a text brief and is not a fabricated reference. Uses current Guard whole-frame JPEG internally. Do not also supply actions/construction; inspect actual pixels.',
  properties: {
    owner_id: { type: 'string', minLength: 1 },
    reference: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Materialized aligned JPEG, <=16 MiB and <=16 MP; no URL/base64',
        },
        sha256: {
          type: 'string',
          pattern: '^[a-fA-F0-9]{64}$',
          description:
            'Optional exact expected SHA; when omitted Guard hashes the bytes it actually decodes. An explicit mismatch is rejected.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    form_field: FORM_FIELD_SCHEMA,
    reference_bounds: { ...boundsSchema, description: 'Aligned reference bounds OR canvas bounds of the authored analytic form/light field.' },
    clip_contour: {
      type: 'array',
      minItems: 3,
      maxItems: 256,
      items: pointSchema,
      description:
        'Ordered polygon of the selected component in canvas pixels; nominal round stroke footprint stays inside. Choose this OR construction_ref.',
    },
    construction_ref: {
      type: 'object',
      properties: {
        model_id: { type: 'string' },
        revision: { type: 'integer', minimum: 1 },
        part_id: { type: 'string', description: 'Must equal owner_id' },
      },
      required: ['model_id', 'part_id'],
      additionalProperties: false,
    },
    clip_exclusions: {
      type: 'array',
      maxItems: 8,
      items: { type: 'array', minItems: 3, maxItems: 256, items: pointSchema },
      description:
        'Optional explicitly protected holes/cutouts inside reference_bounds. Their UNION is subtracted from the component clip; overlap never reopens a hole. Nominal round brush footprint is kept outside them; inspect actual preset fringes in the native preview.',
    },
    brush_radii: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'number', minimum: 0.5, maximum: 128 },
      default: [16, 8, 4],
      description:
        'Strictly descending brush RADII in canvas pixels; Photoshop size is twice radius',
    },
    max_strokes: { type: 'integer', minimum: 1, maximum: 32, default: 24 },
    max_dimension: { type: 'integer', minimum: 32, maximum: 384, default: 192 },
    error_threshold: { type: 'number', minimum: 0, maximum: 441.7, default: 18 },
    blur_factor: { type: 'number', minimum: 0.1, maximum: 1, default: 0.5 },
    curvature: { type: 'number', minimum: 0, maximum: 1, default: 0.8 },
    min_length: {
      type: 'integer',
      minimum: 1,
      maximum: 12,
      default: 2,
      description:
        'Minimum control-point steps before color-error termination; footprint/zero-gradient constraints may stop earlier',
    },
    max_length: { type: 'integer', minimum: 2, maximum: 24, default: 12 },
    opacity: { type: 'number', minimum: 1, maximum: 100, default: 100 },
    seed: { type: 'integer', minimum: 0, maximum: 4294967295, default: 0 },
  },
  required: ['owner_id', 'reference_bounds'],
  additionalProperties: false,
};
