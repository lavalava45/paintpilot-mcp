import { describe, expect, it } from 'vitest';
import type { PhotoshopConnection } from './connection.js';
import {
  PhotoshopBackendRouter,
  UxpPhotoshopBackend,
  type PhotoshopBackend,
  type PhotoshopPrimitive,
  type PhotoshopStateSnapshot,
} from './photoshop-backend.js';
import type { BackendRouteTraceInput } from './backend-route-trace.js';
import { ExactNotExecutedError } from '../core/execution-outcome.js';
import { buildEnvelopeFromError } from '../core/tool-result-contract.js';

function backendFixture(
  kind: PhotoshopBackend['kind'],
  options: {
    available?: boolean;
    supports?: boolean;
    state?: PhotoshopStateSnapshot;
    documentInfo?: PhotoshopStateSnapshot;
    documentList?: Record<string, unknown>;
    selectionBounds?: Record<string, unknown>;
    layerList?: Record<string, unknown>;
    brushPresets?: Record<string, unknown>;
    brushSettings?: Record<string, unknown>;
    previewCapture?: {
      transport: 'uxp' | 'extendscript';
      whole: { width: number; height: number; mimeType: string; base64?: string; path?: string };
    };
    colorSample?: Record<string, unknown>;
    colorSamples?: Record<string, unknown>;
    history?: Record<string, unknown>;
    error?: Error;
  } = {}
) {
  let reads = 0;
  let documentInfoReads = 0;
  let documentLists = 0;
  let selectionReads = 0;
  let layerLists = 0;
  let brushPresetLists = 0;
  let brushSettingsReads = 0;
  let previewCaptures = 0;
  let colorSampleReads = 0;
  let colorSamplesReads = 0;
  let historyReads = 0;
  let availabilityChecks = 0;
  const backend: PhotoshopBackend = {
    kind,
    async isAvailable() {
      availabilityChecks++;
      return options.available ?? true;
    },
    supports(_primitive: PhotoshopPrimitive) {
      return options.supports ?? true;
    },
    async readState() {
      reads++;
      if (options.error) throw options.error;
      return options.state ?? { hasDocument: false };
    },
    async readDocumentInfo() {
      documentInfoReads++;
      if (options.error) throw options.error;
      return options.documentInfo ?? options.state ?? { hasDocument: true };
    },
    async listDocuments() {
      documentLists++;
      if (options.error) throw options.error;
      return options.documentList ?? { ok: true, count: 0, documents: [] };
    },
    async readSelectionBounds() {
      selectionReads++;
      if (options.error) throw options.error;
      return options.selectionBounds ?? { ok: true, has_selection: false };
    },
    async listLayers() {
      layerLists++;
      if (options.error) throw options.error;
      return options.layerList ?? { layerCount: 0, layers: [] };
    },
    async listBrushPresets() {
      brushPresetLists++;
      if (options.error) throw options.error;
      return options.brushPresets ?? { ok: true, total: 0, matched: 0, truncated: false, presets: [] };
    },
    async readBrushSettings() {
      brushSettingsReads++;
      if (options.error) throw options.error;
      return options.brushSettings ?? { ok: true, settings: { size: 1 } };
    },
    async capturePreview() {
      previewCaptures++;
      if (options.error) throw options.error;
      return options.previewCapture ?? {
        transport: kind,
        whole: { width: 64, height: 48, mimeType: 'image/jpeg', base64: 'AA==' },
      };
    },
    async sampleColor() {
      colorSampleReads++;
      if (options.error) throw options.error;
      return options.colorSample ?? {
        ok: true,
        point: { x: 1, y: 1 },
        rgb_8bit: { red: 255, green: 255, blue: 255 },
      };
    },
    async sampleColors() {
      colorSamplesReads++;
      if (options.error) throw options.error;
      return options.colorSamples ?? {
        ok: true,
        count: 1,
        samples: [{ point: { x: 1, y: 1 }, hex: '#FFFFFF' }],
      };
    },
    async readHistory() {
      historyReads++;
      if (options.error) throw options.error;
      return options.history ?? {
        totalStates: 1,
        currentIndex: 0,
        currentState: 'New',
        canUndo: false,
        canRedo: false,
        states: [{ name: 'New', snapshot: false }],
      };
    },
  };
  return {
    backend,
    counts: () => ({
      reads,
      documentInfoReads,
      documentLists,
      selectionReads,
      layerLists,
      brushPresetLists,
      brushSettingsReads,
      previewCaptures,
      colorSampleReads,
      colorSamplesReads,
      historyReads,
      availabilityChecks,
    }),
  };
}

