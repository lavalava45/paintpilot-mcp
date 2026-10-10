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

async function protectedBlur(router: PhotoshopBackendRouter, primitive: PhotoshopPrimitive, action: string, args: AdjustmentArgs, payload: Record<string, unknown>, summary: string): Promise<ToolResult> {
  if (typeof args.layer_id !== 'number' || !Number.isSafeInteger(args.layer_id) || args.layer_id <= 0) return atomicFailureFromError(new Error('blur_target_layer_required: explicit numeric layer_id is required'));
  try {
    await router.backendFor(primitive);
    // Dedicated guarded actions fail safely on old UXP builds; never fall back to their destructive commands.
    const outcome = await invokeUxpOperation(action, { ...payload, layer_id: args.layer_id, ...(args.document_id !== undefined ? { document_id: args.document_id } : {}) }, 'uxp_guarded_blur_failed');
    if (!outcome.ok || !outcome.data) {
      if (/unknown.*(?:action|command)|(?:action|command).*unknown/i.test(outcome.error ?? '')) throw new Error('uxp_guarded_blur_unavailable: reload the installed UXP plugin after the current operation; destructive fallback is forbidden');
      throw new Error(outcome.error ?? 'uxp_guarded_blur_failed');
    }
    if (outcome.data.original_preserved !== true || outcome.data.smart_filter_mask !== true || outcome.data.filter_mode !== 'smart-filter'
      || outcome.data.source_layer_id !== args.layer_id || !Number.isSafeInteger(outcome.data.layer_id) || Number(outcome.data.layer_id) <= 0) throw new Error('guarded_blur_preservation_unconfirmed: do not replay; reconcile the operation');
    return atomicSuccess(summary, outcome.data);
  } catch (error) { return atomicFailureFromError(error); }
}

export function runGaussianBlur(router: PhotoshopBackendRouter, args: AdjustmentArgs): Promise<ToolResult> {
  const radius = validatedRange(args.radius, 0.1, 250, 'radius');
  if (typeof radius !== 'number') return Promise.resolve(radius);
  return protectedBlur(router, 'filter.gaussian_blur', 'apply_guarded_gaussian_blur', args, { radius }, `Gaussian Smart Filter applied with radius ${radius}px`);
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
  const angle = validatedRange(args.angle, -360, 360, 'angle');
  if (typeof angle !== 'number') return Promise.resolve(angle);
  const radius = validatedRange(args.radius, 1, 999, 'radius');
  if (typeof radius !== 'number') return Promise.resolve(radius);
  return protectedBlur(router, 'filter.motion_blur', 'apply_guarded_motion_blur', args, { angle, radius }, `Motion Blur Smart Filter applied: angle ${angle}°, radius ${radius}px`);
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
  return protectedBlur(router, 'filter.smart_blur', 'apply_guarded_smart_blur', args,
    { radius, threshold, mode, quality }, `Smart Blur applied (radius ${radius}px, threshold ${threshold})`);
}
