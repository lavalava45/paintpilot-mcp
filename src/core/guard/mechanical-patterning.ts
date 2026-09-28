type Bounds = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };

type Primitive = {
  id: string;
  kind: 'stroke' | 'region' | 'stamp';
  order: number;
  lines: Point[][];
  bounds: Bounds;
  sourceKey?: string;
};

type Instance = {
  id: string;
  bounds: Bounds;
  primitives: Primitive[];
};

type GeometryDescriptor = {
  topology: string;
  distances: number[];
};

export type MechanicalPatterningAnalysis = {
  protocol: 'photoshop.guard.mechanical_patterning.v1';
  triggered: boolean;
  classification: 'organic_instances' | 'intentional_regular' | 'unclassified';
  reason: string;
  instance_count: number;
  repeated_cluster_size: number;
  distribution_intent?: 'organic-clustered' | 'directional-broken' | 'perspective-regular' | 'intentional-uniform';
  distribution_failure?: 'uniform-organic-spacing' | 'unbroken-directional-spacing' | 'perspective-progression-mismatch';
  representative_instance_ids: string[];
  representative_regions: Bounds[];
  most_similar_pair?: { a: string; b: string; normalized_error: number };
  findings: Array<{
    kind: 'mechanical_patterning';
    severity: 'should-fix';
    region_bounds: Bounds;
  }>;
};

const DISTRIBUTION_INTENTS = ['organic-clustered', 'directional-broken', 'perspective-regular', 'intentional-uniform'] as const;
type DistributionIntent = (typeof DISTRIBUTION_INTENTS)[number];

function distributionIntent(request: Record<string, any>): DistributionIntent | undefined {
  const micro = request.args && typeof request.args === 'object' && !Array.isArray(request.args) ? request.args : {};
  const value = text(micro.distribution_intent)?.toLowerCase();
  return (DISTRIBUTION_INTENTS as readonly string[]).includes(value ?? '') ? value as DistributionIntent : undefined;
}

function distributionFailure(request: Record<string, any>): { kind: MechanicalPatterningAnalysis['distribution_failure']; regions: Bounds[]; reason: string } | null {
  const intent = distributionIntent(request);
  if (!intent || intent === 'intentional-uniform') return null;
  const rows = motifRows(request).map(row => ({ row, bounds: normalizeBounds(row?.region_bounds) })).filter(item => item.bounds) as Array<{ row: any; bounds: Bounds }>;
  if (rows.length < 4) return null;
  const centers = rows.map(item => center(item.bounds));
  const nearest = centers.map((point, index) => Math.min(...centers.filter((_, other) => other !== index).map(other => Math.hypot(point.x - other.x, point.y - other.y))));
  const mean = nearest.reduce((sum, value) => sum + value, 0) / nearest.length;
  const variance = nearest.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nearest.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  if ((intent === 'organic-clustered' || intent === 'directional-broken') && cv < 0.12) {
    return {
      kind: intent === 'organic-clustered' ? 'uniform-organic-spacing' : 'unbroken-directional-spacing',
      regions: rows.slice(0, 3).map(item => item.bounds),
      reason: intent === 'organic-clustered'
        ? 'declared organic-clustered distribution has mechanically uniform nearest-neighbour spacing; jitter/instance variation is not evidence of clustering, gaps or density hierarchy'
        : 'declared directional-broken distribution has an unbroken mechanically uniform spacing rhythm',
    };
  }
  if (intent === 'perspective-regular') {
    const micro = request.args as Record<string, any>;
    const frame = micro.logical_layer?.surface_frame;
    const depth = frame?.depth_progression;
    const anchor = frame?.convergence_anchor;
    if (depth && anchor && Number.isFinite(Number(anchor.x)) && Number.isFinite(Number(anchor.y))) {
      const expectedRatio = Number(depth.far_scale) / Number(depth.near_scale);
      const sizes = rows.map(item => Math.sqrt(area(item.bounds)));
      const sizeRange = Math.max(...sizes) / Math.max(1e-9, Math.min(...sizes));
      if (Number.isFinite(expectedRatio) && Math.abs(expectedRatio - 1) > 0.15 && sizeRange < 1.12) {
        return {
          kind: 'perspective-progression-mismatch', regions: rows.slice(0, 3).map(item => item.bounds),
          reason: 'declared perspective-regular distribution keeps motif scale effectively depth-invariant despite a materially changing surface-frame depth progression',
        };
      }
    }
  }
  return null;
}

