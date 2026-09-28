/**
 * Local smoke test: spawn photoshop-mcp via stdio and exercise the prompt layer.
 * Run: npx tsx scripts/test-mcp-local.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function ok(label: string, detail?: string): void {
  console.log(`  OK  ${label}${detail ? `: ${detail}` : ''}`);
}

function fail(label: string, detail?: string): never {
  console.error(`  FAIL ${label}${detail ? `: ${detail}` : ''}`);
  process.exit(1);
}

function textFromToolResult(result: {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): string {
  const parts = (result.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!);
  return parts.join('\n');
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', join(ROOT, 'src/index.ts')],
    env: {
      ...process.env,
      LOG_LEVEL: '0',
    },
    stderr: 'pipe',
    cwd: ROOT,
  });

  const client = new Client({ name: 'local-mcp-test', version: '1.0.0' });

  section('Connect');
  await client.connect(transport);
  ok('stdio connected');

  const version = client.getServerVersion();
  if (!version?.name?.includes('photoshop')) {
    fail('server identity', JSON.stringify(version));
  }
  ok('server', `${version!.name} v${version!.version}`);

  const instructions = client.getInstructions() ?? '';
  if (instructions.length < 200) fail('instructions length', String(instructions.length));
  for (const marker of ['photoshop_get_state', 'ps.digital_painting_control', 'suggested_next_tool']) {
    if (!instructions.includes(marker)) fail('instructions marker', marker);
  }
  ok('instructions', `${instructions.length} chars, contract markers present`);

  section('List prompts');
  const { prompts } = await client.listPrompts();
  const promptNames = prompts.map((p) => p.name).sort();
  const expectedGuidePrompts = [
    'ps.color_correct',
    'ps.composite_blend',
    'ps.dodge_burn_guide',
    'ps.gradient_blend',
    'ps.digital_painting_control',
  ];
  const expectedPromptCount = expectedGuidePrompts.length;
  if (promptNames.length !== expectedPromptCount) fail('prompt count', String(promptNames.length));
  for (const name of expectedGuidePrompts) {
    if (!promptNames.includes(name)) fail('missing prompt', name);
  }
  for (const removed of ['ps.generative_fill', 'ps.generative_remove', 'ps.generative_expand']) {
    if (promptNames.includes(removed)) fail('removed prompt still exposed', removed);
  }
  ok(`${expectedPromptCount} guide prompt templates`, 'legacy recipe prompts absent');

  section('Get prompt (ps.gradient_blend)');
  const promptResult = await client.getPrompt({
    name: 'ps.gradient_blend',
    arguments: { direction: 'bottom_to_top', start_pct: '10', end_pct: '90' },
  });
  const promptText = promptResult.messages
    .map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
  if (!promptText.includes('photoshop_apply_gradient_mask')) {
    fail('prompt content', 'missing semantic gradient-mask reference');
  }
  ok('ps.gradient_blend', `${promptText.length} chars`);

  section('List tools (new layer)');
  const { tools } = await client.listTools();
  const toolNames = new Set(tools.map((t) => t.name));
  const required = [
    'photoshop_get_state',
    'photoshop_get_preview',
    'photoshop_get_capabilities',
    'photoshop_sky_replacement',
    'photoshop_neural_filter',
    'photoshop_apply_layer_style',
    'photoshop_apply_lut',
    'photoshop_adjust_vibrance',
    'photoshop_adjust_exposure',
    'photoshop_apply_photo_filter',
    'photoshop_apply_gradient_map',
    'photoshop_image_stack',
    'photoshop_export_as',
  ];
  for (const name of required) {
    if (!toolNames.has(name)) fail('missing tool', name);
  }
  for (const removed of [
    ...[...toolNames].filter((name) => name.startsWith('photoshop_recipe_')),
    'photoshop_generative_fill',
    'photoshop_generative_remove',
    'photoshop_generative_expand',
    'photoshop_generative_upscale',
    'photoshop_generate_image',
  ]) {
    if (toolNames.has(removed)) fail('removed tool still exposed', removed);
  }
  ok('semantic + state tools registered', `${required.length} checked`);

  section('Call photoshop_ping');
  const ping = await client.callTool({ name: 'photoshop_ping', arguments: {} });
  const pingText = textFromToolResult(ping);
  const photoshopReachable = pingText.toLowerCase().includes('successfully connected');
  ok('photoshop_ping', pingText.trim());

  section('Call photoshop_get_capabilities');
  const caps = await client.callTool({ name: 'photoshop_get_capabilities', arguments: {} });
  const capsText = textFromToolResult(caps);
  let capsJson: Record<string, unknown> = {};
  if (caps.isError) {
    if (!photoshopReachable) {
      console.log('  SKIP get_capabilities — Photoshop not reachable');
    } else {
      fail('get_capabilities', capsText);
    }
  } else {
    try {
      capsJson = JSON.parse(capsText) as Record<string, unknown>;
    } catch {
      fail('get_capabilities JSON', capsText.slice(0, 200));
    }
    ok('get_capabilities', `version=${String(capsJson.version ?? 'unknown')}`);
  }

  if (photoshopReachable) {
    section('Call photoshop_get_state');
    const state = await client.callTool({ name: 'photoshop_get_state', arguments: {} });
    const stateText = textFromToolResult(state);
    let hasDocument = false;
    if (state.isError) {
      console.log(`  WARN get_state returned error (document may be in odd state): ${stateText.slice(0, 200)}`);
    } else {
      const stateJson = JSON.parse(stateText) as { hasDocument?: boolean };
      hasDocument = stateJson.hasDocument === true;
      ok('get_state', `hasDocument=${String(hasDocument)}`);
    }

    if (!hasDocument) console.log('  SKIP active-document semantic smoke — no active document in Photoshop');
  } else {
    console.log('  SKIP Photoshop-dependent calls — Photoshop not reachable');
  }

  await transport.close();
  console.log('\nAll local MCP smoke checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
