import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeBrushPackRecord, type BrushPackIngestionRecord } from '../src/core/brush-pack.js';
import {
  executeBrushPackProfileAction,
  listStampMotifProfiles,
  writeBrushProbeReceipt,
} from '../src/core/brush-pack-profile.js';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function root(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'stamp-profile-'));
  dirs.push(value);
  return value;
}

const packId = `brush-pack-sha256:${'c'.repeat(64)}`;
const settings = {
  size: 80, hardness: 100, roundness: 100, opacity: 100, flow: 100, spacing: 25,
  smoothing: 0, use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
  smoothing_enabled: false,
};

function seed(dir: string, preset = 'Definitely A Bird By Filename'): string {
  const file = path.join(dir, 'probe.jpg');
  const bytes = Buffer.from(`stamp-probe:${preset}`);
  writeFileSync(file, bytes);
  const record: BrushPackIngestionRecord = {
    protocol: 'photoshop.brush_pack.manifest.v1', brush_pack_id: packId,
    fingerprint_sha256: 'c'.repeat(64), source_kind: 'files', source_root: dir,
    created_at: '2026-09-26T00:00:00.000Z', assets: [], ingestion_status: 'imported',
    ingested_at: '2026-09-26T00:00:01.000Z', backend: 'uxp',
    inventory_before: { total: 0, presets: [] }, inventory_after: { total: 1, presets: [preset] },
    attributed_presets: [{ name: preset, occurrence_index: 0, inventory_ordinal: 0 }],
  };
  writeBrushPackRecord(dir, record);
  writeBrushProbeReceipt({
    protocol: 'photoshop.brush_pack.probe_receipt.v1', brush_pack_id: packId,
    probe_operation_id: 'probe-stamp-1', preset_name: preset, occurrence_index: 0,
    effective_settings: settings, backend: 'uxp', runtime_revision: 'runtime-1', bridge_revision: 'bridge-1',
    evidence: {
      preview_path: file,
      preview_sha256: createHash('sha256').update(bytes).digest('hex'),
      operation_id: 'probe-stamp-1',
    },
    layout: { isolated_dabs: { left: 0, top: 0, right: 200, bottom: 200 } },
    recorded_at: '2026-09-26T00:00:02.000Z',
  }, { recordDirectory: dir });
  return preset;
}

describe('P0-E.3 stamp/motif profiles', () => {
  it('stores an evidence-bound classified motif vocabulary separately from media profiles', () => {
    const dir = root();
    const preset = seed(dir);
    const result = executeBrushPackProfileAction({
      action: 'record_stamp',
      profile: {
        probe_operation_id: 'probe-stamp-1',
        classification_status: 'classified',
        motif_category: 'flying-bird-silhouette',
        semantic_description: 'Single side-view flying bird with swept wings',
        canonical_footprint_bounds: { left: 42, top: 55, right: 168, bottom: 146 },
        canonical_orientation_degrees: 0,
        useful_scale_range: { min_px: 24, max_px: 180 },
        mirror_x: 'allowed', mirror_y: 'restricted', rotation_policy: 'restricted',
        intended_use: ['support', 'background'], repetition_class: 'organic_instances',
        raw_placement: 'needs-integration', known_caveats: ['Avoid hero-scale repetition'],
      },
    }, { recordDirectory: dir }) as any;
    expect(result.profile.protocol).toBe('photoshop.brush_pack.stamp_profile.v1');
    expect(result.profile.profile_id).toMatch(/^stamp-profile-sha256:/);
    expect(result.profile.preset_name).toBe(preset);
    expect(result.profile.evidence.operation_id).toBe('probe-stamp-1');
    expect(listStampMotifProfiles(packId, { recordDirectory: dir })).toHaveLength(1);
  });

  it('keeps an ambiguous visual probe explicitly unclassified even when the preset filename suggests a bird', () => {
    const dir = root();
    seed(dir, 'Definitely A Bird By Filename');
    const result = executeBrushPackProfileAction({
      action: 'record_stamp',
      profile: {
        probe_operation_id: 'probe-stamp-1',
        classification_status: 'unclassified',
        canonical_footprint_bounds: { left: 40, top: 40, right: 170, bottom: 170 },
        canonical_orientation_degrees: 0,
        useful_scale_range: { min_px: 30, max_px: 160 },
        mirror_x: 'unknown', mirror_y: 'unknown', rotation_policy: 'unknown',
        intended_use: ['texture'], repetition_class: 'unclassified', raw_placement: 'unknown',
        known_caveats: ['Visual identity ambiguous at probe resolution'],
      },
    }, { recordDirectory: dir }) as any;
    expect(result.profile.classification_status).toBe('unclassified');
    expect(result.profile.motif_category).toBeUndefined();
    expect(result.profile.semantic_description).toBeUndefined();
  });

  it('rejects semantic labels on an explicitly unclassified probe', () => {
    const dir = root();
    seed(dir);
    expect(() => executeBrushPackProfileAction({
      action: 'record_stamp',
      profile: {
        probe_operation_id: 'probe-stamp-1', classification_status: 'unclassified',
        motif_category: 'bird', semantic_description: 'guessed from name',
        canonical_footprint_bounds: { left: 1, top: 1, right: 10, bottom: 10 },
        canonical_orientation_degrees: 0, useful_scale_range: { min_px: 10, max_px: 20 },
        mirror_x: 'unknown', mirror_y: 'unknown', rotation_policy: 'unknown',
        intended_use: ['detail'], repetition_class: 'unclassified', raw_placement: 'unknown', known_caveats: [],
      },
    }, { recordDirectory: dir })).toThrow(/must_not_assign_semantics/);
  });

  it('requires a durable probe receipt so filename-only stamp classification cannot be recorded', () => {
    const dir = root();
    seed(dir);
    expect(() => executeBrushPackProfileAction({
      action: 'record_stamp',
      profile: {
        classification_status: 'classified', motif_category: 'bird', semantic_description: 'filename says bird',
      },
    }, { recordDirectory: dir })).toThrow(/requires probe_operation_id/);
  });
});
