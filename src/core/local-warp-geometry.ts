/**
 * E.27 preparatory geometry ONLY. NOT an executable Painting Method Palette
 * method, a Photoshop tool, or permission to mutate a raster owner.
 *
 * Independent implementation of the similarity Moving Least Squares (MLS)
 * formulation described by Schaefer, McLean and Hoppe (2006). The authoring
 * inputs are landmarks; this module does not infer desirable artistic shape.
 * See THIRD_PARTY_NOTICES.md for the algorithm reference.
 *
 * A candidate grid establishes neither per-pixel invertibility nor a safe
 * Photoshop history transaction. Future integration must fail closed until
 * the existing Guard/UXP owner, native deformation, rollback and image review
 * gates are separately passed on real pixels.
 */

export interface LocalWarpPoint { x: number; y: number }
export interface LocalWarpBounds { left: number; top: number; right: number; bottom: number }
export interface LocalWarpLandmark {
  source: LocalWarpPoint;
  destination: LocalWarpPoint;
}
export interface LocalWarpProtectedPoint {
  center: LocalWarpPoint;
  /** Fully static radius (document pixels). */
  radiusPx: number;
}
export interface LocalWarpDraft {
  /** The sole requested existing semantic owner; never a layer-creation hint. */
  ownerId: string;
  physicalLayerId: number;
  documentId: number;
  documentIncarnation: string;
  /** This revision must later be checked against durable Guard geometry. */
  geometryRevision: number;
  canvas: { width: number; height: number };
  roi: LocalWarpBounds;
  /** Exactly authored source -> desired target geometry, 2 to 16 pairs. */
  landmarks: LocalWarpLandmark[];
  /** Protective points do not replace the required native masks/owner pins. */
  protectedPoints?: LocalWarpProtectedPoint[];
  maxDisplacementPx: number;
  /** Upper bound on locally sampled edge length expansion. */
  maxStretchRatio: number;
  /** Target mesh spacing, rounded down to fit a bounded preview grid. */
  gridSpacingPx: number;
  /** Must keep the ROI perimeter fixed; not an authority to edit outside it. */
  edgeFeatherPx: number;
}
export interface LocalWarpGridPoint {
  source: LocalWarpPoint;
  target: LocalWarpPoint;
}
export interface LocalWarpDraftMesh {
  status: 'geometry-candidate-only';
  algorithm: 'similarity-mls';
  ownerId: string;
  physicalLayerId: number;
  documentId: number;
  documentIncarnation: string;
  geometryRevision: number;
  roi: LocalWarpBounds;
  grid: LocalWarpGridPoint[][];
  maxSampledDisplacementPx: number;
  minSampledAreaRatio: number;
  maxSampledStretchRatio: number;
  /** A strict promise: this plan CANNOT be dispatched by itself. */
  executable: false;
  missingAuthorities: [
    'verified-native-uxp-deformation',
    'pinned-owner-and-masks',
    'exact-history-rollback',
    'real-pixel-review'
  ];
}

const EPSILON = 1e-8;
const GRID_LIMIT = 33;
const MIN_AREA_RATIO = 0.2;
const MAX_MLS_LANDMARKS = 16;

export class LocalWarpDraftError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'LocalWarpDraftError';
  }
}

