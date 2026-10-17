/**
 * Offline geometric feasibility only. This module does NOT authorize or execute
 * Photoshop mutations and must not be used as a guard method/brush substitute.
 * All coordinates are Photoshop canvas pixels.
 */
export type PixelPoint = { x: number; y: number };
export type PixelRect = { left: number; top: number; right: number; bottom: number };
export interface HandleWarpDraft {
  documentId: number;
  layerId: number;
  ownerId: string;
  allowed: PixelRect;
  protectedUpper: PixelRect;
  protectedAperture: PixelRect;
  anchors: readonly { from: PixelPoint; to: PixelPoint }[];
  maximumShift: number;
}

function inside(p: PixelPoint, r: PixelRect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}
function validRect(r: PixelRect): boolean {
  return [r.left, r.top, r.right, r.bottom].every(Number.isFinite)
    && r.left < r.right && r.top < r.bottom;
}
function smoothstep(t: number): number {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
}

export function validateHandleWarpDraft(d: HandleWarpDraft): void {
  if (d.documentId !== 63 || d.layerId !== 4 || d.ownerId !== 'cup_handle')
    throw new Error('handle_warp_owner_mismatch');
  if (![d.allowed, d.protectedUpper, d.protectedAperture].every(validRect))
    throw new Error('handle_warp_invalid_rectangle');
  const review = { left: 923, top: 520, right: 1103, bottom: 716 };
  const socket = { left: 924, top: 658, right: 976, bottom: 710 };
  if (d.allowed.left < socket.left || d.allowed.top < socket.top
    || d.allowed.right > socket.right || d.allowed.bottom > socket.bottom
    || d.allowed.left < review.left || d.allowed.right > review.right)
    throw new Error('handle_warp_outside_critic_target');
  if (!Number.isFinite(d.maximumShift) || d.maximumShift <= 0 || d.maximumShift > 12)
    throw new Error('handle_warp_excessive_shift');
  if (d.anchors.length < 1 || d.anchors.length > 8)
    throw new Error('handle_warp_invalid_anchors');
  for (const { from, to } of d.anchors) {
    if (![from.x, from.y, to.x, to.y].every(Number.isFinite)
      || !inside(from, d.allowed) || !inside(to, d.allowed))
      throw new Error('handle_warp_invalid_anchor');
    if (inside(from, d.protectedUpper) || inside(to, d.protectedUpper)
      || inside(from, d.protectedAperture) || inside(to, d.protectedAperture))
      throw new Error('handle_warp_protected_zone');
    if (Math.hypot(to.x - from.x, to.y - from.y) > d.maximumShift)
      throw new Error('handle_warp_excessive_shift');
  }
}

/** Identity on and outside the allowed boundary and in protected areas. */
export function mapHandleWarpPoint(d: HandleWarpDraft, p: PixelPoint): PixelPoint {
  validateHandleWarpDraft(d);
  if (!inside(p, d.allowed) || inside(p, d.protectedUpper)
    || inside(p, d.protectedAperture)) return { ...p };
  const r = d.allowed;
  const edge = Math.min(p.x - r.left, r.right - p.x, p.y - r.top, r.bottom - p.y);
  const edgeWeight = smoothstep(edge / 7);
  let dx = 0, dy = 0, total = 0;
  for (const a of d.anchors) {
    const distance2 = (p.x - a.from.x) ** 2 + (p.y - a.from.y) ** 2;
    const weight = 1 / (9 + distance2);
    total += weight;
    dx += (a.to.x - a.from.x) * weight;
    dy += (a.to.y - a.from.y) * weight;
  }
  return { x: p.x + edgeWeight * dx / total, y: p.y + edgeWeight * dy / total };
}

/**
 * A positive Jacobian for every sampled cell is necessary (not sufficient)
 * for a fold-free deformation. The target protection must hold as well.
 */
export function checkHandleWarpGrid(d: HandleWarpDraft, step = 1): {
  samples: number; minimumJacobian: number; maximumDisplacement: number;
} {
  validateHandleWarpDraft(d);
  if (!Number.isInteger(step) || step < 1 || step > 4) throw new Error('handle_warp_invalid_grid');
  let minimumJacobian = Infinity, maximumDisplacement = 0, samples = 0;
  for (let y = d.allowed.top; y + step <= d.allowed.bottom; y += step) {
    for (let x = d.allowed.left; x + step <= d.allowed.right; x += step) {
      const p = { x, y }, q = mapHandleWarpPoint(d, p);
      const qx = mapHandleWarpPoint(d, { x: x + step, y });
      const qy = mapHandleWarpPoint(d, { x, y: y + step });
      const jacobian = ((qx.x - q.x) * (qy.y - q.y) - (qx.y - q.y) * (qy.x - q.x)) / (step * step);
      minimumJacobian = Math.min(minimumJacobian, jacobian);
      maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(q.x - x, q.y - y));
      samples++;
    }
  }
  if (minimumJacobian <= 0.2) throw new Error('handle_warp_fold_or_shear_risk');
  if (maximumDisplacement > d.maximumShift + 1e-8) throw new Error('handle_warp_excessive_shift');
  return { samples, minimumJacobian, maximumDisplacement };
}
