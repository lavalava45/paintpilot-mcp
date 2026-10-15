import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { confirmedPaintTargets } from '../src/core/guard/cycle.js';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
  .replace(/\npollLoop\(\);\s*$/, '\n');

it('regression: native PENCIL readiness rejects invisible or missing tool style and accepts observed positive settings', async () => {
  const options: any = { brush: { diameter: 2 }, opacity: 0 };
  const api: any = runInNewContext(source + '\n({ preflightStrokeToolsModal })', {
    require: (name: string) => name === 'uxp' ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop' ? { app: {}, core: {}, constants: {}, action: {
        batchPlay: async (commands: any[]) => commands[0]._obj === 'get' ? [{ currentToolOptions: options }] : [{}],
      } } : {},
  });
  await expect(api.preflightStrokeToolsModal([{ tool: 'PENCIL' }])).rejects.toThrow('positive native diameter/opacity');
  options.opacity = 90;
  expect(await api.preflightStrokeToolsModal([{ tool: 'PENCIL' }])).toMatchObject([{ tool: 'PENCIL' }]);
  delete options.brush;
  await expect(api.preflightStrokeToolsModal([{ tool: 'PENCIL' }])).rejects.toThrow('positive native diameter/opacity');
});

it.each([false, true])('regression: native outline replaces only its pinned component in one transaction, abort=%s', async fail => {
  const events: string[] = [];
  const layer = { id: 7 };
  const doc = { id: 42, activeLayers: [layer], layers: [layer], selection: {
    selectAll: async () => { events.push('select-all'); }, deselect: async () => {},
  }, pathItems: { add: async () => ({}) } };
  const baseline = { size: 20, opacity: 100, flow: 100 };
  let style = { ...baseline };
  const api: any = runInNewContext(source + `
    readSessionDescriptors = async () => ({ documentCount: 1, documentDescriptor: { documentID: 42, width: 100, height: 100, resolution: 72 } });
    validatePaintTargetDescriptor = () => {};
    makeUxpRegionSubPath = value => value;
    preflightStrokeToolsModal = async () => [];
    snapshotBrushSettings = async () => ({ settings: { ...harness.style() } });
    applyBrushSettingsModal = async value => harness.apply(value);
    currentForegroundRgb = () => ({ red: 1, green: 2, blue: 3 });
    setForegroundColorModal = value => harness.events.push('color:' + value.red);
    strokeNamedPathModal = async () => { harness.events.push('stroke'); if (harness.fail) throw new Error('outline draw failed'); };
    ({ paintRegions });`, {
    harness: { events, fail, style: () => style, apply: (value: any) => { style = { ...style, ...value };
      events.push('style:' + style.size); return { settings: style, observed_fields: ['size', 'opacity', 'flow'] }; } },
    require: (name: string) => name === 'uxp' ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop' ? { app: { activeDocument: doc, documents: [doc] }, constants: { ToolType: { BRUSH: 'brush' } },
        action: { batchPlay: async (commands: any[]) => commands.map(c => {
          events.push(c._obj); if (c._obj === 'get') return { id: 7, name: 'Independent component' }; return {};
        }) }, core: { executeAsModal: async (fn: any) => fn({ hostControl: {
          suspendHistory: async () => { events.push('suspend'); return 1; },
          resumeHistory: async (_id: number, commit: boolean) => { events.push(commit ? 'commit' : 'abort'); },
        } }) } } : {},
  });
  const request = { document_id: 42, replace_contents: true, regions: [{ layerId: 7, render_mode: 'outline',
    stroke_size: 2, opacity: 75, stroke_flow: 80, color: { red: 70, green: 50, blue: 30 },
    contours: [{ points: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }] }] }] };
  if (fail) await expect(api.paintRegions(request)).rejects.toThrow('outline draw failed');
  else expect(await api.paintRegions(request)).toMatchObject({ ok: true, painted_regions: [{ render_mode: 'outline', layer_id: 7 }] });
  expect(events.filter(e => e === 'suspend')).toHaveLength(1);
  expect(events).toContain(fail ? 'abort' : 'commit');
  expect(events).not.toContain('fill');
  expect(events).toContain('stroke');
  expect(events.indexOf('select-all')).toBeLessThan(events.indexOf('stroke'));
  expect(events).toContain('color:1');
  expect(style).toEqual(baseline);
  const wrong = structuredClone(request); wrong.regions[0].layerId = 8;
  await expect(api.paintRegions(wrong)).rejects.toThrow('paint_target_layer_unverified');
});

