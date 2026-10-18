import { createHash } from 'node:crypto';

type Row = Record<string, any>;
export interface SimpleGraphicNotice { code: 'simple_graphic_auto_fix' | 'simple_graphic_warn'; message: string }
const row = (value: unknown): Row | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined;
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const exactId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/**
 * Finish-first is a narrowly scoped technical compiler policy, not an
 * alternative Photoshop dispatcher. It cannot remove Guard violations.
 * Authored roles/owners/targets are never overwritten; derived fields are
 * supported by an unambiguous canvas field or authoritative owner receipt.
 */
export function normalizeSimpleGraphicPass(
  authored: Row, context: Row,
): { pass: Row; notices: SimpleGraphicNotice[] } {
  const pass = structuredClone(authored);
  const notices: SimpleGraphicNotice[] = [];
  if (context.painting_profile !== 'simple_graphic') return { pass, notices };
  if (!exactId(pass.document_id) || (exactId(row(context.document_target)?.id)
    && pass.document_id !== row(context.document_target)?.id)) return { pass, notices };
  if (pass.restore_anchor_operation_id || pass.cross_layer_correction
    || ['ERASE', 'ROLLBACK', 'REPLACE'].includes(String(pass.action_class))
    || pass.scene_ownership_plan !== undefined) return { pass, notices };

  const actions = Array.isArray(pass.actions) ? pass.actions.map(row) : [];
  const create = actions.filter(action => action?.tool === 'photoshop_create_layer');
  const painted = actions.filter(action => action?.tool !== 'photoshop_create_layer'
    && action?.tool !== 'photoshop_get_preview');
  const logical = row(pass.logical_layer);
  const createName = create.length === 1 ? text(row(create[0]?.args)?.name) : undefined;
  const canvasField = createName && create[0]?.id
    && painted.length === 1
    && ['photoshop_paint_color_gradient', 'photoshop_fill_layer'].includes(painted[0]?.tool)
    && row(painted[0]?.args)?.layer_id === `$steps.${create[0].id}.details.layerId`
    && !pass.construction && !pass.painterly
    && pass.visual_intent === 'continuous-field'
    && (pass.construction_role === undefined || pass.construction_role === 'continuous-field')
    && (!logical || (logical.decision === 'create-new' && logical.component_space === 'canvas'
      && (!logical.layer_name || logical.layer_name === createName)));
  if (canvasField) {
    const owners = Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : [];
    if (!logical && pass.target_owner_id === undefined && !pass.component_scope
      && text(pass.request_key) && owners.every(owner => owner.layer_name !== createName)) {
      const id = 'simple_field_' + createHash('sha256')
        .update(`${pass.document_id}|${pass.request_key}|${createName}`).digest('hex').slice(0, 18);
      if (!owners.some(owner => owner.hypothesis_id === id)) {
        pass.logical_layer = {
          decision: 'create-new', hypothesis_id: id, layer_name: createName,
          hypothesis: 'One independently editable native continuous canvas field',
          component_space: 'canvas', rollback_value: 'moderate',
          expected_independent_rollback: true,
        };
        notices.push({ code: 'simple_graphic_auto_fix',
          message: 'Created a stable semantic owner for one proven canvas fill/gradient; Photoshop create receipt remains mandatory.' });
      }
    }
    if (pass.construction_role === undefined) {
      pass.construction_role = 'continuous-field';
      notices.push({ code: 'simple_graphic_auto_fix',
        message: 'Derived continuous-field from the explicitly authored continuous canvas field and native executor.' });
    }
    if (row(pass.logical_layer)?.decision === 'create-new'
      && pass.layer_separation_check === undefined) {
      pass.layer_separation_check = {
        change_kind: 'new-plane', substantial: true, rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['One independently editable canvas field is created with an exact step reference.'],
      };
      notices.push({ code: 'simple_graphic_auto_fix',
        message: 'Derived layer separation for one exact canvas create-and-paint transaction; no owner was merged or retargeted.' });
    }
    if (pass.material_role === undefined) {
      notices.push({ code: 'simple_graphic_warn',
        message: 'No material_role was supplied for the native canvas fill/gradient. It is advisory, not a brush/material-selection requirement; the native operation remains schema-checked.' });
    }
    if (pass.scene_geometry_model === undefined) {
      notices.push({ code: 'simple_graphic_warn',
        message: 'No perspective model was supplied for the explicitly flat canvas color field. Spatial/world owner construction still requires proven geometry.' });
    }
  }
  // A durable owner is the only permitted source for an omitted material role.
  // Never choose a brush material by style defaults or layer name.
  if (pass.material_role === undefined && pass.construction_role !== undefined) {
    const id = text(row(pass.logical_layer)?.hypothesis_id) ?? text(pass.target_owner_id);
    const owners = Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : [];
    const matches = owners.filter(owner => owner.hypothesis_id === id
      && owner.temporary !== true && exactId(owner.layer_id));
    if (matches.length === 1 && text(matches[0].material_role)) {
      pass.material_role = matches[0].material_role;
      notices.push({ code: 'simple_graphic_auto_fix',
        message: 'Inherited material_role from the unique durable owner, without inventing a brush/material choice.' });
    }
  }
  return { pass, notices };
}

