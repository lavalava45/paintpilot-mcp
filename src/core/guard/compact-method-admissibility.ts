import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/**
 * Preflight authored method/tool bindings before the compact pass is executed.
 * Keep exclusions, tool mismatches and mixed-class diagnostics in their
 * original order; method classification remains owned by the compiler.
 */
export function collectCompactMethodAdmissibility(input: {
  mutationSteps: Array<Record<string, unknown>>;
  avoidMethodIds: unknown;
  knownMethods: ReadonlyMap<string, { primaryTool?: string }>;
  methodClassForStep: (step: Record<string, unknown>) => string | undefined;
}): { methodClasses: string[]; violations: GuardCycleCompileViolation[] } {
  const { mutationSteps, avoidMethodIds, knownMethods, methodClassForStep } = input;
  const violations: GuardCycleCompileViolation[] = [];
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  for (const step of mutationSteps) {
    const methodId = text(step.method_id);
    if (!methodId) continue;
    if (Array.isArray(avoidMethodIds) && avoidMethodIds.includes(methodId)) {
      violations.push({
        scope: 'next_operation',
        code: 'artistic_method_unavailable',
        message: `Executed method_id=${methodId} is explicitly excluded.`,
      });
    }
    const semanticMethod = knownMethods.get(methodId);
    if (semanticMethod && semanticMethod.primaryTool !== text(step.tool)
      && !(methodId === 'continuous-color-field' && text(step.tool) === 'photoshop_fill_layer')) {
      violations.push({
        scope: 'next_operation',
        code: 'step_method_tool_mismatch',
        message: `method_id=${methodId} requires primary tool ${semanticMethod.primaryTool}, not ${text(step.tool) ?? 'missing'}`,
      });
    }
  }
  const methodClasses = [...new Set(mutationSteps.map(methodClassForStep).filter(Boolean))] as string[];
  if (methodClasses.length > 1) {
    violations.push({
      scope: 'next_operation',
      code: 'compact_pass_mixed_method_class',
      message: `next_pass actions contain incompatible mutation method classes: ${methodClasses.join(', ')}; split them into bounded passes`,
    });
  }
  return { methodClasses, violations };
}
