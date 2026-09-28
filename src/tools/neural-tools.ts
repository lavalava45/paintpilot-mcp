import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { NEURAL_FILTER_KINDS, runNeuralFilter } from './neural-operations.js';

type InputSchema = ToolDefinition['tool']['inputSchema'];

function neuralTool(
  name: string,
  description: string,
  inputSchema: InputSchema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

function percentageField(description: string) {
  return { type: 'number' as const, description, minimum: 0, maximum: 100, default: 50 };
}

export function createNeuralTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [neuralTool(
    'photoshop_neural_filter',
    'Apply one supported Photoshop Neural Filter through the maintained UXP companion. Fails closed when the required bridge/capability is unavailable.',
    {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: NEURAL_FILTER_KINDS, description: 'Neural filter to apply' },
        smoothness: percentageField('Skin smoothing smoothness 0-100 (skin_smoothing only)'),
        blur: percentageField('Skin smoothing blur 0-100 (skin_smoothing only)'),
        reference_layer_id: { type: 'number', description: 'Layer id for harmonize reference (harmonize only)' },
      },
      required: ['filter'],
    },
    (args) => runNeuralFilter(connection, args)
  )];
}
