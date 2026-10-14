import { VISUAL_MICROPLAN_CHANGE_DOMAINS } from '../visual-microplan.js';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

/**
 * One pure validation boundary for authored change domains in both direct
 * Photoshop operations and VisualMicroPlan. Keep the original partial-valid
 * behavior: report invalid entries but retain independently valid domains.
 */
export function validateCompactChangeDomains(value: unknown): {
  validDomains: string[];
  violations: GuardCycleCompileViolation[];
} {
  const declared = Array.isArray(value) ? value : [];
  const validDomains = declared.filter((domain): domain is string =>
    typeof domain === 'string' && (VISUAL_MICROPLAN_CHANGE_DOMAINS as readonly string[]).includes(domain));
  const invalid = value !== undefined && (!Array.isArray(value) || validDomains.length !== declared.length);
  return {
    validDomains,
    violations: invalid ? [{
      scope: 'next_operation',
      code: 'compact_change_domains_invalid',
      message: `change_domains must contain only ${VISUAL_MICROPLAN_CHANGE_DOMAINS.join('|')}`,
    }] : [],
  };
}
