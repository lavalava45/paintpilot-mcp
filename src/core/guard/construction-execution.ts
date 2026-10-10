import type { ConstructionModel } from '../object-construction.js';

const TRANSFORMS = new Set([
  'photoshop_rotate_layer',
  'photoshop_move_layer',
  'photoshop_scale_layer',
  'photoshop_transform_layer',
  'photoshop_free_transform',
]);
export function constructionExecutionIssue(raw: any, context: any, generated?: ConstructionModel) {
  const owner = raw.logical_layer?.hypothesis_id;
  const actions = Array.isArray(raw.actions)
    ? raw.actions.filter((a: any) => a && typeof a === 'object')
    : [];
  const steps = actions.flatMap((a: any) =>
    a.tool === 'photoshop_execute_visual_microplan'
      ? Array.isArray(a.args?.steps)
        ? a.args.steps.filter((s: any) => s && typeof s === 'object')
        : []
      : [a]
  );
  const binding = (context.construction_bindings ?? []).find((b: any) => b.owner_id === owner);
  if (generated && binding && binding.model_id !== generated.model_id)
    return {
      code: 'construction_owner_model_conflict',
      message: `Owner ${owner} is already bound to ${binding.model_id}; preserve model identity and advance its revision instead of claiming the same part from another model.`,
    };
  if (!generated && binding?.needs_rebuild)
    return {
      code: 'construction_component_rebuild_required',
      message: `Owner ${owner} still has pixels from an older target of ${binding.model_id}@${binding.revision}. Rebuild this part through next_pass.construction before refinement/contact claims.`,
    };
  if (
    !generated &&
    binding &&
    (raw.logical_layer?.construction_change || steps.some((a: any) => TRANSFORMS.has(a.tool)))
  )
    return {
      code: 'construction_execution_required',
      message: `Owner ${owner} belongs to ${binding.model_id}@${binding.revision}. Rebuild via next_pass.construction with the shared revised model/part; manual transforms cannot prove joint/contact or rigid component alignment.`,
    };
  if (generated && context.construction_policy === 'enforced') {
    const part = generated.parts.find((p) => p.id === raw.construction?.part_id);
    const object = generated.objects.find((o) => o.id === part?.object_id);
    if (object && !['single-component', 'continuous-field'].includes(object.subject_kind)) {
      const ids = new Set(
        generated.points.filter((p) => p.object_id === object.id).map((p) => p.id)
      );
      const measured =
        generated.constraints.some(
          (c) => ['ratio', 'distance'].includes(c.kind) && c.points.every((id) => ids.has(id))
        ) ||
        generated.proportion_checks?.some((c) => c.points.every((id) => ids.has(id))) ||
        generated.ik_chains?.some((c) => c.points.every((id) => ids.has(id)));
      if (!measured)
        return {
          code: 'construction_proportion_contract_required',
          message: `Object ${object.id} needs chosen distance/ratio constraints, proportion_checks or authored IK lengths before painting. Include connection/axis constraints where parts meet; a noun and arbitrary contour do not establish proportions.`,
        };
    }
  }
  if (
    !generated &&
    context.construction_policy === 'enforced' &&
    steps.some((a: any) =>
      ['photoshop_paint_regions', 'photoshop_fill_layer', ...TRANSFORMS].includes(a.tool)
    )
  ) {
    const plan = raw.scene_ownership_plan ?? context.scene_ownership_plan;
    const semantic = (Array.isArray(plan?.units) ? plan.units : [])
      .filter((u: any) => u?.owner_id === owner)
      .map((u: any) => u.semantic_id);
    const compound = (Array.isArray(plan?.objects) ? plan.objects : []).find(
      (o: any) =>
        o?.kind === 'compound-object' &&
        Array.isArray(o.component_semantic_ids) &&
        o.component_semantic_ids.some((id: string) => semantic.includes(id))
    );
    if (compound && !binding)
      return {
        code: 'construction_execution_required',
        message: `Compound object ${compound.object_id}: supply next_pass.construction.model once, with independent part ids matching the planned owners, explicit proportions/connections and chosen colors; then model_id + part_id. Pure status calculations do not bind executable pixels. Do not read source or replace this with independent guessed polygons/transforms.`,
      };
  }
  return undefined;
}

export function unexpandedConstructionPrerequisites(raw: any, context: any) {
  if (context.painting_profile !== 'nontrivial_painting') return [];
  const issues: Array<{ code: string; path: string; message: string; residual?: number }> = [];
  const model = raw.construction?.model;
  const part = (Array.isArray(model?.parts) ? model.parts : []).find((p: any) => p?.id === raw.construction?.part_id);
  const object = (Array.isArray(model?.objects) ? model.objects : []).find((o: any) => o?.id === part?.object_id);
  if (model && object && !['single-component', 'continuous-field'].includes(object.subject_kind)
    && !(Array.isArray(model.constraints) && model.constraints.some((c: any) => ['ratio', 'distance'].includes(c?.kind)))
    && !(Array.isArray(model.proportion_checks) && model.proportion_checks.length)
    && !(Array.isArray(model.ik_chains) && model.ik_chains.length))
    issues.push({ code: 'construction_proportion_contract_required', path: 'next_pass.construction.model',
      message: 'Choose dimension/ratio constraints, bounded proportion_checks or authored IK lengths for the selected compound object. Supply the complete component model once; draw only the chosen part.' });
  const geometry = raw.scene_geometry_model ?? context.scene_geometry_model;
  if (!geometry) issues.push({ code: 'scene_geometry_model_required', path: 'next_pass.scene_geometry_model',
    message: 'Before committed nontrivial construction, provide one durable scene geometry model or an explicit style-authorized projection opt-out; do not guess independent polygons.' });
  if (!raw.material_role && !context.has_visual_frame)
    issues.push({ code: 'construction_role_material_role_required', path: 'next_pass.material_role',
      message: 'Name the actual material/form role in the first substantial construction pass; do not choose it automatically from the object noun.' });
  const owner = raw.logical_layer?.hypothesis_id ?? raw.construction?.part_id;
  const existing = (Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : []).find((o: any) => o?.hypothesis_id === owner);
  if (geometry?.applicability === 'coherent_3d' && !raw.logical_layer?.geometry_binding && !existing?.geometry_binding)
    issues.push({ code: 'geometry_binding_required', path: 'next_pass.logical_layer.geometry_binding',
      message: `Bind owner=${owner ?? 'selected part'} to geometry ${geometry.model_id}@${geometry.revision} and choose a real support/family/dependency/anchor/control-section relation. A declared support/contact plane needs TWO numeric support boundary line ids before preflight; an arbitrary id is not a relation.` });
  return issues;
}
