import { describe, expect, it } from 'vitest';
import { classifyPainterFinding, enforcePainterFinding, reportArtisticAdvice } from '../src/core/guard/admission-policy.js';
import { criticCorrectionIssue, correctionFinding } from '../src/core/guard/critic-correction.js';
import { foundationAdmission, SCENE_FOUNDATION_VERSION } from '../src/core/guard/scene-foundation.js';
import { normalizeSimpleGraphicPass, simpleGraphicFoundationAdvisory } from '../src/core/guard/simple-graphic-leniency.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const profiles = ['simple_graphic', 'nontrivial_painting'] as const;

const criticState = (painting_profile: string): any => ({
  painting_profile,
  chat_critic_findings: [
    correctionFinding({
      criterion: 'form_proportions',
      correction_kind: 'form',
      visible: 'The figure has deliberately elongated proportions.',
      next_change: 'Consider adjusting proportions only if the brief calls for realism.',
      structural_defect: {
        id: 'stylized-figure', kind: 'relative-size', part_ids: ['torso', 'legs'],
        relation_ids: ['torso-to-legs'],
        visible: 'The legs appear twice as long as the torso in the current frame.',
        brief_relevance: 'The illustrated character uses stylized proportions.',
        recheck: 'Inspect the whole rendered frame after any chosen changes.',
        region_bounds: { left: 10, top: 10, right: 80, bottom: 90 },
      },
    }),
    correctionFinding({
      criterion: 'light_material', correction_kind: 'material',
      visible: 'The deliberately flat background has little texture.',
      next_change: 'Try textured shading if it improves the requested style.',
    }),
  ],
});

const independentArtPass = (): any => ({
  tool: 'photoshop_execute_visual_microplan',
  addresses_problem_ids: ['critic-light_material'],
  action_class: 'ADD', stage: 'DETAIL', impact_class: 'texture', visual_intent: 'texture',
  args: { steps: [{ tool: 'photoshop_paint_regions', args: {
    layer_id: 21,
    regions: [{ contours: [{ points: [{ x: 25, y: 25 }, { x: 45, y: 25 }, { x: 45, y: 45 }] }] }],
  } }] },
});

