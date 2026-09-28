import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../src/platform/photoshop-backend.js';

const bridge = vi.hoisted(() => ({ operation: vi.fn() }));

vi.mock('../src/platform/uxp-bridge-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/uxp-bridge-client.js')>();
  return { ...actual, invokeUxpOperation: bridge.operation };
});

import { createTextTools } from '../src/tools/text-tools.js';
import { createStyleTools } from '../src/tools/style-tools.js';

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === 'text')?.text ?? '';
}

function fixture() {
  const connection = {} as PhotoshopConnection;
  const backendFor = vi.fn(async (_primitive: PhotoshopPrimitive) => ({ kind: 'uxp' as const }));
  const router = { backendFor } as unknown as PhotoshopBackendRouter;
  return { connection, router, backendFor };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.operation.mockImplementation(async (action: string, payload: Record<string, unknown>) => ({
    ok: true,
    data: action === 'list_fonts'
      ? { fonts: ['Inter-Regular'], count: 1 }
      : action === 'apply_layer_style'
        ? { layer_name: 'Title', ...payload }
        : { action, ...payload },
  }));
});

describe('text + style public contract', () => {
  it('keeps the established six-tool surface and schema defaults', () => {
    const { connection, router } = fixture();
    const text = createTextTools(connection, router);
    const style = createStyleTools(connection, router);
    expect(text.map((item) => item.tool.name)).toEqual([
      'photoshop_list_fonts',
      'photoshop_set_text_font',
      'photoshop_set_text_color',
      'photoshop_set_text_alignment',
      'photoshop_update_text_content',
    ]);
    expect(style.map((item) => item.tool.name)).toEqual(['photoshop_apply_layer_style']);
    expect((style[0]!.tool.inputSchema.properties as Record<string, { default?: unknown }>).style.default)
      .toBe('drop_shadow');
  });

  it('routes text reads and pinned mutations through UXP only', async () => {
    const { connection, router, backendFor } = fixture();
    const tools = createTextTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(textOf(await byName('photoshop_list_fonts').handler({ query: 'Inter', limit: 12 })))
      .toContain('Fonts listed (query: "Inter")');
    expect(textOf(await byName('photoshop_set_text_font').handler({
      fontName: 'Inter-Regular', fontSize: 24, document_id: 42,
    }))).toContain('Text font set to Inter-Regular, size 24pt');
    expect(textOf(await byName('photoshop_set_text_color').handler({
      red: 10, green: 20, blue: 30, document_id: 42,
    }))).toBe('Text color set to RGB(10, 20, 30)');
    expect(textOf(await byName('photoshop_set_text_alignment').handler({
      alignment: 'CENTER', document_id: 42,
    }))).toBe('Text alignment set to CENTER');
    expect(textOf(await byName('photoshop_update_text_content').handler({
      text: 'Independent text', document_id: 42,
    }))).toBe('Text content updated to: "Independent text"');

    expect(bridge.operation.mock.calls).toEqual([
      ['list_fonts', { query: 'Inter', limit: 12 }, 'uxp_list_fonts_failed'],
      ['set_text_font', { document_id: 42, fontName: 'Inter-Regular', fontSize: 24 }, 'uxp_set_text_font_failed'],
      ['set_text_color', { document_id: 42, red: 10, green: 20, blue: 30 }, 'uxp_set_text_color_failed'],
      ['set_text_alignment', { document_id: 42, alignment: 'CENTER' }, 'uxp_set_text_alignment_failed'],
      ['update_text_content', { document_id: 42, text: 'Independent text' }, 'uxp_update_text_content_failed'],
    ]);
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'text.fonts.list', 'text.font.write', 'text.color.write', 'text.alignment.write', 'text.content.write',
    ]);
  });

  it('normalizes style parameters and preserves the pinned target', async () => {
    const { connection, router, backendFor } = fixture();
    const style = createStyleTools(connection, router)[0]!;
    const result = await style.handler({
      style: 'stroke',
      red: -10,
      green: 300,
      blue: 25.4,
      opacity: 101,
      size: 7.6,
      distance: -2,
      angle: 450,
      document_id: 42,
    });
    expect(JSON.parse(textOf(result))).toMatchObject({
      ok: true,
      summary: 'Layer style stroke applied',
      details: { style: 'stroke', layer_name: 'Title' },
    });
    expect(bridge.operation).toHaveBeenCalledWith('apply_layer_style', {
      style: 'stroke',
      red: 0,
      green: 255,
      blue: 25,
      opacity: 100,
      size: 8,
      distance: 0,
      angle: 360,
      document_id: 42,
    }, 'uxp_apply_layer_style_failed');
    expect(backendFor).toHaveBeenCalledWith('layer.style.apply');
  });

  it('fails closed before or after UXP dispatch without alternate execution', async () => {
    const { connection, router, backendFor } = fixture();
    backendFor.mockRejectedValueOnce(new Error('uxp_bridge_unavailable: contract'));
    const text = createTextTools(connection, router)[1]!;
    expect((await text.handler({ fontName: 'Inter-Regular', document_id: 42 })).isError).toBe(true);
    expect(bridge.operation).not.toHaveBeenCalled();

    backendFor.mockResolvedValue({ kind: 'uxp' });
    bridge.operation.mockResolvedValueOnce({ ok: false, error: 'uxp_failed_after_dispatch' });
    const style = createStyleTools(connection, router)[0]!;
    const failed = await style.handler({ style: 'outer_glow', document_id: 42 });
    expect(failed.isError).toBe(true);
    expect(textOf(failed)).toContain('uxp_failed_after_dispatch');
  });
});
