import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEPLOYMENT_PROTOCOL = 'paintpilot.deployment.v1';
export const DEPLOYMENT_MANIFEST = 'paintpilot-build.json';
export const UXP_DEPLOYMENT_FILE = 'uxp-plugin/deployment-build.js';
export const DEPLOYMENT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
type FileHash = { path: string; sha256: string };
export type BuildInputs = {
  source_sha256: string; uxp_sha256: string; expected_uxp_revision: string;
  uxp_source_revision: string; files: FileHash[];
};
export type BuildManifest = BuildInputs & {
  protocol: string; build_id: string; built_at: string; outputs: FileHash[];
};
export type RunningDeployment = {
  protocol: string; project_root: string; pid: number; loaded_at: string;
  build_id: string | null; source_sha256: string | null;
  expected_uxp_revision: string | null;
};
export type BridgeDeployment = {
  plugin_connected?: boolean; bridge_revision?: string | null;
  uxp_source_sha256?: string | null;
  server_deployment?: RunningDeployment;
};

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const posix = (value: string) => value.split(path.sep).join('/');
function walk(root: string, folder: string): string[] {
  const full = path.join(root, folder);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
    const relative = posix(path.join(folder, entry.name));
    return entry.isDirectory() ? walk(root, relative) : entry.isFile() ? [relative] : [];
  }).sort();
}
function fingerprints(root: string, names: string[]): FileHash[] {
  return names.sort().map(name => ({ path: name, sha256: hash(fs.readFileSync(path.join(root, name))) }));
}
function revision(root: string, file: string, symbol: string): string {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const result = source.match(new RegExp(`\\b(?:export\\s+)?const\\s+${symbol}\\s*=\\s*['"]([^'"]+)['"]`));
  if (!result) throw new Error(`deployment_revision_missing: ${file}:${symbol}`);
  return result[1]!;
}
export function captureBuildInputs(root = DEPLOYMENT_ROOT): BuildInputs {
  const source = walk(root, 'src').filter(name => !/\.test\.[^.]+$/.test(name));
  if (!source.length) throw new Error('deployment_sources_unavailable');
  const config = ['package.json', 'tsconfig.json', 'pnpm-lock.yaml', 'package-lock.json',
    'scripts/build-server.ts'].filter(name => fs.existsSync(path.join(root, name)));
  const files = fingerprints(root, [...source, ...config]);
  const uxp = fingerprints(root, walk(root, 'uxp-plugin').filter(name => name !== UXP_DEPLOYMENT_FILE
    && name !== `${UXP_DEPLOYMENT_FILE}.tmp`));
  return { source_sha256: hash(JSON.stringify(files)), uxp_sha256: hash(JSON.stringify(uxp)),
    expected_uxp_revision: revision(root, 'src/core/guard/protocol-version.ts', 'UXP_BRIDGE_REVISION'),
    uxp_source_revision: revision(root, 'uxp-plugin/main.js', 'BRIDGE_REVISION'), files };
}
export function captureBuildOutputs(directory: string): FileHash[] {
  return fingerprints(directory, walk(directory, '').filter(name => name !== DEPLOYMENT_MANIFEST));
}
export function readBuildManifest(root = DEPLOYMENT_ROOT): BuildManifest | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, 'dist', DEPLOYMENT_MANIFEST), 'utf8')) as BuildManifest;
    if (value.protocol !== DEPLOYMENT_PROTOCOL || !Array.isArray(value.files) || !Array.isArray(value.outputs)
      || !value.source_sha256 || !value.uxp_sha256 || !value.build_id || !value.expected_uxp_revision)
      return undefined;
    const { build_id: _id, built_at: _at, ...payload } = value;
    return hash(JSON.stringify(payload)) === value.build_id ? value : undefined;
  } catch { return undefined; }
}
export function createBuildManifest(inputs: BuildInputs, outputs: FileHash[]): BuildManifest {
  const payload = { protocol: DEPLOYMENT_PROTOCOL, ...inputs, outputs };
  return { ...payload, built_at: new Date().toISOString(), build_id: hash(JSON.stringify(payload)) };
}
export function captureRunningDeployment(root = DEPLOYMENT_ROOT): RunningDeployment {
  const build = readBuildManifest(root);
  return { protocol: DEPLOYMENT_PROTOCOL, project_root: path.resolve(root), pid: process.pid,
    loaded_at: new Date().toISOString(), build_id: build?.build_id ?? null,
    source_sha256: build?.source_sha256 ?? null, expected_uxp_revision: build?.expected_uxp_revision ?? null };
}
// Snapshot at module load: rebuilding dist must never relabel an old running MCP process.
export const RUNNING_DEPLOYMENT = Object.freeze(captureRunningDeployment());

