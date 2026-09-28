import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from '../core/tool-registry.js';

export const PHOTOSHOP_ERROR_CODES = [
  'no_active_document', 'no_active_layer', 'layer_not_found', 'document_not_found',
  'ambiguous_name', 'invalid_arguments', 'selection_required', 'version_unsupported',
  'capability_unavailable', 'uxp_bridge_unavailable', 'uxp_command_identity_conflict',
  'paint_tool_not_ready', 'brush_pack_import_unavailable', 'brush_pack_ingestion_failed',
  'brush_pack_manifest_invalid', 'extendscript_runtime_error', 'file_not_found',
  'font_not_found', 'unsupported_color_mode', 'no_base_layer_below', 'not_clipping', 'unknown',
] as const;

export type PhotoshopErrorCode = (typeof PHOTOSHOP_ERROR_CODES)[number];

export type PhotoshopErrorEnvelope = {
  ok: false;
  code: PhotoshopErrorCode;
  message: string;
  suggested_next_tool?: string;
  suggested_args?: Record<string, unknown>;
};

type ErrorRule = readonly [pattern: RegExp, code: PhotoshopErrorCode, next?: string];

const ERROR_RULES: readonly ErrorRule[] = [
  [/document_not_found/i, 'document_not_found', 'photoshop_list_documents'],
  [/no active document|no documents/i, 'no_active_document', 'photoshop_get_state'],
  [/no active layer/i, 'no_active_layer', 'photoshop_get_layers'],
  [/layer not found/i, 'layer_not_found', 'photoshop_get_layers'],
  [/no base layer below|nothing to clip into/i, 'no_base_layer_below', 'photoshop_get_layers'],
  [/not clipping|not a clipping mask/i, 'not_clipping', 'photoshop_get_layers'],
  [/selection/i, 'selection_required', 'photoshop_get_state'],
  [/version_unsupported|not supported.*version/i, 'version_unsupported', 'photoshop_get_capabilities'],
  [/capability_unavailable/i, 'capability_unavailable', 'photoshop_get_capabilities'],
  [/uxp_bridge_command_id_conflict/i, 'uxp_command_identity_conflict', 'photoshop_guard_status'],
  [/paint_tool_not_ready|brush_settings_unavailable_for_current_tool|brush_settings_unavailable_for_write/i, 'paint_tool_not_ready', 'photoshop_guard_status'],
  [/uxp.?bridge|neural filter.*bridge/i, 'uxp_bridge_unavailable', 'photoshop_get_capabilities'],
  [/brush_pack_import_unavailable/i, 'brush_pack_import_unavailable', 'photoshop_guard_status'],
  [/brush_pack_manifest_invalid|brush_pack_(source|format|no_supported_assets)/i, 'brush_pack_manifest_invalid', 'photoshop_guard_brush_pack_ingest'],
  [/brush_pack_/i, 'brush_pack_ingestion_failed', 'photoshop_guard_status'],
  [/font_not_found/i, 'font_not_found', 'photoshop_list_fonts'],
  [/file not found|does not exist/i, 'file_not_found'],
  [/color mode/i, 'unsupported_color_mode', 'photoshop_get_document_info'],
];

function envelope(code: PhotoshopErrorCode, message: string, next?: string): PhotoshopErrorEnvelope {
  return {
    ok: false,
    code,
    message,
    ...(next === undefined ? {} : { suggested_next_tool: next }),
  };
}

function textContent(result: CallToolResult): string {
  return result.content
    .flatMap((item) => item.type === 'text' && 'text' in item ? [item.text] : [])
    .join('\n');
}

function alreadyStructured(text: string): boolean {
  try {
    const value = JSON.parse(text) as { ok?: unknown; code?: unknown };
    return value.ok === false && typeof value.code === 'string' && value.code.length > 0;
  } catch {
    return false;
  }
}

export function classifyError(message: string): PhotoshopErrorEnvelope {
  for (const [pattern, code, next] of ERROR_RULES) {
    if (pattern.test(message)) return envelope(code, message, next);
  }
  const code: PhotoshopErrorCode = message.includes('ERROR:') ? 'extendscript_runtime_error' : 'unknown';
  return envelope(code, message, 'photoshop_get_state');
}

export function envelopeToToolResult(value: PhotoshopErrorEnvelope): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

export function enrichErrorResult(result: CallToolResult): CallToolResult {
  const text = textContent(result);
  if (text.length === 0 || alreadyStructured(text)) return result;
  if (!/^Error:/i.test(text) && !/error/i.test(text)) return result;
  return envelopeToToolResult(classifyError(text.replace(/^Error:\s*/i, '').trim()));
}

export function buildEnvelopeFromError(error: unknown): CallToolResult {
  return envelopeToToolResult(classifyError(error instanceof Error ? error.message : String(error)));
}

export function wrapToolHandler(_toolName: string, handler: ToolHandler): ToolHandler {
  return async (args) => {
    try {
      const result = await handler(args);
      return result.isError ? enrichErrorResult(result) : result;
    } catch (error) {
      return buildEnvelopeFromError(error);
    }
  };
}
