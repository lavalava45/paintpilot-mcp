import { createHash } from 'node:crypto';
import { activeCriticFindings } from './critic-finding-status.js';
import { VISUAL_RELATION_RULES } from './visual-relationship-review.js';
import { completedArtisticExecution } from './artistic-contract.js';
import { openCriticObligation, criticObligationState } from './critic-obligations.js';
import { requestProblemLinks } from './problem-links.js';
type Row = Record<string, any>;
export const CORRECTION_KINDS = [
  'missing-object',
  'composition',
  'form',
  'light',
  'material',
  'contact',
  'brief',
] as const;
export const CORRECTION_KIND_SCHEMA = {
  type: 'string',
  enum: [...CORRECTION_KINDS],
  description:
    'Kind of visible deficit, not an object taxonomy. Rank findings by urgency. missing-object needs new editable components; composition placement/masses; form construction; light surface shading; material oriented response; contact support/receiver/shadow geometry; brief other substantive brief mismatch. Optional for retained reports; the criterion supplies a broad fallback.',
};
const fallback: Row = {
  brief_fidelity: 'brief',
  form_proportions: 'form',
  light_material: 'light',
  composition_context: 'composition',
  contact_and_protection: 'contact',
};
const domains: Row = {
  'missing-object': ['silhouette', 'depth-structure'],
  composition: ['depth-structure'],
  form: ['silhouette', 'depth-structure'],
  light: ['large-value', 'lighting-structure'],
  material: ['large-value', 'lighting-structure'],
  contact: ['depth-structure', 'lighting-structure'],
  brief: ['silhouette', 'depth-structure'],
};
export const STRUCTURAL_RELATION_KINDS = [
  'relative-size', 'placement-orientation', 'shape-topology',
  'attachment', 'support-contact', 'composition-relation',
] as const;
/** A small authored relation witness, not an inferred anatomy model. */
export const STRUCTURAL_DEFECT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: [...STRUCTURAL_RELATION_KINDS] },
    visible: { type: 'string', minLength: 10 },
    part_ids: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    relation_ids: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    brief_relevance: { type: 'string', minLength: 10 },
    recheck: { type: 'string', minLength: 10 },
    region_bounds: { type: 'object', additionalProperties: false,
      properties: { left: { type: 'number' }, top: { type: 'number' },
        right: { type: 'number' }, bottom: { type: 'number' } },
      required: ['left','top','right','bottom'] },
  },
  required: ['id', 'kind', 'visible', 'part_ids', 'relation_ids', 'brief_relevance', 'recheck'],
} as const;
export const STRUCTURAL_CORRECTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    defect_id: { type: 'string' },
    part_ids: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    relation_ids: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    target: { type: 'string', minLength: 10, description: 'Artist-authored desired relation and tolerance; never inferred from an object noun.' },
    execution: { type: 'string', enum: ['construction', 'brush', 'transform'] },
    sequence: { type: 'string', enum: ['single-pass', 'partial-rebuild', 'final-rebuild'] },
    causal_source: { type: 'object', additionalProperties: false,
      description: 'Only when the visual defect names contextual components but the separately owned source layer is a different component: pin the exact original reviewed operation/frame and a native owner receipt. Does NOT amend defect.part_ids or grant arbitrary layer access.',
      properties: {
        semantic_id: { type: 'string', minLength: 1 },
        owner_id: { type: 'string', minLength: 1 },
        layer_id: { type: 'integer', minimum: 1 },
        source_operation_id: { type: 'string', minLength: 1 },
        frame_sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
      },
      required: ['semantic_id', 'owner_id', 'layer_id', 'source_operation_id', 'frame_sha256'] },
  },
  required: ['defect_id', 'part_ids', 'relation_ids', 'target', 'execution'],
} as const;
const uniqueStrings = (v: unknown) => Array.isArray(v) && v.length > 0
  && v.every(x => typeof x === 'string' && x.trim().length > 0) && new Set(v).size === v.length;
