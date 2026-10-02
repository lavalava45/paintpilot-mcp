import { describe, expect, it } from 'vitest';
import { normalizeSceneCameraImagingModel } from './scene-camera-imaging-model.js';
import { normalizeImagingPreflight } from './imaging-preflight.js';

const camera = normalizeSceneCameraImagingModel({
  model_id: 'camera', revision: 2,
  source_frame: { document_id: 1, document_incarnation: 'doc-1' },
  geometry_model_id: 'geom', geometry_model_revision: 3,
  camera: { framing: 'shared view', view_character: 'normal', lens_character: 'qualitative normal lens' },
  focus: { focal_depth_or_plane: 'mid-plane', depth_of_field_behavior: 'far softens progressively', foreground_softness: 'slight', background_softness: 'soft' },
  motion: { camera_motion: 'locked', subject_motion: 'none', shutter_character: 'static' },
  optical_response: { base_softness: 'low', bloom: 'none', halation: 'none' },
  capture_finish: { grain: 'fine', vignette: 'subtle', film_or_sensor_character: 'neutral' },
  intentional_exceptions: [],
});

const base = {
  scene_camera_model_id: 'camera', scene_camera_revision: 2,
  effect_kind: 'depth-of-field', motivation: 'Accepted depth places the foreground, focal subject and background on distinct focus roles.',
  scope: 'global', revalidate_edge_detail: true,
  owner_expectations: [
    { owner_id: 'near', depth_role: 'near', expected_focus_role: 'moderately_soft' },
    { owner_id: 'hero', depth_role: 'focal', expected_focus_role: 'sharp' },
    { owner_id: 'far', depth_role: 'far', expected_focus_role: 'soft' },
  ],
};

describe('E.20c imaging preflight', () => {
  it('accepts one coherent depth/focus allocation across multiple owners', () => {
    expect(normalizeImagingPreflight(base, camera).outcome).toBe('supported');
  });
  it('flags contradictory focus at the same depth without an explicit local exception', () => {
    const result = normalizeImagingPreflight({ ...base, owner_expectations: [
      { owner_id: 'a', depth_role: 'mid', expected_focus_role: 'sharp' },
      { owner_id: 'b', depth_role: 'mid', expected_focus_role: 'soft' },
    ] }, camera);
    expect(result.outcome).toBe('conflict');
  });
  it('rejects far sharpening against declared background softness and cannot clear geometry/recognition debt', () => {
    expect(normalizeImagingPreflight({ ...base, owner_expectations: [{ owner_id: 'far', depth_role: 'far', expected_focus_role: 'sharp' }] }, camera).outcome).toBe('conflict');
    expect(() => normalizeImagingPreflight({ ...base, debt_clearance_claims: ['geometry'] }, camera)).toThrow(/cannot claim to clear geometry or recognition debt/);
  });
});
