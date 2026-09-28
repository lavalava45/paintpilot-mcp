import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import {
  adjustmentErrorMessage,
  plainAdjustmentResult,
  type AdjustmentArgs,
} from './adjustment-operation-shared.js';

export const SMART_BLUR_MODES = ['NORMAL', 'EDGEONLY', 'OVERLAYEDGE'] as const;
export const SMART_BLUR_QUALITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
type SmartBlurMode = (typeof SMART_BLUR_MODES)[number];
type SmartBlurQuality = (typeof SMART_BLUR_QUALITIES)[number];

async function plainFilter(
  router: PhotoshopBackendRouter,
  primitive: PhotoshopPrimitive,
  action: string,
  payload: Record<string, unknown>,
  success: string,
  errorPrefix: string
): Promise<ToolResult> {
  try {
    await router.backendFor(primitive);
    const outcome = await invokeUxpOperation(action, payload, `uxp_${action}_failed`);
    if (!outcome.ok) throw new Error(outcome.error ?? `uxp_${action}_failed`);
    return plainAdjustmentResult(success);
  } catch (error) {
    return plainAdjustmentResult(`${errorPrefix}: ${adjustmentErrorMessage(error)}`, true);
  }
}

function validatedRange(
  value: unknown,
  min: number,
  max: number,
  label: string
): number | ToolResult {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return atomicFailureFromError(new Error(`${label} must be a number between ${min} and ${max}`));
  }
  return value;
}

export function runGaussianBlur(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const radius = args.radius as number;
  return plainFilter(
    router,
    'filter.gaussian_blur',
    'apply_gaussian_blur',
    { radius },
    `Gaussian Blur applied with radius ${radius}px`,
    'Error applying Gaussian Blur'
  );
}

export function runSharpen(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const amount = args.amount as number;
  const radius = args.radius as number;
  const threshold = (args.threshold as number) || 0;
  return plainFilter(
    router,
    'filter.sharpen',
    'apply_sharpen',
    { amount, radius, threshold },
    `Unsharp Mask applied: amount ${amount}%, radius ${radius}px, threshold ${threshold}`,
    'Error applying sharpen'
  );
}

export function runNoise(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const amount = args.amount as number;
  const distribution = (args.distribution as string) || 'UNIFORM';
  const monochromatic = (args.monochromatic as boolean) || false;
  return plainFilter(
    router,
    'filter.noise',
    'apply_noise',
    { amount, distribution, monochromatic },
    `Add Noise applied: ${amount}% (${distribution}${monochromatic ? ', monochromatic' : ''})`,
    'Error applying noise'
  );
}

export function runMotionBlur(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const angle = args.angle as number;
  const radius = args.radius as number;
  return plainFilter(
    router,
    'filter.motion_blur',
    'apply_motion_blur',
    { angle, radius },
    `Motion Blur applied: angle ${angle}°, radius ${radius}px`,
    'Error applying motion blur'
  );
}

export async function runHighPass(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const radius = validatedRange(args.radius, 0.1, 250, 'radius');
  if (typeof radius !== 'number') return radius;
  try {
    await router.backendFor('filter.high_pass');
    const outcome = await invokeUxpOperation('apply_high_pass', { radius }, 'uxp_apply_high_pass_failed');
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_apply_high_pass_failed');
    return atomicSuccess(`High Pass filter applied (radius ${radius}px)`, {
      filter: outcome.data.filter,
      radius: outcome.data.radius,
      ...(outcome.data.context === undefined ? {} : { context: outcome.data.context }),
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

function smartMode(value: unknown): SmartBlurMode {
  return typeof value === 'string' && (SMART_BLUR_MODES as readonly string[]).includes(value)
    ? value as SmartBlurMode
    : 'NORMAL';
}

function smartQuality(value: unknown): SmartBlurQuality {
  return typeof value === 'string' && (SMART_BLUR_QUALITIES as readonly string[]).includes(value)
    ? value as SmartBlurQuality
    : 'MEDIUM';
}

export async function runSmartBlur(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const radius = validatedRange(args.radius, 0.1, 100, 'radius');
  if (typeof radius !== 'number') return radius;
  const threshold = validatedRange(args.threshold, 0.1, 100, 'threshold');
  if (typeof threshold !== 'number') return threshold;
  const mode = smartMode(args.mode);
  const quality = smartQuality(args.quality);
  try {
    await router.backendFor('filter.smart_blur');
    const outcome = await invokeUxpOperation(
      'apply_smart_blur',
      { radius, threshold, mode, quality },
      'uxp_apply_smart_blur_failed'
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_apply_smart_blur_failed');
    const details: Record<string, unknown> = {};
    for (const key of ['filter', 'radius', 'threshold', 'mode', 'quality']) {
      if (outcome.data[key] !== undefined) details[key] = outcome.data[key];
    }
    if (outcome.data.context !== undefined) details.context = outcome.data.context;
    return atomicSuccess(`Smart Blur applied (radius ${radius}px, threshold ${threshold})`, details);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
