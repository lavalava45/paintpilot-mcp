// Inspect the real built server without invoking Photoshop tools.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const client = new Client({ name: 'paintpilot-introspection-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: root,
  env: {
    ...process.env,
    PHOTOSHOP_GUARD_MODE: 'required',
    PHOTOSHOP_UXP_BRIDGE_PORT: '49352',
    LOG_LEVEL: '3',
  },
  stderr: 'pipe',
});
let stderr = '';
transport.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
const timeout = setTimeout(() => {
  console.error('MCP introspection timed out');
  void transport.close().finally(() => process.exit(1));
}, 30000);

try {
  await client.connect(transport);
  const server = client.getServerVersion();
  assert.equal(server?.name, 'photoshop-mcp-digital-painting');
  const { tools } = await client.listTools();
  assert(tools.length > 0);
  assert(tools.some(tool => tool.name === 'photoshop_guard_cycle_auto'));
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object', tool.name);
    assert(tool.description?.trim(), tool.name);
  }
  const { prompts } = await client.listPrompts();
  assert(prompts.length > 0);
  const prompt = await client.getPrompt({ name: prompts[0].name });
  assert(prompt.messages.length > 0);
  console.log(JSON.stringify({
    ok: true, platform: process.platform, node: process.version, server,
    tools: tools.length, prompts: prompts.length, photoshopToolsInvoked: 0,
  }));
} catch (error) {
  console.error(stderr);
  throw error;
} finally {
  clearTimeout(timeout);
  await client.close();
  await transport.close();
}
