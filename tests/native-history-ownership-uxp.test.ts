import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Private simulated UXP modal only. No Photoshop desktop or original document.
const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
  .replace(/\npollLoop\(\);\s*$/, '\n');

function fixture(options: { unavailable?: boolean; createdSteps?: number; gradientSteps?: number } = {}) {
  let historyIndex = 4;
  const layer = { id: 88, name: 'One field', parent: null };
  const doc = { id: 42, createLayer: async () => {
    historyIndex += options.createdSteps ?? 1;
    return layer;
  } };
  const action = { batchPlay: async (items: any[]) => items.map(item => {
    if (item?._target?.[0]?._ref === 'historyState') {
      if (options.unavailable) return { _obj: 'error' };
      return { itemIndex: historyIndex, count: historyIndex + 2 };
    }
    if (item._obj === 'gradientClassEvent') {
      historyIndex += options.gradientSteps ?? 1;
      return {};
    }
    if (item._obj === 'get') return { layerLocking: {}, layerKind: 1, background: false };
    if (item._obj === 'select') return {};
    return { _obj: 'error' };
  }) };
  const context = runInNewContext(source + `
    prepareLayerMutation = async () => ({ doc: fixture.doc, originalActiveLayerId: fixture.activeLayerId });
    parentLayerStack = () => [fixture.layer];
    layerPathDom = () => '/One field';
    normalizeSessionState = () => ({ document_id: 42 });
    readSessionDescriptors = async () => ({ documentCount: 1 });
    findLayerByIdDom = () => null;
    layerByIdDescriptor = id => ({ _obj: 'get', _target: [{ _ref: 'layer', _id: id }] });
    legacyLayerKind = () => 'LayerKind.NORMAL';
    layerSectionValue = () => 'layerSectionContent';
    fillLayerLockState = () => false;
    ({ createLayerMutation, paintColorGradient, readNativeHistoryCursor, provenNativeHistorySteps });`, {
    fixture: { doc, layer, activeLayerId: 7 },
    require: (name: string) => name === 'uxp'
      ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop'
        ? { app: {}, action, constants: { LayerKind: { NORMAL: 'NORMAL' } },
          core: { executeAsModal: async (callback: (ctx: unknown) => unknown) => callback({}) } }
        : {},
  }) as any;
  return context;
}

const plainGradient = { document_id: 42, layer_id: 7, preserve_transparency: false,
  from: { x: 10, y: 10 }, to: { x: 100, y: 10 },
  stops: [
    { position: 0, red: 20, green: 30, blue: 40 },
    { position: 1, red: 60, green: 70, blue: 80 },
  ] };

describe('Native UXP history ownership, without blind counts', () => {
  it.each([1, 2, 3])('measures actual create-layer span %s within one modal transaction', async count => {
    const api = fixture({ createdSteps: count });
    const outcome = await api.createLayerMutation({ document_id: 42, name: 'One field' });
    expect(outcome).toMatchObject({ created: true, layerId: 88,
      history_steps: count, history_evidence: 'uxp_modal_native_history_cursor' });
  });
  it.each([1, 2])('measures plain gradient history span %s (not only alpha-protected gradients)', async count => {
    const api = fixture({ gradientSteps: count });
    const outcome = await api.paintColorGradient(plainGradient);
    expect(outcome).toMatchObject({ applied: true, layer_id: 7,
      history_steps: count, history_evidence: 'uxp_modal_native_history_cursor' });
  });
  it('never invents native History ownership when the cursor is unavailable', async () => {
    const api = fixture({ unavailable: true });
    const creation = await api.createLayerMutation({ document_id: 42 });
    const gradient = await api.paintColorGradient(plainGradient);
    expect(creation.history_steps).toBeUndefined();
    expect(gradient.history_steps).toBeUndefined();
    expect(creation.history_evidence).toBeUndefined();
    expect(gradient.history_evidence).toBeUndefined();
  });
  it('refuses cursor regression, stale or non-integral history indexes', () => {
    const api = fixture();
    expect(api.provenNativeHistorySteps({ index: 5, count: 10 }, { index: 5, count: 10 })).toBeUndefined();
    expect(api.provenNativeHistorySteps({ index: 5, count: 10 }, { index: 4, count: 10 })).toBeUndefined();
    expect(api.provenNativeHistorySteps({ index: 5, count: 10 }, { index: 10, count: 9 })).toBeUndefined();
    expect(api.provenNativeHistorySteps({ index: 5, count: 10 }, { index: 6.5, count: 10 })).toBeUndefined();
  });
});
