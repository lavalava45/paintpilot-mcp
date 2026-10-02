import { describe, expect, it } from 'vitest';
import {
  normalizeToolResultForPlaceholders,
  parseVisualMicroPlan,
  resolveVisualMicroPlanArgs,
} from '../src/core/visual-microplan.js';
import { ToolRegistry, type ToolDefinition } from '../src/core/tool-registry.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';
import {
  currentStableCommandId,
  withToolExecutionContext,
} from '../src/core/execution-context.js';

function basePlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    plan_id: 'p1',
    summary: 'Refine one tower plane',
    stage: 'MEDIUM_FORM',
    scale: 'medium',
    region: 'tower-upper',
    intent: 'reinforce planar volume',
    method_class: 'paint',
    risk: 'low',
    expected_visual_delta: 'The upper tower plane becomes more coherent without changing adjacent regions.',
    verification_envelope: { mode: 'after_only' },
    layer_separation_check: {
      change_kind: 'continuation',
      substantial: true,
      rollback_value: 'low',
      independent_adjustment_expected: false,
      reasons: ['Continue refining the same existing tower form; no independent rollback unit is needed.'],
    },
    action_class: 'REFINE',
    expected_visual_result: 'The upper tower reads as a cleaner planar form.',
    protected_regions: ['lantern', 'sky silhouette'],
    document_id: 42,
    steps: [
      {
        id: 'paint',
        tool: 'photoshop_paint_dabs',
        args: { dabs: [{ x: 10, y: 20 }] },
      },
      {
        id: 'preview',
        tool: 'photoshop_get_preview',
        args: { max_dimension_px: 800 },
      },
    ],
    ...overrides,
  };
}

function materialResponsePlan(): Record<string, unknown> {
  const required = (intent: string) => ({ applicability: 'required', intent });
  const notApplicable = (intent: string) => ({ applicability: 'not-applicable', intent });
  return {
    response_role: 'base-material',
    components: {
      base_response: required('Establish the base color/value family before texture.'),
      form_light_response: required('Keep material light and shadow causally aligned to form.'),
      specular_reflection: required('Establish the intended qualitative highlight/reflection character.'),
      transmission: notApplicable('This fixture represents an opaque material with no transmission.'),
      surface_condition: notApplicable('No separate surface-condition overlay is intended in this pass.'),
      variation_scale: required('Keep variation at broad and medium scale before microtexture.'),
      edge_contact: required('Preserve material contact and neighbouring-form edge interaction.'),
    },
    microtexture: {
      policy: 'deferred',
      intent: 'Microtexture is deferred until larger material response components read coherently.',
    },
  };
}

