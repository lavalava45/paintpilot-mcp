/**
 * Verifies the project-owned Photoshop prompt surface:
 *   - legacy recipe prompts/tools are absent;
 *   - five guide prompts remain registered;
 *   - state/Guard/sticky-route instructions remain covered.
 *
 * Run: npm run verify:photoshop-prompts
 */
import assert from 'node:assert/strict';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { PromptRegistry } from '../src/core/prompt-registry.js';
import { registerPhotoshopPrompts } from '../src/prompts/registry.js';
import { PHOTOSHOP_PROMPT_TEMPLATES, PHOTOSHOP_GUIDE_PROMPT_NAMES } from '../src/prompts/registry.js';
import { buildPhotoshopInstructions } from '../src/prompts/instructions.js';
import { createStateTools } from '../src/tools/state-tools.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { Session } from '../src/core/session.js';
import { wrapToolHandler } from '../src/errors/envelope.js';

const session = new Session();
const connection = session.getConnection();

const toolRegistry = new ToolRegistry();
const promptRegistry = new PromptRegistry();
const guardTools = createGuardTools({} as never);

registerPhotoshopPrompts(promptRegistry);

for (const def of createStateTools(connection)) {
  toolRegistry.register(def.tool.name, {
    tool: def.tool,
    handler: wrapToolHandler(def.tool.name, def.handler),
  });
}

console.log(`Registered ${toolRegistry.count()} tools and ${promptRegistry.count()} prompts.`);

const promptNames = new Set(PHOTOSHOP_PROMPT_TEMPLATES.map((p) => p.name));
const guidePromptNames = new Set<string>(PHOTOSHOP_GUIDE_PROMPT_NAMES);

assert.equal(PHOTOSHOP_GUIDE_PROMPT_NAMES.length, 5);
assert.equal(PHOTOSHOP_PROMPT_TEMPLATES.length, 5);
for (const removed of ['ps.generative_fill', 'ps.generative_remove', 'ps.generative_expand']) {
  assert.ok(!promptNames.has(removed), `Removed prompt ${removed} must not be registered.`);
}

for (const template of PHOTOSHOP_PROMPT_TEMPLATES) {
  assert.ok(guidePromptNames.has(template.name), `Unexpected non-guide prompt ${template.name} remains registered.`);
  assert.ok(
    promptRegistry.has(template.name),
    `Guide prompt template ${template.name} is missing from the registry.`
  );
}

for (const guideName of PHOTOSHOP_GUIDE_PROMPT_NAMES) {
  assert.ok(promptNames.has(guideName), `Guide prompt ${guideName} must be registered.`);
}

for (const required of [
  'photoshop_get_state',
  'photoshop_get_preview',
  'photoshop_get_capabilities',
]) {
  assert.ok(toolRegistry.has(required), `${required} must be registered.`);
}

const instructions = buildPhotoshopInstructions();
assert.ok(instructions.length > 200, 'Photoshop instructions should be substantial.');
for (const marker of [
  'photoshop_ping',
  'photoshop_get_state',
  'photoshop_get_capabilities',
  'suggested_next_tool',
  'User intent glossary',
  'ps.gradient_blend',
  'Degrade paths',
  'photoshop_adjust_curves',
  'photoshop_sky_replacement',
  'photoshop_neural_filter',
  'ps.digital_painting_control',
]) {
  assert.ok(
    instructions.includes(marker),
    `Photoshop instructions should mention "${marker}".`
  );
}

const stickyRouteMarkers = [
  'STICKY PHOTOSHOP ROUTE',
  'current local Adobe Photoshop document',
  'never authorize switching to built-in',
  'explicitly asks',
  'photoshop_guard_status',
  'photoshop_guard_resume',
  'connector or',
  'availability failure',
  'do not silently substitute another image engine',
  'never replay a successful mutation',
];
const normalizedInstructions = instructions.replace(/\s+/g, ' ');
for (const marker of stickyRouteMarkers) {
  assert.ok(
    normalizedInstructions.includes(marker),
    `Photoshop initialize instructions should include sticky-route marker "${marker}".`
  );
}

const routingRegressionCases = [
  { sample: 'продолжи изображение', markers: ['continue', 'изображение'] },
  { sample: 'дорисуй фон', markers: ['дорисуй'] },
  { sample: 'улучши картинку', markers: ['улучши картинку'] },
  { sample: 'нарисуй здесь', markers: ['нарисуй'] },
  { sample: 'сделай изображение более реалистичным', markers: ['изображение', 'improve'] },
  { sample: 'дальше', markers: ['дальше', 'continue'] },
  { sample: 'continue painting this image', markers: ['continue', 'painting', 'image'] },
  { sample: 'improve the artwork', markers: ['improve', 'artwork'] },
  { sample: 'draw here', markers: ['draw'] },
  { sample: 'make this image more realistic', markers: ['image', 'improve'] },
] as const;

for (const { sample, markers } of routingRegressionCases) {
  for (const marker of markers) {
    assert.ok(
      normalizedInstructions.toLowerCase().includes(marker.toLowerCase()),
      `Routing regression case "${sample}" is not represented in the host-visible route contract: missing "${marker}".`
    );
  }
  assert.ok(
    normalizedInstructions.includes('current local Adobe Photoshop document'),
    `Routing regression case "${sample}" must stay bound to the current local Photoshop document.`
  );
}

const guardDescriptions = new Map(
  guardTools.map((definition) => [definition.tool.name, definition.tool.description ?? ''])
);
for (const [toolName, markers] of [
  ['photoshop_guard_cycle_auto', ['local Photoshop', 'explicitly changes execution mode']],
  ['photoshop_guard_status', ['established local Photoshop workflow', 'route is unavailable', 'never replay']],
  ['photoshop_guard_resume', ['local Photoshop workflow', 'without replaying', 'explicitly changes execution mode']],
] as const) {
  const description = guardDescriptions.get(toolName) ?? '';
  for (const marker of markers) {
    assert.ok(
      description.includes(marker),
      `${toolName} description should include sticky-route marker "${marker}".`
    );
  }
}

console.log(
  `OK: legacy recipe tools/prompts absent, ${PHOTOSHOP_GUIDE_PROMPT_NAMES.length} guide prompts registered, ` +
    `${PHOTOSHOP_PROMPT_TEMPLATES.length} total prompts, ` +
    `state/preview/capabilities tools registered, sticky-route instructions and Guard metadata are covered.`
);
