import { changedSceneGeometryDependencyIds, type GeometryBinding } from './geometry-binding.js';
import { corridorContainsPoint } from './geometry-math.js';
import { bezierCriticalPoints, type CurveProjection } from './bezier-geometry.js';
import type { GeometryPoint, SceneGeometryModel, SceneLineMember } from './scene-geometry-model.js';
import { VISUAL_MICROPLAN_PREPARE_TOOLS } from './visual-microplan.js';

export interface ExecutableGeometryIssue {
  code: 'executable_geometry_unverifiable' | 'executable_geometry_constraint_conflict';
  message: string;
}

export interface ExecutableGeometryProvenance {
  mode: 'validated-boundary-corridor' | 'validated-landmark-transform' | 'validated-orientation-transform' | 'derived-boundary-sections';
  owner_id: string;
  scene_geometry_model_id: string;
  scene_geometry_revision: number;
  dependency_ids: string[];
  dependency_snapshots?: Record<string, string>;
  tools: string[];
  dispatched_point_count: number;
  tolerance_px: number;
  source_bounds?: AxisBounds;
  target_bounds?: AxisBounds;
}

export interface GeneratedGeometryProvenanceState {
  stale: boolean;
  reason: 'current' | 'model_identity_changed' | 'source_revision_unavailable' | 'dependency_changed';
  changed_dependency_ids: string[];
}

/**
 * Selectively invalidates compiler-generated geometry from the exact dependencies
 * recorded when that payload was materialized. This is intentionally narrower than
 * owner-level Geometry Binding staleness: a binding may mention other scene facts,
 * while a generated facade band can depend on only the two boundary lines that
 * produced its executable x coordinates.
 */
export function generatedGeometryProvenanceState(
  provenance: ExecutableGeometryProvenance,
  current: SceneGeometryModel,
  sourceRevision?: SceneGeometryModel | null,
): GeneratedGeometryProvenanceState {
  if (provenance.scene_geometry_model_id !== current.model_id) {
    return { stale: true, reason: 'model_identity_changed', changed_dependency_ids: ['__projection__'] };
  }
  if (provenance.dependency_snapshots) {
    const currentSnapshots = lineDependencySnapshots(current, provenance.dependency_ids);
    const changed = provenance.dependency_ids.filter(id =>
      provenance.dependency_snapshots?.[id] !== currentSnapshots[id]);
    const savedProjection = provenance.dependency_snapshots.__projection__;
    if (savedProjection !== undefined) {
      if (savedProjection !== currentSnapshots.__projection__) changed.push('__projection__');
    } else {
      // Pre-fix durable snapshots contain only line members. Without the source
      // scene we cannot prove that the camera/canvas remained unchanged, even
      // if a malformed/reused revision number happens to match the current one.
      if (!sourceRevision || sourceRevision.model_id !== provenance.scene_geometry_model_id
          || sourceRevision.revision !== provenance.scene_geometry_revision) {
        return { stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [] };
      }
      if (projectionDependencySnapshot(sourceRevision) !== currentSnapshots.__projection__) {
        changed.push('__projection__');
      }
    }
    return {
      stale: changed.length > 0,
      reason: changed.length ? 'dependency_changed' : 'current',
      changed_dependency_ids: changed,
    };
  }
  // Snapshot-free legacy provenance cannot be trusted on revision equality:
  // camera/canvas changes are not represented by its dependency ids.
  if (!sourceRevision
      || sourceRevision.model_id !== provenance.scene_geometry_model_id
      || sourceRevision.revision !== provenance.scene_geometry_revision) {
    return { stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [] };
  }
  const generatedDependencies = new Set(provenance.dependency_ids);
  const relevant = changedSceneGeometryDependencyIds(sourceRevision, current)
    .filter(id => id === '__projection__' || generatedDependencies.has(id));
  if (projectionDependencySnapshot(sourceRevision) !== projectionDependencySnapshot(current)
      && !relevant.includes('__projection__')) relevant.push('__projection__');
  return {
    stale: relevant.length > 0,
    reason: relevant.length ? 'dependency_changed' : 'current',
    changed_dependency_ids: relevant,
  };
}

interface AxisBounds { left: number; top: number; right: number; bottom: number }

function bounds(value: unknown): AxisBounds | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const { left, top, right, bottom } = raw;
  // These coordinates are evidence, not user-entered numeric expressions.
  // Number(null), Number(false) and Number('0') would silently manufacture
  // a zero-origin layer bound when reading malformed persisted JSON/UXP state.
  if (typeof left !== 'number' || typeof top !== 'number'
      || typeof right !== 'number' || typeof bottom !== 'number'
      || ![left, top, right, bottom].every(Number.isFinite)
      || right <= left || bottom <= top) return undefined;
  return { left, top, right, bottom };
}

function landmarkTransformFrames(steps: Array<Record<string, unknown>>): { source: AxisBounds; target: AxisBounds } | undefined {
  const derivations = steps.filter(step => step.tool === 'photoshop_transform_landmarks');
  if (derivations.length !== 1) return undefined;
  const args = record(derivations[0].args);
  const source = bounds(args?.source_frame);
  const target = bounds(args?.target_frame);
  return source && target ? { source, target } : undefined;
}

export function observedLayerBoundsIssue(
  provenance: ExecutableGeometryProvenance | undefined,
  activeLayer: unknown,
  expectedLayerId?: unknown,
): ExecutableGeometryIssue | undefined {
  if (provenance?.mode !== 'validated-landmark-transform') return undefined;
  // Provenance is also read back from durable JSON. Treat absent, partial or
  // malformed source bounds as unverifiable instead of comparing Object.keys
  // (an empty object otherwise vacuously matched any observed layer).
  const source = bounds(provenance.source_bounds);
  const tolerance = provenance.tolerance_px;
  // This receipt can be restored from durable JSON independently of the
  // dispatch validator. Never allow a forged/corrupt tolerance to turn a
  // displaced physical layer into a matching source frame.
  if (!source || typeof tolerance !== 'number' || !Number.isFinite(tolerance)
      || tolerance < 0 || tolerance > 2) {
    return {
      code: 'executable_geometry_unverifiable',
      message: `executable_geometry_unverifiable: owner=${provenance.owner_id} landmark transform has no valid persisted source bounds/tolerance for live Photoshop verification`,
    };
  }
  const layer = record(activeLayer);
  // Transforms operate on the *active* Photoshop layer. Equal pixel bounds on
  // two different layers are not proof that the pinned semantic owner is active.
  // Keep this check conditional for legacy plans without a physical layer id.
  if (expectedLayerId !== undefined) {
    if (typeof expectedLayerId !== 'number' || !Number.isSafeInteger(expectedLayerId) || expectedLayerId <= 0
        || typeof layer?.id !== 'number' || !Number.isSafeInteger(layer.id) || layer.id <= 0) {
      return {
        code: 'executable_geometry_unverifiable',
        message: `executable_geometry_unverifiable: owner=${provenance.owner_id} pinned transform layer identity cannot be verified against the live active layer`,
      };
    }
    if (layer.id !== expectedLayerId) {
      return {
        code: 'executable_geometry_constraint_conflict',
        message: `executable_geometry_constraint_conflict: owner=${provenance.owner_id} pinned transform layer_id=${expectedLayerId} differs from live active layer_id=${layer.id}`,
      };
    }
  }
  const observed = bounds(layer?.bounds);
  if (!observed) {
    return {
      code: 'executable_geometry_unverifiable',
      message: `executable_geometry_unverifiable: owner=${provenance.owner_id} landmark transform requires freshly observed Photoshop active-layer bounds before dispatch`,
    };
  }
  const matches = (['left', 'top', 'right', 'bottom'] as const)
    .every(key => nearlyEqual(observed[key], source[key], tolerance));
  if (matches) return undefined;
  return {
    code: 'executable_geometry_constraint_conflict',
    message: `executable_geometry_constraint_conflict: owner=${provenance.owner_id} declared landmark source bounds=${JSON.stringify(provenance.source_bounds)} do not match freshly observed Photoshop active-layer bounds=${JSON.stringify(observed)} (tolerance=${tolerance}px)`,
  };
}

