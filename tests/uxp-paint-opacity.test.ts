import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { confirmedPaintTargets } from '../src/core/guard/cycle.js';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
  .replace(/\npollLoop\(\);\s*$/, '\n');

function fixture(opacity = 100, flow = 100) {
  const initial = { size: 40, opacity, flow, hardness: 65, use_pressure_opacity: true };
  let brush = { ...initial };
  const rendered: typeof initial[] = [];
  const resumeHistory = vi.fn(async () => {});
  const apply = vi.fn(async (settings: Partial<typeof initial>) => {
    brush = { ...brush, ...settings };
    return { settings: { ...brush } };
  });
  let failDraw = false;
  const group = { id: 8, kind: 'group', opacity: 60, fillOpacity: 100, blendMode: 'passthrough', layers: [] as unknown[] };
  const layer = { id: 9, opacity: 35, fillOpacity: 70, blendMode: 'normal', parent: group };
  group.layers.push(layer);
  const doc = { id: 42, layers: [group], pathItems: { add: vi.fn(async () => {}) } };
  const harness = {
    target: { doc, targetLayerId: 9, targetDescriptor: { name: 'Body' }, originalLayerId: 9, resolution: 72, width: 100, height: 100 },
    snapshot: async () => ({ settings: { ...brush } }),
    apply,
    color: () => { brush.opacity = 1; brush.flow = 1; }, // accepted host quirk
    draw: async () => {
      if (failDraw) throw new Error('draw failed');
      rendered.push({ ...brush });
    },
  };
  const api = runInNewContext(source + `
    preparePaintTarget = async () => harness.target;
    preflightStrokeToolsModal = async () => ({ ready: true });
    snapshotBrushSettings = harness.snapshot;
    applyBrushSettingsModal = harness.apply;
    currentForegroundRgb = () => ({ red: 0, green: 0, blue: 0 });
    setForegroundColorModal = harness.color;
    strokeNamedPathModal = harness.draw;
    deleteNamedPathModal = async () => {};
    makeUxpStrokeSubPath = value => value;
    makeUxpDabSubPath = value => value;
    ({ paintStrokesBatch, paintDabsBatch, paintTargetCompositing });`, {
    harness,
    require: (name: string) => name === 'uxp'
      ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop'
        ? {
          action: { batchPlay: vi.fn(async () => []) }, app: {},
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
  return { paint, rendered, resumeHistory, apply, initial, layer, group,
    brush: () => brush, fail: () => { failDraw = true; } };
}

describe('UXP painting opacity is local to each mark', () => {
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
