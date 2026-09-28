import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runFitLayerToDocument,
  runMoveLayerPixels,
  runRotateLayer,
  runScaleLayer,
} from './layer-transform-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function transformTool(
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

export function createLayerTransformTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    transformTool(
      'photoshop_fit_layer_to_document',
      'Scale the active layer to fit the document canvas while maintaining aspect ratio',
      {
        fillDocument: {
          type: 'boolean',
          description: 'If true, fills entire canvas (may crop). If false, fits within canvas (may have margins). Default: false',
          default: false,
        },
      },
      undefined,
      (args) => runFitLayerToDocument(router, args)
    ),
    transformTool(
      'photoshop_scale_layer', 'Scale the active layer by a percentage',
      {
        scalePercent: { type: 'number', description: 'Scale percentage (e.g., 50 for 50%, 200 for 200%)', minimum: 1 },
        centerAnchor: { type: 'boolean', description: 'Scale from center (true) or top-left (false). Default: true', default: true },
      },
      ['scalePercent'],
      (args) => runScaleLayer(router, args)
    ),
    transformTool(
      'photoshop_move_layer', 'Move the active layer by specified offset',
      {
        deltaX: { type: 'number', description: 'Horizontal offset in pixels (can be negative)' },
        deltaY: { type: 'number', description: 'Vertical offset in pixels (can be negative)' },
      },
      ['deltaX', 'deltaY'],
      (args) => runMoveLayerPixels(router, args)
    ),
    transformTool(
      'photoshop_rotate_layer', 'Rotate the active layer',
      {
        degrees: { type: 'number', description: 'Rotation angle in degrees (positive = clockwise, negative = counter-clockwise)' },
      },
      ['degrees'],
      (args) => runRotateLayer(router, args)
    ),
  ];
}
