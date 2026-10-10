import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { chatCriticRequest, validateChatCritic, persistChatCritic, CHAT_CRITIC_CRITERIA, criticSpawnHandoff } from '../src/core/guard/chat-critic.js';
import { documentArtisticDebt, artisticContinuation } from '../src/core/guard/document-artistic-debt.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { projectGuardDiagnostics } from '../src/core/guard/response-budget.js';
const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const state = () => ({ painting_profile: 'nontrivial_painting', original_brief: 'Painterly scene with a lit room and arbitrary subject', document_incarnation_id: 'stable:one' });
const record = (n: number, stage = 'GLOBAL_BLOCK_IN'): any => ({ id: 'pass-'+n, sequence: n, stage,
  tool: 'photoshop_paint_regions', phase: 'completed', visual: true, args: { document_id: 42 },
  preview: { sha256: 'sha-'+n, document_id: 42, materialized_path: 'frame-'+n+'.jpg' } });
const records = (n: number) => Array.from({ length: n }, (_, i) => record(i+1));
const reply = (request: any, fail = false): any => ({ request_id: request.request_id, reviewer: 'same-chat-role',
  criteria: Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key => [key, fail && key === 'composition_context' ? 'fail' : 'pass'])),
  findings: fail ? [{ criterion: 'composition_context', visible: 'The wall remains one flat field without spatial light.', next_change: 'Build large lit and shadow planes joining the room to the subject.' }] : [] });
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
  expect(chatCriticRequest(record(1),{...s,painting_profile:'simple_graphic'},records(1))).toBeUndefined();
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
  const uncertain={...reply(newRequest),criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown']))};
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
    criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown']))},freshRequest,r,reopened)!;
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
    criteria:Object.fromEntries(CHAT_CRITIC_CRITERIA.map(key=>[key,'unknown']))},freshRequest,r,retained)!;
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
it('builds only an optional exact-image Core agents handoff without Painter explanations or forced model overrides', () => {
  const s=state(),r=record(3),request=chatCriticRequest(r,s,records(3))!;
  const handoff:any=criticSpawnHandoff(request,s,{...r,summary:'Painter says perfect',result:'successful tool logs'});
  expect(handoff.spawn_template).toMatchObject({action:'spawn',workers:[{label:'Critic'}]});
  const worker=handoff.spawn_template.workers[0];
  expect(worker.task).toContain('frame-3.jpg'); expect(worker.task).toContain(request.request_id);
  expect(worker.task).not.toContain('Painter says perfect');
  expect(worker).not.toHaveProperty('model'); expect(worker).not.toHaveProperty('reasoning_effort');
  expect(handoff.precondition).toContain('sleeping');
  expect(handoff.prepare_before_dispatch).toContain('complete original brief');
  expect(JSON.stringify(handoff)).not.toContain(s.original_brief);
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
    criteria:{...reply(request).criteria,editable_parts:'pass'}};
  const save={visual:false,args:{document_id:42}};
  expect(()=>f.runtime.store.finalWholeBriefReview({previous_visual_verdict:{painting_completion:completion}},save)).toThrow(/completion_conflict/);
  const before=f.runtime.store.read('pass-3').verdict;
  f.runtime.store.finalWholeBriefReview({previous_visual_verdict:{painting_completion:completion,critic_review:reply(request)}},save,true);
  expect(f.runtime.store.artRunState(42).chat_critic_findings).toHaveLength(0);
  expect(f.runtime.store.read('pass-3').verdict).toEqual(before);
});
