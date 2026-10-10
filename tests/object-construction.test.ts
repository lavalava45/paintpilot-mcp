import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ConstructionError,
  CONSTRUCTION_MODEL_SCHEMA,
  constructionReviewTarget,
  expandConstructionPass,
  normalizeConstructionModel,
  solveConstruction,
} from '../src/core/object-construction.js';
import {
  collectSchemaErrors,
  compileGuardCycle,
  type GuardCycleCompilerStore,
} from '../src/core/guard/cycle-compiler.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import type { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';

const model = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../examples/object-construction/${name}.json`, import.meta.url), 'utf8')
  );
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
const dirs: string[] = [];
it('presents exact construction targets at the existing image review boundary without claiming pixel proof', () => {
  const solved = solveConstruction(model('crane')),
    part = solved.parts[0];
  const record = {
    object_construction_model: solved.source_model,
    construction_provenance: {
      model_id: solved.model.model_id,
      revision: 1,
      part_id: part.id,
      target_sha256: part.target_sha256,
    },
  };
  expect(constructionReviewTarget(record)).toMatchObject({
    part_id: part.id,
    bounds: part.bounds,
    pixel_geometry_verified: false,
  });
  expect(
    constructionReviewTarget({
      ...record,
      construction_provenance: { ...record.construction_provenance, target_sha256: 'wrong' },
    })
  ).toMatchObject({ comparison_state: 'target_unavailable', pixel_geometry_verified: false });
});
afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

it.each(['crocodile', 'crane', 'violin-gnome'])(
  'solves %s with the same general solver and complete public schema',
  (name) => {
    const input = model(name),
      before = structuredClone(input),
      solved = solveConstruction(input);
    expect(collectSchemaErrors(input, CONSTRUCTION_MODEL_SCHEMA)).toEqual([]);
    expect(input).toEqual(before);
    expect(solved.artistic_quality_verified).toBe(false);
    expect(solved.pixel_geometry_verified).toBe(false);
    expect(
      solved.parts.every((p) => p.bounds.right > p.bounds.left && p.bounds.bottom > p.bounds.top)
    ).toBe(true);
    const points = new Map(solved.landmarks.map((p) => [p.id, p.position]));
    for (const c of solved.model.constraints.filter((c) => c.kind === 'ratio'))
      expect(
        distance(points.get(c.points[0])!, points.get(c.points[1])!) /
          distance(points.get(c.points[2])!, points.get(c.points[3])!)
      ).toBeCloseTo(c.value!, 3);
  }
);
it('moves an attached crane contour with its solved five-unit boom and maintains the two-unit cable', () => {
  const solved = solveConstruction(model('crane')),
    pts = new Map(solved.landmarks.map((p) => [p.id, p.position]));
  const tip = pts.get('boom-tip')!,
    hook = pts.get('hook')!;
  expect(tip[0]).toBeCloseTo(5 * Math.cos(Math.PI / 6), 3);
  expect(tip[1]).toBeCloseTo(2.5, 3);
  expect(distance(tip, hook)).toBeCloseTo(2, 3);
  expect(hook[0]).toBeCloseTo(tip[0], 3);
  expect(distance(pts.get('tip-l')!, tip)).toBeCloseTo(0.15, 6);
  expect(pts.get('pivot')).toEqual([0, 0, 0]);
});
it('keeps intrinsic proportions under object pose/scale and applies depth foreshortening with one camera', () => {
  const input = model('violin-gnome'),
    near = solveConstruction(input);
  input.objects[1].origin[2] = 8;
  const far = solveConstruction(input);
  const width = (v: ReturnType<typeof solveConstruction>) => {
    const b = v.parts.find((p) => p.id === 'gnome-head')!.bounds;
    return b.right - b.left;
  };
  expect(width(far) / width(near)).toBeCloseTo(12 / 18, 6);
  input.objects[0].scale = 2;
  input.objects[0].rotation = [0, 0, 35];
  const scaled = solveConstruction(input),
    pts = new Map(scaled.landmarks.map((p) => [p.id, p.position]));
  expect(
    distance(pts.get('v-neck')!, pts.get('v-top')!) /
      distance(pts.get('v-neck')!, pts.get('v-base')!)
  ).toBeCloseTo(0.75, 3);
});
it('returns every independent incompatible fixed-anchor constraint instead of silently relaxing it', () => {
  const input = model('crocodile');
  input.points.forEach((p: { fixed: boolean }) => {
    p.fixed = true;
  });
  input.constraints = [
    { id: 'wrong-head', kind: 'distance', points: ['nose', 'neck'], value: 7 },
    { id: 'wrong-tail', kind: 'distance', points: ['tail-root', 'tail-tip'], value: 8 },
  ];
  try {
    solveConstruction(input);
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ConstructionError);
    expect((error as ConstructionError).issues.map((x) => x.path)).toEqual([
      'model.constraints.wrong-head',
      'model.constraints.wrong-tail',
    ]);
  }
});
it('rejects cyclic attachments and reports independent malformed fields together', () => {
  const input = model('crane');
  input.points[0].relative_to = 'boom-tip';
  input.points[3].relative_to = 'pivot';
  input.revision = 0;
  input.camera.scale = -1;
  try {
    normalizeConstructionModel(input);
    throw new Error('Expected rejection');
  } catch (error) {
    const issues = (error as ConstructionError).issues;
    expect(issues.some((x) => x.message.includes('Cyclic'))).toBe(true);
    expect(issues.some((x) => x.path === 'model.revision')).toBe(true);
    expect(issues.some((x) => x.path === 'model.camera')).toBe(true);
  }
});
it('rejects impossible projection without producing paint actions', () => {
  const input = model('violin-gnome');
  input.objects[1].origin[2] = -10;
  expect(() => solveConstruction(input)).toThrow(ConstructionError);
});
it.each([
  ['coincident', ['tail-tip', 'neck'], undefined, [2, 0, 0]],
  ['midpoint', ['tail-tip', 'nose', 'neck'], undefined, [1, 0, 0]],
  ['symmetric', ['tail-tip', 'head-top', 'nose', 'neck'], undefined, [2, 0.5, 0]],
  ['perpendicular', ['neck', 'tail-tip', 'nose', 'neck'], undefined, undefined],
] as const)(
  'solves generic %s landmarks without a category-specific rule',
  (kind, points, value, expected) => {
    const input = model('crocodile');
    input.constraints = [
      { id: 'generic', kind, points: [...points], ...(value !== undefined ? { value } : {}) },
    ];
    input.points.find((p: { id: string }) => p.id === 'tail-tip').position = [3, 2, 0];
    const solved = solveConstruction(input),
      tip = solved.landmarks.find((p) => p.id === 'tail-tip')!.position;
    if (expected) expected.forEach((v, i) => expect(tip[i]).toBeCloseTo(v, 3));
    else expect(tip[0]).toBeCloseTo(2, 3);
  }
);

function pass(input = model('crocodile')) {
  return {
    request_key: 'construction-test',
    document_id: 4280,
    goal: 'Build one editable component',
    stage: 'GLOBAL_BLOCK_IN',
    scale: 'medium',
    visual_intent: 'mass',
    construction_role: 'structured-mass',
    impact_class: 'construct',
    construction: {
      model: input,
      part_id: input.parts[0].id,
      color: { red: 70, green: 90, blue: 60 },
    },
  };
}
function compilerFixture(context: Record<string, unknown> = {}) {
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
    compactPassContext: () => ({ painting_profile: 'simple_graphic', ...context }),
  };
  return { registry, store, dispatch };
}
it.each(['crocodile', 'crane', 'violin-gnome'])(
  'compiles one %s component through the real Guard compiler with separate owners before dispatch',
  async (name) => {
    const f = compilerFixture(),
      compiled = await compileGuardCycle({ next_pass: pass(model(name)) }, f.store, f.registry);
    expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
    expect(compiled.nextOperation?.construction_provenance).toMatchObject({
      part_id: model(name).parts[0].id,
      pixel_geometry_verified: false,
    });
    const args = compiled.nextOperation?.args as Record<string, unknown>;
    expect(args.logical_layer).toMatchObject({ hypothesis_id: model(name).parts[0].id });
    expect(
      (compiled.nextOperation?.scene_ownership_plan as { units: unknown[] }).units
    ).toHaveLength(model(name).parts.length);
    expect(f.dispatch).not.toHaveBeenCalled();
  }
);
it('rejects authored actions mixed with generated geometry and refuses an owner/layer substitution', () => {
  const p = pass();
  expect(() =>
    expandConstructionPass({ ...p, actions: [{ tool: 'photoshop_paint_regions' }] }, {}, () => null)
  ).toThrow(ConstructionError);
  expect(() =>
    expandConstructionPass(
      { ...p, logical_layer: { hypothesis_id: 'other', decision: 'create-new' } },
      {},
      () => null
    )
  ).toThrow(ConstructionError);
});
it('reuses the durable model and exact physical component layer, refusing stale/conflicting revisions', () => {
  const normalized = normalizeConstructionModel(model('crocodile')),
    p = pass();
  const request = {
    ...p,
    construction: {
      model_id: normalized.model_id,
      part_id: 'croc-tail',
      color: { red: 10, green: 20, blue: 30 },
    },
  };
  const expanded = expandConstructionPass(
    request,
    { logical_layer_owners: [{ hypothesis_id: 'croc-tail', layer_id: 17 }] },
    () => normalized
  );
  expect(expanded.pass.actions).toHaveLength(1);
  expect(expanded.pass.logical_layer).toMatchObject({ layer_id: 17 });
  const paint = expanded.pass.actions[0] as { args: { regions: Array<{ layer_id: number }> } };
  expect(paint.args.regions[0].layer_id).toBe(17);
  expect(() =>
    expandConstructionPass(
      { ...request, construction: { ...request.construction, revision: 2 } },
      {},
      () => normalized
    )
  ).toThrow('Current revision');
  p.construction.model.points[0].position[0] = 0.1;
  expect(() => expandConstructionPass(p, {}, () => normalized)).toThrow('advance revision');
});
it('makes read-only solving available through the existing public status tool without Photoshop or ordinary status reads', async () => {
  const status = vi.fn(() => {
    throw new Error('Must not read Photoshop');
  });
  const runtime = {
    store: {},
    statusWithCapabilitySnapshots: status,
  } as unknown as EmbeddedGuardRuntime;
  const tool = createGuardTools(runtime).find((t) => t.tool.name === 'photoshop_guard_status')!;
  const result = await tool.handler({ construction_model: model('crane') });
  const body = JSON.parse((result.content[0] as { text: string }).text);
  expect(body).toMatchObject({
    ok: true,
    execution: 'not-executed',
    pixel_geometry_verified: false,
    artistic_quality_verified: false,
  });
  expect(status).not.toHaveBeenCalled();
});
it('binds durable construction lookup to the current document and excludes failed/rolled-back/foreign records', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'construction-store-'));
  dirs.push(dir);
  const s = new SessionStore(path.join(dir, 'controller'), {
    visualBarrierDirectory: path.join(dir, 'barriers'),
    workspaceRoot: dir,
  });
  const valid = {
    id: 'valid-construction',
    sequence: 1,
    created_at: '2026-10-09T12:00:00Z',
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 4280 },
    phase: 'completed',
    dispatched: true,
    failed: false,
    object_construction_model: normalizeConstructionModel(model('crane')),
  };
  s.write(valid);
  s.write({
    ...valid,
    id: 'rolled-back',
    sequence: 3,
    rolled_back: true,
    object_construction_model: { ...valid.object_construction_model, revision: 3 },
  });
  s.write({
    ...valid,
    id: 'failed',
    sequence: 4,
    failed: true,
    object_construction_model: { ...valid.object_construction_model, revision: 4 },
  });
  s.write({
    ...valid,
    id: 'foreign',
    sequence: 5,
    args: { document_id: 999 },
    object_construction_model: { ...valid.object_construction_model, revision: 5 },
  });
  expect(s.constructionModel(4280, 'crane-study')?.revision).toBe(1);
});
it('reports already constructed parts that need rebuilding after a proportion/pose revision', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'construction-revision-'));
  dirs.push(dir);
  const s = new SessionStore(path.join(dir, 'controller'), {
    visualBarrierDirectory: path.join(dir, 'barriers'),
    workspaceRoot: dir,
  });
  const m = normalizeConstructionModel(model('crane')),
    first = solveConstruction(m),
    boom = first.parts.find((p) => p.id === 'crane-boom')!;
  const record = {
    id: 'boom-v1',
    sequence: 1,
    created_at: '2026-10-09T12:00:00Z',
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 4280 },
    phase: 'completed',
    dispatched: true,
    failed: false,
    object_construction_model: m,
    construction_provenance: {
      model_id: m.model_id,
      revision: 1,
      part_id: boom.id,
      target_sha256: boom.target_sha256,
    },
  };
  s.write(record);
  const revised = structuredClone(m);
  revised.revision = 2;
  revised.constraints.find((c) => c.id === 'boom-angle')!.value = 60;
  s.write({
    ...record,
    id: 'base-v2',
    sequence: 2,
    object_construction_model: revised,
    construction_provenance: {
      ...record.construction_provenance,
      revision: 2,
      part_id: 'crane-base',
      target_sha256: solveConstruction(revised).parts.find((p) => p.id === 'crane-base')!
        .target_sha256,
    },
  });
  expect(s.constructionReviewState(4280, m.model_id)).toMatchObject({
    parts_requiring_rebuild: [{ part_id: 'crane-boom', source_revision: 1, current_revision: 2 }],
    unconstructed_parts: ['crane-cable'],
    pixel_geometry_verified: false,
  });
});
