import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runApplyLayerMask,
  runContentAwareFill,
  runContractSelection,
  runCreateLayerMask,
  runDeleteLayerMask,
  runDeselect,
  runExpandSelection,
  runFeatherSelection,
  runGetSelectionBounds,
  runInvertSelection,
  runSaveSelection,
  runSelectAll,
  runSelectEllipse,
  runSelectRectangle,
  runSelectSubject,
} from './selection-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function selectionTool(
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

const none: Fields = {};
const rectangleFields: Fields = {
  left: { type: 'number', description: 'Left edge in pixels' },
  top: { type: 'number', description: 'Top edge in pixels' },
  right: { type: 'number', description: 'Right edge in pixels' },
  bottom: { type: 'number', description: 'Bottom edge in pixels' },
};
const rectangleRequired = ['left', 'top', 'right', 'bottom'];

const readBoundsDescription = [
  'Read the active pixel selection bounds in document pixels (read-only).',
].join('\n\n');

const ellipseDescription = [
  'Create an elliptical pixel selection from a bounding box (anti-aliased).',
].join('\n\n');

function pixelAdjustmentDescription(kind: 'Expand' | 'Contract' | 'Feather'): string {
  if (kind === 'Expand') {
    return 'Expand the active pixel selection outward by a pixel amount.';
  }
  if (kind === 'Contract') {
    return 'Contract the active pixel selection inward by a pixel amount.';
  }
  return 'Feather the edges of the active pixel selection.';
}

const saveDescription = 'Save the active pixel selection to a new alpha channel.';
const rectangleDescription = 'Create a rectangular pixel selection from corner coordinates.';
const createMaskDescription = 'Create a reveal-selection layer mask from the current pixel selection.';
const subjectDescription = 'Run Photoshop Select Subject and replace the current pixel selection; does not create a mask.';
const contentAwareDescription = 'Fill the current pixel selection using Content-Aware Fill, then deselect.';

export function createSelectionTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  const pixels = (description: string): Fields => ({
    pixels: { type: 'number', description, minimum: 1 },
  });

  return [
    selectionTool('photoshop_get_selection_bounds', readBoundsDescription, none, undefined, () => runGetSelectionBounds(router)),
    selectionTool(
      'photoshop_select_ellipse', ellipseDescription,
      {
        left: { type: 'number', description: 'Left edge of bounding box in pixels' },
        top: { type: 'number', description: 'Top edge of bounding box in pixels' },
        right: { type: 'number', description: 'Right edge of bounding box in pixels' },
        bottom: { type: 'number', description: 'Bottom edge of bounding box in pixels' },
      },
      rectangleRequired,
      (args) => runSelectEllipse(router, args)
    ),
    selectionTool(
      'photoshop_expand_selection', pixelAdjustmentDescription('Expand'),
      pixels('Pixels to expand by (minimum 1)'), ['pixels'],
      (args) => runExpandSelection(router, args)
    ),
    selectionTool(
      'photoshop_contract_selection', pixelAdjustmentDescription('Contract'),
      pixels('Pixels to contract by (minimum 1)'), ['pixels'],
      (args) => runContractSelection(router, args)
    ),
    selectionTool(
      'photoshop_feather_selection', pixelAdjustmentDescription('Feather'),
      pixels('Feather radius in pixels (minimum 1)'), ['pixels'],
      (args) => runFeatherSelection(router, args)
    ),
    selectionTool(
      'photoshop_save_selection', saveDescription,
      { channel_name: { type: 'string', description: 'Optional name for the new alpha channel (auto-generated if omitted)' } },
      undefined,
      (args) => runSaveSelection(router, args)
    ),
    selectionTool(
      'photoshop_select_rectangle', rectangleDescription,
      rectangleFields, rectangleRequired,
      (args) => runSelectRectangle(router, args)
    ),
    selectionTool('photoshop_select_all', 'Select the entire document', none, undefined, () => runSelectAll(router)),
    selectionTool('photoshop_deselect', 'Deselect all selections', none, undefined, () => runDeselect(router)),
    selectionTool('photoshop_invert_selection', 'Invert the current selection', none, undefined, () => runInvertSelection(router)),
    selectionTool('photoshop_create_layer_mask', createMaskDescription, none, undefined, (args) => runCreateLayerMask(router, args)),
    selectionTool('photoshop_delete_layer_mask', 'Delete the layer mask from active layer', none, undefined, () => runDeleteLayerMask(router)),
    selectionTool('photoshop_apply_layer_mask', 'Apply (merge) the layer mask to the layer', none, undefined, () => runApplyLayerMask(router)),
    selectionTool(
      'photoshop_select_subject', subjectDescription,
      {
        sample_all_layers: {
          type: 'boolean',
          description: 'Sample all layers for autoCutout fallback (default false)',
          default: false,
        },
      },
      undefined,
      (args) => runSelectSubject(connection, router, args)
    ),
    selectionTool('photoshop_content_aware_fill', contentAwareDescription, none, undefined, () => runContentAwareFill(router)),
  ];
}
