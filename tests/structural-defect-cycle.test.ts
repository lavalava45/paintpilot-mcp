import { expect, it } from 'vitest';
import { criticCorrectionIssue, correctionFinding, selectedCriticCorrection } from '../src/core/guard/critic-correction.js';
import { openCriticObligation } from '../src/core/guard/critic-obligations.js';
import { persistChatCritic } from '../src/core/guard/chat-critic.js';

it('honors ranked generic findings and component prerequisites without inventing a global form-before-material dependency', () => {
  const material = correctionFinding({ criterion: 'brief_fidelity', correction_kind: 'material',
    visible: 'The independent ground is still a flat field without stone faces.', next_change: 'Build stone faces first on the ground component.' });
  const facade = correctionFinding({ criterion: 'form_proportions', correction_kind: 'form',
    visible: 'The separate facade proportions still need a later correction.', next_change: 'After stone construction revise the facade proportions.' });
  const brush: any = { tool: 'photoshop_paint_strokes', impact_class: 'construct', visual_intent: 'mass',
    addresses_problem_ids: ['critic-brief_fidelity'], args: { strokes: [{ points: [{ x: 1, y: 1 }, { x: 8, y: 8 }] }] } };
  const state: any = { chat_critic_findings: [material, facade], critic_obligations: [
    { id: 'ground-base', criterion: 'brief_fidelity', parent_problem_id: material.problem_id,
      component_ids: ['ground'], depends_on_ids: [], status: 'pass', visible: 'The ground base is complete on the frame.' },
    { id: 'stone-faces', criterion: 'brief_fidelity', parent_problem_id: material.problem_id,
      component_ids: ['ground'], depends_on_ids: ['ground-base'], status: 'fail', visible: 'Stone faces are not yet visible.' },
  ] };
  expect(selectedCriticCorrection(state, brush)?.problem_id).toBe('stone-faces');
  expect(criticCorrectionIssue(state, brush)).toBeUndefined();
  expect(state.chat_critic_findings[1].problem_id).toBe('critic-form_proportions');
  expect(selectedCriticCorrection({ chat_critic_findings: [material, facade] }, brush)?.problem_id).toBe(material.problem_id);
  expect(selectedCriticCorrection({ ...state, chat_critic_findings: [facade, material] }, brush)?.problem_id).toBe(facade.problem_id);
  state.critic_obligations[0].status = 'unknown';
  brush.addresses_problem_ids = ['stone-faces'];
  const sibling = { ...state.critic_obligations[1], id: 'other-ready', depends_on_ids: [] };
  state.critic_obligations.unshift(sibling);
  expect(openCriticObligation(state, ['stone-faces'])?.id).toBe('ground-base');
  const childFirst = { critic_obligations: [state.critic_obligations.find((row: any) => row.id === 'stone-faces'),
    sibling, state.critic_obligations.find((row: any) => row.id === 'ground-base')] };
  expect(openCriticObligation(childFirst)?.id).toBe('ground-base');
  const legacy = { ...state, critic_obligations: state.critic_obligations.map((row: any) => {
    const { parent_problem_id, ...rest } = row; return { ...rest, status: 'pass' };
  }) };
  expect(selectedCriticCorrection(legacy)?.problem_id).toBe('critic-form_proportions');
  expect(selectedCriticCorrection(state, brush)?.problem_id).toBe('ground-base');
});

it('keeps unresolved structural Critic work ahead of material unless actual clips prove independence', () => {
  const form = correctionFinding({ criterion: 'form_proportions', correction_kind: 'form',
    visible: 'The joined construction has implausible component proportions.',
    next_change: 'Rebuild both form-bearing masses at the specified contact.',
    structural_defect: { id: 'bad-joint', kind: 'attachment', part_ids: ['left', 'right'],
      relation_ids: ['connection'], brief_relevance: 'The object must remain connected.',
      recheck: 'Check connection on new whole-scene pixels.',
      region_bounds: { left: 0, top: 0, right: 80, bottom: 80 } } });
  const material = correctionFinding({ criterion: 'light_material', correction_kind: 'material',
    visible: 'A separate distant surface has no material definition.',
    next_change: 'Shade only the distant background material.' });
  const state = { chat_critic_findings: [material, form] };
  const request: any = { tool: 'photoshop_execute_visual_microplan',
    addresses_problem_id: 'critic-light_material', impact_class: 'construct',
    args: { steps: [{ tool: 'photoshop_paint_regions', args: { regions: [
      { contours: [{ points: [{ x: 85, y: 85 }, { x: 95, y: 85 }, { x: 95, y: 95 }] }] }],
    } }] } };
  expect(selectedCriticCorrection(state, request)?.problem_id).toBe('bad-joint');
  expect(criticCorrectionIssue(state, request)?.code).toBe('critic_structural_priority_required');
  request.independent_region = true;
  request.preservation_facts = ['The structural joint is fully outside the painting clip.'];
  request.args.steps[0].args.clip_bounds = { left: 85, top: 85, right: 100, bottom: 100 };
  expect(selectedCriticCorrection(state, request)?.problem_id).toBe('critic-light_material');
  expect(criticCorrectionIssue(state, request)).toBeUndefined();
  request.args.steps[0].args.clip_bounds.left = 70;
  request.args.steps[0].args.clip_bounds.top = 70;
  expect(criticCorrectionIssue(state, request)?.code).toBe('critic_structural_priority_required');
  request.addresses_problem_ids = ['bad-joint', 'critic-light_material'];
  expect(selectedCriticCorrection(state, request)?.problem_id).toBe('bad-joint');
  expect(criticCorrectionIssue(state, request)?.code).not.toBe('critic_structural_priority_required');
  // Explicitly linking the structural defect does not waive its geometry/recheck gate.
  expect(criticCorrectionIssue(state, request)?.code).toBe('structural_correction_target_missing');
});

