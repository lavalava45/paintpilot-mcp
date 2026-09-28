import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { runImageStack, STACK_MODE_IDS } from './stack-operations.js';

type InputSchema = ToolDefinition['tool']['inputSchema'];

function stackTool(
  name: string,
  description: string,
  inputSchema: InputSchema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

export function createStackTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [stackTool(
    'photoshop_image_stack',
    'Combine two or more aligned image files into a Photoshop smart-object stack and apply a statistical stack mode such as median or mean.',
    {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'Absolute paths of the images to stack (min 2)',
        },
        mode: {
          type: 'string',
          enum: Object.keys(STACK_MODE_IDS),
          default: 'median',
          description: 'Stack mode — median removes transient objects, mean reduces noise',
        },
      },
      required: ['files'],
    },
    (args) => runImageStack(router, args)
  )];
}
