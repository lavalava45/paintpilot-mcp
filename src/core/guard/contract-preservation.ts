/**
 * Public Guard cycle contract preservation contract.
 *
 * Inventory entries explain WHY a published field may change or disappear.
 * The critical end-to-end subset is independently enforced on compiled output
 * prior to dispatch, including compiler convergence. Do not conflate consumed
 * artistic instructions with values that must be sent to Photoshop itself.
 */
export type PreservationDisposition =
  | 'retained'       // same semantic value in the compiled request
  | 'translated'     // mapped to a typed executor/Guard field
  | 'validated'      // used to select or reject a route; not executor metadata
  | 'durable'        // checked/merged with authoritative Guard state
  | 'conditional';   // applicable only to the selected operation/profile/route

export type PreservationSurface = 'next_pass' | 'painting_intent' | 'previous_observation' | 'cycle';

type PolicyGroup = { disposition: PreservationDisposition; fields: readonly string[]; contract: string };
const groups: Record<PreservationSurface, readonly PolicyGroup[]> = {
  next_pass: [
    { disposition: 'retained', contract: 'Pinned identity/goal and foundation must reach the guarded request.', fields: [
      'request_key', 'problem_id', 'document_id', 'goal', 'artistic_commentary', 'foundation_goal',
      'region', 'stage', 'stage_reset', 'scale', 'significance_mode',
    ] },
    { disposition: 'translated', contract: 'Derived in bounded executor method, review envelope or normalized strategy.', fields: [
      'region_bounds', 'object_context_region_bounds', 'protected_regions', 'protected_layer_ids',
      'replace_protected_layer_ids', 'action_class', 'layer_separation_check', 'construction', 'painterly',
      'brush_role', 'material_role', 'construction_role', 'edges', 'style_contract_basis',
      'visual_intent', 'impact_class', 'preferred_method_id', 'avoid_method_ids',
      'pattern_intent', 'motif_instances', 'distribution_intent', 'actions',
    ] },
    { disposition: 'durable', contract: 'Authenticated owner/frame/scene model must be validated against durable Guard authority.', fields: [
      'scene_ownership_plan', 'component_scope', 'logical_layer', 'cross_layer_correction',
      'scene_geometry_model', 'scene_lighting_color_model', 'scene_camera_imaging_model',
      'painterly_softening',
    ] },
    { disposition: 'validated', contract: 'Guard-only preflight or evidence; never masquerades as native tool arguments.', fields: [
      'imaging_preflight', 'color_gradient_preflight', 'structural_correction',
      'material_response', 'change_domains', 'affected_relations', 'affected_qualities',
      'preservation_facts', 'independent_region', 'addresses_primary_mismatch', 'addresses_problem_id',
      'addresses_problem_ids', 'causal_strategy_id', 'strategy_family', 'causal_escalation_level',
      'root_cause_classification', 'root_cause_reason', 'causal_level_change',
      'brush_preset_choice_reason', 'brush_retry_reason', 'brush_use_reason',
    ] },
    { disposition: 'conditional', contract: 'An authenticated anchor is converted to bounded undo or rejected; ordinary actions cannot also execute.', fields: [
      'restore_anchor_operation_id',
    ] },
  ],
  painting_intent: [
    { disposition: 'retained', contract: 'Basic artistic identity and explicit goal are forwarded to next_pass.', fields: [
      'request_key', 'problem_id', 'document_id', 'goal', 'artistic_commentary',
      'region', 'region_bounds', 'stage', 'stage_reset', 'scale', 'visual_intent',
      'preferred_method_id', 'brush_use_reason', 'construction_role', 'material_response',
      'change_domains', 'addresses_problem_id', 'addresses_problem_ids',
      'addresses_primary_mismatch', 'impact_class',
    ] },
    { disposition: 'translated', contract: 'Artistic shorthand is resolved through typed action, owner, material and safety contracts.', fields: [
      'action', 'target_owner_id', 'material_role', 'preferred_brush_role',
      'preserve', 'actions',
    ] },
    { disposition: 'durable', contract: 'Identical scene/model contracts are checked and retained or extended.', fields: [
      'component_scope', 'scene_ownership_plan', 'scene_geometry_model',
      'scene_camera_imaging_model', 'scene_lighting_color_model', 'construction', 'painterly',
      'logical_layer', 'layer_separation_check', 'imaging_preflight',
      'color_gradient_preflight', 'cross_layer_correction', 'structural_correction',
    ] },
    { disposition: 'conditional', contract: 'Deferred art is retrieved by exact request/document lineage; no blind reuse.', fields: [
      'deferred_from_operation_id',
    ] },
  ],
  previous_observation: [
    { disposition: 'translated', contract: 'One exact reviewed frame is closed through a validated previous_visual_verdict.', fields: [
      'observed', 'target', 'regression', 'action', 'verdict', 'disposition',
      'observed_change', 'artistic_commentary', 'target_resolved', 'painting_completion',
      'regressions', 'uncertainty', 'uncertainty_review', 'distribution_intent',
      'edge_observations', 'primary_mismatch', 'global_readability',
      'primitive_footprint', 'trend_signals', 'softness_review', 'review_findings',
      'recognition', 'observations', 'planner_task_assessment', 'affected_relations',
      'affected_qualities', 'preservation_facts', 'independent_region',
    ] },
    { disposition: 'durable', contract: 'Exact image, request_id and protected review evidence is checked before closure.', fields: [
      'critic_review', 'scene_foundation', 'brush_use_review',
      'editable_scope_review', 'physical_stack_check',
    ] },
  ],
  cycle: [
    { disposition: 'validated', contract: 'Protocol identifier, not a Photoshop mutation argument.', fields: ['protocol_version'] },
    { disposition: 'durable', contract: 'Exact previous operation/retained frame binding and closure.', fields: [
      'previous_operation_id', 'review_operation_id', 'previous_observation',
    ] },
    { disposition: 'conditional', contract: 'Exactly one new-request form, or closure-only; never both.', fields: [
      'painting_intent', 'next_pass',
    ] },
  ],
};

