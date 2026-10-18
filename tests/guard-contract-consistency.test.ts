import { describe, expect, it } from 'vitest';
import { collectSchemaErrors } from '../src/core/guard/cycle-compiler.js';
import {
  contradictoryTransitionRequirements, transitionRequirementSchemaErrors,
  type TransitionRequirement,
} from '../src/core/transition-requirements.js';
import { classifyViolation, fieldCorrectionPacket } from '../src/core/guard/preflight-repair.js';

const publicSchema = { type: 'object', properties: { next_pass: { type: 'object', properties: {
  role: { type: 'string', enum: ['continuous-field', 'support-surface'] },
  size: { type: 'number', minimum: 1, maximum: 100 },
  layer_id: { type: 'integer', minimum: 1 },
} } } };

const requirement = (path: string, operator: TransitionRequirement['operator'], expected: unknown) =>
  ({ path, operator, expected });

describe('same-field runtime correction contract', () => {
  it('accepts one valid alternative instead of classifying the entire one-of as impossible', () => {
    const allowed = requirement('next_pass.role', 'one-of', ['obsolete-role', 'continuous-field']);
    expect(transitionRequirementSchemaErrors(allowed, publicSchema, collectSchemaErrors)).toEqual([]);
    const impossible = requirement('next_pass.role', 'one-of', ['obsolete-role', 'unsupported-role']);
    expect(transitionRequirementSchemaErrors(impossible, publicSchema, collectSchemaErrors)).not.toEqual([]);
    expect(transitionRequirementSchemaErrors(requirement('next_pass.role', 'one-of', []),
      publicSchema, collectSchemaErrors)).not.toEqual([]);
  });

  it('rejects only unsatisfiable numeric intersections, not legitimate narrower published bounds', () => {
    expect(transitionRequirementSchemaErrors(requirement('next_pass.size', 'number-range',
      { min: 0, max: 5000 }), publicSchema, collectSchemaErrors)).toEqual([]);
    expect(transitionRequirementSchemaErrors(requirement('next_pass.size', 'number-range',
      { min: 101, max: 200 }), publicSchema, collectSchemaErrors)).not.toEqual([]);
    expect(transitionRequirementSchemaErrors(requirement('next_pass.size', 'number-range',
      { min: 100, max: 200, exclusive_min: true }), publicSchema, collectSchemaErrors)).not.toEqual([]);
    expect(transitionRequirementSchemaErrors(requirement('next_pass.size', 'number-range',
      { min: 100, max: 200 }), publicSchema, collectSchemaErrors)).toEqual([]);
    expect(transitionRequirementSchemaErrors(requirement('next_pass.size', 'number-range',
      { min: 200, max: 100 }), publicSchema, collectSchemaErrors)).not.toEqual([]);
    // A midpoint of 1.5 is not legal for an integer field, but 1 and 2 are.
    expect(transitionRequirementSchemaErrors(requirement('next_pass.layer_id', 'number-range',
      { min: 1, max: 2 }), publicSchema, collectSchemaErrors)).toEqual([]);
    expect(transitionRequirementSchemaErrors(requirement('next_pass.layer_id', 'number-range',
      { min: 0, max: 1, exclusive_min: true }), publicSchema, collectSchemaErrors)).toEqual([]);
  });

  it.each([
    [[requirement('next_pass.role', 'equals', 'continuous-field'), requirement('next_pass.role', 'equals', 'support-surface')], true],
    [[requirement('next_pass.role', 'one-of', ['continuous-field']), requirement('next_pass.role', 'one-of', ['support-surface'])], true],
    [[requirement('next_pass.layer_id', 'absent', true), requirement('next_pass.layer_id', 'nonempty-string', true)], true],
    [[requirement('next_pass.size', 'number-range', { min: 1, max: 10 }), requirement('next_pass.size', 'number-range', { min: 12, max: 20 })], true],
    [[requirement('next_pass.size', 'number-range', { min: 1, max: 10 }), requirement('next_pass.size', 'number-range', { min: 10, max: 20, exclusive_min: true })], true],
    [[requirement('next_pass.size', 'number-range', { min: 1, max: 10 }), requirement('next_pass.size', 'number-range', { min: 10, max: 20 })], false],
    [[requirement('next_pass.role', 'one-of', ['continuous-field', 'support-surface']), requirement('next_pass.role', 'equals', 'continuous-field')], false],
    [[requirement('next_pass.role', 'one-of', ['continuous-field']), requirement('next_pass.size', 'equals', 10)], false],
  ] as const)('identifies mutually exclusive typed demands without inventing artistic fixes %#', (rules, impossible) => {
    expect(contradictoryTransitionRequirements([...rules]).length > 0).toBe(impossible);
  });

  it('classifies internal contradictory demands as systemic and never as a user decision', () => {
    const error = { scope: 'next_operation' as const, code: 'guard_requirement_conflict',
      message: 'Guard requires incompatible values', details: { path: 'next_pass.role' } };
    expect(classifyViolation(error)).toBe('SYSTEMIC_FAILURE');
    const packet = fieldCorrectionPacket([error]);
    expect(packet.corrections[0]).toMatchObject({ path: 'next_pass.role' });
    expect(packet.corrections[0]).not.toHaveProperty('artistic_decision_required');
    expect(packet.next).toContain('Do not guess');
    expect(packet.next).not.toContain('Resubmit');
  });
});
