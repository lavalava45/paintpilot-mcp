import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
}

function normalized(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function walkYaml(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return walkYaml(full);
    return /\.ya?ml$/i.test(entry.name) ? [full] : [];
  });
}

const failures = [];
const policy = read('docs/external-intake.md');
const contributing = read('CONTRIBUTING.md');
const development = read('docs/development.md');
const releasePolicy = read('docs/release-policy.md');
const releaseChecklist = read('RELEASE_CHECKLIST.md');
const pullRequestTemplate = read('.github/pull_request_template.md');
const notice = read('NOTICE');
const packageJson = JSON.parse(read('package.json'));

const requiredMarkers = new Map([
  ['docs/external-intake.md', [
    'Upstream is an optional external source',
    'No synchronization baseline',
    'source repository and exact source revision',
    'current project problem, compatibility need, or measured value',
    'affected project paths',
    'intake mode',
    'architecture fit',
    'license/copyright/notice obligations',
    'npm run verify:source-independence',
    'npm run verify:provenance',
    'npm run verify:canonical',
  ]],
  ['CONTRIBUTING.md', [
    'External/upstream source intake',
    'source repository and exact commit/tag/PR',
    'current project problem, compatibility need, or measured value',
    'affected project paths',
    'license/copyright/notice obligations',
    'docs/external-intake.md',
  ]],
  ['docs/development.md', [
    'An `upstream` remote is optional',
    'external-intake.md',
  ]],
  ['docs/release-policy.md', [
    'Upstream is an external source, not a synchronization authority',
    'external-intake.md',
  ]],
  ['RELEASE_CHECKLIST.md', [
    'npm run verify:external-intake',
    'No upstream baseline/version is required',
  ]],
  ['.github/pull_request_template.md', [
    'External/upstream intake (if applicable)',
    'Source repository + exact revision/PR',
    'Current problem / measured value',
    'Affected project paths',
    'Intake mode',
    'License/copyright/notice obligations',
    'Not applicable — project-authored change only',
  ]],
  ['NOTICE', [
    'Selective ports and attribution policy',
    'reviewed change-by-change rather than merged wholesale',
  ]],
]);

const texts = new Map([
  ['docs/external-intake.md', policy],
  ['CONTRIBUTING.md', contributing],
  ['docs/development.md', development],
  ['docs/release-policy.md', releasePolicy],
  ['RELEASE_CHECKLIST.md', releaseChecklist],
  ['.github/pull_request_template.md', pullRequestTemplate],
  ['NOTICE', notice],
]);

for (const [path, markers] of requiredMarkers) {
  const text = normalized(texts.get(path) ?? '');
  for (const marker of markers) {
    if (!text.includes(normalized(marker))) failures.push(`${path} missing selective-intake marker: ${marker}`);
  }
}

const scripts = packageJson.scripts ?? {};
if (scripts['verify:external-intake'] !== 'node scripts/verify-external-intake.mjs') {
  failures.push('package.json must expose verify:external-intake');
}
if (!String(scripts['verify:canonical'] ?? '').includes('npm run verify:external-intake')) {
  failures.push('verify:canonical must include verify:external-intake');
}

for (const [name, command] of Object.entries(scripts)) {
  if (/\bgit\s+(?:pull|merge|rebase|reset)\b/i.test(String(command)) && /\bupstream\b/i.test(String(command))) {
    failures.push(`package script ${name} contains upstream synchronization command`);
  }
}

const maintainedWorkflow = [
  ['CONTRIBUTING.md', contributing],
  ['docs/development.md', development],
  ['docs/release-policy.md', releasePolicy],
  ['RELEASE_CHECKLIST.md', releaseChecklist],
  ['.github/pull_request_template.md', pullRequestTemplate],
];
const forbiddenPatterns = [
  /git\s+pull\s+upstream\b/i,
  /git\s+merge\s+upstream(?:\/|\b)/i,
  /git\s+rebase\s+upstream(?:\/|\b)/i,
  /git\s+reset\s+--hard\s+upstream(?:\/|\b)/i,
  /\bkeep(?:ing)?\s+(?:this\s+)?(?:project|branch)\s+in\s+sync\s+with\s+upstream\b/i,
  /\bsummarize upstream base version\/commit\b/i,
];
const forbiddenMatches = [];
for (const [path, text] of maintainedWorkflow) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) forbiddenMatches.push({ path, pattern: String(pattern) });
  }
}

const workflowFiles = walkYaml(resolve(ROOT, '.github', 'workflows'));
for (const file of workflowFiles) {
  const text = readFileSync(file, 'utf8');
  if (/\bupstream\b/i.test(text) && /git\s+(?:pull|merge|rebase|reset|fetch)\b/i.test(text)) {
    forbiddenMatches.push({ path: file.slice(ROOT.length + 1).replaceAll('\\', '/'), pattern: 'automated upstream git synchronization' });
  }
}
if (forbiddenMatches.length) {
  failures.push(`maintained workflow contains synchronization pressure: ${JSON.stringify(forbiddenMatches)}`);
}

console.log(JSON.stringify({
  protocol: 'photoshop.external_intake.v1',
  policy: 'docs/external-intake.md',
  upstream_remote_required: false,
  workflow_files_checked: maintainedWorkflow.map(([path]) => path),
  github_workflows_checked: workflowFiles.length,
  canonical_gate_wired: String(scripts['verify:canonical'] ?? '').includes('npm run verify:external-intake'),
  pr_intake_evidence_fields: true,
  forbidden_sync_matches: forbiddenMatches,
}, null, 2));

if (failures.length) {
  console.error(`external-intake gate failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
}
