
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';

const camera = { model_id:'camera',revision:1,source_frame:{document_id:42,document_incarnation:'doc:42'},
 geometry_model_id:'geometry',geometry_model_revision:1,
 camera:{framing:'wide landscape',view_character:'normal',lens_character:'normal'},
 focus:{focal_depth_or_plane:'wanderer',depth_of_field_behavior:'deep focus with atmospheric loss of contrast',foreground_softness:'none',background_softness:'slight'},
 motion:{camera_motion:'none',subject_motion:'none',shutter_character:'still'},
 optical_response:{base_softness:'none',bloom:'none',halation:'none'},capture_finish:{grain:'none',vignette:'none',film_or_sensor_character:'neutral'},intentional_exceptions:[]};
const imaging = {scene_camera_model_id:'camera',scene_camera_revision:1,effect_kind:'global-softness',motivation:'Bounded atmospheric softness preserving selected edges',scope:'global',revalidate_edge_detail:true,owner_expectations:[{owner_id:'road',depth_role:'near',expected_focus_role:'sharp'}]};
const owner = {hypothesis_id:'road',layer_id:7,physical_role:'support-surface',opacity_role:'opaque'};
async function compile(pass:Record<string,unknown>={}, ctx:Record<string,unknown>={}){
 const registry=new ToolRegistry();for(const name of ['photoshop_apply_gaussian_blur','photoshop_apply_motion_blur','photoshop_apply_smart_blur','photoshop_select_rectangle','photoshop_get_preview']) registry.register(name,{tool:{name,description:name,inputSchema:{type:'object',additionalProperties:true}},handler:async()=>({content:[]})});
 for(const definition of createVisualMicroPlanTools(registry)) registry.register(definition.tool.name,definition);
 return compileGuardCycle({next_pass:{request_key:'protected-blur',document_id:42,goal:'Selective owner softness',stage:'GLOBAL_BLOCK_IN',scale:'global',imaging_preflight:imaging,actions:[{tool:'photoshop_apply_gaussian_blur',args:{layer_id:7,radius:10}}],...pass}},
 {collectClosePreviousErrors:()=>[],collectPreflightErrors:()=>[],compactPassContext:()=>({painting_profile:'nontrivial_painting',stage:'GLOBAL_BLOCK_IN',scene_camera_imaging_model:camera,logical_layer_owners:[owner],...ctx})},registry);
}
it.each(['photoshop_apply_gaussian_blur','photoshop_apply_motion_blur','photoshop_apply_smart_blur'])('requires actual-tool imaging preflight for %s even with no declared method',async tool=>{
 const r=await compile({imaging_preflight:undefined,actions:[{tool,args:{layer_id:7,radius:10,angle:5,threshold:8}}]});expect(r.violations.some(v=>v.code==='imaging_preflight_required')).toBe(true);expect(r.rejection?.isError).toBe(true);
});
it('retains validated owner and imaging metadata on a legal direct blur',async()=>{const r=await compile();expect(r.rejection,JSON.stringify(r.violations)).toBeUndefined();expect(r.nextOperation?.logical_layer).toMatchObject(owner);expect(r.nextOperation?.imaging_preflight).toMatchObject({owner_expectations:imaging.owner_expectations,revalidate_edge_detail:true});expect((r.nextOperation?.args as any).imaging_preflight).toBeUndefined();});
it.each([
 [{actions:[{tool:'photoshop_apply_gaussian_blur',args:{radius:10}}]}, {},'blur_target_layer_required'],
 [{logical_layer:{decision:'adjust',hypothesis_id:'figure',layer_id:7}}, {},'semantic_mutation_target_owner_mismatch'],
 [{}, {logical_layer_owners:[owner,{...owner,hypothesis_id:'figure'}]},'semantic_target_owner_ambiguous'],
 [{}, {logical_layer_owners:[{...owner,layer_id:8,physical_layer_ids:[7,8]}]},'semantic_target_owner_ambiguous'],
 [{imaging_preflight:{...imaging,scene_camera_revision:2}}, {},'imaging_preflight_conflict'],
 [{imaging_preflight:{...imaging,owner_expectations:[{owner_id:'figure',depth_role:'far',expected_focus_role:'soft'}]}}, {},'imaging_preflight_conflict'],
 [{imaging_preflight:{...imaging,revalidate_edge_detail:false}}, {},'imaging_preflight_conflict'],
] as const)('rejects unsafe direct blur contract %#',async(pass,ctx,code)=>{const r=await compile(pass,ctx);expect(r.violations.some(v=>v.code===code),JSON.stringify(r.violations)).toBe(true);expect(r.rejection?.isError).toBe(true);});
it('rejects a depth/focus contradiction but permits an explicit optical exception',async()=>{
 const binding={scene_camera_model_id:'camera',scene_camera_revision:1,depth_role:'near',expected_focus_role:'sharp',dependency_domains:['focus'],geometry_binding_owner_id:'road'};
 const preflight={...imaging,owner_expectations:[{owner_id:'road',depth_role:'far',expected_focus_role:'soft'}]};
 const ctx={logical_layer_owners:[{...owner,camera_binding:binding}]};
 expect((await compile({imaging_preflight:preflight},ctx)).rejection?.isError).toBe(true);
 const r=await compile({imaging_preflight:{...preflight,owner_expectations:[{...preflight.owner_expectations[0],local_exception:'A masked optical treatment limited to the distant segment of this ground owner'}]}},ctx);expect(r.rejection,JSON.stringify(r.violations)).toBeUndefined();
});

