import type { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { getPhotoshopCapabilities } from '../platform/capabilities.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';
import {
  atomicFailure,
  atomicFailureFromError,
  atomicSuccess,
} from './atomic-shared.js';

const SKY_ACTION_TIMEOUT_MS = 120_000;

export function createSkyReplacementTools(
  connection: PhotoshopConnection,
  backendRouter = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_sky_replacement',
        description:
          'Replace the sky using Photoshop native Sky Replacement when available.\\n\\n' +
          'Use when: a sky image path is provided and native Sky Replacement is supported.\\n' +
          'Fallback: use ps.composite_blend with semantic place/mask/blend tools for a manual composite.\\n\\n' +
          'Returns: JSON { ok, summary, details }.\\n' +
          'Preconditions: active document; optional sky_image_path for custom sky.',
        inputSchema: {
          type: 'object',
          properties: {
            sky_image_path: {
              type: 'string',
              description: 'Optional absolute path to a sky image file',
            },
          },
        },
      },
      handler: async (args) => skyReplacement(connection, backendRouter, args),
    },
  ];
}

async function skyReplacement(
  connection: PhotoshopConnection,
  backendRouter: PhotoshopBackendRouter,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const version = await connection.getVersion();
  const caps = getPhotoshopCapabilities(version);
  if (!caps.features.sky_replacement_native) {
    return atomicFailure({
      ok: false,
      code: 'version_unsupported',
      message: `Photoshop ${version} does not expose native Sky Replacement`,
      suggested_next_tool: 'photoshop_place_image',
    });
  }

  const skyPath = typeof args.sky_image_path === 'string' ? args.sky_image_path.trim() : '';
  try {
    await backendRouter.backendFor('sky.replace');
    const documentId =
      typeof args.document_id === 'number' && Number.isSafeInteger(args.document_id) && args.document_id > 0
        ? args.document_id
        : undefined;
    const result = await invokeUxpOperation(
      'sky_replacement',
      {
        ...(skyPath ? { sky_image_path: skyPath } : {}),
        ...(documentId !== undefined ? { document_id: documentId } : {}),
      },
      'uxp_sky_replacement_failed',
      SKY_ACTION_TIMEOUT_MS
    );
    if (!result.ok || !result.data) throw new Error(result.error ?? 'uxp_sky_replacement_failed');
    if (result.data.ok === false) {
      return atomicFailure({
        ok: false,
        code: result.data.code === 'no_active_document' ? 'no_active_document' : 'unknown',
        message:
          typeof result.data.message === 'string'
            ? result.data.message
            : 'Native Sky Replacement failed',
        suggested_next_tool: 'photoshop_place_image',
      });
    }
    return atomicSuccess(
      typeof result.data.summary === 'string'
        ? result.data.summary
        : 'Native Sky Replacement completed',
      result.data.details && typeof result.data.details === 'object' && !Array.isArray(result.data.details)
        ? (result.data.details as Record<string, unknown>)
        : undefined,
      'photoshop_get_preview'
    );
  } catch (error) {
    return atomicFailureFromError(error, {
      suggested_next_tool: 'photoshop_place_image',
    });
  }
}
