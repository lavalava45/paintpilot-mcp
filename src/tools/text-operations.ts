import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../platform/photoshop-backend.js';
import { invokeUxpOperation } from '../platform/uxp-bridge-client.js';

export type TextOperationArgs = Record<string, unknown>;

function pinnedDocument(args: TextOperationArgs): Record<string, number> {
  const id = args.document_id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? { document_id: id } : {};
}

function message(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function dispatch(
  router: PhotoshopBackendRouter,
  primitive: PhotoshopPrimitive,
  action: string,
  payload: Record<string, unknown>,
  fallback: string
) {
  await router.backendFor(primitive);
  const outcome = await invokeUxpOperation(action, payload, fallback);
  if (!outcome.ok) throw new Error(outcome.error ?? fallback);
  return outcome;
}

export async function runListFonts(router: PhotoshopBackendRouter, args: TextOperationArgs): Promise<ToolResult> {
  const query = typeof args.query === 'string' ? args.query : undefined;
  const limit = (args.limit as number | undefined) ?? 200;
  try {
    const outcome = await dispatch(router, 'text.fonts.list', 'list_fonts', {
      ...(query === undefined ? {} : { query }), limit,
    }, 'uxp_list_fonts_failed');
    if (!outcome.data) throw new Error('uxp_list_fonts_failed');
    return message(`Fonts listed${query ? ` (query: "${query}")` : ''}\nResult: ${JSON.stringify(outcome.data)}`);
  } catch (error) {
    return message(`Error listing fonts: ${errorText(error)}`, true);
  }
}

export async function runSetTextFont(router: PhotoshopBackendRouter, args: TextOperationArgs): Promise<ToolResult> {
  const fontName = args.fontName as string;
  const fontSize = args.fontSize as number | undefined;
  try {
    const outcome = await dispatch(router, 'text.font.write', 'set_text_font', {
      ...pinnedDocument(args), fontName, ...(fontSize === undefined ? {} : { fontSize }),
    }, 'uxp_set_text_font_failed');
    if (!outcome.data) throw new Error('uxp_set_text_font_failed');
    return message(`Text font set to ${fontName}${fontSize ? `, size ${fontSize}pt` : ''}\nResult: ${JSON.stringify(outcome.data)}`);
  } catch (error) {
    return message(`Error setting text font: ${errorText(error)}`, true);
  }
}

export async function runSetTextColor(router: PhotoshopBackendRouter, args: TextOperationArgs): Promise<ToolResult> {
  const red = args.red as number;
  const green = args.green as number;
  const blue = args.blue as number;
  try {
    await dispatch(router, 'text.color.write', 'set_text_color', {
      ...pinnedDocument(args), red, green, blue,
    }, 'uxp_set_text_color_failed');
    return message(`Text color set to RGB(${red}, ${green}, ${blue})`);
  } catch (error) {
    return message(`Error setting text color: ${errorText(error)}`, true);
  }
}

export async function runSetTextAlignment(router: PhotoshopBackendRouter, args: TextOperationArgs): Promise<ToolResult> {
  const alignment = args.alignment as string;
  try {
    await dispatch(router, 'text.alignment.write', 'set_text_alignment', {
      ...pinnedDocument(args), alignment,
    }, 'uxp_set_text_alignment_failed');
    return message(`Text alignment set to ${alignment}`);
  } catch (error) {
    return message(`Error setting text alignment: ${errorText(error)}`, true);
  }
}

export async function runUpdateTextContent(router: PhotoshopBackendRouter, args: TextOperationArgs): Promise<ToolResult> {
  const text = args.text as string;
  try {
    await dispatch(router, 'text.content.write', 'update_text_content', {
      ...pinnedDocument(args), text,
    }, 'uxp_update_text_content_failed');
    return message(`Text content updated to: "${text}"`);
  } catch (error) {
    return message(`Error updating text content: ${errorText(error)}`, true);
  }
}
