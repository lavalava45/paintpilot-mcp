import type { ColorProvenance, SceneLightingColorModel } from './scene-lighting-color-model.js';

export const COLOR_GRADIENT_PREFLIGHT_PROTOCOL = 'photoshop.guard.color_gradient_preflight.v1' as const;
export type ColorPreflightOutcome = 'supported' | 'review-required' | 'conflict';

export interface ColorGradientStop {
  id: string;
  role: string;
  family: string;
  provenance: ColorProvenance;
  rgb?: [number, number, number];
  source_anchor_id?: string;
  artistic_choice?: string;
}

export interface ColorGradientPreflight {
  protocol: typeof COLOR_GRADIENT_PREFLIGHT_PROTOCOL;
  scene_model_id: string;
  scene_model_revision: number;
  field_role: string;
  interaction: string;
  stops: ColorGradientStop[];
  required_relations: string[];
  artistic_choices: string[];
  outcome: ColorPreflightOutcome;
  findings: string[];
}

const PROVENANCE = new Set<ColorProvenance>([
  'user-or-prompt', 'reference-sample', 'accepted-frame', 'deterministic-derivation', 'artist-selected',
]);
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}
function list(value: unknown, path: string, max = 24): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${path} must be an array with at most ${max} entries`);
  return [...new Set(value.map((entry, index) => text(entry, `${path}[${index}]`)))];
}
function rgb(value: unknown, path: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    throw new Error(`${path} must contain three integer RGB channels in 0..255`);
  }
  return value as [number, number, number];
}

export function normalizeColorGradientPreflight(value: unknown, model: SceneLightingColorModel): ColorGradientPreflight {
  const raw = object(value, 'color_gradient_preflight');
  const sceneModelId = text(raw.scene_model_id, 'color_gradient_preflight.scene_model_id');
  const revision = raw.scene_model_revision;
  if (sceneModelId !== model.model_id || !Number.isInteger(revision) || revision !== model.revision) {
    throw new Error('color_gradient_preflight must reference the exact active scene lighting/color model revision');
  }
  if (!Array.isArray(raw.stops) || raw.stops.length === 0 || raw.stops.length > 16) {
    throw new Error('color_gradient_preflight.stops must contain 1..16 semantic stops');
  }
  const anchors = new Map([
    ...(model.ambient_environment ? [[model.ambient_environment.id, model.ambient_environment] as const] : []),
    ...model.emitters.map(anchor => [anchor.id, anchor] as const),
    ...model.sampled_anchors.map(anchor => [anchor.id, anchor] as const),
  ]);
  const findings: string[] = [];
  let conflict = false;
  let review = false;
  const stops = raw.stops.map((entry, index): ColorGradientStop => {
    const stop = object(entry, `color_gradient_preflight.stops[${index}]`);
    const provenance = text(stop.provenance, `color_gradient_preflight.stops[${index}].provenance`) as ColorProvenance;
    if (!PROVENANCE.has(provenance)) throw new Error(`color_gradient_preflight.stops[${index}].provenance is invalid`);
    const sourceAnchorId = stop.source_anchor_id === undefined ? undefined : text(stop.source_anchor_id, `color_gradient_preflight.stops[${index}].source_anchor_id`);
    const exactRgb = stop.rgb === undefined ? undefined : rgb(stop.rgb, `color_gradient_preflight.stops[${index}].rgb`);
    const artisticChoice = stop.artistic_choice === undefined ? undefined : text(stop.artistic_choice, `color_gradient_preflight.stops[${index}].artistic_choice`);
    if (provenance === 'artist-selected' && !artisticChoice) throw new Error('artist-selected color stops must state the deliberately artistic choice');
    if ((provenance === 'reference-sample' || provenance === 'accepted-frame') && !sourceAnchorId) {
      throw new Error(`${provenance} color stops must reference a durable source_anchor_id`);
    }
    if (sourceAnchorId) {
      const anchor = anchors.get(sourceAnchorId);
      if (!anchor) throw new Error(`color_gradient_preflight references unknown source anchor ${sourceAnchorId}`);
      if (anchor.sample && exactRgb && anchor.sample.rgb.some((channel, channelIndex) => channel !== exactRgb[channelIndex])) {
        conflict = true;
        findings.push(`stop ${text(stop.id, `color_gradient_preflight.stops[${index}].id`)} contradicts sampled anchor ${sourceAnchorId}`);
      }
      if (!anchor.sample && exactRgb && provenance !== 'artist-selected') {
        review = true;
        findings.push(`stop ${text(stop.id, `color_gradient_preflight.stops[${index}].id`)} supplies exact RGB without sampled evidence`);
      }
    }
    return {
      id: text(stop.id, `color_gradient_preflight.stops[${index}].id`),
      role: text(stop.role, `color_gradient_preflight.stops[${index}].role`),
      family: text(stop.family, `color_gradient_preflight.stops[${index}].family`),
      provenance,
      ...(exactRgb ? { rgb: exactRgb } : {}),
      ...(sourceAnchorId ? { source_anchor_id: sourceAnchorId } : {}),
      ...(artisticChoice ? { artistic_choice: artisticChoice } : {}),
    };
  });
  const requiredRelations = list(raw.required_relations ?? [], 'color_gradient_preflight.required_relations');
  const knownRelations = new Set(model.palette_relations);
  for (const relation of requiredRelations) {
    if (!knownRelations.has(relation)) {
      review = true;
      findings.push(`relation ${relation} is not established by the active scene model`);
    }
  }
  return {
    protocol: COLOR_GRADIENT_PREFLIGHT_PROTOCOL,
    scene_model_id: sceneModelId,
    scene_model_revision: revision as number,
    field_role: text(raw.field_role, 'color_gradient_preflight.field_role'),
    interaction: text(raw.interaction, 'color_gradient_preflight.interaction'),
    stops,
    required_relations: requiredRelations,
    artistic_choices: list(raw.artistic_choices ?? [], 'color_gradient_preflight.artistic_choices'),
    outcome: conflict ? 'conflict' : review ? 'review-required' : 'supported',
    findings,
  };
}
