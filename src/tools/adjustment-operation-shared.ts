import type { ToolResult } from '../core/tool-registry.js';

export type AdjustmentArgs = Record<string, unknown>;

export function adjustmentDocumentTarget(args: AdjustmentArgs): Record<string, number> {
  const id = args.document_id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
    ? { document_id: id }
    : {};
}

export function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

export function plainAdjustmentResult(text: string, isError = false): ToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text }],
  };
}

export function adjustmentErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
