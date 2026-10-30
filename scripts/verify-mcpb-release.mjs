#!/usr/bin/env node
/** Read-only smoke for a separately EXTRACTED PaintPilot MCPB (no Photoshop edits). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = process.argv[2] && path.resolve(process.argv[2]);
if (!root || !fs.existsSync(path.join(root, 'manifest.json')))
  throw new Error('Usage: node scripts/verify-mcpb-release.mjs <extracted-mcpb-directory>');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.name, 'photoshop-mcp-digital-painting');
assert.equal(manifest.server.entry_point, 'server/launch.cjs');
assert.equal(manifest.user_config.mode.default, 'tools');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-mcpb-smoke-'));
const dataHome = path.join(home, 'stable-user-data');
const script = path.join(root, 'server', 'launch.cjs');
try {
  for (const mode of ['tools', 'painting']) {
    const env = {
      ...process.env,
      PAINTPILOT_MODE: mode,
      PAINTPILOT_DATA_HOME: dataHome,
      LOG_LEVEL: '3',
      PHOTOSHOP_UXP_BRIDGE_PORT: '0',
    };
    for (const variable of ['COS_HOST_STOP_ENDPOINT', 'COS_HOST_STOP_KEY',
      'PHOTOSHOP_COS_HOST_STOP_REQUIRED', 'PAINTPILOT_RUNTIME_ROOT',
      'PHOTOSHOP_CONTROLLER_RUNTIME_DIR', 'PHOTOSHOP_PREVIEW_BARRIER_DIR',
      'PHOTOSHOP_UXP_RECEIPT_DIR', 'PHOTOSHOP_BRUSH_PACK_RECORD_DIR',
      'PHOTOSHOP_BACKEND_ROUTE_TRACE_FILE', 'PAINTPILOT_PROCESS_VIDEO_TRACE_SETTINGS_FILE'])
      delete env[variable];
    const transport = new StdioClientTransport({
      command: process.execPath, args: [script], cwd: root,
      env, stderr: 'pipe',
    });
    const client = new Client({name:'paintpilot-mcpb-extracted-smoke', version:'1.0.0'});
    try {
      await client.connect(transport);
      const {tools} = await client.listTools();
      const {prompts} = await client.listPrompts();
      assert.equal(prompts.length, 5);
      assert.equal(tools.length, mode === 'tools' ? 135 : 39);
      const response = await client.callTool({name:'photoshop_guard_capabilities',arguments:{}});
      const body = JSON.parse(response.content.find(x=>x.type==='text').text);
      assert.equal(body.mode, mode === 'tools' ? 'off' : 'required');
      assert.equal(body.raw_mutation_bypass_blocked, mode === 'painting');
      console.log(`MCPB_SMOKE_PASS ${mode} tools=${tools.length} prompts=${prompts.length}`);
    } finally {
      await client.close().catch(()=>{});
    }
  }
  const stable = path.join(dataHome, 'uxp-plugin', 'manifest.json');
  assert.ok(fs.existsSync(stable), 'UXP companion must be deployed to stable user directory');
  const runtime = path.join(dataHome, 'controller');
  assert.ok(fs.existsSync(runtime), 'Writable Guard state must live outside version directory');
  console.log('MCPB_STABLE_UPGRADE_PATH_PASS ' + dataHome);
} finally {
  fs.rmSync(home, {recursive:true,force:true});
}
