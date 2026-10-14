import { describe, expect, it, vi } from 'vitest';
import { invokeUxpSetBrush } from '../src/platform/uxp-bridge-client.js';
import { createPaintingTools } from '../src/tools/painting-tools.js';

vi.mock('../src/platform/uxp-bridge-client.js', () => ({ invokeUxpSetBrush: vi.fn() }));

const setter = createPaintingTools({} as never, { backendFor: vi.fn().mockResolvedValue({}) } as never)
  .find(definition => definition.tool.name === 'photoshop_set_brush')!;

function resultBody(result: { content: Array<{ type: string; text?: string }> }) {
  return JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}');
}

describe('brush setter native integer precision', () => {
  it('accepts Photoshop-confirmed rounding of percentage settings without losing the original request', async () => {
    vi.mocked(invokeUxpSetBrush).mockResolvedValue({
      ok: true,
      data: { settings: { opacity: 38, flow: 63, smoothing: 14 }, observed_fields: ['opacity', 'flow', 'smoothing'] },
    });
    const result = await setter.handler({ opacity: 37.5, flow: 62.6, smoothing: 13.7 });
    expect(result.isError).not.toBe(true);
    expect(resultBody(result)).toMatchObject({
      ok: true,
      details: {
        setter_outcome: 'applied',
        requested_settings: { opacity: 37.5, flow: 62.6, smoothing: 13.7 },
        effective_settings: { opacity: 38, flow: 63, smoothing: 14 },
      },
    });
  });

  it('still rejects an observed integer mismatch and missing native evidence', async () => {
    vi.mocked(invokeUxpSetBrush).mockResolvedValue({
      ok: true, data: { settings: { opacity: 37 }, observed_fields: ['opacity'] },
    });
    expect(resultBody(await setter.handler({ opacity: 37.5 }))).toMatchObject({
      code: 'brush_setter_unverified', details: { setter_outcome: 'not-applied' },
    });
    vi.mocked(invokeUxpSetBrush).mockResolvedValue({
      ok: true, data: { settings: { opacity: 38 }, observed_fields: [] },
    });
    expect(resultBody(await setter.handler({ opacity: 37.5 }))).toMatchObject({
      code: 'brush_setter_unverified', details: { setter_outcome: 'uncertain' },
    });
  });
});
