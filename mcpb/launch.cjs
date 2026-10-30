'use strict';

// Stable MCPB entry point. Keep the manifest name unchanged between versions
// so a supporting host may upgrade the same extension instead of adding one.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { syncUxp } = require('./uxp-sync.cjs');

function configure({ env = process.env, platform = process.platform, home = os.homedir(), bundle = __dirname } = {}) {
  if (platform !== 'win32') throw new Error('PaintPilot MCPB currently supports Windows only');
  const mode = env.PAINTPILOT_MODE?.trim() || 'tools';
  if (mode !== 'painting' && mode !== 'tools')
    throw new Error('PAINTPILOT_MODE must be exactly "painting" or "tools"');
  const dataHome = env.PAINTPILOT_DATA_HOME?.trim()
    || path.join(env.LOCALAPPDATA?.trim() || path.join(home, 'AppData', 'Local'), 'PaintPilot');
  if (!path.isAbsolute(dataHome)) throw new Error('PAINTPILOT_DATA_HOME must be absolute');
  const directories = {
    PHOTOSHOP_CONTROLLER_RUNTIME_DIR: 'controller',
    PHOTOSHOP_PREVIEW_BARRIER_DIR: 'preview-barriers',
    PHOTOSHOP_UXP_RECEIPT_DIR: 'uxp-command-receipts',
    PHOTOSHOP_BRUSH_PACK_RECORD_DIR: 'brush-packs',
  };
  fs.mkdirSync(dataHome, { recursive: true });
  if (!env.PAINTPILOT_RUNTIME_ROOT?.trim()) env.PAINTPILOT_RUNTIME_ROOT = dataHome;
  for (const [key, folder] of Object.entries(directories)) {
    // An explicit user override is respected, but never replaced by the
    // version-specific MCPB extraction directory.
    if (!env[key]?.trim()) env[key] = path.join(dataHome, folder);
  }
  if (!env.PHOTOSHOP_BACKEND_ROUTE_TRACE_FILE?.trim())
    env.PHOTOSHOP_BACKEND_ROUTE_TRACE_FILE = path.join(dataHome, 'backend-route.ndjson');
  if (!env.PAINTPILOT_PROCESS_VIDEO_TRACE_SETTINGS_FILE?.trim())
    env.PAINTPILOT_PROCESS_VIDEO_TRACE_SETTINGS_FILE = path.join(dataHome, 'process-video-trace-settings.json');
  env.PHOTOSHOP_GUARD_MODE = mode === 'painting' ? 'required' : 'off';
  return {
    mode,
    dataHome,
    entry: path.join(bundle, 'dist', mode === 'painting' ? 'painting-mode.js' : 'photoshop-tools.js'),
    uxp: path.join(bundle, 'uxp-plugin'),
  };
}

async function main() {
  const config = configure();
  const result = syncUxp({ source: config.uxp, dataHome: config.dataHome });
  if (result.updated) {
    console.error('[PaintPilot] UXP companion updated at ' + result.target);
    console.error('[PaintPilot] Reload the companion in Adobe UXP Developer Tool before editing Photoshop.');
  }
  // Useful for an explicit first-install/upgrade check without starting a
  // second MCP server or touching a Photoshop document.
  if (process.argv.includes('--sync-only')) return;
  await import(require('node:url').pathToFileURL(config.entry).href);
}

if (require.main === module) main().catch(error => {
  console.error('[PaintPilot MCPB] ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

module.exports = { configure, main };
