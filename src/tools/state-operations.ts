import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse as parsePath, resolve } from 'node:path';
import jpeg from 'jpeg-js';
import type { ToolResult } from '../core/tool-registry.js';
import { classifyError, envelopeToToolResult } from '../errors/envelope.js';
import { resolvePhotoshopCapabilities } from '../platform/capabilities.js';
import type { PhotoshopConnection } from '../platform/connection.js';
import type {
  PhotoshopBackendRouter,
  PhotoshopPreviewImage,
  PhotoshopPreviewRegion,
} from '../platform/photoshop-backend.js';

const PREVIEW_LIMIT = 4 * 1024 * 1024;
type Args = Record<string, unknown>;

function structuredError(error: unknown): ToolResult {
  return envelopeToToolResult(classifyError(error instanceof Error ? error.message : String(error)));
}

function invalidArguments(message: string): ToolResult {
  return envelopeToToolResult({ ok: false, code: 'invalid_arguments', message });
}

export async function runStateRead(router: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    return {
      content: [{ type: 'text', text: JSON.stringify(await router.readState(), null, 2) }],
    };
  } catch (error) {
    return structuredError(error);
  }
}

function jpegQuality(photoshopQuality: number): number {
  const twelvePoint = Math.max(1, Math.min(12, Math.round(photoshopQuality)));
  return Math.max(1, Math.min(100, Math.round((twelvePoint / 12) * 100)));
}

async function sourceBytes(image: PhotoshopPreviewImage): Promise<Buffer> {
  if (typeof image.base64 === 'string' && image.base64.length > 0) {
    return Buffer.from(image.base64, 'base64');
  }
  if (typeof image.path === 'string' && image.path.length > 0) {
    return readFile(image.path);
  }
  throw new Error('Preview backend returned neither base64 nor path data');
}

async function normalizedPreviewBytes(
  image: PhotoshopPreviewImage,
  transport: 'uxp' | 'extendscript',
  quality: number
): Promise<Buffer> {
  const bytes = await sourceBytes(image);
  if (transport !== 'uxp') return bytes;

  const decoded = jpeg.decode(bytes, { useTArray: true });
  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error('Unable to decode UXP preview JPEG');
  }
  return Buffer.from(jpeg.encode({
    data: decoded.data,
    width: decoded.width,
    height: decoded.height,
  }, jpegQuality(quality)).data);
}

function requestedFocus(args: Args): PhotoshopPreviewRegion | undefined {
  if (args.focus_region === undefined) return undefined;
  if (!args.focus_region || typeof args.focus_region !== 'object' || Array.isArray(args.focus_region)) {
    throw new Error('focus_region must be an object');
  }

  const raw = args.focus_region as Record<string, unknown>;
  const region = {
    left: Number(raw.left),
    top: Number(raw.top),
    right: Number(raw.right),
    bottom: Number(raw.bottom),
  };
  if (!Object.values(region).every(Number.isFinite)) {
    throw new Error('focus_region left/top/right/bottom must be finite numbers');
  }
  if (region.right <= region.left || region.bottom <= region.top) {
    throw new Error('focus_region must have positive width and height');
  }
  return region;
}

function optionalDocumentId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canvasMetadata(image: PhotoshopPreviewImage): Record<string, number> {
  return {
    ...(Number.isFinite(image.canvasWidth) ? { canvas_width: image.canvasWidth! } : {}),
    ...(Number.isFinite(image.canvasHeight) ? { canvas_height: image.canvasHeight! } : {}),
    ...(Number.isFinite(image.canvasWidth) && image.canvasWidth! > 0
      ? { scale_x: image.width / image.canvasWidth! }
      : {}),
    ...(Number.isFinite(image.canvasHeight) && image.canvasHeight! > 0
      ? { scale_y: image.height / image.canvasHeight! }
      : {}),
  };
}

function focusScale(
  image: PhotoshopPreviewImage,
  region: PhotoshopPreviewRegion
): Record<string, number> {
  const width = region.right - region.left;
  const height = region.bottom - region.top;
  return {
    ...(Number.isFinite(image.canvasWidth) ? { canvas_width: image.canvasWidth! } : {}),
    ...(Number.isFinite(image.canvasHeight) ? { canvas_height: image.canvasHeight! } : {}),
    ...(width > 0 ? { scale_x: image.width / width } : {}),
    ...(height > 0 ? { scale_y: image.height / height } : {}),
  };
}

