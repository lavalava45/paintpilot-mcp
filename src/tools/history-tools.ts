import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { runHistoryRead, runRedo, runUndo } from './history-operations.js';

type InputSchema = ToolDefinition['tool']['inputSchema'];

function historyTool(
  name: string,
  description: string,
  inputSchema: InputSchema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

function stepInput(verb: 'undo' | 'redo'): InputSchema {
  return {
    type: 'object',
    properties: {
      steps: { type: 'number', minimum: 1, default: 1, description: `Number of steps to ${verb} (default: 1)` },
    },
  };
}

export function createHistoryTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    historyTool('photoshop_undo', 'Undo one or more Photoshop history steps.', stepInput('undo'), (args) => runUndo(router, args)),
    historyTool('photoshop_redo', 'Redo one or more previously undone Photoshop history steps.', stepInput('redo'), (args) => runRedo(router, args)),
    historyTool('photoshop_get_history', 'Read the active document history states without mutation.', { type: 'object', properties: {} }, () => runHistoryRead(router)),
  ];
}
