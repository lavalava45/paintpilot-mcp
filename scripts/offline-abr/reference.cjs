'use strict';
// Offline ABR morphology only. NEVER grants Photoshop preset identity or Guard authorization.
const fs = require('node:fs');
const crypto = require('node:crypto');
const abr = require('./vendor/brushbox-abr.cjs');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const displayName = value => String(value).split('=').at(-1);

function decode(file) {
  const bytes = fs.readFileSync(file);
  const parsed = abr.parse(bytes, { name: 'offline-source' });
  if (!parsed.ok) throw new Error('abr_parse_failed: ' + (parsed.error || parsed.warnings.join('; ')));
  return {
    file_sha256: sha(bytes), version: parsed.version, warnings: parsed.warnings,
    tips: parsed.brushes.map((brush, index) => {
      const mask = brush.mask;
      const pixels = mask?.data && Uint8Array.from(mask.data);
      const dual = brush.dualTip;
      const dualPixels = dual?.data && Uint8Array.from(dual.data);
      if (pixels && (pixels.length !== mask.width * mask.height || pixels.length > 25_000_000))
        throw new Error('abr_mask_dimensions_invalid');
      if (dualPixels && (dualPixels.length !== dual.width * dual.height || dualPixels.length > 25_000_000))
        throw new Error('abr_dual_mask_dimensions_invalid');
      return {
        index, name: displayName(brush.name), raw_name: brush.name,
        kind: brush.kind, diameter: brush.diameter, hardness: brush.hardness,
        spacing: brush.spacing, roundness: brush.roundness, angle: brush.angle,
        sampled_id: brush.sampleId || null,
        dual_sampled_id: brush.dualBrush?.shape?.sampledData || null,
        dual_width: dual?.width || null, dual_height: dual?.height || null,
        dual_alpha_sha256: dualPixels ? sha(dualPixels) : null,
        dual_alpha: dualPixels || null,
        shape_dynamics: !!brush.shapeDynamics, dual_brush: !!brush.dualBrush,
        width: mask?.width || null, height: mask?.height || null,
        alpha_sha256: pixels ? sha(pixels) : null, alpha: pixels || null,
        status: pixels ? 'decoded-sampled-mask' : brush.kind === 'computed'
          ? 'computed-descriptor-only' : 'unavailable',
      };
    }),
  };
}

// Strict equality is a useful rejection signal. Equality never implies unique native identity.
function compareTips(expected, observed, competing = []) {
  if (!expected?.alpha || !observed?.alpha) return { outcome: 'unknown', reason: 'missing_decoded_mask' };
  if (expected.width !== observed.width || expected.height !== observed.height
    || expected.alpha.length !== observed.alpha.length) return { outcome: 'mismatch', reason: 'dimensions_differ' };
  const expectedHash = sha(expected.alpha);
  const observedHash = sha(observed.alpha);
  if (expectedHash !== observedHash) return { outcome: 'mismatch', reason: 'alpha_pixels_differ' };
  if (competing.some(tip => tip?.alpha && tip.width === expected.width && tip.height === expected.height
    && sha(tip.alpha) === expectedHash)) return { outcome: 'unknown', reason: 'indistinguishable_competing_tip' };
  return { outcome: 'consistent-only', reason: 'matching_decoded_mask_is_not_preset_identity' };
}

module.exports = { decode, compareTips };
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { process.stderr.write('Usage: node reference.cjs <file.abr>\n'); process.exitCode = 2; }
  else {
    const result = decode(file);
    console.log(JSON.stringify({ file_sha256: result.file_sha256, version: result.version,
      total: result.tips.length, warnings: result.warnings,
      tips: result.tips.map(({ alpha, dual_alpha, ...safe }) => safe) }, null, 2));
  }
}
