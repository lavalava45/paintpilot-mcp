import { createHash } from 'node:crypto';
import { normalizeIKChains, solveIKChains, type ConstructionIKChain } from './ik-construction.js';
import { CONTOUR_GEOMETRY, smoothClosedContour, ContourGeometryError } from './contour-geometry.js';
import {
  SCENE_SUBJECT_KINDS,
  normalizeSceneOwnershipPlan,
  type SceneSubjectKind,
} from './scene-ownership-plan.js';

type Vec = [number, number, number];
export interface ConstructionPoint {
  id: string;
  object_id: string;
  position: Vec;
  fixed: boolean;
  relative_to?: string;
  axis_to?: string;
}
export interface ConstructionObject {
  id: string;
  subject_kind: SceneSubjectKind;
  origin: Vec;
  rotation: Vec;
  scale: number;
  rigid?: boolean;
}
export interface ConstructionPart {
  id: string;
  object_id: string;
  role: string;
  outline: string[];
  curve: 'linear' | 'smooth';
}
export interface ConstructionConstraint {
  id: string;
  kind:
    | 'distance'
    | 'ratio'
    | 'coincident'
    | 'parallel'
    | 'perpendicular'
    | 'angle'
    | 'midpoint'
    | 'symmetric';
  points: string[];
  value?: number;
  space: 'object' | 'scene';
}
export interface ConstructionModel {
  model_id: string;
  revision: number;
  basis: string;
  tolerance: number;
  objects: ConstructionObject[];
  points: ConstructionPoint[];
  parts: ConstructionPart[];
  constraints: ConstructionConstraint[];
  proportion_checks?: Array<{ id: string; points: string[]; min: number; max: number }>;
  ik_chains?: ConstructionIKChain[];
  camera: {
    kind: 'orthographic' | 'perspective';
    origin: [number, number];
    scale: number;
    distance: number;
    focal_length: number;
  };
}
export interface ConstructionIssue {
  code: string;
  path: string;
  message: string;
  residual?: number;
}
export class ConstructionError extends Error {
  constructor(readonly issues: ConstructionIssue[]) {
    super(issues.map((x) => `${x.path}: ${x.message}`).join('; '));
  }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sub = (a: Vec, b: Vec): Vec => a.map((v, i) => v - b[i]) as Vec;
const dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i], 0);
const length = (a: Vec) => Math.hypot(...a);
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Complete bounded format diagnostics, before numerical work or Photoshop dispatch. */
export function normalizeConstructionModel(value: unknown): ConstructionModel {
  const issues: ConstructionIssue[] = [];
  const fail = (path: string, message: string) =>
    issues.push({ code: 'construction_format_invalid', path, message });
  const obj = (v: unknown, path: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      fail(path, 'Expected object');
      return {};
    }
    return v as Record<string, unknown>;
  };
  const str = (v: unknown, path: string, id = false) => {
    if (
      typeof v !== 'string' ||
      !v.trim() ||
      v.length > (id ? 64 : 2000) ||
      (id && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(v))
    ) {
      fail(
        path,
        id
          ? 'Expected stable id (letters, digits, _ or -; at most 64 characters)'
          : 'Expected nonempty text (at most 2000 characters)'
      );
      return '';
    }
    return v.trim();
  };
  const num = (v: unknown, path: string, fallback = 0) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e6) {
      fail(path, 'Expected finite number, absolute value at most 1000000');
      return fallback;
    }
    return v;
  };
  const vector = (v: unknown, path: string, fallback: Vec = [0, 0, 0]): Vec => {
    if (v === undefined) return [...fallback];
    if (!Array.isArray(v) || ![2, 3].includes(v.length)) {
      fail(path, 'Expected [x,y] or [x,y,z]');
      return [...fallback];
    }
    return [
      num(v[0], `${path}[0]`),
      num(v[1], `${path}[1]`),
      v.length === 3 ? num(v[2], `${path}[2]`) : 0,
    ];
  };
  const rows = (v: unknown, path: string, max: number, min = 1): unknown[] => {
    if (!Array.isArray(v) || v.length < min || v.length > max) {
      fail(path, `Expected ${min}-${max} entries`);
      return [];
    }
    return v;
  };
  const raw = obj(value, 'model');
  const model_id = str(raw.model_id, 'model.model_id', true);
  const revision = num(raw.revision, 'model.revision');
  if (!Number.isSafeInteger(revision) || revision < 1)
    fail('model.revision', 'Expected positive integer');
  const basis = str(raw.basis, 'model.basis');
  const tolerance = raw.tolerance === undefined ? 1e-4 : num(raw.tolerance, 'model.tolerance');
  if (tolerance < 1e-7 || tolerance > 0.01)
    fail('model.tolerance', 'Expected 0.0000001-0.01 in construction units/radians');
  const objects = rows(raw.objects, 'model.objects', 16).map((v, i): ConstructionObject => {
    const p = `model.objects[${i}]`,
      r = obj(v, p);
    const subject_kind = r.subject_kind as SceneSubjectKind;
    if (!SCENE_SUBJECT_KINDS.includes(subject_kind))
      fail(`${p}.subject_kind`, `Choose ${SCENE_SUBJECT_KINDS.join('|')}`);
    const scale = r.scale === undefined ? 1 : num(r.scale, `${p}.scale`);
    if (scale <= 0) fail(`${p}.scale`, 'Expected positive uniform scale');
    if (r.rigid !== undefined && typeof r.rigid !== 'boolean') fail(`${p}.rigid`, 'Expected boolean');
    return {
      id: str(r.id, `${p}.id`, true),
      subject_kind,
      origin: vector(r.origin, `${p}.origin`),
      rotation: vector(r.rotation, `${p}.rotation`),
      scale,
      ...(r.rigid === undefined ? {} : { rigid: r.rigid === true }),
    };
  });
  const points = rows(raw.points, 'model.points', 128).map((v, i): ConstructionPoint => {
    const p = `model.points[${i}]`,
      r = obj(v, p);
    if (r.position === undefined)
      fail(`${p}.position`, 'Expected an initial position; the solver never invents a pose');
    if (r.fixed !== undefined && typeof r.fixed !== 'boolean')
      fail(`${p}.fixed`, 'Expected boolean');
    return {
      id: str(r.id, `${p}.id`, true),
      object_id: str(r.object_id, `${p}.object_id`, true),
      position: vector(r.position, `${p}.position`),
      fixed: r.fixed === true,
      ...(r.relative_to !== undefined
        ? { relative_to: str(r.relative_to, `${p}.relative_to`, true) }
        : {}),
      ...(r.axis_to !== undefined ? { axis_to: str(r.axis_to, `${p}.axis_to`, true) } : {}),
    };
  });
  const parts = rows(raw.parts, 'model.parts', 64).map((v, i): ConstructionPart => {
    const p = `model.parts[${i}]`,
      r = obj(v, p);
    if (r.curve !== undefined && !['linear', 'smooth'].includes(String(r.curve)))
      fail(`${p}.curve`, 'Choose linear|smooth');
    return {
      id: str(r.id, `${p}.id`, true),
      object_id: str(r.object_id, `${p}.object_id`, true),
      role: str(r.role, `${p}.role`),
      outline: rows(r.outline, `${p}.outline`, 64, 3).map((x, j) =>
        str(x, `${p}.outline[${j}]`, true)
      ),
      curve: r.curve === 'smooth' ? 'smooth' : 'linear',
    };
  });
  const counts = {
    distance: 2,
    ratio: 4,
    coincident: 2,
    parallel: 4,
    perpendicular: 4,
    angle: 4,
    midpoint: 3,
    symmetric: 4,
  };
  const constraints = rows(raw.constraints ?? [], 'model.constraints', 128, 0).map(
    (v, i): ConstructionConstraint => {
      const p = `model.constraints[${i}]`,
        r = obj(v, p),
        kind = r.kind as ConstructionConstraint['kind'];
      if (!Object.hasOwn(counts, kind))
        fail(`${p}.kind`, `Choose ${Object.keys(counts).join('|')}`);
      const refs = rows(r.points, `${p}.points`, 4, 2).map((x, j) =>
        str(x, `${p}.points[${j}]`, true)
      );
      if (refs.length !== counts[kind])
        fail(`${p}.points`, `${kind} expects ${counts[kind]} point ids`);
      const needsValue = ['distance', 'ratio', 'angle'].includes(kind);
      const val = needsValue ? num(r.value, `${p}.value`) : undefined;
      if (
        needsValue &&
        (val! < 0 || (kind === 'ratio' && val! <= 0) || (kind === 'angle' && val! > 180))
      )
        fail(
          `${p}.value`,
          'Expected nonnegative distance, positive ratio, or angle in [0,180] degrees'
        );
      if (r.space !== undefined && !['object', 'scene'].includes(String(r.space)))
        fail(`${p}.space`, 'Choose object|scene');
      return {
        id: str(r.id, `${p}.id`, true),
        kind,
        points: refs,
        ...(needsValue ? { value: val } : {}),
        space: r.space === 'scene' ? 'scene' : 'object',
      };
    }
  );
  for (const [name, list] of [
    ['objects', objects],
    ['points', points],
    ['parts', parts],
    ['constraints', constraints],
  ] as const) {
    const seen = new Set<string>();
    for (const r of list) {
      if (seen.has(r.id)) fail(`model.${name}`, `Duplicate id ${r.id}`);
      seen.add(r.id);
    }
  }
  const objectIds = new Set(objects.map((x) => x.id)),
    pointMap = new Map(points.map((x) => [x.id, x]));
  for (const p of points)
    if (!objectIds.has(p.object_id))
      fail(`model.points.${p.id}.object_id`, `Unknown object ${p.object_id}`);
  const done = new Set<string>();
  const visit = (id: string, stack: Set<string>) => {
    if (done.has(id)) return;
    if (stack.has(id)) {
      fail(`model.points.${id}`, 'Cyclic relative_to/axis_to dependencies');
      return;
    }
    const p = pointMap.get(id);
    if (!p) return;
    stack.add(id);
    if (p.axis_to && !p.relative_to)
      fail(`model.points.${id}.axis_to`, 'axis_to requires relative_to');
    for (const ref of [p.relative_to, p.axis_to].filter((s): s is string => !!s)) {
      if (pointMap.get(ref)?.object_id !== p.object_id)
        fail(`model.points.${id}`, 'Relative/axis points must exist in the same object');
      else visit(ref, stack);
    }
    stack.delete(id);
    done.add(id);
  };
  for (const p of points) visit(p.id, new Set());
  for (const p of parts) {
    if (!objectIds.has(p.object_id))
      fail(`model.parts.${p.id}.object_id`, `Unknown object ${p.object_id}`);
    for (const id of p.outline)
      if (!pointMap.has(id) || pointMap.get(id)?.object_id !== p.object_id)
        fail(`model.parts.${p.id}.outline`, `Point ${id} must belong to ${p.object_id}`);
  }
  for (const c of constraints) {
    for (const id of c.points)
      if (!pointMap.has(id)) fail(`model.constraints.${c.id}.points`, `Unknown point ${id}`);
    if (c.space === 'object' && new Set(c.points.map((id) => pointMap.get(id)?.object_id)).size > 1)
      fail(`model.constraints.${c.id}.space`, 'Cross-object relations require space=scene');
  }
  const proportion_checks = rows(raw.proportion_checks ?? [], 'model.proportion_checks', 32, 0).map((v, i) => {
    const path = `model.proportion_checks[${i}]`, r = obj(v, path);
    const refs = rows(r.points, `${path}.points`, 4, 4).map((x, j) => str(x, `${path}.points[${j}]`, true));
    for (const ref of refs) if (!pointMap.has(ref)) fail(`${path}.points`, `Unknown point ${ref}`);
    if (new Set(refs.map(ref => pointMap.get(ref)?.object_id)).size > 1)
      fail(`${path}.points`, 'Proportion checks use four landmarks of one object in intrinsic units');
    const min = num(r.min, `${path}.min`), max = num(r.max, `${path}.max`);
    if (min <= 0 || max < min) fail(path, 'Choose explicit positive minimum/maximum length ratio from the brief/reference or artistic intent');
    return { id: str(r.id, `${path}.id`, true), points: refs, min, max };
  });
  if (new Set(proportion_checks.map(c => c.id)).size !== proportion_checks.length)
    fail('model.proportion_checks', 'Duplicate check id');
  const ik_chains = normalizeIKChains(raw.ik_chains, points, issues);
  for (const o of objects.filter(o => o.rigid)) {
    if (points.some(p => p.object_id === o.id && !p.fixed))
      fail(`model.objects.${o.id}.rigid`, 'Rigid objects require fixed intrinsic landmarks/offsets; change origin/rotation for a pose edit, not component coordinates');
  }
  const driven = new Set(ik_chains.flatMap((chain) => chain.points.slice(1)));
  if (points.filter((x) => !x.fixed && !driven.has(x.id)).length > 32)
    fail(
      'model.points',
      'At most 32 general movable landmarks in addition to bounded IK-driven points; mark established contour offsets fixed'
    );
  const cr = obj(raw.camera, 'model.camera');
  if (!['orthographic', 'perspective'].includes(String(cr.kind)))
    fail('model.camera.kind', 'Choose orthographic|perspective');
  const origin = vector(cr.origin, 'model.camera.origin');
  const camera = {
    kind: cr.kind as ConstructionModel['camera']['kind'],
    origin: [origin[0], origin[1]] as [number, number],
    scale: num(cr.scale, 'model.camera.scale'),
    distance: cr.distance === undefined ? 1 : num(cr.distance, 'model.camera.distance'),
    focal_length:
      cr.focal_length === undefined ? 1 : num(cr.focal_length, 'model.camera.focal_length'),
  };
  if (camera.scale <= 0 || camera.distance <= 0 || camera.focal_length <= 0)
    fail('model.camera', 'Scale, distance and focal_length must be positive');
  if (camera.kind === 'perspective' && (cr.distance === undefined || cr.focal_length === undefined))
    fail('model.camera', 'Perspective requires explicit distance and focal_length');
  if (issues.length) throw new ConstructionError(issues);
  // This validates independent owners and compound subject decomposition too.
  constructionOwnershipPlan({
    model_id,
    revision,
    basis,
    tolerance,
    objects,
    points,
    parts,
    constraints,
    camera,
  });
  return {
    model_id,
    revision,
    basis,
    tolerance,
    objects,
    points,
    parts,
    constraints,
    camera,
    ...(proportion_checks.length ? { proportion_checks } : {}),
    ...(ik_chains.length ? { ik_chains } : {}),
  };
}

