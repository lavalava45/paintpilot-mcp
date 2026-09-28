import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = join(ROOT, 'src', 'tools');
const OUT = join(ROOT, 'docs', 'available-tools.md');
const GENERATED_START = '<!-- BEGIN GENERATED TOOL BACKEND INVENTORY -->';
const GENERATED_END = '<!-- END GENERATED TOOL BACKEND INVENTORY -->';

const PURE_NODE = new Set([
  'photoshop_ping',
  'photoshop_get_version',
  'photoshop_get_capabilities',
  'photoshop_get_painting_method_capabilities',
  'photoshop_select_painting_method',
  'photoshop_transform_landmarks',
  'photoshop_compare_landmarks',
]);

const AUTO_BENEFIT = new Set([
  'photoshop_execute_visual_microplan',
  'photoshop_analyze_value_structure',
  'photoshop_measure_points',
]);
const LEGACY = new Set();

const ALREADY_UXP = new Set([
  'photoshop_get_state',
  'photoshop_get_document_info',
  'photoshop_list_documents',
  'photoshop_get_selection_bounds',
  'photoshop_get_layers',
  'photoshop_list_brush_presets',
  'photoshop_get_brush_settings',
  'photoshop_get_preview',
  'photoshop_sample_color',
  'photoshop_sample_colors',
  'photoshop_get_history',
  'photoshop_select_brush_preset',
  'photoshop_set_brush',
  'photoshop_set_foreground_color',
  'photoshop_fill_layer',
  'photoshop_paint_color_gradient',
  'photoshop_paint_regions',
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_paint_stamp_instances',
  'photoshop_save_document',
  'photoshop_neural_filter',
  'photoshop_ingest_brush_pack',
  'photoshop_create_document',
  'photoshop_open_image',
  'photoshop_select_layer_by_name',
  'photoshop_create_layer',
  'photoshop_delete_layer',
  'photoshop_set_layer_opacity',
  'photoshop_set_layer_blend_mode',
  'photoshop_set_layer_visibility',
  'photoshop_set_layer_locked',
  'photoshop_rename_layer',
  'photoshop_duplicate_layer',
  'photoshop_move_layer_to_position',
  'photoshop_move_layer_to_top',
  'photoshop_move_layer_to_bottom',
  'photoshop_move_layer_up',
  'photoshop_move_layer_down',
  'photoshop_create_layer_mask',
  'photoshop_apply_gradient_mask',
  'photoshop_select_rectangle',
  'photoshop_select_ellipse',
  'photoshop_feather_selection',
  'photoshop_select_subject',
  'photoshop_undo',
  'photoshop_apply_layer_mask',
  'photoshop_close_document',
  'photoshop_content_aware_fill',
  'photoshop_contract_selection',
  'photoshop_create_clipping_mask',
  'photoshop_delete_layer_mask',
  'photoshop_deselect',
  'photoshop_expand_selection',
  'photoshop_fit_layer_to_document',
  'photoshop_flatten_image',
  'photoshop_invert_selection',
  'photoshop_merge_layer_down',
  'photoshop_merge_visible_layers',
  'photoshop_move_layer',
  'photoshop_release_clipping_mask',
  'photoshop_rotate_layer',
  'photoshop_save_selection',
  'photoshop_scale_layer',
  'photoshop_select_all',
  'photoshop_set_active_document',
  'photoshop_adjust_brightness_contrast',
  'photoshop_adjust_curves',
  'photoshop_adjust_exposure',
  'photoshop_adjust_hue_saturation',
  'photoshop_adjust_vibrance',
  'photoshop_apply_gaussian_blur',
  'photoshop_apply_gradient_map',
  'photoshop_apply_high_pass',
  'photoshop_apply_lut',
  'photoshop_apply_motion_blur',
  'photoshop_apply_noise',
  'photoshop_apply_photo_filter',
  'photoshop_apply_sharpen',
  'photoshop_apply_smart_blur',
  'photoshop_auto_contrast',
  'photoshop_auto_levels',
  'photoshop_desaturate',
  'photoshop_export_as',
  'photoshop_invert',
  'photoshop_list_fonts',
  'photoshop_set_text_alignment',
  'photoshop_set_text_color',
  'photoshop_set_text_font',
  'photoshop_update_text_content',
  'photoshop_add_guides',
  'photoshop_apply_layer_style',
  'photoshop_clear_guides',
  'photoshop_convert_to_smart_object',
  'photoshop_create_smart_object_via_copy',
  'photoshop_create_text_layer',
  'photoshop_crop_document',
  'photoshop_edit_smart_object_contents',
  'photoshop_image_stack',
  'photoshop_list_guides',
  'photoshop_place_image',
  'photoshop_rasterize_layer',
  'photoshop_redo',
  'photoshop_replace_smart_object_contents',
  'photoshop_resize_image',
  'photoshop_sky_replacement',
]);

