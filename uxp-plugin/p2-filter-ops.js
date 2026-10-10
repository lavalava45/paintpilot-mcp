/** P2 filter operations for the Photoshop UXP bridge. */
const photoshop = require('photoshop');
const { action, app, core } = photoshop;

function activeDocument(params = {}) {
  if (!app.documents || app.documents.length === 0) throw new Error('No active document');
  const doc = app.activeDocument;
  const requestedId = Number.isInteger(params.document_id) && params.document_id > 0
    ? params.document_id
    : null;
  if (requestedId != null && doc.id !== requestedId) {
    const openIds = Array.from(app.documents).map((entry) => entry.id);
    if (!openIds.includes(requestedId)) throw new Error(`document_not_found: no open document with id ${requestedId}`);
    throw new Error(`document_not_active: pinned document ${requestedId} is open but not active; active document was not changed`);
  }
  return doc;
}

function contextFor(doc) {
  const layer = Array.from(doc.activeLayers ?? [])[0] ?? null;
  return {
    document: { id: doc.id, name: String(doc.title ?? doc.name ?? '') },
    activeLayer: layer ? { id: layer.id, name: String(layer.name ?? '') } : null,
  };
}

function px(value) {
  return { _unit: 'pixelsUnit', _value: value };
}

function percent(value) {
  return { _unit: 'percentUnit', _value: value };
}

function angle(value) {
  return { _unit: 'angleUnit', _value: value };
}

async function playFilter(params, commandName, descriptor, details) {
  return core.executeAsModal(
    async (executionContext) => {
      const doc = activeDocument(params);
      const protectedBlur = ['gaussianBlur', 'motionBlur', 'smartBlur'].includes(descriptor._obj);
      let sourceLayerId;
      let historyId;
      let committedHistoryUnit = false;
      try {
        if (protectedBlur) {
          const selected = Array.from(doc.activeLayers ?? []);
          const layer = selected[0];
          if (!Number.isSafeInteger(params.layer_id) || params.layer_id <= 0) throw new Error('blur_target_layer_required: supply the exact layer_id');
          if (selected.length !== 1 || layer?.id !== params.layer_id) throw new Error('blur_target_layer_mismatch: select only the exact target layer before filtering');
          if (typeof params.radius !== 'number' || !Number.isFinite(params.radius) || params.radius < (descriptor._obj === 'motionBlur' ? 1 : 0.1)
            || params.radius > (descriptor._obj === 'motionBlur' ? 999 : descriptor._obj === 'smartBlur' ? 100 : 250)) throw new Error('blur_radius_invalid');
          if (descriptor._obj === 'motionBlur' && (typeof params.angle !== 'number' || !Number.isFinite(params.angle) || Math.abs(params.angle) > 360)) throw new Error('blur_angle_invalid');
          if (descriptor._obj === 'smartBlur' && (typeof params.threshold !== 'number' || !Number.isFinite(params.threshold) || params.threshold < 0.1 || params.threshold > 100)) throw new Error('blur_threshold_invalid');
          sourceLayerId = layer.id;
          const smartKind = photoshop.constants.LayerKind.SMARTOBJECT;
          if (layer.kind !== smartKind && layer.kind !== photoshop.constants.LayerKind.NORMAL) throw new Error('blur_source_kind_unsupported: expected a raster layer or embedded Smart Object');
          // Conversion and filter are one bounded Photoshop undo unit. Failure restores the source.
          historyId = await executionContext.hostControl.suspendHistory({ documentID: doc.id, name: commandName });
          if (layer.kind !== smartKind) {
            const converted = await action.batchPlay([{ _obj: 'newPlacedLayer', _options: { dialogOptions: 'silent' } }], { synchronousExecution: true });
            if (converted.some(row => row?._obj === 'error')) throw new Error('blur_smart_object_conversion_failed');
          }
          const current = Array.from(doc.activeLayers ?? []);
          if (current.length !== 1 || current[0].kind !== smartKind) throw new Error('blur_original_preservation_failed: Smart Object required; raster fallback is forbidden');
        }
        const results = await action.batchPlay(
          [{ ...descriptor, _options: { dialogOptions: 'silent' } }],
          { synchronousExecution: true }
        );
        if (results.some(row => row?._obj === 'error')) throw new Error('filter_execution_failed: ' + (results.find(row => row?._obj === 'error')?.message ?? 'Photoshop rejected filter'));
        const current = Array.from(doc.activeLayers ?? []);
        if (protectedBlur && (current.length !== 1 || current[0].kind !== photoshop.constants.LayerKind.SMARTOBJECT)) throw new Error('blur_original_preservation_failed: reconcile without replay');
        if (protectedBlur) {
          const mask = await action.batchPlay([{ _obj: 'get', _target: [{ _property: 'hasFilterMask' }, { _ref: 'layer', _id: current[0].id }], _options: { dialogOptions: 'silent' } }], { synchronousExecution: true });
          if (mask[0]?.hasFilterMask !== true || mask[0]?.filterMaskEnabled === false) throw new Error('blur_filter_mask_unconfirmed: a present enabled Smart Filter mask is required');
        }
        if (historyId !== undefined) {
          // A successful suspendHistory/resumeHistory transaction commits the
          // conversion (when needed) and Smart Filter as ONE native undo unit.
          // Guard must not infer this from the number of underlying batchPlay calls.
          await executionContext.hostControl.resumeHistory(historyId, true);
          historyId = undefined;
          committedHistoryUnit = true;
        }
        return { ...details, ...(protectedBlur ? { original_preserved: true, smart_filter_mask: true, filter_mode: 'smart-filter', source_layer_id: sourceLayerId, layer_id: current[0].id, ...(committedHistoryUnit ? { history_steps: 1 } : {}) } : {}), context: contextFor(doc) };
      } catch (error) {
        if (historyId !== undefined) {
          try { await executionContext.hostControl.resumeHistory(historyId, false); }
          catch (rollbackError) { throw new Error('guarded_blur_rollback_failed: reconcile without replay; ' + rollbackError.message); }
        }
        throw error;
      }
    },
    { commandName }
  );
}

