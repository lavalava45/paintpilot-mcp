const photoshop = require('photoshop');

const { action, app, constants, core } = photoshop;

function requestedDocumentId(params = {}) {
  return Number.isInteger(params.document_id) && params.document_id > 0
    ? params.document_id
    : null;
}

function requirePinnedActiveDocument(params = {}) {
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
      `document_not_active: pinned document ${requestedId} is open but not active; active document was not changed`
    );
  }
  return doc;
}

function requireActiveLayer(doc, operationName) {
  const layer = Array.from(doc.activeLayers ?? [])[0] ?? null;
  if (!layer) throw new Error(`${operationName}: No active layer`);
  return layer;
}

function findLayerEntry(container, layerId, parentContainer = container) {
  const layers = Array.from(container?.layers ?? []);
  for (const layer of layers) {
    if (layer?.id === layerId) return { layer, parentContainer };
    const nested = findLayerEntry(layer, layerId, layer);
    if (nested) return nested;
  }
  return null;
}

function selectLayerDescriptor(layerId) {
  return {
    _obj: 'select',
    _target: [{ _ref: 'layer', _id: layerId }],
    makeVisible: false,
    _options: { dialogOptions: 'dontDisplay' },
  };
}

async function selectOnlyLayer(layerId) {
  await action.batchPlay([selectLayerDescriptor(layerId)], {
    synchronousExecution: true,
    modalBehavior: 'execute',
  });
}

function contextSnapshot(doc) {
  const context = { hasDocument: Boolean(doc) };
  if (!doc) return context;

  const document = {};
  try { document.id = doc.id; } catch {}
  try { document.name = doc.name; } catch {}
  try { document.width = doc.width; } catch {}
  try { document.height = doc.height; } catch {}
  try { document.resolution = doc.resolution; } catch {}
  try { document.colorMode = String(doc.mode); } catch {}
  try { document.layerCount = Array.from(doc.layers ?? []).length; } catch {}
  context.document = document;

  const layer = Array.from(doc.activeLayers ?? [])[0] ?? null;
  if (!layer) {
    context.activeLayer = null;
    return context;
  }

  const activeLayer = {};
  try { activeLayer.name = layer.name; } catch {}
  try { activeLayer.kind = String(layer.kind); } catch {}
  try { activeLayer.opacity = layer.opacity; } catch {}
  try { activeLayer.blendMode = String(layer.blendMode); } catch {}
  try { activeLayer.visible = layer.visible; } catch {}
  try { activeLayer.locked = layer.locked; } catch {}
  try { activeLayer.isBackground = layer.isBackgroundLayer === true; } catch {}
  try {
    const bounds = layer.bounds;
    activeLayer.bounds = {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
    };
  } catch {
    // Some layer kinds do not expose bounds.
  }
  context.activeLayer = activeLayer;
  return context;
}

function requireFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

async function fitLayerToDocument(params = {}) {
  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params);
      const layer = requireActiveLayer(doc, 'fit_layer_to_document');
      if (layer.isBackgroundLayer) throw new Error('Cannot transform background layer');

      const bounds = layer.bounds;
      const layerWidth = bounds.width;
      const layerHeight = bounds.height;
      if (!(layerWidth > 0) || !(layerHeight > 0)) {
        throw new Error('Cannot fit a layer with empty bounds');
      }

      const canvasWidth = doc.width;
      const canvasHeight = doc.height;
      const widthRatio = canvasWidth / layerWidth;
      const heightRatio = canvasHeight / layerHeight;
      const fillDocument = params.fillDocument === true;
      const scaleFactor = fillDocument
        ? Math.max(widthRatio, heightRatio)
        : Math.min(widthRatio, heightRatio);
      const scalePercent = scaleFactor * 100;
      const originalCenterX = bounds.left + layerWidth / 2;
      const originalCenterY = bounds.top + layerHeight / 2;

      await layer.scale(
        scalePercent,
        scalePercent,
        constants.AnchorPosition.MIDDLECENTER
      );
      await layer.translate(
        canvasWidth / 2 - originalCenterX,
        canvasHeight / 2 - originalCenterY
      );

      return {
        fitted: true,
        mode: fillDocument ? 'fill' : 'fit',
        originalSize: { width: layerWidth, height: layerHeight },
        newSize: {
          width: layerWidth * scaleFactor,
          height: layerHeight * scaleFactor,
        },
        scaleFactor,
        scalePercent,
        context: contextSnapshot(doc),
      };
    },
    { commandName: 'MCP Fit Layer To Document' }
  );
}

