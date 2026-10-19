import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runFitLayerToDocument,
  runMoveLayerPixels,
  runSourceBoundReflection,
  runGuardedTransformLayer,
  runRotateLayer,
  runScaleLayer,
} from './layer-transform-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function transformTool(
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

export function createLayerTransformTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    transformTool(
      'photoshop_source_bound_reflection',
      'Guard-only source-bound water reflection: duplicate pinned raster source pixels, native vertical flip at waterline, one atomic History action. Creates one independent layer and requires a semantic reflection owner plus a verified preview; never generates new imagery.',
      {
        document_id: { type: 'integer', minimum: 1 },
        source_layer_id: { type: 'integer', minimum: 1 },
        receiver_layer_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        waterline_y: { type: 'number' },
        expected_source_bounds: { type: 'object', properties: {
          left: { type: 'number' }, top: { type: 'number' },
          right: { type: 'number' }, bottom: { type: 'number' },
        }, required: ['left', 'top', 'right', 'bottom'], additionalProperties: false },
        horizontal_offset: { type: 'number', minimum: -128, maximum: 128, default: 0 },
        opacity: { type: 'number', minimum: 5, maximum: 90, default: 65 },
      },
      ['document_id', 'source_layer_id', 'receiver_layer_id', 'name', 'waterline_y', 'expected_source_bounds'],
      (args) => runSourceBoundReflection(router, args)
    ),
    transformTool(
      'photoshop_transform_layer',
      'Guard-only native translation of an explicitly pinned Photoshop raster layer; never reorders layers',
      {
        document_id: { type: 'integer', minimum: 1 },
        layer_id: { type: 'integer', minimum: 1 },
        translation: { type: 'object', properties: {
          x: { type: 'number' }, y: { type: 'number' },
        }, required: ['x', 'y'], additionalProperties: false },
      },
      ['document_id', 'layer_id', 'translation'],
      (args) => runGuardedTransformLayer(router, args)
    ),
    transformTool(
      'photoshop_fit_layer_to_document',
      'Scale the active layer to fit the document canvas while maintaining aspect ratio',
      {
        fillDocument: {
          type: 'boolean',
          description: 'If true, fills entire canvas (may crop). If false, fits within canvas (may have margins). Default: false',
          default: false,
        },
      },
      undefined,
      (args) => runFitLayerToDocument(router, args)
    ),
    transformTool(
      'photoshop_scale_layer', 'Scale the active layer by a percentage',
      {
        scalePercent: { type: 'number', description: 'Scale percentage (e.g., 50 for 50%, 200 for 200%)', minimum: 1 },
        centerAnchor: { type: 'boolean', description: 'Scale from center (true) or top-left (false). Default: true', default: true },
      },
      ['scalePercent'],
      (args) => runScaleLayer(router, args)
    ),
    transformTool(
      'photoshop_move_layer', 'Move the active layer by specified offset',
      {
        deltaX: { type: 'number', description: 'Horizontal offset in pixels (can be negative)' },
        deltaY: { type: 'number', description: 'Vertical offset in pixels (can be negative)' },
        connected_move: {
          type: 'object',
          description: 'Optional E.25 native atomic multi-layer move. Requires one pinned parent and 1–7 pinned child owners with exact Photoshop BEFORE bounds. Guard checks durable parent/child ownership; omitted means ordinary single active-layer move.',
          properties: {
            parent: { type: 'object', properties: {
              owner_id: { type: 'string', minLength: 1 },
              layer_id: { type: 'integer', minimum: 1 },
              expected_bounds: { type: 'object', properties: {
                left: { type: 'number' }, top: { type: 'number' },
                right: { type: 'number' }, bottom: { type: 'number' },
              }, required: ['left', 'top', 'right', 'bottom'] },
            }, required: ['owner_id', 'layer_id', 'expected_bounds'] },
            children: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', properties: {
              owner_id: { type: 'string', minLength: 1 },
              layer_id: { type: 'integer', minimum: 1 },
              expected_bounds: { type: 'object', properties: {
                left: { type: 'number' }, top: { type: 'number' },
                right: { type: 'number' }, bottom: { type: 'number' },
              }, required: ['left', 'top', 'right', 'bottom'] },
            }, required: ['owner_id', 'layer_id', 'expected_bounds'] } },
          },
          required: ['parent', 'children'],
        },
      },
      ['deltaX', 'deltaY'],
      (args) => runMoveLayerPixels(router, args)
    ),
    transformTool(
      'photoshop_rotate_layer', 'Rotate the active layer',
      {
        degrees: { type: 'number', description: 'Rotation angle in degrees (positive = clockwise, negative = counter-clockwise)' },
      },
      ['degrees'],
      (args) => runRotateLayer(router, args)
    ),
  ];
}
