import { describe, expect, it } from 'vitest';
import {
  classifyError,
  enrichErrorResult,
  wrapToolHandler,
} from './envelope.js';

describe('Photoshop error attribution', () => {
  it('keeps stable-command identity conflicts distinct from bridge availability failures', () => {
    expect(classifyError('uxp_bridge_command_id_conflict')).toMatchObject({
      code: 'uxp_command_identity_conflict',
      suggested_next_tool: 'photoshop_guard_status',
    });
    expect(classifyError('uxp_bridge_unavailable: plugin disconnected')).toMatchObject({
      code: 'uxp_bridge_unavailable',
      suggested_next_tool: 'photoshop_get_capabilities',
    });
  });

  it('classifies stroke-tool readiness failures separately from generic unknown errors', () => {
    expect(classifyError('paint_tool_not_ready:PENCIL: currentToolOptions unavailable')).toMatchObject({
      code: 'paint_tool_not_ready',
    });
    expect(classifyError('brush_settings_unavailable_for_current_tool')).toMatchObject({
      code: 'paint_tool_not_ready',
    });
  });

  it('preserves an already structured error envelope', () => {
    const structured = {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, code: 'document_not_found' }) }],
    };
    expect(enrichErrorResult(structured)).toBe(structured);
  });

  it('normalizes plain error results and thrown handler failures into structured envelopes', async () => {
    expect(enrichErrorResult({
      isError: true,
      content: [{ type: 'text', text: 'Error: no active document' }],
    })).toMatchObject({ isError: true });

    const wrapped = wrapToolHandler('demo', async () => {
      throw new Error('layer not found: Missing');
    });
    const result = await wrapped({});
    const text = result.content.find((item) => item.type === 'text' && 'text' in item)?.text;
    expect(JSON.parse(String(text))).toMatchObject({
      ok: false,
      code: 'layer_not_found',
      suggested_next_tool: 'photoshop_get_layers',
    });
  });
});
