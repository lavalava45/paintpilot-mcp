import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { ToolRegistry, type ToolDefinition } from '../src/core/tool-registry.js';
import { withOptionalDocumentId } from '../src/core/document-target.js';
import { PhotoshopConnection } from '../src/platform/connection.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';
import { createLayerTools } from '../src/tools/layer-tools.js';
import { createStateTools } from '../src/tools/state-tools.js';
import { createSelectionTools } from '../src/tools/selection-tools.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function jpegMeta(dir: string, name: string, value: number) {
  const width = 64;
  const height = 64;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const bytes = jpeg.encode({ data, width, height }, 100).data;
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    materialized_path: file,
    width,
    height,
    mime_type: 'image/jpeg',
  };
}

function realDefinition(name: string): ToolDefinition {
  const connection = new PhotoshopConnection({
    detector: { detect: async () => ({ version: 'test', path: 'test', isRunning: true }) },
  });
  const definitions = [
    ...createPaintingTools(connection),
    ...createLayerTools(connection),
    ...createStateTools(connection),
    ...createSelectionTools(connection),
  ];
  const found = definitions.find(definition => definition.tool.name === name);
  if (!found) throw new Error(`missing real tool definition for ${name}`);
  return { ...found, tool: withOptionalDocumentId(found.tool) };
}

function fixture(options: { stickyAfter?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'compact-contract-regression-'));
  dirs.push(dir);
  const registry = new ToolRegistry();
  const dark = jpegMeta(dir, 'dark.jpg', 30);
  const light = jpegMeta(dir, 'light.jpg', 210);
  let previewCalls = 0;
  const previewArgs: Array<Record<string, unknown>> = [];
  let regionCalls = 0;
  let strokeCalls = 0;
  let gradientCalls = 0;
  let selectionCalls = 0;
  let maskCalls = 0;
  let createdLayerId = 8;

  const registerReal = (name: string, handler: ToolDefinition['handler']) => {
    const definition = realDefinition(name);
    registry.register(name, { ...definition, handler });
  };

  registerReal('photoshop_get_preview', async (args) => {
    previewArgs.push(structuredClone(args));
    const frame = options.stickyAfter
      ? (previewCalls === 0 ? dark : light)
      : ((previewCalls % 2) === 0 ? dark : light);
    previewCalls += 1;
    const focus = args.focus_region ? {
      ...frame,
      region: args.focus_region,
      scale_x: 1,
      scale_y: 1,
    } : undefined;
    return {
      content: [{ type: 'text', text: JSON.stringify({
        ...frame,
        canvas_width: 400,
        canvas_height: 300,
        scale_x: frame.width / 400,
        scale_y: frame.height / 300,
        ...(focus ? { focus } : {}),
      }) }],
    };
  });
  registerReal('photoshop_get_state', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true, document: { id: 42 } }) }],
  }));
  registerReal('photoshop_get_layers', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true, layers: [{ id: 7, name: 'Paint' }] }) }],
  }));
  registerReal('photoshop_select_layer_by_name', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true, layer: { id: 7, name: 'Paint' } }) }],
  }));
  registerReal('photoshop_paint_regions', async () => {
    regionCalls += 1;
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'regions painted' }) }] };
  });
  registerReal('photoshop_paint_strokes', async () => {
    strokeCalls += 1;
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'strokes painted' }) }] };
  });
  registerReal('photoshop_set_brush', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
  }));
  registerReal('photoshop_select_brush_preset', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
  }));
  registerReal('photoshop_create_layer', async (args) => ({
    content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      details: {
        layerId: ++createdLayerId,
        layerName: typeof args.name === 'string' ? args.name : 'New',
      },
    }) }],
  }));
  registerReal('photoshop_fill_layer', async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
  }));
  registerReal('photoshop_paint_color_gradient', async () => {
    gradientCalls += 1;
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { applied: true, gradient_kind: 'raster-color-linear' } }) }] };
  });
  registerReal('photoshop_select_rectangle', async () => {
    selectionCalls += 1;
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { shape: 'rectangle' } }) }] };
  });
  registerReal('photoshop_create_layer_mask', async () => {
    maskCalls += 1;
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { maskCreated: true } }) }] };
  });

  const visualMicroPlan = createVisualMicroPlanTools(registry, path.join(dir, 'barriers'))[0]!;
  registry.register(visualMicroPlan.tool.name, visualMicroPlan);

  const readiness = {
    ready: true,
    transport: 'uxp' as const,
    bridge_transport: 'long-poll',
    bridge_revision: UXP_BRIDGE_REVISION,
    expected_bridge_revision: UXP_BRIDGE_REVISION,
    revision_match: true,
    photoshop_version: '27.8',
    document_count: 1,
    active_document: { id: 42, name: 'Test.psd' },
    plugin_connected: true,
    reason: null,
    checked_at: '2026-09-23T00:00:00.000Z',
    cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
  };
  const runtime = new EmbeddedGuardRuntime(registry, {
    runtimeDirectory: path.join(dir, 'controller'),
    previewBarrierDirectory: path.join(dir, 'barriers'),
    executionLeaseFile: path.join(dir, 'execution.lock'),
    workspaceRoot: dir,
    uxpReadinessProbe: async () => structuredClone(readiness),
    uxpStateProbe: async () => ({
      ok: true,
      data: {
        document: {
          id: 42,
          instanceWitness: {
            protocol: 'photoshop.uxp.document_instance_witness.v1',
            session_id: 'compact-contract-fixture',
            token: 'compact-contract-fixture:42',
          },
        },
        activeLayer: { id: 7, name: 'Paint' },
      },
    }),
  });
  const guard = createGuardTools(runtime);
  const cycle = guard.find(definition => definition.tool.name === 'photoshop_guard_cycle_auto')!;
  const setArtRun = guard.find(definition => definition.tool.name === 'photoshop_guard_set_art_run')!;
  return {
    runtime,
    cycle,
    setArtRun,
    counts: () => ({
      previewCalls,
      previewArgs: structuredClone(previewArgs),
      regionCalls,
      strokeCalls,
      gradientCalls,
      selectionCalls,
      maskCalls,
    }),
  };
}

function regionAction(id = 'region') {
  return {
    id,
    tool: 'photoshop_paint_regions',
    args: {
      regions: [{
        id: `${id}-shape`,
        color: { red: 120, green: 90, blue: 60 },
        contours: [{ points: [{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }] }],
        layer_id: 7,
      }],
    },
  };
}

function strokeAction(id = 'stroke', layerId = 7, tool = 'BRUSH') {
  return {
    id,
    tool: 'photoshop_paint_strokes',
    args: {
      layer_id: layerId,
      strokes: [{
        points: [{ x: 20, y: 20 }, { x: 100, y: 100 }],
        tool,
        color: { red: 120, green: 90, blue: 60 },
        size: 20,
      }],
    },
  };
}

function semanticLayerSeparation(changeKind = 'new-object', rollbackValue = 'moderate', independent = true) {
  return {
    change_kind: changeKind,
    substantial: true,
    rollback_value: rollbackValue,
    independent_adjustment_expected: independent,
    reasons: ['This visual owner may require independent correction later.'],
  };
}

function semanticLogicalLayer(
  hypothesisId: string,
  decision: 'create-new' | 'temporary-hypothesis' | 'continue-logical-layer' | 'adjust',
  options: {
    layerId?: number;
    layerName?: string;
    rollbackValue?: 'low' | 'moderate' | 'high';
    physicalRole?: string;
    opacityRole?: string;
    depthRelations?: Array<{ relation: string; target_hypothesis_id: string }>;
    constructionTier?: 'primary' | 'secondary' | 'tertiary' | 'surface';
    parentHypothesisId?: string;
    constructionChange?: boolean;
    surfaceFrame?: Record<string, unknown>;
    negativeSpace?: Record<string, unknown>;
    causalEffect?: Record<string, unknown>;
    preserveNegativeSpaceIds?: string[];
  } = {}
) {
  const rollbackValue = options.rollbackValue ?? (decision === 'continue-logical-layer' || decision === 'adjust' ? 'low' : 'moderate');
  return {
    decision,
    hypothesis_id: hypothesisId,
    hypothesis: `Stable semantic owner ${hypothesisId}`,
    rollback_value: rollbackValue,
    expected_independent_rollback: decision === 'create-new' || decision === 'temporary-hypothesis',
    separation_reasons: ['Keep this independently editable semantic owner stable across passes.'],
    physical_role: options.physicalRole ?? 'opaque-mass',
    opacity_role: options.opacityRole ?? 'opaque',
    depth_relations: options.depthRelations ?? [],
    ...(options.constructionTier ? { construction_tier: options.constructionTier } : {}),
    ...(options.parentHypothesisId ? { parent_hypothesis_id: options.parentHypothesisId } : {}),
    ...(options.constructionChange ? { construction_change: true } : {}),
    ...(options.surfaceFrame ? { surface_frame: options.surfaceFrame } : {}),
    ...(options.negativeSpace ? { negative_space: options.negativeSpace } : {}),
    ...(options.causalEffect ? { causal_effect: options.causalEffect } : {}),
    ...(options.preserveNegativeSpaceIds?.length ? { preserve_negative_space_ids: options.preserveNegativeSpaceIds } : {}),
    ...(options.layerId ? { layer_id: options.layerId } : {}),
    ...(options.layerName ? { layer_name: options.layerName } : {}),
  };
}

