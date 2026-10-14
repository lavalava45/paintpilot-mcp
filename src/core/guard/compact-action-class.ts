import { VISUAL_MICROPLAN_ACTION_CLASSES } from '../visual-microplan.js';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/**
 * Pure compact-pass action-class and destructive region-target preflight.
 * The caller must append these violations at the original validation boundary:
 * an invalid authored class is not silently replaced with an inferred class.
 */
export function resolveCompactActionClass(input: {
  raw: Record<string, unknown>;
  methodClass: string | undefined;
  mutationSteps: Array<Record<string, unknown>>;
}): { actionClass: string; violations: GuardCycleCompileViolation[] } {
  const { raw, methodClass, mutationSteps } = input;
  const violations: GuardCycleCompileViolation[] = [];
  const explicitActionClass = typeof raw.action_class === 'string' && raw.action_class.trim()
    ? raw.action_class.trim().toUpperCase() : undefined;
  if (explicitActionClass && !VISUAL_MICROPLAN_ACTION_CLASSES.includes(explicitActionClass as never)) {
    violations.push({
      scope: 'next_operation',
      code: 'compact_action_class_invalid',
      message: `next_pass.action_class must be one of ${VISUAL_MICROPLAN_ACTION_CLASSES.join('|')}`,
    });
  }
  if (Array.isArray(raw.replace_protected_layer_ids) && raw.replace_protected_layer_ids.length > 0 && !explicitActionClass) {
    violations.push({
      scope: 'next_operation',
      code: 'compact_replace_action_required',
      message: 'replace_protected_layer_ids requires explicit next_pass.action_class=REPLACE or ERASE',
    });
  }
  const actionClass = explicitActionClass
    ?? (methodClass === 'rollback' ? 'ROLLBACK' : methodClass === 'erase' ? 'ERASE' : 'ADD');
  for (const step of mutationSteps) if (step.tool === 'photoshop_paint_regions' && (step.args as Record<string, unknown>)?.replace_contents === true) {
    const layer = Number((raw.logical_layer as any)?.layer_id);
    const declaredRegions = (step.args as Record<string, unknown>).regions as Array<Record<string, unknown>>;
    if (actionClass !== 'REPLACE' || !Number.isSafeInteger(layer) || layer <= 0
      || !declaredRegions?.length || declaredRegions.some(r => r.layer_id !== layer)) {
      violations.push({
        scope: 'next_operation',
        code: 'component_rebuild_target_required',
        message: 'Replacing contents requires explicit REPLACE, one durable owned layer and every region pinned to that same layer. Never clear an implicit active target.',
      });
    }
  }
  return { actionClass, violations };
}