export async function runPreview(router: PhotoshopBackendRouter, args: Args): Promise<ToolResult> {
  const maxDimension = (args.max_dimension_px as number) || 1024;
  const quality = (args.quality as number) || 8;
  const includeImage = args.include_image !== false;
  const focusMaxDimension = (args.focus_max_dimension_px as number) || 1200;
  const requestedPath = typeof args.materialize_path === 'string' && args.materialize_path.trim()
    ? args.materialize_path.trim()
    : undefined;

  if (requestedPath && !isAbsolute(requestedPath)) {
    return invalidArguments('materialize_path must be an absolute filesystem path');
  }
  if (!includeImage && !requestedPath) {
    return invalidArguments('include_image=false requires materialize_path so the preview remains accessible');
  }

  let wholeTemp: string | undefined;
  let focusTemp: string | undefined;
  try {
    const focusRegion = requestedFocus(args);
    if (focusRegion && (!Number.isFinite(focusMaxDimension) || focusMaxDimension < 64 || focusMaxDimension > 4096)) {
      throw new Error('focus_max_dimension_px must be between 64 and 4096');
    }

    const documentId = optionalDocumentId(args.document_id);
    const capture = await router.capturePreview({
      ...(documentId === undefined ? {} : { documentId }),
      maxDimension,
      quality,
      ...(focusRegion ? { focusRegion, focusMaxDimension } : {}),
    });

    wholeTemp = capture.whole.path;
    const wholeBytes = await normalizedPreviewBytes(capture.whole, capture.transport, quality);
    if (wholeBytes.byteLength > PREVIEW_LIMIT) {
      return structuredError(
        new Error(`Preview exceeds ${PREVIEW_LIMIT} byte limit (${wholeBytes.byteLength} bytes). Lower max_dimension_px or quality.`)
      );
    }

    const materializedPath = requestedPath ? resolve(requestedPath) : undefined;
    if (materializedPath) {
      await mkdir(dirname(materializedPath), { recursive: true });
      await writeFile(materializedPath, wholeBytes);
    }

    let focusMeta: Record<string, unknown> | undefined;
    let focusBytes: Buffer | undefined;
    if (capture.focus) {
      focusTemp = capture.focus.path;
      focusBytes = await normalizedPreviewBytes(capture.focus, capture.transport, quality);
      if (focusBytes.byteLength > PREVIEW_LIMIT) {
        throw new Error('Focus preview exceeds byte limit; lower focus_max_dimension_px or quality');
      }

      const region = capture.focus.region ?? focusRegion!;
      let focusMaterializedPath: string | undefined;
      if (materializedPath) {
        const parsed = parsePath(materializedPath);
        focusMaterializedPath = join(parsed.dir, `${parsed.name}-focus${parsed.ext || '.jpg'}`);
        await writeFile(focusMaterializedPath, focusBytes);
      }

      focusMeta = {
        width: capture.focus.width,
        height: capture.focus.height,
        bytes: focusBytes.byteLength,
        mime_type: capture.focus.mimeType || 'image/jpeg',
        sha256: hash(focusBytes),
        region,
        ...focusScale(capture.focus, region),
        ...(focusMaterializedPath ? { materialized_path: focusMaterializedPath } : {}),
      };
    }

    const content: ToolResult['content'] = [];
    if (includeImage) {
      content.push({
        type: 'image',
        data: wholeBytes.toString('base64'),
        mimeType: capture.whole.mimeType || 'image/jpeg',
      });
      if (capture.focus && focusBytes) {
        content.push({
          type: 'image',
          data: focusBytes.toString('base64'),
          mimeType: capture.focus.mimeType || 'image/jpeg',
        });
      }
    }

    content.push({
      type: 'text',
      text: JSON.stringify({
        ok: true,
        width: capture.whole.width,
        height: capture.whole.height,
        bytes: wholeBytes.byteLength,
        mime_type: capture.whole.mimeType || 'image/jpeg',
        sha256: hash(wholeBytes),
        include_image: includeImage,
        ...canvasMetadata(capture.whole),
        ...(materializedPath ? { materialized_path: materializedPath } : {}),
        ...(focusMeta ? { focus: focusMeta } : {}),
      }, null, 2),
    });

    return { content };
  } catch (error) {
    return structuredError(error);
  } finally {
    if (wholeTemp) await unlink(wholeTemp).catch(() => undefined);
    if (focusTemp) await unlink(focusTemp).catch(() => undefined);
  }
}

export async function runCapabilities(connection: PhotoshopConnection): Promise<ToolResult> {
  try {
    const version = await connection.getVersion();
    const capabilities = await resolvePhotoshopCapabilities(version);
    return { content: [{ type: 'text', text: JSON.stringify(capabilities, null, 2) }] };
  } catch (error) {
    return structuredError(error);
  }
}