async function scaleLayer(params = {}) {
  const scalePercent = requireFiniteNumber(params.scalePercent, 'scalePercent');
  if (scalePercent <= 0) throw new Error('scalePercent must be greater than zero');
  const centerAnchor = params.centerAnchor !== false;

  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params);
      const layer = requireActiveLayer(doc, 'scale_layer');
      if (layer.isBackgroundLayer) throw new Error('Cannot transform background layer');
      await layer.scale(
        scalePercent,
        scalePercent,
        centerAnchor ? constants.AnchorPosition.MIDDLECENTER : constants.AnchorPosition.TOPLEFT
      );
      return { scaled: true, percent: scalePercent };
    },
    { commandName: 'MCP Scale Layer' }
  );
}

async function moveLayerPixels(params = {}) {
  const deltaX = requireFiniteNumber(params.deltaX, 'deltaX');
  const deltaY = requireFiniteNumber(params.deltaY, 'deltaY');
  if (params.connected_move !== undefined) {
    return moveConnectedLayerPixels(params, deltaX, deltaY);
  }

  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params);
      const layer = requireActiveLayer(doc, 'move_layer_pixels');
      if (layer.isBackgroundLayer) throw new Error('Cannot move background layer');
      await layer.translate(deltaX, deltaY);
      return { moved: true, deltaX, deltaY };
    },
    { commandName: 'MCP Move Layer Pixels' }
  );
}

async function transformLayer(params = {}) {
  const deltaX = requireFiniteNumber(params.translation?.x, 'translation.x');
  const deltaY = requireFiniteNumber(params.translation?.y, 'translation.y');
  const layerId = params.layer_id;
  if (!Number.isSafeInteger(layerId) || layerId < 1 || (deltaX === 0 && deltaY === 0)
      || Math.abs(deltaX) > 128 || Math.abs(deltaY) > 128) {
    throw new Error('transform_parameters_invalid');
  }
  return core.executeAsModal(async () => {
    const doc = requirePinnedActiveDocument(params);
    const target = findLayerEntry(doc, layerId, doc)?.layer;
    if (!target || target.isBackgroundLayer || target.visible !== true
        || target.kind !== constants.LayerKind.NORMAL) throw new Error('transform_layer_identity_mismatch');
    const previouslyActiveId = Array.from(doc.activeLayers ?? [])[0]?.id ?? null;
    try {
      if (previouslyActiveId !== layerId) await selectOnlyLayer(layerId);
      const layer = requireActiveLayer(doc, 'transform_layer');
      if (layer.id !== layerId || layer.isBackgroundLayer || layer.visible !== true
        || layer.kind !== constants.LayerKind.NORMAL) throw new Error('transform_layer_identity_mismatch');
      const before = { ...layer.bounds };
      await layer.translate(deltaX, deltaY);
      const actualAfter = findLayerEntry(doc, layerId, doc)?.layer?.bounds ?? layer.bounds;
      const after = { ...actualAfter };
      if (Math.abs(after.left - before.left - deltaX) > 1
          || Math.abs(after.top - before.top - deltaY) > 1) throw new Error('transform_native_bounds_unverified');
      return { transformed: true, document_id: doc.id, layer_id: layerId,
        translation: { x: deltaX, y: deltaY }, before, after };
    } finally {
      if (previouslyActiveId != null && previouslyActiveId !== layerId
          && findLayerEntry(doc, previouslyActiveId, doc)) await selectOnlyLayer(previouslyActiveId);
    }
  }, { commandName: 'MCP Guarded Transform Layer' });
}

