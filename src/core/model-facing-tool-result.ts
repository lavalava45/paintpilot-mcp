import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ToolResult } from './tool-registry.js';
import { GUARD_STATE_RESPONSE_MAX_BYTES } from './guard/response-budget.js';

export const MODEL_CONTEXT_WARNING_BYTES = 64 * 1024;

const GUARDED_REFERENCE_ONLY_TOOLS = new Set([
  'photoshop_guard_cycle_auto',
  'photoshop_guard_job_poll',
]);

export function normalizeModelFacingToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  options: { guardRequired: boolean; runtimeDirectory: string; previewId?: string }
): Record<string, unknown> {
  const normalized = { ...args };
  if (!options.guardRequired || toolName !== 'photoshop_get_preview' || normalized.include_image !== undefined) {
    return normalized;
  }
  normalized.include_image = false;
  if (typeof normalized.materialize_path !== 'string' || !normalized.materialize_path.trim()) {
    normalized.materialize_path = path.join(
      options.runtimeDirectory,
      'direct-previews',
      `preview-${options.previewId ?? randomUUID()}.jpg`
    );
  }
  return normalized;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function omittedMarker(bytes: Buffer, image: boolean): string {
  return `[binary ${image ? 'image' : 'payload'} omitted: ${bytes.byteLength} bytes, sha256=${sha256(bytes)}]`;
}

function decodeBase64(value: string): Buffer | null {
  const compact = value.trim().replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
  try {
    return Buffer.from(compact, 'base64');
  } catch {
    return null;
  }
}

function redactString(value: string, key: string | undefined, parent: Record<string, unknown> | undefined): string {
  const dataUrl = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (dataUrl) {
    const bytes = decodeBase64(dataUrl[2]);
    if (bytes) return omittedMarker(bytes, dataUrl[1].toLowerCase().startsWith('image/'));
  }

  const normalizedKey = key?.toLowerCase();
  const explicitBinaryKey = normalizedKey === 'base64' || normalizedKey === 'bytes';
  const parentMime = String(parent?.mimeType ?? parent?.mime_type ?? '').toLowerCase();
  const dataBinaryKey = normalizedKey === 'data'
    && (parent?.type === 'image' || parentMime.startsWith('image/') || value.length >= 256);
  if (!explicitBinaryKey && !dataBinaryKey) return value;

  const bytes = decodeBase64(value);
  if (!bytes) return value;
  const image = (normalizedKey === 'data' && (parent?.type === 'image' || parentMime.startsWith('image/')))
    || parentMime.startsWith('image/');
  return omittedMarker(bytes, image);
}

function redactBinaryValue(value: unknown, key?: string, parent?: Record<string, unknown>): unknown {
  if (typeof value === 'string') return redactString(value, key, parent);
  if (Array.isArray(value)) {
    if (key?.toLowerCase() === 'bytes' && value.length > 0 && value.every(item => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 255)) {
      return omittedMarker(Buffer.from(value as number[]), false);
    }
    return value.map(item => redactBinaryValue(item));
  }
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(record)) {
    out[childKey] = redactBinaryValue(childValue, childKey, record);
  }
  return out;
}

function sanitizeText(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(redactBinaryValue(parsed));
  } catch {
    return text.replace(
      /data:(image\/[^;,\s]+);base64,([A-Za-z0-9+/=]{256,})/gi,
      (_match, mimeType: string, encoded: string) => {
        const bytes = decodeBase64(encoded);
        return bytes ? omittedMarker(bytes, mimeType.toLowerCase().startsWith('image/')) : '[binary image omitted]';
      }
    );
  }
}

export function estimateModelFacingContextBytes(result: ToolResult): number {
  return Buffer.byteLength(JSON.stringify(result), 'utf8');
}

function annotateGuardContextBudget(result: ToolResult, maxTextBytes?: number): ToolResult {
  const cloned = structuredClone(result) as ToolResult;
  const textIndex = cloned.content.findIndex(item => item.type === 'text');
  if (textIndex < 0) return cloned;
  const textItem = cloned.content[textIndex];
  if (textItem.type !== 'text') return cloned;

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(textItem.text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return cloned;
    body = parsed as Record<string, unknown>;
  } catch {
    return cloned;
  }

  body.estimated_context_bytes = 0;
  textItem.text = JSON.stringify(body);
  let estimated = estimateModelFacingContextBytes(cloned);
  body.estimated_context_bytes = estimated;
  if (estimated > MODEL_CONTEXT_WARNING_BYTES) {
    body.context_warning = {
      code: 'large_model_facing_response',
      threshold_bytes: MODEL_CONTEXT_WARNING_BYTES,
      message: 'Model-facing Guard response is unexpectedly large; prefer compact metadata and explicit image review.',
    };
  } else {
    delete body.context_warning;
  }
  textItem.text = JSON.stringify(body);
  estimated = estimateModelFacingContextBytes(cloned);
  body.estimated_context_bytes = estimated;
  textItem.text = JSON.stringify(body);
  // Optional telemetry must not push an otherwise complete status/resume over its transport budget.
  const originalText = result.content[textIndex];
  if (maxTextBytes !== undefined && Buffer.byteLength(textItem.text, 'utf8') > maxTextBytes
    && originalText.type === 'text' && Buffer.byteLength(originalText.text, 'utf8') <= maxTextBytes) return result;
  return cloned;
}

export function sanitizeModelFacingToolResult(toolName: string, result: ToolResult): ToolResult {
  const sanitized = structuredClone(result) as ToolResult;
  sanitized.content = sanitized.content
    .filter(item => !(GUARDED_REFERENCE_ONLY_TOOLS.has(toolName) && item.type === 'image'))
    .map(item => item.type === 'text' ? { ...item, text: sanitizeText(item.text) } : item);

  const withStructured = sanitized as ToolResult & { structuredContent?: Record<string, unknown> };
  const structured = withStructured.structuredContent;
  if (structured !== undefined) {
    const redacted = redactBinaryValue(structured);
    if (redacted && typeof redacted === 'object' && !Array.isArray(redacted)) {
      withStructured.structuredContent = redacted as Record<string, unknown>;
    }
  }

  return toolName.startsWith('photoshop_guard_')
    ? annotateGuardContextBudget(sanitized,
      toolName === 'photoshop_guard_status' || toolName === 'photoshop_guard_resume'
        ? GUARD_STATE_RESPONSE_MAX_BYTES : undefined)
    : sanitized;
}
