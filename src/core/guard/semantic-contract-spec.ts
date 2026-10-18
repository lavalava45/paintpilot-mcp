/**
 * The canonical contract for technical entity identities. Public tool schema,
 * compiler binding, and validation all consume these definitions. Artistic
 * fields (color, geometry, roles, edits) are intentionally outside this map.
 */
export type SemanticEntityKind =
  | 'light-model' | 'light-source' | 'atmosphere' | 'color-exception' | 'color-stop'
  | 'geometry-model' | 'vanishing-point' | 'line-family' | 'line-member'
  | 'support-plane' | 'scale-anchor' | 'camera-model'
  | 'ownership-plan' | 'semantic-unit' | 'logical-owner' | 'scene-object';

export interface SemanticDeclarationSpec {
  kind: SemanticEntityKind;
  path: string;
  field: string;
  aliases?: readonly string[];
  /** An authored semantic role that stays stable across visual revisions. */
  identityKey?: string;
  /** Ambiguous new entities must be identified by the artist, not guessed. */
  generate?: boolean;
}
export interface SemanticReferenceSpec {
  kind: SemanticEntityKind;
  path: string;
  /** Free-text references are resolved only when the same typed scope has one candidate. */
  naturalLanguage?: boolean;
  /** Preferred declaration namespace for a prose selector, not explicit IDs. */
  preferDeclaredPath?: string;
}
export interface SemanticPinSpec {
  path: string;
  source: string;
  /** Never replace a caller-supplied mismatch or fabricate a host witness. */
  sourceScope: 'pass' | 'context';
}
export interface SemanticContractSpec {
  declarations: readonly SemanticDeclarationSpec[];
  references: readonly SemanticReferenceSpec[];
  pins: readonly SemanticPinSpec[];
}

/** Execution binding policy belongs to the same source of truth as IDs/refs.
 * Required strategy fields mirror the VisualMicroPlan tool contract; neither
 * owner identity nor an artistic material choice is inferred from free text. */
export const SEMANTIC_EXECUTION_SPEC = {
  owner: {
    selector: 'target_owner_id',
    declaration: 'logical_layer',
    durableOwners: 'logical_layer_owners',
    durableId: 'hypothesis_id',
    physicalTarget: 'layer_id',
    continuationDecisions: ['continue-logical-layer', 'adjust'],
    creationDecisions: ['create-new', 'temporary-hypothesis'],
  },
  method: {
    requiredFields: ['material_role', 'visual_intent', 'pressure_policy'],
    materialSource: 'material_role',
    brushMaterialsSource: 'material_roles',
    artisticFields: ['construction_role', 'material_role', 'visual_intent'],
  },
  plan: {
    executableTool: 'photoshop_execute_visual_microplan',
    terminalRead: 'photoshop_get_preview',
    stepField: 'steps',
    explicitStepTarget: 'layer_id',
  },
} as const;

