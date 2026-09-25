import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  readBrushPackRecord,
  resolveBrushPackRecordDirectory,
  type BrushPackIngestionRecord,
} from './brush-pack.js';
import { effectiveSettingsFingerprint } from './brush-method-evidence.js';
import { PAINTING_VISUAL_INTENTS, type PaintingVisualIntent } from './painting-method-palette.js';

export const BRUSH_PACK_MEDIA_PROFILE_PROTOCOL = 'photoshop.brush_pack.media_profile.v1' as const;

export const MEDIA_MARK_CHARACTERS = [
  'soft', 'hard', 'broken', 'bristly', 'directional', 'granular', 'glazing', 'textural', 'smooth',
] as const;
export type MediaMarkCharacter = (typeof MEDIA_MARK_CHARACTERS)[number];

export type BrushPressurePolicy =
  | 'none'
  | 'native-preset'
  | 'simulated-size'
  | 'simulated-opacity'
  | 'simulated-size-opacity';

export interface BrushHostState {
  backend: string;
  runtime_revision: string;
  bridge_revision?: string;
}

export interface BrushPresetState extends BrushHostState {
  preset_name: string;
  occurrence_index: number;
  effective_settings: Record<string, unknown>;
}

export interface BrushProbeEvidence {
  preview_path: string;
  preview_sha256: string;
  operation_id: string;
  region_bounds?: { left: number; top: number; right: number; bottom: number };
}

export interface BrushProbeReceipt extends BrushPresetState {
  protocol: 'photoshop.brush_pack.probe_receipt.v1';
  brush_pack_id: string;
  probe_operation_id: string;
  evidence: BrushProbeEvidence;
  layout: Record<string, unknown>;
  recorded_at: string;
}

export interface MediaBrushProfileInput extends BrushPresetState {
  brush_pack_id: string;
  usable_visual_intents: PaintingVisualIntent[];
  material_roles: string[];
  mark_character: MediaMarkCharacter[];
  useful_scale_range: { min_px: number; max_px: number };
  edge_behavior: 'soft' | 'hard' | 'broken' | 'variable' | 'directional' | 'unknown';
  buildup_behavior: 'glazing' | 'opaque' | 'layered' | 'granular' | 'streaking' | 'unknown';
  rotation_meaningful: boolean;
  recommended_pressure_policy: BrushPressurePolicy;
  known_caveats: string[];
  evidence: BrushProbeEvidence;
}

export interface MediaBrushProfile extends MediaBrushProfileInput {
  protocol: typeof BRUSH_PACK_MEDIA_PROFILE_PROTOCOL;
  profile_id: string;
  effective_settings_fingerprint: string;
  recorded_at: string;
}

export type BrushSceneRole = 'broad-form' | 'atmosphere-soft' | 'broken-texture' | 'detail-edge';

export const DEFAULT_BRUSH_SCENE_ROLES: BrushSceneRole[] = [
  'broad-form', 'atmosphere-soft', 'broken-texture', 'detail-edge',
];

const ROLE_INTENTS: Record<BrushSceneRole, PaintingVisualIntent[]> = {
  'broad-form': ['mass', 'painted-mass', 'planar-mass', 'directional-mass'],
  'atmosphere-soft': ['atmospheric-mass', 'soft-transition', 'lost-edge', 'smooth'],
  'broken-texture': ['broken-mass', 'texture', 'surface-flow'],
  'detail-edge': ['line', 'hard-edge', 'sharpen'],
};