it('returns the native brush preset readback instead of echoing a requested but unapplied preset', async () => {
  const selects: unknown[] = [];
  const observed = { preset: 'Old Hard Brush', settings: { hardness: 100 } };
  const api: any = runInNewContext(source + `
    snapshotBrushSettings = async () => harness.observed;
    ({ selectBrushPreset });`, {
    harness: { observed },
    require: (name: string) => name === 'uxp'
      ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop'
        ? {
          action: { batchPlay: async (actions: unknown[]) => { selects.push(actions); return [{}, {}]; } },
          app: {}, constants: {},
          core: { executeAsModal: async (callback: () => Promise<unknown>) => callback() },
        }
        : {},
  });
  const result = await api.selectBrushPreset({ name: 'Soft Round Brush' });
  expect(selects).toHaveLength(1);
  expect(result).toMatchObject({ ok: true, preset: 'Old Hard Brush', settings: { hardness: 100 } });
  observed.preset = 'Soft Round Brush';
  expect(await api.selectBrushPreset({ name: 'Soft Round Brush' }))
    .toMatchObject({ preset: 'Soft Round Brush' });
});

it('writes dtipsHardness on the native brush descriptor and verifies size, hardness and spacing', async () => {
  let toolOptions: any = { brush: {
    _obj: 'brush', diameter: { _unit: 'pixelsUnit', _value: 52 },
    dtipsHardness: 100, spacing: { _unit: 'percentUnit', _value: 2 },
  }, opacity: 75, flow: 55 };
  let written: any;
  const api: any = runInNewContext(source + '\n({ applyBrushSettingsModal })', {
    require: (name: string) => name === 'uxp' ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop' ? { app: {}, constants: {}, core: {}, action: {
        batchPlay: async (commands: any[]) => commands.map(command => {
          if (command._obj === 'get') return { currentToolOptions: toolOptions };
          if (command._obj === 'set') { written = command.to; toolOptions = command.to; }
          return {};
        }),
      } } : {},
  });
  const result = await api.applyBrushSettingsModal({ size: 12, hardness: 65, spacing: 19 }, { activateBrushTool: false });
  expect(written.brush.dtipsHardness).toBe(65);
  expect(written.brush.hardness).toBeUndefined();
  expect(result.settings).toMatchObject({ size: 12, hardness: 65, spacing: 19 });
  expect(result.observed_fields).toEqual(expect.arrayContaining(['size', 'hardness', 'spacing']));
  expect(result.setter_diagnostics.native_before).toMatchObject({
    brush_obj: 'brush', diameter: { type: 'unit', unit: 'pixelsUnit' },
    dtipsHardness: { type: 'number' }, spacing: { type: 'unit', unit: 'percentUnit' },
  });
  expect(result.setter_diagnostics.native_after).toMatchObject({
    diameter: { type: 'unit', unit: 'pixelsUnit' }, spacing: { type: 'unit', unit: 'percentUnit' },
  });
});

it('uses native brush-target geometry setter when paintbrushTool silently changes only opacity/flow', async () => {
  let toolOptions: any = { brush: { _obj: 'brush', diameter: 52, dtipsHardness: 48,
    spacing: { _unit: 'percentUnit', _value: 2 } }, opacity: 70, flow: 60 };
  const writes: any[] = [];
  const api: any = runInNewContext(source + '\n({ applyBrushSettingsModal })', {
    require: (name: string) => name === 'uxp' ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop' ? { app: {}, constants: {}, core: {}, action: {
        batchPlay: async (commands: any[]) => commands.map(command => {
          if (command._obj === 'get') return { currentToolOptions: structuredClone(toolOptions) };
          if (command._obj === 'set') {
            writes.push(command);
            if (command._target?.[0]?._ref === 'paintbrushTool') {
              toolOptions.opacity = command.to.opacity;
              toolOptions.flow = command.to.flow;
            } else if (command._target?.[0]?._ref === 'brush') {
              toolOptions.brush.diameter = command.to.diameter;
              toolOptions.brush.dtipsHardness = command.to.hardness;
              toolOptions.brush.spacing = command.to.spacing;
            }
          }
          return {};
        }),
      } } : {},
  });
  const result = await api.applyBrushSettingsModal({ size: 12, hardness: 65, spacing: 19, opacity: 73, flow: 62 }, { activateBrushTool: false });
  expect(writes.map(command => command._target?.[0]?._ref)).toEqual(['paintbrushTool', 'brush']);
  expect(writes[1].to).toMatchObject({ _obj: 'brush', diameter: 12, hardness: 65,
    spacing: { _unit: 'percentUnit', _value: 19 } });
  expect(result.settings).toMatchObject({ size: 12, hardness: 65, spacing: 19, opacity: 73, flow: 62 });
  expect(result.setter_diagnostics.geometry_recovery).toMatchObject({ attempted: true, verified: true });
});

