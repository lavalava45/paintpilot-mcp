// @ts-nocheck
// Durable file I/O for session state and the operation journal.
// Validation and replay/admission policy stay at their existing boundaries.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RUNTIME_STATE_VERSION } from './protocol-version.js';
import { assertCurrentRuntimeRecord } from './runtime-state.js';

export function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}

export function readDurableOperation(file, id, onRead) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    assertCurrentRuntimeRecord(record, id);
    return onRead(record);
  } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
}

export function writeDurableOperation(file, record) {
  atomicJson(file, { ...record, runtime_state_version: RUNTIME_STATE_VERSION });
}

export function scanDurableOperations(directory, onRead) {
  const dir = path.join(directory, 'operations');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assertCurrentRuntimeRecord(r, f);
    if (!r.id || !r.phase || !r.created_at) throw new Error(`Corrupt operation journal: ${f}`);
    return onRead(r);
  }).sort((a, b) => (a.sequence && b.sequence ? a.sequence - b.sequence : a.created_at.localeCompare(b.created_at)) || a.id.localeCompare(b.id));
}
