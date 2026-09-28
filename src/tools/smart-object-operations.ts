import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import {
  assetDocumentTarget,
  errorMessage,
  optionalLayerName,
  type AssetArgs,
} from './asset-operation-shared.js';

function selectedDetails(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const key of keys) {
    if (data[key] !== undefined) details[key] = data[key];
  }
  return details;
}

async function invokeSmartObject(
  router: PhotoshopBackendRouter,
  primitive: PhotoshopPrimitive,
  action: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await router.backendFor(primitive);
  const outcome = await invokeUxpOperation(action, payload, `uxp_${action}_failed`);
  if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? `uxp_${action}_failed`);
  return outcome.data;
}

export async function runConvertToSmartObject(
  router: PhotoshopBackendRouter,
  args: AssetArgs
): Promise<ToolResult> {
  const layerName = optionalLayerName(args);
  try {
    const data = await invokeSmartObject(
      router,
      'smart_object.convert',
      'convert_to_smart_object',
      { ...(layerName ? { layer_name: layerName } : {}), ...assetDocumentTarget(args) }
    );
    return atomicSuccess(
      layerName ? `Layer "${layerName}" converted to Smart Object` : 'Active layer converted to Smart Object',
      selectedDetails(data, ['layer_name', 'kind', 'already_smart_object', 'context'])
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function validateReplacementFile(args: AssetArgs): Promise<string | ToolResult> {
  const filePath = typeof args.file_path === 'string' ? args.file_path.trim() : '';
  if (!filePath) return atomicFailureFromError(new Error('file_path is required.'));
  if (!isAbsolute(filePath)) return atomicFailureFromError(new Error('file_path must be an absolute path.'));
  try {
    await stat(filePath);
    return filePath;
  } catch (error) {
    return atomicFailureFromError(new Error(`Replacement file not found: ${filePath} (${errorMessage(error)})`));
  }
}

export async function runReplaceSmartObjectContents(
  router: PhotoshopBackendRouter,
  args: AssetArgs
): Promise<ToolResult> {
  const validated = await validateReplacementFile(args);
  if (typeof validated !== 'string') return validated;
  const layerName = optionalLayerName(args);
  try {
    const data = await invokeSmartObject(
      router,
      'smart_object.replace',
      'replace_smart_object_contents',
      {
        file_path: validated,
        ...(layerName ? { layer_name: layerName } : {}),
        ...assetDocumentTarget(args),
      }
    );
    return atomicSuccess(
      `Smart Object contents replaced from ${validated}`,
      selectedDetails(data, ['layer_name', 'file_path', 'context'])
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runEditSmartObjectContents(
  router: PhotoshopBackendRouter,
  args: AssetArgs
): Promise<ToolResult> {
  const layerName = optionalLayerName(args);
  try {
    const data = await invokeSmartObject(
      router,
      'smart_object.edit',
      'edit_smart_object_contents',
      { ...(layerName ? { layer_name: layerName } : {}), ...assetDocumentTarget(args) }
    );
    return atomicSuccess(
      'Smart Object opened for editing — active document is now the embedded contents',
      selectedDetails(data, ['parent_document', 'embedded_document', 'layer_name', 'context'])
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runCreateSmartObjectViaCopy(
  router: PhotoshopBackendRouter,
  args: AssetArgs
): Promise<ToolResult> {
  const layerName = optionalLayerName(args);
  try {
    const data = await invokeSmartObject(
      router,
      'smart_object.copy',
      'create_smart_object_via_copy',
      { ...(layerName ? { layer_name: layerName } : {}), ...assetDocumentTarget(args) }
    );
    return atomicSuccess(
      'New Smart Object created via copy',
      selectedDetails(data, ['source_layer_name', 'new_layer_name', 'kind', 'context'])
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
