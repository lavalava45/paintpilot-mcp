import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import {
  adjustmentDocumentTarget,
  adjustmentErrorMessage,
  plainAdjustmentResult,
  type AdjustmentArgs,
} from './adjustment-operation-shared.js';

export const CURVES_PRESETS = ['auto_tone', 'neutral'] as const;
type CurvesPreset = (typeof CURVES_PRESETS)[number];

function normalizedCurvesPreset(value: unknown): CurvesPreset {
  return typeof value === 'string' && (CURVES_PRESETS as readonly string[]).includes(value)
    ? value as CurvesPreset
    : 'auto_tone';
}

async function plainAdjustment(
  router: PhotoshopBackendRouter,
  args: AdjustmentArgs,
  primitive: PhotoshopPrimitive,
  action: string,
  payload: Record<string, unknown>,
  success: string,
  errorPrefix: string
): Promise<ToolResult> {
  try {
    await router.backendFor(primitive);
    const outcome = await invokeUxpOperation(
      action,
      { ...payload, ...adjustmentDocumentTarget(args) },
      `uxp_${action}_failed`
    );
    if (!outcome.ok) throw new Error(outcome.error ?? `uxp_${action}_failed`);
    return plainAdjustmentResult(success);
  } catch (error) {
    return plainAdjustmentResult(`${errorPrefix}: ${adjustmentErrorMessage(error)}`, true);
  }
}

export function runBrightnessContrast(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const brightness = args.brightness as number;
  const contrast = args.contrast as number;
  return plainAdjustment(
    router, args, 'adjustment.brightness_contrast', 'adjust_brightness_contrast',
    { brightness, contrast },
    `Brightness/Contrast adjusted: brightness ${brightness}, contrast ${contrast}`,
    'Error adjusting brightness/contrast'
  );
}

export function runHueSaturation(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const hue = args.hue as number;
  const saturation = args.saturation as number;
  const lightness = args.lightness as number;
  return plainAdjustment(
    router, args, 'adjustment.hue_saturation', 'adjust_hue_saturation',
    { hue, saturation, lightness },
    `Hue/Saturation adjusted: hue ${hue}, saturation ${saturation}, lightness ${lightness}`,
    'Error adjusting hue/saturation'
  );
}

export const runAutoLevels = (router: PhotoshopBackendRouter, args: AdjustmentArgs) =>
  plainAdjustment(router, args, 'adjustment.auto_levels', 'auto_levels', {}, 'Auto Levels applied', 'Error applying auto levels');

export const runAutoContrast = (router: PhotoshopBackendRouter, args: AdjustmentArgs) =>
  plainAdjustment(router, args, 'adjustment.auto_contrast', 'auto_contrast', {}, 'Auto Contrast applied', 'Error applying auto contrast');

export const runDesaturate = (router: PhotoshopBackendRouter, args: AdjustmentArgs) =>
  plainAdjustment(router, args, 'adjustment.desaturate', 'desaturate', {}, 'Layer desaturated (converted to grayscale)', 'Error desaturating layer');

export const runInvert = (router: PhotoshopBackendRouter, args: AdjustmentArgs) =>
  plainAdjustment(router, args, 'adjustment.invert', 'invert', {}, 'Colors inverted', 'Error inverting colors');

export async function runCurves(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const preset = normalizedCurvesPreset(args.preset);
  try {
    await router.backendFor('adjustment.curves');
    const outcome = await invokeUxpOperation(
      'adjust_curves',
      { preset, ...adjustmentDocumentTarget(args) },
      'uxp_adjust_curves_failed'
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_adjust_curves_failed');
    const layerName = typeof outcome.data.layer_name === 'string'
      ? outcome.data.layer_name
      : 'Curves adjustment layer';
    return atomicSuccess(`Curves adjustment layer created (${preset})`, {
      layer_name: layerName,
      preset,
      ...outcome.data,
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
