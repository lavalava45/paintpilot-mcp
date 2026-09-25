import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter } from '../src/platform/photoshop-backend.js';
import {
  attributeNewBrushPresets,
  buildBrushPackManifest,
  readBrushPackRecord,
} from '../src/core/brush-pack.js';
import { createBrushPackTools } from '../src/tools/brush-pack-tools.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function dir(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'brush-pack-ingestion-'));
  dirs.push(value);
  return value;
}

function body(result: { content: Array<{ type: string; text?: string }> }): any {
  return JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}');
}

function fakeRouter(inventories: string[][], backend: 'uxp' | 'error' = 'uxp') {
  const listBrushPresets = vi.fn(async () => {
    const presets = inventories.shift();
    if (!presets) throw new Error('test inventory exhausted');
    return { total: presets.length, matched: presets.length, truncated: false, presets };
  });
  const backendFor = vi.fn(async () => {
    if (backend === 'error') throw new Error('photoshop_backend_unavailable: brush.presets.import UXP companion not ready');
    return { kind: 'uxp' as const };
  });
  return {
    router: { listBrushPresets, backendFor } as unknown as PhotoshopBackendRouter,
    listBrushPresets,
    backendFor,
  };
}

describe('P0-E.1 brush-pack ingestion', () => {
  it('recursively enumerates nested ABR assets and keeps fingerprint independent from ingestion time', () => {
    const root = dir();
    mkdirSync(path.join(root, 'nested', 'deep'), { recursive: true });
    writeFileSync(path.join(root, 'z.abr'), Buffer.from('z-brush'));
    writeFileSync(path.join(root, 'nested', 'a.abr'), Buffer.from('a-brush'));
    writeFileSync(path.join(root, 'nested', 'deep', 'ignore.txt'), 'not a brush pack');

    const first = buildBrushPackManifest({ source_path: root, now: '2026-09-25T00:00:00.000Z' });
    const second = buildBrushPackManifest({ source_path: root, now: '2026-09-26T00:00:00.000Z' });

    expect(first.assets.map(asset => asset.relative_path)).toEqual(['nested/a.abr', 'z.abr']);
    expect(first.brush_pack_id).toBe(second.brush_pack_id);
    expect(first.assets.every(asset => /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
    expect(first.created_at).not.toBe(second.created_at);
  });

  it('creates a new pack revision when source bytes change', () => {
    const root = dir();
    const file = path.join(root, 'pack.abr');
    writeFileSync(file, Buffer.from('revision-one'));
    const first = buildBrushPackManifest({ source_path: root });
    writeFileSync(file, Buffer.from('revision-two'));
    const second = buildBrushPackManifest({ source_path: root });
    expect(second.brush_pack_id).not.toBe(first.brush_pack_id);
  });

  it('attributes only newly appearing preset occurrences, including duplicate names', () => {
    expect(attributeNewBrushPresets(
      { total: 2, presets: ['Round', 'Leaf'] },
      { total: 5, presets: ['Round', 'Leaf', 'Leaf', 'Cloud', 'Leaf'] }
    )).toEqual([
      { name: 'Leaf', occurrence_index: 1, inventory_ordinal: 2 },
      { name: 'Cloud', occurrence_index: 0, inventory_ordinal: 3 },
      { name: 'Leaf', occurrence_index: 2, inventory_ordinal: 4 },
    ]);
  });

  it('imports through the UXP route, persists before/after attribution, and reuses unchanged ingestion without redispatch', async () => {
    const root = dir();
    const records = path.join(root, 'records');
    const pack = path.join(root, 'pack');
    mkdirSync(path.join(pack, 'nested'), { recursive: true });
    writeFileSync(path.join(pack, 'one.abr'), Buffer.from('one'));
    writeFileSync(path.join(pack, 'nested', 'two.abr'), Buffer.from('two'));
    const { router, backendFor } = fakeRouter([
      ['Round'],
      ['Round', 'Pack Brush 1', 'Pack Brush 2'],
      ['Round', 'Pack Brush 1', 'Pack Brush 2'],
    ]);
    const importAsset = vi.fn(async (_filePath: string, commandId: string) => ({
      ok: true,
      command_id: commandId,
      data: { imported: true },
    }));
    const tool = createBrushPackTools(
      {} as PhotoshopConnection,
      router,
      { recordDirectory: records, importAsset, now: () => '2026-09-25T12:00:00.000Z' }
    )[0];

    const first = body(await tool.handler({ source_path: pack }));
    expect(first.ok).toBe(true);
    expect(first.details.reused).toBe(false);
    expect(first.details.installed_presets.map((row: any) => row.name)).toEqual(['Pack Brush 1', 'Pack Brush 2']);
    expect(importAsset).toHaveBeenCalledTimes(2);
    expect(importAsset.mock.calls.map(([, commandId]) => commandId)).toEqual([
      expect.stringMatching(/^brush-pack:[a-f0-9]{64}:0:[a-f0-9]{64}$/),
      expect.stringMatching(/^brush-pack:[a-f0-9]{64}:1:[a-f0-9]{64}$/),
    ]);
    expect(backendFor).toHaveBeenCalledWith('brush.presets.import');

    const persisted = readBrushPackRecord(records, first.details.brush_pack_id)!;
    expect(persisted.ingestion_status).toBe('imported');
    expect(persisted.inventory_before?.presets).toEqual(['Round']);
    expect(persisted.inventory_after?.presets).toEqual(['Round', 'Pack Brush 1', 'Pack Brush 2']);

    const second = body(await tool.handler({ source_path: pack }));
    expect(second.ok).toBe(true);
    expect(second.details.reused).toBe(true);
    expect(importAsset).toHaveBeenCalledTimes(2);
  });

  it('fails closed with brush_pack_import_unavailable and records the exact missing host capability', async () => {
    const root = dir();
    const records = path.join(root, 'records');
    const pack = path.join(root, 'pack.abr');
    writeFileSync(pack, Buffer.from('abr'));
    const { router } = fakeRouter([['Round']], 'error');
    const importAsset = vi.fn();
    const tool = createBrushPackTools(
      {} as PhotoshopConnection,
      router,
      { recordDirectory: records, importAsset }
    )[0];

    const result = await tool.handler({ source_path: pack });
    const parsed = body(result);
    expect(result.isError).toBe(true);
    expect(parsed.code).toBe('brush_pack_import_unavailable');
    expect(parsed.message).toMatch(/uxp\.localFileSystem\+photoshop\.app\.open\(ABR\)/);
    expect(importAsset).not.toHaveBeenCalled();

    const manifest = buildBrushPackManifest({ source_path: pack });
    const persisted = readBrushPackRecord(records, manifest.brush_pack_id)!;
    expect(persisted.ingestion_status).toBe('import-unavailable');
    expect(persisted.missing_capability).toBe('uxp.localFileSystem+photoshop.app.open(ABR)');
  });

  it('does not silently accept an imported manifest after attributed inventory drifts', async () => {
    const root = dir();
    const records = path.join(root, 'records');
    const pack = path.join(root, 'pack.abr');
    writeFileSync(pack, Buffer.from('abr'));
    const { router } = fakeRouter([
      ['Round'],
      ['Round', 'Pack Brush'],
      ['Round'],
    ]);
    const importAsset = vi.fn(async (_filePath: string, commandId: string) => ({ ok: true, command_id: commandId }));
    const tool = createBrushPackTools({} as PhotoshopConnection, router, { recordDirectory: records, importAsset });
    await tool[0].handler({ source_path: pack });
    const drift = await tool[0].handler({ source_path: pack });
    expect(drift.isError).toBe(true);
    expect(body(drift).message).toMatch(/brush_pack_inventory_drift/);
    expect(importAsset).toHaveBeenCalledTimes(1);
  });
});
