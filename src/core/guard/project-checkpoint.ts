import { createHash } from 'node:crypto';
import fs from 'node:fs';

type Row = Record<string, any>;
export const PROJECT_CHECKPOINT_PROTOCOL = 'paintpilot.project-checkpoint.v1';
export const sha256Bytes = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

export function projectFileIdentity(file: string): Row {
  const fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd);
    if (before.size === 0) throw Error('project_checkpoint_empty_file');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes = 0;
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count)); bytes += count;
    }
    const after = fs.statSync(file);
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ino !== before.ino) throw Error('project_checkpoint_file_changed');
    return { sha256: hash.digest('hex'), bytes };
  } finally { fs.closeSync(fd); }
}

export function nativeLayers(result: Row, documentId: number): Row[] {
  if (result.isError) throw Error('project_checkpoint_layers_unavailable');
  const bodies = (result.content ?? []).flatMap((item: Row) => {
    try { return [JSON.parse(item.text)]; } catch { return []; }
  });
  const envelope = bodies.find((body: Row) => Array.isArray((body.details ?? body).layers));
  const body = envelope?.details ?? envelope;
  if (!body || envelope.ok === false
    || (envelope.document_target?.id !== undefined && envelope.document_target.id !== documentId)
    || (body.context?.document?.id !== undefined && body.context.document.id !== documentId)) {
    throw Error('project_checkpoint_layers_unavailable');
  }
  const flattened: Row[] = [];
  const visit = (rows: Row[], parent: number | null): void => {
    for (const layer of rows) {
      if (!Number.isSafeInteger(layer.id) || layer.id <= 0) throw Error('project_checkpoint_layer_identity_invalid');
      flattened.push({ id: layer.id, name: layer.name, kind: layer.kind, parent,
        isBackground: layer.isBackground === true, bounds: layer.bounds ?? null });
      visit(layer.children ?? layer.layers ?? [], layer.id);
    }
  };
  visit(body.layers, null);
  if (new Set(flattened.map(layer => layer.id)).size !== flattened.length) throw Error('project_checkpoint_layer_identity_ambiguous');
  return flattened;
}

/** This is restoration of recorded authority, not registration from layer names.
 * All native ids, topology, pixels, file bytes and origin must agree. */
export function verifyProjectCheckpoint(checkpoint: Row, observation: Row): void {
  if (checkpoint.protocol !== PROJECT_CHECKPOINT_PROTOCOL || !checkpoint.source_incarnation
    || !checkpoint.state || !Array.isArray(checkpoint.records) || !checkpoint.records.length) {
    throw Error('project_checkpoint_invalid');
  }
  if (checkpoint.file.sha256 !== observation.file?.sha256 || checkpoint.file.bytes !== observation.file?.bytes) {
    throw Error('project_checkpoint_file_changed');
  }
  if (checkpoint.preview.sha256 !== observation.preview?.sha256
    || checkpoint.preview.canvas_width !== observation.preview?.canvas_width
    || checkpoint.preview.canvas_height !== observation.preview?.canvas_height) throw Error('project_checkpoint_frame_mismatch');
  if (JSON.stringify(checkpoint.layers) !== JSON.stringify(observation.layers)) throw Error('project_checkpoint_layer_mismatch');
  if (!observation.witness?.session_id || !observation.witness?.token) throw Error('project_checkpoint_witness_missing');
  const ids = new Set(checkpoint.layers.map((layer: Row) => layer.id));
  const owners = checkpoint.owners ?? [];
  const claimed = new Set<number>();
  for (const owner of owners) for (const id of owner.physical_layer_ids ?? [owner.layer_id]) {
    if (!ids.has(id) || claimed.has(id)) throw Error('project_checkpoint_owner_mismatch');
    claimed.add(id);
  }
}

/** Pure view of the saved project timeline in the proven new document. Original
 * journal records and native receipts are never rewritten. Old Undo history is
 * deliberately absent: only subsequent native operations can own undo steps. */
export function restoredProjectRecords(checkpoint: Row, documentId: number, incarnation: string, restoreId: string): Row[] {
  const last = Math.max(0, ...checkpoint.records.map((record: Row) => Number(record.sequence ?? 0)));
  const rebase = (value: any, key?: string): any => {
    if (Array.isArray(value)) return value.map(item => rebase(item));
    if (!value || typeof value !== 'object') {
      if (key === 'document_id' && value === checkpoint.document_id) return documentId;
      if (['document_incarnation', 'document_incarnation_id'].includes(key ?? '') && value === checkpoint.source_incarnation) return incarnation;
      return value;
    }
    const copy = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, rebase(child, name)]));
    if ((key === 'document_target' || key === 'document') && copy.id === checkpoint.document_id) copy.id = documentId;
    return copy;
  };
  return checkpoint.records.map((original: Row) => {
    const record = rebase(original);
    if (record.result?.content) record.result.content = record.result.content.map((item: Row) => {
      if (item.type !== 'text') return item;
      try { return { ...item, text: JSON.stringify(rebase(JSON.parse(item.text))) }; } catch { return item; }
    });
    return { ...record, sequence: Number(original.sequence ?? 0) - last - 1,
      checkpoint_origin: { save_operation_id: checkpoint.save_operation_id, restore_operation_id: restoreId,
        source_document_id: checkpoint.document_id, source_incarnation: checkpoint.source_incarnation,
        source_operation_id: original.id }, native_history_available: false };
  });
}
