import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  SMART_BLUR_MODES,
  SMART_BLUR_QUALITIES,
  runGaussianBlur,
  runHighPass,
  runMotionBlur,
  runNoise,
  runSharpen,
  runSmartBlur,
} from './filter-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function filterTool(
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

export function createFilterTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    filterTool(
      'photoshop_apply_gaussian_blur',
      'Apply Gaussian Blur to the active layer.',
      { radius: { type: 'number', description: 'Blur radius in pixels (0.1-250)', minimum: 0.1, maximum: 250 } },
      ['radius'],
      (args) => runGaussianBlur(router, args)
    ),
    filterTool(
      'photoshop_apply_sharpen',
      'Apply Unsharp Mask sharpening to the active layer.',
      {
        amount: { type: 'number', description: 'Sharpening amount in percent (1-500)', minimum: 1, maximum: 500 },
        radius: { type: 'number', description: 'Radius in pixels (0.1-250)', minimum: 0.1, maximum: 250 },
        threshold: { type: 'number', description: 'Threshold levels (0-255)', minimum: 0, maximum: 255, default: 0 },
      },
      ['amount', 'radius'],
      (args) => runSharpen(router, args)
    ),
    filterTool(
      'photoshop_apply_noise',
      'Apply Add Noise to the active layer.',
      {
        amount: { type: 'number', description: 'Noise amount in percent (0.1-400)', minimum: 0.1, maximum: 400 },
        distribution: { type: 'string', description: 'Noise distribution type', enum: ['UNIFORM', 'GAUSSIAN'], default: 'UNIFORM' },
        monochromatic: { type: 'boolean', description: 'Apply monochromatic noise', default: false },
      },
      ['amount'],
      (args) => runNoise(router, args)
    ),
    filterTool(
      'photoshop_apply_motion_blur',
      'Apply Motion Blur to the active layer.',
      {
        angle: { type: 'number', description: 'Blur angle in degrees (-360 to 360)', minimum: -360, maximum: 360 },
        radius: { type: 'number', description: 'Blur distance in pixels (1-999)', minimum: 1, maximum: 999 },
      },
      ['angle', 'radius'],
      (args) => runMotionBlur(router, args)
    ),
    filterTool(
      'photoshop_apply_high_pass',
      [
        'Apply High Pass to the active raster layer for edge/detail extraction.',
        'Use for sharpening workflows or frequency-separation preparation; rasterize unsupported layer kinds first.',
        'Returns an atomic result with filter/radius/context. Side effect: one Photoshop history step.',
      ].join('\n\n'),
      { radius: { type: 'number', description: 'Edge retention radius in pixels (0.1-250)', minimum: 0.1, maximum: 250 } },
      ['radius'],
      (args) => runHighPass(router, args)
    ),
    filterTool(
      'photoshop_apply_smart_blur',
      [
        'Apply Smart Blur to the active raster layer for edge-preserving smoothing.',
        'Use for smoothing while retaining stronger edges; use Gaussian Blur when uniform blur is sufficient.',
        'Returns an atomic result with filter/radius/threshold/mode/quality/context. Side effect: one Photoshop history step.',
      ].join('\n\n'),
      {
        radius: { type: 'number', description: 'Blur radius (0.1-100)', minimum: 0.1, maximum: 100 },
        threshold: { type: 'number', description: 'Blur threshold — higher values restrict blur to stronger edges (0.1-100)', minimum: 0.1, maximum: 100 },
        mode: { type: 'string', enum: [...SMART_BLUR_MODES], description: 'Smart blur mode (default: NORMAL)', default: 'NORMAL' },
        quality: { type: 'string', enum: [...SMART_BLUR_QUALITIES], description: 'Blur quality / smoothness (default: MEDIUM)', default: 'MEDIUM' },
      },
      ['radius', 'threshold'],
      (args) => runSmartBlur(router, args)
    ),
  ];
}
