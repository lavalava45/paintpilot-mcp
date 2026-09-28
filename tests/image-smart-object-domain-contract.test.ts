import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../src/platform/photoshop-backend.js';

const bridge = vi.hoisted(() => ({
  operation: vi.fn(),
  openImage: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: bridge.stat };
});

vi.mock('../src/platform/uxp-bridge-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/uxp-bridge-client.js')>();
  return {
    ...actual,
    invokeUxpOperation: bridge.operation,
    invokeUxpOpenImage: bridge.openImage,
  };
});

import { createImagePlacementTools } from '../src/tools/image-placement-tools.js';
import { createSmartObjectTools } from '../src/tools/smart-object-tools.js';

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
  const router = { backendFor } as unknown as PhotoshopBackendRouter;
  return { connection, router, executeScript, backendFor };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.stat.mockResolvedValue({ isFile: () => true });
  bridge.openImage.mockResolvedValue({
    ok: true,
    receipt: { state: 'completed' },
    data: { document: { id: 501, name: 'asset.png', width: 640, height: 480 } },
  });
  bridge.operation.mockImplementation(async (action: string, payload: Record<string, unknown>) => {
    const perAction: Record<string, Record<string, unknown>> = {
      place_image: {
        layer_name: 'Placed Asset',
        bounds: { left: 12, top: 34, right: 112, bottom: 134 },
        position: { semantics: 'absolute_top_left', x: 12, y: 34 },
      },
      convert_to_smart_object: {
        layer_name: payload.layer_name ?? 'Active Layer',
        kind: 'smartObject',
        already_smart_object: false,
      },
      replace_smart_object_contents: {
        layer_name: payload.layer_name ?? 'Mockup',
        file_path: payload.file_path,
      },
      edit_smart_object_contents: {
        parent_document: 'Mockup.psd',
        embedded_document: 'Layer.psb',
        layer_name: payload.layer_name ?? 'Mockup',
      },
      create_smart_object_via_copy: {
        source_layer_name: payload.layer_name ?? 'Mockup',
        new_layer_name: 'Mockup copy',
        kind: 'smartObject',
      },
    };
    return { ok: true, data: perAction[action] ?? { action, ...payload } };
  });
});

