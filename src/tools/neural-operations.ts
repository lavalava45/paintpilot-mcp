import type { ToolResult } from '../core/tool-registry.js';
import { resolvePhotoshopCapabilities } from '../platform/capabilities.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import {
  invokeNeuralFilter,
  NEURAL_FILTER_KINDS,
  type NeuralFilterKind,
} from '../platform/neural-filter-adapter.js';
import { atomicFailure, atomicSuccess } from './atomic-shared.js';
import { residualDocumentTarget } from './residual-operation-shared.js';

export { NEURAL_FILTER_KINDS };

function percentage(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

function neuralRequestParams(args: Record<string, unknown>) {
  const params = {
    ...residualDocumentTarget(args),
    smoothness: percentage(args.smoothness, 50),
    blur: percentage(args.blur, 50),
  };
  const referenceLayerId = args.reference_layer_id;
  return typeof referenceLayerId === 'number'
    ? { ...params, reference_layer_id: referenceLayerId }
    : params;
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
  const params = neuralRequestParams(args);
  const bridge = await invokeNeuralFilter(filter, params);
  if (bridge.ok) {
    return atomicSuccess(
      `Neural filter "${filter}" applied via UXP bridge`,
      { filter, params, bridge: bridge.data },
      'photoshop_get_preview'
    );
  }

  return atomicFailure({
    ok: false,
    code: 'uxp_bridge_unavailable',
    message: bridge.error ?? 'Neural filter invocation failed',
    suggested_next_tool: 'photoshop_get_capabilities',
  });
}