async function applyGaussianBlur(params = {}) {
  return playFilter(
    params,
    'MCP Gaussian Blur',
    { _obj: 'gaussianBlur', radius: px(Number(params.radius)) },
    { filter: 'gaussian_blur', radius: Number(params.radius) }
  );
}

async function applyHighPass(params = {}) {
  return playFilter(
    params,
    'MCP High Pass',
    { _obj: 'highPass', radius: px(Number(params.radius)) },
    { filter: 'high_pass', radius: Number(params.radius) }
  );
}

async function applyMotionBlur(params = {}) {
  return playFilter(
    params,
    'MCP Motion Blur',
    { _obj: 'motionBlur', angle: angle(Number(params.angle)), distance: px(Number(params.radius)) },
    { filter: 'motion_blur', angle: Number(params.angle), radius: Number(params.radius) }
  );
}

async function applyNoise(params = {}) {
  const distribution = String(params.distribution ?? 'UNIFORM').toUpperCase();
  return playFilter(
    params,
    'MCP Add Noise',
    {
      _obj: 'addNoise',
      amount: percent(Number(params.amount)),
      distribution: {
        _enum: 'noiseDistribution',
        _value: distribution === 'GAUSSIAN' ? 'gaussianDistribution' : 'uniformDistribution',
      },
      monochromatic: params.monochromatic === true,
    },
    {
      filter: 'noise',
      amount: Number(params.amount),
      distribution,
      monochromatic: params.monochromatic === true,
    }
  );
}

async function applySharpen(params = {}) {
  return playFilter(
    params,
    'MCP Unsharp Mask',
    {
      _obj: 'unsharpMask',
      amount: percent(Number(params.amount)),
      radius: px(Number(params.radius)),
      threshold: Number(params.threshold ?? 0),
    },
    {
      filter: 'sharpen',
      amount: Number(params.amount),
      radius: Number(params.radius),
      threshold: Number(params.threshold ?? 0),
    }
  );
}

async function applySmartBlur(params = {}) {
  const mode = String(params.mode ?? 'NORMAL').toUpperCase();
  const quality = String(params.quality ?? 'MEDIUM').toUpperCase();
  const modeValues = { NORMAL: 'normal', EDGEONLY: 'edgeOnly', OVERLAYEDGE: 'overlayEdge' };
  const qualityValues = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };
  return playFilter(
    params,
    'MCP Smart Blur',
    {
      _obj: 'smartBlur',
      radius: px(Number(params.radius)),
      threshold: Number(params.threshold),
      quality: { _enum: 'smartBlurQuality', _value: qualityValues[quality] ?? 'medium' },
      mode: { _enum: 'smartBlurMode', _value: modeValues[mode] ?? 'normal' },
    },
    {
      filter: 'smart_blur',
      radius: Number(params.radius),
      threshold: Number(params.threshold),
      mode,
      quality,
    }
  );
}

async function tryHandleP2FilterOperation(cmdAction, params = {}) {
  switch (cmdAction) {
    case 'apply_guarded_gaussian_blur':
    case 'apply_gaussian_blur': return { handled: true, data: await applyGaussianBlur(params) };
    case 'apply_high_pass': return { handled: true, data: await applyHighPass(params) };
    case 'apply_guarded_motion_blur':
    case 'apply_motion_blur': return { handled: true, data: await applyMotionBlur(params) };
    case 'apply_noise': return { handled: true, data: await applyNoise(params) };
    case 'apply_sharpen': return { handled: true, data: await applySharpen(params) };
    case 'apply_guarded_smart_blur':
    case 'apply_smart_blur': return { handled: true, data: await applySmartBlur(params) };
    default: return { handled: false };
  }
}

module.exports = { tryHandleP2FilterOperation };