const READ_ONLY = new Set([
  ...PURE_NODE,
  'photoshop_get_state',
  'photoshop_get_preview',
  'photoshop_get_document_info',
  'photoshop_list_documents',
  'photoshop_get_layers',
  'photoshop_get_selection_bounds',
  'photoshop_get_history',
  'photoshop_list_brush_presets',
  'photoshop_get_brush_settings',
  'photoshop_sample_color',
  'photoshop_sample_colors',
  'photoshop_list_fonts',
  'photoshop_list_guides',
  'photoshop_measure_points',
  'photoshop_analyze_value_structure',
  'photoshop_guard_capabilities',
  'photoshop_guard_status',
  'photoshop_guard_resume',
  'photoshop_guard_job_poll',
  'photoshop_guard_art_director',
]);

const HOT_P0 = new Set([
  'photoshop_get_state',
  'photoshop_get_preview',
  'photoshop_get_layers',
  'photoshop_list_documents',
  'photoshop_get_document_info',
  'photoshop_get_selection_bounds',
  'photoshop_list_brush_presets',
  'photoshop_get_brush_settings',
  'photoshop_set_brush',
  'photoshop_select_brush_preset',
  'photoshop_set_foreground_color',
  'photoshop_sample_color',
  'photoshop_sample_colors',
  'photoshop_paint_strokes',
  'photoshop_paint_dabs',
  'photoshop_paint_regions',
  'photoshop_fill_layer',
  'photoshop_paint_color_gradient',
]);

const COMMON_P1 = /(?:create_layer|delete_layer|rename_layer|duplicate_layer|set_layer_|select_layer|move_layer|merge_layer|merge_visible|flatten_image|selection|layer_mask|clipping_mask|fit_layer|scale_layer|rotate_layer)/;

function categoryFor(source, name) {
  if (name.startsWith('photoshop_recipe_')) return 'recipe';
  if (name.startsWith('photoshop_guard_')) return 'guard';
  const base = source.replaceAll('\\', '/').split('/').pop()?.replace(/-tools\.ts$/, '') ?? 'core';
  return base;
}

function primitiveGroup(source, name) {
  if (name.startsWith('photoshop_recipe_')) return 'recipe/orchestration';
  if (name.startsWith('photoshop_guard_')) return 'guard/orchestration';
  if (name === 'photoshop_execute_visual_microplan') return 'visual orchestration';
  if (name === 'photoshop_analyze_value_structure') return 'preview + Node luminance';
  if (name === 'photoshop_measure_points') return 'document.info + Node geometry';
  if (PURE_NODE.has(name)) return 'Node/session';
  if (name === 'photoshop_get_state') return 'state.read';
  if (name === 'photoshop_get_preview') return 'preview.read';
  if (name === 'photoshop_save_document') return 'document.save-copy';
  if (name === 'photoshop_neural_filter') return 'neural-filter';

  const base = categoryFor(source, name);
  const groups = {
    document: 'documents',
    layer: 'layers',
    'layer-properties': 'layers',
    'layer-ordering': 'layers',
    'layer-transform': 'layer transforms',
    selection: 'selections/masks',
    mask: 'selections/masks',
    painting: name.includes('brush') || name.includes('foreground') ? 'brush/config' : 'painting',
    'color-sampling': 'color sampling',
    adjustment: 'adjustments',
    'color-adjustment': 'adjustments',
    filter: 'filters',
    text: 'text',
    'smart-object': 'smart objects',
    image: 'document geometry',
    'image-placement': 'document open/place',
    history: 'history',
    export: 'export',
    action: 'actions',
    data: 'datasets',
    stack: 'image stack',
    style: 'layer styles',
    'sky-replacement': 'sky replacement',
    measurement: name.includes('guide') ? 'guides' : 'measurements',
    state: 'state',
  };
  return groups[base] ?? base;
}

