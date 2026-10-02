import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  CURVES_PRESETS,
  runAutoContrast,
  runAutoLevels,
  runBrightnessContrast,
  runCurves,
  runDesaturate,
  runHueSaturation,
  runInvert,
} from './adjustment-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function adjustmentTool(
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

export function createAdjustmentTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    adjustmentTool(
      'photoshop_adjust_brightness_contrast',
      'Adjust brightness and contrast on the active layer. Common uses: exposure correction, brightening/darkening, or contrast changes.',
      {
        brightness: { type: 'number', description: 'Brightness adjustment (-100 to 100)', minimum: -100, maximum: 100 },
        contrast: { type: 'number', description: 'Contrast adjustment (-100 to 100)', minimum: -100, maximum: 100 },
      },
      ['brightness', 'contrast'],
      (args) => runBrightnessContrast(router, args)
    ),
    adjustmentTool(
      'photoshop_adjust_hue_saturation',
      'Adjust hue, saturation, and lightness of the active layer.',
      {
        hue: { type: 'number', description: 'Hue shift (-180 to 180)', minimum: -180, maximum: 180 },
        saturation: { type: 'number', description: 'Saturation adjustment (-100 to 100)', minimum: -100, maximum: 100 },
        lightness: { type: 'number', description: 'Lightness adjustment (-100 to 100)', minimum: -100, maximum: 100 },
      },
      ['hue', 'saturation', 'lightness'],
      (args) => runHueSaturation(router, args)
    ),
    adjustmentTool(
      'photoshop_auto_levels',
      'Apply automatic Levels correction to the active layer.',
      none,
      undefined,
      (args) => runAutoLevels(router, args)
    ),
    adjustmentTool(
      'photoshop_auto_contrast',
      'Apply automatic contrast correction to the active layer.',
      none,
      undefined,
      (args) => runAutoContrast(router, args)
    ),
    adjustmentTool(
      'photoshop_adjust_curves',
      [
        'Create a non-destructive Curves adjustment layer in the active document.',
        'Use for global tonal correction; choose a dedicated color-grade adjustment when a LUT or another grading mechanism better matches the request.',
        'Returns an atomic result with layer_name and preset.',
      ].join('\n\n'),
      {
        preset: {
          type: 'string',
          enum: [...CURVES_PRESETS],
          description: 'auto_tone (S-curve) or neutral (identity curve)',
          default: 'auto_tone',
        },
      },
      undefined,
      (args) => runCurves(router, args)
    ),
    adjustmentTool('photoshop_desaturate', 'Desaturate the active layer (convert to grayscale)', none, undefined, (args) => runDesaturate(router, args)),
    adjustmentTool('photoshop_invert', 'Invert colors of the active layer', none, undefined, (args) => runInvert(router, args)),
  ];
}
