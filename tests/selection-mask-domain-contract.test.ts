import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../src/platform/photoshop-backend.js';

const bridge = vi.hoisted(() => ({
  operation: vi.fn(),
  createLayerMask: vi.fn(),
  gradientMask: vi.fn(),
  selectRectangle: vi.fn(),
  selectEllipse: vi.fn(),
  featherSelection: vi.fn(),
  selectSubject: vi.fn(),
}));

vi.mock('../src/platform/uxp-bridge-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/uxp-bridge-client.js')>();
  return {
    ...actual,
    invokeUxpOperation: bridge.operation,
    invokeUxpCreateLayerMask: bridge.createLayerMask,
    invokeUxpApplyGradientMask: bridge.gradientMask,
    invokeUxpSelectRectangle: bridge.selectRectangle,
    invokeUxpSelectEllipse: bridge.selectEllipse,
    invokeUxpFeatherSelection: bridge.featherSelection,
    invokeUxpSelectSubject: bridge.selectSubject,
  };
});

import { createSelectionTools } from '../src/tools/selection-tools.js';
import { createMaskTools } from '../src/tools/mask-tools.js';

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === 'text')?.text ?? '';
}

function jsonOf(result: { content?: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  return JSON.parse(textOf(result)) as Record<string, unknown>;
}

function fixture(version = '2026') {
  const executeScript = vi.fn(async () => {
    throw new Error('legacy_dispatch_must_not_run');
  });
  const connection = {
    ping: vi.fn(async () => true),
    getPhotoshopInfo: () => ({ version, path: 'fixture', isRunning: true }),
    executeScript,
  } as unknown as PhotoshopConnection;
  const backendFor = vi.fn(async (_primitive: PhotoshopPrimitive) => ({ kind: 'uxp' as const }));
  const readSelectionBounds = vi.fn(async () => ({
    ok: true,
    has_selection: true,
    bounds: { left: 1, top: 2, right: 11, bottom: 12 },
    context: { hasDocument: true },
  }));
  const router = { backendFor, readSelectionBounds } as unknown as PhotoshopBackendRouter;
  return { connection, router, executeScript, backendFor, readSelectionBounds };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.selectRectangle.mockResolvedValue({ ok: true, data: { shape: 'rectangle' } });
  bridge.selectEllipse.mockResolvedValue({
    ok: true,
    data: { shape: 'ellipse', bounds: { left: 1, top: 2, right: 11, bottom: 12 } },
  });
  bridge.featherSelection.mockResolvedValue({ ok: true, data: { pixels: 3 } });
  bridge.selectSubject.mockResolvedValue({ ok: true, data: { selected: true, method: 'selectSubject' } });
  bridge.createLayerMask.mockResolvedValue({ ok: true, data: { maskCreated: true, fromSelection: true } });
  bridge.gradientMask.mockResolvedValue({
    ok: true,
    data: { applied: true, direction: 'bottom_to_top', angle: 90, mask_auto_created: false },
  });
  bridge.operation.mockImplementation(async (action: string, payload: Record<string, unknown>) => {
    const data: Record<string, unknown> = { ok: true, operation: action, ...payload };
    if (action === 'save_selection') data.channel_name = payload.channel_name ?? 'Selection 1';
    if (action === 'create_clipping_mask') Object.assign(data, { layer_name: payload.layer_name ?? 'Paint', is_clipping: true });
    if (action === 'release_clipping_mask') Object.assign(data, { layer_name: payload.layer_name ?? 'Paint', is_clipping: false });
    if (action === 'content_aware_fill') Object.assign(data, { filled: true });
    return { ok: true, data };
  });
});

