import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler, ToolResult } from './tool-registry.js';
import { exactNotExecutedResultFields } from './execution-outcome.js';
import {
  classifyPhotoshopError,
  PHOTOSHOP_ERROR_CODES,
  type PhotoshopErrorCode,
  type PhotoshopErrorEnvelope,
} from '../errors/catalog.js';

export {
  PHOTOSHOP_ERROR_CODES,
  type PhotoshopErrorCode,
  type PhotoshopErrorEnvelope,
};

export type AtomicSuccess = Readonly<{
  ok: true;
  summary: string;
  details?: Record<string, unknown>;
  next_suggested_tool?: string;
}>;

function jsonResult(payload: unknown, isError = false): ToolResult {
  const content = [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }];
  return isError ? { content, isError: true } : { content };
}

function joinedText(result: CallToolResult): string {
  const chunks: string[] = [];
  for (const item of result.content) {
    if (item.type === 'text' && 'text' in item) chunks.push(item.text);
  }
  return chunks.join('\n');
}

function hasStructuredErrorPayload(text: string): boolean {
  try {
    const payload = JSON.parse(text) as { ok?: unknown; code?: unknown };
    return payload.ok === false && typeof payload.code === 'string' && payload.code.length > 0;
  } catch {
    return false;
  }
}

export function classifyError(message: string): PhotoshopErrorEnvelope {
  return classifyPhotoshopError(message);
}

export function envelopeToToolResult(value: PhotoshopErrorEnvelope): CallToolResult {
  return jsonResult(value, true);
}

export function enrichErrorResult(result: CallToolResult): CallToolResult {
  const text = joinedText(result);
  if (text === '' || hasStructuredErrorPayload(text)) return result;
  if (!/^Error:/i.test(text) && !/error/i.test(text)) return result;
  const normalized = text.replace(/^Error:\s*/i, '').trim();
  return envelopeToToolResult(classifyPhotoshopError(normalized));
}

export function buildEnvelopeFromError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return envelopeToToolResult({
    ...classifyPhotoshopError(message),
    ...(exactNotExecutedResultFields(error) ?? {}),
  });
}

export function wrapToolHandler(_toolName: string, handler: ToolHandler): ToolHandler {
  return async (args) => {
    try {
      const result = await handler(args);
      return result.isError ? enrichErrorResult(result) : result;
    } catch (error) {
      return buildEnvelopeFromError(error);
    }
  };
}

export function atomicSuccess(
  summary: string,
  details?: Record<string, unknown>,
  nextSuggestedTool = 'photoshop_get_preview'
): ToolResult {
  const payload: AtomicSuccess = {
    ok: true,
    summary,
    next_suggested_tool: nextSuggestedTool,
    ...(details === undefined ? {} : { details }),
  };
  return jsonResult(payload);
}

export function atomicFailure(payload: PhotoshopErrorEnvelope): ToolResult {
  return jsonResult(payload, true);
}

export function atomicFailureFromError(
  error: unknown,
  overrides: Partial<Pick<PhotoshopErrorEnvelope, 'code' | 'message' | 'suggested_next_tool'>> = {}
): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const classified = classifyPhotoshopError(message);
  const exactOutcome = exactNotExecutedResultFields(error);
  return atomicFailure({
    ...classified,
    ...(exactOutcome ?? {}),
    ...overrides,
    message: overrides.message ?? classified.message,
  });
}
