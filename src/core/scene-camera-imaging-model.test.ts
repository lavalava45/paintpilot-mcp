import { describe, expect, it } from 'vitest';
import {
  cameraBindingStaleness,
  changedSceneCameraDependencyIds,
  normalizeCameraBinding,
  normalizeSceneCameraImagingModel,
  SCENE_CAMERA_IMAGING_MODEL_PROTOCOL,
} from './scene-camera-imaging-model.js';
import { normalizeSceneLightingColorModel } from './scene-lighting-color-model.js';

const cameraModel = {
  model_id: 'station-camera-01', revision: 1,
  source_frame: { document_id: 42, document_incarnation: 'uxp:42:camera', preview_sha256: 'a'.repeat(64) },
  geometry_model_id: 'station-geometry-01', geometry_model_revision: 3,
  lighting_color_model_id: 'station-light-color-01', lighting_color_model_revision: 2,
  camera: { framing: 'low three-quarter railway view', view_character: 'wide', lens_character: 'moderately wide environmental perspective' },
  focus: {
    focal_depth_or_plane: 'train-front-plane', depth_of_field_behavior: 'focal train remains crisp while distant fog softens',
    foreground_softness: 'slight', background_softness: 'progressive-with-depth',
  },
  motion: { camera_motion: 'locked', subject_motion: 'slow-arrival', shutter_character: 'mostly-frozen-with-minor-local-motion' },
  optical_response: { base_softness: 'low', bloom: 'local-around-headlight', halation: 'subtle-warm-edge' },
  capture_finish: { grain: 'fine', vignette: 'subtle', film_or_sensor_character: 'restrained-cinematic-digital' },
  intentional_exceptions: [],
};

