import { expect, it, vi } from 'vitest';
import {
  ConstructionError,
  solveConstruction,
  normalizeConstructionModel,
  CONSTRUCTION_MODEL_SCHEMA,
} from '../src/core/object-construction.js';
import {
  compileGuardCycle,
  collectSchemaErrors,
  type GuardCycleCompilerStore,
} from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

function model() {
  const length = Math.sqrt(5);
  const points: Array<{
    id: string;
    object_id: string;
    position: number[];
    fixed: boolean;
    relative_to?: string;
    axis_to?: string;
  }> = [
    { id: 'root', object_id: 'linkage', position: [0, 0], fixed: true },
    { id: 'hinge', object_id: 'linkage', position: [2, 1], fixed: false },
    { id: 'tip', object_id: 'linkage', position: [4, 0], fixed: false },
  ];
  for (const [prefix, relative_to, axis_to] of [
    ['upper', 'root', 'hinge'],
    ['lower', 'hinge', 'tip'],
  ])
    [
      [0, -0.15],
      [length, -0.15],
      [length, 0.15],
      [0, 0.15],
    ].forEach((position, i) =>
      points.push({
        id: prefix + i,
        object_id: 'linkage',
        position,
        fixed: true,
        relative_to,
        axis_to,
      })
    );
  return {
    model_id: 'linkage-study',
    revision: 1,
    basis: 'Artist-selected mechanical linkage, lengths chosen from the authored pose',
    objects: [
      {
        id: 'linkage',
        subject_kind: 'custom-compound',
        origin: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 1,
      },
    ],
    points,
    parts: ['upper', 'lower'].map((prefix) => ({
      id: prefix,
      object_id: 'linkage',
      role: prefix + ' independent rigid link',
      outline: [0, 1, 2, 3].map((i) => prefix + i),
      curve: 'linear',
    })),
    constraints: [] as Array<{ id: string; kind: string; points: string[]; value: number }>,
    ik_chains: [
      {
        id: 'reach',
        points: ['root', 'hinge', 'tip'],
        target: [3, 2],
        dimension: '2d',
        bend_limits: [180],
      },
    ],
    camera: { kind: 'orthographic', origin: [180, 180], scale: 20 },
  };
}
function issueCodes(action: () => unknown) {
  try {
    action();
    throw new Error('Expected construction rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ConstructionError);
    return (error as ConstructionError).issues.map((i) => i.code);
  }
}
it('solves an authored 2D contact while retaining root, bone lengths, source model and relative contours', () => {
  const input = model(),
    before = structuredClone(input),
    solved = solveConstruction(input),
    points = new Map(solved.landmarks.map((p) => [p.id, p.position]));
  expect(input).toEqual(before);
  expect(collectSchemaErrors(input, CONSTRUCTION_MODEL_SCHEMA)).toEqual([]);
  expect(points.get('root')).toEqual([0, 0, 0]);
  expect(Math.hypot(points.get('tip')![0] - 3, points.get('tip')![1] - 2)).toBeLessThanOrEqual(
    solved.model.tolerance
  );
  expect(Math.hypot(...points.get('hinge')!)).toBeCloseTo(Math.sqrt(5), 6);
  expect(Math.hypot(...points.get('tip')!.map((v, i) => v - points.get('hinge')![i]))).toBeCloseTo(
    Math.sqrt(5),
    6
  );
  expect(solved.ik).toMatchObject({
    library: 'ikts',
    version: '1.3.7',
    max_iterations: 64,
    pixel_geometry_verified: false,
    artistic_quality_verified: false,
  });
  expect(solved.parts).toHaveLength(2);
  input.ik_chains[0].target = [2, 3];
  input.revision++;
  const changed = solveConstruction(input);
  expect(changed.parts.map((p) => p.target_sha256)).not.toEqual(
    solved.parts.map((p) => p.target_sha256)
  );
});
it('supports true 3D contact with common object pose and projection', () => {
  const input = model();
  input.ik_chains[0].dimension = '3d';
  input.ik_chains[0].target = [2.5, 2, 2];
  input.points.find((p) => p.id === 'tip')!.position = [4, 0, 1];
  input.objects[0].rotation = [15, 20, 30];
  const solved = solveConstruction(input),
    point = solved.landmarks.find((p) => p.id === 'tip')!;
  expect(
    Math.hypot(...point.position.map((v, i) => v - input.ik_chains[0].target[i]))
  ).toBeLessThanOrEqual(solved.model.tolerance);
  expect(solved.parts.every((p) => Object.values(p.bounds).every(Number.isFinite))).toBe(true);
});
it('orders connected chains by shared root dependencies rather than relying on input order', () => {
  const input = model();
  input.points.push(
    { id: 'wrist', object_id: 'linkage', position: [5, 1], fixed: false },
    { id: 'finger', object_id: 'linkage', position: [6, 1], fixed: false }
  );
  input.ik_chains.unshift({
    id: 'child',
    points: ['tip', 'wrist', 'finger'],
    target: [4, 3],
    dimension: '2d',
    bend_limits: [180],
  });
  const solved = solveConstruction(input);
  expect(solved.ik!.chains.map((c) => c.id)).toEqual(['reach', 'child']);
  const endpoint = solved.landmarks.find((p) => p.id === 'finger')!.position;
  expect(Math.hypot(endpoint[0] - 4, endpoint[1] - 3)).toBeLessThanOrEqual(solved.model.tolerance);
});
it('rejects unreachable targets and generic constraints that would stretch the solved bones', () => {
  const input = model();
  input.ik_chains[0].target = [20, 0];
  expect(issueCodes(() => solveConstruction(input))).toContain('construction_ik_unreachable');
  input.ik_chains[0].target = [3, 2];
  input.constraints = [{ id: 'conflict', kind: 'distance', points: ['root', 'tip'], value: 1 }];
  expect(issueCodes(() => solveConstruction(input))).toContain(
    'construction_constraint_unsatisfied'
  );
});
it('reports the dimension correction when a 3D parent moves a 2D child root out of its plane', () => {
  const input = model();
  input.ik_chains[0].dimension = '3d';
  input.ik_chains[0].target = [2.5, 2, 2];
  input.points.push(
    { id: 'wrist', object_id: 'linkage', position: [5, 1], fixed: false },
    { id: 'finger', object_id: 'linkage', position: [6, 1], fixed: false }
  );
  input.ik_chains.push({
    id: 'child',
    points: ['tip', 'wrist', 'finger'],
    target: [4, 3],
    dimension: '2d',
    bend_limits: [180],
  });
  expect(issueCodes(() => solveConstruction(input))).toContain('construction_ik_plane_conflict');
});
it.each(['2d', '3d'])(
  'verifies %s bend limits instead of trusting a numerical endpoint alone',
  (dimension) => {
    const input = model();
    input.ik_chains[0].dimension = dimension;
    input.ik_chains[0].bend_limits = [0];
    expect(issueCodes(() => solveConstruction(input))).toContain('construction_ik_unsatisfied');
    input.ik_chains[0].bend_limits = [120];
    expect(solveConstruction(input).ik!.chains[0].residual).toBeLessThanOrEqual(1e-4);
  }
);
it('collects independent chain format failures and rejects cyclic/multiply driven landmarks', () => {
  const input = model();
  input.points.find((p) => p.id === 'hinge')!.fixed = true;
  input.ik_chains[0].target = [Infinity, 0];
  input.ik_chains[0].bend_limits = [-1];
  const codes = issueCodes(() => normalizeConstructionModel(input));
  expect(codes.length).toBeGreaterThanOrEqual(3);
  const cycle = model();
  cycle.ik_chains.push({
    id: 'reverse',
    points: ['tip', 'root'],
    target: [0, 0],
    dimension: '2d',
    bend_limits: [],
  });
  cycle.points[0].fixed = false;
  expect(issueCodes(() => normalizeConstructionModel(cycle))).toContain(
    'construction_ik_format_invalid'
  );
});
it('compiles an IK-driven component through the existing Guard route with separate owners and no Photoshop dispatch', async () => {
  const registry = new ToolRegistry(),
    dispatch = vi.fn(async () => {
      throw new Error('Never dispatch offline');
    });
  for (const name of [
    'photoshop_create_layer',
    'photoshop_paint_regions',
    'photoshop_execute_visual_microplan',
    'photoshop_get_preview',
  ])
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } }, handler: dispatch });
  const store: GuardCycleCompilerStore = {
    collectClosePreviousErrors: () => [],
    collectPreflightErrors: () => [],
    compactPassContext: () => ({ painting_profile: 'simple_graphic' }),
  };
  const compiled = await compileGuardCycle(
    {
      next_pass: {
        request_key: 'ik-upper',
        document_id: 4280,
        goal: 'One editable upper link',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'medium',
        visual_intent: 'mass',
        construction_role: 'structured-mass',
        impact_class: 'construct',
        construction: { model: model(), part_id: 'upper', color: { red: 70, green: 90, blue: 60 } },
      },
    },
    store,
    registry
  );
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  expect(compiled.nextOperation?.construction_provenance).toMatchObject({
    part_id: 'upper',
    ik: { library: 'ikts', version: '1.3.7' },
    pixel_geometry_verified: false,
  });
  expect((compiled.nextOperation?.scene_ownership_plan as { units: unknown[] }).units).toHaveLength(
    2
  );
  expect(dispatch).not.toHaveBeenCalled();
});
