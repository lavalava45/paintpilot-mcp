import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  GRADIENT_MASK_DIRECTIONS,
  runApplyGradientMask,
  runCreateClippingMask,
  runReleaseClippingMask,
} from './mask-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function maskTool(
  name: string,
  description: string,
  properties: Fields,
  handler: ToolDefinition['handler']
): ToolDefinition {
  return { tool: { name, description, inputSchema: { type: 'object', properties } }, handler };
}

const gradientDescription = 'Paint a linear black-to-white gradient on the active layer mask; creates a reveal-all mask if absent.';
const createClippingDescription = 'Clip the active or named layer to the opaque content of the layer directly below it.';
const releaseClippingDescription = 'Release the clipping mask from the active or named layer.';

export function createMaskTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  const layerName: Fields = {
    layer_name: { type: 'string', description: 'Optional exact layer name (recursive search). Default: active layer.' },
  };
  return [
    maskTool(
      'photoshop_apply_gradient_mask',
      gradientDescription,
      {
        direction: {
          type: 'string',
          enum: [...GRADIENT_MASK_DIRECTIONS],
          description: 'Gradient fade direction on the mask (default bottom_to_top)',
          default: 'bottom_to_top',
        },
        start_pct: { type: 'number', description: 'Gradient start along fade axis (0-100)', minimum: 0, maximum: 100, default: 0 },
        end_pct: { type: 'number', description: 'Gradient end along fade axis (0-100)', minimum: 0, maximum: 100, default: 100 },
        angle_deg: { type: 'number', description: 'Override gradient angle in degrees (optional)' },
      },
      (args) => runApplyGradientMask(router, args)
    ),
    maskTool('photoshop_create_clipping_mask', createClippingDescription, layerName, (args) => runCreateClippingMask(router, args)),
    maskTool('photoshop_release_clipping_mask', releaseClippingDescription, layerName, (args) => runReleaseClippingMask(router, args)),
  ];
}
