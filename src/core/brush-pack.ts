import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BRUSH_PACK_MANIFEST_PROTOCOL = 'photoshop.brush_pack.manifest.v1' as const;
export const SUPPORTED_BRUSH_PACK_EXTENSIONS = new Set(['.abr']);

export interface BrushPackAsset {
  relative_path: string;
  file_name: string;
  size_bytes: number;
  sha256: string;
  absolute_path: string;
}

export interface BrushPackManifest {
  protocol: typeof BRUSH_PACK_MANIFEST_PROTOCOL;
  brush_pack_id: string;
  fingerprint_sha256: string;
  source_kind: 'folder' | 'files';
  source_root: string;
  created_at: string;
  assets: BrushPackAsset[];
}

export interface BrushPackIngestionRecord extends BrushPackManifest {
  ingestion_status: 'imported' | 'import-unavailable' | 'failed';
  ingested_at: string;
  backend?: string;
  inventory_before?: BrushPresetInventory;
  inventory_after?: BrushPresetInventory;
  attributed_presets?: BrushPresetOccurrence[];
  missing_capability?: string;
  error?: string;
}

export interface BrushPresetInventory {
  total: number;
  presets: string[];
}

export interface BrushPresetOccurrence {
  name: string;
  occurrence_index: number;
  inventory_ordinal: number;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function slash(value: string): string {
  return value.split(path.sep).join('/');
}

function enumerateFolder(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && SUPPORTED_BRUSH_PACK_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(absolute);
    }
  };
  visit(root);
  return out;
}

function commonRoot(files: string[]): string {
  if (files.length === 1) return path.dirname(files[0]);
  const split = files.map(file => path.resolve(file).split(path.sep));
  const max = Math.min(...split.map(parts => parts.length));
  let i = 0;
  while (i < max && split.every(parts => parts[i].toLowerCase() === split[0][i].toLowerCase())) i += 1;
  const root = split[0].slice(0, Math.max(1, i)).join(path.sep);
  return root || path.parse(files[0]).root;
}

export function buildBrushPackManifest(input: {
  source_path?: string;
  source_files?: string[];
  now?: string;
}): BrushPackManifest {
  const sourcePath = input.source_path?.trim();
  const sourceFiles = (input.source_files ?? []).map(file => file.trim()).filter(Boolean);
  if (!!sourcePath === (sourceFiles.length > 0)) {
    throw new Error('brush_pack_source_invalid: provide exactly one of source_path or source_files');
  }

  let sourceKind: 'folder' | 'files';
  let sourceRoot: string;
  let files: string[];
  if (sourcePath) {
    const resolved = path.resolve(sourcePath);
    if (!fs.existsSync(resolved)) throw new Error(`brush_pack_source_missing: ${resolved}`);
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      sourceKind = 'folder';
      sourceRoot = resolved;
      files = enumerateFolder(resolved);
    } else if (stat.isFile()) {
      if (!SUPPORTED_BRUSH_PACK_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
        throw new Error(`brush_pack_format_unsupported: ${path.extname(resolved) || '<none>'}`);
      }
      sourceKind = 'files';
      sourceRoot = path.dirname(resolved);
      files = [resolved];
    } else {
      throw new Error(`brush_pack_source_unsupported: ${resolved}`);
    }
  } else {
    sourceKind = 'files';
    files = [...new Set(sourceFiles.map(file => path.resolve(file)))].sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`brush_pack_source_missing: ${file}`);
      if (!SUPPORTED_BRUSH_PACK_EXTENSIONS.has(path.extname(file).toLowerCase())) {
        throw new Error(`brush_pack_format_unsupported: ${path.extname(file) || '<none>'}`);
      }
    }
    sourceRoot = commonRoot(files);
  }
  if (files.length === 0) throw new Error('brush_pack_no_supported_assets: no .abr assets were found');

  const assets = files.map((absolutePath) => {
    const bytes = fs.readFileSync(absolutePath);
    return {
      relative_path: slash(path.relative(sourceRoot, absolutePath)),
      file_name: path.basename(absolutePath),
      size_bytes: bytes.byteLength,
      sha256: sha256(bytes),
      absolute_path: absolutePath,
    };
  }).sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  const fingerprintPayload = assets.map(({ relative_path, size_bytes, sha256: digest }) => ({
    relative_path,
    size_bytes,
    sha256: digest,
  }));
  const fingerprint = sha256(stableJson({ protocol: BRUSH_PACK_MANIFEST_PROTOCOL, assets: fingerprintPayload }));
  return {
    protocol: BRUSH_PACK_MANIFEST_PROTOCOL,
    brush_pack_id: `brush-pack-sha256:${fingerprint}`,
    fingerprint_sha256: fingerprint,
    source_kind: sourceKind,
    source_root: sourceRoot,
    created_at: input.now ?? new Date().toISOString(),
    assets,
  };
}

export function brushPackRecordFile(directory: string, brushPackId: string): string {
  const digest = sha256(brushPackId);
  return path.join(directory, `${digest}.json`);
}

export function readBrushPackRecord(directory: string, brushPackId: string): BrushPackIngestionRecord | undefined {
  const file = brushPackRecordFile(directory, brushPackId);
  if (!fs.existsSync(file)) return undefined;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BrushPackIngestionRecord;
  if (parsed.protocol !== BRUSH_PACK_MANIFEST_PROTOCOL || parsed.brush_pack_id !== brushPackId) {
    throw new Error('brush_pack_manifest_corrupt: durable record identity mismatch');
  }
  return parsed;
}

export function writeBrushPackRecord(directory: string, record: BrushPackIngestionRecord): void {
  fs.mkdirSync(directory, { recursive: true });
  const file = brushPackRecordFile(directory, record.brush_pack_id);
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(record, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function occurrences(names: string[]): BrushPresetOccurrence[] {
  const seen = new Map<string, number>();
  return names.map((name, inventory_ordinal) => {
    const occurrenceIndex = seen.get(name) ?? 0;
    seen.set(name, occurrenceIndex + 1);
    return { name, occurrence_index: occurrenceIndex, inventory_ordinal };
  });
}

export function attributeNewBrushPresets(before: BrushPresetInventory, after: BrushPresetInventory): BrushPresetOccurrence[] {
  const beforeCounts = new Map<string, number>();
  for (const name of before.presets) beforeCounts.set(name, (beforeCounts.get(name) ?? 0) + 1);
  const consumed = new Map<string, number>();
  return occurrences(after.presets).filter((row) => {
    const seen = consumed.get(row.name) ?? 0;
    consumed.set(row.name, seen + 1);
    return seen >= (beforeCounts.get(row.name) ?? 0);
  });
}

export function inventoryContainsOccurrences(inventory: BrushPresetInventory, required: BrushPresetOccurrence[]): boolean {
  const counts = new Map<string, number>();
  for (const name of inventory.presets) counts.set(name, (counts.get(name) ?? 0) + 1);
  const requiredCounts = new Map<string, number>();
  for (const row of required) requiredCounts.set(row.name, Math.max(requiredCounts.get(row.name) ?? 0, row.occurrence_index + 1));
  return [...requiredCounts].every(([name, count]) => (counts.get(name) ?? 0) >= count);
}