export function structuralDefectIssue(value: Row): string | undefined {
  if (!value || typeof value.id !== 'string' || !value.id.trim()
    || !(STRUCTURAL_RELATION_KINDS as readonly string[]).includes(value.kind)
    || !uniqueStrings(value.part_ids) || !uniqueStrings(value.relation_ids)
    || ['visible','brief_relevance','recheck'].some(k => typeof value[k] !== 'string' || value[k].trim().length < 10))
    return 'structural_defect requires stable id, generic kind, parts, relations, brief relevance and visual recheck';
  if (value.region_bounds !== undefined && (!value.region_bounds
    || !['left','top','right','bottom'].every(k => Number.isFinite(value.region_bounds[k]))
    || value.region_bounds.left >= value.region_bounds.right
    || value.region_bounds.top >= value.region_bounds.bottom))
    return 'structural_defect.region_bounds must be finite positive-area document coordinates';
  return undefined;
}
export function correctionFinding(finding: Row): Row {
  return {
    ...finding,
    problem_id: finding.problem_id ?? finding.structural_defect?.id ?? `critic-${finding.criterion}`,
    correction_kind: finding.correction_kind ?? fallback[finding.criterion] ?? 'brief',
  };
}
const STRUCTURAL_PRIORITY_KINDS = new Set(['form', 'composition', 'missing-object', 'contact']);
type Bounds = { left: number; top: number; right: number; bottom: number };
function boundedRectangle(value: unknown): Bounds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const box = value as Row;
  const { left, top, right, bottom } = box;
  return [left, top, right, bottom].every(Number.isFinite) && left < right && top < bottom
    ? { left, top, right, bottom } : undefined;
}
/** Independent material work must be bounded to native clips OUTSIDE all known
 * structural defect rectangles. Prose/region names alone are not proof. */
