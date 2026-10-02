import { invokeUxpBridgeCommand } from './uxp-bridge-client.js';

export const NEURAL_FILTER_KINDS = [
  'skin_smoothing',
  'harmonize',
  'depth_blur',
  'super_zoom',
  'colorize',
] as const;

export type NeuralFilterKind = (typeof NEURAL_FILTER_KINDS)[number];

export interface NeuralFilterParams {
  smoothness?: number;
  blur?: number;
  reference_layer_id?: number;
  document_id?: number;
}

export async function invokeNeuralFilter(
  filter: NeuralFilterKind,
  params: NeuralFilterParams = {}
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const result = await invokeUxpBridgeCommand(
    'neural_filter',
    { filter, ...params },
    90_000
  );
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'neural_filter_failed' };
  }
  return { ok: true, data: result.data };
}
