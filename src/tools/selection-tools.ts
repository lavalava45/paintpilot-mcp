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
  'Use when: verifying selection exists and its size/position before mask, fill, or recipe steps.\nDo NOT use when: creating or modifying a selection — use photoshop_select_rectangle or photoshop_select_subject.',
  'Returns: JSON { ok, summary, details: { has_selection, bounds?, context } }.\nPreconditions: active document. Side effects: none.',
].join('\n\n');

const ellipseDescription = [
  'Create an elliptical pixel selection from a bounding box (anti-aliased).',
  'Use when: circular or oval masks, vignettes, or radial edits inside a region.\nDo NOT use when: a rectangular region is enough — use photoshop_select_rectangle.',
  'Returns: JSON { ok, summary, details: { shape, bounds?, context } }.\nPreconditions: active document; right > left and bottom > top. Side effects: replaces current selection.',
].join('\n\n');

function pixelAdjustmentDescription(kind: 'Expand' | 'Contract' | 'Feather'): string {
  if (kind === 'Expand') {
    return 'Expand the active pixel selection outward by a pixel amount.\n\nUse when: growing a tight subject selection or adding padding before feather/fill.\nDo NOT use when: no selection exists — create one first.\n\nReturns: JSON { ok, summary, details: { pixels, bounds?, context } }.\nPreconditions: active document and active pixel selection. Side effects: modifies selection.';
  }
  if (kind === 'Contract') {
    return 'Contract (shrink) the active pixel selection inward by a pixel amount.\n\nUse when: tightening a loose selection or trimming halo after expand.\nDo NOT use when: no selection exists — create one first.\n\nReturns: JSON { ok, summary, details: { pixels, bounds?, context } }.\nPreconditions: active document and active pixel selection. Side effects: modifies selection.';
  }
  return 'Feather (soften) the edges of the active pixel selection.\n\nUse when: soft transitions before fill, mask, or delete operations.\nDo NOT use when: a hard edge is required or no selection exists.\n\nReturns: JSON { ok, summary, details: { pixels, bounds?, context } }.\nPreconditions: active document and active pixel selection. Side effects: modifies selection edges.';
}

const saveDescription = 'Save the active pixel selection to a new alpha channel.\n\nUse when: preserving a selection for later reload or batch workflows.\nDo NOT use when: no selection exists — create one first.\n\nReturns: JSON { ok, summary, details: { channel_name, context } }.\nPreconditions: active document and active pixel selection. Side effects: adds alpha channel.';
const rectangleDescription = 'Create a rectangular pixel selection from corner coordinates.\n\nUse when: masking, cropping a region, or preparing for layer mask.\nDo NOT use when: subject isolation requires a final mask — follow with photoshop_create_layer_mask.\n\nReturns: selection bounds [left, top, right, bottom].\nPreconditions: active document. Side effects: replaces current selection.';
const createMaskDescription = 'Create a layer mask on the active layer from the current selection (reveal selection).\n\nUsers often say: mask this, hide the background, non-destructive cutout (after selection).\n\nUse when: non-destructive hide/show after a selection exists.\nDo NOT use when: no selection exists — create selection first or use remove_background recipe.\n\nReturns: maskCreated confirmation.\nPreconditions: active document and active selection. Side effects: adds mask to active layer.';
const subjectDescription = 'Run Select Subject on the active layer (creates a pixel selection only, no mask).\n\nUsers often say: cut out, isolate subject, select person, select object.\n\nUse when: you need a subject selection for masking, fill, or further edits.\nDo NOT use when: a different selection method is more appropriate before mask creation.\n\nReturns: JSON { ok, summary, details: { selected, method } }.\nPreconditions: PS ≥ 23, active document, non-Background active layer with a recognizable subject.\nSide effects: replaces current selection.';
const contentAwareDescription = 'Fill the current pixel selection using Content-Aware Fill.\n\nUsers often say: remove distraction, erase object, content aware fill, inpaint selection.\n\nUse when: a rectangular or other selection covers the area to remove/replace.\nDo NOT use when: no selection exists — use photoshop_select_rectangle first.\nUse this for deterministic local inpainting or object removal after making a selection.\n\nReturns: JSON { ok, summary, details: { filled } }.\nPreconditions: active document and active pixel selection.\nSide effects: modifies pixels inside selection; deselects afterward.';

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
