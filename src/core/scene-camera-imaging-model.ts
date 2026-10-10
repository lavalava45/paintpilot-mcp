export const SCENE_CAMERA_IMAGING_MODEL_PROTOCOL = 'photoshop.guard.scene_camera_imaging_model.v1' as const;

export type CameraViewCharacter = 'wide' | 'normal' | 'compressed' | 'custom';
export type CameraDepthRole = 'near' | 'focal' | 'mid' | 'far';
export type CameraFocusRole = 'sharp' | 'moderately_soft' | 'soft' | 'lost';
export const CAMERA_BINDING_DEPENDENCY_DOMAINS = ['focus', 'motion', 'optical-response', 'capture-finish'] as const;
export type CameraBindingDependencyDomain = (typeof CAMERA_BINDING_DEPENDENCY_DOMAINS)[number];

export interface CameraBinding {
  sceneCameraModelId: string;
  sceneCameraRevision: number;
  geometryBindingOwnerId?: string;
  depthRole: CameraDepthRole;
  expectedFocusRole: CameraFocusRole;
  dependencyDomains: CameraBindingDependencyDomain[];
  localException?: string;
  approximateDepthRationale?: string;
}

export interface CameraBindingStaleness {
  stale: boolean;
  reason: 'current' | 'model_identity_changed' | 'source_revision_unavailable' | 'dependency_changed';
  changed_dependency_ids: string[];
}

export interface SceneCameraImagingModel {
  protocol: typeof SCENE_CAMERA_IMAGING_MODEL_PROTOCOL;
  model_id: string;
  revision: number;
  source_frame: {
    document_id: number;
    document_incarnation: string;
    operation_id?: string;
    preview_sha256?: string;
  };
  geometry_model_id: string;
  geometry_model_revision: number;
  lighting_color_model_id?: string;
  lighting_color_model_revision?: number;
  camera: {
    framing: string;
    view_character: CameraViewCharacter;
    lens_character: string;
  };
  focus: {
    focal_depth_or_plane: string;
    depth_of_field_behavior: string;
    foreground_softness: string;
    background_softness: string;
  };
  motion: {
    camera_motion: string;
    subject_motion: string;
    shutter_character: string;
  };
  optical_response: {
    base_softness: string;
    bloom: string;
    halation: string;
  };
  capture_finish: {
    grain: string;
    vignette: string;
    film_or_sensor_character: string;
  };
  intentional_exceptions: Array<{ id: string; relation: string; rationale: string }>;
}

