import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../src/platform/photoshop-backend.js';

const bridge = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  fill: vi.fn(),
  gradient: vi.fn(),
  selectByName: vi.fn(),
  opacity: vi.fn(),
  blend: vi.fn(),
  visibility: vi.fn(),
  locked: vi.fn(),
  rename: vi.fn(),
  duplicate: vi.fn(),
  move: vi.fn(),
  operation: vi.fn(),
}));

vi.mock('../src/platform/uxp-bridge-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/uxp-bridge-client.js')>();
  return {
    ...actual,
    invokeUxpCreateLayer: bridge.create,
    invokeUxpDeleteLayer: bridge.remove,
    invokeUxpFillLayer: bridge.fill,
    invokeUxpColorGradient: bridge.gradient,
    invokeUxpSelectLayerByName: bridge.selectByName,
    invokeUxpSetLayerOpacity: bridge.opacity,
    invokeUxpSetLayerBlendMode: bridge.blend,
    invokeUxpSetLayerVisibility: bridge.visibility,
    invokeUxpSetLayerLocked: bridge.locked,
    invokeUxpRenameLayer: bridge.rename,
    invokeUxpDuplicateLayer: bridge.duplicate,
    invokeUxpMoveLayer: bridge.move,
    invokeUxpOperation: bridge.operation,
  };
});

import { createLayerTools } from '../src/tools/layer-tools.js';
import { createLayerPropertiesTools } from '../src/tools/layer-properties-tools.js';
import { createLayerTransformTools } from '../src/tools/layer-transform-tools.js';
import { createLayerOrderingTools } from '../src/tools/layer-ordering-tools.js';

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === 'text')?.text ?? '';
}

function jsonOf(result: { content?: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  return JSON.parse(textOf(result)) as Record<string, unknown>;
}

function fixture() {
  const executeScript = vi.fn(async () => {
    throw new Error('legacy_dispatch_must_not_run');
  });
  const connection = { executeScript } as unknown as PhotoshopConnection;
  const backendFor = vi.fn(async (_primitive: PhotoshopPrimitive) => ({ kind: 'uxp' as const }));
  const listLayers = vi.fn(async () => ({
    layerCount: 2,
    layers: [{ id: 11, name: 'Base' }, { id: 22, name: 'Paint' }],
    context: { hasDocument: true },
  }));
  const router = { backendFor, listLayers } as unknown as PhotoshopBackendRouter;
  return { connection, router, executeScript, backendFor, listLayers };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.create.mockResolvedValue({ ok: true, data: { layerId: 77, layerName: 'Paint', actualIndex: 1 } });
  bridge.remove.mockResolvedValue({ ok: true, data: { deleted: true, layerId: 77, activeLayerRestored: true } });
  bridge.fill.mockResolvedValue({ ok: true, data: { filled: true, layerId: 77 } });
  bridge.gradient.mockResolvedValue({ ok: true, data: { applied: true, layer_id: 77, gradient_kind: 'raster-color-linear' } });
  bridge.selectByName.mockResolvedValue({ ok: true, data: { selected: true, layerName: 'Paint' } });
  for (const mock of [bridge.opacity, bridge.blend, bridge.visibility, bridge.locked]) {
    mock.mockResolvedValue({ ok: true, data: {} });
  }
  bridge.rename.mockResolvedValue({ ok: true, data: { oldName: 'Base', newName: 'Renamed' } });
  bridge.duplicate.mockResolvedValue({ ok: true, data: { originalName: 'Renamed', newName: 'Copy', activated: true, newLayerId: 88 } });
  bridge.move.mockResolvedValue({ ok: true, data: { moved: true, layerId: 12, layerName: 'Mover' } });
  bridge.operation.mockResolvedValue({ ok: true, data: { ok: true } });
});

