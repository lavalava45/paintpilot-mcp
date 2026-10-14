import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendThroughputArchiveEvent } from '../src/core/guard/throughput-event-archive.js';
import { benchmarkArchiveEvidence } from '../scripts/dev/benchmark-throughput-archive.mjs';

const closeFailure = vi.hoisted(() => ({ next: false }));
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    closeSync(fd: number) {
      original.closeSync(fd);
      if (closeFailure.next) {
        closeFailure.next = false;
        throw Object.assign(new Error('simulated archive close failure'), { code: 'EIO' });
      }
    },
  };
});

const directories: string[] = [];
afterEach(() => {
  closeFailure.next = false;
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('does not certify an archive if closing the verified stream fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-archive-close-failure-'));
  directories.push(root);
  appendThroughputArchiveEvent(root, 42, 1, 'run-a-create', {
    at: '2026-10-10T00:00:10.000Z', operation_id: 'run-a-one',
    kind: 'rejected', model_visible: true, semantic_actions: 0,
  });
  const state = {
    document_id: 42,
    document_instance: { bootstrap_operation_id: 'run-a-create' },
    artistic_throughput: { archive_sequence: 1, archive_legacy_history_unverified: false },
  };
  expect(benchmarkArchiveEvidence(root, state)).toMatchObject({
    integrity: 'consistent', selected_count: 1,
  });
  closeFailure.next = true;
  expect(benchmarkArchiveEvidence(root, state)).toMatchObject({
    integrity: 'unverified', events: [],
    warning: expect.stringContaining('archive close failed'),
  });
});
