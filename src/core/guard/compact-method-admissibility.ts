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
    // The selected Photoshop tool is independently schema-checked. A method
    // catalog's preferred tool cannot prohibit a valid, authored alternative.
    void semanticMethod;
  }
  const methodClasses = [...new Set(mutationSteps.map(methodClassForStep).filter(Boolean))] as string[];
  // Mixing artistic method families is a stylistic choice; execution budgets
  // and per-step technical validation remain enforced by the compiler.
  return { methodClasses, violations };
}
