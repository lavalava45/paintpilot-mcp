import { Chain2D, Chain3D, Bone2D, Bone3D, V2, V3 } from 'ikts';
import type { ConstructionPoint, ConstructionIssue } from './object-construction.js';

// Project-authored bounded adapter; IK.ts / Fullik / Caliko / FABRIK attribution:
// THIRD_PARTY_NOTICES.md and licenses/ikts-LICENSE.txt, licenses/ikts-NOTICE.txt.
type Vec = [number, number, number];
export interface ConstructionIKChain {
  id: string;
  points: string[];
  target: Vec;
  dimension: '2d' | '3d';
  bend_limits: number[];
}
export const IK_CONSTRUCTION = {
  library: 'ikts',
  version: '1.3.7',
  algorithm: 'FABRIK',
  max_iterations: 64,
} as const;

/** Collect format/ownership/graph failures before any numerical work. */
export function normalizeIKChains(
  value: unknown,
  points: ConstructionPoint[],
  issues: ConstructionIssue[]
) {
  const fail = (path: string, message: string) =>
    issues.push({ code: 'construction_ik_format_invalid', path, message });
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) {
    fail('model.ik_chains', 'Supply 0..8 articulated chains');
    return [];
  }
  const pointMap = new Map(points.map((p) => [p.id, p]));
  const chains: ConstructionIKChain[] = value.map((row, i) => {
    const path = `model.ik_chains[${i}]`,
      r = (row && typeof row === 'object' && !Array.isArray(row) ? row : {}) as Record<
        string,
        unknown
      >;
    const id =
      typeof r.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(r.id) ? r.id : '';
    if (!id) fail(path + '.id', 'Supply a stable chain id, at most 64 characters');
    const ids = Array.isArray(r.points)
      ? r.points.filter((p): p is string => typeof p === 'string')
      : [];
    if (
      ids.length < 2 ||
      ids.length > 17 ||
      ids.length !== (r.points as unknown[] | undefined)?.length ||
      new Set(ids).size !== ids.length
    )
      fail(path + '.points', 'Supply 2..17 distinct existing landmark ids in root-to-tip order');
    const t = Array.isArray(r.target) ? r.target : [];
    if (
      ![2, 3].includes(t.length) ||
      t.some((v) => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e6)
    )
      fail(
        path + '.target',
        'Supply object-local [x,y] or [x,y,z], finite and within +/-1000000; no artistic target is invented'
      );
    const target: Vec = [t[0] as number, t[1] as number, t.length === 3 ? (t[2] as number) : 0];
    const dimension =
      r.dimension ??
      (target[2] !== 0 || ids.some((id) => pointMap.get(id)?.position[2] !== 0) ? '3d' : '2d');
    if (!['2d', '3d'].includes(String(dimension))) fail(path + '.dimension', 'Choose 2d|3d');
    const limits = r.bend_limits ?? Array(Math.max(0, ids.length - 2)).fill(180);
    if (
      !Array.isArray(limits) ||
      limits.length !== Math.max(0, ids.length - 2) ||
      limits.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 180)
    )
      fail(
        path + '.bend_limits',
        'One angle in [0,180] degrees per interior joint; 0 means straight, 180 free; omit for free joints'
      );
    for (const [j, id] of ids.entries()) {
      const p = pointMap.get(id);
      if (!p) {
        fail(path + `.points[${j}]`, `Unknown landmark ${id}`);
        continue;
      }
      if (p.object_id !== pointMap.get(ids[0])?.object_id)
        fail(path + `.points[${j}]`, 'All chain landmarks must belong to one object');
      if (p.relative_to || p.axis_to)
        fail(
          path + `.points[${j}]`,
          'Chain landmarks must be absolute object-local coordinates; relative contour controls may follow them'
        );
      if (j > 0 && p.fixed)
        fail(
          path + `.points[${j}]`,
          'Driven chain landmarks must not be fixed; fix only the root or connect it to a parent chain'
        );
      if (dimension === '2d' && p.position[2] !== 0)
        fail(path + `.points[${j}]`, '2d chains require local z=0; use 3d for depth');
      if (j > 0) {
        const previous = pointMap.get(ids[j - 1]);
        if (previous && Math.hypot(...p.position.map((v, k) => v - previous.position[k])) < 1e-6)
          fail(path + `.points[${j}]`, 'Every authored bone must have positive length >=0.000001');
      }
    }
    if (dimension === '2d' && target[2] !== 0)
      fail(path + '.target', '2d target requires z=0; use 3d for depth');
    return {
      id,
      points: ids,
      target,
      dimension: dimension as '2d' | '3d',
      bend_limits: Array.isArray(limits) ? limits : [],
    };
  });
  const ids = new Set<string>(),
    writers = new Map<string, string>();
  for (const c of chains) {
    if (ids.has(c.id)) fail('model.ik_chains', `Duplicate chain id ${c.id}`);
    ids.add(c.id);
    for (const point of c.points.slice(1)) {
      if (writers.has(point))
        fail(
          `model.ik_chains.${c.id}.points`,
          `Landmark ${point} is driven by multiple chains; only roots may share a parent landmark`
        );
      writers.set(point, c.id);
    }
  }
  const byId = new Map(chains.map((c) => [c.id, c])),
    done = new Set<string>(),
    ordered: ConstructionIKChain[] = [];
  const visit = (c: ConstructionIKChain, stack: Set<string>) => {
    if (done.has(c.id)) return;
    if (stack.has(c.id)) {
      fail(`model.ik_chains.${c.id}`, 'Cyclic parent-chain roots');
      return;
    }
    stack.add(c.id);
    const parent = writers.get(c.points[0]);
    if (parent) visit(byId.get(parent)!, stack);
    else if (pointMap.get(c.points[0])?.fixed !== true)
      fail(`model.ik_chains.${c.id}.points[0]`, 'Root must be fixed or driven by another chain');
    stack.delete(c.id);
    done.add(c.id);
    ordered.push(c);
  };
  chains.forEach((c) => visit(c, new Set()));
  return ordered;
}