// All paths are relative to next_pass / painting_intent. [] denotes an array
// element. The compiler walks objects without relying on human-readable prose.
export const SEMANTIC_CONTRACT_SPEC: SemanticContractSpec = {
  declarations: [
    { kind: 'light-model', path: 'scene_lighting_color_model', field: 'model_id', generate: true },
    { kind: 'light-source', path: 'scene_lighting_color_model.ambient_environment', field: 'id', aliases: ['role', 'family', 'value_role'], identityKey: 'value_role', generate: true },
    { kind: 'light-source', path: 'scene_lighting_color_model.emitters[]', field: 'id', aliases: ['role', 'family', 'light_role'], identityKey: 'light_role', generate: true },
    { kind: 'light-source', path: 'scene_lighting_color_model.sampled_anchors[]', field: 'id', aliases: ['role', 'family'], generate: true },
    { kind: 'atmosphere', path: 'scene_lighting_color_model.atmosphere', field: 'id', aliases: ['density_role', 'color_bias'], identityKey: 'density_role', generate: true },
    { kind: 'color-exception', path: 'scene_lighting_color_model.intentional_exceptions[]', field: 'id', aliases: ['relation'], generate: true },
    { kind: 'color-stop', path: 'color_gradient_preflight.stops[]', field: 'id', aliases: ['role', 'family'], generate: true },
    { kind: 'geometry-model', path: 'scene_geometry_model', field: 'model_id', generate: true },
    { kind: 'vanishing-point', path: 'scene_geometry_model.projection.vanishing_points[]', field: 'id', generate: true },
    { kind: 'line-family', path: 'scene_geometry_model.line_families[]', field: 'id', generate: true },
    { kind: 'line-member', path: 'scene_geometry_model.line_families[].members[]', field: 'id', generate: true },
    { kind: 'support-plane', path: 'scene_geometry_model.support_planes[]', field: 'id', aliases: ['role'], identityKey: 'role', generate: true },
    { kind: 'scale-anchor', path: 'scene_geometry_model.scale_anchors[]', field: 'id', aliases: ['depth_role'], identityKey: 'depth_role', generate: true },
    { kind: 'camera-model', path: 'scene_camera_imaging_model', field: 'model_id', generate: true },
    { kind: 'ownership-plan', path: 'scene_ownership_plan', field: 'plan_id', generate: true },
    { kind: 'semantic-unit', path: 'scene_ownership_plan.units[]', field: 'semantic_id', aliases: ['role'], identityKey: 'role', generate: true },
    { kind: 'logical-owner', path: 'scene_ownership_plan.units[]', field: 'owner_id', aliases: ['role'], identityKey: 'role', generate: true },
    { kind: 'scene-object', path: 'scene_ownership_plan.objects[]', field: 'object_id', generate: true },
  ],
  references: [
    { kind: 'light-source', path: 'scene_lighting_color_model.global_value_structure.local_value_anchor',
      naturalLanguage: true, preferDeclaredPath: 'scene_lighting_color_model.emitters[' },
    { kind: 'atmosphere', path: 'scene_lighting_color_model.global_value_structure.atmospheric_lift', naturalLanguage: true },
    { kind: 'light-source', path: 'color_gradient_preflight.stops[].source_anchor_id', naturalLanguage: false },
    { kind: 'light-model', path: 'color_gradient_preflight.scene_model_id' },
    { kind: 'vanishing-point', path: 'scene_geometry_model.line_families[].vanishing_point_id' },
    { kind: 'line-family', path: 'scene_geometry_model.support_planes[].vanishing_family_ids[]' },
    { kind: 'geometry-model', path: 'scene_camera_imaging_model.geometry_model_id' },
    { kind: 'light-model', path: 'scene_camera_imaging_model.lighting_color_model_id' },
    { kind: 'semantic-unit', path: 'scene_ownership_plan.objects[].component_semantic_ids[]' },
    { kind: 'logical-owner', path: 'scene_ownership_plan.shared_owner_justifications[].owner_id' },
    { kind: 'semantic-unit', path: 'scene_ownership_plan.shared_owner_justifications[].semantic_ids[]' },
    { kind: 'logical-owner', path: 'target_owner_id' },
  ],
  pins: [
    { path: 'scene_lighting_color_model.source_frame.document_id', source: 'document_id', sourceScope: 'pass' },
    { path: 'scene_lighting_color_model.source_frame.document_incarnation', source: 'document_incarnation_id', sourceScope: 'context' },
    { path: 'scene_geometry_model.source_frame.document_id', source: 'document_id', sourceScope: 'pass' },
    { path: 'scene_geometry_model.source_frame.document_incarnation', source: 'document_incarnation_id', sourceScope: 'context' },
    { path: 'scene_camera_imaging_model.source_frame.document_id', source: 'document_id', sourceScope: 'pass' },
    { path: 'scene_camera_imaging_model.source_frame.document_incarnation', source: 'document_incarnation_id', sourceScope: 'context' },
    { path: 'color_gradient_preflight.scene_model_revision', source: 'scene_lighting_color_model.revision', sourceScope: 'pass' },
    { path: 'color_gradient_preflight.scene_model_id', source: 'scene_lighting_color_model.model_id', sourceScope: 'pass' },
  ],
};

/** Only structural identity/pin fields may become optional in public schemas.
 * The surrounding declaration and its artistic requirements stay mandatory. */
export function applySemanticPublicSchema(input: Record<string, unknown>, spec: SemanticContractSpec = SEMANTIC_CONTRACT_SPEC): void {
  const properties = input.properties as Record<string, unknown> | undefined;
  if (!properties) return;
  const paths = [
    ...spec.declarations.map(item => ({ path: item.path, field: item.field })),
    ...spec.pins.map(item => {
      const parts = item.path.split('.');
      return { path: parts.slice(0, -1).join('.'), field: parts.at(-1)! };
    }),
  ];
  for (const { path, field } of paths) {
    const tokens = path.replaceAll('[]', '.items').split('.').filter(Boolean);
    let node: Record<string, unknown> | undefined = input;
    for (const token of tokens) {
      node = (token === 'items' ? node?.items : (node?.properties as Record<string, unknown> | undefined)?.[token]) as Record<string, unknown> | undefined;
      if (!node) break;
    }
    if (!node || !((node.properties as Record<string, unknown> | undefined)?.[field])) continue;
    if (Array.isArray(node.required)) node.required = node.required.filter(item => item !== field);
    const child = (node.properties as Record<string, Record<string, unknown>>)[field];
    child.description = [child.description, 'Technical identity/pin: compiler-managed when unambiguous; explicit conflicting values are never overwritten.'].filter(Boolean).join(' ');
  }
  for (const model of ['scene_lighting_color_model', 'scene_geometry_model', 'scene_camera_imaging_model']) {
    const node = properties[model] as Record<string, unknown> | undefined;
    if (!node) continue;
    if (Array.isArray(node.required)) node.required = node.required.filter(key => key !== 'source_frame'
      && key !== 'revision' && key !== 'model_id');
  }
}
