export const MATERIAL_RESPONSE_ROLES = [
  'base-material',
  'surface-condition',
  'optical-effect',
] as const;
export type MaterialResponseRole = (typeof MATERIAL_RESPONSE_ROLES)[number];

export const MATERIAL_RESPONSE_COMPONENTS = [
  'base_response',
  'form_light_response',
  'specular_reflection',
  'transmission',
  'surface_condition',
  'variation_scale',
  'edge_contact',
] as const;
export type MaterialResponseComponent = (typeof MATERIAL_RESPONSE_COMPONENTS)[number];

export const MATERIAL_RESPONSE_STYLE_BASIS_FIELDS = [
  'realism_level',
  'material_treatment',
  'texture_policy',
  'finish_criteria',
] as const;
export type MaterialResponseStyleBasisField = (typeof MATERIAL_RESPONSE_STYLE_BASIS_FIELDS)[number];

export const MATERIAL_RESPONSE_PLAN_APPLICABILITY = ['required', 'not-applicable'] as const;
export type MaterialResponsePlanApplicability = (typeof MATERIAL_RESPONSE_PLAN_APPLICABILITY)[number];

export const MATERIAL_RESPONSE_REVIEW_STATUSES = [
  'resolved',
  'debt',
  'uncertain',
  'not-applicable',
] as const;
export type MaterialResponseReviewStatus = (typeof MATERIAL_RESPONSE_REVIEW_STATUSES)[number];

export const MATERIAL_RESPONSE_MICROTEXTURE_POLICIES = [
  'deferred',
  'supporting-only',
  'not-applicable',
] as const;
export type MaterialResponseMicrotexturePolicy = (typeof MATERIAL_RESPONSE_MICROTEXTURE_POLICIES)[number];

export const MATERIAL_RESPONSE_MICROTEXTURE_REVIEW_STATUSES = [
  'supporting',
  'deferred',
  'not-applicable',
] as const;
export type MaterialResponseMicrotextureReviewStatus =
  (typeof MATERIAL_RESPONSE_MICROTEXTURE_REVIEW_STATUSES)[number];

export interface MaterialResponseStyleBasis {
  field: MaterialResponseStyleBasisField;
  criterion: string;
}

export interface MaterialResponsePlanComponent {
  applicability: MaterialResponsePlanApplicability;
  intent: string;
}

export interface MaterialResponsePlan {
  responseRole: MaterialResponseRole;
  components: Record<MaterialResponseComponent, MaterialResponsePlanComponent>;
  microtexture: {
    policy: MaterialResponseMicrotexturePolicy;
    intent: string;
  };
  styleContractBasis?: MaterialResponseStyleBasis;
  lightingColorBinding?: LightingColorBinding;
}

export interface LightingColorBinding {
  sceneModelId: string;
  sceneModelRevision: number;
  baseColorFamily: string;
  receives: string[];
  atmosphere?: string;
  reflectionSources: string[];
  surfaceCondition?: string;
  colorRelations: string[];
  spatialRelation?: {
    sceneGeometryModelId: string;
    sceneGeometryRevision: number;
    dependencyIds: string[];
  };
}

export interface MaterialResponseReviewComponent {
  status: MaterialResponseReviewStatus;
  note: string;
}

export interface MaterialResponseReview {
  responseRole: MaterialResponseRole;
  components: Record<MaterialResponseComponent, MaterialResponseReviewComponent>;
  microtexture: {
    status: MaterialResponseMicrotextureReviewStatus;
    note: string;
  };
  textureOnlyTreatment: boolean;
  styleContractBasis?: MaterialResponseStyleBasis;
}

export interface MaterialResponsePlanContext {
  physicalRole?: string;
  opacityRole?: string;
  constructionRole?: string;
}

const ESSENTIAL_BASE_COMPONENTS = new Set<MaterialResponseComponent>([
  'base_response',
  'form_light_response',
  'variation_scale',
  'edge_contact',
]);

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function enumValue<T extends readonly string[]>(value: unknown, name: string, values: T): T[number] {
  const parsed = text(value, name).toLowerCase();
  if (!values.includes(parsed as T[number])) throw new Error(`${name} must be one of ${values.join(', ')}`);
  return parsed as T[number];
}

function parseStyleBasis(value: unknown, name: string): MaterialResponseStyleBasis | undefined {
  if (value === undefined) return undefined;
  const raw = object(value, name);
  const field = enumValue(raw.field, `${name}.field`, MATERIAL_RESPONSE_STYLE_BASIS_FIELDS);
  const criterion = text(raw.criterion, `${name}.criterion`);
  if (criterion.length < 8) throw new Error(`${name}.criterion must state the exact durable style criterion`);
  return { field, criterion };
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > 24) throw new Error(`${name} must be an array with at most 24 entries`);
  return [...new Set(value.map((item, index) => text(item, `${name}[${index}]`)))];
}