function fixture(opacity = 100, flow = 100, useNativePathStroke = false) {
  const initial = { size: 40, opacity, flow, hardness: 65, use_pressure_opacity: true };
  let brush = { ...initial };
  let ignoreNativeStyleWrite = false;
  let ignoreNativeRestoreWrite = false;
  let omitNativeStyleEvidence = false;
  const rendered: typeof initial[] = [];
  const events: string[] = [];
  let failRestore = false;
  const resumeHistory = vi.fn(async (_id: number, commit: boolean) => { events.push(`history:${commit}`); });
  const apply = vi.fn(async (settings: Partial<typeof initial>) => {
    events.push(`brush:${settings.opacity}`);
    if (failRestore && settings.opacity === initial.opacity && settings.flow === initial.flow) {
      throw new Error('native_brush_restore_failed');
    }
    const restoringBaseline = settings.size === initial.size
      && settings.opacity === initial.opacity && settings.flow === initial.flow;
    if (!ignoreNativeStyleWrite && !(ignoreNativeRestoreWrite && restoringBaseline)) {
      brush = { ...brush, ...settings };
    }
    return { settings: { ...brush }, observed_fields: omitNativeStyleEvidence ? [] : ['size', 'opacity', 'flow'] };
  });
  let failDraw = false;
  let colorWrites = 0;
  const group = { id: 8, kind: 'group', opacity: 60, fillOpacity: 100, blendMode: 'passthrough', layers: [] as unknown[] };
  const layer = { id: 9, opacity: 35, fillOpacity: 70, blendMode: 'normal', parent: group };
  group.layers.push(layer);
  const doc = { id: 42, layers: [group], activeLayers: [{ id: 9 }], pathItems: { add: vi.fn(async () => {}) } };
  const harness = {
    useNativePathStroke,
    target: { doc, targetLayerId: 9, targetDescriptor: { name: 'Body' }, originalLayerId: 9, resolution: 72, width: 100, height: 100 },
    snapshot: async () => ({ settings: { ...brush } }),
    apply,
    color: () => { colorWrites++; brush.opacity = 1; brush.flow = 1; }, // accepted host quirk
    draw: async () => {
      if (failDraw) throw new Error('draw failed');
      rendered.push({ ...brush });
    },
  };
  const batchPlay = vi.fn(async (descriptors: any[]) => {
    if (descriptors[0]?._target?.[0]?._ref === 'layer' && descriptors[0]?._target?.[0]?._id === 19) events.push('layer:restore');
    return [];
  });
  const api = runInNewContext(source + `
    preparePaintTarget = async () => harness.target;
    preflightStrokeToolsModal = async () => ({ ready: true });
    snapshotBrushSettings = harness.snapshot;
    applyBrushSettingsModal = harness.apply;
    currentForegroundRgb = () => ({ red: 0, green: 0, blue: 0 });
    setForegroundColorModal = harness.color;
    if (!harness.useNativePathStroke) strokeNamedPathModal = harness.draw;
    deleteNamedPathModal = async () => {};
    makeUxpStrokeSubPath = value => value;
    makeUxpDabSubPath = value => value;
    ({ paintStrokesBatch, paintDabsBatch, paintTargetCompositing });`, {
    harness,
    require: (name: string) => name === 'uxp'
      ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop'
        ? {
          action: { batchPlay }, app: {},
          constants: { ToolType: { BRUSH: 'brush', PENCIL: 'pencil' }, LayerKind: { GROUP: 'group' } },
          core: { executeAsModal: async (fn: (context: unknown) => Promise<unknown>) => fn({
            hostControl: { suspendHistory: async () => 1, resumeHistory },
          }) },
        }
        : {},
  });
  const paint = (kind: 'strokes' | 'dabs', overrides: Record<string, unknown>[]) =>
    kind === 'strokes'
      ? api.paintStrokesBatch({ strokes: overrides.map(style => ({ points: [{ x: 1, y: 1 }], ...style })) })
      : api.paintDabsBatch({ groups: overrides.map(style => ({ points: [{ x: 1, y: 1 }], ...style })) });
  return { paint, rendered, resumeHistory, apply, initial, layer, group, events,
    colorWrites: () => colorWrites, draw: harness.draw,
    brush: () => brush, batchPlay, target: harness.target, fail: () => { failDraw = true; },
    failBrushRestore: () => { failRestore = true; },
    ignoreRestoreWrite: () => { ignoreNativeRestoreWrite = true; },
    ignoreStyleWrite: () => { ignoreNativeStyleWrite = true; },
    omitStyleEvidence: () => { omitNativeStyleEvidence = true; } };
}