export const SCENE_CAMERA_IMAGING_MODEL_SCHEMA = {
  type: 'object',
  description: 'Incarnation-bound camera, focus, motion, optical response and capture-finish model. Updates preserve model_id and increase revision.',
  properties: {
    protocol: { type: 'string', enum: [SCENE_CAMERA_IMAGING_MODEL_PROTOCOL] },
    model_id: { type: 'string' },
    revision: { type: 'integer', minimum: 1 },
    source_frame: {
      type: 'object',
      properties: {
        document_id: { type: 'integer', minimum: 1 },
        document_incarnation: { type: 'string', minLength: 1 },
        operation_id: { type: 'string' },
        preview_sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
      },
      required: ['document_id', 'document_incarnation'],
      additionalProperties: false,
    },
    geometry_model_id: { type: 'string' },
    geometry_model_revision: { type: 'integer', minimum: 1 },
    lighting_color_model_id: { type: 'string' },
    lighting_color_model_revision: { type: 'integer', minimum: 1 },
    camera: {
      type: 'object',
      properties: {
        framing: { type: 'string', minLength: 1 },
        view_character: { type: 'string', enum: ['wide', 'normal', 'compressed', 'custom'] },
        lens_character: { type: 'string', minLength: 1 },
      },
      required: ['framing', 'view_character', 'lens_character'],
      additionalProperties: false,
    },
    focus: {
      type: 'object',
      properties: {
        focal_depth_or_plane: { type: 'string', minLength: 1 },
        depth_of_field_behavior: { type: 'string', minLength: 1 },
        foreground_softness: { type: 'string', minLength: 1 },
        background_softness: { type: 'string', minLength: 1 },
      },
      required: ['focal_depth_or_plane', 'depth_of_field_behavior', 'foreground_softness', 'background_softness'],
      additionalProperties: false,
    },
    motion: {
      type: 'object',
      properties: {
        camera_motion: { type: 'string', minLength: 1 },
        subject_motion: { type: 'string', minLength: 1 },
        shutter_character: { type: 'string', minLength: 1 },
      },
      required: ['camera_motion', 'subject_motion', 'shutter_character'],
      additionalProperties: false,
    },
    optical_response: {
      type: 'object',
      properties: {
        base_softness: { type: 'string', minLength: 1 },
        bloom: { type: 'string', minLength: 1 },
        halation: { type: 'string', minLength: 1 },
      },
      required: ['base_softness', 'bloom', 'halation'],
      additionalProperties: false,
    },
    capture_finish: {
      type: 'object',
      properties: {
        grain: { type: 'string', minLength: 1 },
        vignette: { type: 'string', minLength: 1 },
        film_or_sensor_character: { type: 'string', minLength: 1 },
      },
      required: ['grain', 'vignette', 'film_or_sensor_character'],
      additionalProperties: false,
    },
    intentional_exceptions: {
      type: 'array', maxItems: 16,
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, relation: { type: 'string', minLength: 1 }, rationale: { type: 'string', minLength: 1 } },
        required: ['id', 'relation', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'model_id', 'revision', 'source_frame', 'geometry_model_id', 'geometry_model_revision',
    'camera', 'focus', 'motion', 'optical_response', 'capture_finish',
  ],
  additionalProperties: false,
} as const;

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const SHA256 = /^[a-fA-F0-9]{64}$/;

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}
function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (!ID.test(result)) throw new Error(`${path} must be a stable id`);
  return result;
}
function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new Error(`${path} must be a positive integer`);
  return value;
}

