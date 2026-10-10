import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoshopConnection } from '../platform/connection.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';

const bridge = vi.hoisted(() => ({
  selectPreset: vi.fn(),
  setBrush: vi.fn(),
  setForeground: vi.fn(),
  paintRegions: vi.fn(),
  paintStrokes: vi.fn(),
  paintDabs: vi.fn(),
}));

vi.mock('../platform/uxp-bridge-client.js', () => ({
  invokeUxpSelectBrushPreset: bridge.selectPreset,
  invokeUxpSetBrush: bridge.setBrush,
  invokeUxpSetForegroundColor: bridge.setForeground,
  invokeUxpPaintRegions: bridge.paintRegions,
  invokeUxpPaintStrokes: bridge.paintStrokes,
  invokeUxpPaintDabs: bridge.paintDabs,
}));

import { createPaintingTools, strokeExecutionBudget } from './painting-tools.js';
import {
  withToolExecutionContext,
  withToolExecutionStepContext,
} from '../core/execution-context.js';

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === 'text')?.text ?? '';
}

function fixture() {
  const executeScript = vi.fn(async (): Promise<unknown> => {
    throw new Error('legacy_dispatch_must_not_run');
  });
  const connection = {
    getPhotoshopInfo: () => ({ version: '2026', path: 'test', isRunning: true }),
    executeScript,
  } as unknown as PhotoshopConnection;
  const backendFor = vi.fn(async (
    _primitive: PhotoshopPrimitive
  ): Promise<{ kind: 'uxp' | 'extendscript' }> => ({ kind: 'uxp' }));
  const readBrushSettings = vi.fn(async () => ({ settings: { size: 24 } }));
  const listBrushPresets = vi.fn(async () => ({
    total: 1,
    matched: 1,
    truncated: false,
    presets: ['Round'],
  }));
  const router = {
    backendFor,
    readBrushSettings,
    listBrushPresets,
  } as unknown as PhotoshopBackendRouter;
  return { connection, router, executeScript, backendFor, readBrushSettings, listBrushPresets };
}

