import { describe, expect, it } from 'vitest';
import {
  normalizeMaterialResponsePlan,
  normalizeMaterialResponseReview,
  materialResponseReviewResolved,
} from '../src/core/material-response.js';

function plan(overrides: Record<string, unknown> = {}) {
  const required = (intent: string) => ({ applicability: 'required', intent });
  const notApplicable = (intent: string) => ({ applicability: 'not-applicable', intent });
  return {
    response_role: 'base-material',
    components: {
      base_response: required('Establish the local color/value family before small variation.'),
      form_light_response: required('Light and shadow follow the established large form.'),
      specular_reflection: required('Use a restrained qualitative highlight/reflection character.'),
      transmission: notApplicable('This opaque material does not transmit the scene behind it.'),
      surface_condition: notApplicable('No separate wet/dust/wear condition is intended here.'),
      variation_scale: required('Variation stays at broad and medium material scales before microtexture.'),
      edge_contact: required('Material edges and contacts respond to neighbouring forms and occlusion.'),
    },
    microtexture: {
      policy: 'deferred',
      intent: 'Defer microtexture until base response, form light and contacts are coherent.',
    },
    ...overrides,
  };
}

describe('P1-C.9 qualitative material-response contract', () => {
  it('accepts a subject-agnostic opaque base-material decomposition without numeric PBR scores', () => {
    const normalized = normalizeMaterialResponsePlan(plan(), {
      physicalRole: 'opaque-mass',
      opacityRole: 'opaque',
    });
    expect(normalized.responseRole).toBe('base-material');
    expect(normalized.components.form_light_response.applicability).toBe('required');
    expect(normalized.microtexture.policy).toBe('deferred');
  });

  it('requires transmission when the physical owner is transmissive', () => {
    expect(() => normalizeMaterialResponsePlan(plan(), {
      physicalRole: 'transmissive-surface',
      opacityRole: 'transmissive',
    })).toThrow(/transmission\.applicability=required/);
  });

  it('keeps surface-condition and optical-effect roles distinct from base material', () => {
    expect(() => normalizeMaterialResponsePlan(plan(), { physicalRole: 'surface-condition' }))
      .toThrow(/response_role must be surface-condition/);
    expect(() => normalizeMaterialResponsePlan(plan(), { physicalRole: 'optical-effect' }))
      .toThrow(/response_role must be optical-effect/);
  });

  it('does not allow essential base response to disappear unless exact style basis is declared', () => {
    const candidate = plan();
    (candidate.components.form_light_response as any) = {
      applicability: 'not-applicable',
      intent: 'Intentional flat treatment omits volumetric form lighting.',
    };
    expect(() => normalizeMaterialResponsePlan(candidate)).toThrow(/style_contract_basis/);

    expect(() => normalizeMaterialResponsePlan({
      ...candidate,
      style_contract_basis: {
        field: 'material_treatment',
        criterion: 'flat graphic material treatment with intentionally planar color response',
      },
    })).not.toThrow();
  });

  it('reports texture-only material review as unresolved even when component labels look resolved', () => {
    const component = (note: string) => ({ status: 'resolved', note });
    const review = normalizeMaterialResponseReview({
      response_role: 'base-material',
      components: {
        base_response: component('The base family is visible at large scale.'),
        form_light_response: component('Large form light and shadow remain coherent.'),
        specular_reflection: component('The intended highlight character is visible.'),
        transmission: { status: 'not-applicable', note: 'The material is intentionally opaque.' },
        surface_condition: { status: 'not-applicable', note: 'No separate condition layer is required.' },
        variation_scale: component('Variation is distributed at broad and medium scales.'),
        edge_contact: component('Contacts and neighbouring edges remain causally readable.'),
      },
      microtexture: { status: 'supporting', note: 'Fine marks are present only as subordinate support.' },
      texture_only_treatment: true,
    });
    expect(materialResponseReviewResolved(review)).toBe(false);
  });
});
