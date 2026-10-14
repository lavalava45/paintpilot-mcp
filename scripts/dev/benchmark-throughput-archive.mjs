import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';

const PROTOCOL = 'photoshop.guard.throughput_event_archive.v1';
const MAX_ENTRY_BYTES = 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
// Legacy callers can retain a bounded diagnostic projection. A caller that
// supplies onSelectedEvent receives verified entries incrementally without
// retaining the selected stream; it must discard its accumulator if the
// final integrity result is unverified (including late corruption/drift).
const MAX_SELECTED_EVENT_BYTES = 16 * 1024 * 1024;
const MAX_SELECTED_EVENTS = 50_000;

// This is a read-only benchmark verifier, not an alternative Guard event store.
// It must never promote a damaged/legacy archive to complete run evidence.
export function benchmarkArchiveEvidence(runtimeDirectory, state, { onSelectedEvent } = {}) {
  if (!runtimeDirectory || !state) return null;
  const documentId = Number(state.document_id);
  if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
  // Guard writes this archive under its controller runtime directory, NOT
  // beside the exported processes/<family>/<run>/painting-state.json mirror.
  const archivePath = path.join(runtimeDirectory, 'throughput-events', `${documentId}.jsonl`);
  const fail = reason => ({ integrity: 'unverified', events: [], warning: `Throughput archive unverified: ${reason}; exact run counters are unknown.` });
  const throughput = state.artistic_throughput ?? {};
  if (!existsSync(archivePath)) {
    return throughput.archive_sequence !== undefined || throughput.archive_legacy_history_unverified !== undefined
      ? fail('state declares an archive but its file is missing')
      : null; // Genuine pre-archive runs retain the conservative mirror path.
  }
  const incarnation = state.document_instance?.identity_pending ? null
    : state.document_instance?.host_witness?.token ?? state.document_instance?.bootstrap_operation_id ?? null;
  if (!incarnation || typeof incarnation !== 'string') return fail('document incarnation is not proven');
  if (throughput.archive_legacy_history_unverified !== false) return fail('legacy-history coverage is not explicitly verified');
  if (!Number.isSafeInteger(throughput.archive_sequence) || throughput.archive_sequence < 1) return fail('state sequence is missing');
  const events = [];
  let selectedBytes = 0;
  let selectedCount = 0;
  let previous = 0;
  const inspect = line => {
    if (line.length > MAX_ENTRY_BYTES) return 'oversized entry';
    let row;
    try { row = JSON.parse(line.toString('utf8')); } catch { return 'malformed entry'; }
    if (!row || typeof row !== 'object' || Array.isArray(row)) return 'invalid entry';
    const { sha256, ...payload } = row;
    if (payload.protocol !== PROTOCOL || payload.document_id !== documentId
      || !Number.isSafeInteger(payload.sequence) || payload.sequence < 1
      || !payload.event || typeof payload.event !== 'object' || Array.isArray(payload.event)
      || (payload.document_incarnation !== null && typeof payload.document_incarnation !== 'string')) {
      return 'invalid entry';
    }
    if (sha256 !== createHash('sha256').update(JSON.stringify(payload)).digest('hex')) return 'checksum mismatch';
    // Two Guard processes can race on the same document sequence. A valid
    // checksum cannot make duplicate/out-of-order writes exact run evidence.
    if (payload.sequence !== previous + 1) return 'sequence gap or duplicate';
    previous = payload.sequence;
    // A pending-identity event might belong to this run: retain it so
    // unkeyed/undated ambiguity is never silently discarded.
    if (payload.document_incarnation === incarnation || payload.document_incarnation === null) {
      selectedBytes += Buffer.byteLength(JSON.stringify(payload.event), 'utf8');
      selectedCount += 1;
      if (!Number.isSafeInteger(selectedBytes) || !Number.isSafeInteger(selectedCount)) {
        return 'selected event accounting overflow';
      }
      if (onSelectedEvent) {
        onSelectedEvent(payload.event);
      } else if (selectedBytes > MAX_SELECTED_EVENT_BYTES || events.length >= MAX_SELECTED_EVENTS) {
        return 'selected event retention limit exceeded';
      } else {
        events.push(payload.event);
      }
    }
    return null;
  };
  let fd;
  try {
    fd = openSync(archivePath, 'r');
    const before = fstatSync(fd);
    const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let remaining = Buffer.alloc(0);
    let total = 0;
    let bytesRead;
    // Bound the input buffer by one validated line rather than the total
    // archive size. Still inspect every entry, including foreign incarnations.
    while ((bytesRead = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      total += bytesRead;
      const block = remaining.length
        ? Buffer.concat([remaining, chunk.subarray(0, bytesRead)])
        : chunk.subarray(0, bytesRead);
      let start = 0;
      for (let end = block.indexOf(10, start); end !== -1; end = block.indexOf(10, start)) {
        const error = inspect(block.subarray(start, end));
        if (error) return fail(error);
        start = end + 1;
      }
      remaining = Buffer.from(block.subarray(start));
      if (remaining.length > MAX_ENTRY_BYTES) return fail('oversized entry');
    }
    if (total === 0 || remaining.length) return fail('truncated or empty archive');
    const after = fstatSync(fd);
    const named = statSync(archivePath);
    if (total !== before.size || before.size !== after.size || before.size !== named.size
      || before.mtimeMs !== after.mtimeMs || before.mtimeMs !== named.mtimeMs
      || before.ctimeMs !== after.ctimeMs || before.ctimeMs !== named.ctimeMs
      || before.dev !== named.dev || before.ino !== named.ino) {
      return fail('archive changed during read');
    }
  } catch { return fail('archive cannot be read'); }
  finally {
    if (fd !== undefined) {
      try { closeSync(fd); }
      catch { return fail('archive close failed'); }
    }
  }
  if (previous !== throughput.archive_sequence) return fail('archive/state sequence mismatch');
  return { integrity: 'consistent', events, selected_count: selectedCount,
    selected_bytes: selectedBytes, streamed: Boolean(onSelectedEvent), warning: null };
}
