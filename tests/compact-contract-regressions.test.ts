import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { ToolRegistry, type ToolDefinition } from '../src/core/tool-registry.js';
import { withOptionalDocumentId } from '../src/core/document-target.js';
import { PhotoshopConnection } from '../src/platform/connection.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';
import { createLayerTools } from '../src/tools/layer-tools.js';
import { createDocumentTools } from '../src/tools/document-tools.js';
import { createStateTools } from '../src/tools/state-tools.js';
import { createSelectionTools } from '../src/tools/selection-tools.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';
import { createValueCheckTools } from '../src/tools/value-check-tools.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';
import { normalizeGeometryBinding } from '../src/core/geometry-binding.js';

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
    ...createDocumentTools(connection),
    ...createStateTools(connection),
    ...createSelectionTools(connection),
  ];
  const found = definitions.find(definition => definition.tool.name === name);
  if (!found) throw new Error(`missing real tool definition for ${name}`);
  return { ...found, tool: withOptionalDocumentId(found.tool) };
}

function fixture(options: {
  stickyAfter?: boolean;
  brushInventory?: boolean;
  sceneGeometry?: false | 'coherent_3d' | 'orthographic_or_diagrammatic' | 'flat_or_collage' | 'intentional_non_euclidean';
} = {}) {
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
  if (options.brushInventory) {
    registerReal('photoshop_list_brush_presets', async () => ({
      content: [{ type: 'text', text: JSON.stringify({ ok: true, presets: ['Fur Bristle', 'Dry Fur'] }) }],
    }));
  }
  registerReal('photoshop_create_layer', async (args) => ({
    content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      details: {
        layerId: ++createdLayerId,
        layerName: typeof args.name === 'string' ? args.name : 'New',
      },
    }) }],
  }));
  registerReal('photoshop_save_document', async (args) => {
    if (typeof args.path === 'string') {
      mkdirSync(path.dirname(args.path), { recursive: true });
      writeFileSync(args.path, 'checkpoint');
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: args.path }) }] };
  });
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
  const valueCheck = createValueCheckTools(registry)[0]!;
  registry.register(valueCheck.tool.name, valueCheck);

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
    processVideoTraceEnabled: false,
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
  const rawCycle = guard.find(definition => definition.tool.name === 'photoshop_guard_cycle_auto')!;
  const reviewImage = guard.find(definition => definition.tool.name === 'photoshop_guard_review_image')!;
  const cycle = {
    ...rawCycle,
    handler: async (args: Record<string, unknown>) => {
      const previousOperationId = typeof args.previous_operation_id === 'string'
        ? args.previous_operation_id
        : undefined;
      if (previousOperationId) {
        const previousRecord = runtime.store.read(previousOperationId);
        if (previousRecord && runtime.store.visualDeliveryDebt(previousRecord)) {
          const delivered = await reviewImage.handler({ operation_id: previousOperationId });
          if (delivered.isError) return delivered;
        }
      }
      const nextPass = args.next_pass && typeof args.next_pass === 'object' && !Array.isArray(args.next_pass)
        ? structuredClone(args.next_pass as Record<string, unknown>)
        : undefined;
      if (options.sceneGeometry !== false
          && nextPass?.construction_role === 'structured-mass'
          && nextPass.scene_geometry_model === undefined
          && !runtime.store.sceneGeometryModel(Number(nextPass.document_id))) {
        nextPass.scene_geometry_model = sceneGeometryModel(options.sceneGeometry ?? 'coherent_3d');
      }
      const logicalLayer = nextPass?.logical_layer && typeof nextPass.logical_layer === 'object' && !Array.isArray(nextPass.logical_layer)
        ? nextPass.logical_layer as Record<string, unknown>
        : undefined;
      const activeGeometry = nextPass?.scene_geometry_model && typeof nextPass.scene_geometry_model === 'object' && !Array.isArray(nextPass.scene_geometry_model)
        ? nextPass.scene_geometry_model as Record<string, unknown>
        : runtime.store.sceneGeometryModel(Number(nextPass?.document_id));
      if (options.sceneGeometry !== false
          && nextPass?.construction_role === 'structured-mass'
          && logicalLayer?.decision === 'create-new'
          && logicalLayer.geometry_binding === undefined
          && activeGeometry?.applicability === 'coherent_3d') {
        logicalLayer.geometry_binding = geometryBinding(String(logicalLayer.hypothesis_id), Number(activeGeometry.revision ?? 1));
      }
      return rawCycle.handler({ ...args, ...(nextPass ? { next_pass: nextPass } : {}) });
    },
  };
  const status = guard.find(definition => definition.tool.name === 'photoshop_guard_status')!;
  const resume = guard.find(definition => definition.tool.name === 'photoshop_guard_resume')!;
  const setArtRun = guard.find(definition => definition.tool.name === 'photoshop_guard_set_art_run')!;
  const keepLogicalLayer = guard.find(definition => definition.tool.name === 'photoshop_guard_keep_logical_layer')!;
  return {
    dir,
    runtime,
    cycle,
    status,
    resume,
    setArtRun,
    keepLogicalLayer,
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

function structuredMassContract(materialRole = 'generic form-bearing mass') {
  return {
    construction_role: 'structured-mass',
    material_role: materialRole,
    visual_intent: 'mass',
    impact_class: 'construct',
  };
}

function sceneGeometryModel(
  applicability: 'coherent_3d' | 'orthographic_or_diagrammatic' | 'flat_or_collage' | 'intentional_non_euclidean' | 'insufficient_evidence' = 'coherent_3d',
  revision = 1,
) {
  return {
    model_id: 'compact-contract-scene',
    revision,
    applicability,
    ...(applicability === 'coherent_3d' ? {} : {
      applicability_rationale: applicability === 'insufficient_evidence'
        ? 'The scene has not yet established enough shared structural evidence for committed geometry.'
        : `The brief intentionally uses ${applicability.replaceAll('_', ' ')} geometry.`,
    }),
    source_frame: {
      document_id: 42,
      document_incarnation: 'compact-contract-fixture:42',
      width: 400,
      height: 300,
    },
    projection: {
      kind: applicability === 'orthographic_or_diagrammatic' ? 'orthographic' : 'custom',
      vanishing_points: applicability === 'coherent_3d'
        ? [{ id: 'fixture_vp', x: 200, y: 90, evidence: 'proposed', derived_from: [] }]
        : [],
    },
    ...(applicability === 'coherent_3d' ? {
      line_families: [{
        id: 'fixture_depth_family', vanishing_point_id: 'fixture_vp',
        members: [
          { id: 'fixture_left', points: [{ x: 40, y: 280 }, { x: 200, y: 90 }] },
          { id: 'fixture_right', points: [{ x: 160, y: 280 }, { x: 200, y: 90 }] },
        ],
      }],
      support_planes: [{
        id: 'fixture_support_plane', role: 'Generic support plane for compact contract regressions.',
        vanishing_family_ids: ['fixture_depth_family'], boundary_relations: ['fixture_left', 'fixture_right'],
      }],
      scale_anchors: [{
        id: 'fixture_scale_anchor', contact_point: { x: 80, y: 240 }, visible_extent: 80,
        depth_role: 'generic near-scale reference',
      }],
    } : {}),
  };
}

function geometryBinding(ownerId: string, revision = 1) {
  return {
    owner_id: ownerId,
    scene_geometry_model_id: 'compact-contract-scene',
    scene_geometry_revision: revision,
    support_plane_id: 'fixture_support_plane',
    vanishing_family_ids: ['fixture_depth_family'],
    dependencies: ['fixture_left', 'fixture_right'],
    anchors: {
      near_contact: { x: 100, y: 240 },
      far_extent: { x: 180, y: 120 },
      centerline: { line: [{ x: 100, y: 240 }, { x: 180, y: 120 }] },
    },
    control_sections: [
      { id: 'near', at: { x: 120, y: 210 }, expected_bounds: { left: 90, top: 180, right: 150, bottom: 240 } },
      { id: 'mid', at: { x: 150, y: 165 }, expected_bounds: { left: 130, top: 145, right: 170, bottom: 185 } },
    ],
    constraints: [
      { type: 'converges_to', subject_ref: ownerId, target_ref: 'fixture_depth_family', evidence: ['fixture centerline'] },
      { type: 'supported_by', subject_ref: ownerId, target_ref: 'fixture_support_plane', evidence: ['near contact'] },
    ],
    local_exceptions: [],
  };
}

function sceneCameraModel(revision = 1, geometryRevision = 1) {
  return {
    model_id: 'compact-contract-camera', revision,
    source_frame: {
      document_id: 42,
      document_incarnation: 'compact-contract-fixture:42',
    },
    geometry_model_id: 'compact-contract-scene',
    geometry_model_revision: geometryRevision,
    camera: {
      framing: 'shared compact-contract framing',
      view_character: 'normal',
      lens_character: 'qualitative normal-lens relationship',
    },
    focus: {
      focal_depth_or_plane: 'fixture_support_plane',
      depth_of_field_behavior: 'focal support remains sharp while far depth softens progressively',
      foreground_softness: 'slight',
      background_softness: 'progressive',
    },
    motion: { camera_motion: 'locked', subject_motion: 'none', shutter_character: 'static' },
    optical_response: { base_softness: 'low', bloom: 'none', halation: 'none' },
    capture_finish: { grain: 'none', vignette: 'none', film_or_sensor_character: 'neutral' },
    intentional_exceptions: [],
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
    geometryBinding?: Record<string, unknown>;
    cameraBinding?: Record<string, unknown>;
    attentionBinding?: Record<string, unknown>;
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
    ...(options.geometryBinding ? { geometry_binding: options.geometryBinding } : {}),
    ...(options.cameraBinding ? { camera_binding: options.cameraBinding } : {}),
    ...(options.attentionBinding ? { attention_binding: options.attentionBinding } : {}),
    ...(options.layerId ? { layer_id: options.layerId } : {}),
    ...(options.layerName ? { layer_name: options.layerName } : {}),
  };
}

function semanticSceneOwnershipPlan(
  planId: string,
  units: Array<string | {
    semanticId: string;
    ownerId?: string;
    role?: string;
    editability?: 'independent' | 'shared-owner' | 'continuous-field' | 'temporary';
  }>,
  shared: Array<{ ownerId: string; semanticIds: string[]; rationale?: string }> = []
) {
  return {
    plan_id: planId,
    units: units.map(entry => {
      const item = typeof entry === 'string' ? { semanticId: entry } : entry;
      return {
        semantic_id: item.semanticId,
        owner_id: item.ownerId ?? item.semanticId,
        role: item.role ?? `Major semantic concern ${item.semanticId}`,
        editability: item.editability ?? 'independent',
        rationale: 'Predeclare this concern so later correction does not depend on reactive layer ownership.',
      };
    }),
    ...(shared.length ? {
      shared_owner_justifications: shared.map(row => ({
        owner_id: row.ownerId,
        semantic_ids: row.semanticIds,
        rationale: row.rationale ?? 'These concerns intentionally share one persistent raster owner and accept coupled correction.',
      })),
    } : {}),
  };
}

function proseFreeSharedSceneOwnershipPlan(planId: string) {
  return {
    plan_id: planId,
    units: [
      { semantic_id: 'left-house', owner_id: 'village', role: 'Left distant house', editability: 'shared-owner' },
      { semantic_id: 'right-house', owner_id: 'village', role: 'Right distant house', editability: 'shared-owner' },
    ],
    shared_owner_justifications: [
      { owner_id: 'village', semantic_ids: ['left-house', 'right-house'] },
    ],
  };
}

describe('scene ownership normalization', () => {
  it('keeps shared ownership structural while allowing rationale-free audit metadata', async () => {
    const { normalizeSceneOwnershipPlan } = await import('../src/core/scene-ownership-plan.js');
    const normalized = normalizeSceneOwnershipPlan(proseFreeSharedSceneOwnershipPlan('prose-free-shared-scene'));
    expect(normalized.units).toEqual(expect.arrayContaining([
      expect.objectContaining({ semantic_id: 'left-house', owner_id: 'village', editability: 'shared-owner' }),
      expect.objectContaining({ semantic_id: 'right-house', owner_id: 'village', editability: 'shared-owner' }),
    ]));
    expect(normalized.units[0]).not.toHaveProperty('rationale');
    expect(normalized.shared_owner_justifications[0]).not.toHaveProperty('rationale');
    expect(() => normalizeSceneOwnershipPlan({
      plan_id: 'missing-shared-membership',
      units: proseFreeSharedSceneOwnershipPlan('unused').units,
    })).toThrow(/requires shared_owner_justifications/);
  });
});

function materialBrushPreflight(options: { filtered?: boolean; ambiguous?: boolean; probeStatus?: 'pass' | 'cached' | 'not-needed'; candidateDynamics?: boolean } = {}) {
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
    ...(options.candidateDynamics ? { candidate_evidence: [
      {
        preset_name: 'Fur Bristle', profile_id: 'profile:fur-bristle', evidence_score: 9,
        mark_character: ['bristly', 'directional'], edge_behavior: 'broken', buildup_behavior: 'layered',
        useful_scale_range: { min_px: 8, max_px: 160 }, rotation_meaningful: true, pressure_policy: 'native-preset',
        dynamics_capability: {
          native_pressure_size: true, native_pressure_opacity: false,
          simulated_pressure_size: false, simulated_pressure_opacity: false,
          rotation_meaningful: true, spacing_tunable: true, opacity_tunable: true, flow_tunable: true,
        },
        effective_settings: settings, caveats: [],
      },
      {
        preset_name: 'Dry Fur', profile_id: 'profile:dry-fur', evidence_score: 8,
        mark_character: ['broken', 'textural'], edge_behavior: 'broken', buildup_behavior: 'granular',
        useful_scale_range: { min_px: 6, max_px: 120 }, rotation_meaningful: false, pressure_policy: 'simulated-size',
        dynamics_capability: {
          native_pressure_size: false, native_pressure_opacity: false,
          simulated_pressure_size: true, simulated_pressure_opacity: false,
          rotation_meaningful: false, spacing_tunable: true, opacity_tunable: true, flow_tunable: true,
        },
        effective_settings: { ...settings, use_pressure_size: false }, caveats: [],
      },
    ] } : {}),
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

async function createHotLoopOwner(
  f: ReturnType<typeof fixture>,
  requestKey: string,
  ownerId = 'hot-loop-owner'
) {
  await body(await f.setArtRun.handler({
    document_id: 42,
    process_dir: 'processes/hot-loop-process/benchmark-01',
  }));
  const region = regionAction(`${requestKey}-region`);
  region.args.regions[0].layer_id = '$steps.hot-loop-layer.details.layerId';
  const result = await body(await f.cycle.handler({
    next_pass: {
      request_key: requestKey,
      problem_id: `${requestKey}-problem`,
      document_id: 42,
      goal: 'Create one stable semantic owner for hot-loop compiler integration coverage.',
      stage: 'SHAPE',
      scale: 'global',
      ...structuredMassContract('stable painted structural mass'),
      scene_ownership_plan: semanticSceneOwnershipPlan(`${requestKey}-ownership`, [
        { semanticId: 'hot-loop-subject', ownerId, role: 'Hot-loop subject form' },
      ]),
      layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
      logical_layer: semanticLogicalLayer(ownerId, 'create-new', { layerName: 'Hot Loop Owner' }),
      actions: [
        { id: 'hot-loop-layer', tool: 'photoshop_create_layer', args: { name: 'Hot Loop Owner' } },
        region,
      ],
    },
  }));
  expect(result.preflight_rejection).toBeUndefined();
  return result;
}

async function closeHotLoopOwner(f: ReturnType<typeof fixture>, operationId: string) {
  const closed = await body(await f.cycle.handler({
    previous_operation_id: operationId,
    previous_observation: {
      observed: 'The stable semantic owner is visible and accepted for the next refinement.',
      target: 'resolved',
    },
  }));
  expect(closed.preflight_rejection).toBeUndefined();
  return closed;
}

describe('public compact Guard contract regressions', () => {
  it('lints a proposed next pass through status without dispatching Photoshop', async () => {
    const f = fixture();
    const before = f.counts();
    const response = JSON.parse(((await f.status.handler({
      next_pass: {
        request_key: 'lint-no-art-run',
        document_id: 42,
        goal: 'Test deterministic admission before dispatch',
        actions: [regionAction('lint-region')],
      },
    })).content[0] as any).text) as any;

    expect(response.next_pass_lint).toMatchObject({
      ok: false,
      protocol: 'photoshop.guard.next_pass_lint.v1',
      execution: 'not-executed',
      visual_mutation_started: false,
    });
    expect(response.next_pass_lint.error_codes).toContain('guard_preflight_failed');
    expect(f.counts()).toEqual(before);
  });

  it('rejects blank-canvas value analysis before the first meaningful visual frame', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/no-blank-value-baseline-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const rejected = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'blank-value-baseline',
        problem_id: 'blank-value-baseline',
        document_id: 42,
        goal: 'Analyze the fresh blank frame before any visual construction.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        actions: [{
          id: 'blank-value-read',
          tool: 'photoshop_analyze_value_structure',
          args: { document_id: 42, max_dimension_px: 800 },
        }],
      },
    }));

    expect(rejected.preflight_rejection?.error_codes).toContain('premature_value_analysis');
    expect(rejected.preflight_rejection?.next_operation_dispatched).toBe(false);
  });

  it('rejects standalone future-stage preparation before first visible progress but allows immediate visual construction', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/first-visible-progress-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const premature = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'blank-future-brush-prep',
        problem_id: 'future-detail-brush',
        document_id: 42,
        goal: 'Select a detail brush for a later fur pass before any visible construction exists.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        actions: [{
          id: 'select-future-detail-brush',
          tool: 'photoshop_select_brush_preset',
          args: { name: 'Hard Round', document_id: 42 },
        }],
      },
    }));

    expect(premature.preflight_rejection?.error_codes).toContain('premature_future_preparation');
    expect(premature.preflight_rejection?.next_operation_dispatched).toBe(false);

    const activate = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'blank-reactivate-pinned-document',
        problem_id: 'restore-pinned-document-target',
        document_id: 42,
        goal: 'Restore the pinned blank document as the active Photoshop target before its first visual construction pass.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        actions: [{
          id: 'activate-pinned-document',
          tool: 'photoshop_set_active_document',
          args: { document_id: 42 },
        }],
      },
    }));

    expect(activate.preflight_rejection?.error_codes ?? []).not.toContain('premature_future_preparation');

    const visual = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'blank-first-visible-gradient',
        problem_id: 'first-visible-background',
        document_id: 42,
        goal: 'Establish the first visible background field immediately.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'whole-canvas',
        construction_role: 'continuous-field',
        material_role: 'background environment',
        visual_intent: 'continuous-field',
        impact_class: 'construct',
        preferred_method_id: 'continuous-color-field',
        actions: [{
          id: 'first-visible-gradient',
          tool: 'photoshop_paint_color_gradient',
          method_id: 'continuous-color-field',
          args: {
            layer_id: 7,
            from: { x: 0, y: 0 },
            to: { x: 400, y: 300 },
            stops: [
              { position: 0, red: 80, green: 90, blue: 110 },
              { position: 1, red: 160, green: 140, blue: 120 },
            ],
            document_id: 42,
          },
        }],
      },
    }));

    expect(visual.preflight_rejection).toBeUndefined();
    expect(visual.ok).not.toBe(false);
  });

  it('keeps a deep-local construction plan as guidance without blocking broad structured-mass construction', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/deep-local-construction-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    f.runtime.store.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        directive_id: 'deep-local-directive',
        current_task_id: 'T-house',
        status: 'active',
        tasks: [{
          task_id: 'T-house',
          status: 'active',
          allowed_scales: ['medium'],
        }],
      },
    }));

    const missingPlan = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'house-mass-without-plan',
        problem_id: 'house-form',
        document_id: 42,
        goal: 'Construct the cottage as one broad but irregular architectural mass.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'medium',
        ...structuredMassContract('weathered cottage architecture'),
        actions: [regionAction('house-irregular')],
      },
    }));
    expect(missingPlan.preflight_rejection).toBeUndefined();
    expect(missingPlan.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.counts().regionCalls).toBe(1);

  });

  it('requires an applicable durable scene geometry model before committed structured construction', async () => {
    const missing = fixture({ sceneGeometry: false });
    await missing.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/geometry-model-required-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const withoutModel = await body(await missing.cycle.handler({
      next_pass: {
        request_key: 'geometry-model-missing',
        problem_id: 'geometry-model-required',
        document_id: 42,
        goal: 'Commit a structured spatial mass without a shared scene geometry basis.',
        stage: 'SHAPE',
        scale: 'global',
        ...structuredMassContract('shared spatial construction'),
        actions: [regionAction('geometry-model-missing-region')],
      },
    }));
    expect(withoutModel.preflight_rejection?.error_codes).toContain('scene_geometry_model_required');
    expect(withoutModel.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(missing.counts().regionCalls).toBe(0);

    const insufficient = fixture({ sceneGeometry: false });
    await insufficient.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/geometry-model-insufficient-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const deferred = await body(await insufficient.cycle.handler({
      next_pass: {
        request_key: 'geometry-model-insufficient',
        problem_id: 'geometry-model-required',
        document_id: 42,
        goal: 'Try to commit structure while scene geometry is still explicitly unresolved.',
        stage: 'SHAPE',
        scale: 'global',
        scene_geometry_model: sceneGeometryModel('insufficient_evidence'),
        ...structuredMassContract('shared spatial construction'),
        actions: [regionAction('geometry-model-insufficient-region')],
      },
    }));
    expect(deferred.preflight_rejection?.error_codes).toContain('scene_geometry_model_required');
    expect(deferred.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(insufficient.counts().regionCalls).toBe(0);

    for (const applicability of [
      'coherent_3d',
      'orthographic_or_diagrammatic',
      'flat_or_collage',
      'intentional_non_euclidean',
    ] as const) {
      const acceptedFixture = fixture({ sceneGeometry: false });
      await acceptedFixture.setArtRun.handler({
        document_id: 42,
        process_dir: `processes/geometry-model-${applicability.replaceAll('_', '-')}-process/run-01`,
        painting_profile: 'nontrivial_painting',
        commentary_mode: 'technical',
      });
      const accepted = await body(await acceptedFixture.cycle.handler({
        next_pass: {
          request_key: `geometry-model-${applicability}`,
          problem_id: 'geometry-model-applicability',
          document_id: 42,
          goal: 'Commit structure only after scene-level geometry applicability is explicit.',
          stage: 'SHAPE',
          scale: 'global',
          scene_geometry_model: sceneGeometryModel(applicability),
          ...structuredMassContract('shared spatial construction'),
          actions: [regionAction(`geometry-model-${applicability}-region`)],
        },
      }));
      expect(accepted.preflight_rejection).toBeUndefined();
      expect(accepted.execution).toMatchObject({ phase: 'completed', failed: false });
      expect(acceptedFixture.runtime.store.compactPassContext(42).scene_geometry_model)
        .toMatchObject({ applicability, source_operation_id: `geometry-model-${applicability}` });
      expect(acceptedFixture.counts().regionCalls).toBe(1);
    }

    const temporary = fixture({ sceneGeometry: false });
    await temporary.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/geometry-model-temporary-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const tempRegion = regionAction('geometry-temp-region');
    tempRegion.args.regions[0].layer_id = '$steps.geometry-temp-layer.details.layerId';
    const exploratory = await body(await temporary.cycle.handler({
      next_pass: {
        request_key: 'geometry-model-temporary',
        problem_id: 'geometry-model-temporary',
        document_id: 42,
        goal: 'Try a temporary structural hypothesis without promoting it to committed scene geometry.',
        stage: 'SHAPE',
        scale: 'global',
        ...structuredMassContract('temporary spatial hypothesis'),
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('geometry-temp-owner', 'temporary-hypothesis', {
          layerName: 'Geometry Temp',
          constructionTier: 'primary',
        }),
        actions: [
          { id: 'geometry-temp-layer', tool: 'photoshop_create_layer', args: { name: 'Geometry Temp' } },
          tempRegion,
        ],
      },
    }));
    expect(exploratory.preflight_rejection).toBeUndefined();
    expect(exploratory.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(temporary.runtime.store.compactPassContext(42).scene_geometry_model).toBeNull();
  });

  it('enforces durable Object Geometry Binding for committed coherent-3D owners', async () => {
    const rejectedOwnerPass = async (
      tag: string,
      options: {
        binding?: Record<string, unknown> | null;
        sceneRevision?: number;
        surfaceFrame?: Record<string, unknown>;
      } = {}
    ) => {
      const f = fixture({ sceneGeometry: false });
      await f.setArtRun.handler({
        document_id: 42,
        process_dir: `processes/e18c-${tag}-process/run-01`,
        painting_profile: 'nontrivial_painting',
        commentary_mode: 'technical',
      });
      const layerStep = `${tag}-layer`;
      const region = regionAction(`${tag}-region`);
      region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
      const logical = semanticLogicalLayer('bound-owner', 'create-new', {
        layerName: 'Bound Owner',
        constructionTier: 'primary',
        ...(options.binding ? { geometryBinding: options.binding } : {}),
        ...(options.surfaceFrame ? { surfaceFrame: options.surfaceFrame } : {}),
      });
      const result = await body(await f.cycle.handler({
        next_pass: {
          request_key: `e18c-${tag}`,
          problem_id: `e18c-${tag}`,
          document_id: 42,
          goal: 'Commit one coherent-3D structural owner against the shared scene geometry model.',
          stage: 'SHAPE',
          scale: 'global',
          scene_geometry_model: sceneGeometryModel('coherent_3d', options.sceneRevision ?? 1),
          scene_ownership_plan: semanticSceneOwnershipPlan(`e18c-${tag}-owners`, ['bound-owner']),
          ...structuredMassContract('coherent 3D structural owner'),
          layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
          logical_layer: logical,
          actions: [
            { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Bound Owner' } },
            region,
          ],
        },
      }));
      return { f, result };
    };

    const missing = await rejectedOwnerPass('missing-binding', { binding: null });
    expect(missing.result.preflight_rejection?.error_codes).toContain('geometry_binding_required');
    expect(missing.result.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(missing.f.runtime.store.semanticLayerOwners(42)).toEqual([]);

    const wrongOwnerBinding = geometryBinding('other-owner');
    const wrongOwner = await rejectedOwnerPass('wrong-owner', { binding: wrongOwnerBinding });
    expect(wrongOwner.result.preflight_rejection?.error_codes).toContain('geometry_binding_owner_mismatch');
    expect(wrongOwner.result.preflight_rejection?.next_operation_dispatched).toBe(false);

    const stale = await rejectedOwnerPass('stale-revision', {
      binding: geometryBinding('bound-owner', 1),
      sceneRevision: 2,
    });
    expect(stale.result.preflight_rejection?.error_codes).toContain('geometry_dependency_stale');
    expect(stale.result.preflight_rejection?.next_operation_dispatched).toBe(false);

    const conflictingSurfaceFrame = await rejectedOwnerPass('surface-frame-conflict', {
      binding: geometryBinding('bound-owner'),
      surfaceFrame: {
        axes: [{ id: 'depth', angle_degrees: -30, weight: 1 }],
        convergence_anchor: { x: 260, y: 90 },
        scene_vanishing_family_ids: ['fixture_depth_family'],
        scene_support_plane_id: 'fixture_support_plane',
        distribution: 'perspective-regular',
        local_exceptions: [],
      },
    });
    expect(conflictingSurfaceFrame.result.preflight_rejection?.error_codes).toContain('surface_frame_geometry_conflict');
    expect(conflictingSurfaceFrame.result.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(conflictingSurfaceFrame.f.counts().regionCalls).toBe(0);

    for (const [tag, mutate] of [
      ['unknown-support', (binding: any) => { binding.support_plane_id = 'missing_support'; }],
      ['unknown-family', (binding: any) => { binding.vanishing_family_ids = ['missing_family']; }],
      ['unknown-dependency', (binding: any) => { binding.dependencies = ['missing_dependency']; }],
    ] as const) {
      const binding = geometryBinding('bound-owner');
      mutate(binding);
      const rejected = await rejectedOwnerPass(tag, { binding });
      expect(rejected.result.preflight_rejection?.error_codes).toContain('geometry_dependency_missing');
      expect(rejected.result.preflight_rejection?.next_operation_dispatched).toBe(false);
    }

    const f = fixture({ sceneGeometry: false });
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/e18c-durable-binding-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const validBinding = geometryBinding('bound-owner');
    const normalizedValidBinding = normalizeGeometryBinding(validBinding);
    const createRegion = regionAction('e18c-valid-create-region');
    createRegion.args.regions[0].layer_id = '$steps.e18c-valid-create-layer.details.layerId';
    const created = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'e18c-valid-create',
        problem_id: 'e18c-valid-create',
        document_id: 42,
        goal: 'Create the perspective-sensitive owner with one durable geometry binding.',
        stage: 'SHAPE',
        scale: 'global',
        scene_geometry_model: sceneGeometryModel('coherent_3d'),
        scene_ownership_plan: semanticSceneOwnershipPlan('e18c-durable-owners', ['bound-owner']),
        ...structuredMassContract('coherent 3D structural owner'),
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('bound-owner', 'create-new', {
          layerName: 'Bound Owner', constructionTier: 'primary', geometryBinding: validBinding,
          surfaceFrame: {
            axes: [{ id: 'depth', angle_degrees: -30, weight: 1 }],
            convergence_anchor: { x: 200, y: 90 },
            scene_vanishing_family_ids: ['fixture_depth_family'],
            scene_support_plane_id: 'fixture_support_plane',
            distribution: 'perspective-regular',
            local_exceptions: [],
          },
        }),
        actions: [
          { id: 'e18c-valid-create-layer', tool: 'photoshop_create_layer', args: { name: 'Bound Owner' } },
          createRegion,
        ],
      },
    }));
    expect(created.preflight_rejection).toBeUndefined();
    expect(created.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.runtime.store.semanticLayerOwners(42)).toEqual([
      expect.objectContaining({ hypothesis_id: 'bound-owner', layer_id: 9, geometry_binding: normalizedValidBinding }),
    ]);

    const status = await body(await f.status.handler({}));
    expect(status.documents['42'].logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'bound-owner', geometry_binding: normalizedValidBinding }),
    ]);
    const resumed = await body(await f.resume.handler({ document_id: 42 }));
    expect(resumed.document.logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'bound-owner', geometry_binding: normalizedValidBinding }),
    ]);

    const continuationRegion = regionAction('e18c-valid-continue-region');
    continuationRegion.args.regions[0].layer_id = 9;
    continuationRegion.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const continued = await body(await f.cycle.handler({
      previous_operation_id: 'e18c-valid-create',
      previous_observation: {
        observed: 'The bound owner is established against the accepted scene geometry revision.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'e18c-valid-continue',
        problem_id: 'e18c-valid-continue',
        document_id: 42,
        goal: 'Continue the same structural owner without restating its durable geometry binding.',
        stage: 'FORM',
        scale: 'medium',
        region: 'bound-owner',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 },
        action_class: 'REPLACE',
        ...structuredMassContract('coherent 3D structural owner'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('bound-owner', 'continue-logical-layer', {
          layerId: 9, layerName: 'Bound Owner', rollbackValue: 'low', constructionTier: 'primary',
        }),
        actions: [continuationRegion],
      },
    }));
    expect(continued.preflight_rejection).toBeUndefined();
    expect(continued.execution).toMatchObject({ phase: 'completed', failed: false });
    const continuedRecord = f.runtime.store.records().find((record: any) => record.id === 'e18c-valid-continue');
    expect(continuedRecord?.args?.logical_layer?.geometry_binding).toEqual(normalizedValidBinding);
    expect(f.runtime.store.semanticLayerOwners(42)[0]).toEqual(expect.objectContaining({ geometry_binding: normalizedValidBinding }));

    const replacement = geometryBinding('bound-owner');
    replacement.dependencies = ['fixture_scale_anchor'];
    const replacementRegion = regionAction('e18c-binding-replacement-region');
    replacementRegion.args.regions[0].layer_id = 9;
    replacementRegion.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const replacementAttempt = await body(await f.cycle.handler({
      previous_operation_id: 'e18c-valid-continue',
      previous_observation: {
        observed: 'The continuation preserved the same structural geometry dependency.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'e18c-silent-replacement',
        problem_id: 'e18c-silent-replacement',
        document_id: 42,
        goal: 'Attempt to silently replace the established owner geometry dependency.',
        stage: 'FORM',
        scale: 'medium',
        region: 'bound-owner',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 },
        action_class: 'REPLACE',
        ...structuredMassContract('coherent 3D structural owner'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('bound-owner', 'continue-logical-layer', {
          layerId: 9, layerName: 'Bound Owner', rollbackValue: 'low', constructionTier: 'primary',
          geometryBinding: replacement,
        }),
        actions: [replacementRegion],
      },
    }));
    expect(replacementAttempt.preflight_rejection?.error_codes).toContain('geometry_binding_owner_conflict');
    expect(replacementAttempt.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(f.runtime.store.semanticLayerOwners(42)[0]).toEqual(expect.objectContaining({ geometry_binding: normalizedValidBinding }));

    const flat = fixture({ sceneGeometry: false });
    await flat.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/e18c-flat-opt-out-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const flatRegion = regionAction('e18c-flat-owner-region');
    flatRegion.args.regions[0].layer_id = '$steps.e18c-flat-owner-layer.details.layerId';
    const flatOwner = await body(await flat.cycle.handler({
      next_pass: {
        request_key: 'e18c-flat-owner',
        problem_id: 'e18c-flat-owner',
        document_id: 42,
        goal: 'Create a committed owner under an explicit flat/collage scene-level geometry opt-out.',
        stage: 'SHAPE',
        scale: 'global',
        scene_geometry_model: sceneGeometryModel('flat_or_collage'),
        scene_ownership_plan: semanticSceneOwnershipPlan('e18c-flat-owners', ['flat-owner']),
        ...structuredMassContract('deliberately flat structural owner'),
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('flat-owner', 'create-new', {
          layerName: 'Flat Owner', constructionTier: 'primary',
        }),
        actions: [
          { id: 'e18c-flat-owner-layer', tool: 'photoshop_create_layer', args: { name: 'Flat Owner' } },
          flatRegion,
        ],
      },
    }));
    expect(flatOwner.preflight_rejection).toBeUndefined();
    expect(flatOwner.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(flat.runtime.store.semanticLayerOwners(42)[0]).not.toHaveProperty('geometry_binding');
  });

  it('binds focus/depth treatment to the exact current camera model and accepted owner geometry', async () => {
    const run = async (tag: string, cameraBinding: Record<string, unknown>, includeCameraModel = true) => {
      const f = fixture({ sceneGeometry: false });
      await f.setArtRun.handler({
        document_id: 42,
        process_dir: `processes/e20b-${tag}-process/run-01`,
        painting_profile: 'nontrivial_painting',
        commentary_mode: 'technical',
      });
      const layerStep = `${tag}-layer`;
      const region = regionAction(`${tag}-region`);
      region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
      const result = await body(await f.cycle.handler({
        next_pass: {
          request_key: `e20b-${tag}`,
          problem_id: `e20b-${tag}`,
          document_id: 42,
          goal: 'Bind depth-sensitive focus treatment to the active camera and accepted scene geometry.',
          stage: 'SHAPE',
          scale: 'global',
          scene_geometry_model: sceneGeometryModel('coherent_3d', 1),
          ...(includeCameraModel ? { scene_camera_imaging_model: sceneCameraModel(1, 1) } : {}),
          scene_ownership_plan: semanticSceneOwnershipPlan(`e20b-${tag}-owners`, ['focus-owner']),
          ...structuredMassContract('focus-bound structural owner'),
          layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
          logical_layer: semanticLogicalLayer('focus-owner', 'create-new', {
            layerName: 'Focus Owner',
            constructionTier: 'primary',
            geometryBinding: geometryBinding('focus-owner', 1),
            cameraBinding,
          }),
          actions: [
            { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Focus Owner' } },
            region,
          ],
        },
      }));
      return { f, result };
    };

    const validBinding = {
      scene_camera_model_id: 'compact-contract-camera',
      scene_camera_revision: 1,
      geometry_binding_owner_id: 'focus-owner',
      depth_role: 'focal',
      expected_focus_role: 'sharp',
    };
    const accepted = await run('accepted', validBinding);
    expect(accepted.result.preflight_rejection).toBeUndefined();
    expect(accepted.f.runtime.store.semanticLayerOwners(42)[0]).toMatchObject({
      hypothesis_id: 'focus-owner',
      camera_binding: validBinding,
    });

    const stale = await run('stale-camera', { ...validBinding, scene_camera_revision: 2 });
    expect(stale.result.preflight_rejection?.error_codes).toContain('camera_binding_stale');
    expect(stale.f.counts().regionCalls).toBe(0);

    const wrongGeometryOwner = await run('wrong-geometry-owner', { ...validBinding, geometry_binding_owner_id: 'other-owner' });
    expect(wrongGeometryOwner.result.preflight_rejection?.error_codes).toContain('camera_binding_geometry_owner_mismatch');
    expect(wrongGeometryOwner.f.counts().regionCalls).toBe(0);

    const missingCamera = await run('missing-camera', validBinding, false);
    expect(missingCamera.result.preflight_rejection?.error_codes).toContain('scene_camera_imaging_model_required');
    expect(missingCamera.f.counts().regionCalls).toBe(0);
  });

  it('requires E.20 imaging preflight before camera-post visual treatment', async () => {
    const run = async (tag: string, includePreflight: boolean) => {
      const f = fixture({ sceneGeometry: false });
      await f.setArtRun.handler({
        document_id: 42,
        process_dir: `processes/e20c-${tag}-process/run-01`,
        painting_profile: 'simple_graphic',
        commentary_mode: 'technical',
      });
      const layerStep = `${tag}-layer`;
      const result = await body(await f.cycle.handler({
        next_pass: {
          request_key: `e20c-${tag}`,
          problem_id: `e20c-${tag}`,
          document_id: 42,
          goal: 'Apply a bounded camera-post softness field only after explicit imaging preflight.',
          stage: 'FORM',
          scale: 'global',
          region: 'whole-canvas',
          scene_geometry_model: sceneGeometryModel('coherent_3d', 1),
          scene_camera_imaging_model: sceneCameraModel(1, 1),
          ...(includePreflight ? { imaging_preflight: {
            scene_camera_model_id: 'compact-contract-camera', scene_camera_revision: 1,
            effect_kind: 'camera-post',
            motivation: 'Apply one bounded optical treatment while preserving the declared depth/focus hierarchy.',
            scope: 'global', revalidate_edge_detail: true,
            owner_expectations: [{ owner_id: 'camera-post-owner', depth_role: 'focal', expected_focus_role: 'sharp' }],
          } } : {}),
          construction_role: 'continuous-field',
          material_role: 'camera post optical field',
          visual_intent: 'continuous-field',
          impact_class: 'transition',
          layer_separation_check: semanticLayerSeparation('new-plane', 'moderate', true),
          logical_layer: semanticLogicalLayer('camera-post-owner', 'create-new', {
            layerName: 'Camera Post', physicalRole: 'camera-post', opacityRole: 'effect-only',
          }),
          actions: [
            { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Camera Post' } },
            {
              id: `${tag}-gradient`, tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field',
              args: {
                layer_id: `$steps.${layerStep}.details.layerId`, from: { x: 0, y: 0 }, to: { x: 400, y: 300 },
                stops: [{ position: 0, red: 90, green: 90, blue: 90 }, { position: 1, red: 120, green: 120, blue: 120 }],
              },
            },
          ],
        },
      }));
      return { f, result };
    };

    const missing = await run('missing-preflight', false);
    expect(missing.result.preflight_rejection?.error_codes).toContain('imaging_preflight_required');
    expect(missing.f.counts().gradientCalls).toBe(0);

    const accepted = await run('with-preflight', true);
    expect(accepted.result.preflight_rejection).toBeUndefined();
    if (accepted.result.job_id) {
      for (let i = 0; i < 100; i += 1) {
        const polled = accepted.f.runtime.pollJob(String(accepted.result.job_id)) as any;
        if (['completed', 'failed', 'uncertain'].includes(String(polled.state))) break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    expect(accepted.f.counts().gradientCalls).toBe(1);
  });

  it('requires local attention-consuming passes to bind to the authorized Art Director perceptual zone', async () => {
    const run = async (tag: string, attentionBinding?: Record<string, unknown>) => {
      const f = fixture({ sceneGeometry: false });
      await f.setArtRun.handler({
        document_id: 42,
        process_dir: `processes/perceptual-${tag}-process/run-01`,
        painting_profile: 'simple_graphic',
        commentary_mode: 'technical',
      });
      f.runtime.store.updatePaintingState(42, current => ({
        ...current,
        art_director: {
          directive_id: 'attention-directive', revision: 1, status: 'active', goal: 'Preserve one clear primary focal zone.',
          current_task_id: 'hero-emphasis', review_due: false,
          perceptual_hierarchy: {
            protocol: 'photoshop.guard.perceptual_hierarchy.v1', revision: 1, mode: 'ranked',
            zones: [
              { id: 'hero-zone', owner_ids: ['hero-owner'], priority: 'primary', contrast_budget: 'high', detail_budget: 'high', edge_certainty: 'high', chroma_accent: 'allowed' },
              { id: 'support-zone', owner_ids: ['support-owner'], priority: 'support', contrast_budget: 'low', detail_budget: 'low', edge_certainty: 'low', chroma_accent: 'restricted' },
            ],
            ordering: ['hero-zone', 'support-zone'],
          },
          tasks: [{ task_id: 'hero-emphasis', status: 'active', allowed_scales: ['medium'], perceptual_zone_ids: ['hero-zone'] }],
        },
      }));
      const layerStep = `${tag}-layer`;
      const result = await body(await f.cycle.handler({ next_pass: {
        request_key: `perceptual-${tag}`, problem_id: `perceptual-${tag}`, document_id: 42,
        goal: 'Increase local focal contrast only inside the authorized primary attention zone.',
        stage: 'FORM', scale: 'medium', region: 'hero',
        construction_role: 'continuous-field', material_role: 'local focal value field', visual_intent: 'continuous-field', impact_class: 'transition',
        affected_qualities: ['local contrast', 'edge emphasis'],
        layer_separation_check: semanticLayerSeparation('new-plane', 'moderate', true),
        logical_layer: semanticLogicalLayer('hero-owner', 'create-new', { layerName: 'Hero Emphasis', ...(attentionBinding ? { attentionBinding } : {}) }),
        actions: [
          { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Hero Emphasis' } },
          { id: `${tag}-gradient`, tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field', args: {
            layer_id: `$steps.${layerStep}.details.layerId`, from: { x: 0, y: 0 }, to: { x: 300, y: 200 },
            stops: [{ position: 0, red: 60, green: 60, blue: 60 }, { position: 1, red: 120, green: 120, blue: 120 }],
          } },
        ],
      }}));
      return { f, result };
    };

    const missing = await run('missing');
    expect(missing.result.preflight_rejection?.error_codes).toContain('attention_binding_required');
    expect(missing.f.counts().gradientCalls).toBe(0);

    const wrongZone = await run('wrong-zone', { hierarchy_revision: 1, zone_id: 'support-zone', dimensions: ['contrast', 'edge'] });
    expect(wrongZone.result.preflight_rejection?.error_codes).toContain('attention_binding_zone_owner_mismatch');
    expect(wrongZone.result.preflight_rejection?.error_codes).toContain('attention_binding_task_zone_not_authorized');

    const accepted = await run('accepted', { hierarchy_revision: 1, zone_id: 'hero-zone', dimensions: ['contrast', 'edge'] });
    expect(accepted.result.preflight_rejection).toBeUndefined();
    if (accepted.result.job_id) {
      for (let i = 0; i < 100; i += 1) {
        const polled = accepted.f.runtime.pollJob(String(accepted.result.job_id)) as any;
        if (['completed', 'failed', 'uncertain'].includes(String(polled.state))) break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    expect(accepted.f.counts().gradientCalls).toBe(1);
  });

  it('runs mandatory quantitative Geometry Preflight before coherent-3D Photoshop dispatch', async () => {
    const runOwner = async (tag: string, binding: Record<string, unknown>) => {
      const f = fixture({ sceneGeometry: false });
      await f.setArtRun.handler({
        document_id: 42,
        process_dir: `processes/e18d-${tag}-process/run-01`,
        painting_profile: 'nontrivial_painting',
        commentary_mode: 'technical',
      });
      const layerStep = `e18d-${tag}-layer`;
      const region = regionAction(`e18d-${tag}-region`);
      region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
      const result = await body(await f.cycle.handler({
        next_pass: {
          request_key: `e18d-${tag}`,
          problem_id: `e18d-${tag}`,
          document_id: 42,
          goal: 'Construct one perspective-sensitive owner only after deterministic geometry preflight.',
          stage: 'SHAPE',
          scale: 'global',
          scene_geometry_model: sceneGeometryModel('coherent_3d'),
          scene_ownership_plan: semanticSceneOwnershipPlan(`e18d-${tag}-owners`, ['preflight-owner']),
          ...structuredMassContract('perspective-sensitive structural owner'),
          layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
          logical_layer: semanticLogicalLayer('preflight-owner', 'create-new', {
            layerName: 'Preflight Owner', constructionTier: 'primary', geometryBinding: binding,
          }),
          actions: [
            { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Preflight Owner' } },
            region,
          ],
        },
      }));
      return { f, result };
    };

    const projectionBinding = geometryBinding('preflight-owner');
    projectionBinding.anchors = {
      near_contact: { x: 100, y: 240 },
      far_extent: { x: 180, y: 120 },
      centerline: { line: [{ x: 100, y: 240 }, { x: 180, y: 240 }] },
    };
    const projectionConflict = await runOwner('projection-conflict', projectionBinding);
    expect(projectionConflict.result.preflight_rejection?.error_codes).toContain('projection_family_conflict');
    expect(projectionConflict.result.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(projectionConflict.f.counts().regionCalls).toBe(0);

    const supportBinding = geometryBinding('preflight-owner');
    supportBinding.anchors = {
      near_contact: { x: 300, y: 240 },
      far_extent: { x: 180, y: 120 },
      centerline: { line: [{ x: 300, y: 240 }, { x: 180, y: 120 }] },
    };
    const supportConflict = await runOwner('support-conflict', supportBinding);
    expect(supportConflict.result.preflight_rejection?.error_codes).toContain('support_contact_conflict');
    expect(supportConflict.result.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(supportConflict.f.counts().regionCalls).toBe(0);

    const insufficientBinding = geometryBinding('preflight-owner');
    insufficientBinding.control_sections = [];
    const insufficient = await runOwner('insufficient-sections', insufficientBinding);
    expect(insufficient.result.preflight_rejection?.error_codes).toContain('geometry_preflight_insufficient');
    expect(insufficient.result.preflight_rejection?.next_operation_dispatched).toBe(false);
    expect(insufficient.f.counts().regionCalls).toBe(0);

    const accepted = await runOwner('accepted', geometryBinding('preflight-owner'));
    expect(accepted.result.preflight_rejection).toBeUndefined();
    expect(accepted.result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(accepted.f.counts().regionCalls).toBe(1);
    const record = accepted.f.runtime.store.records().find((item: any) => item.id === 'e18d-accepted');
    expect(record?.geometry_preflight).toMatchObject({
      protocol: 'photoshop.guard.geometry_preflight.v1',
      owner_id: 'preflight-owner',
      scene_geometry_model_id: 'compact-contract-scene',
      scene_geometry_revision: 1,
      support_plane_id: 'fixture_support_plane',
      vanishing_family_ids: ['fixture_depth_family'],
      uncertainty_acceptable: true,
    });
    expect(record?.geometry_preflight?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'projection-family', status: 'pass' }),
      expect.objectContaining({ kind: 'support-contact', status: 'pass' }),
    ]));
    const status = await body(await accepted.f.status.handler({}));
    expect(status.documents['42'].geometry_preflight).toMatchObject({
      protocol: 'photoshop.guard.geometry_preflight.v1',
      owner_id: 'preflight-owner',
      source_operation_id: 'e18d-accepted',
    });
    const resumed = await body(await accepted.f.resume.handler({ document_id: 42 }));
    expect(resumed.document.geometry_preflight).toMatchObject({
      protocol: 'photoshop.guard.geometry_preflight.v1',
      owner_id: 'preflight-owner',
      source_operation_id: 'e18d-accepted',
    });
  });

  it('requires scene geometry for committed spatial owners even when the paint mechanism is not structured-mass', async () => {
    const f = fixture({ sceneGeometry: false });
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/spatial-owner-geometry-gate-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const layerStep = 'spatial-owner-layer';
    const result = await body(await f.cycle.handler({ next_pass: {
      request_key: 'spatial-owner-without-scene-geometry',
      problem_id: 'spatial-owner-without-scene-geometry',
      document_id: 42,
      goal: 'Construct one committed opaque spatial plane using a continuous field.',
      stage: 'SHAPE',
      scale: 'global',
      construction_role: 'continuous-field',
      material_role: 'opaque architectural plane',
      visual_intent: 'continuous-field',
      impact_class: 'construct',
      scene_ownership_plan: semanticSceneOwnershipPlan('spatial-owner-plan', ['spatial-owner']),
      layer_separation_check: semanticLayerSeparation('new-plane', 'moderate', true),
      logical_layer: semanticLogicalLayer('spatial-owner', 'create-new', {
        layerName: 'Spatial Owner', physicalRole: 'opaque-mass', opacityRole: 'opaque', constructionTier: 'primary',
      }),
      actions: [
        { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Spatial Owner' } },
        { id: 'spatial-owner-gradient', tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field', args: {
          layer_id: `$steps.${layerStep}.details.layerId`, from: { x: 0, y: 0 }, to: { x: 400, y: 300 },
          stops: [{ position: 0, red: 40, green: 40, blue: 50 }, { position: 1, red: 80, green: 80, blue: 90 }],
        } },
      ],
    }}));
    expect(result.preflight_rejection?.error_codes).toContain('scene_geometry_model_required');
    expect(f.counts().gradientCalls).toBe(0);
  });

  it('requires coherent perspective spatial owners to bind geometry and rejects fake two-point basis coverage', async () => {
    const f = fixture({ sceneGeometry: false });
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/perspective-basis-gate-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const model = sceneGeometryModel('coherent_3d') as any;
    model.projection.kind = 'two_point';
    model.projection.vanishing_points = [
      { id: 'vp-left', x: -300, y: 90, evidence: 'proposed', derived_from: [] },
      { id: 'vp-right', x: 700, y: 90, evidence: 'proposed', derived_from: [] },
    ];
    model.line_families = [
      { id: 'family-a', vanishing_point_id: 'vp-left', members: [{ id: 'a1', points: [{ x: 20, y: 280 }, { x: -300, y: 90 }] }] },
      { id: 'family-b', vanishing_point_id: 'vp-left', members: [{ id: 'b1', points: [{ x: 120, y: 280 }, { x: -300, y: 90 }] }] },
    ];
    model.support_planes = [];
    model.scale_anchors = [];
    const layerStep = 'perspective-owner-layer';
    const result = await body(await f.cycle.handler({ next_pass: {
      request_key: 'perspective-owner-invalid-basis',
      problem_id: 'perspective-owner-invalid-basis',
      document_id: 42,
      goal: 'Construct a committed opaque perspective plane only from a valid two-point basis.',
      stage: 'SHAPE', scale: 'global',
      scene_geometry_model: model,
      construction_role: 'continuous-field', material_role: 'opaque perspective plane',
      visual_intent: 'continuous-field', impact_class: 'construct',
      scene_ownership_plan: semanticSceneOwnershipPlan('perspective-owner-plan', ['perspective-owner']),
      layer_separation_check: semanticLayerSeparation('new-plane', 'moderate', true),
      logical_layer: semanticLogicalLayer('perspective-owner', 'create-new', {
        layerName: 'Perspective Owner', physicalRole: 'opaque-mass', opacityRole: 'opaque', constructionTier: 'primary',
      }),
      actions: [
        { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Perspective Owner' } },
        { id: 'perspective-owner-gradient', tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field', args: {
          layer_id: `$steps.${layerStep}.details.layerId`, from: { x: 0, y: 0 }, to: { x: 400, y: 300 },
          stops: [{ position: 0, red: 30, green: 30, blue: 40 }, { position: 1, red: 70, green: 70, blue: 80 }],
        } },
      ],
    }}));
    expect(result.preflight_rejection?.error_codes).toContain('perspective_basis_required');
    expect(result.preflight_rejection?.error_codes).toContain('geometry_binding_required');
    expect(f.counts().gradientCalls).toBe(0);
  });

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
        ...structuredMassContract('initial broad form-bearing mass'),
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

  it('requires construction classification before broad nontrivial region execution', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/broad-region-role-required-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const missingRole = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'broad-region-missing-role',
        problem_id: 'broad-region-missing-role',
        document_id: 42,
        goal: 'Establish one broad representational mass.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'whole-canvas',
        actions: [regionAction('broad-region-missing-role')],
      },
    }));
    expect(missingRole.preflight_rejection?.error_codes).toContain('broad_region_construction_role_required');
    expect(f.counts().regionCalls).toBe(0);
  });

  it('does not let a continuous field silently downgrade to region block-in', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/continuous-field-region-bypass-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const result = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'continuous-field-region-bypass',
        problem_id: 'continuous-field-region-bypass',
        document_id: 42,
        goal: 'Establish a continuous low-frequency tonal field.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'whole-canvas',
        construction_role: 'continuous-field',
        material_role: 'broad tonal field',
        visual_intent: 'continuous-field',
        impact_class: 'construct',
        actions: [regionAction('continuous-field-region-bypass')],
      },
    }));
    expect(result.preflight_rejection?.error_codes).toContain('artistic_method_execution_mismatch');
    expect(f.counts().regionCalls).toBe(0);
  });

  it('rejects an icon-like compound while preserving an irregular structured-mass block-in', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/structured-mass-icon-guard-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const iconic = regionAction('iconic-compound');
    iconic.args.regions = [
      {
        id: 'primary-box',
        color: { red: 120, green: 90, blue: 60 },
        contours: [{ points: [{ x: 20, y: 40 }, { x: 140, y: 40 }, { x: 140, y: 140 }, { x: 20, y: 140 }] }],
        layer_id: 7,
      },
      {
        id: 'canonical-cap',
        color: { red: 90, green: 70, blue: 55 },
        contours: [{ points: [{ x: 10, y: 40 }, { x: 80, y: 10 }, { x: 150, y: 40 }] }],
        layer_id: 7,
      },
    ];
    const rejected = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'structured-mass-iconic-compound',
        problem_id: 'structured-mass-iconic-compound',
        document_id: 42,
        goal: 'Construct one representational form from broad closed masses.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'subject',
        ...structuredMassContract('form-bearing subject mass'),
        actions: [iconic],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('structured_mass_iconic_primitive_compound');
    expect(f.counts().regionCalls).toBe(0);

    const irregular = regionAction('irregular-structured-mass');
    irregular.args.regions[0].contours = [{ points: [
      { x: 20, y: 50 }, { x: 55, y: 25 }, { x: 105, y: 30 },
      { x: 145, y: 65 }, { x: 130, y: 135 }, { x: 45, y: 145 },
    ] }];
    const accepted = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'structured-mass-irregular',
        problem_id: 'structured-mass-irregular',
        document_id: 42,
        goal: 'Construct one characteristic asymmetric broad mass.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        region: 'subject',
        ...structuredMassContract('form-bearing subject mass'),
        actions: [irregular],
      },
    }));
    expect(accepted.preflight_rejection).toBeUndefined();
    expect(accepted.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.counts().regionCalls).toBe(1);
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

  it('derives an unambiguous continuous-field construction role and keeps mandatory AFTER preview', async () => {
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
    expect(missingRole.preflight_rejection).toBeUndefined();
    let derivedCompleted = missingRole;
    if (missingRole.job_id) {
      for (let i = 0; i < 100; i += 1) {
        const polled = f.runtime.pollJob(String(missingRole.job_id)) as any;
        if (['completed', 'failed', 'uncertain'].includes(String(polled.state))) {
          derivedCompleted = polled.result;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    expect(derivedCompleted.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.counts().gradientCalls).toBe(1);
    expect(f.runtime.store.read('continuous-field-missing-role')?.args).toMatchObject({
      paint_strategy: {
        construction_role: 'continuous-field',
        material_role: 'broad background value field',
        visual_intent: 'continuous-field',
      },
    });

    expect(f.counts().gradientCalls).toBe(1);
    expect(f.counts().previewCalls).toBeGreaterThanOrEqual(1);
    expect(f.runtime.store.read('continuous-field-missing-role')?.args).toMatchObject({
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
    expect(missingMaterial.preflight_rejection?.error_codes).not.toContain('brush_material_role_required');
    expect(missingMaterial.preflight_rejection?.error_codes).toContain('brush_preset_choice_required');

    const ambiguousMaterialPreflight = materialBrushPreflight({ ambiguous: true });
    ambiguousMaterialPreflight.roles[1].material_roles = ['skin'];
    const ambiguousMaterial = fixture();
    await ambiguousMaterial.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/material-ambiguous-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
      brush_preflight: ambiguousMaterialPreflight,
    });
    const missingAmbiguousMaterial = await body(await ambiguousMaterial.cycle.handler({
      next_pass: {
        request_key: 'material-ambiguous-missing-role',
        problem_id: 'material-ambiguous',
        document_id: 42,
        goal: 'Develop directional surface material where the inventory supports distinct materials.',
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'subject',
        visual_intent: 'directional-mass',
        impact_class: 'construct',
        actions: [strokeAction('material-ambiguous-stroke')],
      },
    }));
    expect(missingAmbiguousMaterial.preflight_rejection?.error_codes).toContain('brush_material_role_required');

    const stickyDefault = await body(await f.cycle.handler({
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
    expect(stickyDefault.preflight_rejection?.error_codes).toContain('brush_preset_choice_required');

    const unexplainedChoice = await f.runtime.lintNextPass({
        request_key: 'fur-material-fit-unexplained',
        problem_id: 'fur-material-fit-unexplained',
        document_id: 42,
        goal: 'Try to select a familiar fur preset without explaining its evidence fit.',
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'rabbit',
        material_role: 'fur',
        visual_intent: 'directional-mass',
        impact_class: 'construct',
        actions: [
          { id: 'choose-fur-unexplained', tool: 'photoshop_select_brush_preset', args: { name: 'Fur Bristle' } },
          strokeAction('fur-stroke-unexplained'),
        ],
    });
    expect(unexplainedChoice.error_codes).not.toContain('brush_preset_choice_reason_required');

    const valid = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'fur-material-fit-explicit',
        problem_id: 'fur-material-fit-explicit',
        document_id: 42,
        goal: 'Develop the rabbit fur with the explicitly selected evidence-fit alternative mark.',
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'rabbit',
        material_role: 'fur',
        brush_preset_choice_reason: 'Dry Fur provides the more broken directional footprint needed for fur breakup at this scale.',
        visual_intent: 'directional-mass',
        impact_class: 'construct',
        actions: [
          { id: 'choose-dry-fur', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Fur' } },
          strokeAction('fur-stroke-fit-explicit'),
        ],
      },
    }));
    expect(valid.preflight_rejection).toBeUndefined();
    expect(valid.execution).toMatchObject({ phase: 'completed', failed: false });
    const record = f.runtime.store.read('fur-material-fit-explicit')!;
    expect(record.args.paint_strategy).toMatchObject({
      material_role: 'fur',
      visual_intent: 'directional-mass',
      brush_role: 'fur-breakup',
      preset_name: 'Dry Fur',
      selection_reason: 'Dry Fur provides the more broken directional footprint needed for fur breakup at this scale.',
    });

    // A failed/rolled-back mark remains observed history, but E.7c does not require prose
    // certification before a safe explicit retry. The executable preset choice still cannot be implicit.
    f.runtime.store.write({ ...record, rolled_back: true });
    const stickyRetry = await f.runtime.lintNextPass({
      request_key: 'fur-material-retry-same-preset',
      problem_id: 'fur-material-fit-explicit',
      document_id: 42,
      goal: 'Retry the same dry mark after rollback.',
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      region: 'rabbit',
      material_role: 'fur',
      brush_preset_choice_reason: 'Dry Fur still matches the requested broken directional footprint.',
      visual_intent: 'directional-mass',
      impact_class: 'construct',
      actions: [
        { id: 'choose-dry-fur-retry', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Fur' } },
        strokeAction('fur-stroke-retry'),
      ],
    });
    expect(stickyRetry.error_codes).not.toContain('brush_failed_preset_retry_reason_required');

    const crossProblemStickyRetry = await f.runtime.lintNextPass({
      request_key: 'fur-material-cross-problem-retry',
      problem_id: 'fur-material-new-area',
      document_id: 42,
      goal: 'Use the same dry mark on a different fur problem after its recent rollback.',
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      region: 'rabbit-neck',
      material_role: 'fur',
      brush_preset_choice_reason: 'Dry Fur has the broken directional footprint requested for this fur area.',
      visual_intent: 'directional-mass',
      impact_class: 'construct',
      actions: [
        { id: 'choose-dry-fur-cross-problem', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Fur' } },
        strokeAction('fur-stroke-cross-problem'),
      ],
    });
    expect(crossProblemStickyRetry.error_codes).not.toContain('brush_recent_material_failure_reason_required');

    const justifiedRetry = await f.runtime.lintNextPass({
      request_key: 'fur-material-retry-same-preset-justified',
      problem_id: 'fur-material-fit-explicit',
      document_id: 42,
      goal: 'Retry the same dry mark because the rollback cause was spatial targeting, not mark fit.',
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      region: 'rabbit',
      material_role: 'fur',
      brush_preset_choice_reason: 'Dry Fur still matches the requested broken directional footprint.',
      brush_retry_reason: 'The prior rollback corrected misplaced stroke targeting; the dry broken footprint itself remains the required mark.',
      visual_intent: 'directional-mass',
      impact_class: 'construct',
      actions: [
        { id: 'choose-dry-fur-retry-justified', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Fur' } },
        strokeAction('fur-stroke-retry-justified'),
      ],
    });
    expect(justifiedRetry.error_codes).not.toContain('brush_failed_preset_retry_reason_required');
  });

  it('binds pressure policy to the selected brush candidate and requires executable simulated dynamics', async () => {
    const f = fixture({ brushInventory: true });
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/candidate-pressure-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
      brush_preflight: materialBrushPreflight({ candidateDynamics: true }),
    });

    const basePass = {
      problem_id: 'fur-pressure-candidate',
      document_id: 42,
      goal: 'Use the dry broken candidate with its probed simulated-size response.',
      stage: 'FORM_AND_LIGHT',
      scale: 'medium',
      region: 'rabbit',
      material_role: 'fur',
      brush_preset_choice_reason: 'Dry Fur provides the granular broken footprint and simulated taper required for this pass.',
      visual_intent: 'directional-mass',
      impact_class: 'construct',
    };
    const missingDynamics = await f.runtime.lintNextPass({
      ...basePass,
      request_key: 'fur-pressure-candidate-missing',
      actions: [
        { id: 'choose-dry-pressure', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Fur' } },
        strokeAction('dry-pressure-missing'),
      ],
    });
    expect(missingDynamics.error_codes).toContain('invalid_visual_microplan');

    const dynamicStroke = strokeAction('dry-pressure-valid') as Record<string, any>;
    dynamicStroke.args.strokes[0].dynamics = { size: [8, 20] };
    const accepted = await body(await f.cycle.handler({
      next_pass: {
        ...basePass,
        request_key: 'fur-pressure-candidate-valid',
        actions: [
          { id: 'choose-dry-pressure-valid', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Fur' } },
          dynamicStroke,
        ],
      },
    }));
    expect(accepted.preflight_rejection).toBeUndefined();
    expect(accepted.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.runtime.store.read('fur-pressure-candidate-valid')?.args.paint_strategy).toMatchObject({
      preset_name: 'Dry Fur',
      pressure_policy: 'simulated-size',
    });
  });

  it('classifies a validated installed-brush method by semantic method id rather than stroke transport', async () => {
    const f = fixture({ brushInventory: true });
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/preset-method-class-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
      brush_preflight: materialBrushPreflight(),
    });

    const action = strokeAction('preset-method-stroke') as Record<string, unknown>;
    action.method_id = 'installed-brush-preset';
    const accepted = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'preset-method-semantic-class',
        problem_id: 'fur-preset-method',
        document_id: 42,
        goal: 'Use the preflighted installed bristle preset as a causally distinct material method.',
        stage: 'FORM_AND_LIGHT',
        scale: 'medium',
        region: 'rabbit',
        material_role: 'fur',
        brush_preset_choice_reason: 'Fur Bristle provides the directional bristle buildup required for this form-bearing fur pass.',
        visual_intent: 'directional-mass',
        impact_class: 'construct',
        preferred_method_id: 'installed-brush-preset',
        actions: [
          { id: 'choose-fur-bristle', tool: 'photoshop_select_brush_preset', args: { name: 'Fur Bristle' } },
          action,
        ],
      },
    }));

    expect(accepted.preflight_rejection).toBeUndefined();
    expect(accepted.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.runtime.store.read('preset-method-semantic-class')?.args).toMatchObject({
      method_class: 'preset-brush',
      paint_strategy: {
        material_role: 'fur',
        visual_intent: 'directional-mass',
        brush_role: 'fur-breakup',
        preset_name: 'Fur Bristle',
        selection_reason: 'Fur Bristle provides the directional bristle buildup required for this form-bearing fur pass.',
      },
      steps: expect.arrayContaining([
        expect.objectContaining({ tool: 'photoshop_paint_strokes', method_id: 'installed-brush-preset' }),
      ]),
    });
  });

  it('rejects a known semantic method id attached to an incompatible mutation tool', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/method-tool-mismatch-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const action = strokeAction('lying-region-method') as Record<string, unknown>;
    action.method_id = 'region-block-in';
    const rejected = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'known-method-tool-mismatch',
        problem_id: 'known-method-tool-mismatch',
        document_id: 42,
        goal: 'Do not allow relabeling a brush stroke as a region method.',
        stage: 'FORM',
        scale: 'medium',
        region: 'subject',
        actions: [action],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('step_method_tool_mismatch');
    expect(f.counts().strokeCalls).toBe(0);
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

  it('rejects a MATERIAL lighting/color binding when no active scene model can prove it', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/material-light-binding-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    const material = compactMaterialResponse() as Record<string, unknown>;
    material.lighting_color_binding = {
      scene_model_id: 'station-light-color-01',
      scene_model_revision: 1,
      base_color_family: 'muted_green',
      receives: ['twilight'],
      reflection_sources: [],
      color_relations: ['cool_environment_dominates'],
    };
    const rejected = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'material-light-binding-without-scene',
        problem_id: 'material-light-binding-without-scene',
        document_id: 42,
        goal: 'Bind the material response only to an evidenced active lighting model.',
        stage: 'MATERIAL',
        scale: 'medium',
        region: 'surface',
        material_response: material,
        actions: [strokeAction('material-light-binding-stroke')],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('material_lighting_color_scene_model_missing');
    expect(f.counts().strokeCalls).toBe(0);
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

  it('treats a backward stage label as guidance while preserving explicit durable structural reset', async () => {
    const blocked = fixture();
    const stageResetSchema = (blocked.cycle.tool.inputSchema as any)?.properties?.next_pass?.properties?.stage_reset;
    const layerSeparationSchema = (blocked.cycle.tool.inputSchema as any)?.properties?.next_pass?.properties?.layer_separation_check;
    expect(stageResetSchema?.required).toEqual(['reason']);
    expect(stageResetSchema?.properties?.detail?.minLength).toBeUndefined();
    expect(layerSeparationSchema?.required).toEqual([
      'change_kind', 'substantial', 'rollback_value', 'independent_adjustment_expected',
    ]);
    expect(layerSeparationSchema?.properties?.reasons?.minItems).toBeUndefined();
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
        actions: [strokeAction('fake-back-stroke')],
      },
    }));
    expect(rejected.preflight_rejection).toBeUndefined();
    expect(rejected.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(blocked.counts().strokeCalls).toBe(1);
    expect(blocked.runtime.store.paintingState().documents['42'].current_stage).toBe('DETAIL');

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
    expect(state.last_stage_reset.detail).toBeUndefined();
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

  it('does not let a direct visual stage label downgrade durable stage and keeps priority current_stage non-authoritative', async () => {
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
        actions: [strokeAction('direct-stage-stroke')],
      },
    }));
    expect(result.preflight_rejection).toBeUndefined();
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(f.runtime.store.paintingState().documents['42'].current_stage).toBe('DETAIL');

    expect(() => f.runtime.store.setPriorityState({
      document_id: 42,
      current_stage: 'GLOBAL_BLOCK_IN',
      problems: [],
    })).toThrow(/priority_state_stage_non_authoritative/);
    expect(f.runtime.store.paintingState().documents['42'].current_stage).toBe('DETAIL');
  });

  it('requires a durable scene ownership plan before the first committed nontrivial owner and rejects reactive owner invention', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/scene-ownership-plan-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });

    const directLayer = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'e1-direct-layer',
        document_id: 42,
        goal: 'Try to create a persistent paint layer without atomic semantic ownership.',
        actions: [{ id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Bypass' } }],
      },
    }));
    expect(directLayer.preflight_rejection?.error_codes).toContain('semantic_owner_create_requires_visual_microplan');

    const ownerPass = (
      requestKey: string,
      ownerId: string,
      previousOperationId?: string,
      scenePlan?: Record<string, unknown>
    ) => {
      const layerStep = `${requestKey}-layer`;
      const region = regionAction(`${requestKey}-region`);
      region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
      return f.cycle.handler({
        ...(previousOperationId ? {
          previous_operation_id: previousOperationId,
          previous_observation: {
            observed: 'The preceding planned semantic owner is established.',
            target: 'resolved',
          },
        } : {}),
        next_pass: {
          request_key: requestKey,
          problem_id: requestKey,
          document_id: 42,
          goal: `Establish planned semantic owner ${ownerId}.`,
          stage: 'SHAPE',
          scale: 'global',
          ...(scenePlan ? { scene_ownership_plan: scenePlan } : {}),
          ...structuredMassContract(`${ownerId} structural mass`),
          layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
          logical_layer: semanticLogicalLayer(ownerId, 'create-new', { layerName: ownerId }),
          actions: [
            { id: layerStep, tool: 'photoshop_create_layer', args: { name: ownerId } },
            region,
          ],
        },
      });
    };

    const missing = await body(await ownerPass('e1-missing-plan', 'hero'));
    expect(missing.preflight_rejection?.error_codes).toContain('scene_ownership_plan_required');
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual([]);

    const invalidSharedPlan = semanticSceneOwnershipPlan('invalid-shared-scene', [
      { semanticId: 'left-house', ownerId: 'village', editability: 'shared-owner' },
      { semanticId: 'right-house', ownerId: 'village', editability: 'shared-owner' },
    ]);
    const invalid = await body(await ownerPass('e1-invalid-sharing', 'village', undefined, invalidSharedPlan));
    expect(invalid.preflight_rejection?.error_codes).toContain('scene_ownership_plan_invalid');
    expect(invalid.preflight_rejection?.compact_correction_recipe).toMatchObject({
      repeat_same_semantic_cycle: true,
      photoshop_mutation_started: false,
      correction_mode: 'payload-only-first',
      repository_or_schema_investigation: 'defer-until-corrected-resubmit-repeats-or-systemic-defect-is-explicit',
    });
    expect(invalid.preflight_rejection?.next_required_action).toMatch(
      /artistic or structural decision.*not recovery.*no Photoshop mutation was dispatched.*no fresh state\/preview read/i
    );

    const scenePlan = semanticSceneOwnershipPlan('homestead-scene-owners', [
      { semanticId: 'hero-tree', ownerId: 'hero-tree', role: 'Hero organic form' },
      { semanticId: 'architecture', ownerId: 'architecture', role: 'Main architecture' },
      { semanticId: 'distant-terrain', ownerId: 'distant-terrain', role: 'Distant terrain plane' },
      { semanticId: 'ground', ownerId: 'ground', role: 'Foreground ground plane' },
      { semanticId: 'sky', ownerId: 'sky-field', role: 'Continuous sky field', editability: 'continuous-field' },
      { semanticId: 'left-house', ownerId: 'village', role: 'Left distant house', editability: 'shared-owner' },
      { semanticId: 'right-house', ownerId: 'village', role: 'Right distant house', editability: 'shared-owner' },
    ], [{
      ownerId: 'village',
      semanticIds: ['left-house', 'right-house'],
      rationale: 'The two distant houses intentionally share correction and rollback as one low-detail village mass.',
    }]);

    const hero = await body(await ownerPass('e1-hero-create', 'hero-tree', undefined, scenePlan));
    expect(hero.preflight_rejection).toBeUndefined();
    expect(hero.execution).toMatchObject({ phase: 'completed', failed: false });

    const durablePlan = f.runtime.store.statusCompact().documents['42'].scene_ownership_plan;
    expect(durablePlan).toMatchObject({
      protocol: 'photoshop.guard.scene_ownership_plan.v1',
      plan_id: 'homestead-scene-owners',
      source_operation_id: 'e1-hero-create',
    });
    expect(durablePlan.units).toEqual(expect.arrayContaining([
      expect.objectContaining({ semantic_id: 'sky', owner_id: 'sky-field', editability: 'continuous-field' }),
      expect.objectContaining({ semantic_id: 'left-house', owner_id: 'village', editability: 'shared-owner' }),
      expect.objectContaining({ semantic_id: 'right-house', owner_id: 'village', editability: 'shared-owner' }),
    ]));

    const village = await body(await ownerPass('e1-village-create', 'village', 'e1-hero-create'));
    expect(village.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual(expect.arrayContaining([
      expect.objectContaining({ hypothesis_id: 'hero-tree', temporary: false }),
      expect.objectContaining({ hypothesis_id: 'village', temporary: false }),
    ]));

    const reactive = await body(await ownerPass('e1-reactive-extra', 'reactive-extra', 'e1-village-create'));
    expect(reactive.preflight_rejection?.error_codes).toContain('scene_ownership_owner_unplanned');
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
        scene_ownership_plan: semanticSceneOwnershipPlan('animal-scene-owners', ['cat', 'rabbit']),
        ...structuredMassContract('character structural mass'),
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
    const continuedRecord = f.runtime.store.records().find((record: any) => record.id === 'cat-owner-form-attempt-02');
    expect(continuedRecord?.correction_scope).toEqual(expect.objectContaining({
      problem_id: 'cat-owner-form',
      semantic_owner_ids: ['cat'],
      physical_layer_ids: [9],
      region: 'cat',
      method_class: 'region',
      mutation_tools: ['photoshop_paint_regions'],
      owner_binding: 'durable',
    }));

    const mismatchedAction = regionAction('cat-declared-owner-wrong-action-layer');
    mismatchedAction.args.regions[0].layer_id = 77;
    mismatchedAction.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const mismatchedTarget = await body(await f.cycle.handler({
      previous_operation_id: 'cat-owner-form-attempt-02',
      previous_observation: {
        observed: 'The cat form refinement is retained on the same semantic owner.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'cat-owner-action-target-mismatch',
        problem_id: 'cat-owner-form',
        document_id: 42,
        goal: 'Attempt a medium correction whose concrete action silently targets another physical layer.',
        stage: 'FORM',
        scale: 'medium',
        region: 'cat',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 },
        action_class: 'REPLACE',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('cat', 'continue-logical-layer', { layerId: 9, layerName: 'Cat', rollbackValue: 'low' }),
        actions: [mismatchedAction],
      },
    }));
    expect(mismatchedTarget.preflight_rejection?.error_codes).toContain('semantic_mutation_target_owner_mismatch');

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

  it('rejects a tree-only correction aimed at a different shared scene owner', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42, process_dir: 'processes/homestead-owner-process/run-01',
      painting_profile: 'nontrivial_painting', commentary_mode: 'technical',
    });
    const plan = semanticSceneOwnershipPlan('homestead-owners', [
      { semanticId: 'hills', ownerId: 'hills-houses', editability: 'shared-owner' },
      { semanticId: 'houses', ownerId: 'hills-houses', editability: 'shared-owner' },
      'tree',
    ], [{ ownerId: 'hills-houses', semanticIds: ['hills', 'houses'] }]);
    const sharedAction = regionAction('shared-region');
    sharedAction.args.regions[0].layer_id = '$steps.shared-layer.details.layerId';
    const shared = await body(await f.cycle.handler({ next_pass: {
      request_key: 'shared-create', problem_id: 'shared-owner', document_id: 42,
      goal: 'Create the coupled distant owner.', stage: 'SHAPE', scale: 'global',
      scene_ownership_plan: plan, ...structuredMassContract('distant shared mass'),
      layer_separation_check: semanticLayerSeparation('new-object', 'moderate', false),
      logical_layer: semanticLogicalLayer('hills-houses', 'create-new', { layerName: 'Hills Houses' }),
      actions: [{ id: 'shared-layer', tool: 'photoshop_create_layer', args: { name: 'Hills Houses' } }, sharedAction],
    }}));
    expect(shared.preflight_rejection).toBeUndefined();

    const treeAction = regionAction('tree-region');
    treeAction.args.regions[0].layer_id = '$steps.tree-layer.details.layerId';
    const tree = await body(await f.cycle.handler({
      previous_operation_id: 'shared-create',
      previous_observation: { observed: 'Shared owner retained.', target: 'resolved' },
      next_pass: {
        request_key: 'tree-create', problem_id: 'tree-owner', document_id: 42,
        goal: 'Create the independent tree owner.', stage: 'SHAPE', scale: 'global',
        ...structuredMassContract('tree mass'),
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('tree', 'create-new', { layerName: 'Tree' }),
        actions: [{ id: 'tree-layer', tool: 'photoshop_create_layer', args: { name: 'Tree' } }, treeAction],
      },
    }));
    expect(tree.preflight_rejection).toBeUndefined();

    const wrongTarget = regionAction('tree-on-shared');
    wrongTarget.args.regions[0].layer_id = 9;
    wrongTarget.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const rejected = await body(await f.cycle.handler({
      previous_operation_id: 'tree-create',
      previous_observation: { observed: 'Tree owner retained.', target: 'resolved' },
      next_pass: {
        request_key: 'tree-wrong-target', problem_id: 'tree-correction', document_id: 42,
        goal: 'Correct only the tree.', stage: 'FORM', scale: 'medium', region: 'tree',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 }, action_class: 'REPLACE',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('tree', 'continue-logical-layer', { layerId: 10, layerName: 'Tree' }),
        actions: [wrongTarget],
      },
    }));
    expect(rejected.preflight_rejection?.error_codes).toContain('semantic_mutation_target_owner_mismatch');
    expect(f.counts().regionCalls).toBe(2);
  });

  it('dispatches an explicitly authorized historical-layer correction without changing owner authority', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42, process_dir: 'processes/historical-owner-correction-process/run-01',
      painting_profile: 'nontrivial_painting', commentary_mode: 'technical',
    });
    const createAction = regionAction('tree-base-region');
    createAction.args.regions[0].layer_id = '$steps.tree-base-layer.details.layerId';
    const created = await body(await f.cycle.handler({ next_pass: {
      request_key: 'tree-base-create', problem_id: 'tree-owner', document_id: 42,
      goal: 'Create the durable tree owner.', stage: 'SHAPE', scale: 'global',
      scene_ownership_plan: semanticSceneOwnershipPlan('historical-owner-scene', ['tree']),
      ...structuredMassContract('tree structural mass'),
      layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
      logical_layer: semanticLogicalLayer('tree', 'create-new', { layerName: 'Tree Base' }),
      actions: [{ id: 'tree-base-layer', tool: 'photoshop_create_layer', args: { name: 'Tree Base' } }, createAction],
    }}));
    expect(created.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners[0]).toMatchObject({
      hypothesis_id: 'tree', layer_id: 9, physical_layer_ids: [9],
    });

    // Simulate an already completed owner migration/continuation from an earlier public pass. The
    // SessionStore projection is the durable source consumed by the next real compact execution.
    f.runtime.store.write({
      id: 'tree-current-binding', tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42 }, sequence: 50,
      created_at: new Date(50000).toISOString(), completed_at: new Date(50001).toISOString(),
      phase: 'completed', failed: false, visual: false, report: true, ack: true, verdict: true,
      result: { content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        continuation_layers: [{ layer_id: 10, hypothesis_id: 'tree', decision: 'continue-logical-layer' }],
      }) }] },
    });
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners[0]).toMatchObject({
      hypothesis_id: 'tree', layer_id: 10, physical_layer_ids: [9, 10],
    });

    const correction = regionAction('tree-historical-correction');
    correction.args.regions[0].layer_id = 9;
    correction.args.clip_bounds = { left: 0, top: 0, right: 180, bottom: 180 };
    const corrected = await body(await f.cycle.handler({
      previous_operation_id: 'tree-base-create',
      previous_observation: { observed: 'The tree owner remains structurally valid.', target: 'resolved' },
      next_pass: {
        request_key: 'tree-correct-history', problem_id: 'tree-correction', document_id: 42,
        goal: 'Correct only the historical tree underpaint while preserving current owner authority.',
        stage: 'FORM', scale: 'medium', region: 'tree',
        region_bounds: { left: 0, top: 0, right: 180, bottom: 180 }, action_class: 'REPLACE',
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('tree', 'continue-logical-layer', { layerId: 10, layerName: 'Tree Current' }),
        cross_layer_correction: {
          mode: 'correction', current_layer_id: 10, target_layer_ids: [9],
          post_authoritative_layer_id: 10,
        },
        actions: [correction],
      },
    }));
    expect(corrected.preflight_rejection).toBeUndefined();
    expect(f.counts().regionCalls).toBe(2);
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners[0]).toMatchObject({
      hypothesis_id: 'tree', layer_id: 10, physical_layer_ids: [9, 10],
    });
  });

  it('enforces a subject-agnostic construction graph and invalidates only dependent downstream structure', async () => {
    const f = fixture();
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/construction-graph-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const constructionScenePlan = semanticSceneOwnershipPlan('construction-graph-scene', [
      'building-mass',
      'facade-plane',
      'window-opening',
      'ripple-specular',
      { semanticId: 'sky-field', editability: 'continuous-field', role: 'Continuous atmospheric field' },
      'facade-finish',
      'temp-detail',
    ]);

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
          ...(!previousOperationId ? { scene_ownership_plan: constructionScenePlan } : {}),
          ...structuredMassContract(`${hypothesisId} structural mass`),
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
        ...structuredMassContract('facade structural mass'),
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
        ...structuredMassContract('primary structural mass'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('building-mass', 'continue-logical-layer', {
          layerId: primaryOwner.layer_id, layerName: 'building-mass', rollbackValue: 'low', constructionTier: 'primary',
          constructionChange: true,
        }),
        actions: [refine],
      },
    }));
    expect(corrected.preflight_rejection).toBeUndefined();

    // Checkpoint cadence is orthogonal to this construction-graph dependency fixture.
    const checkpointedCorrection = f.runtime.store.read('cg-building-structural-correction')!;
    checkpointedCorrection.checkpoint = 'fixture://construction-graph-midpoint.psd';
    f.runtime.store.write(checkpointedCorrection);

    const skyOwner = f.runtime.store.compactPassContext(42).logical_layer_owners.find((owner: any) => owner.hypothesis_id === 'sky-field');
    const skyContinue = regionAction('cg-sky-continue-region');
    skyContinue.args.regions[0].layer_id = skyOwner.layer_id;
    const unrelatedStillValid = await body(await f.cycle.handler({
      previous_operation_id: 'cg-building-structural-correction',
      previous_observation: { observed: 'The building silhouette correction is established.', target: 'resolved' },
      next_pass: {
        request_key: 'cg-unrelated-continue', problem_id: 'cg-sky-tone', document_id: 42,
        goal: 'Continue unrelated sky tone without structural invalidation.', stage: 'SHAPE', scale: 'global',
        ...structuredMassContract('unrelated structural mass'),
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
        ...structuredMassContract('temporary primary structural mass'),
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
    const causalScenePlan = semanticSceneOwnershipPlan('causal-effects-scene', [
      'tower', 'water-plane', 'tower-reflection',
    ]);
    const create = async (key: string, id: string, previous?: string, causalEffect?: Record<string, unknown>) => {
      const layerStep = `${key}-layer`; const region = regionAction(`${key}-region`);
      region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;
      return body(await f.cycle.handler({
        ...(previous ? { previous_operation_id: previous, previous_observation: { observed: 'Prior owner established.', target: 'resolved' } } : {}),
        next_pass: {
          request_key: key, problem_id: key, document_id: 42, goal: `Establish ${id}.`, stage: 'SHAPE', scale: 'global',
          ...(!previous ? { scene_ownership_plan: causalScenePlan } : {}),
          ...structuredMassContract(`${id} structural mass`),
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
        ...structuredMassContract('source structural mass'),
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
      convergence_anchor: { x: 200, y: 90 },
      depth_progression: { near_scale: 1, far_scale: 0.35, direction: 'toward-anchor' },
      distribution: 'perspective-regular',
      local_exceptions: ['Break the flow locally where the plane turns.'],
    };
    const created = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'sf-create', problem_id: 'sf-create', document_id: 42,
        goal: 'Establish an oriented support surface.', stage: 'SHAPE', scale: 'global',
        scene_ownership_plan: semanticSceneOwnershipPlan('surface-frame-scene', ['oriented-surface']),
        ...structuredMassContract('oriented support surface'),
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
    const resolvedFrame = {
      ...frame,
      scene_vanishing_family_ids: ['fixture_depth_family'],
      scene_support_plane_id: 'fixture_support_plane',
    };
    expect(owner.surface_frame).toEqual(resolvedFrame);

    const continuation = regionAction('sf-continue-region');
    continuation.args.regions[0].layer_id = owner.layer_id;
    const inherited = await body(await f.cycle.handler({
      previous_operation_id: 'sf-create',
      previous_observation: { observed: 'The oriented surface is established.', target: 'resolved' },
      next_pass: {
        request_key: 'sf-continue', problem_id: 'sf-continue', document_id: 42,
        goal: 'Continue marks on the same oriented surface.', stage: 'SHAPE', scale: 'medium',
        ...structuredMassContract('oriented support surface'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('oriented-surface', 'continue-logical-layer', {
          layerId: owner.layer_id, layerName: 'oriented-surface', rollbackValue: 'low',
          constructionTier: 'primary', physicalRole: 'support-surface',
        }),
        actions: [continuation],
      },
    }));
    expect(inherited.preflight_rejection).toBeUndefined();
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners.find((entry: any) => entry.hypothesis_id === 'oriented-surface').surface_frame).toEqual(resolvedFrame);

    const equivalent = regionAction('sf-equivalent-region');
    equivalent.args.regions[0].layer_id = owner.layer_id;
    const equivalentResult = await body(await f.cycle.handler({
      previous_operation_id: 'sf-continue',
      previous_observation: { observed: 'The inherited surface frame remains coherent.', target: 'resolved' },
      next_pass: {
        request_key: 'sf-equivalent', problem_id: 'sf-equivalent', document_id: 42,
        goal: 'Continue with semantically equivalent frame metadata.', stage: 'SHAPE', scale: 'medium',
        ...structuredMassContract('oriented support surface'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('oriented-surface', 'continue-logical-layer', {
          layerId: owner.layer_id, layerName: 'oriented-surface', rollbackValue: 'low',
          constructionTier: 'primary', physicalRole: 'support-surface',
          surfaceFrame: { axes: [{ id: 'surface-flow', angle_degrees: 12 }], convergence_anchor: { x: 200, y: 90 }, depth_progression: { near_scale: 1, far_scale: 0.35, direction: 'toward-anchor' }, distribution: 'perspective-regular', local_exceptions: ['Break the flow locally where the plane turns.'] },
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
        ...structuredMassContract('oriented support surface'),
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
        scene_ownership_plan: semanticSceneOwnershipPlan('physical-stack-scene', [
          'rear-house', 'front-house', 'wrong-order-house', 'late-opaque',
        ]),
        ...structuredMassContract('rear opaque structural mass'),
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
        ...structuredMassContract('front opaque structural mass'),
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
        ...structuredMassContract('foreground opaque structural mass'),
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
        ...structuredMassContract('late opaque structural mass'),
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
        ...structuredMassContract('provisional character structural mass'),
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

    const missingPlanKeep = await body(await f.keepLogicalLayer.handler({
      request_key: 'temporary-cat-keep-missing-plan',
      document_id: 42,
      hypothesis_id: 'cat-temp',
      layer_id: 9,
      rationale: 'The provisional cat is now accepted and should become a persistent independently editable owner.',
    }));
    expect(missingPlanKeep.code).toBe('semantic_layer_lifecycle_rejected');
    expect(missingPlanKeep.message).toMatch(/scene_ownership_plan_required/);

    const kept = await body(await f.keepLogicalLayer.handler({
      request_key: 'temporary-cat-keep',
      document_id: 42,
      hypothesis_id: 'cat-temp',
      layer_id: 9,
      scene_ownership_plan: semanticSceneOwnershipPlan('temporary-promotion-scene', [
        { semanticId: 'cat', ownerId: 'cat-temp', role: 'Accepted character form' },
      ]),
    }));
    expect(kept.ok).toBe(true);
    expect(kept.semantic_layer_lifecycle).not.toHaveProperty('rationale');
    expect(f.runtime.store.compactPassContext(42).logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'cat-temp', layer_id: 9, temporary: false, decision: 'keep' }),
    ]);
    expect(f.runtime.store.statusCompact().documents['42'].scene_ownership_plan).toMatchObject({
      plan_id: 'temporary-promotion-scene',
      source_operation_id: 'temporary-cat-keep',
    });
  });
});

describe('hot-loop compiler integration', () => {
  it('turns one PaintingIntent decision into one Guard dispatch with durable owner facts injected locally', async () => {
    const f = fixture();
    await createHotLoopOwner(f, 'hot-loop-intent-owner');
    const before = f.counts();
    const intentRegion = regionAction('intent-region');
    delete intentRegion.args.regions[0].layer_id;

    const result = await body(await f.cycle.handler({
      previous_operation_id: 'hot-loop-intent-owner',
      previous_observation: {
        observed: 'The base owner is accepted; the next decision is to reinforce its painted form.',
        target: 'resolved',
      },
      painting_intent: {
        request_key: 'hot-loop-intent-refine',
        problem_id: 'hot-loop-intent-refine-problem',
        document_id: 42,
        goal: 'Reinforce the existing owner with one broad painted mass.',
        target_owner_id: 'hot-loop-owner',
        action: 'refine',
        visual_intent: 'mass',
        construction_role: 'structured-mass',
        material_role: 'stable painted structural mass',
        actions: [intentRegion],
      },
    }));

    expect(result.preflight_rejection).toBeUndefined();
    expect(f.counts().regionCalls - before.regionCalls).toBe(1);
    expect(result.cycle_latency).toEqual(expect.objectContaining({
      painting_intent_compile_ms: expect.any(Number),
      durable_state_injection_ms: expect.any(Number),
      local_validation_ms: expect.any(Number),
      preflight_rejection_exposed_to_model_count: 0,
    }));
    const record = f.runtime.store.read('hot-loop-intent-refine');
    expect(record?.args?.logical_layer).toEqual(expect.objectContaining({
      hypothesis_id: 'hot-loop-owner',
      layer_id: 9,
    }));
  });

  it('repairs a missing known-owner layer binding locally and dispatches without a model-visible rejection', async () => {
    const f = fixture();
    await createHotLoopOwner(f, 'hot-loop-repair-owner');
    await closeHotLoopOwner(f, 'hot-loop-repair-owner');
    const before = f.counts();

    const logicalLayer = semanticLogicalLayer('hot-loop-owner', 'continue-logical-layer', {
      layerName: 'Hot Loop Owner',
      rollbackValue: 'low',
    });
    const repairRegion = regionAction('repair-region');
    delete repairRegion.args.regions[0].layer_id;
    const result = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'hot-loop-auto-repair',
        problem_id: 'hot-loop-auto-repair-problem',
        document_id: 42,
        goal: 'Continue the known owner without restating its physical layer binding.',
        stage: 'SHAPE',
        scale: 'global',
        ...structuredMassContract('stable painted structural mass'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: logicalLayer,
        actions: [repairRegion],
      },
    }));

    expect(result.preflight_rejection).toBeUndefined();
    expect(f.counts().regionCalls - before.regionCalls).toBe(1);
    expect(result.compiler_repair_audit).toMatchObject({
      protocol: 'photoshop.guard.compiler_repair.v1',
      final_validation: 'valid',
      repairs: expect.arrayContaining([expect.objectContaining({
        kind: 'inject_from_context',
        path: 'next_pass.logical_layer.layer_id',
      })]),
    });
    expect(result.cycle_latency.auto_repair_count).toBeGreaterThanOrEqual(1);
  });

  it('repairs a stale supplied scene-model incarnation inside the public cycle before exposing any remaining violation', async () => {
    const f = fixture({ sceneGeometry: false });
    await f.setArtRun.handler({
      document_id: 42,
      process_dir: 'processes/hot-loop-incarnation-repair/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    const model = sceneGeometryModel('coherent_3d') as any;
    model.source_frame.document_incarnation = 'stale-host-witness';
    const layerStep = 'incarnation-owner-layer';
    const region = regionAction('incarnation-owner-region');
    region.args.regions[0].layer_id = `$steps.${layerStep}.details.layerId`;

    const result = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'hot-loop-incarnation-auto-repair',
        problem_id: 'hot-loop-incarnation-auto-repair',
        document_id: 42,
        goal: 'Create the first committed scene owner while deriving the authoritative document incarnation locally.',
        stage: 'SHAPE',
        scale: 'global',
        ...structuredMassContract('stable painted structural mass'),
        scene_geometry_model: model,
        scene_ownership_plan: semanticSceneOwnershipPlan('hot-loop-incarnation-plan', [
          { semanticId: 'hot-loop-incarnation-owner', ownerId: 'hot-loop-incarnation-owner', role: 'Primary structural owner' },
        ]),
        layer_separation_check: semanticLayerSeparation('new-object', 'moderate', true),
        logical_layer: semanticLogicalLayer('hot-loop-incarnation-owner', 'create-new', {
          layerName: 'Incarnation Owner',
          physicalRole: 'opaque-mass',
          opacityRole: 'opaque',
          constructionTier: 'primary',
          geometryBinding: geometryBinding('hot-loop-incarnation-owner'),
        }),
        actions: [
          { id: layerStep, tool: 'photoshop_create_layer', args: { name: 'Incarnation Owner' } },
          region,
        ],
      },
    }));

    expect(result.preflight_rejection?.error_codes ?? []).not.toContain('scene_geometry_model_incarnation_mismatch');
    expect(result.compiler_repair_audit).toMatchObject({
      protocol: 'photoshop.guard.compiler_repair.v1',
      repairs: expect.arrayContaining([expect.objectContaining({
        kind: 'replace_from_context',
        path: 'next_pass.scene_geometry_model.source_frame.document_incarnation',
      })]),
    });
    expect(result.cycle_latency.auto_repair_count).toBeGreaterThanOrEqual(1);
  });

  it('keeps reject -> correction out of recovery and preserves durable compiler lineage', async () => {
    const f = fixture();
    await createHotLoopOwner(f, 'hot-loop-lineage-owner');
    await closeHotLoopOwner(f, 'hot-loop-lineage-owner');

    const wrong = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'hot-loop-lineage-wrong',
        problem_id: 'hot-loop-lineage-problem',
        document_id: 42,
        goal: 'Refine the existing owner.',
        stage: 'SHAPE',
        scale: 'global',
        ...structuredMassContract('stable painted structural mass'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('hot-loop-owner', 'continue-logical-layer', {
          layerId: 777,
          layerName: 'Hot Loop Owner',
          rollbackValue: 'low',
        }),
        actions: [(() => {
          const action = regionAction('wrong-region');
          action.args.regions[0].layer_id = 777;
          return action;
        })()],
      },
    }));
    expect(wrong.preflight_rejection).toBeDefined();
    expect(wrong.preflight_rejection.visual_mutation_started).toBe(false);

    const corrected = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'hot-loop-lineage-corrected',
        problem_id: 'hot-loop-lineage-problem',
        document_id: 42,
        goal: 'Refine the existing owner.',
        stage: 'SHAPE',
        scale: 'global',
        ...structuredMassContract('stable painted structural mass'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('hot-loop-owner', 'continue-logical-layer', {
          layerId: 9,
          layerName: 'Hot Loop Owner',
          rollbackValue: 'low',
        }),
        actions: [(() => {
          const action = regionAction('correct-region');
          action.args.regions[0].layer_id = 9;
          return action;
        })()],
      },
    }));
    expect(corrected.preflight_rejection).toBeUndefined();

    const throughput = f.runtime.store.artisticThroughputMetrics(42);
    expect(throughput.recovery_only_round_trips).toBe(0);
    expect(throughput.rejected_before_dispatch_round_trips).toBeGreaterThanOrEqual(1);
    const state = f.runtime.store.paintingState().documents?.['42'] as any;
    const lineage = state.compiler_attempt_audit?.recent_attempts
      ?.filter((item: any) => item.problem_id === 'hot-loop-lineage-problem');
    expect(lineage).toEqual([
      expect.objectContaining({ outcome: 'rejected', request_key: 'hot-loop-lineage-wrong' }),
      expect.objectContaining({
        outcome: 'dispatched',
        request_key: 'hot-loop-lineage-corrected',
        corrects_rejection_fingerprint: expect.any(String),
      }),
    ]);
  });

  it('splits only a safe independent budget overflow and persists the deferred sub-pass for post-review continuation', async () => {
    const f = fixture();
    await createHotLoopOwner(f, 'hot-loop-split-owner');
    await closeHotLoopOwner(f, 'hot-loop-split-owner');
    const actions = Array.from({ length: 6 }, (_, index) => {
      const action = regionAction(`budget-region-${index + 1}`);
      action.args.regions[0].layer_id = 9;
      action.args.regions[0].contours[0].points = [
        { x: 10 + index * 8, y: 20 },
        { x: 46 + index * 8, y: 18 + index },
        { x: 55 + index * 8, y: 37 },
        { x: 43 + index * 8, y: 63 + index },
        { x: 18 + index * 8, y: 55 },
      ];
      return action;
    });
    const before = f.counts();
    const result = await body(await f.cycle.handler({
      next_pass: {
        request_key: 'hot-loop-safe-split',
        problem_id: 'hot-loop-safe-split-problem',
        document_id: 42,
        goal: 'Lay in several independent same-tool painted marks without exceeding the adaptive mutation envelope.',
        stage: 'SHAPE',
        scale: 'global',
        action_class: 'ADD',
        ...structuredMassContract('stable painted structural mass'),
        layer_separation_check: semanticLayerSeparation('continuation', 'low', false),
        logical_layer: semanticLogicalLayer('hot-loop-owner', 'continue-logical-layer', {
          layerId: 9,
          layerName: 'Hot Loop Owner',
          rollbackValue: 'low',
        }),
        actions,
      },
    }));

    expect(result.preflight_rejection).toBeUndefined();
    expect(result.compiler_repair_audit).toMatchObject({
      final_validation: 'valid',
      repairs: [expect.objectContaining({ kind: 'split_defer' })],
      deferred_next_pass: expect.objectContaining({
        problem_id: 'hot-loop-safe-split-problem',
        actions: expect.any(Array),
      }),
    });
    expect(result.cycle_latency.auto_split_count).toBe(1);
    expect((result.compiler_repair_audit.deferred_next_pass.actions as unknown[]).length).toBeGreaterThan(0);
    expect(f.counts().regionCalls - before.regionCalls).toBeLessThan(actions.length);

    expect(f.runtime.store.artisticContinuationContext(42).next_candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidate_id: 'D',
          kind: 'compiler-deferred-sub-pass',
          deferred_from_operation_id: 'hot-loop-safe-split',
          problem_id: 'hot-loop-safe-split-problem',
          requires_post_review_confirmation: true,
        }),
      ])
    );

    const beforeDeferred = f.counts();
    const continued = await body(await f.cycle.handler({
      previous_operation_id: 'hot-loop-safe-split',
      previous_observation: {
        observed: 'The first bounded chunk improved the intended mass and the remaining planned regions are still appropriate.',
        target: 'unresolved',
      },
      painting_intent: {
        request_key: 'hot-loop-safe-split-continued',
        problem_id: 'hot-loop-safe-split-problem',
        document_id: 42,
        goal: 'Continue the compiler-owned deferred region construction after confirming it still fits the reviewed frame.',
        target_owner_id: 'hot-loop-owner',
        action: 'refine',
        visual_intent: 'mass',
        construction_role: 'structured-mass',
        material_role: 'stable painted structural mass',
        deferred_from_operation_id: 'hot-loop-safe-split',
      },
    }));
    expect(continued.preflight_rejection).toBeUndefined();
    expect(f.counts().regionCalls - beforeDeferred.regionCalls).toBeGreaterThan(0);
  });
});
