export const PHOTOSHOP_ERROR_CODES = [
  'no_active_document',
  'no_active_layer',
  'layer_not_found',
  'document_not_found',
  'ambiguous_name',
  'invalid_arguments',
  'selection_required',
  'version_unsupported',
  'capability_unavailable',
  'uxp_bridge_unavailable',
  'uxp_command_identity_conflict',
  'paint_tool_not_ready',
  'brush_pack_import_unavailable',
  'brush_pack_ingestion_failed',
  'brush_pack_manifest_invalid',
  'extendscript_runtime_error',
  'file_not_found',
  'font_not_found',
  'unsupported_color_mode',
  'no_base_layer_below',
  'not_clipping',
  'unknown',
] as const;

export type PhotoshopErrorCode = (typeof PHOTOSHOP_ERROR_CODES)[number];

export type PhotoshopErrorEnvelope = {
  ok: false;
  code: PhotoshopErrorCode;
  message: string;
  suggested_next_tool?: string;
  suggested_args?: Record<string, unknown>;
  execution?: 'not-executed';
  execution_proof?: {
    protocol: 'photoshop.execution_exact_outcome.v1';
    dispatch: 'not-dispatched';
    side_effects: 'none';
    reason: string;
  };
};

type ErrorRoute = Readonly<{
  matches: RegExp;
  code: PhotoshopErrorCode;
  recovery?: string;
}>;

const ERROR_ROUTES: readonly ErrorRoute[] = [
  { matches: /document_not_found/i, code: 'document_not_found', recovery: 'photoshop_list_documents' },
  { matches: /no active document|no documents/i, code: 'no_active_document', recovery: 'photoshop_get_state' },
  { matches: /no active layer/i, code: 'no_active_layer', recovery: 'photoshop_get_layers' },
  { matches: /layer not found/i, code: 'layer_not_found', recovery: 'photoshop_get_layers' },
  { matches: /no base layer below|nothing to clip into/i, code: 'no_base_layer_below', recovery: 'photoshop_get_layers' },
  { matches: /not clipping|not a clipping mask/i, code: 'not_clipping', recovery: 'photoshop_get_layers' },
  { matches: /selection/i, code: 'selection_required', recovery: 'photoshop_get_state' },
  { matches: /version_unsupported|not supported.*version/i, code: 'version_unsupported', recovery: 'photoshop_get_capabilities' },
  { matches: /capability_unavailable/i, code: 'capability_unavailable', recovery: 'photoshop_get_capabilities' },
  { matches: /uxp_bridge_command_id_conflict/i, code: 'uxp_command_identity_conflict', recovery: 'photoshop_guard_status' },
  { matches: /paint_tool_not_ready|brush_settings_unavailable_for_current_tool|brush_settings_unavailable_for_write/i, code: 'paint_tool_not_ready', recovery: 'photoshop_guard_status' },
  { matches: /uxp.?bridge|neural filter.*bridge/i, code: 'uxp_bridge_unavailable', recovery: 'photoshop_get_capabilities' },
  { matches: /brush_pack_import_unavailable/i, code: 'brush_pack_import_unavailable', recovery: 'photoshop_guard_status' },
  { matches: /brush_pack_manifest_invalid|brush_pack_(source|format|no_supported_assets)/i, code: 'brush_pack_manifest_invalid', recovery: 'photoshop_guard_brush_pack_ingest' },
  { matches: /brush_pack_/i, code: 'brush_pack_ingestion_failed', recovery: 'photoshop_guard_status' },
  { matches: /font_not_found/i, code: 'font_not_found', recovery: 'photoshop_list_fonts' },
  { matches: /file not found|does not exist/i, code: 'file_not_found' },
  { matches: /color mode/i, code: 'unsupported_color_mode', recovery: 'photoshop_get_document_info' },
];

function errorEnvelope(
  code: PhotoshopErrorCode,
  message: string,
  recovery?: string
): PhotoshopErrorEnvelope {
  const base: PhotoshopErrorEnvelope = { ok: false, code, message };
  return recovery === undefined ? base : { ...base, suggested_next_tool: recovery };
}

export function classifyPhotoshopError(message: string): PhotoshopErrorEnvelope {
  const route = ERROR_ROUTES.find(({ matches }) => matches.test(message));
  if (route !== undefined) return errorEnvelope(route.code, message, route.recovery);

  const fallback: PhotoshopErrorCode = message.includes('ERROR:')
    ? 'extendscript_runtime_error'
    : 'unknown';
  return errorEnvelope(fallback, message, 'photoshop_get_state');
}
