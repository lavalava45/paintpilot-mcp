import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import {
  boundsFromPoints,
  corridorContainsPoint,
  crossSectionBetweenLines,
  fitLineIntersection,
  fitVanishingFamily,
  intersectLines,
  normalizedLineEquation,
  pointOnLineAtParameter,
  pointOnLineAtX,
  pointOnLineAtY,
  pointToLineDistance,
  polygonsIntersect,
  type GeometryAxis,
  type GeometryLine,
} from '../core/geometry-math.js';
import type { GeometryPoint } from '../core/scene-geometry-model.js';

type GuideOrientation = 'HORIZONTAL' | 'VERTICAL';

interface MeasurementPoint {
  name: string;
  x: number;
  y: number;
}

interface DistanceRequest {
  name: string;
  from: string;
  to: string;
}

interface RatioRequest {
  name: string;
  numerator: string;
  denominator: string;
}

interface GuideRequest {
  orientation: GuideOrientation;
  position: number;
}

interface LandmarkFrame {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface GeometrySourceFrame {
  document_id: number;
  document_incarnation: string;
  width: number;
  height: number;
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function geometryPoint(value: unknown, path: string): GeometryPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const point = value as Record<string, unknown>;
  return { x: finiteNumber(point.x, `${path}.x`), y: finiteNumber(point.y, `${path}.y`) };
}

function geometryLines(value: unknown, minimum = 1): Array<{ id: string; line: GeometryLine }> {
  if (!Array.isArray(value) || value.length < minimum || value.length > 32) {
    throw new Error(`lines must contain ${minimum}-32 entries`);
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`lines[${index}] must be an object`);
    const record = entry as Record<string, unknown>;
    const rawPoints = record.points;
    if (!Array.isArray(rawPoints) || rawPoints.length !== 2) throw new Error(`lines[${index}].points must contain exactly two points`);
    return {
      id: record.id === undefined ? `line_${index + 1}` : nonEmptyString(record.id, `lines[${index}].id`),
      line: [geometryPoint(rawPoints[0], `lines[${index}].points[0]`), geometryPoint(rawPoints[1], `lines[${index}].points[1]`)],
    };
  });
}

function geometryPolygon(value: unknown, path: string): GeometryPoint[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 200) throw new Error(`${path} must contain 3-200 points`);
  return value.map((point, index) => geometryPoint(point, `${path}[${index}]`));
}

function geometrySourceFrame(value: unknown): GeometrySourceFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('source_frame must be an object');
  const frame = value as Record<string, unknown>;
  const documentId = finiteNumber(frame.document_id, 'source_frame.document_id');
  const width = finiteNumber(frame.width, 'source_frame.width');
  const height = finiteNumber(frame.height, 'source_frame.height');
  if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('source_frame.document_id must be a positive integer');
  if (!(width > 0) || !(height > 0)) throw new Error('source_frame width/height must be > 0');
  return {
    document_id: documentId,
    document_incarnation: nonEmptyString(frame.document_incarnation, 'source_frame.document_incarnation'),
    width,
    height,
  };
}

