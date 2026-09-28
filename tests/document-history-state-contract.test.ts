import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../src/platform/photoshop-backend.js';

const bridge = vi.hoisted(() => ({
  createDocument: vi.fn(),
  operation: vi.fn(),
  saveDocument: vi.fn(),
  undo: vi.fn(),
}));

vi.mock('../src/platform/uxp-bridge-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/uxp-bridge-client.js')>();
  return {
    ...actual,
    invokeUxpCreateDocument: bridge.createDocument,
    invokeUxpOperation: bridge.operation,
    invokeUxpSaveDocument: bridge.saveDocument,
    invokeUxpUndo: bridge.undo,
  };
});

import { createDocumentTools } from '../src/tools/document-tools.js';
import { createHistoryTools } from '../src/tools/history-tools.js';
import { createStateTools } from '../src/tools/state-tools.js';

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === 'text')?.text ?? '';
}

function fixture() {
  const connection = {
    getVersion: vi.fn(async () => '27.9.1'),
    executeScript: vi.fn(async () => {
      throw new Error('legacy_dispatch_must_not_run');
    }),
  } as unknown as PhotoshopConnection;
  const backendFor = vi.fn(async (_primitive: PhotoshopPrimitive) => ({ kind: 'uxp' as const }));
  const readDocumentInfo = vi.fn(async () => ({
    hasDocument: true,
    document: { id: 42, name: 'Demo.psd', width: 100, height: 80 },
  }));
  const listDocuments = vi.fn(async () => ({
    ok: true,
    count: 2,
    active_document_id: 42,
    documents: [{ id: 42, name: 'Demo.psd' }, { id: 84, name: 'Other.psd' }],
  }));
  const readHistory = vi.fn(async () => ({ ok: true, active_index: 3, states: [{ id: 3, name: 'Paint' }] }));
  const readState = vi.fn(async () => ({ hasDocument: true, document: { id: 42, name: 'Demo.psd' } }));
  const router = {
    backendFor,
    readDocumentInfo,
    listDocuments,
    readHistory,
    readState,
  } as unknown as PhotoshopBackendRouter;
  return { connection, router, backendFor, readDocumentInfo, listDocuments, readHistory, readState };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.createDocument.mockResolvedValue({
    ok: true,
    data: { id: 101, name: 'Untitled-1' },
    receipt: { state: 'completed' },
  });
  bridge.operation.mockResolvedValue({ ok: true, data: { ok: true } });
  bridge.saveDocument.mockResolvedValue({
    ok: true,
    data: { invariants_ok: true, invariants: {}, before: { document_id: 42 }, after: { document_id: 42 } },
  });
  bridge.undo.mockResolvedValue({ ok: true, data: { ok: true, undone: 1 } });
});

