import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopErrorCode } from '../errors/envelope.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { getPhotoshopCapabilities } from '../platform/capabilities.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import {
  invokeUxpCreateLayerMask,
  invokeUxpFeatherSelection,
  invokeUxpOperation,
  invokeUxpSelectEllipse,
  invokeUxpSelectRectangle,
  invokeUxpSelectSubject,
} from '../platform/uxp-bridge-client.js';
import { atomicFailure, atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import {
  normalizedSelectionPixels,
  plainSelectionResult,
  selectionDetails,
  selectionDocumentId,
  selectionErrorMessage,
  type SelectionArgs,
} from './selection-operation-shared.js';

function semanticSelectionFailure(data: Record<string, unknown>): ToolResult | undefined {
  if (data.ok !== false) return undefined;
  const raw = typeof data.code === 'string' ? data.code : 'unknown';
  const code: PhotoshopErrorCode = raw === 'no_document'
    ? 'no_active_document'
    : raw === 'selection_required'
      ? 'selection_required'
      : 'unknown';
  return atomicFailure({
    ok: false,
    code,
    message: String(data.message || 'Selection operation failed'),
    suggested_next_tool: code === 'selection_required'
      ? 'photoshop_select_rectangle'
      : 'photoshop_get_state',
  });
}

function invalidPixels(): ToolResult {
  return atomicFailure({
    ok: false,
    code: 'invalid_arguments',
    message: 'pixels must be a finite number >= 1',
    suggested_next_tool: 'photoshop_get_selection_bounds',
  });
}

function invalidEllipseBounds(): ToolResult {
  return atomicFailure({
    ok: false,
    code: 'invalid_arguments',
    message: 'Invalid ellipse bounds: right must be greater than left and bottom greater than top',
    suggested_next_tool: 'photoshop_get_selection_bounds',
  });
}

function selectionRequiredFailure(message = 'Active pixel selection required before content-aware fill'): ToolResult {
  return atomicFailure({
    ok: false,
    code: 'selection_required',
    message,
    suggested_next_tool: 'photoshop_select_rectangle',
  });
}

function selectionBoundsSuccess(data: Record<string, unknown>): ToolResult {
  const hasSelection = data.has_selection === true;
  const details: Record<string, unknown> = { has_selection: hasSelection };
  if (hasSelection && data.bounds !== undefined) details.bounds = data.bounds;
  if (data.context !== undefined) details.context = data.context;
  return atomicSuccess(
    hasSelection ? 'Active pixel selection present' : 'No active pixel selection',
    details,
    hasSelection ? 'photoshop_get_preview' : 'photoshop_select_rectangle'
  );
}

export async function runGetSelectionBounds(router: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    const data = await router.readSelectionBounds();
    if (data.ok === false) {
      return atomicFailure({
        ok: false,
        code: data.code === 'no_document' ? 'no_active_document' : 'extendscript_runtime_error',
        message: String(data.message || 'Failed to read selection bounds'),
        suggested_next_tool: 'photoshop_get_state',
      });
    }
    return selectionBoundsSuccess(data);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runSelectEllipse(router: PhotoshopBackendRouter, args: SelectionArgs): Promise<ToolResult> {
  const left = args.left as number;
  const top = args.top as number;
  const right = args.right as number;
  const bottom = args.bottom as number;
  if (right <= left || bottom <= top) return invalidEllipseBounds();
  try {
    await router.backendFor('selection.ellipse');
    const outcome = await invokeUxpSelectEllipse({ left, top, right, bottom });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_select_ellipse_failed');
    return atomicSuccess('Elliptical selection created', selectionDetails(outcome.data));
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function resizeSelection(
  router: PhotoshopBackendRouter,
  args: SelectionArgs,
  mode: 'expand' | 'contract'
): Promise<ToolResult> {
  const pixels = normalizedSelectionPixels(args.pixels);
  if (pixels === undefined) return invalidPixels();
  const primitive: PhotoshopPrimitive = mode === 'expand' ? 'selection.expand' : 'selection.contract';
  const action = `${mode}_selection`;
  const fallback = `uxp_${mode}_selection_failed`;
  try {
    await router.backendFor(primitive);
    const outcome = await invokeUxpOperation(action, { pixels }, fallback);
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? fallback);
    const semanticFailure = semanticSelectionFailure(outcome.data);
    if (semanticFailure) return semanticFailure;
    return atomicSuccess(
      `Selection ${mode === 'expand' ? 'expanded' : 'contracted'} by ${pixels}px`,
      selectionDetails(outcome.data)
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export const runExpandSelection = (router: PhotoshopBackendRouter, args: SelectionArgs) =>
  resizeSelection(router, args, 'expand');

export const runContractSelection = (router: PhotoshopBackendRouter, args: SelectionArgs) =>
  resizeSelection(router, args, 'contract');

export async function runFeatherSelection(router: PhotoshopBackendRouter, args: SelectionArgs): Promise<ToolResult> {
  const pixels = normalizedSelectionPixels(args.pixels);
  if (pixels === undefined) return invalidPixels();
  try {
    await router.backendFor('selection.feather');
    const outcome = await invokeUxpFeatherSelection({ pixels });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_feather_selection_failed');
    return atomicSuccess(`Selection feathered by ${pixels}px`, selectionDetails(outcome.data));
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runSaveSelection(router: PhotoshopBackendRouter, args: SelectionArgs): Promise<ToolResult> {
  const channelName = typeof args.channel_name === 'string' && args.channel_name.length > 0
    ? args.channel_name
    : undefined;
  try {
    await router.backendFor('selection.save');
    const outcome = await invokeUxpOperation(
      'save_selection',
      channelName ? { channel_name: channelName } : {},
      'uxp_save_selection_failed'
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_save_selection_failed');
    const semanticFailure = semanticSelectionFailure(outcome.data);
    if (semanticFailure) return semanticFailure;
    const savedName = typeof outcome.data.channel_name === 'string' ? outcome.data.channel_name : channelName;
    return atomicSuccess(
      savedName ? `Selection saved to channel "${savedName}"` : 'Selection saved to new alpha channel',
      selectionDetails(outcome.data)
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runSelectRectangle(router: PhotoshopBackendRouter, args: SelectionArgs): Promise<ToolResult> {
  const left = args.left as number;
  const top = args.top as number;
  const right = args.right as number;
  const bottom = args.bottom as number;
  try {
    await router.backendFor('selection.rectangle');
    const outcome = await invokeUxpSelectRectangle({ left, top, right, bottom });
    if (!outcome.ok) throw new Error(outcome.error ?? 'uxp_select_rectangle_failed');
    return plainSelectionResult(`Rectangular selection created: (${left}, ${top}) to (${right}, ${bottom})`);
  } catch (error) {
    return plainSelectionResult(`Error creating selection: ${selectionErrorMessage(error)}`, true);
  }
}

async function simpleSelectionCommand(
  router: PhotoshopBackendRouter,
  primitive: PhotoshopPrimitive,
  action: string,
  fallback: string,
  success: string,
  errorPrefix: string
): Promise<ToolResult> {
  try {
    await router.backendFor(primitive);
    const outcome = await invokeUxpOperation(action, {}, fallback);
    if (!outcome.ok) throw new Error(outcome.error ?? fallback);
    return plainSelectionResult(success);
  } catch (error) {
    return plainSelectionResult(`${errorPrefix}: ${selectionErrorMessage(error)}`, true);
  }
}

export const runSelectAll = (router: PhotoshopBackendRouter) =>
  simpleSelectionCommand(router, 'selection.all', 'select_all', 'uxp_select_all_failed', 'All selected', 'Error selecting all');

export const runDeselect = (router: PhotoshopBackendRouter) =>
  simpleSelectionCommand(router, 'selection.deselect', 'deselect', 'uxp_deselect_failed', 'Selection cleared', 'Error deselecting');

export const runInvertSelection = (router: PhotoshopBackendRouter) =>
  simpleSelectionCommand(router, 'selection.invert', 'invert_selection', 'uxp_invert_selection_failed', 'Selection inverted', 'Error inverting selection');

export async function runCreateLayerMask(router: PhotoshopBackendRouter, args: SelectionArgs): Promise<ToolResult> {
  try {
    await router.backendFor('layer.mask.create');
    const id = selectionDocumentId(args);
    const outcome = await invokeUxpCreateLayerMask(id === undefined ? {} : { document_id: id });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_create_layer_mask_failed');
    return plainSelectionResult('Layer mask created from selection');
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export const runDeleteLayerMask = (router: PhotoshopBackendRouter) =>
  simpleSelectionCommand(
    router, 'layer.mask.delete', 'delete_layer_mask', 'uxp_delete_layer_mask_failed',
    'Layer mask deleted', 'Error deleting layer mask'
  );

export const runApplyLayerMask = (router: PhotoshopBackendRouter) =>
  simpleSelectionCommand(
    router, 'layer.mask.apply', 'apply_layer_mask', 'uxp_apply_layer_mask_failed',
    'Layer mask applied (merged to layer)', 'Error applying layer mask'
  );

export async function runSelectSubject(
  connection: PhotoshopConnection,
  router: PhotoshopBackendRouter,
  args: SelectionArgs
): Promise<ToolResult> {
  const sampleAllLayers = args.sample_all_layers === true;
  await connection.ping().catch(() => undefined);
  const info = connection.getPhotoshopInfo();
  if (info && !getPhotoshopCapabilities(info.version).features.select_subject_v2) {
    return atomicFailure({
      ok: false,
      code: 'version_unsupported',
      message: `Select Subject v2 requires Photoshop 23.0+; detected version ${info.version}. Upgrade Photoshop or select manually.`,
      suggested_next_tool: 'photoshop_get_capabilities',
    });
  }
  try {
    await router.backendFor('selection.subject');
    const outcome = await invokeUxpSelectSubject({ sample_all_layers: sampleAllLayers });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_select_subject_failed');
    const method = typeof outcome.data.method === 'string' ? outcome.data.method : 'selectSubject';
    return atomicSuccess(`Subject selected via ${method}`, outcome.data);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runContentAwareFill(router: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    await router.backendFor('selection.content_aware_fill');
    const outcome = await invokeUxpOperation('content_aware_fill', {}, 'uxp_content_aware_fill_failed');
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_content_aware_fill_failed');
    const semanticFailure = semanticSelectionFailure(outcome.data);
    if (semanticFailure) return semanticFailure;
    return atomicSuccess('Content-aware fill applied', outcome.data);
  } catch (error) {
    if (/selection_required/i.test(selectionErrorMessage(error))) return selectionRequiredFailure();
    return atomicFailureFromError(error);
  }
}
