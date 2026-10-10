import { describe, expect, it } from 'vitest';
import { geometryOptOutAuthorityIssue, normalizeSceneGeometryModel, SCENE_GEOMETRY_MODEL_PROTOCOL } from './scene-geometry-model.js';

function coherentModel(): any {
  return {
    model_id: 'station-perspective-01', revision: 1, applicability: 'coherent_3d',
    source_frame: { document_id: 7, document_incarnation: 'doc-7-a', width: 1600, height: 900, operation_id: 'op-frame-1', preview_sha256: 'a'.repeat(64) },
    projection: { kind: 'one_point', horizon: { line: [{ x: 0, y: 310 }, { x: 1600, y: 310 }] }, vanishing_points: [
      { id: 'rail_depth', x: 811.5, y: 310, evidence: 'derived', derived_from: ['right_rail', 'left_rail'] },
    ] },
  };
}

describe('scene geometry model', () => {
  it('normalizes frame provenance and distinguishes derived vanishing evidence', () => {
    const model = normalizeSceneGeometryModel(coherentModel());
    expect(model.protocol).toBe(SCENE_GEOMETRY_MODEL_PROTOCOL);
    expect(model.source_frame.preview_sha256).toBe('a'.repeat(64));
    expect(model.projection.vanishing_points[0]).toMatchObject({ evidence: 'derived', derived_from: ['left_rail', 'right_rail'] });
  });
  it('preserves an opaque host document-incarnation witness token', () => {
    const value = coherentModel();
    value.source_frame.document_incarnation = 'uxp-session-abc:document:7';
    expect(normalizeSceneGeometryModel(value).source_frame.document_incarnation)
      .toBe('uxp-session-abc:document:7');
  });
  it('keeps non-3D applicability structural while rationale remains optional guidance', () => {
    const value = coherentModel(); value.applicability = 'flat_or_collage';
    const withoutRationale = normalizeSceneGeometryModel(value);
    expect(withoutRationale.applicability).toBe('flat_or_collage');
    expect(withoutRationale).not.toHaveProperty('applicability_rationale');
    value.applicability_rationale = 'Intentional flat poster-space composition.';
    expect(normalizeSceneGeometryModel(value).applicability_rationale).toBe('Intentional flat poster-space composition.');
  });
  it('requires a non-3D opt-out to bind exactly to the active durable style contract', () => {
    const value = coherentModel();
    value.applicability = 'flat_or_collage';
    value.applicability_rationale = 'The brief intentionally uses flat poster space.';
    const unsupported = normalizeSceneGeometryModel(value);
    expect(geometryOptOutAuthorityIssue(unsupported, { spatial_treatment: 'coherent perspective depth' }))
      .toMatch(/requires applicability_style_contract_basis/);

    value.applicability_style_contract_basis = {
      field: 'spatial_treatment',
      criterion: 'intentional flat collage space with no shared 3D projection',
    };
    const authorized = normalizeSceneGeometryModel(value);
    expect(geometryOptOutAuthorityIssue(authorized, {
      spatial_treatment: 'intentional flat collage space with no shared 3D projection',
    })).toBeUndefined();
    expect(geometryOptOutAuthorityIssue(authorized, {
      spatial_treatment: 'orthographic technical diagram',
    })).toMatch(/does not exactly match/);
  });
  it('requires at least two declared source lines for derived vanishing evidence', () => {
    const value = coherentModel(); value.projection.vanishing_points[0].derived_from = ['left_rail'];
    expect(() => normalizeSceneGeometryModel(value)).toThrow(/requires at least two source line ids/);
  });
});
