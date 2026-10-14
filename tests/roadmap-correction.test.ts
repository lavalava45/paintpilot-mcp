import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import {
  criticCorrectionIssue,
  correctionFinding,
  correctionStrategy,
  advanceCriticCorrections,
  originalBriefAnchor,
  criticCorrectionContext,
} from '../src/core/guard/critic-correction.js';
import { persistChatCritic } from '../src/core/guard/chat-critic.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { compilePaintingIntentToNextPass } from '../src/core/guard/next-pass-compiler.js';
import { guardResumeSubset, projectGuardDiagnostics } from '../src/core/guard/response-budget.js';
import { authoredFormField } from '../src/core/authored-form-field.js';
import {
  normalizePainterly,
  planPainterlyStrokes,
  expandPainterlyPass,
} from '../src/core/painterly-strokes.js';
import {
  compileContourMask,
  intersectContourCoverage,
  contourMaskContains,
  insetContourMask,
} from '../src/core/contour-geometry.js';
const finding = (kind = 'form') =>
  correctionFinding({
    criterion: 'form_proportions',
    correction_kind: kind,
    visible: 'The visible subject has incorrect structure relative to the original task.',
    next_change: 'Rebuild the affected structure, then compare the exact whole image.',
  });
const paint = {
  tool: 'photoshop_paint_regions',
  args: {
    regions: [
      {
        contours: [
          {
            points: [
              { x: 2, y: 2 },
              { x: 20, y: 2 },
              { x: 20, y: 20 },
            ],
            closed: true,
          },
        ],
        color: { red: 20, green: 30, blue: 40 },
      },
    ],
  },
};
const operation = (atoms = [paint]) => ({
  id: 'correction-1',
  phase: 'completed',
  visual: true,
  impact_class: 'construct',
  tool: 'photoshop_execute_visual_microplan',
  args: { steps: atoms },
  preview: { sha256: 'after' },
});
const bounds = { left: 0, top: 0, right: 64, bottom: 64 };
const square = [
  { x: 0, y: 0 },
  { x: 64, y: 0 },
  { x: 64, y: 64 },
  { x: 0, y: 64 },
];
const fieldBase = {
  light_direction: [0, 0, 1],
  shadow_color: { red: 10, green: 20, blue: 30 },
  light_color: { red: 180, green: 190, blue: 200 },
  ambient: 0.1,
};
const surface = () => ({
  ...fieldBase,
  kind: 'surface',
  surfaces: [
    {
      vertices: [
        { x: 4, y: 4, z: 0 },
        { x: 60, y: 4, z: 0 },
        { x: 60, y: 60, z: 0 },
      ],
      normals: [
        [-0.8, 0, 0.6],
        [0.8, 0, 0.6],
        [0.8, 0, 0.6],
      ],
    },
    {
      vertices: [
        { x: 4, y: 4, z: 0 },
        { x: 60, y: 60, z: 0 },
        { x: 4, y: 60, z: 0 },
      ],
      normals: [
        [-0.8, 0, 0.6],
        [0.8, 0, 0.6],
        [-0.8, 0, 0.6],
      ],
    },
  ],
});
const shadow = () => ({
  ...fieldBase,
  kind: 'cast-shadow',
  light_direction: [1, 0, 1],
  caster: {
    owner_id: 'object',
    contour: [
      { x: 20, y: 20, z: 8 },
      { x: 40, y: 20, z: 8 },
      { x: 40, y: 40, z: 8 },
      { x: 20, y: 40, z: 8 },
    ],
  },
  receiver: { owner_id: 'shadow', point: { x: 0, y: 0, z: 0 }, normal: [0, 0, 1] },
  contact: { x: 12, y: 20, z: 0 },
  contact_density: 0.9,
  falloff: 15,
});
const red = (img: any, x: number, y: number) => img.data[(y * img.width + x) * 4];