const ORGANIC_RE =
  /(?:\bbird\b|\bbirds\b|\bninja\b|\bninjas\b|\bcharacter\b|\bcharacters\b|\bfigure\b|\bfigures\b|\bcreature\b|\bcreatures\b|\banimal\b|\banimals\b|\borganic\b|\bflower\b|\bflowers\b|\bfoliage\b|\bperson\b|\bpeople\b|\bhuman\b)/i;
const REGULAR_RE =
  /(?:\bwindow grid\b|\bwindows\b|\brailing\b|\brail posts?\b|\btiles?\b|\bmachine[- ]made\b|\bmodules?\b|\buniform formation\b|\bclone formation\b|\bregular pattern\b)/i;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finitePoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function boundsForLines(lines: Point[][]): Bounds | null {
  const points = lines.flat();
  if (!points.length) return null;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  const epsilon = 0.5;
  return {
    left,
    top,
    right: right > left ? right : left + epsilon,
    bottom: bottom > top ? bottom : top + epsilon,
  };
}

function normalizeBounds(value: unknown): Bounds | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const bounds = {
    left: Number(record.left),
    top: Number(record.top),
    right: Number(record.right),
    bottom: Number(record.bottom),
  };
  if (!Object.values(bounds).every(Number.isFinite)) return null;
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return null;
  return bounds;
}

function center(bounds: Bounds): Point {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
}

function contains(bounds: Bounds, point: Point): boolean {
  return point.x >= bounds.left && point.x <= bounds.right
    && point.y >= bounds.top && point.y <= bounds.bottom;
}

function area(bounds: Bounds): number {
  return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
}

function unionBounds(primitives: Primitive[]): Bounds | null {
  if (!primitives.length) return null;
  return {
    left: Math.min(...primitives.map(item => item.bounds.left)),
    top: Math.min(...primitives.map(item => item.bounds.top)),
    right: Math.max(...primitives.map(item => item.bounds.right)),
    bottom: Math.max(...primitives.map(item => item.bounds.bottom)),
  };
}

function stampPrimitivePoints(instance: Record<string, unknown>): Point[] | null {
  const x = Number(instance.x);
  const y = Number(instance.y);
  const size = Number(instance.size);
  if (![x, y, size].every(Number.isFinite) || size <= 0) return null;
  const angle = Number.isFinite(Number(instance.angle)) ? Number(instance.angle) : 0;
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const sx = instance.flip_x === true ? -1 : 1;
  const sy = instance.flip_y === true ? -1 : 1;
  // Use an asymmetric normalized footprint so the descriptor has stable geometry while
  // remaining invariant to translation/rotation/reflection/uniform scale. The profile id
  // remains part of topology, so different source stamps are never collapsed together.
  const normalized = [
    { x: -0.5, y: -0.35 },
    { x: 0.5, y: -0.2 },
    { x: 0.35, y: 0.5 },
    { x: -0.4, y: 0.3 },
  ];
  return normalized.map(point => {
    const px = point.x * size * sx;
    const py = point.y * size * sy;
    return {
      x: px * cos - py * sin + x,
      y: px * sin + py * cos + y,
    };
  });
}

