import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import {
  normalizeConstructionModel,
  solveConstruction,
  validateRigidRevision,
  expandConstructionPass,
  CONSTRUCTION_MODEL_SCHEMA,
} from '../src/core/object-construction.js';
import { constructionExecutionIssue } from '../src/core/guard/construction-execution.js';
import { authoredFormField } from '../src/core/authored-form-field.js';
import { expandPainterlyPass, PAINTERLY_PASS_SCHEMA } from '../src/core/painterly-strokes.js';
import {
  documentArtisticDebt,
  bindPaintingCompletion,
  COMPLETION_CRITERIA,
  artisticContinuation,
} from '../src/core/guard/document-artistic-debt.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import {
  applyDeterministicPassRepairs,
  classifyViolation,
} from '../src/core/guard/preflight-repair.js';
import { collectSchemaErrors } from '../src/core/guard/cycle-compiler.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';

function model() {
  return {
    model_id: 'arbitrary-object',
    revision: 1,
    basis: 'Chosen measured geometry, no inferred object template',
    objects: [{ id: 'object', subject_kind: 'custom-compound', rigid: true }],
    points: [
      ['a', 20, 20],
      ['b', 60, 20],
      ['c', 60, 60],
      ['d', 20, 60],
      ['e', 60, 30],
      ['f', 80, 30],
      ['g', 80, 45],
      ['h', 60, 45],
    ].map(([id, x, y]) => ({ id, object_id: 'object', position: [x, y], fixed: true })),
    parts: [
      { id: 'body', object_id: 'object', role: 'Main component', outline: ['a', 'b', 'c', 'd'] },
      {
        id: 'extension',
        object_id: 'object',
        role: 'Connected extension',
        outline: ['e', 'f', 'g', 'h'],
      },
    ],
    proportion_checks: [
      { id: 'relative-length', points: ['a', 'b', 'e', 'f'], min: 1.9, max: 2.1 },
    ],
    camera: { kind: 'orthographic', origin: [0, 0], scale: 1 },
  };
}
function form() {
  return {
    kind: 'ellipsoid',
    center: { x: 50, y: 50 },
    radius: { x: 42, y: 42 },
    light_direction: [-1, 0, 1],
    shadow_color: { red: 30, green: 20, blue: 40 },
    light_color: { red: 230, green: 210, blue: 160 },
  };
}

