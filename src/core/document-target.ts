import { AsyncLocalStorage } from 'node:async_hooks';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './tool-registry.js';

const targetDocumentId = new AsyncLocalStorage<number | undefined>();

/** Tools that already manage documents themselves, or never target a document. */
export const DOCUMENT_ID_SCHEMA_EXCLUDES = new Set([
  'photoshop_ping',
  'photoshop_get_version',
  'photoshop_get_capabilities',
  'photoshop_list_documents',
  'photoshop_set_active_document',
  'photoshop_create_document',
  'photoshop_open_image',
  'photoshop_list_brush_presets',
  'photoshop_ingest_brush_pack',
  'photoshop_select_brush_preset',
  'photoshop_get_brush_settings',
  'photoshop_set_brush',
  'photoshop_set_foreground_color',
  'photoshop_list_fonts',
  'photoshop_transform_landmarks',
  'photoshop_compare_landmarks',
  'photoshop_guard_capabilities',
  'photoshop_guard_brush_pack_ingest',
  'photoshop_guard_brush_pack_profile',
  'photoshop_guard_status',
  'photoshop_guard_resume',
  'photoshop_guard_cycle',
  'photoshop_guard_cycle_auto',
  'photoshop_guard_job_poll',
  'photoshop_guard_report',
  'photoshop_guard_ack_operation',
  'photoshop_guard_verdict',
  'photoshop_guard_reconcile',
  'photoshop_guard_set_priorities',
  'photoshop_guard_recover_lock',
]);

export const DOCUMENT_ID_PROPERTY = {
  type: 'number',
  minimum: 1,
  description:
    'Optional Photoshop document id from photoshop_get_state / photoshop_list_documents. ' +
    'When set, the tool verifies that this document is already active and fails closed if another tab is active. ' +
    'It never switches the active Photoshop document automatically.',
} as const;

export function runWithDocumentId<T>(documentId: number | undefined, fn: () => T): T {
  return targetDocumentId.run(documentId, fn);
}

export function getTargetDocumentId(): number | undefined {
  return targetDocumentId.getStore();
}

/**
 * Bind the current request's pinned document target to one internal Photoshop
 * dispatch. Internal callers may repeat the same id explicitly, but they may
 * never retarget a dispatch behind the public tool/Guard contract.
 */
export function bindPinnedDocumentId(
  params: Record<string, unknown>
): Record<string, unknown> {
  const pinnedDocumentId = getTargetDocumentId();
  if (pinnedDocumentId === undefined) return params;

  if (Object.prototype.hasOwnProperty.call(params, 'document_id')) {
    const dispatchDocumentId = params.document_id;
    if (
      typeof dispatchDocumentId !== 'number' ||
      !Number.isSafeInteger(dispatchDocumentId) ||
      dispatchDocumentId <= 0
    ) {
      throw new Error(
        `document_target_mismatch: internal dispatch document_id must be the pinned positive integer ${pinnedDocumentId}`
      );
    }
    if (dispatchDocumentId !== pinnedDocumentId) {
      throw new Error(
        `document_target_mismatch: internal dispatch document_id ${dispatchDocumentId} does not match pinned document_id ${pinnedDocumentId}`
      );
    }
    return params;
  }

  return { ...params, document_id: pinnedDocumentId };
}

export function parseDocumentIdArg(args: Record<string, unknown> | undefined): number | undefined {
  if (!args || !Object.prototype.hasOwnProperty.call(args, 'document_id')) return undefined;
  const raw = args.document_id;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
    throw new Error('invalid_arguments: document_id must be a positive integer');
  }
  return raw;
}

function invalidDocumentIdResult(message: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok: false,
            code: 'invalid_arguments',
            message,
            suggested_next_tool: 'photoshop_list_documents',
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

function annotateDocumentTarget(result: CallToolResult, documentId: number): CallToolResult {
  const target = { id: documentId, pinned: true };
  let annotated = false;
  const content = result.content.map((item) => {
    if (annotated || item.type !== 'text') return item;
    try {
      const parsed = JSON.parse(item.text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return item;
      annotated = true;
      return {
        ...item,
        text: JSON.stringify({ ...parsed, document_target: target }, null, 2),
      };
    } catch {
      return item;
    }
  });

  if (!annotated) {
    content.push({
      type: 'text',
      text: JSON.stringify({ document_target: target }, null, 2),
    });
  }

  return { ...result, content };
}

export function wrapDocumentIdHandler(
  toolName: string,
  handler: ToolHandler
): ToolHandler {
  if (DOCUMENT_ID_SCHEMA_EXCLUDES.has(toolName)) return handler;
  return async (args) => {
    let documentId: number | undefined;
    try {
      const explicitDocumentId = parseDocumentIdArg(args);
      const inheritedDocumentId = getTargetDocumentId();
      if (
        explicitDocumentId !== undefined
        && inheritedDocumentId !== undefined
        && explicitDocumentId !== inheritedDocumentId
      ) {
        throw new Error(
          `invalid_arguments: document_id ${explicitDocumentId} does not match inherited pinned document_id ${inheritedDocumentId}`
        );
      }
      documentId = explicitDocumentId ?? inheritedDocumentId;
    } catch (error) {
      return invalidDocumentIdResult(error instanceof Error ? error.message.replace(/^invalid_arguments:\s*/, '') : String(error));
    }

    const result = await runWithDocumentId(documentId, () => handler(args));
    return documentId === undefined ? result : annotateDocumentTarget(result, documentId);
  };
}

function inputProperties(tool: Tool): Record<string, unknown> | null {
  const schema = tool.inputSchema;
  if (schema.type !== 'object') return null;
  return (schema.properties ?? {}) as Record<string, unknown>;
}

/** Add the public request pin only where the tool uses the active-document contract. */
export function withOptionalDocumentId(tool: Tool): Tool {
  if (DOCUMENT_ID_SCHEMA_EXCLUDES.has(tool.name)) return tool;
  const properties = inputProperties(tool);
  if (properties === null || Object.prototype.hasOwnProperty.call(properties, 'document_id')) {
    return tool;
  }
  return {
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: { ...properties, document_id: DOCUMENT_ID_PROPERTY },
    },
  };
}
