import type { ToolResult } from '../core/tool-registry.js';
import { classifyError, type PhotoshopErrorEnvelope } from '../errors/envelope.js';

export type AtomicSuccess = Readonly<{
  ok: true;
  summary: string;
  details?: Record<string, unknown>;
  next_suggested_tool?: string;
}>;

function resultFromPayload(payload: unknown, error: boolean): ToolResult {
  const textItem = { type: 'text' as const, text: JSON.stringify(payload, null, 2) };
  return error ? { content: [textItem], isError: true } : { content: [textItem] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const atomicSuccess = (
  summary: string,
  details?: Record<string, unknown>,
  nextSuggestedTool = 'photoshop_get_preview'
): ToolResult => {
  const payload: AtomicSuccess = {
    ok: true,
    summary,
    next_suggested_tool: nextSuggestedTool,
    ...(details === undefined ? {} : { details }),
  };
  return resultFromPayload(payload, false);
};

export const atomicFailure = (payload: PhotoshopErrorEnvelope): ToolResult =>
  resultFromPayload(payload, true);

export const atomicFailureFromError = (
  error: unknown,
  overrides: Partial<Pick<PhotoshopErrorEnvelope, 'code' | 'message' | 'suggested_next_tool'>> = {}
): ToolResult => {
  const classified = classifyError(errorMessage(error));
  const payload: PhotoshopErrorEnvelope = {
    ...classified,
    ...overrides,
    message: overrides.message ?? classified.message,
  };
  return atomicFailure(payload);
};