describe('canonical painting tools UXP routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.selectPreset.mockResolvedValue({ ok: true, data: { preset: 'Round', settings: { size: 24 } } });
    bridge.setBrush.mockResolvedValue({ ok: true, data: { settings: { size: 32, opacity: 80 } } });
    bridge.setForeground.mockResolvedValue({ ok: true, data: { red: 1, green: 2, blue: 3 } });
    bridge.paintStrokes.mockResolvedValue({
      ok: true,
      data: { layer_name: 'Paint', coordinate_space: 'canvas_pixels' },
    });
    bridge.paintRegions.mockResolvedValue({
      ok: true,
      data: { region_count: 1, painted_regions: ['r1'], coordinate_space: 'canvas_pixels' },
    });
    bridge.paintDabs.mockResolvedValue({
      ok: true,
      data: { layer_name: 'Paint', coordinate_space: 'canvas_pixels' },
    });
  });

  it('routes brush preset/settings/color and paint regions/strokes/dabs through UXP with zero legacy calls', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createPaintingTools(connection, router);
    const byName = (name: string) => tools.find((tool) => tool.tool.name === name)!;

    await byName('photoshop_select_brush_preset').handler({ name: 'Round' });
    await byName('photoshop_set_brush').handler({ size: 32, opacity: 80 });
    await byName('photoshop_set_foreground_color').handler({ red: 1, green: 2, blue: 3 });
    await byName('photoshop_paint_strokes').handler({
      document_id: 42,
      strokes: [{ points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }],
    });
    await byName('photoshop_paint_regions').handler({
      document_id: 42,
      regions: [{
        id: 'r1',
        color: { red: 10, green: 20, blue: 30 },
        contours: [{
          points: [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: 10, y: 10 }],
        }],
      }],
    });
    await byName('photoshop_paint_dabs').handler({
      document_id: 42,
      dabs: [{ x: 5, y: 6, size: 20 }],
    });

    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'brush.presets.select',
      'brush.settings.write',
      'foreground.write',
      'painting.strokes',
      'painting.regions',
      'painting.dabs',
    ]);
    expect(bridge.selectPreset).toHaveBeenCalledTimes(1);
    expect(bridge.setBrush).toHaveBeenCalledTimes(1);
    expect(bridge.setForeground).toHaveBeenCalledTimes(1);
    expect(bridge.paintStrokes).toHaveBeenCalledTimes(1);
    expect(bridge.paintRegions).toHaveBeenCalledTimes(1);
    expect(bridge.paintDabs).toHaveBeenCalledTimes(1);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('passes nested Guard step identities through setters and paint batches without sibling collisions', async () => {
    const { connection, router } = fixture();
    const tools = createPaintingTools(connection, router);
    const byName = (name: string) => tools.find((tool) => tool.tool.name === name)!;

    await withToolExecutionContext({ guardOperationId: 'guard-pass-24a' }, async () => {
      await withToolExecutionStepContext('select-brush', () =>
        byName('photoshop_select_brush_preset').handler({ name: 'Round' })
      );
      await withToolExecutionStepContext('set-brush', () =>
        byName('photoshop_set_brush').handler({ size: 32, opacity: 80 })
      );
      await withToolExecutionStepContext('paint-strokes', () =>
        byName('photoshop_paint_strokes').handler({
          document_id: 42,
          strokes: [{ points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }],
        })
      );
    });

    expect(bridge.selectPreset.mock.calls[0]?.[1]).toBe('guard-pass-24a:step:select-brush');
    expect(bridge.setBrush.mock.calls[0]?.[1]).toBe('guard-pass-24a:step:set-brush');
    expect(bridge.paintStrokes.mock.calls[0]?.[1]).toBe('guard-pass-24a:step:paint-strokes:batch:0');
    expect(new Set([
      bridge.selectPreset.mock.calls[0]?.[1],
      bridge.setBrush.mock.calls[0]?.[1],
      bridge.paintStrokes.mock.calls[0]?.[1],
    ]).size).toBe(3);
  });

  it('fails non-BRUSH style overrides before UXP dispatch while allowing a bare PENCIL stroke', async () => {
    const { connection, router, backendFor } = fixture();
    const paint = createPaintingTools(connection, router)
      .find((tool) => tool.tool.name === 'photoshop_paint_strokes')!;

    const rejected = await paint.handler({
      document_id: 42,
      strokes: [{
        tool: 'PENCIL',
        size: 5,
        opacity: 80,
        points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
      }],
    });
    expect(rejected.isError).toBe(true);
    expect(JSON.parse(textOf(rejected))).toMatchObject({
      code: 'paint_tool_not_ready',
      message: expect.stringContaining('paint_tool_not_ready:PENCIL'),
    });
    expect(bridge.paintStrokes).not.toHaveBeenCalled();
    expect(backendFor).not.toHaveBeenCalled();

    const allowed = await paint.handler({
      document_id: 42,
      strokes: [{
        tool: 'PENCIL',
        points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
      }],
    });
    expect(allowed.isError).not.toBe(true);
    expect(bridge.paintStrokes).toHaveBeenCalledTimes(1);
  });

  it.each(['strokes', 'dabs', 'regions'] as const)('preserves actual layer compositing facts in %s receipts', async kind => {
    const { connection, router } = fixture();
    const target = { layer_id: 9, opacity: 35, fill_opacity: 70, blend_mode: 'normal' };
    const data = kind === 'regions'
      ? { painted_regions: [{ id: 'r1', layer_id: 9, paint_target: target }] }
      : { paint_target: target };
    const invoke = kind === 'strokes' ? bridge.paintStrokes : kind === 'dabs' ? bridge.paintDabs : bridge.paintRegions;
    invoke.mockResolvedValueOnce({ ok: true, data });
    const paint = createPaintingTools(connection, router)
      .find(tool => tool.tool.name === `photoshop_paint_${kind}`)!;
    const args = kind === 'strokes' ? { strokes: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] }
      : kind === 'dabs' ? { dabs: [{ x: 1, y: 1 }] }
        : { regions: [{ id: 'r1', layer_id: 9, color: { red: 1, green: 2, blue: 3 },
          contours: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }] }] };
    const result = await paint.handler(args);
    expect(result.isError).not.toBe(true);
    const details = JSON.parse(textOf(result)).details;
    expect(kind === 'regions' ? details.painted_regions[0].paint_target : details.paint_target).toEqual(target);
  });

  it('rejects meaningless SMUDGE/ERASER color overrides before UXP dispatch', async () => {
    const { connection, router } = fixture();
    const paint = createPaintingTools(connection, router)
      .find((tool) => tool.tool.name === 'photoshop_paint_strokes')!;
    for (const tool of ['SMUDGE', 'ERASER']) {
      const result = await paint.handler({
        strokes: [{
          tool,
          color: { red: 10, green: 20, blue: 30 },
          points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        }],
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(`paint_tool_not_ready:${tool}`);
    }
    expect(bridge.paintStrokes).not.toHaveBeenCalled();
  });

  it('reports stable-command identity conflicts separately from bridge unavailability', async () => {
    bridge.selectPreset.mockResolvedValueOnce({ ok: false, error: 'uxp_bridge_command_id_conflict' });
    const { connection, router } = fixture();
    const select = createPaintingTools(connection, router)
      .find((tool) => tool.tool.name === 'photoshop_select_brush_preset')!;
    const result = await withToolExecutionContext(
      { guardOperationId: 'guard-pass-conflict' },
      () => select.handler({ name: 'Round' })
    );

    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result))).toMatchObject({
      code: 'uxp_command_identity_conflict',
      message: 'uxp_bridge_command_id_conflict',
    });
  });

  it('preflights the whole mixed stroke batch so a later unsupported mechanism cannot follow an earlier rendered stroke', async () => {
    const { connection, router, backendFor } = fixture();
    const paint = createPaintingTools(connection, router)
      .find((tool) => tool.tool.name === 'photoshop_paint_strokes')!;

    const result = await paint.handler({
      document_id: 42,
      strokes: [
        { tool: 'BRUSH', size: 12, points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] },
        { tool: 'SMUDGE', opacity: 50, points: [{ x: 5, y: 5 }, { x: 9, y: 9 }] },
      ],
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('paint_tool_not_ready:SMUDGE');
    expect(bridge.paintStrokes).not.toHaveBeenCalled();
    expect(backendFor).not.toHaveBeenCalled();
  });

  it('does not fall through to ExtendScript after a possibly dispatched UXP painting mutation fails', async () => {
    bridge.paintStrokes.mockResolvedValueOnce({ ok: false, error: 'uxp_failed_after_possible_dispatch' });
    const { connection, router, executeScript } = fixture();
    const paint = createPaintingTools(connection, router)
      .find((tool) => tool.tool.name === 'photoshop_paint_strokes')!;

    const result = await paint.handler({
      document_id: 42,
      strokes: [{ points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }],
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('uxp_failed_after_possible_dispatch');
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('reports authoritative brush setter outcome from effective readback instead of assuming requested values applied', async () => {
    const { connection, router } = fixture();
    const setBrush = createPaintingTools(connection, router)
      .find((tool) => tool.tool.name === 'photoshop_set_brush')!;

    bridge.setBrush.mockResolvedValueOnce({
      ok: true,
      data: { settings: { size: 48, hardness: 100, opacity: 82 } },
    });
    const mismatch = await setBrush.handler({ size: 48, hardness: 70, opacity: 82 });
    const mismatchPayload = JSON.parse(textOf(mismatch));
    expect(mismatchPayload.details.setter_outcome).toBe('not-applied');
    expect(mismatchPayload.details.requested_settings).toMatchObject({ size: 48, hardness: 70, opacity: 82 });
    expect(mismatchPayload.details.effective_settings).toMatchObject({ size: 48, hardness: 100, opacity: 82 });
    expect(mismatchPayload.details.mismatches).toEqual([
      { key: 'hardness', expected: 70, actual: 100 },
    ]);

    bridge.setBrush.mockResolvedValueOnce({
      ok: true,
      data: { settings: { size: 48, hardness: 70, opacity: 82 } },
    });
    const applied = await setBrush.handler({ size: 48, hardness: 70, opacity: 82 });
    const appliedPayload = JSON.parse(textOf(applied));
    expect(appliedPayload.details.setter_outcome).toBe('applied');
    expect(appliedPayload.details.mismatches).toEqual([]);
  });

  it('reports preset setter outcome and preserves exact-recovery metadata', async () => {
    const { connection, router } = fixture();
    const selectPreset = createPaintingTools(connection, router)
      .find((tool) => tool.tool.name === 'photoshop_select_brush_preset')!;

    bridge.selectPreset.mockResolvedValueOnce({
      ok: true,
      data: {
        preset: 'Round',
        settings: { size: 36 },
        setter_recovery: {
          protocol: 'photoshop.uxp.setter_recovery.v1',
          mode: 'authoritative-readback',
          command_id: 'guard-preset-recovery',
          receipt_state: 'claimed',
        },
      },
    });
    const applied = JSON.parse(textOf(await selectPreset.handler({ name: 'Round' })));
    expect(applied.details).toMatchObject({
      setter_outcome: 'applied',
      requested_preset: 'Round',
      effective_preset: 'Round',
      setter_recovery: {
        protocol: 'photoshop.uxp.setter_recovery.v1',
        mode: 'authoritative-readback',
      },
    });

    bridge.selectPreset.mockResolvedValueOnce({
      ok: true,
      data: { preset: 'Other Brush', settings: { size: 36 } },
    });
    const mismatch = JSON.parse(textOf(await selectPreset.handler({ name: 'Round' })));
    expect(mismatch.details).toMatchObject({
      setter_outcome: 'not-applied',
      requested_preset: 'Round',
      effective_preset: 'Other Brush',
    });
  });

  it('fails closed before canonical painting dispatch when UXP is unavailable', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    backendFor.mockRejectedValue(new Error('uxp_bridge_unavailable: test fixture'));
    const tools = createPaintingTools(connection, router);
    const byName = (name: string) => tools.find((tool) => tool.tool.name === name)!;
    const results = [
      await byName('photoshop_select_brush_preset').handler({ name: 'Round' }),
      await byName('photoshop_set_brush').handler({ size: 32 }),
      await byName('photoshop_set_foreground_color').handler({ red: 1, green: 2, blue: 3 }),
      await byName('photoshop_paint_strokes').handler({
        strokes: [{ points: [{ x: 1, y: 1 }] }],
      }),
      await byName('photoshop_paint_regions').handler({
        regions: [{
          id: 'r1',
          color: { red: 1, green: 2, blue: 3 },
          contours: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
        }],
      }),
      await byName('photoshop_paint_dabs').handler({ dabs: [{ x: 1, y: 1 }] }),
    ];

    for (const result of results) expect(result.isError).toBe(true);
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'brush.presets.select',
      'brush.settings.write',
      'foreground.write',
      'painting.strokes',
      'painting.regions',
      'painting.dabs',
    ]);
    expect(executeScript).not.toHaveBeenCalled();
    expect(bridge.selectPreset).not.toHaveBeenCalled();
    expect(bridge.setBrush).not.toHaveBeenCalled();
    expect(bridge.setForeground).not.toHaveBeenCalled();
    expect(bridge.paintStrokes).not.toHaveBeenCalled();
    expect(bridge.paintRegions).not.toHaveBeenCalled();
    expect(bridge.paintDabs).not.toHaveBeenCalled();
  });
});

