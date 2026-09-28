import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import {
  adjustmentDocumentTarget,
  boundedNumber,
  type AdjustmentArgs,
} from './adjustment-operation-shared.js';

async function adjustmentLayer(
  router: PhotoshopBackendRouter,
  args: AdjustmentArgs,
  primitive: PhotoshopPrimitive,
  action: string,
  payload: Record<string, unknown>,
  summary: string
): Promise<ToolResult> {
  try {
    await router.backendFor(primitive);
    const outcome = await invokeUxpOperation(
      action,
      { ...payload, ...adjustmentDocumentTarget(args) },
      `uxp_${action}_failed`
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? `uxp_${action}_failed`);
    return atomicSuccess(summary, outcome.data);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export function runApplyLut(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const lut = typeof args.lut === 'string' ? args.lut.trim() : '';
  if (!lut) return Promise.resolve(atomicFailureFromError(new Error('lut parameter is required')));
  return adjustmentLayer(
    router, args, 'adjustment.lut', 'apply_lut', { lut },
    `Color Lookup adjustment layer created (${lut})`
  );
}

export function runVibrance(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const vibrance = boundedNumber(args.vibrance, -100, 100, 40);
  const saturation = boundedNumber(args.saturation, -100, 100, 0);
  return adjustmentLayer(
    router, args, 'adjustment.vibrance', 'adjust_vibrance', { vibrance, saturation },
    `Vibrance adjustment layer created (vibrance ${vibrance}, saturation ${saturation})`
  );
}

export function runExposure(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const exposure = boundedNumber(args.exposure, -20, 20, 0.5);
  const offset = boundedNumber(args.offset, -0.5, 0.5, 0);
  const gamma = boundedNumber(args.gamma, 0.01, 9.99, 1);
  return adjustmentLayer(
    router, args, 'adjustment.exposure', 'adjust_exposure', { exposure, offset, gamma },
    `Exposure adjustment layer created (${exposure} stops)`
  );
}

export function runPhotoFilter(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const red = boundedNumber(args.red, 0, 255, 236);
  const green = boundedNumber(args.green, 0, 255, 138);
  const blue = boundedNumber(args.blue, 0, 255, 0);
  const density = boundedNumber(args.density, 0, 100, 25);
  const preserveLuminosity = args.preserve_luminosity !== false;
  return adjustmentLayer(
    router,
    args,
    'adjustment.photo_filter',
    'apply_photo_filter',
    { red, green, blue, density, preserve_luminosity: preserveLuminosity },
    `Photo Filter adjustment layer created (density ${density}%)`
  );
}

export function runGradientMap(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const reverse = args.reverse === true;
  return adjustmentLayer(
    router, args, 'adjustment.gradient_map', 'apply_gradient_map', { reverse },
    `Gradient Map adjustment layer created${reverse ? ' (reversed)' : ''}`
  );
}
