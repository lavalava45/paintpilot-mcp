import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { runCapabilities, runPreview, runStateRead } from './state-operations.js';

type InputSchema = ToolDefinition['tool']['inputSchema'];

function stateTool(
  name: string,
  description: string,
  inputSchema: InputSchema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

const EMPTY_INPUT: InputSchema = { type: 'object', properties: {} };
const REGION_SCHEMA = {
  type: 'object' as const,
  description: 'Optional local crop in source-document pixel coordinates.',
  properties: {
    left: { type: 'number' as const }, top: { type: 'number' as const },
    right: { type: 'number' as const }, bottom: { type: 'number' as const },
  },
  required: ['left', 'top', 'right', 'bottom'],
  additionalProperties: false,
};

const PREVIEW_INPUT: InputSchema = {
  type: 'object',
  properties: {
    max_dimension_px: { type: 'number', description: 'Maximum long edge in pixels (default 1024)', default: 1024 },
    quality: { type: 'number', description: 'JPEG quality 1–12 (default 8)', minimum: 1, maximum: 12, default: 8 },
    materialize_path: { type: 'string', description: 'Optional absolute path for persisting the whole preview JPEG.' },
    include_image: { type: 'boolean', description: 'Include the base64 MCP image block; defaults to true.', default: true },
    focus_region: REGION_SCHEMA,
    focus_max_dimension_px: { type: 'number', description: 'Maximum long edge for focus_region (default 1200)', default: 1200 },
  },
};

export function createStateTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    stateTool(
      'photoshop_get_state',
      'Read the current Photoshop document/layer/selection state without mutation; use it to establish or recover a document target.',
      EMPTY_INPUT,
      () => runStateRead(router)
    ),
    stateTool(
      'photoshop_get_preview',
      'Capture a JPEG preview of the active/pinned document, optionally with a local focus crop or materialized filesystem copy.',
      PREVIEW_INPUT,
      (args) => runPreview(router, args)
    ),
    stateTool(
      'photoshop_get_capabilities',
      'Report version-derived Photoshop feature flags plus current UXP bridge availability.',
      EMPTY_INPUT,
      () => runCapabilities(connection)
    ),
  ];
}
