import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DEPLOYMENT_MANIFEST, captureBuildInputs, captureBuildOutputs, createBuildManifest,
  captureRunningDeployment, deploymentHealth, assertDeploymentLaunchReady } from '../src/core/deployment-health.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-deployment-')); roots.push(root);
  const write = (file: string, value: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  write('src/index.ts', 'export const version = 1;');
  write('src/core/guard/protocol-version.ts', "export const UXP_BRIDGE_REVISION = 'test-bridge-v17';");
  write('uxp-plugin/main.js', "const BRIDGE_REVISION = 'test-bridge-v17';");
  write('dist/index.js', 'export const version = 1;');
  const build = () => {
    const manifest = createBuildManifest(captureBuildInputs(root), captureBuildOutputs(path.join(root, 'dist')));
    write(`dist/${DEPLOYMENT_MANIFEST}`, JSON.stringify(manifest));
    write('uxp-plugin/deployment-build.js', `module.exports = { source_sha256: '${manifest.uxp_sha256}' };`);
    return manifest;
  };
  const manifest = build();
  const running = captureRunningDeployment(root);
  const bridge = { plugin_connected: true, bridge_revision: 'test-bridge-v17', server_deployment: running,
    uxp_source_sha256: manifest.uxp_sha256 };
  return { root, write, build, manifest, running, bridge };
}
const codes = (value: ReturnType<typeof deploymentHealth>) => value.issues.map(row => row.code);

it('accepts current paired bytes and keeps source-free packaged launches valid', () => {
  const f = fixture();
  expect(deploymentHealth(f.root, undefined, f.bridge).status).toBe('current');
  expect(() => assertDeploymentLaunchReady(f.root)).not.toThrow();
  fs.renameSync(path.join(f.root, 'src'), path.join(f.root, 'source-not-shipped'));
  expect(() => assertDeploymentLaunchReady(f.root)).not.toThrow();
});
it('catches unversioned source changes before launch, while documentation and tests do not require rebuilding', () => {
  const f = fixture();
  f.write('README.md', 'Updated documentation'); f.write('src/example.test.ts', 'A changed test');
  expect(deploymentHealth(f.root, undefined, f.bridge).status).toBe('current');
  f.write('src/index.ts', 'export const version = 2;');
  expect(codes(deploymentHealth(f.root, undefined, f.bridge))).toContain('deployment_build_outdated');
  expect(() => assertDeploymentLaunchReady(f.root)).toThrow('deployment_build_outdated');
});
it('never relabels an old running process after a rebuild, even with the same bridge revision', () => {
  const f = fixture(); f.write('src/index.ts', 'export const version = 2;'); const next = f.build();
  expect(f.running.build_id).toBe(f.manifest.build_id);
  expect(next.build_id).not.toBe(f.running.build_id);
  expect(codes(deploymentHealth(f.root, undefined, f.bridge))).toEqual(['deployment_mcp_restart_required']);
  const running = captureRunningDeployment(f.root);
  expect(deploymentHealth(f.root, running, f.bridge).status).toBe('current');
  expect(() => assertDeploymentLaunchReady(f.root, f.running)).toThrow('deployment_mcp_restart_required');
  expect(f.build().build_id).toBe(next.build_id); // identical bytes do not demand another restart
});
it('reports changed UXP bytes and loaded revision separately from server freshness', () => {
  const f = fixture(); f.write('uxp-plugin/main.js', "const BRIDGE_REVISION = 'test-bridge-v18';");
  const health = deploymentHealth(f.root, undefined, f.bridge);
  expect(codes(health)).toContain('deployment_source_revision_mismatch');
  expect(codes(health)).toContain('deployment_uxp_source_changed');
  expect(codes(deploymentHealth(f.root, f.running, { ...f.bridge, bridge_revision: 'test-bridge-v15' })))
    .toContain('deployment_uxp_reload_required');
});
it('requires reloading changed UXP code even when the declared revision is unchanged', () => {
  const f = fixture(); f.write('uxp-plugin/main.js', "const BRIDGE_REVISION = 'test-bridge-v17'; // new behavior");
  f.build(); const running = captureRunningDeployment(f.root);
  expect(codes(deploymentHealth(f.root, running, f.bridge))).toEqual(['deployment_uxp_reload_required']);
  expect(codes(deploymentHealth(f.root, running, { ...f.bridge, uxp_source_sha256: null })))
    .toEqual(['deployment_uxp_identity_unknown']);
});
it('does not accept incomplete output, a foreign endpoint, or absent running evidence', () => {
  const f = fixture();
  expect(codes(deploymentHealth(f.root))).toContain('deployment_running_identity_unknown');
  expect(codes(deploymentHealth(f.root, { ...f.running, project_root: `${f.root}-foreign` }, f.bridge)))
    .toContain('deployment_foreign_runtime');
  f.write('dist/index.js', 'partial compiler output');
  expect(() => assertDeploymentLaunchReady(f.root)).toThrow('deployment_build_incomplete');
  f.write(`dist/${DEPLOYMENT_MANIFEST}`, '{}');
  expect(() => assertDeploymentLaunchReady(f.root)).toThrow('deployment_build_missing');
});