it('rejects expanded dynamics and SINGLE_HISTORY bypass before any UXP dispatch, retaining the original strokes', async () => {
  vi.clearAllMocks();
  const { connection, router, backendFor } = fixture();
  const paint = createPaintingTools(connection, router).find(tool => tool.tool.name === 'photoshop_paint_strokes')!;
  const args = { document_id: 42, strokes: Array.from({ length: 76 }, (_, i) => ({
    points: [{ x: i, y: 0 }, { x: i + 20, y: 30 }, { x: i + 40, y: 50 }],
    color: { red: 10, green: 20, blue: 30 }, dynamics: { steps: 12, size: [8, 2], opacity: [70, 20] },
  })) };
  const original = structuredClone(args);
  const budget = strokeExecutionBudget(args);
  expect(budget).toMatchObject({ allowed: false, render_strokes: 912, auto_batches: 228 });
  for (const batch_mode of ['AUTO', 'SINGLE_HISTORY']) {
    const result = await paint.handler({ ...args, batch_mode });
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result))).toMatchObject({ execution: 'not-executed' });
  }
  expect(bridge.paintStrokes).not.toHaveBeenCalled();
  expect(backendFor).not.toHaveBeenCalled();
  expect(args).toEqual(original);
  expect(strokeExecutionBudget({ ...args, strokes: args.strokes.slice(0, 2) }).allowed).toBe(true);
  expect(strokeExecutionBudget({ ...args, strokes: args.strokes.slice(0, 2) }, 13000).allowed).toBe(false);
});
