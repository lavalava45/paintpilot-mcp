import { expect, it } from 'vitest';
import { unmetTransitionRequirements, transitionRequirementSchemaErrors, type TransitionRequirement } from '../src/core/transition-requirements.js';
import { collectSchemaErrors } from '../src/core/guard/cycle-compiler.js';
import { validateVisualRelationships, VISUAL_RELATION_RULES, VISUAL_RELATION_DEFECT_KIND_GUIDANCE } from '../src/core/guard/visual-relationship-review.js';
import { FrameReviewValidationError, validateReviewSections } from '../src/core/guard/review-validation.js';
import { fieldCorrectionPacket } from '../src/core/guard/preflight-repair.js';

it.each([
  { operator: 'equals', expected: false, actual: true },
  { operator: 'absent', expected: true, actual: 999 },
  { operator: 'equals', expected: { a: 1, b: 2 }, actual: { b: 2, a: 1 } },
  { operator: 'one-of', expected: ['attachment', 'shape-topology'], actual: 'relative-size' },
  { operator: 'includes', expected: ['a', 'b'], actual: ['a'] },
  { operator: 'number-range', expected: { min: 0, max: 100, exclusive_min: true }, actual: 0 },
  { operator: 'nonempty-string', expected: true, actual: ' ' },
  { operator: 'contains-bounds', expected: { left: 0, top: 0, right: 10, bottom: 10 }, actual: { left: 1, top: 0, right: 10, bottom: 10 } },
] as const)('uses the published $operator constraint for validation and preserves it in correction packets', constraint => {
  const rule = { ...constraint, path: 'next_pass.test', code: 'test_requirement', message: 'Correct this field.' } as TransitionRequirement;
  const issues = unmetTransitionRequirements([rule]);
  const equalObject = constraint.operator === 'equals' && typeof constraint.expected === 'object';
  expect(issues).toHaveLength(equalObject ? 0 : 1);
  if (!issues.length) return;
  const packet = fieldCorrectionPacket(issues.map(issue => ({ scope: 'next_operation', ...issue, details: issue })));
  expect(packet.corrections[0]).toMatchObject({ path: rule.path, operator: rule.operator, expected: rule.expected });
});

it('detects forbidden fields, values, numeric ranges and removal of required fields with the same schema check used by the compiler and audit', () => {
  const schema: any = { type: 'object', properties: { next_pass: { type: 'object', required: ['decision'], properties: {
    decision: { type: 'string', enum: ['create-new'] }, width: { type: 'number', minimum: 1, maximum: 100 },
  } } } };
  for (const rule of [
    { path: 'next_pass.unknown', operator: 'equals', expected: 'x' },
    { path: 'next_pass.decision', operator: 'equals', expected: 'continue-logical-layer' },
    { path: 'next_pass.decision', operator: 'absent', expected: true },
    { path: 'next_pass.width', operator: 'number-range', expected: { min: 0, max: 5000 } },
  ]) expect(transitionRequirementSchemaErrors(rule, schema, collectSchemaErrors)).not.toEqual([]);
  expect(transitionRequirementSchemaErrors({ path: 'next_pass.width', operator: 'number-range',
    expected: { min: 1, max: 100 } }, schema, collectSchemaErrors)).toEqual([]);
});

it.each(Object.entries(VISUAL_RELATION_RULES))('repairs all relationship bindings from the same %s rules that produce public guidance', (kind, rule) => {
  const relations = [{ id: 'joint', kind, part_ids: ['a', 'b'], status: 'fail',
    expected: 'The named parts must form a visible connected relationship.',
    visible: 'The exact AFTER shows a visible gap between both named parts.' }];
  const findings: any[] = [{ criterion: 'wrong', structural_defect: {
    id: 'joint', kind: 'wrong', part_ids: ['a'], relation_ids: [],
    visible: 'Evidence authored by the reviewer must survive mechanical corrections.',
  } }];
  let issues: FrameReviewValidationError['issues'] = [];
  try {
    validateReviewSections([{ key: 'critic', path: 'previous_observation.critic_review',
      validate: () => validateVisualRelationships(relations, { [rule.criterion]: 'fail' }, findings, {}) }]);
  } catch (error) {
    expect(error).toBeInstanceOf(FrameReviewValidationError);
    issues = (error as FrameReviewValidationError).issues;
  }
  expect(issues).toHaveLength(4);
  for (const issue of issues) {
    const key = issue.path.split('.').at(-1)!;
    const target = key === 'criterion' ? findings[0] : findings[0].structural_defect;
    // This choice represents the reviewer's observed defect, never automatic
    // invention of a visual judgment by production repair code.
    target[key] = issue.operator === 'one-of' ? (issue.expected as string[])[0] : issue.expected;
  }
  expect(() => validateVisualRelationships(relations, { [rule.criterion]: 'fail' }, findings, {})).not.toThrow();
  expect(findings[0].structural_defect.visible).toContain('Evidence authored by the reviewer');
  expect(VISUAL_RELATION_DEFECT_KIND_GUIDANCE).toContain(rule.criterion);
  for (const allowed of rule.structural_kinds) expect(VISUAL_RELATION_DEFECT_KIND_GUIDANCE).toContain(allowed);
});

it('does not fabricate a field or recommend blind retries for an unaddressable error', () => {
  const packet = fieldCorrectionPacket([{ scope: 'next_operation', code: 'unstructured_failure', message: 'Internal conflict.' }]);
  expect(packet.corrections[0]).toMatchObject({ path: null, path_source: 'unavailable' });
  expect(packet.unaddressable_count).toBe(1);
  expect(packet.next).toContain('Do not guess');
});