function uxp(kind='NORMAL', options: {multiple?:boolean; conversionFails?:boolean; filterFails?:boolean; missingMask?:boolean; disabledMask?:boolean}={}){
 const initial={id:7,name:'Muddy Path',kind};const doc={id:42,title:'Painting',activeLayers:options.multiple?[initial,{id:8,kind:'NORMAL'}]:[initial]};
 const batchPlay=vi.fn(async(descriptors:any[])=>{const d=descriptors[0];if(d._obj==='get')return [{hasFilterMask:!options.missingMask,filterMaskEnabled:!options.disabledMask}];if(d._obj==='newPlacedLayer'){if(options.conversionFails)return [{_obj:'error',message:'conversion failed'}];doc.activeLayers=[{...initial,id:9,kind:'SMARTOBJECT'}];}else if(options.filterFails)return [{_obj:'error',message:'filter failed'}];return [{}];});
 const suspendHistory=vi.fn(async()=>1),resumeHistory=vi.fn(async()=>{});
 const module={exports:{} as any};runInNewContext(readFileSync(new URL('../uxp-plugin/p2-filter-ops.js',import.meta.url),'utf8'),{module,require:()=>({app:{documents:[doc],activeDocument:doc},action:{batchPlay},constants:{LayerKind:{NORMAL:'NORMAL',SMARTOBJECT:'SMARTOBJECT'}},core:{executeAsModal:async(fn:any)=>fn({hostControl:{suspendHistory,resumeHistory}})}})});
 return {call:(action='apply_guarded_gaussian_blur',args:any={document_id:42,layer_id:7,radius:10,angle:5,threshold:8})=>module.exports.tryHandleP2FilterOperation(action,args),batchPlay,doc,suspendHistory,resumeHistory};
}
it.each(['apply_guarded_gaussian_blur','apply_guarded_motion_blur','apply_guarded_smart_blur'])('preserves source before %s, returns exact layer identity and ONE committed history unit',async action=>{const f=uxp();const r=await f.call(action);expect(f.batchPlay.mock.calls.map(([ds])=>ds[0]._obj)).toEqual(['newPlacedLayer',action.includes('gaussian')?'gaussianBlur':action.includes('motion')?'motionBlur':'smartBlur','get']);expect(r.data).toMatchObject({original_preserved:true,filter_mode:'smart-filter',source_layer_id:7,layer_id:9,smart_filter_mask:true,history_steps:1});expect(f.doc.activeLayers[0].kind).toBe('SMARTOBJECT');expect(f.suspendHistory).toHaveBeenCalledTimes(1);expect(f.resumeHistory).toHaveBeenCalledWith(1,true);});
it('does not reconvert an existing Smart Object and still owns one committed history unit',async()=>{const f=uxp('SMARTOBJECT');const r=await f.call();expect(f.batchPlay).toHaveBeenCalledTimes(2);expect(r.data.history_steps).toBe(1);expect(f.suspendHistory).toHaveBeenCalledTimes(1);expect(f.resumeHistory).toHaveBeenCalledWith(1,true);});
it.each([{args:{radius:10}}, {args:{layer_id:8,radius:10}}, {args:{layer_id:7,document_id:43,radius:10}}, {multiple:true}, {kind:'TEXT'}])('rejects missing, mismatched, multiple or unsupported targets before any write %#',async c=>{const f=uxp(c.kind??'NORMAL',c);await expect(f.call('apply_guarded_gaussian_blur',c.args??{layer_id:7,radius:10})).rejects.toThrow();expect(f.batchPlay).not.toHaveBeenCalled();});
it('never falls back to raster filtering when Smart Object conversion fails',async()=>{const f=uxp('NORMAL',{conversionFails:true});await expect(f.call()).rejects.toThrow('conversion_failed');expect(f.batchPlay).toHaveBeenCalledTimes(1);expect(f.resumeHistory).toHaveBeenCalledWith(1,false);});
it('propagates Photoshop filter error without reporting preservation success',async()=>{const f=uxp('SMARTOBJECT',{filterFails:true});await expect(f.call()).rejects.toThrow('filter_execution_failed');expect(f.resumeHistory).toHaveBeenCalledWith(1,false);});
it('guards legacy blur aliases too',async()=>{const f=uxp();await expect(f.call('apply_gaussian_blur',{radius:10})).rejects.toThrow('blur_target_layer_required');expect(f.batchPlay).not.toHaveBeenCalled();});

