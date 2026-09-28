import type { ToolResult } from '../core/tool-registry.js';
import { resolvePhotoshopCapabilities } from '../platform/capabilities.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import {
  invokeNeuralFilter,
  type NeuralFilterKind,
} from '../platform/uxp-bridge-client.js';
import { atomicFailure, atomicSuccess } from './atomic-shared.js';
import { residualDocumentTarget } from './residual-operation-shared.js';

export const NEURAL_FILTER_KINDS: NeuralFilterKind[] = [
  'skin_smoothing',
  'harmonize',
  'depth_blur',
  'super_zoom',
  'colorize',
];

function percentage(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

export async function runNeuralFilter(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const capabilities = await resolvePhotoshopCapabilities(await connection.getVersion());
  if (!capabilities.features.neural_filters) {
    return atomicFailure({
      ok: false,
      code: 'uxp_bridge_unavailable',
      message: 'Neural Filters require the project UXP companion to be reachable.',
      suggested_next_tool: 'photoshop_get_capabilities',
    });
  }

  const requested = typeof args.filter === 'string' ? args.filter.trim() : '';
  if (!NEURAL_FILTER_KINDS.includes(requested as NeuralFilterKind)) {
    return atomicFailure({
      ok: false,
      code: 'invalid_arguments',
      message: `filter must be one of: ${NEURAL_FILTER_KINDS.join(', ')}`,
    });
  }

  const filter = requested as NeuralFilterKind;
  const params = {
    ...residualDocumentTarget(args),
    smoothness: percentage(args.smoothness, 50),
    blur: percentage(args.blur, 50),
    ...(typeof args.reference_layer_id === 'number'
      ? { reference_layer_id: args.reference_layer_id }
      : {}),
  };
  const result = await invokeNeuralFilter(filter, params);
  if (!result.ok) {
    return atomicFailure({
      ok: false,
      code: 'uxp_bridge_unavailable',
      message: result.error ?? 'Neural filter invocation failed',
      suggested_next_tool: 'photoshop_get_capabilities',
    });
  }
  return atomicSuccess(
    `Neural filter "${filter}" applied via UXP bridge`,
    { filter, params, bridge: result.data },
    'photoshop_get_preview'
  );
}
