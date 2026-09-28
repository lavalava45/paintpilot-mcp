import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { atomicFailureFromError, atomicSuccess } from './atomic-shared.js';
import { dispatchResidualUxp, residualDocumentTarget } from './residual-operation-shared.js';

export const EXPORT_FORMATS = ['PNG', 'JPEG', 'WEBP', 'AVIF'] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

export async function runExportAs(router: PhotoshopBackendRouter, args: Record<string, unknown>): Promise<ToolResult> {
  const path = typeof args.path === 'string' ? args.path.trim() : '';
  if (!path) return atomicFailureFromError(new Error('path parameter is required'));
  const format: ExportFormat = EXPORT_FORMATS.includes(args.format as ExportFormat) ? args.format as ExportFormat : 'PNG';
  const quality = typeof args.quality === 'number' && Number.isFinite(args.quality) ? Math.max(0, Math.min(100, Math.round(args.quality))) : 80;
  try {
    const data = await dispatchResidualUxp(router, 'document.export', 'export_as', {
      ...residualDocumentTarget(args), path, format, quality,
    }, 'uxp_export_as_failed', 60_000) as Record<string, unknown> | undefined;
    if (!data) throw new Error('uxp_export_as_failed');
    if (data.ok === false) return atomicFailureFromError(new Error(String(data.message || 'Export failed')), { code: 'version_unsupported', suggested_next_tool: 'photoshop_save_document' });
    return atomicSuccess(`Exported ${format} to ${path}`, { path, format, method: data.method });
  } catch (error) { return atomicFailureFromError(error); }
}
