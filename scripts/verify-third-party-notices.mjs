/** Narrow dependency-attribution gate; no install, build, network or application calls. */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(root, 'third-party-components.json'), 'utf8'));
const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
const importer = lock.split('    dependencies:')[1]?.split('    devDependencies:')[0] ?? '';
const lockedVersions = new Map();
for (const match of importer.matchAll(
  /^      '?([^':\n]+)'?:\s*\n        specifier: [^\n]+\n        version: ([^\s(]+)/gm
))
  lockedVersions.set(match[1], match[2]);
const published = (path, manifest) =>
  (manifest.files ?? []).some((entry) => path === entry || path.startsWith(entry + '/'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function validate(records, manifest) {
  const errors = [];
  const names = records.components.map((c) => c.package).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.dependencies ?? {}).sort()))
    errors.push('Registry must cover each direct production dependency exactly once');
  for (const path of ['THIRD_PARTY_NOTICES.md', 'third-party-components.json'])
    if (!published(path, manifest) || !existsSync(join(root, path)))
      errors.push(`Missing distributed notice: ${path}`);
  for (const component of records.components) {
    const base = join(root, 'node_modules', component.package);
    const installed = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
    if (
      installed.version !== component.version ||
      lockedVersions.get(component.package) !== component.version
    )
      errors.push(
        `Version drift: ${component.package}; update attribution after dependency upgrades`
      );
    if (
      installed.license !== component.declared_license ||
      !component.authors ||
      !component.repository ||
      !component.source_revision
    )
      errors.push(`Incomplete license/provenance: ${component.package}`);
    if (
      !component.notice_files?.length ||
      !component.upstream_evidence?.length ||
      !component.used_in?.length
    )
      errors.push(`Missing notice/evidence/usage: ${component.package}`);
    for (const file of component.notice_files ?? []) {
      const path = join(root, file.path);
      if (!published(file.path, manifest) || !existsSync(path))
        errors.push(`Missing distributed notice: ${file.path}`);
      else if (hash(path) !== file.sha256) errors.push(`Retained notice changed: ${file.path}`);
    }
    for (const file of component.upstream_evidence ?? []) {
      const path = join(base, file.path);
      if (!existsSync(path) || hash(path) !== file.sha256)
        errors.push(`Upstream evidence drift: ${component.package}/${file.path}`);
    }
    for (const path of component.used_in ?? [])
      if (!existsSync(join(root, path))) errors.push(`Usage path missing: ${path}`);
  }
  return errors;
}
const errors = validate(registry, pkg);
if (errors.length) throw new Error(errors.join('\n'));
if (process.argv.includes('--self-test')) {
  const cases = [
    [
      (records) => {
        records.components[0].version = 'wrong';
      },
      null,
      'Version drift',
    ],
    [
      (records) => {
        records.components[0].notice_files[0].sha256 = 'wrong';
      },
      null,
      'Retained notice changed',
    ],
    [
      null,
      (manifest) => {
        manifest.files = manifest.files.filter((p) => p !== 'licenses');
      },
      'Missing distributed notice',
    ],
    [
      null,
      (manifest) => {
        manifest.dependencies['unrecorded-package'] = '1.0.0';
      },
      'exactly once',
    ],
  ];
  for (const [editRegistry, editPackage, expected] of cases) {
    const records = structuredClone(registry),
      manifest = structuredClone(pkg);
    editRegistry?.(records);
    editPackage?.(manifest);
    if (!validate(records, manifest).some((message) => message.includes(expected)))
      throw new Error(`Self-test missed ${expected}`);
  }
}
console.log(
  `third-party notices PASS: ${registry.components.length} direct runtime dependencies; versions, notices, source evidence and package inclusion${process.argv.includes('--self-test') ? '; four rejection self-tests' : ''}`
);
