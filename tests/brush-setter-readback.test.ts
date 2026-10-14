import { describe, expect, it, vi } from 'vitest';
import { invokeUxpSetBrush } from '../src/platform/uxp-bridge-client.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';

vi.mock('../src/platform/uxp-bridge-client.js', () => ({
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
});