function hasCurrentExactGeometryEvidence(binding: GeometryBinding, scene: SceneGeometryModel): boolean {
  // Scene/evidence frames can be restored from persisted JSON. Exact equality of
  // two malformed dimensions is not proof of the live canvas size.
  const validDimension = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!validDimension(scene.source_frame.width) || !validDimension(scene.source_frame.height)) return false;
  return binding.exact_evidence.some(evidence =>
    validDimension(evidence.source_frame.width)
    && validDimension(evidence.source_frame.height)
    &&
    evidence.source_frame.document_id === scene.source_frame.document_id
    && evidence.source_frame.document_incarnation === scene.source_frame.document_incarnation
    && evidence.source_frame.width === scene.source_frame.width
    && evidence.source_frame.height === scene.source_frame.height
  );
}

function nearlyEqual(actual: number, expected: number, tolerance: number): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

function lineAngleDegrees(points: [GeometryPoint, GeometryPoint]): number | undefined {
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-9) return undefined;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function undirectedRotationDegrees(source: number, target: number): number {
  let delta = target - source;
  while (delta > 90) delta -= 180;
  while (delta <= -90) delta += 180;
  return delta;
}

function orientationRotation(binding: GeometryBinding, scene: SceneGeometryModel): { degrees: number; dependency_id: string } | undefined {
  if (!hasCurrentExactGeometryEvidence(binding, scene) || !binding.anchors.centerline) return undefined;
  const targets = [...new Set(binding.constraints
    .filter(constraint => constraint.type === 'parallel_family' && typeof constraint.target_ref === 'string')
    .map(constraint => constraint.target_ref as string))];
  if (targets.length !== 1 || !binding.dependencies.includes(targets[0])) return undefined;
  const targetLine = scene.line_families.flatMap(family => family.members).find(member => member.id === targets[0]);
  if (!targetLine) return undefined;
  const sourceAngle = lineAngleDegrees(binding.anchors.centerline.line);
  const targetAngle = lineAngleDegrees(targetLine.points);
  if (sourceAngle === undefined || targetAngle === undefined) return undefined;
  return { degrees: undirectedRotationDegrees(sourceAngle, targetAngle), dependency_id: targets[0] };
}

export function materializeOrientationDerivedRotate(
  steps: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): ExecutableGeometryProvenance | undefined {
  // Orientation evidence proves only the rotation of the currently bound layer.
  // Do not rewrite a rotation embedded beside an unverified layer switch or paint.
  if (!steps.every(isExactTransformEvidenceStep)
      || steps.some(step => typeof step.tool === 'string'
        && EXACT_LAYER_TRANSFORM_TOOLS.has(step.tool) && step.tool !== 'photoshop_rotate_layer')) return undefined;
  const rotations = steps.filter(step => step.tool === 'photoshop_rotate_layer');
  if (rotations.length !== 1) return undefined;
  const derived = orientationRotation(binding, scene);
  const args = record(rotations[0].args);
  if (!derived || !args) return undefined;
  args.degrees = derived.degrees;
  return {
    mode: 'validated-orientation-transform',
    owner_id: binding.owner_id,
    scene_geometry_model_id: scene.model_id,
    scene_geometry_revision: scene.revision,
    dependency_ids: [derived.dependency_id],
    dependency_snapshots: lineDependencySnapshots(scene, [derived.dependency_id]),
    tools: ['photoshop_rotate_layer'],
    dispatched_point_count: 0,
    tolerance_px: 0,
  };
}

function inspectOrientationDerivedRotate(
  transforms: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
  tolerancePx: number,
): ExecutableGeometryValidationResult | undefined {
  if (transforms.length !== 1 || transforms[0].tool !== 'photoshop_rotate_layer') return undefined;
  const derived = orientationRotation(binding, scene);
  if (!derived) return undefined;
  const expected = derived.degrees;
  const actual = record(transforms[0].args)?.degrees;
  if (typeof actual !== 'number' || !Number.isFinite(actual)) {
    return { issues: [{
      code: 'executable_geometry_unverifiable',
      message: `executable_geometry_unverifiable: owner=${binding.owner_id} exact rotation requires a finite numeric degrees argument`,
    }] };
  }
  const angularTolerance = Math.max(0.05, tolerancePx / 10);
  const issues: ExecutableGeometryIssue[] = nearlyEqual(actual, expected, angularTolerance) ? [] : [{
    code: 'executable_geometry_constraint_conflict',
    message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched photoshop_rotate_layer degrees=${actual} does not match orientation-derived rotation=${expected}deg from centerline to ${derived.dependency_id} (tolerance=${angularTolerance}deg)`,
  }];
  return {
    issues,
    ...(issues.length ? {} : { provenance: {
      mode: 'validated-orientation-transform' as const,
      owner_id: binding.owner_id,
      scene_geometry_model_id: scene.model_id,
      scene_geometry_revision: scene.revision,
      dependency_ids: [derived.dependency_id],
      dependency_snapshots: lineDependencySnapshots(scene, [derived.dependency_id]),
      tools: ['photoshop_rotate_layer'],
      dispatched_point_count: 0,
      tolerance_px: angularTolerance,
    } }),
  };
}

function inspectLandmarkDerivedTransforms(
  steps: Array<Record<string, unknown>>,
  transforms: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
  tolerancePx: number,
): ExecutableGeometryValidationResult | undefined {
  const frames = landmarkTransformFrames(steps);
  if (!frames) return undefined;
  // photoshop_transform_landmarks is pure caller-supplied geometry. It may prove
  // arithmetic agreement with the dispatched transform, but it is not independent
  // scene evidence by itself. Require the binding to carry exact evidence pinned to
  // the current durable source frame before admitting the positive transform path.
  if (!hasCurrentExactGeometryEvidence(binding, scene)) return undefined;
  // Project the current rectangle in dispatch order. Comparing every step with
  // the final target independently can certify a missing move or reject a valid
  // move/scale composition. These are declared frames, not live layer evidence.
  let current = { ...frames.source };
  const first = steps.indexOf(transforms[0]);
  const last = steps.indexOf(transforms[transforms.length - 1]);
  if (steps.slice(first, last + 1).some(step =>
    !transforms.includes(step) && step.tool !== 'photoshop_transform_landmarks'
  )) return undefined;
  for (const step of transforms) {
    const args = record(step.args);
    if (step.tool === 'photoshop_move_layer') {
      const actualX = args?.deltaX; const actualY = args?.deltaY;
      if (typeof actualX !== 'number' || typeof actualY !== 'number'
          || !Number.isFinite(actualX) || !Number.isFinite(actualY)) return undefined;
      current = { left: current.left + actualX, top: current.top + actualY,
        right: current.right + actualX, bottom: current.bottom + actualY };
      continue;
    }
    if (step.tool === 'photoshop_scale_layer') {
      if (typeof args?.scalePercent !== 'number') return undefined;
      const actualScale = args.scalePercent / 100;
      if (!Number.isFinite(actualScale) || actualScale <= 0
        || (args?.centerAnchor !== undefined && typeof args.centerAnchor !== 'boolean')) return undefined;
      const centerAnchor = args?.centerAnchor !== false; // Same default as UXP.
      const anchorX = centerAnchor ? (current.left + current.right) / 2 : current.left;
      const anchorY = centerAnchor ? (current.top + current.bottom) / 2 : current.top;
      current = {
        left: anchorX + (current.left - anchorX) * actualScale,
        top: anchorY + (current.top - anchorY) * actualScale,
        right: anchorX + (current.right - anchorX) * actualScale,
        bottom: anchorY + (current.bottom - anchorY) * actualScale,
      };
      continue;
    }
    if (step.tool === 'photoshop_fit_layer_to_document') {
      const documentWidth = scene.source_frame.width;
      const documentHeight = scene.source_frame.height;
      if (typeof documentWidth !== 'number' || !Number.isFinite(documentWidth) || documentWidth <= 0
          || typeof documentHeight !== 'number' || !Number.isFinite(documentHeight) || documentHeight <= 0) return undefined;
      const fillDocument = args?.fillDocument === true;
      if (args?.fillDocument !== undefined && typeof args.fillDocument !== 'boolean') return undefined;
      const sourceWidth = current.right - current.left;
      const sourceHeight = current.bottom - current.top;
      const scale = fillDocument
        ? Math.max(documentWidth / sourceWidth, documentHeight / sourceHeight)
        : Math.min(documentWidth / sourceWidth, documentHeight / sourceHeight);
      const expectedWidth = sourceWidth * scale;
      const expectedHeight = sourceHeight * scale;
      const expectedLeft = (documentWidth - expectedWidth) / 2;
      const expectedTop = (documentHeight - expectedHeight) / 2;
      current = {
        left: expectedLeft, top: expectedTop,
        right: expectedLeft + expectedWidth, bottom: expectedTop + expectedHeight,
      };
      continue;
    }
    return undefined;
  }
  if (!bounds(current)) return undefined;
  const matches = (Object.keys(current) as Array<keyof AxisBounds>)
    .every(key => nearlyEqual(current[key], frames.target[key], tolerancePx));
  const sameSize = nearlyEqual(current.right - current.left, frames.target.right - frames.target.left, tolerancePx)
    && nearlyEqual(current.bottom - current.top, frames.target.bottom - frames.target.top, tolerancePx);
  const correction = sameSize ? 'remaining move' : 'size mismatch; target origin delta';
  const issues: ExecutableGeometryIssue[] = matches ? [] : [{
    code: 'executable_geometry_constraint_conflict',
    message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} ordered transforms reach bounds=${JSON.stringify(current)}, not landmark-derived target=${JSON.stringify(frames.target)}; ${correction}=(${frames.target.left - current.left},${frames.target.top - current.top})px (tolerance=${tolerancePx}px)`,
  }];
  return {
    issues,
    ...(issues.length ? {} : { provenance: {
      mode: 'validated-landmark-transform' as const,
      owner_id: binding.owner_id,
      scene_geometry_model_id: scene.model_id,
      scene_geometry_revision: scene.revision,
      dependency_ids: [...binding.dependencies].sort(),
      tools: [...new Set(transforms.map(step => String(step.tool)))].sort(),
      dispatched_point_count: 0,
      tolerance_px: tolerancePx,
      source_bounds: { ...frames.source },
      target_bounds: { ...frames.target },
    } }),
  };
}

