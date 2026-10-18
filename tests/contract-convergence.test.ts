import { describe, expect, it } from 'vitest';
import { convergeTechnicalContracts, MAX_TECHNICAL_CONVERGENCE_PASSES } from '../src/core/guard/contract-convergence.js';
import type { RepairableViolation, StructuredRepairOperation } from '../src/core/guard/preflight-repair.js';

const error = (code: string): RepairableViolation =>
  ({ scope: 'next_operation', code, message: code, details: { path: 'next_pass.technical' } });
const fingerprint = (value: unknown): string => JSON.stringify(value);
const patch = (path: string): StructuredRepairOperation =>
  ({ kind: 'normalize', path, reason: 'Unambiguous technical binding in the fixture' });

describe('bounded Guard contract convergence', () => {
  it('resolves a sequence of newly exposed technical contracts in the same non-mutating attempt', async () => {
    const visited: number[] = [];
    const result = await convergeTechnicalContracts({
      pass: { technical: 0, artistic_rgb: [20, 40, 90] },
      violations: [error('technical_a')],
      fingerprint,
      repair: (pass, violations) => ({
        pass: { ...pass, technical: Number(pass.technical) + 1 },
        repairs: [patch('next_pass.technical')],
      }),
      check: async pass => {
        visited.push(Number(pass.technical));
        return {
          pass, operation: { tool: 'photoshop_fill_layer', args: { document_id: 42 } },
          violations: Number(pass.technical) === 1 ? [error('technical_b')] : [],
        };
      },
      systemic: () => false,
      needsDecision: () => false,
    });
    expect(visited).toEqual([1, 2]);
    expect(result).toMatchObject({ passes: 2, stop: 'validated', pass: { technical: 2, artistic_rgb: [20, 40, 90] } });
    expect(result.repairs).toHaveLength(2);
  });

  it('stops automatically when a repeat produces the same rejection', async () => {
    let checked = 0;
    const result = await convergeTechnicalContracts({
      pass: { revision: 0 }, violations: [error('technical_a')], fingerprint,
      repair: pass => ({ pass: { ...pass, revision: Number(pass.revision) + 1 }, repairs: [patch('next_pass.revision')] }),
      check: async pass => { checked++; return { pass, violations: [error('technical_a')] }; },
      systemic: () => false, needsDecision: () => false,
    });
    expect(result).toMatchObject({ stop: 'no-progress', passes: 1 });
    expect(checked).toBe(1);
  });

  it('detects a candidate cycle even if violation text alternates', async () => {
    const result = await convergeTechnicalContracts({
      pass: { state: 'a' }, violations: [error('a')], fingerprint,
      repair: pass => ({ pass: { state: pass.state === 'a' ? 'b' : 'a' }, repairs: [patch('next_pass.state')] }),
      check: async pass => ({ pass, violations: [error(String(pass.state))] }),
      systemic: () => false, needsDecision: () => false,
    });
    expect(result).toMatchObject({ stop: 'repeated-candidate', passes: 2 });
  });

  it('enforces the global pass limit even if each attempted correction exposes another technical error', async () => {
    const result = await convergeTechnicalContracts({
      pass: { step: 0 }, violations: [error('technical_0')], fingerprint,
      repair: pass => ({ pass: { step: Number(pass.step) + 1 }, repairs: [patch('next_pass.step')] }),
      check: async pass => ({ pass, violations: [error('technical_' + pass.step)] }),
      systemic: () => false, needsDecision: () => false, maxPasses: 100,
    });
    expect(result).toMatchObject({ stop: 'budget-exhausted', passes: MAX_TECHNICAL_CONVERGENCE_PASSES });
    expect(result.violations[0].code).toBe('technical_3');
  });

  it('never performs a repair when the error is a systemic conflict or no safe derivation exists', async () => {
    let checked = 0;
    for (const [code, systemic, needsDecision, expected] of [
      ['guard_requirement_conflict', true, false, 'systemic-blocker'],
      ['artistic_choice_required', false, true, 'needs-decision'],
    ] as const) {
      const result = await convergeTechnicalContracts({
        pass: { color: [1, 2, 3] }, violations: [error(code)], fingerprint,
        repair: pass => ({ pass, repairs: [] }),
        check: async pass => { checked++; return { pass, violations: [] }; },
        systemic: () => systemic, needsDecision: () => needsDecision,
      });
      expect(result).toMatchObject({ passes: 0, stop: expected });
    }
    expect(checked).toBe(0);
  });

  it('preserves a new artistic decision revealed by a technical repair instead of reporting a systemic budget failure', async () => {
    const result = await convergeTechnicalContracts({
      pass: { technical: false, color: 'artist-authored' }, violations: [error('missing_technical_pin')], fingerprint,
      repair: (pass, issues) => issues.some(item => item.code === 'missing_technical_pin')
        ? { pass: { ...pass, technical: true }, repairs: [patch('next_pass.technical')] }
        : { pass, repairs: [] },
      check: async pass => ({ pass, violations: [error('artistic_choice_required')] }),
      systemic: () => false,
      needsDecision: issue => issue.code === 'artistic_choice_required',
    });
    expect(result).toMatchObject({ passes: 1, stop: 'needs-decision',
      pass: { technical: true, color: 'artist-authored' } });
  });

  it('reports independent remaining errors together without discarding valid corrected fields', async () => {
    const result = await convergeTechnicalContracts({
      pass: { pinned: false, geometry: { owner: 'hero' } }, violations: [error('pin_missing')], fingerprint,
      repair: (pass, issues) => issues.some(issue => issue.code === 'pin_missing')
        ? { pass: { ...pass, pinned: true }, repairs: [patch('next_pass.pinned')] }
        : { pass, repairs: [] },
      check: async pass => ({ pass, violations: [error('brush_choice_required'), error('review_region_required')] }),
      systemic: () => false, needsDecision: () => true,
    });
    expect(result).toMatchObject({ passes: 1, stop: 'needs-decision' });
    expect(result.violations.map(item => item.code)).toEqual(['brush_choice_required', 'review_region_required']);
    expect(result.pass).toEqual({ pinned: true, geometry: { owner: 'hero' } });
  });
});