it('routes the five defect families to real mutation methods instead of cosmetic work', () => {
  for (const [kind, atoms] of [
    ['missing-object', [{ tool: 'photoshop_create_layer', args: {} }, paint]],
    ['composition', [{ tool: 'photoshop_transform_layer', args: { translation: { x: 5, y: 4 } } }]],
    ['form', [paint]],
    [
      'light',
      [
        {
          tool: 'photoshop_paint_color_gradient',
          args: { from: { x: 1, y: 1 }, to: { x: 40, y: 40 } },
        },
      ],
    ],
    ['material', [paint]],
    ['contact', [paint]],
  ] as any) {
    const state = { chat_critic_findings: [finding(kind)] };
    expect(criticCorrectionIssue(state, operation(atoms)), kind).toBeUndefined();
    expect(criticCorrectionIssue(state, { ...operation(), impact_class: 'texture' })?.code).toBe(
      'critic_correction_method_mismatch'
    );
    expect(
      criticCorrectionIssue(state, operation([{ tool: 'photoshop_apply_gaussian_blur', args: {} }]))
        ?.code
    ).toBe('critic_correction_method_mismatch');
  }
  expect(
    criticCorrectionIssue({ chat_critic_findings: [finding('missing-object')] }, operation())?.code
  ).toBe('critic_correction_method_mismatch');
  const dedicated = {
    chat_critic_findings: [finding('missing-object')],
    logical_layer_owners: [{ hypothesis_id: 'subject-body', layer_id: 7 }],
    scene_ownership_plan: { units: [{ owner_id: 'subject-body', semantic_id: 'body' }],
      objects: [{ component_semantic_ids: ['body'] }] },
  };
  const buildExisting = operation([{ ...paint, args: { ...paint.args, layer_id: 7 } }]);
  expect(criticCorrectionIssue(dedicated, buildExisting)).toBeUndefined();
  expect(criticCorrectionIssue({ ...dedicated, scene_ownership_plan: null }, buildExisting)?.code)
    .toBe('critic_correction_method_mismatch');
  const ranked = persistChatCritic(
    {},
    {
      document_id: 1,
      document_incarnation_id: 'one',
      brief_sha256: 'brief',
      operation_id: 'review',
      frame_sha256: 'exact',
      criteria: { form_proportions: 'fail', light_material: 'fail' },
      findings: [
        {
          criterion: 'light_material',
          correction_kind: 'material',
          visible: 'The material has no coherent oriented highlight.',
          next_change: 'Rebuild the surface response before adding fine grain.',
        },
        finding(),
      ],
    }
  );
  expect(ranked.chat_critic_findings[0].correction_kind).toBe('material');
  // A Critic-ranked form-first case must still reject cosmetic detail.
  const unresolvedStructure = {
    chat_critic_findings: [ranked.chat_critic_findings[1], ranked.chat_critic_findings[0]],
  };
  expect(criticCorrectionIssue(unresolvedStructure, { ...operation(), stage: 'DETAIL' })?.code)
    .toBe('critic_correction_method_mismatch');
  expect(criticCorrectionIssue(unresolvedStructure, operation([{ tool: 'photoshop_paint_dabs', args: { dabs: [] } }]))?.code)
    .toBe('critic_correction_method_mismatch');
  const sameContoursDifferentColor = structuredClone(operation());
  sameContoursDifferentColor.args.steps[0].args.regions[0].color.red = 88;
  expect(criticCorrectionIssue(unresolvedStructure, sameContoursDifferentColor, operation())?.code)
    .toBe('critic_structural_geometry_unchanged');
  sameContoursDifferentColor.args.steps[0].args.regions[0].contours[0].points[1].x += 5;
  expect(criticCorrectionIssue(unresolvedStructure, sameContoursDifferentColor, operation()))
    .toBeUndefined();
});

it('requires changed actual construction after two no-gain attempts and never clears debt on local success', () => {
  let state: any = { chat_critic_findings: [finding()] };
  const observation = { verdict: 'neutral', target_resolved: 'no', disposition: 'correct' };
  state = { ...state, ...advanceCriticCorrections(state, operation(), observation) };
  state = {
    ...state,
    ...advanceCriticCorrections(state, { ...operation(), id: 'correction-2' }, observation),
  };
  expect(criticCorrectionIssue(state, operation())?.code).toBe(
    'critic_correction_strategy_exhausted'
  );
  const renamed: any = {
    ...operation(),
    id: 'renamed',
    causal_strategy_id: 'new-label',
    args: structuredClone(operation().args),
  };
  renamed.args.steps[0].args.regions[0].color.red = 230;
  expect(correctionStrategy(renamed)).toBe(correctionStrategy(operation()));
  expect(criticCorrectionIssue(state, renamed)?.code).toBe('critic_correction_strategy_exhausted');
  renamed.args.steps[0].args.regions[0].contours[0].points[1].x = 26;
  expect(criticCorrectionIssue(state, renamed)).toBeUndefined();
  const local = {
    ...state,
    ...advanceCriticCorrections(
      state,
      { ...operation(), id: 'gain' },
      { verdict: 'improvement', target_resolved: 'yes', disposition: 'accept' }
    ),
  };
  expect(local.chat_critic_findings).toHaveLength(1);
  const passed = advanceCriticCorrections(
    local,
    { ...operation(), id: 'whole-review' },
    { ...observation },
    { criteria: { form_proportions: 'pass' } }
  );
  expect(passed.critic_correction_attempts).toEqual({});
});