export interface ExecutableGeometryValidationResult {
  issues: ExecutableGeometryIssue[];
  provenance?: ExecutableGeometryProvenance;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function point(value: unknown): GeometryPoint | undefined {
  const raw = record(value);
  const x = raw?.x; const y = raw?.y;
  // These are dispatched coordinates, not numeric expressions. Coercing
  // null, booleans or numeric strings would certify a different payload.
  return typeof x === 'number' && typeof y === 'number'
    && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function pointsNearlyEqual(a: GeometryPoint, b: GeometryPoint, tolerance: number): boolean {
  return nearlyEqual(a.x, b.x, tolerance) && nearlyEqual(a.y, b.y, tolerance);
}

function contourMatchesDerivedCorners(
  actual: GeometryPoint[],
  expected: GeometryPoint[],
  tolerance: number,
): boolean {
  if (actual.length !== expected.length || actual.length < 3) return false;
  const n = expected.length;
  for (let offset = 0; offset < n; offset += 1) {
    if (actual.every((value, index) => pointsNearlyEqual(value, expected[(offset + index) % n], tolerance))) return true;
    if (actual.every((value, index) => pointsNearlyEqual(value, expected[(offset - index + n) % n], tolerance))) return true;
  }
  return false;
}

function convexPolygonProjections(polygon: GeometryPoint[]): CurveProjection[] {
  return polygon.map((value, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const dx = next.x - value.x; const dy = next.y - value.y;
    return { x: -dy, y: dx, offset: dy * value.x - dx * value.y };
  });
}

function convexPolygonContainsPoint(value: GeometryPoint, polygon: GeometryPoint[], tolerance: number): boolean {
  if (polygon.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]; const b = polygon[(index + 1) % polygon.length];
    const cross = (b.x - a.x) * (value.y - a.y) - (b.y - a.y) * (value.x - a.x);
    const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(cross) <= tolerance * edgeLength) continue;
    const current = Math.sign(cross);
    if (sign === 0) sign = current;
    else if (current !== sign) return false;
  }
  return true;
}

function regionCurveEnvelopeIssues(
  steps: Array<Record<string, unknown>>,
  polygons: GeometryPoint[][],
  ownerId: string,
  tolerance: number,
): ExecutableGeometryIssue[] {
  const contours: Array<Record<string, unknown>> = [];
  for (const step of steps) {
    if (step.tool !== 'photoshop_paint_regions') continue;
    const args = record(step.args);
    if (!Array.isArray(args?.regions)) continue;
    for (const regionValue of args.regions) {
      const region = record(regionValue);
      if (!Array.isArray(region?.contours)) continue;
      for (const contourValue of region.contours) {
        const contour = record(contourValue);
        if (contour) contours.push(contour);
      }
    }
  }
  if (contours.length !== polygons.length) return [];
  const issues: ExecutableGeometryIssue[] = [];
  contours.forEach((contour, index) => {
    if (!Array.isArray(contour.points) || !hasAuthoredCurve(contour.points)) return;
    const polygon = polygons[index];
    const critical = bezierCriticalPoints(contour.points, true, convexPolygonProjections(polygon));
    const escaped = critical.find(value => !convexPolygonContainsPoint(value, polygon, tolerance));
    if (escaped) issues.push({
      code: 'executable_geometry_constraint_conflict',
      message: `executable_geometry_constraint_conflict: owner=${ownerId} dispatched curved contour[${index}] escapes its derived module/grid envelope at (${escaped.x},${escaped.y}) (tolerance=${tolerance}px)`,
    });
  });
  return issues;
}

function regionContours(steps: Array<Record<string, unknown>>): GeometryPoint[][] | undefined {
  const contours: GeometryPoint[][] = [];
  for (const step of steps) {
    if (step.tool !== 'photoshop_paint_regions') continue;
    const args = record(step.args);
    if (!Array.isArray(args?.regions)) continue;
    for (const regionValue of args.regions) {
      const region = record(regionValue);
      if (!Array.isArray(region?.contours)) return undefined;
      for (const contourValue of region.contours) {
        const contour = record(contourValue);
        if (!Array.isArray(contour?.points)) return undefined;
        const values = contour.points.map(point);
        if (values.some(value => !value)) return undefined;
        contours.push(values as GeometryPoint[]);
      }
    }
  }
  return contours;
}

/** Explicit path handles/smoothing are authored geometry, not straight construction hints. */
function hasAuthoredCurve(points: unknown[]): boolean {
  return points.some(value => {
    const raw = record(value);
    return raw && (raw.left !== undefined || raw.right !== undefined || raw.smooth === true);
  });
}

