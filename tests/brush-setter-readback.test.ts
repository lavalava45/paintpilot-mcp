import { describe, expect, it, vi } from 'vitest';
import { invokeUxpSelectBrushPreset, invokeUxpSetBrush } from '../src/platform/uxp-bridge-client.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';

vi.mock('../src/platform/uxp-bridge-client.js', () => ({
  invokeUxpSelectBrushPreset: vi.fn(),
  invokeUxpSetBrush: vi.fn(),
}));

function body(result: { content: Array<{ type: string; text?: string }> }) {
  return JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}');
}

describe('native brush setter readback evidence', () => {
  it('refuses fallback defaults and accepts only an explicitly observed native value', async () => {
    const router = { backendFor: vi.fn().mockResolvedValue({}) };
    const setter = createPaintingTools({} as never, router as never)
      .find(definition => definition.tool.name === 'photoshop_set_brush')!;
    vi.mocked(invokeUxpSetBrush).mockResolvedValue({
      ok: true, data: { settings: { hardness: 100 }, observed_fields: [] },
    });
    const unverified = await setter.handler({ hardness: 100 });
    expect(unverified.isError).toBe(true);
    expect(body(unverified)).toMatchObject({
      code: 'brush_setter_unverified',
      details: { setter_outcome: 'uncertain', mismatches: [{ key: 'hardness', reason: 'native_readback_missing' }] },
    });

    vi.mocked(invokeUxpSetBrush).mockResolvedValue({
      ok: true, data: { settings: { hardness: 100 } },
    });
    expect(body(await setter.handler({ hardness: 100 }))).toMatchObject({
      code: 'brush_setter_unverified', details: { setter_outcome: 'uncertain' },
    });

    vi.mocked(invokeUxpSetBrush).mockResolvedValue({
      ok: true, data: { settings: { hardness: 75 }, observed_fields: ['hardness'] },
    });
    expect(body(await setter.handler({ hardness: 100 }))).toMatchObject({
      code: 'brush_setter_unverified', details: { setter_outcome: 'not-applied' },
    });

    vi.mocked(invokeUxpSetBrush).mockResolvedValue({
      ok: true, data: { settings: { hardness: 100 }, observed_fields: ['hardness'] },
    });
    const verified = await setter.handler({ hardness: 100 });
    expect(verified.isError).not.toBe(true);
    expect(body(verified)).toMatchObject({ ok: true, details: { setter_outcome: 'applied' } });
  });

  it('keeps a verified alternative preset selection-only and requires replanning before paint', async () => {
    const router = { backendFor: vi.fn().mockResolvedValue({}) };
    const selector = createPaintingTools({} as never, router as never)
      .find(definition => definition.tool.name === 'photoshop_select_brush_preset')!;
    vi.mocked(invokeUxpSelectBrushPreset)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          preset: null,
          settings: { size: 24 },
          brush_tip: { name: 'Internal Charcoal Tip', source: 'current_tool_options_brush' },
          preset_verification: { source: 'unavailable', observed_preset: null },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          preset: 'Hard Round Pressure Size',
          settings: { size: 24 },
          preset_verification: {
            source: 'photoshop_select_notification',
            observed_preset: 'Hard Round Pressure Size',
          },
        },
      });

    const result = await selector.handler({
      name: 'Square Charcoal',
      fallback_names: ['Hard Round Pressure Size'],
    });
    expect(result.isError).toBe(true);
    expect(body(result)).toMatchObject({
      code: 'brush_setter_unverified',
      details: {
        setter_outcome: 'verified-alternative',
        requested_preset: 'Square Charcoal',
        effective_preset: 'Hard Round Pressure Size',
        verified_alternative_preset: 'Hard Round Pressure Size',
        requires_replan: true,
        selection_only_recovery: true,
        preset_attempts: [
          { requested_preset: 'Square Charcoal', outcome: 'identity-unavailable' },
          { requested_preset: 'Hard Round Pressure Size', outcome: 'verified' },
        ],
      },
    });
    expect(vi.mocked(invokeUxpSelectBrushPreset).mock.calls.map(call => call[0]))
      .toEqual(['Square Charcoal', 'Hard Round Pressure Size']);
  });

  it('does not promote an alternative when its native preset identity is also unavailable', async () => {
    const router = { backendFor: vi.fn().mockResolvedValue({}) };
    const selector = createPaintingTools({} as never, router as never)
      .find(definition => definition.tool.name === 'photoshop_select_brush_preset')!;
    vi.mocked(invokeUxpSelectBrushPreset)
      .mockResolvedValueOnce({
        ok: true,
        data: { preset: null, settings: { size: 24 }, preset_verification: { source: 'unavailable' } },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          preset: null,
          settings: { size: 24 },
          brush_tip: { name: 'Hard Round', source: 'current_tool_options_brush' },
          preset_verification: { source: 'unavailable' },
        },
      });

    const result = await selector.handler({ name: 'Square Charcoal', fallback_names: ['Hard Round'] });
    expect(result.isError).toBe(true);
    expect(body(result)).toMatchObject({
      code: 'brush_setter_unverified',
      details: {
        setter_outcome: 'uncertain',
        requested_preset: 'Square Charcoal',
        effective_preset: null,
        requires_replan: true,
        selection_only_recovery: true,
      },
    });
  });
});
