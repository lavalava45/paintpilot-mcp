import { randomUUID } from 'node:crypto';
import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { invokeUxpOpenImage, invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import { assetDocumentTarget, errorMessage, type AssetArgs } from './asset-operation-shared.js';

export async function runPlaceImage(router: PhotoshopBackendRouter, args: AssetArgs): Promise<ToolResult> {
  const filePath = args.filePath as string;
  const x = typeof args.x === 'number' && Number.isFinite(args.x) ? args.x : 0;
  const y = typeof args.y === 'number' && Number.isFinite(args.y) ? args.y : 0;

  try {
    await router.backendFor('document.place');
    const outcome = await invokeUxpOperation(
      'place_image',
      { filePath, x, y, ...assetDocumentTarget(args) },
      'uxp_place_image_failed'
    );
    if (!outcome.ok) throw new Error(outcome.error ?? 'uxp_place_image_failed');
    return {
      content: [{
        type: 'text',
        text: `Image placed successfully: ${filePath}\nPosition (absolute top-left): (${x}, ${y})\nResult: ${JSON.stringify(outcome.data)}`,
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error placing image: ${errorMessage(error)}` }],
      isError: true,
    };
  }
}

function stableOpenCommandId(args: AssetArgs): string {
  const supplied = typeof args._guard_operation_id === 'string' ? args._guard_operation_id.trim() : '';
  return supplied || `direct-open-image-${randomUUID()}`;
}

function openFailureCode(message: string): 'uxp_bridge_unavailable' | 'file_not_found' | 'unknown' {
  if (message.includes('revision') || message.includes('plugin_not_connected')) return 'uxp_bridge_unavailable';
  if (message.includes('not exist') || message.includes('file')) return 'file_not_found';
  return 'unknown';
}

export async function runOpenImage(router: PhotoshopBackendRouter, args: AssetArgs): Promise<ToolResult> {
  const filePath = args.filePath as string;
  const commandId = stableOpenCommandId(args);
  try {
    await router.backendFor('document.open');
    const outcome = await invokeUxpOpenImage({ filePath }, commandId);
    if (!outcome.ok) {
      const message = outcome.error ?? 'unknown error';
      const durableNotExecuted = outcome.pre_dispatch_rejected || outcome.receipt?.state === 'not-claimed';
      const body = {
        ok: false,
        code: openFailureCode(message),
        message: `UXP open_image failed: ${message}`,
        command_id: commandId,
        uxp_command_receipt: outcome.receipt,
        ...(durableNotExecuted
          ? {
              execution: 'not-executed',
              next_required_action:
                'The UXP command was not claimed by Photoshop. A retry may use the same stable command identity.',
            }
          : {}),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
        isError: true,
      };
    }
    return atomicSuccess(
      `Image opened as a new document via UXP: ${filePath}`,
      {
        transport: 'uxp',
        command_id: commandId,
        uxp_command_receipt: outcome.receipt,
        ...(outcome.data ?? {}),
      },
      'photoshop_get_document_info'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