function parseLightingColorBinding(value: unknown): LightingColorBinding | undefined {
  if (value === undefined) return undefined;
  const raw = object(value, 'material_response.lighting_color_binding');
  if (typeof raw.scene_model_revision !== 'number' || !Number.isInteger(raw.scene_model_revision) || raw.scene_model_revision <= 0) {
    throw new Error('material_response.lighting_color_binding.scene_model_revision must be a positive integer');
  }
  let spatialRelation: LightingColorBinding['spatialRelation'];
  if (raw.spatial_relation !== undefined) {
    const spatial = object(raw.spatial_relation, 'material_response.lighting_color_binding.spatial_relation');
    if (typeof spatial.scene_geometry_revision !== 'number' || !Number.isInteger(spatial.scene_geometry_revision) || spatial.scene_geometry_revision <= 0) {
      throw new Error('material_response.lighting_color_binding.spatial_relation.scene_geometry_revision must be a positive integer');
    }
    const dependencyIds = stringList(spatial.dependency_ids ?? [], 'material_response.lighting_color_binding.spatial_relation.dependency_ids');
    if (!dependencyIds.length) {
      throw new Error('material_response.lighting_color_binding.spatial_relation.dependency_ids must name at least one spatial dependency');
    }
    spatialRelation = {
      sceneGeometryModelId: text(spatial.scene_geometry_model_id, 'material_response.lighting_color_binding.spatial_relation.scene_geometry_model_id'),
      sceneGeometryRevision: spatial.scene_geometry_revision,
      dependencyIds,
    };
  }
  return {
    sceneModelId: text(raw.scene_model_id, 'material_response.lighting_color_binding.scene_model_id'),
    sceneModelRevision: raw.scene_model_revision,
    baseColorFamily: text(raw.base_color_family, 'material_response.lighting_color_binding.base_color_family'),
    receives: stringList(raw.receives ?? [], 'material_response.lighting_color_binding.receives'),
    ...(raw.atmosphere === undefined ? {} : { atmosphere: text(raw.atmosphere, 'material_response.lighting_color_binding.atmosphere') }),
    reflectionSources: stringList(raw.reflection_sources ?? [], 'material_response.lighting_color_binding.reflection_sources'),
    ...(raw.surface_condition === undefined ? {} : { surfaceCondition: text(raw.surface_condition, 'material_response.lighting_color_binding.surface_condition') }),
    colorRelations: stringList(raw.color_relations ?? [], 'material_response.lighting_color_binding.color_relations'),
    ...(spatialRelation ? { spatialRelation } : {}),
  };
}

function parsePlanComponents(value: unknown): Record<MaterialResponseComponent, MaterialResponsePlanComponent> {
  const raw = object(value, 'material_response.components');
  const out = {} as Record<MaterialResponseComponent, MaterialResponsePlanComponent>;
  for (const key of MATERIAL_RESPONSE_COMPONENTS) {
    const item = object(raw[key], `material_response.components.${key}`);
    const applicability = enumValue(
      item.applicability,
      `material_response.components.${key}.applicability`,
      MATERIAL_RESPONSE_PLAN_APPLICABILITY
    );
    const intent = text(item.intent, `material_response.components.${key}.intent`);
    if (intent.length < 8) throw new Error(`material_response.components.${key}.intent must be concrete`);
    out[key] = { applicability, intent };
  }
  return out;
}

function parseReviewComponents(value: unknown): Record<MaterialResponseComponent, MaterialResponseReviewComponent> {
  const raw = object(value, 'refinement_check.material_response.components');
  const out = {} as Record<MaterialResponseComponent, MaterialResponseReviewComponent>;
  for (const key of MATERIAL_RESPONSE_COMPONENTS) {
    const item = object(raw[key], `refinement_check.material_response.components.${key}`);
    const status = enumValue(
      item.status,
      `refinement_check.material_response.components.${key}.status`,
      MATERIAL_RESPONSE_REVIEW_STATUSES
    );
    const note = text(item.note, `refinement_check.material_response.components.${key}.note`);
    if (note.length < 8) throw new Error(`refinement_check.material_response.components.${key}.note must be concrete`);
    out[key] = { status, note };
  }
  return out;
}

function assertEssentialApplicability(
  role: MaterialResponseRole,
  components: Record<MaterialResponseComponent, { applicability?: string; status?: string }>,
  styleBasis: MaterialResponseStyleBasis | undefined,
  phase: 'planning' | 'review'
): void {
  if (role !== 'base-material' || styleBasis) return;
  const invalid = [...ESSENTIAL_BASE_COMPONENTS].filter(key => {
    const row = components[key];
    return row.applicability === 'not-applicable' || row.status === 'not-applicable';
  });
  if (invalid.length) {
    throw new Error(
      `material_response ${phase} cannot mark base-material essentials not-applicable without exact style_contract_basis: ${invalid.join(', ')}`
    );
  }
}

