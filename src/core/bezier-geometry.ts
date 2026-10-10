import type { GeometryPoint } from './scene-geometry-model.js';

export interface CurveProjection { x: number; y: number; offset?: number; crossings?: boolean }

function scalarValue(values: number[], t: number): number {
  const u = 1 - t;
  return u*u*u*values[0] + 3*u*u*t*values[1] + 3*u*t*t*values[2] + t*t*t*values[3];
}

function scalarParameters(values: number[], crossings: boolean): number[] {
  const [p0, p1, p2, p3] = values;
  const a = -p0 + 3*p1 - 3*p2 + p3;
  const b = 2*(p0 - 2*p1 + p2);
  const c = p1 - p0;
  if (![a,b,c].every(Number.isFinite)) throw new Error('Non-finite Bezier polynomial');
  const ts = [0,1];
  const add = (t: number) => { if (Number.isFinite(t) && t > 0 && t < 1) ts.push(t); };
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) add(-c/b);
  } else {
    const discriminant = b*b - 4*a*c;
    if (!Number.isFinite(discriminant)) throw new Error('Non-finite Bezier discriminant');
    if (discriminant >= 0) {
      const q = -0.5*(b + (b < 0 ? -1 : 1)*Math.sqrt(discriminant));
      add(q/a);
      if (q !== 0) add(c/q);
    }
  }
  if (crossings) {
    const knots = [...ts].sort((a,b) => a-b);
    for (let i=1; i<knots.length; i++) {
      let lo = knots[i-1], hi = knots[i];
      const start = scalarValue(values,lo), end = scalarValue(values,hi);
      if (Math.abs(start) < 1e-10) add(lo);
      if (Math.abs(end) < 1e-10) add(hi);
      if (Math.sign(start) === Math.sign(end)) continue;
      for (let j=0; j<48; j++) {
        const mid = (lo+hi)/2;
        if (Math.sign(scalarValue(values,mid)) === Math.sign(start)) lo = mid;
        else hi = mid;
      }
      add((lo+hi)/2);
    }
  }
  return ts;
}

/** Actual cubic extrema; handles are finite control positions, not visible endpoints. */
export function bezierCriticalPoints(
  rawPoints: unknown[], closed = false, projections: CurveProjection[] = [],
): GeometryPoint[] {
  const points = rawPoints.map((value, index) => {
    const p = value as { x: number; y: number; left?: number[]; right?: number[] };
    if (!p || ![p.x,p.y].every(v => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error(`points[${index}] has a non-finite anchor`);
    }
    for (const key of ['left','right'] as const) {
      const handle = p[key];
      if (handle !== undefined && (!Array.isArray(handle) || handle.length !== 2
        || !handle.every(v => typeof v === 'number' && Number.isFinite(v)))) {
        throw new Error(`points[${index}].${key} has a non-finite Bezier handle`);
      }
    }
    return p;
  });
  const result = points.map(p => ({ x:p.x, y:p.y }));
  const axes: CurveProjection[] = [{ x:1, y:0 }, { x:0, y:1 }, ...projections];
  for (let i=0; i<(closed ? points.length : points.length-1); i++) {
    const a = points[i], b = points[(i+1)%points.length];
    const controls = [[a.x,a.y],a.right ?? [a.x,a.y],b.left ?? [b.x,b.y],[b.x,b.y]];
    for (const axis of axes) {
      const values = controls.map(p => axis.x*p[0] + axis.y*p[1] + (axis.offset ?? 0));
      for (const t of scalarParameters(values,Boolean(axis.crossings))) {
        if (t === 0 || t === 1) continue;
        const point = { x:scalarValue(controls.map(p=>p[0]),t), y:scalarValue(controls.map(p=>p[1]),t) };
        if (![point.x,point.y].every(Number.isFinite)) throw new Error('Non-finite Bezier extent');
        result.push(point);
      }
    }
  }
  return result;
}
