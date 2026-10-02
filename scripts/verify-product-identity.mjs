import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PROJECT_REPOSITORY = 'https://github.com/lavalava45/paintpilot-mcp';
const PRODUCT_NAME = 'photoshop-mcp-digital-painting';
const DISPLAY_NAME = 'Photoshop MCP — Digital Painting Edition';

function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function json(path) {
  return JSON.parse(read(path));
}

const failures = [];
const packageJson = json('package.json');
const serverJson = json('server.json');
const manifest = json('mcpb/manifest.json');
const buildMcpb = read('scripts/build-mcpb.ts');
const serverSource = read('src/core/photoshop-mcp-server.ts');
const noticePath = resolve(ROOT, 'NOTICE');
const notice = existsSync(noticePath) ? read('NOTICE') : '';

if (packageJson.name !== PRODUCT_NAME) {
  failures.push(`package.json name must be ${PRODUCT_NAME}`);
}
if (!Array.isArray(packageJson.files) || !packageJson.files.includes('NOTICE')) {
  failures.push('package.json files must include NOTICE');
}
if (serverJson.name !== 'io.github.lavalava45/photoshop-mcp-digital-painting') {
  failures.push('server.json must use the project-owned server id');
}
if (serverJson.repository?.url !== PROJECT_REPOSITORY) {
  failures.push('server.json repository must point to the project repository');
}
if (manifest.name !== PRODUCT_NAME || manifest.display_name !== DISPLAY_NAME) {
  failures.push('MCPB manifest must use the standalone Digital Painting Edition identity');
}
if (manifest.repository?.url !== PROJECT_REPOSITORY) {
  failures.push('MCPB manifest repository must point to the project repository');
}
if (!Array.isArray(manifest.compatibility?.platforms) || manifest.compatibility.platforms.join(',') !== 'win32') {
  failures.push('MCPB manifest must declare the maintained Windows-only platform');
}
if (!serverSource.includes("name: 'photoshop-mcp-digital-painting'")) {
  failures.push('runtime MCP server name must use the project identity');
}
if (!buildMcpb.includes("copyFileSync(join(ROOT, 'NOTICE'), join(SERVER_DIR, 'NOTICE'))")) {
  failures.push('MCPB builder must ship NOTICE');
}
if (!buildMcpb.includes('photoshop-mcp-digital-painting-${pkg.version}.mcpb')) {
  failures.push('MCPB versioned artifact name must use the project identity');
}

const examples = [
  'examples/claude-code-mcp.json',
  'examples/claude-desktop-config.json',
  'examples/cursor-config.json',
];
for (const path of examples) {
  const config = json(path);
  const entry = config.mcpServers?.['photoshop-digital-painting'];
  if (!entry || entry.command !== 'node') {
    failures.push(`${path} must expose the project-owned photoshop-digital-painting stdio entry`);
    continue;
  }
  const args = Array.isArray(entry.args) ? entry.args.join(' ') : '';
  if (!args.includes('photoshop-mcp-digital-painting') || !args.includes('dist')) {
    failures.push(`${path} must point at this repository's built dist/index.js`);
  }
}

const primaryIdentityFiles = [
  'package.json', 'server.json', 'mcpb/manifest.json', 'README.md', 'INSTALL.md',
  'CONTRIBUTING.md', 'RELEASE_CHECKLIST.md', 'llms.txt', 'AGENTS.md',
  'README.de.md', 'README.es.md', 'README.ja.md', 'README.tr.md', 'README.zh-CN.md',
  'docs/architecture.md', 'docs/development.md', 'docs/available-tools.md',
  'docs/painting-policy/foundations.md', 'docs/mascot.md', 'src/prompts/host-guidance.ts',
];
const legacyPrimaryPatterns = [
  /Photoshop MCP[^\n]*Digital Painting Fork/i,
  /photoshop-mcp-digital-painting-fork/i,
  /\bcommunity(?:-maintained)? fork\b/i,
  /\bindependent(?: community)? fork\b/i,
  /\bthis fork(?:'s)?\b/i,
  /\bfork-specific\b/i,
  /\bfork maintainer\b/i,
  /\bfork npm package\b/i,
  /\bfork MCP Registry\b/i,
];
for (const path of primaryIdentityFiles) {
  const text = read(path);
  for (const pattern of legacyPrimaryPatterns) {
    if (pattern.test(text)) failures.push(`${path} retains legacy primary fork branding: ${pattern}`);
  }
}

if (!notice) {
  failures.push('NOTICE is required for centralized historical provenance');
} else {
  for (const required of [
    'https://github.com/alisaitteke/photoshop-mcp',
    '7b635963f87b5b8ff5380c3156841f5253ec8063',
    'LICENSE',
  ]) {
    if (!notice.includes(required)) failures.push(`NOTICE missing required provenance marker: ${required}`);
  }
}

const report = {
  protocol: 'photoshop.product_identity.v1',
  package_name: packageJson.name,
  server_id: serverJson.name,
  mcpb_name: manifest.name,
  display_name: manifest.display_name,
  repository: manifest.repository?.url ?? null,
  platforms: manifest.compatibility?.platforms ?? [],
  examples,
  notice_present: Boolean(notice),
  primary_identity_files_checked: primaryIdentityFiles.length,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`product-identity gate failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
}
