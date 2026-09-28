import { readFileSync } from 'node:fs';

let cachedVersion: string | undefined;

export function getAppVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;

  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version?: unknown;
    };
    cachedVersion = typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }

  return cachedVersion;
}
