import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runApplyLut,
  runExposure,
  runGradientMap,
  runPhotoFilter,
  runVibrance,
} from './color-adjustment-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function colorTool(
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

export function createColorAdjustmentTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    colorTool(
      'photoshop_apply_lut',
      'Create a Color Lookup adjustment layer from a built-in LUT name or an absolute .cube/.3dl/.look path. Use for non-destructive color grading rather than basic tonal correction.',
      {
        lut: {
          type: 'string',
          description: 'Built-in LUT file name (e.g. "Crisp_Warm.3dl") or absolute path to a .cube/.3dl/.look file',
        },
      },
      ['lut'],
      (args) => runApplyLut(router, args)
    ),
    colorTool(
      'photoshop_adjust_vibrance',
      'Create a Vibrance adjustment layer for controlled color intensity changes.',
      {
        vibrance: { type: 'number', description: 'Vibrance (-100 to 100)', minimum: -100, maximum: 100, default: 40 },
        saturation: { type: 'number', description: 'Saturation (-100 to 100)', minimum: -100, maximum: 100, default: 0 },
      },
      undefined,
      (args) => runVibrance(router, args)
    ),
    colorTool(
      'photoshop_adjust_exposure',
      'Create an Exposure adjustment layer using exposure, offset, and gamma controls.',
      {
        exposure: { type: 'number', description: 'Exposure in stops (-20 to 20)', minimum: -20, maximum: 20, default: 0.5 },
        offset: { type: 'number', description: 'Offset (-0.5 to 0.5)', minimum: -0.5, maximum: 0.5, default: 0 },
        gamma: { type: 'number', description: 'Gamma correction (0.01 to 9.99)', minimum: 0.01, maximum: 9.99, default: 1 },
      },
      undefined,
      (args) => runExposure(router, args)
    ),
    colorTool(
      'photoshop_apply_photo_filter',
      'Create a Photo Filter adjustment layer with configurable tint, density, and luminosity preservation.',
      {
        red: { type: 'number', description: 'Filter color red (0-255); warming ≈ 236', minimum: 0, maximum: 255, default: 236 },
        green: { type: 'number', description: 'Filter color green (0-255); warming ≈ 138', minimum: 0, maximum: 255, default: 138 },
        blue: { type: 'number', description: 'Filter color blue (0-255); warming ≈ 0', minimum: 0, maximum: 255, default: 0 },
        density: { type: 'number', description: 'Filter density percent (0-100)', minimum: 0, maximum: 100, default: 25 },
        preserve_luminosity: { type: 'boolean', description: 'Preserve luminosity (default true)', default: true },
      },
      undefined,
      (args) => runPhotoFilter(router, args)
    ),
    colorTool(
      'photoshop_apply_gradient_map',
      'Create a Gradient Map adjustment layer for tonal remapping such as duotone or black-and-white treatments.',
      { reverse: { type: 'boolean', description: 'Reverse the gradient (white→black)', default: false } },
      undefined,
      (args) => runGradientMap(router, args)
    ),
  ];
}
