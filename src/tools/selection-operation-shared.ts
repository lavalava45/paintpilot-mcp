import type { ToolResult } from '../core/tool-registry.js';

export type SelectionArgs = Record<string, unknown>;

export function selectionDocumentId(args: SelectionArgs): number | undefined {
  const value = args.document_id;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function normalizedSelectionPixels(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.round(value));
}

export function selectionDetails(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const projected: Record<string, unknown> = {};
  for (const key of ['bounds', 'pixels', 'operation', 'shape', 'channel_name', 'context']) {
    if (data[key] !== undefined) projected[key] = data[key];
  }
  return Object.keys(projected).length === 0 ? undefined : projected;
}

export function plainSelectionResult(text: string, isError = false): ToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text }],
  };
}

export function selectionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