function independentlyClippedFromStructuralDebt(state: Row, request: Row, structural: Row[]): boolean {
  const independent = request.independent_region ?? request.args?.independent_region;
  const preservation = request.preservation_facts ?? request.args?.preservation_facts;
  if (independent !== true || !Array.isArray(preservation) || !preservation.some(
    (fact: unknown) => typeof fact === 'string' && fact.trim().length > 0)) return false;
  const debts = structural.map(finding => boundedRectangle(
    finding.structural_defect?.region_bounds
      ?? state.visual_problems?.[finding.problem_id]?.review_region_bounds));
  if (!debts.length || debts.some(bounds => !bounds)) return false;
  const paintSteps = steps(request).filter(step => step.tool !== 'photoshop_create_layer'
    && step.tool !== 'photoshop_get_preview');
  if (!paintSteps.length || paintSteps.some(step => step.tool !== 'photoshop_paint_regions')) return false;
  return paintSteps.every(step => {
    const clip = boundedRectangle(step.args?.clip_bounds);
    return clip && debts.every(debt => clip.right <= debt!.left || clip.left >= debt!.right
      || clip.bottom <= debt!.top || clip.top >= debt!.bottom);
  });
}
export function selectedCriticCorrection(state: Row, request?: Row): Row | undefined {
  const obligations = criticObligationState(state);
  const links = request ? requestProblemLinks(request) : [];
  const findings = [
    ...activeCriticFindings(state),
    ...Object.values(state.visual_problems ?? {})
      .filter((p: any) => p?.structural_defect && p.status !== 'resolved'
        && !activeCriticFindings(state).some((f: Row) => f.structural_defect?.id === p.structural_defect.id))
      .map((p: any) => ({ criterion: p.critic_assessment?.criterion
          ?? VISUAL_RELATION_RULES[p.visual_relationship_kind]?.criterion
          ?? (p.structural_defect.kind === 'support-contact' ? 'contact_and_protection'
            : p.structural_defect.kind === 'composition-relation' ? 'composition_context' : 'form_proportions'),
        correction_kind: p.critic_assessment?.correction_kind
          ?? (p.structural_defect.kind === 'support-contact' ? 'contact'
          : p.structural_defect.kind === 'composition-relation' ? 'composition' : 'form'),
        visible: p.structural_defect.visible, next_change: p.structural_defect.recheck,
        structural_defect: p.structural_defect })),
  ].map(correctionFinding);
  // Explicit named part/relation defects retain their geometry/recheck protection.
  // A broad criterion label is NOT a newly invented dependency across the whole scene.
  const hardStructural = findings.filter(row => row.structural_defect && STRUCTURAL_PRIORITY_KINDS.has(row.correction_kind));
  const hardRequested = hardStructural.find(row => links.includes(row.problem_id));
  const independent = request && independentlyClippedFromStructuralDebt(state, request, hardStructural);
  if (hardRequested) return hardRequested;
  if (hardStructural.length && !independent) return hardStructural[0];
  const parentRank = (row: Row) => {
    const index = findings.findIndex(finding => finding.problem_id === (row.parent_problem_id ?? `critic-${row.criterion}`));
    return index < 0 ? findings.length : index;
  };
  const rankedObligations = [...obligations].sort((a, b) => parentRank(a) - parentRank(b));
  const selected = openCriticObligation({ ...state, critic_obligations: rankedObligations }, links);
  if (selected) {
    const parentId = selected.parent_problem_id ?? `critic-${selected.criterion}`;
    const parentRank = findings.findIndex(row => row.problem_id === parentId);
    const prior = findings.slice(0, parentRank < 0 ? findings.length : parentRank)
      .find(row => !row.structural_defect
        && !obligations.some(obligation => (obligation.parent_problem_id ?? `critic-${obligation.criterion}`) === row.problem_id)
        && STRUCTURAL_PRIORITY_KINDS.has(row.correction_kind));
    if (prior) return prior;
    return correctionFinding({ problem_id: selected.id, criterion: selected.criterion,
      component_ids: [...selected.component_ids], depends_on_ids: [...selected.depends_on_ids],
      ...(selected.correction_kind ? { correction_kind: selected.correction_kind } : {}),
      source_operation_id: selected.operation_id, evidence_sha256: selected.frame_sha256,
      visible: selected.visible,
      next_change: `Correct and visually recheck obligation ${selected.id} on its owned components; preserve earlier verified prerequisites.`,
    });
  }
  const remaining = findings.filter(row => !obligations.some(obligation =>
    (obligation.parent_problem_id ?? `critic-${obligation.criterion}`) === row.problem_id && !row.structural_defect));
  const requested = remaining.find(row => links.includes(row.problem_id));
  const first = remaining[0];
  // Honor the exact-frame Critic's authored urgency order; do not reorder all
  // facade/form findings ahead of independent ground/material work by category.
  if (requested && (requested === first || STRUCTURAL_PRIORITY_KINDS.has(requested.correction_kind)
    || (request && independentlyClippedFromStructuralDebt(state, request,
      remaining.filter(row => STRUCTURAL_PRIORITY_KINDS.has(row.correction_kind)))))) return requested;
  return first;
}
export function criticCorrectionContext(state: Row): Row | null {
  const finding = selectedCriticCorrection(state);
  return finding
    ? {
        ...finding,
        allowed_change_domains: domains[finding.correction_kind],
        ...(finding.structural_defect ? {
          correction_skeleton: {
            addresses_problem_id: finding.problem_id,
            structural_correction: {
              defect_id: finding.structural_defect.id,
              part_ids: finding.structural_defect.part_ids,
              relation_ids: finding.structural_defect.relation_ids,
              target: '<artist-chosen changed geometry and tolerances>',
              execution: 'construction|brush|transform',
              sequence: 'single-pass|partial-rebuild|final-rebuild',
            },
          },
          causal_source_guidance: 'If a separately owned physical overlay caused this reviewed relationship defect but is not listed in structural_defect.part_ids, do NOT rewrite the defect or fabricate a new owner. Keep structural_correction.part_ids naming one original reviewed relationship part, and add structural_correction.causal_source={semantic_id,owner_id,layer_id,source_operation_id,frame_sha256} from the exact same retained editable_scope_review. Guard requires the completed source-operation native owner receipt and a single physically pinned mutation target. A visually plausible layer name or artist guess alone cannot authorize an exception.',
        } : {}),
        next_required_action:
          'Execute one bounded correction of this visible deficit. Preserve owners/protected pixels and uncertainty rules; inspect exact AFTER/BEFORE. Local improvement does not clear whole-scene Critic debt. After repeated no gain change actual construction or report a concrete blocker.',
      }
    : null;
}
export function originalBriefAnchor(state: Row, restoreFull = false): Row {
  const brief = typeof state.original_brief === 'string' ? state.original_brief : '';
  const correction = criticCorrectionContext(state);
  const problems = Object.values(state.visual_problems ?? {}).filter(
    (p: any) => p?.status !== 'resolved'
  ) as Row[];
  const unmet = criticObligationState(state).filter(row => row.status !== 'pass').map(row => ({
    problem_id: row.id, requirement: row.visible,
    next_change: `Review ${row.id} after dependencies ${row.depends_on_ids.join(', ') || 'none'}.`,
  }));
  if (!unmet.length) unmet.push(...activeCriticFindings(state)
    .map(correctionFinding)
    .map((f: Row) => ({
      problem_id: f.problem_id,
      requirement: f.visible,
      next_change: f.next_change,
    })));
  if (!unmet.length)
    for (const p of problems.slice(0, 3))
      unmet.push({
        problem_id: p.problem_id,
        requirement: p.summary ?? p.hypothesis,
        next_change: p.required_change ?? p.hypothesis,
      });
  return {
    source: 'retained-original-brief',
    brief_sha256: brief ? createHash('sha256').update(JSON.stringify(brief)).digest('hex') : null,
    ...(brief
      ? restoreFull
        ? { original_brief: brief, restore_full_brief: true }
        : { intent_excerpt: brief.slice(0, 320), excerpt_truncated: brief.length > 320 }
      : {
          status: 'original_brief_unavailable',
          next: 'Recover the original user task through public Guard or the user; never substitute a local goal or read source.',
        }),
    unmet_requirements: unmet.slice(0, 5),
    next_correction: correction,
    relevance:
      'The next goal must explain which substantive original-brief requirement it advances. A cosmetic local gain does not replace missing objects, composition, form/light/material/contact. Respect the chosen style and user stop/change instructions.',
  };
}
function steps(request: Row): Row[] {
  const bundled = request.args?.steps ?? request.actions;
  return Array.isArray(bundled) ? bundled : [{ tool: request.tool, args: request.args ?? {} }];
}
// Ignore labels, colors and operation ids when detecting repeated construction.
// Retain actual geometry/light/material parameters; a corrected target is a strategy change.
export function correctionStrategy(request: Row, kind?: string): string {
  const keys = new Set([
    'x',
    'y',
    'z',
    'size',
    'points',
    'contours',
    'from',
    'to',
    'path',
    'position',
    'translation',
    'scale',
    'rotation',
    'center',
    'radius',
    'normal',
    'normals',
    'surfaces',
    'vertices',
    'sections',
    'light_direction',
    'caster',
    'receiver',
    'height',
    'contact',
    'roughness',
    'specular_strength',
    'anisotropy',
    'shininess',
    'kind',
    'operation',
    'width',
    'length',
  ]);
  if (
    ['light', 'material'].includes(kind ?? '') ||
    request.painterly_provenance?.authored_form_field?.kind === 'cast-shadow'
  )
    for (const key of [
      'red',
      'green',
      'blue',
      'color',
      'shadow_color',
      'light_color',
      'specular_color',
      'contact_density',
      'falloff',
      'ambient',
      'opacity',
      'stops',
    ])
      keys.add(key);
  const geometry = (value: any): any => {
    if (Array.isArray(value)) return value.map(geometry);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => keys.has(key) || (item && typeof item === 'object'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, geometry(item)])
    );
  };
  const atoms = steps(request)
    .filter((row) => row.tool !== 'photoshop_create_layer')
    .map((row) => ({ tool: row.tool, geometry: geometry(row.args) }));
  return createHash('sha256')
    .update(
      JSON.stringify({
        atoms,
        target: geometry(
          request.painterly_provenance?.authored_form_field ?? request.construction_provenance ?? {}
        ),
      })
    )
    .digest('hex');
}
function filledShapeFootprint(request: Row): string | undefined {
  const regions = steps(request).flatMap(step => step.tool === 'photoshop_paint_regions'
    && Array.isArray(step.args?.regions)
    ? step.args.regions.map((region: Row) => Array.isArray(region.contours)
      ? region.contours.map((contour: Row) => ({ operation: contour.operation ?? 'ADD', points: contour.points }))
      : null)
    : []);
  return regions.length && regions.every(Boolean) ? JSON.stringify(regions) : undefined;
}
function touchedStructuralParts(state: Row, request: Row): string[] {
  const inventory = request.scene_ownership_plan ?? request.args?.scene_ownership_plan
    ?? state.scene_ownership_plan;
  const units: Row[] = Array.isArray(inventory?.units) ? inventory.units : [];
  const owners: Row[] = Array.isArray(state.logical_layer_owners) ? state.logical_layer_owners : [];
  const logical = request.logical_layer ?? request.args?.logical_layer;
  const targetLayerIds = new Set<number>();
  for (const step of steps(request)) {
    if (Number.isSafeInteger(step.args?.layer_id)) targetLayerIds.add(step.args.layer_id);
    for (const region of step.args?.regions ?? []) {
      if (Number.isSafeInteger(region.layer_id)) targetLayerIds.add(region.layer_id);
    }
  }
  const targetOwners = new Set<string>();
  for (const owner of owners) if (targetLayerIds.has(owner.layer_id))
    targetOwners.add(owner.hypothesis_id);
  if (logical?.hypothesis_id && (steps(request).some(step => step.tool === 'photoshop_create_layer')
    || owners.some(owner => owner.hypothesis_id === logical.hypothesis_id
      && targetLayerIds.has(owner.layer_id))))
    targetOwners.add(logical.hypothesis_id);
  const provenance = request.construction_provenance ?? request.args?.construction_provenance;
  const touched = new Set<string>();
  if (typeof provenance?.part_id === 'string') touched.add(provenance.part_id);
  for (const unit of units) if (targetOwners.has(unit.owner_id)) {
    if (typeof unit.semantic_id === 'string') touched.add(unit.semantic_id);
    if (typeof unit.owner_id === 'string') touched.add(unit.owner_id);
  }
  return [...touched];
}