function executablePoints(step: Record<string, unknown>): GeometryPoint[] {
  const args = record(step.args);
  if (step.tool === 'photoshop_paint_regions' && Array.isArray(args?.regions)) {
    return args.regions.flatMap(regionValue => {
      const region = record(regionValue);
      if (!Array.isArray(region?.contours)) return [];
      return region.contours.flatMap(contourValue => {
        const contour = record(contourValue);
        if (!Array.isArray(contour?.points)) return [];
        return contour.points.map(point).filter((value): value is GeometryPoint => !!value);
      });
    });
  }
  if (step.tool === 'photoshop_paint_strokes' && Array.isArray(args?.strokes)) {
    return args.strokes.flatMap(strokeValue => {
      const stroke = record(strokeValue);
      if (!Array.isArray(stroke?.points)) return [];
      return stroke.points.map(point).filter((value): value is GeometryPoint => !!value);
    });
  }
  if (step.tool === 'photoshop_paint_dabs' && Array.isArray(args?.dabs)) {
    return args.dabs.flatMap(dabValue => {
      const dab = record(dabValue);
      const center = dab ? point(dab) : undefined;
      const size = dab?.size;
      if (!center || typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return [];
      const radius = size / 2;
      // Axis-aligned witnesses are useful, but not sufficient for slanted
      // boundaries: the exact circular extrema along boundary normals are
      // checked separately in the two-line corridor path below.
      return [center,
        { x: center.x - radius, y: center.y }, { x: center.x + radius, y: center.y },
        { x: center.x, y: center.y - radius }, { x: center.x, y: center.y + radius }];
    });
  }
  if (step.tool === 'photoshop_paint_stamp_instances' && Array.isArray(args?.instances)) {
    return args.instances.flatMap(instanceValue => {
      const instance = record(instanceValue);
      const center = instance ? point(instance) : undefined;
      const size = instance?.size;
      if (!center || typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return [];
      // Stamp profiles may be asymmetric/rotated. Until profile-local opaque bounds
      // are available here, the declared size is treated as a conservative circular
      // support envelope, which is invariant under angle/flip.
      const radius = size / 2;
      return [center,
        { x: center.x - radius, y: center.y }, { x: center.x + radius, y: center.y },
        { x: center.x, y: center.y - radius }, { x: center.x, y: center.y + radius }];
    });
  }
  return [];
}

function executablePointPayloadIssue(step: Record<string, unknown>): string | undefined {
  const args = record(step.args);
  const collections = step.tool === 'photoshop_paint_regions'
    ? { outer: args?.regions, outerName: 'regions', innerName: 'contours' }
    : step.tool === 'photoshop_paint_strokes'
      ? { outer: args?.strokes, outerName: 'strokes', innerName: undefined }
      : undefined;
  if (step.tool === 'photoshop_paint_dabs') {
    if (!Array.isArray(args?.dabs) || args.dabs.length === 0) return 'photoshop_paint_dabs has no executable dabs';
    for (const dabValue of args.dabs) {
      const dab = record(dabValue);
      const center = dab ? point(dab) : undefined;
      const size = dab?.size;
      if (!center || typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
        return 'photoshop_paint_dabs requires finite x/y and explicit positive size for exact footprint validation';
      }
    }
    return undefined;
  }
  if (step.tool === 'photoshop_paint_stamp_instances') {
    if (!Array.isArray(args?.instances) || args.instances.length === 0) return 'photoshop_paint_stamp_instances has no executable instances';
    for (const instanceValue of args.instances) {
      const instance = record(instanceValue);
      const center = instance ? point(instance) : undefined;
      const size = instance?.size;
      if (!center || typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
        return 'photoshop_paint_stamp_instances requires finite x/y and explicit positive size for exact footprint validation';
      }
    }
    return undefined;
  }
  if (!collections) return undefined;
  if (!Array.isArray(collections.outer) || collections.outer.length === 0) {
    return `${String(step.tool)} has no executable ${collections.outerName}`;
  }
  const pointLists: unknown[] = [];
  for (const itemValue of collections.outer) {
    const item = record(itemValue);
    if (!item) return `${String(step.tool)} contains a non-object ${collections.outerName} entry`;
    if (collections.innerName) {
      const inner = item[collections.innerName];
      if (!Array.isArray(inner) || inner.length === 0) return `${String(step.tool)} region has no executable contours`;
      for (const contourValue of inner) {
        const contour = record(contourValue);
        if (!contour || !Array.isArray(contour.points) || contour.points.length === 0) {
          return `${String(step.tool)} contour has no executable points`;
        }
        pointLists.push(contour.points);
      }
    } else {
      if (!Array.isArray(item.points) || item.points.length === 0) return `${String(step.tool)} stroke has no executable points`;
      pointLists.push(item.points);
    }
  }
  for (const list of pointLists) {
    try { bezierCriticalPoints(list as unknown[]); }
    catch { return `${String(step.tool)} contains a non-finite executable point or Bezier handle`; }
  }
  return undefined;
}

function executableCurvePoints(steps: Array<Record<string, unknown>>, projections: CurveProjection[]): GeometryPoint[] {
  const points: GeometryPoint[] = [];
  for (const step of steps) {
    const args = record(step.args);
    const paths = step.tool === 'photoshop_paint_regions' && Array.isArray(args?.regions)
      ? args.regions.flatMap(value => { const region = record(value); return Array.isArray(region?.contours) ? region.contours : []; })
      : step.tool === 'photoshop_paint_strokes' && Array.isArray(args?.strokes) ? args.strokes : [];
    for (const value of paths) {
      const path = record(value);
      if (!Array.isArray(path?.points) || !hasAuthoredCurve(path.points)) continue;
      points.push(...bezierCriticalPoints(path.points, step.tool === 'photoshop_paint_regions' || path.closed === true, projections));
    }
  }
  return points;
}

function strokeFootprintRadius(stroke: Record<string, unknown>): number | undefined {
  const explicit = stroke.size;
  const dynamics = record(stroke.dynamics);
  if (stroke.dynamics !== undefined && !dynamics) return undefined;
  if (explicit !== undefined && (typeof explicit !== 'number' || !Number.isFinite(explicit) || explicit <= 0)) {
    return undefined;
  }
  const declaredDynamicSize = dynamics?.size;
  if (declaredDynamicSize !== undefined
      && (!Array.isArray(declaredDynamicSize) || declaredDynamicSize.length !== 2
        || !declaredDynamicSize.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0))) {
    return undefined;
  }
  const dynamicSize = declaredDynamicSize as number[] | undefined;
  const candidates = [
    ...(typeof explicit === 'number' ? [explicit] : []),
    ...(dynamicSize ?? []),
  ];
  return candidates.length ? Math.max(...candidates) / 2 : undefined;
}

function offsetByBoundaryNormals(
  centers: GeometryPoint[],
  boundaries: [SceneLineMember, SceneLineMember],
  radius: number,
): GeometryPoint[] {
  const result: GeometryPoint[] = [];
  for (const center of centers) {
    for (const boundary of boundaries) {
      const [a, b] = boundary.points;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (!(length > 1e-9)) continue;
      const nx = -dy / length; const ny = dx / length;
      result.push(
        { x: center.x + nx * radius, y: center.y + ny * radius },
        { x: center.x - nx * radius, y: center.y - ny * radius },
      );
    }
  }
  return result;
}

/** A circular dab/stamp reaches its extrema along each corridor boundary normal.
 * Four cardinal witnesses alone miss diagonal escapes along slanted boundaries.
 * The declared stamp diameter remains a conservative, rotation-invariant bound.
 */
function executableCircularFootprintPoints(
  steps: Array<Record<string, unknown>>,
  boundaries: [SceneLineMember, SceneLineMember],
): GeometryPoint[] {
  const points: GeometryPoint[] = [];
  for (const step of steps) {
    const args = record(step.args);
    const values = step.tool === 'photoshop_paint_dabs' ? args?.dabs
      : step.tool === 'photoshop_paint_stamp_instances' ? args?.instances : undefined;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const item = record(value);
      const center = item ? point(item) : undefined;
      const size = item?.size;
      if (center && typeof size === 'number' && Number.isFinite(size) && size > 0) {
        points.push(...offsetByBoundaryNormals([center], boundaries, size / 2));
      }
    }
  }
  return points;
}

function executableStrokeFootprintPoints(
  steps: Array<Record<string, unknown>>,
  boundaries: [SceneLineMember, SceneLineMember],
): { points: GeometryPoint[]; issue?: string } {
  const points: GeometryPoint[] = [];
  const projections = corridorProjections(boundaries);
  for (const step of steps) {
    if (step.tool !== 'photoshop_paint_strokes') continue;
    const args = record(step.args);
    if (!Array.isArray(args?.strokes)) continue;
    for (const strokeValue of args.strokes) {
      const stroke = record(strokeValue);
      if (!stroke || !Array.isArray(stroke.points)) continue;
      const radius = strokeFootprintRadius(stroke);
      if (radius === undefined) {
        return { points: [], issue: 'photoshop_paint_strokes requires explicit positive size or dynamics.size for exact footprint validation' };
      }
      const centers = bezierCriticalPoints(stroke.points, stroke.closed === true, projections);
      points.push(...offsetByBoundaryNormals(centers, boundaries, radius));
    }
  }
  return { points };
}

