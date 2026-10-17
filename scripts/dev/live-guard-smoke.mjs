/**
 * Real UXP/Photoshop MCP smoke runner when the COS plugin lifecycle is stuck.
 * Uses the installed MCP SDK and PaintPilot's public tools, never the UXP bridge
 * directly. No fake Photoshop, mocked tool registry, or Guard bypass.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const name = process.argv[2] || 'photoshop_ping';
const argsFile = process.argv[3];
const args = argsFile ? JSON.parse(readFileSync(argsFile, 'utf8')) : {};
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist', 'cos-plugin.js')],
  cwd: root,
  env: process.env,
  stderr: 'pipe',
});
const client = new Client({ name: 'live-paintpilot-smoke', version: '1.0.0' }, { capabilities: {} });
const outputDir = path.join(root, '.photoshop-runtime', 'live-smoke');
mkdirSync(outputDir, { recursive: true });
try {
  await client.connect(transport, { timeout: 30_000 });
  const result = await client.callTool({ name, arguments: args }, undefined, {
    timeout: 90_000, maxTotalTimeout: 90_000,
  });
  const summary = [];
  for (const content of result.content ?? []) {
    if (content.type === 'image') {
      const file = path.join(outputDir, `${name}-${Date.now()}.jpg`);
      writeFileSync(file, Buffer.from(content.data, 'base64'));
      summary.push({ type: 'image', file, mimeType: content.mimeType });
    } else if (content.type === 'text') {
      let json;
      try { json = JSON.parse(content.text); } catch { json = content.text; }
      summary.push({ type: 'text', json });
    }
  }
  writeFileSync(path.join(outputDir, 'last-result.json'), JSON.stringify({
    tool: name, argsFile, isError: result.isError ?? false, content: summary,
  }, null, 2));
  console.log(JSON.stringify({ tool: name, isError: result.isError ?? false,
    content: summary.map(item => item.type === 'image' ? item : {
      type: 'text', json: {
        ok: item.json?.ok, mode: item.json?.mode,
        execution: item.json?.execution,
        closed_previous: item.json?.closed_previous,
        preflight_rejection: item.json?.preflight_rejection && {
          error_codes: item.json.preflight_rejection.error_codes,
          errors: item.json.preflight_rejection.errors,
        },
        next_state: item.json?.next_state,
        summary: item.json?.summary,
        details: item.json?.details,
        delivery: item.json?.delivery && { delivered: item.json.delivery.delivered },
      },
    }) }));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
