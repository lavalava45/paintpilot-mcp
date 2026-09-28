import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ reachable: vi.fn() }));
vi.mock('./uxp-bridge-client.js', () => ({ isUxpBridgeReachable: bridge.reachable }));

import {
  getPhotoshopCapabilities,
  parsePhotoshopVersion,
  resolvePhotoshopCapabilities,
} from './capabilities.js';

beforeEach(() => {
  vi.clearAllMocks();
  bridge.reachable.mockResolvedValue(false);
});

describe('Photoshop capability model', () => {
  it('preserves numeric version parsing and unknown fallback', () => {
    expect(parsePhotoshopVersion('23.5.1')).toEqual({ major: 23, minor: 5, raw: '23.5.1' });
    expect(parsePhotoshopVersion('unknown')).toEqual({ major: 0, minor: 0, raw: 'unknown' });
  });

  it('preserves feature thresholds and UXP API minimum 23.5', () => {
    expect(getPhotoshopCapabilities('22.0').features).toMatchObject({
      select_subject_v2: false,
      sky_replacement_native: true,
      execute_as_modal_timeout: false,
      uxp_plugin_api: false,
    });
    expect(getPhotoshopCapabilities('23.4').features.uxp_plugin_api).toBe(false);
    expect(getPhotoshopCapabilities('23.5').features.uxp_plugin_api).toBe(true);
    expect(getPhotoshopCapabilities('27.9').features).toMatchObject({
      select_subject_v2: true,
      sky_replacement_native: true,
      execute_as_modal_timeout: true,
      uxp_plugin_api: true,
    });
  });

  it('merges runtime bridge reachability without changing version-derived flags', async () => {
    bridge.reachable.mockResolvedValue(true);
    const resolved = await resolvePhotoshopCapabilities('27.9');
    expect(resolved.features).toMatchObject({
      uxp_bridge_reachable: true,
      neural_filters: true,
      uxp_plugin_api: true,
    });

    bridge.reachable.mockResolvedValue(false);
    const disconnected = await resolvePhotoshopCapabilities('27.9');
    expect(disconnected.features).toMatchObject({
      uxp_bridge_reachable: false,
      neural_filters: false,
      uxp_plugin_api: true,
    });
  });
});
