import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { NEURAL_FILTER_KINDS, runNeuralFilter } from './neural-operations.js';
import { LAYER_STYLE_NAMES, runApplyLayerStyle } from './style-operations.js';

type EffectSchema = ToolDefinition['tool']['inputSchema'];

function effectTool(
  name: string,
  description: string,
  inputSchema: EffectSchema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

function boundedNumber(
  description: string,
  minimum: number,
  maximum: number,
  defaultValue: number
) {
  return { type: 'number' as const, description, minimum, maximum, default: defaultValue };
}

export function createNeuralTools(connection: PhotoshopConnection): ToolDefinition[] {
  const percentage = (description: string) => boundedNumber(description, 0, 100, 50);
  return [effectTool(
    'photoshop_neural_filter',
    'Apply one supported Photoshop Neural Filter through the maintained UXP companion. Fails closed when the required bridge/capability is unavailable.',
    {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: NEURAL_FILTER_KINDS, description: 'Neural filter to apply' },
        smoothness: percentage('Skin smoothing smoothness 0-100 (skin_smoothing only)'),
        blur: percentage('Skin smoothing blur 0-100 (skin_smoothing only)'),
        reference_layer_id: { type: 'number', description: 'Layer id for harmonize reference (harmonize only)' },
      },
      required: ['filter'],
    },
    (args) => runNeuralFilter(connection, args)
  )];
}

export function createStyleTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [effectTool(
    'photoshop_apply_layer_style',
    'Apply one supported semantic layer effect to the active layer. The effect stays on the pinned Photoshop document and is executed through the UXP lane.',
    {
      type: 'object',
      properties: {
        style: { type: 'string', enum: LAYER_STYLE_NAMES, description: 'Which effect to apply', default: 'drop_shadow' },
        red: boundedNumber('Effect color red (0-255)', 0, 255, 0),
        green: boundedNumber('Effect color green (0-255)', 0, 255, 0),
        blue: boundedNumber('Effect color blue (0-255)', 0, 255, 0),
        opacity: boundedNumber('Effect opacity (0-100)', 0, 100, 60),
        size: boundedNumber('Blur/size in pixels (stroke width for stroke)', 0, 250, 10),
        distance: boundedNumber('Offset distance in pixels (drop shadow only)', 0, 250, 8),
        angle: boundedNumber('Light angle in degrees (drop shadow / bevel)', -360, 360, 120),
      },
    },
    (args) => runApplyLayerStyle(router, args)
  )];
}