export function normalizeCameraBinding(value: unknown): CameraBinding {
  const raw = object(value, 'camera_binding');
  const depthRole = text(raw.depth_role, 'camera_binding.depth_role') as CameraDepthRole;
  if (!['near', 'focal', 'mid', 'far'].includes(depthRole)) {
    throw new Error('camera_binding.depth_role must be near|focal|mid|far');
  }
  const expectedFocusRole = text(raw.expected_focus_role, 'camera_binding.expected_focus_role') as CameraFocusRole;
  if (!['sharp', 'moderately_soft', 'soft', 'lost'].includes(expectedFocusRole)) {
    throw new Error('camera_binding.expected_focus_role must be sharp|moderately_soft|soft|lost');
  }
  const geometryBindingOwnerId = raw.geometry_binding_owner_id === undefined
    ? undefined
    : id(raw.geometry_binding_owner_id, 'camera_binding.geometry_binding_owner_id');
  const approximateDepthRationale = raw.approximate_depth_rationale === undefined
    ? undefined
    : text(raw.approximate_depth_rationale, 'camera_binding.approximate_depth_rationale');
  if (!geometryBindingOwnerId && !approximateDepthRationale) {
    throw new Error('camera_binding requires geometry_binding_owner_id or approximate_depth_rationale');
  }
  const dependencyDomainsRaw = raw.dependency_domains ?? ['focus'];
  if (!Array.isArray(dependencyDomainsRaw) || !dependencyDomainsRaw.length || dependencyDomainsRaw.length > 4) {
    throw new Error('camera_binding.dependency_domains must contain 1-4 entries');
  }
  const dependencyDomains = [...new Set(dependencyDomainsRaw.map((entry, index) => {
    const domain = text(entry, `camera_binding.dependency_domains[${index}]`) as CameraBindingDependencyDomain;
    if (!CAMERA_BINDING_DEPENDENCY_DOMAINS.includes(domain)) {
      throw new Error(`camera_binding.dependency_domains[${index}] must be one of ${CAMERA_BINDING_DEPENDENCY_DOMAINS.join('|')}`);
    }
    return domain;
  }))];
  return {
    sceneCameraModelId: id(raw.scene_camera_model_id, 'camera_binding.scene_camera_model_id'),
    sceneCameraRevision: positiveInteger(raw.scene_camera_revision, 'camera_binding.scene_camera_revision'),
    ...(geometryBindingOwnerId ? { geometryBindingOwnerId } : {}),
    depthRole,
    expectedFocusRole,
    dependencyDomains,
    ...(raw.local_exception === undefined ? {} : { localException: text(raw.local_exception, 'camera_binding.local_exception') }),
    ...(approximateDepthRationale ? { approximateDepthRationale } : {}),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function changedSceneCameraDependencyIds(previous: SceneCameraImagingModel, current: SceneCameraImagingModel): string[] {
  if (previous.model_id !== current.model_id) return ['__camera_model__'];
  const changed: string[] = [];
  if (stableJson(previous.camera) !== stableJson(current.camera)) changed.push('camera');
  if (stableJson(previous.focus) !== stableJson(current.focus)) changed.push('focus');
  if (stableJson(previous.motion) !== stableJson(current.motion)) changed.push('motion');
  if (stableJson(previous.optical_response) !== stableJson(current.optical_response)) changed.push('optical-response');
  if (stableJson(previous.capture_finish) !== stableJson(current.capture_finish)) changed.push('capture-finish');
  if (previous.geometry_model_id !== current.geometry_model_id
      || previous.geometry_model_revision !== current.geometry_model_revision) changed.push('geometry');
  if ((previous.lighting_color_model_id ?? null) !== (current.lighting_color_model_id ?? null)
      || (previous.lighting_color_model_revision ?? null) !== (current.lighting_color_model_revision ?? null)) changed.push('lighting-color');
  return changed.sort();
}

export function cameraBindingStaleness(
  binding: CameraBinding,
  current: SceneCameraImagingModel,
  sourceRevision?: SceneCameraImagingModel | null,
): CameraBindingStaleness {
  if (binding.sceneCameraModelId !== current.model_id) {
    return { stale: true, reason: 'model_identity_changed', changed_dependency_ids: ['__camera_model__'] };
  }
  if (binding.sceneCameraRevision === current.revision) {
    return { stale: false, reason: 'current', changed_dependency_ids: [] };
  }
  if (!sourceRevision || sourceRevision.model_id !== binding.sceneCameraModelId || sourceRevision.revision !== binding.sceneCameraRevision) {
    return { stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [] };
  }
  const changed = changedSceneCameraDependencyIds(sourceRevision, current);
  const dependencies = new Set<string>(binding.dependencyDomains);
  if (binding.geometryBindingOwnerId) dependencies.add('geometry');
  const relevant = changed.filter(id => id === '__camera_model__' || dependencies.has(id));
  return {
    stale: relevant.length > 0,
    reason: relevant.length ? 'dependency_changed' : 'current',
    changed_dependency_ids: relevant,
  };
}

export function normalizeSceneCameraImagingModel(value: unknown): SceneCameraImagingModel {
  const raw = object(value, 'scene_camera_imaging_model');
  const source = object(raw.source_frame, 'scene_camera_imaging_model.source_frame');
  const camera = object(raw.camera, 'scene_camera_imaging_model.camera');
  const focus = object(raw.focus, 'scene_camera_imaging_model.focus');
  const motion = object(raw.motion, 'scene_camera_imaging_model.motion');
  const optical = object(raw.optical_response, 'scene_camera_imaging_model.optical_response');
  const finish = object(raw.capture_finish, 'scene_camera_imaging_model.capture_finish');
  const viewCharacter = text(camera.view_character, 'scene_camera_imaging_model.camera.view_character') as CameraViewCharacter;
  if (!['wide', 'normal', 'compressed', 'custom'].includes(viewCharacter)) {
    throw new Error('scene_camera_imaging_model.camera.view_character must be wide|normal|compressed|custom');
  }
  const lightId = raw.lighting_color_model_id === undefined
    ? undefined
    : id(raw.lighting_color_model_id, 'scene_camera_imaging_model.lighting_color_model_id');
  const lightRevision = raw.lighting_color_model_revision === undefined
    ? undefined
    : positiveInteger(raw.lighting_color_model_revision, 'scene_camera_imaging_model.lighting_color_model_revision');
  if ((lightId === undefined) !== (lightRevision === undefined)) {
    throw new Error('scene_camera_imaging_model lighting/color model id and revision must be supplied together');
  }
  const exceptionsRaw = raw.intentional_exceptions ?? [];
  if (!Array.isArray(exceptionsRaw) || exceptionsRaw.length > 16) {
    throw new Error('scene_camera_imaging_model.intentional_exceptions must contain at most 16 entries');
  }
  const result: SceneCameraImagingModel = {
    protocol: SCENE_CAMERA_IMAGING_MODEL_PROTOCOL,
    model_id: id(raw.model_id, 'scene_camera_imaging_model.model_id'),
    revision: positiveInteger(raw.revision, 'scene_camera_imaging_model.revision'),
    source_frame: {
      document_id: positiveInteger(source.document_id, 'scene_camera_imaging_model.source_frame.document_id'),
      document_incarnation: text(source.document_incarnation, 'scene_camera_imaging_model.source_frame.document_incarnation'),
      ...(source.operation_id === undefined ? {} : { operation_id: id(source.operation_id, 'scene_camera_imaging_model.source_frame.operation_id') }),
      ...(source.preview_sha256 === undefined ? {} : { preview_sha256: text(source.preview_sha256, 'scene_camera_imaging_model.source_frame.preview_sha256').toLowerCase() }),
    },
    geometry_model_id: id(raw.geometry_model_id, 'scene_camera_imaging_model.geometry_model_id'),
    geometry_model_revision: positiveInteger(raw.geometry_model_revision, 'scene_camera_imaging_model.geometry_model_revision'),
    ...(lightId ? { lighting_color_model_id: lightId, lighting_color_model_revision: lightRevision } : {}),
    camera: {
      framing: text(camera.framing, 'scene_camera_imaging_model.camera.framing'),
      view_character: viewCharacter,
      lens_character: text(camera.lens_character, 'scene_camera_imaging_model.camera.lens_character'),
    },
    focus: {
      focal_depth_or_plane: text(focus.focal_depth_or_plane, 'scene_camera_imaging_model.focus.focal_depth_or_plane'),
      depth_of_field_behavior: text(focus.depth_of_field_behavior, 'scene_camera_imaging_model.focus.depth_of_field_behavior'),
      foreground_softness: text(focus.foreground_softness, 'scene_camera_imaging_model.focus.foreground_softness'),
      background_softness: text(focus.background_softness, 'scene_camera_imaging_model.focus.background_softness'),
    },
    motion: {
      camera_motion: text(motion.camera_motion, 'scene_camera_imaging_model.motion.camera_motion'),
      subject_motion: text(motion.subject_motion, 'scene_camera_imaging_model.motion.subject_motion'),
      shutter_character: text(motion.shutter_character, 'scene_camera_imaging_model.motion.shutter_character'),
    },
    optical_response: {
      base_softness: text(optical.base_softness, 'scene_camera_imaging_model.optical_response.base_softness'),
      bloom: text(optical.bloom, 'scene_camera_imaging_model.optical_response.bloom'),
      halation: text(optical.halation, 'scene_camera_imaging_model.optical_response.halation'),
    },
    capture_finish: {
      grain: text(finish.grain, 'scene_camera_imaging_model.capture_finish.grain'),
      vignette: text(finish.vignette, 'scene_camera_imaging_model.capture_finish.vignette'),
      film_or_sensor_character: text(finish.film_or_sensor_character, 'scene_camera_imaging_model.capture_finish.film_or_sensor_character'),
    },
    intentional_exceptions: exceptionsRaw.map((entry, index) => {
      const row = object(entry, `scene_camera_imaging_model.intentional_exceptions[${index}]`);
      return {
        id: id(row.id, `scene_camera_imaging_model.intentional_exceptions[${index}].id`),
        relation: text(row.relation, `scene_camera_imaging_model.intentional_exceptions[${index}].relation`),
        rationale: text(row.rationale, `scene_camera_imaging_model.intentional_exceptions[${index}].rationale`),
      };
    }),
  };
  if (result.source_frame.preview_sha256 && !SHA256.test(result.source_frame.preview_sha256)) {
    throw new Error('scene_camera_imaging_model.source_frame.preview_sha256 must be a SHA-256 hex digest');
  }
  return result;
}
