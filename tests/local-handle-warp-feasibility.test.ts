import { describe, expect, it } from 'vitest';
import { checkHandleWarpGrid, mapHandleWarpPoint, validateHandleWarpDraft, type HandleWarpDraft } from '../src/core/guard/local-handle-warp-feasibility.js';

const draft = (): HandleWarpDraft => ({
  documentId: 63, layerId: 4, ownerId: 'cup_handle',
  allowed: { left: 924, top: 658, right: 976, bottom: 710 },
  protectedUpper: { left: 928, top: 520, right: 1143, bottom: 620 },
  protectedAperture: { left: 980, top: 580, right: 1094, bottom: 682 },
  anchors: [{ from: { x: 949, y: 687 }, to: { x: 948, y: 687 } }],
  maximumShift: 8,
});

describe('offline lower-socket plastic deformation feasibility, never an execution credential', () => {
  it('displaces a local socket while pinning outer boundary, upper contour and aperture', () => {
    const d = draft();
    expect(mapHandleWarpPoint(d, { x: 949, y: 687 }).x).toBeLessThan(949);
    expect(mapHandleWarpPoint(d, { x: 924, y: 687 })).toEqual({ x: 924, y: 687 });
    expect(mapHandleWarpPoint(d, { x: 949, y: 545 })).toEqual({ x: 949, y: 545 });
    expect(mapHandleWarpPoint(d, { x: 1020, y: 638 })).toEqual({ x: 1020, y: 638 });
    const evidence = checkHandleWarpGrid(d);
    expect(evidence.samples).toBeGreaterThan(2500);
    expect(evidence.minimumJacobian).toBeGreaterThan(0.2);
  });
  it('rejects another document, layer or owner', () => {
    for (const changed of [{ documentId: 507 }, { layerId: 11 }, { ownerId: 'handle_glaze_v2' }]) {
      expect(() => validateHandleWarpDraft({ ...draft(), ...changed })).toThrow('handle_warp_owner_mismatch');
    }
  });
  it('rejects escaping the Critic-reviewed socket and protected source', () => {
    expect(() => validateHandleWarpDraft({ ...draft(), allowed: { left: 918, top: 658, right: 976, bottom: 710 } })).toThrow('handle_warp_outside_critic_target');
    expect(() => validateHandleWarpDraft({ ...draft(), anchors: [{ from: { x: 949, y: 545 }, to: { x: 945, y: 545 } }] })).toThrow('handle_warp_invalid_anchor');
  });
  it('rejects excessive shift and folding; geometry never implies Photoshop provenance', () => {
    expect(() => validateHandleWarpDraft({ ...draft(), anchors: [{ from: { x: 949, y: 687 }, to: { x: 935, y: 687 } }] })).toThrow('handle_warp_excessive_shift');
    const d = { ...draft(), anchors: [{ from: { x: 949, y: 687 }, to: { x: 948, y: 687 } }] };
    expect(checkHandleWarpGrid(d).minimumJacobian).toBeGreaterThan(0.2);
  });
});