it('projects newly closed Critic findings before the next intent is compiled in the same cycle', () => {
  const base: any = {
    paintingState: {
      documents: { '42': { original_brief: 'A complete scene with convincing surface light.' } },
    },
    records: [],
  };
  const record: any = { ...operation(), args: { ...operation().args, document_id: 42 } };
  const review: any = {
    document_id: 42,
    document_incarnation_id: 'current',
    brief_sha256: 'original',
    operation_id: record.id,
    frame_sha256: 'after',
    criteria: { light_material: 'fail' },
    findings: [{ ...finding('light'), criterion: 'light_material', problem_id: 'critic-light_material' }],
  };
  const mock: any = {
    read: () => record,
    captureProjectionContext: () => base,
    validateChatCritic: () => review,
  };
  const projected = SessionStore.prototype.projectCriticClosure.call(
    mock,
    { previous_operation_id: record.id, previous_visual_verdict: { disposition: 'accept' } },
    base
  )!;
  expect(base.paintingState.documents['42'].chat_critic_findings).toBeUndefined();
  const context: any = {
    stage: 'FORM',
    scale: 'medium',
    logical_layer_owners: [
      {
        hypothesis_id: 'surface',
        layer_id: 7,
        rollback_value: 'low',
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
      },
    ],
    critic_correction: criticCorrectionContext(projected.paintingState.documents['42']),
  };
  const result = compilePaintingIntentToNextPass(
    {
      request_key: 'next',
      problem_id: 'bounded-light',
      document_id: 42,
      target_owner_id: 'surface',
      goal: 'Restore the original task illumination on this surface',
      action: 'refine',
      visual_intent: 'light-sculpt',
      actions: [paint],
    },
    { compactPassContext: () => context }
  );
  expect(result.next_pass.addresses_problem_id).toBe('critic-light_material');
  expect(result.next_pass.change_domains).toEqual(['large-value', 'lighting-structure']);
});

