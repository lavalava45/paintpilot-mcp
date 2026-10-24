import { platform } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoshopConnection, PhotoshopDetector, WindowsDetector } from './discovery-runtime.js';

vi.mock('node:os', () => ({ platform: vi.fn() }));

beforeEach(() => {
  vi.mocked(platform).mockReturnValue('win32');
});

describe('Photoshop discovery platform boundary', () => {
  it('allows construction on Linux but refuses native discovery before probing Windows', async () => {
    vi.mocked(platform).mockReturnValue('linux');
    const windows = new WindowsDetector();
    const detect = vi.spyOn(windows, 'detect');
    const detector = new PhotoshopDetector(windows);
    const connection = new PhotoshopConnection({ detector });

    await expect(connection.ping()).resolves.toBe(false);
    await expect(connection.getVersion()).rejects.toThrow('Unsupported platform: linux');
    expect(detect).not.toHaveBeenCalled();
    expect(connection.getPhotoshopInfo()).toBeNull();
  });

  it('preserves Windows discovery, cache, forced refresh and invalidation', async () => {
    const windows = new WindowsDetector();
    const info = { version: '2026', path: 'C:\\Photoshop.exe', isRunning: true };
    const detect = vi.spyOn(windows, 'detect').mockResolvedValue(info);
    const detector = new PhotoshopDetector(windows);

    await expect(detector.detect()).resolves.toEqual(info);
    await expect(detector.detect()).resolves.toEqual(info);
    expect(detect).toHaveBeenCalledTimes(1);
    await detector.detect(true);
    expect(detect).toHaveBeenCalledTimes(2);
    detector.invalidateCache();
    await detector.detect();
    expect(detect).toHaveBeenCalledTimes(3);
  });
});
