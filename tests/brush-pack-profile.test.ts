import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  writeBrushPackRecord,
  type BrushPackIngestionRecord,
} from '../src/core/brush-pack.js';
import {
  buildBrushPreflightFromProfiles,
  executeBrushPackProfileAction,
  planBrushPackProfiling,
  recordMediaBrushProfile,
  writeBrushProbeReceipt,
  type BrushPresetState,
} from '../src/core/brush-pack-profile.js';
import { SessionStore } from '../src/core/guard/session-store.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function dir(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'brush-pack-profile-'));
  dirs.push(value);
  return value;
}

const packId = `brush-pack-sha256:${'a'.repeat(64)}`;
const fullSettings = (size = 64) => ({
  size,
  hardness: 70,
  roundness: 100,
  opacity: 100,
  flow: 80,
  spacing: 12,
  smoothing: 10,
  use_pressure_size: true,
  use_pressure_opacity: false,
  airbrush: false,
  smoothing_enabled: true,
});

function seedPack(recordDirectory: string, names: string[]): void {
  const record: BrushPackIngestionRecord = {
    protocol: 'photoshop.brush_pack.manifest.v1',
    brush_pack_id: packId,
    fingerprint_sha256: 'a'.repeat(64),
    source_kind: 'files',
    source_root: recordDirectory,
    created_at: '2026-09-26T00:00:00.000Z',
    assets: [{
      relative_path: 'fixture.abr',
      file_name: 'fixture.abr',
      size_bytes: 1,
      sha256: 'b'.repeat(64),
      absolute_path: path.join(recordDirectory, 'fixture.abr'),
    }],
    ingestion_status: 'imported',
    ingested_at: '2026-09-26T00:00:01.000Z',
    backend: 'uxp',
    inventory_before: { total: 1, presets: ['Existing'] },
    inventory_after: { total: names.length + 1, presets: ['Existing', ...names] },
    attributed_presets: names.map((name, inventory_ordinal) => ({
      name,
      occurrence_index: 0,
      inventory_ordinal: inventory_ordinal + 1,
    })),
  };
  writeBrushPackRecord(recordDirectory, record);
}

function evidence(root: string, name: string) {
  const file = path.join(root, `${name}.jpg`);
  const bytes = Buffer.from(`probe-${name}`);
  writeFileSync(file, bytes);
  return {
    preview_path: file,
    preview_sha256: createHash('sha256').update(bytes).digest('hex'),
    operation_id: `probe:${name}`,
  };
}

function state(name: string, size = 64, bridge = 'bridge-1'): BrushPresetState {
  return {
    preset_name: name,
    occurrence_index: 0,
    effective_settings: fullSettings(size),
    backend: 'uxp',
    runtime_revision: 'runtime-1',
    bridge_revision: bridge,
  };
}