it('rejects bad chosen proportions and preserves every rigid part under one shared pose', () => {
  const original = normalizeConstructionModel(model());
  expect(collectSchemaErrors(model(), CONSTRUCTION_MODEL_SCHEMA)).toEqual([]);
  const changed = structuredClone(original);
  changed.revision++;
  changed.objects[0].rotation[2] = 10;
  expect(() => validateRigidRevision(original, changed)).not.toThrow();
  const wrong = structuredClone(changed);
  wrong.points.find((p) => p.id === 'f')!.position[0] += 20;
  expect(() => validateRigidRevision(original, wrong)).toThrow(/intrinsic shape/);
  expect(() => solveConstruction(wrong)).toThrow(/Measured ratio/);
  expect(() => validateRigidRevision(original, wrong, ['object'])).not.toThrow();
  expect(() => validateRigidRevision(original, wrong, ['unknown'])).toThrow();
});
it('generates owned replacement instead of accumulating the previous silhouette', async () => {
  const raw = {
    request_key: 'rebuild',
    document_id: 7,
    goal: 'Rebuild one connected component',
    construction: { model: model(), part_id: 'body', color: { red: 100, green: 70, blue: 50 } },
  };
  const context = {
    painting_profile: 'simple_graphic',
    construction_policy: 'enforced',
    logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 9 }],
  };
  const result = expandConstructionPass(raw, context, () => null);
  expect(result.pass.action_class).toBe('REPLACE');
  expect(result.pass.actions[0]).toMatchObject({
    tool: 'photoshop_paint_regions',
    args: { replace_contents: true, regions: [{ layer_id: 9 }] },
  });
  const registry = new ToolRegistry();
  const dispatch = vi.fn();
  for (const name of [
    'photoshop_paint_regions',
    'photoshop_get_preview',
    'photoshop_execute_visual_microplan',
  ])
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } }, handler: dispatch });
  const compiled = await compileGuardCycle(
    { next_pass: raw },
    {
      collectClosePreviousErrors: () => [],
      collectPreflightErrors: () => [],
      compactPassContext: () => context,
    },
    registry
  );
  expect(compiled.violations).toEqual([]);
  expect(dispatch).not.toHaveBeenCalled();
  expect(compiled.nextOperation?.construction_provenance).toMatchObject({
    part_id: 'body',
    pixel_geometry_verified: false,
  });
});
it('enforces executable geometry for fresh compound owners and blocks stale/manual pose bypass', () => {
  const raw: any = {
    logical_layer: { hypothesis_id: 'body' },
    actions: [{ tool: 'photoshop_rotate_layer', args: { degrees: 6 } }],
  };
  const context: any = {
    construction_policy: 'enforced',
    scene_ownership_plan: {
      units: [{ owner_id: 'body', semantic_id: 'body' }],
      objects: [
        {
          object_id: 'anything',
          kind: 'compound-object',
          component_semantic_ids: ['body', 'extension'],
        },
      ],
    },
  };
  expect(constructionExecutionIssue(raw, context)?.code).toBe('construction_execution_required');
  context.construction_bindings = [{ owner_id: 'body', model_id: 'arbitrary-object', revision: 2 }];
  expect(constructionExecutionIssue(raw, context)?.code).toBe('construction_execution_required');
  raw.actions = [{ tool: 'photoshop_paint_strokes', args: {} }];
  expect(constructionExecutionIssue(raw, context)).toBeUndefined();
  context.construction_bindings[0].needs_rebuild = true;
  expect(constructionExecutionIssue(raw, context)?.code).toBe(
    'construction_component_rebuild_required'
  );
  expect(
    constructionExecutionIssue(
      { ...raw, construction: { part_id: 'body' } },
      context,
      normalizeConstructionModel(model())
    )
  ).toBeUndefined();
});
it('does not treat a pure solve or unmapped compound as an execution/proportion contract', () => {
  const input: any = model();
  delete input.proportion_checks;
  const raw = { construction: { part_id: 'body' } };
  expect(
    constructionExecutionIssue(
      raw,
      { construction_policy: 'enforced' },
      normalizeConstructionModel(input)
    )?.code
  ).toBe('construction_proportion_contract_required');
});
it('retains document-wide artistic debt after nonvisual saves without blocking technical closure', () => {
  const state: any = {
    last_critique: {
      target_resolved: 'no',
      primary_mismatch: 'wrong proportions',
      primitive_footprint: 'suspect',
    },
    visual_problems: { bad: { status: 'open' } },
  };
  expect(documentArtisticDebt(state, { visual: false })).toContain('unresolved_visual_target');
  const store: any = Object.create(SessionStore.prototype);
  store.documentNextRequiredAction = () => 'ready';
  store.paintingState = () => ({ documents: { 7: state } });
  store.constructionBindings = () => [];
  expect(store.closeOnlyNextRequiredAction(7)).toContain('wrong proportions');
  store.documentNextRequiredAction = () => 'reconcile uncertain operation';
  expect(store.closeOnlyNextRequiredAction(7)).toBe('reconcile uncertain operation');
  state.last_critique = { target_resolved: 'yes' };
  state.visual_problems.bad.status = 'resolved';
  store.documentNextRequiredAction = () => 'ready';
  expect(store.closeOnlyNextRequiredAction(7)).toBe('ready');
  store.constructionBindings = () => [
    {
      owner_id: 'extension',
      model_id: 'object',
      revision: 2,
      constructed: true,
      needs_rebuild: true,
    },
  ];
  expect(store.closeOnlyNextRequiredAction(7)).toContain('object@2/extension');
});
it('generates directional light/volume from explicit colors without a fake reference file', () => {
  const bounds = { left: 0, top: 0, right: 100, bottom: 100 };
  const field = authoredFormField(form(), bounds, 100);
  const at = (x: number, y: number) => field.data[(y * 100 + x) * 4];
  expect(at(25, 50)).toBeGreaterThan(at(75, 50));
  expect(new Set(field.data.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(50);
  expect(authoredFormField(form(), bounds, 100).sha256).toBe(field.sha256);
  expect(() => authoredFormField({ ...form(), light_direction: [0, 0, 0] }, bounds)).toThrow();
});
it('compiles reference-free strokes on exactly one existing owner with durable honest provenance', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'form-field-'));
  try {
    const file = path.join(dir, 'before.jpg');
    writeFileSync(
      file,
      jpeg.encode({ width: 100, height: 100, data: Buffer.alloc(40000, 0) }, 80).data
    );
    const raw: any = {
      document_id: 7,
      painterly: {
        owner_id: 'body',
        form_field: form(),
        reference_bounds: { left: 0, top: 0, right: 100, bottom: 100 },
        clip_contour: [
          { x: 5, y: 5 },
          { x: 95, y: 5 },
          { x: 95, y: 95 },
          { x: 5, y: 95 },
        ],
        clip_exclusions: [
          [
            { x: 40, y: 40 },
            { x: 60, y: 40 },
            { x: 60, y: 60 },
            { x: 40, y: 60 },
          ],
        ],
        brush_radii: [3],
        max_strokes: 3,
        max_length: 4,
        max_dimension: 100,
      },
    };
    expect(collectSchemaErrors(raw.painterly, PAINTERLY_PASS_SCHEMA)).toEqual([]);
    const generated = expandPainterlyPass(
      raw,
      {
        logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 9 }],
        painterly_frame: {
          path: file,
          sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
          canvas_width: 100,
          canvas_height: 100,
        } as any,
      },
      () => null
    );
    expect(generated.provenance).toMatchObject({
      source_kind: 'authored-form-field',
      owner_id: 'body',
      layer_id: 9,
    });
    expect(generated.provenance).not.toHaveProperty('reference_path');
    expect(generated.pass.actions[0].args.strokes.length).toBeGreaterThan(0);
    expect(generated.pass.actions[0].args.layer_id).toBe(9);
    expect(() =>
      expandPainterlyPass(
        { ...raw, painterly: { ...raw.painterly, reference: { path: 'fake.jpg' } } },
        {
          logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 9 }],
          painterly_frame: {
            path: file,
            sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
            canvas_width: 100,
            canvas_height: 100,
          } as any,
        },
        () => null
      )
    ).toThrow(/exactly one/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('repairs the actual missing nested preview/transform pin together without rewriting mutations', () => {
  const raw: any = {
    document_id: 7,
    logical_layer: { decision: 'continue-logical-layer', hypothesis_id: 'body' },
    actions: [
      {
        tool: 'photoshop_execute_visual_microplan',
        args: { steps: [{ id: 'turn', tool: 'photoshop_rotate_layer', args: { degrees: 6 } }] },
      },
    ],
  };
  const repaired = applyDeterministicPassRepairs(
    raw,
    [
      {
        scope: 'next_operation',
        code: 'invalid_visual_microplan',
        message: 'the final VisualMicroPlan step must be photoshop_get_preview',
      },
    ],
    { logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 9 }] }
  );
  const steps: any = repaired.repaired_pass.actions[0].args.steps;
  expect(steps[0].args).toMatchObject({ degrees: 6, layer_id: 9 });
  expect(steps.at(-1).tool).toBe('photoshop_get_preview');
  expect(raw.actions[0].args.steps).toHaveLength(1);
  raw.actions[0].args.steps[0].args.layer_id = 99;
  const conflict = applyDeterministicPassRepairs(
    raw,
    [
      {
        scope: 'next_operation',
        code: 'invalid_visual_microplan',
        message: 'the final VisualMicroPlan step must be photoshop_get_preview',
      },
    ],
    { logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 9 }] }
  );
  expect((conflict.repaired_pass.actions as any)[0].args.steps[0].args.layer_id).toBe(99);
  expect(
    classifyViolation({
      scope: 'next_operation',
      code: 'compact_actions_required',
      message: 'Missing actions',
    })
  ).toBe('CONTRACT_CORRECTION');
});
it('returns multiple exact contracts in one read-only call', async () => {
  const toolContract = vi.fn((name) => ({ tool_name: name, execution: 'not-executed' }));
  const definition = createGuardTools({ toolContract } as any).find(
    (d) => d.tool.name === 'photoshop_guard_capabilities'
  )!;
  const response = await definition.handler({
    tool_names: ['photoshop_rotate_layer', 'photoshop_move_layer'],
  });
  expect(JSON.parse((response.content[0] as any).text).contracts).toHaveLength(2);
  expect(toolContract).toHaveBeenCalledTimes(2);
});

