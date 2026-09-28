import type { ToolDefinition, ToolHandler } from '../core/tool-registry.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import {
  runListFonts,
  runSetTextAlignment,
  runSetTextColor,
  runSetTextFont,
  runUpdateTextContent,
} from './text-operations.js';

type Schema = ToolDefinition['tool']['inputSchema'];

function textTool(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: ToolHandler
): ToolDefinition {
  return { tool: { name, description, inputSchema }, handler };
}

function objectSchema(
  properties: Record<string, unknown>,
  required?: string[]
): Schema {
  return { type: 'object', properties, ...(required ? { required } : {}) } as Schema;
}

const rgbProperties = {
  red: { type: 'number', description: 'Red component (0-255)', minimum: 0, maximum: 255 },
  green: { type: 'number', description: 'Green component (0-255)', minimum: 0, maximum: 255 },
  blue: { type: 'number', description: 'Blue component (0-255)', minimum: 0, maximum: 255 },
};

export function createTextTools(
  connection: PhotoshopConnection,
  router = new PhotoshopBackendRouter(connection)
): ToolDefinition[] {
  return [
    textTool(
      'photoshop_list_fonts',
      'List Photoshop fonts, optionally filtered by name/family/PostScript name. Returns font records, total count, and truncation state without changing Photoshop.',
      objectSchema({
        query: { type: 'string', description: 'Optional substring filter (matches name, postScriptName, or family)' },
        limit: { type: 'number', description: 'Maximum fonts to return (default: 200)', default: 200, minimum: 1, maximum: 1000 },
      }),
      (args) => runListFonts(router, args)
    ),
    textTool(
      'photoshop_set_text_font',
      'Set the active text layer font, accepting a display or PostScript font name, and optionally set its size in points.',
      objectSchema({
        fontName: { type: 'string', description: 'Font display or PostScript name (see photoshop_list_fonts)' },
        fontSize: { type: 'number', description: 'Font size in points (optional)', minimum: 1 },
      }, ['fontName']),
      (args) => runSetTextFont(router, args)
    ),
    textTool(
      'photoshop_set_text_color',
      'Set the active text layer RGB color.',
      objectSchema(rgbProperties, ['red', 'green', 'blue']),
      (args) => runSetTextColor(router, args)
    ),
    textTool(
      'photoshop_set_text_alignment',
      'Set paragraph alignment on the active text layer.',
      objectSchema({
        alignment: {
          type: 'string',
          description: 'Text alignment',
          enum: ['LEFT', 'CENTER', 'RIGHT', 'LEFTJUSTIFIED', 'CENTERJUSTIFIED', 'RIGHTJUSTIFIED', 'FULLYJUSTIFIED'],
        },
      }, ['alignment']),
      (args) => runSetTextAlignment(router, args)
    ),
    textTool(
      'photoshop_update_text_content',
      'Replace the contents of the active text layer.',
      objectSchema({ text: { type: 'string', description: 'New text content' } }, ['text']),
      (args) => runUpdateTextContent(router, args)
    ),
  ];
}
