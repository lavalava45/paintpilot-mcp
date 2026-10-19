import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionTools } from '../src/tools/selection-catalog.js';
import { runSelectRectangle } from '../src/tools/selection-operations.js';

const selectRectangle = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/uxp-bridge-client.js', () => ({
  invokeUxpSelectRectangle: selectRectangle,
}));

const router = { backendFor: vi.fn(async () => ({ kind: 'uxp' })) } as any;
const bounds = { left: 4, top: 5, right: 44, bottom: 55 };

describe('native rectangle selection document pin', () => {
  beforeEach(() => {
    selectRectangle.mockReset();
    router.backendFor.mockClear();
    selectRectangle.mockResolvedValue({ ok: true, data: { shape: 'rectangle' } });
  });

  it('exposes optional document_id for Guard automatic step pinning', () => {
    const schema = createSelectionTools({} as any, router)
      .find(tool => tool.tool.name === 'photoshop_select_rectangle')!.tool.inputSchema;
    expect(schema.properties.document_id).toMatchObject({ type: 'integer', minimum: 1 });
    expect(schema.required).toEqual(['left', 'top', 'right', 'bottom']);
  });

  it('preserves legacy direct mode and exact coordinate arguments', async () => {
    expect((await runSelectRectangle(router, bounds)).isError).not.toBe(true);
    expect(selectRectangle).toHaveBeenCalledWith(bounds);
  });

  it('sends the exact pinned document to native modal selection without changing bounds', async () => {
    expect((await runSelectRectangle(router, { document_id: 42, ...bounds })).isError).not.toBe(true);
    expect(selectRectangle).toHaveBeenCalledWith({ document_id: 42, ...bounds });
  });

  it('rejects malformed explicit document pins before native dispatch', async () => {
    for (const document_id of [-1, 0, 1.5, '42']) {
      expect((await runSelectRectangle(router, { ...bounds, document_id })).isError).toBe(true);
    }
    expect(router.backendFor).not.toHaveBeenCalled();
    expect(selectRectangle).not.toHaveBeenCalled();
  });

  it('does not report success if native modal pin check rejects an inactive document', async () => {
    selectRectangle.mockResolvedValueOnce({
      ok: false, error: 'document_not_active: pinned document 42 is open but not active',
    });
    expect((await runSelectRectangle(router, { document_id: 42, ...bounds })).isError).toBe(true);
  });
});