function migrationClass(source, name) {
  if (name.startsWith('photoshop_recipe_') || AUTO_BENEFIT.has(name)) return 'B';
  if (name.startsWith('photoshop_guard_') || PURE_NODE.has(name)) return 'A';
  if (LEGACY.has(name)) return 'D';
  return 'C';
}

function currentTransport(source, name) {
  if (name.startsWith('photoshop_recipe_')) {
    return 'general MCP compatibility surface: upstream recipe implementation; canonical Guard painting lane: forbidden';
  }
  const cls = migrationClass(source, name);
  if (cls === 'A') return 'Node / Guard';
  if (cls === 'B') return 'Node orchestration → registered primitives';
  if (ALREADY_UXP.has(name)) return 'UXP only — fail closed';
  if (cls === 'D') return 'unavailable — legacy transport retired';
  return 'unavailable — UXP migration pending';
}

function priority(source, name) {
  if (name.startsWith('photoshop_recipe_')) return 'outside canonical painting lane';
  const cls = migrationClass(source, name);
  if (cls === 'A') return 'keep';
  if (cls === 'B') return 'inherit';
  if (cls === 'D') return 'retired/unavailable';
  if (ALREADY_UXP.has(name)) return 'done/retain';
  if (HOT_P0.has(name)) return 'P0';
  if (COMMON_P1.test(name)) return 'P1';
  if (
    source.includes('document-tools') ||
    source.includes('selection-tools') ||
    source.includes('mask-tools') ||
    source.includes('layer-transform-tools')
  ) return 'P1';
  if (
    source.includes('adjustment-tools') ||
    source.includes('color-adjustment-tools') ||
    source.includes('filter-tools') ||
    source.includes('text-tools') ||
    source.includes('export-tools')
  ) return 'P2';
  return 'P3';
}

function noteFor(source, name) {
  if (name === 'photoshop_get_state') return 'UXP state read via read-only batchPlay; public schema unchanged.';
  if (
    name === 'photoshop_get_document_info' ||
    name === 'photoshop_list_documents' ||
    name === 'photoshop_get_selection_bounds' ||
    name === 'photoshop_get_layers'
  ) return 'UXP document/layer/selection read cluster with public schema unchanged.';
  if (name === 'photoshop_list_brush_presets') {
    return 'UXP presetManager brush-preset read; no-focus behavior accepted.';
  }
  if (name === 'photoshop_get_brush_settings') {
    return 'UXP currentToolOptions brush-settings read; no-focus behavior accepted.';
  }
  if (name === 'photoshop_get_preview') {
    return 'UXP Imaging API preview read with accepted pixel/no-focus behavior.';
  }
  if (name === 'photoshop_sample_color' || name === 'photoshop_sample_colors') {
    return 'UXP Imaging API color sampling with accepted semantic/no-focus behavior.';
  }
  if (name === 'photoshop_get_history') {
    return 'UXP historyState read with accepted normalized semantics and no-focus behavior.';
  }
  if (name === 'photoshop_measure_points') {
    return 'Node geometry over document.info; no dedicated Photoshop measurement mutation is required.';
  }
  if (
    name === 'photoshop_select_brush_preset' ||
    name === 'photoshop_set_brush' ||
    name === 'photoshop_set_foreground_color'
  ) {
    return 'Brush/config mutation; production dispatch is UXP-only and fail-closed; no legacy replay path exists.';
  }
  if (name === 'photoshop_fill_layer') {
    return 'UXP fill mutation with accepted pixel, targeting, selection and history semantics.';
  }
  if (name === 'photoshop_paint_color_gradient') {
    return 'UXP linear raster-color gradient mutation with exact layer targeting and bounded color stops; distinct from mask gradients.';
  }
  if (name === 'photoshop_paint_regions') {
    return 'UXP compound-region mutation with accepted ADD/SUBTRACT geometry, cleanup and one-step history semantics.';
  }
  if (name === 'photoshop_paint_strokes') {
    return 'UXP stroke mutation with accepted caller style/color, targeting and one-step history semantics.';
  }
  if (name === 'photoshop_paint_dabs') {
    return 'UXP dab mutation preserving ordered adjacent style runs and one-step history semantics.';
  }
  if (name === 'photoshop_save_document') return 'Already intentionally UXP-only; preserve fail-closed persistence invariants.';
  if (name === 'photoshop_neural_filter') return 'Already UXP bridge; separate feature, not migration driver.';
  if (name === 'photoshop_ingest_brush_pack') return 'P0-E.1 Guard-routed ABR ingestion; UXP-only with durable command receipts and fail-closed capability reporting.';
  if (name === 'photoshop_set_active_document') return 'Explicit UI-activating document navigation; may foreground Photoshop and is excluded from no-focus acceptance traces. Never use implicit switching to satisfy document_id.';
  if (ALREADY_UXP.has(name)) return 'UXP-only production capability; preserve fail-closed semantics.';
  if (name.startsWith('photoshop_guard_')) return 'Guard remains transport-agnostic above backend routing.';
  if (name.startsWith('photoshop_recipe_')) {
    return 'Upstream compatibility workflow intentionally excluded from compact-v2 painting. Painter/Art Director must compose semantic primitives directly instead of invoking pre-baked recipes.';
  }
  if (name === 'photoshop_execute_visual_microplan') return 'Node-side orchestration; benefits from migrated underlying primitives/bundles.';
  if (name === 'photoshop_analyze_value_structure') return 'Node analysis; automatically benefits when preview migrates.';
  if (name === 'photoshop_get_preview') return 'High-value hot path; investigate UXP Imaging API.';
  if (name.startsWith('photoshop_paint_')) return 'High-value/high-risk; preserve caller order, batching, targeting and Guard preview barrier.';
  return '';
}

