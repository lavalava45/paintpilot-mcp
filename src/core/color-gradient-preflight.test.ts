import { describe, expect, it } from 'vitest';
import { normalizeSceneLightingColorModel } from './scene-lighting-color-model.js';
import { normalizeColorGradientPreflight } from './color-gradient-preflight.js';

const model = normalizeSceneLightingColorModel({
  model_id: 'railway-light', revision: 2,
  source_frame: { document_id: 42, document_incarnation: 'fixture:42' },
  global_value_structure: { key: 'low' },
  ambient_environment: { id: 'twilight', role: 'ambient', family: 'cool_teal', provenance: 'user-or-prompt', chroma: 'low', value_role: 'fill' },
  emitters: [{ id: 'headlight', role: 'emitter', family: 'warm_amber', provenance: 'user-or-prompt', light_role: 'local_primary' }],
  palette_relations: ['cool_environment_dominates_warm_accents'],
  sampled_anchors: [{ id: 'reference-horizon', role: 'horizon', family: 'mist_teal', provenance: 'reference-sample', sample: { rgb: [41, 68, 61], source: 'reference crop' } }],
  intentional_exceptions: [],
});

const base = {
  scene_model_id: 'railway-light', scene_model_revision: 2,
  field_role: 'twilight sky field', interaction: 'ambient environment through distant mist',
  required_relations: ['cool_environment_dominates_warm_accents'], artistic_choices: ['upper twilight teal remains revisable'],
  stops: [
    { id: 'upper', role: 'upper twilight', family: 'cool_teal', provenance: 'artist-selected', rgb: [20, 42, 48], artistic_choice: 'Selected within the established cool low-chroma family.' },
    { id: 'horizon', role: 'mist-bright horizon', family: 'mist_teal', provenance: 'reference-sample', source_anchor_id: 'reference-horizon', rgb: [41, 68, 61] },
  ],
};

describe('E.19d color/gradient preflight', () => {
  it('keeps semantic stop roles and artist-selected RGB distinct from sampled evidence', () => {
    const receipt = normalizeColorGradientPreflight(base, model);
    expect(receipt.outcome).toBe('supported');
    expect(receipt.stops[0]).toMatchObject({ role: 'upper twilight', provenance: 'artist-selected' });
    expect(receipt.stops[1]).toMatchObject({ source_anchor_id: 'reference-horizon', provenance: 'reference-sample' });
  });

  it('allows a different artist-selected teal when the same scene relations remain satisfied', () => {
    const receipt = normalizeColorGradientPreflight({
      ...base,
      stops: [{ ...base.stops[0], rgb: [24, 48, 54] }, base.stops[1]],
    }, model);
    expect(receipt.outcome).toBe('supported');
    expect(receipt.stops[0]).toMatchObject({ provenance: 'artist-selected', rgb: [24, 48, 54] });
  });

  it('reports conflict when an exact reference stop contradicts its sampled anchor', () => {
    const receipt = normalizeColorGradientPreflight({ ...base, stops: [base.stops[0], { ...base.stops[1], rgb: [90, 20, 20] }] }, model);
    expect(receipt.outcome).toBe('conflict');
    expect(receipt.findings.join(' ')).toMatch(/contradicts sampled anchor/);
  });

  it('fails closed on a stale scene revision or untraceable reference stop', () => {
    expect(() => normalizeColorGradientPreflight({ ...base, scene_model_revision: 1 }, model)).toThrow(/exact active/);
    expect(() => normalizeColorGradientPreflight({ ...base, stops: [{ ...base.stops[1], source_anchor_id: 'missing' }] }, model)).toThrow(/unknown source anchor/);
  });
});
