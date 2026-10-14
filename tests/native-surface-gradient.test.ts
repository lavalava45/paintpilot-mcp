import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
  .replace(/\npollLoop\(\);\s*$/, '\n');

function fixture(options: { failGradient?: boolean; alphaBoundsChanged?: boolean; alreadyLocked?: boolean; existingSelection?: boolean; failClip?: boolean } = {}) {
  let locked = !!options.alreadyLocked;
  let selected = 9;
  let painted = false;
  let hasSelection = !!options.existingSelection;
  const pathItems = { add: vi.fn(async () => ({})) };
  const history = {
    suspendHistory: vi.fn(async () => 42),
    resumeHistory: vi.fn(async () => {}),
  };
  const descriptors: any[] = [];
  const action = {
    batchPlay: vi.fn(async (items: any[]) => items.map(item => {
      descriptors.push(item);
      if (item._obj === 'get') return {
        layerLocking: { protectTransparency: locked },
        bounds: { left: 211, top: 155, right: options.alphaBoundsChanged && painted ? 340 : 253, bottom: 389 },
        layerKind: 1, background: false,
      };
      if (item._obj === 'select') {
        selected = item._target[0]._id;
        return {};
      }
      if (item._obj === 'set') {
        if (item._target[0]._property === 'selection') {
          if (options.failClip && item.to._ref === 'path') return { _obj: 'error' };
          hasSelection = item.to._ref === 'path';
        } else locked = item.to.layerLocking.protectTransparency;
        return {};
      }
      if (item._obj === 'delete') return {};
      if (item._obj === 'gradientClassEvent') {
        if (options.failGradient) return { _obj: 'error' };
        painted = true;
        return {};
      }
      return { _obj: 'error' };
    })),
  };
  const app = { pathItems, selectionSnapshot: () => ({ ok: true, has_selection: hasSelection }) };
  const api: any = runInNewContext(source + `
    prepareLayerMutation = async () => ({ doc: { id: 42, pathItems: app.pathItems }, originalActiveLayerId: 9 });
    snapshotSelectionBounds = async () => app.selectionSnapshot();
    makeUxpRegionSubPath = contour => contour;
    legacyLayerKind = () => 'LayerKind.NORMAL';
    layerSectionValue = () => null;
    normalizedBounds = b => b;
    ({ paintColorGradient });`, {
    require: (name: string) => name === 'uxp'
      ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop'
        ? { app, action, constants: {}, core: { executeAsModal: async (fn: Function) => fn({ hostControl: history }) } }
        : {},
  });
  const run = (preserve = true, extra: Record<string, unknown> = {}) => api.paintColorGradient({
    document_id: 42, layer_id: 7, preserve_transparency: preserve,
    from: { x: 210, y: 300 }, to: { x: 254, y: 300 },
    stops: [
      { position: 0, red: 24, green: 34, blue: 47 },
      { position: 1, red: 75, green: 91, blue: 113 },
    ],
    ...extra,
  });
  return { run, history, action, descriptors, pathItems, selection: () => hasSelection, state: () => ({ locked, selected, painted }) };
}

it('renders native continuous surface tone with a temporary alpha lock and ONE History state', async () => {
  const f = fixture();
  const result = await f.run();
  expect(result).toMatchObject({ applied: true, layer_id: 7, history_steps: 1,
    surface_alpha_preserved: true, gradient_kind: 'raster-color-linear' });
  expect(f.history.suspendHistory).toHaveBeenCalledWith({
    documentID: 42, name: 'MCP Continuous Surface Tone',
  });
  expect(f.history.resumeHistory).toHaveBeenCalledTimes(1);
  expect(f.history.resumeHistory).toHaveBeenLastCalledWith(42, true);
  expect(f.descriptors.filter(d => d._obj === 'set' && d.to.layerLocking).map(d => d.to.layerLocking.protectTransparency))
    .toEqual([true, false]);
  expect(f.descriptors.filter(d => d._obj === 'select').map(d => d._target[0]._id))
    .toEqual([7, 9]);
  expect(f.state()).toEqual({ locked: false, selected: 9, painted: true });
});

