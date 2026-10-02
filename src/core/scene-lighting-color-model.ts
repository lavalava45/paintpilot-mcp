export const SCENE_LIGHTING_COLOR_MODEL_PROTOCOL = 'photoshop.guard.scene_lighting_color_model.v1' as const;

export const COLOR_PROVENANCE = [
  'user-or-prompt', 'reference-sample', 'accepted-frame', 'deterministic-derivation', 'artist-selected',
] as const;
export type ColorProvenance = (typeof COLOR_PROVENANCE)[number];

export interface ColorAnchor {
  id: string;
  role: string;
  family: string;
  provenance: ColorProvenance;
  sample?: { rgb: [number, number, number]; source: string };
}

export interface SceneLightingColorModel {
  protocol: typeof SCENE_LIGHTING_COLOR_MODEL_PROTOCOL;
  model_id: string;
  revision: number;
  source_frame: {
    document_id: number;
    document_incarnation: string;
    operation_id?: string;
    preview_sha256?: string;
  };
  global_value_structure: {
    key: 'low' | 'mid' | 'high' | 'mixed';
    local_value_anchor?: string;
    atmospheric_lift?: string;
  };
  ambient_environment?: ColorAnchor & { chroma: 'low' | 'medium' | 'high'; value_role: string };
  emitters: Array<ColorAnchor & { light_role: string }>;
  atmosphere?: {
    id: string;
    density_role: string;
    color_bias: string;
    contrast_effect: string;
    provenance: ColorProvenance;
  };
  palette_relations: string[];
  sampled_anchors: ColorAnchor[];
  intentional_exceptions: Array<{ id: string; relation: string; rationale: string }>;
}

export interface LightingColorBindingLike {
  sceneModelId: string;
  sceneModelRevision: number;
  receives: string[];
  atmosphere?: string;
  reflectionSources: string[];
  spatialRelation?: {
    sceneGeometryModelId: string;
    sceneGeometryRevision: number;
    dependencyIds: string[];
  };
}

