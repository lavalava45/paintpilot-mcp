import type { RepairableViolation, StructuredRepairOperation } from './preflight-repair.js';

/** Bounded, pre-dispatch technical convergence. This has no Photoshop access.
 * The caller's full preflight is authoritative on EVERY candidate; an
 * intermediate successful repair never grants execution or review authority.
 */
export const MAX_TECHNICAL_CONVERGENCE_PASSES = 3;

export type ContractConvergenceStop =
  | 'validated' | 'needs-decision' | 'systemic-blocker'
  | 'no-safe-repair' | 'no-progress' | 'repeated-candidate' | 'budget-exhausted';

export interface ContractConvergenceCheck<V extends RepairableViolation> {
  pass: Record<string, unknown>;
  operation?: Record<string, unknown>;
  violations: V[];
  repairs?: StructuredRepairOperation[];
  normalizations?: Array<{ code: string; message: string }>;
}

export interface ContractConvergenceResult<V extends RepairableViolation> extends ContractConvergenceCheck<V> {
  passes: number;
  stop: ContractConvergenceStop;
  repairs: StructuredRepairOperation[];
  normalizations: Array<{ code: string; message: string }>;
  /** One deferred portion may be scheduled only after the accepted visual review. */
  deferredPass?: Record<string, unknown>;
}

export async function convergeTechnicalContracts<V extends RepairableViolation>(options: {
  pass: Record<string, unknown>;
  operation?: Record<string, unknown>;
  violations: V[];
  fingerprint: (value: unknown) => string;
  /** Called for the *current* errors, never invented field choices. */
  repair: (pass: Record<string, unknown>, violations: V[], round: number) => {
    pass: Record<string, unknown>;
    repairs: StructuredRepairOperation[];
    deferredPass?: Record<string, unknown>;
  };
  /** Run all currently available technical, geometry, compiled and dynamic gates. */
  check: (pass: Record<string, unknown>) => Promise<ContractConvergenceCheck<V>>;
  /** True for an invariant that cannot be corrected locally. */
  systemic: (violation: V) => boolean;
  /** True only for choices that the artist/model must make. */
  needsDecision: (violation: V) => boolean;
  maxPasses?: number;
}): Promise<ContractConvergenceResult<V>> {
  const maxPasses = Math.min(MAX_TECHNICAL_CONVERGENCE_PASSES,
    Math.max(1, Math.floor(options.maxPasses ?? MAX_TECHNICAL_CONVERGENCE_PASSES)));
  let pass = options.pass;
  let operation = options.operation;
  let violations = options.violations;
  let passes = 0;
  let stop: ContractConvergenceStop = 'no-safe-repair';
  let deferredPass: Record<string, unknown> | undefined;
  const repairs: StructuredRepairOperation[] = [];
  const normalizations: Array<{ code: string; message: string }> = [];
  const seenCandidates = new Set<string>([options.fingerprint(pass)]);
  const violationKey = (rows: V[]) => options.fingerprint(rows);

  for (let round = 0; round < maxPasses; round++) {
    if (!violations.length) { stop = 'validated'; break; }
    if (violations.some(options.systemic)) { stop = 'systemic-blocker'; break; }
    const before = violationKey(violations);
    const proposed = options.repair(pass, violations, round);
    if (!proposed.repairs.length) {
      stop = violations.some(options.needsDecision) ? 'needs-decision' : 'no-safe-repair';
      break;
    }
    // Never consume a visual batch on a split whose deferred remainder cannot
    // be carried safely through the rest of this local convergence.
    if (deferredPass && proposed.deferredPass) { stop = 'budget-exhausted'; break; }
    const checked = await options.check(proposed.pass);
    passes++;
    repairs.push(...proposed.repairs, ...(checked.repairs ?? []));
    normalizations.push(...(checked.normalizations ?? []));
    pass = checked.pass;
    operation = checked.operation;
    violations = checked.violations;
    deferredPass ??= proposed.deferredPass;
    const candidateKey = options.fingerprint(pass);
    if (!violations.length) { stop = 'validated'; break; }
    if (seenCandidates.has(candidateKey)) { stop = 'repeated-candidate'; break; }
    seenCandidates.add(candidateKey);
    if (violationKey(violations) === before) {
      stop = violations.some(options.needsDecision) ? 'needs-decision' : 'no-progress';
      break;
    }
    if (violations.some(options.systemic)) { stop = 'systemic-blocker'; break; }
    if (round === maxPasses - 1) {
      const available = options.repair(pass, violations, round + 1);
      stop = available.repairs.length ? 'budget-exhausted'
        : violations.some(options.needsDecision) ? 'needs-decision' : 'no-safe-repair';
      break;
    }
  }
  return { pass, operation, violations, repairs, normalizations, passes, stop,
    ...(deferredPass ? { deferredPass } : {}) };
}
