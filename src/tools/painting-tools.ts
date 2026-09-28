import { createHash } from 'node:crypto';
import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  invokeUxpSelectBrushPreset,
  invokeUxpSetBrush,
  invokeUxpSetForegroundColor,
  invokeUxpPaintRegions,
  invokeUxpPaintStrokes,
  invokeUxpPaintDabs,
  invokeUxpPaintStampInstances,
} from '../platform/uxp-bridge-client.js';
import { PhotoshopConnection } from '../platform/connection.js';
import {
  currentStableCommandId,
  currentToolExecutionContext,
} from '../core/execution-context.js';
import { listStampMotifProfiles } from '../core/brush-pack-profile.js';
import {
  atomicFailureFromError,
  atomicSuccess,
} from './atomic-shared.js';

const PAINT_TOOLS = ['BRUSH', 'PENCIL', 'ERASER', 'SMUDGE'] as const;
type PaintTool = (typeof PAINT_TOOLS)[number];

interface PaintPoint {
  x: number;
  y: number;
  left?: [number, number];
  right?: [number, number];
  smooth?: boolean;
}

interface PaintStroke {
  points: PaintPoint[];
  tool: PaintTool;
  simulatePressure: boolean;
  closed: boolean;
  color?: { red: number; green: number; blue: number };
  size?: number;
  opacity?: number;
  flow?: number;
  dynamics?: StrokeDynamics;
}

interface PaintDab {
  x: number;
  y: number;
  color?: { red: number; green: number; blue: number };
  size?: number;
  opacity?: number;
  flow?: number;
}

interface PaintDabGroup {
  color?: { red: number; green: number; blue: number };
  size?: number;
  opacity?: number;
  flow?: number;
  points: Array<{ x: number; y: number }>;
}

interface StampInstance extends Record<string, unknown> {
  instance_id: string;
  x: number;
  y: number;
  size: number;
  angle: number;
  flip_x: boolean;
  flip_y: boolean;
  opacity: number;
  color?: { red: number; green: number; blue: number };
}

type PaintRegionOperation = 'ADD' | 'SUBTRACT';

interface PaintRegionContour {
  operation: PaintRegionOperation;
  points: PaintPoint[];
}

interface PaintRegion {
  id?: string;
  contours: PaintRegionContour[];
  color: { red: number; green: number; blue: number };
  opacity: number;
  layerId?: number;
}

interface PaintClipBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type DynamicsEasing = 'LINEAR' | 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_OUT';

interface StrokeDynamics {
  size?: [number, number];
  opacity?: [number, number];
  flow?: [number, number];
  steps?: number;
  baseSteps: number;
  easing: DynamicsEasing;
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function optionalNumber(
  value: unknown,
  name: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined) return undefined;
  const n = finiteNumber(value, name);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}

function parsePair(value: unknown, name: string): [number, number] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${name} must be [x, y]`);
  }
  return [finiteNumber(value[0], `${name}[0]`), finiteNumber(value[1], `${name}[1]`)];
}

function parseRange(
  value: unknown,
  name: string,
  min: number,
  max: number
): [number, number] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${name} must be [start, end]`);
  }
  const start = finiteNumber(value[0], `${name}[0]`);
  const end = finiteNumber(value[1], `${name}[1]`);
  if (start < min || start > max || end < min || end > max) {
    throw new Error(`${name} values must be between ${min} and ${max}`);
  }
  return [start, end];
}

function parseDynamics(value: unknown, strokeIndex: number): StrokeDynamics | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`strokes[${strokeIndex}].dynamics must be an object`);
  }
  const rec = value as Record<string, unknown>;
  const size = parseRange(rec.size, `strokes[${strokeIndex}].dynamics.size`, 1, 5000);
  const opacity = parseRange(rec.opacity, `strokes[${strokeIndex}].dynamics.opacity`, 0, 100);
  const flow = parseRange(rec.flow, `strokes[${strokeIndex}].dynamics.flow`, 0, 100);
  if (!size && !opacity && !flow) {
    throw new Error(`strokes[${strokeIndex}].dynamics requires size, opacity, or flow`);
  }
  const baseSteps = Math.min(
    40,
    Math.max(
      12,
      size ? Math.ceil(Math.abs(size[1] - size[0]) / 1.5) : 0,
      opacity ? Math.ceil(Math.abs(opacity[1] - opacity[0]) / 4) : 0,
      flow ? Math.ceil(Math.abs(flow[1] - flow[0]) / 4) : 0
    )
  );
  const stepsRaw = rec.steps === undefined
    ? undefined
    : finiteNumber(rec.steps, `strokes[${strokeIndex}].dynamics.steps`);
  if (stepsRaw !== undefined && (!Number.isInteger(stepsRaw) || stepsRaw < 2 || stepsRaw > 64)) {
    throw new Error(`strokes[${strokeIndex}].dynamics.steps must be an integer between 2 and 64`);
  }
  const easingRaw = typeof rec.easing === 'string' ? rec.easing.toUpperCase() : 'LINEAR';
  const allowed: DynamicsEasing[] = ['LINEAR', 'EASE_IN', 'EASE_OUT', 'EASE_IN_OUT'];
  if (!allowed.includes(easingRaw as DynamicsEasing)) {
    throw new Error(`strokes[${strokeIndex}].dynamics.easing must be one of ${allowed.join(', ')}`);
  }
  return {
    size,
    opacity,
    flow,
    steps: stepsRaw,
    baseSteps,
    easing: easingRaw as DynamicsEasing,
  };
}

function parsePoint(value: unknown, strokeIndex: number, pointIndex: number): PaintPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`strokes[${strokeIndex}].points[${pointIndex}] must be an object`);
  }
  const rec = value as Record<string, unknown>;
  return {
    x: finiteNumber(rec.x, `strokes[${strokeIndex}].points[${pointIndex}].x`),
    y: finiteNumber(rec.y, `strokes[${strokeIndex}].points[${pointIndex}].y`),
    left: parsePair(rec.left, `strokes[${strokeIndex}].points[${pointIndex}].left`),
    right: parsePair(rec.right, `strokes[${strokeIndex}].points[${pointIndex}].right`),
    smooth: rec.smooth === true,
  };
}

function parseStroke(value: unknown, index: number): PaintStroke {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`strokes[${index}] must be an object`);
  }
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.points) || rec.points.length < 1) {
    throw new Error(`strokes[${index}].points must contain at least 1 point`);
  }
  if (rec.points.length > 1000) throw new Error(`strokes[${index}] has too many points (max 1000)`);
  const rawTool = typeof rec.tool === 'string' ? rec.tool.toUpperCase() : 'BRUSH';
  if (!PAINT_TOOLS.includes(rawTool as PaintTool)) {
    throw new Error(`strokes[${index}].tool must be one of ${PAINT_TOOLS.join(', ')}`);
  }
  let color: { red: number; green: number; blue: number } | undefined;
  if (rec.color !== undefined) {
    if (!rec.color || typeof rec.color !== 'object' || Array.isArray(rec.color)) {
      throw new Error(`strokes[${index}].color must be an object`);
    }
    const c = rec.color as Record<string, unknown>;
    color = {
      red: finiteNumber(c.red, `strokes[${index}].color.red`),
      green: finiteNumber(c.green, `strokes[${index}].color.green`),
      blue: finiteNumber(c.blue, `strokes[${index}].color.blue`),
    };
    for (const [channel, n] of Object.entries(color)) {
      if (n < 0 || n > 255) throw new Error(`strokes[${index}].color.${channel} must be between 0 and 255`);
    }
  }
  return {
    points: rec.points.map((point, pointIndex) => parsePoint(point, index, pointIndex)),
    tool: rawTool as PaintTool,
    simulatePressure: rec.simulate_pressure === true,
    closed: rec.closed === true,
    color,
    size: optionalNumber(rec.size, `strokes[${index}].size`, 1, 5000),
    opacity: optionalNumber(rec.opacity, `strokes[${index}].opacity`, 0, 100),
    flow: optionalNumber(rec.flow, `strokes[${index}].flow`, 0, 100),
    dynamics: parseDynamics(rec.dynamics, index),
  };
}