it('rejects cosmetic fixes, admits relevant geometric work and retains three generic defects until visual recheck', () => {
  for (const [kind, relation, tool] of [
    ['relative-size', 'length-ratio', 'photoshop_paint_regions'],
    ['attachment', 'joint-alignment', 'photoshop_paint_strokes'],
    ['support-contact', 'support-gap', 'photoshop_transform_layer'],
  ]) {
    const id = `structural-${kind}`;
    const defect = {
      id, kind, visible: 'The rendered components violate their intended visual relationship.',
      part_ids: ['part-a', 'part-b'], relation_ids: [relation],
      brief_relevance: 'The original brief depends on this specific relationship.',
      recheck: 'Inspect the exact new pixels for restored part relationships.',
    };
    const finding = correctionFinding({ criterion: 'form_proportions', correction_kind: kind === 'support-contact' ? 'contact' : 'form',
      visible: defect.visible, next_change: defect.recheck, structural_defect: defect });
    const state = { chat_critic_findings: [finding] };
    const plan = { defect_id: id, part_ids: ['part-a'], relation_ids: [relation],
      target: 'Rebuild the authored relative positions with a small visual tolerance.',
      execution: tool === 'photoshop_transform_layer' ? 'transform' : 'brush',
      sequence: 'partial-rebuild' };
    const atoms = [{ tool, args: tool === 'photoshop_transform_layer'
        ? { translation: { x: 3, y: -2 } }
        : tool === 'photoshop_paint_strokes'
          ? { strokes: [{ points: [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 4, y: 7 }] }] }
          : { regions: [{ contours: [{ points: [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 4, y: 7 }] }] }] } }];
    const cosmetic = { tool: 'photoshop_execute_visual_microplan', impact_class: 'texture',
      structural_correction: plan, args: { steps: atoms } };
    expect(criticCorrectionIssue(state, cosmetic)?.code).toBe('critic_correction_method_mismatch');
    const corrected = { ...cosmetic, impact_class: 'construct' };
    expect(criticCorrectionIssue(state, corrected)).toBeUndefined();
    expect(criticCorrectionIssue(state, { ...corrected, structural_correction: { ...plan, relation_ids: ['unrelated'] } })?.code)
      .toBe('structural_correction_target_missing');
    const review = { document_id: 1, document_incarnation_id: 'doc', brief_sha256: 'brief',
      operation_id: 'post-paint', frame_sha256: 'exact-after', criteria: { form_proportions: 'fail' },
      findings: [{ ...finding, structural_defect: defect }] };
    const persisted = persistChatCritic({}, review);
    expect(persisted.visual_problems[id].status).toBe('open');
    const generalPass = persistChatCritic(persisted, {
      ...review, operation_id: 'general-review', frame_sha256: 'new-after',
      criteria: { form_proportions: 'pass' }, findings: [],
    });
    expect(generalPass.visual_problems[id].status).toBe('open');
    expect(selectedCriticCorrection(generalPass)?.problem_id).toBe(id);
    const actualPass = persistChatCritic(generalPass, {
      ...review, operation_id: 'specific-review', frame_sha256: 'verified-after',
      criteria: { form_proportions: 'pass' },
      findings: [{ ...finding, structural_defect: defect,
        visible: 'The new pixels now show the repaired authored relation between parts.',
        next_change: 'Preserve the rechecked relation while continuing the image.' }],
    });
    expect(actualPass.visual_problems[id].status).toBe('resolved');
  }
});