async function nativeRebuild(clearFailure = false, targetIds = [9]) {
  const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8');
  const block = source.slice(
    source.indexOf('async function paintRegions(params'),
    source.indexOf('function previewDocumentDescriptor')
  );
  const events: any[] = [];
  const doc: any = {
    id: 7,
    activeLayers: [{ id: 9 }],
    selection: {
      selectAll: async () => events.push('select-all'),
      deselect: async () => events.push('deselect'),
    },
    pathItems: { add: async () => events.push('path-added') },
  };
  const batchPlay = async (descriptors: any[]) => {
    for (const descriptor of descriptors) events.push(descriptor._obj);
    if (descriptors[0]._obj === 'get') return [{ name: 'component', layerKind: 1 }];
    if (clearFailure && descriptors[0]._obj === 'delete') return [{ _obj: 'error' }];
    return [{}];
  };
  const context: any = {
    app: { activeDocument: doc, documents: [doc] },
    action: { batchPlay },
    READ_BATCHPLAY_OPTIONS: {},
    core: {
      executeAsModal: async (fn: any) =>
        fn({
          hostControl: {
            suspendHistory: async () => 1,
            resumeHistory: async (_: any, commit: any) => events.push(['history', commit]),
          },
        }),
    },
    readSessionDescriptors: async () => ({
      documentCount: 1,
      documentDescriptor: { documentID: 7, width: 100, height: 100, resolution: 72 },
    }),
    numericValue: (v: any) => v,
    documentPixelDimension: (v: any) => v,
    layerByIdDescriptor: (id: number) => ({ _obj: 'get', id }),
    validatePaintTargetDescriptor: () => {},
    bezierCriticalPoints: () => [],
    assertCanvasPoint: () => {},
    selectLayerByIdDescriptor: (id: number) => ({ _obj: 'select', id }),
    makeUxpRegionSubPath: () => ({}),
    paintTargetCompositing: () => ({ layer_id: 9 }),
    Date,
    Number,
    Array,
  };
  vm.createContext(context);
  vm.runInContext(block + '\nthis.paint = paintRegions;', context);
  const run = () =>
    context.paint({
      document_id: 7,
      replace_contents: true,
      regions: targetIds.map((layerId) => ({
        layerId,
        color: { red: 1, green: 2, blue: 3 },
        opacity: 100,
        contours: [
          {
            points: [
              { x: 1, y: 1 },
              { x: 2, y: 1 },
              { x: 1, y: 2 },
            ],
          },
        ],
      })),
    });
  return { run, events };
}
it('native rebuild clears the exact pixel target before painting in one undo transaction', async () => {
  const { run, events } = await nativeRebuild();
  await run();
  expect(events.indexOf('select-all')).toBeLessThan(events.indexOf('delete'));
  expect(events.indexOf('delete')).toBeLessThan(events.indexOf('path-added'));
  expect(events).toContainEqual(['history', true]);
});
it('native clear failure rolls back and never proceeds to paint; multi-layer replacement is refused', async () => {
  const failed = await nativeRebuild(true);
  await expect(failed.run()).rejects.toThrow('clear_failed');
  expect(failed.events).toContainEqual(['history', false]);
  expect(failed.events).not.toContain('path-added');
  const mixed = await nativeRebuild(false, [9, 10]);
  await expect(mixed.run()).rejects.toThrow('one_pinned');
  expect(mixed.events).not.toContain('select-all');
});

