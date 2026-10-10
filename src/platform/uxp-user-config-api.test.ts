import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('UXP user-config settings API', () => {
  let bridge: typeof import('./uxp-bridge-server.js');
  let base = '';
  let root = '';

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'paintpilot-user-config-api-'));
    process.env.PHOTOSHOP_CONTROLLER_RUNTIME_DIR = path.join(root, '.photoshop-runtime', 'controller');
    process.env.PHOTOSHOP_UXP_BRIDGE_PORT = '39752';
    bridge = await import('./uxp-bridge-server.js');
    const port = await bridge.ensureUxpBridgeServer();
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await bridge.shutdownUxpBridgeServer();
    delete process.env.PHOTOSHOP_CONTROLLER_RUNTIME_DIR;
    delete process.env.PHOTOSHOP_UXP_BRIDGE_PORT;
    rmSync(root, { recursive: true, force: true });
  });

  it('reads defaults, persists valid preferences, and rejects invalid values without losing the saved config', async () => {
    const initialResponse = await fetch(`${base}/settings/user-config`);
    expect(initialResponse.status).toBe(200);
    await expect(initialResponse.json()).resolves.toMatchObject({
      ok: true,
      config_version: 1,
      effective: {
        language: 'auto',
        commentary_mode: 'mixed',
        commentary_detail: 'normal',
      },
    });

    const savedResponse = await fetch(`${base}/settings/user-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
      }),
    });
    expect(savedResponse.status).toBe(200);
    await expect(savedResponse.json()).resolves.toMatchObject({
      ok: true,
      configured: {
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
      },
      effective: {
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
      },
    });

    const invalidResponse = await fetch(`${base}/settings/user-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'de' }),
    });
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      ok: false,
      error: 'language must be auto|ru|en',
    });

    const persistedResponse = await fetch(`${base}/settings/user-config`);
    expect(persistedResponse.status).toBe(200);
    await expect(persistedResponse.json()).resolves.toMatchObject({
      effective: {
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
      },
    });
  });
});