function optionalPositiveLayerId(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = finiteNumber(value, name);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

function parseDab(value: unknown, index: number): PaintDab {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`dabs[${index}] must be an object`);
  }
  const rec = value as Record<string, unknown>;
  let color: { red: number; green: number; blue: number } | undefined;
  if (rec.color !== undefined) {
    if (!rec.color || typeof rec.color !== 'object' || Array.isArray(rec.color)) {
      throw new Error(`dabs[${index}].color must be an object`);
    }
    const c = rec.color as Record<string, unknown>;
    color = {
      red: finiteNumber(c.red, `dabs[${index}].color.red`),
      green: finiteNumber(c.green, `dabs[${index}].color.green`),
      blue: finiteNumber(c.blue, `dabs[${index}].color.blue`),
    };
    for (const [channel, n] of Object.entries(color)) {
      if (n < 0 || n > 255) throw new Error(`dabs[${index}].color.${channel} must be between 0 and 255`);
    }
  }
  return {
    x: finiteNumber(rec.x, `dabs[${index}].x`),
    y: finiteNumber(rec.y, `dabs[${index}].y`),
    color,
    size: optionalNumber(rec.size, `dabs[${index}].size`, 1, 5000),
    opacity: optionalNumber(rec.opacity, `dabs[${index}].opacity`, 0, 100),
    flow: optionalNumber(rec.flow, `dabs[${index}].flow`, 0, 100),
  };
}

function validateStrokeMechanismReadiness(strokes: PaintStroke[]): void {
  for (let index = 0; index < strokes.length; index++) {
    const stroke = strokes[index]!;
    if (stroke.tool === 'BRUSH') continue;

    const requestedStyleOverrides = [
      stroke.size !== undefined ? 'size' : null,
      stroke.opacity !== undefined ? 'opacity' : null,
      stroke.flow !== undefined ? 'flow' : null,
      stroke.dynamics !== undefined ? 'dynamics' : null,
    ].filter((value): value is string => value !== null);
    if (requestedStyleOverrides.length) {
      throw new Error(
        `paint_tool_not_ready:${stroke.tool}: per-stroke ${requestedStyleOverrides.join(', ')} ` +
        `overrides are not proven for this UXP stroke mechanism; use the mechanism's current Photoshop tool settings ` +
        `or choose BRUSH for explicit size/opacity/flow control`
      );
    }
    if ((stroke.tool === 'SMUDGE' || stroke.tool === 'ERASER') && stroke.color) {
      throw new Error(
        `paint_tool_not_ready:${stroke.tool}: foreground color is not a meaningful supported override for this UXP stroke mechanism`
      );
    }
  }
}

function parseStampInstance(value: unknown, index: number): StampInstance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`instances[${index}] must be an object`);
  }
  const rec = value as Record<string, unknown>;
  const instanceId = typeof rec.instance_id === 'string' ? rec.instance_id.trim() : '';
  if (!instanceId) throw new Error(`instances[${index}].instance_id is required`);
  let color: { red: number; green: number; blue: number } | undefined;
  if (rec.color !== undefined) {
    if (!rec.color || typeof rec.color !== 'object' || Array.isArray(rec.color)) {
      throw new Error(`instances[${index}].color must be an object`);
    }
    const c = rec.color as Record<string, unknown>;
    color = {
      red: finiteNumber(c.red, `instances[${index}].color.red`),
      green: finiteNumber(c.green, `instances[${index}].color.green`),
      blue: finiteNumber(c.blue, `instances[${index}].color.blue`),
    };
    for (const [channel, n] of Object.entries(color)) {
      if (n < 0 || n > 255) throw new Error(`instances[${index}].color.${channel} must be between 0 and 255`);
    }
  }
  return {
    instance_id: instanceId,
    x: finiteNumber(rec.x, `instances[${index}].x`),
    y: finiteNumber(rec.y, `instances[${index}].y`),
    size: optionalNumber(rec.size, `instances[${index}].size`, 1, 5000) ?? 1,
    angle: optionalNumber(rec.angle, `instances[${index}].angle`, -180, 180) ?? 0,
    flip_x: rec.flip_x === true,
    flip_y: rec.flip_y === true,
    opacity: optionalNumber(rec.opacity, `instances[${index}].opacity`, 0, 100) ?? 100,
    color,
  };
}

function parseRegionPoint(value: unknown, regionIndex: number, contourIndex: number, pointIndex: number): PaintPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`regions[${regionIndex}].contours[${contourIndex}].points[${pointIndex}] must be an object`);
  }
  const rec = value as Record<string, unknown>;
  const prefix = `regions[${regionIndex}].contours[${contourIndex}].points[${pointIndex}]`;
  return {
    x: finiteNumber(rec.x, `${prefix}.x`),
    y: finiteNumber(rec.y, `${prefix}.y`),
    left: parsePair(rec.left, `${prefix}.left`),
    right: parsePair(rec.right, `${prefix}.right`),
    smooth: rec.smooth === true,
  };
}

function parseRegion(value: unknown, regionIndex: number): PaintRegion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`regions[${regionIndex}] must be an object`);
  }
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.contours) || rec.contours.length < 1 || rec.contours.length > 16) {
    throw new Error(`regions[${regionIndex}].contours must contain 1-16 closed contours`);
  }
  const contours = rec.contours.map((rawContour, contourIndex): PaintRegionContour => {
    if (!rawContour || typeof rawContour !== 'object' || Array.isArray(rawContour)) {
      throw new Error(`regions[${regionIndex}].contours[${contourIndex}] must be an object`);
    }
    const contour = rawContour as Record<string, unknown>;
    const operationRaw = typeof contour.operation === 'string' ? contour.operation.toUpperCase() : 'ADD';
    if (operationRaw !== 'ADD' && operationRaw !== 'SUBTRACT') {
      throw new Error(`regions[${regionIndex}].contours[${contourIndex}].operation must be ADD or SUBTRACT`);
    }
    if (!Array.isArray(contour.points) || contour.points.length < 3 || contour.points.length > 500) {
      throw new Error(`regions[${regionIndex}].contours[${contourIndex}].points must contain 3-500 points`);
    }
    return {
      operation: operationRaw,
      points: contour.points.map((point, pointIndex) =>
        parseRegionPoint(point, regionIndex, contourIndex, pointIndex)
      ),
    };
  });
  if (contours[0].operation !== 'ADD') {
    throw new Error(`regions[${regionIndex}] first contour must use operation=ADD`);
  }

  if (!rec.color || typeof rec.color !== 'object' || Array.isArray(rec.color)) {
    throw new Error(`regions[${regionIndex}].color is required`);
  }
  const rawColor = rec.color as Record<string, unknown>;
  const color = {
    red: finiteNumber(rawColor.red, `regions[${regionIndex}].color.red`),
    green: finiteNumber(rawColor.green, `regions[${regionIndex}].color.green`),
    blue: finiteNumber(rawColor.blue, `regions[${regionIndex}].color.blue`),
  };
  for (const [channel, n] of Object.entries(color)) {
    if (n < 0 || n > 255) throw new Error(`regions[${regionIndex}].color.${channel} must be between 0 and 255`);
  }

  const opacity = optionalNumber(rec.opacity, `regions[${regionIndex}].opacity`, 0, 100) ?? 100;
  let layerId: number | undefined;
  if (rec.layer_id !== undefined) {
    const value = finiteNumber(rec.layer_id, `regions[${regionIndex}].layer_id`);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`regions[${regionIndex}].layer_id must be a positive integer`);
    }
    layerId = value;
  }
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : undefined;
  return { id, contours, color, opacity, layerId };
}

