import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { documentId, errorMessage, textResult, type LayerArgs } from './layer-operation-shared.js';

interface TransformSpec {
  primitive: PhotoshopPrimitive;
  action: string;
  errorCode: string;
  successText: (data: Record<string, unknown>) => string;
  errorPrefix: string;
  payload: Record<string, unknown>;
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

export function runMoveLayerPixels(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const deltaX = args.deltaX as number;
  const deltaY = args.deltaY as number;
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
