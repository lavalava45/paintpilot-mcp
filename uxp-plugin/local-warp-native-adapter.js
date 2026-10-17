// Unregistered experiment. Only an explicitly supplied disposable-document
// capability can call this adapter; production dispatch must remain closed.
// Pixel transform is injected to avoid a second geometry authority in UXP.
async function performLocalWarpNativeExperiment(options) {
  const { imaging, executionContext, verifyAuthority, verifyHistoryRollback,
    digest, transform, documentId, layerId, width, height, roi, protectedRects, disposableProof } = options || {};
  const validRect = r => r && [r.left, r.top, r.right, r.bottom].every(Number.isSafeInteger)
    && r.left >= 0 && r.top >= 0 && r.left < r.right && r.top < r.bottom
    && r.right <= width && r.bottom <= height;
  if (disposableProof !== 'explicit-disposable-photoshop-document'
    || !Number.isSafeInteger(documentId) || documentId < 1
    || !Number.isSafeInteger(layerId) || layerId < 1
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width * height > 16777216
    || !validRect(roi) || !Array.isArray(protectedRects)
    || protectedRects.length > 16 || !protectedRects.every(validRect)
    || typeof verifyAuthority !== 'function' || typeof verifyHistoryRollback !== 'function'
    || typeof digest !== 'function' || typeof transform !== 'function'
    || !imaging || typeof imaging.getPixels !== 'function'
    || typeof imaging.putPixels !== 'function'
    || typeof imaging.createImageDataFromBuffer !== 'function'
    || typeof executionContext?.hostControl?.suspendHistory !== 'function'
    || typeof executionContext?.hostControl?.resumeHistory !== 'function') {
    throw new Error('local_warp_native_capability_closed');
  }
  const extent = { left: 0, top: 0, right: width, bottom: height };
  let beforeImage, afterImage, outputImage, suspended;
  let dispatched = false, committed = false;
  try {
    await verifyAuthority({ documentId, layerId, width, height, phase: 'before' });
    const read = async () => {
      const result = await imaging.getPixels({
        documentID: documentId, layerID: layerId, sourceBounds: extent,
        colorSpace: 'RGB', componentSize: 8, applyAlpha: false,
      });
      const img = result?.imageData;
      if (!img || result.level !== 0 || !result.sourceBounds
        || ['left', 'top', 'right', 'bottom'].some(k => result.sourceBounds[k] !== extent[k])
        || img.width !== width || img.height !== height || img.components !== 4
        || img.componentSize !== 8 || img.hasAlpha !== true || img.colorSpace !== 'RGB'
        || !img.colorProfile || typeof img.getData !== 'function') {
        img?.dispose?.();
        throw new Error('local_warp_native_exact_rgba_unavailable');
      }
      const data = await img.getData({ chunky: true });
      if (!(data instanceof Uint8Array) || data.length !== width * height * 4) {
        img.dispose?.();
        throw new Error('local_warp_native_invalid_pixel_buffer');
      }
      return { img, data: data.slice() };
    };
    const before = await read();
    beforeImage = before.img;
    const beforeDigest = await digest(before.data);
    if (typeof beforeDigest !== 'string' || !beforeDigest) throw new Error('local_warp_native_digest_unavailable');
    const warped = await transform(before.data.slice());
    if (!(warped?.pixels instanceof Uint8Array)
      || warped.pixels.length !== before.data.length
      || typeof warped.changedPixels !== 'number'
      || !Number.isSafeInteger(warped.changedPixels) || warped.changedPixels <= 0)
      throw new Error('local_warp_native_transform_invalid');
    const allowed = warped.changedBounds;
    if (!allowed || ![allowed.left, allowed.top, allowed.right, allowed.bottom].every(Number.isSafeInteger)
      || allowed.left < 0 || allowed.top < 0 || allowed.right > width
      || allowed.bottom > height || allowed.left >= allowed.right || allowed.top >= allowed.bottom)
      throw new Error('local_warp_native_invalid_change_bounds');
    let changed = 0;
    for (let i = 0; i < before.data.length; i += 4) {
      const x = (i / 4) % width, y = Math.floor(i / 4 / width);
      const differs = before.data[i] !== warped.pixels[i]
        || before.data[i + 1] !== warped.pixels[i + 1]
        || before.data[i + 2] !== warped.pixels[i + 2]
        || before.data[i + 3] !== warped.pixels[i + 3];
      if (differs) {
        changed++;
        if (x < allowed.left || x >= allowed.right || y < allowed.top || y >= allowed.bottom
          || x < roi.left || x >= roi.right || y < roi.top || y >= roi.bottom
          || protectedRects.some(r => x >= r.left && x < r.right && y >= r.top && y < r.bottom))
          throw new Error('local_warp_native_change_escaped_bounds');
      }
    }
    if (changed !== warped.changedPixels) throw new Error('local_warp_native_change_count_mismatch');
    const expectedDigest = await digest(warped.pixels);
    if (typeof expectedDigest !== 'string' || !expectedDigest || expectedDigest === beforeDigest)
      throw new Error('local_warp_native_expected_digest_invalid');
    outputImage = await imaging.createImageDataFromBuffer(warped.pixels, {
      width, height, components: 4, chunky: true,
      colorSpace: 'RGB', colorProfile: beforeImage.colorProfile,
    });
    await verifyAuthority({ documentId, layerId, width, height, phase: 'commit' });
    suspended = await executionContext.hostControl.suspendHistory({
      documentID: documentId, name: 'Experimental guarded local warp',
    });
    if (suspended == null) throw new Error('local_warp_native_history_unavailable');
    // Full layer replacement avoids ambiguous partial putPixels replace semantics.
    dispatched = true;
    await imaging.putPixels({
      documentID: documentId, layerID: layerId, imageData: outputImage,
      replace: true, targetBounds: { left: 0, top: 0 },
      commandName: 'Experimental guarded local warp',
    });
    await verifyAuthority({ documentId, layerId, width, height, phase: 'after' });
    const after = await read();
    afterImage = after.img;
    if (await digest(after.data) !== expectedDigest)
      throw new Error('local_warp_native_post_digest_mismatch');
    await executionContext.hostControl.resumeHistory(suspended, true);
    committed = true;
    suspended = null;
    return { beforeDigest, afterDigest: expectedDigest, changedPixels: changed, changedBounds: allowed,
      history: 'native-commit-unproven-until-disposable-acceptance' };
  } catch (cause) {
    if (suspended != null) {
      try {
        await executionContext.hostControl.resumeHistory(suspended, false);
        suspended = null;
        await verifyHistoryRollback({ documentId, layerId, width, height });
        // Read the full layer again after rollback. It must match original bytes.
        if (beforeImage) {
          const result = await imaging.getPixels({
            documentID: documentId, layerID: layerId, sourceBounds: extent,
            colorSpace: 'RGB', componentSize: 8, applyAlpha: false,
          });
          const img = result?.imageData;
          try {
            if (!img || result.level !== 0 || !result.sourceBounds
              || ['left', 'top', 'right', 'bottom'].some(k => result.sourceBounds[k] !== extent[k])
              || img.components !== 4 || img.width !== width || img.height !== height
              || await digest(await img.getData({ chunky: true }))
                !== await digest(await beforeImage.getData({ chunky: true })))
              throw new Error('local_warp_native_rollback_digest_mismatch');
          } finally { img?.dispose?.(); }
        }
      } catch (rollbackError) {
        throw new Error('local_warp_native_rollback_unconfirmed: ' + String(rollbackError?.message || rollbackError)
          + '; cause=' + String(cause?.message || cause));
      }
    } else if (dispatched && !committed) {
      throw new Error('local_warp_native_history_suspension_lost: ' + String(cause?.message || cause));
    }
    throw cause;
  } finally {
    beforeImage?.dispose?.();
    afterImage?.dispose?.();
    outputImage?.dispose?.();
  }
}

module.exports = { performLocalWarpNativeExperiment };
