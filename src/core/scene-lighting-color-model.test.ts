import { describe, expect, it } from 'vitest';
import {
  assertLightingColorBindingMatchesScene,
  changedSceneLightingColorDependencyIds,
  lightingColorBindingStaleness,
  normalizeSceneLightingColorModel,
} from './scene-lighting-color-model.js';
import { normalizeMaterialResponsePlan } from './material-response.js';

const railway = {
  model_id: 'station-light-color-01',
  revision: 1,
  source_frame: { document_id: 42, document_incarnation: 'uxp:42:abc', preview_sha256: 'a'.repeat(64) },
  global_value_structure: { key: 'low', local_value_anchor: 'train_headlight', atmospheric_lift: 'fog' },
  ambient_environment: { id: 'twilight', role: 'ambient', family: 'cool_blue_teal', provenance: 'user-or-prompt', chroma: 'low', value_role: 'twilight_fill' },
  emitters: [{ id: 'train_headlight', role: 'emitter', family: 'warm_amber', provenance: 'user-or-prompt', light_role: 'local_primary' }],
  atmosphere: { id: 'fog', density_role: 'high', color_bias: 'cool_neutral', contrast_effect: 'decreases_with_depth', provenance: 'user-or-prompt' },
  palette_relations: ['cool_environment_dominates_warm_accents', 'distant_chroma_not_greater_than_near_chroma'],
  sampled_anchors: [],
  intentional_exceptions: [],
};

