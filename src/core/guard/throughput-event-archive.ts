import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Append-only evidence is intentionally separate from the bounded painting-state
// projection. An archive entry is not proof of a particular host/chat run: only
// the operation id and the document incarnation can establish that join.
const PROTOCOL = 'photoshop.guard.throughput_event_archive.v1';
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;

export function throughputArchivePath(runtimeDirectory: string, documentId: number): string {
  if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error('invalid throughput document id');
  return path.join(runtimeDirectory, 'throughput-events', `${documentId}.jsonl`);
}

function checksum(payload: object): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function appendThroughputArchiveEvent(
  runtimeDirectory: string,
  documentId: number,
  sequence: number,
  documentIncarnation: string | null,
  event: Record<string, unknown>,
): void {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('invalid throughput sequence');
  const file = throughputArchivePath(runtimeDirectory, documentId);
  const payload = { protocol: PROTOCOL, document_id: documentId, sequence,
    document_incarnation: documentIncarnation, event };
  const bytes = Buffer.from(`${JSON.stringify({ ...payload, sha256: checksum(payload) })}\n`, 'utf8');
  if (bytes.length > MAX_LINE_BYTES) throw new Error('throughput archive entry exceeds line limit');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'a');
  try {
    let written = 0;
    while (written < bytes.length) {
      const count = fs.writeSync(fd, bytes, written, bytes.length - written);
      if (count < 1) throw new Error('throughput archive append made no progress');
      written += count;
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

export function readThroughputArchivePage(
  runtimeDirectory: string,
  documentId: number,
  options: { afterSequence?: number; limit?: number; documentIncarnation?: string | null } = {},
) {
  const file = throughputArchivePath(runtimeDirectory, documentId);
  const afterSequence = options.afterSequence ?? 0;
  const limit = options.limit ?? 128;
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 512) {
    throw new Error('invalid throughput archive page bounds');
  }
  const events: Array<{ sequence: number; document_incarnation: string | null; event: Record<string, unknown> }> = [];
  const reasons: string[] = [];
  if (!fs.existsSync(file)) return { events, has_more: false, last_sequence: 0, integrity: 'unverified', reasons: ['archive_missing'] };
  const fd = fs.openSync(file, 'r');
  let previousSequence = 0;
  let hasMore = false;
  let remaining = Buffer.alloc(0);
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  const inspect = (line: Buffer) => {
    if (line.length > MAX_LINE_BYTES) { reasons.push('entry_too_large'); return; }
    let row: any;
    try { row = JSON.parse(line.toString('utf8')); }
    catch { reasons.push('malformed_entry'); return; }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      reasons.push('invalid_entry'); return;
    }
    const { sha256, ...payload } = row;
    if (payload.protocol !== PROTOCOL || payload.document_id !== documentId
      || !Number.isSafeInteger(payload.sequence) || payload.sequence < 1
      || typeof payload.event !== 'object' || payload.event === null || Array.isArray(payload.event)
      || (payload.document_incarnation !== null && typeof payload.document_incarnation !== 'string')) {
      reasons.push('invalid_entry'); return;
    }
    if (sha256 !== checksum(payload)) { reasons.push('checksum_mismatch'); return; }
    if (payload.sequence !== previousSequence + 1) reasons.push('sequence_gap_or_duplicate');
    previousSequence = payload.sequence;
    if (payload.sequence <= afterSequence || (options.documentIncarnation !== undefined
      && payload.document_incarnation !== options.documentIncarnation)) return;
    if (events.length < limit) events.push({ sequence: payload.sequence,
      document_incarnation: payload.document_incarnation, event: payload.event });
    else hasMore = true;
  };
  try {
    let bytesRead: number;
    while ((bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      const buffer = Buffer.concat([remaining, chunk.subarray(0, bytesRead)]);
      let start = 0;
      for (let end = buffer.indexOf(10, start); end !== -1; end = buffer.indexOf(10, start)) {
        inspect(buffer.subarray(start, end));
        start = end + 1;
      }
      remaining = Buffer.from(buffer.subarray(start));
      if (remaining.length > MAX_LINE_BYTES) { reasons.push('entry_too_large'); break; }
    }
    if (remaining.length) reasons.push('truncated_final_entry');
  } finally { fs.closeSync(fd); }
  return { events, has_more: hasMore, last_sequence: previousSequence,
    integrity: reasons.length ? 'unverified' : 'consistent', reasons: [...new Set(reasons)] };
}