export function constructionOwnershipPlan(model: ConstructionModel) {
  return normalizeSceneOwnershipPlan({
    plan_id: model.model_id,
    units: model.parts.map((p) => ({
      semantic_id: p.id,
      owner_id: p.id,
      role: p.role,
      editability:
        model.objects.find((o) => o.id === p.object_id)?.subject_kind === 'continuous-field'
          ? 'continuous-field'
          : 'independent',
    })),
    objects: model.objects.map((o) => ({
      object_id: o.id,
      subject_kind: o.subject_kind,
      kind: ['single-component', 'continuous-field'].includes(o.subject_kind)
        ? 'single-part'
        : 'compound-object',
      component_semantic_ids: model.parts.filter((p) => p.object_id === o.id).map((p) => p.id),
    })),
  });
}
function scenePoint(p: Vec, o: ConstructionObject): Vec {
  let [x, y, z] = p.map((v) => v * o.scale);
  const [rx, ry, rz] = o.rotation.map((v) => (v * Math.PI) / 180);
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return [x + o.origin[0], y + o.origin[1], z + o.origin[2]];
}
function intrinsicPositions(positions: Map<string, Vec>, points: Map<string, ConstructionPoint>) {
  const resolved = new Map<string, Vec>();
  const resolve = (id: string): Vec => {
    if (resolved.has(id)) return resolved.get(id)!;
    const point = points.get(id)!,
      offset = positions.get(id)!;
    let p = [...offset] as Vec;
    if (point.relative_to) {
      const origin = resolve(point.relative_to);
      if (point.axis_to) {
        const direction = sub(resolve(point.axis_to), origin),
          l = length(direction);
        if (l < 1e-10)
          throw new ConstructionError([
            {
              code: 'construction_axis_degenerate',
              path: `model.points.${id}.axis_to`,
              message: 'Initial axis needs a nonzero length; choose an explicit pose',
            },
          ]);
        const x = direction.map((v) => v / l) as Vec,
          ref: Vec = Math.abs(x[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
        const y0 = cross(ref, x),
          y = y0.map((v) => v / length(y0)) as Vec,
          z = cross(x, y);
        p = origin.map((v, i) => v + x[i] * offset[0] + y[i] * offset[1] + z[i] * offset[2]) as Vec;
      } else p = origin.map((v, i) => v + offset[i]) as Vec;
    }
    resolved.set(id, p);
    return p;
  };
  for (const id of points.keys()) resolve(id);
  return resolved;
}
function residual(
  c: ConstructionConstraint,
  positions: Map<string, Vec>,
  points: Map<string, ConstructionPoint>,
  objects: Map<string, ConstructionObject>
): number[] {
  const p = c.points.map((id) =>
    c.space === 'scene'
      ? scenePoint(positions.get(id)!, objects.get(points.get(id)!.object_id)!)
      : positions.get(id)!
  );
  const a = sub(p[1], p[0]),
    b = p.length === 4 ? sub(p[3], p[2]) : ([0, 0, 0] as Vec);
  const la = length(a),
    lb = length(b);
  switch (c.kind) {
    case 'distance':
      return [la - c.value!];
    case 'ratio':
      return [lb <= 1e-10 ? 1e3 : la / lb - c.value!];
    case 'coincident':
      return a;
    case 'midpoint':
      return p[0].map((v, i) => v - (p[1][i] + p[2][i]) / 2);
    case 'parallel':
      return la * lb <= 1e-10 ? [1e3, 1e3, 1e3] : cross(a, b).map((v) => v / (la * lb));
    case 'perpendicular':
      return [la * lb <= 1e-10 ? 1e3 : dot(a, b) / (la * lb)];
    case 'angle':
      return [
        la * lb <= 1e-10
          ? 1e3
          : Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb)))) -
            (c.value! * Math.PI) / 180,
      ];
    case 'symmetric': {
      const axis = sub(p[3], p[2]),
        l2 = dot(axis, axis);
      if (l2 <= 1e-20) return [1e3, 1e3, 1e3];
      const t = dot(sub(p[0], p[2]), axis) / l2;
      return p[1].map((v, i) => v - (2 * (p[2][i] + t * axis[i]) - p[0][i]));
    }
  }
}
function linearSolve(a: number[][], b: number[]): number[] {
  const n = b.length,
    m = a.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    if (Math.abs(m[k][k]) < 1e-18) return Array(n).fill(0);
    for (let i = k + 1; i < n; i++) {
      const t = m[i][k] / m[k][k];
      for (let j = k; j <= n; j++) m[i][j] -= t * m[k][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n];
    for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}
export function solveConstruction(value: unknown) {
  const model = normalizeConstructionModel(value),
    pointMap = new Map(model.points.map((p) => [p.id, p])),
    objectMap = new Map(model.objects.map((o) => [o.id, o]));
  const positions = new Map(model.points.map((p) => [p.id, [...p.position] as Vec]));
  const ikIssues: ConstructionIssue[] = [];
  const ik = model.ik_chains?.length
    ? solveIKChains(model.ik_chains, positions, model.tolerance, ikIssues)
    : undefined;
  if (ikIssues.length) throw new ConstructionError(ikIssues);
  const driven = new Set((model.ik_chains ?? []).flatMap((chain) => chain.points.slice(1)));
  // Flat models remain flat; 3D freedom is enabled only by explicitly supplied depth/rotations.
  const dimensions =
    model.ik_chains?.some((chain) => chain.dimension === '3d') ||
    model.points.some((p) => p.position[2] !== 0) ||
    model.objects.some((o) => o.rotation[0] !== 0 || o.rotation[1] !== 0)
      ? 3
      : 2;
  const vars = model.points
    .filter((p) => !p.fixed && !driven.has(p.id))
    .flatMap((p) => Array.from({ length: dimensions }, (_, axis) => ({ id: p.id, axis })));
  const evaluate = () => {
    const intrinsic = intrinsicPositions(positions, pointMap);
    return model.constraints.flatMap((c) => residual(c, intrinsic, pointMap, objectMap));
  };
  const energy = (r: number[]) => r.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-3,
    iterations = 0;
  for (; iterations < 48 && vars.length; iterations++) {
    const r = evaluate();
    if (r.every((v) => Math.abs(v) <= model.tolerance)) break;
    const jac = vars.map((v) => {
      const p = positions.get(v.id)!,
        old = p[v.axis],
        h = 1e-6 * Math.max(1, Math.abs(old));
      p[v.axis] = old + h;
      const shifted = evaluate();
      p[v.axis] = old;
      return shifted.map((x, i) => (x - r[i]) / h);
    });
    const a = jac.map((col, i) =>
        jac.map((other, j) => dotArray(col, other) + (i === j ? lambda : 0))
      ),
      b = jac.map((col) => -dotArray(col, r));
    const step = linearSolve(a, b),
      previous = vars.map((v) => positions.get(v.id)![v.axis]);
    vars.forEach((v, i) => {
      positions.get(v.id)![v.axis] += step[i];
    });
    const next = evaluate();
    if (next.every(Number.isFinite) && energy(next) < energy(r))
      lambda = Math.max(1e-9, lambda / 3);
    else {
      vars.forEach((v, i) => {
        positions.get(v.id)![v.axis] = previous[i];
      });
      lambda = Math.min(1e9, lambda * 10);
    }
  }
  const issues: ConstructionIssue[] = [];
  const intrinsic = intrinsicPositions(positions, pointMap);
  for (const c of model.constraints) {
    const error = Math.max(...residual(c, intrinsic, pointMap, objectMap).map(Math.abs));
    if (!Number.isFinite(error) || error > model.tolerance)
      issues.push({
        code: 'construction_constraint_unsatisfied',
        path: `model.constraints.${c.id}`,
        message:
          'Constraint did not solve from the supplied pose; revise conflicting conditions/anchors or the initial pose',
        residual: error,
      });
  }
  for (const c of model.proportion_checks ?? []) {
    const [a,b,d,e] = c.points.map(id => intrinsic.get(id)!);
    const denominator = length(sub(d,e)), measured = length(sub(a,b)) / denominator;
    if (!Number.isFinite(measured) || denominator <= model.tolerance || measured < c.min - model.tolerance || measured > c.max + model.tolerance)
      issues.push({ code: 'construction_proportion_out_of_range', path: `model.proportion_checks.${c.id}`,
        message: `Measured ratio=${measured}; chosen range=[${c.min},${c.max}]. Correct the construction; no proportions are inferred from the object name.` });
  }
  if (issues.length) throw new ConstructionError(issues);
  const projected = new Map<string, { x: number; y: number }>();
  for (const p of model.points) {
    const world = scenePoint(intrinsic.get(p.id)!, objectMap.get(p.object_id)!),
      c = model.camera,
      depth = c.distance + world[2];
    if (c.kind === 'perspective' && depth <= 1e-6) {
      issues.push({
        code: 'construction_projection_invalid',
        path: `model.points.${p.id}`,
        message: 'Point lies at or behind the camera plane',
      });
      continue;
    }
    const scale = c.scale * (c.kind === 'perspective' ? c.focal_length / depth : 1);
    const x = c.origin[0] + world[0] * scale,
      y = c.origin[1] + world[1] * scale;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.max(Math.abs(x), Math.abs(y)) > 1e7) {
      issues.push({
        code: 'construction_projection_invalid',
        path: `model.points.${p.id}`,
        message: 'Projected coordinate is outside the bounded numeric range',
      });
      continue;
    }
    projected.set(p.id, { x, y });
  }
  if (issues.length) throw new ConstructionError(issues);
  const parts = model.parts.map((p) => {
    const control = p.outline.map((id) => projected.get(id)!);
    let contour = control;
    if (p.curve === 'smooth') {
      try {
        contour = smoothClosedContour(control);
      } catch (error) {
        if (!(error instanceof ContourGeometryError)) throw error;
        issues.push({
          code: 'construction_curve_budget',
          path: `model.parts.${p.id}.outline`,
          message: error.message,
        });
      }
    }
    const area =
      Math.abs(
        contour.reduce((sum, v, i) => {
          const n = contour[(i + 1) % contour.length];
          return sum + v.x * n.y - n.x * v.y;
        }, 0)
      ) / 2;
    if (area < 1e-6)
      issues.push({
        code: 'construction_outline_degenerate',
        path: `model.parts.${p.id}`,
        message: 'Closed outline has no projected area',
      });
    const bounds = {
      left: Math.min(...contour.map((v) => v.x)),
      top: Math.min(...contour.map((v) => v.y)),
      right: Math.max(...contour.map((v) => v.x)),
      bottom: Math.max(...contour.map((v) => v.y)),
    };
    return { ...p, contour, bounds, target_sha256: digest(contour) };
  });
  if (issues.length) throw new ConstructionError(issues);
  const solved_model = {
    ...model,
    points: model.points.map((p) => ({ ...p, position: positions.get(p.id)! })),
  };
  return {
    model: solved_model,
    source_model: model,
    ...(ik ? { ik } : {}),
    contour_geometry: CONTOUR_GEOMETRY,
    model_sha256: digest(model),
    iterations,
    parts,
    landmarks: model.points.map((p) => ({
      id: p.id,
      position: intrinsic.get(p.id)!,
      projected: projected.get(p.id)!,
    })),
    basis: model.basis,
    artistic_quality_verified: false,
    pixel_geometry_verified: false,
  };
}
export function constructionReviewTarget(record: Record<string, unknown>) {
  if (!record.object_construction_model || !record.construction_provenance) return undefined;
  const provenance = record.construction_provenance as {
    model_id: string;
    revision: number;
    part_id: string;
    target_sha256: string;
  };
  try {
    const solved = solveConstruction(record.object_construction_model);
    const part = solved.parts.find((p) => p.id === provenance.part_id);
    if (
      !part ||
      part.target_sha256 !== provenance.target_sha256 ||
      solved.model.model_id !== provenance.model_id ||
      solved.model.revision !== provenance.revision
    )
      throw new Error('Saved target identity disagrees with the compiled construction');
    return {
      ...provenance,
      bounds: part.bounds,
      expected_landmarks: solved.landmarks
        .filter((p) => part.outline.includes(p.id))
        .slice(0, 16)
        .map((p) => ({ id: p.id, ...p.projected })),
      landmark_count: part.outline.length,
      pixel_geometry_verified: false,
      review:
        'Compare this construction target with the exact delivered pixels: proportions, connected contours and occlusion. A successful solver or filled fields do not prove the painted object matches. Name mismatches before dependent detail.',
    };
  } catch {
    return {
      model_id: provenance.model_id,
      revision: provenance.revision,
      part_id: provenance.part_id,
      pixel_geometry_verified: false,
      comparison_state: 'target_unavailable',
      review:
        'Inspect the delivered image honestly; unavailable construction metadata is not pixel proof.',
    };
  }
}
function dotArray(a: number[], b: number[]) {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

// Shared complete public schema; neither source inspection nor a second contract is needed.
const number = { type: 'number', minimum: -1e6, maximum: 1e6 };
const id = { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' };
const vec = { type: 'array', minItems: 2, maxItems: 3, items: number };
const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export const CONSTRUCTION_MODEL_SCHEMA = object(
  {
    model_id: id,
    revision: { type: 'integer', minimum: 1 },
    basis: {
      type: 'string',
      minLength: 1,
      maxLength: 2000,
      description:
        'Source of chosen proportions: reference, accepted construction, or explicit artistic choice. Not pixel proof.',
    },
    tolerance: { type: 'number', minimum: 1e-7, maximum: 0.01 },
    objects: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: object(
        {
          id,
          subject_kind: { type: 'string', enum: [...SCENE_SUBJECT_KINDS] },
          origin: vec,
          rotation: { ...vec, description: 'Degrees [x,y,z], applied X then Y then Z.' },
          scale: { type: 'number', exclusiveMinimum: 0 },
          rigid: { type: 'boolean', description: 'Fixed intrinsic shape shared by all component layers; pose edits change only this object origin/rotation.' },
        },
        ['id', 'subject_kind']
      ),
    },
    points: {
      type: 'array',
      minItems: 1,
      maxItems: 128,
      items: object(
        {
          id,
          object_id: id,
          position: vec,
          relative_to: id,
          axis_to: {
            ...id,
            description:
              'With relative_to, offsets use X along the parent→axis_to direction; contours follow changing landmark pose.',
          },
          fixed: {
            type: 'boolean',
            description:
              'Keep these coordinates/relative offsets exactly; at most 32 others may move.',
          },
        },
        ['id', 'object_id', 'position']
      ),
    },
    parts: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: object(
        {
          id,
          object_id: id,
          role: { type: 'string', minLength: 4 },
          outline: { type: 'array', minItems: 3, maxItems: 64, items: id },
          curve: {
            type: 'string',
            enum: ['linear', 'smooth'],
            description:
              'smooth preserves a closed Catmull-Rom shape via cubic Bezier subdivision at 0.25 canvas-pixel tolerance, max 256 output points; reduce projected size/curvature or choose linear if the bounded contour cannot meet that accuracy.',
          },
        },
        ['id', 'object_id', 'role', 'outline']
      ),
    },
    constraints: {
      type: 'array',
      maxItems: 128,
      items: object(
        {
          id,
          kind: {
            type: 'string',
            enum: [
              'distance',
              'ratio',
              'coincident',
              'parallel',
              'perpendicular',
              'angle',
              'midpoint',
              'symmetric',
            ],
          },
          points: { type: 'array', minItems: 2, maxItems: 4, items: id },
          value: number,
          space: {
            type: 'string',
            enum: ['object', 'scene'],
            description:
              'object uses intrinsic coordinates (default); scene includes object poses/scale. Ratio compares p0-p1 with p2-p3; midpoint p0=(p1+p2)/2; symmetry p0,p1 about axis p2-p3; angle in degrees.',
          },
        },
        ['id', 'kind', 'points']
      ),
    },
    proportion_checks: {
      type: 'array', maxItems: 32,
      description: 'Category-independent checks of length(A,B)/length(C,D) in intrinsic object units. Artist chooses plausible bounds; the solver does not invent them.',
      items: object({ id, points: { type: 'array', minItems: 4, maxItems: 4, items: id },
        min: { type: 'number', exclusiveMinimum: 0 }, max: { type: 'number', exclusiveMinimum: 0 } }, ['id','points','min','max']),
    },
    ik_chains: {
      type: 'array',
      maxItems: 8,
      description:
        'Articulated contact/pose construction in object-local coordinates. Authored bone lengths stay fixed; only selected targets move. Chains are solved before generic constraints; no anatomy or pose target is invented.',
      items: object(
        {
          id,
          points: {
            type: 'array',
            minItems: 2,
            maxItems: 17,
            uniqueItems: true,
            items: id,
            description:
              'Absolute landmark ids root-to-tip, in one object. Root fixed or driven by a parent chain; all others non-fixed and driven by only this chain. Relative contour controls may follow these joints.',
          },
          target: {
            ...vec,
            description:
              'Explicit object-local contact [x,y] or [x,y,z]; retain original bone lengths. Unreachable/limited poses return an actionable blocker.',
          },
          dimension: {
            type: 'string',
            enum: ['2d', '3d'],
            description:
              'Inferred from target/landmark depth if omitted. 2d requires local z=0; object rotation/projection still apply normally.',
          },
          bend_limits: {
            type: 'array',
            maxItems: 15,
            items: { type: 'number', minimum: 0, maximum: 180 },
            description:
              'One maximum deflection from straight in degrees per interior joint (points.length-2). 2d symmetric bend limits; 3d ball-joint cones. Omit for 180-degree free bends; 0 means straight.',
          },
        },
        ['id', 'points', 'target']
      ),
    },
    camera: object(
      {
        kind: { type: 'string', enum: ['orthographic', 'perspective'] },
        origin: { type: 'array', minItems: 2, maxItems: 2, items: number },
        scale: { type: 'number', exclusiveMinimum: 0 },
        distance: { type: 'number', exclusiveMinimum: 0 },
        focal_length: { type: 'number', exclusiveMinimum: 0 },
      },
      ['kind', 'origin', 'scale']
    ),
  },
  ['model_id', 'revision', 'basis', 'objects', 'points', 'parts', 'camera']
);
export const CONSTRUCTION_PASS_SCHEMA = object(
  {
    model: CONSTRUCTION_MODEL_SCHEMA,
    model_id: id,
    revision: { type: 'integer', minimum: 1 },
    part_id: id,
    reshape_object_ids: { type: 'array', maxItems: 16, items: id, description: 'Explicit shape correction, not a rigid pose edit. Rebuild every affected component and review actual pixels.' },
    color: object(
      {
        red: { type: 'number', minimum: 0, maximum: 255 },
        green: { type: 'number', minimum: 0, maximum: 255 },
        blue: { type: 'number', minimum: 0, maximum: 255 },
      },
      ['red', 'green', 'blue']
    ),
  },
  ['part_id', 'color']
);