function extractPrimitives(request: Record<string, any>): Primitive[] {
  if (request.tool !== 'photoshop_execute_visual_microplan') return [];
  const micro = request.args && typeof request.args === 'object' && !Array.isArray(request.args)
    ? request.args as Record<string, any>
    : {};
  const steps = Array.isArray(micro.steps) ? micro.steps : [];
  const result: Primitive[] = [];
  let order = 0;
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
    const args = step.args && typeof step.args === 'object' && !Array.isArray(step.args) ? step.args : {};
    const stepId = text(step.id) ?? `step-${stepIndex}`;
    if (step.tool === 'photoshop_paint_strokes' && Array.isArray(args.strokes)) {
      for (let index = 0; index < args.strokes.length; index++) {
        const stroke = args.strokes[index];
        if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke) || !Array.isArray(stroke.points)) continue;
        const points = (stroke.points as unknown[]).map(finitePoint).filter((point: Point | null): point is Point => point !== null);
        if (points.length < 2) continue;
        const lines = [points];
        const bounds = boundsForLines(lines);
        if (!bounds) continue;
        result.push({ id: `${stepId}:stroke:${index}`, kind: 'stroke', order: order++, lines, bounds });
      }
    }
    if (step.tool === 'photoshop_paint_regions' && Array.isArray(args.regions)) {
      for (let index = 0; index < args.regions.length; index++) {
        const region = args.regions[index];
        if (!region || typeof region !== 'object' || Array.isArray(region) || !Array.isArray(region.contours)) continue;
        const lines = region.contours
          .map((contour: unknown) => {
            if (!contour || typeof contour !== 'object' || Array.isArray(contour)) return [];
            const rawPoints = (contour as Record<string, unknown>).points;
            return Array.isArray(rawPoints)
              ? rawPoints.map(finitePoint).filter((point): point is Point => point !== null)
              : [];
          })
          .filter((points: Point[]) => points.length >= 3);
        if (!lines.length) continue;
        const bounds = boundsForLines(lines);
        if (!bounds) continue;
        result.push({ id: `${stepId}:region:${index}`, kind: 'region', order: order++, lines, bounds });
      }
    }
    if (step.tool === 'photoshop_paint_stamp_instances' && Array.isArray(args.instances)) {
      const profileKey = text(args.stamp_profile_id) ?? text(args.preset_name) ?? 'unidentified-stamp';
      for (let index = 0; index < args.instances.length; index++) {
        const instance = args.instances[index];
        if (!instance || typeof instance !== 'object' || Array.isArray(instance)) continue;
        const points = stampPrimitivePoints(instance as Record<string, unknown>);
        if (!points) continue;
        const lines = [points];
        const bounds = boundsForLines(lines);
        if (!bounds) continue;
        result.push({
          id: `${stepId}:stamp:${text((instance as Record<string, unknown>).instance_id) ?? index}`,
          kind: 'stamp',
          order: order++,
          lines,
          bounds,
          sourceKey: profileKey,
        });
      }
    }
  }
  return result;
}

function motifRows(request: Record<string, any>): any[] {
  const observed = Array.isArray(request.observed_motif_instances) ? request.observed_motif_instances : [];
  if (observed.length) return observed;
  const micro = request.args && typeof request.args === 'object' && !Array.isArray(request.args)
    ? request.args as Record<string, any>
    : {};
  return Array.isArray(micro.motif_instances) ? micro.motif_instances : [];
}

function metadataInstances(request: Record<string, any>, primitives: Primitive[]): Instance[] {
  const rows = motifRows(request);
  const instances: Instance[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const declaredBounds = normalizeBounds(row.region_bounds);
    if (!declaredBounds) continue;
    const selected = primitives.filter(primitive => contains(declaredBounds, center(primitive.bounds)));
    if (!selected.length) continue;
    instances.push({
      id: text(row.id) ?? `motif-${index}`,
      bounds: unionBounds(selected) ?? declaredBounds,
      primitives: selected,
    });
  }
  return instances;
}

function automaticInstances(primitives: Primitive[]): Instance[] {
  return primitives.map(primitive => ({
    id: primitive.id,
    bounds: primitive.bounds,
    primitives: [primitive],
  }));
}