function corridorProjections(boundaries: SceneLineMember[]): CurveProjection[] {
  const horizontal = boundaries.every(line => Math.abs(line.points[1].y-line.points[0].y) > 1e-9);
  const vertical = boundaries.every(line => Math.abs(line.points[1].x-line.points[0].x) > 1e-9);
  if (!horizontal && !vertical) return [];
  const sides = boundaries.map(({ points: [a,b] }) => {
    const slope = horizontal ? (b.x-a.x)/(b.y-a.y) : (b.y-a.y)/(b.x-a.x);
    return horizontal ? { x:1, y:-slope, offset:slope*a.y-a.x }
      : { x:-slope, y:1, offset:slope*a.x-a.y };
  });
  // The corridor's min/max ordering changes where its boundaries intersect.
  return [...sides, { x:sides[0].x-sides[1].x, y:sides[0].y-sides[1].y,
    offset:sides[0].offset-sides[1].offset, crossings:true }];
}

function dependencyBoundaryLines(binding: GeometryBinding, scene: SceneGeometryModel): SceneLineMember[] {
  const dependencyIds = new Set(binding.dependencies);
  return scene.line_families
    .flatMap(family => family.members)
    .filter(member => dependencyIds.has(member.id));
}

function projectionDependencySnapshot(scene: SceneGeometryModel): string {
  // These facts invalidate all generated document-space coordinates, even when
  // the line members themselves were not edited in the next scene revision.
  return JSON.stringify({
    source_frame: scene.source_frame,
    kind: scene.projection.kind,
    horizon: scene.projection.horizon ?? null,
  });
}

function lineDependencySnapshots(scene: SceneGeometryModel, dependencyIds: Iterable<string>): Record<string, string> {
  const wanted = new Set(dependencyIds);
  const snapshots: Record<string, string> = { __projection__: projectionDependencySnapshot(scene) };
  for (const member of scene.line_families.flatMap(family => family.members)) {
    if (!wanted.has(member.id)) continue;
    snapshots[member.id] = JSON.stringify(member);
  }
  return snapshots;
}

export interface DerivedBoundarySection {
  y: number;
  left: GeometryPoint;
  right: GeometryPoint;
  dependency_ids: [string, string];
}

function lineXAtY(line: SceneLineMember, y: number): number | undefined {
  const [a, b] = line.points;
  const dy = b.y - a.y;
  if (!Number.isFinite(y) || Math.abs(dy) < 1e-9) return undefined;
  const x = a.x + ((y - a.y) * (b.x - a.x)) / dy;
  return Number.isFinite(x) ? x : undefined;
}

function lineIntersection(a: SceneLineMember, b: SceneLineMember): GeometryPoint | undefined {
  const [p1, p2] = a.points; const [p3, p4] = b.points;
  const dx1 = p2.x - p1.x; const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x; const dy2 = p4.y - p3.y;
  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) < 1e-9) return undefined;
  const rx = p3.x - p1.x; const ry = p3.y - p1.y;
  const t = (rx * dy2 - ry * dx2) / denominator;
  const result = { x: p1.x + t * dx1, y: p1.y + t * dy1 };
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : undefined;
}

function dependencyLinesByFamily(
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): Array<{ family_id: string; lines: [SceneLineMember, SceneLineMember] }> | undefined {
  const wanted = new Set(binding.dependencies);
  const groups = scene.line_families
    .map(family => ({ family_id: family.id, lines: family.members.filter(member => wanted.has(member.id)) }))
    .filter(group => group.lines.length > 0);
  if (groups.length !== 2 || groups.some(group => group.lines.length !== 2)) return undefined;
  if (new Set(groups.flatMap(group => group.lines.map(line => line.id))).size !== 4) return undefined;
  return groups as Array<{ family_id: string; lines: [SceneLineMember, SceneLineMember] }>;
}

function dependencyLineFamilies(
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): Array<{ family_id: string; lines: SceneLineMember[] }> | undefined {
  const wanted = new Set(binding.dependencies);
  const groups = scene.line_families
    .map(family => ({ family_id: family.id, lines: family.members.filter(member => wanted.has(member.id)) }))
    .filter(group => group.lines.length > 0);
  if (groups.length !== 2 || groups.some(group => group.lines.length < 2)) return undefined;
  const used = groups.flatMap(group => group.lines.map(line => line.id));
  if (new Set(used).size !== used.length || used.length !== wanted.size) return undefined;
  return groups;
}

function lineParameter(line: SceneLineMember, value: GeometryPoint): number {
  const [a, b] = line.points;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  return lengthSquared > 1e-12 ? ((value.x - a.x) * dx + (value.y - a.y) * dy) / lengthSquared : Number.NaN;
}

export interface DerivedLineFamilyGrid {
  cells: Array<{ points: GeometryPoint[]; dependency_ids: [string, string, string, string] }>;
  dependency_ids: string[];
}

/** Derives every adjacent cell in a two-family analytic line grid. */
export function deriveLineFamilyGrid(
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): DerivedLineFamilyGrid | undefined {
  const groups = dependencyLineFamilies(binding, scene);
  if (!groups) return undefined;
  const ordered = groups.map((group, index) => {
    const reference = groups[index === 0 ? 1 : 0].lines[0];
    const ranked = group.lines.map(line => {
      const intersection = lineIntersection(line, reference);
      return intersection ? { line, rank: lineParameter(reference, intersection) } : undefined;
    });
    if (ranked.some(value => !value || !Number.isFinite(value.rank))) return undefined;
    return (ranked as Array<{ line: SceneLineMember; rank: number }>).sort((a, b) => a.rank - b.rank).map(value => value.line);
  });
  if (ordered.some(value => !value)) return undefined;
  const [first, second] = ordered as [SceneLineMember[], SceneLineMember[]];
  const cells: DerivedLineFamilyGrid['cells'] = [];
  for (let a = 0; a < first.length - 1; a += 1) {
    for (let b = 0; b < second.length - 1; b += 1) {
      const lines = [first[a], first[a + 1], second[b], second[b + 1]] as const;
      const corners = [
        lineIntersection(lines[0], lines[2]), lineIntersection(lines[1], lines[2]),
        lineIntersection(lines[1], lines[3]), lineIntersection(lines[0], lines[3]),
      ];
      if (corners.some(value => !value)) return undefined;
      cells.push({
        points: corners as GeometryPoint[],
        dependency_ids: lines.map(line => line.id) as [string, string, string, string],
      });
    }
  }
  return { cells, dependency_ids: groups.flatMap(group => group.lines.map(line => line.id)).sort() };
}

/** Derives a four-corner module from two pairs of analytic lines in two line families. */
export function deriveLineFamilyModule(
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): { points: GeometryPoint[]; dependency_ids: string[] } | undefined {
  const groups = dependencyLinesByFamily(binding, scene);
  if (!groups) return undefined;
  const points = groups[0].lines.flatMap(a => groups[1].lines.map(b => lineIntersection(a, b)));
  if (points.some(value => !value)) return undefined;
  const corners = points as GeometryPoint[];
  const center = {
    x: corners.reduce((sum, value) => sum + value.x, 0) / corners.length,
    y: corners.reduce((sum, value) => sum + value.y, 0) / corners.length,
  };
  corners.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  return {
    points: corners,
    dependency_ids: groups.flatMap(group => group.lines.map(line => line.id)).sort(),
  };
}

/**
 * Deterministically projects a horizontal facade/module section from the two
 * analytic boundary dependencies of an exact Geometry Binding. This is a pure
 * derivation primitive: callers cannot supply the derived x coordinates, and a
 * later scene revision therefore produces new coordinates from the changed
 * source lines instead of carrying stale dependent geometry forward.
 */