function parseClipBounds(value: unknown): PaintClipBounds | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('clip_bounds must be an object');
  }
  const rec = value as Record<string, unknown>;
  const bounds = {
    left: finiteNumber(rec.left, 'clip_bounds.left'),
    top: finiteNumber(rec.top, 'clip_bounds.top'),
    right: finiteNumber(rec.right, 'clip_bounds.right'),
    bottom: finiteNumber(rec.bottom, 'clip_bounds.bottom'),
  };
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    throw new Error('clip_bounds must have positive width and height');
  }
  return bounds;
}

function paintDabStyleKey(dab: Pick<PaintDab, 'color' | 'size' | 'opacity' | 'flow'>): string {
  return JSON.stringify([
    dab.color?.red ?? null,
    dab.color?.green ?? null,
    dab.color?.blue ?? null,
    dab.size ?? null,
    dab.opacity ?? null,
    dab.flow ?? null,
  ]);
}

/**
 * Collapse only adjacent dabs with identical effective style.
 *
 * Brush marks are order-dependent when they overlap or use opacity/flow/texture.
 * A previous implementation grouped equal styles globally with a Map, which could
 * turn red -> blue -> red into red -> red -> blue and therefore render a different
 * image. Consecutive runs retain the exact caller order while still amortizing the
 * expensive Photoshop path setup for locally compatible marks.
 */
function groupPaintDabs(dabs: PaintDab[]): PaintDabGroup[] {
  const groups: PaintDabGroup[] = [];
  let previousKey: string | undefined;
  let current: PaintDabGroup | undefined;

  for (const dab of dabs) {
    const key = paintDabStyleKey(dab);
    if (!current || key !== previousKey) {
      current = {
        color: dab.color,
        size: dab.size,
        opacity: dab.opacity,
        flow: dab.flow,
        points: [],
      };
      groups.push(current);
      previousKey = key;
    }
    current.points.push({ x: dab.x, y: dab.y });
  }

  return groups;
}

const PAINT_DABS_MAX_POINTS_PER_SCRIPT = 12;

function chunkPaintDabGroups(
  groups: PaintDabGroup[],
  maxPointsPerScript = PAINT_DABS_MAX_POINTS_PER_SCRIPT
): PaintDabGroup[][] {
  const batches: PaintDabGroup[][] = [];
  let currentBatch: PaintDabGroup[] = [];
  let currentPoints = 0;

  const flush = () => {
    if (currentBatch.length === 0) return;
    batches.push(currentBatch);
    currentBatch = [];
    currentPoints = 0;
  };

  for (const group of groups) {
    for (let i = 0; i < group.points.length; i += maxPointsPerScript) {
      const piece: PaintDabGroup = {
        color: group.color,
        size: group.size,
        opacity: group.opacity,
        flow: group.flow,
        points: group.points.slice(i, i + maxPointsPerScript),
      };
      if (currentBatch.length > 0 && currentPoints + piece.points.length > maxPointsPerScript) {
        flush();
      }
      currentBatch.push(piece);
      currentPoints += piece.points.length;
      if (currentPoints >= maxPointsPerScript) flush();
    }
  }
  flush();
  return batches;
}

function paintDabCenterBounds(dabs: PaintDab[]): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(...dabs.map((dab) => dab.x)),
    top: Math.min(...dabs.map((dab) => dab.y)),
    right: Math.max(...dabs.map((dab) => dab.x)),
    bottom: Math.max(...dabs.map((dab) => dab.y)),
  };
}

function ease(t: number, mode: DynamicsEasing): number {
  if (mode === 'EASE_IN') return t * t;
  if (mode === 'EASE_OUT') return 1 - (1 - t) * (1 - t);
  if (mode === 'EASE_IN_OUT') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cubicPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const uuu = uu * u;
  const ttt = tt * t;
  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ];
}

function denseStrokePath(stroke: PaintStroke, targetSamples: number): [number, number][] {
  if (stroke.points.length === 1) return [[stroke.points[0].x, stroke.points[0].y]];

  const dense: [number, number][] = [];
  const segmentSamples = Math.max(
    12,
    Math.ceil(targetSamples / Math.max(1, stroke.points.length - 1)) * 6
  );
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const a = stroke.points[i];
    const b = stroke.points[i + 1];
    const p0: [number, number] = [a.x, a.y];
    const p1: [number, number] = a.right ?? p0;
    const p3: [number, number] = [b.x, b.y];
    const p2: [number, number] = b.left ?? p3;
    for (let j = 0; j <= segmentSamples; j++) {
      if (i > 0 && j === 0) continue;
      dense.push(cubicPoint(p0, p1, p2, p3, j / segmentSamples));
    }
  }
  return dense;
}