describe('artistic admission freedom is invariant across painting profiles', () => {
  it.each(profiles)('%s permits a deliberate stylistic method and task ordering despite Critic debt', profile => {
    const result = criticCorrectionIssue(criticState(profile), independentArtPass());
    if (profile === 'nontrivial_painting') {
      expect(result?.code).toBe('critic_structural_priority_required');
      const dir = mkdtempSync(path.join(tmpdir(), 'artistic-admission-'));
      try {
        const store = new SessionStore(path.join(dir, 'controller'), {
          visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir,
        });
        store.updatePaintingState(42, current => ({
          ...current, ...criticState(profile), document_id: 42,
        }));
        const advisories: string[] = [];
        const errors = store.collectPreflightErrors({
          ...independentArtPass(), document_id: 42,
          args: { ...independentArtPass().args, document_id: 42 },
        }, { stateOnly: true, artisticAdvisories: advisories } as any);
        expect(advisories.some(message => message.includes('critic_structural_priority_required'))).toBe(true);
        expect(errors.some(message => message.includes('critic_structural_priority_required'))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    } else expect(result).toBeUndefined();
    // The debt remains available for later evaluation and must not be cleared as a side effect.
    expect(criticState(profile).chat_critic_findings[0].structural_defect.id).toBe('stylized-figure');
  });

  it.each(profiles)('%s treats unproved artistic foundation as advisory while retaining the finding', profile => {
    const state: any = {
      painting_profile: profile, document_id: 42, document_incarnation_id: 'current-doc',
      original_brief: 'A flat surreal drawing with intentionally impossible perspective',
      scene_foundation_policy: SCENE_FOUNDATION_VERSION,
      current_frame: { operation_id: 'pixel-frame-1', sha256: 'a'.repeat(64) },
    };
    const candidate = { document_id: 42, stage: 'DETAIL', visual_intent: 'texture',
      change_domains: ['local-shape'], action_class: 'ADD' };
    const result = foundationAdmission(state, candidate);
    expect(result.missing).toEqual(['composition', 'technique']);
    // This helper may return blocked for *artistic priority*; admission must downgrade it.
    if (result.message) {
      const notices: string[] = [];
      expect(classifyPainterFinding({ authority: 'artistic-review', message: result.message })).toBe('WARN');
      reportArtisticAdvice(result.message, notices);
      reportArtisticAdvice(result.message, notices);
      expect(notices).toContain(result.message);
      expect(notices).toHaveLength(1);
      expect(() => enforcePainterFinding({ authority: 'artistic-review', message: result.message })).not.toThrow();
    }
  });

  it.each(profiles)('%s never reinterprets document, owner, protected pixels or Undo as art advice', profile => {
    const technical = [
      'document_identity_unverified: operation targets an unrelated Photoshop document',
      'semantic_mutation_target_owner_mismatch: requested layer is owned by another component',
      'protected_region_violation: native write enters a protected region',
      'project_checkpoint_recovery_required: checkpoint is unresolved',
      'Undo history unavailable',
    ];
    for (const finding of technical) {
      expect(classifyPainterFinding({ authority: 'execution-integrity', message: finding }), profile + ': ' + finding).toBe('BLOCK');
      expect(() => enforcePainterFinding({ authority: 'execution-integrity', message: finding })).toThrow(finding);
    }
  });

  it.each(profiles)('%s enforces an explicitly authored user restriction independently of diagnosis wording', profile => {
    const restriction = 'User requested that the selected protected layer remain untouched';
    expect(classifyPainterFinding({ authority: 'user-constraint', message: restriction })).toBe('BLOCK');
    expect(() => enforcePainterFinding({ authority: 'user-constraint', message: restriction })).toThrow(restriction);
    expect(classifyPainterFinding({ authority: 'artistic-review', message: restriction })).toBe('WARN');
    expect(() => enforcePainterFinding({ authority: 'artistic-review', message: restriction })).not.toThrow();
  });
});

describe('technical authorizations do not follow style leniency', () => {
  const context = (painting_profile: string): any => ({
    painting_profile, document_target: { id: 42 }, logical_layer_owners: [
      { hypothesis_id: 'owned', layer_id: 7, material_role: 'paper' },
    ],
  });
  const pass = (document_id = 42): any => ({
    document_id, request_key: 'art-freedom', action_class: 'ADD',
    visual_intent: 'continuous-field', construction_role: 'continuous-field',
    actions: [
      { id: 'create', tool: 'photoshop_create_layer', args: { name: 'Surreal sky' } },
      { id: 'gradient', tool: 'photoshop_paint_color_gradient',
        args: { layer_id: '$steps.create.details.layerId' } },
    ],
  });
  it.each(profiles)('%s cannot normalize across a different document', profile => {
    const authored = pass(99);
    const outcome = normalizeSimpleGraphicPass(authored, context(profile));
    expect(outcome.pass).toEqual(authored);
    expect(outcome.notices).toEqual([]);
  });

  it.each(profiles)('%s cannot derive permissions for an explicitly foreign physical layer', profile => {
    const authored = pass();
    authored.actions[1].args.layer_id = 999;
    const outcome = normalizeSimpleGraphicPass(authored, context(profile));
    expect(outcome.pass).toEqual(authored);
    expect(outcome.notices).toEqual([]);
  });

  it('Simple foundation advisory refuses cross-document, destructive and mismatched owner requests', () => {
    const state: any = { painting_profile: 'simple_graphic', document_id: 42,
      current_frame: { operation_id: 'frame' } };
    const owners = [{ hypothesis_id: 'owned', layer_id: 7, temporary: false }];
    const request = (layer_id: number, document_id: number, action_class = 'ADD'): any => ({
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id, action_class,
        logical_layer: { decision: 'continue-logical-layer', hypothesis_id: 'owned', layer_id: 7 },
        steps: [{ tool: 'photoshop_paint_strokes', args: { layer_id, strokes: [] } }],
      },
    });
    expect(simpleGraphicFoundationAdvisory(state, request(7, 42), owners)).toBe(true);
    expect(simpleGraphicFoundationAdvisory(state, request(7, 43), owners)).toBe(false);
    expect(simpleGraphicFoundationAdvisory(state, request(999, 42), owners)).toBe(false);
    expect(simpleGraphicFoundationAdvisory(state, request(7, 42, 'ERASE'), owners)).toBe(false);
    expect(simpleGraphicFoundationAdvisory(state, request(7, 42), [
      { hypothesis_id: 'foreign', layer_id: 7, temporary: false },
    ])).toBe(false);
  });
});