function samplePoints(lines: Point[][], limit = 48): Point[] {
  const points = lines.flat();
  if (points.length <= limit) return points;
  const sampled: Point[] = [];
  for (let index = 0; index < limit; index++) {
    sampled.push(points[Math.round(index * (points.length - 1) / (limit - 1))]!);
  }
  return sampled;
}

function descriptor(instance: Instance): GeometryDescriptor | null {
  const primitives = [...instance.primitives].sort((a, b) => a.order - b.order);
  const topology = primitives.map(primitive =>
    `${primitive.kind}${primitive.sourceKey ? `:${primitive.sourceKey}` : ''}:${primitive.lines.map(line => line.length).join('.')}`
  ).join('|');
  const points = samplePoints(primitives.flatMap(primitive => primitive.lines));
  if (points.length < 2) return null;

  const rawDistances: number[] = [];
  let maxDistance = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i]!.x - points[j]!.x;
      const dy = points[i]!.y - points[j]!.y;
      const distance = Math.hypot(dx, dy);
      rawDistances.push(distance);
      maxDistance = Math.max(maxDistance, distance);
    }
  }
  if (!(maxDistance > 1e-9)) return null;
  return {
    topology,
    // Pairwise normalized distances are invariant to translation, rotation,
    // reflection and uniform scale. Order/topology is kept separately.
    distances: rawDistances.map(value => value / maxDistance),
  };
}

function normalizedError(a: GeometryDescriptor, b: GeometryDescriptor): number {
  if (a.topology !== b.topology || a.distances.length !== b.distances.length) return Number.POSITIVE_INFINITY;
  if (!a.distances.length) return Number.POSITIVE_INFINITY;
  let squared = 0;
  for (let index = 0; index < a.distances.length; index++) {
    const delta = a.distances[index]! - b.distances[index]!;
    squared += delta * delta;
  }
  return Math.sqrt(squared / a.distances.length);
}

