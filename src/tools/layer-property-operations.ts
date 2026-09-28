import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  invokeUxpDuplicateLayer,
  invokeUxpOperation,
  invokeUxpRenameLayer,
  invokeUxpSetLayerBlendMode,
  invokeUxpSetLayerLocked,
  invokeUxpSetLayerOpacity,
  invokeUxpSetLayerVisibility,
} from '../platform/uxp-bridge-client.js';
import { resolveLayerBlendMode } from './blend-mode.js';
import { documentId, errorMessage, textResult, type LayerArgs } from './layer-operation-shared.js';

type Gate = Parameters<PhotoshopBackendRouter['backendFor']>[0];

function target(args: LayerArgs): Record<string, number> {
  const id = documentId(args);
  return id === undefined ? {} : { document_id: id };
}

async function simpleMutation(
  router: PhotoshopBackendRouter,
  primitive: Gate,
  invoke: () => Promise<{ ok: boolean; error?: string }>,
  success: string,
  failurePrefix: string,
  fallbackError: string
): Promise<ToolResult> {
  try {
    await router.backendFor(primitive);
    const outcome = await invoke();
    if (!outcome.ok) throw new Error(outcome.error ?? fallbackError);
    return textResult(success);
  } catch (error) {
    return textResult(`${failurePrefix}: ${errorMessage(error)}`, true);
  }
}

export function runSetLayerOpacity(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const opacity = args.opacity as number;
  return simpleMutation(
    router,
    'layer.opacity.write',
    () => invokeUxpSetLayerOpacity({ ...target(args), opacity }),
    `Layer opacity set to ${opacity}%`,
    'Error setting layer opacity',
    'uxp_set_layer_opacity_failed'
  );
}

export function runSetLayerBlendMode(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const requested = typeof args.blendMode === 'string' ? args.blendMode : '';
  if (!resolveLayerBlendMode(requested)) {
    return Promise.resolve(textResult(`Error setting blend mode: unknown blendMode "${requested}"`, true));
  }
  return simpleMutation(
    router,
    'layer.blend_mode.write',
    () => invokeUxpSetLayerBlendMode({ ...target(args), blendMode: requested }),
    `Layer blend mode set to ${requested}`,
    'Error setting blend mode',
    'uxp_set_layer_blend_mode_failed'
  );
}

export function runSetLayerVisibility(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const visible = args.visible as boolean;
  return simpleMutation(
    router,
    'layer.visibility.write',
    () => invokeUxpSetLayerVisibility({ ...target(args), visible }),
    `Layer ${visible ? 'shown' : 'hidden'}`,
    'Error setting layer visibility',
    'uxp_set_layer_visibility_failed'
  );
}

export function runSetLayerLocked(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const locked = args.locked as boolean;
  return simpleMutation(
    router,
    'layer.locked.write',
    () => invokeUxpSetLayerLocked({ ...target(args), locked }),
    `Layer ${locked ? 'locked' : 'unlocked'}`,
    'Error locking/unlocking layer',
    'uxp_set_layer_locked_failed'
  );
}

export async function runRenameLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const name = args.name as string;
  try {
    await router.backendFor('layer.rename');
    const outcome = await invokeUxpRenameLayer({ ...target(args), name });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_rename_layer_failed');
    return textResult(`Layer renamed to: ${name}\nResult: ${JSON.stringify(outcome.data)}`);
  } catch (error) {
    return textResult(`Error renaming layer: ${errorMessage(error)}`, true);
  }
}

export async function runDuplicateLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const newName = typeof args.newName === 'string' ? args.newName : undefined;
  try {
    await router.backendFor('layer.duplicate');
    const outcome = await invokeUxpDuplicateLayer({
      ...target(args),
      ...(newName === undefined ? {} : { newName }),
    });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_duplicate_layer_failed');
    return textResult(`Layer duplicated\nResult: ${JSON.stringify(outcome.data)}`);
  } catch (error) {
    return textResult(`Error duplicating layer: ${errorMessage(error)}`, true);
  }
}

async function plainOperation(
  router: PhotoshopBackendRouter,
  primitive: Gate,
  action: string,
  args: LayerArgs,
  fallbackError: string,
  success: string,
  failurePrefix: string,
  requireData = false
): Promise<ToolResult> {
  try {
    await router.backendFor(primitive);
    const outcome = await invokeUxpOperation(action, target(args), fallbackError);
    if (!outcome.ok || (requireData && !outcome.data)) throw new Error(outcome.error ?? fallbackError);
    return textResult(requireData ? `${success}\nResult: ${JSON.stringify(outcome.data)}` : success);
  } catch (error) {
    return textResult(`${failurePrefix}: ${errorMessage(error)}`, true);
  }
}

export function runMergeVisibleLayers(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  return plainOperation(
    router, 'layer.merge_visible', 'merge_visible_layers', args,
    'uxp_merge_visible_layers_failed', 'All visible layers merged', 'Error merging visible layers'
  );
}

export function runFlattenImage(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  return plainOperation(
    router, 'layer.flatten', 'flatten_image', args,
    'uxp_flatten_image_failed', 'Image flattened (all layers merged to background)', 'Error flattening image'
  );
}

export function runRasterizeLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  return plainOperation(
    router, 'layer.rasterize', 'rasterize_layer', args,
    'uxp_rasterize_layer_failed', 'Layer rasterized', 'Error rasterizing layer', true
  );
}