export async function calculateGeometry(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const operation = nonEmptyString(args.operation, 'operation');
    const sourceFrame = geometrySourceFrame(args.source_frame);
    const threshold = args.near_parallel_threshold === undefined
      ? undefined
      : finiteNumber(args.near_parallel_threshold, 'near_parallel_threshold');
    const tolerance = args.tolerance_px === undefined ? 0 : finiteNumber(args.tolerance_px, 'tolerance_px');
    if (tolerance < 0) throw new Error('tolerance_px must be >= 0');
    const provenance = { source_frame: sourceFrame, coordinate_space: 'source_document_pixels', semantic_detection: false };

    if (operation === 'line_equation') {
      const lines = geometryLines(args.lines, 1);
      if (lines.length !== 1) throw new Error('line_equation requires exactly one line');
      const [start, end] = lines[0].line;
      return atomicSuccess('Deterministic line/ray geometry calculated', {
        ...provenance,
        line: { id: lines[0].id, equation: normalizedLineEquation(lines[0].line), origin: start, direction: { x: end.x - start.x, y: end.y - start.y } },
      });
    }
    if (operation === 'line_intersection') {
      const lines = geometryLines(args.lines, 2);
      if (lines.length !== 2) throw new Error('line_intersection requires exactly two lines');
      return atomicSuccess('Deterministic line intersection calculated', {
        ...provenance,
        intersection: intersectLines(lines[0].line, lines[1].line, threshold),
        line_ids: lines.map(line => line.id),
      });
    }
    if (operation === 'fit_intersection' || operation === 'fit_vanishing_family') {
      const lines = geometryLines(args.lines, 2);
      const fit = operation === 'fit_vanishing_family'
        ? fitVanishingFamily(lines.map(item => item.line), threshold)
        : fitLineIntersection(lines.map(item => item.line), threshold);
      return atomicSuccess(
        operation === 'fit_vanishing_family' ? 'Vanishing family fitted from caller-supplied lines' : 'Robust multi-line intersection fitted',
        { ...provenance, fit, line_ids: lines.map(line => line.id) }
      );
    }
    if (operation === 'point_line_distance') {
      const lines = geometryLines(args.lines, 1);
      if (lines.length !== 1) throw new Error('point_line_distance requires exactly one line');
      const point = geometryPoint(args.point, 'point');
      return atomicSuccess('Point-to-line residual calculated', {
        ...provenance, point, line_id: lines[0].id, distance_px: pointToLineDistance(point, lines[0].line),
      });
    }
    if (operation === 'line_sample') {
      const lines = geometryLines(args.lines, 1);
      if (lines.length !== 1) throw new Error('line_sample requires exactly one line');
      let point: GeometryPoint | undefined;
      if (args.parameter !== undefined) {
        point = pointOnLineAtParameter(lines[0].line, finiteNumber(args.parameter, 'parameter'));
      } else {
        const axis = nonEmptyString(args.axis, 'axis') as GeometryAxis;
        if (axis !== 'x' && axis !== 'y') throw new Error('axis must be x|y');
        const value = finiteNumber(args.value, 'value');
        point = axis === 'x' ? pointOnLineAtX(lines[0].line, value) : pointOnLineAtY(lines[0].line, value);
        if (!point) throw new Error(`line cannot be uniquely sampled at ${axis}=${value}`);
      }
      return atomicSuccess('Line interpolation/extrapolation calculated', { ...provenance, line_id: lines[0].id, point });
    }
    if (operation === 'corridor_section' || operation === 'cross_section') {
      const lines = geometryLines(args.lines, 2);
      if (lines.length !== 2) throw new Error(`${operation} requires exactly two boundary lines`);
      const axis = nonEmptyString(args.axis, 'axis') as GeometryAxis;
      if (axis !== 'x' && axis !== 'y') throw new Error('axis must be x|y');
      const value = finiteNumber(args.value, 'value');
      const section = crossSectionBetweenLines(lines[0].line, lines[1].line, axis, value);
      if (!section) throw new Error(`boundary lines cannot produce a unique ${axis}=${value} cross-section`);
      return atomicSuccess('Perspective corridor cross-section calculated', {
        ...provenance, boundary_line_ids: lines.map(line => line.id), section,
      });
    }
    if (operation === 'corridor_contains_point') {
      const lines = geometryLines(args.lines, 2);
      if (lines.length !== 2) throw new Error('corridor_contains_point requires exactly two boundary lines');
      const point = geometryPoint(args.point, 'point');
      const inside = corridorContainsPoint(point, lines[0].line, lines[1].line, tolerance);
      return atomicSuccess('Support/corridor contact relation calculated', {
        ...provenance, boundary_line_ids: lines.map(line => line.id), point, tolerance_px: tolerance,
        status: inside === undefined ? 'indeterminate' : inside ? 'inside' : 'outside',
      });
    }
    if (operation === 'envelope_relation') {
      const first = geometryPolygon(args.polygon_a, 'polygon_a');
      const second = geometryPolygon(args.polygon_b, 'polygon_b');
      return atomicSuccess('Bounded envelope relation calculated', {
        ...provenance,
        bounds_a: boundsFromPoints(first),
        bounds_b: boundsFromPoints(second),
        polygons_intersect: polygonsIntersect(first, second),
      });
    }
    throw new Error('operation must be one of line_equation|line_intersection|fit_intersection|fit_vanishing_family|point_line_distance|line_sample|corridor_section|cross_section|corridor_contains_point|envelope_relation');
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

function parsePoints(value: unknown): MeasurementPoint[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('points must be a non-empty array');
  }
  if (value.length > 200) throw new Error('points may contain at most 200 entries');

  const names = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`points[${index}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    const name = nonEmptyString(rec.name, `points[${index}].name`);
    if (names.has(name)) throw new Error(`point name "${name}" is duplicated`);
    names.add(name);
    return {
      name,
      x: finiteNumber(rec.x, `points[${index}].x`),
      y: finiteNumber(rec.y, `points[${index}].y`),
    };
  });
}

function parseDistances(value: unknown, points: MeasurementPoint[]): DistanceRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('measurements must be an array');
  if (value.length > 200) throw new Error('measurements may contain at most 200 entries');

  const pointNames = new Set(points.map((p) => p.name));
  const measurementNames = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`measurements[${index}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    const from = nonEmptyString(rec.from, `measurements[${index}].from`);
    const to = nonEmptyString(rec.to, `measurements[${index}].to`);
    if (!pointNames.has(from)) throw new Error(`measurements[${index}].from references unknown point "${from}"`);
    if (!pointNames.has(to)) throw new Error(`measurements[${index}].to references unknown point "${to}"`);
    const name = rec.name === undefined
      ? `${from}_to_${to}`
      : nonEmptyString(rec.name, `measurements[${index}].name`);
    if (measurementNames.has(name)) throw new Error(`measurement name "${name}" is duplicated`);
    measurementNames.add(name);
    return { name, from, to };
  });
}