async function sourceFiles() {
  const files = [
    join(ROOT, 'src', 'core', 'server.ts'),
    join(ROOT, 'src', 'core', 'server-tool-catalog.ts'),
  ];
  for (const entry of await readdir(TOOLS, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('-tools.ts')) files.push(join(TOOLS, entry.name));
  }
  const recipesDir = join(TOOLS, 'recipes');
  try {
    for (const entry of await readdir(recipesDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts' && !entry.name.startsWith('_')) {
        files.push(join(recipesDir, entry.name));
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return files;
}

async function collectTools() {
  const found = new Map();
  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8');
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const consts = new Map();
    const factories = new Set(['cycleTool']);
    const propertyValue = (node, key) => {
      for (const item of node.properties) {
        if (!ts.isPropertyAssignment(item)) continue;
        const name = ts.isIdentifier(item.name) || ts.isStringLiteral(item.name) ? item.name.text : '';
        if (name === key) return item.initializer;
      }
      return undefined;
    };
    const literalString = (node) => {
      if (!node) return '';
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isIdentifier(node)) return consts.get(node.text) ?? '';
      return '';
    };
    const discover = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
          (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
        consts.set(node.name.text, node.initializer.text);
      }
      if (ts.isFunctionDeclaration(node) && node.name && node.type?.getText(ast).includes('ToolDefinition')) {
        factories.add(node.name.text);
      }
      ts.forEachChild(node, discover);
    };
    discover(ast);
    const collect = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const name = literalString(propertyValue(node, 'name'));
        if (name.startsWith('photoshop_') && propertyValue(node, 'description') && !found.has(name)) found.set(name, rel);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && factories.has(node.expression.text)) {
        const name = literalString(node.arguments[0]);
        if (name.startsWith('photoshop_') && !found.has(name)) found.set(name, rel);
      }
      ts.forEachChild(node, collect);
    };
    collect(ast);
  }
  return [...found.entries()]
    .map(([name, source]) => ({ name, source }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function esc(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const tools = await collectTools();
if (tools.length === 0) throw new Error('No registered public Photoshop tools were discovered.');

const counts = { A: 0, B: 0, C: 0, D: 0 };
for (const tool of tools) counts[migrationClass(tool.source, tool.name)]++;

const protocolSource = await readFile(join(ROOT, 'src', 'core', 'guard', 'protocol-version.ts'), 'utf8');
const bridgeRevision =
  protocolSource.match(/UXP_BRIDGE_REVISION\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? 'unknown';

function accessMode(name) {
  if (name.startsWith('photoshop_guard_')) return 'Guard façade';
  if (READ_ONLY.has(name)) return 'direct read/planning';
  return 'Guard-required mutation';
}

function readinessRequirement(source, name) {
  const cls = migrationClass(source, name);
  if (name.startsWith('photoshop_guard_')) return 'embedded Guard/runtime state';
  if (cls === 'A') return 'Node/session only';
  if (cls === 'B') return 'underlying primitive readiness';
  if (ALREADY_UXP.has(name)) return 'compatible UXP companion';
  if (cls === 'D') return 'unavailable';
  return 'UXP implementation required';
}

const lines = [
  GENERATED_START,
  '## Generated backend and access inventory',
  '',
  '> Generated by `npm run generate:tool-backend-inventory` from the current registered tool sources.',
  '> Do not hand-edit this section; edit the generator/classification inputs and regenerate it.',
  `> Current bridge revision: \`${bridgeRevision}\`. Production Photoshop semantic dispatch is UXP-only and fail-closed.`,
  '',
  'Classification:',
  '',
  '- **A** — Node / Guard / planning / pure geometry; no Photoshop backend migration required.',
  '- **B** — orchestration over registered primitives; does not directly own a Photoshop transport.',
  '- **C** — semantic Photoshop primitive implemented through the production UXP lane.',
  '- **D** — explicit retired/unavailable legacy capability.',
  '',
  `Current totals: **A=${counts.A}, B=${counts.B}, C=${counts.C}, D=${counts.D}** across **${tools.length} registered tools**.`,
  '',
  '| tool | source/category | access | primitive | transport | readiness | class | status | notes |',
  '|---|---|---|---|---|---|---:|---|---|',
];

for (const { name, source } of tools) {
  const row = [
    '`' + name + '`',
    '`' + source + '` / ' + categoryFor(source, name),
    accessMode(name),
    primitiveGroup(source, name),
    currentTransport(source, name),
    readinessRequirement(source, name),
    migrationClass(source, name),
    priority(source, name),
    noteFor(source, name),
  ].map(esc);
  lines.push(`| ${row.join(' | ')} |`);
}

const remainingNonUxp = tools.filter(({ name, source }) => {
  const cls = migrationClass(source, name);
  return cls === 'C' && !ALREADY_UXP.has(name);
});

for (const tier of ['P1', 'P2', 'P3']) {
  const names = remainingNonUxp
    .filter(({ name, source }) => priority(source, name) === tier)
    .map(({ name }) => `\`${name}\``);
  lines.push(
    '',
    `### Remaining non-UXP ${tier} catalog tools`,
    '',
    names.length ? names.map((name) => `- ${name}`).join('\n') : '- None.'
  );
}

lines.push(
  '',
  '### Migration completion invariant',
  '',
  '- Production semantic Photoshop dispatch is UXP-only and fail-closed.',
  '- P1/P2/P3 contain no registered class-C tool pending UXP migration.',
  '- Missing/stale companion readiness is a capability failure, not permission to route through COM/ExtendScript.',
  '- Node/Guard/orchestration tools remain backend-independent only to the extent shown in the table above.',
  '',
  '### Intentionally disabled / out of scope',
  '',
  'These names are not registered in the current runtime:',
  '',
  '- `photoshop_generative_fill`',
  '- `photoshop_generative_expand`',
  '- `photoshop_generative_remove`',
  '',
  GENERATED_END
);

const generated = lines.join('\n');
let document = await readFile(OUT, 'utf8');
const start = document.indexOf(GENERATED_START);
const end = document.indexOf(GENERATED_END);

if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) {
  throw new Error(`Malformed generated inventory markers in ${relative(ROOT, OUT)}`);
}

if (start >= 0) {
  const afterEnd = end + GENERATED_END.length;
  document = document.slice(0, start).trimEnd() + '\n\n' + generated + document.slice(afterEnd);
} else {
  document = document.trimEnd() + '\n\n' + generated + '\n';
}

await writeFile(OUT, document, 'utf8');
// eslint-disable-next-line no-undef
console.log(
  `Updated generated backend inventory in ${relative(ROOT, OUT)} with ${tools.length} registered tools; A=${counts.A}, B=${counts.B}, C=${counts.C}, D=${counts.D}`
);
