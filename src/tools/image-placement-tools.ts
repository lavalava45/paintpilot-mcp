import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { runOpenImage, runPlaceImage } from './image-placement-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function imageTool(
  name: string,
  description: string,
  properties: Fields,
  required: string[],
  handler: ToolDefinition['handler']
): ToolDefinition {
  return {
    tool: {
      name,
      description,
      inputSchema: { type: 'object', properties, required },
    },
    handler,
  };
}

const placeDescription = [
  'Place an external image file as a new layer in the active document.',
  'x/y are absolute canvas coordinates for the placed layer top-left.',
].join('\n\n');

const openDescription = [
  'Open an image file as a new Photoshop document.',
].join('\n\n');

export function createImagePlacementTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    imageTool(
      'photoshop_place_image',
      placeDescription,
      {
        filePath: { type: 'string', description: 'Full path to the image file (JPEG, PNG, PSD, etc.)' },
        x: { type: 'number', description: 'Absolute canvas X of the placed layer top-left, in pixels (default: 0)', default: 0 },
        y: { type: 'number', description: 'Absolute canvas Y of the placed layer top-left, in pixels (default: 0)', default: 0 },
      },
      ['filePath'],
      (args) => runPlaceImage(router, args)
    ),
    imageTool(
      'photoshop_open_image',
      openDescription,
      { filePath: { type: 'string', description: 'Full path to the image file' } },
      ['filePath'],
      (args) => runOpenImage(router, args)
    ),
  ];
}
