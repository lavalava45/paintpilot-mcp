import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { LAYER_BLEND_MODE_ENUM } from './blend-mode.js';
import {
  runDuplicateLayer,
  runFlattenImage,
  runMergeVisibleLayers,
  runRasterizeLayer,
  runRenameLayer,
  runSetLayerBlendMode,
  runSetLayerLocked,
  runSetLayerOpacity,
  runSetLayerVisibility,
} from './layer-property-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function define(
  name: string,
  description: string,
  properties: Fields,
  required: string[] | undefined,
  handler: ToolDefinition['handler']
): ToolDefinition {
  return {
    tool: {
      name,
      description,
      inputSchema: { type: 'object', properties, ...(required ? { required } : {}) },
    },
    handler,
  };
}

const noFields: Fields = {};

export function createLayerPropertiesTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    define(
      'photoshop_rasterize_layer',
      'Rasterize the active layer (convert text/smart object to normal layer)',
      noFields, undefined,
      (args) => runRasterizeLayer(router, args)
    ),
    define(
      'photoshop_set_layer_opacity', 'Set the opacity of the active layer',
      { opacity: { type: 'number', description: 'Opacity value (0-100)', minimum: 0, maximum: 100 } },
      ['opacity'], (args) => runSetLayerOpacity(router, args)
    ),
    define(
      'photoshop_set_layer_blend_mode',
      'Set the blend mode of the active layer.\n\n`COLOR` is the Photoshop UI name (Colorize); it is mapped to ExtendScript `BlendMode.COLORBLEND`.',
      {
        blendMode: {
          type: 'string',
          description: 'Blend mode (Photoshop UI name). COLOR maps to BlendMode.COLORBLEND. DARKERCOLOR / LIGHTERCOLOR use Action Manager if the DOM enum is missing.',
          enum: [...LAYER_BLEND_MODE_ENUM],
        },
      },
      ['blendMode'], (args) => runSetLayerBlendMode(router, args)
    ),
    define(
      'photoshop_set_layer_visibility', 'Show or hide the active layer',
      { visible: { type: 'boolean', description: 'Whether the layer should be visible' } },
      ['visible'], (args) => runSetLayerVisibility(router, args)
    ),
    define(
      'photoshop_set_layer_locked', 'Lock or unlock the active layer',
      { locked: { type: 'boolean', description: 'Whether the layer should be locked' } },
      ['locked'], (args) => runSetLayerLocked(router, args)
    ),
    define(
      'photoshop_rename_layer', 'Rename the active layer',
      { name: { type: 'string', description: 'New name for the layer' } },
      ['name'], (args) => runRenameLayer(router, args)
    ),
    define(
      'photoshop_duplicate_layer',
      'Duplicate the active layer. The duplicate becomes the active layer; returns its name and, when available, its layer id.',
      { newName: { type: 'string', description: 'Name for the duplicated layer (optional)' } },
      undefined, (args) => runDuplicateLayer(router, args)
    ),
    define(
      'photoshop_merge_visible_layers', 'Merge all visible layers into one',
      noFields, undefined, (args) => runMergeVisibleLayers(router, args)
    ),
    define(
      'photoshop_flatten_image', 'Flatten all layers into a single background layer',
      noFields, undefined, (args) => runFlattenImage(router, args)
    ),
  ];
}