describe('full layer-domain public contract', () => {
  it('keeps the exact tool families and order', () => {
    const { connection, router } = fixture();
    expect(createLayerTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_create_layer',
      'photoshop_delete_layer',
      'photoshop_merge_layer_down',
      'photoshop_create_text_layer',
      'photoshop_fill_layer',
      'photoshop_paint_color_gradient',
      'photoshop_get_layers',
      'photoshop_select_layer_by_name',
    ]);
    expect(createLayerPropertiesTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_rasterize_layer',
      'photoshop_set_layer_opacity',
      'photoshop_set_layer_blend_mode',
      'photoshop_set_layer_visibility',
      'photoshop_set_layer_locked',
      'photoshop_rename_layer',
      'photoshop_duplicate_layer',
      'photoshop_merge_visible_layers',
      'photoshop_flatten_image',
    ]);
    expect(createLayerTransformTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_fit_layer_to_document',
      'photoshop_scale_layer',
      'photoshop_move_layer',
      'photoshop_rotate_layer',
    ]);
    expect(createLayerOrderingTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_move_layer_to_position',
      'photoshop_move_layer_to_top',
      'photoshop_move_layer_to_bottom',
      'photoshop_move_layer_up',
      'photoshop_move_layer_down',
    ]);
  });

  it('preserves create/delete/fill/list/select routing and atomic result contours', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createLayerTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(jsonOf(await byName('photoshop_create_layer').handler({
      document_id: 91, name: 'Paint', above_layer_id: 22,
    }))).toMatchObject({ ok: true, details: { layerId: 77, actualIndex: 1 } });
    expect(bridge.create).toHaveBeenCalledWith({ document_id: 91, name: 'Paint', above_layer_id: 22 });

    expect(jsonOf(await byName('photoshop_delete_layer').handler({ document_id: 91, layer_id: 77 })))
      .toMatchObject({ ok: true, summary: 'Layer deleted', details: { layerId: 77, activeLayerRestored: true } });
    expect(bridge.remove).toHaveBeenCalledWith({ document_id: 91, layer_id: 77 });

    expect(jsonOf(await byName('photoshop_fill_layer').handler({
      document_id: 91, layer_id: 77, red: 10, green: 20, blue: 30,
    }))).toMatchObject({ ok: true, summary: 'Layer filled with RGB(10, 20, 30)' });

    expect(jsonOf(await byName('photoshop_paint_color_gradient').handler({
      document_id: 91, layer_id: 77, from: { x: 0, y: 0 }, to: { x: 640, y: 480 },
      stops: [{ position: 0, red: 10, green: 20, blue: 30 }, { position: 0.5, red: 80, green: 90, blue: 100 }, { position: 1, red: 180, green: 190, blue: 200 }],
    }))).toMatchObject({ ok: true, details: { applied: true, layer_id: 77, gradient_kind: 'raster-color-linear' } });
    expect(bridge.gradient).toHaveBeenCalledWith(expect.objectContaining({
      document_id: 91, layer_id: 77, from: { x: 0, y: 0 }, to: { x: 640, y: 480 },
      stops: expect.arrayContaining([expect.objectContaining({ position: 0.5, red: 80 })]),
    }));

    expect(jsonOf(await byName('photoshop_get_layers').handler({}))).toMatchObject({
      ok: true,
      summary: 'Listed 2 layers',
      details: { layerCount: 2 },
      next_suggested_tool: 'photoshop_select_layer_by_name',
    });

    expect(jsonOf(await byName('photoshop_select_layer_by_name').handler({ document_id: 91, name: 'Paint' })))
      .toMatchObject({ ok: true, summary: 'Layer selected: Paint' });
    expect(executeScript).not.toHaveBeenCalled();
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'layer.create', 'layer.delete', 'layer.fill', 'layer.color_gradient', 'layer.select_by_name',
    ]);
  });

  it('fails closed for malformed color-gradient stops instead of reinterpreting them as a mask', async () => {
    const { connection, router } = fixture();
    const gradient = createLayerTools(connection, router).find(item => item.tool.name === 'photoshop_paint_color_gradient')!;
    const result = await gradient.handler({ layer_id: 77, from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, stops: [
      { position: 0, red: 0, green: 0, blue: 0 }, { position: 0.4, red: 20, green: 20, blue: 20 }, { position: 0.3, red: 30, green: 30, blue: 30 }, { position: 1, red: 255, green: 255, blue: 255 },
    ] });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/strictly ordered/i);
    expect(bridge.gradient).not.toHaveBeenCalled();
  });

  it('preserves logical merge and text-layer UXP operation contracts', async () => {
    const { connection, router, backendFor } = fixture();
    const tools = createLayerTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    bridge.operation
      .mockResolvedValueOnce({ ok: true, data: { merged: true, sourceLayerId: 77, targetLayerId: 55 } })
      .mockResolvedValueOnce({ ok: true, data: { layerName: 'Title', text: 'Hello' } });
    expect(jsonOf(await byName('photoshop_merge_layer_down').handler({
      document_id: 91, layer_id: 77, target_layer_id: 55,
    }))).toMatchObject({ ok: true, summary: 'Logical layer merged down' });
    expect(bridge.operation).toHaveBeenNthCalledWith(1, 'merge_layer_down', {
      document_id: 91, layer_id: 77, target_layer_id: 55,
    }, 'uxp_merge_layer_down_failed');

    expect(jsonOf(await byName('photoshop_create_text_layer').handler({
      document_id: 91, text: 'Hello', x: 1, y: 2, fontSize: 30, fontName: 'Arial',
    }))).toMatchObject({ ok: true, summary: 'Text layer created: Title' });
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'layer.merge_down', 'layer.text.create',
    ]);
  });

  it('keeps property success text, blend validation, and destructive property operations', async () => {
    const { connection, router, executeScript } = fixture();
    const tools = createLayerPropertiesTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(textOf(await byName('photoshop_set_layer_opacity').handler({ document_id: 91, opacity: 42 })))
      .toBe('Layer opacity set to 42%');
    expect(textOf(await byName('photoshop_set_layer_blend_mode').handler({ document_id: 91, blendMode: 'COLOR' })))
      .toBe('Layer blend mode set to COLOR');
    expect(textOf(await byName('photoshop_set_layer_visibility').handler({ document_id: 91, visible: false })))
      .toBe('Layer hidden');
    expect(textOf(await byName('photoshop_set_layer_locked').handler({ document_id: 91, locked: true })))
      .toBe('Layer locked');
    expect(textOf(await byName('photoshop_rename_layer').handler({ document_id: 91, name: 'Renamed' })))
      .toBe('Layer renamed to: Renamed\nResult: {"oldName":"Base","newName":"Renamed"}');
    expect(textOf(await byName('photoshop_duplicate_layer').handler({ document_id: 91, newName: 'Copy' })))
      .toBe('Layer duplicated\nResult: {"originalName":"Renamed","newName":"Copy","activated":true,"newLayerId":88}');

    const invalidBlend = await byName('photoshop_set_layer_blend_mode').handler({ blendMode: 'NORMAL;hack' });
    expect(invalidBlend.isError).toBe(true);
    expect(textOf(invalidBlend)).toContain('unknown blendMode');

    bridge.operation
      .mockResolvedValueOnce({ ok: true, data: { merged: true } })
      .mockResolvedValueOnce({ ok: true, data: { flattened: true } })
      .mockResolvedValueOnce({ ok: true, data: { rasterized: true } });
    expect(textOf(await byName('photoshop_merge_visible_layers').handler({ document_id: 91 })))
      .toBe('All visible layers merged');
    expect(textOf(await byName('photoshop_flatten_image').handler({ document_id: 91 })))
      .toBe('Image flattened (all layers merged to background)');
    expect(textOf(await byName('photoshop_rasterize_layer').handler({ document_id: 91 })))
      .toBe('Layer rasterized\nResult: {"rasterized":true}');
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves all transform UXP actions and exact success text', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createLayerTransformTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;
    bridge.operation
      .mockResolvedValueOnce({ ok: true, data: { fitted: true } })
      .mockResolvedValueOnce({ ok: true, data: { scaled: true } })
      .mockResolvedValueOnce({ ok: true, data: { moved: true } })
      .mockResolvedValueOnce({ ok: true, data: { rotated: true } });

    expect(textOf(await byName('photoshop_fit_layer_to_document').handler({ document_id: 91, fillDocument: true })))
      .toBe('Layer filled to document\nResult: {"fitted":true}');
    expect(textOf(await byName('photoshop_scale_layer').handler({ document_id: 91, scalePercent: 125, centerAnchor: false })))
      .toBe('Layer scaled to 125%\nResult: {"scaled":true}');
    expect(textOf(await byName('photoshop_move_layer').handler({ document_id: 91, deltaX: 5, deltaY: -4 })))
      .toBe('Layer moved by (5, -4)px\nResult: {"moved":true}');
    expect(textOf(await byName('photoshop_rotate_layer').handler({ document_id: 91, degrees: 15 })))
      .toBe('Layer rotated 15 degrees\nResult: {"rotated":true}');
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'layer.fit', 'layer.scale', 'layer.move_pixels', 'layer.rotate',
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves relative and simple ordering payload/result semantics', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createLayerOrderingTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;
    bridge.move
      .mockResolvedValueOnce({ ok: true, data: { moved: true, layerName: 'Mover', layerId: 12, relativeToId: 77 } })
      .mockResolvedValueOnce({ ok: true, data: { moved: true, layerName: 'Mover', layerId: 12, parentName: 'G', position: 'top' } })
      .mockResolvedValueOnce({ ok: true, data: { moved: false, message: 'already bottom' } });

    expect(jsonOf(await byName('photoshop_move_layer_to_position').handler({
      document_id: 91, position: 'BELOW', targetLayerId: 77,
    }))).toMatchObject({ ok: true, summary: 'Layer moved BELOW', details: { relativeToId: 77 } });
    expect(jsonOf(await byName('photoshop_move_layer_to_top').handler({ document_id: 91 })))
      .toMatchObject({ ok: true, summary: 'Layer moved to top', details: { parentName: 'G' } });
    expect(jsonOf(await byName('photoshop_move_layer_down').handler({ document_id: 91 })))
      .toMatchObject({ ok: true, summary: 'Layer moved down', details: { moved: false } });
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'layer.order.write', 'layer.order.write', 'layer.order.write',
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });
});
