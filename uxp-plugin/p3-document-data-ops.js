const photoshop = require('photoshop');
const { localFileSystem, types } = require('uxp').storage;

const { action, app, constants, core } = photoshop;

function fileUrlFromNativePath(nativePath, operation) {
  if (typeof nativePath !== 'string' || nativePath.trim().length === 0) {
    throw new Error(`${operation} requires a non-empty absolute path`);
  }
  let normalized = nativePath.trim().replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) normalized = `/${normalized}`;
  if (!normalized.startsWith('/')) {
    throw new Error(`${operation} requires an absolute path: ${nativePath}`);
  }
  return `file:${encodeURI(normalized)}`;
}

function requestedDocumentId(params = {}) {
  return Number.isInteger(params.document_id) && params.document_id > 0
    ? params.document_id
    : null;
}

function requirePinnedActiveDocument(params = {}, operation = 'operation') {
  if (!app.documents || app.documents.length === 0) {
    throw new Error('No active document');
  }
  const doc = app.activeDocument;
  const requestedId = requestedDocumentId(params);
  if (requestedId != null && doc.id !== requestedId) {
    const openIds = Array.from(app.documents).map((entry) => entry.id);
    if (!openIds.includes(requestedId)) {
      throw new Error(`document_not_found: no open document with id ${requestedId}`);
    }
    throw new Error(
      `document_not_active: pinned document ${requestedId} is open but not active; active document was not changed for ${operation}`
    );
  }
  return doc;
}

function verifyOptionalPinnedDocument(params = {}, operation = 'operation') {
  if (requestedDocumentId(params) == null) return;
  requirePinnedActiveDocument(params, operation);
}

function throwBatchPlayError(result, operationName) {
  const first = Array.isArray(result) ? result[0] : null;
  if (first && String(first._obj ?? '').toLowerCase() === 'error') {
    throw new Error(first.message || `${operationName} failed`);
  }
}

function normalizedBounds(bounds) {
  if (!bounds) return null;
  const left = Number(bounds.left);
  const top = Number(bounds.top);
  const right = Number(bounds.right);
  const bottom = Number(bounds.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return { left, top, right, bottom };
}

function contextSnapshot(doc) {
  const context = { hasDocument: Boolean(doc) };
  if (!doc) return context;
  context.document = {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    resolution: doc.resolution,
    colorMode: String(doc.mode),
    layerCount: Array.from(doc.layers ?? []).length,
  };
  const layer = Array.from(doc.activeLayers ?? [])[0] ?? null;
  if (layer) {
    context.activeLayer = {
      name: layer.name,
      kind: String(layer.kind),
      opacity: layer.opacity,
      blendMode: String(layer.blendMode),
      visible: layer.visible,
      locked: layer.locked,
      isBackground: layer.isBackgroundLayer === true,
    };
  } else {
    context.activeLayer = null;
  }
  return context;
}

async function resizeImage(params = {}) {
  const width = Number(params.width);
  const height = Number(params.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('resize_image requires positive finite width and height');
  }
  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params, 'resize_image');
      await doc.resizeImage(
        width,
        height,
        undefined,
        constants.InterpolationMethod?.BICUBIC ?? 'bicubic'
      );
      return { width: doc.width, height: doc.height };
    },
    { commandName: 'MCP Resize Image' }
  );
}

async function cropDocument(params = {}) {
  const left = Number(params.left);
  const top = Number(params.top);
  const right = Number(params.right);
  const bottom = Number(params.bottom);
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    throw new Error('crop_document requires finite bounds with right > left and bottom > top');
  }
  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params, 'crop_document');
      await doc.crop({ left, top, right, bottom });
      return { cropped: true, newWidth: doc.width, newHeight: doc.height };
    },
    { commandName: 'MCP Crop Document' }
  );
}

