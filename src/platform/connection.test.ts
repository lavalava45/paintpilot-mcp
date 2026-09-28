import { describe, expect, it } from 'vitest';
import { PhotoshopConnection, type PhotoshopInfo } from './connection.js';

function fixture(running = true) {
  let detects = 0;
  const info: PhotoshopInfo = {
    version: '2026',
    path: 'C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe',
    isRunning: running,
  };
  const detector = {
    detect: async () => {
      detects++;
      return info;
    },
  };
  const connection = new PhotoshopConnection({ detector });
  return { connection, counts: () => ({ detects }) };
}

describe('PhotoshopConnection Windows discovery facade', () => {
  it('caches detection across ping/version reads', async () => {
    const { connection, counts } = fixture();
    await expect(connection.ping()).resolves.toBe(true);
    await expect(connection.getVersion()).resolves.toBe('2026');
    expect(connection.getPhotoshopInfo()).toMatchObject({ version: '2026', isRunning: true });
    expect(counts()).toEqual({ detects: 1 });
  });

  it('reports detector failures as ping=false while version reads fail closed', async () => {
    const connection = new PhotoshopConnection({
      detector: { detect: async () => { throw new Error('Photoshop missing'); } },
    });
    await expect(connection.ping()).resolves.toBe(false);
    await expect(connection.getVersion()).rejects.toThrow('Photoshop missing');
  });
});