export function deriveBoundarySection(
  binding: GeometryBinding,
  scene: SceneGeometryModel,
  y: number,
): DerivedBoundarySection | undefined {
  const boundaries = dependencyBoundaryLines(binding, scene);
  if (boundaries.length !== 2) return undefined;
  const projected = boundaries.map(boundary => ({ boundary, x: lineXAtY(boundary, y) }));
  if (projected.some(entry => entry.x === undefined)) return undefined;
  projected.sort((a, b) => (a.x as number) - (b.x as number));
  return {
    y,
    left: { x: projected[0].x as number, y },
    right: { x: projected[1].x as number, y },
    dependency_ids: [projected[0].boundary.id, projected[1].boundary.id],
  };
}

/**
 * Replaces only the dependent x coordinates of an explicitly horizontal,
 * two-point stroke with coordinates derived from the binding's two analytic
 * boundary lines. The caller still chooses the independent section y; the
 * compiler owns the perspective-dependent endpoints that Photoshop receives.
 * Other stroke shapes are deliberately left untouched for normal validation.
 */
export function materializeBoundaryDerivedStrokeSections(
  steps: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): ExecutableGeometryProvenance | undefined {
  if (!binding.exact_geometry_completion_relevant) return undefined;
  // Materialization mutates the caller's action payload. Validate every sibling
  // stroke before the first rewrite; a later malformed point must not leave an
  // earlier stroke reprojected or produce partial exact-geometry provenance.
  if (steps.some(step => step.tool === 'photoshop_paint_strokes'
      && executablePointPayloadIssue(step))) return undefined;
  const dependencyIds = new Set<string>();
  let derivedPointCount = 0;
  let touched = false;
  for (const step of steps) {
    if (step.tool !== 'photoshop_paint_strokes') continue;
    const args = record(step.args);
    if (!Array.isArray(args?.strokes)) continue;
    for (const strokeValue of args.strokes) {
      const stroke = record(strokeValue);
      if (!Array.isArray(stroke?.points) || stroke.points.length !== 2) continue;
      if (hasAuthoredCurve(stroke.points)) continue;
      const first = point(stroke.points[0]);
      const second = point(stroke.points[1]);
      if (!first || !second || Math.abs(first.y - second.y) > 1e-9) continue;
      const section = deriveBoundarySection(binding, scene, first.y);
      if (!section) continue;
      stroke.points = [section.left, section.right];
      for (const id of section.dependency_ids) dependencyIds.add(id);
      derivedPointCount += 2;
      touched = true;
    }
  }
  if (!touched) return undefined;
  const sortedDependencyIds = [...dependencyIds].sort();
  return {
    mode: 'derived-boundary-sections',
    owner_id: binding.owner_id,
    scene_geometry_model_id: scene.model_id,
    scene_geometry_revision: scene.revision,
    dependency_ids: sortedDependencyIds,
    dependency_snapshots: lineDependencySnapshots(scene, sortedDependencyIds),
    tools: ['photoshop_paint_strokes'],
    dispatched_point_count: derivedPointCount,
    tolerance_px: 0,
  };
}

/**
 * Deterministically materializes a four-point facade/module band whose contour
 * contains exactly two horizontal levels with one left/right point at each level.
 * The caller owns the independent y levels and winding; x coordinates are used
 * only to identify left/right membership, then replaced from the analytic
 * boundary dependencies. Ambiguous/non-band contours are left for fail-closed
 * executable validation rather than guessed into a construction.
 */
export function materializeBoundaryDerivedRegionBands(
  steps: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): ExecutableGeometryProvenance | undefined {
  if (!binding.exact_geometry_completion_relevant) return undefined;
  if (steps.some(step => step.tool === 'photoshop_paint_regions'
      && executablePointPayloadIssue(step))) return undefined;
  const dependencyIds = new Set<string>();
  let derivedPointCount = 0;
  let touched = false;
  for (const step of steps) {
    if (step.tool !== 'photoshop_paint_regions') continue;
    const args = record(step.args);
    if (!Array.isArray(args?.regions)) continue;
    for (const regionValue of args.regions) {
      const region = record(regionValue);
      if (!Array.isArray(region?.contours)) continue;
      for (const contourValue of region.contours) {
        const contour = record(contourValue);
        if (!Array.isArray(contour?.points) || contour.points.length !== 4) continue;
        if (hasAuthoredCurve(contour.points)) continue;
        const points = contour.points.map(point);
        if (points.some(value => !value)) continue;
        const validPoints = points as GeometryPoint[];
        const levels = new Map<number, number[]>();
        validPoints.forEach((value, index) => {
          const indexes = levels.get(value.y) ?? [];
          indexes.push(index);
          levels.set(value.y, indexes);
        });
        if (levels.size !== 2 || [...levels.values()].some(indexes => indexes.length !== 2)) continue;
        const replacements = [...validPoints];
        let derivable = true;
        for (const [y, indexes] of levels) {
          const [a, b] = indexes;
          if (Math.abs(validPoints[a].x - validPoints[b].x) < 1e-9) {
            derivable = false;
            break;
          }
          const section = deriveBoundarySection(binding, scene, y);
          if (!section) {
            derivable = false;
            break;
          }
          const leftIndex = validPoints[a].x < validPoints[b].x ? a : b;
          const rightIndex = leftIndex === a ? b : a;
          replacements[leftIndex] = section.left;
          replacements[rightIndex] = section.right;
          for (const id of section.dependency_ids) dependencyIds.add(id);
        }
        if (!derivable) continue;
        contour.points = replacements;
        derivedPointCount += 4;
        touched = true;
      }
    }
  }
  if (!touched) return undefined;
  const sortedDependencyIds = [...dependencyIds].sort();
  return {
    mode: 'derived-boundary-sections',
    owner_id: binding.owner_id,
    scene_geometry_model_id: scene.model_id,
    scene_geometry_revision: scene.revision,
    dependency_ids: sortedDependencyIds,
    dependency_snapshots: lineDependencySnapshots(scene, sortedDependencyIds),
    tools: ['photoshop_paint_regions'],
    dispatched_point_count: derivedPointCount,
    tolerance_px: 0,
  };
}

/**
 * Materializes an exact four-corner module from two analytic line families.
 * Caller coordinates choose only winding; every dispatched corner is a line-family
 * intersection derived from the accepted Scene Geometry Model.
 */
export function materializeLineFamilyDerivedModules(
  steps: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): ExecutableGeometryProvenance | undefined {
  if (!binding.exact_geometry_completion_relevant) return undefined;
  const grid = deriveLineFamilyGrid(binding, scene);
  if (grid && grid.cells.length > 1) {
    const contours: Array<Record<string, unknown>> = [];
    for (const step of steps) {
      if (step.tool !== 'photoshop_paint_regions') continue;
      const args = record(step.args);
      if (!Array.isArray(args?.regions)) continue;
      for (const regionValue of args.regions) {
        const region = record(regionValue);
        if (!Array.isArray(region?.contours) || region.contours.length !== 1) return undefined;
        const contour = record(region.contours[0]);
        if (!Array.isArray(contour?.points) || contour.points.length !== 4 || contour.points.map(point).some(value => !value)) return undefined;
        if (hasAuthoredCurve(contour.points)) return undefined;
        contours.push(contour);
      }
    }
    if (contours.length !== grid.cells.length) return undefined;
    contours.forEach((contour, index) => { contour.points = grid.cells[index].points; });
    return {
      mode: 'derived-boundary-sections', owner_id: binding.owner_id,
      scene_geometry_model_id: scene.model_id, scene_geometry_revision: scene.revision,
      dependency_ids: grid.dependency_ids,
      dependency_snapshots: lineDependencySnapshots(scene, grid.dependency_ids),
      tools: ['photoshop_paint_regions'], dispatched_point_count: grid.cells.length * 4, tolerance_px: 0,
    };
  }
  const module = deriveLineFamilyModule(binding, scene);
  if (!module) return undefined;
  // A single four-corner module cannot be materialized from multiple region
  // contours: that would silently paint duplicate copies of the same owner.
  // Check before mutating any contour so a rejected payload stays untouched.
  if (regionContours(steps)?.length !== 1) return undefined;
  let touched = false;
  let derivedPointCount = 0;
  for (const step of steps) {
    if (step.tool !== 'photoshop_paint_regions') continue;
    const args = record(step.args);
    if (!Array.isArray(args?.regions)) continue;
    for (const regionValue of args.regions) {
      const region = record(regionValue);
      if (!Array.isArray(region?.contours)) continue;
      for (const contourValue of region.contours) {
        const contour = record(contourValue);
        if (!Array.isArray(contour?.points) || contour.points.length !== 4) continue;
        if (hasAuthoredCurve(contour.points)) continue;
        const supplied = contour.points.map(point);
        if (supplied.some(value => !value)) continue;
        const suppliedPoints = supplied as GeometryPoint[];
        const signedArea = (values: GeometryPoint[]) => values.reduce((sum, value, index) => {
          const next = values[(index + 1) % values.length];
          return sum + value.x * next.y - next.x * value.y;
        }, 0);
        const derived = [...module.points];
        if (Math.sign(signedArea(derived)) !== Math.sign(signedArea(suppliedPoints))) derived.reverse();
        contour.points = derived;
        touched = true;
        derivedPointCount += 4;
      }
    }
  }
  if (!touched) return undefined;
  return {
    mode: 'derived-boundary-sections',
    owner_id: binding.owner_id,
    scene_geometry_model_id: scene.model_id,
    scene_geometry_revision: scene.revision,
    dependency_ids: module.dependency_ids,
    dependency_snapshots: lineDependencySnapshots(scene, module.dependency_ids),
    tools: ['photoshop_paint_regions'],
    dispatched_point_count: derivedPointCount,
    tolerance_px: 0,
  };
}