/**
 * A structural relationship may describe the affected architecture, fog and
 * light, while a *different* separately editable overlay caused the fault.
 * The explicit causal source is usable only when all THREE independent pieces
 * agree: a current exact-frame editable-scope review, durable native semantic
 * owner/scene identity and the completed source operation's native owner
 * receipt. The stored defect itself is never silently rewritten.
 */
function verifiedReviewedCausalSource(
  state: Row, request: Row, finding: Row, plan: Row, sourceRecord?: Row,
): boolean {
  const proof = plan.causal_source;
  const defect = finding.structural_defect;
  if (!proof || !defect || !sourceRecord || typeof proof !== 'object'
    || !Number.isSafeInteger(proof.layer_id) || proof.layer_id <= 0
    || typeof proof.semantic_id !== 'string' || !proof.semantic_id
    || typeof proof.owner_id !== 'string' || !proof.owner_id
    || typeof proof.source_operation_id !== 'string'
    || typeof proof.frame_sha256 !== 'string') return false;
  if (proof.source_operation_id !== finding.source_operation_id
    || sourceRecord.id !== proof.source_operation_id
    || sourceRecord.preview?.sha256 !== proof.frame_sha256
    || finding.evidence_sha256 !== proof.frame_sha256
    || sourceRecord.phase !== 'completed' || sourceRecord.failed === true
    || sourceRecord.rolled_back === true || sourceRecord.visual !== true
    || sourceRecord.args?.document_id !== state.document_id) return false;
  const review = state.editable_scope_review;
  if (review?.scope !== 'whole-scene'
    || review.operation_id !== proof.source_operation_id
    || review.frame_sha256 !== proof.frame_sha256) return false;
  const reviewed = (review.parts ?? []).filter((part: Row) =>
    part.semantic_id === proof.semantic_id && part.owner_id === proof.owner_id
    && part.layer_id === proof.layer_id && part.status !== 'missing');
  if (reviewed.length !== 1) return false;
  const nativeOwners = (state.logical_layer_owners ?? []).filter((owner: Row) =>
    owner.layer_id === proof.layer_id && owner.hypothesis_id === proof.owner_id);
  if (nativeOwners.length !== 1
    || (state.logical_layer_owners ?? []).some((owner: Row) =>
      (owner.layer_id === proof.layer_id && owner.hypothesis_id !== proof.owner_id)
      || (owner.hypothesis_id === proof.owner_id && owner.layer_id !== proof.layer_id))) return false;
  const units = (state.scene_ownership_plan?.units ?? []).filter((unit: Row) =>
    unit.semantic_id === proof.semantic_id && unit.owner_id === proof.owner_id);
  if (units.length !== 1) return false;
  const resultBodies = (sourceRecord.result?.content ?? [])
    .filter((item: Row) => item.type === 'text')
    .flatMap((item: Row) => { try { return [JSON.parse(item.text)]; } catch { return []; } });
  const receipts = resultBodies.flatMap((body: Row) =>
    Array.isArray(body.continuation_layers) ? body.continuation_layers : []);
  if (receipts.filter((item: Row) => item.hypothesis_id === proof.owner_id).length !== 1
    || !receipts.some((item: Row) => item.layer_id === proof.layer_id
      && item.hypothesis_id === proof.owner_id)) return false;
  const atoms = steps(request).filter(step => step.tool !== 'photoshop_get_preview');
  if (!atoms.length || atoms.some(step => ![
    'photoshop_paint_regions', 'photoshop_paint_strokes', 'photoshop_paint_dabs',
    'photoshop_transform_layer',
  ].includes(step.tool))) return false;
  if (atoms.some(step => {
    if (Number.isSafeInteger(step.args?.layer_id)) {
      if (step.args.layer_id !== proof.layer_id) return true;
      return Array.isArray(step.args.regions) && step.args.regions.some((region: Row) =>
        region.layer_id !== undefined && region.layer_id !== proof.layer_id);
    }
    // No implicit active-layer target, even if another step names the owner.
    return !Array.isArray(step.args?.regions) || !step.args.regions.length
      || step.args.regions.some((region: Row) => region.layer_id !== proof.layer_id);
  })) return false;
  // The authored correction must still name the exact reviewed relationship,
  // not pretend the source overlay was originally one of defect.part_ids.
  return plan.part_ids.length === 1
    && defect.part_ids.includes(plan.part_ids[0])
    && !defect.part_ids.includes(proof.semantic_id)
    && !(state.visual_problems?.[defect.id]?.status === 'resolved');
}
function hasStructuralMutationFootprint(request: Row, execution: string): boolean {
  const atoms = steps(request);
  if (execution === 'construction') return Boolean(
    (request.construction_provenance ?? request.args?.construction_provenance)?.target_sha256
    && atoms.some(step => step.tool === 'photoshop_paint_regions' && step.args?.regions?.length));
  if (execution === 'transform') return atoms.some(step => {
    if (step.tool !== 'photoshop_transform_layer') return false;
    const args = step.args ?? {};
    return Object.entries(args).some(([key, value]) =>
      ['translation', 'rotation', 'scale', 'matrix', 'position', 'transform'].includes(key)
      && value !== undefined && JSON.stringify(value) !== '{}' && JSON.stringify(value) !== '[]');
  });
  return atoms.some(step =>
    (step.tool === 'photoshop_paint_regions' && step.args?.regions?.some((r: Row) =>
      r.contours?.some((c: Row) => Array.isArray(c.points) && c.points.length >= 3)))
    || (step.tool === 'photoshop_paint_strokes' && Array.isArray(step.args?.strokes) && step.args.strokes.length > 0)
    || (step.tool === 'photoshop_paint_dabs' && Array.isArray(step.args?.dabs) && step.args.dabs.length > 0));
}
/** Native mutation family, not an artist-supplied strategy label. */
function correctionMethodFamily(request: Row): string {
  return [...new Set(steps(request).map(row => row.tool)
    .filter(tool => ['photoshop_paint_regions', 'photoshop_paint_strokes', 'photoshop_paint_dabs',
      'photoshop_transform_layer', 'photoshop_apply_gradient', 'photoshop_paint_color_gradient'].includes(tool)))].sort().join('|');
}
function obligationsForFinding(state: Row, problemId: string): boolean {
  return criticObligationState(state).some(row => row.id === problemId || (row.parent_problem_id ?? `critic-${row.criterion}`) === problemId);
}
export function criticCorrectionIssue(state: Row, request: Row, originalOperation?: Row) {
  const finding = selectedCriticCorrection(state, request);
  if (!finding) return (request.structural_correction ?? request.args?.structural_correction)?.causal_source
    ? { code: 'structural_correction_owner_mismatch',
        message: 'A causal_source cannot authorize reconstruction without an unresolved, exact Critic-reviewed structural defect.' }
    : undefined;
  const linked = requestProblemLinks(request);
  const otherTarget = activeCriticFindings(state).map(correctionFinding)
    .find((item: Row) => linked.includes(item.problem_id) && !STRUCTURAL_PRIORITY_KINDS.has(item.correction_kind));
  if (otherTarget && otherTarget.problem_id !== finding.problem_id
    && STRUCTURAL_PRIORITY_KINDS.has(finding.correction_kind)
    && !linked.includes(finding.problem_id)
    && !STRUCTURAL_PRIORITY_KINDS.has(otherTarget.correction_kind)) return {
      code: 'critic_structural_priority_required',
      message: `Unresolved ${finding.correction_kind} deficit ${finding.problem_id} takes priority over `
        + `${otherTarget.problem_id}. Correct its geometry/contact first, or declare independent_region `
        + 'with preservation_facts and real disjoint paint_regions.clip_bounds outside every structural debt region.',
    };
  const atoms = steps(request),
    tools = new Set(atoms.map((row) => row.tool));
  const impact = request.impact_class ?? request.args?.impact_class;
  const visual = request.visual_intent ?? request.args?.visual_intent;
  const paints = [...tools].some((tool) =>
    ['photoshop_paint_strokes', 'photoshop_paint_dabs', 'photoshop_paint_regions'].includes(tool)
  );
  const shading =
    paints || tools.has('photoshop_apply_gradient') || tools.has('photoshop_paint_color_gradient');
  // A dedicated component layer may already exist before its object becomes visible.
  // This only permits the method; ordinary scope/owner gates still reject combined scaffolds.
  const existingComponent = paints && atoms.filter(row =>
    ['photoshop_paint_strokes', 'photoshop_paint_dabs', 'photoshop_paint_regions'].includes(row.tool)
  ).every(row => Number.isSafeInteger(row.args?.layer_id) && (state.logical_layer_owners ?? []).some((owner: Row) =>
    owner.layer_id === row.args.layer_id && (state.scene_ownership_plan?.units ?? []).some((unit: Row) =>
      unit.owner_id === owner.hypothesis_id && (state.scene_ownership_plan?.objects ?? []).some((object: Row) =>
        object.component_semantic_ids?.includes(unit.semantic_id)
      )
    )
  ));
  const create = paints && (tools.has('photoshop_create_layer') || existingComponent);
  const transform = tools.has('photoshop_transform_layer');
  const kind = finding.correction_kind;
  const structural = ['missing-object', 'composition', 'form', 'contact', 'brief'].includes(kind);
  const defect = finding.structural_defect as Row | undefined;
  if (defect && structural) {
    const plan = (request.structural_correction ?? request.args?.structural_correction) as Row | undefined;
    if (!plan || plan.defect_id !== defect.id || !uniqueStrings(plan.part_ids)
      || !uniqueStrings(plan.relation_ids) || typeof plan.target !== 'string'
      || plan.target.trim().length < 10 || !['construction','brush','transform'].includes(plan.execution)
      || !defect.relation_ids.some((id: string) => plan.relation_ids.includes(id))
      || !defect.part_ids.some((id: string) => plan.part_ids.includes(id)))
      return { code: 'structural_correction_target_missing',
        message: `Defect ${defect.id}: supply an authored structural_correction matching its parts and relations, with desired geometry/tolerance and execution method. Preserve valid fields.` };
    const provenance = request.construction_provenance ?? request.args?.construction_provenance;
    const expectedTool = plan.execution === 'construction' ? !!provenance
      : plan.execution === 'transform' ? steps(request).some(s => s.tool === 'photoshop_transform_layer')
      : steps(request).some(s => ['photoshop_paint_strokes','photoshop_paint_dabs','photoshop_paint_regions'].includes(s.tool));
    if (!expectedTool) return { code: 'structural_correction_execution_mismatch',
      message: `Defect ${defect.id}: compiled Photoshop actions do not implement declared ${plan.execution} correction. A label or model revision is not execution evidence.` };
    if (!hasStructuralMutationFootprint(request, plan.execution))
      return { code: 'structural_correction_no_geometric_execution',
        message: `Defect ${defect.id}: compiled actions need actual nonempty contours, brush paths or nontrivial transforms; a tool name alone is insufficient.` };
    const reviewedSource = verifiedReviewedCausalSource(
      state, request, finding, plan, originalOperation);
    if (plan.causal_source && !reviewedSource)
      return { code: 'structural_correction_owner_mismatch',
        message: `Defect ${defect.id}: causal_source did not match the reviewed frame, native owner receipt, active scene owner and exact single target. Do not retarget an unrelated layer.` };
    if (plan.execution === 'construction' && !plan.part_ids.includes(provenance?.part_id)
      && !(reviewedSource && provenance?.part_id === plan.causal_source?.semantic_id))
      return { code: 'structural_correction_part_mismatch', message: `Construction must rebuild one of the declared affected parts of ${defect.id}.` };
    const touched = touchedStructuralParts(state, request);
    if (touched.length && plan.part_ids.some((id: string) => !touched.includes(id))
      && !reviewedSource)
      return { code: 'structural_correction_owner_mismatch',
        message: `Defect ${defect.id}: authored part_ids do not match the components actually addressed by the compiled layer/owner actions. For a separate culprit overlay, structural_correction.causal_source must exactly match the retained reviewed frame, durable semantic owner and native source-operation layer receipt; never relabel unrelated owners.` };
    const completed = state.structural_repair_progress?.[defect.id]?.part_ids ?? [];
    if (plan.sequence === 'final-rebuild'
      && defect.part_ids.some((id: string) => !new Set([...completed, ...plan.part_ids]).has(id)))
      return { code: 'structural_correction_dependencies_pending',
        message: `Final reconstruction of ${defect.id} must cover all declared dependent parts; use partial-rebuild for a bounded intermediate pass.` };
  }
  const stage = String(request.stage ?? request.args?.stage ?? '').toUpperCase();
  const authoredShadow = request.painterly_provenance?.authored_form_field?.kind === 'cast-shadow';
  const cosmetic =
    ['texture', 'softness', 'microtexture'].includes(impact) ||
    ['texture', 'surface-flow'].includes(visual) ||
    (structural && ['DETAIL', 'MICRO_DETAIL'].includes(stage)) ||
    (structural &&
      ['edge', 'transition', 'tone', 'cleanup'].includes(impact) &&
      !(kind === 'contact' && authoredShadow));
  const appropriate =
    !cosmetic &&
    (kind === 'missing-object'
      ? create
      : kind === 'composition'
        ? transform || paints
        : kind === 'form' || kind === 'contact' || kind === 'brief'
          ? (paints || transform) && (kind !== 'form' || transform
              || tools.has('photoshop_paint_regions')
              || !!request.construction_provenance
              || !!request.args?.construction_provenance
              || (existingComponent && impact === 'construct' && hasStructuralMutationFootprint(request, 'brush'))
              || (defect && (request.structural_correction ?? request.args?.structural_correction)?.execution === 'brush'))
          : shading);
  if (!appropriate)
    return {
      code: 'critic_correction_method_mismatch',
      message: `Critic ${finding.problem_id} (${kind}): ${finding.next_change}. ${!defect && !obligationsForFinding(state, finding.problem_id) ? 'If this retained finding combines already corrected prerequisites and remaining work, review the current delivered whole frame in previous_observation.critic_review (use review_operation_id for an already-closed current visual operation after save; do not re-close it): explicitly list ALL subrequirements in obligations with parent_problem_id=' + finding.problem_id + ', stable component/dependency IDs, correction_kind for each remaining action and visible pass|fail|unknown evidence. Do not mark the whole criterion pass to unblock a partial repair. ' : ''}Use actual component creation/placement/form/shading/contact work appropriate to this finding; cosmetic marks, blur or a changed label are insufficient. Preserve the exact-image review and existing owner/protection gates.`,
    };
  const originalFootprint = originalOperation ? filledShapeFootprint(originalOperation) : undefined;
  const candidateFootprint = filledShapeFootprint(request);
  if (structural && originalOperation && (
    (originalFootprint && candidateFootprint && originalFootprint === candidateFootprint)
    || correctionStrategy(originalOperation, kind) === correctionStrategy(request, kind)))
    return {
      code: 'critic_structural_geometry_unchanged',
      message: `Critic ${finding.problem_id} (${kind}): the proposed operation repeats the rejected geometry. Change component outline, size, placement or support relation; recoloring, re-labeling or repeating the same pixels cannot repair this finding.`,
    };
  const attempt = state.critic_correction_attempts?.[finding.problem_id];
  const repeated = state.critic_scene_failures?.[finding.problem_id];
  const nativeReplacement = steps(request).some(step => step.tool === 'photoshop_paint_regions'
    && step.args?.replace_contents === true);
  // Local improvement cannot license an endless loop when the SAME named structural
  // defect has failed the whole-scene Critic on multiple different accepted frames.
  // A verified replacement or a different native method is needed, not a renamed plan.
  if (finding.structural_defect && repeated?.consecutive_failed_frames >= 2
    && attempt?.outcome === 'local-gain-whole-defect-still-open'
    && attempt?.method_family && attempt.method_family === correctionMethodFamily(request)
    && !nativeReplacement) return {
      code: 'critic_scene_strategy_switch_required',
      message: `Critic repeatedly rejected named structural defect ${finding.problem_id} on distinct frames despite local improvement. Rebuild its owned silhouette with native replace_contents or use a different executable Photoshop method, then recheck the whole scene. A new strategy label or local accent is not evidence of resolution.`,
    };
  if (attempt?.no_gain_count >= 2 && attempt.strategy_sha256 === correctionStrategy(request, kind))
    return {
      code: 'critic_correction_strategy_exhausted',
      message: `Two observed corrections of ${finding.problem_id} made no gain with this construction. Change actual geometry, light/material target or execution method, or report the concrete blocker. Renaming the strategy or adding texture does not reset this debt.`,
    };
  return undefined;
}
/** Retire legacy penalties backed by known failed/uncertain technical runs.
 * Missing historical evidence is retained, never assumed to be safe. */
