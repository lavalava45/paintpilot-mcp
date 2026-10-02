import type { ToolDefinition } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runConvertToSmartObject,
  runCreateSmartObjectViaCopy,
  runEditSmartObjectContents,
  runReplaceSmartObjectContents,
} from './smart-object-operations.js';

type Fields = Record<string, Record<string, unknown>>;

function smartObjectTool(
  name: string,
  description: string,
  properties: Fields,
  required: string[] | undefined,
  handler: ToolDefinition['handler']
): ToolDefinition {
  return {
    tool: {
      name,
      description,
      inputSchema: { type: 'object', properties, ...(required ? { required } : {}) },
    },
    handler,
  };
}

const layerNameField: Fields = {
  layer_name: { type: 'string', description: 'Optional exact layer name (recursive search). Default: active layer.' },
};

const descriptions = {
  convert: 'Convert the active or named layer to an embedded Smart Object.',
  replace: 'Replace embedded Smart Object contents from an image file while preserving transforms, warps and Smart Filters.',
  edit: 'Open embedded Smart Object contents as the active document for editing.',
  copy: 'Create an independent Smart Object copy with separate embedded contents.',
};

export function createSmartObjectTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    smartObjectTool(
      'photoshop_convert_to_smart_object',
      descriptions.convert,
      layerNameField,
      undefined,
      (args) => runConvertToSmartObject(router, args)
    ),
    smartObjectTool(
      'photoshop_replace_smart_object_contents',
      descriptions.replace,
      {
        file_path: { type: 'string', description: 'Absolute path to the replacement image file (JPEG, PNG, PSD, etc.)' },
        layer_name: { type: 'string', description: 'Optional exact Smart Object layer name. Default: active layer.' },
      },
      ['file_path'],
      (args) => runReplaceSmartObjectContents(router, args)
    ),
    smartObjectTool(
      'photoshop_edit_smart_object_contents',
      descriptions.edit,
      layerNameField,
      undefined,
      (args) => runEditSmartObjectContents(router, args)
    ),
    smartObjectTool(
      'photoshop_create_smart_object_via_copy',
      descriptions.copy,
      {
        layer_name: { type: 'string', description: 'Optional source Smart Object layer name. Default: active layer.' },
      },
      undefined,
      (args) => runCreateSmartObjectViaCopy(router, args)
    ),
  ];
}
