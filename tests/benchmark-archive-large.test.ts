import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { benchmarkArchiveEvidence } from '../scripts/dev/benchmark-throughput-archive.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it('verifies archives beyond 32 MiB without skipping earlier foreign-incarnation evidence or late corruption', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-large-archive-'));
  roots.push(root);
  const dir = path.join(root, 'throughput-events');
  fs.mkdirSync(dir);
  const archive = path.join(dir, '91.jsonl');
  const fd = fs.openSync(archive, 'w');
  const padding = 'x'.repeat(880 * 1024);
  const state = {
    document_id: 91,
    document_instance: { bootstrap_operation_id: 'our-run' },
    artistic_throughput: { archive_sequence: 40, archive_legacy_history_unverified: false },
  };
  try {
    for (let sequence = 1; sequence <= 40; sequence++) {
      const payload = {
        protocol: 'photoshop.guard.throughput_event_archive.v1',
        document_id: 91, sequence,
        document_incarnation: sequence === 40 ? 'our-run' : 'foreign-run',
        event: sequence === 40
          ? { at: '2026-10-10T00:00:00.000Z', operation_id: 'our-run-1', kind: 'dispatched' }
          : { at: '2026-10-10T00:00:00.000Z', operation_id: `foreign-${sequence}`, padding },
      };
      const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      fs.writeSync(fd, `${JSON.stringify({ ...payload, sha256 })}\n`);
    }
  } finally { fs.closeSync(fd); }
  expect(fs.statSync(archive).size).toBeGreaterThan(32 * 1024 * 1024);

  expect(benchmarkArchiveEvidence(root, state)).toMatchObject({
    integrity: 'consistent', events: [{ operation_id: 'our-run-1' }], warning: null,
  });

  // A single-byte alteration in the final entry must invalidate the entire
  // archive, not leave a seemingly complete prefix of run counters.
  const tail = fs.readFileSync(archive);
  const marker = Buffer.from('our-run-1');
  const offset = tail.lastIndexOf(marker);
  expect(offset).toBeGreaterThan(32 * 1024 * 1024);
  tail[offset] = 'X'.charCodeAt(0);
  fs.writeFileSync(archive, tail);
  expect(benchmarkArchiveEvidence(root, state)).toMatchObject({ integrity: 'unverified', events: [] });
  expect(benchmarkArchiveEvidence(root, state)?.warning).toContain('checksum mismatch');

  // A complete checksum cannot compensate for a missing terminal newline.
  tail[offset] = 'o'.charCodeAt(0);
  fs.writeFileSync(archive, tail.subarray(0, -1));
  expect(benchmarkArchiveEvidence(root, state)?.warning).toContain('truncated or empty archive');
}, 30_000);

it('refuses exact counters when selected events exceed a bounded retention budget', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-selected-archive-'));
  roots.push(root);
  const dir = path.join(root, 'throughput-events');
  fs.mkdirSync(dir);
  const archive = path.join(dir, '92.jsonl');
  const fd = fs.openSync(archive, 'w');
  const padding = 'y'.repeat(900 * 1024);
  const state = {
    document_id: 92,
    document_instance: { bootstrap_operation_id: 'our-run' },
    artistic_throughput: { archive_sequence: 20, archive_legacy_history_unverified: false },
  };
  try {
    for (let sequence = 1; sequence <= 20; sequence++) {
      const payload = {
        protocol: 'photoshop.guard.throughput_event_archive.v1',
        document_id: 92, sequence, document_incarnation: 'our-run',
        event: { at: '2026-10-10T00:00:00.000Z', operation_id: `our-run-${sequence}`, padding },
      };
      const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      fs.writeSync(fd, `${JSON.stringify({ ...payload, sha256 })}\n`);
    }
  } finally { fs.closeSync(fd); }
  expect(fs.statSync(archive).size).toBeGreaterThan(16 * 1024 * 1024);
  const evidence = benchmarkArchiveEvidence(root, state);
  expect(evidence).toMatchObject({ integrity: 'unverified', events: [] });
  expect(evidence?.warning).toContain('selected event retention limit exceeded');
}, 30_000);