function materialBrushPreflight(options: { filtered?: boolean; ambiguous?: boolean; probeStatus?: 'pass' | 'cached' | 'not-needed' } = {}) {
  const settings = {
    size: 80, hardness: 65, roundness: 100, opacity: 75, flow: 55, spacing: 12,
    use_pressure_size: true, use_pressure_opacity: false, airbrush: false,
    smoothing_enabled: true, smoothing: 10,
  };
  const roles = [{
    role_id: 'fur-breakup',
    purpose: 'Break up furry surfaces with directional material marks.',
    material_roles: ['fur'],
    visual_intents: ['texture', 'directional-mass'],
    preferred_preset: 'Fur Bristle',
    alternative_presets: ['Dry Fur'],
    effective_settings: settings,
    working_scale: 'medium',
    pressure_policy: 'native-preset',
    probe_status: options.probeStatus ?? 'pass',
  }];
  if (options.ambiguous) {
    roles.push({
      ...roles[0],
      role_id: 'fur-breakup-alt',
      preferred_preset: 'Fur Bristle Alt',
      alternative_presets: [],
    });
  }
  return {
    completed: true,
    inventory_observed: true,
    inventory_total: 123,
    ...(options.filtered ? { inventory_query: 'Soft Round; Hard Round; Flat Blunt' } : {}),
    roles,
  };
}

function compactMaterialResponse() {
  const required = (intent: string) => ({ applicability: 'required', intent });
  const notApplicable = (intent: string) => ({ applicability: 'not-applicable', intent });
  return {
    response_role: 'base-material',
    components: {
      base_response: required('Establish the visible local color/value family before fine texture.'),
      form_light_response: required('Keep the material light/shadow response aligned to the visible form.'),
      specular_reflection: required('Establish the intended qualitative highlight and reflection character.'),
      transmission: notApplicable('This compact fixture is an opaque surface with no transmission.'),
      surface_condition: notApplicable('No separate surface-condition layer is required for this fixture.'),
      variation_scale: required('Use broad and medium material variation before microtexture.'),
      edge_contact: required('Preserve causal contacts and neighbouring-form edge interaction.'),
    },
    microtexture: {
      policy: 'deferred',
      intent: 'Keep microtexture deferred until the causal material response is established.',
    },
  };
}

async function body(result: Awaited<ReturnType<ToolDefinition['handler']>>) {
  return JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
}

