export const PERCEPTUAL_HIERARCHY_PROTOCOL = 'photoshop.guard.perceptual_hierarchy.v1' as const;

export type PerceptualPriority = 'primary' | 'secondary' | 'support' | 'distributed';
export type PerceptualBudget = 'none' | 'low' | 'medium' | 'high';
export type ChromaAccentBudget = 'none' | 'restricted' | 'allowed';
export type AttentionDimension = 'contrast' | 'detail' | 'edge' | 'chroma';

export interface PerceptualHierarchyZone {
  id: string;
  owner_ids: string[];
  priority: PerceptualPriority;
  contrast_budget: PerceptualBudget;
  detail_budget: PerceptualBudget;
  edge_certainty: PerceptualBudget;
  chroma_accent: ChromaAccentBudget;
}

export interface PerceptualHierarchy {
  protocol: typeof PERCEPTUAL_HIERARCHY_PROTOCOL;
  revision: number;
  mode: 'ranked' | 'distributed';
  zones: PerceptualHierarchyZone[];
  ordering: string[];
  distributed_attention_rationale?: string;
}

export interface AttentionBinding {
  hierarchyRevision: number;
  zoneId: string;
  dimensions: AttentionDimension[];
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}
function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (!ID.test(result)) throw new Error(`${path} must be a stable id`);
  return result;
}
function positiveInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new Error(`${path} must be a positive integer`);
  return value;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], path: string): T {
  const result = text(value, path) as T;
  if (!values.includes(result)) throw new Error(`${path} must be one of ${values.join('|')}`);
  return result;
}

export function normalizePerceptualHierarchy(value: unknown): PerceptualHierarchy {
  const raw = obj(value, 'perceptual_hierarchy');
  const revision = positiveInt(raw.revision, 'perceptual_hierarchy.revision');
  const mode = enumValue(raw.mode ?? 'ranked', ['ranked', 'distributed'] as const, 'perceptual_hierarchy.mode');
  if (!Array.isArray(raw.zones) || !raw.zones.length || raw.zones.length > 24) {
    throw new Error('perceptual_hierarchy.zones must contain 1-24 zones');
  }
  const zoneIds = new Set<string>();
  const ownerIds = new Set<string>();
  const zones = raw.zones.map((entry, index) => {
    const row = obj(entry, `perceptual_hierarchy.zones[${index}]`);
    const zoneId = id(row.id, `perceptual_hierarchy.zones[${index}].id`);
    if (zoneIds.has(zoneId)) throw new Error(`duplicate perceptual hierarchy zone id=${zoneId}`);
    zoneIds.add(zoneId);
    if (!Array.isArray(row.owner_ids) || !row.owner_ids.length || row.owner_ids.length > 24) {
      throw new Error(`perceptual_hierarchy.zones[${index}].owner_ids must contain 1-24 owners`);
    }
    const owners = [...new Set(row.owner_ids.map((owner, ownerIndex) => id(owner, `perceptual_hierarchy.zones[${index}].owner_ids[${ownerIndex}]`)))];
    for (const owner of owners) {
      if (ownerIds.has(owner)) throw new Error(`perceptual hierarchy owner ${owner} may belong to only one attention zone`);
      ownerIds.add(owner);
    }
    return {
      id: zoneId,
      owner_ids: owners,
      priority: enumValue(row.priority, ['primary', 'secondary', 'support', 'distributed'] as const, `perceptual_hierarchy.zones[${index}].priority`),
      contrast_budget: enumValue(row.contrast_budget, ['none', 'low', 'medium', 'high'] as const, `perceptual_hierarchy.zones[${index}].contrast_budget`),
      detail_budget: enumValue(row.detail_budget, ['none', 'low', 'medium', 'high'] as const, `perceptual_hierarchy.zones[${index}].detail_budget`),
      edge_certainty: enumValue(row.edge_certainty, ['none', 'low', 'medium', 'high'] as const, `perceptual_hierarchy.zones[${index}].edge_certainty`),
      chroma_accent: enumValue(row.chroma_accent, ['none', 'restricted', 'allowed'] as const, `perceptual_hierarchy.zones[${index}].chroma_accent`),
    };
  });
  const rationale = raw.distributed_attention_rationale === undefined
    ? undefined
    : text(raw.distributed_attention_rationale, 'perceptual_hierarchy.distributed_attention_rationale');
  let ordering: string[] = [];
  if (mode === 'distributed') {
    if (zones.some(zone => zone.priority !== 'distributed')) throw new Error('distributed perceptual hierarchy requires priority=distributed for every zone');
  } else {
    if (!zones.some(zone => zone.priority === 'primary')) throw new Error('ranked perceptual hierarchy requires at least one primary zone');
    if (zones.length > 1 && zones.every(zone => zone.priority === 'primary')) {
      throw new Error('ranked perceptual hierarchy cannot mark every zone primary; use distributed mode for intentionally all-over attention');
    }
    if (!Array.isArray(raw.ordering) || !raw.ordering.length) throw new Error('ranked perceptual hierarchy requires ordering');
    ordering = raw.ordering.map((zone, index) => id(zone, `perceptual_hierarchy.ordering[${index}]`));
    if (new Set(ordering).size !== ordering.length || ordering.some(zone => !zoneIds.has(zone))) {
      throw new Error('perceptual_hierarchy.ordering must contain unique declared zone ids');
    }
  }
  return {
    protocol: PERCEPTUAL_HIERARCHY_PROTOCOL,
    revision,
    mode,
    zones,
    ordering,
    ...(rationale ? { distributed_attention_rationale: rationale } : {}),
  };
}

