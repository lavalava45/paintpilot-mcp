import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const retiredConsumerTokens = [
  'photoshop-session.mjs',
  'test-session-controller.mjs',
  'test-controller-cycle.mjs',
  'test-stage-a-e2e.mjs',
  'test-stage-c-ux.mjs',
  'test-stage-d-acceptance.mjs',
  'test-mcp-daemon.mjs',
];

const removedLegacySurfaces = [
  'scripts/photoshop-session.mjs',
  'scripts/photoshop-mcp-daemon.mjs',
  'scripts/lib/photoshop-session-store.mjs',
  'scripts/lib/photoshop-cycle.mjs',
  'scripts/lib/mcp-daemon-client.mjs',
  'scripts/test-session-controller.mjs',
  'scripts/test-controller-cycle.mjs',
  'scripts/test-stage-a-e2e.mjs',
  'scripts/test-stage-c-ux.mjs',
  'scripts/test-stage-d-acceptance.mjs',
  'scripts/test-mcp-daemon.mjs',
  'scripts/test-layer-api-live.mjs',
  'scripts/test-paint-coordinate-dpi-live.mjs',
  'scripts/test-protected-layer-live.mjs',
  'scripts/test-fixtures/mcp-daemon-client-once.mjs',
  'docs/reliable-core-workflow.md',
];

describe('legacy maintained-consumer retirement', () => {
  it('keeps every maintained package test command on the compact/native path', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const maintainedTests = Object.entries(pkg.scripts ?? {})
      .filter(([name]) => name === 'test:acceptance' || name.startsWith('test:'));

    for (const [name, command] of maintainedTests) {
      for (const token of retiredConsumerTokens) {
        expect(command, `${name} must not invoke retired consumer ${token}`).not.toContain(token);
      }
    }
  });

  it('physically removes retired controller/daemon providers and historical consumers', () => {
    for (const relative of removedLegacySurfaces) {
      expect(existsSync(path.join(root, relative)), `${relative} must be deleted; Git history is the archive`).toBe(false);
    }
  });
});
