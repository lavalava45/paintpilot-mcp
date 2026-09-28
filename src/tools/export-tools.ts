import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { EXPORT_FORMATS, runExportAs } from './export-operations.js';

type InputSchema = ToolDefinition['tool']['inputSchema'];

function exportTool(
  name: string,
  description: string,
  inputSchema: InputSchema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

export function createExportTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [exportTool(
    'photoshop_export_as',
    'Export the pinned/active document to a delivery file without changing the working document. Supports PNG, JPEG, WebP and AVIF through the maintained UXP export path.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute output file path (extension should match format)' },
        format: { type: 'string', enum: EXPORT_FORMATS, description: 'Export format', default: 'PNG' },
        quality: { type: 'number', description: 'Quality 0-100 (JPEG/WebP/AVIF)', minimum: 0, maximum: 100, default: 80 },
      },
      required: ['path'],
    },
    (args) => runExportAs(router, args)
  )];
}