export function deploymentHealth(root = DEPLOYMENT_ROOT, running?: RunningDeployment, bridge?: BridgeDeployment) {
  const build = readBuildManifest(root);
  let source: BuildInputs | undefined;
  const issues: Array<{ code: string; action: string }> = [];
  const issue = (code: string, action: string) => issues.push({ code, action });
  if (fs.existsSync(path.join(root, 'src'))) {
    try { source = captureBuildInputs(root); }
    catch { issue('deployment_source_unreadable', 'Finish the source update, then run npm run build:server.'); }
  }
  if (!build) issue('deployment_build_missing', 'Run npm run build:server before starting this MCP plugin.');
  let outputMatch = false;
  if (build) {
    try { outputMatch = JSON.stringify(captureBuildOutputs(path.join(root, 'dist'))) === JSON.stringify(build.outputs); }
    catch { /* A partial or concurrent build is not a valid deployment. */ }
    if (!outputMatch) issue('deployment_build_incomplete', 'Run npm run build:server; compiled files differ from the successful build manifest.');
    if (source && source.source_sha256 !== build.source_sha256)
      issue('deployment_build_outdated', 'Run npm run build:server; restarting the MCP client alone runs the old compiled server.');
    if (source && source.uxp_sha256 !== build.uxp_sha256)
      issue('deployment_uxp_source_changed', 'Build the current paired sources before reloading UXP.');
    try {
      const marker = fs.readFileSync(path.join(root, UXP_DEPLOYMENT_FILE), 'utf8');
      if (!marker.includes(`'${build.uxp_sha256}'`)) throw new Error('wrong UXP build marker');
    } catch { issue('deployment_uxp_build_marker_invalid', 'Run npm run build:server to publish the paired UXP build marker.'); }
  }
  if (source && source.expected_uxp_revision !== source.uxp_source_revision)
    issue('deployment_source_revision_mismatch', 'Finish integrating the server and UXP changes with one matching bridge revision, then build.');
  const observed = running ?? bridge?.server_deployment;
  const sameProject = observed?.protocol === DEPLOYMENT_PROTOCOL
    && typeof observed.project_root === 'string'
    && path.resolve(observed.project_root).toLowerCase() === path.resolve(root).toLowerCase();
  if (!sameProject || !observed?.build_id) {
    issue(observed && !sameProject ? 'deployment_foreign_runtime' : 'deployment_running_identity_unknown',
      'After a successful build, restart only this PaintPilot MCP server connection; verify the health endpoint for that process.');
  } else if (build && observed.build_id !== build.build_id) {
    issue('deployment_mcp_restart_required', 'Restart only this PaintPilot MCP server connection; its loaded build differs from dist.');
  }
  const expected = source?.expected_uxp_revision ?? build?.expected_uxp_revision;
  const revisionMatch = bridge?.plugin_connected === true && !!expected && bridge.bridge_revision === expected;
  if (!bridge?.plugin_connected || !bridge.bridge_revision)
    issue('deployment_uxp_unavailable', 'Connect the Photoshop UXP companion and check this same health endpoint.');
  else if (!revisionMatch)
    issue('deployment_uxp_reload_required', 'Reload only Photoshop MCP UXP Bridge in UXP Developer Tool (Unload/Load after manifest changes).');
  else if (!bridge.uxp_source_sha256)
    issue('deployment_uxp_identity_unknown', 'Reload the built UXP companion once; revision alone cannot confirm that its current code was loaded.');
  else if (bridge.uxp_source_sha256 !== (source?.uxp_sha256 ?? build?.uxp_sha256))
    issue('deployment_uxp_reload_required', 'Reload only the UXP companion; its loaded build marker differs despite a matching revision.');
  return { protocol: DEPLOYMENT_PROTOCOL, status: issues.length ? 'action_required' : 'current',
    source: source ? { source_sha256: source.source_sha256, uxp_sha256: source.uxp_sha256,
      expected_uxp_revision: source.expected_uxp_revision, uxp_revision: source.uxp_source_revision } : { status: 'not_installed' },
    built: build ? { build_id: build.build_id, built_at: build.built_at, source_sha256: build.source_sha256,
      expected_uxp_revision: build.expected_uxp_revision, output_integrity: outputMatch } : null,
    running_mcp: sameProject ? observed : null,
    loaded_uxp: { connected: bridge?.plugin_connected === true, revision: bridge?.bridge_revision ?? null,
      source_sha256: bridge?.uxp_source_sha256 ?? null, revision_match: revisionMatch,
      evidence: 'bridge announcement with build marker captured at UXP module load; not a pixel-quality test' },
    issues, next_actions: [...new Set(issues.map(row => row.action))], automatic_restart: false };
}
export function assertDeploymentLaunchReady(root = DEPLOYMENT_ROOT, running?: RunningDeployment): void {
  const status = deploymentHealth(root, running);
  const buildIssues = status.issues.filter(row => !['deployment_running_identity_unknown', 'deployment_uxp_unavailable'].includes(row.code));
  if (buildIssues.length) throw new Error(`${buildIssues.map(row => row.code).join(', ')}: ${buildIssues[0]!.action}`);
}
