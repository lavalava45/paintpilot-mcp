import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { invokeUxpMoveLayer } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import { documentId, type LayerArgs } from './layer-operation-shared.js';

type RelativePosition = 'ABOVE' | 'BELOW' | 'TOP' | 'BOTTOM';
type SimplePosition = 'TOP' | 'BOTTOM' | 'UP' | 'DOWN';

function normalizedRelativeTarget(args: LayerArgs): { targetLayerId?: number; targetLayerName?: string } {
  const targetLayerName = typeof args.targetLayerName === 'string' && args.targetLayerName.trim()
    ? args.targetLayerName.trim()
    : undefined;
  const targetLayerId = typeof args.targetLayerId === 'number' && Number.isFinite(args.targetLayerId)
    ? Math.trunc(args.targetLayerId)
    : undefined;
  return {
    ...(targetLayerId === undefined ? {} : { targetLayerId }),
    ...(targetLayerName === undefined ? {} : { targetLayerName }),
  };
}

function normalizeTopBottom(data: Record<string, unknown>, position: string): Record<string, unknown> {
  if (position !== 'TOP' && position !== 'BOTTOM') return data;
  return {
    moved: data.moved,
    layerName: data.layerName,
    layerId: data.layerId,
    position,
    context: data.context,
  };
}

export async function runMoveLayerToPosition(
  router: PhotoshopBackendRouter,
  args: LayerArgs
): Promise<ToolResult> {
  const position = args.position as string;
  const relative = normalizedRelativeTarget(args);
  if ((position === 'ABOVE' || position === 'BELOW') && relative.targetLayerId === undefined && !relative.targetLayerName) {
    return atomicFailureFromError(
      new Error('Invalid arguments: ABOVE/BELOW requires targetLayerId or targetLayerName'),
      { code: 'invalid_arguments' }
    );
  }

  try {
    await router.backendFor('layer.order.write');
    const id = documentId(args);
    const outcome = await invokeUxpMoveLayer({
      ...(id === undefined ? {} : { document_id: id }),
      position: position as RelativePosition,
      ...relative,
    });
    if (!outcome.ok || !outcome.data) {
      return atomicFailureFromError(new Error(outcome.error ?? 'uxp_move_layer_failed'));
    }
    return atomicSuccess(
      `Layer moved ${position}`,
      normalizeTopBottom(outcome.data, position),
      'photoshop_get_layers'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function executeSimpleMove(
  router: PhotoshopBackendRouter,
  args: LayerArgs,
  position: SimplePosition
): Promise<Record<string, unknown>> {
  await router.backendFor('layer.order.write');
  const id = documentId(args);
  const outcome = await invokeUxpMoveLayer({
    ...(id === undefined ? {} : { document_id: id }),
    position,
  });
  if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_move_layer_failed');
  return outcome.data;
}

async function simpleResult(
  router: PhotoshopBackendRouter,
  args: LayerArgs,
  position: SimplePosition,
  summary: string
): Promise<ToolResult> {
  try {
    return atomicSuccess(summary, await executeSimpleMove(router, args, position), 'photoshop_get_layers');
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export const runMoveLayerToTop = (router: PhotoshopBackendRouter, args: LayerArgs) =>
  simpleResult(router, args, 'TOP', 'Layer moved to top');
export const runMoveLayerToBottom = (router: PhotoshopBackendRouter, args: LayerArgs) =>
  simpleResult(router, args, 'BOTTOM', 'Layer moved to bottom');
export const runMoveLayerUp = (router: PhotoshopBackendRouter, args: LayerArgs) =>
  simpleResult(router, args, 'UP', 'Layer moved up');
export const runMoveLayerDown = (router: PhotoshopBackendRouter, args: LayerArgs) =>
  simpleResult(router, args, 'DOWN', 'Layer moved down');
