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
