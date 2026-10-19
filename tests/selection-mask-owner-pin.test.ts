import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCreateLayerMask } from '../src/tools/selection-operations.js';
import { createSelectionTools } from '../src/tools/selection-catalog.js';

const create = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/uxp-bridge-client.js', () => ({
  invokeUxpCreateLayerMask: create,
}));

const router = { backendFor: vi.fn(async () => ({})) } as any;
const bounds = { left: 10, top: 20, right: 40, bottom: 60 };

describe('mask native owner and selection pin transport', () => {
  beforeEach(() => {
    create.mockReset();
    router.backendFor.mockClear();
    create.mockResolvedValue({ ok: true, data: { maskCreated: true } });
  });

  it('retains backward-compatible direct mode without an implicit new ownership requirement', async () => {
    expect((await runCreateLayerMask(router, { document_id: 42 })).isError).not.toBe(true);
    expect(create).toHaveBeenCalledWith({ document_id: 42 });
  });

  it('requires exact document, layer and explicit mask semantics before native dispatch', async () => {
    for (const args of [
      { layer_id: 9, mask_mode: 'revealSelection', expected_selection_bounds: bounds },
      { document_id: 42, layer_id: 9 },
      { document_id: 42, mask_mode: 'revealAll' },
      { document_id: 42, layer_id: -1, mask_mode: 'revealAll' },
      { document_id: 42, layer_id: 9, mask_mode: 'revealSelection' },
      { document_id: 42, layer_id: 9, mask_mode: 'revealSelection',
        expected_selection_bounds: { left: 10, top: 20 } },
    ]) expect((await runCreateLayerMask(router, args)).isError).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(router.backendFor).not.toHaveBeenCalled();
  });

  it('transports pinned selection snapshot and explicit reveal mode to native UXP', async () => {
    const args = { document_id: 42, layer_id: 9, mask_mode: 'revealSelection', expected_selection_bounds: bounds };
    expect((await runCreateLayerMask(router, args)).isError).not.toBe(true);
    expect(create).toHaveBeenCalledWith(args);
    expect((await runCreateLayerMask(router, { document_id: 42, layer_id: 9, mask_mode: 'revealAll' })).isError).not.toBe(true);
    expect(create).toHaveBeenLastCalledWith({ document_id: 42, layer_id: 9, mask_mode: 'revealAll' });
  });

  it('publishes optional pin fields in the direct selection tool contract', () => {
    const tool = createSelectionTools({} as any, router).find(x => x.tool.name === 'photoshop_create_layer_mask')!;
    expect(tool.tool.inputSchema.properties).toHaveProperty('layer_id');
    expect(tool.tool.inputSchema.properties).toHaveProperty('mask_mode');
    expect(tool.tool.inputSchema.properties).toHaveProperty('expected_selection_bounds');
    expect(tool.tool.inputSchema.required).toBeUndefined();
  });
});
