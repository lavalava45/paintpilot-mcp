import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/** Pure compact semantic-owner metadata preflight, preserving failure order. */
export function collectCompactOwnerMetadataViolations(input: {
  semanticCreateMetadataRequired: boolean;
  declaredRequiresIsolation: boolean;
  hasLayerSeparation: boolean;
  hasLogicalLayer: boolean;
}): GuardCycleCompileViolation[] {
  const { semanticCreateMetadataRequired, declaredRequiresIsolation, hasLayerSeparation, hasLogicalLayer } = input;
  const violations: GuardCycleCompileViolation[] = [];
  if (semanticCreateMetadataRequired && !hasLayerSeparation) {
    violations.push({ scope: 'next_operation', code: 'semantic_layer_owner_missing',
      message: 'semantic_layer_owner_missing: semantic painting layer creation must declare next_pass.layer_separation_check in every rendering profile' });
  }
  if ((semanticCreateMetadataRequired || declaredRequiresIsolation) && !hasLogicalLayer) {
    violations.push({ scope: 'next_operation', code: 'semantic_layer_owner_missing',
      message: 'semantic_layer_owner_missing: independently editable nontrivial painting work must declare one stable next_pass.logical_layer semantic owner' });
  }
  if (hasLogicalLayer && !hasLayerSeparation) {
    violations.push({ scope: 'next_operation', code: 'semantic_layer_owner_missing',
      message: 'semantic_layer_owner_missing: new ownership, structural change or rollback reassessment requires next_pass.layer_separation_check; unchanged known-owner continuation can inherit it' });
  }
  return violations;
}
