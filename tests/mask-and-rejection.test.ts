import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, expect, it, vi } from 'vitest';
import { createPaintingTools, strokeExecutionBudget } from '../src/tools/painting-tools.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { PreviewBarriers } from '../src/core/preview-barriers.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import type { PhotoshopBackendRouter } from '../src/platform/photoshop-backend.js';
import type { PhotoshopConnection } from '../src/platform/connection.js';
const bridge = vi.hoisted(() => ({ paint: vi.fn() }));
vi.mock('../src/platform/uxp-bridge-client.js', async original => ({
  ...await original<typeof import('../src/platform/uxp-bridge-client.js')>(), invokeUxpPaintStrokes: bridge.paint,
}));
const json = (r: {content: Array<{type:string;text?:string}>}) => JSON.parse(r.content.find(x=>x.type==='text')!.text!);
const result = (body: unknown, error=false) => ({content:[{type:'text' as const,text:JSON.stringify(body)}],...(error?{isError:true}:{})});
const mark = {tool:'BRUSH',size:26,opacity:66,flow:46,color:{red:0,green:0,blue:0},points:[{x:10,y:10},{x:20,y:20}]};
const {color: _eraserColor, ...eraserStyle} = mark;
const eraserMark = {...eraserStyle, tool:'ERASER'};
const args = {document_id:42,layer_id:7,paint_target:'layer-mask',strokes:[mark]};
const plan = {plan_id:'mask-pass',summary:'Refine the road edge',stage:'MEDIUM_FORM',scale:'medium',region:'road',
 intent:'Restore coherent bank shape',method_class:'paint',risk:'low',expected_visual_delta:'The road edge joins the bank.',
 verification_envelope:{mode:'after_only'},layer_separation_check:{change_kind:'continuation',substantial:true,rollback_value:'low',independent_adjustment_expected:false,reasons:['Continue the existing road owner.']},
 action_class:'REFINE',expected_visual_result:'A coherent road edge',document_id:42,
 steps:[{id:'paint',tool:'photoshop_paint_strokes',args},{id:'preview',tool:'photoshop_get_preview',args:{}}]};