export function materializeBoundaryDerivedGeometry(
  steps: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
): ExecutableGeometryProvenance | undefined {
  // A derived corridor/module cannot certify a different layer or a second,
  // unmeasured pixel mutation. Refuse before rewriting any caller coordinates.
  if (unverifiedExactPaintStep(steps)) return undefined;
  // A valid stroke must not be rewritten before discovering an invalid region
  // (or vice versa). Reject malformed sibling payloads atomically at this entry.
  if (steps.some(step => executablePointPayloadIssue(step))) return undefined;
  if (steps.some(step => EXACT_LAYER_TRANSFORM_TOOLS.has(String(step.tool)))
      && !steps.every(isExactTransformEvidenceStep)) return undefined;
  const rotate = materializeOrientationDerivedRotate(steps, binding, scene);
  if (rotate) return rotate;
  const multiFamily = materializeLineFamilyDerivedModules(steps, binding, scene);
  if (multiFamily) return multiFamily;
  const stroke = materializeBoundaryDerivedStrokeSections(steps, binding, scene);
  const region = materializeBoundaryDerivedRegionBands(steps, binding, scene);
  if (!stroke) return region;
  if (!region) return stroke;
  return {
    ...stroke,
    dependency_ids: [...new Set([...stroke.dependency_ids, ...region.dependency_ids])].sort(),
    tools: [...new Set([...stroke.tools, ...region.tools])].sort(),
    dispatched_point_count: stroke.dispatched_point_count + region.dispatched_point_count,
  };
}

const EXACT_LAYER_TRANSFORM_TOOLS = new Set([
  'photoshop_fit_layer_to_document',
  'photoshop_move_layer',
  'photoshop_rotate_layer',
  'photoshop_scale_layer',
]);

const EXACT_PAINT_GEOMETRY_TOOLS = new Set([
  'photoshop_paint_regions',
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_paint_stamp_instances',
]);

/** The geometric proof is about one owner's painted pixels, not a layer switch,
 * a new layer or an additional mutation whose coverage is not measured here.
 * Pure reads, brush setup and selection preparation remain valid. */
function unverifiedExactPaintStep(steps: Array<Record<string, unknown>>): string | undefined {
  if (!steps.some(step => EXACT_PAINT_GEOMETRY_TOOLS.has(String(step.tool)))) return undefined;
  // A single owner's exact geometry cannot certify pixels on multiple physical
  // layers. Nor can a partly implicit target be assumed to be the explicit one.
  // All-implicit legacy steps retain their existing separate ownership checks.
  const targets: unknown[] = [];
  for (const step of steps) {
    if (!EXACT_PAINT_GEOMETRY_TOOLS.has(String(step.tool))) continue;
    const args = record(step.args);
    if (step.tool === 'photoshop_paint_regions' && Array.isArray(args?.regions)) {
      for (const regionValue of args.regions) targets.push(record(regionValue)?.layer_id);
    } else {
      targets.push(args?.layer_id);
    }
  }
  const explicit = targets.filter(target => target !== undefined);
  if (explicit.length && explicit.length !== targets.length) return 'mixed explicit and implicit physical paint targets';
  if (explicit.length && !explicit.every(target =>
    typeof target === 'number' && Number.isSafeInteger(target) && target > 0 && target === explicit[0])) {
    return 'conflicting or invalid physical paint targets';
  }
  const unsafe = steps.find(step => {
    const tool = String(step.tool);
    return !EXACT_PAINT_GEOMETRY_TOOLS.has(tool)
      && (tool === 'photoshop_select_layer_by_name'
        || tool === 'photoshop_create_layer'
        || (!VISUAL_MICROPLAN_PREPARE_TOOLS.has(tool) && tool !== 'photoshop_get_preview'));
  });
  return unsafe ? String(unsafe.tool) : undefined;
}

function isExactTransformEvidenceStep(step: Record<string, unknown>): boolean {
  return step.tool === 'photoshop_transform_landmarks'
    || (typeof step.tool === 'string' && EXACT_LAYER_TRANSFORM_TOOLS.has(step.tool));
}

/**
 * Validates the coordinates that will actually be dispatched, rather than accepting
 * a parallel Geometry Binding as proof. This first executable slice is intentionally
 * bounded to exact region/stroke construction whose binding names two analytic
 * boundary lines. Layer transforms fail closed until their actual source bounds /
 * landmarks can be projected through the dispatched transform; metadata alone must
 * not make a hand-guessed transform completion-safe.
 */
