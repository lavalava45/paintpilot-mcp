import { describe, expect, it } from 'vitest';
import { VISUAL_MICROPLAN_CHANGE_DOMAINS } from '../src/core/visual-microplan.js';
import { validateCompactChangeDomains } from '../src/core/guard/compact-change-domains.js';

describe('compact change domains shared validation', () => {
  it('treats an omitted declaration as absent, without a diagnostic', () => {
    expect(validateCompactChangeDomains(undefined)).toEqual({ validDomains: [], violations: [] });
  });

  it('preserves order and duplicates of individually valid declared domains', () => {
    expect(validateCompactChangeDomains(['silhouette', 'local-edge', 'silhouette'])).toEqual({
      validDomains: ['silhouette', 'local-edge', 'silhouette'], violations: [],
    });
  });

  it('keeps valid domains alongside the original single invalid-domain diagnostic', () => {
    expect(validateCompactChangeDomains(['local-edge', null, 'not-a-domain', 'silhouette'])).toEqual({
      validDomains: ['local-edge', 'silhouette'],
      violations: [{
        scope: 'next_operation', code: 'compact_change_domains_invalid',
        message: `change_domains must contain only ${VISUAL_MICROPLAN_CHANGE_DOMAINS.join('|')}`,
      }],
    });
  });

  it('rejects explicit null and non-array declarations with the same diagnostic', () => {
    const expected = [{
      scope: 'next_operation', code: 'compact_change_domains_invalid',
      message: `change_domains must contain only ${VISUAL_MICROPLAN_CHANGE_DOMAINS.join('|')}`,
    }];
    expect(validateCompactChangeDomains(null)).toEqual({ validDomains: [], violations: expected });
    expect(validateCompactChangeDomains('silhouette')).toEqual({ validDomains: [], violations: expected });
  });
});
