import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopErrorCode } from '../errors/envelope.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { invokeUxpApplyGradientMask, invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailure, atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import { selectionDocumentId, type SelectionArgs } from './selection-operation-shared.js';

export type GradientMaskDirection = 'top_to_bottom' | 'bottom_to_top' | 'left_to_right' | 'right_to_left';
export const GRADIENT_MASK_DIRECTIONS: readonly GradientMaskDirection[] = [
  'top_to_bottom',
  'bottom_to_top',
  'left_to_right',
  'right_to_left',
];

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function gradientDirection(value: unknown): GradientMaskDirection {
  return typeof value === 'string' && GRADIENT_MASK_DIRECTIONS.includes(value as GradientMaskDirection)
    ? value as GradientMaskDirection
    : 'bottom_to_top';
}

function clippingFailure(data: Record<string, unknown>): ToolResult | undefined {
  if (data.ok !== false) return undefined;
  const raw = typeof data.code === 'string' ? data.code : 'extendscript_runtime_error';
  const accepted = new Set<PhotoshopErrorCode>([
    'extendscript_runtime_error',
    'not_clipping',
    'no_base_layer_below',
    'layer_not_found',
    'no_active_document',
    'no_active_layer',
  ]);
  const code: PhotoshopErrorCode = raw === 'no_document'
    ? 'no_active_document'
    : accepted.has(raw as PhotoshopErrorCode)
      ? raw as PhotoshopErrorCode
      : 'extendscript_runtime_error';
  return atomicFailure({
    ok: false,
    code,
    message: String(data.message || 'Clipping mask operation failed'),
    suggested_next_tool: typeof data.suggested_next_tool === 'string'
      ? data.suggested_next_tool
      : code === 'no_base_layer_below' || code === 'not_clipping'
        ? 'photoshop_get_layers'
        : 'photoshop_get_state',
  });
}

function clippingDetails(data: Record<string, unknown>, includeAlready: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of includeAlready
    ? ['layer_name', 'is_clipping', 'already_clipping']
    : ['layer_name', 'is_clipping']) {
    if (data[key] !== undefined) result[key] = data[key];
  }
  if (data.context !== undefined) result.context = data.context;
  return result;
}

async function clippingMutation(
  router: PhotoshopBackendRouter,
  args: SelectionArgs,
  mode: 'create' | 'release'
): Promise<ToolResult> {
  const layerName = typeof args.layer_name === 'string' ? args.layer_name.trim() : undefined;
  const action = mode === 'create' ? 'create_clipping_mask' : 'release_clipping_mask';
  const fallback = mode === 'create' ? 'uxp_create_clipping_mask_failed' : 'uxp_release_clipping_mask_failed';
  try {
    await router.backendFor(mode === 'create' ? 'layer.clipping.create' : 'layer.clipping.release');
    const outcome = await invokeUxpOperation(action, layerName ? { layer_name: layerName } : {}, fallback);
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? fallback);
    const semanticFailure = clippingFailure(outcome.data);
    if (semanticFailure) return semanticFailure;
    const verb = mode === 'create' ? 'created on' : 'released from';
    return atomicSuccess(
      layerName ? `Clipping mask ${verb} "${layerName}"` : `Clipping mask ${verb} active layer`,
      clippingDetails(outcome.data, mode === 'create')
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export const runCreateClippingMask = (router: PhotoshopBackendRouter, args: SelectionArgs) =>
  clippingMutation(router, args, 'create');

export const runReleaseClippingMask = (router: PhotoshopBackendRouter, args: SelectionArgs) =>
  clippingMutation(router, args, 'release');

export async function runApplyGradientMask(router: PhotoshopBackendRouter, args: SelectionArgs): Promise<ToolResult> {
  const direction = gradientDirection(args.direction);
  const startPct = boundedInteger(args.start_pct, 0, 100, 0);
  const endPct = boundedInteger(args.end_pct, 0, 100, 100);
  const angleDeg = typeof args.angle_deg === 'number' ? args.angle_deg : undefined;
  try {
    await router.backendFor('layer.mask.gradient');
    const id = selectionDocumentId(args);
    const outcome = await invokeUxpApplyGradientMask({
      ...(id === undefined ? {} : { document_id: id }),
      ...(args.layer_id === undefined ? {} : { layer_id: args.layer_id as number }),
      direction,
      start_pct: startPct,
      end_pct: endPct,
      ...(angleDeg === undefined ? {} : { angle_deg: angleDeg }),
    });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_apply_gradient_mask_failed');
    return atomicSuccess('Gradient applied on layer mask', outcome.data);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
