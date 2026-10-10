import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8').replace(/\npollLoop\(\);\s*$/, '\n');
function native(options: { existing?: boolean; disabled?: boolean; wrongLayer?: boolean;
  failSelect?: boolean; failGradient?: boolean; failRestore?: boolean } = {}) {
  let mask = options.existing ?? false;
  const rgb = [{ name: 'RGB' }];
  let channels = rgb;
  const doc = { id: 42, width: 1400, height: 1000, activeLayers: [{ id: options.wrongLayer ? 8 : 7 }],
    get activeChannels() { return channels; },
    set activeChannels(value) { if (options.failRestore) throw Error('restore failed'); channels = value; } };
  const resume = vi.fn(async () => {});
  const prepare = vi.fn(async () => ({ doc, targetLayerId: 7 }));
  const gradient: unknown[] = [];
  const batch = vi.fn(async (descriptors: Array<Record<string, unknown>>) => descriptors.map(d => {
    if (d._obj === 'get') return { hasUserMask: mask, userMaskEnabled: mask && !options.disabled };
    if (d._obj === 'make') { mask = true; return {}; }
    if (d._obj === 'select') {
      if (options.failSelect) return { _obj: 'error' };
      channels = [{ name: 'Mask' }]; return {};
    }
    if (d._obj === 'gradientClassEvent') {
      if (options.failGradient) return { _obj: 'error' };
      gradient.push({ descriptor: d, channel: channels[0].name });
    }
    return {};
  }));
  const api = runInNewContext(source + `
    preparePaintTarget = harness.prepare;
    prepareLayerMutation = async () => ({doc: harness.doc});
    snapshotSelectionBounds = async () => ({has_selection: true, bounds: {left: 900, top: 0, right: 1400, bottom: 1000}});
    ({applyGradientMaskMutation});`, {
    harness: { doc, prepare },
    require: (name: string) => name === 'uxp' ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop' ? { app: {}, action: { batchPlay: batch }, constants: {},
        core: { executeAsModal: async (fn: Function) => fn({ hostControl: {
          suspendHistory: async () => 1, resumeHistory: resume,
        } }) } } : {},
  });
  return { paint: () => api.applyGradientMaskMutation({ document_id: 42, layer_id: 7,
    direction: 'right_to_left', start_pct: 65, end_pct: 100 }), gradient, batch, resume, prepare,
    channels: () => channels };
}

it.each([false, true])('gradient selects the pinned mask, preserves outside selection and restores RGB, existing=%s', async existing => {
  const f = native({ existing });
  const body = await f.paint();
  expect(f.prepare).toHaveBeenCalledWith(expect.objectContaining({ document_id: 42, layer_id: 7, paint_target: 'layer-mask' }), 'apply_gradient_mask');
  expect(body).toMatchObject({ layer_id: 7, original_preserved: true, paint_channel: 'layer-mask', mask_auto_created: !existing });
  expect(f.gradient).toHaveLength(1);
  const entry = f.gradient[0] as { descriptor: any; channel: string };
  expect(entry.channel).toBe('Mask');
  expect(entry.descriptor.from.horizontal._value).toBe(1400);
  expect(entry.descriptor.to.horizontal._value).toBe(910);
  expect(entry.descriptor.gradient.colors.map((c: any) => c.color.gray._value)).toEqual([100, 0]);
  expect(f.channels()).toEqual([{ name: 'RGB' }]);
  expect(f.resume).toHaveBeenLastCalledWith(1, true);
  if (!existing) expect(f.batch.mock.calls.flatMap(([ds]) => ds).find(d => d._obj === 'make'))
    .toMatchObject({ using: { _value: 'revealAll' } });
});

it.each([
  { existing: true, disabled: true }, { wrongLayer: true }, { failSelect: true },
  { failGradient: true }, { failRestore: true },
])('gradient aborts its history unit on unsafe native state %#', async options => {
  const f = native(options);
  await expect(f.paint()).rejects.toThrow();
  expect(f.resume).toHaveBeenLastCalledWith(1, false);
  if (!options.failRestore) expect(f.gradient).toHaveLength(0);
});