describe('selection + mask public contract', () => {
  it('keeps the exact tool families and order', () => {
    const { connection, router } = fixture();
    expect(createSelectionTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_get_selection_bounds',
      'photoshop_select_ellipse',
      'photoshop_expand_selection',
      'photoshop_contract_selection',
      'photoshop_feather_selection',
      'photoshop_save_selection',
      'photoshop_select_rectangle',
      'photoshop_select_all',
      'photoshop_deselect',
      'photoshop_invert_selection',
      'photoshop_create_layer_mask',
      'photoshop_delete_layer_mask',
      'photoshop_apply_layer_mask',
      'photoshop_select_subject',
      'photoshop_content_aware_fill',
    ]);
    expect(createMaskTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_apply_gradient_mask',
      'photoshop_create_clipping_mask',
      'photoshop_release_clipping_mask',
    ]);
  });

  it('preserves selection geometry/read/refinement atomic results', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createSelectionTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(jsonOf(await byName('photoshop_get_selection_bounds').handler({}))).toMatchObject({
      ok: true,
      summary: 'Active pixel selection present',
      details: { has_selection: true },
      next_suggested_tool: 'photoshop_get_preview',
    });
    expect(jsonOf(await byName('photoshop_select_ellipse').handler({ left: 1, top: 2, right: 11, bottom: 12 })))
      .toMatchObject({ ok: true, summary: 'Elliptical selection created', details: { shape: 'ellipse' } });
    expect(jsonOf(await byName('photoshop_expand_selection').handler({ pixels: 2.6 })))
      .toMatchObject({ ok: true, summary: 'Selection expanded by 3px', details: { pixels: 3 } });
    expect(jsonOf(await byName('photoshop_contract_selection').handler({ pixels: 4 })))
      .toMatchObject({ ok: true, summary: 'Selection contracted by 4px', details: { pixels: 4 } });
    expect(jsonOf(await byName('photoshop_feather_selection').handler({ pixels: 3 })))
      .toMatchObject({ ok: true, summary: 'Selection feathered by 3px', details: { pixels: 3 } });

    expect(bridge.operation).toHaveBeenNthCalledWith(1, 'expand_selection', { pixels: 3 }, 'uxp_expand_selection_failed');
    expect(bridge.operation).toHaveBeenNthCalledWith(2, 'contract_selection', { pixels: 4 }, 'uxp_contract_selection_failed');
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'selection.ellipse', 'selection.expand', 'selection.contract', 'selection.feather',
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves save/basic-selection/mask text and UXP actions', async () => {
    const { connection, router, executeScript } = fixture();
    const tools = createSelectionTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(jsonOf(await byName('photoshop_save_selection').handler({ channel_name: 'Keep' })))
      .toMatchObject({ ok: true, summary: 'Selection saved to channel "Keep"', details: { channel_name: 'Keep' } });
    expect(textOf(await byName('photoshop_select_rectangle').handler({ left: 1, top: 2, right: 11, bottom: 12 })))
      .toBe('Rectangular selection created: (1, 2) to (11, 12)');
    expect(textOf(await byName('photoshop_select_all').handler({}))).toBe('All selected');
    expect(textOf(await byName('photoshop_deselect').handler({}))).toBe('Selection cleared');
    expect(textOf(await byName('photoshop_invert_selection').handler({}))).toBe('Selection inverted');
    expect(textOf(await byName('photoshop_create_layer_mask').handler({ document_id: 42 })))
      .toBe('Layer mask created from selection');
    expect(textOf(await byName('photoshop_delete_layer_mask').handler({}))).toBe('Layer mask deleted');
    expect(textOf(await byName('photoshop_apply_layer_mask').handler({})))
      .toBe('Layer mask applied (merged to layer)');

    expect(bridge.createLayerMask).toHaveBeenCalledWith({ document_id: 42 });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves subject version gate and content-aware selection-required mapping', async () => {
    const old = fixture('22.5');
    const oldSubject = createSelectionTools(old.connection, old.router)
      .find((item) => item.tool.name === 'photoshop_select_subject')!;
    expect(jsonOf(await oldSubject.handler({}))).toMatchObject({
      ok: false,
      code: 'version_unsupported',
      suggested_next_tool: 'photoshop_get_capabilities',
    });
    expect(bridge.selectSubject).not.toHaveBeenCalled();

    const current = fixture();
    const tools = createSelectionTools(current.connection, current.router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;
    expect(jsonOf(await byName('photoshop_select_subject').handler({ sample_all_layers: true })))
      .toMatchObject({ ok: true, summary: 'Subject selected via selectSubject' });
    expect(bridge.selectSubject).toHaveBeenCalledWith({ sample_all_layers: true });

    bridge.operation.mockResolvedValueOnce({ ok: false, error: 'selection_required: no active selection' });
    expect(jsonOf(await byName('photoshop_content_aware_fill').handler({}))).toMatchObject({
      ok: false,
      code: 'selection_required',
      suggested_next_tool: 'photoshop_select_rectangle',
    });
  });

  it('preserves gradient normalization and clipping-mask semantic envelopes', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createMaskTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(jsonOf(await byName('photoshop_apply_gradient_mask').handler({
      document_id: 42,
      direction: 'invalid',
      layer_id: 7,
      start_pct: -5,
      end_pct: 105,
      angle_deg: 30,
    }))).toMatchObject({ ok: true, summary: 'Gradient applied on layer mask' });
    expect(bridge.gradientMask).toHaveBeenCalledWith({
      document_id: 42,
      direction: 'bottom_to_top',
      layer_id: 7,
      start_pct: 0,
      end_pct: 100,
      angle_deg: 30,
    });

    expect(jsonOf(await byName('photoshop_create_clipping_mask').handler({ layer_name: ' Paint ' })))
      .toMatchObject({ ok: true, summary: 'Clipping mask created on "Paint"', details: { is_clipping: true } });
    expect(jsonOf(await byName('photoshop_release_clipping_mask').handler({ layer_name: ' Paint ' })))
      .toMatchObject({ ok: true, summary: 'Clipping mask released from "Paint"', details: { is_clipping: false } });
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'layer.mask.gradient', 'layer.clipping.create', 'layer.clipping.release',
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('keeps validation and semantic failure mappings stable', async () => {
    const { connection, router } = fixture();
    const selection = createSelectionTools(connection, router);
    const bySelection = (name: string) => selection.find((item) => item.tool.name === name)!;
    expect(jsonOf(await bySelection('photoshop_select_ellipse').handler({ left: 10, top: 1, right: 2, bottom: 9 })))
      .toMatchObject({ ok: false, code: 'invalid_arguments', suggested_next_tool: 'photoshop_get_selection_bounds' });
    expect(jsonOf(await bySelection('photoshop_expand_selection').handler({ pixels: Number.NaN })))
      .toMatchObject({ ok: false, code: 'invalid_arguments' });

    bridge.operation.mockResolvedValueOnce({ ok: true, data: { ok: false, code: 'selection_required', message: 'Need selection' } });
    expect(jsonOf(await bySelection('photoshop_contract_selection').handler({ pixels: 2 })))
      .toMatchObject({ ok: false, code: 'selection_required', suggested_next_tool: 'photoshop_select_rectangle' });

    const masks = createMaskTools(connection, router);
    const createClip = masks.find((item) => item.tool.name === 'photoshop_create_clipping_mask')!;
    bridge.operation.mockResolvedValueOnce({
      ok: true,
      data: { ok: false, code: 'no_base_layer_below', message: 'No base layer below' },
    });
    expect(jsonOf(await createClip.handler({}))).toMatchObject({
      ok: false,
      code: 'no_base_layer_below',
      suggested_next_tool: 'photoshop_get_layers',
    });
  });
});
