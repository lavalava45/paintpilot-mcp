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
  convert: [
    'Convert the active layer, or an exact named layer, to an embedded Smart Object.',
    'Use when non-destructive transforms or filters are needed. An already-Smart-Object target reports success with already_smart_object; unlock or duplicate a Background layer first.',
    'Returns layer_name, kind and optional already_smart_object/context. Side effect: one history step.',
  ].join('\n\n'),
  replace: [
    'Replace the embedded contents of a Smart Object from an image file while preserving transforms, warps and Smart Filters.',
    'Use for mockup/template asset replacement. The target must already be a Smart Object; this is embedded-content replacement rather than linked-object relinking.',
    'file_path must be an existing absolute path. Returns layer_name/file_path/context and replaces embedded pixels.',
  ].join('\n\n'),
  edit: [
    'Open a Smart Object for Edit Contents; its embedded .psb becomes the active document until saved and closed.',
    'Use to edit embedded pixels non-destructively; use photoshop_replace_smart_object_contents when swapping the whole asset.',
    'Returns parent_document, embedded_document, layer_name and context; changes the active document to the embedded contents.',
  ].join('\n\n'),
  copy: [
    'Create an independent Smart Object via Copy with its own embedded contents.',
    'Use when the duplicate must not share embedded data with the source. Use photoshop_duplicate_layer when linked instances are desired.',
    'Returns source_layer_name, new_layer_name, kind and context; adds a new Smart Object layer.',
  ].join('\n\n'),
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