it.each([
  { failGradient: true },
  { alphaBoundsChanged: true },
])('aborts surface tone atomically if native drawing or transparency proof fails: %o', async options => {
  const f = fixture(options);
  await expect(f.run()).rejects.toThrow(/surface_gradient_/);
  expect(f.history.resumeHistory).toHaveBeenLastCalledWith(42, false);
  expect(f.history.resumeHistory).toHaveBeenCalledTimes(1);
});

it('rejects initially protected layers without dispatch or changing History', async () => {
  const f = fixture({ alreadyLocked: true });
  await expect(f.run()).rejects.toThrow('surface_gradient_requires_unlocked_raster_layer');
  expect(f.history.suspendHistory).not.toHaveBeenCalled();
  expect(f.descriptors.some(d => d._obj === 'gradientClassEvent')).toBe(false);
});

it('preserves legacy plain gradient behavior when surface protection is disabled', async () => {
  const f = fixture();
  const result = await f.run(false);
  expect(result.applied).toBe(true);
  expect(result.surface_alpha_preserved).toBeUndefined();
  expect(f.history.suspendHistory).not.toHaveBeenCalled();
  expect(f.descriptors.filter(d => d._obj === 'set')).toHaveLength(0);
});

const clip = [{ x: 211, y: 155 }, { x: 253, y: 155 }, { x: 253, y: 389 }];
it('uses the exact polygon selection and requested strength, restoring selection/path within one History state', async () => {
  const f = fixture();
  const result = await f.run(true, { clip_contour: clip, opacity: 1 });
  expect(f.pathItems.add).toHaveBeenCalledWith(expect.stringContaining('__MCP_SURFACE_CLIP_'), [{ operation: 'ADD', points: clip }]);
  const selectIndex = f.descriptors.findIndex(d => d._obj === 'set' && d.to?._ref === 'path');
  const paintIndex = f.descriptors.findIndex(d => d._obj === 'gradientClassEvent');
  const deselectIndex = f.descriptors.findIndex(d => d._obj === 'set' && d.to?._value === 'none');
  expect(selectIndex).toBeLessThan(paintIndex);
  expect(deselectIndex).toBeGreaterThan(paintIndex);
  expect(f.descriptors[selectIndex]).toMatchObject({ antiAlias: false, feather: { _value: 0 } });
  expect(f.descriptors[paintIndex].gradient.transparency.map((s: any) => s.opacity._value)).toEqual([1, 1]);
  expect(f.descriptors[paintIndex].opacity._value).toBe(100);
  expect(f.descriptors.some(d => d._obj === 'delete' && d._target[0]._ref === 'path')).toBe(true);
  expect(f.selection()).toBe(false);
  expect(result).toMatchObject({ opacity: 1, clip_contour: clip, clip_contour_applied: true, selection_restored: true, history_steps: 1 });
  expect(f.history.resumeHistory).toHaveBeenLastCalledWith(42, true);
});
it('does not overwrite a pre-existing selection or paint when clip creation fails', async () => {
  const existing = fixture({ existingSelection: true });
  await expect(existing.run(true, { clip_contour: clip })).rejects.toThrow('surface_gradient_existing_selection');
  expect(existing.selection()).toBe(true);
  expect(existing.history.suspendHistory).not.toHaveBeenCalled();
  const failed = fixture({ failClip: true });
  await expect(failed.run(true, { clip_contour: clip })).rejects.toThrow('surface_gradient_native_action_failed');
  expect(failed.descriptors.some(d => d._obj === 'gradientClassEvent')).toBe(false);
  expect(failed.history.resumeHistory).toHaveBeenLastCalledWith(42, false);
});