/**
 * Pure aesthetic priority advisory. Only one explicitly owned, native clipped
 * gradient on an existing layer is eligible, and only if its whole polygon is
 * disjoint from all reviewed structural debt. No brush/filter or active-layer
 * operation can qualify.
 */
export function simpleGraphicFoundationAdvisory(
  state: Row, operation: Row, owners: readonly Row[],
): boolean {
  if (state.painting_profile !== 'simple_graphic'
    || !state.current_frame?.operation_id
    || operation.tool !== 'photoshop_execute_visual_microplan') return false;
  const args = row(operation.args);
  if (!args || !exactId(args.document_id) || args.document_id !== state.document_id
    || args.action_class === 'ROLLBACK'
    || args.action_class === 'ERASE' || args.action_class === 'REPLACE') return false;
  const logical = row(args.logical_layer);
  const ownerId = text(logical?.hypothesis_id);
  const layerId = logical?.layer_id;
  if (!ownerId || !exactId(layerId)
    || owners.filter(owner => owner.hypothesis_id === ownerId
      && owner.layer_id === layerId && owner.temporary !== true).length !== 1) return false;
  const steps = Array.isArray(args.steps) ? args.steps : [];
  const changes = steps.filter(step => step?.tool !== 'photoshop_get_preview');
  if (changes.length !== 1 || changes[0]?.tool !== 'photoshop_paint_color_gradient') return false;
  const paint = row(changes[0].args);
  if (paint?.layer_id !== layerId || paint.preserve_transparency !== true) return false;
  const points = paint.clip_contour;
  if (!Array.isArray(points) || points.length < 3 || points.length > 256
    || points.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return false;
  const xs = points.map((p: Row) => p.x), ys = points.map((p: Row) => p.y);
  const bounds = { left: Math.min(...xs), right: Math.max(...xs),
    top: Math.min(...ys), bottom: Math.max(...ys) };
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return false;
  const debt = Object.values(state.visual_problems ?? {}).filter((problem: any) =>
    problem?.status === 'open' && problem?.structural_defect);
  // No reviewed structural debts means there is nothing for this local clip
  // to intersect; foundation remains incomplete, but may be an advisory.
  if (!debt.length) return true;
  return debt.every((problem: any) => {
    const b = problem.structural_defect.region_bounds ?? problem.review_region_bounds;
    return b && [b.left, b.top, b.right, b.bottom].every(Number.isFinite)
      && (bounds.right <= b.left || bounds.left >= b.right
        || bounds.bottom <= b.top || bounds.top >= b.bottom);
  });
}
