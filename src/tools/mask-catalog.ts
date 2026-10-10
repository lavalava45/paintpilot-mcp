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

const gradientDescription = 'Paint black (hide) to white (reveal) along direction on the pinned layer mask; creates reveal-all if absent and preserves the active selection and RGB channel. Percentages are absolute canvas-axis positions, not clipping bounds: without a selection this affects the whole owner. For a local carve use bounded black BRUSH strokes on layer-mask.';
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
        layer_id: { type: 'integer', minimum: 1, description: 'Pinned active physical layer id; a different active layer is rejected without switching it.' },
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