describe('public compact Guard contract regressions', () => {
  it('surfaces machine-readable causal alternatives for an exhausted method class without dispatch', async () => {
    const { cycle, runtime, counts } = fixture();
    runtime.store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/strategy-alternative-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    runtime.store.write({
      id: 'failed-line-strategy',
      tool: 'photoshop_execute_visual_microplan',
      args: {
        document_id: 42,
        problem_id: 'edge-strategy-problem',
        method_class: 'line',
        action_class: 'REFINE',
        steps: [{
          id: 'failed-line', tool: 'photoshop_paint_strokes', method_id: 'pencil-line',
          args: { layer_id: 7, strokes: [{ tool: 'PENCIL', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }] },
        }],
      },
      problem_id: 'edge-strategy-problem',
      stage: 'FORM',
      scale: 'medium',
      region: 'subject',
      summary: 'Failed line strategy.',
      purpose: 'Seed exhausted strategy evidence.',
      hash: 'failed-line-strategy',
      sequence: 1,
      created_at: '2026-09-26T00:00:00.000Z',
      completed_at: '2026-09-26T00:00:01.000Z',
      phase: 'completed',
      visual: true,
      failed: false,
      verdict: {
        verdict: 'neutral', disposition: 'correct', target_resolved: 'no',
        significance: { execution_effect: 'material', global: { mean_abs_rgb_delta: 0.02 } },
        at: '2026-09-26T00:00:02.000Z',
      },
    });

    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'repeat-line-strategy',
        problem_id: 'edge-strategy-problem',
        document_id: 42,
        goal: 'Reinforce the structural contour with another line stroke.',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        action_class: 'REFINE',
        visual_intent: 'line',
        impact_class: 'construct',
        actions: [strokeAction('repeat-line', 7, 'PENCIL')],
      },
    }));

    const alternativeViolation = result.preflight_rejection?.violations?.find(
      (item: any) => item.code === 'artistic_strategy_change_required'
    );
    expect(alternativeViolation?.details).toMatchObject({
      problem_id: 'edge-strategy-problem',
      exhausted_method_classes: ['line'],
      dispatch_performed: false,
    });
    expect(alternativeViolation.details.available_causal_alternatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ method_class: 'region', primary_tool: 'photoshop_paint_regions' }),
    ]));
    expect(counts().strokeCalls).toBe(0);
  });

  it('normalizes only a unique semantics-preserving artistic classification without changing the Photoshop tool', async () => {
    const { cycle, runtime, counts } = fixture();
    runtime.store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/unique-classification-normalization-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'normalize-structural-line',
        problem_id: 'structural-line',
        document_id: 42,
        goal: 'Reinforce one structural line stroke without changing its target or risk.',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        action_class: 'REFINE',
        visual_intent: 'tonal-contrast',
        impact_class: 'construct',
        actions: [strokeAction('structural-line-stroke', 7, 'PENCIL')],
      },
    }));

    expect(result.preflight_rejection).toBeUndefined();
    expect(result.compiler_normalizations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'artistic_classification_normalized',
        message: expect.stringContaining('visual_intent=line, impact_class=construct'),
      }),
    ]));
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(counts().strokeCalls).toBe(1);
  });

  it('keeps ambiguous or destructive classification mismatches fail-closed before mutation', async () => {
    for (const row of [
      { key: 'ambiguous', goal: 'Improve the subject.', action_class: 'REFINE' },
      { key: 'destructive', goal: 'Replace the structural line stroke.', action_class: 'REPLACE' },
    ]) {
      const { cycle, runtime, counts } = fixture();
      runtime.store.setArtRunState({
        document_id: 42,
        process_dir: `processes/${row.key}-classification-process/run-01`,
        painting_profile: 'nontrivial_painting',
        commentary_mode: 'technical',
      });
      const result = await body(await cycle.handler({
        next_pass: {
          request_key: `${row.key}-classification`,
          problem_id: `${row.key}-classification`,
          document_id: 42,
          goal: row.goal,
          stage: 'FORM',
          scale: 'medium',
          region: 'subject',
          action_class: row.action_class,
          visual_intent: 'tonal-contrast',
          impact_class: 'construct',
          actions: [strokeAction(`${row.key}-stroke`, 7, 'PENCIL')],
        },
      }));
      expect(result.preflight_rejection?.error_codes).toContain('artistic_method_unavailable');
      expect(result.compiler_normalizations ?? []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'artistic_classification_normalized' }),
      ]));
      expect(counts().strokeCalls).toBe(0);
    }
  });

  it('does not require brush preflight for an early region pass merely because it selects a layer first', async () => {
    const { cycle, setArtRun, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/brush-independent-region-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'region-with-layer-select',
        problem_id: 'initial-mass-layout',
        document_id: 42,
        goal: 'Block the first broad mass on the intended paint layer',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'whole-canvas',
        actions: [
          { id: 'select-paint', tool: 'photoshop_select_layer_by_name', args: { name: 'Paint' } },
          regionAction(),
        ],
      },
    }));


    expect(result.preflight_rejection).toBeUndefined();
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(counts().regionCalls).toBe(1);
  });

  it('still blocks brush-dependent painting until brush preflight exists', async () => {
    const { cycle, setArtRun, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/brush-required-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'brush-without-preflight',
        problem_id: 'model-form',
        document_id: 42,
        goal: 'Model the form with a brush stroke',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        actions: [strokeAction()],
      },
    }));


    expect(result.preflight_rejection?.errors.join('\n')).toMatch(/brush_preflight_required/);
    expect(counts().strokeCalls).toBe(0);
  });

  it('does not require installed-brush preflight for a non-BRUSH stroke mechanism', async () => {
    const { cycle, setArtRun, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/pencil-without-brush-preflight-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'pencil-without-brush-preflight',
        problem_id: 'pencil-edge',
        document_id: 42,
        goal: 'Draw a hard pencil edge without depending on an installed brush role',
        stage: 'EDGE',
        scale: 'medium',
        region: 'subject-edge',
        actions: [strokeAction('pencil-stroke', 7, 'PENCIL')],
      },
    }));

    expect(result.preflight_rejection).toBeUndefined();
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(counts().strokeCalls).toBe(1);
  });

  it('compiles an ordinary local pass with matching BEFORE/AFTER focus previews without subtle_local', async () => {
    const { cycle, setArtRun, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/local-normal-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });

    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'local-normal-pass',
        problem_id: 'silhouette-corner',
        document_id: 42,
        goal: 'Correct one local silhouette corner',
        stage: 'SHAPE',
        scale: 'local',
        significance_mode: 'normal',
        region: 'silhouette-corner',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 },
        actions: [regionAction()],
      },
    }));

    expect(result.preflight_rejection).toBeUndefined();
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(result.visual_review?.before).toBeTruthy();
    expect(result.visual_review?.after).toBeTruthy();
    expect(result.visual_review?.review_profile).toMatchObject({
      level: 'object',
      require_region: true,
      require_before_after: true,
      focus_max_dimension_px: 1200,
    });
    expect(counts().previewCalls).toBe(2);
  });

  it('keeps global review at composition level even when a semantic region is supplied', async () => {
    const { cycle, setArtRun, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/global-composition-review-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });

    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'global-composition-review',
        problem_id: 'global-balance',
        document_id: 42,
        goal: 'Adjust the global composition without paying a local crop tax',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'whole-canvas',
        region_bounds: { left: 20, top: 20, right: 220, bottom: 220 },
        actions: [regionAction()],
      },
    }));

    expect(result.visual_review?.review_profile).toMatchObject({
      level: 'composition',
      require_region: false,
      require_before_after: false,
      focus_max_dimension_px: null,
    });
    expect(counts().previewArgs.every(args => args.focus_region === undefined)).toBe(true);
    expect(counts().previewArgs.some(args => args.max_dimension_px === 1600)).toBe(true);
  });

  it('prefetches OBJECT crop for a medium pass with exact region without forcing a fresh BEFORE pair', async () => {
    const { cycle, setArtRun, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/object-review-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });

    const region = { left: 40, top: 50, right: 240, bottom: 260 };
    const result = await body(await cycle.handler({
      next_pass: {
        request_key: 'object-review-medium',
        problem_id: 'object-proportion',
        document_id: 42,
        goal: 'Refine one bounded object proportion',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        region_bounds: region,
        actions: [strokeAction('object-review-pencil', 7, 'PENCIL')],
      },
    }));

    expect(result.visual_review?.review_profile).toMatchObject({
      level: 'object',
      require_region: true,
      require_before_after: false,
      focus_max_dimension_px: 1200,
    });
    expect(counts().previewArgs.some(args =>
      JSON.stringify(args.focus_region) === JSON.stringify(region)
      && args.focus_max_dimension_px === 1200
    )).toBe(true);
  });

  it('uses MICRO review at detail scale with the exact supplied region and never invents one', async () => {
    const withRegion = fixture();
    await withRegion.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/micro-review-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const region = { left: 80, top: 70, right: 150, bottom: 140 };
    const result = await body(await withRegion.cycle.handler({
      next_pass: {
        request_key: 'micro-review-detail',
        problem_id: 'edge-detail',
        document_id: 42,
        goal: 'Refine one exact detail region',
        stage: 'FORM',
        scale: 'detail',
        region: 'edge-detail',
        region_bounds: region,
        actions: [strokeAction('micro-pencil', 7, 'PENCIL')],
      },
    }));
    expect(result.visual_review?.review_profile).toMatchObject({
      level: 'micro',
      require_region: true,
      require_before_after: true,
      focus_max_dimension_px: 1600,
    });
    expect(result.visual_review?.after).toMatchObject({
      canvas: { width: 400, height: 300, provenance: 'capture_metadata' },
      crop: {
        requested_region: region,
        effective_region: region,
        region,
      },
    });
    expect(withRegion.counts().previewArgs.some(args =>
      JSON.stringify(args.focus_region) === JSON.stringify(region)
      && args.focus_max_dimension_px === 1600
    )).toBe(true);
    expect((result.visual_review?.review_evidence ?? []).some((item: any) => item.finding_kind === 'micro_context')).toBe(false);

    const withoutRegion = fixture();
    await withoutRegion.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/micro-review-process/run-02',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const rejected = await body(await withoutRegion.cycle.handler({
      next_pass: {
        request_key: 'micro-review-no-region',
        problem_id: 'edge-detail-no-region',
        document_id: 42,
        goal: 'Do not guess a crop center when no exact detail region exists',
        stage: 'FORM',
        scale: 'detail',
        region: 'unknown-detail',
        actions: [strokeAction('micro-pencil-no-region', 7, 'PENCIL')],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('compact_local_region_bounds_required');
    expect(rejected.preflight_rejection?.errors.join('\n')).toMatch(/require next_pass\.region_bounds/);
    expect(withoutRegion.counts().strokeCalls).toBe(0);
  });

  it('compiles a global continuous color field with explicit construction role and mandatory AFTER preview', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/continuous-field-compact-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });

    const missingRole = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'continuous-field-missing-role',
        problem_id: 'continuous-field',
        document_id: 42,
        goal: 'Paint one continuous global color field.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'whole-canvas',
        material_role: 'broad background value field',
        visual_intent: 'continuous-field',
        impact_class: 'construct',
        preferred_method_id: 'continuous-color-field',
        actions: [{
          id: 'continuous-field-gradient',
          tool: 'photoshop_paint_color_gradient',
          method_id: 'continuous-color-field',
          args: {
            layer_id: 7,
            from: { x: 0, y: 0 },
            to: { x: 400, y: 300 },
            stops: [
              { position: 0, red: 20, green: 40, blue: 80 },
              { position: 0.5, red: 120, green: 100, blue: 100 },
              { position: 1, red: 220, green: 180, blue: 140 },
            ],
          },
        }],
      },
    }));
    expect(missingRole.preflight_rejection?.errors.join('\n')).toMatch(/construction_role/i);
    expect(f.counts().gradientCalls).toBe(0);

    const valid = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'continuous-field-valid',
        problem_id: 'continuous-field',
        document_id: 42,
        goal: 'Paint one continuous global color field.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'whole-canvas',
        construction_role: 'continuous-field',
        material_role: 'broad background value field',
        visual_intent: 'continuous-field',
        impact_class: 'construct',
        preferred_method_id: 'continuous-color-field',
        actions: [{
          id: 'continuous-field-gradient',
          tool: 'photoshop_paint_color_gradient',
          method_id: 'continuous-color-field',
          args: {
            layer_id: 7,
            from: { x: 0, y: 0 },
            to: { x: 400, y: 300 },
            stops: [
              { position: 0, red: 20, green: 40, blue: 80 },
              { position: 0.5, red: 120, green: 100, blue: 100 },
              { position: 1, red: 220, green: 180, blue: 140 },
            ],
          },
        }],
      },
    }));
    expect(valid.preflight_rejection).toBeUndefined();
    let completed = valid;
    if (valid.job_id) {
      for (let i = 0; i < 100; i += 1) {
        const polled = f.runtime.pollJob(String(valid.job_id)) as any;
        if (['completed', 'failed', 'uncertain'].includes(String(polled.state))) {
          completed = polled.result;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    expect(completed.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.counts().gradientCalls).toBe(1);
    expect(f.counts().previewCalls).toBeGreaterThanOrEqual(1);
    expect(f.runtime.store.read('continuous-field-valid')?.args).toMatchObject({
      method_class: 'gradient',
      paint_strategy: {
        construction_role: 'continuous-field',
        material_role: 'broad background value field',
        visual_intent: 'continuous-field',
        pressure_policy: 'none',
      },
      steps: expect.arrayContaining([
        expect.objectContaining({ tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field' }),
        expect.objectContaining({ tool: 'photoshop_get_preview' }),
      ]),
    });
  });

  it('requires material-fit brush evidence for substantial nontrivial form/material work', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/material-fitness-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
      brush_preflight: materialBrushPreflight(),
    });

    const missingMaterial = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'fur-material-missing-role',
        problem_id: 'fur-material',
        document_id: 42,
        goal: 'Develop the rabbit fur with directional material texture.',
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'rabbit',
        visual_intent: 'directional-mass',
        impact_class: 'construct',
        actions: [strokeAction('fur-stroke')],
      },
    }));
    expect(missingMaterial.preflight_rejection?.error_codes).toContain('brush_material_role_required');

    const valid = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'fur-material-fit',
        problem_id: 'fur-material-fit',
        document_id: 42,
        goal: 'Develop the rabbit fur with directional material texture.',
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'rabbit',
        material_role: 'fur',
        visual_intent: 'directional-mass',
        impact_class: 'construct',
        actions: [strokeAction('fur-stroke-fit')],
      },
    }));
    expect(valid.preflight_rejection).toBeUndefined();
    expect(valid.execution).toMatchObject({ phase: 'completed', failed: false });
    const record = f.runtime.store.read('fur-material-fit')!;
    expect(record.args.paint_strategy).toMatchObject({
      material_role: 'fur',
      visual_intent: 'directional-mass',
      brush_role: 'fur-breakup',
      preset_name: 'Fur Bristle',
    });
  });

  it('requires and forwards qualitative material response for compact MATERIAL passes', async () => {
    const missing = fixture();
    await missing.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/material-response-missing-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const rejected = await body(await missing.cycle.handler({
      next_pass: {
        request_key: 'material-response-missing',
        problem_id: 'material-response-missing',
        document_id: 42,
        goal: 'Develop the surface response before adding texture.',
        stage: 'MATERIAL',
        scale: 'medium',
        region: 'surface',
        actions: [strokeAction('material-response-missing-stroke')],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('material_response_plan_required');
    expect(missing.counts().strokeCalls).toBe(0);

    const valid = fixture();
    await valid.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/material-response-valid-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const accepted = await body(await valid.cycle.handler({
      next_pass: {
        request_key: 'material-response-valid',
        problem_id: 'material-response-valid',
        document_id: 42,
        goal: 'Develop the surface response before adding texture.',
        stage: 'MATERIAL',
        scale: 'medium',
        region: 'surface',
        material_response: compactMaterialResponse(),
        actions: [strokeAction('material-response-valid-stroke')],
      },
    }));
    expect(accepted.preflight_rejection).toBeUndefined();
    expect(accepted.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(valid.runtime.store.read('material-response-valid')?.args?.material_response).toMatchObject({
      response_role: 'base-material',
      microtexture: { policy: 'deferred' },
    });
  });

  it('compiles explicit selection preparation plus layer-mask creation as one selection-mask VisualMicroPlan', async () => {
    const missingSelection = fixture();
    await missingSelection.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/selection-mask-missing-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const rejected = await body(await missingSelection.cycle.handler({
      next_pass: {
        request_key: 'selection-mask-missing',
        problem_id: 'selection-mask-missing',
        document_id: 42,
        goal: 'Isolate the intended region with a hard layer mask.',
        stage: 'SHAPE',
        scale: 'global',
        region: 'subject',
        visual_intent: 'isolate-region',
        impact_class: 'isolate',
        preferred_method_id: 'selection-mask',
        actions: [{
          id: 'mask-without-selection',
          tool: 'photoshop_create_layer_mask',
          args: {},
          method_id: 'selection-mask',
        }],
      },
    }));
    expect(rejected.preflight_rejection?.errors.join('\n')).toMatch(/requires one explicit preparation step/i);
    expect(missingSelection.counts().maskCalls).toBe(0);

    const valid = fixture();
    await valid.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/selection-mask-valid-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const accepted = await body(await valid.cycle.handler({
      next_pass: {
        request_key: 'selection-mask-valid',
        problem_id: 'selection-mask-valid',
        document_id: 42,
        goal: 'Isolate the intended region with a hard layer mask.',
        stage: 'SHAPE',
        scale: 'global',
        region: 'subject',
        visual_intent: 'isolate-region',
        impact_class: 'isolate',
        preferred_method_id: 'selection-mask',
        actions: [
          {
            id: 'explicit-selection',
            tool: 'photoshop_select_rectangle',
            args: { left: 40, top: 30, right: 240, bottom: 260 },
          },
          {
            id: 'create-selection-mask',
            tool: 'photoshop_create_layer_mask',
            args: {},
            method_id: 'selection-mask',
          },
        ],
      },
    }));
    expect(accepted.preflight_rejection).toBeUndefined();
    let completed = accepted;
    if (accepted.job_id) {
      for (let i = 0; i < 100; i += 1) {
        const polled = valid.runtime.pollJob(String(accepted.job_id)) as any;
        if (['completed', 'failed', 'uncertain'].includes(String(polled.state))) {
          completed = polled.result;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    expect(completed.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(valid.counts()).toMatchObject({ selectionCalls: 1, maskCalls: 1 });
    expect(valid.runtime.store.read('selection-mask-valid')?.args).toMatchObject({
      method_class: 'mask',
      steps: expect.arrayContaining([
        expect.objectContaining({ tool: 'photoshop_select_rectangle' }),
        expect.objectContaining({ tool: 'photoshop_create_layer_mask', method_id: 'selection-mask' }),
      ]),
    });
  });

  it('rejects narrow familiar-preset inventory and ambiguous/unprobed material roles at finish stages', async () => {
    for (const row of [
      { id: 'filtered', preflight: materialBrushPreflight({ filtered: true }), expected: 'brush_inventory_scope_insufficient' },
      { id: 'ambiguous', preflight: materialBrushPreflight({ ambiguous: true }), expected: 'brush_role_ambiguous' },
      { id: 'unprobed', preflight: materialBrushPreflight({ probeStatus: 'not-needed' }), expected: 'brush_role_probe_required', stage: 'MATERIAL' },
    ]) {
      const f = fixture();
      await f.setArtRun.handler({
        document_id: 42,
        process_dir: `processes/material-${row.id}-process/run-01`,
        painting_profile: 'nontrivial_painting',
        commentary_mode: 'technical',
        brush_preflight: row.preflight,
      });
      const result = await body(await f.cycle.handler({
        next_pass: {
          request_key: `material-${row.id}`,
          problem_id: `material-${row.id}`,
          document_id: 42,
          goal: 'Develop the fur material with appropriate visible brush structure.',
          stage: row.stage ?? 'FORM_AND_LIGHT',
          scale: 'medium',
          region: 'rabbit',
          material_role: 'fur',
          visual_intent: 'directional-mass',
          impact_class: 'construct',
          actions: [strokeAction(`material-${row.id}-stroke`)],
        },
      }));
      expect(result.preflight_rejection?.error_codes).toContain(row.expected);
      expect(f.counts().strokeCalls).toBe(0);
    }
  });

  it('preserves exact object context for a direct MICRO pass without adding a second artistic mutation', async () => {
    const f = fixture({ stickyAfter: true });
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/micro-context-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const microRegion = { left: 120, top: 110, right: 160, bottom: 150 };
    const objectRegion = { left: 70, top: 60, right: 220, bottom: 230 };
    const result = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'micro-context-detail',
        problem_id: 'micro-context-edge',
        document_id: 42,
        goal: 'Refine the tight edge while preserving the exact containing object context for review.',
        stage: 'FORM',
        scale: 'detail',
        region: 'edge-detail',
        region_bounds: microRegion,
        object_context_region_bounds: objectRegion,
        actions: [strokeAction('micro-context-pencil', 7, 'PENCIL')],
      },
    }));
    expect(result.visual_review?.review_profile).toMatchObject({ level: 'micro' });
    expect(result.visual_review?.review_evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        finding_kind: 'micro_context',
        review_level: 'object',
        requested_region: objectRegion,
        bound_whole_sha256: result.preview.sha256,
        document_id: 42,
      }),
    ]));
    expect(f.counts().strokeCalls).toBe(1);
    expect(f.counts().previewArgs.some(args =>
      JSON.stringify(args.focus_region) === JSON.stringify(microRegion)
      && args.focus_max_dimension_px === 1600
    )).toBe(true);
    expect(f.counts().previewArgs.filter(args => args.focus_region)).toHaveLength(3);
  });

  it('allows explicit REPLACE of the exact protected target but keeps ADD blocked', async () => {
    const { cycle, setArtRun, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/protected-replace-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });

    const replaceResult = await body(await cycle.handler({
      next_pass: {
        request_key: 'protected-replace',
        problem_id: 'protected-silhouette',
        document_id: 42,
        goal: 'Intentionally repaint the protected silhouette layer',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        action_class: 'REPLACE',
        protected_layer_ids: [7],
        replace_protected_layer_ids: [7],
        actions: [strokeAction()],
      },
    }));
    expect(replaceResult.preflight_rejection).toBeUndefined();
    expect(replaceResult.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(counts().strokeCalls).toBe(1);

    const addFixture = fixture();
    await addFixture.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/protected-add-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const addResult = await body(await addFixture.cycle.handler({
      next_pass: {
        request_key: 'protected-add',
        problem_id: 'protected-silhouette',
        document_id: 42,
        goal: 'Ordinary add must not repaint protected content',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        action_class: 'ADD',
        protected_layer_ids: [7],
        replace_protected_layer_ids: [7],
        actions: [strokeAction()],
      },
    }));
    expect(addResult.preflight_rejection?.errors.join('\n')).toMatch(/action_class=REPLACE or ERASE/);
    expect(addFixture.counts().strokeCalls).toBe(0);
  });

  it('keeps request idempotency separate from stable problem identity across attempts', async () => {
    const { cycle, setArtRun, runtime, counts } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/problem-identity-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const firstPass = {
      request_key: 'silhouette-attempt-001',
      problem_id: 'main-silhouette',
      document_id: 42,
      goal: 'Repair the main silhouette',
      stage: 'SHAPE',
      scale: 'medium',
      region: 'subject',
      actions: [regionAction('attempt-one')],
    };
    const first = await body(await cycle.handler({ next_pass: firstPass }));
    expect(first.execution).toMatchObject({ phase: 'completed', failed: false });
    const callsAfterFirst = counts().regionCalls;

    await body(await cycle.handler({ next_pass: firstPass }));
    expect(counts().regionCalls).toBe(callsAfterFirst);
    expect(runtime.store.records().filter(record => record.id === 'silhouette-attempt-001')).toHaveLength(1);

    const second = await body(await cycle.handler({
      previous_operation_id: 'silhouette-attempt-001',
      previous_observation: { observed: 'The silhouette changed but remains unresolved.', target: 'unresolved' },
      next_pass: {
        ...firstPass,
        request_key: 'silhouette-attempt-002',
        // The first materially-changing region strategy was explicitly judged
        // unresolved. Recovery now requires the next attempt to be causally
        // distinct rather than a parameter/id variant of the same geometry.
        actions: [strokeAction('attempt-two', 7, 'PENCIL')],
      },
    }));
    expect(second.execution).toMatchObject({ phase: 'completed', failed: false });

    const records = runtime.store.records().filter(record => record.id.startsWith('silhouette-attempt-'));
    expect(records.map(record => record.id)).toEqual(['silhouette-attempt-001', 'silhouette-attempt-002']);
    expect(records.map(record => record.problem_id)).toEqual(['main-silhouette', 'main-silhouette']);
    expect(records[0]?.verdict).toMatchObject({ target_resolved: 'no' });
  });

  it('allows a bounded explicitly targeted late-stage region replacement but still rejects late ADD scaffolding', async () => {
    const { cycle, setArtRun } = fixture();
    await setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/late-region-replace-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const corrective = regionAction('late-replace');
    corrective.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const replaceResult = await body(await cycle.handler({
      next_pass: {
        request_key: 'late-region-replace',
        problem_id: 'silhouette-late-fix',
        document_id: 42,
        goal: 'Replace a bounded silhouette patch without reopening block-in',
        stage: 'FORM',
        scale: 'medium',
        region: 'silhouette',
        action_class: 'REPLACE',
        actions: [corrective],
      },
    }));
    expect(replaceResult.preflight_rejection).toBeUndefined();

    const blockedFixture = fixture();
    await blockedFixture.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/late-region-add-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const lateAdd = regionAction('late-add');
    lateAdd.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const addResult = await body(await blockedFixture.cycle.handler({
      next_pass: {
        request_key: 'late-region-add',
        problem_id: 'late-block-in',
        document_id: 42,
        goal: 'Do more broad block-in at FORM',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        action_class: 'ADD',
        actions: [lateAdd],
      },
    }));
    expect(addResult.preflight_rejection?.errors.join('\n')).toMatch(/paint_regions.*block-in|late-stage/i);
  });

  it('normalizes explicit negative regression sentinels instead of treating them as regression evidence', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/negative-regression-sentinel-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });

    const started = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'negative-regression-sentinel-pass',
        problem_id: 'negative-regression-sentinel',
        document_id: 42,
        goal: 'Establish one clean bounded shape for sentinel normalization coverage.',
        stage: 'SHAPE',
        scale: 'global',
        region: 'whole-canvas',
        actions: [regionAction('negative-regression-sentinel-region')],
      },
    }));
    expect(started.execution).toMatchObject({ phase: 'completed', failed: false });

    const finalized = await body(await f.cycle.handler({
      previous_operation_id: 'negative-regression-sentinel-pass',
      previous_observation: {
        observed: 'The intended bounded shape is visible and no unrelated area became worse.',
        target: 'resolved',
        regression: 'none observed',
      },
    }));

    expect(finalized.closed_previous).toMatchObject({ closed: true, operation_id: 'negative-regression-sentinel-pass' });
    expect(finalized.compiler_normalizations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'negative_regression_sentinel_normalized' }),
    ]));
    expect(f.runtime.store.read('negative-regression-sentinel-pass')?.verdict).toMatchObject({
      verdict: 'improvement',
      disposition: 'accept',
      regressions: [],
    });

    const realRegression = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'real-regression-evidence-pass',
        problem_id: 'real-regression-evidence',
        document_id: 42,
        goal: 'Create another bounded shape for real regression evidence coverage.',
        stage: 'SHAPE',
        scale: 'global',
        region: 'whole-canvas',
        actions: [regionAction('real-regression-evidence-region')],
      },
    }));
    expect(realRegression.execution).toMatchObject({ phase: 'completed', failed: false });

    const realFinalized = await body(await f.cycle.handler({
      previous_operation_id: 'real-regression-evidence-pass',
      previous_observation: {
        observed: 'The new shape is present, but an unrelated silhouette became visibly worse.',
        target: 'resolved',
        regression: 'No regression except the unrelated silhouette became worse.',
      },
    }));
    expect(realFinalized.compiler_normalizations ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'negative_regression_sentinel_normalized' }),
    ]));
    expect(f.runtime.store.read('real-regression-evidence-pass')?.verdict).toMatchObject({
      verdict: 'regression',
      disposition: 'correct',
      regressions: ['No regression except the unrelated silhouette became worse.'],
    });
  });

  it('blocks fake backward stage regression and allows only an explicit durable structural reset', async () => {
    const blocked = fixture();
    blocked.runtime.store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/stage-regression-blocked-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    blocked.runtime.store.updatePaintingState(42, current => ({
      ...current,
      current_stage: 'DETAIL',
    }));

    const rejected = await body(await blocked.cycle.handler({
      next_pass: {
        request_key: 'fake-back-to-blockin',
        problem_id: 'stage-integrity',
        document_id: 42,
        goal: 'Return to broad region construction without a structural reset',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        actions: [regionAction('fake-back-region')],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('painting_stage_regression_requires_reset');
    expect(rejected.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(blocked.counts().regionCalls).toBe(0);

    const allowed = fixture();
    allowed.runtime.store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/stage-regression-reset-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    allowed.runtime.store.updatePaintingState(42, current => ({
      ...current,
      current_stage: 'DETAIL',
      // A real structural reset invalidates any prior progressive-refinement
      // certificate even if no active Art Director directive is currently bound.
      art_director: {
        physical_stack_check: {
          status: 'pass',
          observed: true,
          preview_sha256: 'a'.repeat(64),
          evidence_operation_id: 'old-shape-frame',
          owner_signature: 'old-owner-signature',
        },
        refinement_check: {
          status: 'pass',
          observed: true,
          representation_change: 'meaningful',
        },
      },
    }));

    const resetResult = await body(await allowed.cycle.handler({
      next_pass: {
        request_key: 'explicit-back-to-blockin',
        problem_id: 'stage-integrity',
        document_id: 42,
        goal: 'Rebuild the invalidated composition from broad structural masses',
        stage: 'GLOBAL_BLOCK_IN',
        stage_reset: {
          reason: 'composition_invalidated',
          detail: 'The accepted later-stage composition no longer supports the required subject placement.',
        },
        scale: 'global',
        actions: [regionAction('reset-region')],
      },
    }));
    expect(resetResult.preflight_rejection).toBeUndefined();
    expect(resetResult.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(allowed.counts().regionCalls).toBe(1);

    const state = allowed.runtime.store.paintingState().documents['42'];
    expect(state.current_stage).toBe('GLOBAL_BLOCK_IN');
    expect(state.last_stage_reset).toMatchObject({
      operation_id: 'explicit-back-to-blockin',
      from_stage: 'DETAIL',
      to_stage: 'GLOBAL_BLOCK_IN',
      reason: 'composition_invalidated',
    });
    expect(state.art_director.refinement_check).toMatchObject({
      status: 'pending',
      observed: false,
      representation_change: 'not-assessed',
    });
    expect(state.art_director.physical_stack_check).toMatchObject({
      status: 'pending',
      observed: false,
      owner_signature: null,
    });
  });

  it('blocks stage downgrade on direct visual operations and keeps priority current_stage non-authoritative', async () => {
    const f = fixture();
    f.runtime.store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/direct-stage-integrity-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    f.runtime.store.updatePaintingState(42, current => ({ ...current, current_stage: 'DETAIL' }));

    const result = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'direct-stage-downgrade',
        problem_id: 'direct-stage-integrity',
        document_id: 42,
        goal: 'Attempt a direct visual operation while falsely claiming an earlier stage',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'medium',
        actions: [{ id: 'direct-adjustment', tool: 'photoshop_adjust_curves', args: {} }],
      },
    }));
    expect(result.preflight_rejection?.error_codes).toContain('painting_stage_regression_requires_reset');
    expect(result.preflight_rejection?.next_operation_dispatched).toBe(false);

    expect(() => f.runtime.store.setPriorityState({
      document_id: 42,
      current_stage: 'GLOBAL_BLOCK_IN',
      problems: [],
    })).toThrow(/priority_state_stage_non_authoritative/);
    expect(f.runtime.store.paintingState().documents['42'].current_stage).toBe('DETAIL');
  });

  it('requires stable semantic layer ownership for committed nontrivial painting and reuses the same owner across request ids', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/semantic-layer-owner-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const missingMetadata = regionAction('missing-owner-region');
    missingMetadata.args.regions[0].layer_id = '$steps.missing-owner-layer.details.layerId';
    const missing = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'missing-owner-pass',
        problem_id: 'semantic-owner',
        document_id: 42,
        goal: 'Create a committed character layer without semantic ownership metadata.',
        stage: 'FORM_AND_LIGHT',
        scale: 'global',
        actions: [
          { id: 'missing-owner-layer', tool: 'photoshop_create_layer', args: { name: 'Character' } },
          missingMetadata,
        ],
      },
    }));
    expect(missing.preflight_rejection?.error_codes).toContain('semantic_layer_owner_missing');

    const createCatRegion = regionAction('cat-owner-region');
    createCatRegion.args.regions[0].layer_id = '$steps.cat-owner-layer.details.layerId';
    const created = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'cat-owner-create-attempt-01',
        problem_id: 'cat-owner',
        document_id: 42,
        goal: 'Create the independently editable cat owner during structural development.',
        stage: 'SHAPE',
        scale: 'global',
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('cat', 'create-new', { layerName: 'Cat' }),
        actions: [
          { id: 'cat-owner-layer', tool: 'photoshop_create_layer', args: { name: 'Cat' } },
          createCatRegion,
        ],
      },
    }));
    expect(created.preflight_rejection).toBeUndefined();
    expect(created.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'cat', layer_id: 9, temporary: false }),
    ]);

    const catRefine = regionAction('cat-owner-refine');
    catRefine.args.regions[0].layer_id = 9;
    catRefine.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const continued = await body(await f.cycle.handler({
      previous_operation_id: 'cat-owner-create-attempt-01',
      previous_observation: {
        observed: 'The cat owner layer is present and structurally readable.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'cat-owner-form-attempt-02',
        problem_id: 'cat-owner-form',
        document_id: 42,
        goal: 'Refine the same cat owner without creating a pass-named layer.',
        stage: 'FORM',
        scale: 'medium',
        region: 'cat',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 },
        action_class: 'REPLACE',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('cat', 'continue-logical-layer', { layerId: 9, layerName: 'Cat', rollbackValue: 'low' }),
        actions: [catRefine],
      },
    }));
    expect(continued.preflight_rejection).toBeUndefined();
    expect(continued.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'cat', layer_id: 9, temporary: false }),
    ]);

    const wrongOwner = regionAction('rabbit-on-cat-layer');
    wrongOwner.args.regions[0].layer_id = 9;
    wrongOwner.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const polluted = await body(await f.cycle.handler({
      previous_operation_id: 'cat-owner-form-attempt-02',
      previous_observation: {
        observed: 'The cat form refinement is retained on the same semantic owner.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'rabbit-wrong-owner-attempt',
        problem_id: 'rabbit-owner',
        document_id: 42,
        goal: 'Incorrectly try to paint the rabbit into the cat-owned layer.',
        stage: 'FORM',
        scale: 'medium',
        region: 'rabbit',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 },
        action_class: 'REPLACE',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('rabbit', 'continue-logical-layer', { layerId: 9, layerName: 'Cat', rollbackValue: 'low' }),
        actions: [wrongOwner],
      },
    }));
    expect(polluted.preflight_rejection?.error_codes).toEqual(expect.arrayContaining([
      'semantic_layer_owner_missing',
      'semantic_layer_pollution',
    ]));
  });

  it('enforces a subject-agnostic construction graph and invalidates only dependent downstream structure', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/construction-graph-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const createOwner = async (
      requestKey: string,
      hypothesisId: string,
      tier: 'primary' | 'secondary' | 'tertiary' | 'surface',
      parentHypothesisId: string | undefined,
      previousOperationId?: string,
      negativeSpace?: Record<string, unknown>,
    ) => {
      const layerStep = `${requestKey}-layer`;
      const region = regionAction(`${requestKey}-region`);
      region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
      return body(await f.cycle.handler({
        ...(previousOperationId ? {
          previous_operation_id: previousOperationId,
          previous_observation: { observed: 'The preceding construction owner is established.', target: 'resolved' },
        } : {}),
        next_pass: {
          request_key: requestKey,
          problem_id: requestKey,
          document_id: 42,
          goal: `Establish ${hypothesisId} as ${tier} construction.`,
          stage: 'SHAPE',
          scale: 'global',
          change_domains: ['local-shape'],
          layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
          logical_layer: semanticLogicalLayer(hypothesisId, 'create-new', {
            layerName: hypothesisId,
            constructionTier: tier,
            parentHypothesisId,
            negativeSpace,
          }),
          actions: [
            { id: layerStep, tool: 'photoshop_create_layer', args: { name: hypothesisId } },
            region,
          ],
        },
      }));
    };

    // Architecture domain: building mass -> facade plane -> opening.
    const primary = await createOwner('cg-building', 'building-mass', 'primary', undefined);
    expect(primary.preflight_rejection).toBeUndefined();
    const secondary = await createOwner('cg-facade', 'facade-plane', 'secondary', 'building-mass', 'cg-building');
    expect(secondary.preflight_rejection).toBeUndefined();
    const tertiary = await createOwner('cg-opening', 'window-opening', 'tertiary', 'facade-plane', 'cg-facade', {
      relation: 'aperture-of', parent_hypothesis_id: 'facade-plane',
      topology: 'Rectangular through-opening remains bounded by the facade reveal on all four sides.',
      evidence: ['Visible reveal boundary and through-opening silhouette establish a structural void.'],
    });
    expect(tertiary.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual(expect.arrayContaining([
      expect.objectContaining({ hypothesis_id: 'building-mass', construction_tier: 'primary' }),
      expect.objectContaining({ hypothesis_id: 'facade-plane', construction_tier: 'secondary', parent_hypothesis_id: 'building-mass' }),
      expect.objectContaining({ hypothesis_id: 'window-opening', construction_tier: 'tertiary', parent_hypothesis_id: 'facade-plane' }),
    ]));
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual(expect.arrayContaining([
      expect.objectContaining({ hypothesis_id: 'window-opening', negative_space: expect.objectContaining({ relation: 'aperture-of', parent_hypothesis_id: 'facade-plane' }) }),
    ]));

    const facadeOwner = f.runtime.store.compactPassContext(42).logical_layer_owners.find((owner: any) => owner.hypothesis_id === 'facade-plane');
    const facadeTexture = regionAction('cg-facade-texture-region');
    facadeTexture.args.regions[0].layer_id = facadeOwner.layer_id;
    const fillOpening = await body(await f.cycle.handler({
      previous_operation_id: 'cg-opening', previous_observation: { observed: 'Opening topology is established.', target: 'resolved' },
      next_pass: {
        request_key: 'cg-facade-texture-unreviewed', problem_id: 'facade-material', document_id: 42,
        goal: 'Repaint the facade without reviewing its opening.', stage: 'SHAPE', scale: 'medium',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('facade-plane', 'continue-logical-layer', { layerId: facadeOwner.layer_id, layerName: 'facade-plane', rollbackValue: 'low', constructionTier: 'secondary', parentHypothesisId: 'building-mass' }),
        actions: [facadeTexture],
      },
    }));
    expect(fillOpening.preflight_rejection?.error_codes).toContain('negative_space_preservation_required');

    const preservedOpening = await body(await f.cycle.handler({
      previous_operation_id: 'cg-opening', previous_observation: { observed: 'Opening topology is established.', target: 'resolved' },
      next_pass: {
        request_key: 'cg-facade-texture-preserved', problem_id: 'facade-material', document_id: 42,
        goal: 'Repaint the facade while preserving the reviewed opening topology.', stage: 'SHAPE', scale: 'medium',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('facade-plane', 'continue-logical-layer', { layerId: facadeOwner.layer_id, layerName: 'facade-plane', rollbackValue: 'low', constructionTier: 'secondary', parentHypothesisId: 'building-mass', preserveNegativeSpaceIds: ['window-opening'] }),
        actions: [facadeTexture],
      },
    }));
    expect(preservedOpening.preflight_rejection).toBeUndefined();

    // Surface work cannot jump to an absent prerequisite (same contract also applies to tree/water owners).
    const missing = await createOwner('cg-missing-surface', 'ripple-specular', 'surface', 'wave-group', 'cg-facade-texture-preserved');
    expect(missing.preflight_rejection?.error_codes).toContain('construction_graph_parent_missing');

    const unrelated = await createOwner('cg-unrelated-primary', 'sky-field', 'primary', undefined, 'cg-facade-texture-preserved');
    expect(unrelated.preflight_rejection).toBeUndefined();

    // A structural correction to the primary invalidates its dependent branch, but not unrelated owners.
    const primaryOwner = f.runtime.store.compactPassContext(42).logical_layer_owners.find((owner: any) => owner.hypothesis_id === 'building-mass');
    const refine = regionAction('cg-building-refine-region');
    refine.args.regions[0].layer_id = primaryOwner.layer_id;
    const corrected = await body(await f.cycle.handler({
      previous_operation_id: 'cg-unrelated-primary',
      previous_observation: { observed: 'The unrelated primary owner is established.', target: 'resolved' },
      next_pass: {
        request_key: 'cg-building-structural-correction', problem_id: 'cg-building-correction', document_id: 42,
        goal: 'Correct the primary building silhouette.', stage: 'SHAPE', scale: 'global', change_domains: ['silhouette'],
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('building-mass', 'continue-logical-layer', {
          layerId: primaryOwner.layer_id, layerName: 'building-mass', rollbackValue: 'low', constructionTier: 'primary',
          constructionChange: true,
        }),
        actions: [refine],
      },
    }));
    expect(corrected.preflight_rejection).toBeUndefined();

    const skyOwner = f.runtime.store.compactPassContext(42).logical_layer_owners.find((owner: any) => owner.hypothesis_id === 'sky-field');
    const skyContinue = regionAction('cg-sky-continue-region');
    skyContinue.args.regions[0].layer_id = skyOwner.layer_id;
    const unrelatedStillValid = await body(await f.cycle.handler({
      previous_operation_id: 'cg-building-structural-correction',
      previous_observation: { observed: 'The building silhouette correction is established.', target: 'resolved' },
      next_pass: {
        request_key: 'cg-unrelated-continue', problem_id: 'cg-sky-tone', document_id: 42,
        goal: 'Continue unrelated sky tone without structural invalidation.', stage: 'SHAPE', scale: 'global',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('sky-field', 'continue-logical-layer', {
          layerId: skyOwner.layer_id, layerName: 'sky-field', rollbackValue: 'low', constructionTier: 'primary',
        }),
        actions: [skyContinue],
      },
    }));
    expect(unrelatedStillValid.preflight_rejection).toBeUndefined();

    const staleSurface = await createOwner('cg-stale-surface', 'facade-finish', 'surface', 'window-opening', 'cg-unrelated-continue');
    expect(staleSurface.preflight_rejection?.error_codes).toContain('construction_graph_parent_stale');

    const tempLayerStep = 'cg-temp-primary-layer';
    const tempRegion = regionAction('cg-temp-primary-region');
    tempRegion.args.regions[0].layer_id = `$steps.${tempLayerStep}.details.layerId`;
    const tempPrimary = await body(await f.cycle.handler({
      previous_operation_id: 'cg-unrelated-continue',
      previous_observation: { observed: 'The unrelated sky continuation remains valid.', target: 'resolved' },
      next_pass: {
        request_key: 'cg-temp-primary', problem_id: 'cg-temp-primary', document_id: 42,
        goal: 'Try a temporary primary construction hypothesis.', stage: 'SHAPE', scale: 'global',
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('temp-mass', 'temporary-hypothesis', { layerName: 'temp-mass', constructionTier: 'primary' }),
        actions: [{ id: tempLayerStep, tool: 'photoshop_create_layer', args: { name: 'temp-mass' } }, tempRegion],
      },
    }));
    expect(tempPrimary.preflight_rejection).toBeUndefined();
    const unresolvedChild = await createOwner('cg-temp-child', 'temp-detail', 'secondary', 'temp-mass', 'cg-temp-primary');
    expect(unresolvedChild.preflight_rejection?.error_codes).toContain('construction_graph_parent_unresolved');
  });

  it('binds causal effects to durable source/receiver revisions and makes them stale after source structure changes', async () => {
    const f = fixture();
    await f.setArtRun.handler({ document_id: 42, process_dir: 'processes/causal-effects-process/run-01', painting_profile: 'nontrivial_painting', commentary_mode: 'technical' });
    const create = async (key: string, id: string, previous?: string, causalEffect?: Record<string, unknown>) => {
      const layerStep = `${key}-layer`; const region = regionAction(`${key}-region`);
      region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
      return body(await f.cycle.handler({
        ...(previous ? { previous_operation_id: previous, previous_observation: { observed: 'Prior owner established.', target: 'resolved' } } : {}),
        next_pass: {
          request_key: key, problem_id: key, document_id: 42, goal: `Establish ${id}.`, stage: 'SHAPE', scale: 'global',
          change_domains: ['local-shape'], layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
          logical_layer: semanticLogicalLayer(id, 'create-new', {
            layerName: id, constructionTier: 'primary', causalEffect,
            ...(causalEffect ? { physicalRole: 'surface-condition', opacityRole: 'effect-only' } : {}),
          }),
          actions: [{ id: layerStep, tool: 'photoshop_create_layer', args: { name: id } }, region],
        },
      }));
    };
    expect((await create('cause-source', 'tower')).preflight_rejection).toBeUndefined();
    expect((await create('cause-receiver', 'water-plane', 'cause-source')).preflight_rejection).toBeUndefined();
    const effect = await create('cause-reflection', 'tower-reflection', 'cause-receiver', {
      relation: 'reflection_of', source_hypothesis_id: 'tower', receiver_hypothesis_id: 'water-plane',
      causal_statement: 'Tower reflection is registered to the source and transformed by the water plane.',
      evidence: ['The reflected mass aligns with the source footprint and receiving plane direction.'],
    });
    expect(effect.preflight_rejection).toBeUndefined();
    const effectOwner = f.runtime.store.compactPassContext(42).logical_layer_owners.find((owner: any) => owner.hypothesis_id === 'tower-reflection');
    expect(effectOwner.causal_effect).toMatchObject({
      relation: 'reflection_of', source_hypothesis_id: 'tower', receiver_hypothesis_id: 'water-plane',
      source_construction_revision: 'cause-source', receiver_construction_revision: 'cause-receiver',
    });

    const sourceOwner = f.runtime.store.compactPassContext(42).logical_layer_owners.find((owner: any) => owner.hypothesis_id === 'tower');
    const revise = regionAction('cause-source-revise-region'); revise.args.regions[0].layer_id = sourceOwner.layer_id;
    const revised = await body(await f.cycle.handler({
      previous_operation_id: 'cause-reflection', previous_observation: { observed: 'Reflection relation is established.', target: 'resolved' },
      next_pass: {
        request_key: 'cause-source-revise', problem_id: 'cause-source-revise', document_id: 42, goal: 'Move/rebuild the source mass.', stage: 'SHAPE', scale: 'global',
        change_domains: ['silhouette'], layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('tower', 'continue-logical-layer', { layerId: sourceOwner.layer_id, layerName: 'tower', rollbackValue: 'low', constructionTier: 'primary', constructionChange: true }),
        actions: [revise],
      },
    }));
    expect(revised.preflight_rejection).toBeUndefined();

    const continueEffect = regionAction('cause-effect-continue-region'); continueEffect.args.regions[0].layer_id = effectOwner.layer_id;
    const stale = await body(await f.cycle.handler({
      previous_operation_id: 'cause-source-revise', previous_observation: { observed: 'Source structure changed.', target: 'resolved' },
      next_pass: {
        request_key: 'cause-effect-stale', problem_id: 'cause-effect-stale', document_id: 42, goal: 'Continue the old reflection without causal review.', stage: 'SHAPE', scale: 'medium',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('tower-reflection', 'continue-logical-layer', { layerId: effectOwner.layer_id, layerName: 'tower-reflection', rollbackValue: 'low', physicalRole: 'surface-condition', opacityRole: 'effect-only' }),
        actions: [continueEffect],
      },
    }));
    expect(stale.preflight_rejection?.error_codes).toContain('causal_effect_source_stale');
  });

  it('persists a surface frame across continuation and rejects silent orientation drift', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42, process_dir: 'processes/surface-frame-process/run-01',
      painting_profile: 'nontrivial_painting', commentary_mode: 'technical',
    });
    const layerStep = 'sf-layer';
    const region = regionAction('sf-region');
    region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
    const frame = {
      axes: [{ id: 'surface-flow', angle_degrees: 12, weight: 1 }],
      convergence_anchor: { x: 900, y: 140 },
      depth_progression: { near_scale: 1, far_scale: 0.35, direction: 'toward-anchor' },
      distribution: 'perspective-regular',
      local_exceptions: ['Break the flow locally where the plane turns.'],
    };
    const created = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'sf-create', problem_id: 'sf-create', document_id: 42,
        goal: 'Establish an oriented support surface.', stage: 'SHAPE', scale: 'global',
        change_domains: ['local-shape'],
        layer_separation_check: semanticLayerSeparation('new-plane', 'moderate', true),
        logical_layer: semanticLogicalLayer('oriented-surface', 'create-new', {
          layerName: 'oriented-surface', constructionTier: 'primary', physicalRole: 'support-surface',
          surfaceFrame: frame,
        }),
        actions: [{ id: layerStep, tool: 'photoshop_create_layer', args: { name: 'oriented-surface' } }, region],
      },
    }));
    expect(created.preflight_rejection).toBeUndefined();
    const owner = f.runtime.store.compactPassContext(42).logical_layer_owners.find((entry: any) => entry.hypothesis_id === 'oriented-surface');
    expect(owner.surface_frame).toEqual(frame);

    const continuation = regionAction('sf-continue-region');
    continuation.args.regions[0].layer_id = owner.layer_id;
    const inherited = await body(await f.cycle.handler({
      previous_operation_id: 'sf-create',
      previous_observation: { observed: 'The oriented surface is established.', target: 'resolved' },
      next_pass: {
        request_key: 'sf-continue', problem_id: 'sf-continue', document_id: 42,
        goal: 'Continue marks on the same oriented surface.', stage: 'SHAPE', scale: 'medium',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('oriented-surface', 'continue-logical-layer', {
          layerId: owner.layer_id, layerName: 'oriented-surface', rollbackValue: 'low',
          constructionTier: 'primary', physicalRole: 'support-surface',
        }),
        actions: [continuation],
      },
    }));
    expect(inherited.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners.find((entry: any) => entry.hypothesis_id === 'oriented-surface').surface_frame).toEqual(frame);

    const equivalent = regionAction('sf-equivalent-region');
    equivalent.args.regions[0].layer_id = owner.layer_id;
    const equivalentResult = await body(await f.cycle.handler({
      previous_operation_id: 'sf-continue',
      previous_observation: { observed: 'The inherited surface frame remains coherent.', target: 'resolved' },
      next_pass: {
        request_key: 'sf-equivalent', problem_id: 'sf-equivalent', document_id: 42,
        goal: 'Continue with semantically equivalent frame metadata.', stage: 'SHAPE', scale: 'medium',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('oriented-surface', 'continue-logical-layer', {
          layerId: owner.layer_id, layerName: 'oriented-surface', rollbackValue: 'low',
          constructionTier: 'primary', physicalRole: 'support-surface',
          surfaceFrame: { axes: [{ id: 'surface-flow', angle_degrees: 12 }], convergence_anchor: { x: 900, y: 140 }, depth_progression: { near_scale: 1, far_scale: 0.35, direction: 'toward-anchor' }, distribution: 'perspective-regular', local_exceptions: ['Break the flow locally where the plane turns.'] },
        }),
        actions: [equivalent],
      },
    }));
    expect(equivalentResult.preflight_rejection).toBeUndefined();

    const changedFrame = { ...frame, axes: [{ id: 'surface-flow', angle_degrees: 78, weight: 1 }] };
    const rejected = await body(await f.cycle.handler({
      previous_operation_id: 'sf-equivalent',
      previous_observation: { observed: 'The directional continuation is coherent.', target: 'resolved' },
      next_pass: {
        request_key: 'sf-drift', problem_id: 'sf-drift', document_id: 42,
        goal: 'Silently rotate the established surface frame.', stage: 'SHAPE', scale: 'medium',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('oriented-surface', 'continue-logical-layer', {
          layerId: owner.layer_id, layerName: 'oriented-surface', rollbackValue: 'low',
          constructionTier: 'primary', physicalRole: 'support-surface', surfaceFrame: changedFrame,
        }),
        actions: [continuation],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('surface_frame_owner_conflict');
  });

  it('binds physical depth relations to exact Photoshop layer placement before value/form rendering', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/physical-stack-layer-order-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const rearRegion = regionAction('rear-house-region');
    rearRegion.args.regions[0].layer_id = '$steps.rear-house-layer.details.layerId';
    const rear = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'rear-house-shape',
        problem_id: 'rear-house-shape',
        document_id: 42,
        goal: 'Establish the rear house as an opaque structural mass.',
        stage: 'SHAPE',
        scale: 'global',
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('rear-house', 'create-new', {
          layerName: 'Rear house',
          physicalRole: 'opaque-mass',
          opacityRole: 'opaque',
        }),
        actions: [
          { id: 'rear-house-layer', tool: 'photoshop_create_layer', args: { name: 'Rear house' } },
          rearRegion,
        ],
      },
    }));
    expect(rear.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual([
      expect.objectContaining({
        hypothesis_id: 'rear-house',
        layer_id: 9,
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
      }),
    ]);

    const frontRegion = regionAction('front-house-region');
    frontRegion.args.regions[0].layer_id = '$steps.front-house-layer.details.layerId';
    const front = await body(await f.cycle.handler({
      previous_operation_id: 'rear-house-shape',
      previous_observation: {
        observed: 'The rear house is established as the first opaque depth anchor.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'front-house-shape',
        problem_id: 'front-house-shape',
        document_id: 42,
        goal: 'Establish the foreground house in front of the rear house.',
        stage: 'SHAPE',
        scale: 'global',
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('front-house', 'create-new', {
          layerName: 'Front house',
          physicalRole: 'opaque-mass',
          opacityRole: 'opaque',
          depthRelations: [{ relation: 'in-front-of', target_hypothesis_id: 'rear-house' }],
        }),
        actions: [
          {
            id: 'front-house-layer',
            tool: 'photoshop_create_layer',
            args: { name: 'Front house', above_layer_id: 9 },
          },
          frontRegion,
        ],
      },
    }));
    expect(front.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual(expect.arrayContaining([
      expect.objectContaining({
        hypothesis_id: 'front-house',
        layer_id: 10,
        depth_relations: [{ relation: 'in-front-of', target_hypothesis_id: 'rear-house' }],
      }),
    ]));

    const wrongRegion = regionAction('wrong-order-house-region');
    wrongRegion.args.regions[0].layer_id = '$steps.wrong-order-layer.details.layerId';
    const wrong = await body(await f.cycle.handler({
      previous_operation_id: 'front-house-shape',
      previous_observation: {
        observed: 'The front house correctly occludes the rear house and the layer stack matches depth.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'wrong-order-house-shape',
        problem_id: 'wrong-order-house-shape',
        document_id: 42,
        goal: 'Try to add another foreground mass without matching its declared stack order.',
        stage: 'SHAPE',
        scale: 'global',
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('wrong-order-house', 'create-new', {
          layerName: 'Wrong order house',
          physicalRole: 'opaque-mass',
          opacityRole: 'opaque',
          depthRelations: [{ relation: 'in-front-of', target_hypothesis_id: 'front-house' }],
        }),
        actions: [
          { id: 'wrong-order-layer', tool: 'photoshop_create_layer', args: { name: 'Wrong order house' } },
          wrongRegion,
        ],
      },
    }));
    expect(wrong.preflight_rejection?.error_codes).toContain('physical_stack_layer_order_mismatch');

    const lateRegion = regionAction('late-opaque-region');
    lateRegion.args.regions[0].layer_id = '$steps.late-opaque-layer.details.layerId';
    const late = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'late-opaque-value',
        problem_id: 'late-opaque-value',
        document_id: 42,
        goal: 'Try to introduce a new opaque structural mass after shape has already advanced.',
        stage: 'VALUE',
        scale: 'global',
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('late-opaque', 'create-new', {
          layerName: 'Late opaque',
          physicalRole: 'opaque-mass',
          opacityRole: 'opaque',
        }),
        actions: [
          { id: 'late-opaque-layer', tool: 'photoshop_create_layer', args: { name: 'Late opaque' } },
          lateRegion,
        ],
      },
    }));
    expect(late.preflight_rejection?.error_codes).toContain('physical_stack_structural_change_requires_shape');
  });

  it('keeps temporary semantic ownership durable across continuation and blocks committed refinement until it is explicitly resolved', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/semantic-layer-temporary-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const tempRegion = regionAction('temporary-cat-region');
    tempRegion.args.regions[0].layer_id = '$steps.temporary-cat-layer.details.layerId';
    const temporary = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'temporary-cat-create',
        problem_id: 'temporary-cat',
        document_id: 42,
        goal: 'Keep one provisional cat structure independently reversible during shape exploration.',
        stage: 'SHAPE',
        scale: 'global',
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('cat-temp', 'temporary-hypothesis', { layerName: 'Cat Temp' }),
        actions: [
          { id: 'temporary-cat-layer', tool: 'photoshop_create_layer', args: { name: 'Cat Temp' } },
          tempRegion,
        ],
      },
    }));
    expect(temporary.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'cat-temp', layer_id: 9, temporary: true }),
    ]);

    const continueTemp = regionAction('temporary-cat-continue');
    continueTemp.args.regions[0].layer_id = 9;
    continueTemp.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const blocked = await body(await f.cycle.handler({
      previous_operation_id: 'temporary-cat-create',
      previous_observation: {
        observed: 'The provisional owner remains useful but is still explicitly temporary.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'temporary-cat-form',
        problem_id: 'temporary-cat-form',
        document_id: 42,
        goal: 'Attempt committed form refinement without resolving the temporary layer hypothesis.',
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'cat',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 },
        action_class: 'REPLACE',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('cat-temp', 'continue-logical-layer', { layerId: 9, layerName: 'Cat Temp', rollbackValue: 'low' }),
        actions: [continueTemp],
      },
    }));
    expect(blocked.preflight_rejection?.error_codes).toContain('semantic_layer_stage_gate');
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'cat-temp', layer_id: 9, temporary: true }),
    ]);
  });
});
