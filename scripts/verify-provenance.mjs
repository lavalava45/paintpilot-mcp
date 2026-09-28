import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASELINE = '7b635963f87b5b8ff5380c3156841f5253ec8063';
const UPSTREAM_REPOSITORY = 'https://github.com/alisaitteke/photoshop-mcp';

function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
}

function baseline(path) {
  return execFileSync('git', ['show', `${BASELINE}:${path}`], {
    cwd: ROOT,
    encoding: 'utf8',
  }).replace(/\r\n/g, '\n');
}

function normalized(text) {
  return text.replace(/\s+/g, ' ').trim();
}

const failures = [];
const license = read('LICENSE');
const upstreamLicense = baseline('LICENSE');
const notice = read('NOTICE');
const normalizedNotice = normalized(notice);
const packageJson = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('mcpb/manifest.json'));
const buildMcpb = read('scripts/build-mcpb.ts');
const contributing = read('CONTRIBUTING.md');

if (license !== upstreamLicense) {
  failures.push('LICENSE must preserve the upstream MIT notice byte-for-byte against the documented baseline');
}

const noticeMarkers = [
  'Historical origin',
  UPSTREAM_REPOSITORY,
  BASELINE,
  'The upstream MIT copyright and permission notice are retained in LICENSE',
  'Project-authored work',
  'Major architectural divergence',
  'embedded durable Photoshop Guard',
  'retirement of ExtendScript/COM/VBS production fallbacks',
  'Selective ports and attribution policy',
  'source repository and source revision',
  'preserve all license/copyright notices required by that source',
];
for (const marker of noticeMarkers) {
  if (!normalizedNotice.includes(normalized(marker))) failures.push(`NOTICE missing provenance marker: ${marker}`);
}

if (!Array.isArray(packageJson.files) || !packageJson.files.includes('LICENSE') || !packageJson.files.includes('NOTICE')) {
  failures.push('package distribution must include both LICENSE and NOTICE');
}
if (manifest.license !== 'MIT') failures.push('MCPB manifest must declare MIT licensing');

for (const requiredCopy of [
  "copyFileSync(join(ROOT, 'LICENSE'), join(SERVER_DIR, 'LICENSE'))",
  "copyFileSync(join(ROOT, 'NOTICE'), join(SERVER_DIR, 'NOTICE'))",
]) {
  if (!buildMcpb.includes(requiredCopy)) failures.push(`MCPB builder missing required attribution copy: ${requiredCopy}`);
}

for (const marker of [
  'External/upstream source intake',
  'source repository and exact commit/tag/PR',
  'license/copyright/notice obligations',
  'not obscure or replace the upstream MIT notice in `LICENSE`',
]) {
  if (!contributing.includes(marker)) failures.push(`CONTRIBUTING.md missing selective-port policy marker: ${marker}`);
}

console.log(JSON.stringify({
  protocol: 'photoshop.provenance.v1',
  baseline: BASELINE,
  upstream_repository: UPSTREAM_REPOSITORY,
  license_matches_baseline: license === upstreamLicense,
  package_includes_license: packageJson.files?.includes('LICENSE') === true,
  package_includes_notice: packageJson.files?.includes('NOTICE') === true,
  mcpb_license: manifest.license ?? null,
  notice_sections: {
    historical_origin: notice.includes('Historical origin'),
    project_authored_work: notice.includes('Project-authored work'),
    architectural_divergence: notice.includes('Major architectural divergence'),
    selective_ports_policy: notice.includes('Selective ports and attribution policy'),
  },
}, null, 2));

if (failures.length) {
  console.error(`provenance gate failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
}
