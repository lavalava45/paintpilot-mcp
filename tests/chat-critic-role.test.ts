import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { chatCriticRequest, validateChatCritic, persistChatCritic, CHAT_CRITIC_CRITERIA, criticSpawnHandoff, supportContactWeightInstruction, SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION } from '../src/core/guard/chat-critic.js';
import { documentArtisticDebt, artisticContinuation } from '../src/core/guard/document-artistic-debt.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { projectGuardDiagnostics } from '../src/core/guard/response-budget.js';
import { selectedCriticCorrection, criticCorrectionIssue } from '../src/core/guard/critic-correction.js';
import { VISUAL_RELATIONSHIP_REVIEW_VERSION } from '../src/core/guard/visual-relationship-review.js';
import { openCriticObligation } from '../src/core/guard/critic-obligations.js';
const dirs: string[] = [];
it('regression: admits substantive brush construction on an existing semantic component for missing-object and form findings', () => {
  const request: any = { tool: 'photoshop_execute_visual_microplan', impact_class: 'construct', visual_intent: 'line',
    args: { stage: 'GLOBAL_BLOCK_IN', logical_layer: { hypothesis_id: 'frame', layer_id: 2 }, steps: [
      { tool: 'photoshop_paint_strokes', args: { layer_id: 2, strokes: [{ points: [{ x: 1, y: 2 }, { x: 7, y: 9 }] }] } },
    ] } };
  const base: any = { logical_layer_owners: [{ hypothesis_id: 'frame', layer_id: 2 }],
    scene_ownership_plan: { units: [{ semantic_id: 'frame', owner_id: 'frame' }],
      objects: [{ component_semantic_ids: ['frame'] }] } };
  for (const kind of ['missing-object', 'form']) {
    const s = { ...base, chat_critic_findings: [{ criterion: 'brief_fidelity', problem_id: 'critic-brief_fidelity',
      correction_kind: kind, visible: 'The structural contour is absent or wrong.', next_change: 'Rebuild the actual structural contour.' }] };
    expect(criticCorrectionIssue(s, request)).toBeUndefined();
    const cosmetic = structuredClone(request); cosmetic.impact_class = 'texture';
    expect(criticCorrectionIssue(s, cosmetic)?.code).toBe('critic_correction_method_mismatch');
  }
});
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const state = () => ({ painting_profile: 'nontrivial_painting', original_brief: 'Painterly scene with a lit room and arbitrary subject', document_incarnation_id: 'stable:one' });
const record = (n: number, stage = 'GLOBAL_BLOCK_IN'): any => ({ id: 'pass-'+n, sequence: n, stage,
  tool: 'photoshop_paint_regions', phase: 'completed', visual: true, args: { document_id: 42 },
  preview: { sha256: 'sha-'+n, document_id: 42, materialized_path: 'frame-'+n+'.jpg' } });
const records = (n: number) => Array.from({ length: n }, (_, i) => record(i+1));
const reply = (request: any, fail = false): any => ({ request_id: request.request_id, reviewer: 'same-chat-role',
  criteria: Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key => [key, fail && key === 'composition_context' ? 'fail' : 'pass'])),
  // Other tests exercise protocol identity/obligations using no real subject pixels.
  // Concrete figure/contact checks are asserted separately against named parts.
  visual_relationships: [{ id: 'fixture-no-visible-relation', kind: 'none', part_ids: ['test-frame'],
    expected: 'No visible relationship target is present in this contract-only synthetic frame.',
    visible: 'This synthetic 2px white image cannot demonstrate meaningful anatomical or support relations.',
    status: 'not-applicable' }],
  findings: [
    { criterion: 'contact_and_protection', visible: 'The subject rests on the floor; its feet meet it and its weight reads over that support.', next_change: 'Preserve the grounded contact and balanced pose while correcting other scene defects.' },
    ...(fail ? [{ criterion: 'composition_context', visible: 'The wall remains one flat field without spatial light.', next_change: 'Build large lit and shadow planes joining the room to the subject.' }] : [])] });

it('requires actual AFTER-visible relationship evidence and rejects an unlinked anatomical failure', () => {
  const s: any=state(), r=record(3), req=chatCriticRequest(r,s,records(3))!;
  expect(req.visual_relationship_review_version).toBe(VISUAL_RELATIONSHIP_REVIEW_VERSION);
  expect(req.visual_relationship_guidance).toContain('head-to-torso');
  const base=reply(req);
  expect(() => validateChatCritic({...base,visual_relationships:undefined},req,r,s)).toThrow(/visual_relationships_required/);
  const tigerRelation={ id:'tiger-head-torso', kind:'anatomy', part_ids:['head','torso'],
    expected:'The feline head must join a short neck and proportionate wide torso as specified in the brief.',
    visible:'On the actual AFTER the raised head appears tiny compared with an unnaturally elongated upright neck.',
    status:'fail' };
  const failure={...base,visual_relationships:[tigerRelation],
    criteria:{...base.criteria,form_proportions:'fail'},
    findings:[...base.findings,{criterion:'form_proportions',visible:tigerRelation.visible,
      next_change:'Replace the head and neck silhouette to read as a tiger instead of a giraffe.'}]};
  expect(() => validateChatCritic(failure,req,r,s)).toThrow(/visual_relationship_defect_required/);
  const defect={ id:tigerRelation.id, kind:'relative-size', visible:tigerRelation.visible,
    part_ids:['head','torso'],relation_ids:[tigerRelation.id],
    brief_relevance:'The original brief requires recognizable big-cat head-to-torso proportions.',
    recheck:'On the new AFTER verify the connected neck and head scale and contour.' };
  const valid=validateChatCritic({...failure,findings:[...base.findings,
    {...failure.findings[1],correction_kind:'form',structural_defect:defect}]},req,r,s)!;
  expect(valid).toMatchObject({frame_sha256:r.preview.sha256,
    visual_relationship_review_version:VISUAL_RELATIONSHIP_REVIEW_VERSION,
    visual_relationships:[{id:tigerRelation.id,status:'fail'}]});
  const retained={...s,...persistChatCritic(s,valid)};
  expect(retained.visual_problems[tigerRelation.id].status).toBe('open');
  expect(retained.visual_problems[tigerRelation.id].visual_relationship_kind).toBe('anatomy');
  const changed=record(4),next=chatCriticRequest(changed,retained,records(4))!;
  const unknown={...reply(next),criteria:{...reply(next).criteria,form_proportions:'unknown'},
    visual_relationships:[{...tigerRelation,status:'unknown'}]};
  expect(persistChatCritic(retained,validateChatCritic(unknown,next,changed,retained)!).visual_problems[tigerRelation.id].status)
    .toBe('open');
  const premature={...reply(next),visual_relationships:[{...tigerRelation,status:'pass',
    visible:'The AFTER now shows a shorter neck and a proportionate wide cat torso; head is aligned above the shoulders.'}]};
  expect(() => validateChatCritic(premature,next,changed,retained)).toThrow(/recheck_required/);
  const recheckedFinding={
    criterion:'form_proportions',structural_defect:defect,
    visible:'The newly rebuilt head and neck visibly connect at the shoulders and match the wider torso proportions.',
    next_change:'Preserve this checked head-to-torso silhouette and cat-like neck proportion.'};
  expect(() => validateChatCritic({...reply(next),findings:[...reply(next).findings,recheckedFinding]},
    next,changed,retained)).toThrow(/visual_relationship_recheck_required/);
  const verified=validateChatCritic({...premature,findings:[...premature.findings,recheckedFinding]},
    next,changed,retained)!;
  expect(persistChatCritic(retained,verified).visual_problems[tigerRelation.id].status).toBe('resolved');
});