function parseRatios(value: unknown, measurements: DistanceRequest[]): RatioRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('ratios must be an array');
  if (value.length > 100) throw new Error('ratios may contain at most 100 entries');

  const measurementNames = new Set(measurements.map((m) => m.name));
  const ratioNames = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`ratios[${index}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    const numerator = nonEmptyString(rec.numerator, `ratios[${index}].numerator`);
    const denominator = nonEmptyString(rec.denominator, `ratios[${index}].denominator`);
    if (!measurementNames.has(numerator)) {
      throw new Error(`ratios[${index}].numerator references unknown measurement "${numerator}"`);
    }
    if (!measurementNames.has(denominator)) {
      throw new Error(`ratios[${index}].denominator references unknown measurement "${denominator}"`);
    }
    const name = rec.name === undefined
      ? `${numerator}_over_${denominator}`
      : nonEmptyString(rec.name, `ratios[${index}].name`);
    if (ratioNames.has(name)) throw new Error(`ratio name "${name}" is duplicated`);
    ratioNames.add(name);
    return { name, numerator, denominator };
  });
}

function parseGuides(value: unknown): GuideRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('guides must be a non-empty array');
  }
  if (value.length > 200) throw new Error('guides may contain at most 200 entries');

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`guides[${index}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    const raw = nonEmptyString(rec.orientation, `guides[${index}].orientation`).toUpperCase();
    if (raw !== 'HORIZONTAL' && raw !== 'VERTICAL') {
      throw new Error(`guides[${index}].orientation must be HORIZONTAL or VERTICAL`);
    }
    return {
      orientation: raw as GuideOrientation,
      position: finiteNumber(rec.position, `guides[${index}].position`),
    };
  });
}

function parseFrame(value: unknown, name: string): LandmarkFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const rec = value as Record<string, unknown>;
  const frame = {
    left: finiteNumber(rec.left, `${name}.left`),
    top: finiteNumber(rec.top, `${name}.top`),
    right: finiteNumber(rec.right, `${name}.right`),
    bottom: finiteNumber(rec.bottom, `${name}.bottom`),
  };
  if (frame.right <= frame.left) throw new Error(`${name}.right must be greater than ${name}.left`);
  if (frame.bottom <= frame.top) throw new Error(`${name}.bottom must be greater than ${name}.top`);
  return frame;
}

function transformLandmarkSet(
  points: MeasurementPoint[],
  sourceFrame: LandmarkFrame,
  targetFrame: LandmarkFrame
) {
  const sourceWidth = sourceFrame.right - sourceFrame.left;
  const sourceHeight = sourceFrame.bottom - sourceFrame.top;
  const targetWidth = targetFrame.right - targetFrame.left;
  const targetHeight = targetFrame.bottom - targetFrame.top;

  const transformed = points.map((point) => {
    const u = (point.x - sourceFrame.left) / sourceWidth;
    const v = (point.y - sourceFrame.top) / sourceHeight;
    return {
      name: point.name,
      source: { x: point.x, y: point.y },
      local: { u, v },
      target: {
        x: targetFrame.left + u * targetWidth,
        y: targetFrame.top + v * targetHeight,
      },
    };
  });

  return {
    source_frame: sourceFrame,
    target_frame: targetFrame,
    transformed_points: transformed,
    points: transformed.map((item) => ({
      name: item.name,
      x: item.target.x,
      y: item.target.y,
    })),
    landmark_detection: false,
  };
}