const dirs:string[]=[];afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
it('retains semantic ownership through a verified Smart Object layer-id change and ignores failed or rolled-back conversions',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'guarded-blur-owner-'));dirs.push(dir);const s=new SessionStore(dir);
 s.write({id:'source',sequence:1,created_at:new Date(1000).toISOString(),phase:'completed',failed:false,tool:'photoshop_execute_visual_microplan',args:{document_id:42},result:{content:[{type:'text',text:JSON.stringify({continuation_layers:[{...owner,decision:'create-new',hypothesis:'Wet muddy road'}]})}]}});
 const result={content:[{type:'text',text:JSON.stringify({ok:true,details:{original_preserved:true,filter_mode:'smart-filter',source_layer_id:7,layer_id:9}})}]};
 s.write({id:'blur',sequence:2,created_at:new Date(2000).toISOString(),phase:'completed',failed:false,tool:'photoshop_apply_gaussian_blur',args:{document_id:42,layer_id:7,radius:10},logical_layer:owner,result});
 expect(s.semanticLayerOwners(42)[0]).toMatchObject({hypothesis_id:'road',layer_id:9,physical_layer_ids:[9]});
 for(const field of ['failed','rolled_back']){s.write({...s.read('blur'),[field]:true});expect(s.semanticLayerOwners(42)[0]).toMatchObject({layer_id:7});s.write({...s.read('blur'),[field]:false});}
});

it.each([{missingMask:true},{disabledMask:true}])('aborts the whole blur unit when the Smart Filter mask is missing or disabled %#',async options=>{const f=uxp('NORMAL',options);await expect(f.call()).rejects.toThrow('blur_filter_mask_unconfirmed');expect(f.resumeHistory).toHaveBeenCalledWith(1,false);});

it('revalidates the direct blur owner and focus through real SessionStore admission',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'guarded-blur-admission-'));dirs.push(dir);const store=new SessionStore(dir);
 store.write({id:'owner',report:{assistant_text:'The current road layer is established for this isolated admission fixture.'},sequence:1,created_at:new Date(1000).toISOString(),phase:'completed',failed:false,tool:'photoshop_execute_visual_microplan',args:{document_id:42},result:{content:[{type:'text',text:JSON.stringify({continuation_layers:[{...owner,decision:'create-new',hypothesis:'Wet road'}]})}]}});
 vi.spyOn(store,'sceneCameraImagingModel').mockReturnValue(camera);
 const request={id:'actual-blur',problem_id:'road-form',tool:'photoshop_apply_gaussian_blur',summary:'Editable road softness',purpose:'Preserve original',stage:'GLOBAL_BLOCK_IN',scale:'global',args:{document_id:42,layer_id:7,radius:10},logical_layer:{...owner,decision:'continue-logical-layer'},imaging_preflight:imaging};
 expect(store.collectPreflightErrors(request,{stateOnly:true})).toEqual([]);
 expect(store.collectPreflightErrors({...request,logical_layer:{...request.logical_layer,hypothesis_id:'figure'}},{stateOnly:true}).join(' ')).toContain('semantic_mutation_target_owner_mismatch');
 expect(store.collectPreflightErrors({...request,imaging_preflight:{...imaging,revalidate_edge_detail:false}},{stateOnly:true}).join(' ')).toContain('imaging_preflight_conflict');
});

