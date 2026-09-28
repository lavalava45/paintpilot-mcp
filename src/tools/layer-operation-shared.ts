import type { ToolResult } from '../core/tool-registry.js';

export type LayerArgs = Record<string, unknown>;

export function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function documentId(args: LayerArgs): number | undefined {
  return positiveInteger(args.document_id);
}

export function textResult(text: string, isError = false): ToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text }],
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