export function inspectExecutableGeometry(
  steps: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
  tolerancePx = 2,
): ExecutableGeometryValidationResult {
  if (!binding.exact_geometry_completion_relevant) return { issues: [] };
  // Exact raster evidence must not be weakened by an unbounded caller-supplied
  // tolerance: Infinity or a canvas-sized tolerance can certify distant pixels.
  // The established raster acceptance budget is at most two document pixels.
  if (typeof tolerancePx !== 'number' || !Number.isFinite(tolerancePx)
      || tolerancePx < 0 || tolerancePx > 2) return { issues: [{
    code: 'executable_geometry_unverifiable',
    message: `executable_geometry_unverifiable: owner=${binding.owner_id} exact raster tolerance must be finite and between 0 and 2 px`,
  }] };
  const exactTransforms = steps.filter(step => typeof step.tool === 'string' && EXACT_LAYER_TRANSFORM_TOOLS.has(step.tool));
  if (exactTransforms.length) {
    // The source-bound and orientation oracles do not prove a different layer
    // selection, pixel edit or unrelated mutation before/after the transform.
    // The entire dispatched sequence must be within their verified scope.
    if (!steps.every(isExactTransformEvidenceStep)) return { issues: [{
      code: 'executable_geometry_unverifiable',
      message: `executable_geometry_unverifiable: owner=${binding.owner_id} exact layer transform is mixed with actions outside its verified source/target geometry`,
    }] };
    const orientationValidated = inspectOrientationDerivedRotate(exactTransforms, binding, scene, tolerancePx);
    if (orientationValidated) return orientationValidated;
    const landmarkValidated = inspectLandmarkDerivedTransforms(steps, exactTransforms, binding, scene, tolerancePx);
    if (landmarkValidated) return landmarkValidated;
    return { issues: exactTransforms.map(step => ({
      code: 'executable_geometry_unverifiable',
      message: `executable_geometry_unverifiable: owner=${binding.owner_id} exact geometry cannot validate dispatched ${String(step.tool)} without executable source bounds/landmarks and derived destination geometry`,
    })) };
  }
  const unverifiedPaint = unverifiedExactPaintStep(steps);
  if (unverifiedPaint) return { issues: [{
    code: 'executable_geometry_unverifiable',
    message: `executable_geometry_unverifiable: owner=${binding.owner_id} exact paint geometry cannot certify ${unverifiedPaint} outside its verified layer/pixel scope`,
  }] };
  const malformedPointPayload = steps
    .map(executablePointPayloadIssue)
    .find((issue): issue is string => !!issue);
  if (malformedPointPayload) {
    return { issues: [{
      code: 'executable_geometry_unverifiable',
      message: `executable_geometry_unverifiable: owner=${binding.owner_id} ${malformedPointPayload}`,
    }] };
  }
  const points = steps.flatMap(executablePoints);
  if (!points.length) return { issues: [] };
  const boundaries = dependencyBoundaryLines(binding, scene);
  const familyGrid = deriveLineFamilyGrid(binding, scene);
  if (familyGrid && familyGrid.cells.length > 1) {
    const contours = regionContours(steps);
    // Every derived cell must be represented before a region payload can
    // receive whole-grid executable provenance. A missing or duplicate cell
    // otherwise passes the corner-membership test below unchanged.
    if (steps.some(step => step.tool === 'photoshop_paint_regions')
        && contours?.length !== familyGrid.cells.length) {
      return { issues: [{
        code: 'executable_geometry_constraint_conflict',
        message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched grid contour count=${contours?.length ?? 'unavailable'} does not match derived cell count=${familyGrid.cells.length}`,
      }] };
    }
    if (contours?.length === familyGrid.cells.length) {
      const topologyIssues = contours.flatMap((contour, index) =>
        contourMatchesDerivedCorners(contour, familyGrid.cells[index].points, tolerancePx) ? [] : [{
          code: 'executable_geometry_constraint_conflict' as const,
          message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched grid contour[${index}] does not preserve the ordered derived cell topology (tolerance=${tolerancePx}px)`,
        }]);
      if (topologyIssues.length) return { issues: topologyIssues };
    }
    const curveEnvelopeIssues = regionCurveEnvelopeIssues(
      steps, familyGrid.cells.map(cell => cell.points), binding.owner_id, tolerancePx,
    );
    if (curveEnvelopeIssues.length) return { issues: curveEnvelopeIssues };
    const expected = familyGrid.cells.flatMap(cell => cell.points);
    const issues: ExecutableGeometryIssue[] = [];
    for (const [index, actual] of points.entries()) {
      if (!expected.some(candidate => nearlyEqual(actual.x, candidate.x, tolerancePx) && nearlyEqual(actual.y, candidate.y, tolerancePx))) {
        issues.push({
          code: 'executable_geometry_constraint_conflict',
          message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched geometry point[${index}]=(${actual.x},${actual.y}) does not match a derived two-family grid corner (tolerance=${tolerancePx}px)`,
        });
      }
    }
    return {
      issues,
      ...(issues.length ? {} : { provenance: {
        mode: 'derived-boundary-sections' as const, owner_id: binding.owner_id,
        scene_geometry_model_id: scene.model_id, scene_geometry_revision: scene.revision,
        dependency_ids: familyGrid.dependency_ids,
        dependency_snapshots: lineDependencySnapshots(scene, familyGrid.dependency_ids),
        tools: [...new Set(steps.filter(step => executablePoints(step).length > 0).map(step => String(step.tool)))].sort(),
        dispatched_point_count: points.length, tolerance_px: tolerancePx,
      } }),
    };
  }
  const familyModule = deriveLineFamilyModule(binding, scene);
  if (familyModule && boundaries.length === 4) {
    const issues: ExecutableGeometryIssue[] = [];
    const contours = regionContours(steps);
    if (steps.some(step => step.tool === 'photoshop_paint_regions') && contours?.length !== 1) {
      return { issues: [{
        code: 'executable_geometry_constraint_conflict',
        message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched module contour count=${contours?.length ?? 'unavailable'} does not match expected single module contour`,
      }] };
    }
    if (contours) {
      for (const [index, contour] of contours.entries()) {
        if (!contourMatchesDerivedCorners(contour, familyModule.points, tolerancePx)) {
          issues.push({
            code: 'executable_geometry_constraint_conflict',
            message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched module contour[${index}] does not preserve the ordered derived corner topology (tolerance=${tolerancePx}px)`,
          });
        }
      }
    }
    issues.push(...regionCurveEnvelopeIssues(steps, [familyModule.points], binding.owner_id, tolerancePx));
    for (const [index, actual] of points.entries()) {
      const matchesCorner = familyModule.points.some(expected =>
        nearlyEqual(actual.x, expected.x, tolerancePx) && nearlyEqual(actual.y, expected.y, tolerancePx));
      if (!matchesCorner) {
        issues.push({
          code: 'executable_geometry_constraint_conflict',
          message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched geometry point[${index}]=(${actual.x},${actual.y}) does not match a derived two-family module corner (tolerance=${tolerancePx}px)`,
        });
      }
    }
    const tools = [...new Set(steps
      .filter(step => executablePoints(step).length > 0)
      .map(step => String(step.tool)))].sort();
    return {
      issues,
      ...(issues.length ? {} : { provenance: {
        mode: 'derived-boundary-sections' as const,
        owner_id: binding.owner_id,
        scene_geometry_model_id: scene.model_id,
        scene_geometry_revision: scene.revision,
        dependency_ids: familyModule.dependency_ids,
        dependency_snapshots: lineDependencySnapshots(scene, familyModule.dependency_ids),
        tools,
        dispatched_point_count: points.length,
        tolerance_px: tolerancePx,
      } }),
    };
  }
  if (boundaries.length !== 2) {
    return { issues: [{
      code: 'executable_geometry_unverifiable',
      message: `executable_geometry_unverifiable: owner=${binding.owner_id} exact region/stroke payload requires exactly two bound analytic boundary lines; got ${boundaries.length}`,
    }] };
  }
  const issues: ExecutableGeometryIssue[] = [];
  const pair = boundaries as [SceneLineMember, SceneLineMember];
  const curvePoints = executableCurvePoints(steps, corridorProjections(boundaries));
  const strokeFootprint = executableStrokeFootprintPoints(steps, pair);
  if (strokeFootprint.issue) {
    return { issues: [{ code: 'executable_geometry_unverifiable', message: `executable_geometry_unverifiable: owner=${binding.owner_id} ${strokeFootprint.issue}` }] };
  }
  const circularFootprintPoints = executableCircularFootprintPoints(steps, pair);
  for (const [index, actual] of [...points, ...curvePoints, ...strokeFootprint.points, ...circularFootprintPoints].entries()) {
    const inside = corridorContainsPoint(actual, boundaries[0].points, boundaries[1].points, tolerancePx);
    if (inside !== true) {
      issues.push({
        code: 'executable_geometry_constraint_conflict',
        message: `executable_geometry_constraint_conflict: owner=${binding.owner_id} dispatched geometry point[${index}]=(${actual.x},${actual.y}) is outside the accepted ${boundaries[0].id}/${boundaries[1].id} corridor (tolerance=${tolerancePx}px)`,
      });
    }
  }
  const tools = [...new Set(steps
    .filter(step => executablePoints(step).length > 0)
    .map(step => String(step.tool)))]
    .sort();
  return {
    issues,
    ...(issues.length ? {} : {
      provenance: {
        mode: 'validated-boundary-corridor' as const,
        owner_id: binding.owner_id,
        scene_geometry_model_id: scene.model_id,
        scene_geometry_revision: scene.revision,
        dependency_ids: boundaries.map(boundary => boundary.id).sort(),
        tools,
        dispatched_point_count: points.length,
        tolerance_px: tolerancePx,
      },
    }),
  };
}

export function validateExecutableGeometry(
  steps: Array<Record<string, unknown>>,
  binding: GeometryBinding,
  scene: SceneGeometryModel,
  tolerancePx = 2,
): ExecutableGeometryIssue[] {
  return inspectExecutableGeometry(steps, binding, scene, tolerancePx).issues;
}
