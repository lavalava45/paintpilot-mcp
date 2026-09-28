import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import { dispatchResidualUxp, residualDocumentTarget } from './residual-operation-shared.js';

export const STACK_MODE_IDS = {
  mean: 'stackModeMean', median: 'stackModeMedian', maximum: 'stackModeMaximum',
  minimum: 'stackModeMinimum', summation: 'stackModeSummation', stddev: 'stackModeStandardDeviation',
} as const;
export type StackMode = keyof typeof STACK_MODE_IDS;

export async function runImageStack(router: PhotoshopBackendRouter, args: Record<string, unknown>): Promise<ToolResult> {
  const files = Array.isArray(args.files) ? args.files.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
  if (files.length < 2) return atomicFailureFromError(new Error('files must contain at least 2 image paths'));
  const mode: StackMode = typeof args.mode === 'string' && args.mode in STACK_MODE_IDS ? args.mode as StackMode : 'median';
  try {
    const data = await dispatchResidualUxp(router, 'image.stack', 'image_stack', {
      files, mode, stack_mode: STACK_MODE_IDS[mode], ...residualDocumentTarget(args),
    }, 'uxp_image_stack_failed', 120_000) as Record<string, unknown> | undefined;
    if (!data) throw new Error('uxp_image_stack_failed');
    if (data.ok === false) throw new Error(String(data.message || 'Image stack failed'));
    return atomicSuccess(`Image stack applied (${mode}, ${files.length} files)`, { mode, file_count: files.length, layer_name: data.layer_name });
  } catch (error) { return atomicFailureFromError(error); }
}
