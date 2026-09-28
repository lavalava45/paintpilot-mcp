import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';

export function residualDocumentTarget(args: Record<string, unknown>): Record<string, number> {
  const id = args.document_id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? { document_id: id } : {};
}

export async function dispatchResidualUxp(
  router: PhotoshopBackendRouter,
  primitive: PhotoshopPrimitive,
  action: string,
  payload: Record<string, unknown>,
  errorCode: string,
  timeout?: number
): Promise<unknown> {
  await router.backendFor(primitive);
  const result = await invokeUxpOperation(action, payload, errorCode, timeout);
  if (!result.ok) throw new Error(result.error ?? errorCode);
  return result.data;
}