describe('P0-E.2 evidence-based media brush profiling', () => {
  it('plans a bounded deterministic probe set from attributed presets instead of names', () => {
    const root = dir();
    seedPack(root, ['Cloud Master', 'Hard Pencil', 'Mystery 03']);
    const result = planBrushPackProfiling({
      brush_pack_id: packId,
      preset_states: [state('Cloud Master'), state('Hard Pencil'), state('Mystery 03')],
      candidate_limit: 2,
    }, { recordDirectory: root });
    expect(result.complete).toBe(false);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map(row => row.preset_name)).toEqual(['Cloud Master', 'Hard Pencil']);
    expect(result.candidates[0]?.probe_cell).toMatchObject({
      isolated_dab: true,
      scales: ['small', 'medium', 'large'],
      overlap_build_up: true,
      directional_edge_test: true,
      pressure_response_when_available: true,
    });
  });

  it('invalidates cached profile use when effective settings or bridge revision changes', () => {
    const root = dir();
    seedPack(root, ['Brush A']);
    recordMediaBrushProfile({
      brush_pack_id: packId,
      ...state('Brush A'),
      usable_visual_intents: ['hard-edge'],
      material_roles: ['detail'],
      mark_character: ['hard'],
      useful_scale_range: { min_px: 10, max_px: 90 },
      edge_behavior: 'hard',
      buildup_behavior: 'opaque',
      rotation_meaningful: false,
      recommended_pressure_policy: 'native-preset',
      known_caveats: [],
      evidence: evidence(root, 'a'),
    }, { recordDirectory: root });

    expect(planBrushPackProfiling({
      brush_pack_id: packId,
      preset_states: [state('Brush A')],
      required_roles: ['detail-edge'],
    }, { recordDirectory: root }).complete).toBe(true);
    expect(planBrushPackProfiling({
      brush_pack_id: packId,
      preset_states: [state('Brush A', 65)],
      required_roles: ['detail-edge'],
    }, { recordDirectory: root }).complete).toBe(false);
    expect(planBrushPackProfiling({
      brush_pack_id: packId,
      preset_states: [state('Brush A', 64, 'bridge-2')],
      required_roles: ['detail-edge'],
    }, { recordDirectory: root }).complete).toBe(false);
  });

  it('rejects a profile whose materialized probe bytes do not match the recorded SHA', () => {
    const root = dir();
    seedPack(root, ['Brush A']);
    const ev = evidence(root, 'bad');
    writeFileSync(ev.preview_path, Buffer.from('replaced'));
    expect(() => recordMediaBrushProfile({
      brush_pack_id: packId,
      ...state('Brush A'),
      usable_visual_intents: ['texture'],
      material_roles: ['surface'],
      mark_character: ['textural'],
      useful_scale_range: { min_px: 20, max_px: 120 },
      edge_behavior: 'broken',
      buildup_behavior: 'granular',
      rotation_meaningful: true,
      recommended_pressure_policy: 'native-preset',
      known_caveats: [],
      evidence: ev,
    }, { recordDirectory: root })).toThrow(/sha_mismatch/);
  });

  it('records classification from a durable probe receipt without retyping preset/settings/provenance', () => {
    const root = dir();
    seedPack(root, ['Misleading Cloud']);
    const ev = evidence(root, 'receipt');
    writeBrushProbeReceipt({
      protocol: 'photoshop.brush_pack.probe_receipt.v1',
      brush_pack_id: packId,
      probe_operation_id: 'probe:receipt',
      ...state('Misleading Cloud'),
      evidence: ev,
      layout: { isolated_dabs: {} },
      recorded_at: '2026-09-26T00:00:02.000Z',
    }, { recordDirectory: root });
    const result = executeBrushPackProfileAction({
      action: 'record_media',
      profile: {
        probe_operation_id: 'probe:receipt',
        usable_visual_intents: ['hard-edge'],
        material_roles: ['detail'],
        mark_character: ['hard'],
        useful_scale_range: { min_px: 8, max_px: 75 },
        edge_behavior: 'hard',
        buildup_behavior: 'opaque',
        rotation_meaningful: false,
        recommended_pressure_policy: 'native-preset',
        known_caveats: ['Poor for atmosphere'],
      },
    }, { recordDirectory: root }) as any;
    expect(result.profile.preset_name).toBe('Misleading Cloud');
    expect(result.profile.effective_settings).toEqual(fullSettings());
    expect(result.profile.evidence.preview_sha256).toBe(ev.preview_sha256);
  });

  it('builds durable brush_preflight roles from visual evidence and does not infer role from a misleading name', () => {
    const root = dir();
    const names = ['Cloud Supreme', 'Knife Soft', 'Detail Wash', 'Texture Smooth'];
    seedPack(root, names);
    const profiles = [
      ['Cloud Supreme', ['hard-edge'], ['detail'], ['hard'], 'hard', 'opaque'],
      ['Knife Soft', ['atmospheric-mass', 'soft-transition'], ['air', 'fog'], ['soft'], 'soft', 'glazing'],
      ['Detail Wash', ['mass', 'painted-mass'], ['form'], ['smooth'], 'variable', 'layered'],
      ['Texture Smooth', ['broken-mass', 'texture'], ['surface'], ['broken', 'textural'], 'broken', 'granular'],
    ] as const;
    for (const [name, intents, materials, marks, edge, buildup] of profiles) {
      recordMediaBrushProfile({
        brush_pack_id: packId,
        ...state(name),
        usable_visual_intents: [...intents],
        material_roles: [...materials],
        mark_character: [...marks],
        useful_scale_range: { min_px: 12, max_px: 160 },
        edge_behavior: edge,
        buildup_behavior: buildup,
        rotation_meaningful: marks.includes('broken' as any),
        recommended_pressure_policy: 'native-preset',
        known_caveats: [],
        evidence: evidence(root, name.replace(/\s+/g, '-')),
      }, { recordDirectory: root });
    }
    const states = names.map(name => state(name));
    const built = buildBrushPreflightFromProfiles({
      brush_pack_id: packId,
      inventory_total: 99,
      preset_states: states,
    }, { recordDirectory: root }) as any;
    expect(built.complete).toBe(true);
    expect(built.brush_preflight.roles.find((role: any) => role.role_id === 'detail-edge').preferred_preset).toBe('Cloud Supreme');
    expect(built.brush_preflight.roles.find((role: any) => role.role_id === 'atmosphere-soft').preferred_preset).toBe('Knife Soft');
    expect(built.brush_preflight.brush_pack_id).toBe(packId);
    expect(built.brush_preflight.roles.every((role: any) => role.profile_id.startsWith('media-profile-sha256:'))).toBe(true);

    const workspace = dir();
    const store = new SessionStore(path.join(workspace, 'controller'), {
      visualBarrierDirectory: path.join(workspace, 'barriers'),
      workspaceRoot: workspace,
    });
    const persisted = store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-profile-process/run-01',
      brush_preflight: built.brush_preflight,
    });
    expect(persisted.brush_preflight.brush_pack_id).toBe(packId);
    expect(persisted.brush_preflight.roles[0].profile_id).toMatch(/^media-profile-sha256:/);
  });

  it('reports missing role coverage instead of inventing unsupported brush roles', () => {
    const root = dir();
    seedPack(root, ['Only Texture']);
    recordMediaBrushProfile({
      brush_pack_id: packId,
      ...state('Only Texture'),
      usable_visual_intents: ['texture'],
      material_roles: ['surface'],
      mark_character: ['textural'],
      useful_scale_range: { min_px: 20, max_px: 100 },
      edge_behavior: 'broken',
      buildup_behavior: 'granular',
      rotation_meaningful: true,
      recommended_pressure_policy: 'native-preset',
      known_caveats: [],
      evidence: evidence(root, 'only-texture'),
    }, { recordDirectory: root });
    const built = buildBrushPreflightFromProfiles({
      brush_pack_id: packId,
      inventory_total: 2,
      preset_states: [state('Only Texture')],
    }, { recordDirectory: root }) as any;
    expect(built.complete).toBe(false);
    expect(built.missing_role_coverage).toEqual(expect.arrayContaining(['broad-form', 'atmosphere-soft', 'detail-edge']));
  });
});
