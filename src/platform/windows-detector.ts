import { execFile } from 'node:child_process';
import { access, constants, readdir } from 'node:fs/promises';
import { win32 as path } from 'node:path';
import { promisify } from 'node:util';
import { Logger } from '../utils/logger.js';
import type { PhotoshopInfo } from './connection.js';

const execFileAsync = promisify(execFile);
const REGISTRY_ROOTS = [
  'HKLM\\SOFTWARE\\Adobe\\Photoshop',
  'HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\Photoshop',
] as const;
const PHOTOSHOP_COM_KEYS = [
  'HKCR\\CLSID\\{06870682-6f3c-4b97-9143-f03e85c0bd3e}\\LocalServer32',
  'HKCR\\Wow6432Node\\CLSID\\{06870682-6f3c-4b97-9143-f03e85c0bd3e}\\LocalServer32',
] as const;

function unquote(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}

function photoshopExecutable(candidate: string): string {
  const clean = unquote(candidate);
  return clean.toLowerCase().endsWith('.exe') ? clean : path.join(clean, 'Photoshop.exe');
}

export function photoshopVersionFromPath(candidate: string): string {
  const year = candidate.match(/(?:Photoshop(?: CC)?\s+)(\d{4})/i)?.[1];
  if (year) return year;
  return candidate.match(/(?:Photoshop\\)(\d+\.\d+)/i)?.[1] ?? 'Unknown';
}

function applicationPathsFromRegistry(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/ApplicationPath\s+REG_SZ\s+(.+)$/i)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function executableFromComRegistry(output: string): string | undefined {
  const value = output.match(/REG_SZ\s+(.+?\.exe)(?:\s|$)/i)?.[1];
  return value ? unquote(value) : undefined;
}

export class WindowsDetector {
  private readonly logger = new Logger('WindowsDetector');

  async detect(): Promise<PhotoshopInfo> {
    const candidates = [
      ...(process.env.PHOTOSHOP_PATH ? [process.env.PHOTOSHOP_PATH] : []),
      ...(await this.registryCandidates()),
      ...(await this.installDirectoryCandidates()),
    ];

    const seen = new Set<string>();
    for (const candidate of candidates) {
      const executable = photoshopExecutable(candidate);
      const key = executable.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!(await this.exists(executable))) continue;

      this.logger.info(`Found Photoshop at: ${executable}`);
      return {
        version: photoshopVersionFromPath(executable),
        path: executable,
        isRunning: await this.isPhotoshopRunning(),
      };
    }

    throw new Error(
      'Photoshop was not found on Windows. Set PHOTOSHOP_PATH or install Adobe Photoshop in a standard location.'
    );
  }

  private async registryCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    for (const key of REGISTRY_ROOTS) {
      try {
        const { stdout } = await execFileAsync('reg.exe', ['query', key, '/s'], {
          windowsHide: true,
          maxBuffer: 2 * 1024 * 1024,
        });
        candidates.push(...applicationPathsFromRegistry(stdout));
      } catch {
        // Missing Adobe registry roots are normal on machines without Photoshop.
      }
    }

    for (const key of PHOTOSHOP_COM_KEYS) {
      try {
        const { stdout } = await execFileAsync('reg.exe', ['query', key, '/ve'], {
          windowsHide: true,
          maxBuffer: 256 * 1024,
        });
        const executable = executableFromComRegistry(stdout);
        if (executable) candidates.push(executable);
      } catch {
        // COM registration is an optional discovery hint only.
      }
    }
    return candidates;
  }

  private async installDirectoryCandidates(): Promise<string[]> {
    const roots = [
      process.env.ProgramFiles ?? 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    ];
    const candidates: string[] = [];

    for (const root of roots) {
      const adobeRoot = path.join(root, 'Adobe');
      try {
        const entries = await readdir(adobeRoot, { withFileTypes: true });
        const photoshopDirs = entries
          .filter((entry) => entry.isDirectory() && /^Adobe Photoshop(?: CC)?(?: \d{4})?$/i.test(entry.name))
          .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
        for (const entry of photoshopDirs.slice(0, 64)) {
          candidates.push(path.join(adobeRoot, entry.name, 'Photoshop.exe'));
        }
      } catch {
        // Fall through to conventional paths below.
      }

      for (let year = new Date().getFullYear() + 1; year >= 2012; year--) {
        candidates.push(
          path.join(adobeRoot, `Adobe Photoshop ${year}`, 'Photoshop.exe'),
          path.join(adobeRoot, `Adobe Photoshop CC ${year}`, 'Photoshop.exe')
        );
      }
      candidates.push(
        path.join(adobeRoot, 'Adobe Photoshop CC', 'Photoshop.exe'),
        path.join(adobeRoot, 'Photoshop CC', 'Photoshop.exe')
      );
    }

    return candidates;
  }

  private async exists(executable: string): Promise<boolean> {
    try {
      await access(executable, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async isPhotoshopRunning(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        'tasklist.exe',
        ['/FI', 'IMAGENAME eq Photoshop.exe'],
        { windowsHide: true, maxBuffer: 256 * 1024 }
      );
      return /photoshop\.exe/i.test(stdout);
    } catch {
      return false;
    }
  }
}