export function normalizeMaterialResponsePlan(
  raw: unknown,
  context: MaterialResponsePlanContext = {}
): MaterialResponsePlan {
  const record = object(raw, 'material_response');
  const responseRole = enumValue(record.response_role, 'material_response.response_role', MATERIAL_RESPONSE_ROLES);
  const components = parsePlanComponents(record.components);
  const micro = object(record.microtexture, 'material_response.microtexture');
  const microtexture = {
    policy: enumValue(micro.policy, 'material_response.microtexture.policy', MATERIAL_RESPONSE_MICROTEXTURE_POLICIES),
    intent: text(micro.intent, 'material_response.microtexture.intent'),
  };
  const styleContractBasis = parseStyleBasis(record.style_contract_basis, 'material_response.style_contract_basis');
  const lightingColorBinding = parseLightingColorBinding(record.lighting_color_binding);

  assertEssentialApplicability(responseRole, components, styleContractBasis, 'planning');

  const physicalRole = context.physicalRole?.trim().toLowerCase();
  const opacityRole = context.opacityRole?.trim().toLowerCase();
  const constructionRole = context.constructionRole?.trim().toLowerCase();
  if (physicalRole === 'surface-condition' && responseRole !== 'surface-condition') {
    throw new Error('material_response response_role must be surface-condition for physical_role=surface-condition');
  }
  if (['optical-effect', 'atmosphere', 'camera-post'].includes(physicalRole ?? '') && responseRole !== 'optical-effect') {
    throw new Error(`material_response response_role must be optical-effect for physical_role=${physicalRole}`);
  }
  if (['opaque-mass', 'support-surface', 'transmissive-surface'].includes(physicalRole ?? '') && responseRole !== 'base-material') {
    throw new Error(`material_response response_role must be base-material for physical_role=${physicalRole}`);
  }
  if (physicalRole === 'transmissive-surface' || opacityRole === 'transmissive') {
    if (components.transmission.applicability !== 'required') {
      throw new Error('transmissive material_response requires transmission.applicability=required');
    }
  }
  if (physicalRole === 'surface-condition' && components.surface_condition.applicability !== 'required') {
    throw new Error('surface-condition material_response requires surface_condition.applicability=required');
  }
  if (constructionRole === 'optical-veil' && responseRole !== 'optical-effect') {
    throw new Error('construction_role=optical-veil requires material_response.response_role=optical-effect');
  }
  if (microtexture.policy === 'supporting-only') {
    const structural = ['base_response', 'form_light_response', 'variation_scale', 'edge_contact'] as const;
    if (structural.every(key => components[key].applicability === 'not-applicable') && !styleContractBasis) {
      throw new Error('microtexture cannot be the only applicable material response without exact style_contract_basis');
    }
  }

  return {
    responseRole,
    components,
    microtexture,
    ...(styleContractBasis ? { styleContractBasis } : {}),
    ...(lightingColorBinding ? { lightingColorBinding } : {}),
  };
}

export function normalizeMaterialResponseReview(raw: unknown): MaterialResponseReview {
  const record = object(raw, 'refinement_check.material_response');
  const responseRole = enumValue(
    record.response_role,
    'refinement_check.material_response.response_role',
    MATERIAL_RESPONSE_ROLES
  );
  const components = parseReviewComponents(record.components);
  const micro = object(record.microtexture, 'refinement_check.material_response.microtexture');
  const microtexture = {
    status: enumValue(
      micro.status,
      'refinement_check.material_response.microtexture.status',
      MATERIAL_RESPONSE_MICROTEXTURE_REVIEW_STATUSES
    ),
    note: text(micro.note, 'refinement_check.material_response.microtexture.note'),
  };
  if (microtexture.note.length < 8) {
    throw new Error('refinement_check.material_response.microtexture.note must be concrete');
  }
  if (typeof record.texture_only_treatment !== 'boolean') {
    throw new Error('refinement_check.material_response.texture_only_treatment must be boolean');
  }
  const styleContractBasis = parseStyleBasis(
    record.style_contract_basis,
    'refinement_check.material_response.style_contract_basis'
  );
  assertEssentialApplicability(responseRole, components, styleContractBasis, 'review');

  return {
    responseRole,
    components,
    microtexture,
    textureOnlyTreatment: record.texture_only_treatment,
    ...(styleContractBasis ? { styleContractBasis } : {}),
  };
}

export function unresolvedMaterialResponseComponents(review: MaterialResponseReview): MaterialResponseComponent[] {
  return MATERIAL_RESPONSE_COMPONENTS.filter(key =>
    review.components[key].status === 'debt' || review.components[key].status === 'uncertain'
  );
}

export function materialResponseReviewResolved(review: MaterialResponseReview): boolean {
  return !review.textureOnlyTreatment && unresolvedMaterialResponseComponents(review).length === 0;
}