describe('document/history/state public contract', () => {
  it('keeps the exact family tool names', () => {
    const { connection, router } = fixture();
    expect(createDocumentTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_create_document',
      'photoshop_get_document_info',
      'photoshop_list_documents',
      'photoshop_set_active_document',
      'photoshop_save_document',
      'photoshop_close_document',
    ]);
    expect(createHistoryTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_undo',
      'photoshop_redo',
      'photoshop_get_history',
    ]);
    expect(createStateTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_get_state',
      'photoshop_get_preview',
      'photoshop_get_capabilities',
    ]);
  });

  it('routes document create/activate/close through declared UXP primitives and preserves payload semantics', async () => {
    const { connection, router, backendFor } = fixture();
    const tools = createDocumentTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    const created = await byName('photoshop_create_document').handler({
      width: 640,
      height: 480,
      resolution: 144,
      colorMode: 'CMYK',
      _guard_operation_id: 'stable-create-1',
    });
    expect(created.isError).not.toBe(true);
    expect(bridge.createDocument).toHaveBeenCalledWith(
      { width: 640, height: 480, resolution: 144, colorMode: 'CMYK' },
      'stable-create-1'
    );

    bridge.operation.mockResolvedValueOnce({
      ok: true,
      data: { ok: true, activated: { id: 84, name: 'Other.psd' } },
    });
    const activated = await byName('photoshop_set_active_document').handler({ document_id: 84 });
    expect(JSON.parse(textOf(activated))).toMatchObject({
      ok: true,
      details: {
        activated: { id: 84, name: 'Other.psd' },
        ui_effect: {
          classification: 'ui-activating-navigation',
          may_foreground_photoshop: true,
          eligible_for_no_focus_acceptance: false,
        },
      },
    });
    expect(byName('photoshop_set_active_document').tool.description).toMatch(/may foreground Photoshop/i);
    expect(bridge.operation).toHaveBeenLastCalledWith(
      'set_active_document',
      { document_id: 84 },
      'uxp_set_active_document_failed'
    );

    bridge.operation.mockResolvedValueOnce({ ok: true, data: { ok: true } });
    const closed = await byName('photoshop_close_document').handler({ document_id: 84, save: false });
    expect(textOf(closed)).toBe('Document closed without saving');
    expect(bridge.operation).toHaveBeenLastCalledWith(
      'close_document',
      { save: false, document_id: 84 },
      'uxp_close_document_failed'
    );
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'document.create',
      'document.activate',
      'document.close',
    ]);
  });

  it('keeps document read/save result contracts and rejects ambiguous activation input before dispatch', async () => {
    const { connection, router, backendFor } = fixture();
    const tools = createDocumentTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    const info = await byName('photoshop_get_document_info').handler({});
    expect(textOf(info)).toContain('Document info:\n');
    expect(textOf(info)).toContain('"id": 42');

    const listed = JSON.parse(textOf(await byName('photoshop_list_documents').handler({})));
    expect(listed).toMatchObject({
      ok: true,
      summary: '2 open documents',
      details: { count: 2, active_document_id: 42 },
    });

    const invalid = await byName('photoshop_set_active_document').handler({ document_id: 42, index: 0 });
    expect(JSON.parse(textOf(invalid))).toMatchObject({ ok: false, code: 'invalid_arguments' });

    const saved = JSON.parse(textOf(await byName('photoshop_save_document').handler({
      path: 'C:\\tmp\\checkpoint.psd',
      format: 'PSD',
      document_id: 42,
    })));
    expect(saved).toMatchObject({
      ok: true,
      details: { persistence: { transport: 'uxp', as_copy: true, invariants_ok: true } },
    });
    expect(bridge.saveDocument).toHaveBeenCalledWith({
      path: 'C:\\tmp\\checkpoint.psd', format: 'PSD', quality: 8, document_id: 42,
    });
    expect(backendFor).not.toHaveBeenCalledWith('document.save');
  });

  it('keeps undo/redo/history behavior on the UXP-only path', async () => {
    const { connection, router, backendFor } = fixture();
    const tools = createHistoryTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(textOf(await byName('photoshop_undo').handler({ steps: 2, document_id: 42 })))
      .toContain('Undo successful (2 steps)');
    expect(bridge.undo).toHaveBeenCalledWith({ document_id: 42, steps: 2 });

    bridge.operation.mockResolvedValueOnce({ ok: true, data: { ok: true, redone: 2 } });
    expect(textOf(await byName('photoshop_redo').handler({ steps: 2, document_id: 42 })))
      .toContain('Redo successful (2 steps)');
    expect(bridge.operation).toHaveBeenCalledWith(
      'redo', { steps: 2, document_id: 42 }, 'uxp_redo_failed'
    );

    expect(textOf(await byName('photoshop_get_history').handler({}))).toContain('History States:\n');
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual(['history.undo', 'history.redo']);
  });

  it('keeps state and capability reads free of legacy dispatch', async () => {
    const { connection, router, readState } = fixture();
    const tools = createStateTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(JSON.parse(textOf(await byName('photoshop_get_state').handler({})))).toMatchObject({
      hasDocument: true,
      document: { id: 42 },
    });
    expect(readState).toHaveBeenCalledTimes(1);

    const capabilities = JSON.parse(textOf(await byName('photoshop_get_capabilities').handler({})));
    expect(capabilities.version).toBeTruthy();
    expect(connection.executeScript).not.toHaveBeenCalled();
  });
});
