import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runCreateLayer,
  runCreateTextLayer,
  runDeleteLayer,
  runFillLayer,
  runColorGradient,
  runListLayers,
  runMergeLayerDown,
  runSelectLayerByName,
} from './layer-operations.js';

type PropertyMap = Record<string, Record<string, unknown>>;

function schema(properties: PropertyMap = {}, required?: string[]) {
  return {
    type: 'object' as const,
    properties,
    ...(required ? { required } : {}),
  };
}

function layerTool(
  name: string,
  description: string,
  inputSchema: ReturnType<typeof schema>,
  handler: ToolDefinition['handler']
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

const createDescription = [
  'Create a new empty layer with explicit stack placement. By default it is placed above the layer that was active when the call started.',
  'Use when: user needs a blank layer for painting, fills, or stacking content.\nDo NOT use when: adding text — use photoshop_create_text_layer.',
  'Use above_layer_id or below_layer_id when exact ordering matters; provide at most one.',
  'Returns: created layer id/name/path, requested placement, actual stack index and adjacent layer ids.\nPreconditions: active document. Side effects: adds layer to history.',
].join('\n\n');

const textLayerDescription = [
  'Create a text layer with content, position, font size, and optional font.',
  'Use when: adding labels, titles, or typography to the design.\nDo NOT use when: editing existing text — use photoshop_update_text_content.',
  'Returns: layer name, text, position, fontSize, font (when fontName set), context.\nUse photoshop_list_fonts to discover font names; photoshop_set_text_font to change font later.\nPreconditions: active document. Side effects: adds text layer.',
].join('\n\n');

const listDescription = [
  'List all layers in the active document with kind, visibility, and opacity.',
  'Use when: choosing a layer to edit, debugging structure, or after organize_layers.\nDo NOT use when: only session summary is needed — use photoshop_get_state (lighter).',
  'Returns: layerCount, layers array, context.\nPreconditions: active document. Side effects: none.',
].join('\n\n');

const selectDescription = [
  'Select the active layer by exact name, including layers inside groups.',
  'Use when: a transform or property tool must target a named layer (photoshop_scale_layer, etc.).\nDo NOT use when: the layer is already active — check photoshop_get_state first.',
  'Returns: selected, layerName, kind, bounds (best-effort), context.\nFirst depth-first name match wins when duplicate names exist in different groups.\nPreconditions: active document. Side effects: changes active layer.',
].join('\n\n');

export function createLayerTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    layerTool('photoshop_create_layer', createDescription, schema({
      name: { type: 'string', description: 'Name for the new layer (optional)' },
      above_layer_id: { type: 'number', description: 'Place the new layer immediately above this stable layer id' },
      below_layer_id: { type: 'number', description: 'Place the new layer immediately below this stable layer id' },
    }), (args) => runCreateLayer(router, args)),

    layerTool(
      'photoshop_delete_layer',
      'Delete one exact layer. When layer_id is supplied, the tool targets that stable layer id and restores the previously active unrelated layer when possible. Use this for safe logical-layer discard.',
      schema({
        layer_id: {
          type: 'number', minimum: 1,
          description: 'Optional stable layer id to discard. If omitted, deletes the active layer for backward compatibility.',
        },
      }),
      (args) => runDeleteLayer(router, args)
    ),

    layerTool(
      'photoshop_merge_layer_down',
      'Merge one exact logical layer into one exact immediately-below sibling. Fails closed if the ids are not adjacent siblings, so unrelated layers cannot be collapsed accidentally.',
      schema({
        layer_id: { type: 'number', minimum: 1, description: 'Stable source layer id.' },
        target_layer_id: { type: 'number', minimum: 1, description: 'Stable immediately-below sibling layer id.' },
      }, ['layer_id', 'target_layer_id']),
      (args) => runMergeLayerDown(router, args)
    ),

    layerTool('photoshop_create_text_layer', textLayerDescription, schema({
      text: { type: 'string', description: 'Text content' },
      x: { type: 'number', description: 'X position in pixels (default: 100)', default: 100 },
      y: { type: 'number', description: 'Y position in pixels (default: 100)', default: 100 },
      fontSize: { type: 'number', description: 'Font size in points (default: 24)', default: 24 },
      fontName: { type: 'string', description: 'Optional font display or PostScript name (resolved via app.fonts; see photoshop_list_fonts)' },
    }, ['text']), (args) => runCreateTextLayer(router, args)),

    layerTool('photoshop_fill_layer', 'Fill the active layer with a color', schema({
      red: { type: 'number', description: 'Red component (0-255)', minimum: 0, maximum: 255 },
      green: { type: 'number', description: 'Green component (0-255)', minimum: 0, maximum: 255 },
      blue: { type: 'number', description: 'Blue component (0-255)', minimum: 0, maximum: 255 },
      layer_id: {
        type: 'number', minimum: 1,
        description: 'Optional stable target layer id. When supplied, the fill is pinned to that layer and the previously active layer is restored afterward.',
      },
    }, ['red', 'green', 'blue']), (args) => runFillLayer(router, args)),

    layerTool('photoshop_paint_color_gradient', 'Paint one continuous linear raster color/value field on an exact layer. This is pixel color, not a transparency mask gradient.', schema({
      layer_id: { type: 'number', minimum: 1, description: 'Stable target layer id.' },
      from: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], description: 'Gradient start in canvas pixels.' },
      to: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], description: 'Gradient end in canvas pixels.' },
      stops: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', properties: { position: { type: 'number', minimum: 0, maximum: 1 }, red: { type: 'number', minimum: 0, maximum: 255 }, green: { type: 'number', minimum: 0, maximum: 255 }, blue: { type: 'number', minimum: 0, maximum: 255 } }, required: ['position', 'red', 'green', 'blue'] }, description: '2–4 strictly ordered color stops; first=0, last=1.' },
    }, ['layer_id', 'from', 'to', 'stops']), (args) => runColorGradient(router, args)),

    layerTool('photoshop_get_layers', listDescription, schema(), () => runListLayers(router)),

    layerTool('photoshop_select_layer_by_name', selectDescription, schema({
      name: { type: 'string', description: 'Exact layer name (case-sensitive)' },
    }, ['name']), (args) => runSelectLayerByName(router, args)),
  ];
}
