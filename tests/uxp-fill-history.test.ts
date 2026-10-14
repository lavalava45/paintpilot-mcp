import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Exercise the ACTUAL fillLayer function from the installed UXP entry source,
// not an imitation of the business logic. No Photoshop execution here.
const main = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8');
const begin = main.indexOf('async function fillLayer(params = {}) {');
const end = main.indexOf('// Cubic extent math mirrors', begin);
if (begin < 0 || end < 0) throw new Error('UXP fillLayer source extraction changed');
const fillSource = main.slice(begin, end);

function fixture(options: {
  hadSelection?: boolean; requestedLayerId?: number; fillFails?: boolean;
  resumeFails?: boolean; noFillConfirmation?: boolean; wrongDocument?: boolean;
} = {}) {
  const order: string[] = [];
  const originalLayer = { id: 2 };
  const targetLayer = { id: 3 };
  const doc = {
    id: 42,
    activeLayers: [originalLayer],
    selection: {
      selectAll: vi.fn(async () => { order.push('selectAll'); }),
      deselect: vi.fn(async () => { order.push('deselect'); }),
    },
  };
  const suspendHistory = vi.fn(async () => { order.push('suspend'); return 17; });
  const resumeHistory = vi.fn(async (_id: number, commit: boolean) => {
    order.push(commit ? 'commit' : 'abort');
    if (options.resumeFails && commit) throw new Error('Photoshop history commit failed');
  });
  const batchPlay = vi.fn(async (commands: Array<{ _obj: string; _target?: unknown }>) => {
    const command = commands[0]!;
    if (command._obj === 'get') return [{ name: 'Calibration swatch', id: 3 }];
    if (command._obj === 'select') {
      order.push('selectLayer');
      doc.activeLayers = [doc.activeLayers[0]?.id === 2 ? targetLayer : originalLayer];
      return [{}];
    }
    if (command._obj === 'fill') {
      order.push('fill');
      if (options.fillFails) return [{ _obj: 'error', message: 'Photoshop refused fill' }];
      if (options.noFillConfirmation) return null;
      return [{}];
    }
    throw new Error('Unexpected UXP descriptor: ' + command._obj);
  });
  let descriptorReads = 0;
  const readSessionDescriptors = vi.fn(async () => {
    descriptorReads++;
    return {
      documentCount: 1,
      documentDescriptor: {
        documentID: options.wrongDocument ? 99 : 42,
        ...(options.hadSelection ? { selection: {} } : {}),
      },
    };
  });
  const context = {
    action: { batchPlay },
    READ_BATCHPLAY_OPTIONS: { synchronousExecution: true },
    app: { activeDocument: doc, documents: [doc] },
    core: { executeAsModal: (fn: (context: unknown) => unknown) => fn({ hostControl: { suspendHistory, resumeHistory } }) },
    readSessionDescriptors,
    normalizeSessionState: (value: unknown) => value,
    numericValue: (value: unknown) => value,
    layerByIdDescriptor: (id: number) => ({ _obj: 'get', id }),
    selectLayerByIdDescriptor: (id: number) => ({ _obj: 'select', id }),
    layerSectionValue: () => 'layerSectionContent',
    legacyLayerKind: () => 'LayerKind.NORMAL',
    fillLayerLockState: () => false,
  };
  const { fillLayer } = runInNewContext(fillSource + '\n({ fillLayer })', context) as {
    fillLayer: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  return { fillLayer, order, doc, batchPlay, suspendHistory, resumeHistory, readSessionDescriptors, descriptorReads };
}

describe('E.11 UXP fill preparation and exact owned Photoshop History', () => {
  it('commits selection + fill + deselect + temporary layer routing as exactly one named history unit', async () => {
    const f = fixture();
    const result = await f.fillLayer({ document_id: 42, layer_id: 3, red: 221, green: 55, blue: 160 });
    expect(result).toMatchObject({ filled: true, layerId: 3, history_steps: 1 });
    expect(f.order).toEqual(['suspend', 'selectLayer', 'selectAll', 'fill', 'deselect', 'selectLayer', 'commit']);
    expect(f.doc.activeLayers[0]?.id).toBe(2);
    expect(f.suspendHistory).toHaveBeenCalledWith({ documentID: 42, name: 'MCP Fill Layer' });
    expect(f.resumeHistory).toHaveBeenCalledExactlyOnceWith(17, true);
  });

  it('reuses an existing user selection without selecting/deselecting the canvas', async () => {
    const f = fixture({ hadSelection: true });
    expect(await f.fillLayer({ document_id: 42, layer_id: 2, red: 20, green: 30, blue: 40 }))
      .toMatchObject({ filled: true, history_steps: 1 });
    expect(f.order).toEqual(['suspend', 'fill', 'commit']);
    expect(f.doc.selection.selectAll).not.toHaveBeenCalled();
    expect(f.doc.selection.deselect).not.toHaveBeenCalled();
  });

  it.each([{ fillFails: true }, { noFillConfirmation: true }, { resumeFails: true }])(
    'never reports successful owned history if execution or commit fails: %#', async opts => {
      const f = fixture(opts);
      await expect(f.fillLayer({ document_id: 42, layer_id: 3, red: 2, green: 3, blue: 4 })).rejects.toThrow();
      expect(f.resumeHistory).toHaveBeenCalledWith(17, false);
      expect(f.order.at(-1)).toBe('abort');
      expect(f.doc.activeLayers[0]?.id).toBe(2);
    }
  );

  it('rejects a different active document before suspending or filling Photoshop history', async () => {
    const f = fixture({ wrongDocument: true });
    await expect(f.fillLayer({ document_id: 42, layer_id: 3, red: 2, green: 3, blue: 4 }))
      .rejects.toThrow('document_not_active');
    expect(f.suspendHistory).not.toHaveBeenCalled();
    expect(f.order).toEqual([]);
  });
});
