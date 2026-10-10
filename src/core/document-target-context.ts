import { AsyncLocalStorage } from 'node:async_hooks';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './tool-registry.js';

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
  'photoshop_geometry_calculate',
  'photoshop_transform_landmarks',
  'photoshop_compare_landmarks',
  'photoshop_guard_capabilities',
  'photoshop_guard_brush_pack_ingest',
  'photoshop_guard_brush_pack_profile',
  'photoshop_guard_status',
  'photoshop_guard_resume',
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

function ownsDocumentId(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, 'document_id');
}

function invalidArgumentResult(message: string): CallToolResult {
  const payload = {
    ok: false,
    code: 'invalid_arguments',
    message,
    suggested_next_tool: 'photoshop_list_documents',
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

function annotateTarget(result: CallToolResult, documentId: number): CallToolResult {
  const documentTarget = { id: documentId, pinned: true };
  let inserted = false;
  const content = result.content.map((item) => {
    if (inserted || item.type !== 'text') return item;
    try {
      const payload = JSON.parse(item.text) as Record<string, unknown>;
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return item;
      inserted = true;
      return {
        ...item,
        text: JSON.stringify({ ...payload, document_target: documentTarget }, null, 2),
      };
    } catch {
      return item;
    }
  });

  if (!inserted) {
    content.push({
      type: 'text',
      text: JSON.stringify({ document_target: documentTarget }, null, 2),
    });
  }
  return { ...result, content };
}

function schemaProperties(tool: Tool): Record<string, unknown> | undefined {
  if (tool.inputSchema.type !== 'object') return undefined;
  return (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
}

export class DocumentTargetContext {
  private readonly activeDocumentId = new AsyncLocalStorage<number | undefined>();

  run<T>(documentId: number | undefined, operation: () => T): T {
    return this.activeDocumentId.run(documentId, operation);
  }

  current(): number | undefined {
    return this.activeDocumentId.getStore();
  }

  parseRequest(args: Record<string, unknown> | undefined): number | undefined {
    if (args === undefined || !ownsDocumentId(args)) return undefined;
    const candidate = args.document_id;
    const valid = typeof candidate === 'number'
      && Number.isFinite(candidate)
      && Number.isInteger(candidate)
      && candidate > 0;
    if (!valid) throw new Error('invalid_arguments: document_id must be a positive integer');
    return candidate;
  }

  bindDispatch(params: Record<string, unknown>): Record<string, unknown> {
    const pinned = this.current();
    if (pinned === undefined) return params;
    if (!ownsDocumentId(params)) return { ...params, document_id: pinned };

    const requested = params.document_id;
    if (
      typeof requested !== 'number'
      || !Number.isSafeInteger(requested)
      || requested <= 0
    ) {
      throw new Error(
        `document_target_mismatch: internal dispatch document_id must be the pinned positive integer ${pinned}`
      );
    }
    if (requested !== pinned) {
      throw new Error(
        `document_target_mismatch: internal dispatch document_id ${requested} does not match pinned document_id ${pinned}`
      );
    }
    return params;
  }

  decorateHandler(toolName: string, handler: ToolHandler): ToolHandler {
    if (DOCUMENT_ID_SCHEMA_EXCLUDES.has(toolName)) return handler;
    return async (args) => {
      let target: number | undefined;
      try {
        const explicit = this.parseRequest(args);
        const inherited = this.current();
        if (explicit !== undefined && inherited !== undefined && explicit !== inherited) {
          throw new Error(
            `invalid_arguments: document_id ${explicit} does not match inherited pinned document_id ${inherited}`
          );
        }
        target = explicit ?? inherited;
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        return invalidArgumentResult(raw.replace(/^invalid_arguments:\s*/, ''));
      }

      const result = await this.run(target, () => handler(args));
      return target === undefined ? result : annotateTarget(result, target);
    };
  }

  exposeSchema(tool: Tool): Tool {
    if (DOCUMENT_ID_SCHEMA_EXCLUDES.has(tool.name)) return tool;
    const properties = schemaProperties(tool);
    if (properties === undefined || ownsDocumentId(properties)) return tool;
    return {
      ...tool,
      inputSchema: {
        ...tool.inputSchema,
        properties: { ...properties, document_id: DOCUMENT_ID_PROPERTY },
      },
    };
  }
}

export const documentTargetContext = new DocumentTargetContext();

export function runWithDocumentId<T>(documentId: number | undefined, operation: () => T): T {
  return documentTargetContext.run(documentId, operation);
}

export function getTargetDocumentId(): number | undefined {
  return documentTargetContext.current();
}

export function bindPinnedDocumentId(
  params: Record<string, unknown>
): Record<string, unknown> {
  return documentTargetContext.bindDispatch(params);
}

export function parseDocumentIdArg(
  args: Record<string, unknown> | undefined
): number | undefined {
  return documentTargetContext.parseRequest(args);
}

export function wrapDocumentIdHandler(toolName: string, handler: ToolHandler): ToolHandler {
  return documentTargetContext.decorateHandler(toolName, handler);
}

export function withOptionalDocumentId(tool: Tool): Tool {
  return documentTargetContext.exposeSchema(tool);
}