it('checks visible hand-to-object contact and object support without a native geometric pass being enough', () => {
  const s: any={...state(),painting_profile:'simple_graphic'},r=record(3),req=chatCriticRequest(r,s,records(3))!;
  const base=reply(req),hand={id:'fingers-to-peel',kind:'interaction',part_ids:['fingers','banana-peel'],
    expected:'Fingers should wrap around the peel at opposing contact points rather than float above it.',
    visible:'The curled fingertip contours overlap the peel edge incorrectly and the actual grip appears disconnected.',
    status:'fail'},support={id:'body-to-floor',kind:'support',part_ids:['body','floor'],
    expected:'The resting body should meet its supporting floor or justify suspension in the brief.',
    visible:'The cropped subject and floor are not both visible; no load-bearing contact can be assessed.',
    status:'unknown'};
  const bad={...base,criteria:{...base.criteria,contact_and_protection:'pass'},visual_relationships:[hand,support]};
  expect(() => validateChatCritic(bad,req,r,s)).toThrow(/criteria_conflict/);
  const defect={id:hand.id,kind:'attachment',visible:hand.visible,
    part_ids:hand.part_ids,relation_ids:[hand.id],
    brief_relevance:'The hand must visibly grasp the banana in the original eating scene.',
    recheck:'Verify finger and peel overlap on the next delivered frame.'};
  const failed={...bad,criteria:{...base.criteria,contact_and_protection:'fail'},
    findings:[{criterion:'contact_and_protection',correction_kind:'contact',
      visible:hand.visible,next_change:'Rebuild the gripping fingers and peel contact.',structural_defect:defect}]};
  expect(validateChatCritic(failed,req,r,s)?.visual_relationships).toHaveLength(2);
  const noPixels={...failed,visual_relationships:[{...hand,visible:'tool ok'}]};
  expect(() => validateChatCritic(noPixels,req,r,s)).toThrow(/visual_relationship_invalid/);
});

it('does not allow none to bypass anatomy and support checks for a declared compound animal', () => {
  const s:any={...state(),original_brief:'A deliberately stylized flying animal against the sky',
    scene_ownership_plan:{objects:[{object_id:'animal',kind:'compound-object',subject_kind:'animal',
      component_semantic_ids:['head','torso']}]}}, r=record(3);
  const req=chatCriticRequest(r,s,records(3))!;
  expect(req.visual_relationship_required_kinds).toEqual(['anatomy','support']);
  expect(() => validateChatCritic(reply(req),req,r,s)).toThrow(/coverage_required/);
  const reviewed={...reply(req),criteria:{...reply(req).criteria,form_proportions:'unknown'},
    visual_relationships:[
      {id:'animal-head-torso',kind:'anatomy',part_ids:['head','torso'],
        expected:'The visible head and torso should connect with a plausible stylized animal neck.',
        visible:'The head has not yet been painted, so the relationship cannot be visually assessed.',
        status:'unknown'},
      {id:'animal-support',kind:'support',part_ids:['animal','ground'],
        expected:'An airborne animal can be suspended without floor contact under this explicit brief.',
        visible:'The animal is flying in an empty sky, so there is intentionally no ground support.',
        status:'not-applicable'},
    ],
    findings:[{criterion:'contact_and_protection',
      visible:'The flying animal is intentionally suspended in the sky without a visible supporting surface.',
      next_change:'Preserve the intended airborne composition and do not invent a floor.'}]};
  expect(validateChatCritic(reviewed,req,r,s)).toMatchObject({
    criteria:{form_proportions:'unknown'},visual_relationships:[{status:'unknown'},{status:'not-applicable'}]});
});