function compareLandmarkSets(
  referencePoints: MeasurementPoint[],
  referenceFrame: LandmarkFrame,
  candidatePoints: MeasurementPoint[],
  candidateFrame: LandmarkFrame
) {
  const candidateMap = new Map(candidatePoints.map((point) => [point.name, point]));
  const referenceWidth = referenceFrame.right - referenceFrame.left;
  const referenceHeight = referenceFrame.bottom - referenceFrame.top;
  const candidateWidth = candidateFrame.right - candidateFrame.left;
  const candidateHeight = candidateFrame.bottom - candidateFrame.top;

  const missing: string[] = [];
  const comparisons: Array<Record<string, unknown>> = [];
  let sumDistance = 0;
  let sumDistanceSquared = 0;
  let maxDistance = -1;
  let maxPoint: string | null = null;

  for (const reference of referencePoints) {
    const candidate = candidateMap.get(reference.name);
    if (!candidate) {
      missing.push(reference.name);
      continue;
    }

    const refU = (reference.x - referenceFrame.left) / referenceWidth;
    const refV = (reference.y - referenceFrame.top) / referenceHeight;
    const candidateU = (candidate.x - candidateFrame.left) / candidateWidth;
    const candidateV = (candidate.y - candidateFrame.top) / candidateHeight;
    const du = candidateU - refU;
    const dv = candidateV - refV;
    const distance = Math.sqrt(du * du + dv * dv);

    comparisons.push({
      name: reference.name,
      reference: { x: reference.x, y: reference.y, u: refU, v: refV },
      candidate: { x: candidate.x, y: candidate.y, u: candidateU, v: candidateV },
      error: { du, dv, distance },
    });
    sumDistance += distance;
    sumDistanceSquared += distance * distance;
    if (distance > maxDistance) {
      maxDistance = distance;
      maxPoint = reference.name;
    }
  }

  const referenceNames = new Set(referencePoints.map((point) => point.name));
  const extra = candidatePoints.filter((point) => !referenceNames.has(point.name)).map((point) => point.name);
  const count = comparisons.length;

  return {
    reference_frame: referenceFrame,
    candidate_frame: candidateFrame,
    compared_count: count,
    reference_count: referencePoints.length,
    candidate_count: candidatePoints.length,
    missing_in_candidate: missing,
    extra_in_candidate: extra,
    points: comparisons,
    summary: {
      mean_error: count ? sumDistance / count : null,
      rmse: count ? Math.sqrt(sumDistanceSquared / count) : null,
      max_error: count ? maxDistance : null,
      max_error_point: count ? maxPoint : null,
    },
    landmark_detection: false,
  };
}

function calculatePointMeasurements(
  document: { id?: unknown; name?: unknown; width: number; height: number },
  points: MeasurementPoint[],
  measurements: DistanceRequest[],
  ratios: RatioRequest[]
) {
  const { width, height } = document;
  const legacyNumber = (value: number | null): number | null => {
    if (value === null || !Number.isFinite(value) || Number.isInteger(value)) return value;
    return Number(value.toPrecision(14));
  };
  const pointMap = new Map(points.map((point) => [point.name, point]));
  const outPoints = points.map((point) => ({
    name: point.name,
    x: point.x,
    y: point.y,
    x_norm: legacyNumber(width ? point.x / width : null),
    y_norm: legacyNumber(height ? point.y / height : null),
  }));

  const measurementMap = new Map<string, Record<string, unknown>>();
  const outMeasurements = measurements.map((request) => {
    const from = pointMap.get(request.from)!;
    const to = pointMap.get(request.to)!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const result = {
      name: request.name,
      from: request.from,
      to: request.to,
      dx,
      dy,
      distance: legacyNumber(distance),
      dx_norm: legacyNumber(width ? dx / width : null),
      dy_norm: legacyNumber(height ? dy / height : null),
      distance_over_width: legacyNumber(width ? distance / width : null),
      distance_over_height: legacyNumber(height ? distance / height : null),
    };
    measurementMap.set(request.name, result);
    return result;
  });

  const outRatios = ratios.map((ratio) => {
    const numerator = Number(measurementMap.get(ratio.numerator)?.distance);
    const denominator = Number(measurementMap.get(ratio.denominator)?.distance);
    if (denominator === 0) {
      throw new Error(`ratio denominator measurement "${ratio.denominator}" is zero`);
    }
    return {
      name: ratio.name,
      numerator: ratio.numerator,
      denominator: ratio.denominator,
      value: legacyNumber(numerator / denominator),
    };
  });

  return {
    document: {
      id: document.id,
      name: document.name,
      width,
      height,
    },
    points: outPoints,
    measurements: outMeasurements,
    ratios: outRatios,
    landmark_detection: false,
  };
}

