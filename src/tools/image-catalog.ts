import { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { runCropDocument, runResizeImage } from './image-operations.js';

const dimensionField = (description: string, minimum: number) => ({
  type: 'number' as const,
  description,
  minimum,
});

const imageDefinition = (
  name: string,
  description: string,
  properties: Record<string, object>,
  required: string[]
) => ({
  name,
  description,
  inputSchema: { type: 'object' as const, properties, required },
});

export function createImageTools(
  connection: PhotoshopConnection,
  backendRouter = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    {
      tool: imageDefinition('photoshop_resize_image', 'Resize the active image to specified dimensions', {
        width: dimensionField('New width in pixels', 1),
        height: dimensionField('New height in pixels', 1),
      }, ['width', 'height']),
      handler: async (args) => runResizeImage(backendRouter, args),
    },
    {
      tool: imageDefinition('photoshop_crop_document', 'Crop the document to specified bounds', {
        left: dimensionField('Left edge position in pixels', 0),
        top: dimensionField('Top edge position in pixels', 0),
        right: dimensionField('Right edge position in pixels', 1),
        bottom: dimensionField('Bottom edge position in pixels', 1),
      }, ['left', 'top', 'right', 'bottom']),
      handler: async (args) => runCropDocument(backendRouter, args),
    },
  ];
}
