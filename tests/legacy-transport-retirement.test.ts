import { describe, expect, it } from 'vitest';
import { PhotoshopConnection } from '../src/platform/connection.js';
import { PhotoshopBackendRouter } from '../src/platform/photoshop-backend.js';

describe('UXP-only production transport contract', () => {
  it('registers only the UXP backend in the production semantic router', () => {
    const router = new PhotoshopBackendRouter(new PhotoshopConnection()) as any;
    expect(router.backends.map((backend: any) => backend.kind)).toEqual(['uxp']);
  });

  it('does not expose a legacy script execution surface on PhotoshopConnection', () => {
    const connection = new PhotoshopConnection({
      detector: { detect: async () => ({ version: '2026', path: 'fixture', isRunning: true }) },
    });
    expect('executeScript' in connection).toBe(false);
    expect('ensurePhotoshopRunning' in connection).toBe(false);
  });
});