export function createMeasurementTools(connection: PhotoshopConnection): ToolDefinition[] {
  const backendRouter = new PhotoshopBackendRouter(connection);
  return [
    {
      tool: {
        name: 'photoshop_measure_points',
        description:
          'Measure user-supplied named points in the active Photoshop document. Returns pixel and normalized coordinates, vector distances, and optional ratios between named measurements. This tool does not detect facial/anatomical landmarks automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            points: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              description: 'Named points in document pixel coordinates. Landmarks must be supplied by the caller.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['name', 'x', 'y'],
              },
            },
            measurements: {
              type: 'array',
              maxItems: 200,
              description: 'Distances to compute between named points.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Optional unique measurement name' },
                  from: { type: 'string', description: 'Start point name' },
                  to: { type: 'string', description: 'End point name' },
                },
                required: ['from', 'to'],
              },
            },
            ratios: {
              type: 'array',
              maxItems: 100,
              description: 'Optional ratios using the distance values of named measurements.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Optional unique ratio name' },
                  numerator: { type: 'string', description: 'Measurement name used as numerator' },
                  denominator: { type: 'string', description: 'Measurement name used as denominator' },
                },
                required: ['numerator', 'denominator'],
              },
            },
          },
          required: ['points'],
        },
      },
      handler: async (args) => measurePoints(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_geometry_calculate',
        description:
          'Pure deterministic source-pixel geometry for Scene Geometry Model / Geometry Preflight work. The caller supplies semantic line endpoints, points or polygons plus exact source-frame provenance; this tool performs no semantic detection and creates no Photoshop history.',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: [
                'line_equation', 'line_intersection', 'fit_intersection', 'fit_vanishing_family',
                'point_line_distance', 'line_sample', 'corridor_section', 'cross_section',
                'corridor_contains_point', 'envelope_relation',
              ],
            },
            source_frame: {
              type: 'object',
              properties: {
                document_id: { type: 'number', minimum: 1 },
                document_incarnation: { type: 'string', minLength: 1 },
                width: { type: 'number', exclusiveMinimum: 0 },
                height: { type: 'number', exclusiveMinimum: 0 },
              },
              required: ['document_id', 'document_incarnation', 'width', 'height'],
              additionalProperties: false,
              description: 'Exact source-document pixel frame used by every supplied coordinate.',
            },
            lines: {
              type: 'array', minItems: 1, maxItems: 32,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  points: {
                    type: 'array', minItems: 2, maxItems: 2,
                    items: {
                      type: 'object',
                      properties: { x: { type: 'number' }, y: { type: 'number' } },
                      required: ['x', 'y'], additionalProperties: false,
                    },
                  },
                },
                required: ['points'], additionalProperties: false,
              },
              description: 'Caller-identified visible or planned line candidates in source-document pixels.',
            },
            point: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' } },
              required: ['x', 'y'], additionalProperties: false,
            },
            axis: { type: 'string', enum: ['x', 'y'] },
            value: { type: 'number' },
            parameter: { type: 'number', description: 'Normalized/unbounded line parameter; values outside 0..1 extrapolate.' },
            tolerance_px: { type: 'number', minimum: 0 },
            near_parallel_threshold: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
            polygon_a: {
              type: 'array', minItems: 3, maxItems: 200,
              items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false },
            },
            polygon_b: {
              type: 'array', minItems: 3, maxItems: 200,
              items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false },
            },
          },
          required: ['operation', 'source_frame'],
          additionalProperties: false,
        },
      },
      handler: calculateGeometry,
    },
    {
      tool: {
        name: 'photoshop_add_guides',
        description:
          'Add horizontal and/or vertical Photoshop guides at exact pixel positions. Returns normalized positions and total guide count.',
        inputSchema: {
          type: 'object',
          properties: {
            guides: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              items: {
                type: 'object',
                properties: {
                  orientation: { type: 'string', enum: ['HORIZONTAL', 'VERTICAL'] },
                  position: { type: 'number', description: 'Guide position in document pixels' },
                },
                required: ['orientation', 'position'],
              },
            },
          },
          required: ['guides'],
        },
      },
      handler: async (args) => addGuides(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_list_guides',
        description:
          'List Photoshop guides with index, orientation, pixel position, and normalized position for the active document.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (args) => listGuides(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_clear_guides',
        description:
          'Remove Photoshop guides. With no indices, removes all guides. With indices, removes only those zero-based guide indices returned by photoshop_list_guides.',
        inputSchema: {
          type: 'object',
          properties: {
            indices: {
              type: 'array',
              uniqueItems: true,
              maxItems: 200,
              items: { type: 'number', minimum: 0 },
              description: 'Optional zero-based guide indices. Omit to remove all guides.',
            },
          },
        },
      },
      handler: async (args) => clearGuides(backendRouter, args),
    },
    {
      tool: {
        name: 'photoshop_transform_landmarks',
        description:
          'Transform a caller-supplied named landmark set from one axis-aligned semantic frame to another while preserving local u/v coordinates. Pure geometry: does not inspect Photoshop or detect landmarks.',
        inputSchema: {
          type: 'object',
          properties: {
            points: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['name', 'x', 'y'],
              },
            },
            source_frame: {
              type: 'object',
              description: 'Source semantic bounds in the same pixel space as points.',
              properties: {
                left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' },
              },
              required: ['left', 'top', 'right', 'bottom'],
            },
            target_frame: {
              type: 'object',
              description: 'Target semantic bounds to map points into.',
              properties: {
                left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' },
              },
              required: ['left', 'top', 'right', 'bottom'],
            },
          },
          required: ['points', 'source_frame', 'target_frame'],
        },
      },
      handler: async (args) => transformLandmarks(args),
    },
    {
      tool: {
        name: 'photoshop_compare_landmarks',
        description:
          'Compare two caller-supplied named landmark sets in their own semantic frames. Returns per-point normalized error plus mean/RMSE/max error. Pure geometry: does not inspect Photoshop or detect landmarks.',
        inputSchema: {
          type: 'object',
          properties: {
            reference_points: {
              type: 'array', minItems: 1, maxItems: 200,
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } },
                required: ['name', 'x', 'y'],
              },
            },
            reference_frame: {
              type: 'object',
              properties: { left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' } },
              required: ['left', 'top', 'right', 'bottom'],
            },
            candidate_points: {
              type: 'array', minItems: 1, maxItems: 200,
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } },
                required: ['name', 'x', 'y'],
              },
            },
            candidate_frame: {
              type: 'object',
              properties: { left: { type: 'number' }, top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' } },
              required: ['left', 'top', 'right', 'bottom'],
            },
          },
          required: ['reference_points', 'reference_frame', 'candidate_points', 'candidate_frame'],
        },
      },
      handler: async (args) => compareLandmarks(args),
    },
  ];
}