// Creates actual reflected pixels from one existing raster source. It never
// synthesizes another building/tree and never modifies the source or water
// receiver. A failed native flip/geometry verification aborts the History
// suspension rather than leaving a half-created semantic owner behind.
async function createSourceBoundReflection(params = {}) {
  const sourceId = params.source_layer_id;
  const receiverId = params.receiver_layer_id;
  const waterline = params.waterline_y;
  const xOffset = params.horizontal_offset ?? 0;
  const opacity = params.opacity ?? 65;
  const expected = params.expected_source_bounds;
  const layerName = params.name;
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !Number.isSafeInteger(receiverId)
      || receiverId <= 0 || sourceId === receiverId
      || typeof layerName !== 'string' || !layerName.trim() || layerName.length > 120
      || !Number.isFinite(waterline) || !Number.isFinite(xOffset) || Math.abs(xOffset) > 128
      || !Number.isFinite(opacity) || opacity < 5 || opacity > 90
      || !expected || !['left', 'top', 'right', 'bottom'].every(k => Number.isFinite(expected[k]))) {
    throw new Error('reflection_manifest_invalid: pin source, water receiver, source bounds, waterline, opacity and new layer name');
  }
  return core.executeAsModal(async (executionContext) => {
    const doc = requirePinnedActiveDocument(params);
    const source = findLayerEntry(doc, sourceId)?.layer;
    const receiver = findLayerEntry(doc, receiverId)?.layer;
    if (!source || !receiver || source.isBackgroundLayer || source.visible !== true
        || source.kind !== constants.LayerKind.NORMAL || receiver.visible !== true
        || receiver.id === sourceId) throw new Error('reflection_source_or_receiver_unavailable');
    const bounds = source.bounds;
    const before = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
    if (!Object.keys(before).every(k => Number.isFinite(before[k]) && Math.abs(before[k] - expected[k]) <= 1)
        || !(before.right > before.left && before.bottom > before.top)
        || before.bottom > waterline + 1 || waterline <= 0 || waterline >= doc.height) {
      throw new Error('reflection_source_bounds_stale: expected visible source pixels entirely above the waterline');
    }
    const yOffset = 2 * waterline - before.top - before.bottom;
    const target = { left: before.left + xOffset, right: before.right + xOffset,
      top: before.top + yOffset, bottom: before.bottom + yOffset };
    if (target.left < 0 || target.right > doc.width || target.top < waterline - 1
        || target.bottom > doc.height) throw new Error('reflection_target_out_of_canvas');
    const receiverBounds = receiver.bounds;
    if (!Number.isFinite(receiverBounds.top) || !Number.isFinite(receiverBounds.bottom)
        || receiverBounds.top > waterline + 1 || receiverBounds.bottom <= waterline) {
      throw new Error('reflection_receiver_waterline_mismatch: pin the actual receiving water layer');
    }
    const originalActiveId = Array.from(doc.activeLayers ?? [])[0]?.id ?? null;
    let suspensionId;
    try {
      suspensionId = await executionContext.hostControl.suspendHistory({
        documentID: doc.id, name: 'MCP Source-Bound Water Reflection',
      });
      await selectOnlyLayer(sourceId);
      if (requireActiveLayer(doc, 'source_bound_reflection').id !== sourceId) throw new Error('reflection_source_selection_unverified');
      const duplicate = await source.duplicate();
      if (!Number.isSafeInteger(duplicate?.id) || duplicate.id === sourceId || duplicate.id === receiverId) {
        throw new Error('reflection_duplicate_id_unverified');
      }
      await selectOnlyLayer(duplicate.id);
      if (requireActiveLayer(doc, 'source_bound_reflection').id !== duplicate.id) throw new Error('reflection_copy_selection_unverified');
      const flipped = await action.batchPlay([{
        _obj: 'transform',
        _target: [{ _ref: 'layer', _id: duplicate.id }],
        freeTransformCenterState: { _enum: 'quadCenterState', _value: 'QCSAverage' },
        width: { _unit: 'percentUnit', _value: 100 },
        height: { _unit: 'percentUnit', _value: -100 },
        linked: false,
        _options: { dialogOptions: 'dontDisplay' },
      }], { synchronousExecution: true, modalBehavior: 'execute' });
      if (!Array.isArray(flipped) || flipped.length !== 1 || flipped[0]?._obj === 'error') {
        throw new Error('reflection_native_vertical_flip_unverified');
      }
      await duplicate.translate(xOffset, yOffset);
      duplicate.name = layerName.trim();
      duplicate.opacity = opacity;
      duplicate.move(receiver, constants.ElementPlacement.PLACEBEFORE);
      const actualCopy = findLayerEntry(doc, duplicate.id)?.layer;
      const actualSource = findLayerEntry(doc, sourceId)?.layer;
      if (!actualCopy || !actualSource || actualCopy.name !== layerName.trim()
          || Math.abs(actualCopy.opacity - opacity) > 1) throw new Error('reflection_copy_missing_after_transform');
      const after = actualCopy.bounds;
      const sourceAfter = actualSource.bounds;
      if (!Object.keys(target).every(k => Math.abs(after[k] - target[k]) <= 1)
          || !Object.keys(before).every(k => Math.abs(sourceAfter[k] - before[k]) <= 1)) {
        throw new Error('reflection_native_geometry_unverified: copied or original raster bounds changed unexpectedly');
      }
      if (originalActiveId != null && findLayerEntry(doc, originalActiveId)) await selectOnlyLayer(originalActiveId);
      await executionContext.hostControl.resumeHistory(suspensionId, true);
      suspensionId = undefined;
      return { reflected: true, document_id: doc.id, layerId: duplicate.id,
        layerName: duplicate.name, source_layer_id: sourceId, receiver_layer_id: receiverId,
        source_bounds: before, reflected_bounds: target, waterline_y: waterline,
        transform: 'native_vertical_flip_then_translation', history_steps: 1 };
    } catch (error) {
      if (suspensionId !== undefined) {
        try { await executionContext.hostControl.resumeHistory(suspensionId, false); }
        catch (abortError) {
          throw new Error(`reflection_rollback_unconfirmed: ${String(abortError?.message ?? abortError)}; cause=${String(error?.message ?? error)}`);
        }
      }
      throw error;
    }
  }, { commandName: 'MCP Source-Bound Water Reflection' });
}

