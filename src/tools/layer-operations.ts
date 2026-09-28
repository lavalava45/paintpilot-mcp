import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  invokeUxpCreateLayer,
  invokeUxpDeleteLayer,
  invokeUxpFillLayer,
  invokeUxpColorGradient,
  invokeUxpOperation,
  invokeUxpSelectLayerByName,
} from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import { documentId, positiveInteger, type LayerArgs } from './layer-operation-shared.js';

function invalid(message: string): ToolResult {
  return atomicFailureFromError(new Error(message), { code: 'invalid_arguments' });
}

export async function runCreateLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const name = typeof args.name === 'string' ? args.name : undefined;
  const above = positiveInteger(args.above_layer_id);
  const below = positiveInteger(args.below_layer_id);

  if (args.above_layer_id !== undefined && above === undefined) return invalid('above_layer_id must be a positive integer');
  if (args.below_layer_id !== undefined && below === undefined) return invalid('below_layer_id must be a positive integer');
  if (above !== undefined && below !== undefined) return invalid('Provide only one of above_layer_id or below_layer_id');

  try {
    await router.backendFor('layer.create');
    const targetDocument = documentId(args);
    const outcome = await invokeUxpCreateLayer({
      ...(targetDocument === undefined ? {} : { document_id: targetDocument }),
      ...(name === undefined ? {} : { name }),
      ...(above === undefined ? {} : { above_layer_id: above }),
      ...(below === undefined ? {} : { below_layer_id: below }),
    });
    if (!outcome.ok || !outcome.data) {
      return atomicFailureFromError(new Error(outcome.error ?? 'uxp_create_layer_failed'));
    }
    return atomicSuccess(
      `Layer created: ${String(outcome.data.layerName ?? name ?? 'unnamed')}`,
      outcome.data
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runDeleteLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const requested = args.layer_id === undefined ? undefined : positiveInteger(args.layer_id);
  if (args.layer_id !== undefined && requested === undefined) return invalid('layer_id must be a positive integer');

  try {
    await router.backendFor('layer.delete');
    const targetDocument = documentId(args);
    const outcome = await invokeUxpDeleteLayer({
      ...(targetDocument === undefined ? {} : { document_id: targetDocument }),
      ...(requested === undefined ? {} : { layer_id: requested }),
    });
    if (!outcome.ok || !outcome.data) {
      return atomicFailureFromError(new Error(outcome.error ?? 'uxp_delete_layer_failed'));
    }
    return atomicSuccess('Layer deleted', outcome.data);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runMergeLayerDown(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const source = positiveInteger(args.layer_id);
  const target = positiveInteger(args.target_layer_id);
  if (source === undefined) return invalid('layer_id must be a positive integer');
  if (target === undefined) return invalid('target_layer_id must be a positive integer');
  if (source === target) return invalid('layer_id and target_layer_id must differ');

  try {
    await router.backendFor('layer.merge_down');
    const targetDocument = documentId(args);
    const outcome = await invokeUxpOperation(
      'merge_layer_down',
      {
        ...(targetDocument === undefined ? {} : { document_id: targetDocument }),
        layer_id: source,
        target_layer_id: target,
      },
      'uxp_merge_layer_down_failed'
    );
    if (!outcome.ok || !outcome.data) {
      return atomicFailureFromError(new Error(outcome.error ?? 'uxp_merge_layer_down_failed'));
    }
    return atomicSuccess('Logical layer merged down', outcome.data);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runCreateTextLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const text = args.text as string;
  const x = (args.x as number) || 100;
  const y = (args.y as number) || 100;
  const fontSize = (args.fontSize as number) || 24;
  const fontName = typeof args.fontName === 'string' ? args.fontName : undefined;

  try {
    await router.backendFor('layer.text.create');
    const targetDocument = documentId(args);
    const outcome = await invokeUxpOperation(
      'create_text_layer',
      {
        text,
        x,
        y,
        fontSize,
        ...(fontName ? { fontName } : {}),
        ...(targetDocument === undefined ? {} : { document_id: targetDocument }),
      },
      'uxp_create_text_layer_failed'
    );
    if (!outcome.ok || !outcome.data) {
      return atomicFailureFromError(new Error(outcome.error ?? 'uxp_create_text_layer_failed'));
    }
    return atomicSuccess(
      `Text layer created: ${String(outcome.data.layerName ?? 'text layer')}`,
      outcome.data
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runFillLayer(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const red = args.red as number;
  const green = args.green as number;
  const blue = args.blue as number;
  const layerId = positiveInteger(args.layer_id);
  if (args.layer_id !== undefined && layerId === undefined) return invalid('layer_id must be a positive integer');

  try {
    await router.backendFor('layer.fill');
    const targetDocument = documentId(args);
    const outcome = await invokeUxpFillLayer({
      ...(targetDocument === undefined ? {} : { document_id: targetDocument }),
      ...(layerId === undefined ? {} : { layer_id: layerId }),
      red,
      green,
      blue,
    });
    if (!outcome.ok || !outcome.data) {
      return atomicFailureFromError(new Error(outcome.error ?? 'uxp_fill_layer_failed'));
    }
    return atomicSuccess(`Layer filled with RGB(${red}, ${green}, ${blue})`, outcome.data);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runColorGradient(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const layerId = positiveInteger(args.layer_id);
  if (!layerId) return invalid('layer_id must be a positive integer');
  const point = (value: unknown): { x: number; y: number } | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const v = value as Record<string, unknown>;
    return typeof v.x === 'number' && Number.isFinite(v.x) && typeof v.y === 'number' && Number.isFinite(v.y)
      ? { x: v.x, y: v.y } : undefined;
  };
  const from = point(args.from);
  const to = point(args.to);
  if (!from || !to || (from.x === to.x && from.y === to.y)) return invalid('from/to must be distinct finite canvas-pixel points');
  if (!Array.isArray(args.stops) || args.stops.length < 2 || args.stops.length > 4) return invalid('stops must contain 2 to 4 color stops');
  const stops: Array<{ position: number; red: number; green: number; blue: number }> = [];
  for (let i = 0; i < args.stops.length; i++) {
    const raw = args.stops[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid(`stops[${i}] must be an object`);
    const s = raw as Record<string, unknown>;
    const values = [s.position, s.red, s.green, s.blue];
    if (!values.every(v => typeof v === 'number' && Number.isFinite(v))) return invalid(`stops[${i}] requires finite position/red/green/blue`);
    const position = s.position as number, red = s.red as number, green = s.green as number, blue = s.blue as number;
    if (position < 0 || position > 1 || [red, green, blue].some(v => v < 0 || v > 255)) return invalid(`stops[${i}] is outside bounded position/RGB ranges`);
    if (i > 0 && position <= stops[i - 1].position) return invalid('stops must be strictly ordered by position');
    stops.push({ position, red, green, blue });
  }
  if (stops[0].position !== 0 || stops[stops.length - 1].position !== 1) return invalid('first/last stop positions must be 0 and 1');
  try {
    await router.backendFor('layer.color_gradient');
    const targetDocument = documentId(args);
    const outcome = await invokeUxpColorGradient({ ...(targetDocument === undefined ? {} : { document_id: targetDocument }), layer_id: layerId, from, to, stops });
    if (!outcome.ok || !outcome.data) return atomicFailureFromError(new Error(outcome.error ?? 'uxp_color_gradient_failed'));
    return atomicSuccess(`Color gradient painted on layer ${layerId}`, outcome.data);
  } catch (error) { return atomicFailureFromError(error); }
}

export async function runListLayers(router: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    const layers = await router.listLayers();
    const count = typeof layers.layerCount === 'number' ? layers.layerCount : undefined;
    return atomicSuccess(
      count === undefined ? 'Listed layers' : `Listed ${count} layers`,
      layers,
      'photoshop_select_layer_by_name'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runSelectLayerByName(router: PhotoshopBackendRouter, args: LayerArgs): Promise<ToolResult> {
  const name = args.name as string;
  try {
    await router.backendFor('layer.select_by_name');
    const targetDocument = documentId(args);
    const outcome = await invokeUxpSelectLayerByName({
      ...(targetDocument === undefined ? {} : { document_id: targetDocument }),
      name,
    });
    if (!outcome.ok || !outcome.data) {
      return atomicFailureFromError(new Error(outcome.error ?? 'uxp_select_layer_by_name_failed'));
    }
    return atomicSuccess(
      `Layer selected: ${String(outcome.data.layerName ?? name)}`,
      outcome.data,
      'photoshop_get_state'
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
