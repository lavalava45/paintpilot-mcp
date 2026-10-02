import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MODEL_CONTEXT_WARNING_BYTES,
  normalizeModelFacingToolArgs,
  sanitizeModelFacingToolResult,
} from '../src/core/model-facing-tool-result.js';

function encoded(bytes: Buffer): string {
  return bytes.toString('base64');
}

describe('model-facing tool result compaction', () => {
  it('defaults direct preview to a materialized reference in Guard-required mode while preserving explicit image opt-in', () => {
    const compact = normalizeModelFacingToolArgs(
      'photoshop_get_preview',
      { max_dimension_px: 1200 },
      { guardRequired: true, runtimeDirectory: 'C:\\runtime', previewId: 'fixture' }
    );
    expect(compact.include_image).toBe(false);
    expect(String(compact.materialize_path)).toContain('direct-previews');
    expect(String(compact.materialize_path)).toContain('preview-fixture.jpg');

    const explicit = normalizeModelFacingToolArgs(
      'photoshop_get_preview',
      { include_image: true },
      { guardRequired: true, runtimeDirectory: 'C:\\runtime', previewId: 'fixture' }
    );
    expect(explicit).toEqual({ include_image: true });

    const compatible = normalizeModelFacingToolArgs(
      'photoshop_get_preview',
      {},
      { guardRequired: false, runtimeDirectory: 'C:\\runtime', previewId: 'fixture' }
    );
    expect(compatible).toEqual({});
  });

  it('removes Guard hot-loop image blocks and redacts binary fields from textual JSON', () => {
    const image = Buffer.alloc(4096, 0x5a);
    const sha = createHash('sha256').update(image).digest('hex');
    const result = sanitizeModelFacingToolResult('photoshop_guard_cycle_auto', {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            bytes: 4096,
            preview: {
              mime_type: 'image/jpeg',
              base64: encoded(image),
              data: encoded(image),
              bytes: [...image.subarray(0, 512)],
            },
          }),
        },
        { type: 'image', data: encoded(image), mimeType: 'image/jpeg' },
      ],
    });

    expect(result.content.filter(item => item.type === 'image')).toHaveLength(0);
    const text = result.content.find(item => item.type === 'text');
    const body = JSON.parse((text as any).text);
    expect(body.bytes).toBe(4096);
    expect(body.preview.base64).toBe(`[binary image omitted: 4096 bytes, sha256=${sha}]`);
    expect(body.preview.data).toBe(`[binary image omitted: 4096 bytes, sha256=${sha}]`);
    expect(body.preview.bytes).toMatch(/^\[binary payload omitted: 512 bytes, sha256=/);
    expect(body.estimated_context_bytes).toBeGreaterThan(0);
    expect(body.context_warning).toBeUndefined();
  });

  it('keeps explicit review image-channel content while still redacting textual base64', () => {
    const image = Buffer.alloc(2048, 0x33);
    const result = sanitizeModelFacingToolResult('photoshop_guard_review_image', {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            accidental: { mimeType: 'image/jpeg', data: encoded(image) },
          }),
        },
        { type: 'image', data: encoded(image), mimeType: 'image/jpeg' },
      ],
    });

    expect(result.content.filter(item => item.type === 'image')).toHaveLength(1);
    const body = JSON.parse((result.content[0] as any).text);
    expect(body.accidental.data).toMatch(/^\[binary image omitted: 2048 bytes, sha256=/);
    expect(body.estimated_context_bytes).toBeGreaterThan(2048);
  });

  it('adds a Guard warning when the sanitized model-facing response is unexpectedly large', () => {
    const result = sanitizeModelFacingToolResult('photoshop_guard_status', {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, diagnostic: 'x'.repeat(MODEL_CONTEXT_WARNING_BYTES + 4096) }),
      }],
    });
    const body = JSON.parse((result.content[0] as any).text);
    expect(body.estimated_context_bytes).toBeGreaterThan(MODEL_CONTEXT_WARNING_BYTES);
    expect(body.context_warning).toMatchObject({
      code: 'large_model_facing_response',
      threshold_bytes: MODEL_CONTEXT_WARNING_BYTES,
    });
  });

  it('redacts data-URL images in otherwise non-JSON text', () => {
    const image = Buffer.alloc(1024, 0x21);
    const result = sanitizeModelFacingToolResult('photoshop_get_preview', {
      content: [{
        type: 'text',
        text: `prefix data:image/jpeg;base64,${encoded(image)} suffix`,
      }],
    });
    const text = (result.content[0] as any).text as string;
    expect(text).not.toContain(encoded(image));
    expect(text).toMatch(/\[binary image omitted: 1024 bytes, sha256=/);
  });
});
