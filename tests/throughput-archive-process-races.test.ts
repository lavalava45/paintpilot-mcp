import { afterEach, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchmarkArchiveEvidence } from '../scripts/dev/benchmark-throughput-archive.mjs';
import { appendThroughputArchiveEvent, readThroughputArchivePage, throughputArchivePath } from '../src/core/guard/throughput-event-archive.js';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const roots: string[] = [];
const children = new Set<ChildProcess>();

afterEach(() => {
  for (const child of children) if (child.exitCode === null) child.kill();
  children.clear();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-archive-process-race-'));
  roots.push(root);
  return root;
}

const childWriter = `
  import fs from 'node:fs';
  import path from 'node:path';
  import { appendThroughputArchiveEvent } from './src/core/guard/throughput-event-archive.ts';
  const { ROOT, DOCUMENT_ID, SEQUENCE, READY, GATE, OPERATION_ID } = process.env;
  fs.writeFileSync(READY, 'ready');
  while (!fs.existsSync(GATE)) await new Promise(resolve => setTimeout(resolve, 10));
  appendThroughputArchiveEvent(ROOT, Number(DOCUMENT_ID), Number(SEQUENCE), 'run-a-create', {
    at: '2026-10-10T00:00:10.000Z', operation_id: OPERATION_ID,
    kind: 'rejected', model_visible: true, semantic_actions: 0,
  });
`;

function spawnWriter(root: string, gate: string, ready: string, documentId: number, sequence: number, operationId: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childWriter], {
    cwd: repositoryRoot,
    env: { ...process.env, ROOT: root, GATE: gate, READY: ready,
      DOCUMENT_ID: String(documentId), SEQUENCE: String(sequence), OPERATION_ID: operationId },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  const completed = new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('exit', code => { children.delete(child); resolve({ code, stderr }); });
  });
  return completed;
}

async function awaitReady(paths: string[]) {
  const deadline = Date.now() + 12_000;
  while (paths.some(file => !fs.existsSync(file))) {
    if (Date.now() >= deadline) throw new Error('Child writers did not reach the barrier');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

function selectedState(sequence: number) {
  return {
    document_id: 42,
    document_instance: { bootstrap_operation_id: 'run-a-create' },
    artistic_throughput: { archive_sequence: sequence, archive_legacy_history_unverified: false },
  };
}

it('rejects duplicate sequence numbers written by two real OS processes, not exact run counts', async () => {
  const root = fixture();
  const gate = path.join(root, 'go');
  const ready = [path.join(root, 'ready-a'), path.join(root, 'ready-b')];
  const a = spawnWriter(root, gate, ready[0], 42, 1, 'run-a-one');
  const b = spawnWriter(root, gate, ready[1], 42, 1, 'run-a-two');
  await awaitReady(ready);
  fs.writeFileSync(gate, 'go');
  const outcomes = await Promise.all([a, b]);
  for (const outcome of outcomes) expect(outcome).toMatchObject({ code: 0, stderr: '' });

  const page = readThroughputArchivePage(root, 42);
  expect(page.integrity).toBe('unverified');
  const benchmark = benchmarkArchiveEvidence(root, selectedState(2));
  expect(benchmark).toMatchObject({ integrity: 'unverified', events: [] });
  // Concurrent append interleaving is OS-dependent. Whether the bytes form
  // two complete duplicate rows or a damaged row, neither is exact evidence.
}, 20_000);

it('identifies checksum-valid duplicate sequences specifically, not as malformed entries', () => {
  const root = fixture();
  for (const operationId of ['run-a-one', 'run-a-two']) {
    appendThroughputArchiveEvent(root, 42, 1, 'run-a-create', {
      at: '2026-10-10T00:00:10.000Z', operation_id: operationId,
      kind: 'rejected', model_visible: true, semantic_actions: 0,
    });
  }
  expect(readThroughputArchivePage(root, 42).reasons).toContain('sequence_gap_or_duplicate');
  const result = benchmarkArchiveEvidence(root, selectedState(2));
  expect(result).toMatchObject({ integrity: 'unverified', events: [] });
  expect(result?.warning).toContain('sequence gap or duplicate');
});

it('keeps simultaneous independent-document writers isolated with exact sequences', async () => {
  const root = fixture();
  const gate = path.join(root, 'go');
  const ready = [path.join(root, 'ready-42'), path.join(root, 'ready-43')];
  const a = spawnWriter(root, gate, ready[0], 42, 1, 'run-a-one');
  const b = spawnWriter(root, gate, ready[1], 43, 1, 'run-b-one');
  await awaitReady(ready);
  fs.writeFileSync(gate, 'go');
  const outcomes = await Promise.all([a, b]);
  for (const outcome of outcomes) expect(outcome).toMatchObject({ code: 0, stderr: '' });
  expect(readThroughputArchivePage(root, 42)).toMatchObject({ integrity: 'consistent', last_sequence: 1 });
  expect(readThroughputArchivePage(root, 43)).toMatchObject({ integrity: 'consistent', last_sequence: 1 });
  expect(benchmarkArchiveEvidence(root, selectedState(1))).toMatchObject({
    integrity: 'consistent', events: [{ operation_id: 'run-a-one' }],
  });
}, 20_000);

it('fails closed after a real child exits mid-append and a later valid event is appended', () => {
  const root = fixture();
  const file = throughputArchivePath(root, 42);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  appendThroughputArchiveEvent(root, 42, 1, 'run-a-create', {
    at: '2026-10-10T00:00:10.000Z', operation_id: 'run-a-one',
    kind: 'rejected', model_visible: true, semantic_actions: 0,
  });
  const interrupted = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    fs.appendFileSync(process.argv[1], '{"partial":');
    process.exit(23);
  `, file], { cwd: repositoryRoot, encoding: 'utf8', timeout: 10_000 });
  expect(interrupted.status).toBe(23);
  appendThroughputArchiveEvent(root, 42, 2, 'run-a-create', {
    at: '2026-10-10T00:00:20.000Z', operation_id: 'run-a-two',
    kind: 'recovery', model_visible: true, semantic_actions: 0,
  });
  expect(readThroughputArchivePage(root, 42)).toMatchObject({ integrity: 'unverified' });
  expect(benchmarkArchiveEvidence(root, selectedState(2))).toMatchObject({ integrity: 'unverified', events: [] });
});