const ROLE_PURPOSE: Record<BrushSceneRole, string> = {
  'broad-form': 'Build large readable forms and major painted masses.',
  'atmosphere-soft': 'Shape atmosphere, soft transitions and lost edges.',
  'broken-texture': 'Break surfaces with irregular texture and material variation.',
  'detail-edge': 'Place controlled detail, line and hard-edge accents.',
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function profileDirectory(recordDirectory: string): string {
  return path.join(recordDirectory, 'profiles');
}

function profileFile(recordDirectory: string, profileId: string): string {
  return path.join(profileDirectory(recordDirectory), `${sha256(profileId)}.json`);
}

function probeReceiptFile(recordDirectory: string, operationId: string): string {
  return path.join(recordDirectory, 'probe-receipts', `${sha256(operationId)}.json`);
}

export function writeBrushProbeReceipt(
  receipt: BrushProbeReceipt,
  options: { recordDirectory?: string } = {}
): void {
  const recordDirectory = resolveBrushPackRecordDirectory(options.recordDirectory);
  const file = probeReceiptFile(recordDirectory, receipt.probe_operation_id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(receipt, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

export function readBrushProbeReceipt(
  operationId: string,
  options: { recordDirectory?: string } = {}
): BrushProbeReceipt | undefined {
  const recordDirectory = resolveBrushPackRecordDirectory(options.recordDirectory);
  const file = probeReceiptFile(recordDirectory, operationId);
  if (!fs.existsSync(file)) return undefined;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BrushProbeReceipt;
  if (parsed.protocol !== 'photoshop.brush_pack.probe_receipt.v1' || parsed.probe_operation_id !== operationId) {
    throw new Error('brush_pack_probe_receipt_corrupt');
  }
  assertEvidence(parsed.evidence);
  return parsed;
}

function occurrenceKey(name: string, occurrenceIndex: number): string {
  return `${name}\u0000${occurrenceIndex}`;
}

function cacheKey(input: BrushPresetState & { brush_pack_id: string }): string {
  return stableJson({
    brush_pack_id: input.brush_pack_id,
    preset_name: input.preset_name.trim(),
    occurrence_index: input.occurrence_index,
    effective_settings_fingerprint: effectiveSettingsFingerprint(input.effective_settings),
    backend: input.backend,
    runtime_revision: input.runtime_revision,
    bridge_revision: input.bridge_revision ?? null,
  });
}

function assertPackPreset(record: BrushPackIngestionRecord, name: string, occurrenceIndex: number): void {
  if (record.ingestion_status !== 'imported') throw new Error('brush_pack_profile_requires_imported_pack');
  const found = (record.attributed_presets ?? []).some(row =>
    row.name === name.trim() && row.occurrence_index === occurrenceIndex
  );
  if (!found) throw new Error(`brush_pack_profile_preset_not_attributed: ${name}#${occurrenceIndex}`);
}

function assertEvidence(evidence: BrushProbeEvidence): void {
  if (!evidence.operation_id?.trim()) throw new Error('brush_pack_profile_evidence requires operation_id');
  if (!/^[a-f0-9]{64}$/i.test(evidence.preview_sha256)) throw new Error('brush_pack_profile_evidence requires preview_sha256');
  if (!evidence.preview_path?.trim() || !fs.existsSync(evidence.preview_path)) {
    throw new Error('brush_pack_profile_evidence preview_path is missing');
  }
  const actual = sha256(fs.readFileSync(evidence.preview_path));
  if (actual !== evidence.preview_sha256.toLowerCase()) {
    throw new Error(`brush_pack_profile_evidence_sha_mismatch: expected=${evidence.preview_sha256} actual=${actual}`);
  }
}

function validateProfileInput(input: MediaBrushProfileInput, record: BrushPackIngestionRecord): void {
  assertPackPreset(record, input.preset_name, input.occurrence_index);
  assertEvidence(input.evidence);
  if (!input.backend?.trim() || !input.runtime_revision?.trim()) throw new Error('brush_pack_profile_host_state_incomplete');
  if (!input.effective_settings || typeof input.effective_settings !== 'object') throw new Error('brush_pack_profile_effective_settings_required');
  if (!input.usable_visual_intents.length || input.usable_visual_intents.some(intent => !PAINTING_VISUAL_INTENTS.includes(intent))) {
    throw new Error('brush_pack_profile_visual_intents_invalid');
  }
  if (!input.material_roles.length || input.material_roles.some(role => !role.trim())) throw new Error('brush_pack_profile_material_roles_invalid');
  if (!input.mark_character.length || input.mark_character.some(mark => !MEDIA_MARK_CHARACTERS.includes(mark))) {
    throw new Error('brush_pack_profile_mark_character_invalid');
  }
  if (!Number.isFinite(input.useful_scale_range?.min_px) || !Number.isFinite(input.useful_scale_range?.max_px)
    || input.useful_scale_range.min_px <= 0 || input.useful_scale_range.max_px < input.useful_scale_range.min_px) {
    throw new Error('brush_pack_profile_scale_range_invalid');
  }
}

export function recordMediaBrushProfile(
  input: MediaBrushProfileInput,
  options: { recordDirectory?: string; now?: string } = {}
): MediaBrushProfile {
  const recordDirectory = resolveBrushPackRecordDirectory(options.recordDirectory);
  const pack = readBrushPackRecord(recordDirectory, input.brush_pack_id);
  if (!pack) throw new Error(`brush_pack_profile_pack_not_found: ${input.brush_pack_id}`);
  validateProfileInput(input, pack);
  const key = cacheKey(input);
  const profileId = `media-profile-sha256:${sha256(key)}`;
  const profile: MediaBrushProfile = {
    ...structuredClone(input),
    preset_name: input.preset_name.trim(),
    material_roles: [...new Set(input.material_roles.map(role => role.trim()))],
    usable_visual_intents: [...new Set(input.usable_visual_intents)],
    mark_character: [...new Set(input.mark_character)],
    known_caveats: [...new Set((input.known_caveats ?? []).map(item => item.trim()).filter(Boolean))],
    protocol: BRUSH_PACK_MEDIA_PROFILE_PROTOCOL,
    profile_id: profileId,
    effective_settings_fingerprint: effectiveSettingsFingerprint(input.effective_settings),
    recorded_at: options.now ?? new Date().toISOString(),
  };
  fs.mkdirSync(profileDirectory(recordDirectory), { recursive: true });
  const file = profileFile(recordDirectory, profileId);
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(profile, null, 2), 'utf8');
  fs.renameSync(temp, file);
  return profile;
}

export function listMediaBrushProfiles(
  brushPackId: string,
  options: { recordDirectory?: string } = {}
): MediaBrushProfile[] {
  const recordDirectory = resolveBrushPackRecordDirectory(options.recordDirectory);
  const dir = profileDirectory(recordDirectory);
  if (!fs.existsSync(dir)) return [];
  const out: MediaBrushProfile[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as MediaBrushProfile;
      if (parsed.protocol === BRUSH_PACK_MEDIA_PROFILE_PROTOCOL && parsed.brush_pack_id === brushPackId) out.push(parsed);
    } catch {
      // A corrupt unrelated cache entry is ignored here; exact requested profile ids are never synthesized.
    }
  }
  return out.sort((a, b) => a.profile_id.localeCompare(b.profile_id));
}

function profileMatchesState(profile: MediaBrushProfile, state: BrushPresetState): boolean {
  return profile.preset_name === state.preset_name.trim()
    && profile.occurrence_index === state.occurrence_index
    && profile.effective_settings_fingerprint === effectiveSettingsFingerprint(state.effective_settings)
    && profile.backend === state.backend
    && profile.runtime_revision === state.runtime_revision
    && (profile.bridge_revision ?? null) === (state.bridge_revision ?? null);
}

function rolesCovered(profiles: MediaBrushProfile[], roles: BrushSceneRole[]): Set<BrushSceneRole> {
  const covered = new Set<BrushSceneRole>();
  for (const role of roles) {
    const intents = new Set(ROLE_INTENTS[role]);
    if (profiles.some(profile => profile.usable_visual_intents.some(intent => intents.has(intent)))) covered.add(role);
  }
  return covered;
}

export function planBrushPackProfiling(input: {
  brush_pack_id: string;
  preset_states: BrushPresetState[];
  required_roles?: BrushSceneRole[];
  candidate_limit?: number;
}, options: { recordDirectory?: string } = {}) {
  const recordDirectory = resolveBrushPackRecordDirectory(options.recordDirectory);
  const pack = readBrushPackRecord(recordDirectory, input.brush_pack_id);
  if (!pack || pack.ingestion_status !== 'imported') throw new Error('brush_pack_profile_requires_imported_pack');
  const requiredRoles = input.required_roles?.length ? [...new Set(input.required_roles)] : DEFAULT_BRUSH_SCENE_ROLES;
  const limit = Math.max(1, Math.min(8, Math.floor(input.candidate_limit ?? 4)));
  const stateByPreset = new Map(input.preset_states.map(state => [occurrenceKey(state.preset_name, state.occurrence_index), state]));
  const allProfiles = listMediaBrushProfiles(input.brush_pack_id, { recordDirectory });
  const currentProfiles = allProfiles.filter(profile => {
    const state = stateByPreset.get(occurrenceKey(profile.preset_name, profile.occurrence_index));
    return !!state && profileMatchesState(profile, state);
  });
  const covered = rolesCovered(currentProfiles, requiredRoles);
  const missingRoles = requiredRoles.filter(role => !covered.has(role));
  if (missingRoles.length === 0) {
    return { complete: true, covered_roles: [...covered], missing_roles: [], candidates: [], cached_profile_ids: currentProfiles.map(p => p.profile_id) };
  }

  const cachedPresetKeys = new Set(currentProfiles.map(p => occurrenceKey(p.preset_name, p.occurrence_index)));
  const candidates = (pack.attributed_presets ?? [])
    .filter(row => stateByPreset.has(occurrenceKey(row.name, row.occurrence_index)))
    .filter(row => !cachedPresetKeys.has(occurrenceKey(row.name, row.occurrence_index)))
    .slice(0, limit)
    .map((row, index) => ({
      candidate_id: `probe-${index + 1}`,
      preset_name: row.name,
      occurrence_index: row.occurrence_index,
      probe_cell: {
        isolated_dab: true,
        strokes: ['short', 'long', 'sparse-or-fast', 'dense-or-slow'],
        scales: ['small', 'medium', 'large'],
        overlap_build_up: true,
        directional_edge_test: true,
        pressure_response_when_available: true,
      },
    }));
  return {
    complete: false,
    covered_roles: [...covered],
    missing_roles: missingRoles,
    candidates,
    bounded_candidate_limit: limit,
    selection_policy: 'deterministic attributed-preset order; stop once required scene-role coverage is evidence-supported',
  };
}

function workingScale(profile: MediaBrushProfile): string {
  return `${Math.round(profile.useful_scale_range.min_px)}-${Math.round(profile.useful_scale_range.max_px)}px`;
}

export function buildBrushPreflightFromProfiles(input: {
  brush_pack_id: string;
  inventory_total: number;
  preset_states: BrushPresetState[];
  required_roles?: BrushSceneRole[];
}, options: { recordDirectory?: string } = {}) {
  const recordDirectory = resolveBrushPackRecordDirectory(options.recordDirectory);
  const requiredRoles = input.required_roles?.length ? [...new Set(input.required_roles)] : DEFAULT_BRUSH_SCENE_ROLES;
  const states = new Map(input.preset_states.map(state => [occurrenceKey(state.preset_name, state.occurrence_index), state]));
  const profiles = listMediaBrushProfiles(input.brush_pack_id, { recordDirectory }).filter(profile => {
    const state = states.get(occurrenceKey(profile.preset_name, profile.occurrence_index));
    return !!state && profileMatchesState(profile, state);
  });
  const roles = [];
  const missingRoles: BrushSceneRole[] = [];
  for (const role of requiredRoles) {
    const acceptedIntents = new Set(ROLE_INTENTS[role]);
    const matches = profiles.filter(profile => profile.usable_visual_intents.some(intent => acceptedIntents.has(intent)));
    if (!matches.length) {
      missingRoles.push(role);
      continue;
    }
    const preferred = matches[0];
    roles.push({
      role_id: role,
      purpose: ROLE_PURPOSE[role],
      material_roles: preferred.material_roles,
      visual_intents: preferred.usable_visual_intents.filter(intent => acceptedIntents.has(intent)),
      preferred_preset: preferred.preset_name,
      alternative_presets: matches.slice(1).map(profile => profile.preset_name),
      effective_settings: preferred.effective_settings,
      working_scale: workingScale(preferred),
      pressure_policy: preferred.recommended_pressure_policy,
      probe_status: 'cached',
      caveat: preferred.known_caveats.join('; ') || undefined,
      profile_id: preferred.profile_id,
    });
  }
  if (missingRoles.length) {
    return {
      complete: false,
      brush_pack_id: input.brush_pack_id,
      missing_role_coverage: missingRoles,
      available_profile_ids: profiles.map(profile => profile.profile_id),
    };
  }
  return {
    complete: true,
    brush_preflight: {
      completed: true,
      inventory_observed: true,
      inventory_total: input.inventory_total,
      inventory_query: `brush_pack_id=${input.brush_pack_id}`,
      brush_pack_id: input.brush_pack_id,
      roles,
    },
  };
}

function presetStatesFromUnknown(value: unknown): BrushPresetState[] {
  if (!Array.isArray(value)) throw new Error('brush_pack_profile preset_states must be an array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`brush_pack_profile preset_states[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    const occurrenceIndex = Number(row.occurrence_index);
    if (typeof row.preset_name !== 'string' || !row.preset_name.trim()) {
      throw new Error(`brush_pack_profile preset_states[${index}] requires preset_name`);
    }
    if (!Number.isSafeInteger(occurrenceIndex) || occurrenceIndex < 0) {
      throw new Error(`brush_pack_profile preset_states[${index}] requires non-negative occurrence_index`);
    }
    if (!row.effective_settings || typeof row.effective_settings !== 'object' || Array.isArray(row.effective_settings)) {
      throw new Error(`brush_pack_profile preset_states[${index}] requires effective_settings`);
    }
    if (typeof row.backend !== 'string' || !row.backend.trim() || typeof row.runtime_revision !== 'string' || !row.runtime_revision.trim()) {
      throw new Error(`brush_pack_profile preset_states[${index}] requires backend and runtime_revision`);
    }
    return {
      preset_name: row.preset_name.trim(),
      occurrence_index: occurrenceIndex,
      effective_settings: structuredClone(row.effective_settings as Record<string, unknown>),
      backend: row.backend.trim(),
      runtime_revision: row.runtime_revision.trim(),
      ...(typeof row.bridge_revision === 'string' && row.bridge_revision.trim()
        ? { bridge_revision: row.bridge_revision.trim() }
        : {}),
    };
  });
}

function sceneRolesFromUnknown(value: unknown): BrushSceneRole[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('brush_pack_profile required_roles must be an array');
  const allowed = new Set<BrushSceneRole>(DEFAULT_BRUSH_SCENE_ROLES);
  const roles = value.map(item => String(item) as BrushSceneRole);
  for (const role of roles) if (!allowed.has(role)) throw new Error(`brush_pack_profile unknown required role: ${role}`);
  return [...new Set(roles)];
}

export function executeBrushPackProfileAction(
  args: Record<string, unknown>,
  options: { recordDirectory?: string; now?: string } = {}
): Record<string, unknown> {
  const action = typeof args.action === 'string' ? args.action : '';
  if (action === 'plan') {
    if (typeof args.brush_pack_id !== 'string' || !args.brush_pack_id.trim()) throw new Error('brush_pack_profile plan requires brush_pack_id');
    return {
      ok: true,
      action,
      ...planBrushPackProfiling({
        brush_pack_id: args.brush_pack_id.trim(),
        preset_states: presetStatesFromUnknown(args.preset_states),
        required_roles: sceneRolesFromUnknown(args.required_roles),
        ...(args.candidate_limit !== undefined ? { candidate_limit: Number(args.candidate_limit) } : {}),
      }, options),
    };
  }
  if (action === 'record_media') {
    const profile = args.profile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('brush_pack_profile record_media requires profile');
    const row = profile as Record<string, unknown>;
    if (typeof row.probe_operation_id === 'string' && row.probe_operation_id.trim()) {
      const receipt = readBrushProbeReceipt(row.probe_operation_id.trim(), options);
      if (!receipt) throw new Error(`brush_pack_probe_receipt_not_found:${row.probe_operation_id}`);
      const classification = { ...row };
      delete classification.probe_operation_id;
      return {
        ok: true,
        action,
        profile: recordMediaBrushProfile({
          ...classification,
          brush_pack_id: receipt.brush_pack_id,
          preset_name: receipt.preset_name,
          occurrence_index: receipt.occurrence_index,
          effective_settings: receipt.effective_settings,
          backend: receipt.backend,
          runtime_revision: receipt.runtime_revision,
          ...(receipt.bridge_revision ? { bridge_revision: receipt.bridge_revision } : {}),
          evidence: receipt.evidence,
        } as unknown as MediaBrushProfileInput, options),
      };
    }
    return {
      ok: true,
      action,
      profile: recordMediaBrushProfile(profile as unknown as MediaBrushProfileInput, options),
    };
  }
  if (action === 'build_preflight') {
    if (typeof args.brush_pack_id !== 'string' || !args.brush_pack_id.trim()) throw new Error('brush_pack_profile build_preflight requires brush_pack_id');
    const inventoryTotal = Number(args.inventory_total);
    if (!Number.isSafeInteger(inventoryTotal) || inventoryTotal < 1) throw new Error('brush_pack_profile build_preflight requires positive inventory_total');
    return {
      ok: true,
      action,
      ...buildBrushPreflightFromProfiles({
        brush_pack_id: args.brush_pack_id.trim(),
        inventory_total: inventoryTotal,
        preset_states: presetStatesFromUnknown(args.preset_states),
        required_roles: sceneRolesFromUnknown(args.required_roles),
      }, options),
    };
  }
  throw new Error('brush_pack_profile action must be plan|record_media|build_preflight');
}