export interface PreservationPolicy {
  field: string;
  disposition: PreservationDisposition;
  contract: string;
}

export const CONTRACT_PRESERVATION_INVENTORY: Readonly<Record<PreservationSurface, Readonly<Record<string, PreservationPolicy>>>> =
  Object.fromEntries(Object.entries(groups).map(([surface, groupList]) => [
    surface, Object.freeze(Object.fromEntries(groupList.flatMap(group =>
      group.fields.map(field => [field, Object.freeze({ field, disposition: group.disposition, contract: group.contract })])))),
  ])) as Record<PreservationSurface, Record<string, PreservationPolicy>>;

export function preservationCatalogErrors(schemas: Record<PreservationSurface, readonly string[]>): string[] {
  const errors: string[] = [];
  for (const surface of ['cycle', 'next_pass', 'painting_intent', 'previous_observation'] as const) {
    const names = schemas[surface];
    const catalog = CONTRACT_PRESERVATION_INVENTORY[surface];
    for (const key of names) if (!Object.hasOwn(catalog, key))
      errors.push(`${surface}.${key} is published without a preservation policy`);
    for (const key of Object.keys(catalog)) if (!names.includes(key))
      errors.push(`${surface}.${key} has a stale preservation policy but is not public`);
    if (new Set(names).size !== names.length) errors.push(`${surface} has duplicate schema fields`);
  }
  return errors;
}

/** Enumerate every named nested public schema path. A nested field inherits its
 * typed parent contract; unknown keys in open Photoshop action args have no
 * finite enumerable schema and are validated against the selected tool schema.
 * Limit depth/field count so a malformed schema cannot exhaust the audit. */
export function publicContractFieldPaths(
  cycleSchema: unknown,
): { paths: string[]; openObjects: string[] } {
  const named = new Set<string>();
  const openObjects = new Set<string>();
  const visit = (schema: unknown, path: string, depth: number): void => {
    if (depth > 30 || named.size > 10000) throw new Error('contract_schema_field_inventory_unbounded');
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
    const node = schema as Record<string, unknown>;
    if (node.additionalProperties === true && path) openObjects.add(path);
    const props = node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)
      ? node.properties as Record<string, unknown> : undefined;
    if (props) for (const [key, child] of Object.entries(props)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error('contract_schema_field_name_invalid');
      const next = path ? `${path}.${key}` : key;
      named.add(next);
      visit(child, next, depth + 1);
    }
    if (node.items !== undefined) visit(node.items, `${path}[]`, depth + 1);
  };
  visit(cycleSchema, '', 0);
  return { paths: [...named].sort(), openObjects: [...openObjects].sort() };
}

export interface PreservationFailure { code: 'contract_field_lost_during_compilation'; path: string; message: string }
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const arr = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * Conservative, executable cross-boundary check for fields that ALL visual
 * operations need at Guard admission. This checks the final operation after
 * any deterministic repair/convergence. No guessed values are introduced.
 * Additional field dispositions are audited via the exhaustive policy above
 * and explicit scenario tests; do not assert untested executor equivalence.
 */
export function criticalPreservationFailures(
  authored: unknown, compiled: unknown,
): PreservationFailure[] {
  const source = record(authored);
  const operation = record(compiled);
  if (!source || !operation) return [];
  const errors: PreservationFailure[] = [];
  const missing = (field: string, explanation: string) => errors.push({
    code: 'contract_field_lost_during_compilation',
    path: `next_pass.${field}`,
    message: `Contract preservation failed: ${explanation}. The compiler must not dispatch this operation.`,
  });
  const args = record(operation.args) ?? {};
  if (source.foundation_goal !== undefined && operation.foundation_goal !== source.foundation_goal)
    missing('foundation_goal', 'the explicit scene foundation goal was lost or changed');
  const authoredDomains = arr(source.change_domains);
  if (authoredDomains.length) {
    const deliveredDomains = arr(args.change_domains ?? operation.change_domains);
    const missingDomains = authoredDomains.filter(domain => !deliveredDomains.includes(domain));
    if (missingDomains.length) missing('change_domains',
      'validated semantic change domains were removed: ' + missingDomains.join(', '));
  }
  if (Number.isSafeInteger(source.document_id) && source.document_id !== args.document_id)
    missing('document_id', 'the pinned source document differs from executable document_id');
  if (source.painterly_softening !== undefined
    && JSON.stringify(operation.painterly_softening) !== JSON.stringify(source.painterly_softening))
    missing('painterly_softening', 'the expressly authorized optical-effect owner and local-glow review contract were lost or changed');
  if (operation.tool === 'photoshop_save_document') {
    for (const field of ['scene_geometry_model', 'scene_camera_imaging_model'] as const) {
      const authored = record(source[field]);
      if (!authored) continue;
      const accepted = record(operation[field]);
      if (!accepted || accepted.model_id !== authored.model_id || accepted.revision !== authored.revision
        || JSON.stringify(accepted.source_frame) !== JSON.stringify(authored.source_frame)) {
        missing(field, `explicitly authored ${field} disappeared or changed before the successful PSD checkpoint`);
      }
    }
  }
  if (typeof source.action_class === 'string' && operation.tool === 'photoshop_execute_visual_microplan'
    && source.action_class !== args.action_class)
    missing('action_class', 'VisualMicroPlan action class differs from the authored action');
  // Do not claim direct deletion/other tools execute a microplan ROLLBACK:
  // those native tools retain their own independent authorization barriers.
  return errors;
}
