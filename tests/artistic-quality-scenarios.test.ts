import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chatCriticRequest, validateChatCritic, persistChatCritic, CHAT_CRITIC_CRITERIA } from '../src/core/guard/chat-critic.js';
import { bindPaintingCompletion, COMPLETION_CRITERIA, wholeBriefCompletionContract } from '../src/core/guard/document-artistic-debt.js';

/** Protocol fixtures, NOT aesthetic scores: these deliberately represent the
 * archived failure categories. Pixel-level quality still requires image review. */
const scenarios = [
  { name: 'tiger', profile: 'nontrivial_painting', brief: 'A Siberian tiger in a nocturnal forest',
    criterion: 'form_proportions', problem: 'tiger-anatomy', kind: 'relative-size',
    visible: 'The torso and neck proportions make the animal unrecognizable as a tiger.',
    change: 'Rebuild the connected head, neck and torso silhouettes with reference-grounded proportions.' },
  { name: 'pink marker city', profile: 'simple_graphic', brief: 'Bright pink flying city with ninjas, drawn with markers',
    criterion: 'brief_fidelity', problem: 'city-marker-style', kind: 'shape-topology',
    visible: 'Uniform flat fills fail to establish the requested marker-drawn appearance.',
    change: 'Reconstruct the visible stroke and color-overlap language, preserving city and ninja ownership.' },
  { name: 'banana fingers', profile: 'simple_graphic', brief: 'A person eating a banana with anatomically plausible grip',
    criterion: 'contact_and_protection', problem: 'finger-peel-contact', kind: 'attachment',
    visible: 'Fingers do not wrap around the banana peel with believable opposing contact.',
    change: 'Rebuild independent finger masses with readable joints and finger-to-peel contact.' },
] as const;

describe('archived artistic failure categories — Guard evidence regression, not visual scoring', () => {
  for (const scene of scenarios) it(`${scene.name}: local Painter success cannot erase failed whole-scene Critic`, () => {
    const frame = `${scene.name}-frame-sha`;
    const record = (n: number): any => ({ id: `${scene.name}-${n}`, phase: 'completed', visual: true,
      stage: 'FORM', tool: 'photoshop_paint_regions', args: { document_id: 42 },
      preview: { sha256: n === 3 ? frame : `${scene.name}-${n}-sha`, document_id: 42 } });
    const rows = [record(1), record(2), record(3)];
    const state: any = { painting_profile: scene.profile, original_brief: scene.brief,
      document_incarnation_id: 'quality-fixture:one', process_dir: 'processes/fixture/run',
      construction_policy: 'enforced', current_frame: { sha256: frame, accepted: true },
      last_critique: { target_resolved: 'yes', primitive_footprint: 'none' } };
    const request = chatCriticRequest(rows[2], state, rows)!;
    expect(request).toMatchObject({ required: true, scope: 'whole-scene-against-original-brief' });
    const criteria = Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key => [key,
      key === scene.criterion ? 'fail' : 'pass']));
    const relation = scene.name === 'tiger'
      ? { id: scene.problem, kind:'anatomy', part_ids:['head','torso'],
        expected:'The tiger head and neck should join the torso with recognizable feline proportions.',
        visible:scene.visible, status:'fail' }
      : scene.name === 'banana fingers'
        ? { id: scene.problem, kind:'interaction', part_ids:['hand','banana'],
          expected:'The visible fingers should wrap around the banana peel in a believable grip.',
          visible:scene.visible, status:'fail' }
        : { id:'islands-bridge-placement', kind:'spatial', part_ids:['islands','bridge'],
          expected:'The connecting bridge must meet two separate floating island masses in depth.',
          visible:'The island and bridge silhouettes are visibly connected and occupy separate overlapping planes.',
          status:'pass' };
    const review = validateChatCritic({ request_id: request.request_id, reviewer: 'same-chat-role',
      criteria, visual_relationships:[relation],
      findings: [
        ...(scene.criterion === 'contact_and_protection' ? [] : [{ criterion: 'contact_and_protection',
          visible: 'The main object has leg or fixture support and a visible, balanced contact.',
          next_change: 'Preserve visible support and balanced contact as other scene defects are repaired.' }]),
        { criterion: scene.criterion, correction_kind: 'form', structural_defect: {
          id: scene.problem, kind: scene.kind, visible: scene.visible,
          part_ids: relation.id === scene.problem ? relation.part_ids : ['city'],
          relation_ids: [scene.problem],
          brief_relevance: 'This relation is required by the original brief and style.',
          recheck: scene.change,
        }, visible: scene.visible, next_change: scene.change },
      ],
    }, request, rows[2], state)!;
    const persisted = { ...state, ...persistChatCritic(state, review) };
    persisted.painting_completion = bindPaintingCompletion({ scope: 'whole-brief',
      summary: 'Painter claims that the entire current scene now satisfies the brief.',
      criteria: Object.fromEntries(COMPLETION_CRITERIA.map(key => [key, 'pass'])),
    }, persisted, frame);
    const outcome = wholeBriefCompletionContract(persisted, 'ready');
    expect(outcome).toMatchObject({ status: 'incomplete', completion_allowed: false,
      evidence: { critic_role_approved: false, critic_independent: false } });
    expect(outcome.reasons).toContain('chat_critic_scene_unfinished');
    expect(persisted.chat_critic_findings.map((row: any) => row.problem_id)).toContain(scene.problem);
    expect(review.brief_sha256).toBe(createHash('sha256').update(scene.brief).digest('hex'));
  });
});
