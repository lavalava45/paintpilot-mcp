#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist', 'cos-plugin.js')],
  cwd: root,
  env: { ...process.env, LOG_LEVEL: '3' },
  stderr: 'pipe',
});
const client = new Client({ name: 'embedded-guard-mcp-acceptance', version: '1.0.0' });

function textBody(result) {
  const item = result.content?.find?.((entry) => entry.type === 'text' && typeof entry.text === 'string');
  assert.ok(item?.text, 'tool result must contain text JSON');
  return JSON.parse(item.text);
}

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  const guardTools = tools.filter((tool) => tool.name.startsWith('photoshop_guard_'));
  const exposureBytes = tools.reduce((total, tool) => total + Buffer.byteLength(JSON.stringify(tool)), 0);

  // Validate the *published* MCP catalog, not merely the internal Guard
  // compiler. Missing fields here can make a correct preflight impossible to
  // satisfy from an ordinary ChatGPT/COS tool call.
  const published = (name) => {
    const definition = tools.find((tool) => tool.name === name);
    assert.ok(definition, `missing published tool: ${name}`);
    return definition.inputSchema;
  };
  const sceneObjects = (plan) => plan?.properties?.objects?.items;
  for (const plan of [
    published('photoshop_guard_cycle_auto').properties?.next_pass?.properties?.scene_ownership_plan,
    published('photoshop_guard_keep_logical_layer').properties?.scene_ownership_plan,
  ]) {
    assert.ok(sceneObjects(plan)?.properties?.subject_kind, 'published scene ownership objects must expose subject_kind');
    assert.ok(sceneObjects(plan)?.required?.includes('subject_kind'), 'published scene ownership objects must require subject_kind');
    assert.ok(sceneObjects(plan)?.properties?.subject_kind?.enum?.includes('person'), 'person subject kind must be publicly expressible');
  }
  const nextPass = published('photoshop_guard_cycle_auto').properties?.next_pass?.properties;
  assert.ok(nextPass?.scene_camera_imaging_model, 'camera imaging model required by Guard must be publicly expressible');
  assert.ok(nextPass?.imaging_preflight, 'blur imaging preflight required by Guard must be publicly expressible');
  assert.ok(nextPass?.change_domains, 'change domains used by Guard must be publicly expressible');
  assert.ok(nextPass?.distribution_intent, 'spatial distribution intent must be publicly expressible');
  assert.ok(nextPass?.edges, 'edge intents must be publicly expressible');
  const cycle = published('photoshop_guard_cycle_auto');
  assert.ok(cycle.properties?.previous_observation?.properties?.edge_observations, 'edge observations must be publicly expressible');
  assert.ok(cycle.properties?.painting_intent?.properties?.deferred_from_operation_id,
    'deferred painting intent must be publicly expressible');
  const priorities = published('photoshop_guard_set_priorities');
  assert.ok(priorities.properties?.problems?.items?.properties?.depends_on_problem_ids,
    'problem dependency ordering must be publicly expressible');
  const directive = published('photoshop_guard_art_director').properties?.directive?.properties;
  assert.ok(directive?.refinement_check?.properties?.material_response,
    'successful refinement review must allow its required material response');
  assert.equal(directive?.composition_exploration?.properties?.hypotheses?.maxItems, undefined,
    'free composition mode must not be capped by unconditional public schema');

  // Guard-required publication intentionally hides raw mutating tools while
  // keeping their internal executors available behind the Guard facade.
  // Tool totals vary as safe read-only tools are added; check the required
  // catalog floor and the critical contracts rather than an obsolete total.
  assert.ok(tools.length >= 38, `unexpectedly small Guard-required catalog: ${tools.length}`);
  assert.ok(guardTools.length >= 15, `missing embedded Guard tools: ${guardTools.length}`);
  assert.ok(exposureBytes <= 250_000, `CoS schema budget exceeded: ${exposureBytes} > 250000`);

  const capabilities = textBody(await client.callTool({
    name: 'photoshop_guard_capabilities',
    arguments: {},
  }));
  assert.equal(capabilities.embedded, true);
  assert.equal(capabilities.mode, 'required');
  assert.equal(capabilities.raw_mutation_bypass_blocked, true);

  // Use an impossible document id on purpose. In required mode the public gate
  // must reject the raw mutation before any Photoshop/document validation runs.
  const blockedResult = await client.callTool({
    name: 'photoshop_fill_layer',
    arguments: { red: 1, green: 2, blue: 3, document_id: 2_147_483_647 },
  });
  const blocked = textBody(blockedResult);
  assert.equal(blockedResult.isError, true);
  assert.equal(blocked.code, 'guard_required');

  console.log(JSON.stringify({
    ok: true,
    tools: tools.length,
    guard_tools: guardTools.length,
    exposure_bytes: exposureBytes,
    cos_budget_bytes: 250_000,
    remaining_bytes: 250_000 - exposureBytes,
    raw_mutation_gate: blocked.code,
  }, null, 2));
  console.log('EMBEDDED_GUARD_MCP_ACCEPTANCE_OK; no Photoshop mutation executed');
} finally {
  await client.close().catch(() => undefined);
}