function painting() {
 const backendFor=vi.fn(async()=>({kind:'uxp'}));
 const tool=createPaintingTools({} as PhotoshopConnection,{backendFor} as unknown as PhotoshopBackendRouter).find(t=>t.tool.name==='photoshop_paint_strokes')!;
 return {tool,backendFor};
}
beforeEach(()=>{vi.clearAllMocks();bridge.paint.mockResolvedValue({ok:true,data:{layer_id:7,original_preserved:true,paint_channel:'layer-mask'}});});
it('rejects unsupported eraser overrides with exact proof before backend dispatch',async()=>{
 const f=painting(),r=await f.tool.handler({...args,paint_target:'layer-pixels',strokes:[{...mark,tool:'ERASER',color:undefined}]});
 expect(json(r)).toMatchObject({execution:'not-executed',execution_proof:{dispatch:'not-dispatched',side_effects:'none'},code:'paint_tool_not_ready'});
 expect(f.backendFor).not.toHaveBeenCalled();expect(bridge.paint).not.toHaveBeenCalled();
});
it.each([{document_id:undefined},{layer_id:undefined},{strokes:[{...mark,color:{red:0,green:1,blue:0}}]},{strokes:[{...mark,color:undefined}]},{strokes:[{...mark,tool:'PENCIL',size:undefined,opacity:undefined,flow:undefined}]}])('rejects unsafe mask input before dispatch %#',async change=>{
 expect(json(await painting().tool.handler({...args,...change})).execution).toBe('not-executed');expect(bridge.paint).not.toHaveBeenCalled();
});
it('forwards mask target and BRUSH controls and requires positive source-preservation proof',async()=>{
 const r=await painting().tool.handler(args);expect(r.isError).not.toBe(true);
 expect(bridge.paint.mock.calls[0][0]).toMatchObject({paint_target:'layer-mask',document_id:42,layer_id:7,strokes:[{size:26,opacity:66,flow:46}]});
 expect(json(r).details).toMatchObject({paint_channel:'layer-mask',original_preserved:true});
});
it.each([{},{layer_id:8,original_preserved:true,paint_channel:'layer-mask'},{layer_id:7,original_preserved:true,paint_channel:'layer-pixels'}])('keeps a post-dispatch unconfirmed outcome uncertain %#',async data=>{
 bridge.paint.mockResolvedValue({ok:true,data});const r=await painting().tool.handler(args);expect(r.isError).toBe(true);expect(json(r).execution).toBeUndefined();
});
it('does not classify a bridge timeout as a pre-dispatch rejection',async()=>{
 bridge.paint.mockRejectedValue(new Error('timeout'));expect(json(await painting().tool.handler(args)).execution).toBeUndefined();
});
it('preserves an exact first-batch transport rejection',async()=>{
 bridge.paint.mockResolvedValue({ok:false,error:'uxp_bridge_unavailable',pre_dispatch_rejected:true});
 expect(json(await painting().tool.handler(args))).toMatchObject({execution:'not-executed',execution_proof:{side_effects:'none'}});
});
it('keeps earlier successful AUTO batches uncertain when a later batch is not dispatched',async()=>{
 bridge.paint.mockResolvedValueOnce({ok:true,data:{layer_id:7,original_preserved:true,paint_channel:'layer-mask'}})
 .mockResolvedValue({ok:false,error:'uxp_bridge_unavailable',pre_dispatch_rejected:true});
 // Four explicit-control strokes fit per bounded AUTO batch; eight exercise
 // partial dispatch without exceeding the eight-batch preflight limit.
 const r=await painting().tool.handler({...args,strokes:Array.from({length:8},()=>mark)});
 expect(bridge.paint).toHaveBeenCalledTimes(2);expect(r.isError).toBe(true);expect(json(r).execution).toBeUndefined();
});
it('rejects oversized batches and unsupported modes at preflight without any UXP dispatch',async()=>{
 const oversized={...args,strokes:Array.from({length:60},()=>mark)};
 expect(strokeExecutionBudget(oversized)).toMatchObject({allowed:false,auto_batches:15,max_auto_batches:8});
 const result=await painting().tool.handler(oversized);
 expect(json(result)).toMatchObject({execution:'not-executed',execution_proof:{dispatch:'not-dispatched'}});
 expect(bridge.paint).not.toHaveBeenCalled();
 expect(strokeExecutionBudget({...args,strokes:Array.from({length:8},()=>mark),batch_mode:'SINGLE_HISTORY'}).allowed).toBe(false);
 expect(()=>strokeExecutionBudget({...args,batch_mode:'UNBOUNDED'})).toThrow('batch_mode must be AUTO or SINGLE_HISTORY');
 const invalid=await painting().tool.handler({...args,batch_mode:'UNBOUNDED'});
 expect(invalid.isError).toBe(true);expect(bridge.paint).not.toHaveBeenCalled();
});
it('closes the full Guard result and barrier as not-executed without an extra preview',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mask-exact-'));
 try {
 const registry=new ToolRegistry(),f=painting(),preview=vi.fn(async()=>result({sha256:'frame'}));
 registry.register(f.tool.tool.name,f.tool);registry.register('photoshop_get_preview',{tool:{name:'photoshop_get_preview',inputSchema:{type:'object',properties:{document_id:{type:'number'}}}},handler:preview});
 const p={...plan,method_class:'erase',steps:[{...plan.steps[0],args:{...args,paint_target:'layer-pixels',strokes:[eraserMark]}},plan.steps[1]]};
 const r=await createVisualMicroPlanTools(registry,join(dir,'barriers'))[0].handler(p),body=json(r);
 expect(body.code,JSON.stringify({code:body.code,message:body.message,violations:body.violations})).toBe('visual_mutation_not_executed');
 expect(body).toMatchObject({execution:'not-executed',terminal:true,visual_mutation_started:false,pass_execution:{state:'not-started',history_ownership:{uncertain_mutation_present:false}}});
 expect(body.pass_execution.actions[0].state).toBe('not-started');expect(preview).not.toHaveBeenCalled();expect(new PreviewBarriers(join(dir,'barriers')).get(42)).toBeUndefined();
 const store=new SessionStore(join(dir,'store')),record={id:'mask-pass',sequence:1,created_at:new Date().toISOString(),phase:'started',tool:'photoshop_execute_visual_microplan',args:{document_id:42},visual:true,dispatched:true};
 store.write(record);store.setVisualBarrier(42,{planId:'mask-pass',operationId:'mask-pass',operationSequence:1,requiresExternalPreview:true});
 expect(store.complete(record,r)).toMatchObject({phase:'completed',execution:'not-executed',visual:false});expect(store.visualBarrier(42)).toBeUndefined();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it.each(['timeout','prior-write','preparation'])('retains preview and reconciliation when %s leaves possible side effects',async kind=>{
 const registry=new ToolRegistry(),f=painting(),preview=vi.fn(async()=>result({sha256:'frame'}));
 registry.register(f.tool.tool.name,f.tool);registry.register('photoshop_get_preview',{tool:{name:'photoshop_get_preview',inputSchema:{type:'object',properties:{document_id:{type:'number'}}}},handler:preview});
 const p=structuredClone(plan);
 if(kind==='timeout')bridge.paint.mockRejectedValue(new Error('timeout'));
 else {
   if(kind==='prior-write') {
     registry.register('photoshop_paint_dabs',{tool:{name:'photoshop_paint_dabs',inputSchema:{type:'object',properties:{document_id:{type:'number'}}}},handler:async()=>result({ok:true})});
     p.steps.unshift({id:'prior',tool:'photoshop_paint_dabs',args:{}} as typeof p.steps[number]);
   } else {
     registry.register('photoshop_set_foreground_color',{tool:{name:'photoshop_set_foreground_color',inputSchema:{type:'object',properties:{document_id:{type:'number'}}}},handler:async()=>result({ok:true})});
     p.steps.unshift({id:'prepare',tool:'photoshop_set_foreground_color',args:{}} as typeof p.steps[number]);
   }
   f.backendFor.mockRejectedValue(new Error('uxp_bridge_unavailable'));
 }
 const body=json(await createVisualMicroPlanTools(registry)[0].handler(p));expect(body.execution,JSON.stringify({code:body.code,message:body.message,violations:body.violations})).not.toBe('not-executed');expect(preview).toHaveBeenCalledTimes(1);
 expect(body.barrier.next_visual_mutation_allowed).toBe(false);
});

const source=readFileSync(new URL('../uxp-plugin/main.js',import.meta.url),'utf8').replace(/\npollLoop\(\);\s*$/,'\n');
function native(options:{existing?:boolean;disabled?:boolean;failSelect?:boolean;failDraw?:boolean;failRestore?:boolean;wrongLayer?:boolean}={}) {
 const channels=[{name:'RGB'}];let color={red:40,green:50,blue:60},brush={size:40,opacity:100,flow:100};
 let active=channels,mask=options.existing??false;const draws:unknown[]=[];const history=vi.fn(async()=>{});
 const doc={id:42,activeLayers:[{id:options.wrongLayer?8:7}],pathItems:{add:vi.fn(async()=>{})},get activeChannels(){return active;},set activeChannels(value){if(options.failRestore)throw Error('restore failed');active=value;}};
 const batch=vi.fn(async(ds:Array<Record<string,unknown>>)=>ds.map(d=>{
  if(d._obj==='get')return {name:'Road',hasUserMask:mask,userMaskEnabled:!options.disabled};
  if(d._obj==='make'){mask=true;return {};}
  if(d._obj==='select' && JSON.stringify(d).includes('"mask"')){if(options.failSelect)return {_obj:'error'};active=[{name:'Road Mask'}];}
  return {};
 }));
 const harness={target:{doc,targetLayerId:7,targetDescriptor:{name:'Road'},originalLayerId:7,resolution:72,width:100,height:100},
 snapshot:async()=>({settings:{...brush}}),apply:async(s:typeof brush)=>({settings:brush={...brush,...s}}),
 color:()=>({...color}),setColor:(c:typeof color)=>{color={...c};brush.opacity=1;},draw:async()=>{if(options.failDraw)throw Error('draw failed');draws.push({channel:active[0].name,color:{...color},brush:{...brush}});}};
 const api=runInNewContext(source+`
 preparePaintTarget=async()=>harness.target; preflightStrokeToolsModal=async()=>({ready:true});
 snapshotBrushSettings=harness.snapshot;applyBrushSettingsModal=harness.apply;currentForegroundRgb=harness.color;setForegroundColorModal=harness.setColor;
 strokeNamedPathModal=harness.draw;deleteNamedPathModal=async()=>{};makeUxpStrokeSubPath=s=>s;paintTargetCompositing=()=>({layer_id:7});
 ({paintStrokesBatch,validatePaintTargetDescriptor});`,{harness,require:(n:string)=>n==='uxp'?{entrypoints:{setup(){}},storage:{}}:n==='photoshop'?{
 app:{},action:{batchPlay:batch},constants:{ToolType:{BRUSH:'brush'}},core:{executeAsModal:async(fn:Function)=>fn({hostControl:{suspendHistory:async()=>1,resumeHistory:history}})}
 }:{} });
 return {paint:()=>api.paintStrokesBatch({...args,strokes:[mark,{...mark,color:{red:255,green:255,blue:255}}]}),validate:api.validatePaintTargetDescriptor,draws,batch,history,channels:()=>active,color:()=>color,brush:()=>brush};
}
it('allows a Smart Object mask while still rejecting painting its source pixels',()=>{
 const f=native(),layer={layerKind:5,name:'Road',layerSection:'layerSectionContent'};
 expect(()=>f.validate(layer,'paint_strokes',true)).not.toThrow();expect(()=>f.validate(layer,'paint_strokes',false)).toThrow('normal raster');
});
it.each([false,true])('paints only the mask, preserves controls and restores channel/color, existing=%s',async existing=>{
 const f=native({existing}),r=await f.paint();expect(r).toMatchObject({paint_channel:'layer-mask',original_preserved:true,mask_auto_created:!existing,layer_id:7});
 expect(f.draws).toEqual([{channel:'Road Mask',color:{red:0,green:0,blue:0},brush:{size:26,opacity:66,flow:46}},{channel:'Road Mask',color:{red:255,green:255,blue:255},brush:{size:26,opacity:66,flow:46}}]);
 expect(f.channels()).toEqual([{name:'RGB'}]);expect(f.color()).toEqual({red:40,green:50,blue:60});expect(f.brush()).toEqual({size:40,opacity:100,flow:100});expect(f.history).toHaveBeenLastCalledWith(1,true);
 if(!existing)expect(f.batch.mock.calls.some(([ds])=>JSON.stringify(ds).includes('revealAll'))).toBe(true);
});
it.each([{existing:true,disabled:true},{failSelect:true},{failDraw:true},{failRestore:true},{wrongLayer:true}])('aborts the whole mask history unit on failure %#',async options=>{
 const f=native(options);await expect(f.paint()).rejects.toThrow();expect(f.history).toHaveBeenLastCalledWith(1,false);
 if(options.disabled||options.failSelect||options.wrongLayer)expect(f.draws).toEqual([]);
});
