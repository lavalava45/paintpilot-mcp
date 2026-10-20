/**
 * Build one PaintPilot Windows release with two independent operation modes,
 * plus an optional direct-tools MCPB for compatible clients.
 *
 * Output: release/photoshop-mcp-digital-painting-<version>.mcpb
 * (MCPB: manifest.json + server/; Windows ZIP: server/ + installation notes)
 * Run: npm run build:mcpb
 */
import { execFileSync, execSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = join(ROOT, '.mcpb-staging');
const SERVER_DIR = join(STAGING, 'server');
const MANIFEST_SRC = join(ROOT, 'mcpb', 'manifest.json');
const RELEASE_DIR = join(ROOT, 'release');

type Pkg = {
  name: string;
  version: string;
  type?: string;
  main?: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
};

function run(cmd: string, cwd = ROOT): void {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function assertExists(path: string, label: string): void {
  try {
    readFileSync(path);
  } catch {
    throw new Error(`${label} not found at ${path}. Run npm run build first.`);
  }
}

function packArchive(outFile: string, entries: string[]): void {
  if (process.platform !== 'win32') {
    throw new Error(`Windows-only build: unsupported host platform ${process.platform}`);
  }
  const zipFile = `${outFile}.zip`;
  rmSync(zipFile, { force: true });
  const psZipFile = zipFile.replaceAll("'", "''");
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -LiteralPath ${entries.map(entry => `'${entry.replaceAll("'", "''")}'`).join(',')} -DestinationPath '${psZipFile}' -CompressionLevel Optimal`,
    ],
    { cwd: STAGING, stdio: 'inherit' },
  );
  renameSync(zipFile, outFile);
}

function main(): void {
  run('npm run verify:third-party-notices');
  console.log('Building server…');
  run('npm run build');

  for (const entry of ['dist/index.js', 'dist/painting-mode.js', 'dist/photoshop-tools.js'])
    assertExists(join(ROOT, entry), entry);

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Pkg;
  const attribution = JSON.parse(readFileSync(join(ROOT, 'third-party-components.json'), 'utf8')) as {
    components: Array<{ package: string; version: string }>;
  };

  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(SERVER_DIR, { recursive: true });
  mkdirSync(RELEASE_DIR, { recursive: true });

  const manifest = JSON.parse(readFileSync(MANIFEST_SRC, 'utf8')) as Record<string, unknown>;
  manifest.version = pkg.version;
  writeFileSync(join(STAGING, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  cpSync(join(ROOT, 'dist'), join(SERVER_DIR, 'dist'), { recursive: true });
  // Retain the previous local integration alias in the source repository for
  // existing deployments, but publish only neutral PaintPilot mode names.
  for (const extension of ['.js', '.js.map', '.d.ts', '.d.ts.map']) {
    rmSync(join(SERVER_DIR, 'dist', `cos-plugin${extension}`), { force: true });
  }
  cpSync(join(ROOT, 'uxp-plugin'), join(SERVER_DIR, 'uxp-plugin'), { recursive: true });
  copyFileSync(join(ROOT, 'LICENSE'), join(SERVER_DIR, 'LICENSE'));
  copyFileSync(join(ROOT, 'NOTICE'), join(SERVER_DIR, 'NOTICE'));
  copyFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), join(SERVER_DIR, 'THIRD_PARTY_NOTICES.md'));
  copyFileSync(join(ROOT, 'third-party-components.json'), join(SERVER_DIR, 'third-party-components.json'));
  cpSync(join(ROOT, 'licenses'), join(SERVER_DIR, 'licenses'), { recursive: true });

  const bundlePkg = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    type: pkg.type ?? 'module',
    main: 'dist/index.js',
    engines: pkg.engines ?? { node: '>=18.0.0' },
    // Registry is checked against the installed tree/lockfile above. Do not resolve newer
    // dependencies into a bundle whose shipped attribution describes older versions.
    dependencies: Object.fromEntries(attribution.components.map(c => [c.package, c.version])),
  };
  writeFileSync(join(SERVER_DIR, 'package.json'), JSON.stringify(bundlePkg, null, 2) + '\n');

  console.log('Installing production dependencies into bundle…');
  run('npm install --omit=dev --no-audit --no-fund', SERVER_DIR);

  const outFile = join(RELEASE_DIR, `photoshop-mcp-digital-painting-${pkg.version}.mcpb`);
  const windowsZip = join(RELEASE_DIR, `paintpilot-windows-${pkg.version}.zip`);
  const stableFile = join(RELEASE_DIR, 'photoshop-mcp-digital-painting.mcpb');
  rmSync(outFile, { force: true });
  rmSync(stableFile, { force: true });
  rmSync(windowsZip, { force: true });

  console.log(`Packing ${outFile}…`);
  packArchive(outFile, ['manifest.json', 'server']);
  copyFileSync(outFile, stableFile);

  copyFileSync(join(ROOT, 'docs', 'RELEASE-INSTALL.md'), join(STAGING, 'INSTALL.md'));
  copyFileSync(join(ROOT, 'docs', 'DEVELOPER-PREVIEW-RELEASE-NOTES.md'), join(STAGING, 'RELEASE-NOTES.md'));
  console.log(`Packing both-mode Windows ZIP ${windowsZip}…`);
  packArchive(windowsZip, ['server', 'INSTALL.md', 'RELEASE-NOTES.md']);

  rmSync(STAGING, { recursive: true, force: true });
  console.log(`PaintPilot Windows ZIP ready (Painting Mode + Photoshop Tools): ${windowsZip}`);
  console.log(`Optional direct-tools MCPB ready: ${outFile} (+ ${stableFile})`);
  console.log('Independent Digital Painting Edition bundle built for local/source distribution.');
}

main();
