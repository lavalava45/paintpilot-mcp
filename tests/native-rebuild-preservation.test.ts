import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { expandConstructionPass, solveConstruction, normalizeConstructionModel } from '../src/core/object-construction.js';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8').replace(/\npollLoop\(\);\s*$/, '\n');
function tower() {
  const coordinates = [[10, 15], [35, 15], [45, 5], [55, 15], [90, 15], [90, 98], [10, 98]];
  return normalizeConstructionModel({ model_id: 'tower', revision: 1, basis: 'Measured roof outline',
    objects: [{ id: 'tower', subject_kind: 'single-component' }],
    points: coordinates.map(([x, y], i) => ({ id: `p${i}`, object_id: 'tower', position: [x, y], fixed: true })),
    parts: [{ id: 'shell', object_id: 'tower', role: 'Tower silhouette', outline: coordinates.map((_, i) => `p${i}`) }],
    camera: { kind: 'orthographic', origin: [0, 0], scale: 1 },
  });
}

// Execute the actual native command against a deterministic raster/selection
// host. This checks pixels across several passes, not merely generated fields.
function rasterHost() {
  let pixels = new Uint8Array(100 * 100), selection: ((x: number, y: number) => boolean) | null = null;
  let path: any, before: Uint8Array, fail = false;
  const history: Uint8Array[] = [];
  const inside = (points: any[], x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const apply = (value: number) => {
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      if (!selection || selection(x + 0.5, y + 0.5)) pixels[y * 100 + x] = value;
    }
  };
  const doc: any = { id: 7, activeLayers: [{ id: 9 }], selection: {
    selectAll: async () => { selection = () => true; },
    deselect: async () => { selection = null; },
    selectRectangle: async (b: any, mode: string) => {
      const old = selection;
      selection = (x, y) => x >= b.left && x < b.right && y >= b.top && y < b.bottom
        && (mode !== 'intersect' || !old || old(x, y));
    },
    get bounds() { return selection && pixels.some((_, i) => selection!(i % 100 + 0.5, Math.floor(i / 100) + 0.5)) ? {} : null; },
  }, pathItems: { add: async (_: string, paths: any) => { path = paths[0].points; return {}; } } };
  const harness = { doc, apply, history, get fail() { return fail; },
    batchPlay: async (commands: any[]) => commands.map(c => {
      if (c._obj === 'get') return { id: 9, name: 'Tower', layerKind: 1 };
      if (c._obj === 'delete' && !c._target) apply(0);
      if (c._obj === 'set' && c.to?._ref === 'path') selection = (x, y) => inside(path, x, y);
      if (c._obj === 'fill') { if (fail) throw new Error('draw failed'); apply(c.color.red); }
      return {};
    }),
    begin: async () => { before = pixels.slice(); return history.length + 1; },
    end: async (_: number, commit: boolean) => { if (commit) history.push(before); else pixels = before.slice(); },
    stroke: async () => {
      if (fail) throw new Error('draw failed');
      // Fixed-width polygon outline; retain the native command's selection.
      const old = selection;
      selection = (x, y) => (!old || old(x, y)) && path.some((a: any, i: number) => {
        const b = path[(i + 1) % path.length], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= 1;
      });
      apply(80); selection = old;
    },
  };
  const api: any = runInNewContext(source + `
    readSessionDescriptors = async () => ({ documentCount: 1, documentDescriptor: { documentID: 7, width: 100, height: 100, resolution: 72 } });
    makeUxpRegionSubPath = value => value;
    validatePaintTargetDescriptor = () => {};
    selectVerifiedPaintLayerModal = async () => {};
    preflightStrokeToolsModal = async () => [];
    snapshotBrushSettings = async () => ({ settings: { size: 2, opacity: 100, flow: 100 } });
    applyVerifiedBatchBrushStyle = async () => ({ settings: { size: 2, opacity: 100, flow: 100 } });
    restoreBatchBrushStyle = async () => {};
    currentForegroundRgb = () => ({ red: 80, green: 80, blue: 80 });
    setForegroundColorModal = () => {};
    strokeNamedPathModal = async () => harness.stroke();
    ({ paintRegions });`, { harness,
    require: (name: string) => name === 'uxp' ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop' ? { app: { activeDocument: doc, documents: [doc] },
        constants: { SelectionType: { REPLACE: 'replace', INTERSECT: 'intersect' }, ToolType: { BRUSH: 'brush' } },
        action: { batchPlay: harness.batchPlay }, core: { executeAsModal: async (fn: any) => fn({ hostControl: {
          suspendHistory: harness.begin, resumeHistory: harness.end,
        } }) } } : {},
  });
  return { paint: api.paintRegions, pixels: () => pixels.slice(),
    mark: (x: number, y: number) => { pixels[y * 100 + x] = 230; },
    fail: () => { fail = true; }, undo: () => { pixels = history.pop()!; }, history };
}

it.each(['fill', 'outline'])('preserves manual lower roofs through a local %s rebuild and exact transaction undo', async mode => {
  const old = tower(), original = solveConstruction(old).parts[0];
  const rendering = { mode, ...(mode === 'outline' ? { size: 2, opacity: 100, flow: 100 } : {}) };
  const request = (model: any) => ({ document_id: 7, construction: { model, part_id: 'shell',
    color: { red: 80, green: 70, blue: 60 }, rendering } });
  const host = rasterHost();
  const execute = (expanded: any) => {
    const args = structuredClone(expanded.pass.actions.find((a: any) => a.tool === 'photoshop_paint_regions').args);
    args.regions.forEach((r: any) => { r.layerId = 9; delete r.layer_id; });
    return host.paint(args);
  };
  await execute(expandConstructionPass(request(old), {}, () => null));
  // These marks deliberately do not exist in the construction model.
  for (const y of [30, 45, 60, 75, 90]) for (let x = 15; x < 85; x++) host.mark(x, y);
  const before = host.pixels();
  const revised = structuredClone(old); revised.revision++; revised.points[2].position[1] = 2;
  const rebuilt = expandConstructionPass(request(revised), {
    painterly_frame: { canvas_width: 100, canvas_height: 100 },
    logical_layer_owners: [{ hypothesis_id: 'shell', layer_id: 9 }],
    construction_bindings: [{ owner_id: 'shell', bounds: original.bounds, contour: original.contour, rendering }],
  }, () => old);
  expect(rebuilt.pass.actions[0].args).toMatchObject({ replacement_bounds: { bottom: mode === 'outline' ? 18 : 17 } });
  await execute(rebuilt);
  const after = host.pixels();
  expect(after.slice(20 * 100)).toEqual(before.slice(20 * 100));
  expect(after).not.toEqual(before); // The requested roof really changed.
  expect(host.history).toHaveLength(2); // One atomic history state per pass.
  host.undo(); expect(host.pixels()).toEqual(before);
  host.fail(); await expect(execute(rebuilt)).rejects.toThrow('draw failed');
  expect(host.pixels()).toEqual(before); // Failure after clearing is atomic too.
});