export function normalizeAttentionBinding(value: unknown): AttentionBinding {
  const raw = obj(value, 'attention_binding');
  if (!Array.isArray(raw.dimensions) || !raw.dimensions.length || raw.dimensions.length > 4) {
    throw new Error('attention_binding.dimensions must contain 1-4 entries');
  }
  const dimensions = [...new Set(raw.dimensions.map((entry, index) =>
    enumValue(entry, ['contrast', 'detail', 'edge', 'chroma'] as const, `attention_binding.dimensions[${index}]`)
  ))];
  return {
    hierarchyRevision: positiveInt(raw.hierarchy_revision, 'attention_binding.hierarchy_revision'),
    zoneId: id(raw.zone_id, 'attention_binding.zone_id'),
    dimensions,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function changedPerceptualHierarchyDependencyIds(previous: PerceptualHierarchy, current: PerceptualHierarchy): string[] {
  const changed: string[] = [];
  if (previous.mode !== current.mode || stable(previous.ordering) !== stable(current.ordering)) changed.push('ordering');
  const previousZones = new Map(previous.zones.map(zone => [zone.id, zone]));
  const currentZones = new Map(current.zones.map(zone => [zone.id, zone]));
  for (const zoneId of new Set([...previousZones.keys(), ...currentZones.keys()])) {
    if (stable(previousZones.get(zoneId) ?? null) !== stable(currentZones.get(zoneId) ?? null)) changed.push(`zone:${zoneId}`);
  }
  return changed.sort();
}

export function attentionBindingStaleness(binding: AttentionBinding, current: PerceptualHierarchy, source?: PerceptualHierarchy | null) {
  if (binding.hierarchyRevision === current.revision) return { stale: false, reason: 'current', changed_dependency_ids: [] as string[] };
  if (!source || source.revision !== binding.hierarchyRevision) {
    return { stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [] as string[] };
  }
  const changed = changedPerceptualHierarchyDependencyIds(source, current);
  const relevant = changed.filter(id => id === 'ordering' || id === `zone:${binding.zoneId}`);
  return {
    stale: relevant.length > 0,
    reason: relevant.length ? 'dependency_changed' : 'current',
    changed_dependency_ids: relevant,
  };
}
