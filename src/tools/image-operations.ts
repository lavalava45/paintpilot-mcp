import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { dispatchResidualUxp, residualDocumentTarget } from './residual-operation-shared.js';

function failure(prefix: string, error: unknown): ToolResult {
  return { content: [{ type: 'text', text: `${prefix}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
}

export async function runResizeImage(router: PhotoshopBackendRouter, args: Record<string, unknown>): Promise<ToolResult> {
  const width = args.width as number;
  const height = args.height as number;
  try {
    await dispatchResidualUxp(router, 'document.resize', 'resize_image', { width, height, ...residualDocumentTarget(args) }, 'uxp_resize_image_failed');
    return { content: [{ type: 'text', text: `Image resized to ${width}x${height}px` }] };
  } catch (error) { return failure('Error resizing image', error); }
}

export async function runCropDocument(router: PhotoshopBackendRouter, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const data = await dispatchResidualUxp(router, 'document.crop', 'crop_document', {
      left: args.left, top: args.top, right: args.right, bottom: args.bottom, ...residualDocumentTarget(args),
    }, 'uxp_crop_document_failed');
    return { content: [{ type: 'text', text: `Document cropped\nResult: ${JSON.stringify(data)}` }] };
  } catch (error) { return failure('Error cropping document', error); }
}
