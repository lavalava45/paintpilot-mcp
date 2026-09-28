import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runMoveLayerDown,
  runMoveLayerToBottom,
  runMoveLayerToPosition,
  runMoveLayerToTop,
  runMoveLayerUp,
} from './layer-ordering-operations.js';

function emptyMoveTool(
  name: string,
  description: string,
  handler: ToolDefinition['handler']
): ToolDefinition {
  return { tool: { name, description, inputSchema: { type: 'object', properties: {} } }, handler };
}

export function createLayerOrderingTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  const relative: ToolDefinition = {
    tool: {
      name: 'photoshop_move_layer_to_position',
      description:
        'Move the active layer ABOVE/BELOW another layer, or to TOP/BOTTOM of its current parent stack.\n\n' +
        'For ABOVE/BELOW, targetLayerId from photoshop_get_layers is preferred because names can be duplicated. targetLayerName remains supported for compatibility and searches recursively through groups. TOP/BOTTOM do not require a target.',
      inputSchema: {
        type: 'object',
        properties: {
          targetLayerName: { type: 'string', description: 'Exact target layer name for ABOVE/BELOW; recursive first match' },
          targetLayerId: { type: 'number', description: 'Stable target layer id from photoshop_get_layers (preferred for ABOVE/BELOW)' },
          position: { type: 'string', description: 'Position relative to target layer', enum: ['ABOVE', 'BELOW', 'TOP', 'BOTTOM'] },
        },
        required: ['position'],
      },
    },
    handler: (args) => runMoveLayerToPosition(router, args),
  };

  return [
    relative,
    emptyMoveTool(
      'photoshop_move_layer_to_top',
      'Move the active layer to the top of its current parent stack (document or group)',
      (args) => runMoveLayerToTop(router, args)
    ),
    emptyMoveTool(
      'photoshop_move_layer_to_bottom',
      'Move the active layer to the bottom of its current parent stack (document or group)',
      (args) => runMoveLayerToBottom(router, args)
    ),
    emptyMoveTool(
      'photoshop_move_layer_up',
      'Move the active layer up one position within its current parent stack',
      (args) => runMoveLayerUp(router, args)
    ),
    emptyMoveTool(
      'photoshop_move_layer_down',
      'Move the active layer down one position within its current parent stack',
      (args) => runMoveLayerDown(router, args)
    ),
  ];
}
