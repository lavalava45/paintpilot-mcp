#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const srcRoot = path.join(root, 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(srcRoot)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .map((file) => path.resolve(file));
const fileSet = new Set(files);
const importPattern = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;

function resolveRelativeImport(source, specifier) {
  if (!specifier.startsWith('.')) return null;
  const raw = path.resolve(path.dirname(source), specifier);
  const candidates = specifier.endsWith('.js')
    ? [raw.slice(0, -3) + '.ts']
    : [raw + '.ts', path.join(raw, 'index.ts')];
  return candidates
    .map((candidate) => path.resolve(candidate))
    .find((candidate) => fileSet.has(candidate)) ?? null;
}

const graph = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const deps = [];
  let match;
  while ((match = importPattern.exec(text)) !== null) {
    const resolved = resolveRelativeImport(file, match[1]);
    if (resolved) deps.push(resolved);
  }
  graph.set(file, deps);
}

const entrypoints = [
  path.join(srcRoot, 'index.ts'),
  path.join(srcRoot, 'cos-plugin.ts'),
  path.join(srcRoot, 'ui', 'cli.ts'),
].map((file) => path.resolve(file));

const reachable = new Set();
const stack = [...entrypoints];
while (stack.length) {
  const file = stack.pop();
  if (!file || reachable.has(file) || !fileSet.has(file)) continue;
  reachable.add(file);
  stack.push(...(graph.get(file) ?? []));
}

const unreachable = files
  .filter((file) => !reachable.has(file))
  .map((file) => path.relative(root, file).replaceAll('\\', '/'))
  .sort();

process.stdout.write(JSON.stringify({
  entrypoints: entrypoints.map((file) => path.relative(root, file).replaceAll('\\', '/')),
  production_reachable: reachable.size,
  production_unreachable: unreachable.length,
  unreachable,
}, null, 2) + '\n');