describe('UXP painting opacity is local to each mark', () => {
  it.each(['strokes', 'dabs'] as const)('%s paint the pinned layer after a confirmed native layer switch', async kind => {
    const f = fixture();
    f.target.originalLayerId = 19;
    f.target.doc.activeLayers = [{ id: 19 }];
    f.batchPlay.mockImplementation(async (descriptors: any[]) => {
      const selected = descriptors[0]?._target?.[0];
      if (selected?._ref === 'layer') f.target.doc.activeLayers = [{ id: selected._id }];
      return [{}];
    });
    await f.paint(kind, [{}]);
    expect(f.rendered).toHaveLength(1);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, true);
  });

  it.each(['strokes', 'dabs'] as const)('%s refuse to paint when Photoshop rejects the target layer selection', async kind => {
    const f = fixture();
    f.target.originalLayerId = 19;
    (f.target.doc as any).activeLayers = [{ id: 19 }];
    f.batchPlay.mockResolvedValueOnce([{ _obj: 'error', message: 'native layer select failed' }]);
    await expect(f.paint(kind, [{}])).rejects.toThrow('paint_target_layer_unverified');
    expect(f.rendered).toHaveLength(0);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, false);
  });

  it.each(['strokes', 'dabs'] as const)('%s refuse to paint when Photoshop silently retains the old active layer', async kind => {
    const f = fixture();
    f.target.originalLayerId = 19;
    (f.target.doc as any).activeLayers = [{ id: 19 }];
    await expect(f.paint(kind, [{}])).rejects.toThrow('paint_target_layer_unverified');
    expect(f.rendered).toHaveLength(0);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, false);
  });

  it.each(['strokes', 'dabs'] as const)('%s refuse to draw when native brush setter silently retains old size', async kind => {
    const f = fixture();
    f.ignoreStyleWrite();
    await expect(f.paint(kind, [{ size: 12 }])).rejects.toThrow('paint_style_unverified:size:native_readback_mismatch');
    expect(f.rendered).toHaveLength(0);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, false);
  });
  it.each(['strokes', 'dabs'] as const)('%s refuse to draw when native setter supplies no readback evidence', async kind => {
    const f = fixture();
    f.omitStyleEvidence();
    await expect(f.paint(kind, [{ opacity: 27 }])).rejects.toThrow('paint_style_unverified:size:native_readback_missing');
    expect(f.rendered).toHaveLength(0);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, false);
  });
  it.each(['strokes', 'dabs'] as const)('%s accept native integer quantization of fractional opacity', async kind => {
    const f = fixture();
    await f.paint(kind, [{ opacity: 37.5 }]);
    expect(f.rendered).toHaveLength(1);
    expect(f.rendered[0].opacity).toBe(38);
  });
  it('avoids redundant native foreground/brush writes for consecutive same-color dabs without changing their rendering or History', async () => {
    const f = fixture();
    const same = { red: 90, green: 110, blue: 130 };
    await f.paint('dabs', Array.from({ length: 12 }, () => ({ color: same })));
    expect(f.colorWrites()).toBe(1);
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.rendered).toHaveLength(12);
    expect(f.rendered).toEqual(Array.from({ length: 12 }, () => f.initial));
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, true);
    expect(f.brush()).toEqual(f.initial);
  });
  it.each(['strokes', 'dabs'] as const)('%s restore a nonactive original layer once after a successful batch', async kind => {
    const f = fixture();
    f.target.originalLayerId = 19;
    await f.paint(kind, [{}]);
    const layerRestores = f.batchPlay.mock.calls.filter(([actions]) =>
      actions[0]?._target?.[0]?._ref === 'layer'
      && actions[0]._target[0]._id === 19);
    expect(layerRestores).toHaveLength(1);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, true);
  });
  it.each(['strokes', 'dabs'] as const)('%s stroke the newly created native PathItem without looking it up again', async kind => {
    const f = fixture(100, 100, true);
    const lookup = vi.fn(() => { throw new Error('redundant_path_lookup'); });
    f.target.doc.pathItems.getByName = lookup;
    f.target.doc.pathItems.add.mockImplementation(async () => ({ strokePath: f.draw }));
    await f.paint(kind, [{}, {}]);
    expect(f.target.doc.pathItems.add).toHaveBeenCalledTimes(2);
    expect(lookup).not.toHaveBeenCalled();
    expect(f.rendered).toHaveLength(2);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, true);
  });
  it.each(['strokes', 'dabs'] as const)('%s restore omitted settings from the prepared baseline, including after a color write', async kind => {
    const f = fixture();
    await f.paint(kind, [
      { size: 12, opacity: 8, flow: 20, color: { red: 40, green: 50, blue: 60 } },
      { color: { red: 60, green: 50, blue: 40 } },
    ]);
    expect(f.rendered).toEqual([
      { ...f.initial, size: 12, opacity: 8, flow: 20 }, f.initial,
    ]);
    expect(f.brush()).toEqual(f.initial);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, true);
  });

  it.each(['strokes', 'dabs'] as const)('%s do not leak a final transparent override into the next call/AUTO chunk', async kind => {
    const f = fixture();
    await f.paint(kind, [{ opacity: 12, flow: 25 }]);
    expect(f.brush()).toEqual(f.initial);
    await f.paint(kind, [{}]);
    expect(f.rendered[1]).toEqual(f.initial);
  });

  it.each(['strokes', 'dabs'] as const)('%s preserve intentionally translucent brush and layer settings', async kind => {
    const f = fixture(45, 55);
    const result = await f.paint(kind, [{ opacity: 10 }, {}]);
    expect(f.rendered.map(row => [row.opacity, row.flow])).toEqual([[10, 55], [45, 55]]);
    expect(f.brush()).toEqual(f.initial);
    expect(result.paint_target).toEqual({
      layer_id: 9, opacity: 35, fill_opacity: 70, blend_mode: 'normal',
      parent_groups: [{ layer_id: 8, opacity: 60, fill_opacity: 100, blend_mode: 'passthrough' }],
    });
    expect(f.layer.opacity).toBe(35);
    expect(f.group.opacity).toBe(60);
  });

  it.each(['strokes', 'dabs'] as const)('%s roll back a failed batch and restore its brush overrides', async kind => {
    const f = fixture();
    f.fail();
    await expect(f.paint(kind, [{ opacity: 5, flow: 10 }])).rejects.toThrow('draw failed');
    expect(f.brush()).toEqual(f.initial);
    expect(f.resumeHistory).toHaveBeenLastCalledWith(1, false);
  });

  it.each(['strokes', 'dabs'] as const)('%s restore brush and original layer before aborting failed History', async kind => {
    const f = fixture();
    f.target.originalLayerId = 19;
    f.fail();
    await expect(f.paint(kind, [{ opacity: 5, flow: 10 }])).rejects.toThrow('draw failed');
    const historyIndex = f.events.indexOf('history:false');
    expect(historyIndex).toBeGreaterThan(0);
    expect(f.events.indexOf(`brush:${f.initial.opacity}`)).toBeGreaterThan(-1);
    expect(f.events.indexOf(`brush:${f.initial.opacity}`)).toBeLessThan(historyIndex);
    expect(f.events.indexOf('layer:restore')).toBeLessThan(historyIndex);
  });

  it.each(['strokes', 'dabs'] as const)('%s report failed restoration and still release History', async kind => {
    const f = fixture();
    f.fail();
    f.failBrushRestore();
    await expect(f.paint(kind, [{ opacity: 5 }])).rejects.toThrow('paint_state_restore_failed');
    expect(f.events).toContain('history:false');
  });

  it.each(['strokes', 'dabs'] as const)('%s reject success when Photoshop silently ignores the brush restoration', async kind => {
    const f = fixture();
    f.ignoreRestoreWrite();
    await expect(f.paint(kind, [{ opacity: 5 }])).rejects.toThrow('paint_state_restore_failed');
    expect(f.rendered).toHaveLength(1);
    expect(f.brush().opacity).toBe(5);
    expect(f.events).toContain('history:false');
  });

  it('does not apply BRUSH settings to a PENCIL-only batch', async () => {
    const f = fixture();
    await f.paint('strokes', [{ tool: 'PENCIL' }]);
    expect(f.apply).not.toHaveBeenCalled();
  });

  it('retains actual compositing facts from direct, bundled and region receipts, without inferring coverage', () => {
    const text = (body: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });
    const target = { layer_id: 9, opacity: 35, fill_opacity: 70, blend_mode: 'normal' };
    expect(confirmedPaintTargets(text({ details: { paint_target: target } }))).toEqual([target]);
    expect(confirmedPaintTargets(text({ mutation_results: {
      body: { details: { paint_target: { ...target, opacity: 100 } } },
      glaze: text({ details: { painted_regions: [{ paint_target: target }] } }),
    } }))).toEqual([target]);
    expect(confirmedPaintTargets(text({ continuation_layers: [{ layer_id: 9, opacity_role: 'opaque' }] }))).toEqual([]);
  });
});
