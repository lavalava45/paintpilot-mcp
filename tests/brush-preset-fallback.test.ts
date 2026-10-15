import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invokeUxpSelectBrushPreset } from '../src/platform/uxp-bridge-client.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';

vi.mock('../src/platform/uxp-bridge-client.js', () => ({ invokeUxpSelectBrushPreset: vi.fn() }));

const mockSelect = vi.mocked(invokeUxpSelectBrushPreset);
const router = { backendFor: vi.fn().mockResolvedValue({}) };
const tool = () => createPaintingTools({} as never, router as never)
  .find(t => t.tool.name === 'photoshop_select_brush_preset')!;
const body = (r: { content: Array<{ type: string; text?: string }> }) =>
  JSON.parse(r.content.find(x => x.type === 'text')?.text ?? '{}');

describe('verified brush fallback is selection-only', () => {
  beforeEach(() => { mockSelect.mockReset(); });

  it('requires a new plan when a named fallback is confirmed by native readback', async () => {
    mockSelect.mockResolvedValueOnce({ ok: true, data: { preset: null, settings: {} } } as never)
      .mockResolvedValueOnce({ ok: true, data: { preset: 'Dry Brush', settings: {} } } as never);
    const result = await tool().handler({ name: 'Square Charcoal', fallback_names: ['Dry Brush'] });
    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(result.isError).toBe(true);
    expect(body(result)).toMatchObject({ code: 'brush_setter_unverified', details: {
      setter_outcome: 'verified-alternative', verified_alternative_preset: 'Dry Brush',
      requested_preset: 'Square Charcoal', requires_replan: true, selection_only_recovery: true,
    } });
  });

  it('never accepts an unconfirmed fallback as successful selection', async () => {
    mockSelect.mockResolvedValue({ ok: true, data: { preset: null, settings: {} } } as never);
    const result = await tool().handler({ name: 'Square Charcoal', fallback_names: ['Dry Brush'] });
    expect(result.isError).toBe(true);
    expect(body(result).details.verified_alternative_preset).toBeUndefined();
    expect(body(result)).toMatchObject({ code: 'brush_setter_unverified', details: {
      requires_replan: true,
      safe_generic_brush_replan: {
        only_if_exact_preset_not_required: true,
        method_id: 'hard-brush-line',
        preparation_tool: 'photoshop_set_brush',
        painting_tool: 'photoshop_paint_strokes',
        preset_selection_required: false,
        fresh_native_settings_readback_required: true,
        new_operation_required: true,
      },
    } });
  });

  it('gives one unverified named brush an actionable non-preset route without certifying the requested name', async () => {
    mockSelect.mockResolvedValue({ ok: true, data: { preset: null, settings: { size: 52, hardness: 0, spacing: 25 },
      preset_verification: { source: 'unavailable' } } } as never);
    const result = await tool().handler({ name: 'Hard Round' });
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(body(result)).toMatchObject({ code: 'brush_setter_unverified', details: {
      requested_preset: 'Hard Round', effective_preset: null,
      requires_replan: true,
      safe_generic_brush_replan: { method_id: 'hard-brush-line', preset_selection_required: false },
    } });
  });

  it('rejects more than three fallback names without touching Photoshop', async () => {
    const result = await tool().handler({ name: 'Square Charcoal', fallback_names: ['A','B','C','D'] });
    expect(result.isError).toBe(true);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
