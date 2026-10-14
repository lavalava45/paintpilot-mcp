import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
  .replace(/\npollLoop\(\);\s*$/, '\n');

function brushProbeHarness(observedPreset: string | null) {
  const counts = { dabs: 0, strokes: 0, previews: 0, closes: 0 };
  const phaseModules = new Set([
    './p1-document-ops', './p1-selection-ops', './p1-layer-ops',
    './p2-adjustment-ops', './p2-filter-ops', './p2-text-export-ops',
    './p3-utility-ops', './p3-document-data-ops', './p3-layer-advanced-ops',
  ]);
  const probe = runInNewContext(source + `
    createDocumentMutation = async () => ({ document: { id: 42 } });
    createLayerMutation = async () => ({ layer: { id: 7 } });
    selectBrushPreset = async () => ({ ok: true, preset: globalThis.observedPreset, settings: { size: 32 } });
    paintDabsBatch = async () => { globalThis.counts.dabs += 1; };
    paintStrokesBatch = async () => { globalThis.counts.strokes += 1; };
    capturePreview = async () => { globalThis.counts.previews += 1; return { path: 'probe.jpg' }; };
    ({ probeMediaBrush });
  `, {
    observedPreset,
    counts,
    require: (name: string) => {
      if (name === 'uxp') return {
        entrypoints: { setup() {} },
        storage: { localFileSystem: {}, types: {} },
      };
      if (name === 'photoshop') return {
        action: { batchPlay: async () => { counts.closes += 1; return []; } },
        core: { executeAsModal: async (fn: () => Promise<unknown>) => fn() },
        app: {},
        constants: {},
      };
      if (phaseModules.has(name)) return {};
      throw new Error(`Unexpected require: ${name}`);
    },
    fetch: async () => ({ ok: true }),
    setTimeout,
    clearTimeout,
  }) as { probeMediaBrush(params: { preset_name: string }): Promise<Record<string, unknown>> };
  return { probe, counts };
}

describe('UXP native media-brush probe identity', () => {
  it.each([null, 'Different Brush'])(
    'rejects missing or mismatched native preset identity (%s) before painting',
    async (observedPreset) => {
      const { probe, counts } = brushProbeHarness(observedPreset);
      await expect(probe.probeMediaBrush({ preset_name: 'Square Charcoal' }))
        .rejects.toThrow('brush_probe_preset_unverified');
      expect(counts).toEqual({ dabs: 0, strokes: 0, previews: 0, closes: 1 });
    }
  );

  it('paints only after confirming the actual selected native preset', async () => {
    const { probe, counts } = brushProbeHarness('Square Charcoal');
    await expect(probe.probeMediaBrush({ preset_name: 'Square Charcoal' }))
      .resolves.toMatchObject({ operation: 'probe_media_brush', preset_name: 'Square Charcoal' });
    expect(counts).toEqual({ dabs: 1, strokes: 1, previews: 1, closes: 1 });
  });
});