it('advances a compound Critic finding only after frame-bound prerequisite review and invalidates touched components', () => {
  const s: any = state(), first = record(3), request = chatCriticRequest(first, s, records(3))!;
  const obligations = [
    { id: 'intermediate-architecture', criterion: 'composition_context', component_ids: ['house-owner'],
      depends_on_ids: [], status: 'fail', visible: 'The middle-depth building mass does not yet establish readable perspective.' },
    { id: 'stone-paving', criterion: 'composition_context', component_ids: ['paving-owner'],
      depends_on_ids: ['intermediate-architecture'], status: 'fail', visible: 'The paving planes are absent and their depth order is not yet visible.' },
  ];
  const initial = { ...reply(request, true), obligations };
  const initialReview = validateChatCritic(initial, request, first, s)!;
  const retained: any = { ...s, ...persistChatCritic(s, initialReview, first) };
  expect(openCriticObligation(retained)?.id).toBe('intermediate-architecture');
  const house = { ...record(4), args: { document_id: 42, logical_layer: { hypothesis_id: 'house-owner' } } };
  const secondRequest = chatCriticRequest(house, retained, [...records(3), house])!;
  const next = { ...reply(secondRequest, true), obligations: [
    { ...obligations[0], status: 'pass', visible: 'On this delivered frame the middle-depth building mass has complete perspective and size relationships.' },
    { ...obligations[1], status: 'fail', visible: 'Paving remains unconstructed below the newly coherent intermediate architecture.' },
  ] };
  const checked = validateChatCritic(next, secondRequest, house, retained)!;
  const afterHouse: any = { ...retained, ...persistChatCritic(retained, checked, house) };
  expect(openCriticObligation(afterHouse)?.id).toBe('stone-paving');
  expect(afterHouse.critic_obligations.map((row: any) => row.status)).toEqual(['pass', 'fail']);
  expect(afterHouse.critic_obligations[0]).toMatchObject({ frame_sha256: house.preview.sha256, operation_id: house.id });
  const unknown: any = { ...afterHouse, critic_obligations: afterHouse.critic_obligations.map((row: any) =>
    row.id === 'intermediate-architecture' ? { ...row, status: 'unknown' } : row) };
  expect(openCriticObligation(unknown)?.id).toBe('intermediate-architecture');
  const premature = { ...reply(secondRequest, true), obligations: [{ ...obligations[1], status: 'pass',
    visible: 'Paving appears in the trial but its architecture prerequisite is unknown.' }] };
  expect(() => validateChatCritic(premature, secondRequest, house, unknown)).toThrow(/prerequisite_unresolved/);
  const changedHouse = { ...record(5), args: { document_id: 42, logical_layer: { hypothesis_id: 'house-owner' } } };
  const stale: any = { ...afterHouse, ...persistChatCritic(afterHouse, undefined, changedHouse) };
  expect(stale.critic_obligations[0].status).toBe('unknown');
  expect(openCriticObligation(stale)?.id).toBe('intermediate-architecture');
  expect(stale.critic_obligations[1].status).toBe('fail');
});
it('migrates a retained compound finding on the exact frame without reopening its passed prerequisite', () => {
  const s: any = { ...state(), chat_critic_findings: [{ criterion: 'brief_fidelity',
    correction_kind: 'form', problem_id: 'critic-brief_fidelity', visible: 'Both the furniture assembly and its material are missing.',
    next_change: 'Build the assembly first, then model its surface.' }] };
  const r = record(3), req = chatCriticRequest(r, s, records(3))!;
  expect(req.retained_findings[0].problem_id).toBe('critic-brief_fidelity');
  expect(req.obligation_contract.items.properties.correction_kind).toBeDefined();
  const response = { ...reply(req),
    criteria: { ...reply(req).criteria, brief_fidelity: 'fail' },
    findings: [...reply(req).findings, { criterion: 'brief_fidelity', correction_kind: 'form',
      visible: 'The assembly now reads, while its surface remains flat.',
      next_change: 'Review the assembly prerequisite and construct the material response.' }],
    obligations: [
    { id: 'assembly', parent_problem_id: 'critic-brief_fidelity', criterion: 'brief_fidelity', correction_kind: 'form',
      component_ids: ['assembly-owner'], depends_on_ids: [], status: 'pass', visible: 'The connected assembly is visibly complete on this exact frame.' },
    { id: 'surface', parent_problem_id: 'critic-brief_fidelity', criterion: 'brief_fidelity', correction_kind: 'material',
      component_ids: ['surface-owner'], depends_on_ids: ['assembly'], status: 'fail', visible: 'The surface remains a flat unshaded field on the delivered frame.' },
  ] };
  const reviewed = validateChatCritic(response, req, r, s)!;
  const after: any = { ...s, ...persistChatCritic(s, reviewed, r) };
  const brush: any = { impact_class: 'construct', visual_intent: 'mass', addresses_problem_ids: ['surface'],
    tool: 'photoshop_paint_strokes', args: { strokes: [{ points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] }] } };
  expect(selectedCriticCorrection(after, brush)).toMatchObject({ problem_id: 'surface', correction_kind: 'material' });
  expect(criticCorrectionIssue(after, brush)).toBeUndefined();
  expect(documentArtisticDebt(after)).toContain('chat_critic_scene_unfinished');
  const unrelated = { criterion: 'form_proportions', correction_kind: 'form', problem_id: 'unrelated-form',
    visible: 'A separate load-bearing assembly has broken proportions.', next_change: 'Rebuild that unrelated assembly before details.' };
  expect(selectedCriticCorrection({ ...after, chat_critic_findings: [unrelated, ...after.chat_critic_findings] }, brush)?.problem_id)
    .toBe('unrelated-form');
  after.critic_obligations[0].status = 'unknown';
  expect(selectedCriticCorrection(after, brush)?.problem_id).toBe('assembly');
  expect(criticCorrectionIssue(after, brush)?.code).toBe('critic_correction_method_mismatch');
  const allPassed: any = { ...after, critic_obligations: after.critic_obligations.map((row: any) => ({ ...row, status: 'pass' })),
    chat_critic_findings: [s.chat_critic_findings[0], { criterion: 'composition_context', correction_kind: 'composition',
      problem_id: 'other', visible: 'Another unrelated placement still needs correction.', next_change: 'Reposition the unrelated object.' }] };
  expect(selectedCriticCorrection(allPassed)?.problem_id).toBe('other');
});
it('requires visible support/contact/weight evidence for pass and retains fail or unknown as scene debt', () => {
  const s: any=state(), r=record(3), request=chatCriticRequest(r,s,records(3))!;
  expect(()=>validateChatCritic({...reply(request),findings:[]},request,r,s)).toThrow(/support_observation_required/);
  const grounded=validateChatCritic(reply(request),request,r,s)!;
  expect(grounded.support_review_version).toBe(SUPPORT_CONTACT_WEIGHT_REVIEW_VERSION);
  expect(persistChatCritic(s,grounded).chat_critic_findings).toEqual([]);
  const defect={...reply(request),criteria:{...reply(request).criteria,contact_and_protection:'fail'},
    findings:[{criterion:'contact_and_protection',visible:'The chair back overhangs its feet and the legs stop above the floor.',next_change:'Rebuild the leg contacts and shift the supporting footprint under the chair mass.'}]};
  const failed=validateChatCritic(defect,request,r,s)!;
  const retained={...s,...persistChatCritic(s,failed)};
  expect(documentArtisticDebt(retained)).toContain('chat_critic_scene_unfinished');
  expect(artisticContinuation(retained)).toContain('Rebuild the leg contacts');
  const uncertain={...reply(request),criteria:{...reply(request).criteria,contact_and_protection:'unknown'},findings:[]};
  expect(persistChatCritic(retained,validateChatCritic(uncertain,request,r,retained)).chat_critic_findings).toHaveLength(1);
  expect(()=>validateChatCritic(uncertain,request,r,retained,{criteria:reply(request).criteria})).toThrow(/completion_conflict/);
  const suspended={...reply(request),findings:[{criterion:'contact_and_protection',
    visible:'The lamp hangs from a taut cable above its mass; floor contact is inapplicable to this suspension.',
    next_change:'Preserve the cable connection and hanging balance requested in the brief.'}]};
  expect(validateChatCritic(suspended,request,r,s)?.criteria.contact_and_protection).toBe('pass');
});
it('old approvals cannot suppress the new support checkpoint and existing defect debt survives policy refresh', () => {
  const s: any=state(), r=record(3), request=chatCriticRequest(r,s,records(3))!;
  const legacy:any=validateChatCritic(reply(request,true),request,r,s)!;
  delete legacy.support_review_version;
  legacy.findings=legacy.findings.filter((f:any)=>f.criterion!=='contact_and_protection');
  const retained={...s,...persistChatCritic(s,legacy)};
  const fresh=chatCriticRequest(r,retained,records(3))!;
  expect(fresh).toMatchObject({required:true,trigger:'early-scene'});
  expect(()=>validateChatCritic(undefined,fresh,r,retained)).toThrow(/review_required/);
  const unknown={...reply(fresh),criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown'])),findings:[]};
  expect(persistChatCritic(retained,validateChatCritic(unknown,fresh,r,retained)).chat_critic_findings)
    .toMatchObject([{criterion:'composition_context'}]);
});

it('schedules early scene, bounded periodic, stage and final roles without a reviewer after every component', () => {
  const s: any = state();
  expect(chatCriticRequest(record(1),s,records(1))!.required).toBe(false);
  const request = chatCriticRequest(record(3),s,records(3))!;
  expect(request).toMatchObject({ required: true, trigger: 'early-scene', provider_call_required: false });
  s.chat_critic_review = validateChatCritic(reply(request),request,record(3),s);
  expect(chatCriticRequest(record(3),s,records(3))!.required).toBe(false);
  expect(chatCriticRequest(record(4),s,records(4))!.required).toBe(false);
  expect(chatCriticRequest(record(9),s,records(9))).toMatchObject({ required: true, trigger: 'scene-checkpoint' });
  expect(chatCriticRequest(record(4,'FORM'),s,[...records(3),record(4,'FORM')])).toMatchObject({ trigger: 'stage-boundary' });
  expect(chatCriticRequest(record(4),s,records(4),true)).toMatchObject({ required: true, trigger: 'final-review' });
  const simple = { ...state(), painting_profile: 'simple_graphic' };
  expect(chatCriticRequest(record(1),simple,records(1))).toMatchObject({ required: false, trigger: 'optional' });
  expect(chatCriticRequest(record(3),simple,records(3))).toMatchObject({ required: true, trigger: 'early-scene' });
  expect(chatCriticRequest(record(4,'FORM'),simple,[...records(3),record(4,'FORM')]))
    .toMatchObject({ required: true, trigger: 'stage-boundary' });
  expect(chatCriticRequest(record(4),simple,records(4),true))
    .toMatchObject({ required: true, trigger: 'final-review' });
  const simpleRequest = chatCriticRequest(record(3),simple,records(3))!;
  expect(() => validateChatCritic(undefined, simpleRequest, record(3), simple)).toThrow(/review_required/);
});
it('binds actual role responses to exact operation/frame/brief/incarnation and ignores transient witness timestamps', () => {
  const s: any = state(), r = record(3), request = chatCriticRequest(r,s,records(3))!;
  for (const changed of [chatCriticRequest({...r,id:'other'},s,[...records(3),{...r,id:'other'}]),
    chatCriticRequest({...r,preview:{...r.preview,sha256:'changed'}},s,records(3)),
    chatCriticRequest(r,{...s,original_brief:'Other intended style'},records(3)),
    chatCriticRequest(r,{...s,document_incarnation_id:'other'},records(3))]) {
    expect(() => validateChatCritic(reply(request),changed,r,s)).toThrow(/binding_mismatch/);
  }
  expect(chatCriticRequest(r,{...s,document_instance:{checked_at:'later'}},records(3))!.request_id).toBe(request.request_id);
  expect(() => validateChatCritic(undefined,request,r,s)).toThrow(/ALREADY delivered/);
});
it('never issues a Critic checkpoint for a superseded operation from a reused Photoshop document id', () => {
  const old = {...record(3), id:'old-pass-3'};
  const fresh = records(3).map(row => ({...row,id:`new-${row.id}`}));
  const current = {...state(),document_incarnation_id:'stable:reopened'};
  expect(chatCriticRequest(old,current,fresh)).toBeUndefined();
  expect(chatCriticRequest(old,current,fresh,true)).toBeUndefined();
  expect(chatCriticRequest(fresh[2],current,fresh)).toMatchObject({required:true,trigger:'early-scene'});
});
it('does not carry a Critic checkpoint across a reused Photoshop document id and new incarnation', () => {
  const s: any=state(), r=record(3), request=chatCriticRequest(r,s,records(3))!;
  const oldReview=validateChatCritic(reply(request),request,r,s)!;
  expect(oldReview).toMatchObject({document_id:42,document_incarnation_id:'stable:one'});
  const reopened={...s,document_incarnation_id:'stable:reopened',chat_critic_review:oldReview};
  const newRequest=chatCriticRequest(r,reopened,records(3))!;
  expect(newRequest).toMatchObject({required:true,trigger:'early-scene',document_incarnation_id:'stable:reopened'});
  expect(newRequest.request_id).not.toBe(request.request_id);
  expect(() => validateChatCritic(undefined,newRequest,r,reopened)).toThrow(/review_required/);
  const otherDocument={...s,chat_critic_review:oldReview};
  const changedRecord={...r,args:{document_id:77}};
  const newDocumentRecords=records(3).map(row=>({...row,args:{document_id:77}}));
  expect(chatCriticRequest(changedRecord,otherDocument,newDocumentRecords))
    .toMatchObject({required:true,trigger:'early-scene',document_id:77});
});
it('does not import previous-canvas Critic findings even when the original brief is identical', () => {
  const s: any=state(), oldRequest=chatCriticRequest(record(3),s,records(3))!;
  const oldReview=validateChatCritic(reply(oldRequest,true),oldRequest,record(3),s)!;
  const oldState={...s,...persistChatCritic(s,oldReview)};
  expect(oldState.chat_critic_findings).toHaveLength(1);
  const reopened={...oldState,document_incarnation_id:'stable:reopened'};
  const newRequest=chatCriticRequest(record(3),reopened,records(3))!;
  const uncertain={...reply(newRequest),criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown'])),findings:[]};
  const fresh=validateChatCritic(uncertain,newRequest,record(3),reopened)!;
  expect(persistChatCritic(reopened,fresh).chat_critic_findings).toEqual([]);
  // Historical reviews predating incarnation binding also cannot grant a checkpoint.
  const legacy={...oldReview};delete legacy.document_incarnation_id;
  expect(chatCriticRequest(record(3),{...s,chat_critic_review:legacy},records(3)))
    .toMatchObject({required:true,trigger:'early-scene'});
});
it('uses the stable host witness as incarnation when the caller has no explicit incarnation field', () => {
  const s: any={painting_profile:'nontrivial_painting',original_brief:state().original_brief,
    document_instance:{host_witness:{token:'host:old'}}};
  const r=record(3), oldRequest=chatCriticRequest(r,s,records(3))!;
  expect(oldRequest.document_incarnation_id).toBe('host:old');
  const oldReview=validateChatCritic(reply(oldRequest,true),oldRequest,r,s)!;
  const reopened={...s,document_instance:{host_witness:{token:'host:new'}},
    ...persistChatCritic(s,oldReview)};
  const freshRequest=chatCriticRequest(r,reopened,records(3))!;
  expect(freshRequest).toMatchObject({required:true,trigger:'early-scene',document_incarnation_id:'host:new'});
  expect(freshRequest.request_id).not.toBe(oldRequest.request_id);
  const freshReview=validateChatCritic({...reply(freshRequest),
    criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown'])),findings:[]},freshRequest,r,reopened)!;
  expect(persistChatCritic(reopened,freshReview).chat_critic_findings).toEqual([]);
});
it('does not treat an unknown document incarnation as permission to reuse Critic approvals or findings', () => {
  const s: any={painting_profile:'nontrivial_painting',original_brief:state().original_brief};
  const r=record(3), request=chatCriticRequest(r,s,records(3))!;
  expect(request.document_incarnation_id).toBeNull();
  const oldReview=validateChatCritic(reply(request,true),request,r,s)!;
  const retained={...s,...persistChatCritic(s,oldReview)};
  expect(chatCriticRequest(r,retained,records(3))).toMatchObject({required:true,trigger:'early-scene'});
  expect(() => validateChatCritic(undefined,chatCriticRequest(r,retained,records(3)),r,retained))
    .toThrow(/review_required/);
  const freshRequest=chatCriticRequest(r,retained,records(3))!;
  const freshReview=validateChatCritic({...reply(freshRequest),
    criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown'])),findings:[]},freshRequest,r,retained)!;
  expect(persistChatCritic(retained,freshReview).chat_critic_findings).toEqual([]);
});
it('rejects contradictory/missing findings and invented independent authority while admitting honest uncertainty', () => {
  const s=state(), r=record(3), request=chatCriticRequest(r,s,records(3))!;
  expect(() => validateChatCritic({...reply(request,true),findings:[]},request,r,s)).toThrow(/findings_required/);
  expect(() => validateChatCritic({...reply(request,true),criteria:reply(request).criteria},request,r,s)).toThrow(/findings_invalid/);
  expect(() => validateChatCritic({...reply(request),independent:true},request,r,s)).toThrow(/contract_invalid/);
  const unknown = {...reply(request),criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown']))};
  expect(validateChatCritic(unknown,request,r,s)).toMatchObject({ independent:false, validation:'same-chat-role-review' });
  expect(() => validateChatCritic(unknown,request,r,s,{criteria:reply(request).criteria})).toThrow(/completion_conflict/);
});
it('preserves background findings through local successes/saves and unknown rereview; clears only reassessed criteria', () => {
  const s: any=state(), r=record(3), request=chatCriticRequest(r,s,records(3))!;
  const critic=validateChatCritic(reply(request,true),request,r,s);
  const saved:any={...s,...persistChatCritic(s,critic),last_critique:{target_resolved:'yes',primitive_footprint:'none'}};
  expect(documentArtisticDebt(saved)).toContain('chat_critic_scene_unfinished');
  expect(artisticContinuation(saved)).toContain('Build large lit and shadow planes');
  const next=chatCriticRequest(record(4),saved,records(4))!;
  const uncertain={...reply(next),criteria:{...reply(next).criteria,composition_context:'unknown'}};
  const review=validateChatCritic(uncertain,next,record(4),saved);
  expect(persistChatCritic(saved,review).chat_critic_findings).toHaveLength(1);
  expect(persistChatCritic(saved,validateChatCritic(reply(next),next,record(4),saved)).chat_critic_findings).toHaveLength(0);
});
it('keeps historic structural and scene debts when upgrading from JSON-escaped to raw brief hash', () => {
  const s: any = state(), r = record(3), first = chatCriticRequest(r,s,records(3))!;
  const failed = validateChatCritic(reply(first,true),first,r,s)!;
  const legacy: any = { ...s, ...persistChatCritic(s,failed) };
  legacy.chat_critic_review = { ...legacy.chat_critic_review,
    brief_sha256: createHash('sha256').update(JSON.stringify(s.original_brief)).digest('hex') };
  const next = record(4), request = chatCriticRequest(next,legacy,records(4))!;
  expect(request.required).toBe(true);
  const uncertain = { ...reply(request), criteria: { ...reply(request).criteria, composition_context:'unknown' } };
  const review = validateChatCritic(uncertain,request,next,legacy)!;
  expect(persistChatCritic(legacy,review).chat_critic_findings)
    .toMatchObject([{ criterion:'composition_context' }]);
});
it('escalates repeated exact-frame structural Critic failures despite locally successful corrections', () => {
  const defect = {
    id: 'hand-banana-contact', kind: 'attachment',
    visible: 'The index finger does not actually meet the banana peel.',
    part_ids: ['hand', 'banana'], relation_ids: ['finger-peel-contact'],
    brief_relevance: 'The hand must plausibly grip the banana.',
    recheck: 'Verify visible contact and overlap of finger and banana peel.',
  };
  const initial: any = state();
  const firstRecord = record(3);
  const firstReq = chatCriticRequest(firstRecord, initial, records(3))!;
  const failure = (request: any) => ({ ...reply(request),
    criteria: { ...reply(request).criteria, form_proportions: 'fail' },
    findings: [...reply(request).findings, { criterion: 'form_proportions', correction_kind: 'form',
      structural_defect: defect, visible: defect.visible, next_change: defect.recheck }],
  });
  const firstReview = validateChatCritic(failure(firstReq), firstReq, firstRecord, initial)!;
  const afterFirst: any = { ...initial, ...persistChatCritic(initial, firstReview) };
  expect(afterFirst.critic_scene_failures[defect.id].consecutive_failed_frames).toBe(1);
  const secondRecord = record(4), secondReq = chatCriticRequest(secondRecord, afterFirst, records(4))!;
  const secondReview = validateChatCritic(failure(secondReq), secondReq, secondRecord, afterFirst)!;
  const afterSecond: any = { ...afterFirst, ...persistChatCritic(afterFirst, secondReview),
    critic_correction_attempts: { [defect.id]: {
      outcome: 'local-gain-whole-defect-still-open', method_family: 'photoshop_paint_regions',
    } },
  };
  expect(afterSecond.critic_scene_failures[defect.id].consecutive_failed_frames).toBe(2);
  // Re-reviewing the same stored pixels does not manufacture another failure.
  const sameFrame = persistChatCritic(afterSecond, secondReview);
  expect(sameFrame.critic_scene_failures[defect.id].consecutive_failed_frames).toBe(2);
  const req: any = { tool: 'photoshop_execute_visual_microplan', impact_class: 'construct', visual_intent: 'mass',
    structural_correction: { defect_id: defect.id, part_ids: ['hand'],
      relation_ids: ['finger-peel-contact'], target: 'Move fingertip onto the peel edge.', execution: 'brush' },
    args: { steps: [{ tool: 'photoshop_paint_regions', args: { regions: [{
      contours: [{ points: [{x:1,y:1},{x:4,y:1},{x:3,y:5}] }],
    }] } }] },
  };
  expect(criticCorrectionIssue(afterSecond, req)?.code).toBe('critic_scene_strategy_switch_required');
  const replaced = structuredClone(req);
  replaced.args.steps[0].args.replace_contents = true;
  expect(criticCorrectionIssue(afterSecond, replaced)).toBeUndefined();
  const passed = { ...reply(secondReq), findings: [...reply(secondReq).findings,
    { criterion: 'form_proportions', structural_defect: defect,
      visible: 'The fingertip meets and overlaps the peel without an unexplained gap.',
      next_change: 'Preserve this anatomically plausible finger contact.' }] };
  const accepted = validateChatCritic(passed, secondReq, secondRecord, afterSecond)!;
  expect(persistChatCritic(afterSecond, accepted).critic_scene_failures[defect.id]).toBeUndefined();
});
it('builds only an optional exact-image Core agents handoff without Painter explanations or forced model overrides', () => {
  const s=state(),r=record(3),request=chatCriticRequest(r,s,records(3))!;
  const handoff:any=criticSpawnHandoff(request,s,{...r,summary:'Painter says perfect',result:'successful tool logs'});
  expect(handoff.spawn_template).toMatchObject({action:'spawn',workers:[{label:'Critic'}]});
  const worker=handoff.spawn_template.workers[0];
  expect(worker.task).toContain('frame-3.jpg'); expect(worker.task).toContain(request.request_id);
  expect(worker.task).not.toContain('Painter says perfect');
  expect(worker.task).toContain(supportContactWeightInstruction('en'));
  expect(worker).not.toHaveProperty('model'); expect(worker).not.toHaveProperty('reasoning_effort');
  expect(handoff.precondition).toContain('sleeping');
  expect(handoff.prepare_before_dispatch).toContain('complete original brief');
  expect(JSON.stringify(handoff)).not.toContain(s.original_brief);
});
it('ordinary simple-profile review requests the same whole-scene Critic without extra images', async () => {
  const f=fixture();
  f.runtime.store.updatePaintingState(42,current=>({...current,painting_profile:'simple_graphic'}));
  const result:any=await f.review.handler({operation_id:'pass-3'});
  const body=JSON.parse(result.content[0].text);
  expect(body.artistic_review.critic_role).toMatchObject({required:true,trigger:'early-scene'});
  expect(body.artistic_review.instruction).toContain(supportContactWeightInstruction('en'));
  expect(result.content.filter((x:any)=>x.type==='image')).toHaveLength(1);
  expect(f.evaluate).not.toHaveBeenCalled();
});
function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chat-critic-'));dirs.push(dir);
  const frame=path.join(dir,'frame.jpg');
  fs.writeFileSync(frame,jpeg.encode({width:2,height:2,data:Buffer.alloc(16,255)}).data);
  const sha=createHash('sha256').update(fs.readFileSync(frame)).digest('hex');
  const evaluate=vi.fn(), prepare=vi.fn();
  const runtime=new EmbeddedGuardRuntime(new ToolRegistry(),{runtimeDirectory:path.join(dir,'runtime'),workspaceRoot:dir,artisticEvaluator:{evaluate,prepare}});
  runtime.store.observeDocumentInstance(42,{protocol:'photoshop.uxp.document_instance_witness.v1',session_id:'test',token:'test:1'});
  runtime.store.setArtRunState({document_id:42,process_dir:'processes/chat-critic-process/run-01',original_brief:state().original_brief});
  for (let n=1;n<=3;n++) runtime.store.write({...record(n),created_at:new Date().toISOString(),
    preview:{document_id:42,materialized_path:frame,sha256:sha,width:2,height:2},
    ...(n<3?{verdict:{sha256:sha,disposition:'accept',target_resolved:'yes',at:new Date().toISOString()}}:{})});
  const review=createGuardTools(runtime).find(x=>x.tool.name==='photoshop_guard_review_image')!;
  return {runtime,review,evaluate,prepare};
}
it('the durable store does not resurrect superseded journal images as current Critic evidence', () => {
  const f=fixture();
  expect(f.runtime.store.chatCriticRequest('pass-3')).toMatchObject({required:true,trigger:'early-scene'});
  f.runtime.store.updatePaintingState(42,current=>({...current,
    document_instance:{...current.document_instance,superseded_through_sequence:3}}));
  expect(f.runtime.store.currentDocumentRecords(42)).toEqual([]);
  expect(f.runtime.store.chatCriticRequest('pass-3')).toBeUndefined();
  const fresh={...f.runtime.store.read('pass-3'),id:'fresh-pass-4',sequence:4};
  f.runtime.store.write(fresh);
  expect(f.runtime.store.chatCriticRequest('fresh-pass-4')).toMatchObject({required:false,trigger:'optional'});
});
it('actual review delivery and compact projection retain Critic role/public schema and never invoke a local provider', async () => {
  const f=fixture(),result:any=await f.review.handler({operation_id:'pass-3'});
  const body=JSON.parse(result.content[0].text);
  expect(body.artistic_review.critic_role).toMatchObject({required:true,trigger:'early-scene',default_reviewer:'same-chat-role'});
  expect(body.next_required_action).toContain('Switch to Critic');
  const compact:any=projectGuardDiagnostics(body,f.runtime.runtimeDirectory,{operation_id:'pass-1',sha256:'brief-hash'});
  expect(compact.artistic_review.instruction).toContain('Switch to Critic');
  expect(compact.artistic_review.instruction).toContain(supportContactWeightInstruction('en', true));
  expect(supportContactWeightInstruction('ru', true)).toContain('баланс веса');
  expect(compact.artistic_review.critic_role.request_id).toBe(body.artistic_review.critic_role.request_id);
  expect(result.content.filter((x:any)=>x.type==='image')).toHaveLength(1);
  const cycle=createGuardTools(f.runtime).find(x=>x.tool.name==='photoshop_guard_cycle_auto')!;
  expect(JSON.stringify(cycle.tool.inputSchema)).toContain('critic_review');
  expect(f.evaluate).not.toHaveBeenCalled(); expect(f.prepare).not.toHaveBeenCalled();
});
it('compact compiler carries the separate Critic judgment into the ordinary closure without an extra call', async () => {
  const f=fixture(),request=f.runtime.store.chatCriticRequest('pass-3')!,critic=reply(request,true);
  const closure=vi.spyOn(f.runtime.store,'collectClosePreviousErrors').mockReturnValue([]);
  const compiled=await compileGuardCycle({previous_operation_id:'pass-3',previous_observation:{
    observed:'The latest component improved but the room remains flat.',target:'resolved',critic_review:critic}},f.runtime.store,f.runtime.registry);
  expect(closure).toHaveBeenCalledWith(expect.objectContaining({previous_visual_verdict:expect.objectContaining({critic_review:critic})}));
  expect(compiled.input.previous_visual_verdict).toMatchObject({critic_review:critic});
  expect(f.runtime.store.read('pass-3').verdict).toBeUndefined();
});
function retainedFixture() {
  const f = fixture(), store = f.runtime.store;
  const r = store.read('pass-3');
  store.write({ ...r, report: { did: 'Completed the assembly', why: 'Establish the scene', result: 'Exact frame reviewed' },
    verdict: { sha256: r.preview.sha256, disposition: 'correct', target_resolved: 'no', at: new Date().toISOString() } });
  store.updatePaintingState(42, current => ({ ...current,
    current_frame: { operation_id: r.id, sha256: r.preview.sha256, accepted: false } }));
  return f;
}
it('re-evaluates a closed current frame after save through the real compiler/runtime without closing or painting again', async () => {
  const f = retainedFixture();
  await f.review.handler({ operation_id: 'pass-3', review_scope: 'whole-scene' });
  const store = f.runtime.store, r = store.read('pass-3');
  const req = store.chatCriticRequest(r.id, undefined, true)!;
  const critic = store.validateChatCritic(r, { critic_review: reply(req, true) }, true);
  store.updatePaintingState(42, current => ({ ...current, ...persistChatCritic(current, critic, r) }));
  store.write({ id: 'save-4', created_at: new Date().toISOString(), sequence: 4, tool: 'photoshop_save_document', args: { document_id: 42 },
    phase: 'completed', visual: false, report: { did: 'Saved document', why: 'Keep the current scene', result: 'Saved exact pixels' } });
  const before = store.read(r.id);
  const updated = { ...reply(req), criteria: { ...reply(req).criteria, brief_fidelity: 'fail' },
    findings: [...reply(req).findings, { criterion: 'brief_fidelity', correction_kind: 'material',
      visible: 'The assembly is complete but its surface still has no material response.', next_change: 'Construct material response on the independent surface.' }],
    obligations: [
      { id: 'built', criterion: 'brief_fidelity', correction_kind: 'form', parent_problem_id: 'critic-brief_fidelity',
        component_ids: ['assembly'], depends_on_ids: [], status: 'pass', visible: 'The completed assembly is visible on the retained whole frame.' },
      { id: 'finish', criterion: 'brief_fidelity', correction_kind: 'material', parent_problem_id: 'critic-brief_fidelity',
        component_ids: ['surface'], depends_on_ids: ['built'], status: 'fail', visible: 'The surface remains flat without material response on this frame.' } ] };
  const projected = store.projectCriticClosure({ review_operation_id: r.id,
    previous_visual_verdict: { critic_review: updated } }, store.captureProjectionContext());
  expect(selectedCriticCorrection(projected.paintingState.documents['42'])).toMatchObject({ problem_id: 'finish', correction_kind: 'material' });
  expect(store.artRunState(42).chat_critic_findings[0].criterion).toBe('composition_context');
  const result: any = await f.runtime.cycleAuto({ review_operation_id: r.id,
    previous_observation: { observed: 'The assembly is complete; its material still needs construction.', target: 'unresolved', critic_review: updated } });
  expect(result.preflight_rejection).toBeUndefined();
  expect(result.closed_previous).toMatchObject({ closed: false, reviewed_current_frame: true, operation_id: r.id });
  expect(store.read(r.id)).toEqual(before);
  expect(store.records()).toHaveLength(4);
  expect(selectedCriticCorrection(store.artRunState(42))).toMatchObject({ problem_id: 'finish', correction_kind: 'material' });
  expect(f.evaluate).not.toHaveBeenCalled();
  const rejected: any = await f.runtime.cycleAuto({ review_operation_id: r.id,
    previous_observation: { observed: 'The retained assembly is complete but the surface is still flat.', target: 'unresolved', critic_review: updated },
    next_pass: { request_key: 'invalid-next', document_id: 42, goal: '', actions: [] } });
  expect(rejected.preflight_rejection).toBeDefined();
  expect(rejected.closed_previous).toMatchObject({ closed: false, reviewed_current_frame: true });
  expect(store.records()).toHaveLength(4);
  const saveInput: any = { previous_operation_id: 'save-4', previous_visual_verdict: { critic_review: updated } };
  expect(store.collectClosePreviousErrors(saveInput)).toEqual([]);
  store.closePreviousCycle(saveInput);
  expect(store.read(r.id)).toEqual(before);
  // Same-frame reassessment must not invalidate an already assessed prerequisite.
  const { correction_kind: _kind, parent_problem_id: _parent, ...surfaceUpdate } = updated.obligations[1];
  const repeat = { ...updated, obligations: [surfaceUpdate] };
  store.explicitCurrentFrameReview({ review_operation_id: r.id, previous_visual_verdict: { critic_review: repeat } }, true);
  expect(store.artRunState(42).critic_obligations[0].status).toBe('pass');
  expect(store.artRunState(42).critic_obligations[1]).toMatchObject({ correction_kind: 'material', parent_problem_id: 'critic-brief_fidelity' });
  expect(store.collectClosePreviousErrors({ previous_operation_id: r.id, previous_visual_verdict: { critic_review: repeat } })).toEqual([]);
  expect(store.closePreviousCycle({ previous_operation_id: r.id, previous_visual_verdict: { critic_review: repeat } }))
    .toMatchObject({ closed: false, reviewed_current_frame: true });
});
it('retained-frame review rejects stale, undelivered, rolled-back and newer uncertain evidence without persisting', async () => {
  const f = retainedFixture();
  await f.review.handler({ operation_id: 'pass-3', review_scope: 'whole-scene' });
  const store = f.runtime.store, r = store.read('pass-3'), req = store.chatCriticRequest(r.id, undefined, true)!;
  const input: any = { review_operation_id: r.id, previous_visual_verdict: { critic_review: reply(req) } };
  const original = store.artRunState(42);
  expect(() => store.explicitCurrentFrameReview({ ...input, review_operation_id: 'pass-2' }, true)).toThrow(/current_frame_review_stale/);
  expect(() => store.explicitCurrentFrameReview({ ...input, previous_operation_id: 'save-4' }, true)).toThrow(/conflict/);
  const delivery = vi.spyOn(store, 'visualDeliveryDebt').mockReturnValue({ pending: true } as any);
  expect(() => store.explicitCurrentFrameReview(input, true)).toThrow(/current_frame_review_stale/);
  delivery.mockRestore();
  store.write({ ...r, rolled_back: true });
  expect(store.chatCriticRequest(r.id)).toBeUndefined();
  expect(() => store.explicitCurrentFrameReview(input, true)).toThrow(/current_frame_review_stale/);
  store.write(r);
  store.write({ ...r, id: 'uncertain-4', sequence: 4, phase: 'uncertain', verdict: undefined, execution: 'uncertain' });
  expect(() => store.explicitCurrentFrameReview(input, true)).toThrow(/current_frame_review_stale/);
  expect(store.artRunState(42)).toEqual(original);
  store.write({ ...store.read('uncertain-4'), execution: 'not-executed', current_frame_authority: false });
  fs.writeFileSync(r.preview.materialized_path, 'wrong pixels');
  expect(() => store.explicitCurrentFrameReview(input, true)).toThrow(/current_frame_review_stale/);
  expect(store.artRunState(42)).toEqual(original);
});
it('store refuses an omitted checkpoint and a final save claiming pass over an unresolved Critic scene', async () => {
  const f=fixture();await f.review.handler({operation_id:'pass-3'});
  const r=f.runtime.store.read('pass-3'), request=f.runtime.store.chatCriticRequest(r.id)!;
  expect(()=>f.runtime.store.validateChatCritic(r,{})).toThrow(/review_required/);
  const validated=f.runtime.store.validateChatCritic(r,{critic_review:reply(request,true)});
  f.runtime.store.updatePaintingState(42,current=>({...current,...persistChatCritic(current,validated)}));
  expect(f.runtime.store.artisticContinuationContext(42).chat_critic.remaining_findings[0].criterion).toBe('composition_context');
  expect(()=>f.runtime.store.validateChatCritic(r,{painting_completion:{criteria:reply(request).criteria}},true)).toThrow(/completion_conflict/);
  const accepted=f.runtime.store.validateChatCritic(r,{critic_review:reply(request)});
  expect(accepted.independent).toBe(false);
});

it('ordinary verdict persists Critic findings and final saved-frame review cannot overwrite the original verdict', async () => {
  const f=fixture();await f.review.handler({operation_id:'pass-3'});
  const r=f.runtime.store.read('pass-3'),request=f.runtime.store.chatCriticRequest(r.id)!;
  const observation:any={id:r.id,preview_id:r.id,sha256:r.preview.sha256,
    observed_change:'The component is visible but the room remains a flat underpainting.',
    observations:[{region:'whole frame',visible:'The subject is built while large room-light relations remain absent.'}],
    primary_mismatch:'The room remains a flat underpainting.',verdict:'neutral',disposition:'correct',
    target_resolved:'no',regressions:[],uncertainty:'none observed',global_readability:'unknown',
    primitive_footprint:'acceptable',trend_signals:[],critic_review:reply(request,true)};
  f.runtime.store.verdict(observation);
  expect(f.runtime.store.artRunState(42).chat_critic_findings[0].criterion).toBe('composition_context');
  const original=f.runtime.store.read('pass-3').verdict;
  // A retained test frame permits final review after a nonvisual save; no Photoshop action is run.
  f.runtime.store.write({...f.runtime.store.read('pass-3'),verdict:{...original,disposition:'accept'}});
  f.runtime.store.updatePaintingState(42,current=>({...current,current_frame:{operation_id:r.id,sha256:r.preview.sha256,accepted:true}}));
  const completion={scope:'whole-brief',summary:'Exact current scene is assessed against the original task',
    criteria:{...reply(request).criteria,editable_parts:'unknown'}}; // No owner map in this fixture; never invent editability proof.
  const save={visual:false,args:{document_id:42}};
  expect(()=>f.runtime.store.finalWholeBriefReview({previous_visual_verdict:{painting_completion:completion}},save)).toThrow(/completion_conflict/);
  const before=f.runtime.store.read('pass-3').verdict;
  f.runtime.store.finalWholeBriefReview({previous_visual_verdict:{painting_completion:completion,critic_review:reply(request)}},save,true);
  expect(f.runtime.store.artRunState(42).chat_critic_findings).toHaveLength(0);
  expect(f.runtime.store.read('pass-3').verdict).toEqual(before);
});