function cumulativePathLengths(points: [number, number][]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    cumulative.push(cumulative[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return cumulative;
}

function sampleStrokePathAtFractions(
  stroke: PaintStroke,
  fractions: number[]
): [number, number][] {
  const dense = denseStrokePath(stroke, Math.max(16, fractions.length * 2));
  const cumulative = cumulativePathLengths(dense);
  const total = cumulative[cumulative.length - 1];
  if (total <= 1e-9) return fractions.map(() => dense[0]);

  const out: [number, number][] = [];
  let cursor = 1;
  for (const fraction of fractions) {
    const target = total * Math.max(0, Math.min(1, fraction));
    while (cursor < cumulative.length - 1 && cumulative[cursor] < target) cursor++;
    const lo = Math.max(0, cursor - 1);
    const hi = cursor;
    const span = cumulative[hi] - cumulative[lo];
    const localT = span <= 1e-9 ? 0 : (target - cumulative[lo]) / span;
    out.push([
      lerp(dense[lo][0], dense[hi][0], localT),
      lerp(dense[lo][1], dense[hi][1], localT),
    ]);
  }
  return out;
}

function estimateStrokeLength(stroke: PaintStroke): number {
  const dense = denseStrokePath(stroke, 32);
  const cumulative = cumulativePathLengths(dense);
  return cumulative[cumulative.length - 1] ?? 0;
}

function resolvedDynamicSteps(stroke: PaintStroke, dynamics: StrokeDynamics): number {
  if (dynamics.steps !== undefined) return dynamics.steps;

  let geometrySteps = 12;
  if (dynamics.size) {
    const pathLength = estimateStrokeLength(stroke);
    const minSize = Math.max(1, Math.min(dynamics.size[0], dynamics.size[1]));
    // Keep thin sections dense enough that each path-stroke capsule is short
    // relative to the brush diameter. AUTO caps at 40 to contain Action Manager cost.
    geometrySteps = Math.ceil(pathLength / Math.max(2.5, minSize * 0.85));
  }
  return Math.min(40, Math.max(dynamics.baseSteps, geometrySteps));
}

function dynamicSampleFractions(dynamics: StrokeDynamics, steps: number): number[] {
  if (!dynamics.size || Math.abs(dynamics.size[1] - dynamics.size[0]) < 1e-9) {
    return Array.from({ length: steps + 1 }, (_, i) => i / steps);
  }

  // Allocate more render segments to the thin portion of a taper. Equal-length
  // segmentation looks acceptable at the thick end but produces visible capsules
  // at the thin end. Density biased by inverse square-root diameter keeps the thin end denser
  // without starving the thick portion of segments.
  const resolution = Math.max(256, steps * 8);
  const cumulativeDensity = [0];
  for (let i = 1; i <= resolution; i++) {
    const a = (i - 1) / resolution;
    const b = i / resolution;
    const ta = ease(a, dynamics.easing);
    const tb = ease(b, dynamics.easing);
    const sizeA = lerp(dynamics.size[0], dynamics.size[1], ta);
    const sizeB = lerp(dynamics.size[0], dynamics.size[1], tb);
    const densityA = 1 / Math.sqrt(Math.max(1, sizeA));
    const densityB = 1 / Math.sqrt(Math.max(1, sizeB));
    cumulativeDensity.push(
      cumulativeDensity[i - 1] + ((densityA + densityB) * 0.5) / resolution
    );
  }

  const totalDensity = cumulativeDensity[cumulativeDensity.length - 1];
  const fractions: number[] = [];
  let cursor = 1;
  for (let s = 0; s <= steps; s++) {
    const target = (totalDensity * s) / steps;
    while (cursor < cumulativeDensity.length - 1 && cumulativeDensity[cursor] < target) cursor++;
    const lo = Math.max(0, cursor - 1);
    const hi = cursor;
    const span = cumulativeDensity[hi] - cumulativeDensity[lo];
    const localT = span <= 1e-12 ? 0 : (target - cumulativeDensity[lo]) / span;
    fractions.push((lo + localT) / resolution);
  }
  fractions[0] = 0;
  fractions[fractions.length - 1] = 1;
  return fractions;
}

function expandDynamicStroke(stroke: PaintStroke): PaintStroke[] {
  if (!stroke.dynamics) return [{ ...stroke, dynamics: undefined }];
  if (stroke.closed) throw new Error('dynamics is not supported for closed strokes');
  if (stroke.points.length < 2) throw new Error('dynamics requires at least 2 stroke points');

  const { dynamics } = stroke;
  const steps = resolvedDynamicSteps(stroke, dynamics);
  const fractions = dynamicSampleFractions(dynamics, steps);
  const sampled = sampleStrokePathAtFractions(stroke, fractions);
  const segments: PaintStroke[] = [];
  for (let i = 0; i < steps; i++) {
    const midpoint = (fractions[i] + fractions[i + 1]) * 0.5;
    const t = ease(midpoint, dynamics.easing);
    segments.push({
      points: [
        { x: sampled[i][0], y: sampled[i][1] },
        { x: sampled[i + 1][0], y: sampled[i + 1][1] },
      ],
      tool: stroke.tool,
      simulatePressure: false,
      closed: false,
      color: stroke.color,
      size: dynamics.size ? lerp(dynamics.size[0], dynamics.size[1], t) : stroke.size,
      opacity: dynamics.opacity ? lerp(dynamics.opacity[0], dynamics.opacity[1], t) : stroke.opacity,
      flow: dynamics.flow ? lerp(dynamics.flow[0], dynamics.flow[1], t) : stroke.flow,
    });
  }
  return segments;
}

function paintStrokeCost(stroke: PaintStroke): number {
  let cost = 1;
  if (stroke.color) cost += 0.5;
  if (stroke.size !== undefined || stroke.opacity !== undefined || stroke.flow !== undefined) cost += 4;
  if (stroke.points.length > 8) cost += Math.min(4, stroke.points.length / 16);
  return cost;
}

function chunkPaintStrokes(strokes: PaintStroke[], maxCost = 24): PaintStroke[][] {
  const batches: PaintStroke[][] = [];
  let current: PaintStroke[] = [];
  let cost = 0;
  for (const stroke of strokes) {
    const nextCost = paintStrokeCost(stroke);
    if (current.length > 0 && cost + nextCost > maxCost) {
      batches.push(current);
      current = [];
      cost = 0;
    }
    current.push(stroke);
    cost += nextCost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function createPaintingTools(
  connection: PhotoshopConnection,
  backendRouter = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_list_brush_presets',
        description:
          'List installed Photoshop brush presets. Supports optional case-insensitive filtering and a result limit.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Optional case-insensitive substring filter' },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 1000,
              default: 200,
              description: 'Maximum number of preset names to return',
            },
          },
        },
      },
      handler: async (args) => listBrushPresets(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_select_brush_preset',
        description:
          'Select an installed Photoshop brush preset by exact name. Returns the selected preset and current brush settings.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Exact Photoshop brush preset name' },
          },
          required: ['name'],
        },
      },
      handler: async (args) => selectBrushPreset(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_get_brush_settings',
        description:
          'Read active Photoshop paint-brush settings used for digital painting, including geometry, opacity/flow, pressure overrides, airbrush and smoothing.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async () => getBrushSettings(backendRouter),
    },
    {
      tool: {
        name: 'photoshop_set_brush',
        description:
          'Configure the active Photoshop Brush Tool for digital painting. Unspecified fields preserve their current values.',
        inputSchema: {
          type: 'object',
          properties: {
            size: {
              type: 'number',
              minimum: 1,
              maximum: 5000,
              description: 'Brush diameter in pixels',
            },
            hardness: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Brush hardness percent',
            },
            opacity: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Brush opacity percent',
            },
            flow: { type: 'number', minimum: 0, maximum: 100, description: 'Brush flow percent' },
            spacing: {
              type: 'number',
              minimum: 1,
              maximum: 1000,
              description: 'Brush spacing percent',
            },
            angle: {
              type: 'number',
              minimum: -180,
              maximum: 180,
              description: 'Brush tip angle in degrees',
            },
            roundness: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              description: 'Brush tip roundness percent',
            },
            flip_x: { type: 'boolean', description: 'Flip brush tip horizontally' },
            flip_y: { type: 'boolean', description: 'Flip brush tip vertically' },
            use_pressure_size: {
              type: 'boolean',
              description: 'Enable Photoshop pressure override for brush size',
            },
            use_pressure_opacity: {
              type: 'boolean',
              description: 'Enable Photoshop pressure override for brush opacity',
            },
            airbrush: {
              type: 'boolean',
              description: 'Enable Photoshop airbrush/repeat behavior',
            },
            smoothing_enabled: {
              type: 'boolean',
              description: 'Enable Photoshop brush smoothing',
            },
            smoothing: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Photoshop brush smoothing amount',
            },
          },
        },
      },
      handler: async (args) => setBrush(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_set_foreground_color',
        description: 'Set Photoshop foreground color for subsequent paint strokes.',
        inputSchema: {
          type: 'object',
          properties: {
            red: { type: 'number', minimum: 0, maximum: 255 },
            green: { type: 'number', minimum: 0, maximum: 255 },
            blue: { type: 'number', minimum: 0, maximum: 255 },
          },
          required: ['red', 'green', 'blue'],
        },
      },
      handler: async (args) => setForegroundColor(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_paint_strokes',
        description:
          'Paint one or many raster strokes on the active layer using Photoshop path stroking. BRUSH supports optional Bezier handles, closed paths, simulated pressure, per-stroke color/size/opacity/flow overrides and interpolated dynamics. PENCIL, SMUDGE and ERASER use their current Photoshop tool settings; explicit size/opacity/flow/dynamics overrides are fail-closed until live-proven for those mechanisms, and SMUDGE/ERASER do not accept color overrides. AUTO batching proactively splits expensive mixed batches into short UXP commands; small batches remain one history step.',
        inputSchema: {
          type: 'object',
          properties: {
            strokes: {
              type: 'array',
              minItems: 1,
              maxItems: 250,
              items: {
                type: 'object',
                properties: {
                  tool: { type: 'string', enum: PAINT_TOOLS, default: 'BRUSH' },
                  simulate_pressure: { type: 'boolean', default: false },
                  closed: { type: 'boolean', default: false },
                  color: {
                    type: 'object',
                    properties: {
                      red: { type: 'number', minimum: 0, maximum: 255 },
                      green: { type: 'number', minimum: 0, maximum: 255 },
                      blue: { type: 'number', minimum: 0, maximum: 255 },
                    },
                    required: ['red', 'green', 'blue'],
                  },
                  size: { type: 'number', minimum: 1, maximum: 5000 },
                  opacity: { type: 'number', minimum: 0, maximum: 100 },
                  flow: { type: 'number', minimum: 0, maximum: 100 },
                  dynamics: {
                    type: 'object',
                    description:
                      'Optional interpolated profile along an open stroke. Ranges are [start, end]. AUTO segmentation follows arc length, increases density for long/thin tapers, and allocates shorter segments where the brush is smaller.',
                    properties: {
                      size: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 2,
                        items: { type: 'number', minimum: 1, maximum: 5000 },
                      },
                      opacity: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 2,
                        items: { type: 'number', minimum: 0, maximum: 100 },
                      },
                      flow: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 2,
                        items: { type: 'number', minimum: 0, maximum: 100 },
                      },
                      steps: {
                        type: 'number',
                        minimum: 2,
                        maximum: 64,
                        description:
                          'Optional rendered segment count. When omitted, AUTO chooses 12–40 steps from dynamics magnitude plus stroke length/local brush size. Explicit values preserve exact segment count.',
                      },
                      easing: {
                        type: 'string',
                        enum: ['LINEAR', 'EASE_IN', 'EASE_OUT', 'EASE_IN_OUT'],
                        default: 'LINEAR',
                      },
                    },
                  },
                  points: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 1000,
                    items: {
                      type: 'object',
                      properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        left: {
                          type: 'array',
                          minItems: 2,
                          maxItems: 2,
                          items: { type: 'number' },
                        },
                        right: {
                          type: 'array',
                          minItems: 2,
                          maxItems: 2,
                          items: { type: 'number' },
                        },
                        smooth: { type: 'boolean', default: false },
                      },
                      required: ['x', 'y'],
                    },
                  },
                },
                required: ['points'],
              },
            },
            batch_mode: {
              type: 'string',
              enum: ['AUTO', 'SINGLE_HISTORY'],
              default: 'AUTO',
              description:
                'AUTO proactively chunks expensive batches for reliability. SINGLE_HISTORY preserves the legacy one-history-step behavior but can time out on large heterogeneous batches.',
            },
            layer_id: {
              type: 'number',
              minimum: 1,
              description:
                'Optional stable target raster layer id. When supplied, painting is pinned to that layer and the previously active layer is restored afterward.',
            },
          },
          required: ['strokes'],
        },
      },
      handler: async (args) => paintStrokes(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_paint_regions',
        description:
          'Fill one or more ordered raster color regions from closed Bezier contours. Intended for fast block-in, silhouettes and large color/value masses before brush modelling. Each region may target a stable layer_id; array order is paint/overlap order. Optional clip_bounds is an executable safety envelope: every anchor and Bezier handle must remain inside it. Coordinates are canvas pixels independent of document DPI.',
        inputSchema: {
          type: 'object',
          properties: {
            regions: {
              type: 'array',
              minItems: 1,
              maxItems: 32,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Optional semantic id for diagnostics/results' },
                  layer_id: {
                    type: 'number',
                    minimum: 1,
                    description: 'Optional stable target raster layer id. Defaults to the layer active when the call starts.',
                  },
                  color: {
                    type: 'object',
                    properties: {
                      red: { type: 'number', minimum: 0, maximum: 255 },
                      green: { type: 'number', minimum: 0, maximum: 255 },
                      blue: { type: 'number', minimum: 0, maximum: 255 },
                    },
                    required: ['red', 'green', 'blue'],
                  },
                  opacity: { type: 'number', minimum: 0, maximum: 100, default: 100 },
                  contours: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 16,
                    description: 'Closed contours. The first must be ADD; later SUBTRACT contours create holes/cutouts.',
                    items: {
                      type: 'object',
                      properties: {
                        operation: { type: 'string', enum: ['ADD', 'SUBTRACT'], default: 'ADD' },
                        points: {
                          type: 'array',
                          minItems: 3,
                          maxItems: 500,
                          items: {
                            type: 'object',
                            properties: {
                              x: { type: 'number' },
                              y: { type: 'number' },
                              left: {
                                type: 'array', minItems: 2, maxItems: 2,
                                items: { type: 'number' },
                              },
                              right: {
                                type: 'array', minItems: 2, maxItems: 2,
                                items: { type: 'number' },
                              },
                              smooth: { type: 'boolean', default: false },
                            },
                            required: ['x', 'y'],
                          },
                        },
                      },
                      required: ['points'],
                    },
                  },
                },
                required: ['color', 'contours'],
              },
            },
            clip_bounds: {
              type: 'object',
              description: 'Optional canvas-pixel safety bounds. All contour anchors and Bezier handles must lie inside.',
              properties: {
                left: { type: 'number' },
                top: { type: 'number' },
                right: { type: 'number' },
                bottom: { type: 'number' },
              },
              required: ['left', 'top', 'right', 'bottom'],
            },
          },
          required: ['regions'],
        },
      },
      handler: async (args) => paintRegions(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_paint_dabs',
        description:
          'Paint many brush dabs/stamps efficiently on the active raster layer. Dabs with identical color/size/opacity/flow are grouped, then internally chunked into small Photoshop multi-subpath strokes for timeout resilience. Intended for stippling, overlapping dab chains, soft tonal buildup, texture, and photorealistic painting passes.',
        inputSchema: {
          type: 'object',
          properties: {
            dabs: {
              type: 'array',
              minItems: 1,
              maxItems: 5000,
              items: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  color: {
                    type: 'object',
                    properties: {
                      red: { type: 'number', minimum: 0, maximum: 255 },
                      green: { type: 'number', minimum: 0, maximum: 255 },
                      blue: { type: 'number', minimum: 0, maximum: 255 },
                    },
                    required: ['red', 'green', 'blue'],
                  },
                  size: { type: 'number', minimum: 1, maximum: 5000 },
                  opacity: { type: 'number', minimum: 0, maximum: 100 },
                  flow: { type: 'number', minimum: 0, maximum: 100 },
                },
                required: ['x', 'y'],
              },
            },
            layer_id: {
              type: 'number',
              minimum: 1,
              description:
                'Optional stable target raster layer id. When supplied, painting is pinned to that layer and the previously active layer is restored afterward.',
            },
          },
          required: ['dabs'],
        },
      },
      handler: async (args) => paintDabs(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_paint_stamp_instances',
        description:
          'Place a bounded heterogeneous set of instances from one evidence-bound stamp profile in one Guard semantic mutation. Supports per-instance size, angle, mirror, opacity and optional color. UXP-only, stable-command/no-replay, pinned to one raster layer. Returns exact completed / failed-or-uncertain / not-started instance identity plus source-document placement bounds. Use through VisualMicroPlan/Guard, not as a raw repeated-call loop.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number', minimum: 1 },
            layer_id: { type: 'number', minimum: 1 },
            brush_pack_id: { type: 'string' },
            stamp_profile_id: { type: 'string' },
            preset_name: { type: 'string' },
            instances: {
              type: 'array', minItems: 1, maxItems: 64,
              items: {
                type: 'object',
                properties: {
                  instance_id: { type: 'string' },
                  x: { type: 'number' }, y: { type: 'number' },
                  size: { type: 'number', minimum: 1, maximum: 5000 },
                  angle: { type: 'number', minimum: -180, maximum: 180, default: 0 },
                  flip_x: { type: 'boolean', default: false },
                  flip_y: { type: 'boolean', default: false },
                  opacity: { type: 'number', minimum: 0, maximum: 100, default: 100 },
                  color: {
                    type: 'object',
                    properties: {
                      red: { type: 'number', minimum: 0, maximum: 255 },
                      green: { type: 'number', minimum: 0, maximum: 255 },
                      blue: { type: 'number', minimum: 0, maximum: 255 },
                    },
                    required: ['red', 'green', 'blue'], additionalProperties: false,
                  },
                },
                required: ['instance_id', 'x', 'y', 'size'], additionalProperties: false,
              },
            },
          },
          required: ['layer_id', 'brush_pack_id', 'stamp_profile_id', 'preset_name', 'instances'],
          additionalProperties: false,
        },
      },
      handler: async (args) => paintStampInstances(backendRouter, args),
    },
  ];
}