async function transformLandmarks(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const points = parsePoints(args.points);
    const sourceFrame = parseFrame(args.source_frame, 'source_frame');
    const targetFrame = parseFrame(args.target_frame, 'target_frame');
    return atomicSuccess(
      `Transformed ${points.length} landmark${points.length === 1 ? '' : 's'}`,
      transformLandmarkSet(points, sourceFrame, targetFrame),
      'photoshop_compare_landmarks'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function compareLandmarks(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const referencePoints = parsePoints(args.reference_points);
    const candidatePoints = parsePoints(args.candidate_points);
    const referenceFrame = parseFrame(args.reference_frame, 'reference_frame');
    const candidateFrame = parseFrame(args.candidate_frame, 'candidate_frame');
    const comparison = compareLandmarkSets(referencePoints, referenceFrame, candidatePoints, candidateFrame);
    if (comparison.compared_count === 0) {
      throw new Error('reference_points and candidate_points have no shared landmark names');
    }
    return atomicSuccess(
      `Compared ${comparison.compared_count} shared landmark${comparison.compared_count === 1 ? '' : 's'}`,
      comparison,
      'photoshop_get_preview'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function measurePoints(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const points = parsePoints(args.points);
    const measurements = parseDistances(args.measurements, points);
    const ratios = parseRatios(args.ratios, measurements);
    const state = await backendRouter.readDocumentInfo();
    const document = state.document;
    if (
      !document ||
      typeof document.width !== 'number' ||
      typeof document.height !== 'number'
    ) {
      throw new Error('Active document dimensions are unavailable');
    }
    const parsed = calculatePointMeasurements(
      {
        id: document.id,
        name: document.name,
        width: document.width,
        height: document.height,
      },
      points,
      measurements,
      ratios
    );
    return atomicSuccess('Point measurements calculated', {
      document: parsed.document,
      points: parsed.points,
      measurements: parsed.measurements,
      ratios: parsed.ratios,
      landmark_detection: false,
    }, 'photoshop_get_preview');
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function addGuides(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const guides = parseGuides(args.guides);
    await backendRouter.backendFor(
      'guides.add' as Parameters<PhotoshopBackendRouter['backendFor']>[0]
    );
    const documentId =
      typeof args.document_id === 'number' && Number.isSafeInteger(args.document_id) && args.document_id > 0
        ? args.document_id
        : undefined;
    const result = await invokeUxpOperation(
      'add_guides',
      {
        guides,
        ...(documentId !== undefined ? { document_id: documentId } : {}),
      },
      'uxp_add_guides_failed'
    );
    if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_add_guides_failed');
    return atomicSuccess(`Added ${guides.length} guide${guides.length === 1 ? '' : 's'}`, {
      added: result.data.added,
      guide_count: result.data.guide_count,
      document: result.data.document,
    }, 'photoshop_list_guides');
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function listGuides(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    await backendRouter.backendFor(
      'guides.list' as Parameters<PhotoshopBackendRouter['backendFor']>[0]
    );
    const documentId =
      typeof args.document_id === 'number' && Number.isSafeInteger(args.document_id) && args.document_id > 0
        ? args.document_id
        : undefined;
    const result = await invokeUxpOperation(
      'list_guides',
      documentId !== undefined ? { document_id: documentId } : {},
      'uxp_list_guides_failed'
    );
    if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_list_guides_failed');
    const count = typeof result.data.guide_count === 'number' ? result.data.guide_count : 0;
    return atomicSuccess(`${count} guide${count === 1 ? '' : 's'} listed`, {
      guides: result.data.guides,
      guide_count: count,
      document: result.data.document,
    }, 'photoshop_measure_points');
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function clearGuides(
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    let indices: number[] | undefined;
    if (args.indices !== undefined) {
      if (!Array.isArray(args.indices)) throw new Error('indices must be an array');
      if (args.indices.length > 200) throw new Error('indices may contain at most 200 entries');
      const unique = new Set<number>();
      indices = args.indices.map((value, index) => {
        const n = finiteNumber(value, `indices[${index}]`);
        if (!Number.isInteger(n) || n < 0) throw new Error(`indices[${index}] must be a non-negative integer`);
        if (unique.has(n)) throw new Error(`guide index ${n} is duplicated`);
        unique.add(n);
        return n;
      });
    }
    await backendRouter.backendFor(
      'guides.clear' as Parameters<PhotoshopBackendRouter['backendFor']>[0]
    );
    const documentId =
      typeof args.document_id === 'number' && Number.isSafeInteger(args.document_id) && args.document_id > 0
        ? args.document_id
        : undefined;
    const result = await invokeUxpOperation(
      'clear_guides',
      {
        ...(indices !== undefined ? { indices } : {}),
        ...(documentId !== undefined ? { document_id: documentId } : {}),
      },
      'uxp_clear_guides_failed'
    );
    if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_clear_guides_failed');
    const removedCount = typeof result.data.removed_count === 'number' ? result.data.removed_count : 0;
    return atomicSuccess(`Removed ${removedCount} guide${removedCount === 1 ? '' : 's'}`, {
      removed: result.data.removed,
      removed_count: removedCount,
      guide_count: result.data.guide_count,
    }, 'photoshop_list_guides');
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
