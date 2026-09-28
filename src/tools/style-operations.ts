import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';

export const LAYER_STYLE_NAMES = ['drop_shadow', 'outer_glow', 'stroke', 'bevel_emboss'] as const;
type LayerStyleName = (typeof LAYER_STYLE_NAMES)[number];

function styleName(value: unknown): LayerStyleName {
  return typeof value === 'string' && (LAYER_STYLE_NAMES as readonly string[]).includes(value)
    ? value as LayerStyleName : 'drop_shadow';
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(candidate)));
}

export async function runApplyLayerStyle(
  router: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const style = styleName(args.style);
  const documentId = typeof args.document_id === 'number' && Number.isSafeInteger(args.document_id) && args.document_id > 0
    ? args.document_id : undefined;
  const payload = {
    style,
    red: boundedInteger(args.red, 0, 255, 0),
    green: boundedInteger(args.green, 0, 255, 0),
    blue: boundedInteger(args.blue, 0, 255, 0),
    opacity: boundedInteger(args.opacity, 0, 100, 60),
    size: boundedInteger(args.size, 0, 250, 10),
    distance: boundedInteger(args.distance, 0, 250, 8),
    angle: boundedInteger(args.angle, -360, 360, 120),
    ...(documentId === undefined ? {} : { document_id: documentId }),
  };
  try {
    await router.backendFor('layer.style.apply');
    const outcome = await invokeUxpOperation('apply_layer_style', payload, 'uxp_apply_layer_style_failed');
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_apply_layer_style_failed');
    return atomicSuccess(`Layer style ${style} applied`, { style, layer_name: outcome.data.layer_name });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
