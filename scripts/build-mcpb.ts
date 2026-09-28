/**
 * Build a Smithery / Claude Desktop MCPB bundle from the compiled server.
 *
 * Output: release/photoshop-mcp-digital-painting-<version>.mcpb
 * (zip archive with manifest.json + server/)
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

function packMcpb(outFile: string): void {
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
      `Compress-Archive -LiteralPath manifest.json,server -DestinationPath '${psZipFile}' -CompressionLevel Optimal`,
    ],
    { cwd: STAGING, stdio: 'inherit' },
  );
  renameSync(zipFile, outFile);
}

function main(): void {
  console.log('Building server…');
  run('npm run build');

  assertExists(join(ROOT, 'dist', 'index.js'), 'dist/index.js');

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Pkg;

  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(SERVER_DIR, { recursive: true });
  mkdirSync(RELEASE_DIR, { recursive: true });

  const manifest = JSON.parse(readFileSync(MANIFEST_SRC, 'utf8')) as Record<string, unknown>;
  manifest.version = pkg.version;
  writeFileSync(join(STAGING, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  cpSync(join(ROOT, 'dist'), join(SERVER_DIR, 'dist'), { recursive: true });
  cpSync(join(ROOT, 'uxp-plugin'), join(SERVER_DIR, 'uxp-plugin'), { recursive: true });
  copyFileSync(join(ROOT, 'LICENSE'), join(SERVER_DIR, 'LICENSE'));
  copyFileSync(join(ROOT, 'NOTICE'), join(SERVER_DIR, 'NOTICE'));

  const bundlePkg = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    type: pkg.type ?? 'module',
    main: 'dist/index.js',
    engines: pkg.engines ?? { node: '>=18.0.0' },
    dependencies: pkg.dependencies ?? {},
  };
  writeFileSync(join(SERVER_DIR, 'package.json'), JSON.stringify(bundlePkg, null, 2) + '\n');

  console.log('Installing production dependencies into bundle…');
  run('npm install --omit=dev --no-audit --no-fund', SERVER_DIR);

  const outFile = join(RELEASE_DIR, `photoshop-mcp-digital-painting-${pkg.version}.mcpb`);
  const stableFile = join(RELEASE_DIR, 'photoshop-mcp-digital-painting.mcpb');
  rmSync(outFile, { force: true });
  rmSync(stableFile, { force: true });

  console.log(`Packing ${outFile}…`);
  packMcpb(outFile);
  copyFileSync(outFile, stableFile);

  rmSync(STAGING, { recursive: true, force: true });
  console.log(`MCPB ready: ${outFile} (+ ${stableFile})`);
  console.log('Independent Digital Painting Edition bundle built for local/source distribution.');
}

main();
