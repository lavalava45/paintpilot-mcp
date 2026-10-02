import { randomUUID } from 'node:crypto';
import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  invokeUxpCreateDocument,
  invokeUxpOperation,
  invokeUxpSaveDocument,
  type UxpSaveFormat,
} from '../platform/uxp-bridge-client.js';
import { atomicFailure, atomicFailureFromError, atomicSuccess } from './atomic-shared.js';

type Args = Record<string, unknown>;
type ActiveTarget = { document_id: number } | { index: number } | { document_name: string };

function positiveDocumentId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function plainText(text: string, isError = false): ToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text }],
  };
}

function chosenActiveTarget(args: Args): ActiveTarget | null {
  const candidates: ActiveTarget[] = [];
  if (args.document_id !== undefined && args.document_id !== null) {
    candidates.push({ document_id: args.document_id as number });
  }
  if (args.index !== undefined && args.index !== null) {
    candidates.push({ index: args.index as number });
  }
  if (typeof args.document_name === 'string' && args.document_name.length > 0) {
    candidates.push({ document_name: args.document_name });
  }
  return candidates.length === 1 ? candidates[0]! : null;
}

function createCommandId(args: Args): string {
  const guardId = typeof args._guard_operation_id === 'string' ? args._guard_operation_id.trim() : '';
  return guardId || `direct-create-document-${randomUUID()}`;
}

function normalizedColorMode(value: unknown): 'RGB' | 'CMYK' | 'Grayscale' {
  return value === 'CMYK' || value === 'Grayscale' ? value : 'RGB';
}

