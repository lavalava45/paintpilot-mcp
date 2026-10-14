import { describe, expect, it } from 'vitest';
import { collectCompactPhysicalStackViolations } from '../src/core/guard/compact-physical-stack.js';

const physicalSignatureRoles = new Set(['opaque-mass', 'support-surface', 'transmissive-surface']);
const owners = new Map<string, Record<string, unknown>>([
  ['wall', { hypothesis_id: 'wall', layer_id: 9 }],
  ['window', { hypothesis_id: 'window', layer_id: 12 }],
]);
type Input = Parameters<typeof collectCompactPhysicalStackViolations>[0];
const check = (overrides: Partial<Input> = {}) => collectCompactPhysicalStackViolations({
  paintingProfile: 'nontrivial_painting',
  hasCreateStep: true,
  hasLogicalLayer: true,
  logicalDecision: 'create-new',
  physicalRole: 'opaque-mass',
  opacityRole: 'opaque',
  physicalSignatureRoles,
  stage: 'SHAPE',
  stageRank: 2,
  logicalHypothesisId: 'foreground',
  depthRelations: [],
  ownerByHypothesis: owners,
  createArgs: {},
  owners: [],
  ...overrides,
});

describe('compact physical stack pre-dispatch extraction', () => {
  it('requires both physical roles for a new nontrivial semantic layer', () => {
    expect(check({ physicalRole: undefined, opacityRole: undefined })).toEqual([{
      scope: 'next_operation',
      code: 'physical_stack_metadata_required',
      message: 'physical_stack_metadata_required: every new semantic layer in a nontrivial painting must declare logical_layer.physical_role and opacity_role so opaque structure cannot silently become a transparent/effect layer',
    }]);
    expect(check({ hasCreateStep: false, physicalRole: undefined, opacityRole: undefined })).toEqual([]);
  });

  it('retains the late structural owner gate and exact stage-specific message', () => {
    expect(check({ stage: 'VALUE', stageRank: 3 })).toEqual([{
      scope: 'next_operation',
      code: 'physical_stack_structural_change_requires_shape',
      message: 'physical_stack_structural_change_requires_shape: new opaque-mass owner foreground cannot be introduced at VALUE; return to SHAPE with an explicit structural stage_reset, rebuild occlusion, then re-pass the physical stack gate',
    }]);
    expect(check({ stage: 'VALUE', stageRank: 3, physicalRole: 'effect' })).toEqual([]);
    expect(check({ stage: 'VALUE', stageRank: 3, logicalDecision: 'adjust' })).toEqual([]);
  });

  it('keeps missing target diagnostics ordered before other depth relations', () => {
    const violations = check({
      depthRelations: [
        { relation: 'behind', target_hypothesis_id: 'unknown' },
        { relation: 'in-front-of', target_hypothesis_id: 'wall' },
        { relation: 'behind' },
      ],
    });
    expect(violations).toEqual([
      { scope: 'next_operation', code: 'physical_stack_target_missing',
        message: 'physical_stack_target_missing: depth relation for foreground references semantic owner unknown which is not durably established' },
      { scope: 'next_operation', code: 'physical_stack_layer_order_mismatch',
        message: 'physical_stack_layer_order_mismatch: foreground is declared in-front-of wall; photoshop_create_layer must use above_layer_id=9' },
      { scope: 'next_operation', code: 'physical_stack_target_missing',
        message: 'physical_stack_target_missing: depth relation for foreground references semantic owner missing which is not durably established' },
    ]);
  });

  it('requires exact above/below layer ids for front and behind placement', () => {
    const depthRelations = [
      { relation: 'in-front-of', target_hypothesis_id: 'wall' },
      { relation: 'behind', target_hypothesis_id: 'window' },
    ];
    expect(check({ depthRelations, createArgs: { above_layer_id: 9, below_layer_id: 12 } })).toEqual([]);
    expect(check({ depthRelations, createArgs: { above_layer_id: 12, below_layer_id: 9 } }))
      .toEqual([
        { scope: 'next_operation', code: 'physical_stack_layer_order_mismatch',
          message: 'physical_stack_layer_order_mismatch: foreground is declared in-front-of wall; photoshop_create_layer must use above_layer_id=9' },
        { scope: 'next_operation', code: 'physical_stack_layer_order_mismatch',
          message: 'physical_stack_layer_order_mismatch: foreground is declared behind window; photoshop_create_layer must use below_layer_id=12' },
      ]);
  });

  it('keeps continuation without a create step free of placement checks, but still checks durable targets', () => {
    const depthRelations = [{ relation: 'in-front-of', target_hypothesis_id: 'wall' }];
    expect(check({ logicalDecision: 'adjust', hasCreateStep: false, depthRelations })).toEqual([]);
    expect(check({ logicalDecision: 'adjust', hasCreateStep: false,
      depthRelations: [{ relation: 'behind', target_hypothesis_id: 'unknown' }] }).map(v => v.code))
      .toEqual(['physical_stack_target_missing']);
  });

  it('preserves independent validation order when metadata and placement are both wrong', () => {
    expect(check({
      physicalRole: undefined,
      opacityRole: undefined,
      depthRelations: [{ relation: 'behind', target_hypothesis_id: 'wall' }],
    }).map(v => v.code)).toEqual(['physical_stack_metadata_required', 'physical_stack_layer_order_mismatch']);
    expect(check({
      paintingProfile: 'simple_graphic',
      physicalRole: undefined,
      opacityRole: undefined,
      depthRelations: [{ relation: 'behind', target_hypothesis_id: 'wall' }],
    }).map(v => v.code)).toEqual(['physical_stack_layer_order_mismatch']);
  });
  it('blocks committed refinement while durable temporary owners remain unresolved', () => {
    expect(check({ stage: 'MATERIAL', stageRank: 4, physicalRole: 'effect', owners: [
      { hypothesis_id: 'scaffold-a', temporary: true },
      { hypothesis_id: 'scaffold-b', temporary: true, rollback_value: 'medium' },
    ] })).toEqual([{
      scope: 'next_operation',
      code: 'semantic_layer_stage_gate',
      message: 'semantic_layer_stage_gate: committed MATERIAL refinement is blocked while temporary semantic owners remain unresolved: scaffold-a, scaffold-b',
    }]);
  });
  it('retains the exact low-rollback exemption and strict temporary boolean', () => {
    expect(check({ stage: 'MATERIAL', stageRank: 4, physicalRole: 'effect', owners: [
      { hypothesis_id: 'cheap', temporary: true, rollback_value: ' LOW ' },
      { hypothesis_id: 'independent', temporary: false },
      { hypothesis_id: 'string-flag', temporary: 'true' },
    ] })).toEqual([]);
  });
  it('does not block earlier stages or simple graphics', () => {
    const unresolved = [{ hypothesis_id: 'scaffold', temporary: true }];
    expect(check({ stage: 'VALUE', stageRank: 3, physicalRole: 'effect', owners: unresolved })).toEqual([]);
    expect(check({ stage: 'MATERIAL', stageRank: 4, physicalRole: 'effect', paintingProfile: 'simple_graphic', owners: unresolved })).toEqual([]);
  });
  it('appends temporary-owner stage gate after depth errors without reordering', () => {
    expect(check({ stage: 'MATERIAL', stageRank: 4, physicalRole: 'effect',
      owners: [{ hypothesis_id: 'scaffold', temporary: true }],
      depthRelations: [{ relation: 'behind', target_hypothesis_id: 'missing' }],
    }).map(v => v.code)).toEqual(['physical_stack_target_missing', 'semantic_layer_stage_gate']);
  });
});