it('reviews the union of old/new extents and rejects a crop hiding removed pixels', () => {
  const raw = {
    document_id: 7,
    construction: { model: model(), part_id: 'body', color: { red: 100, green: 70, blue: 50 } },
  };
  const context = {
    logical_layer_owners: [{ hypothesis_id: 'body', layer_id: 9 }],
    construction_bindings: [
      { owner_id: 'body', bounds: { left: 5, top: 10, right: 50, bottom: 55 } },
    ],
  };
  expect(expandConstructionPass(raw, context, () => null).pass.region_bounds).toEqual({
    left: 5,
    top: 10,
    right: 60,
    bottom: 60,
  });
  expect(() =>
    expandConstructionPass(
      { ...raw, region_bounds: { left: 20, top: 20, right: 60, bottom: 60 } },
      context,
      () => null
    )
  ).toThrow(/old and new/);
});
it('does not crash on malformed uncompiled action/plan containers or rebind one part to another model', () => {
  const context: any = { construction_policy: 'enforced' };
  expect(constructionExecutionIssue({ actions: [null] }, context)).toBeUndefined();
  expect(
    constructionExecutionIssue(
      {
        logical_layer: { hypothesis_id: 'body' },
        actions: [{ tool: 'photoshop_paint_regions' }],
        scene_ownership_plan: { units: 'bad', objects: 'bad' },
      },
      context
    )
  ).toBeUndefined();
  context.construction_bindings = [{ owner_id: 'body', model_id: 'other', revision: 1 }];
  expect(
    constructionExecutionIssue(
      { logical_layer: { hypothesis_id: 'body' }, construction: { part_id: 'body' } },
      context,
      normalizeConstructionModel(model())
    )?.code
  ).toBe('construction_owner_model_conflict');
});