const unusedConnection = {} as PhotoshopConnection;

describe('PhotoshopBackendRouter', () => {
  it('records the selected backend at the pre-dispatch boundary', async () => {
    const uxp = backendFixture('uxp', { available: true });
    const legacy = backendFixture('extendscript', { available: true });
    const events: BackendRouteTraceInput[] = [];
    const router = new PhotoshopBackendRouter(
      {} as PhotoshopConnection,
      [uxp.backend, legacy.backend],
      (event) => events.push(event)
    );

    await expect(router.backendFor('layer.create')).resolves.toBe(uxp.backend);
    expect(events).toEqual([expect.objectContaining({
      primitive: 'layer.create',
      selected_backend: 'uxp',
      uxp_supported: true,
      uxp_available: true,
      fallback_used: false,
      reason: 'uxp_available',
    })]);
  });

  it('fails closed without probing legacy when UXP is unavailable', async () => {
    const uxp = backendFixture('uxp', { available: false });
    const legacy = backendFixture('extendscript', { available: true });
    const events: BackendRouteTraceInput[] = [];
    const router = new PhotoshopBackendRouter(
      {} as PhotoshopConnection,
      [uxp.backend, legacy.backend],
      (event) => events.push(event)
    );

    await expect(router.backendFor('filter.gaussian_blur')).rejects.toThrow(/uxp_bridge_unavailable/);
    expect(events).toEqual([expect.objectContaining({
      primitive: 'filter.gaussian_blur',
      selected_backend: null,
      uxp_supported: true,
      uxp_available: false,
      legacy_supported: false,
      legacy_available: null,
      fallback_used: false,
      reason: 'uxp_unavailable_fail_closed',
    })]);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('preserves exact not-executed proof for a backend-route rejection before semantic dispatch', async () => {
    const uxp = backendFixture('uxp', { available: false });
    const router = new PhotoshopBackendRouter(
      {} as PhotoshopConnection,
      [uxp.backend],
      () => undefined
    );

    const error = await router.backendFor('layer.create').then(
      () => undefined,
      (value: unknown) => value
    );
    expect(error).toBeInstanceOf(ExactNotExecutedError);

    const result = buildEnvelopeFromError(error);
    const text = result.content.find(item => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(body).toMatchObject({
      ok: false,
      code: 'uxp_bridge_unavailable',
      execution: 'not-executed',
      execution_proof: {
        protocol: 'photoshop.execution_exact_outcome.v1',
        dispatch: 'not-dispatched',
        side_effects: 'none',
        reason: 'backend_route_rejected_before_semantic_dispatch',
      },
    });
  });
  const canonicalPaintingMutations: PhotoshopPrimitive[] = [
    'brush.presets.select',
    'brush.settings.write',
    'foreground.write',
    'layer.create',
    'layer.delete',
    'layer.opacity.write',
    'layer.blend_mode.write',
    'layer.visibility.write',
    'layer.locked.write',
    'layer.rename',
    'layer.duplicate',
    'layer.order.write',
    'layer.fill',
    'layer.select_by_name',
    'layer.mask.create',
    'layer.mask.gradient',
    'history.undo',
    'selection.rectangle',
    'selection.ellipse',
    'selection.feather',
    'selection.subject',
    'painting.regions',
    'painting.strokes',
    'painting.dabs',
  ];

  const canonicalPaintingReads: PhotoshopPrimitive[] = [
    'state.read',
    'layers.list',
    'brush.presets.list',
    'brush.settings.read',
    'preview.read',
  ];

  it('routes every canonical Guard painting mutation to UXP when ready with zero legacy fallback checks', async () => {
    const uxp = backendFixture('uxp');
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    for (const primitive of canonicalPaintingMutations) {
      await expect(router.backendFor(primitive)).resolves.toBe(uxp.backend);
    }

    expect(uxp.counts().availabilityChecks).toBe(canonicalPaintingMutations.length);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('fails closed for canonical painting mutations when UXP is unavailable', async () => {
    const uxp = backendFixture('uxp', { available: false });
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    for (const primitive of canonicalPaintingMutations) {
      await expect(router.backendFor(primitive)).rejects.toThrow(/uxp_bridge_unavailable/);
    }

    expect(uxp.counts().availabilityChecks).toBe(canonicalPaintingMutations.length);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('chooses UXP for canonical Guard painting reads when ready and adds zero legacy calls', async () => {
    const uxp = backendFixture('uxp');
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    for (const primitive of canonicalPaintingReads) {
      await expect(router.backendFor(primitive)).resolves.toBe(uxp.backend);
    }

    expect(uxp.counts().availabilityChecks).toBe(canonicalPaintingReads.length);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('keeps brush-pack import UXP-only and fail-closed when the companion is unavailable', async () => {
    const uxp = new UxpPhotoshopBackend(unusedConnection);
    expect(uxp.supports('brush.presets.import')).toBe(true);

    const unavailableUxp = backendFixture('uxp', { available: false });
    const legacyFixture = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [
      { ...unavailableUxp.backend, supports: (primitive) => primitive === 'brush.presets.import' },
      { ...legacyFixture.backend, supports: () => false },
    ]);
    await expect(router.backendFor('brush.presets.import')).rejects.toThrow(/uxp_bridge_unavailable/);
  });

  it('advertises the Phase-9/10 layer mutation clusters on the UXP backend', () => {
    const primitives: PhotoshopPrimitive[] = [
      'layer.create',
      'layer.delete',
      'layer.opacity.write',
      'layer.blend_mode.write',
      'layer.visibility.write',
      'layer.locked.write',
      'layer.rename',
      'layer.duplicate',
      'layer.order.write',
    ];
    const uxp = new UxpPhotoshopBackend();
    for (const primitive of primitives) {
      expect(uxp.supports(primitive)).toBe(true);
    }
  });

  it('selects UXP before dispatch for each Phase-9/10 layer mutation when available', async () => {
    const uxp = backendFixture('uxp');
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);
    const primitives: PhotoshopPrimitive[] = [
      'layer.create',
      'layer.delete',
      'layer.opacity.write',
      'layer.blend_mode.write',
      'layer.visibility.write',
      'layer.locked.write',
      'layer.rename',
      'layer.duplicate',
      'layer.order.write',
    ];
    for (const primitive of primitives) {
      await expect(router.backendFor(primitive)).resolves.toBe(uxp.backend);
    }
    expect(uxp.counts().availabilityChecks).toBe(primitives.length);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('routes the remaining P1 migration primitives to UXP before dispatch with zero legacy probes', async () => {
    const primitives: PhotoshopPrimitive[] = [
      'document.activate',
      'document.close',
      'layer.mask.apply',
      'selection.content_aware_fill',
      'selection.contract',
      'layer.clipping.create',
      'layer.mask.delete',
      'selection.deselect',
      'selection.expand',
      'selection.invert',
      'layer.clipping.release',
      'selection.save',
      'selection.all',
      'layer.fit',
      'layer.move_pixels',
      'layer.rotate',
      'layer.scale',
      'layer.flatten',
      'layer.merge_down',
      'layer.merge_visible',
    ];
    const uxp = backendFixture('uxp');
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    for (const primitive of primitives) {
      await expect(router.backendFor(primitive)).resolves.toBe(uxp.backend);
    }
    expect(uxp.counts().availabilityChecks).toBe(primitives.length);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('advertises and routes every P2/P3 migration primitive UXP-only and fail-closed', async () => {
    const primitives: PhotoshopPrimitive[] = [
      'adjustment.brightness_contrast', 'adjustment.curves', 'adjustment.exposure',
      'adjustment.hue_saturation', 'adjustment.vibrance', 'adjustment.gradient_map',
      'adjustment.lut', 'adjustment.photo_filter', 'adjustment.auto_contrast',
      'adjustment.auto_levels', 'adjustment.desaturate', 'adjustment.invert',
      'filter.gaussian_blur', 'filter.high_pass', 'filter.motion_blur', 'filter.noise',
      'filter.sharpen', 'filter.smart_blur',
      'text.fonts.list', 'text.alignment.write', 'text.color.write', 'text.font.write',
      'text.content.write', 'document.export',
      'document.resize', 'document.crop', 'document.place',
      'guides.add', 'guides.list', 'guides.clear', 'history.redo', 'image.stack',
      'layer.style.apply', 'layer.text.create', 'layer.rasterize', 'sky.replace',
      'smart_object.convert', 'smart_object.copy', 'smart_object.edit', 'smart_object.replace',
    ];
    const uxpBackend = new UxpPhotoshopBackend();
    for (const primitive of primitives) {
      expect(uxpBackend.supports(primitive)).toBe(true);
    }

    const uxp = backendFixture('uxp');
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);
    for (const primitive of primitives) {
      await expect(router.backendFor(primitive)).resolves.toBe(uxp.backend);
    }
    expect(legacy.counts().availabilityChecks).toBe(0);

    const unavailableUxp = backendFixture('uxp', { available: false });
    const fallback = backendFixture('extendscript');
    const fallbackRouter = new PhotoshopBackendRouter(
      unusedConnection,
      [unavailableUxp.backend, fallback.backend]
    );
    for (const primitive of primitives) {
      await expect(fallbackRouter.backendFor(primitive)).rejects.toThrow(/uxp_bridge_unavailable/);
    }
    expect(fallback.counts().availabilityChecks).toBe(0);
  });

  it('fails closed for migrated painting mutations when UXP is unavailable', async () => {
    const uxp = backendFixture('uxp', { available: false });
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    await expect(router.backendFor('painting.strokes')).rejects.toThrow(/uxp_bridge_unavailable/);
    expect(uxp.counts().availabilityChecks).toBe(1);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('uses UXP for migrated painting mutations when the companion is available', async () => {
    const uxp = backendFixture('uxp');
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    await expect(router.backendFor('painting.regions')).resolves.toBe(uxp.backend);
    await expect(router.backendFor('layer.fill')).resolves.toBe(uxp.backend);
    expect(legacy.counts().availabilityChecks).toBe(0);
  });

  it('prefers UXP when the primitive is supported and the plugin is available', async () => {
    const uxp = backendFixture('uxp', {
      state: { hasDocument: true, document: { id: 7 } },
    });
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    await expect(router.readState()).resolves.toEqual({
      hasDocument: true,
      document: { id: 7 },
    });
    expect(uxp.counts().reads).toBe(1);
    expect(legacy.counts()).toEqual({
      reads: 0,
      documentInfoReads: 0,
      documentLists: 0,
      selectionReads: 0,
      layerLists: 0,
      brushPresetLists: 0,
      brushSettingsReads: 0,
      previewCaptures: 0,
      colorSampleReads: 0,
      colorSamplesReads: 0,
      historyReads: 0,
      availabilityChecks: 0,
    });
  });

  it('fails closed before dispatch when UXP is unavailable', async () => {
    const uxp = backendFixture('uxp', { available: false });
    const legacy = backendFixture('extendscript', {
      state: { hasDocument: false },
    });
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    await expect(router.readState()).rejects.toThrow(/uxp_bridge_unavailable/);
    expect(uxp.counts()).toEqual({
      reads: 0,
      documentInfoReads: 0,
      documentLists: 0,
      selectionReads: 0,
      layerLists: 0,
      brushPresetLists: 0,
      brushSettingsReads: 0,
      previewCaptures: 0,
      colorSampleReads: 0,
      colorSamplesReads: 0,
      historyReads: 0,
      availabilityChecks: 1,
    });
    expect(legacy.counts()).toEqual({
      reads: 0,
      documentInfoReads: 0,
      documentLists: 0,
      selectionReads: 0,
      layerLists: 0,
      brushPresetLists: 0,
      brushSettingsReads: 0,
      previewCaptures: 0,
      colorSampleReads: 0,
      colorSamplesReads: 0,
      historyReads: 0,
      availabilityChecks: 0,
    });
  });

  it('rejects a primitive not supported by the UXP backend without probing legacy', async () => {
    const uxp = backendFixture('uxp', { supports: false });
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    await expect(router.readState()).rejects.toThrow(/capability_unavailable/);
    expect(uxp.counts()).toEqual({
      reads: 0,
      documentInfoReads: 0,
      documentLists: 0,
      selectionReads: 0,
      layerLists: 0,
      brushPresetLists: 0,
      brushSettingsReads: 0,
      previewCaptures: 0,
      colorSampleReads: 0,
      colorSamplesReads: 0,
      historyReads: 0,
      availabilityChecks: 0,
    });
    expect(legacy.counts()).toEqual({
      reads: 0,
      documentInfoReads: 0,
      documentLists: 0,
      selectionReads: 0,
      layerLists: 0,
      brushPresetLists: 0,
      brushSettingsReads: 0,
      previewCaptures: 0,
      colorSampleReads: 0,
      colorSamplesReads: 0,
      historyReads: 0,
      availabilityChecks: 0,
    });
  });

  it('does not replay through another backend after dispatch has started', async () => {
    const uxp = backendFixture('uxp', { error: new Error('uxp_failed_after_dispatch') });
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    await expect(router.readState()).rejects.toThrow('uxp_failed_after_dispatch');
    expect(uxp.counts().reads).toBe(1);
    expect(legacy.counts()).toEqual({
      reads: 0,
      documentInfoReads: 0,
      documentLists: 0,
      selectionReads: 0,
      layerLists: 0,
      brushPresetLists: 0,
      brushSettingsReads: 0,
      previewCaptures: 0,
      colorSampleReads: 0,
      colorSamplesReads: 0,
      historyReads: 0,
      availabilityChecks: 0,
    });
  });

  it('routes the Phase-2 read primitives through UXP when available', async () => {
    const uxp = backendFixture('uxp', {
      documentInfo: { hasDocument: true, document: { id: 11 } },
      documentList: { ok: true, count: 1, documents: [{ id: 11 }] },
      selectionBounds: { ok: true, has_selection: false },
      layerList: { layerCount: 1, layers: [{ id: 21, name: 'Layer 1' }] },
      brushPresets: { ok: true, total: 2, matched: 1, truncated: false, presets: ['Soft Round'] },
      brushSettings: { ok: true, settings: { size: 80, hardness: 0 } },
      previewCapture: {
        transport: 'uxp',
        whole: { width: 64, height: 48, mimeType: 'image/jpeg', base64: 'AA==' },
      },
      colorSample: { ok: true, hex: '#FFFFFF' },
      colorSamples: { ok: true, count: 1, samples: [{ hex: '#FFFFFF' }] },
      history: {
        totalStates: 2,
        currentIndex: 1,
        currentState: 'New',
        canUndo: true,
        canRedo: false,
        states: [{ name: 'New Document', snapshot: true }, { name: 'New', snapshot: false }],
      },
    });
    const legacy = backendFixture('extendscript');
    const router = new PhotoshopBackendRouter(unusedConnection, [uxp.backend, legacy.backend]);

    await expect(router.readDocumentInfo()).resolves.toMatchObject({ hasDocument: true });
    await expect(router.listDocuments()).resolves.toMatchObject({ ok: true, count: 1 });
    await expect(router.readSelectionBounds()).resolves.toMatchObject({
      ok: true,
      has_selection: false,
    });
    await expect(router.listLayers()).resolves.toMatchObject({ layerCount: 1 });
    await expect(router.listBrushPresets('soft', 8)).resolves.toMatchObject({
      ok: true,
      total: 2,
      matched: 1,
    });
    await expect(router.readBrushSettings()).resolves.toMatchObject({
      ok: true,
      settings: { size: 80, hardness: 0 },
    });
    await expect(
      router.capturePreview({ maxDimension: 1024, quality: 8 })
    ).resolves.toMatchObject({
      transport: 'uxp',
      whole: { width: 64, height: 48, mimeType: 'image/jpeg' },
    });
    await expect(router.sampleColor(1, 1, 0)).resolves.toMatchObject({
      ok: true,
      hex: '#FFFFFF',
    });
    await expect(router.sampleColors([{ x: 1, y: 1 }])).resolves.toMatchObject({
      ok: true,
      count: 1,
    });
    await expect(router.readHistory()).resolves.toMatchObject({
      totalStates: 2,
      currentIndex: 1,
      currentState: 'New',
    });

    expect(uxp.counts()).toEqual({
      reads: 0,
      documentInfoReads: 1,
      documentLists: 1,
      selectionReads: 1,
      layerLists: 1,
      brushPresetLists: 1,
      brushSettingsReads: 1,
      previewCaptures: 1,
      colorSampleReads: 1,
      colorSamplesReads: 1,
      historyReads: 1,
      availabilityChecks: 10,
    });
    expect(legacy.counts()).toEqual({
      reads: 0,
      documentInfoReads: 0,
      documentLists: 0,
      selectionReads: 0,
      layerLists: 0,
      brushPresetLists: 0,
      brushSettingsReads: 0,
      previewCaptures: 0,
      colorSampleReads: 0,
      colorSamplesReads: 0,
      historyReads: 0,
      availabilityChecks: 0,
    });
  });
});
