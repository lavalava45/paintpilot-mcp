import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ConstructionError,
  constructionOwnershipPlan,
  CONSTRUCTION_MODEL_SCHEMA,
  constructionReviewTarget,
  expandConstructionPass,
  normalizeConstructionModel,
  solveConstruction,
} from '../src/core/object-construction.js';
import { normalizeSceneOwnershipPlan, extendSceneOwnershipPlan } from '../src/core/scene-ownership-plan.js';
import {
  collectSchemaErrors,
  compileGuardCycle,
  type GuardCycleCompilerStore,
} from '../src/core/guard/cycle-compiler.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import type { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { paintRegionTopologyIssues, filledContourIssues } from '../src/core/filled-contour-topology.js';

const model = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../examples/object-construction/${name}.json`, import.meta.url), 'utf8')
  );
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
const dirs: string[] = [];
it('regression: real SessionStore passes durable owners into Critic when compiling a missing-component brush repair', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'critic-owner-regression-')); dirs.push(root);
  const s = new SessionStore(root, { workspaceRoot: root });
  const plan = constructionOwnershipPlan(normalizeConstructionModel(model('crocodile')));
  const owner = plan.units[0].owner_id;
  s.setArtRunState({ document_id: 4280, process_dir: 'processes/repair-process/run-01',
    original_brief: 'A pencil drawing of an arbitrary connected object.', painting_profile: 'simple_graphic' });
  s.write({ id: 'blank-lines', tool: 'photoshop_execute_visual_microplan', args: { document_id: 4280 },
    phase: 'completed', failed: false, dispatched: true, sequence: 1, hash: 'blank',
    created_at: '2026-10-12T00:00:00Z', scene_ownership_plan: plan,
    report: { summary: 'Reviewed the absent contour; preserve its owner and correct it.' },
    result: { content: [{ type: 'text', text: JSON.stringify({ continuation_layers: [{
      hypothesis_id: owner, layer_id: 2, temporary: false, decision: 'create-new', physical_role: 'other', opacity_role: 'transparent-overlay',
    }] }) }] } } as any);
  s.updatePaintingState(4280, current => ({ ...current, scene_ownership_plan: plan,
    chat_critic_findings: [{ criterion: 'brief_fidelity', problem_id: 'critic-brief_fidelity',
      correction_kind: 'missing-object', visible: 'The component contour is absent.', next_change: 'Draw the structural contour on its independent layer.' }] }));
  expect(s.semanticLayerOwners(4280)).toMatchObject([{ hypothesis_id: owner, layer_id: 2 }]);
  const f = compilerFixture();
  for (const name of ['photoshop_paint_strokes', 'photoshop_set_brush'])
    f.registry.register(name, { tool: { name, inputSchema: { type: 'object' } }, handler: f.dispatch });
  const compiled = await compileGuardCycle({ next_pass: { request_key: 'repair-lines', document_id: 4280,
    goal: 'Draw the missing structural contour', stage: 'GLOBAL_BLOCK_IN', scale: 'medium',
    problem_id: 'critic-brief_fidelity', visual_intent: 'line', impact_class: 'construct',
    layer_separation_check: { change_kind: 'continuation', substantial: true, rollback_value: 'high',
      independent_adjustment_expected: true, reasons: ['Preserve the separately editable structural contour'] },
    logical_layer: { decision: 'continue-logical-layer', hypothesis_id: owner, hypothesis: 'Independent structural contour', layer_id: 2, rollback_value: 'high', expected_independent_rollback: true },
    actions: [{ tool: 'photoshop_paint_strokes', args: { document_id: 4280, layer_id: 2,
      strokes: [{ tool: 'BRUSH', size: 2, opacity: 90, flow: 80, points: [{ x: 30, y: 30 }, { x: 70, y: 90 }] }] } }],
  } }, s, f.registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('regression: compiles calculated pencil-style outlines without a filled mass and preserves an owned replacement', async () => {
  const input: any = pass();
  input.visual_intent = 'line';
  input.construction.rendering = { mode: 'outline', size: 2, opacity: 75, flow: 80 };
  const f = compilerFixture();
  const compiled = await compileGuardCycle({ next_pass: input }, f.store, f.registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  const paint = (compiled.nextOperation?.args as any).steps.find((s: any) => s.tool === 'photoshop_paint_regions');
  expect(paint.args.regions[0]).toMatchObject({ render_mode: 'outline', stroke_size: 2, opacity: 75 });
  expect(compiled.nextOperation?.construction_provenance).toMatchObject({ render_mode: 'outline', pixel_geometry_verified: false });
  const owned = expandConstructionPass(input, { logical_layer_owners: [{ hypothesis_id: input.construction.part_id,
    layer_id: 17, physical_role: 'other', opacity_role: 'transparent-overlay' }] }, () => null);
  expect(owned.pass.actions[0]).toMatchObject({ args: { replace_contents: true, regions: [{ layer_id: 17, render_mode: 'outline' }] } });
  const inherited = structuredClone(input); delete inherited.construction.rendering;
  const abbreviated = expandConstructionPass(inherited, { construction_bindings: [{ owner_id: input.construction.part_id, rendering: { mode: 'outline', size: 2, opacity: 75, flow: 80 } }] }, () => null);
  expect((abbreviated.pass.actions[1] as any).args.regions[0].render_mode).toBe('outline');
  const missingStyle = structuredClone(input); delete missingStyle.construction.rendering;
  expect(() => expandConstructionPass(missingStyle, {}, () => null)).toThrow('positive line width');
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('rejects the saved 37-point intersecting silhouette before Photoshop; accepts concavity and holes', () => {
  const saved = JSON.parse(readFileSync(new URL('./fixtures/tiger-self-intersection-20261011.json', import.meta.url), 'utf8'));
  const issues = paintRegionTopologyIssues([{ id: saved.part_id, contours: [{ points: saved.points }] }]);
  expect(issues.filter(issue => issue.code === 'filled_contour_self_intersection')
    .map(issue => issue.segments)).toEqual([[10, 13], [10, 14]]);
  expect(issues.every(issue => issue.part_id === 'tiger_silhouette')).toBe(true);
  const concave = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 },
    { x: 4, y: 4 }, { x: 0, y: 8 }];
  const outer = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 12 }, { x: 0, y: 12 }];
  const hole = [{ x: 3, y: 3 }, { x: 9, y: 3 }, { x: 9, y: 9 }, { x: 3, y: 9 }];
  expect(filledContourIssues('concave', [{ points: concave }])).toEqual([]);
  expect(paintRegionTopologyIssues([{ id: 'aperture', contours: [
    { points: outer, operation: 'ADD' }, { points: hole, operation: 'SUBTRACT' },
  ] }])).toEqual([]);
  expect(filledContourIssues('intentional', [{ points: saved.points, intersection_policy: 'intentional' }]))
    .toEqual([]);
  expect(filledContourIssues('collapsed', [{ points: [outer[0], outer[0], outer[1], outer[2]] }])
    .some(issue => issue.code === 'filled_contour_degenerate_segment')).toBe(true);
});

it('enforces authored projected component attachments, size, placement and support even for fixed landmarks', () => {
  const input = {
    model_id: 'generic-fixed-panel', revision: 1, basis: 'Author-chosen 2D panel', tolerance: 0.0001,
    objects: [{ id: 'panel', subject_kind: 'single-component', origin: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }],
    points: [
      { id: 'a', object_id: 'panel', position: [0, 0, 0], fixed: true },
      { id: 'b', object_id: 'panel', position: [10, 0, 0], fixed: true },
      { id: 'c', object_id: 'panel', position: [10, 10, 0], fixed: true },
      { id: 'd', object_id: 'panel', position: [0, 10, 0], fixed: true },
    ],
    parts: [{ id: 'surface', object_id: 'panel', role: 'Independent panel', outline: ['a', 'b', 'c', 'd'], curve: 'linear' }],
    constraints: [], camera: { kind: 'orthographic', origin: [0, 0], scale: 1, distance: 1, focal_length: 1 },
    spatial_checks: [] as any[],
  };
  const part = input.parts[0];
  const landmark = part.outline[0];
  const other = part.outline[1];
  const original = solveConstruction(input);
  const reference = new Map(original.landmarks.map(p => [p.id, p.projected]));
  const anchor = reference.get(landmark)!;
  const target = reference.get(other)!;
  const dx = Math.hypot(anchor.x - target.x, anchor.y - target.y);
  input.spatial_checks = [
    { id: 'join', kind: 'attachment', points: [landmark, other], max_distance: dx + 1 },
    { id: 'size', kind: 'size-ratio', points: [landmark, other, landmark, other], min: 0.9, max: 1.1 },
    { id: 'position', kind: 'placement', points: [landmark], bounds: { left: anchor.x - 1, top: anchor.y - 1, right: anchor.x + 1, bottom: anchor.y + 1 } },
    { id: 'support', kind: 'support', points: [landmark, landmark, other], max_distance: 1 },
  ];
  expect(solveConstruction(input).spatial_checks).toBeUndefined(); // checks affect admission, not an artistic score
  input.spatial_checks[0].max_distance = dx / 2;
  input.spatial_checks[1].min = 1.2;
  input.spatial_checks[1].max = 1.4;
  input.spatial_checks[2].bounds.left = anchor.x + 2;
  input.spatial_checks[2].bounds.right = anchor.x + 3;
  input.spatial_checks[3].points = [other, landmark, landmark];
  try { solveConstruction(input); throw new Error('Expected spatial preflight refusal'); }
  catch (error) {
    expect(error).toBeInstanceOf(ConstructionError);
    expect((error as ConstructionError).issues.filter(issue => issue.code === 'construction_spatial_relation_unsatisfied').length).toBe(4);
  }
});
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
it('prevalidates generated layer IDs as backward references while keeping the runtime placeholder', async () => {
  const f = compilerFixture();
  const paint = f.registry.get('photoshop_paint_regions')!;
  f.registry.register('photoshop_paint_regions', { ...paint,
    tool: { ...paint.tool, inputSchema: { type: 'object', properties: { regions: { type: 'array',
      items: { type: 'object', properties: { layer_id: { type: 'number' } } } } } } } });
  const compiled = await compileGuardCycle({ next_pass: pass(model('crane')) }, f.store, f.registry);
  expect(compiled.violations.some(x => x.code === 'compact_action_schema_invalid'
    && x.message.includes('layer_id'))).toBe(false);
  const steps = ((compiled.nextOperation?.args as any)?.steps ?? []) as any[];
  expect(steps.find(s => s.tool === 'photoshop_paint_regions')?.args.regions[0].layer_id)
    .toBe('$steps.construction_layer.details.layerId');
  const bad = { ...pass(), construction: undefined, actions: [
    { id: 'paint-first', tool: 'photoshop_paint_regions', args: { regions: [
      { layer_id: '$steps.layer-later.details.layerId' },
    ] } },
    { id: 'layer-later', tool: 'photoshop_create_layer', args: { name: 'New layer' } },
  ] };
  const rejected = await compileGuardCycle({ next_pass: bad }, f.store, f.registry);
  expect(rejected.violations.some(x => x.code === 'compact_action_reference_invalid')).toBe(true);
  expect(f.dispatch).not.toHaveBeenCalled();
});
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
it('inherits durable ownership on abbreviated reconstruction and rejects explicit remapping', async () => {
  const current = normalizeConstructionModel(model('crocodile'));
  const generated = constructionOwnershipPlan(current);
  const saved = normalizeSceneOwnershipPlan({ ...generated,
    units: generated.units.map(unit => ({ ...unit,
      role: 'Persisted ' + unit.semantic_id + ' layer', edit_axes: ['visibility', 'position'] })) });
  const selected = current.parts[0].id;
  const request = { ...pass(), construction: { model_id: current.model_id,
    part_id: selected, color: { red: 20, green: 30, blue: 40 } } };
  const context = { scene_ownership_plan: saved,
    logical_layer_owners: [{ hypothesis_id: selected, layer_id: 3 }] };
  const inherited = expandConstructionPass(request, context, () => current);
  expect(inherited.pass.scene_ownership_plan).toEqual(saved);
  expect(inherited.pass.logical_layer.layer_id).toBe(3);
  const fixture = compilerFixture({ ...context });
  fixture.store.constructionModel = () => current;
  const compiled = await compileGuardCycle({ next_pass: request }, fixture.store, fixture.registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  expect(compiled.violations.filter(row => row.code === 'scene_ownership_plan_conflict')).toEqual([]);
  expect((compiled.nextOperation?.args as any)?.logical_layer?.layer_id).toBe(3);
  expect(fixture.dispatch).not.toHaveBeenCalled();
  const substituted = normalizeSceneOwnershipPlan({ ...saved,
    units: saved.units.map(unit => unit.semantic_id === selected
      ? { ...unit, owner_id: 'unauthorized-owner' } : unit) });
  expect(() => extendSceneOwnershipPlan(saved, substituted)).toThrow('units[' + selected + '].owner_id');
  const rejected = await compileGuardCycle({ next_pass: { ...request, scene_ownership_plan: substituted } }, fixture.store, fixture.registry);
  expect(rejected.violations.some(row => row.code === 'scene_ownership_plan_conflict'
    && row.message.includes('units[' + selected + '].owner_id'))).toBe(true);
});
it('reuses an independently owned semantic component when a construction part names its owner rather than semantic id', async () => {
  const m = model('crane');
  const sourcePart = m.parts[0].id;
  m.parts[0].id = 'window-frame-owner';
  m.parts[1].id = 'window-view-owner';
  m.parts = m.parts.slice(0, 2);
  m.model_id = 'bistro-window-proportions-test';
  const durable = normalizeSceneOwnershipPlan({
    plan_id: 'canal-bistro-ownership-v1',
    units: [
      { semantic_id: 'window-frame', owner_id: 'window-frame-owner',
        role: 'Editable window frame', editability: 'independent',
        edit_axes: ['visibility', 'color', 'position'] },
      { semantic_id: 'window-view', owner_id: 'window-view-owner',
        role: 'Independent outside view', editability: 'independent',
        edit_axes: ['visibility', 'color', 'position'] },
    ],
    objects: [{ object_id: m.objects[0].id, kind: 'compound-object',
      subject_kind: 'custom-compound', component_semantic_ids: ['window-frame', 'window-view'] }],
  });
  expect(sourcePart).not.toBe('window-frame-owner');
  const p = pass(m);
  const context = { scene_ownership_plan: durable,
    logical_layer_owners: [{ hypothesis_id: 'window-frame-owner', layer_id: 7 }] };
  const expanded = expandConstructionPass(p, context, () => null);
  const result = expanded.pass.scene_ownership_plan;
  expect(result.units.filter(unit => unit.owner_id === 'window-frame-owner'))
    .toEqual([durable.units.find(unit => unit.semantic_id === 'window-frame')]);
  expect(result.units).not.toContainEqual(expect.objectContaining({ semantic_id: 'window-frame-owner' }));
  expect(result.objects[0].component_semantic_ids).toContain('window-frame');
  expect(expanded.pass.logical_layer).toMatchObject({
    hypothesis_id: 'window-frame-owner', layer_id: 7, decision: 'continue-logical-layer',
  });
  const f = compilerFixture(context);
  const compiled = await compileGuardCycle({ next_pass: p }, f.store, f.registry);
  expect(compiled.violations.filter(row => row.code === 'construction_model_invalid'
    || row.code === 'scene_ownership_plan_conflict')).toEqual([]);
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('does not create a second semantic unit for an independently owned floor field', async () => {
  const m = model('crocodile');
  m.model_id = 'floor-shape-test';
  m.parts = [m.parts[0]];
  m.parts[0].id = 'floor-owner';
  m.objects[0].subject_kind = 'single-component';
  const saved = normalizeSceneOwnershipPlan({ plan_id: 'canal-bistro-ownership-v1',
    units: [{ semantic_id: 'floor', owner_id: 'floor-owner', role: 'Editable floor surface',
      editability: 'independent', edit_axes: ['visibility', 'color', 'position'] }],
    objects: [{ object_id: m.objects[0].id, kind: 'single-part', subject_kind: 'single-component',
      component_semantic_ids: ['floor'] }] });
  const compiled = await compileGuardCycle({ next_pass: pass(m) },
    compilerFixture({ scene_ownership_plan: saved }).store, compilerFixture().registry);
  expect(compiled.violations.filter(row => row.code === 'construction_model_invalid'
    || row.code === 'scene_ownership_plan_conflict')).toEqual([]);
  expect((compiled.nextOperation?.scene_ownership_plan as any)?.units ?? saved.units)
    .toEqual(saved.units);
});
it('still rejects genuine shared owners, semantic hijacks and object reassignment during construction', () => {
  const m = model('crane');
  m.parts[0].id = 'owner-a';
  const saved = normalizeSceneOwnershipPlan({ plan_id: 'ownership-conflict-proof',
    units: [
      { semantic_id: 'frame', owner_id: 'owner-a', role: 'Editable frame',
        editability: 'independent', edit_axes: ['visibility'] },
      { semantic_id: 'second', owner_id: 'owner-b', role: 'Editable second part',
        editability: 'independent', edit_axes: ['visibility'] },
    ],
    objects: [{ object_id: m.objects[0].id, kind: 'compound-object',
      subject_kind: 'custom-compound', component_semantic_ids: ['frame', 'second'] }],
  });
  // An explicitly shared owner cannot be passed off as one editable part.
  const shared = normalizeSceneOwnershipPlan({ plan_id: 'shared-owner-case',
    units: [
      { ...saved.units[0], editability: 'shared-owner' },
      { ...saved.units[1], owner_id: 'owner-a', editability: 'shared-owner' },
    ],
    shared_owner_justifications: [{ owner_id: 'owner-a', semantic_ids: ['frame', 'second'],
      rationale: 'A known merged legacy component requiring extraction.' }],
  });
  expect(() => expandConstructionPass(pass(m), { scene_ownership_plan: shared }, () => null))
    .toThrow(/already represents multiple semantic units/);
  const hijack = structuredClone(m);
  hijack.parts[0].id = 'frame';
  expect(() => expandConstructionPass(pass(hijack), { scene_ownership_plan: saved }, () => null))
    .toThrow(/collides with semantic_id=frame owned by owner-a/);
  const relabel = structuredClone(m);
  relabel.objects[0].id = 'another-object';
  relabel.points.forEach((point: any) => { point.object_id = 'another-object'; });
  relabel.parts.forEach((part: any) => { part.object_id = 'another-object'; });
  expect(() => expandConstructionPass(pass(relabel), { scene_ownership_plan: saved }, () => null))
    .toThrow(/references a component belonging to saved object/);
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