/** Root stays pinned; authored lengths are invariant, and unreachable/unsolved targets fail closed. */
export function solveIKChains(
  chains: ConstructionIKChain[],
  positions: Map<string, Vec>,
  tolerance: number,
  issues: ConstructionIssue[]
) {
  const authored = new Map([...positions].map(([id, p]) => [id, [...p] as Vec]));
  const results = [];
  for (const spec of chains) {
    const initial = spec.points.map((id) => authored.get(id)!);
    const lengths = initial
      .slice(1)
      .map((p, i) => Math.hypot(...p.map((v, k) => v - initial[i][k])));
    const root = positions.get(spec.points[0])!,
      target = spec.target;
    const reach = Math.hypot(...target.map((v, i) => v - root[i])),
      total = lengths.reduce((a, b) => a + b, 0),
      minimum = Math.max(0, 2 * Math.max(...lengths) - total);
    const path = `model.ik_chains.${spec.id}.target`;
    if (spec.dimension === '2d' && Math.abs(root[2]) > tolerance) {
      issues.push({
        code: 'construction_ik_plane_conflict',
        path: `model.ik_chains.${spec.id}.dimension`,
        message:
          'The parent-driven root has nonzero local depth; use dimension=3d or revise the parent target to keep this 2d chain at z=0',
      });
      continue;
    }
    if (reach > total + tolerance || reach < minimum - tolerance) {
      issues.push({
        code: 'construction_ik_unreachable',
        path,
        message: `Target distance ${reach} is outside authored reach [${minimum},${total}]; move target/root or explicitly revise the authored lengths`,
        residual: Math.max(reach - total, minimum - reach),
      });
      continue;
    }
    const points: Vec[] = [];
    try {
      if (spec.dimension === '2d') {
        const chain = new Chain2D();
        chain.setMaxIterationAttempts(64);
        chain.setMinIterationChange(tolerance / 100);
        chain.setSolveDistanceThreshold(tolerance / 2);
        chain.precision = tolerance / 10;
        const direction = (i: number) =>
          new V2(initial[i + 1][0] - initial[i][0], initial[i + 1][1] - initial[i][1]);
        chain.addBone(new Bone2D(new V2(root[0], root[1]), undefined, direction(0), lengths[0]));
        for (let i = 1; i < lengths.length; i++)
          chain.addConsecutiveBone(
            direction(i),
            lengths[i],
            spec.bend_limits[i - 1],
            spec.bend_limits[i - 1]
          );
        chain.setFixedBaseMode(true);
        chain.solveForTarget(new V2(target[0], target[1]));
        points.push(
          [chain.bones[0].start.x, chain.bones[0].start.y, 0],
          ...chain.bones.map((b) => [b.end.x, b.end.y, 0] as Vec)
        );
      } else {
        const chain = new Chain3D();
        chain.setMaxIterationAttempts(64);
        chain.setMinIterationChange(tolerance / 100);
        chain.setSolveDistanceThreshold(tolerance / 2);
        chain.precision = tolerance / 10;
        const direction = (i: number) =>
          new V3(
            initial[i + 1][0] - initial[i][0],
            initial[i + 1][1] - initial[i][1],
            initial[i + 1][2] - initial[i][2]
          );
        chain.addBone(new Bone3D(new V3(...root), undefined, direction(0), lengths[0]));
        for (let i = 1; i < lengths.length; i++)
          chain.addConsecutiveRotorConstrainedBone(
            direction(i),
            lengths[i],
            spec.bend_limits[i - 1]
          );
        chain.setFixedBaseMode(true);
        chain.solveForTarget(new V3(...target));
        points.push(
          [chain.bones[0].start.x, chain.bones[0].start.y, chain.bones[0].start.z],
          ...chain.bones.map((b) => [b.end.x, b.end.y, b.end.z] as Vec)
        );
      }
    } catch (error) {
      issues.push({
        code: 'construction_ik_solver_failed',
        path,
        message: `IK solve failed: ${error instanceof Error ? error.message : String(error)}. Revise the initial pose/limits or target; no pose was accepted.`,
      });
      continue;
    }
    const residual = Math.hypot(...points[points.length - 1].map((v, i) => v - target[i]));
    const boneErrors = lengths.map((l, i) =>
      Math.abs(Math.hypot(...points[i + 1].map((v, k) => v - points[i][k])) - l)
    );
    const rootError = Math.hypot(...points[0].map((v, i) => v - root[i]));
    const bendErrors = spec.bend_limits.map((limit, i) => {
      const a = points[i + 1].map((v, k) => v - points[i][k]),
        b = points[i + 2].map((v, k) => v - points[i + 1][k]);
      const angle =
        (Math.acos(
          Math.max(
            -1,
            Math.min(1, a.reduce((s, v, k) => s + v * b[k], 0) / lengths[i] / lengths[i + 1])
          )
        ) *
          180) /
        Math.PI;
      return Math.max(0, angle - limit);
    });
    if (
      points.some((p) => p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6)) ||
      !Number.isFinite(residual) ||
      residual > tolerance ||
      rootError > tolerance ||
      boneErrors.some((e) => !Number.isFinite(e) || e > tolerance) ||
      bendErrors.some((e) => !Number.isFinite(e) || e > 1e-5)
    ) {
      issues.push({
        code: 'construction_ik_unsatisfied',
        path,
        message:
          'Target/root/length/bend limits did not solve within tolerance; revise the initial pose, contact target or limits. No stretching or nearest-pose acceptance.',
        residual,
      });
      continue;
    }
    spec.points.slice(1).forEach((id, i) => positions.set(id, points[i + 1]));
    results.push({
      id: spec.id,
      dimension: spec.dimension,
      target: spec.target,
      endpoint: points[points.length - 1],
      bone_lengths: lengths,
      residual,
    });
  }
  return {
    ...IK_CONSTRUCTION,
    chains: results,
    pixel_geometry_verified: false,
    artistic_quality_verified: false,
  };
}