async function listBrushPresets(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const query = typeof args.query === 'string' ? args.query : undefined;
    const limitRaw = optionalNumber(args.limit, 'limit', 1, 1000);
    const limit = limitRaw === undefined ? 200 : Math.round(limitRaw);
    const parsed = await backendRouter.listBrushPresets(query ?? '', limit);
    return atomicSuccess('Brush presets listed', {
      total: parsed.total,
      matched: parsed.matched,
      truncated: parsed.truncated,
      presets: parsed.presets,
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function selectBrushPreset(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    if (typeof args.name !== 'string' || args.name.trim().length === 0) {
      throw new Error('name is required');
    }
    const name = args.name.trim();
    await backendRouter.backendFor('brush.presets.select');
    const stableCommandId = currentStableCommandId();
    const result = await invokeUxpSelectBrushPreset(name, stableCommandId);
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'uxp_select_brush_preset_failed');
    }
    const parsed = result.data;
    const effectivePreset = typeof parsed.preset === 'string' ? parsed.preset.trim() : '';
    const setterOutcome = effectivePreset === name ? 'applied' : effectivePreset ? 'not-applied' : 'uncertain';
    return atomicSuccess(
      setterOutcome === 'applied'
        ? `Brush preset selected: ${name}`
        : setterOutcome === 'not-applied'
          ? `Brush preset setter completed but effective preset is ${effectivePreset}`
          : `Brush preset setter outcome is uncertain`,
      {
      setter_outcome: setterOutcome,
      requested_preset: name,
      effective_preset: effectivePreset || null,
      preset: parsed.preset,
      settings: parsed.settings,
      ...(parsed.setter_recovery ? { setter_recovery: parsed.setter_recovery } : {}),
      ...(stableCommandId ? { stable_command_id: stableCommandId } : {}),
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function getBrushSettings(backendRouter: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    const parsed = await backendRouter.readBrushSettings();
    return atomicSuccess('Brush settings read', { settings: parsed.settings });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function setBrush(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const values: Record<string, number | boolean | undefined> = {
      size: optionalNumber(args.size, 'size', 1, 5000),
      hardness: optionalNumber(args.hardness, 'hardness', 0, 100),
      opacity: optionalNumber(args.opacity, 'opacity', 0, 100),
      flow: optionalNumber(args.flow, 'flow', 0, 100),
      spacing: optionalNumber(args.spacing, 'spacing', 1, 1000),
      angle: optionalNumber(args.angle, 'angle', -180, 180),
      roundness: optionalNumber(args.roundness, 'roundness', 1, 100),
      flip_x: typeof args.flip_x === 'boolean' ? args.flip_x : undefined,
      flip_y: typeof args.flip_y === 'boolean' ? args.flip_y : undefined,
      use_pressure_size:
        typeof args.use_pressure_size === 'boolean' ? args.use_pressure_size : undefined,
      use_pressure_opacity:
        typeof args.use_pressure_opacity === 'boolean' ? args.use_pressure_opacity : undefined,
      airbrush: typeof args.airbrush === 'boolean' ? args.airbrush : undefined,
      smoothing_enabled:
        typeof args.smoothing_enabled === 'boolean' ? args.smoothing_enabled : undefined,
      smoothing: optionalNumber(args.smoothing, 'smoothing', 0, 100),
    };
    await backendRouter.backendFor('brush.settings.write');
    const stableCommandId = currentStableCommandId();
    const result = await invokeUxpSetBrush(values, stableCommandId);
    if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_set_brush_failed');
    const parsed = result.data;
    const effective = parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
      ? parsed.settings as Record<string, unknown>
      : {};
    const requested = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined)
    );
    const mismatches = Object.entries(requested).flatMap(([key, expected]) => {
      const actual = effective[key];
      if (typeof expected === 'number' && typeof actual === 'number') {
        return Math.abs(expected - actual) <= 1e-6
          ? []
          : [{ key, expected, actual }];
      }
      return expected === actual ? [] : [{ key, expected, actual }];
    });
    const setterOutcome = mismatches.length === 0 ? 'applied' : 'not-applied';
    return atomicSuccess(
      setterOutcome === 'applied'
        ? 'Brush settings updated and verified'
        : 'Brush settings completed but effective readback does not match every requested field',
      {
        setter_outcome: setterOutcome,
        requested_settings: requested,
        effective_settings: effective,
        mismatches,
        settings: effective,
        ...(parsed.setter_recovery ? { setter_recovery: parsed.setter_recovery } : {}),
        ...(stableCommandId ? { stable_command_id: stableCommandId } : {}),
      }
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function setForegroundColor(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const red = optionalNumber(args.red, 'red', 0, 255);
    const green = optionalNumber(args.green, 'green', 0, 255);
    const blue = optionalNumber(args.blue, 'blue', 0, 255);
    if (red === undefined || green === undefined || blue === undefined)
      throw new Error('red, green and blue are required');
    await backendRouter.backendFor('foreground.write');
    const stableCommandId = currentStableCommandId();
    const result = await invokeUxpSetForegroundColor({ red, green, blue }, stableCommandId);
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'uxp_set_foreground_color_failed');
    }
    return atomicSuccess('Foreground color updated', {
      red,
      green,
      blue,
      ...(stableCommandId ? { stable_command_id: stableCommandId } : {}),
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function paintStrokes(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    if (!Array.isArray(args.strokes) || args.strokes.length === 0)
      throw new Error('strokes must be a non-empty array');
    if (args.strokes.length > 250)
      throw new Error('strokes may contain at most 250 strokes per call');
    const inputStrokes = args.strokes.map((stroke, index) => parseStroke(stroke, index));
    validateStrokeMechanismReadiness(inputStrokes);
    const layerId = optionalPositiveLayerId(args.layer_id, 'layer_id');
    const renderStrokes = inputStrokes.flatMap((stroke) => expandDynamicStroke(stroke));
    if (renderStrokes.length > 1000) {
      throw new Error(`Dynamics expansion produced ${renderStrokes.length} render strokes; maximum is 1000 per call`);
    }

    const rawMode = typeof args.batch_mode === 'string' ? args.batch_mode.toUpperCase() : 'AUTO';
    if (rawMode !== 'AUTO' && rawMode !== 'SINGLE_HISTORY') {
      throw new Error('batch_mode must be AUTO or SINGLE_HISTORY');
    }
    const batches = rawMode === 'SINGLE_HISTORY' ? [renderStrokes] : chunkPaintStrokes(renderStrokes);
    await backendRouter.backendFor('painting.strokes');
    const documentId =
      typeof args.document_id === 'number' &&
      Number.isSafeInteger(args.document_id) &&
      args.document_id > 0
        ? args.document_id
        : undefined;
    let layerName: unknown;
    let coordinateSpace: unknown;
    let documentResolutionDpi: unknown;
    let pathCoordinateScale: unknown;
    let strokeToolReadiness: unknown;
    let completed = 0;
    const stableCommandBase = currentStableCommandId();
    const stableCommandIds: string[] = [];
    for (let i = 0; i < batches.length; i++) {
      try {
        const stableCommandId = stableCommandBase
          ? `${stableCommandBase}:batch:${i}`
          : undefined;
        const result = await invokeUxpPaintStrokes({
          ...(documentId !== undefined ? { document_id: documentId } : {}),
          ...(layerId !== undefined ? { layer_id: layerId } : {}),
          strokes: batches[i],
        }, stableCommandId);
        if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_paint_strokes_failed');
        if (stableCommandId) stableCommandIds.push(stableCommandId);
        const parsed = result.data;
        layerName = parsed.layer_name;
        coordinateSpace = parsed.coordinate_space;
        documentResolutionDpi = parsed.document_resolution_dpi;
        pathCoordinateScale = parsed.path_coordinate_scale;
        if (strokeToolReadiness === undefined && parsed.stroke_tool_readiness !== undefined) {
          strokeToolReadiness = parsed.stroke_tool_readiness;
        }
        completed += batches[i].length;
      } catch (error) {
        throw new Error(
          `Painting batch ${i + 1}/${batches.length} failed after ${completed}/${renderStrokes.length} render strokes completed. ` +
            `Earlier AUTO batches remain applied as separate history steps. ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return atomicSuccess(`Painted ${inputStrokes.length} stroke${inputStrokes.length === 1 ? '' : 's'}`, {
      stroke_count: inputStrokes.length,
      render_stroke_count: renderStrokes.length,
      dynamic_stroke_count: inputStrokes.filter((stroke) => stroke.dynamics !== undefined).length,
      batch_mode: rawMode,
      batch_count: batches.length,
      history_steps: batches.length,
      auto_chunked: rawMode === 'AUTO' && batches.length > 1,
      ...(stableCommandIds.length ? { stable_command_ids: stableCommandIds } : {}),
      layer_name: layerName,
      layer_id: layerId ?? null,
      coordinate_space: coordinateSpace ?? 'canvas_pixels',
      document_resolution_dpi: documentResolutionDpi,
      path_coordinate_scale: pathCoordinateScale,
      ...(strokeToolReadiness === undefined ? {} : { stroke_tool_readiness: strokeToolReadiness }),
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function paintRegions(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    if (!Array.isArray(args.regions) || args.regions.length === 0) {
      throw new Error('regions must be a non-empty array');
    }
    if (args.regions.length > 32) throw new Error('regions may contain at most 32 entries per call');
    const regions = args.regions.map((region, index) => parseRegion(region, index));
    const clipBounds = parseClipBounds(args.clip_bounds);
    const startedAt = Date.now();
    await backendRouter.backendFor('painting.regions');
    const documentId =
      typeof args.document_id === 'number' &&
      Number.isSafeInteger(args.document_id) &&
      args.document_id > 0
        ? args.document_id
        : undefined;
    const stableCommandId = currentStableCommandId();
    const result = await invokeUxpPaintRegions({
      ...(documentId !== undefined ? { document_id: documentId } : {}),
      regions,
      ...(clipBounds ? { clip_bounds: clipBounds } : {}),
    }, stableCommandId);
    if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_paint_regions_failed');
    const parsed = result.data;
    return atomicSuccess(`Painted ${regions.length} region${regions.length === 1 ? '' : 's'}`, {
      region_count: parsed.region_count ?? regions.length,
      painted_regions: parsed.painted_regions ?? [],
      coordinate_space: parsed.coordinate_space ?? 'canvas_pixels',
      document_resolution_dpi: parsed.document_resolution_dpi,
      path_coordinate_scale: parsed.path_coordinate_scale,
      clip_bounds: parsed.clip_bounds ?? clipBounds ?? null,
      ...(stableCommandId ? { stable_command_id: stableCommandId } : {}),
      execution_duration_ms: Date.now() - startedAt,
      history_steps: 1,
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
async function paintDabs(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    if (!Array.isArray(args.dabs) || args.dabs.length === 0) {
      throw new Error('dabs must be a non-empty array');
    }
    if (args.dabs.length > 5000) throw new Error('dabs may contain at most 5000 entries per call');
    const dabs = args.dabs.map((dab, index) => parseDab(dab, index));
    const layerId = optionalPositiveLayerId(args.layer_id, 'layer_id');
    const groups = groupPaintDabs(dabs);
    const batches = chunkPaintDabGroups(groups);
    const uniqueStyleCount = new Set(dabs.map((dab) => paintDabStyleKey(dab))).size;
    const centerBounds = paintDabCenterBounds(dabs);
    await backendRouter.backendFor('painting.dabs');
    const documentId =
      typeof args.document_id === 'number' &&
      Number.isSafeInteger(args.document_id) &&
      args.document_id > 0
        ? args.document_id
        : undefined;
    const batchDurationsMs: number[] = [];
    const startedAt = Date.now();
    let layerName: unknown;
    let coordinateSpace: unknown;
    let documentResolutionDpi: unknown;
    let pathCoordinateScale: unknown;
    let completed = 0;
    const stableCommandBase = currentStableCommandId();
    const stableCommandIds: string[] = [];
    for (let i = 0; i < batches.length; i++) {
      try {
        const batchStartedAt = Date.now();
        const stableCommandId = stableCommandBase
          ? `${stableCommandBase}:batch:${i}`
          : undefined;
        const result = await invokeUxpPaintDabs({
          ...(documentId !== undefined ? { document_id: documentId } : {}),
          ...(layerId !== undefined ? { layer_id: layerId } : {}),
          groups: batches[i],
        }, stableCommandId);
        if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_paint_dabs_failed');
        if (stableCommandId) stableCommandIds.push(stableCommandId);
        const parsed = result.data;
        batchDurationsMs.push(Date.now() - batchStartedAt);
        layerName = parsed.layer_name;
        coordinateSpace = parsed.coordinate_space;
        documentResolutionDpi = parsed.document_resolution_dpi;
        pathCoordinateScale = parsed.path_coordinate_scale;
        completed += batches[i].reduce((sum, group) => sum + group.points.length, 0);
      } catch (error) {
        throw new Error(
          `Paint-dabs batch ${i + 1}/${batches.length} failed after ${completed}/${dabs.length} dabs completed ` +
            `(planned internal batches=${batches.length}, ordered style runs=${groups.length}, unique styles=${uniqueStyleCount}). ` +
            `Earlier batches remain applied as separate history steps. ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return atomicSuccess(`Painted ${dabs.length} dab${dabs.length === 1 ? '' : 's'}`, {
      dab_count: dabs.length,
      group_count: groups.length,
      style_run_count: groups.length,
      unique_style_count: uniqueStyleCount,
      planned_batch_count: batches.length,
      batch_count: batches.length,
      history_steps: batches.length,
      auto_chunked: batches.length > 1,
      ...(stableCommandIds.length ? { stable_command_ids: stableCommandIds } : {}),
      points_per_script_limit: PAINT_DABS_MAX_POINTS_PER_SCRIPT,
      center_bounds: centerBounds,
      execution_duration_ms: Date.now() - startedAt,
      batch_durations_ms: batchDurationsMs,
      layer_name: layerName,
      layer_id: layerId ?? null,
      coordinate_space: coordinateSpace ?? 'canvas_pixels',
      document_resolution_dpi: documentResolutionDpi,
      path_coordinate_scale: pathCoordinateScale,
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function paintStampInstances(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    if (!Array.isArray(args.instances) || args.instances.length === 0) throw new Error('instances must be a non-empty array');
    if (args.instances.length > 64) throw new Error('instances may contain at most 64 entries per semantic placement pass');
    const instances = args.instances.map((row, index) => parseStampInstance(row, index));
    const ids = new Set<string>();
    for (const instance of instances) {
      if (ids.has(instance.instance_id)) throw new Error(`duplicate stamp instance_id: ${instance.instance_id}`);
      ids.add(instance.instance_id);
    }
    const layerId = optionalPositiveLayerId(args.layer_id, 'layer_id');
    if (!layerId) throw new Error('layer_id is required');
    const documentId = optionalPositiveLayerId(args.document_id, 'document_id');
    const brushPackId = typeof args.brush_pack_id === 'string' ? args.brush_pack_id.trim() : '';
    const profileId = typeof args.stamp_profile_id === 'string' ? args.stamp_profile_id.trim() : '';
    const presetName = typeof args.preset_name === 'string' ? args.preset_name.trim() : '';
    if (!brushPackId || !profileId || !presetName) throw new Error('brush_pack_id, stamp_profile_id and preset_name are required');
    const profile = listStampMotifProfiles(brushPackId).find(row => row.profile_id === profileId);
    if (!profile) throw new Error(`stamp_profile_not_found: ${profileId}`);
    if (profile.preset_name !== presetName) {
      throw new Error(`stamp_profile_preset_mismatch: profile=${profile.preset_name} requested=${presetName}`);
    }
    const backend = await backendRouter.backendFor('painting.stamp_instances');
    if (backend.kind !== 'uxp') throw new Error('capability_unavailable: painting.stamp_instances requires UXP');
    const guardOperationId = currentToolExecutionContext()?.guardOperationId;
    if (!guardOperationId) throw new Error('guard_required: stamp-instance placement requires a Guard-owned semantic pass');
    const stableCommandBase = currentStableCommandId() ?? guardOperationId;
    const digest = createHash('sha256').update(JSON.stringify({
      document_id: documentId ?? null,
      layer_id: layerId,
      brush_pack_id: brushPackId,
      stamp_profile_id: profileId,
      preset_name: presetName,
      instances,
    })).digest('hex');
    const stableCommandId = `${stableCommandBase}:stamp:${digest}`;
    const result = await invokeUxpPaintStampInstances({
      ...(documentId ? { document_id: documentId } : {}),
      layer_id: layerId,
      instances,
    }, stableCommandId);
    if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_paint_stamp_instances_failed');
    const data = result.data;
    const completed = Array.isArray(data.completed_instances) ? data.completed_instances : [];
    const failed = data.failed_or_uncertain_instance ?? null;
    const notStarted = Array.isArray(data.not_started_instances) ? data.not_started_instances : [];
    const placementStatus = data.placement_status === 'complete' ? 'complete' : 'partial';
    const details = {
      placement_status: placementStatus,
      brush_pack_id: brushPackId,
      stamp_profile_id: profileId,
      preset_name: presetName,
      layer_id: layerId,
      completed_instances: completed,
      failed_or_uncertain_instance: failed,
      not_started_instances: notStarted,
      motif_instances: completed.map((row: unknown) => {
        const item = row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {};
        return {
          id: item.instance_id,
          category: profile.motif_category ?? 'unclassified',
          stamp_profile_id: profileId,
          region_bounds: item.source_bounds,
        };
      }),
      coordinate_space: data.coordinate_space ?? 'canvas_pixels',
      stable_command_id: stableCommandId,
      receipt_state: result.receipt?.state ?? null,
    };
    if (placementStatus !== 'complete') {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          ok: false,
          code: 'stamp_instance_partial_execution',
          message: 'Stamp placement partially executed. Do not replay this operation; reconcile from the mandatory Guard preview and continue only with not-started instances under a new semantic pass.',
          details,
          suggested_next_tool: 'photoshop_get_preview',
        }, null, 2) }],
        isError: true,
      };
    }
    return atomicSuccess(`Placed ${completed.length} stamp instance${completed.length === 1 ? '' : 's'}`, details);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