describe('parseVisualMicroPlan', () => {
  it('parses JSON tool payloads that carry a native connector identity footer', () => {
    const payload = {
      ok: true,
      details: { documents: [{ id: 42, width: 100, height: 100 }] },
    };
    const normalized = normalizeToolResultForPlaceholders({
      content: [{
        type: 'text',
        text: `${JSON.stringify(payload)}\n\n--- Identity notice ---\nconnector metadata`,
      }],
    });
    expect(normalized).toEqual(payload);
  });

  it('requires qualitative material-response planning before MATERIAL execution', () => {
    expect(() => parseVisualMicroPlan(basePlan({ stage: 'MATERIAL' })))
      .toThrow(/MATERIAL VisualMicroPlan requires material_response decomposition/i);

    const parsed = parseVisualMicroPlan(basePlan({
      stage: 'MATERIAL',
      material_response: materialResponsePlan(),
    }));
    expect(parsed.materialResponse?.responseRole).toBe('base-material');
    expect(parsed.materialResponse?.microtexture.policy).toBe('deferred');
  });

  it('accepts preparation + one mutation + final preview', () => {
    const parsed = parseVisualMicroPlan(
      basePlan({
        steps: [
          { id: 'select', tool: 'photoshop_select_brush_preset', args: { name: 'Hard Round' } },
          { id: 'settings', tool: 'photoshop_get_brush_settings', args: {} },
          { id: 'paint', tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] } },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      })
    );
    expect(parsed.mutationIndex).toBe(2);
    expect(parsed.captureIndex).toBe(3);
  });

  it('preserves relation-aware Planner/Painter context through the executable micro-plan', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      planner_directive_id: 'directive-1',
      planner_task_id: 'task-1',
      painter_scope: 'local',
      change_domains: ['local-shape'],
      affected_relations: ['green mass remains left of the focal accent'],
      affected_qualities: ['clean white negative space'],
      preservation_facts: ['the focal accent layer is excluded from this pass'],
      independent_region: true,
      addresses_primary_mismatch: false,
      addresses_problem_id: 'problem-green-mass',
    }));

    expect(parsed.affectedRelations).toEqual(['green mass remains left of the focal accent']);
    expect(parsed.affectedQualities).toEqual(['clean white negative space']);
    expect(parsed.preservationFacts).toEqual(['the focal accent layer is excluded from this pass']);
    expect(parsed.independentRegion).toBe(true);
    expect(parsed.addressesPrimaryMismatch).toBe(false);
    expect(parsed.addressesProblemId).toBe('problem-green-mass');
  });

  it('accepts paint_regions as the single visual mutation', () => {
    const parsed = parseVisualMicroPlan(
      basePlan({
        stage: 'RECOGNITION_BLOCK_IN',
        scale: 'global',
        method_class: 'region',
        recognition_features: ['outer silhouette', 'light face mass', 'beak/feature wedge'],
        steps: [
          {
            id: 'masses',
            tool: 'photoshop_paint_regions',
            args: {
              regions: [
                {
                  color: { red: 20, green: 20, blue: 20 },
                  contours: [{ points: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 10, y: 20 }] }],
                },
              ],
            },
          },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      })
    );
    expect(parsed.mutationIndex).toBe(0);
    expect(parsed.recognitionFeatures).toHaveLength(3);
  });

  it('requires recognition block-in to be global and declare 3-7 recognition features', () => {
    expect(() =>
      parseVisualMicroPlan(basePlan({ stage: 'RECOGNITION_BLOCK_IN', scale: 'medium' }))
    ).toThrow(/scale=global/);

    expect(() =>
      parseVisualMicroPlan(basePlan({
        stage: 'RECOGNITION_BLOCK_IN',
        scale: 'global',
        recognition_features: ['silhouette', 'face'],
      }))
    ).toThrow(/3-7 recognition_features/);
  });

  it('validates protected layer ids and explicit replacement exceptions', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      action_class: 'REPLACE',
      protected_layer_ids: [11, 22],
      replace_protected_layer_ids: [22],
    }));
    expect(parsed.protectedLayerIds).toEqual([11, 22]);
    expect(parsed.replaceProtectedLayerIds).toEqual([22]);

    expect(() => parseVisualMicroPlan(basePlan({ protected_layer_ids: [11, 11] }))).toThrow(/duplicate/);
    expect(() => parseVisualMicroPlan(basePlan({
      action_class: 'REPLACE',
      protected_layer_ids: [11],
      replace_protected_layer_ids: [22],
    }))).toThrow(/also declared/);
    expect(() => parseVisualMicroPlan(basePlan({
      protected_layer_ids: [11],
      replace_protected_layer_ids: [11],
    }))).toThrow(/REPLACE or ERASE/);
  });

  it('binds a new logical layer to exactly one reversible artistic hypothesis', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-material',
        substantial: true,
        rollback_value: 'high',
        independent_adjustment_expected: true,
        reasons: ['The cheek-volume pass may need independent weakening or rollback.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'cheek-volume',
        hypothesis: 'A separate cheek-volume pass should improve form without changing the eye socket.',
        rollback_value: 'high',
        expected_independent_rollback: true,
        separation_reasons: ['semantically separate correction', 'high rollback value'],
        layer_name: 'Cheek volume',
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Cheek volume' } },
        {
          id: 'paint',
          tool: 'photoshop_paint_dabs',
          args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.logicalLayer?.decision).toBe('create-new');
    expect(parsed.logicalLayer?.createStepId).toBe('layer');
    expect(parsed.logicalLayer?.hypothesisId).toBe('cheek-volume');
  });

  it('carries physical opacity/depth semantics on logical layers without inventing scene-specific materials', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-object',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['The foreground mass owns an independent occlusion relationship.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'foreground-house',
        hypothesis: 'The foreground house is an opaque scene mass in front of the rear house.',
        rollback_value: 'moderate',
        expected_independent_rollback: true,
        separation_reasons: ['Independent silhouette and depth correction.'],
        layer_name: 'Foreground house',
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
        depth_relations: [{ relation: 'in-front-of', target_hypothesis_id: 'rear-house' }],
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Foreground house' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.logicalLayer).toMatchObject({
      physicalRole: 'opaque-mass',
      opacityRole: 'opaque',
      depthRelations: [{ relation: 'in-front-of', targetHypothesisId: 'rear-house' }],
    });
  });

  it('keeps transparent/optical owners explicit and rejects physically contradictory opacity roles', () => {
    const optical = parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-light',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['Glow is an independently adjustable optical effect.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'window-glow',
        hypothesis: 'Warm window glow remains an optical overlay, not structural mass.',
        rollback_value: 'moderate',
        expected_independent_rollback: true,
        separation_reasons: ['Independent optical correction.'],
        layer_name: 'Window glow',
        physical_role: 'optical-effect',
        opacity_role: 'transparent-overlay',
        depth_relations: [],
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Window glow' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(optical.logicalLayer).toMatchObject({
      physicalRole: 'optical-effect',
      opacityRole: 'transparent-overlay',
    });

    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-object',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['Opaque object should not become a transparent overlay.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'bad-roof',
        hypothesis: 'Invalid transparent structural roof.',
        rollback_value: 'moderate',
        expected_independent_rollback: true,
        separation_reasons: ['Test contradictory physical metadata.'],
        layer_name: 'Bad roof',
        physical_role: 'opaque-mass',
        opacity_role: 'transparent-overlay',
        depth_relations: [],
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Bad roof' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/requires opacity_role=opaque/i);
  });

  it('preserves construction role separately from mechanism and enforces physical-role authority', () => {
    const veil = parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'optical-veil',
        material_role: 'aerial depth overlay',
        visual_intent: 'atmospheric-mass',
        pressure_policy: 'none',
      },
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'distance-veil',
        hypothesis: 'Transparent depth veil over established structure.',
        rollback_value: 'low',
        expected_independent_rollback: false,
        separation_reasons: ['Continue the existing depth veil.'],
        layer_id: 9,
        physical_role: 'atmosphere',
        opacity_role: 'transparent-overlay',
        depth_relations: [],
      },
      steps: [
        { id: 'paint', tool: 'photoshop_paint_strokes', args: { layer_id: 9, strokes: [{ points: [{ x: 10, y: 20 }, { x: 14, y: 20 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(veil.paintStrategy).toMatchObject({ constructionRole: 'optical-veil', visualIntent: 'atmospheric-mass' });

    expect(() => parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'optical-veil', material_role: 'wall', visual_intent: 'atmospheric-mass', pressure_policy: 'none',
      },
      logical_layer: {
        decision: 'continue-logical-layer', hypothesis_id: 'wall', hypothesis: 'Opaque wall mass', rollback_value: 'low',
        expected_independent_rollback: false, separation_reasons: ['Continue wall.'], layer_id: 9,
        physical_role: 'opaque-mass', opacity_role: 'opaque', depth_relations: [],
      },
      steps: [
        { id: 'paint', tool: 'photoshop_paint_strokes', args: { layer_id: 9, strokes: [{ points: [{ x: 10, y: 20 }, { x: 14, y: 20 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/optical-veil cannot replace opaque\/form-bearing/i);

    expect(() => parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'volumetric-soft-mass', material_role: 'smoke body', visual_intent: 'soft-transition', pressure_policy: 'none',
      },
    }))).toThrow(/volumetric-soft-mass requires a form-bearing/i);
  });

  it('requires construction-role classification for broad soft/environmental passes', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      scale: 'global',
      paint_strategy: {
        material_role: 'mist over established forms',
        visual_intent: 'soft-transition',
        pressure_policy: 'none',
      },
    }))).toThrow(/requires paint_strategy\.construction_role classification/i);
  });

  it('keeps continuous-field on continuous-color-field unless fallback is explicit', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'continuous-field',
        material_role: 'broad sky value field',
        visual_intent: 'continuous-field',
        pressure_policy: 'none',
      },
    }))).toThrow(/defaults to method_id=continuous-color-field/i);

    const parsed = parseVisualMicroPlan(basePlan({
      method_class: 'gradient',
      paint_strategy: {
        construction_role: 'continuous-field',
        material_role: 'broad sky value field',
        visual_intent: 'continuous-field',
        pressure_policy: 'none',
      },
      steps: [
        { id: 'field', tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field', args: {} },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.paintStrategy?.constructionRole).toBe('continuous-field');
  });

  it('blocks silent optical-veil fallback to the legacy soft dab-chain', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'optical-veil',
        material_role: 'aerial haze veil',
        visual_intent: 'soft-transition',
        pressure_policy: 'none',
      },
    }))).toThrow(/cannot silently degrade to Soft Round\/soft-brush dab-chain/i);

    const parsed = parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'optical-veil',
        material_role: 'aerial haze veil',
        visual_intent: 'soft-transition',
        fallback_from_method_id: 'gradient-mask',
        pressure_policy: 'none',
      },
    }));
    expect(parsed.paintStrategy).toMatchObject({
      constructionRole: 'optical-veil',
      fallbackFromMethodId: 'gradient-mask',
    });
  });

  it('treats fallback prose as optional guidance while retaining executable fallback identity', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'optical-veil',
        material_role: 'aerial haze veil',
        visual_intent: 'soft-transition',
        fallback_from_method_id: 'gradient-mask',
        pressure_policy: 'none',
      },
    }));
    expect(parsed.paintStrategy).toMatchObject({
      constructionRole: 'optical-veil',
      fallbackFromMethodId: 'gradient-mask',
    });
    expect(parsed.paintStrategy?.fallbackReason).toBeUndefined();

    expect(() => parseVisualMicroPlan(basePlan({
      paint_strategy: {
        construction_role: 'optical-veil',
        material_role: 'aerial haze veil',
        visual_intent: 'soft-transition',
        fallback_reason: 'audit guidance without executable fallback identity',
        pressure_policy: 'none',
      },
    }))).toThrow(/fallback_reason requires fallback_from_method_id/i);
  });

  it('uses the same construction-tier contract across tree, architecture, and water domains', () => {
    for (const fixture of [
      { owner: 'crown-clusters', parent: 'tree-mass' },
      { owner: 'facade-openings', parent: 'building-mass' },
      { owner: 'wave-groups', parent: 'water-plane' },
    ]) {
      const parsed = parseVisualMicroPlan(basePlan({
        layer_separation_check: {
          change_kind: 'new-object', substantial: true, rollback_value: 'moderate',
          independent_adjustment_expected: true, reasons: ['Dependent structure remains independently correctable.'],
        },
        logical_layer: {
          decision: 'create-new', hypothesis_id: fixture.owner, hypothesis: `Dependent structure ${fixture.owner}`,
          rollback_value: 'moderate', expected_independent_rollback: true,
          separation_reasons: ['Keep dependent construction reversible.'], layer_name: fixture.owner,
          construction_tier: 'secondary', parent_hypothesis_id: fixture.parent,
        },
        steps: [
          { id: 'layer', tool: 'photoshop_create_layer', args: { name: fixture.owner } },
          { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      }));
      expect(parsed.logicalLayer).toMatchObject({
        constructionTier: 'secondary', parentHypothesisId: fixture.parent,
      });
    }
  });

  it('parses bounded surface frames while preserving local stylistic exceptions', () => {
    for (const fixture of [
      { owner: 'water-plane', axes: [{ id: 'ripple-flow', angle_degrees: 8 }], distribution: 'directional' },
      { owner: 'facade-plane', axes: [{ id: 'courses', angle_degrees: 0 }, { id: 'verticals', angle_degrees: 90 }], distribution: 'perspective-regular', convergence_anchor: { x: 1200, y: 180 } },
      { owner: 'fabric-plane', axes: [{ id: 'fold-flow', angle_degrees: 62, weight: 0.8 }], distribution: 'free' },
    ]) {
      const parsed = parseVisualMicroPlan(basePlan({
        logical_layer: {
          decision: 'continue-logical-layer', hypothesis_id: fixture.owner, hypothesis: fixture.owner,
          rollback_value: 'low', expected_independent_rollback: false, separation_reasons: ['Continue surface.'],
          layer_id: 9, surface_frame: {
            axes: fixture.axes, distribution: fixture.distribution,
            ...(fixture.convergence_anchor ? { convergence_anchor: fixture.convergence_anchor } : {}),
            local_exceptions: ['Allow one local turn where the depicted surface bends.'],
          },
        },
        steps: [
          { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 9, dabs: [{ x: 10, y: 20 }] } },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      }));
      expect(parsed.logicalLayer?.surfaceFrame?.axes.length).toBe(fixture.axes.length);
      expect(parsed.logicalLayer?.surfaceFrame?.localExceptions).toHaveLength(1);
    }
    expect(() => parseVisualMicroPlan(basePlan({
      logical_layer: {
        decision: 'continue-logical-layer', hypothesis_id: 'tiles', hypothesis: 'tiles',
        rollback_value: 'low', expected_independent_rollback: false, separation_reasons: ['Continue tiles.'],
        layer_id: 9, surface_frame: {
          axes: [{ id: 'rows', angle_degrees: 0 }], distribution: 'perspective-regular',
        },
      },
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 9, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/perspective-regular.*convergence_anchor/i);
  });

  it('requires structural evidence for aperture/negative-space topology', () => {
    const logical = {
      decision: 'continue-logical-layer', hypothesis_id: 'arch-opening', hypothesis: 'Arch opening',
      rollback_value: 'low', expected_independent_rollback: false, separation_reasons: ['Preserve the opening.'],
      layer_id: 9, construction_tier: 'tertiary', parent_hypothesis_id: 'wall-mass',
      negative_space: {
        relation: 'aperture-of', parent_hypothesis_id: 'wall-mass',
        topology: 'One through-opening bounded by the arch and side reveals.',
        evidence: ['Reveal edges and silhouette continuity establish a structural void.'],
      },
    };
    const parsed = parseVisualMicroPlan(basePlan({ logical_layer: logical, steps: [
      { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 9, dabs: [{ x: 10, y: 20 }] } },
      { id: 'preview', tool: 'photoshop_get_preview', args: {} },
    ] }));
    expect(parsed.logicalLayer?.negativeSpace).toMatchObject({ relation: 'aperture-of', parentHypothesisId: 'wall-mass' });

    expect(() => parseVisualMicroPlan(basePlan({ logical_layer: {
      ...logical, negative_space: { ...logical.negative_space, evidence: ['Sampled background color matches the sky.'] },
    }, steps: [
      { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 9, dabs: [{ x: 10, y: 20 }] } },
      { id: 'preview', tool: 'photoshop_get_preview', args: {} },
    ] }))).toThrow(/background-color sampling alone is insufficient/i);
  });

  it('parses causal effects and requires a receiver for reflection/shadow', () => {
    const base = {
      decision: 'continue-logical-layer', hypothesis_id: 'water-reflection', hypothesis: 'Building reflection on water',
      rollback_value: 'low', expected_independent_rollback: false, separation_reasons: ['Continue the independently established effect.'], layer_id: 9,
      physical_role: 'surface-condition', opacity_role: 'effect-only',
      causal_effect: {
        relation: 'reflection_of', source_hypothesis_id: 'building', receiver_hypothesis_id: 'water-plane',
        causal_statement: 'The reflected mass derives from the building and is transformed by the water surface.',
        evidence: ['Reflection placement remains registered below the source and follows the receiving water plane.'],
      },
    };
    const withSteps = (logical_layer: Record<string, unknown>) => basePlan({ logical_layer, steps: [
      { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 9, dabs: [{ x: 10, y: 20 }] } },
      { id: 'preview', tool: 'photoshop_get_preview', args: {} },
    ] });
    const parsed = parseVisualMicroPlan(withSteps(base));
    expect(parsed.logicalLayer?.causalEffect).toMatchObject({
      relation: 'reflection_of', sourceHypothesisId: 'building', receiverHypothesisId: 'water-plane',
    });
    expect(() => parseVisualMicroPlan(withSteps({
      ...base, causal_effect: { ...base.causal_effect, receiver_hypothesis_id: undefined },
    }))).toThrow(/reflection_of requires receiver_hypothesis_id/i);
  });

  it('rejects self-referential or unclassified physical depth relations', () => {
    const logical = {
      decision: 'create-new',
      hypothesis_id: 'house',
      hypothesis: 'House stack owner.',
      rollback_value: 'moderate',
      expected_independent_rollback: true,
      separation_reasons: ['Test physical relation validation.'],
      layer_name: 'House',
    };
    const separation = {
      change_kind: 'new-object',
      substantial: true,
      rollback_value: 'moderate',
      independent_adjustment_expected: true,
      reasons: ['House is independently editable.'],
    };
    const steps = [
      { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'House' } },
      { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
      { id: 'preview', tool: 'photoshop_get_preview', args: {} },
    ];
    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: separation,
      logical_layer: {
        ...logical,
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
        depth_relations: [{ relation: 'behind', target_hypothesis_id: 'house' }],
      },
      steps,
    }))).toThrow(/cannot target the same hypothesis_id/i);
    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: separation,
      logical_layer: {
        ...logical,
        depth_relations: [{ relation: 'behind', target_hypothesis_id: 'other-house' }],
      },
      steps,
    }))).toThrow(/requires physical_role and opacity_role/i);
  });

  it('requires Layer Separation Check isolation for substantial independent new concerns', () => {
    for (const changeKind of ['new-object', 'new-material', 'new-light', 'new-plane']) {
      expect(() => parseVisualMicroPlan(basePlan({
        layer_separation_check: {
          change_kind: changeKind,
          substantial: true,
          rollback_value: 'moderate',
          independent_adjustment_expected: true,
          reasons: ['This new concern may need independent correction later.'],
        },
      }))).toThrow(/Layer Separation Check.*create-new or temporary-hypothesis/);
    }
  });

  it('accepts a Layer Separation Check when the required independent concern is isolated', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-object',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['The object silhouette may need independent transform and rollback.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'new-object',
        hypothesis: 'Keep the new object independently editable.',
        rollback_value: 'moderate',
        expected_independent_rollback: true,
        separation_reasons: ['independent silhouette and transform'],
        layer_name: 'New object',
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'New object' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.layerSeparationCheck.requiresIsolation).toBe(true);
    expect(parsed.logicalLayer?.decision).toBe('create-new');
  });

  it('does not require narrative separation reasons when structured isolation semantics are complete', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-object',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'structured-owner',
        hypothesis: 'Independent semantic owner.',
        rollback_value: 'moderate',
        expected_independent_rollback: true,
        layer_name: 'Structured owner',
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Structured owner' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.layerSeparationCheck.requiresIsolation).toBe(true);
    expect(parsed.logicalLayer?.separationReasons).toEqual([]);
  });

  it('does not force a new layer for low-value continuation or a tiny accent', () => {
    const continuation = parseVisualMicroPlan(basePlan());
    expect(continuation.layerSeparationCheck.requiresIsolation).toBe(false);
    expect(continuation.logicalLayer).toBeUndefined();

    const tinyAccent = parseVisualMicroPlan(basePlan({
      scale: 'micro',
      significance_mode: 'subtle_local',
      problem_id: 'tiny-accent',
      verification_envelope: { mode: 'before_after', min_focus_dimension_px: 800 },
      layer_separation_check: {
        change_kind: 'other',
        substantial: false,
        rollback_value: 'low',
        independent_adjustment_expected: false,
        reasons: ['A tiny accent belongs to the existing surface and has negligible rollback value.'],
      },
      steps: [
        { id: 'before', tool: 'photoshop_get_preview', args: { focus_region: { left: 0, top: 0, right: 900, bottom: 900 } } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: { focus_region: { left: 0, top: 0, right: 900, bottom: 900 } } },
      ],
    }));
    expect(tinyAccent.layerSeparationCheck.requiresIsolation).toBe(false);
  });

  it('keeps structural layer-separation authority without requiring prose reasons', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'continuation',
        substantial: true,
        rollback_value: 'low',
        independent_adjustment_expected: false,
      },
    }));
    expect(parsed.layerSeparationCheck).toMatchObject({
      changeKind: 'continuation',
      substantial: true,
      rollbackValue: 'low',
      independentAdjustmentExpected: false,
      requiresIsolation: false,
      reasons: [],
    });

    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-light',
        substantial: true,
        rollback_value: 'high',
        independent_adjustment_expected: true,
      },
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'old-light-without-prose',
        hypothesis: 'Continue an existing light layer.',
        rollback_value: 'high',
        expected_independent_rollback: true,
        separation_reasons: [],
        layer_id: 77,
      },
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/Layer Separation Check.*create-new or temporary-hypothesis/);
  });

  it('rejects a required isolation that merely continues an existing layer', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-light',
        substantial: true,
        rollback_value: 'high',
        independent_adjustment_expected: true,
        reasons: ['The new light effect must remain independently adjustable.'],
      },
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'old-light',
        hypothesis: 'Continue an existing light layer.',
        rollback_value: 'high',
        expected_independent_rollback: true,
        separation_reasons: [],
        layer_id: 77,
      },
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/Layer Separation Check.*create-new or temporary-hypothesis/);
  });

  it('keeps Layer Separation Check rollback value consistent with logical layer metadata', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-object',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['The object should be independently correctable.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'mismatch',
        hypothesis: 'Mismatched rollback metadata should fail.',
        rollback_value: 'high',
        expected_independent_rollback: true,
        separation_reasons: ['independent object'],
        layer_name: 'Mismatch',
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Mismatch' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.layer.details.layerId', dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/rollback_value must match/);
  });

  it('continues an existing logical layer without creating another layer', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'continuation',
        substantial: true,
        rollback_value: 'high',
        independent_adjustment_expected: true,
        reasons: ['Continue the existing independently reversible cheek-volume layer.'],
      },
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'cheek-volume',
        hypothesis: 'Continue the already accepted cheek-volume rollback unit.',
        rollback_value: 'high',
        expected_independent_rollback: true,
        separation_reasons: [],
        layer_id: 77,
      },
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.logicalLayer?.layerId).toBe(77);

    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'continuation',
        substantial: true,
        rollback_value: 'high',
        independent_adjustment_expected: true,
        reasons: ['Continue the existing independently reversible cheek-volume layer.'],
      },
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'cheek-volume',
        hypothesis: 'Continue cheek volume.',
        rollback_value: 'high',
        expected_independent_rollback: true,
        separation_reasons: [],
        layer_id: 77,
      },
      steps: [
        { id: 'extra', tool: 'photoshop_create_layer', args: { name: 'Unnecessary' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/anti-layer-explosion/);
  });

  it('rejects layer-per-stroke explosion and cross-layer mutations inside one hypothesis', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-material',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['Texture is independently reversible but should remain one logical layer.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'skin-texture',
        hypothesis: 'Texture should be independently reversible.',
        rollback_value: 'moderate',
        expected_independent_rollback: true,
        separation_reasons: ['temporary texture hypothesis'],
        layer_name: 'Skin texture',
      },
      steps: [
        { id: 'l1', tool: 'photoshop_create_layer', args: { name: 'Skin texture' } },
        { id: 'l2', tool: 'photoshop_create_layer', args: { name: 'Stroke 2' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: '$steps.l1.details.layerId', dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/exactly one photoshop_create_layer/);

    expect(() => parseVisualMicroPlan(basePlan({
      layer_separation_check: {
        change_kind: 'new-material',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
        reasons: ['Texture is independently reversible but should remain one logical layer.'],
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'skin-texture',
        hypothesis: 'Texture should be independently reversible.',
        rollback_value: 'moderate',
        expected_independent_rollback: true,
        separation_reasons: ['temporary texture hypothesis'],
        layer_name: 'Skin texture',
      },
      steps: [
        { id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Skin texture' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 99, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/must target \$steps\.layer\.details\.layerId/);
  });

  it('keeps keep/discard/merge as explicit layer lifecycle decisions outside paint microplans', () => {
    for (const decision of ['keep', 'discard', 'merge']) {
      expect(() => parseVisualMicroPlan(basePlan({
        layer_separation_check: {
          change_kind: 'continuation',
          substantial: true,
          rollback_value: 'high',
          independent_adjustment_expected: true,
          reasons: ['Lifecycle operation refers to the existing high-value cheek-volume layer.'],
        },
        logical_layer: {
          decision,
          hypothesis_id: 'cheek-volume',
          hypothesis: 'Cheek volume lifecycle decision.',
          rollback_value: 'high',
          expected_independent_rollback: true,
          separation_reasons: [],
          layer_id: 77,
          ...(decision === 'merge' ? { merge_target_layer_id: 55 } : {}),
        },
      }))).toThrow(/lifecycle decision/);
    }
  });

  it('rejects zero visual mutations but accepts a bounded related mutation bundle', () => {
    expect(() =>
      parseVisualMicroPlan(
        basePlan({
          steps: [
            { id: 'state', tool: 'photoshop_get_state', args: {} },
            { id: 'preview', tool: 'photoshop_get_preview', args: {} },
          ],
        })
      )
    ).toThrow(/requires 1-8 visual mutations/);

    const parsed = parseVisualMicroPlan(
      basePlan({
        steps: [
          { id: 'p1', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
          { id: 'p2', tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] } },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      })
    );
    expect(parsed.mutationIndexes).toEqual([0, 1]);
    expect(parsed.lastMutationIndex).toBe(1);
  });

  it('derives an adaptive mutation budget from risk, scale, destructive intent, and protection', () => {
    const lowRisk = parseVisualMicroPlan(basePlan({
      scale: 'medium',
      risk: 'low',
      steps: [
        ...[1, 2, 3, 4, 5].map(index => ({
          id: `paint-${index}`,
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 10 * index, y: 10 * index }] },
        })),
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(lowRisk.mutationIndexes).toHaveLength(5);
    expect(lowRisk.mutationBudget).toMatchObject({ allowedMutations: 6, hardCap: 8 });

    expect(() => parseVisualMicroPlan(basePlan({
      scale: 'medium',
      risk: 'low',
      steps: [
        ...[1, 2, 3, 4, 5, 6, 7].map(index => ({
          id: `paint-${index}`,
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 10 * index, y: 10 * index }] },
        })),
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/mutation budget exceeded: requested=7 allowed=6/);

    expect(() => parseVisualMicroPlan(basePlan({
      risk: 'high',
      steps: [
        { id: 'paint-a', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 10, y: 10 }] } },
        { id: 'paint-b', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/mutation budget exceeded: requested=2 allowed=1/);

    const protectedReplacement = parseVisualMicroPlan(basePlan({
      scale: 'medium',
      risk: 'low',
      protected_layer_ids: [77],
      replace_protected_layer_ids: [77],
      action_class: 'REPLACE',
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 10 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(protectedReplacement.mutationBudget.allowedMutations).toBe(1);
  });

  it('forbids batching across region, method class, or hidden higher risk while step prose stays explanatory', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      steps: [
        { id: 'p1', tool: 'photoshop_paint_dabs', region: 'other-region', args: { dabs: [{ x: 1, y: 1 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/region must match/);

    const withDifferentStepDescription = parseVisualMicroPlan(basePlan({
      steps: [
        { id: 'p1', tool: 'photoshop_paint_dabs', description: 'Use a broader gesture here', args: { dabs: [{ x: 1, y: 1 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(withDifferentStepDescription.steps[0]!.description).toBe('Use a broader gesture here');

    expect(() => parseVisualMicroPlan(basePlan({
      steps: [
        { id: 'fill', tool: 'photoshop_fill_layer', args: {} },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/method class is incompatible/);

    expect(() => parseVisualMicroPlan(basePlan({
      risk: 'low',
      steps: [
        { id: 'p1', tool: 'photoshop_paint_dabs', risk: 'high', args: { dabs: [{ x: 1, y: 1 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/cannot be hidden/);
  });

  it('supports executable Pencil, Smudge, Eraser and region method classes', () => {
    for (const [methodClass, strokeTool] of [
      ['line', 'PENCIL'],
      ['smudge', 'SMUDGE'],
      ['erase', 'ERASER'],
    ] as const) {
      const parsed = parseVisualMicroPlan(basePlan({
        method_class: methodClass,
        steps: [
          {
            id: 'stroke',
            tool: 'photoshop_paint_strokes',
            args: { strokes: [{ tool: strokeTool, points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }] },
          },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      }));
      expect(parsed.methodClass).toBe(methodClass);
    }

    const region = parseVisualMicroPlan(basePlan({
      stage: 'SHAPE',
      method_class: 'region',
      steps: [
        {
          id: 'mass',
          tool: 'photoshop_paint_regions',
          args: {
            regions: [{
              color: { red: 1, green: 2, blue: 3 },
              contours: [{ points: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 10, y: 20 }] }],
            }],
          },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(region.methodClass).toBe('region');
  });

  it('rejects method classes that do not match the actual stroke mechanism', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      method_class: 'line',
      steps: [
        { id: 'stroke', tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/method class is incompatible/);

    expect(() => parseVisualMicroPlan(basePlan({
      method_class: 'line',
      steps: [
        {
          id: 'mixed',
          tool: 'photoshop_paint_strokes',
          args: { strokes: [
            { tool: 'PENCIL', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
            { tool: 'SMUDGE', points: [{ x: 3, y: 3 }, { x: 4, y: 4 }] },
          ] },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/method class is incompatible/);
  });

  it('allows preset-brush only after explicit preset selection', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Media Test' } },
        { id: 'stroke', tool: 'photoshop_paint_strokes', method_id: 'installed-brush-preset', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/requires paint_strategy/);

    const parsed = parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      paint_strategy: {
        material_role: 'terrain',
        visual_intent: 'broken-mass',
        brush_role: 'broken-terrain',
        preset_name: 'Dry Media Test',
        pressure_policy: 'native-preset',
      },
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Media Test' } },
        { id: 'stroke', tool: 'photoshop_paint_strokes', method_id: 'installed-brush-preset', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.methodClass).toBe('preset-brush');

    expect(() => parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      paint_strategy: {
        material_role: 'terrain',
        visual_intent: 'broken-mass',
        brush_role: 'broken-terrain',
        preset_name: 'Dry Media Test',
        pressure_policy: 'native-preset',
      },
      steps: [
        { id: 'stroke', tool: 'photoshop_paint_strokes', method_id: 'installed-brush-preset', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/preset_name must match/);

    expect(() => parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      paint_strategy: {
        material_role: 'terrain',
        visual_intent: 'broken-mass',
        brush_role: 'broken-terrain',
        preset_name: 'Dry Media Test',
        pressure_policy: 'native-preset',
      },
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Dry Media Test' } },
        { id: 'stroke', tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/must declare method_id/);
  });

  it('keeps stamp profile identity separate from media brush roles', () => {
    const parsed = parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      paint_strategy: {
        material_role: 'foliage support',
        visual_intent: 'texture',
        preset_name: 'Leaf Stamp',
        brush_pack_id: 'brush-pack-sha256:test-pack',
        stamp_profile_id: 'stamp-profile-sha256:leaf',
        pressure_policy: 'native-preset',
      },
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Leaf Stamp' } },
        {
          id: 'stamp', tool: 'photoshop_paint_stamp_instances', method_id: 'installed-brush-preset',
          args: {
            brush_pack_id: 'brush-pack-sha256:test-pack', stamp_profile_id: 'stamp-profile-sha256:leaf',
            preset_name: 'Leaf Stamp', instances: [{ instance_id: 'leaf-1', x: 20, y: 20, size: 30 }],
          },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.paintStrategy?.brushRole).toBeUndefined();
    expect(parsed.paintStrategy?.brushPackId).toBe('brush-pack-sha256:test-pack');
    expect(parsed.paintStrategy?.stampProfileId).toBe('stamp-profile-sha256:leaf');
  });

  it('rejects paint_regions after block-in stages instead of allowing polygon refinement', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      stage: 'MEDIUM_FORM',
      method_class: 'region',
      steps: [
        {
          id: 'mass',
          tool: 'photoshop_paint_regions',
          args: {
            regions: [{
              color: { red: 1, green: 2, blue: 3 },
              contours: [{ points: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 10, y: 20 }] }],
            }],
          },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/outside block-in stages.*REPLACE\/ERASE/);
  });

  it('requires declared simulated pressure to be present in the actual brush strokes', () => {
    const strategy = {
      material_role: 'water',
      visual_intent: 'surface-flow',
      brush_role: 'water-flow',
      preset_name: 'Water Brush',
      pressure_policy: 'simulated-size-opacity',
    };
    expect(() => parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      paint_strategy: strategy,
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Water Brush' } },
        {
          id: 'stroke',
          tool: 'photoshop_paint_strokes',
          method_id: 'installed-brush-preset',
          args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 20, y: 20 }] }] },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/simulated size pressure/);

    const parsed = parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      paint_strategy: strategy,
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Water Brush' } },
        {
          id: 'stroke',
          tool: 'photoshop_paint_strokes',
          method_id: 'installed-brush-preset',
          args: {
            strokes: [{
              tool: 'BRUSH',
              points: [{ x: 1, y: 1 }, { x: 20, y: 20 }],
              dynamics: { size: [80, 25], opacity: [70, 25] },
            }],
          },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(parsed.paintStrategy?.pressurePolicy).toBe('simulated-size-opacity');

    expect(() => parseVisualMicroPlan(basePlan({
      method_class: 'preset-brush',
      paint_strategy: {
        ...strategy,
        pressure_policy: 'simulated-opacity',
      },
      steps: [
        { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'Water Brush' } },
        {
          id: 'stroke',
          tool: 'photoshop_paint_strokes',
          method_id: 'installed-brush-preset',
          args: {
            strokes: [{
              tool: 'BRUSH',
              points: [{ x: 1, y: 1 }, { x: 20, y: 20 }],
              dynamics: { size: [80, 25] },
            }],
          },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/simulated opacity pressure/);
  });

  it('forbids non-mutation steps inside the mutation transaction', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      steps: [
        { id: 'p1', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
        { id: 'state', tool: 'photoshop_get_state', args: {} },
        { id: 'p2', tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }))).toThrow(/contiguous bounded transaction/);
  });

  it('requires the preview immediately after the mutation', () => {
    expect(() =>
      parseVisualMicroPlan(
        basePlan({
          steps: [
            { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
            { id: 'state', tool: 'photoshop_get_state', args: {} },
            { id: 'preview', tool: 'photoshop_get_preview', args: {} },
          ],
        })
      )
    ).toThrow(/immediately followed/);
  });

  it('allows one before preview immediately before the mutation', () => {
    const parsed = parseVisualMicroPlan(
      basePlan({
        steps: [
          { id: 'state', tool: 'photoshop_get_state', args: {} },
          {
            id: 'before',
            tool: 'photoshop_get_preview',
            args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 } },
          },
          { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
          {
            id: 'after',
            tool: 'photoshop_get_preview',
            args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 } },
          },
        ],
      })
    );
    expect(parsed.beforeCaptureIndex).toBe(1);
    expect(parsed.mutationIndex).toBe(2);
    expect(parsed.captureIndex).toBe(3);
  });

  it('requires matching before/after focus previews for small local work', () => {
    expect(() =>
      parseVisualMicroPlan(
        basePlan({
          scale: 'small',
          problem_id: 'eye-shape',
          steps: [
            { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
            { id: 'after', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 } } },
          ],
        })
      )
    ).toThrow(/requires an immediately-before preview/);

    expect(() =>
      parseVisualMicroPlan(
        basePlan({
          scale: 'small',
          problem_id: 'eye-shape',
          steps: [
            { id: 'before', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 } } },
            { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
            { id: 'after', tool: 'photoshop_get_preview', args: { focus_region: { left: 11, top: 10, right: 80, bottom: 80 } } },
          ],
        })
      )
    ).toThrow(/same focus_region/);

    const parsed = parseVisualMicroPlan(
      basePlan({
        scale: 'small',
        problem_id: 'eye-shape',
        significance_mode: 'subtle_local',
        verification_envelope: { mode: 'before_after', min_focus_dimension_px: 800 },
        steps: [
          {
            id: 'before',
            tool: 'photoshop_get_preview',
            args: {
              focus_region: { left: 10, top: 10, right: 80, bottom: 80 },
              focus_max_dimension_px: 1200,
            },
          },
          { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
          {
            id: 'after',
            tool: 'photoshop_get_preview',
            args: {
              focus_region: { left: 10, top: 10, right: 80, bottom: 80 },
              focus_max_dimension_px: 1200,
            },
          },
        ],
      })
    );
    expect(parsed.significanceMode).toBe('subtle_local');
    expect(parsed.beforeCaptureIndex).toBe(0);
  });

  it('rejects subtle_local without a stable problem_id', () => {
    expect(() =>
      parseVisualMicroPlan(
        basePlan({
          significance_mode: 'subtle_local',
          verification_envelope: { mode: 'before_after', min_focus_dimension_px: 800 },
          steps: [
            { id: 'before', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 } } },
            { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
            { id: 'after', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 } } },
          ],
        })
      )
    ).toThrow(/requires problem_id/);
  });

  it('requires subtle_local verification envelope to preserve >=800px before/after inspection', () => {
    expect(() => parseVisualMicroPlan(basePlan({
      problem_id: 'eye-shape',
      significance_mode: 'subtle_local',
      verification_envelope: { mode: 'after_only', min_focus_dimension_px: 800 },
      steps: [
        { id: 'before', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 }, focus_max_dimension_px: 800 } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
        { id: 'after', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 }, focus_max_dimension_px: 800 } },
      ],
    }))).toThrow(/mode=before_after/);

    expect(() => parseVisualMicroPlan(basePlan({
      problem_id: 'eye-shape',
      significance_mode: 'subtle_local',
      verification_envelope: { mode: 'before_after', min_focus_dimension_px: 799 },
      steps: [
        { id: 'before', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 }, focus_max_dimension_px: 800 } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 20, y: 20 }] } },
        { id: 'after', tool: 'photoshop_get_preview', args: { focus_region: { left: 10, top: 10, right: 80, bottom: 80 }, focus_max_dimension_px: 800 } },
      ],
    }))).toThrow(/min_focus_dimension_px >= 800/);
  });

  it('rejects a before preview that is not adjacent to the mutation', () => {
    expect(() =>
      parseVisualMicroPlan(
        basePlan({
          steps: [
            { id: 'before', tool: 'photoshop_get_preview', args: {} },
            { id: 'state', tool: 'photoshop_get_state', args: {} },
            { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
            { id: 'after', tool: 'photoshop_get_preview', args: {} },
          ],
        })
      )
    ).toThrow(/before preview must be immediately before/);
  });

  it('accepts preset selection without a redundant settings read', () => {
    const parsed = parseVisualMicroPlan(
      basePlan({
        steps: [
          { id: 'select', tool: 'photoshop_select_brush_preset', args: { name: 'Charcoal' } },
          { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      })
    );
    expect(parsed.mutationIndex).toBe(1);
  });

  it('rejects forward and unknown step references', () => {
    expect(() =>
      parseVisualMicroPlan(
        basePlan({
          steps: [
            { id: 'state', tool: 'photoshop_get_state', args: { x: '$steps.paint.details.x' } },
            { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
            { id: 'preview', tool: 'photoshop_get_preview', args: {} },
          ],
        })
      )
    ).toThrow(/earlier step/);
  });

  it('resolves normalized earlier-step placeholders', () => {
    const resolved = resolveVisualMicroPlanArgs(
      { document_id: '$steps.state.document.id', value: '$steps.sample.rgb.red' },
      {
        state: { document: { id: 77 } },
        sample: { rgb: { red: 123 } },
      }
    );
    expect(resolved).toEqual({ document_id: 77, value: 123 });
  });
});

function definition(
  name: string,
  handler: ToolDefinition['handler'],
  documentBound = false
): ToolDefinition {
  return {
    tool: {
      name,
      description: 'test',
      inputSchema: {
        type: 'object',
        properties: documentBound ? { document_id: { type: 'number' } } : {},
      },
    },
    handler,
  };
}

function knownGoodCreateNewRegionPlan(): Record<string, unknown> {
  return {
    plan_id: 'known-good-region-plan',
    summary: 'Block in one broad atmospheric plane',
    stage: 'RECOGNITION_BLOCK_IN',
    scale: 'global',
    region: 'whole-canvas-atmosphere',
    region_bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    intent: 'Establish the broad atmospheric field without local detail',
    method_class: 'region',
    risk: 'low',
    expected_visual_delta: 'A broad cool atmospheric field becomes visible across the composition.',
    verification_envelope: { mode: 'after_only', min_focus_dimension_px: 900 },
    layer_separation_check: {
      change_kind: 'new-plane',
      substantial: true,
      rollback_value: 'high',
      independent_adjustment_expected: true,
      reasons: ['The atmosphere is an independent plane that may need later recoloring or rollback.'],
    },
    logical_layer: {
      decision: 'create-new',
      hypothesis_id: 'atmosphere-plane',
      hypothesis: 'A separate atmospheric layer keeps the global field independently adjustable.',
      rollback_value: 'high',
      expected_independent_rollback: true,
      separation_reasons: ['Keep the broad atmosphere independent from later landscape forms.'],
      layer_name: 'Atmosphere',
    },
    problem_id: 'recognition-atmosphere',
    action_class: 'ADD',
    expected_visual_result: 'The whole-image atmosphere reads as one coherent cool field.',
    failure_signals: ['white canvas remains', 'unexpected hard local detail'],
    recognition_features: ['broad sky field', 'clear horizon band', 'open foreground corridor'],
    style_recognition_features: ['soft book-illustration value grouping'],
    protected_regions: [],
    protected_layer_ids: [],
    replace_protected_layer_ids: [],
    document_id: 42,
    steps: [
      {
        id: 'layer',
        tool: 'photoshop_create_layer',
        args: { name: 'Atmosphere' },
      },
      {
        id: 'paint',
        tool: 'photoshop_paint_regions',
        args: {
          regions: [{
            id: 'atmosphere-field',
            layer_id: '$steps.layer.details.layerId',
            color: { red: 25, green: 50, blue: 70 },
            opacity: 100,
            contours: [{
              operation: 'ADD',
              points: [
                { x: 10, y: 10 },
                { x: 90, y: 10 },
                { x: 90, y: 90 },
                { x: 10, y: 90 },
              ],
            }],
          }],
        },
      },
      {
        id: 'preview',
        tool: 'photoshop_get_preview',
        args: { max_dimension_px: 1000, quality: 8 },
      },
    ],
  };
}

describe('photoshop_execute_visual_microplan', () => {
  it('propagates exact not-executed proof when the first state-changing preparation is rejected before dispatch', async () => {
    const registry = new ToolRegistry();
    let paintCalls = 0;
    let previewCalls = 0;
    registry.register('photoshop_create_layer', definition('photoshop_create_layer', async () => ({
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({
        ok: false,
        code: 'uxp_bridge_unavailable',
        message: 'bridge unavailable before dispatch',
        execution: 'not-executed',
        execution_proof: {
          protocol: 'photoshop.execution_exact_outcome.v1',
          dispatch: 'not-dispatched',
          side_effects: 'none',
          reason: 'backend_route_rejected_before_semantic_dispatch',
        },
      }) }],
    }), true));
    registry.register('photoshop_paint_regions', definition('photoshop_paint_regions', async () => {
      paintCalls++;
      return { content: [{ type: 'text', text: '{"ok":true}' }] };
    }, true));
    registry.register('photoshop_get_preview', definition('photoshop_get_preview', async () => {
      previewCalls++;
      return { content: [{ type: 'text', text: '{"ok":true,"sha256":"never"}' }] };
    }, true));

    const result = await createVisualMicroPlanTools(registry)[0]!.handler(knownGoodCreateNewRegionPlan());
    const text = result.content.find(item => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({
      code: 'microplan_prepare_failed',
      execution: 'not-executed',
      terminal: true,
      visual_mutation_started: false,
      preparation_execution: {
        failed_step_class: 'preparation-only',
        failed_step_invoked: true,
        failed_step_execution: 'not-executed',
        prior_side_effecting_preparation_completed: false,
        side_effects_possible: false,
      },
    });
    expect(body.pass_execution.actions[0].state).toBe('not-started');
    expect(paintCalls).toBe(0);
    expect(previewCalls).toBe(0);
  });

  it('keeps the pass uncertain when an earlier state-changing preparation succeeded before a later exact rejection', async () => {
    const registry = new ToolRegistry();
    let paintCalls = 0;
    registry.register('photoshop_create_layer', definition('photoshop_create_layer', async () => ({
      content: [{ type: 'text', text: '{"ok":true,"details":{"layerId":77,"layerName":"Atmosphere"}}' }],
    }), true));
    registry.register('photoshop_set_foreground_color', definition('photoshop_set_foreground_color', async () => ({
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({
        ok: false,
        code: 'uxp_bridge_unavailable',
        execution: 'not-executed',
        message: 'second preparation rejected before dispatch',
      }) }],
    }), true));
    registry.register('photoshop_paint_regions', definition('photoshop_paint_regions', async () => {
      paintCalls++;
      return { content: [{ type: 'text', text: '{"ok":true}' }] };
    }, true));
    registry.register('photoshop_get_preview', definition('photoshop_get_preview', async () => ({
      content: [{ type: 'text', text: '{"ok":true,"sha256":"never"}' }],
    }), true));

    const plan = structuredClone(knownGoodCreateNewRegionPlan()) as any;
    plan.plan_id = 'prepare-partial-side-effect';
    plan.steps.splice(1, 0, { id: 'foreground', tool: 'photoshop_set_foreground_color', args: {} });
    const result = await createVisualMicroPlanTools(registry)[0]!.handler(plan);
    const text = result.content.find(item => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(result.isError).toBe(true);
    expect(body.code).toBe('microplan_prepare_failed');
    expect(body.execution).toBeUndefined();
    expect(body.preparation_execution).toMatchObject({
      prior_side_effecting_preparation_completed: true,
      side_effects_possible: true,
    });
    expect(paintCalls).toBe(0);
  });

  it('does not misclassify deferred post-create argument resolution failure as not-executed', async () => {
    const registry = new ToolRegistry();
    let paintCalls = 0;
    registry.register('photoshop_create_layer', definition('photoshop_create_layer', async () => ({
      content: [{ type: 'text', text: '{"ok":true,"details":{"layerName":"Atmosphere"}}' }],
    }), true));
    registry.register('photoshop_paint_regions', definition('photoshop_paint_regions', async () => {
      paintCalls++;
      return { content: [{ type: 'text', text: '{"ok":true}' }] };
    }, true));
    registry.register('photoshop_get_preview', definition('photoshop_get_preview', async () => ({
      content: [{ type: 'text', text: '{"ok":true,"sha256":"never"}' }],
    }), true));

    const plan = structuredClone(knownGoodCreateNewRegionPlan()) as any;
    plan.plan_id = 'deferred-resolution-after-create';
    const result = await createVisualMicroPlanTools(registry)[0]!.handler(plan);
    const text = result.content.find(item => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(result.isError).toBe(true);
    expect(body.code).toBe('mutation_argument_resolution_failed');
    expect(body.execution).toBeUndefined();
    expect(body.preparation_execution).toMatchObject({
      prior_side_effecting_preparation_completed: true,
      side_effects_possible: true,
    });
    expect(body.visual_mutation_started).toBe(false);
    expect(paintCalls).toBe(0);
  });

  it('gives every nested Guard step a distinct deterministic physical command identity', async () => {
    const registry = new ToolRegistry();
    const commandIds: Array<[string, string | undefined]> = [];
    for (const name of [
      'photoshop_select_brush_preset',
      'photoshop_set_brush',
      'photoshop_paint_strokes',
    ]) {
      registry.register(name, definition(name, async () => {
        commandIds.push([name, currentStableCommandId()]);
        return { content: [{ type: 'text', text: '{"ok":true}' }] };
      }, true));
    }
    registry.register('photoshop_get_preview', definition('photoshop_get_preview', async () => ({
      content: [{ type: 'text', text: '{"ok":true,"sha256":"24a-frame"}' }],
    }), true));

    const plan = basePlan({
      plan_id: 'guard-pass-24a',
      steps: [
        { id: 'select-brush', tool: 'photoshop_select_brush_preset', args: { name: 'Round' } },
        { id: 'set-brush', tool: 'photoshop_set_brush', args: { size: 32 } },
        {
          id: 'paint-strokes',
          tool: 'photoshop_paint_strokes',
          args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    });
    const execute = createVisualMicroPlanTools(registry)[0]!.handler;
    const result = await withToolExecutionContext(
      { guardOperationId: 'guard-pass-24a' },
      () => execute(plan)
    );

    expect(result.isError).not.toBe(true);
    expect(commandIds).toEqual([
      ['photoshop_select_brush_preset', 'guard-pass-24a:step:select-brush'],
      ['photoshop_set_brush', 'guard-pass-24a:step:set-brush'],
      ['photoshop_paint_strokes', 'guard-pass-24a:step:paint-strokes'],
    ]);
  });

  it('keeps a known-good create-new region template valid across schema, parser and handler preflight without Photoshop', async () => {
    const registry = new ToolRegistry();
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    registry.register(
      'photoshop_create_layer',
      definition('photoshop_create_layer', async (args) => {
        calls.push({ tool: 'photoshop_create_layer', args });
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { layerId: 77, layerName: 'Atmosphere' } }) }],
        };
      }, true)
    );
    registry.register(
      'photoshop_paint_regions',
      definition('photoshop_paint_regions', async (args) => {
        calls.push({ tool: 'photoshop_paint_regions', args });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { painted_regions: [{ layer_id: 77 }] } }) }] };
      }, true)
    );
    registry.register(
      'photoshop_get_preview',
      definition('photoshop_get_preview', async (args) => {
        calls.push({ tool: 'photoshop_get_preview', args });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, sha256: 'known-good-frame' }) }] };
      }, true)
    );

    const plan = knownGoodCreateNewRegionPlan();
    const tool = createVisualMicroPlanTools(registry)[0]!;
    const schema = tool.tool.inputSchema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    for (const key of schema.required ?? []) expect(plan).toHaveProperty(key);
    for (const key of Object.keys(plan)) expect(schema.properties).toHaveProperty(key);

    const parsed = parseVisualMicroPlan(plan);
    expect(parsed.logicalLayer?.createStepId).toBe('layer');
    expect(parsed.mutationIndexes).toEqual([1]);
    expect(parsed.captureIndex).toBe(2);

    const result = await tool.handler(plan);
    expect(result.isError).not.toBe(true);
    expect(calls.map(call => call.tool)).toEqual([
      'photoshop_create_layer',
      'photoshop_paint_regions',
      'photoshop_get_preview',
    ]);
    const paint = calls.find(call => call.tool === 'photoshop_paint_regions')!;
    const regions = paint.args.regions as Array<Record<string, unknown>>;
    expect(regions[0]!.layer_id).toBe(77);
    expect(paint.args.document_id).toBe(42);
  });

  it('marks schema validation failures as guaranteed not-executed', async () => {
    const registry = new ToolRegistry();
    const result = await createVisualMicroPlanTools(registry)[0]!.handler({
      ...basePlan(),
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 10, y: 20 }] } },
      ],
    });

    expect(result.isError).toBe(true);
    const text = result.content.find((item) => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(body.code).toBe('invalid_visual_microplan');
    expect(body.execution).toBe('not-executed');
    expect(body.visual_mutation_started).toBe(false);
  });

  it('validates nested mutation arguments before any preparation step executes', async () => {
    const registry = new ToolRegistry();
    let createLayerCalls = 0;
    let paintCalls = 0;
    let previewCalls = 0;
    registry.register('photoshop_create_layer', {
      tool: {
        name: 'photoshop_create_layer',
        description: 'test create layer',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, name: { type: 'string' } },
        },
      },
      handler: async () => {
        createLayerCalls++;
        return { content: [{ type: 'text', text: '{"ok":true,"details":{"layerId":77}}' }] };
      },
    });
    registry.register('photoshop_paint_regions', {
      tool: {
        name: 'photoshop_paint_regions',
        description: 'test region paint',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number' },
            regions: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  layer_id: { type: 'number', minimum: 1 },
                  color: {
                    type: 'object',
                    properties: {
                      red: { type: 'number' }, green: { type: 'number' }, blue: { type: 'number' },
                    },
                    required: ['red', 'green', 'blue'],
                  },
                  contours: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      properties: {
                        points: { type: 'array', minItems: 3, items: { type: 'object' } },
                      },
                      required: ['points'],
                    },
                  },
                },
                required: ['color', 'contours'],
              },
            },
          },
          required: ['regions'],
        },
      },
      handler: async () => {
        paintCalls++;
        return { content: [{ type: 'text', text: '{"ok":true}' }] };
      },
    });
    registry.register('photoshop_get_preview', {
      tool: {
        name: 'photoshop_get_preview',
        description: 'test preview',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, max_dimension_px: { type: 'number' }, quality: { type: 'number' } },
        },
      },
      handler: async () => {
        previewCalls++;
        return { content: [{ type: 'text', text: '{"ok":true,"sha256":"never"}' }] };
      },
    });

    const plan = structuredClone(knownGoodCreateNewRegionPlan()) as any;
    plan.steps[1].args.regions[0].contours = [];
    const result = await createVisualMicroPlanTools(registry)[0]!.handler(plan);

    expect(result.isError).toBe(true);
    const text = result.content.find((item) => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(body).toMatchObject({
      code: 'invalid_visual_microplan',
      execution: 'not-executed',
      visual_mutation_started: false,
    });
    expect(body.message).toMatch(/contours.*at least 1 item/i);
    expect(createLayerCalls).toBe(0);
    expect(paintCalls).toBe(0);
    expect(previewCalls).toBe(0);
  });

  it('fails closed before dispatch when protected layers are declared but the mutation target is not pinned', async () => {
    const registry = new ToolRegistry();
    let paintCalls = 0;
    let previewCalls = 0;
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async () => {
          paintCalls++;
          return { content: [{ type: 'text', text: '{"ok":true}' }] };
        },
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => {
          previewCalls++;
          return { content: [{ type: 'text', text: '{"ok":true,"sha256":"never"}' }] };
        },
        true
      )
    );

    const result = await createVisualMicroPlanTools(registry)[0]!.handler(basePlan({
      protected_layer_ids: [77],
    }));
    expect(result.isError).toBe(true);
    expect(paintCalls).toBe(0);
    expect(previewCalls).toBe(0);
    const text = result.content.find((item) => item.type === 'text');
    expect(text && 'text' in text ? text.text : '').toContain('protected_layer_violation');
    expect(text && 'text' in text ? text.text : '').toContain('requires explicit photoshop_paint_dabs.layer_id');
  });

  it('blocks a protected target and permits only an explicit REPLACE exception', async () => {
    const registry = new ToolRegistry();
    const paintArgs: Record<string, unknown>[] = [];
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async (args) => {
          paintArgs.push(args);
          return { content: [{ type: 'text', text: '{"ok":true}' }] };
        },
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => ({
          content: [
            { type: 'image', data: 'aGVsbG8=', mimeType: 'image/jpeg' },
            { type: 'text', text: '{"ok":true,"sha256":"sha-protected"}' },
          ],
        }),
        true
      )
    );
    const tool = createVisualMicroPlanTools(registry)[0]!;
    const blocked = await tool.handler(basePlan({
      protected_layer_ids: [77],
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: { max_dimension_px: 800 } },
      ],
    }));
    expect(blocked.isError).toBe(true);
    expect(paintArgs).toHaveLength(0);

    const allowed = await tool.handler(basePlan({
      plan_id: 'replace-protected',
      action_class: 'REPLACE',
      protected_layer_ids: [77],
      replace_protected_layer_ids: [77],
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: { max_dimension_px: 800 } },
      ],
    }));
    expect(allowed.isError).not.toBe(true);
    expect(paintArgs).toHaveLength(1);
    expect(paintArgs[0]!.layer_id).toBe(77);
  });

  it('requires every paint_regions target to be explicit when protected layers are active', async () => {
    const registry = new ToolRegistry();
    let regionCalls = 0;
    registry.register(
      'photoshop_paint_regions',
      definition(
        'photoshop_paint_regions',
        async () => {
          regionCalls++;
          return { content: [{ type: 'text', text: '{"ok":true}' }] };
        },
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => ({ content: [{ type: 'text', text: '{"ok":true,"sha256":"never"}' }] }),
        true
      )
    );
    const result = await createVisualMicroPlanTools(registry)[0]!.handler(basePlan({
      stage: 'SHAPE',
      method_class: 'region',
      protected_layer_ids: [77],
      steps: [
        {
          id: 'paint',
          tool: 'photoshop_paint_regions',
          args: { regions: [{ color: { red: 1, green: 2, blue: 3 }, contours: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }] }] }] },
        },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(result.isError).toBe(true);
    expect(regionCalls).toBe(0);
    const text = result.content.find((item) => item.type === 'text');
    expect(text && 'text' in text ? text.text : '').toContain('protected_layer_violation');
  });

  it('returns compact continuation metadata for layers created during preparation', async () => {
    const registry = new ToolRegistry();
    registry.register(
      'photoshop_create_layer',
      definition(
        'photoshop_create_layer',
        async () => ({
          content: [{ type: 'text', text: '{"ok":true,"details":{"layerId":77,"layerName":"Feature Layer"}}' }],
        }),
        true
      )
    );
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }),
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => ({ content: [{ type: 'text', text: '{"ok":true,"sha256":"sha-continuation"}' }] }),
        true
      )
    );

    const result = await createVisualMicroPlanTools(registry)[0]!.handler(basePlan({
      steps: [
        { id: 'feature', tool: 'photoshop_create_layer', args: { name: 'Feature Layer' } },
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 77, dabs: [{ x: 10, y: 20 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    }));
    expect(result.isError).not.toBe(true);
    const text = result.content.find((item) => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(body.continuation_layers).toEqual([
      { step_id: 'feature', layer_id: 77, layer_name: 'Feature Layer' },
    ]);
  });

  it('packs one mutation + preview into one call and blocks the next call until verdict', async () => {
    const registry = new ToolRegistry();
    const paintArgs: Record<string, unknown>[] = [];
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async (args) => {
          paintArgs.push(args);
          return { content: [{ type: 'text', text: '{"ok":true,"details":{"dab_count":1}}' }] };
        },
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => ({
          content: [
            { type: 'image', data: 'aGVsbG8=', mimeType: 'image/jpeg' },
            { type: 'text', text: '{"ok":true,"sha256":"sha-one","width":100,"height":100}' },
          ],
        }),
        true
      )
    );

    const tool = createVisualMicroPlanTools(registry)[0]!;
    const first = await tool.handler(basePlan());
    expect(first.isError).not.toBe(true);
    expect(first.content.some((item) => item.type === 'image')).toBe(true);
    expect(paintArgs).toHaveLength(1);
    expect(paintArgs[0]!.document_id).toBe(42);

    const blocked = await tool.handler(basePlan({ plan_id: 'p2' }));
    expect(blocked.isError).toBe(true);
    expect(paintArgs).toHaveLength(1);
    const blockedText = blocked.content.find((item) => item.type === 'text');
    expect(blockedText && 'text' in blockedText ? blockedText.text : '').toContain(
      'preview_verdict_required'
    );

    const second = await tool.handler(
      basePlan({
        plan_id: 'p2',
        previous_preview: {
          sha256: 'sha-one',
          observed_change: 'The upper tower plane is visibly lighter and cleaner.',
          target_resolved: 'yes',
          regressions: [],
          uncertainty: 'none observed',
          verdict: 'improvement',
          disposition: 'accept',
        },
      })
    );
    expect(second.isError).not.toBe(true);
    expect(paintArgs).toHaveLength(2);
  });

  it('executes multiple related mutations as one semantic transaction with one final barrier', async () => {
    const registry = new ToolRegistry();
    const paintIds: string[] = [];
    let previewCalls = 0;
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async (args) => {
          paintIds.push(String(args.tag));
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, tag: args.tag, history_steps: 1 }) }] };
        },
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => {
          previewCalls++;
          return {
            content: [
              { type: 'image', data: 'aGVsbG8=', mimeType: 'image/jpeg' },
              { type: 'text', text: JSON.stringify({ ok: true, sha256: `sha-bundle-${previewCalls}` }) },
            ],
          };
        },
        true
      )
    );

    const tool = createVisualMicroPlanTools(registry)[0]!;
    const result = await tool.handler(basePlan({
      plan_id: 'bundle-1',
      problem_id: 'cheek-volume',
      scale: 'small',
      significance_mode: 'subtle_local',
      region: 'left-cheek',
      intent: 'reinforce cheek volume',
      verification_envelope: { mode: 'before_after', min_focus_dimension_px: 800 },
      steps: [
        {
          id: 'before',
          tool: 'photoshop_get_preview',
          args: { focus_region: { left: 10, top: 10, right: 90, bottom: 90 }, focus_max_dimension_px: 800 },
        },
        { id: 'light', tool: 'photoshop_paint_dabs', region: 'left-cheek', intent: 'reinforce cheek volume', risk: 'low', args: { tag: 'light', dabs: [{ x: 30, y: 30 }] } },
        { id: 'turn', tool: 'photoshop_paint_dabs', region: 'left-cheek', intent: 'reinforce cheek volume', risk: 'low', args: { tag: 'turn', dabs: [{ x: 45, y: 45 }] } },
        {
          id: 'after',
          tool: 'photoshop_get_preview',
          args: { focus_region: { left: 10, top: 10, right: 90, bottom: 90 }, focus_max_dimension_px: 800 },
        },
      ],
    }));

    expect(result.isError).not.toBe(true);
    expect(paintIds).toEqual(['light', 'turn']);
    expect(previewCalls).toBe(2);
    const text = result.content.find((item) => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(body.mutation_count).toBe(2);
    expect(Object.keys(body.mutation_results)).toEqual(['light', 'turn']);
    expect(body.semantic_action_budget).toMatchObject({
      requested_mutations: 2,
      allowed_mutations: 8,
      hard_cap: 8,
    });
    expect(body.pass_execution).toEqual({
      pass_id: 'bundle-1',
      state: 'completed',
      actions: [
        { step_id: 'light', tool: 'photoshop_paint_dabs', kind: 'visual-mutation', state: 'completed' },
        { step_id: 'turn', tool: 'photoshop_paint_dabs', kind: 'visual-mutation', state: 'completed' },
      ],
      history_ownership: {
        protocol: 'photoshop.guard.semantic_pass_history_ownership.v1',
        status: 'exact',
        completed_mutation_count: 2,
        uncertain_mutation_present: false,
        owned_history_steps: 2,
        actions: [
          { step_id: 'light', history_steps: 1 },
          { step_id: 'turn', history_steps: 1 },
        ],
      },
    });
    expect(body.barrier.next_visual_mutation_allowed).toBe(false);

    const blocked = await tool.handler(basePlan({ plan_id: 'bundle-2' }));
    expect(blocked.isError).toBe(true);
    const blockedText = blocked.content.find((item) => item.type === 'text');
    expect(blockedText && 'text' in blockedText ? blockedText.text : '').toContain('preview_verdict_required');
  });

  it('requires factual structured critique before releasing a preview barrier', async () => {
    const registry = new ToolRegistry();
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }),
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => ({
          content: [
            { type: 'image', data: 'aGVsbG8=', mimeType: 'image/jpeg' },
            { type: 'text', text: '{"ok":true,"sha256":"sha-critic"}' },
          ],
        }),
        true
      )
    );
    const tool = createVisualMicroPlanTools(registry)[0]!;
    expect((await tool.handler(basePlan())).isError).not.toBe(true);
    const legacy = await tool.handler(
      basePlan({
        plan_id: 'p2',
        previous_preview: {
          sha256: 'sha-critic',
          verdict: 'improvement',
          disposition: 'accept',
        },
      })
    );
    expect(legacy.isError).toBe(true);
    const text = legacy.content.find((item) => item.type === 'text');
    expect(text && 'text' in text ? text.text : '').toContain('observed_change');
  });

  it('still captures a preview after a mutation error instead of retrying', async () => {
    const registry = new ToolRegistry();
    let paintCalls = 0;
    let previewCalls = 0;
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async () => {
          paintCalls++;
          return {
            content: [{ type: 'text', text: '{"ok":false,"code":"unknown","message":"partial"}' }],
            isError: true,
          };
        },
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => {
          previewCalls++;
          return {
            content: [
              { type: 'image', data: 'aGVsbG8=', mimeType: 'image/jpeg' },
              { type: 'text', text: '{"ok":true,"sha256":"sha-partial"}' },
            ],
          };
        },
        true
      )
    );

    const result = await createVisualMicroPlanTools(registry)[0]!.handler(basePlan());
    expect(result.isError).toBe(true);
    expect(paintCalls).toBe(1);
    expect(previewCalls).toBe(1);
    expect(result.content.some((item) => item.type === 'image')).toBe(true);
  });

  it('projects completed, failed-or-uncertain, and not-started sub-actions after a middle mutation failure without replay', async () => {
    const registry = new ToolRegistry();
    const paintCalls: string[] = [];
    let previewCalls = 0;
    registry.register(
      'photoshop_paint_dabs',
      definition(
        'photoshop_paint_dabs',
        async (args) => {
          const tag = String(args.tag);
          paintCalls.push(tag);
          if (tag === 'middle') {
            return {
              content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'injected_middle_failure' }) }],
              isError: true,
            };
          }
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, tag }) }] };
        },
        true
      )
    );
    registry.register(
      'photoshop_get_preview',
      definition(
        'photoshop_get_preview',
        async () => {
          previewCalls++;
          return {
            content: [
              { type: 'image', data: 'aGVsbG8=', mimeType: 'image/jpeg' },
              { type: 'text', text: JSON.stringify({ ok: true, sha256: 'sha-middle-failure' }) },
            ],
          };
        },
        true
      )
    );

    const result = await createVisualMicroPlanTools(registry)[0]!.handler(basePlan({
      plan_id: 'partial-pass-1',
      steps: [
        { id: 'first', tool: 'photoshop_paint_dabs', args: { tag: 'first', dabs: [{ x: 10, y: 10 }] } },
        { id: 'middle', tool: 'photoshop_paint_dabs', args: { tag: 'middle', dabs: [{ x: 20, y: 20 }] } },
        { id: 'last', tool: 'photoshop_paint_dabs', args: { tag: 'last', dabs: [{ x: 30, y: 30 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: { max_dimension_px: 800 } },
      ],
    }));

    expect(result.isError).toBe(true);
    expect(paintCalls).toEqual(['first', 'middle']);
    expect(previewCalls).toBe(1);
    const text = result.content.find((item) => item.type === 'text');
    const body = JSON.parse(text && 'text' in text ? text.text : '{}');
    expect(body.failed_mutation_step).toBe('middle');
    expect(body.failure_category).toBe('injected_middle_failure');
    expect(body.execution).toBeUndefined();
    expect(body.pass_execution).toEqual({
      pass_id: 'partial-pass-1',
      state: 'failed-or-uncertain',
      actions: [
        { step_id: 'first', tool: 'photoshop_paint_dabs', kind: 'visual-mutation', state: 'completed' },
        { step_id: 'middle', tool: 'photoshop_paint_dabs', kind: 'visual-mutation', state: 'failed-or-uncertain' },
        { step_id: 'last', tool: 'photoshop_paint_dabs', kind: 'visual-mutation', state: 'not-started' },
      ],
      history_ownership: {
        protocol: 'photoshop.guard.semantic_pass_history_ownership.v1',
        status: 'partial-or-uncertain',
        completed_mutation_count: 1,
        uncertain_mutation_present: true,
        actions: [{ step_id: 'first', history_steps: null }],
        reason: 'Exact rollback span is not proven until every completed visual mutation reports an explicit positive history_steps count.',
      },
    });
  });
});
