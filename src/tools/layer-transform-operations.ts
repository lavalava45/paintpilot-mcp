import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import { currentToolExecutionContext } from '../core/execution-context.js';
import { documentId, errorMessage, textResult, type LayerArgs } from './layer-operation-shared.js';

interface TransformSpec {
  primitive: PhotoshopPrimitive;
  action: string;
  errorCode: string;
  successText: (data: Record<string, unknown>) => string;
  errorPrefix: string;
  payload: Record<string, unknown>;
}

export async function runGuardedTransformLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  try {
    if (!currentToolExecutionContext()?.guardOperationId) throw new Error('transform_guard_dispatch_required');
    const id = documentId(args);
    const layerId = Number(args.layer_id);
    const translation = args.translation as { x?: number; y?: number } | undefined;
    if (!id || !Number.isSafeInteger(layerId) || layerId < 1 || !translation
      || !Number.isFinite(translation.x) || !Number.isFinite(translation.y)
      || (translation.x === 0 && translation.y === 0)
      || Math.abs(translation.x!) > 128 || Math.abs(translation.y!) > 128) {
      throw new Error('transform_parameters_invalid: positive document/layer ids and nonzero translation <=128px required');
    }
    const backend = await router.backendFor('layer.move_pixels');
    if (backend.kind !== 'uxp') throw new Error('transform_native_uxp_required');
    const outcome = await invokeUxpOperation('transform_layer', {
      document_id: id, layer_id: layerId, translation,
    }, 'uxp_transform_layer_failed');
    if (!outcome.ok || !outcome.data || outcome.data.transformed !== true
        || outcome.data.layer_id !== layerId) throw new Error(outcome.error ?? 'transform_receipt_invalid');
    return atomicSuccess('Guarded native layer transform completed', outcome.data);
  } catch (error) { return atomicFailureFromError(error); }
}

async function executeTransform(
  router: PhotoshopBackendRouter,
  args: LayerArgs,
  spec: TransformSpec
): Promise<ToolResult> {
  try {
    await router.backendFor(spec.primitive);
    const id = documentId(args);
    const outcome = await invokeUxpOperation(
      spec.action,
      { ...(id === undefined ? {} : { document_id: id }), ...spec.payload },
      spec.errorCode
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? spec.errorCode);
    return textResult(spec.successText(outcome.data));
  } catch (error) {
    return textResult(`${spec.errorPrefix}: ${errorMessage(error)}`, true);
  }
}

export function runFitLayerToDocument(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const fillDocument = (args.fillDocument as boolean) || false;
  return executeTransform(router, args, {
    primitive: 'layer.fit',
    action: 'fit_layer_to_document',
    errorCode: 'uxp_fit_layer_to_document_failed',
    payload: { fillDocument },
    successText: (data) => `Layer ${fillDocument ? 'filled' : 'fitted'} to document\nResult: ${JSON.stringify(data)}`,
    errorPrefix: 'Error fitting layer to document',
  });
}

export function runScaleLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const scalePercent = args.scalePercent as number;
  const centerAnchor = args.centerAnchor !== undefined ? (args.centerAnchor as boolean) : true;
  return executeTransform(router, args, {
    primitive: 'layer.scale',
    action: 'scale_layer',
    errorCode: 'uxp_scale_layer_failed',
    payload: { scalePercent, centerAnchor },
    successText: (data) => `Layer scaled to ${scalePercent}%\nResult: ${JSON.stringify(data)}`,
    errorPrefix: 'Error scaling layer',
  });
}

export async function runMoveLayerPixels(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const deltaX = args.deltaX as number;
  const deltaY = args.deltaY as number;
  if (args.connected_move !== undefined) {
    try {
      if (!currentToolExecutionContext()?.guardOperationId) {
        throw new Error('connected_move_guard_dispatch_required: raw unguarded Photoshop mutations are prohibited');
      }
      if (typeof deltaX !== 'number' || !Number.isFinite(deltaX)
          || typeof deltaY !== 'number' || !Number.isFinite(deltaY)
          || (deltaX === 0 && deltaY === 0) || Math.abs(deltaX) > 512 || Math.abs(deltaY) > 512) {
        throw new Error('connected_move_delta_invalid: finite nonzero offset within 512 px required');
      }
      if (!args.connected_move || typeof args.connected_move !== 'object' || Array.isArray(args.connected_move)) {
        throw new Error('connected_move_manifest_invalid');
      }
      // No COM fallback: only the matching native UXP History transaction can
      // certify the pixel-owner move as one reversible action.
      const backend = await router.backendFor('layer.move_pixels');
      if (backend.kind !== 'uxp') throw new Error('connected_move_requires_native_uxp');
      const id = documentId(args);
      if (id === undefined) throw new Error('connected_move_document_id_required');
      const outcome = await invokeUxpOperation('move_layer_pixels', {
        document_id: id, deltaX, deltaY, connected_move: args.connected_move,
      }, 'uxp_connected_move_failed');
      if (!outcome.ok || !outcome.data || outcome.data.connected !== true
          || outcome.data.moved !== true || outcome.data.history_steps !== 1
          || !Array.isArray(outcome.data.layer_receipts)) {
        throw new Error(outcome.error ?? 'connected_move_native_receipt_unproven');
      }
      return atomicSuccess('Connected owner layers moved in one native History transaction', outcome.data);
    } catch (error) { return atomicFailureFromError(error); }
  }
  return executeTransform(router, args, {
    primitive: 'layer.move_pixels',
    action: 'move_layer_pixels',
    errorCode: 'uxp_move_layer_pixels_failed',
    payload: { deltaX, deltaY },
    successText: (data) => `Layer moved by (${deltaX}, ${deltaY})px\nResult: ${JSON.stringify(data)}`,
    errorPrefix: 'Error moving layer',
  });
}

export function runRotateLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const degrees = args.degrees as number;
  return executeTransform(router, args, {
    primitive: 'layer.rotate',
    action: 'rotate_layer',
    errorCode: 'uxp_rotate_layer_failed',
    payload: { degrees },
    successText: (data) => `Layer rotated ${degrees} degrees\nResult: ${JSON.stringify(data)}`,
    errorPrefix: 'Error rotating layer',
  });
}