export interface LightingColorBindingStaleness {
  stale: boolean;
  reason: 'current' | 'model_identity_changed' | 'source_revision_unavailable' | 'dependency_changed';
  changed_dependency_ids: string[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Returns scene-level causal ids whose light/color meaning changed between revisions. */
export function changedSceneLightingColorDependencyIds(
  previous: SceneLightingColorModel,
  current: SceneLightingColorModel,
): string[] {
  if (previous.model_id !== current.model_id) return ['__scene_light_color__'];
  const before = new Map<string, unknown>();
  const after = new Map<string, unknown>();
  const collect = (model: SceneLightingColorModel, target: Map<string, unknown>) => {
    target.set('__global_value__', model.global_value_structure);
    target.set('__palette_relations__', model.palette_relations);
    if (model.ambient_environment) target.set(model.ambient_environment.id, model.ambient_environment);
    if (model.atmosphere) target.set(model.atmosphere.id, model.atmosphere);
    for (const emitter of model.emitters) target.set(emitter.id, emitter);
    for (const anchor of model.sampled_anchors) target.set(anchor.id, anchor);
  };
  collect(previous, before);
  collect(current, after);
  const changed = new Set<string>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (stableJson(before.get(id)) !== stableJson(after.get(id))) changed.add(id);
  }
  return [...changed].sort();
}

export function lightingColorBindingDependencyIds(binding: LightingColorBindingLike & { colorRelations?: string[] }): string[] {
  return [...new Set([
    ...binding.receives,
    ...binding.reflectionSources,
    ...(binding.atmosphere ? [binding.atmosphere] : []),
    ...((binding.colorRelations?.length ?? 0) ? ['__palette_relations__'] : []),
  ])].sort();
}

/**
 * Selectively invalidates a material/light binding. A newer scene revision alone is not stale:
 * one of the causal sources actually consumed by this binding must have changed.
 */
export function lightingColorBindingStaleness(
  binding: LightingColorBindingLike & { colorRelations?: string[] },
  current: SceneLightingColorModel,
  sourceRevision?: SceneLightingColorModel | null,
): LightingColorBindingStaleness {
  if (binding.sceneModelId !== current.model_id) {
    return { stale: true, reason: 'model_identity_changed', changed_dependency_ids: ['__scene_light_color__'] };
  }
  if (binding.sceneModelRevision === current.revision) {
    return { stale: false, reason: 'current', changed_dependency_ids: [] };
  }
  if (!sourceRevision
      || sourceRevision.model_id !== binding.sceneModelId
      || sourceRevision.revision !== binding.sceneModelRevision) {
    return { stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [] };
  }
  const changed = changedSceneLightingColorDependencyIds(sourceRevision, current);
  const dependencies = new Set(lightingColorBindingDependencyIds(binding));
  const relevant = changed.filter(id => id === '__scene_light_color__' || dependencies.has(id));
  return {
    stale: relevant.length > 0,
    reason: relevant.length ? 'dependency_changed' : 'current',
    changed_dependency_ids: relevant,
  };
}

export function assertLightingColorBindingMatchesScene(
  binding: LightingColorBindingLike,
  model: SceneLightingColorModel
): void {
  if (binding.sceneModelId !== model.model_id || binding.sceneModelRevision !== model.revision) {
    throw new Error('lighting_color_binding must reference the active scene lighting/color model revision');
  }
  const emitters = new Set(model.emitters.map(item => item.id));
  const ambient = model.ambient_environment?.id;
  const validReceivers = new Set([...(ambient ? [ambient] : []), ...emitters]);
  const unknownReceives = binding.receives.filter(id => !validReceivers.has(id));
  if (unknownReceives.length) throw new Error(`lighting_color_binding.receives contains unknown scene source(s): ${unknownReceives.join(', ')}`);
  const unknownReflections = binding.reflectionSources.filter(id => !emitters.has(id));
  if (unknownReflections.length) throw new Error(`lighting_color_binding.reflection_sources contains unknown emitter(s): ${unknownReflections.join(', ')}`);
  if (binding.atmosphere && binding.atmosphere !== model.atmosphere?.id) {
    throw new Error('lighting_color_binding.atmosphere must reference the active scene atmosphere');
  }
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const SHA256 = /^[a-fA-F0-9]{64}$/;
function record(value: unknown, path: string): Record<string, unknown> {
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
function provenance(value: unknown, path: string): ColorProvenance {
  const result = text(value, path) as ColorProvenance;
  if (!COLOR_PROVENANCE.includes(result)) throw new Error(`${path} must be one of ${COLOR_PROVENANCE.join('|')}`);
  return result;
}
function strings(value: unknown, path: string, max = 32): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${path} must be an array with at most ${max} entries`);
  return [...new Set(value.map((item, index) => text(item, `${path}[${index}]`)))];
}
function anchor(value: unknown, path: string): ColorAnchor {
  const raw = record(value, path);
  let sample: ColorAnchor['sample'];
  if (raw.sample !== undefined) {
    const s = record(raw.sample, `${path}.sample`);
    if (!Array.isArray(s.rgb) || s.rgb.length !== 3 || s.rgb.some(v => typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255)) {
      throw new Error(`${path}.sample.rgb must contain three integer RGB channels in 0..255`);
    }
    sample = { rgb: s.rgb as [number, number, number], source: text(s.source, `${path}.sample.source`) };
  }
  const result: ColorAnchor = {
    id: id(raw.id, `${path}.id`),
    role: text(raw.role, `${path}.role`),
    family: text(raw.family, `${path}.family`),
    provenance: provenance(raw.provenance, `${path}.provenance`),
    ...(sample ? { sample } : {}),
  };
  if (result.provenance === 'reference-sample' && !sample) {
    throw new Error(`${path} reference-sample provenance requires exact sample evidence`);
  }
  if (sample && result.provenance !== 'reference-sample' && result.provenance !== 'accepted-frame') {
    throw new Error(`${path}.sample is evidence and cannot be attached to ${result.provenance} provenance`);
  }
  return result;
}

export function normalizeSceneLightingColorModel(value: unknown): SceneLightingColorModel {
  const raw = record(value, 'scene_lighting_color_model');
  const source = record(raw.source_frame, 'scene_lighting_color_model.source_frame');
  const global = record(raw.global_value_structure, 'scene_lighting_color_model.global_value_structure');
  const key = text(global.key, 'scene_lighting_color_model.global_value_structure.key') as SceneLightingColorModel['global_value_structure']['key'];
  if (!['low', 'mid', 'high', 'mixed'].includes(key)) throw new Error('scene_lighting_color_model.global_value_structure.key must be low|mid|high|mixed');
  const emittersRaw = raw.emitters ?? [];
  if (!Array.isArray(emittersRaw) || emittersRaw.length > 16) throw new Error('scene_lighting_color_model.emitters must contain at most 16 entries');
  const emitters = emittersRaw.map((entry, index) => {
    const a = anchor(entry, `scene_lighting_color_model.emitters[${index}]`);
    const e = record(entry, `scene_lighting_color_model.emitters[${index}]`);
    return { ...a, light_role: text(e.light_role, `scene_lighting_color_model.emitters[${index}].light_role`) };
  });
  const sampledRaw = raw.sampled_anchors ?? [];
  if (!Array.isArray(sampledRaw) || sampledRaw.length > 24) throw new Error('scene_lighting_color_model.sampled_anchors must contain at most 24 entries');
  const sampled = sampledRaw.map((entry, index) => anchor(entry, `scene_lighting_color_model.sampled_anchors[${index}]`));
  if (sampled.some(a => a.provenance !== 'reference-sample' && a.provenance !== 'accepted-frame')) {
    throw new Error('scene_lighting_color_model.sampled_anchors must use reference-sample or accepted-frame provenance');
  }
  let ambient: SceneLightingColorModel['ambient_environment'];
  if (raw.ambient_environment !== undefined) {
    const a = anchor(raw.ambient_environment, 'scene_lighting_color_model.ambient_environment');
    const ar = record(raw.ambient_environment, 'scene_lighting_color_model.ambient_environment');
    const chroma = text(ar.chroma, 'scene_lighting_color_model.ambient_environment.chroma') as 'low'|'medium'|'high';
    if (!['low', 'medium', 'high'].includes(chroma)) throw new Error('scene_lighting_color_model.ambient_environment.chroma must be low|medium|high');
    ambient = { ...a, chroma, value_role: text(ar.value_role, 'scene_lighting_color_model.ambient_environment.value_role') };
  }
  let atmosphere: SceneLightingColorModel['atmosphere'];
  if (raw.atmosphere !== undefined) {
    const a = record(raw.atmosphere, 'scene_lighting_color_model.atmosphere');
    atmosphere = {
      id: id(a.id, 'scene_lighting_color_model.atmosphere.id'),
      density_role: text(a.density_role, 'scene_lighting_color_model.atmosphere.density_role'),
      color_bias: text(a.color_bias, 'scene_lighting_color_model.atmosphere.color_bias'),
      contrast_effect: text(a.contrast_effect, 'scene_lighting_color_model.atmosphere.contrast_effect'),
      provenance: provenance(a.provenance, 'scene_lighting_color_model.atmosphere.provenance'),
    };
  }
  const exceptionsRaw = raw.intentional_exceptions ?? [];
  if (!Array.isArray(exceptionsRaw) || exceptionsRaw.length > 16) throw new Error('scene_lighting_color_model.intentional_exceptions must contain at most 16 entries');
  const exceptions = exceptionsRaw.map((entry, index) => {
    const e = record(entry, `scene_lighting_color_model.intentional_exceptions[${index}]`);
    return { id: id(e.id, `scene_lighting_color_model.intentional_exceptions[${index}].id`), relation: text(e.relation, `scene_lighting_color_model.intentional_exceptions[${index}].relation`), rationale: text(e.rationale, `scene_lighting_color_model.intentional_exceptions[${index}].rationale`) };
  });
  const result: SceneLightingColorModel = {
    protocol: SCENE_LIGHTING_COLOR_MODEL_PROTOCOL,
    model_id: id(raw.model_id, 'scene_lighting_color_model.model_id'),
    revision: positiveInteger(raw.revision, 'scene_lighting_color_model.revision'),
    source_frame: {
      document_id: positiveInteger(source.document_id, 'scene_lighting_color_model.source_frame.document_id'),
      document_incarnation: text(source.document_incarnation, 'scene_lighting_color_model.source_frame.document_incarnation'),
      ...(source.operation_id === undefined ? {} : { operation_id: id(source.operation_id, 'scene_lighting_color_model.source_frame.operation_id') }),
      ...(source.preview_sha256 === undefined ? {} : { preview_sha256: text(source.preview_sha256, 'scene_lighting_color_model.source_frame.preview_sha256').toLowerCase() }),
    },
    global_value_structure: {
      key,
      ...(global.local_value_anchor === undefined ? {} : { local_value_anchor: id(global.local_value_anchor, 'scene_lighting_color_model.global_value_structure.local_value_anchor') }),
      ...(global.atmospheric_lift === undefined ? {} : { atmospheric_lift: id(global.atmospheric_lift, 'scene_lighting_color_model.global_value_structure.atmospheric_lift') }),
    },
    ...(ambient ? { ambient_environment: ambient } : {}),
    emitters,
    ...(atmosphere ? { atmosphere } : {}),
    palette_relations: strings(raw.palette_relations ?? [], 'scene_lighting_color_model.palette_relations'),
    sampled_anchors: sampled,
    intentional_exceptions: exceptions,
  };
  if (result.source_frame.preview_sha256 && !SHA256.test(result.source_frame.preview_sha256)) throw new Error('scene_lighting_color_model.source_frame.preview_sha256 must be a SHA-256 hex digest');
  const ids = [ambient?.id, ...emitters.map(e => e.id), atmosphere?.id, ...sampled.map(a => a.id)].filter(Boolean) as string[];
  if (new Set(ids).size !== ids.length) throw new Error('scene_lighting_color_model contains duplicate color/light anchor ids');
  return result;
}