function reject(code: string, detail: string): never {
  throw new LocalWarpDraftError(code, detail);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validPoint(value: unknown): value is LocalWarpPoint {
  return !!value && typeof value === 'object'
    && finite((value as LocalWarpPoint).x) && finite((value as LocalWarpPoint).y);
}

function distance(a: LocalWarpPoint, b: LocalWarpPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inside(point: LocalWarpPoint, rect: LocalWarpBounds): boolean {
  return point.x >= rect.left && point.x <= rect.right
    && point.y >= rect.top && point.y <= rect.bottom;
}

function edgeDistance(point: LocalWarpPoint, rect: LocalWarpBounds): number {
  return Math.min(point.x - rect.left, rect.right - point.x,
    point.y - rect.top, rect.bottom - point.y);
}

function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Similarity MLS maps source landmarks to target landmarks using weighted
 * centroids and a 2D similarity transform. There is no raster resampling here.
 */
function mlsAt(point: LocalWarpPoint, landmarks: readonly LocalWarpLandmark[]): LocalWarpPoint {
  let sumWeights = 0;
  let px = 0; let py = 0; let qx = 0; let qy = 0;
  const weights: number[] = [];
  for (const pair of landmarks) {
    const dx = point.x - pair.source.x;
    const dy = point.y - pair.source.y;
    if (dx * dx + dy * dy <= EPSILON) return { ...pair.destination };
    const weight = 1 / (dx * dx + dy * dy);
    weights.push(weight);
    sumWeights += weight;
    px += weight * pair.source.x;
    py += weight * pair.source.y;
    qx += weight * pair.destination.x;
    qy += weight * pair.destination.y;
  }
  if (!Number.isFinite(sumWeights) || sumWeights <= 0) {
    reject('local_warp_weight_invalid', 'The landmark weights are not numerically finite.');
  }
  px /= sumWeights; py /= sumWeights; qx /= sumWeights; qy /= sumWeights;
  let denominator = 0;
  let real = 0; let imaginary = 0;
  for (let i = 0; i < landmarks.length; i++) {
    const pair = landmarks[i]!;
    const a = pair.source.x - px;
    const b = pair.source.y - py;
    const c = pair.destination.x - qx;
    const d = pair.destination.y - qy;
    const w = weights[i]!;
    denominator += w * (a * a + b * b);
    real += w * (a * c + b * d);
    imaginary += w * (a * d - b * c);
  }
  if (!Number.isFinite(denominator) || denominator <= EPSILON) {
    reject('local_warp_degenerate', 'The weighted landmarks do not define a stable similarity transform.');
  }
  const u = point.x - px;
  const v = point.y - py;
  const output = {
    x: qx + (real * u - imaginary * v) / denominator,
    y: qy + (imaginary * u + real * v) / denominator,
  };
  if (!validPoint(output)) reject('local_warp_nonfinite', 'MLS generated an invalid point.');
  return output;
}

function validateDraft(draft: LocalWarpDraft): void {
  if (!draft || typeof draft.ownerId !== 'string' || !draft.ownerId.trim()
      || !Number.isSafeInteger(draft.physicalLayerId) || draft.physicalLayerId < 1
      || !Number.isSafeInteger(draft.documentId) || draft.documentId < 1
      || typeof draft.documentIncarnation !== 'string' || !draft.documentIncarnation.trim()
      || !Number.isSafeInteger(draft.geometryRevision) || draft.geometryRevision < 1) {
    reject('local_warp_owner_unverified', 'A single real owner and document/geometry authority must be pinned.');
  }
  const { roi, canvas } = draft;
  if (!canvas || !Number.isSafeInteger(canvas.width) || !Number.isSafeInteger(canvas.height)
      || canvas.width <= 0 || canvas.height <= 0 || !roi
      || ![roi.left, roi.top, roi.right, roi.bottom].every(finite)
      || !(roi.right - roi.left >= 32 && roi.bottom - roi.top >= 32)
      || !inside({ x: roi.left, y: roi.top }, { left: 0, top: 0, right: canvas.width, bottom: canvas.height })
      || !inside({ x: roi.right, y: roi.bottom }, { left: 0, top: 0, right: canvas.width, bottom: canvas.height })) {
    reject('local_warp_roi_invalid', 'A finite, nonempty ROI must lie entirely within the pinned canvas.');
  }
  if (!finite(draft.maxDisplacementPx) || draft.maxDisplacementPx <= 0 || draft.maxDisplacementPx > 64
      || !finite(draft.maxStretchRatio) || draft.maxStretchRatio < 1 || draft.maxStretchRatio > 2
      || !finite(draft.gridSpacingPx) || draft.gridSpacingPx < 2 || draft.gridSpacingPx > 32
      || !finite(draft.edgeFeatherPx) || draft.edgeFeatherPx < 2
      || draft.edgeFeatherPx >= Math.min(roi.right - roi.left, roi.bottom - roi.top) / 3) {
    reject('local_warp_limits_invalid', 'Explicit conservative displacement, stretch, grid and edge limits are required.');
  }
  if (!Array.isArray(draft.landmarks)
      || draft.landmarks.length < 2 || draft.landmarks.length > MAX_MLS_LANDMARKS) {
    reject('local_warp_landmarks_missing', 'Similarity MLS requires between 2 and 16 authored landmark pairs.');
  }
  const protectedPoints = draft.protectedPoints ?? [];
  if (!Array.isArray(protectedPoints) || protectedPoints.length > 16) {
    reject('local_warp_protection_invalid', 'No more than 16 explicitly protected points are supported.');
  }
  for (const p of protectedPoints) {
    if (!p || !validPoint(p.center) || !inside(p.center, roi)
        || !finite(p.radiusPx) || p.radiusPx < 0 || p.radiusPx > 64) {
      reject('local_warp_protection_invalid', 'Protected points/radii must be finite and belong to the ROI.');
    }
  }
  for (let i = 0; i < draft.landmarks.length; i++) {
    const pair = draft.landmarks[i]!;
    if (!pair || !validPoint(pair.source) || !validPoint(pair.destination)
        || !inside(pair.source, roi) || !inside(pair.destination, roi)
        || edgeDistance(pair.source, roi) <= draft.edgeFeatherPx
        || edgeDistance(pair.destination, roi) <= draft.edgeFeatherPx
        || distance(pair.source, pair.destination) > draft.maxDisplacementPx) {
      reject('local_warp_landmark_unsafe', 'Each landmark must remain within the unfaded ROI and displacement limit.');
    }
    if (protectedPoints.some(p => distance(pair.source, p.center) <= p.radiusPx + draft.edgeFeatherPx
        || distance(pair.destination, p.center) <= p.radiusPx + draft.edgeFeatherPx)) {
      reject('local_warp_protected_anchor_conflict', 'Source and destination landmarks must both avoid protected anchors.');
    }
    for (let j = 0; j < i; j++) {
      if (distance(pair.source, draft.landmarks[j]!.source) < 2
          || distance(pair.destination, draft.landmarks[j]!.destination) < 2) {
        reject('local_warp_landmarks_degenerate', 'Landmark pairs must have distinct source and destination points.');
      }
    }
  }
}

function area(a: LocalWarpPoint, b: LocalWarpPoint, c: LocalWarpPoint): number {
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

/**
 * Build only an INERT bounded candidate grid. There is intentionally no
 * Photoshop command, raster edit, tool registration, or history mutation.
 */
export function draftLocalWarpGeometry(draft: LocalWarpDraft): LocalWarpDraftMesh {
  validateDraft(draft);
  const { roi } = draft;
  const columns = Math.ceil((roi.right - roi.left) / draft.gridSpacingPx);
  const rows = Math.ceil((roi.bottom - roi.top) / draft.gridSpacingPx);
  if (columns < 1 || rows < 1 || columns >= GRID_LIMIT || rows >= GRID_LIMIT) {
    reject('local_warp_grid_too_large', 'This ROI requires more than a bounded 33 by 33 grid.');
  }
  let maxDisplacement = 0;
  let maxStretch = 1;
  let minAreaRatio = Infinity;
  const grid: LocalWarpGridPoint[][] = [];
  for (let j = 0; j <= rows; j++) {
    const line: LocalWarpGridPoint[] = [];
    for (let i = 0; i <= columns; i++) {
      const source = {
        x: roi.left + ((roi.right - roi.left) * i) / columns,
        y: roi.top + ((roi.bottom - roi.top) * j) / rows,
      };
      const raw = mlsAt(source, draft.landmarks);
      let weight = smoothStep(edgeDistance(source, roi) / draft.edgeFeatherPx);
      for (const protectedPoint of draft.protectedPoints ?? []) {
        weight *= smoothStep((distance(source, protectedPoint.center) - protectedPoint.radiusPx)
          / draft.edgeFeatherPx);
      }
      const target = {
        x: source.x + (raw.x - source.x) * weight,
        y: source.y + (raw.y - source.y) * weight,
      };
      const displacement = distance(source, target);
      if (!validPoint(target) || !inside(target, roi)
          || displacement > draft.maxDisplacementPx + EPSILON) {
        reject('local_warp_displacement_unsafe', 'The MLS candidate leaves its ROI or exceeds its movement bound.');
      }
      maxDisplacement = Math.max(maxDisplacement, displacement);
      line.push({ source, target });
    }
    grid.push(line);
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const a = grid[j]![i]!;
      const b = grid[j]![i + 1]!;
      const c = grid[j + 1]![i]!;
      const d = grid[j + 1]![i + 1]!;
      for (const triangle of [[a, b, c], [b, d, c]] as const) {
        const before = area(triangle[0].source, triangle[1].source, triangle[2].source);
        const after = area(triangle[0].target, triangle[1].target, triangle[2].target);
        const ratio = after / before;
        if (!Number.isFinite(ratio) || ratio < MIN_AREA_RATIO) {
          reject('local_warp_foldover', 'At least one sampled triangle collapses, reverses or compresses excessively.');
        }
        minAreaRatio = Math.min(minAreaRatio, ratio);
      }
      for (const [first, second] of [[a, b], [a, c], [b, d], [c, d]] as const) {
        const stretch = distance(first.target, second.target) / distance(first.source, second.source);
        if (!Number.isFinite(stretch) || stretch > draft.maxStretchRatio + EPSILON
            || stretch < 1 / draft.maxStretchRatio - EPSILON) {
          reject('local_warp_stretch_unsafe', 'One sampled edge stretches or compresses beyond the declared bound.');
        }
        maxStretch = Math.max(maxStretch, stretch, 1 / stretch);
      }
    }
  }
  return {
    status: 'geometry-candidate-only',
    algorithm: 'similarity-mls',
    ownerId: draft.ownerId,
    physicalLayerId: draft.physicalLayerId,
    documentId: draft.documentId,
    documentIncarnation: draft.documentIncarnation,
    geometryRevision: draft.geometryRevision,
    roi: { ...roi },
    grid,
    maxSampledDisplacementPx: maxDisplacement,
    minSampledAreaRatio: minAreaRatio,
    maxSampledStretchRatio: maxStretch,
    executable: false,
    missingAuthorities: [
      'verified-native-uxp-deformation',
      'pinned-owner-and-masks',
      'exact-history-rollback',
      'real-pixel-review',
    ],
  };
}
