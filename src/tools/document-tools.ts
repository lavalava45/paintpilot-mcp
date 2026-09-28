import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runCloseDocument,
  runCreateDocument,
  runDocumentInfo,
  runListDocuments,
  runSaveDocument,
  runSetActiveDocument,
} from './document-operations.js';

type Schema = ToolDefinition['tool']['inputSchema'];

function documentTool(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

function argsSchema(properties: Record<string, unknown>, required?: string[]): Schema {
  return { type: 'object', properties, ...(required ? { required } : {}) } as Schema;
}

const NO_ARGS = argsSchema({});

export function createDocumentTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    documentTool(
      'photoshop_create_document',
      'Create and activate a new empty Photoshop document. Use photoshop_open_image instead when the source already exists on disk.',
      argsSchema({
        width: { type: 'number', description: 'Document width in pixels', minimum: 1 },
        height: { type: 'number', description: 'Document height in pixels', minimum: 1 },
        resolution: { type: 'number', description: 'Document resolution in DPI (default: 72)', default: 72 },
        colorMode: { type: 'string', description: 'Color mode (RGB, CMYK, Grayscale)', enum: ['RGB', 'CMYK', 'Grayscale'], default: 'RGB' },
      }, ['width', 'height']),
      (args) => runCreateDocument(router, args)
    ),
    documentTool(
      'photoshop_get_document_info',
      'Read information about the active Photoshop document.',
      NO_ARGS,
      () => runDocumentInfo(router)
    ),
    documentTool(
      'photoshop_list_documents',
      'List all open Photoshop documents, their ids/dimensions, and the active document without changing tabs.',
      NO_ARGS,
      () => runListDocuments(router)
    ),
    documentTool(
      'photoshop_set_active_document',
      'Explicit UI navigation: activate one open Photoshop document by id, zero-based tab index, or unambiguous document name. This operation may foreground Photoshop and is excluded from no-focus acceptance traces; use pinned document_id on ordinary document-bound operations instead.',
      argsSchema({
        document_id: { type: 'number', description: 'Unique internal document id from photoshop_list_documents (preferred)' },
        index: { type: 'number', description: 'Zero-based tab order index (leftmost tab is 0)', minimum: 0 },
        document_name: { type: 'string', description: 'Document name/title (ambiguous if multiple tabs share the same name)' },
      }),
      (args) => runSetActiveDocument(router, args)
    ),
    documentTool(
      'photoshop_save_document',
      'Write a UXP-only as-copy checkpoint/export of the pinned or active document while preserving working-document state.',
      argsSchema({
        path: { type: 'string', description: 'Full path where to save the document' },
        format: { type: 'string', description: 'File format (PSD, JPEG, PNG)', enum: ['PSD', 'JPEG', 'PNG'], default: 'PSD' },
        quality: { type: 'number', description: 'Quality for JPEG (1-12, default: 8)', minimum: 1, maximum: 12, default: 8 },
      }, ['path']),
      runSaveDocument
    ),
    documentTool(
      'photoshop_close_document',
      'Close the active Photoshop document, optionally saving first.',
      argsSchema({
        save: { type: 'boolean', description: 'Whether to save changes before closing', default: false },
      }),
      (args) => runCloseDocument(router, args)
    ),
  ];
}