it('compiles selection preparation and one Gaussian filter with existing owner/imaging authority into one final-review pass',async()=>{
 const logical={...owner,decision:'continue-logical-layer',hypothesis:'Existing wet muddy road surface',rollback_value:'moderate'};
 const r=await compile({logical_layer:logical,layer_separation_check:{change_kind:'continuation',substantial:false,rollback_value:'moderate',independent_adjustment_expected:false,reasons:['Continue the existing road owner']},
   actions:[{id:'select',tool:'photoshop_select_rectangle',args:{left:10,top:10,right:60,bottom:60}},
     {id:'blur',tool:'photoshop_apply_gaussian_blur',method_id:'gaussian-blur',args:{layer_id:7,radius:10}}]},
   {logical_layer_owners:[{...logical,temporary:false}]});
 expect(r.violations).toEqual([]);
 const operation=(r.input as any).next_operation;
 expect(operation.tool).toBe('photoshop_execute_visual_microplan');
 expect(operation.args.method_class).toBe('filter');
 expect(operation.args.steps.map((step:any)=>step.tool)).toEqual(['photoshop_select_rectangle','photoshop_apply_gaussian_blur','photoshop_get_preview']);
 expect(operation.args.logical_layer.hypothesis_id).toBe('road');
 expect(operation.imaging_preflight.revalidate_edge_detail).toBe(true);
});

it('preserves current ownership when a prepared Smart Filter changes the physical layer id',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'prepared-filter-owner-'));dirs.push(dir);const s=new SessionStore(dir);
 s.write({id:'source',sequence:1,created_at:new Date(1000).toISOString(),phase:'completed',failed:false,tool:'photoshop_execute_visual_microplan',args:{document_id:42},result:{content:[{type:'text',text:JSON.stringify({continuation_layers:[{...owner,decision:'create-new',hypothesis:'Wet muddy road'}]})}]}});
 s.write({id:'prepared',sequence:2,created_at:new Date(2000).toISOString(),phase:'completed',failed:false,tool:'photoshop_execute_visual_microplan',
   args:{document_id:42,method_class:'filter',logical_layer:owner,steps:[{id:'blur',tool:'photoshop_apply_gaussian_blur',args:{layer_id:7,radius:10}}]},
   result:{content:[{type:'text',text:JSON.stringify({ok:true,mutation_results:{blur:{ok:true,details:{original_preserved:true,filter_mode:'smart-filter',source_layer_id:7,layer_id:9}}},continuation_layers:[{...owner,layer_id:9,decision:'continue-logical-layer',hypothesis:'Wet muddy road'}]})}]}});
 expect(s.semanticLayerOwners(42)[0]).toMatchObject({hypothesis_id:'road',layer_id:9,physical_layer_ids:[9]});
 s.write({...s.read('prepared'),rolled_back:true});
 expect(s.semanticLayerOwners(42)[0]).toMatchObject({layer_id:7,physical_layer_ids:[7]});
});

it('revalidates prepared Gaussian filters through the same SessionStore imaging/owner checks as direct blur',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'prepared-filter-admission-'));dirs.push(dir);const store=new SessionStore(dir);
 store.write({id:'owner',report:{assistant_text:'Current road owner'},sequence:1,created_at:new Date(1000).toISOString(),phase:'completed',failed:false,tool:'photoshop_execute_visual_microplan',args:{document_id:42},result:{content:[{type:'text',text:JSON.stringify({continuation_layers:[{...owner,decision:'create-new',hypothesis:'Wet muddy road'}]})}]}});
 vi.spyOn(store,'sceneCameraImagingModel').mockReturnValue(camera);
 const request={id:'prepared-admission',problem_id:'road-form',tool:'photoshop_execute_visual_microplan',summary:'Editable road softness',purpose:'Preserve source',stage:'GLOBAL_BLOCK_IN',scale:'global',
   args:{document_id:42,method_class:'filter',logical_layer:{...owner,decision:'continue-logical-layer'},steps:[{id:'selection',tool:'photoshop_select_rectangle',args:{}},{id:'blur',tool:'photoshop_apply_gaussian_blur',args:{layer_id:7,radius:10}}]},imaging_preflight:imaging};
 expect(store.collectPreflightErrors(request,{stateOnly:true})).toEqual([]);
 expect(store.collectPreflightErrors({...request,args:{...request.args,logical_layer:{...request.args.logical_layer,hypothesis_id:'figure'}}},{stateOnly:true}).join(' ')).toContain('semantic_mutation_target_owner_mismatch');
 expect(store.collectPreflightErrors({...request,imaging_preflight:undefined},{stateOnly:true}).join(' ')).toContain('imaging_preflight');
});
