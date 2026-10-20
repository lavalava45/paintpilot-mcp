#!/usr/bin/env node

/** Verify the *extracted* customer installation without touching Photoshop. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const extractedServer = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(join(extractedServer, 'dist', 'painting-mode.js'))
  || !existsSync(join(extractedServer, 'dist', 'photoshop-tools.js')))
  throw new Error('Usage: node scripts/verify-release-modes.mjs <extracted ZIP/server directory>');

const temp = mkdtempSync(join(tmpdir(), 'paintpilot-release-mcp-'));
try {
  for (const mode of ['painting', 'tools']) {
    const entry = mode === 'painting' ? 'painting-mode.js' : 'photoshop-tools.js';
    const env = {
      ...process.env,
      PHOTOSHOP_GUARD_MODE: mode === 'painting' ? 'off' : 'required',
      PHOTOSHOP_CONTROLLER_RUNTIME_DIR: join(temp, `${mode}-journal`),
      PHOTOSHOP_PREVIEW_BARRIER_DIR: join(temp, `${mode}-barriers`),
      PHOTOSHOP_UXP_RECEIPT_DIR: join(temp, `${mode}-receipts`),
      PHOTOSHOP_UXP_BRIDGE_PORT: '0',
      LOG_LEVEL: '3',
    };
    for (const variable of ['COS_HOST_STOP_ENDPOINT', 'COS_HOST_STOP_KEY',
      'PHOTOSHOP_COS_HOST_STOP_REQUIRED']) delete env[variable];
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(extractedServer, 'dist', entry)],
      cwd: extractedServer,
      env,
      stderr: 'pipe',
    });
    const client = new Client({name: 'paintpilot-release-mode-smoke', version: '1.0.0'});
    try {
      await client.connect(transport);
      const {tools} = await client.listTools();
      const {prompts} = await client.listPrompts();
      assert.equal(prompts.length, 5);
      const guards = tools.filter(tool => tool.name.startsWith('photoshop_guard_'));
      assert.equal(guards.length, 16);
      assert.ok(tools.some(tool => tool.name === 'photoshop_guard_cycle_auto'));
      if (mode === 'painting') {
        assert.ok(tools.length >= 38 && tools.length < 135,
          'Painting Mode publishes a bounded safe catalog');
      } else {
        assert.equal(tools.length, 135);
        assert.ok(tools.some(tool => tool.name === 'photoshop_fill_layer'));
      }
      const response = await client.callTool({
        name: 'photoshop_guard_capabilities', arguments: {},
      });
      const json = response.content?.find(row => row.type === 'text')?.text;
      assert.equal(typeof json, 'string');
      const capabilities = JSON.parse(json);
      assert.equal(capabilities.mode, mode === 'painting' ? 'required' : 'off');
      assert.equal(capabilities.raw_mutation_bypass_blocked, mode === 'painting');
      if (mode === 'painting') {
        // One impossible document ID proves the raw mutation is refused by
        // the public guard gate before any native dispatch or document read.
        const blocked = await client.callTool({
          name: 'photoshop_fill_layer',
          arguments: {document_id: 2147483647, red: 1, green: 2, blue: 3},
        });
        assert.equal(blocked.isError, true);
        const detail = blocked.content?.find(row => row.type === 'text')?.text;
        assert.equal(JSON.parse(detail).code, 'guard_required');
      }
      console.log(`PASS ${mode}: tools=${tools.length}, guard=${guards.length}, prompts=${prompts.length}, raw_blocked=${capabilities.raw_mutation_bypass_blocked}`);
    } finally {
      await client.close().catch(() => undefined);
    }
  }
  console.log('PAINTPILOT_RELEASE_MODES_PASS — no Photoshop mutations');
} finally {
  rmSync(temp, {recursive:true, force:true});
}