export function validateRigidRevision(previous: ConstructionModel, current: ConstructionModel, reshape: unknown = []) {
  if (!Array.isArray(reshape) || reshape.length > 16 || reshape.some(id => typeof id !== 'string' || !previous.objects.some(o => o.id === id)))
    throw new ConstructionError([{ code: 'construction_reshape_invalid', path: 'construction.reshape_object_ids', message: 'Explicitly name existing objects whose shape is intentionally being corrected' }]);
  const shape = (m: ConstructionModel, id: string) => ({
    scale: m.objects.find(o => o.id === id)?.scale,
    points: m.points.filter(p => p.object_id === id).sort((a,b) => a.id.localeCompare(b.id)),
    parts: m.parts.filter(p => p.object_id === id).sort((a,b) => a.id.localeCompare(b.id)),
  });
  const issues: ConstructionIssue[] = [];
  for (const object of previous.objects.filter(o => o.rigid && !reshape.includes(o.id))) {
    if (!current.objects.find(o => o.id === object.id)?.rigid || digest(shape(previous, object.id)) !== digest(shape(current, object.id)))
      issues.push({ code: 'construction_rigid_shape_changed', path: `model.objects.${object.id}`,
        message: 'Keep intrinsic shape/scale and component membership for a rigid pose edit. Change shared object origin/rotation; explicitly name reshape_object_ids only for intentional reconstruction.' });
  }
  if (issues.length) throw new ConstructionError(issues);
}

