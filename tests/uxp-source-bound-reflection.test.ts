import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const sourceCode = readFileSync(new URL('../uxp-plugin/p1-layer-ops.js', import.meta.url), 'utf8');
const b = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

function nativeFixture(options: { flipFails?: boolean; stale?: boolean; commitFails?: boolean } = {}) {
  const calls: string[] = [];
  let clone: any;
  const doc: any = { id: 42, width: 400, height: 700, layers: [], activeLayers: [] };
  const sourceLayer: any = {
    id: 3, kind: 'normal', visible: true, isBackgroundLayer: false,
    bounds: b(80, 40, 250, options.stale ? 302 : 300),
    duplicate: vi.fn(async () => {
      calls.push('duplicate');
      clone = {
        id: 9, kind: 'normal', visible: true, isBackgroundLayer: false,
        bounds: { ...sourceLayer.bounds }, name: 'Source copy', opacity: 100,
        translate: vi.fn(async (x: number, y: number) => {
          calls.push(`translate:${x},${y}`);
          clone.bounds = b(clone.bounds.left + x, clone.bounds.top + y,
            clone.bounds.right + x, clone.bounds.bottom + y);
        }),
        move: vi.fn((_receiver: any, _placement: any) => { calls.push('place-above-water'); }),
      };
      doc.layers.unshift(clone);
      return clone;
    }),
  };
  const waterLayer = { id: 4, kind: 'normal', visible: true, isBackgroundLayer: false,
    bounds: b(0, 300, 400, 700) };
  doc.layers = [sourceLayer, waterLayer];
  doc.activeLayers = [waterLayer];
  const hostControl = {
    suspendHistory: vi.fn(async () => { calls.push('suspend'); return 123; }),
    resumeHistory: vi.fn(async (_id: number, commit: boolean) => {
      calls.push(commit ? 'commit' : 'abort');
      if (commit && options.commitFails) throw new Error('native commit failed');
      if (!commit) doc.layers = [sourceLayer, waterLayer];
    }),
  };
  const action = { batchPlay: vi.fn(async (descriptors: any[]) => {
    const request = descriptors[0];
    if (request._obj === 'select') {
      const id = request._target[0]._id;
      const selected = doc.layers.find((layer: any) => layer.id === id);
      if (!selected) throw new Error('unknown native layer');
      doc.activeLayers = [selected];
      calls.push(`select:${id}`);
      return [{}];
    }
    if (request._obj === 'transform') {
      calls.push('native-flip');
      if (options.flipFails) throw new Error('flip descriptor rejected');
      if (request._target[0]._id !== clone?.id || request.height?._value !== -100
          || request.width?._value !== 100) throw new Error('not a pinned native vertical flip');
      return [{}];
    }
    throw new Error('unrecognized native command');
  }) };
  const photos = {
    app: { documents: [doc], activeDocument: doc },
    action, core: { executeAsModal: (fn: any) => fn({ hostControl }) },
    constants: { LayerKind: { NORMAL: 'normal' }, ElementPlacement: { PLACEBEFORE: 'above' } },
  };
  const sandbox: any = { require: (name: string) => name === 'photoshop' ? photos : undefined,
    module: { exports: {} } };
  runInNewContext(sourceCode, sandbox);
  const handle = sandbox.module.exports.tryHandleP1LayerOperation as
    (name: string, params: unknown) => Promise<{ handled: boolean; data: any }>;
  const request = { document_id: 42, source_layer_id: 3, receiver_layer_id: 4,
    expected_source_bounds: b(80, 40, 250, 300), waterline_y: 300,
    name: 'House pixel reflection', opacity: 60 };
  return { handle, request, calls, doc, sourceLayer, waterLayer, hostControl, getCopy: () => clone };
}

describe('native source-bound reflection raster transport', () => {
  it('duplicates real source pixels, flips vertically, moves below waterline, and commits one History unit', async () => {
    const f = nativeFixture();
    const receipt = (await f.handle('source_bound_reflection', f.request)).data;
    expect(receipt).toMatchObject({ reflected: true, history_steps: 1,
      layerId: 9, layerName: 'House pixel reflection', source_layer_id: 3, receiver_layer_id: 4,
      reflected_bounds: b(80, 300, 250, 560) });
    expect(f.calls).toEqual(['suspend', 'select:3', 'duplicate', 'select:9', 'native-flip',
      'translate:0,260', 'place-above-water', 'select:4', 'commit']);
    expect(f.hostControl.resumeHistory).toHaveBeenCalledExactlyOnceWith(123, true);
    expect(f.sourceLayer.bounds).toEqual(b(80, 40, 250, 300));
    expect(f.waterLayer.bounds).toEqual(b(0, 300, 400, 700));
    expect(f.getCopy().opacity).toBe(60);
  });
  it('refuses stale bounds and unsupported waterline before mutation', async () => {
    const f = nativeFixture({ stale: true });
    await expect(f.handle('source_bound_reflection', f.request)).rejects.toThrow('reflection_source_bounds_stale');
    expect(f.calls).toEqual([]);
  });
  it('rolls back the duplicate when Photoshop rejects the vertical flip', async () => {
    const f = nativeFixture({ flipFails: true });
    await expect(f.handle('source_bound_reflection', f.request)).rejects.toThrow('flip descriptor rejected');
    expect(f.calls).toContain('abort');
    expect(f.calls).not.toContain('commit');
    expect(f.doc.layers).toEqual([f.sourceLayer, f.waterLayer]);
  });
  it('does not misreport a failed native History commit as success', async () => {
    const f = nativeFixture({ commitFails: true });
    await expect(f.handle('source_bound_reflection', f.request)).rejects.toThrow('native commit failed');
    expect(f.hostControl.resumeHistory).toHaveBeenCalledWith(123, false);
  });
});