describe('E.20a Scene Camera & Imaging Model', () => {
  it('binds one imaging model to exact E.18 geometry and optional E.19 light/color revisions', () => {
    const model = normalizeSceneCameraImagingModel(cameraModel);
    expect(model.protocol).toBe(SCENE_CAMERA_IMAGING_MODEL_PROTOCOL);
    expect(model).toMatchObject({
      geometry_model_id: 'station-geometry-01', geometry_model_revision: 3,
      lighting_color_model_id: 'station-light-color-01', lighting_color_model_revision: 2,
      camera: { view_character: 'wide' },
    });
  });

  it('keeps qualitative optics instead of inventing a physical lens solver', () => {
    const model = normalizeSceneCameraImagingModel({ ...cameraModel, camera: { ...cameraModel.camera, view_character: 'custom', lens_character: 'stylized compressed foreground with deliberately widened environmental framing' } });
    expect(model.camera.lens_character).toMatch(/stylized/);
    expect(model.camera).not.toHaveProperty('focal_length_mm');
  });

  it('requires lighting/color model id and revision as one provenance pair', () => {
    const broken = { ...cameraModel } as Record<string, unknown>;
    delete broken.lighting_color_model_revision;
    expect(() => normalizeSceneCameraImagingModel(broken)).toThrow(/supplied together/);
  });

  it('requires focus depth to come from accepted owner geometry or an explicit approximate-depth rationale', () => {
    expect(normalizeCameraBinding({
      scene_camera_model_id: 'station-camera-01', scene_camera_revision: 1,
      geometry_binding_owner_id: 'train', depth_role: 'focal', expected_focus_role: 'sharp',
    })).toMatchObject({ geometryBindingOwnerId: 'train', depthRole: 'focal', expectedFocusRole: 'sharp' });

    expect(normalizeCameraBinding({
      scene_camera_model_id: 'station-camera-01', scene_camera_revision: 1,
      depth_role: 'far', expected_focus_role: 'soft',
      approximate_depth_rationale: 'Atmospheric overlap and scale establish a far depth class without exact analytic geometry.',
    })).toMatchObject({ depthRole: 'far', expectedFocusRole: 'soft' });

    expect(() => normalizeCameraBinding({
      scene_camera_model_id: 'station-camera-01', scene_camera_revision: 1,
      depth_role: 'mid', expected_focus_role: 'moderately_soft',
    })).toThrow(/geometry_binding_owner_id or approximate_depth_rationale/);
  });

  it('selectively invalidates focus-bound owners while leaving capture-only changes unrelated', () => {
    const before = normalizeSceneCameraImagingModel(cameraModel);
    const focusChanged = normalizeSceneCameraImagingModel({
      ...cameraModel,
      revision: 2,
      focus: { ...cameraModel.focus, focal_depth_or_plane: 'far-platform-plane' },
    });
    const finishChanged = normalizeSceneCameraImagingModel({
      ...cameraModel,
      revision: 3,
      capture_finish: { ...cameraModel.capture_finish, grain: 'coarse' },
    });
    const motionChanged = normalizeSceneCameraImagingModel({
      ...cameraModel,
      revision: 4,
      motion: { ...cameraModel.motion, subject_motion: 'fast-arrival' },
    });
    const binding = normalizeCameraBinding({
      scene_camera_model_id: 'station-camera-01', scene_camera_revision: 1,
      geometry_binding_owner_id: 'train', depth_role: 'focal', expected_focus_role: 'sharp',
      dependency_domains: ['focus'],
    });
    expect(changedSceneCameraDependencyIds(before, focusChanged)).toContain('focus');
    expect(cameraBindingStaleness(binding, focusChanged, before)).toMatchObject({ stale: true, changed_dependency_ids: ['focus'] });
    expect(cameraBindingStaleness(binding, finishChanged, before)).toMatchObject({ stale: false, changed_dependency_ids: [] });

    const captureBinding = normalizeCameraBinding({
      scene_camera_model_id: 'station-camera-01', scene_camera_revision: 1,
      depth_role: 'far', expected_focus_role: 'soft', dependency_domains: ['capture-finish'],
      approximate_depth_rationale: 'Atmospheric overlap establishes a sufficient far-depth class for post treatment.',
    });
    expect(cameraBindingStaleness(captureBinding, finishChanged, before)).toMatchObject({ stale: true, changed_dependency_ids: ['capture-finish'] });

    const motionBinding = normalizeCameraBinding({
      scene_camera_model_id: 'station-camera-01', scene_camera_revision: 1,
      depth_role: 'mid', expected_focus_role: 'moderately_soft', dependency_domains: ['motion'],
      approximate_depth_rationale: 'Motion treatment uses a bounded approximate mid-depth class.',
    });
    expect(cameraBindingStaleness(motionBinding, motionChanged, before)).toMatchObject({ stale: true, changed_dependency_ids: ['motion'] });
  });

  it('keeps geometry-independent approximate depth bindings independent from pure geometry provenance changes', () => {
    const before = normalizeSceneCameraImagingModel(cameraModel);
    const geometryChanged = normalizeSceneCameraImagingModel({ ...cameraModel, revision: 2, geometry_model_revision: 4 });
    const approximate = normalizeCameraBinding({
      scene_camera_model_id: 'station-camera-01', scene_camera_revision: 1,
      depth_role: 'far', expected_focus_role: 'soft', dependency_domains: ['focus'],
      approximate_depth_rationale: 'Atmospheric overlap and scale are sufficient for a bounded far-depth class.',
    });
    expect(cameraBindingStaleness(approximate, geometryChanged, before)).toMatchObject({ stale: false, changed_dependency_ids: [] });
  });

  it('keeps atmospheric fog softness in E.19 distinct from optical depth-of-field softness in E.20', () => {
    const lighting = normalizeSceneLightingColorModel({
      model_id: 'station-light-color-01', revision: 2,
      source_frame: { document_id: 42, document_incarnation: 'uxp:42:camera' },
      global_value_structure: { key: 'low' },
      ambient_environment: { id: 'twilight', role: 'ambient', family: 'cool_teal', provenance: 'user-or-prompt', chroma: 'low', value_role: 'fill' },
      emitters: [],
      atmosphere: { id: 'fog', density_role: 'high', color_bias: 'cool', contrast_effect: 'decreases-with-depth', provenance: 'user-or-prompt' },
      palette_relations: [], sampled_anchors: [], intentional_exceptions: [],
    });
    const camera = normalizeSceneCameraImagingModel(cameraModel);
    expect(lighting.atmosphere?.id).toBe('fog');
    expect(camera.focus.depth_of_field_behavior).toMatch(/focal train remains crisp/);
    expect(camera).not.toHaveProperty('atmosphere');
  });
});