it('restores the full original brief at Critic/recovery boundaries despite a prior receipt, without adding images', () => {
  const brief = 'Original subject, scene and style. '.repeat(100),
    state = { original_brief: brief, chat_critic_findings: [finding()] };
  const compact = originalBriefAnchor(state);
  expect(compact.intent_excerpt.length).toBeLessThanOrEqual(320);
  expect(compact.unmet_requirements).toHaveLength(1);
  const restore = originalBriefAnchor(state, true);
  expect(restore.original_brief).toBe(brief);
  expect(restore.brief_sha256).toBe(
    createHash('sha256').update(JSON.stringify(brief)).digest('hex')
  );
  const recovery = guardResumeSubset(
    { document_id: 42, document: { document_id: 42 }, task_anchor: restore },
    'recovery'
  );
  expect(recovery.task_anchor.original_brief).toBe(brief);
  const checkpoint = SessionStore.prototype.continuationCheckpoint.call(
    {
      resume: () => ({ ...recovery, document: { document_id: 42 } }),
      currentDocumentIncarnationId: () => 'current',
    } as any,
    42
  );
  expect(checkpoint.task_anchor.original_brief).toBe(brief);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painting-brief-anchor-'));
  try {
    const input: any = {
      artistic_review: {
        original_brief: brief,
        task_anchor: restore,
        critic_role: { required: true },
        language: 'en',
      },
    };
    const projected: any = projectGuardDiagnostics(input, dir, {
      sha256: 'already-delivered',
      operation_id: 'old',
    });
    expect(projected.artistic_review.original_brief).toBe(brief);
    expect(projected.images).toBeUndefined();
    const ordinary: any = projectGuardDiagnostics(
      {
        artistic_review: {
          original_brief: brief,
          task_anchor: compact,
          critic_role: { required: false },
          language: 'en',
        },
      },
      dir,
      { sha256: 'already-delivered', operation_id: 'old' }
    );
    expect(ordinary.artistic_review.original_brief).toBeUndefined();
    expect(ordinary.artistic_review.task_anchor.intent_excerpt).toBe(compact.intent_excerpt);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('renders arbitrary oriented surfaces/materials and matching sections into different actual target pixels', () => {
  const a = authoredFormField({ ...surface(), light_direction: [-1, 0, 1] }, bounds, 64);
  const b = authoredFormField({ ...surface(), light_direction: [1, 0, 1] }, bounds, 64);
  expect(red(a, 12, 32)).toBeGreaterThan(red(a, 52, 32));
  expect(red(b, 12, 32)).toBeLessThan(red(b, 52, 32));
  const glossy = authoredFormField(
    {
      ...surface(),
      material: { roughness: 0.6, specular_strength: 0.6, anisotropy: 0.4, tangent: [0, 1, 0] },
    },
    bounds,
    64
  );
  expect(glossy.data).not.toEqual(authoredFormField(surface(), bounds, 64).data);
  const section = authoredFormField(
    {
      ...fieldBase,
      kind: 'surface',
      sections: [
        {
          points: [
            { x: 4, y: 4, z: 0 },
            { x: 60, y: 4, z: 0 },
          ],
        },
        {
          points: [
            { x: 4, y: 60, z: 0 },
            { x: 60, y: 60, z: 0 },
          ],
        },
      ],
    },
    bounds,
    64
  );
  expect(red(section, 32, 32)).toBeGreaterThan(170);
  expect(() =>
    authoredFormField(
      {
        ...surface(),
        surfaces: [
          {
            vertices: [
              { x: 1, y: 1, z: 0 },
              { x: 1, y: 1, z: 0 },
              { x: 1, y: 1, z: 0 },
            ],
          },
        ],
      },
      bounds,
      64
    )
  ).toThrow('Degenerate');
});

it('turns surface coverage and protected exclusions into bounded real brush actions', () => {
  const authored = authoredFormField(surface(), bounds, 64);
  const hole = [
    { x: 25, y: 25 },
    { x: 39, y: 25 },
    { x: 39, y: 39 },
    { x: 25, y: 39 },
  ];
  const settings = normalizePainterly({
    reference_bounds: bounds,
    clip_contour: square,
    clip_exclusions: [hole],
    brush_radii: [3, 1.5],
    max_strokes: 12,
    max_dimension: 64,
    error_threshold: 5,
  });
  const before = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(245) };
  const generated = planPainterlyStrokes(authored, before, { width: 64, height: 64 }, settings);
  expect(generated.strokes.length).toBeGreaterThan(0);
  expect(generated.strokes.length).toBeLessThanOrEqual(12);
  const mask = intersectContourCoverage(compileContourMask(square, [hole]), authored.source_mask!);
  for (const stroke of generated.strokes)
    for (const point of stroke.points)
      expect(contourMaskContains(insetContourMask(mask, stroke.size / 2), point)).toBe(true);
});

it('projects an owner-bound contact shadow, changes its pixels with light, and dispatches no Photoshop calls', () => {
  const a = authoredFormField(shadow(), bounds, 64),
    b = authoredFormField({ ...shadow(), light_direction: [-1, 0, 1] }, bounds, 64);
  expect(a.data).not.toEqual(b.data);
  expect(red(a, 14, 22)).toBeLessThan(red(a, 28, 36));
  expect(() => authoredFormField({ ...shadow(), light_direction: [1, 0, 0] }, bounds, 64)).toThrow(
    'parallel'
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painting-shadow-'));
  try {
    const bytes = jpeg.encode(
        { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(235) },
        95
      ).data,
      file = path.join(dir, 'before.jpg');
    fs.writeFileSync(file, bytes);
    const context: any = {
      logical_layer_owners: [
        { hypothesis_id: 'object', layer_id: 8 },
        { hypothesis_id: 'shadow', layer_id: 7 },
      ],
      painterly_frame: {
        path: file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        operation_id: 'before',
        canvas_width: 64,
        canvas_height: 64,
      },
    };
    const request: any = {
      document_id: 42,
      painterly: {
        owner_id: 'shadow',
        reference_bounds: bounds,
        clip_contour: square,
        brush_radii: [2, 1],
        max_strokes: 12,
        max_dimension: 64,
        error_threshold: 5,
        form_field: shadow(),
      },
    };
    const lookup = vi.fn(() => null),
      compiled = expandPainterlyPass(request, context, lookup);
    expect(compiled.pass.actions.length).toBeGreaterThan(0);
    expect(
      compiled.pass.actions.every(
        (action: any) => action.tool === 'photoshop_paint_strokes' && action.args.layer_id === 7
      )
    ).toBe(true);
    expect(compiled.provenance.authored_form_field.kind).toBe('cast-shadow');
    expect(() =>
      expandPainterlyPass(
        {
          ...request,
          painterly: {
            ...request.painterly,
            form_field: {
              ...shadow(),
              receiver: { ...shadow().receiver, owner_id: 'foreign-shadow' },
            },
          },
        },
        context,
        lookup
      )
    ).toThrow('Bind the receiver');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