it('requires current whole-brief assessment, independent of local success and saves', () => {
  const state: any = {
    construction_policy: 'enforced',
    original_brief: 'Arbitrary object in morning light',
    current_frame: { sha256: 'frame-1' },
    last_critique: { target_resolved: 'yes', primitive_footprint: 'none' },
  };
  expect(documentArtisticDebt(state)).toEqual(['whole_brief_review_required']);
  expect(artisticContinuation(state)).toContain('previous_observation.painting_completion');
  const review = {
    scope: 'whole-brief',
    summary: 'Visible proportions, background light and contact match the original task',
    criteria: Object.fromEntries(COMPLETION_CRITERIA.map((key) => [key, 'pass'])),
  };
  state.painting_completion = bindPaintingCompletion(review, state, 'frame-1');
  expect(documentArtisticDebt(state, { visual: false, tool: 'photoshop_save_document' })).toEqual(
    []
  );
  state.current_frame.sha256 = 'frame-2';
  expect(documentArtisticDebt(state)).toContain('whole_brief_review_required');
  state.current_frame.sha256 = 'frame-1';
  state.original_brief += ' plus a curtain';
  expect(documentArtisticDebt(state)).toContain('whole_brief_review_required');
  state.painting_completion = bindPaintingCompletion(
    { ...review, criteria: { ...review.criteria, light_material: 'fail' } },
    state,
    'frame-1'
  );
  expect(documentArtisticDebt(state)).toContain('whole_brief_criteria_unmet');
  expect(artisticContinuation(state)).toContain('light_material');
  expect(() => bindPaintingCompletion({ scope: 'whole-brief' }, state, 'frame-1')).toThrow(
    'six public criteria'
  );
  expect(() => bindPaintingCompletion(review, {}, 'frame-1')).toThrow('original_brief');
});

it('adds whole-brief assessment after save without repainting or overwriting the last verdict', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'final-review-'));
  try {
    const file = path.join(folder, 'frame.jpg');
    writeFileSync(file, 'exact retained pixels');
    const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
    let state: any = {
      construction_policy: 'enforced',
      original_brief: 'Custom compound in morning light',
      current_frame: { operation_id: 'visual-1', sha256: sha, accepted: true },
    };
    const source: any = {
      visual: true,
      args: { document_id: 7 },
      verdict: { disposition: 'accept' },
      preview: { sha256: sha, materialized_path: file },
    };
    const store: any = Object.create(SessionStore.prototype);
    store.assertDocumentIdentityVerified = vi.fn();
    store.paintingState = () => ({ documents: { 7: state } });
    store.read = () => source;
    store.visualDeliveryDebt = () => undefined;
    store.updatePaintingState = (_id: number, update: any) => {
      state = update(state);
    };
    const input = {
      previous_visual_verdict: {
        painting_completion: {
          scope: 'whole-brief',
          summary: 'Current delivered scene satisfies each original required criterion',
          criteria: Object.fromEntries(COMPLETION_CRITERIA.map((key) => [key, 'pass'])),
        },
      },
    };
    const save = { visual: false, args: { document_id: 7 } };
    store.finalWholeBriefReview(input, save, false);
    expect(state.painting_completion).toBeUndefined();
    store.finalWholeBriefReview(input, save, true);
    expect(documentArtisticDebt(state)).toEqual([]);
    expect(source.verdict).toEqual({ disposition: 'accept' });
    writeFileSync(file, 'different pixels');
    expect(() => store.finalWholeBriefReview(input, save, true)).toThrow('exact retained');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it('enforces fresh runs after blank-document bootstrap but preserves existing painted/imported frames', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'fresh-construction-policy-'));
  try {
    const store: any = new SessionStore(path.join(folder, 'controller'), {
      visualBarrierDirectory: path.join(folder, 'barriers'), workspaceRoot: folder });
    for (const [id, tool, frame] of [[1, 'photoshop_create_document', 'bootstrap'],
      [2, 'photoshop_create_document', 'painted-frame'], [3, 'photoshop_open_image', 'bootstrap']] as const) {
      store.updatePaintingState(id, (current: any) => ({ ...current,
        document_instance: { bootstrap_tool: tool, bootstrap_operation_id: 'bootstrap' },
        current_frame: { operation_id: frame, sha256: 'existing-pixels' } }));
      store.setArtRunState({ document_id: id, process_dir: `processes/policy-process/study-${id}`,
        painting_profile: 'nontrivial_painting', original_brief: 'Arbitrary compound object with editable parts' });
    }
    const state = store.paintingState().documents;
    expect(state[1].construction_policy).toBe('enforced');
    expect(state[2].construction_policy).toBeUndefined();
    expect(state[3].construction_policy).toBeUndefined();
    expect(state[2].current_frame.sha256).toBe('existing-pixels');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