// One bounded, native, all-or-nothing translation. A semantic relationship
// never implies that Photoshop automatically moves dependent raster layers.
// The caller must pin every physical layer and its observed BEFORE bounds.
async function moveConnectedLayerPixels(params, deltaX, deltaY) {
  const request = params.connected_move;
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('connected_move_invalid: expected a pinned owner/physical-layer manifest');
  }
  if (Math.abs(deltaX) > 512 || Math.abs(deltaY) > 512 || (deltaX === 0 && deltaY === 0)) {
    throw new Error('connected_move_delta_invalid: nonzero bounded translation required');
  }
  const parent = request.parent;
  const children = request.children;
  const entries = [parent, ...(Array.isArray(children) ? children : [])];
  if (!parent || !Array.isArray(children) || children.length < 1 || children.length > 7
      || entries.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new Error('connected_move_manifest_invalid: one parent and 1–7 child layers are required');
  }
  const ids = new Set();
  const owners = new Set();
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.layer_id) || entry.layer_id <= 0
        || typeof entry.owner_id !== 'string' || !entry.owner_id.trim()
        || ids.has(entry.layer_id) || owners.has(entry.owner_id)) {
      throw new Error('connected_move_identity_invalid: distinct positive layer IDs and owner IDs required');
    }
    ids.add(entry.layer_id);
    owners.add(entry.owner_id);
    const b = entry.expected_bounds;
    if (!b || !['left', 'top', 'right', 'bottom'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k]))
        || !(b.right > b.left && b.bottom > b.top)) {
      throw new Error('connected_move_bounds_invalid: finite positive expected bounds required for every layer');
    }
  }
  // A guard-owned call enters one modal Photoshop History suspension. If any
  // native move/verification fails, abort the entire History suspension rather
  // than offering a partial receipt or guessing multiple Undo operations.
  return core.executeAsModal(async (executionContext) => {
    const doc = requirePinnedActiveDocument(params);
    const before = entries.map(entry => {
      const found = findLayerEntry(doc, entry.layer_id);
      const layer = found?.layer;
      if (!layer || layer.isBackgroundLayer || layer.visible !== true
          || String(layer.kind) !== String(constants.LayerKind.NORMAL)) {
        throw new Error('connected_move_layer_unavailable: expected a visible native NORMAL layer with pinned ID');
      }
      const b = layer.bounds;
      const actual = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      if (!Object.keys(actual).every(k => typeof actual[k] === 'number' && Number.isFinite(actual[k]))
          || !Object.keys(actual).every(k => Math.abs(actual[k] - entry.expected_bounds[k]) <= 1)) {
        throw new Error('connected_move_bounds_stale: native BEFORE bounds differ from the pinned owner manifest');
      }
      return { owner_id: entry.owner_id, layer_id: entry.layer_id, layer, source_bounds: actual };
    });
    let suspensionId;
    try {
      suspensionId = await executionContext.hostControl.suspendHistory({
        documentID: doc.id, name: 'MCP Connected Move',
      });
      const initialActiveLayerId = Array.from(doc.activeLayers ?? [])[0]?.id ?? null;
      // Photoshop Layer.translate can silently leave non-active layer pixels
      // unchanged. Pin each target by an explicit selection *inside* the same
      // History suspension, never via an independent preparation History step.
      for (const row of before) {
        if (Array.from(doc.activeLayers ?? [])[0]?.id !== row.layer_id) {
          await selectOnlyLayer(row.layer_id);
        }
        const selected = requireActiveLayer(doc, 'connected_move');
        if (selected.id !== row.layer_id) {
          throw new Error('connected_move_selection_unverified: active Photoshop layer does not match pinned ID');
        }
        await selected.translate(deltaX, deltaY);
      }
      const receipts = [];
      for (const row of before) {
        // Reacquire the layer by its stable physical ID rather than trusting
        // the pre-transform DOM proxy captured before suspendHistory.
        const nativeLayer = findLayerEntry(doc, row.layer_id)?.layer;
        if (!nativeLayer) throw new Error('connected_move_layer_missing_after_translation');
        const b = nativeLayer.bounds;
        const target = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        if (!Object.keys(target).every(k => typeof target[k] === 'number' && Number.isFinite(target[k]))
            || !Object.keys(target).every(k =>
              Math.abs(target[k] - (row.source_bounds[k] + (k === 'left' || k === 'right' ? deltaX : deltaY))) <= 1)) {
          throw new Error('connected_move_target_unverified: ' + JSON.stringify({
            owner_id: row.owner_id, layer_id: row.layer_id,
            source_bounds: row.source_bounds, observed_bounds: target, deltaX, deltaY,
          }));
        }
        receipts.push({ owner_id: row.owner_id, layer_id: row.layer_id,
          source_bounds: row.source_bounds, target_bounds: target });
      }
      if (initialActiveLayerId != null
          && Array.from(doc.activeLayers ?? [])[0]?.id !== initialActiveLayerId) {
        await selectOnlyLayer(initialActiveLayerId);
        if (Array.from(doc.activeLayers ?? [])[0]?.id !== initialActiveLayerId) {
          throw new Error('connected_move_active_layer_restore_unverified');
        }
      }
      await executionContext.hostControl.resumeHistory(suspensionId, true);
      suspensionId = undefined;
      return {
        moved: true, connected: true, deltaX, deltaY,
        parent_owner_id: parent.owner_id, layer_receipts: receipts,
        history_steps: 1,
      };
    } catch (error) {
      if (suspensionId !== undefined) {
        try { await executionContext.hostControl.resumeHistory(suspensionId, false); }
        catch (abortError) {
          throw new Error(`connected_move_rollback_unconfirmed: ${String(abortError?.message ?? abortError)}; cause=${String(error?.message ?? error)}`);
        }
      }
      throw error;
    }
  }, { commandName: 'MCP Connected Move' });
}