export interface ConstructionContext {
  construction_bindings?: Array<{ owner_id: string; bounds?: { left: number; top: number; right: number; bottom: number } }>;
  logical_layer_owners?: Array<Record<string, unknown>>;
  scene_ownership_plan?: Record<string, unknown> | null;
}
export function expandConstructionPass(
  raw: Record<string, unknown>,
  context: ConstructionContext,
  resolve: (modelId: string) => ConstructionModel | null
) {
  const request = raw.construction as Record<string, unknown>;
  const error = (code: string, path: string, message: string): never => {
    throw new ConstructionError([{ code, path, message }]);
  };
  if (!request || typeof request !== 'object' || Array.isArray(request))
    error(
      'construction_request_invalid',
      'next_pass.construction',
      'Expected a model or durable model_id, one part_id and color'
    );
  if (
    (Array.isArray(raw.actions) && raw.actions.length) ||
    raw.restore_anchor_operation_id !== undefined
  )
    error(
      'construction_actions_conflict',
      'next_pass.actions',
      'Construction owns the generated actions; do not mix authored actions or anchor restore'
    );
  let model: ConstructionModel;
  if (request.model !== undefined) {
    model = normalizeConstructionModel(request.model);
    if (
      (request.model_id !== undefined && request.model_id !== model.model_id) ||
      (request.revision !== undefined && request.revision !== model.revision)
    )
      error(
        'construction_identity_conflict',
        'next_pass.construction',
        'Explicit model id/revision disagrees with the supplied model'
      );
    const previous = resolve(model.model_id);
    if (previous) validateRigidRevision(previous, model, request.reshape_object_ids);
    if (
      previous &&
      (model.revision < previous.revision ||
        (model.revision === previous.revision && digest(model) !== digest(previous)))
    )
      error(
        'construction_revision_conflict',
        'next_pass.construction.model.revision',
        'Retain model identity and advance revision when changing proportions/pose; never overwrite an existing revision'
      );
  } else {
    if (typeof request.model_id !== 'string')
      error(
        'construction_model_required',
        'next_pass.construction.model_id',
        'Supply model once, then its durable model_id'
      );
    const found = resolve(String(request.model_id));
    if (!found)
      error(
        'construction_model_unavailable',
        'next_pass.construction.model_id',
        'No completed current-document construction has this id; supply the model inline'
      );
    model = normalizeConstructionModel(found);
    if (request.revision !== undefined && request.revision !== model.revision)
      error(
        'construction_revision_stale',
        'next_pass.construction.revision',
        `Current revision is ${model.revision}; do not paint from stale geometry`
      );
  }
  const solved = solveConstruction(model),
    part = solved.parts.find((p) => p.id === request.part_id);
  if (!part)
    error(
      'construction_part_unknown',
      'next_pass.construction.part_id',
      `Choose ${model.parts.map((p) => p.id).join(', ')}`
    );
  const color = request.color as Record<string, unknown>;
  if (
    !color ||
    !['red', 'green', 'blue'].every(
      (k) =>
        typeof color[k] === 'number' &&
        Number.isFinite(color[k]) &&
        Number(color[k]) >= 0 &&
        Number(color[k]) <= 255
    )
  )
    error(
      'construction_color_required',
      'next_pass.construction.color',
      'Choose explicit RGB values in [0,255]; geometry does not invent color'
    );
  const matches = (context.logical_layer_owners ?? []).filter(
    (o) => o.hypothesis_id === part!.id && o.temporary !== true
  );
  if (matches.length > 1)
    error(
      'construction_owner_ambiguous',
      'next_pass.construction.part_id',
      'Part has multiple durable owners; recover physical ownership first'
    );
  const owner = matches[0],
    layerId = owner?.layer_id;
  if (owner && (typeof layerId !== 'number' || !Number.isSafeInteger(layerId) || layerId <= 0))
    error(
      'construction_owner_invalid',
      'next_pass.construction.part_id',
      'Current owner has no valid physical layer id'
    );
  const supplied = raw.logical_layer as Record<string, unknown> | undefined;
  if (
    supplied &&
    (supplied.hypothesis_id !== part!.id ||
      (supplied.layer_id !== undefined && supplied.layer_id !== layerId) ||
      supplied.decision !== (owner ? 'continue-logical-layer' : 'create-new'))
  )
    error(
      'construction_owner_conflict',
      'next_pass.logical_layer',
      'Authored owner/layer/decision must match the selected construction part and its actual durable binding'
    );
  const previousBounds = context.construction_bindings?.find(b => b.owner_id === part!.id)?.bounds;
  const reviewBounds = previousBounds ? {
    left: Math.min(part!.bounds.left, previousBounds.left), top: Math.min(part!.bounds.top, previousBounds.top),
    right: Math.max(part!.bounds.right, previousBounds.right), bottom: Math.max(part!.bounds.bottom, previousBounds.bottom),
  } : part!.bounds;
  if (raw.region_bounds !== undefined) {
    const bounds = raw.region_bounds as Record<string, number>;
    if (!bounds || !['left','top','right','bottom'].every(k => Number.isFinite(bounds[k]))
      || bounds.left > reviewBounds.left || bounds.top > reviewBounds.top || bounds.right < reviewBounds.right || bounds.bottom < reviewBounds.bottom)
      error('construction_review_bounds_conflict', 'next_pass.region_bounds', 'Review bounds must include both old and new component extents; omit them to derive the union');
  }
  const plan = constructionOwnershipPlan(model);
  if (context.scene_ownership_plan) plan.plan_id = String(context.scene_ownership_plan.plan_id);
  if (owner && raw.action_class !== undefined && raw.action_class !== 'REPLACE')
    error('construction_rebuild_action_conflict', 'next_pass.action_class', 'Rebuilding an owned component replaces its old pixels; use REPLACE or omit the class');
  const target = owner ? layerId : '$steps.construction_layer.details.layerId';
  const actions: Record<string, unknown>[] = [];
  if (!owner)
    actions.push({
      id: 'construction_layer',
      tool: 'photoshop_create_layer',
      args: { name: part!.role },
    });
  actions.push({
    id: 'construction_paint',
    tool: 'photoshop_paint_regions',
    args: {
      document_id: raw.document_id,
      ...(owner ? { replace_contents: true } : {}),
      regions: [
        {
          id: part!.id,
          layer_id: target,
          color,
          contours: [{ points: part!.contour, closed: true }],
        },
      ],
    },
  });
  return {
    pass: {
      ...raw,
      ...(owner ? { action_class: 'REPLACE', risk: 'high' } : {}),
      actions,
      scene_ownership_plan: raw.scene_ownership_plan ?? plan,
      layer_separation_check: raw.layer_separation_check ?? {
        change_kind: owner ? 'continuation' : 'new-object',
        substantial: true,
        rollback_value: owner ? 'moderate' : 'high',
        independent_adjustment_expected: true,
        reasons: ['One separately editable construction component'],
      },
      region_bounds: raw.region_bounds ?? reviewBounds,
      logical_layer: {
        decision: owner ? 'continue-logical-layer' : 'create-new',
        hypothesis_id: part!.id,
        hypothesis: part!.role,
        rollback_value: owner ? 'moderate' : 'high',
        expected_independent_rollback: true,
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
        ...(owner ? { layer_id: layerId } : { layer_name: part!.role }),
        ...supplied,
      },
    },
    model: solved.source_model,
    provenance: {
      model_id: model.model_id,
      revision: model.revision,
      part_id: part!.id,
      target_sha256: part!.target_sha256,
      bounds: part!.bounds,
      model_sha256: solved.model_sha256,
      ...(solved.ik ? { ik: solved.ik } : {}),
      contour_geometry: CONTOUR_GEOMETRY,
      pixel_geometry_verified: false,
    },
  };
}
