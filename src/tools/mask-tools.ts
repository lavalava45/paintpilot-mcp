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

const gradientDescription = 'Apply a linear black-to-white gradient on the active layer mask channel (fade/blend).\n\nUsers often say: fade into background, gradient mask, blend subject, soft edge fade.\n\nThis paints on an existing layer mask — not a Gradient Fill layer.\nUse when: softening edges or fading a layer into the background through its mask.\nDo NOT use when: subject is not isolated — create an explicit selection and layer mask first.\n\nReturns: JSON { ok, summary, details: { applied, direction, angle, mask_auto_created? } }.\nPreconditions: active document and active layer. Creates a reveal-all mask if none exists.\nSide effects: modifies layer mask pixels; two history steps when mask is auto-created.';
const createClippingDescription = 'Create a clipping mask on the active layer (or a named layer).\n\nUsers often say: clip to layer below, clipping mask, clip this layer, mask to shape below.\n\nUse when: the active layer should be visible only where the layer directly below it has opaque pixels.\nDo NOT use when: the layer is already clipped — returns success with already_clipping.\nDo NOT use when: the layer is the bottom-most layer — there is no base layer to clip into.\n\nReturns: JSON { ok, summary, details: { layer_name, is_clipping, already_clipping? } }.\nPreconditions: active document; target layer must sit directly above the base layer below it in the same group/stack.\nSide effects: one history step (groupEvent).';
const releaseClippingDescription = 'Release (remove) the clipping mask from the active layer (or a named layer).\n\nUsers often say: unclip, release clipping mask, remove clipping mask.\n\nUse when: a clipped layer should become independent again.\nDo NOT use when: the layer is not clipped — returns not_clipping error.\n\nReturns: JSON { ok, summary, details: { layer_name, is_clipping: false } }.\nPreconditions: active document; target layer must currently be a clipping mask (grouped).\nSide effects: sets layer.grouped = false; one history step.';

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
