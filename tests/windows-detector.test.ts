import { afterEach, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn((file: string, _args: string[], _options: unknown, callback: Function) => {
    if (file === 'tasklist.exe') {
      callback(null, { stdout: 'Photoshop.exe 1234 Console', stderr: '' });
      return;
    }
    callback(null, { stdout: '', stderr: '' });
  }),
}));

vi.mock('node:fs/promises', () => ({
  constants: { F_OK: 0 },
  readdir: vi.fn(async () => [
    { name: 'Adobe Photoshop 2026', isDirectory: () => true },
    { name: 'Adobe Photoshop 2030', isDirectory: () => true },
  ]),
  access: vi.fn(async (file: string) => {
    if (!file.endsWith('Adobe Photoshop 2030\\Photoshop.exe')) throw new Error('ENOENT');
  }),
}));

import { photoshopVersionFromPath, WindowsDetector } from '../src/platform/windows-detector.js';

afterEach(() => vi.unstubAllEnvs());

it('discovers future installed Windows releases without a hardcoded last year', async () => {
  vi.stubEnv('PHOTOSHOP_PATH', '');
  const info = await new WindowsDetector().detect();
  expect(info).toMatchObject({
    version: '2030',
    isRunning: true,
  });
  expect(info.path).toContain('Adobe Photoshop 2030');
});

it('extracts the Photoshop year from Windows install paths', () => {
  expect(
    photoshopVersionFromPath('C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe')
  ).toBe('2026');
});