function largestSimilarCluster(
  instances: Instance[],
  descriptors: Array<GeometryDescriptor | null>,
  threshold = 0.08
): { indexes: number[]; pairs: Array<{ a: number; b: number; error: number }> } {
  const pairs: Array<{ a: number; b: number; error: number }> = [];
  const graph = new Map<number, Set<number>>();
  for (let i = 0; i < instances.length; i++) graph.set(i, new Set());
  for (let i = 0; i < instances.length; i++) {
    if (!descriptors[i]) continue;
    for (let j = i + 1; j < instances.length; j++) {
      if (!descriptors[j]) continue;
      const error = normalizedError(descriptors[i]!, descriptors[j]!);
      if (error <= threshold) {
        pairs.push({ a: i, b: j, error });
        graph.get(i)!.add(j);
        graph.get(j)!.add(i);
      }
    }
  }

  const visited = new Set<number>();
  let largest: number[] = [];
  for (let start = 0; start < instances.length; start++) {
    if (visited.has(start)) continue;
    const stack = [start];
    const component: number[] = [];
    visited.add(start);
    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of graph.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const allowed = new Set(largest);
  return {
    indexes: largest,
    pairs: pairs.filter(pair => allowed.has(pair.a) && allowed.has(pair.b)),
  };
}

function semanticClassification(request: Record<string, any>): 'organic_instances' | 'intentional_regular' | 'unclassified' {
  const micro = request.args && typeof request.args === 'object' && !Array.isArray(request.args)
    ? request.args as Record<string, any>
    : {};
  const explicit = text(micro.pattern_intent)?.toLowerCase();
  if (explicit === 'intentional_regular') return 'intentional_regular';
  if (explicit === 'organic_instances') return 'organic_instances';

  const rows = motifRows(request);
  const motifCategories = rows.length
    ? rows
        .map((row: any) => text(row?.category))
        .filter(Boolean)
        .join(' ')
    : '';
  const semantic = [
    request.summary,
    request.purpose,
    micro.summary,
    micro.intent,
    micro.region,
    micro.expected_visual_result,
    motifCategories,
  ].filter(value => typeof value === 'string').join(' ');

  if (ORGANIC_RE.test(semantic)) return 'organic_instances';
  if (REGULAR_RE.test(semantic)) return 'intentional_regular';
  return 'unclassified';
}

export function analyzeMechanicalPatterning(request: Record<string, any>): MechanicalPatterningAnalysis {
  const classification = semanticClassification(request);
  const declaredDistribution = distributionIntent(request);
  const base: MechanicalPatterningAnalysis = {
    protocol: 'photoshop.guard.mechanical_patterning.v1',
    triggered: false,
    classification,
    reason: '',
    instance_count: 0,
    repeated_cluster_size: 0,
    ...(declaredDistribution ? { distribution_intent: declaredDistribution } : {}),
    representative_instance_ids: [],
    representative_regions: [],
    findings: [],
  };

  if (request.tool !== 'photoshop_execute_visual_microplan') {
    return { ...base, reason: 'not a compact visual micro-plan' };
  }
  const spatialFailure = distributionFailure(request);
  if (spatialFailure) {
    return {
      ...base,
      triggered: true,
      distribution_failure: spatialFailure.kind,
      instance_count: motifRows(request).length,
      reason: spatialFailure.reason,
      representative_regions: spatialFailure.regions,
      representative_instance_ids: motifRows(request).slice(0, spatialFailure.regions.length).map((row: any, index: number) => text(row?.id) ?? `motif-${index}`),
      findings: spatialFailure.regions.map(region_bounds => ({ kind: 'mechanical_patterning' as const, severity: 'should-fix' as const, region_bounds })),
    };
  }
  if (classification === 'intentional_regular') {
    return { ...base, reason: 'explicit/derived intentional regular rhythm is exempt from organic-copy review' };
  }
  if (classification !== 'organic_instances') {
    return { ...base, reason: 'no repeated organic/character/creature motif class was admitted or derived' };
  }

  const primitives = extractPrimitives(request);
  const explicit = metadataInstances(request, primitives);
  const instances = explicit.length >= 2 ? explicit : automaticInstances(primitives);
  base.instance_count = instances.length;
  if (instances.length < 3) {
    return { ...base, reason: 'fewer than three comparable admitted instances' };
  }

  const descriptors = instances.map(descriptor);
  const cluster = largestSimilarCluster(instances, descriptors);
  base.repeated_cluster_size = cluster.indexes.length;
  if (cluster.indexes.length < 3 || !cluster.pairs.length) {
    return { ...base, reason: 'no three-instance near-copy cluster after transform/scale normalization' };
  }

  const closestPair = [...cluster.pairs].sort((a, b) => a.error - b.error)[0]!;
  const largestIndex = [...cluster.indexes].sort(
    (a, b) => area(instances[b]!.bounds) - area(instances[a]!.bounds)
  )[0]!;
  const representativeIndexes = [...new Set([largestIndex, closestPair.a, closestPair.b])];
  const representativeRegions = representativeIndexes.map(index => instances[index]!.bounds);
  const representativeIds = representativeIndexes.map(index => instances[index]!.id);

  return {
    ...base,
    triggered: true,
    reason:
      'admitted organic/character geometry contains a transform/scale/jitter-invariant near-copy cluster; instance-scale visual review is required',
    representative_instance_ids: representativeIds,
    representative_regions: representativeRegions,
    most_similar_pair: {
      a: instances[closestPair.a]!.id,
      b: instances[closestPair.b]!.id,
      normalized_error: Number(closestPair.error.toFixed(6)),
    },
    findings: representativeRegions.map(region_bounds => ({
      kind: 'mechanical_patterning' as const,
      severity: 'should-fix' as const,
      region_bounds,
    })),
  };
}
