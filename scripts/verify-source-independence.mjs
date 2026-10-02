import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { findCrossPathCloneBlocks } from './source-independence-clones.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const BASELINE = process.env.SOURCE_INDEPENDENCE_BASELINE || '7b635963f87b5b8ff5380c3156841f5253ec8063';
const MAX_RUNTIME_EXACT = Number(process.env.SOURCE_INDEPENDENCE_MAX_EXACT || '0.005');
const LARGE_BLOCK_LINES = Number(process.env.SOURCE_INDEPENDENCE_BLOCK_LINES || '12');
const CROSS_PATH_BLOCK_LINES = Number(process.env.SOURCE_INDEPENDENCE_CROSS_PATH_BLOCK_LINES || '8');
const HIGH_FILE_EXACT = Number(process.env.SOURCE_INDEPENDENCE_HIGH_FILE_EXACT || '0.50');

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...options }).trim();
}

function lines(text) {
  return text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim().length > 0);
}

function trackedCurrentFiles() {
  const tracked = git(['ls-files', '--modified', '--cached', '--others', '--exclude-standard', 'src', 'uxp-plugin'])
    .split(/\r?\n/).filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', 'src', 'uxp-plugin'])
    .split(/\r?\n/).filter(Boolean);
  return [...new Set([...tracked, ...untracked])]
    .filter((path) => /\.(?:ts|js)$/.test(path))
    .filter((path) => !/\.(?:test|spec)\.[^.]+$/.test(path))
    .filter((path) => {
      try { readFileSync(resolve(ROOT, path)); return true; } catch { return false; }
    });
}

function baselineFiles() {
  return git(['ls-tree', '-r', '--name-only', BASELINE, '--', 'src', 'uxp-plugin'])
    .split(/\r?\n/).filter((path) => /\.(?:ts|js)$/.test(path))
    .filter((path) => !/\.(?:test|spec)\.[^.]+$/.test(path));
}

const upstreamPaths = baselineFiles();
const upstreamText = new Map(upstreamPaths.map((path) => [path, git(['show', `${BASELINE}:${path}`])]));
function alignedExactCount(current, upstream) {
  const a = lines(current);
  const b = lines(upstream);
  const dp = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const above = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(dp[j], dp[j - 1]);
      diagonal = above;
    }
  }
  return dp[b.length];
}

function contiguousBlocks(current, upstream, path) {
  const a = lines(current);
  const b = lines(upstream);
  const positions = new Map();
  b.forEach((line, index) => {
    const list = positions.get(line) || [];
    list.push(index);
    positions.set(line, list);
  });
  const blocks = [];
  for (let i = 0; i < a.length; i += 1) {
    for (const j of positions.get(a[i]) || []) {
      let length = 0;
      while (i + length < a.length && j + length < b.length && a[i + length] === b[j + length]) length += 1;
      if (length >= LARGE_BLOCK_LINES && (i === 0 || j === 0 || a[i - 1] !== b[j - 1])) blocks.push({ path, start_line: i + 1, lines: length, upstream_path: path, upstream_start_line: j + 1 });
    }
  }
  return blocks;
}

const currentPaths = trackedCurrentFiles();
const currentText = new Map();
let runtimeLines = 0;
let exactLines = 0;
const files = [];
const largeBlocks = [];
const identicalFiles = [];

for (const path of currentPaths) {
  const text = readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
  currentText.set(path, text);
  const currentLines = lines(text);
  const samePath = upstreamText.get(path);
  const exact = samePath === undefined ? 0 : alignedExactCount(text, samePath);
  runtimeLines += currentLines.length;
  exactLines += exact;
  if (samePath !== undefined && text.trim() === samePath.replace(/\r\n/g, '\n').trim()) identicalFiles.push(path);

  const ratio = currentLines.length ? exact / currentLines.length : 0;
  files.push({ path, lines: currentLines.length, exact_lines: exact, exact_ratio: ratio });

  if (samePath !== undefined) largeBlocks.push(...contiguousBlocks(text, samePath, path));
}

const crossPathBlocks = findCrossPathCloneBlocks(currentText, upstreamText, CROSS_PATH_BLOCK_LINES);

const exactRatio = runtimeLines ? exactLines / runtimeLines : 0;
const highSimilarityFiles = files
  .filter((file) => file.lines >= LARGE_BLOCK_LINES && file.exact_ratio >= HIGH_FILE_EXACT)
  .sort((a, b) => b.exact_ratio - a.exact_ratio || b.lines - a.lines);
const packedFiles = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).files || [];
const retiredPacked = packedFiles.filter((entry) => ['web', 'src/ui', 'src/analytics'].some((retired) => entry === retired || entry.startsWith(`${retired}/`)));
const packageScripts = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).scripts || {};
const upstreamDependency = Object.entries(packageScripts).filter(([, command]) => /\bupstream\b/.test(command));

const report = {
  protocol: 'photoshop.source_independence.v1', baseline: BASELINE,
  runtime: { files: currentPaths.length, lines: runtimeLines, exact_lines: exactLines, exact_ratio: exactRatio },
  thresholds: {
    max_runtime_exact: MAX_RUNTIME_EXACT,
    large_block_lines: LARGE_BLOCK_LINES,
    cross_path_block_lines: CROSS_PATH_BLOCK_LINES,
    high_file_exact: HIGH_FILE_EXACT,
  },
  identical_files: identicalFiles,
  large_blocks: largeBlocks,
  cross_path_blocks: crossPathBlocks,
  high_similarity_files: highSimilarityFiles,
  retired_pack_entries: retiredPacked, upstream_script_dependencies: upstreamDependency,
  top_files: files.sort((a, b) => b.exact_lines - a.exact_lines).slice(0, 15),
};
console.log(JSON.stringify(report, null, 2));

const failures = [];
if (exactRatio >= MAX_RUNTIME_EXACT) failures.push(`runtime exact-line overlap ${(exactRatio * 100).toFixed(2)}% is not below ${(MAX_RUNTIME_EXACT * 100).toFixed(2)}%`);
if (identicalFiles.length) failures.push(`${identicalFiles.length} byte-identical production file(s)`);
if (largeBlocks.length) failures.push(`${largeBlocks.length} contiguous upstream-identical block(s) >= ${LARGE_BLOCK_LINES} lines`);
if (crossPathBlocks.length) failures.push(`${crossPathBlocks.length} cross-path upstream-identical block(s) >= ${CROSS_PATH_BLOCK_LINES} normalized lines`);
if (highSimilarityFiles.length) failures.push(`${highSimilarityFiles.length} high-similarity production file(s)`);
if (retiredPacked.length) failures.push(`retired package entries: ${retiredPacked.join(', ')}`);
if (upstreamDependency.length) failures.push('package scripts depend on upstream');
if (failures.length) {
  console.error(`source-independence gate failed: ${failures.join('; ')}`);
  process.exitCode = 1;
}
