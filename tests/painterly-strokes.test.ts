import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import {
  expandPainterlyPass,
  normalizePainterly,
  painterlyClearance,
  planPainterlyStrokes,
  readPainterlyJpeg,
  PAINTERLY_PASS_SCHEMA,
} from '../src/core/painterly-strokes.js';
import {
  compileGuardCycle,
  collectSchemaErrors,
  type GuardCycleCompilerStore,
} from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { strokeExecutionBudget, createPaintingTools } from '../src/tools/painting-tools.js';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { solveConstruction } from '../src/core/object-construction.js';
import { authoredFormField } from '../src/core/authored-form-field.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function image(color: (x: number, y: number) => number[], width = 64, height = 64) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set([...color(x, y), 255], (y * width + x) * 4);
  return { width, height, data };
}
const source = () =>
  image((x, y) => [40 + 2 * x, 30 + Math.min(170, Math.round(Math.hypot(x - 30, y - 30) * 5)), 80]);
const before = () => image(() => [245, 245, 245]);
const square = [
  { x: 0, y: 0 },
  { x: 64, y: 0 },
  { x: 64, y: 64 },
  { x: 0, y: 64 },
];
function parameters() {
  return {
    reference_bounds: { left: 0, top: 0, right: 64, bottom: 64 },
    clip_contour: square,
    brush_radii: [6, 3, 1.5],
    max_strokes: 24,
    max_dimension: 64,
    error_threshold: 10,
  };
}
function files() {
  const dir = mkdtempSync(path.join(tmpdir(), 'painterly-'));
  dirs.push(dir);
  const materialize = (name: string, img: ReturnType<typeof image>) => {
    const bytes = jpeg.encode(img, 95).data,
      file = path.join(dir, name + '.jpg');
    writeFileSync(file, bytes);
    return { path: file, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  return {
    dir,
    reference: materialize('reference', source()),
    frame: {
      ...materialize('before', before()),
      operation_id: 'before',
      canvas_width: 64,
      canvas_height: 64,
    },
  };
}
it('plans coarse-to-fine curved strokes deterministically with finite colors and a strict count bound', () => {
  const settings = normalizePainterly(parameters()),
    a = planPainterlyStrokes(source(), before(), { width: 64, height: 64 }, settings);
  expect(a).toEqual(planPainterlyStrokes(source(), before(), { width: 64, height: 64 }, settings));
  expect(a.strokes.length).toBeGreaterThan(0);
  expect(a.strokes.length).toBeLessThanOrEqual(24);
  expect(a.strokes.map((s) => s.size)).toEqual(a.strokes.map((s) => s.size).sort((x, y) => y - x));
  expect(a.strokes.some((s) => s.points.length > 2)).toBe(true);
  expect(a.summary.simulated_mean_error_after).toBeLessThan(a.summary.simulated_mean_error_before);
  expect(a.summary).toMatchObject({
    native_pixels_verified: false,
    artistic_quality_verified: false,
  });
  for (const stroke of a.strokes)
    for (const value of Object.values(stroke.color)) expect(value).toBeGreaterThanOrEqual(0);
});
it('renders a direction-dependent authored light-field instead of changing only its metadata', () => {
  const bounds = { left: 0, top: 0, right: 120, bottom: 120 };
  const field = {
    kind: 'light-field', center: { x: 60, y: 60 }, radius: { x: 42, y: 50 },
    shadow_color: { red: 10, green: 20, blue: 30 },
    light_color: { red: 250, green: 240, blue: 230 }, ambient: 0.12,
    light_direction: [1, 0, 0],
  };
  const right = authoredFormField(field, bounds, 120);
  const left = authoredFormField({ ...field, light_direction: [-1, 0, 0] }, bounds, 120);
  const front = authoredFormField({ ...field, light_direction: [0, 0, 1] }, bounds, 120);
  const red = (image: typeof right, x: number, y = 60) => image.data[(y * image.width + x) * 4];
  expect(Buffer.from(right.data).equals(Buffer.from(left.data))).toBe(false);
  expect(red(right, 90)).toBeGreaterThan(red(right, 30));
  expect(red(left, 30)).toBeGreaterThan(red(left, 90));
  // Pixel centers at 29.5 and 90.5 are symmetric about the authored x=60.
  expect(red(front, 29)).toBe(red(front, 90));
  expect(Buffer.from(right.data).equals(Buffer.from(front.data))).toBe(false);
});

it('routes a narrow authored light-field to one native alpha-protected continuous surface gradient', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'narrow-light-field-'));
  dirs.push(dir);
  const file = path.join(dir, 'before.jpg');
  const width = 300, height = 300;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 32; data[i + 1] = 43; data[i + 2] = 59; data[i + 3] = 255;
  }
  const bytes = jpeg.encode({ width, height, data }, 100).data;
  writeFileSync(file, bytes);
  const build = (fieldOverrides: Record<string, unknown> = {}, opacity = 100, contour?: Array<{ x: number; y: number }>) => expandPainterlyPass({
    document_id: 42,
    painterly: {
      owner_id: 'side',
      reference_bounds: { left: 0, top: 0, right: 300, bottom: 300 },
      clip_contour: [
        { x: 110, y: 30 }, { x: 70, y: 53 },
        { x: 71, y: 240 }, { x: 112, y: 260 },
      ],
      ...(contour ? { clip_contour: contour } : {}),
      opacity,
      form_field: {
        kind: 'light-field',
        center: { x: 91, y: 146 }, radius: { x: 42, y: 175 },
        light_direction: [-0.6, -0.35, 0.72],
        shadow_color: { red: 20, green: 30, blue: 47 },
        light_color: { red: 66, green: 83, blue: 104 },
        ambient: 0.23,
        ...fieldOverrides,
      },
      max_strokes: 24,
    },
  }, {
    logical_layer_owners: [{ hypothesis_id: 'side', layer_id: 3 }],
    painterly_frame: {
      path: file,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      operation_id: 'before',
      canvas_width: width,
      canvas_height: height,
    },
  }, () => null);
  const result = build();
  expect(result.provenance.algorithm).toBe('native-alpha-protected-surface-gradient');
  expect(result.provenance.stroke_count).toBe(0);
  expect(result.pass.actions).toEqual([expect.objectContaining({
    tool: 'photoshop_paint_color_gradient',
    args: {
      document_id: 42, layer_id: 3, preserve_transparency: true,
      clip_contour: [{ x: 110, y: 30 }, { x: 70, y: 53 }, { x: 71, y: 240 }, { x: 112, y: 260 }],
      opacity: 100,
      from: { x: 70, y: 145 }, to: { x: 112, y: 145 },
      stops: expect.arrayContaining([
        expect.objectContaining({ position: 0 }),
        expect.objectContaining({ position: 1 }),
      ]),
    },
  })]);
  const stops = result.pass.actions[0].args.stops;
  expect(stops).toHaveLength(4);
  expect(stops[0].red).toBeGreaterThan(stops[3].red);
  expect(stops.every((stop: { red: number }) => stop.red > 20 && stop.red < 66)).toBe(true);
  const otherDirection = build({ light_direction: [0.6, -0.35, 0.72] });
  expect(otherDirection.pass.actions[0].args.stops).not.toEqual(stops);
  const otherCenter = build({ center: { x: 104, y: 146 } });
  expect(otherCenter.pass.actions[0].args.stops).not.toEqual(stops);
  const otherAmbient = build({ ambient: 0.6 });
  expect(otherAmbient.pass.actions[0].args.stops).not.toEqual(stops);
  const faint = build({}, 1);
  expect(faint.pass.actions[0].args.opacity).toBe(1);
  expect(faint.pass.actions).not.toEqual(result.pass.actions);
  const rectangle = [{ x: 70, y: 30 }, { x: 112, y: 30 }, { x: 112, y: 260 }, { x: 70, y: 260 }];
  const triangle = rectangle.slice(0, 3);
  expect(build({}, 100, rectangle).pass.actions).not.toEqual(build({}, 100, triangle).pass.actions);
});
it('leaves an already matching uniform region untouched rather than inventing improvement', () => {
  const flat = image(() => [80, 100, 120]);
  const result = planPainterlyStrokes(
    flat,
    flat,
    { width: 64, height: 64 },
    normalizePainterly(parameters())
  );
  expect(result.strokes).toEqual([]);
  expect(result.summary.simulated_mean_error_before).toBe(0);
});
it('keeps swept nominal brush footprints inside a concave component, including between vertices', () => {
  const clip = [
    { x: 2, y: 2 },
    { x: 62, y: 2 },
    { x: 62, y: 24 },
    { x: 25, y: 24 },
    { x: 25, y: 62 },
    { x: 2, y: 62 },
  ];
  const result = planPainterlyStrokes(
    source(),
    before(),
    { width: 64, height: 64 },
    normalizePainterly({ ...parameters(), clip_contour: clip })
  );
  expect(result.strokes.length).toBeGreaterThan(0);
  for (const stroke of result.strokes)
    for (let i = 0; i < stroke.points.length; i++) {
      const a = stroke.points[Math.max(0, i - 1)],
        b = stroke.points[i];
      for (let s = 0; s <= 50; s++)
        expect(
          painterlyClearance(
            { x: a.x + ((b.x - a.x) * s) / 50, y: a.y + ((b.y - a.y) * s) / 50 },
            clip
          )
        ).toBeGreaterThanOrEqual(stroke.size / 2);
    }
});
it('maps cropped source pixels into exact canvas bounds and rejects stretching/canvas overflow', () => {
  const p = {
    ...parameters(),
    reference_bounds: { left: 64, top: 32, right: 128, bottom: 96 },
    clip_contour: square.map((v) => ({ x: v.x + 64, y: v.y + 32 })),
  };
  const result = planPainterlyStrokes(
    source(),
    image(() => [255, 255, 255], 128, 128),
    { width: 128, height: 128 },
    normalizePainterly(p)
  );
  expect(result.strokes.length).toBeGreaterThan(0);
  expect(result.strokes.every((s) => s.points.every((v) => v.x >= 64 && v.y >= 32))).toBe(true);
  expect(() =>
    planPainterlyStrokes(source(), before(), { width: 64, height: 64 }, normalizePainterly(p))
  ).toThrow('fit');
  expect(() =>
    planPainterlyStrokes(
      image(() => [0, 0, 0], 32, 64),
      before(),
      { width: 64, height: 64 },
      normalizePainterly(parameters())
    )
  ).toThrow('aspect');
});
it('publishes a complete compact contract and rejects reversed radii, overbudget and invalid count choices', () => {
  const f = files(),
    request = { ...parameters(), owner_id: 'body', reference: f.reference };
  expect(collectSchemaErrors(request, PAINTERLY_PASS_SCHEMA)).toEqual([]);
  expect(() => normalizePainterly({ ...request, brush_radii: [3, 6] })).toThrow('descending');
  expect(() => normalizePainterly({ ...request, max_strokes: 33 })).toThrow('[1,32]');
  expect(() => normalizePainterly({ ...request, max_strokes: 1 })).toThrow('Reserve');
  expect(() => normalizePainterly({ ...request, min_length: 7, max_length: 3 })).toThrow(
    'min_length'
  );
});
it('checks exact materialized JPEG bytes and returns actionable errors for changed bytes and unsupported images', () => {
  const f = files();
  expect(readPainterlyJpeg(f.reference.path, f.reference.sha256).width).toBe(64);
  expect(readPainterlyJpeg(f.reference.path).sha256).toBe(f.reference.sha256);
  writeFileSync(f.reference.path, Buffer.from('changed'));
  expect(() => readPainterlyJpeg(f.reference.path, f.reference.sha256)).toThrow('bytes changed');
  const bytes = Buffer.from('not jpeg'),
    hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(f.reference.path, bytes);
  expect(() => readPainterlyJpeg(f.reference.path, hash)).toThrow('JPEG only');
});
it('expands a single exact component into a package accepted by the actual native stroke budget', () => {
  const f = files(),
    raw = {
      document_id: 42,
      painterly: {
        ...parameters(),
        owner_id: 'body',
        reference: f.reference,
        max_strokes: 32,
        max_length: 24,
      },
    };
  const expanded = expandPainterlyPass(
    raw,
    { painterly_frame: f.frame, logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 17 }] },
    () => null
  );
  expect(expanded.pass.logical_layer).toMatchObject({
    hypothesis_id: 'body',
    layer_id: 17,
    decision: 'continue-logical-layer',
  });
  expect(expanded.pass.actions).toHaveLength(1);
  const action = expanded.pass.actions[0];
  expect(action.tool).toBe('photoshop_paint_strokes');
  expect(action.args.layer_id).toBe(17);
  expect(strokeExecutionBudget(action.args).allowed).toBe(true);
  const schema = createPaintingTools({} as PhotoshopConnection).find(
    (t) => t.tool.name === 'photoshop_paint_strokes'
  )!.tool.inputSchema;
  expect(collectSchemaErrors(action.args, schema)).toEqual([]);
  expect(expanded.provenance).toMatchObject({
    before_sha256: f.frame.sha256,
    native_pixels_verified: false,
    owner_id: 'body',
  });
  expect(expanded.provenance.stroke_count).toBe(action.args.strokes.length);
});
it('refuses mixed authored actions, owner swaps, missing exact baseline and stale construction references', () => {
  const f = files(),
    raw = {
      document_id: 42,
      painterly: { ...parameters(), owner_id: 'body', reference: f.reference },
    };
  const ctx = {
    painterly_frame: f.frame,
    logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 17 }],
  };
  expect(() =>
    expandPainterlyPass({ ...raw, actions: [{ tool: 'raw' }] }, ctx, () => null)
  ).toThrow('mix');
  expect(() =>
    expandPainterlyPass(
      {
        ...raw,
        logical_layer: { decision: 'continue-logical-layer', hypothesis_id: 'other', layer_id: 17 },
      },
      ctx,
      () => null
    )
  ).toThrow('exact physical');
  expect(() =>
    expandPainterlyPass(raw, { logical_layer_owners: ctx.logical_layer_owners }, () => null)
  ).toThrow('whole-frame');
  const ref = {
    ...raw,
    painterly: {
      ...raw.painterly,
      clip_contour: undefined,
      construction_ref: { model_id: 'missing', part_id: 'body' },
    },
  };
  expect(() => expandPainterlyPass(ref, ctx, () => null)).toThrow('current durable model');
  expect(() =>
    expandPainterlyPass(
      { ...raw, region_bounds: { left: 10, top: 10, right: 20, bottom: 20 } },
      ctx,
      () => null
    )
  ).toThrow('must contain');
});
it('keeps construction_ref aligned after accepted native connected_move, and never replays an unverified move', () => {
  const f = files();
  const s = new SessionStore(path.join(f.dir, 'controller'), {
    visualBarrierDirectory: path.join(f.dir, 'barriers'), workspaceRoot: f.dir,
  });
  const model = {
    model_id: 'linked-outline', revision: 1, basis: 'Explicit flat two-piece test outline',
    objects: [{ id: 'assembly', subject_kind: 'custom-compound', origin: [0, 0, 0] }],
    points: [
      ...[[8, 8], [24, 8], [24, 32], [8, 32]].map(([x, y], i) => ({
        id: `p${i}`, object_id: 'assembly', position: [x, y, 0], fixed: true,
      })),
      ...[[23, 14], [35, 14], [35, 26], [23, 26]].map(([x, y], i) => ({
        id: `c${i}`, object_id: 'assembly', position: [x, y, 0], fixed: true,
      })),
    ],
    parts: [
      { id: 'parent', object_id: 'assembly', role: 'main piece', outline: ['p0', 'p1', 'p2', 'p3'] },
      { id: 'child', object_id: 'assembly', role: 'attached piece', outline: ['c0', 'c1', 'c2', 'c3'] },
    ],
    constraints: [],
    camera: { kind: 'orthographic', origin: [0, 0], scale: 1, distance: 10, focal_length: 10 },
  };
  const solved = solveConstruction(model);
  const part = (id: string) => solved.parts.find(row => row.id === id)!;
  for (const [index, id] of ['parent', 'child'].entries()) {
    const operationId = `construct-${id}`;
    s.write({
      id: operationId, created_at: `2026-10-11T01:00:0${index}Z`, sequence: index + 1,
      phase: 'completed', dispatched: true, visual: true, tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42 }, preview: f.frame,
      verdict: { disposition: 'accept', target_resolved: 'yes' },
      operation_ack: { receipt_token: 'construction-accepted' },
      report: { did: 'Exact owner contour observed on pixels' },
      object_construction_model: model,
      construction_provenance: {
        model_id: model.model_id, revision: 1, part_id: id, target_sha256: part(id).target_sha256,
      },
      result: { content: [{ type: 'text', text: JSON.stringify({
        continuation_layers: [{ hypothesis_id: id, layer_id: index + 2, construction_change: true,
          construction_tier: index ? 'secondary' : 'primary',
          ...(index ? { parent_hypothesis_id: 'parent', parent_construction_revision: 'construct-parent' } : {}) }],
      }) }] },
    });
  }
  const paint = (id: string, ownerContext: Record<string, unknown>[]) =>
    expandPainterlyPass({
      document_id: 42,
      painterly: {
        owner_id: id, reference: f.reference, reference_bounds: parameters().reference_bounds,
        construction_ref: { model_id: model.model_id, part_id: id, revision: 1 },
        brush_radii: [3, 1.5], max_strokes: 12, max_dimension: 64, error_threshold: 10,
      },
    }, { painterly_frame: f.frame, logical_layer_owners: ownerContext }, () => solved.model);
  const before = s.semanticLayerOwners(42);
  expect(paint('parent', before).provenance.settings.clip_contour).toEqual(part('parent').contour);
  const manifest = [
    { owner_id: 'parent', layer_id: 2, expected_bounds: part('parent').bounds },
    { owner_id: 'child', layer_id: 3, expected_bounds: part('child').bounds },
  ];
  const targetBounds = (b: typeof manifest[0]['expected_bounds']) =>
    ({ left: b.left + 10, right: b.right + 10, top: b.top, bottom: b.bottom });
  const move = {
    id: 'connected-move', created_at: '2026-10-11T01:00:03Z', sequence: 3,
    phase: 'completed', dispatched: true, visual: true,
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42, steps: [{ id: 'move', tool: 'photoshop_move_layer', args: {
      deltaX: 10, deltaY: 0, connected_move: { parent: manifest[0], children: [manifest[1]] },
    } }] },
    preview: f.frame, operation_ack: { receipt_token: 'native-accepted' },
    report: { did: 'Both native pixels moved' },
    verdict: { disposition: 'accept', target_resolved: 'yes' },
    result: { content: [{ type: 'text', text: JSON.stringify({
      pass_execution: { history_ownership: { status: 'exact', total_history_steps: 1 } },
      mutation_results: { move: { ok: true, details: {
        moved: true, connected: true, history_steps: 1, deltaX: 10, deltaY: 0,
        parent_owner_id: 'parent',
        layer_receipts: manifest.map(row => ({ owner_id: row.owner_id, layer_id: row.layer_id,
          source_bounds: row.expected_bounds, target_bounds: targetBounds(row.expected_bounds) })),
      } } },
    }) }] },
  };
  s.write(move);
  const after = s.semanticLayerOwners(42);
  for (const id of ['parent', 'child']) {
    const original = part(id).contour;
    const translated = paint(id, after).provenance.settings.clip_contour;
    expect(translated).toEqual(original.map(p => ({ x: p.x + 10, y: p.y })));
  }
  // If provenance linking the physical owner to the contour is missing, the
  // accepted move is still real, but applying its offset to an arbitrary
  // historical model would be a guess. Stop before Photoshop mutation.
  const originalParent = s.read('construct-parent')!;
  s.write({ ...originalParent, construction_provenance: undefined });
  expect(() => paint('parent', s.semanticLayerOwners(42))).toThrow('Rebuild/revalidate');
  s.write(originalParent);
  // A second accepted native move composes with the first, while an Undo
  // invalidates only the second operation's frame authority.
  const second = structuredClone(move);
  second.id = 'connected-move-second';
  second.sequence = 4;
  const secondStep = second.args.steps[0].args;
  secondStep.deltaX = 5;
  secondStep.connected_move.parent.expected_bounds = targetBounds(manifest[0].expected_bounds);
  secondStep.connected_move.children[0].expected_bounds = targetBounds(manifest[1].expected_bounds);
  const secondBody = JSON.parse(second.result.content[0].text);
  secondBody.mutation_results.move.details.deltaX = 5;
  secondBody.mutation_results.move.details.layer_receipts =
    [secondStep.connected_move.parent, ...secondStep.connected_move.children].map(row => ({
      owner_id: row.owner_id, layer_id: row.layer_id, source_bounds: row.expected_bounds,
      target_bounds: {
        left: row.expected_bounds.left + 5, right: row.expected_bounds.right + 5,
        top: row.expected_bounds.top, bottom: row.expected_bounds.bottom,
      },
    }));
  second.result.content[0].text = JSON.stringify(secondBody);
  s.write(second);
  expect(paint('parent', s.semanticLayerOwners(42)).provenance.settings.clip_contour)
    .toEqual(part('parent').contour.map(p => ({ x: p.x + 15, y: p.y })));
  s.write({ ...second, rolled_back: true });
  expect(paint('parent', s.semanticLayerOwners(42)).provenance.settings.clip_contour)
    .toEqual(part('parent').contour.map(p => ({ x: p.x + 10, y: p.y })));
  s.write({ ...move, verdict: { disposition: 'accept', target_resolved: 'no' } });
  const notAccepted = s.semanticLayerOwners(42);
  expect(paint('parent', notAccepted).provenance.settings.clip_contour).toEqual(part('parent').contour);
});
it('compiles painterly through the real Guard without a Photoshop call, retaining ownership and provenance', async () => {
  const f = files(),
    registry = new ToolRegistry(),
    dispatch = vi.fn(async () => {
      throw new Error('No Photoshop offline');
    });
  for (const name of [
    'photoshop_paint_strokes',
    'photoshop_execute_visual_microplan',
    'photoshop_get_preview',
  ])
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } }, handler: dispatch });
  const store: GuardCycleCompilerStore = {
    collectClosePreviousErrors: () => [],
    collectPreflightErrors: () => [],
    compactPassContext: () => ({
      painting_profile: 'simple_graphic',
      painterly_frame: f.frame,
      logical_layer_owners: [
        {
          hypothesis_id: 'body',
          hypothesis: 'One editable body',
          layer_id: 17,
          rollback_value: 'moderate',
          expected_independent_rollback: true,
        },
      ],
      scene_ownership_plan: {
        plan_id: 'parts',
        units: [
          {
            semantic_id: 'body',
            owner_id: 'body',
            role: 'One editable body',
            editability: 'independent',
            edit_axes: ['visibility', 'color', 'rollback'],
          },
        ],
        objects: [
          {
            object_id: 'body',
            subject_kind: 'single-component',
            kind: 'single-part',
            component_semantic_ids: ['body'],
          },
        ],
      },
    }),
  };
  const compiled = await compileGuardCycle(
    {
      next_pass: {
        request_key: 'painterly-test',
        document_id: 42,
        goal: 'Refine the editable body from reference',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'small',
        painterly: { ...parameters(), owner_id: 'body', reference: f.reference },
      },
    },
    store,
    registry
  );
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  expect(compiled.nextOperation?.painterly_provenance).toMatchObject({
    owner_id: 'body',
    before_operation_id: 'before',
  });
  expect(dispatch).not.toHaveBeenCalled();
});
it('compiles owner-local continuous surface tone through Guard without broad scene relighting authority', async () => {
  const f = files(), registry = new ToolRegistry();
  for (const name of ['photoshop_paint_color_gradient', 'photoshop_execute_visual_microplan', 'photoshop_get_preview']) {
    registry.register(name, {
      tool: { name, inputSchema: { type: 'object' } },
      handler: async () => { throw new Error('No Photoshop offline'); },
    });
  }
  const compiled = await compileGuardCycle({
    next_pass: {
      request_key: 'narrow-native-tone',
      document_id: 42,
      goal: 'Replace discrete patches with a continuous value turn on the already owned side wall.',
      stage: 'FORM', scale: 'medium', region: 'existing narrow side face',
      region_bounds: { left: 15, top: 1, right: 40, bottom: 63 },
      painterly: {
        owner_id: 'side',
        reference_bounds: { left: 0, top: 0, right: 64, bottom: 64 },
        clip_contour: [{ x: 20, y: 3 }, { x: 35, y: 5 }, { x: 35, y: 57 }, { x: 20, y: 59 }],
        form_field: {
          kind: 'light-field',
          center: { x: 28, y: 31 },
          radius: { x: 18, y: 42 },
          light_direction: [-0.6, -0.3, 0.73],
          shadow_color: { red: 23, green: 34, blue: 48 },
          light_color: { red: 72, green: 84, blue: 101 },
        },
      },
    },
  }, {
    collectClosePreviousErrors: () => [],
    collectPreflightErrors: () => [],
    compactPassContext: () => ({
      painting_profile: 'simple_graphic',
      has_visual_frame: true,
      painterly_frame: f.frame,
      logical_layer_owners: [{ hypothesis_id: 'side', hypothesis: 'Narrow raster wall',
        layer_id: 17, rollback_value: 'high', expected_independent_rollback: true }],
      scene_ownership_plan: {
        plan_id: 'wall',
        objects: [{ object_id: 'wall', kind: 'single-part', subject_kind: 'single-component',
          component_semantic_ids: ['side'] }],
        units: [{ semantic_id: 'side', owner_id: 'side', role: 'Narrow raster wall', editability: 'independent',
          edit_axes: ['visibility', 'color', 'lighting', 'rollback'] }],
      },
    }),
  } as GuardCycleCompilerStore, registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  expect(compiled.nextOperation?.painterly_provenance).toMatchObject({
    algorithm: 'native-alpha-protected-surface-gradient', layer_id: 17,
  });
  expect(compiled.nextOperation?.args.steps).toEqual(expect.arrayContaining([
    expect.objectContaining({ tool: 'photoshop_paint_color_gradient',
      args: expect.objectContaining({ layer_id: 17, preserve_transparency: true }) }),
  ]));
});
it('exposes a baseline only for the authoritative current-document completed exact-frame record', () => {
  const f = files(),
    s = new SessionStore(path.join(f.dir, 'controller'), {
      visualBarrierDirectory: path.join(f.dir, 'barriers'),
      workspaceRoot: f.dir,
    });
  const record = {
    id: 'before',
    created_at: '2026-10-09T12:00:00Z',
    sequence: 1,
    phase: 'completed',
    dispatched: true,
    visual: true,
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42 },
    preview: f.frame,
  };
  s.write(record);
  s.updatePaintingState(42, () => ({
    current_frame: { operation_id: 'before', path: f.frame.path, sha256: f.frame.sha256 },
  }));
  expect(s.compactPassContext(42).painterly_frame).toMatchObject({
    sha256: f.frame.sha256,
    canvas_width: 64,
  });
  s.write({ ...record, current_frame_authority: false });
  expect(s.compactPassContext(42).painterly_frame).toBeNull();
  s.write({ ...record, failed: true });
  expect(s.compactPassContext(42).painterly_frame).toBeNull();
  s.write({ ...record, args: { document_id: 99 } });
  expect(s.compactPassContext(42).painterly_frame).toBeNull();
});
