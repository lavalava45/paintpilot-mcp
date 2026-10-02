import { execFile } from 'node:child_process';
import { access, constants, readdir } from 'node:fs/promises';
import { win32 as path } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PHOTOSHOP_REGISTRY_ROOTS = [
  'HKLM\\SOFTWARE\\Adobe\\Photoshop',
  'HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\Photoshop',
] as const;

const PHOTOSHOP_COM_SERVER_KEYS = [
  'HKCR\\CLSID\\{06870682-6f3c-4b97-9143-f03e85c0bd3e}\\LocalServer32',
  'HKCR\\Wow6432Node\\CLSID\\{06870682-6f3c-4b97-9143-f03e85c0bd3e}\\LocalServer32',
] as const;

function stripQuotes(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}

export function normalizePhotoshopExecutable(candidate: string): string {
  const normalized = stripQuotes(candidate);
  return normalized.toLowerCase().endsWith('.exe')
    ? normalized
    : path.join(normalized, 'Photoshop.exe');
}

export function photoshopVersionFromPath(candidate: string): string {
  const releaseYear = candidate.match(/(?:Photoshop(?: CC)?\s+)(\d{4})/i)?.[1];
  if (releaseYear !== undefined) return releaseYear;
  const legacyVersion = candidate.match(/(?:Photoshop\\)(\d+\.\d+)/i)?.[1];
  return legacyVersion ?? 'Unknown';
}

function applicationPaths(output: string): string[] {
  const candidates: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const pathValue = line.match(/ApplicationPath\s+REG_SZ\s+(.+)$/i)?.[1]?.trim();
    if (pathValue) candidates.push(pathValue);
  }
  return candidates;
}

function comExecutable(output: string): string | undefined {
  const executable = output.match(/REG_SZ\s+(.+?\.exe)(?:\s|$)/i)?.[1];
  return executable === undefined ? undefined : stripQuotes(executable);
}

async function registryCandidates(): Promise<string[]> {
  const candidates: string[] = [];
  for (const key of PHOTOSHOP_REGISTRY_ROOTS) {
    try {
      const result = await execFileAsync('reg.exe', ['query', key, '/s'], {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      candidates.push(...applicationPaths(result.stdout));
    } catch {
      // Registry discovery is opportunistic; standard install paths are checked next.
    }
  }
  for (const key of PHOTOSHOP_COM_SERVER_KEYS) {
    try {
      const result = await execFileAsync('reg.exe', ['query', key, '/ve'], {
        windowsHide: true,
        maxBuffer: 256 * 1024,
      });
      const executable = comExecutable(result.stdout);
      if (executable !== undefined) candidates.push(executable);
    } catch {
      // COM registration is optional and may be absent for a valid installation.
    }
  }
  return candidates;
}

async function standardInstallCandidates(): Promise<string[]> {
  const programRoots = [
    process.env.ProgramFiles ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  ];
  const candidates: string[] = [];

  for (const root of programRoots) {
    const adobeRoot = path.join(root, 'Adobe');
    try {
      const entries = await readdir(adobeRoot, { withFileTypes: true });
      const detectedDirectories = entries
        .filter((entry) => entry.isDirectory() && /^Adobe Photoshop(?: CC)?(?: \d{4})?$/i.test(entry.name))
        .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))
        .slice(0, 64);
      for (const entry of detectedDirectories) {
        candidates.push(path.join(adobeRoot, entry.name, 'Photoshop.exe'));
      }
    } catch {
      // Missing Adobe roots are expected on systems without a standard installation.
    }

    for (let year = new Date().getFullYear() + 1; year >= 2012; year -= 1) {
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

export async function collectWindowsPhotoshopCandidates(): Promise<string[]> {
  const configured = process.env.PHOTOSHOP_PATH;
  const registry = await registryCandidates();
  const conventional = await standardInstallCandidates();
  return configured === undefined
    ? [...registry, ...conventional]
    : [configured, ...registry, ...conventional];
}

export async function executableExists(executable: string): Promise<boolean> {
  try {
    await access(executable, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function photoshopProcessRunning(): Promise<boolean> {
  try {
    const result = await execFileAsync(
      'tasklist.exe',
      ['/FI', 'IMAGENAME eq Photoshop.exe'],
      { windowsHide: true, maxBuffer: 256 * 1024 }
    );
    return /photoshop\.exe/i.test(result.stdout);
  } catch {
    return false;
  }
}