async function rotateLayer(params = {}) {
  const degrees = requireFiniteNumber(params.degrees, 'degrees');

  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params);
      const layer = requireActiveLayer(doc, 'rotate_layer');
      if (layer.isBackgroundLayer) throw new Error('Cannot rotate background layer');
      await layer.rotate(degrees, constants.AnchorPosition.MIDDLECENTER);
      return { rotated: true, degrees };
    },
    { commandName: 'MCP Rotate Layer' }
  );
}

async function flattenImage(params = {}) {
  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params);
      await doc.flatten();
      return { flattened: true };
    },
    { commandName: 'MCP Flatten Image' }
  );
}

async function mergeVisibleLayers(params = {}) {
  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params);
      await doc.mergeVisibleLayers();
      return { merged: true };
    },
    { commandName: 'MCP Merge Visible Layers' }
  );
}

async function mergeLayerDown(params = {}) {
  const sourceId = Number.isInteger(params.layer_id) && params.layer_id > 0
    ? params.layer_id
    : null;
  const targetId = Number.isInteger(params.target_layer_id) && params.target_layer_id > 0
    ? params.target_layer_id
    : null;
  if (sourceId == null) throw new Error('layer_id must be a positive integer');
  if (targetId == null) throw new Error('target_layer_id must be a positive integer');
  if (sourceId === targetId) throw new Error('layer_id and target_layer_id must differ');

  return core.executeAsModal(
    async () => {
      const doc = requirePinnedActiveDocument(params);
      const sourceEntry = findLayerEntry(doc, sourceId, doc);
      const targetEntry = findLayerEntry(doc, targetId, doc);
      if (!sourceEntry) throw new Error(`Source layer id not found: ${sourceId}`);
      if (!targetEntry) throw new Error(`Merge target layer id not found: ${targetId}`);
      if (sourceEntry.parentContainer !== targetEntry.parentContainer) {
        throw new Error('Merge requires source and target to share the same parent');
      }

      const stack = Array.from(sourceEntry.parentContainer.layers ?? []);
      const sourceIndex = stack.findIndex((entry) => entry?.id === sourceId);
      const targetIndex = stack.findIndex((entry) => entry?.id === targetId);
      if (sourceIndex < 0 || targetIndex !== sourceIndex + 1) {
        throw new Error('Merge target must be the immediately-below sibling layer');
      }
      if (sourceEntry.layer.kind === constants.LayerKind.GROUP ||
          targetEntry.layer.kind === constants.LayerKind.GROUP) {
        throw new Error('Merge requires raster/art layers');
      }

      const originalActiveLayer = Array.from(doc.activeLayers ?? [])[0] ?? null;
      const originalActiveLayerId = originalActiveLayer?.id ?? null;
      const sourceName = sourceEntry.layer.name;
      const targetName = targetEntry.layer.name;

      await selectOnlyLayer(sourceId);
      const merged = await sourceEntry.layer.merge();
      const mergedId = merged?.id ?? null;
      const mergedName = merged?.name ?? sourceName;

      if (originalActiveLayerId != null &&
          originalActiveLayerId !== sourceId &&
          originalActiveLayerId !== targetId &&
          findLayerEntry(doc, originalActiveLayerId, doc)) {
        try {
          await selectOnlyLayer(originalActiveLayerId);
        } catch {
          // Best-effort restoration after the merge, matching the legacy path.
        }
      }

      return {
        merged: true,
        sourceLayerId: sourceId,
        sourceLayerName: sourceName,
        targetLayerId: targetId,
        targetLayerName: targetName,
        mergedLayerId: mergedId,
        mergedLayerName: mergedName,
        originalActiveLayerId,
        context: contextSnapshot(doc),
      };
    },
    { commandName: 'MCP Merge Layer Down' }
  );
}

async function tryHandleP1LayerOperation(cmdAction, params = {}) {
  switch (cmdAction) {
    case 'fit_layer_to_document':
      return { handled: true, data: await fitLayerToDocument(params) };
    case 'scale_layer':
      return { handled: true, data: await scaleLayer(params) };
    case 'move_layer_pixels':
      return { handled: true, data: await moveLayerPixels(params) };
    case 'transform_layer':
      return { handled: true, data: await transformLayer(params) };
    case 'source_bound_reflection':
      return { handled: true, data: await createSourceBoundReflection(params) };
    case 'rotate_layer':
      return { handled: true, data: await rotateLayer(params) };
    case 'flatten_image':
      return { handled: true, data: await flattenImage(params) };
    case 'merge_visible_layers':
      return { handled: true, data: await mergeVisibleLayers(params) };
    case 'merge_layer_down':
      return { handled: true, data: await mergeLayerDown(params) };
    default:
      return { handled: false };
  }
}

module.exports = { tryHandleP1LayerOperation };