describe('image placement + smart object public contract', () => {
  it('keeps the exact tool families and order', () => {
    const { connection, router } = fixture();
    expect(createImagePlacementTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_place_image',
      'photoshop_open_image',
    ]);
    expect(createSmartObjectTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_convert_to_smart_object',
      'photoshop_replace_smart_object_contents',
      'photoshop_edit_smart_object_contents',
      'photoshop_create_smart_object_via_copy',
    ]);
  });

  it('preserves place-image normalization, pinned payload and plain-text result', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const place = createImagePlacementTools(connection, router)
      .find((item) => item.tool.name === 'photoshop_place_image')!;

    expect(textOf(await place.handler({
      filePath: 'C:\\Assets\\subject.png',
      x: Number.NaN,
      y: 34,
      document_id: 42,
    }))).toContain('Image placed successfully: C:\\Assets\\subject.png\nPosition (absolute top-left): (0, 34)');
    expect(bridge.operation).toHaveBeenCalledWith(
      'place_image',
      { filePath: 'C:\\Assets\\subject.png', x: 0, y: 34, document_id: 42 },
      'uxp_place_image_failed'
    );
    expect(backendFor).toHaveBeenCalledWith('document.place');
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves stable open-image command identity and atomic success contour', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const open = createImagePlacementTools(connection, router)
      .find((item) => item.tool.name === 'photoshop_open_image')!;

    expect(jsonOf(await open.handler({
      _guard_operation_id: 'guard-open-c5',
      filePath: 'C:\\Assets\\asset.png',
    }))).toMatchObject({
      ok: true,
      summary: 'Image opened as a new document via UXP: C:\\Assets\\asset.png',
      details: {
        transport: 'uxp',
        command_id: 'guard-open-c5',
        uxp_command_receipt: { state: 'completed' },
        document: { id: 501, name: 'asset.png' },
      },
      next_suggested_tool: 'photoshop_get_document_info',
    });
    expect(bridge.openImage).toHaveBeenCalledWith({ filePath: 'C:\\Assets\\asset.png' }, 'guard-open-c5');
    expect(backendFor).toHaveBeenCalledWith('document.open');
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves durable not-executed open-image failure contour', async () => {
    bridge.openImage.mockResolvedValueOnce({
      ok: false,
      error: 'plugin_not_connected',
      pre_dispatch_rejected: true,
      receipt: null,
    });
    const { connection, router } = fixture();
    const open = createImagePlacementTools(connection, router)
      .find((item) => item.tool.name === 'photoshop_open_image')!;
    const result = await open.handler({ _guard_operation_id: 'guard-open-fail', filePath: 'C:\\missing.png' });
    expect(result.isError).toBe(true);
    expect(jsonOf(result)).toMatchObject({
      ok: false,
      code: 'uxp_bridge_unavailable',
      command_id: 'guard-open-fail',
      execution: 'not-executed',
    });
  });

  it('preserves smart-object payloads, trimming, document pinning and atomic result projections', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createSmartObjectTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(jsonOf(await byName('photoshop_convert_to_smart_object').handler({
      layer_name: ' Hero ', document_id: 42,
    }))).toMatchObject({
      ok: true,
      summary: 'Layer "Hero" converted to Smart Object',
      details: { layer_name: 'Hero', kind: 'smartObject', already_smart_object: false },
    });
    expect(bridge.operation).toHaveBeenNthCalledWith(1, 'convert_to_smart_object', {
      layer_name: 'Hero', document_id: 42,
    }, 'uxp_convert_to_smart_object_failed');

    expect(jsonOf(await byName('photoshop_replace_smart_object_contents').handler({
      file_path: ' C:\\Assets\\replacement.png ', layer_name: ' Mockup ', document_id: 42,
    }))).toMatchObject({
      ok: true,
      summary: 'Smart Object contents replaced from C:\\Assets\\replacement.png',
      details: { layer_name: 'Mockup', file_path: 'C:\\Assets\\replacement.png' },
    });
    expect(bridge.stat).toHaveBeenCalledWith('C:\\Assets\\replacement.png');

    expect(jsonOf(await byName('photoshop_edit_smart_object_contents').handler({
      layer_name: ' Mockup ', document_id: 42,
    }))).toMatchObject({
      ok: true,
      summary: 'Smart Object opened for editing — active document is now the embedded contents',
      details: { parent_document: 'Mockup.psd', embedded_document: 'Layer.psb', layer_name: 'Mockup' },
    });

    expect(jsonOf(await byName('photoshop_create_smart_object_via_copy').handler({
      layer_name: ' Mockup ', document_id: 42,
    }))).toMatchObject({
      ok: true,
      summary: 'New Smart Object created via copy',
      details: { source_layer_name: 'Mockup', new_layer_name: 'Mockup copy', kind: 'smartObject' },
    });
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'smart_object.convert', 'smart_object.replace', 'smart_object.edit', 'smart_object.copy',
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves replace validation before UXP dispatch', async () => {
    const { connection, router, backendFor } = fixture();
    const replace = createSmartObjectTools(connection, router)
      .find((item) => item.tool.name === 'photoshop_replace_smart_object_contents')!;

    expect(jsonOf(await replace.handler({ file_path: '   ' }))).toMatchObject({ ok: false });
    expect(jsonOf(await replace.handler({ file_path: 'relative.png' }))).toMatchObject({ ok: false });
    bridge.stat.mockRejectedValueOnce(new Error('ENOENT'));
    expect(jsonOf(await replace.handler({ file_path: 'C:\\Assets\\missing.png' }))).toMatchObject({ ok: false });
    expect(backendFor).not.toHaveBeenCalled();
    expect(bridge.operation).not.toHaveBeenCalled();
  });

  it('fails closed after UXP errors without legacy replay', async () => {
    bridge.operation.mockResolvedValue({ ok: false, error: 'uxp_failed_after_dispatch' });
    const { connection, router, executeScript } = fixture();
    const place = createImagePlacementTools(connection, router)[0]!;
    const smart = createSmartObjectTools(connection, router)[0]!;
    expect((await place.handler({ filePath: 'C:\\Assets\\asset.png' })).isError).toBe(true);
    expect((await smart.handler({})).isError).toBe(true);
    expect(executeScript).not.toHaveBeenCalled();
  });
});