export async function runCreateDocument(
  router: PhotoshopBackendRouter,
  args: Args
): Promise<ToolResult> {
  const width = args.width as number;
  const height = args.height as number;
  const resolution = (args.resolution as number) || 72;
  const colorMode = normalizedColorMode(args.colorMode);
  const commandId = createCommandId(args);

  try {
    await router.backendFor('document.create');
    const outcome = await invokeUxpCreateDocument(
      { width, height, resolution, colorMode },
      commandId
    );

    if (!outcome.ok) {
      const bridgeUnavailable = /revision|plugin_not_connected/.test(outcome.error ?? '');
      const definitelyNotExecuted = outcome.pre_dispatch_rejected || outcome.receipt?.state === 'not-claimed';
      return {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            code: bridgeUnavailable ? 'uxp_bridge_unavailable' : 'unknown',
            message: `UXP create_document failed: ${outcome.error ?? 'unknown error'}`,
            command_id: commandId,
            uxp_command_receipt: outcome.receipt,
            ...(definitelyNotExecuted ? {
              execution: 'not-executed',
              next_required_action:
                'The UXP command was not claimed by Photoshop. A retry may use the same stable command identity.',
            } : {}),
          }, null, 2),
        }],
      };
    }

    return atomicSuccess(
      `Document created via UXP: ${width}x${height}px at ${resolution}dpi (${colorMode})`,
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

export async function runDocumentInfo(router: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    const info = await router.readDocumentInfo();
    return plainText(`Document info:\n${JSON.stringify(info, null, 2)}`);
  } catch (error) {
    return plainText(
      `Error getting document info: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }
}

export async function runListDocuments(router: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    const value = await router.listDocuments();
    if (value.ok === false) {
      const message = String(value.message || 'Failed to list documents');
      return atomicFailure({
        code: 'extendscript_runtime_error',
        ok: false,
        suggested_next_tool: 'photoshop_get_state',
        message,
      });
    }

    const count = typeof value.count === 'number' ? value.count : 0;
    const summary = count > 0 ? `${count} open document${count === 1 ? '' : 's'}` : 'No documents open';
    const nextTool = count > 0 ? 'photoshop_get_document_info' : 'photoshop_create_document';
    const details: Record<string, unknown> = {
      active_document_id: value.active_document_id ?? null,
      documents: value.documents ?? [],
      count,
    };
    if (value.context !== undefined) details.context = value.context;
    return atomicSuccess(summary, details, nextTool);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runSetActiveDocument(
  router: PhotoshopBackendRouter,
  args: Args
): Promise<ToolResult> {
  const target = chosenActiveTarget(args);
  if (!target) {
    return atomicFailure({
      ok: false,
      code: 'invalid_arguments',
      message: 'Exactly one of document_id, index, or document_name is required to set the active document',
      suggested_next_tool: 'photoshop_list_documents',
    });
  }

  try {
    await router.backendFor('document.activate');
    const outcome = await invokeUxpOperation(
      'set_active_document',
      target,
      'uxp_set_active_document_failed'
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_set_active_document_failed');

    if (outcome.data.ok === false) {
      const reported = outcome.data.code;
      const code = reported === 'document_not_found' || reported === 'ambiguous_name' ? reported : 'unknown';
      return atomicFailure({
        ok: false,
        code,
        message: String(outcome.data.message || 'Failed to set active document'),
        suggested_next_tool: 'photoshop_list_documents',
        ...((code === 'document_not_found' || code === 'ambiguous_name')
          ? { execution: 'not-executed' as const }
          : {}),
        ...(Array.isArray(outcome.data.matching_document_ids)
          ? { suggested_args: { matching_document_ids: outcome.data.matching_document_ids } }
          : {}),
      });
    }

    const activated = outcome.data.activated as { id?: number; name?: string } | undefined;
    return atomicSuccess(
      activated?.name ? `Active document set to "${activated.name}"` : 'Active document switched',
      {
        ui_effect: {
          classification: 'ui-activating-navigation',
          may_foreground_photoshop: true,
          eligible_for_no_focus_acceptance: false,
        },
        ...(activated ? { activated } : {}),
        ...(outcome.data.context === undefined ? {} : { context: outcome.data.context }),
      },
      'photoshop_get_document_info'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runSaveDocument(args: Args): Promise<ToolResult> {
  const path = typeof args.path === 'string' ? args.path : '';
  if (!path.trim()) {
    return atomicFailure({ ok: false, code: 'invalid_arguments', message: 'path is required for photoshop_save_document' });
  }

  const format = String(args.format || 'PSD').toUpperCase() as UxpSaveFormat;
  const quality = (args.quality as number) || 8;

  try {
    const outcome = await invokeUxpSaveDocument({
      path,
      format,
      quality,
      ...(typeof args.document_id === 'number' ? { document_id: args.document_id } : {}),
    });
    if (!outcome.ok) {
      const unavailable = outcome.error === 'uxp_bridge_unavailable';
      return atomicFailure({
        ok: false,
        code: unavailable ? 'uxp_bridge_unavailable' : 'unknown',
        message: unavailable
          ? 'Non-interfering persistence requires the Photoshop MCP UXP Bridge; COM/ExtendScript fallback is intentionally disabled for save/checkpoint.'
          : `UXP save failed: ${outcome.error ?? 'unknown error'}`,
        suggested_next_tool: unavailable ? 'photoshop_get_capabilities' : 'photoshop_get_state',
      });
    }
    if (outcome.data?.invariants_ok === false) {
      return atomicFailure({
        ok: false,
        code: 'unknown',
        message: `UXP save completed but persistence invariants changed: ${JSON.stringify(outcome.data.invariants ?? {})}`,
        suggested_next_tool: 'photoshop_get_state',
      });
    }

    return atomicSuccess(
      `Document copy saved as ${format} via UXP to: ${path}`,
      {
        persistence: {
          transport: 'uxp',
          as_copy: true,
          path,
          format,
          invariants_ok: outcome.data?.invariants_ok ?? null,
          invariants: outcome.data?.invariants ?? null,
          before: outcome.data?.before ?? null,
          after: outcome.data?.after ?? null,
        },
      },
      'photoshop_get_state'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runCloseDocument(
  router: PhotoshopBackendRouter,
  args: Args
): Promise<ToolResult> {
  const suppliedDocumentId = Object.prototype.hasOwnProperty.call(args, 'document_id');
  const documentId = positiveDocumentId(args.document_id);
  if (suppliedDocumentId && documentId === undefined) {
    return atomicFailure({
      ok: false,
      code: 'invalid_arguments',
      message: 'document_id must be a positive integer',
      suggested_next_tool: 'photoshop_list_documents',
    });
  }

  const save = args.save === true;
  try {
    await router.backendFor('document.close');
    const outcome = await invokeUxpOperation(
      'close_document',
      { save, ...(documentId === undefined ? {} : { document_id: documentId }) },
      'uxp_close_document_failed'
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_close_document_failed');
    if (outcome.data.ok === false) {
      const code = outcome.data.code === 'document_not_found' ? 'document_not_found' : 'unknown';
      return atomicFailure({
        ok: false,
        code,
        message: String(outcome.data.message || 'Failed to close document'),
        suggested_next_tool: code === 'document_not_found' ? 'photoshop_list_documents' : 'photoshop_get_state',
      });
    }
    return plainText(save ? 'Document closed and saved' : 'Document closed without saving');
  } catch (error) {
    return plainText(`Error closing document: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