async function placeImage(params = {}) {
  const filePath = typeof params.filePath === 'string' ? params.filePath.trim() : '';
  if (!filePath) throw new Error('place_image requires a non-empty filePath');
  const x = Number.isFinite(params.x) ? Number(params.x) : 0;
  const y = Number.isFinite(params.y) ? Number(params.y) : 0;
  const entry = await localFileSystem.getEntryWithUrl(fileUrlFromNativePath(filePath, 'place_image'));
  if (!entry || entry.isFile === false) throw new Error(`Image file not found: ${filePath}`);
  const token = await localFileSystem.createSessionToken(entry);

  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params, 'place_image');
      const result = await action.batchPlay(
        [{
          _obj: 'placeEvent',
          null: { _path: token, _kind: 'local' },
          freeTransformCenterState: { _enum: 'quadCenterState', _value: 'QCSAverage' },
          offset: {
            _obj: 'offset',
            horizontal: { _unit: 'pixelsUnit', _value: 0 },
            vertical: { _unit: 'pixelsUnit', _value: 0 },
          },
          _options: { dialogOptions: 'dontDisplay' },
        }],
        { synchronousExecution: true }
      );
      throwBatchPlayError(result, 'place_image');
      const layer = Array.from(doc.activeLayers ?? [])[0] ?? null;
      if (!layer) throw new Error('place_image completed without an active placed layer');
      const before = normalizedBounds(layer.bounds);
      if (before) await layer.translate(x - before.left, y - before.top);
      const after = normalizedBounds(layer.bounds);
      const response = {
        placed: true,
        filePath,
        position: { x, y, semantics: 'absolute_top_left' },
        context: contextSnapshot(doc),
        layerName: layer.name,
      };
      if (after) {
        response.layerBounds = {
          left: after.left,
          top: after.top,
          width: after.right - after.left,
          height: after.bottom - after.top,
        };
      }
      return response;
    },
    { commandName: 'MCP Place Image' }
  );
}

async function imageStack(params = {}) {
  const files = Array.isArray(params.files)
    ? params.files.filter((file) => typeof file === 'string' && file.trim().length > 0)
    : [];
  if (files.length < 2) throw new Error('stack_needs_two_files: image stack requires at least 2 images');
  const stackMode = typeof params.stack_mode === 'string' && params.stack_mode
    ? params.stack_mode
    : 'stackModeMedian';
  const entries = [];
  for (const file of files) {
    try {
      const entry = await localFileSystem.getEntryWithUrl(fileUrlFromNativePath(file, 'image_stack'));
      if (!entry || entry.isFile === false) throw new Error('not a file');
      entries.push(entry);
    } catch {
      throw new Error(`stack_file_not_found: ${file}`);
    }
  }

  return core.executeAsModal(
    async () => {
      verifyOptionalPinnedDocument(params, 'image_stack');
      let base = null;
      for (const entry of entries) {
        const opened = await app.open(entry);
        if (!base) {
          base = opened;
          continue;
        }
        const sourceLayer = Array.from(opened.activeLayers ?? [])[0] ?? null;
        if (!sourceLayer) throw new Error(`image_stack source has no active layer: ${opened.name}`);
        await opened.duplicateLayers([sourceLayer], base);
        await opened.close(constants.SaveOptions?.DONOTSAVECHANGES ?? 'doNotSaveChanges');
      }
      if (!base) throw new Error('image_stack failed to open a base document');
      app.activeDocument = base;

      let result = await action.batchPlay(
        [{
          _obj: 'selectAllLayers',
          _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
          _options: { dialogOptions: 'dontDisplay' },
        }],
        { synchronousExecution: true }
      );
      throwBatchPlayError(result, 'image_stack select all layers');
      result = await action.batchPlay(
        [{ _obj: 'newPlacedLayer', _options: { dialogOptions: 'dontDisplay' } }],
        { synchronousExecution: true }
      );
      throwBatchPlayError(result, 'image_stack convert smart object');
      result = await action.batchPlay(
        [{
          _obj: 'set',
          _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
          to: {
            _obj: 'smartObject',
            stackMode: { _enum: 'stackMode', _value: stackMode },
          },
          _options: { dialogOptions: 'dontDisplay' },
        }],
        { synchronousExecution: true }
      );
      throwBatchPlayError(result, 'image_stack stack mode');
      const layer = Array.from(base.activeLayers ?? [])[0] ?? null;
      return {
        stacked: true,
        file_count: files.length,
        mode: stackMode,
        layer_name: layer?.name ?? '',
      };
    },
    { commandName: 'MCP Image Stack' }
  );
}

async function tryHandleP3DocumentDataOperation(cmdAction, params = {}) {
  switch (cmdAction) {
    case 'resize_image':
      return { handled: true, data: await resizeImage(params) };
    case 'crop_document':
      return { handled: true, data: await cropDocument(params) };
    case 'place_image':
      return { handled: true, data: await placeImage(params) };
    case 'image_stack':
      return { handled: true, data: await imageStack(params) };
    default:
      return { handled: false };
  }
}

module.exports = { tryHandleP3DocumentDataOperation };
