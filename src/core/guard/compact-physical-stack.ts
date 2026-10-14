import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/**
 * Pure pre-dispatch checks for semantic layer physical roles and depth ordering.
 * The compiler owns stage resolution, owner inventory and target normalization;
 * this helper only reports the same ordered violations as the inline checks.
 */
export function collectCompactPhysicalStackViolations(input: {
  paintingProfile: unknown;
  hasCreateStep: boolean;
  hasLogicalLayer: boolean;
  logicalDecision?: string;
  physicalRole?: string;
  opacityRole?: string;
  physicalSignatureRoles: ReadonlySet<string>;
  stage?: string;
  stageRank: number;
  logicalHypothesisId?: string;
  depthRelations: Array<Record<string, unknown>>;
  ownerByHypothesis: ReadonlyMap<string, Record<string, unknown>>;
  createArgs: Record<string, unknown>;
  owners: ReadonlyArray<Record<string, unknown>>;
}): GuardCycleCompileViolation[] {
  const {
    paintingProfile, hasCreateStep, hasLogicalLayer, logicalDecision, physicalRole,
    opacityRole, physicalSignatureRoles, stage, stageRank, logicalHypothesisId,
    depthRelations, ownerByHypothesis, createArgs, owners,
  } = input;
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const violations: GuardCycleCompileViolation[] = [];
  const physicalMetadataRequired = paintingProfile === 'nontrivial_painting'
    && hasCreateStep
    && hasLogicalLayer;
  if (physicalMetadataRequired && (!physicalRole || !opacityRole)) {
    violations.push({
      scope: 'next_operation',
      code: 'physical_stack_metadata_required',
      message: 'physical_stack_metadata_required: every new semantic layer in a nontrivial painting must declare logical_layer.physical_role and opacity_role so opaque structure cannot silently become a transparent/effect layer',
    });
  }
  if (
    paintingProfile === 'nontrivial_painting'
    && ['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '')
    && physicalRole
    && physicalSignatureRoles.has(physicalRole)
    && stageRank >= 3
  ) {
    violations.push({
      scope: 'next_operation',
      code: 'physical_stack_structural_change_requires_shape',
      message: `physical_stack_structural_change_requires_shape: new ${physicalRole} owner ${logicalHypothesisId ?? 'unknown'} cannot be introduced at ${stage}; return to SHAPE with an explicit structural stage_reset, rebuild occlusion, then re-pass the physical stack gate`,
    });
  }
  for (const relation of depthRelations) {
    const relationKind = text(relation.relation)?.toLowerCase();
    const targetHypothesisId = text(relation.target_hypothesis_id);
    const targetOwner = targetHypothesisId ? ownerByHypothesis.get(targetHypothesisId) : undefined;
    if (!targetHypothesisId || !targetOwner) {
      violations.push({
        scope: 'next_operation',
        code: 'physical_stack_target_missing',
        message: `physical_stack_target_missing: depth relation for ${logicalHypothesisId ?? 'unknown'} references semantic owner ${targetHypothesisId ?? 'missing'} which is not durably established`,
      });
      continue;
    }
    if (['create-new', 'temporary-hypothesis'].includes(logicalDecision ?? '') && hasCreateStep) {
      const targetLayerId = Number(targetOwner.layer_id);
      const aboveLayerId = Number(createArgs.above_layer_id);
      const belowLayerId = Number(createArgs.below_layer_id);
      if (relationKind === 'in-front-of' && aboveLayerId !== targetLayerId) {
        violations.push({
          scope: 'next_operation',
          code: 'physical_stack_layer_order_mismatch',
          message: `physical_stack_layer_order_mismatch: ${logicalHypothesisId} is declared in-front-of ${targetHypothesisId}; photoshop_create_layer must use above_layer_id=${targetLayerId}`,
        });
      } else if (relationKind === 'behind' && belowLayerId !== targetLayerId) {
        violations.push({
          scope: 'next_operation',
          code: 'physical_stack_layer_order_mismatch',
          message: `physical_stack_layer_order_mismatch: ${logicalHypothesisId} is declared behind ${targetHypothesisId}; photoshop_create_layer must use below_layer_id=${targetLayerId}`,
        });
      }
    }
  }
  // The committed-refinement gate follows all physical metadata and depth checks.
  // Keep the original owner ordering and exact diagnostic even with missing ids.
  if (paintingProfile === 'nontrivial_painting' && stageRank >= 4) {
    const unresolvedTemporaryOwners = owners.filter(owner =>
      owner.temporary === true && text(owner.rollback_value)?.toLowerCase() !== 'low'
    );
    if (unresolvedTemporaryOwners.length) {
      violations.push({
        scope: 'next_operation',
        code: 'semantic_layer_stage_gate',
        message: `semantic_layer_stage_gate: committed ${stage} refinement is blocked while temporary semantic owners remain unresolved: ${unresolvedTemporaryOwners.map(owner => text(owner.hypothesis_id)).filter(Boolean).join(', ')}`,
      });
    }
  }
  return violations;
}