export function correctionAttemptState(state: Row, records: Row[]): Row {
  const byId = new Map(records.map(record => [record.id, record]));
  const prior = state.critic_correction_attempts ?? {};
  const valid = Object.fromEntries(Object.entries(prior).filter(([, attempt]) => {
    const source = byId.get((attempt as Row)?.operation_id);
    return !source || completedArtisticExecution(source);
  }));
  return Object.keys(valid).length === Object.keys(prior).length
    ? state : { ...state, critic_correction_attempts: valid };
}

export function advanceCriticCorrections(
  state: Row,
  record: Row,
  observation: Row,
  nextReview?: Row
): Row {
  const attempts = { ...(state.critic_correction_attempts ?? {}) };
  const repairProgress = { ...(state.structural_repair_progress ?? {}) };
  const finding = selectedCriticCorrection(state, record);
  if (finding && record.visual && completedArtisticExecution(record) && observation.disposition !== 'rollback') {
    const authored = record.structural_correction ?? record.args?.structural_correction;
    if (finding.structural_defect && authored?.defect_id === finding.structural_defect.id
      && observation.disposition === 'accept' && observation.verdict === 'improvement'
      && observation.target_resolved === 'yes') {
      const priorParts: string[] = repairProgress[authored.defect_id]?.part_ids ?? [];
      repairProgress[authored.defect_id] = {
        part_ids: [...new Set([...priorParts, ...(authored.part_ids ?? [])])],
        last_operation_id: record.id, last_frame_sha256: record.preview?.sha256,
        status: 'reconstruction-attempted-awaiting-specific-critic-review',
      };
    }
    const prior = attempts[finding.problem_id];
    if (prior?.operation_id !== record.id) {
      const signature = correctionStrategy(record, finding.correction_kind);
      const noGain = observation.verdict !== 'improvement' || observation.target_resolved !== 'yes';
      attempts[finding.problem_id] = {
        operation_id: record.id,
        frame_sha256: record.preview?.sha256,
        strategy_sha256: signature,
        method_family: correctionMethodFamily(record),
        no_gain_count: noGain
          ? (prior?.strategy_sha256 === signature ? (prior.no_gain_count ?? 0) : 0) + 1
          : 0,
        outcome: noGain ? 'no-confirmed-gain' : 'local-gain-whole-defect-still-open',
      };
    }
  }
  if (nextReview)
    for (const [criterion, value] of Object.entries(nextReview.criteria ?? {})) {
      if (value === 'pass') delete attempts[`critic-${criterion}`];
    }
  if (nextReview) for (const positive of nextReview.findings ?? [])
    if (nextReview.criteria?.[positive.criterion] === 'pass'
      && positive.structural_defect?.id)
      delete repairProgress[positive.structural_defect.id];
  return { critic_correction_attempts: attempts, structural_repair_progress: repairProgress };
}