describe('Scene Lighting & Color Model', () => {
  it('preserves relational prompt constraints without inventing exact RGB values', () => {
    const model = normalizeSceneLightingColorModel(railway);
    expect(model.ambient_environment).toMatchObject({ family: 'cool_blue_teal', provenance: 'user-or-prompt' });
    expect(model.emitters[0]).toMatchObject({ family: 'warm_amber', light_role: 'local_primary' });
    expect(model.palette_relations).toContain('cool_environment_dominates_warm_accents');
    expect(model.ambient_environment).not.toHaveProperty('sample');
    expect(model.emitters[0]).not.toHaveProperty('sample');
  });

  it('keeps artist-selected exact values distinct from measured evidence', () => {
    expect(() => normalizeSceneLightingColorModel({
      ...railway,
      sampled_anchors: [{ id: 'sky', role: 'sky', family: 'teal', provenance: 'artist-selected', sample: { rgb: [20, 40, 45], source: 'guess' } }],
    })).toThrow(/sample is evidence|sampled_anchors/);
  });

  it('requires exact sample evidence when reference-sample provenance is claimed', () => {
    expect(() => normalizeSceneLightingColorModel({
      ...railway,
      sampled_anchors: [{ id: 'reference-green', role: 'base', family: 'muted_green', provenance: 'reference-sample' }],
    })).toThrow(/requires exact sample evidence/);
  });

  it('accepts a sampled reference anchor with explicit source', () => {
    const model = normalizeSceneLightingColorModel({
      ...railway,
      sampled_anchors: [{ id: 'reference-green', role: 'base', family: 'muted_green', provenance: 'reference-sample', sample: { rgb: [41, 68, 61], source: 'reference crop x=20 y=30' } }],
    });
    expect(model.sampled_anchors[0].sample?.rgb).toEqual([41, 68, 61]);
  });

  it('binds a material response to the exact scene revision and named causal sources', () => {
    const model = normalizeSceneLightingColorModel(railway);
    const required = (intent: string) => ({ applicability: 'required', intent });
    const na = (intent: string) => ({ applicability: 'not-applicable', intent });
    const material = normalizeMaterialResponsePlan({
      response_role: 'base-material',
      components: {
        base_response: required('Muted painted metal base response remains readable.'),
        form_light_response: required('Form receives twilight and local headlight illumination.'),
        specular_reflection: required('Wet metal carries a bounded headlight reflection.'),
        transmission: na('Opaque painted metal has no transmission in this owner.'),
        surface_condition: required('Wet surface condition modifies reflections without replacing form.'),
        variation_scale: required('Broad and medium variation precedes microtexture.'),
        edge_contact: required('Contacts remain consistent with the receiving metal form.'),
      },
      microtexture: { policy: 'deferred', intent: 'Microtexture waits for causal material/light response.' },
      lighting_color_binding: {
        scene_model_id: 'station-light-color-01',
        scene_model_revision: 1,
        base_color_family: 'muted_green_painted_metal',
        receives: ['twilight', 'train_headlight'],
        atmosphere: 'fog',
        reflection_sources: ['train_headlight'],
        surface_condition: 'wet',
        color_relations: ['shadow_cooler_than_local_warm_reflection', 'distant_response_lower_chroma'],
      },
    });
    expect(material.lightingColorBinding?.baseColorFamily).toBe('muted_green_painted_metal');
    expect(() => assertLightingColorBindingMatchesScene(material.lightingColorBinding!, model)).not.toThrow();
  });

  it('rejects stale scene revisions and invented emitter references in material bindings', () => {
    const model = normalizeSceneLightingColorModel(railway);
    expect(() => assertLightingColorBindingMatchesScene({
      sceneModelId: model.model_id, sceneModelRevision: 2, receives: ['twilight'],
      reflectionSources: [],
    }, model)).toThrow(/active scene lighting\/color model revision/);
    expect(() => assertLightingColorBindingMatchesScene({
      sceneModelId: model.model_id, sceneModelRevision: 1, receives: ['moon'],
      reflectionSources: [],
    }, model)).toThrow(/unknown scene source/);
  });

  it('selectively invalidates headlight dependents without staling unrelated ambient material', () => {
    const before = normalizeSceneLightingColorModel(railway);
    const after = normalizeSceneLightingColorModel({
      ...railway,
      revision: 2,
      emitters: [{ ...railway.emitters[0], family: 'pale_lemon' }],
    });
    expect(changedSceneLightingColorDependencyIds(before, after)).toEqual(['train_headlight']);
    expect(lightingColorBindingStaleness({
      sceneModelId: before.model_id,
      sceneModelRevision: 1,
      receives: ['twilight', 'train_headlight'],
      reflectionSources: ['train_headlight'],
    }, after, before)).toMatchObject({ stale: true, reason: 'dependency_changed', changed_dependency_ids: ['train_headlight'] });
    expect(lightingColorBindingStaleness({
      sceneModelId: before.model_id,
      sceneModelRevision: 1,
      receives: ['twilight'],
      reflectionSources: [],
    }, after, before)).toMatchObject({ stale: false, reason: 'current', changed_dependency_ids: [] });
  });

  it('invalidates atmosphere dependents but ignores a revision-only change', () => {
    const before = normalizeSceneLightingColorModel(railway);
    const revisionOnly = normalizeSceneLightingColorModel({ ...railway, revision: 2 });
    const fogChanged = normalizeSceneLightingColorModel({
      ...railway,
      revision: 3,
      atmosphere: { ...railway.atmosphere, density_role: 'medium' },
    });
    const binding = {
      sceneModelId: before.model_id,
      sceneModelRevision: 1,
      receives: ['twilight'],
      atmosphere: 'fog',
      reflectionSources: [],
    };
    expect(lightingColorBindingStaleness(binding, revisionOnly, before).stale).toBe(false);
    expect(lightingColorBindingStaleness(binding, fogChanged, before)).toMatchObject({
      stale: true,
      changed_dependency_ids: ['fog'],
    });
  });

  it('preserves an explicit stylized nonphysical palette departure without recasting it as measured evidence', () => {
    const model = normalizeSceneLightingColorModel({
      ...railway,
      intentional_exceptions: [{
        id: 'stylized-magenta-fog',
        relation: 'fog_may_be_warmer_than_ambient_for_graphic_emphasis',
        rationale: 'Deliberate stylized palette departure while preserving the declared local warm-emitter hierarchy.',
      }],
    });
    expect(model.intentional_exceptions).toEqual([
      expect.objectContaining({ id: 'stylized-magenta-fog', relation: 'fog_may_be_warmer_than_ambient_for_graphic_emphasis' }),
    ]);
    expect(model.intentional_exceptions[0]).not.toHaveProperty('sample');
  });

  it('supports grayscale/monochrome scenes without inventing hue or chroma complexity', () => {
    const model = normalizeSceneLightingColorModel({
      model_id: 'monochrome-study', revision: 1,
      source_frame: { document_id: 42, document_incarnation: 'uxp:42:mono' },
      global_value_structure: { key: 'mid', local_value_anchor: 'window-light' },
      ambient_environment: {
        id: 'gray-ambient', role: 'ambient', family: 'neutral_gray', provenance: 'user-or-prompt',
        chroma: 'low', value_role: 'midkey_fill',
      },
      emitters: [{
        id: 'window-light', role: 'emitter', family: 'neutral_light', provenance: 'user-or-prompt', light_role: 'local_value_anchor',
      }],
      palette_relations: ['value_separation_only'],
      sampled_anchors: [], intentional_exceptions: [],
    });
    expect(model.ambient_environment?.family).toBe('neutral_gray');
    expect(model.palette_relations).toEqual(['value_separation_only']);
    expect(model.sampled_anchors).toEqual([]);
  });
});
