import { describe, expect, it, vi } from 'vitest';
import saved from './fixtures/cabin-director-not-exposed.json';
import { ATTENTION_BINDING_SCHEMA, normalizePerceptualHierarchy, prepareAttentionBinding } from '../src/core/perceptual-hierarchy.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { createGuardTools, publicDirectorTemplate } from '../src/tools/guard-tools.js';
import { collectSchemaErrors } from '../src/core/guard/cycle-compiler.js';
import { collectVisualMicroPlanConstructionErrors } from '../src/core/visual-microplan.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createConnectionToolCatalog, createRegistryToolCatalog } from '../src/core/server-tool-catalog.js';
import { publishedToolCatalog } from '../src/core/server-protocol.js';

const hierarchy = normalizePerceptualHierarchy({ revision: 2, mode: 'ranked', ordering: ['plants'], zones: [
  { id: 'plants', owner_ids: ['plants-owner'], priority: 'primary', contrast_budget: 'medium', detail_budget: 'low', edge_certainty: 'medium', chroma_accent: 'restricted' },
] });
function fakeStore(state: any = {}) {
  return { paintingState: () => ({ documents: { '2942': state } }),
    validateValueCheckEvidence: vi.fn(), validateRefinementCheckEvidence: vi.fn(), validateRefinementLowFrequencyEvidence: vi.fn() };
}
function errors(input: any, state = {}) {
  return SessionStore.prototype.collectArtDirectorReviewErrors.call(fakeStore(state), input);
}
const body = (result: any) => JSON.parse(result.content[0].text);

describe('Director / attention / catalog recovery, offline', () => {
  it('returns an exact hidden brush schema through a public read without dispatch or mutable registry references', async () => {
    const handler = vi.fn(); const registry = new ToolRegistry();
    const schema = { type: 'object', properties: { strokes: { type: 'array' } }, required: ['strokes'] };
    registry.register('photoshop_paint_strokes', { tool: { name: 'photoshop_paint_strokes', inputSchema: schema }, handler });
    // Exercise both known and unknown public-tool discovery with the actual runtime
    // capability implementation, not a partial prototype receiver missing capabilities().
    const runtime: any = { registry, runtimeDirectory: 'offline-fixture',
      capabilities: EmbeddedGuardRuntime.prototype.capabilities };
    runtime.toolContract = (name: string) => EmbeddedGuardRuntime.prototype.toolContract.call(runtime, name);
    const tool = createGuardTools(runtime).find(v => v.tool.name === 'photoshop_guard_capabilities')!;
    const result = body(await tool.handler({ tool_name: 'photoshop_paint_strokes' }));
    expect(result).toMatchObject({ ok: true, execution: 'not-executed', inputSchema: schema, raw_mutation_bypass_permitted: false });
    expect(handler).not.toHaveBeenCalled();
    result.inputSchema.required.push('fake'); expect(schema.required).toEqual(['strokes']);
    const unknown = body(await tool.handler({ tool_name: 'unknown' }));
    expect(unknown).toMatchObject({ ok: false, code: 'guard_tool_contract_unknown', execution: 'not-executed' });
    expect(unknown.command_sets.construct).toContain('photoshop_paint_strokes');
    expect(handler).not.toHaveBeenCalled();
  });
  it('does not demand atmospheric construction for bounded existing-owner mask carving, but retains the gate for ordinary painting', () => {
    const args: any = { action_class: 'ERASE', scale: 'medium', method_class: 'paint',
      region_bounds: { left: 272, top: 48, right: 1275, bottom: 160 },
      logical_layer: { decision: 'continue-logical-layer', layer_id: 3 }, paint_strategy: { visual_intent: 'lost-edge' },
      steps: [{ tool: 'photoshop_paint_strokes', args: { layer_id: 3, paint_target: 'layer-mask',
        strokes: [{ tool: 'BRUSH', color: { red: 0, green: 0, blue: 0 }, size: 35, points: [{ x: 330, y: 73 }, { x: 334, y: 87 }] }] } }],
    };
    expect(collectVisualMicroPlanConstructionErrors(args)).toEqual([]);
    for (const change of [
      (v: any) => { v.steps[0].args.paint_target = 'pixels'; },
      (v: any) => { v.steps[0].args.strokes[0].color.red = 1; },
      (v: any) => { v.steps[0].args.layer_id = 99; },
      (v: any) => { delete v.region_bounds; },
      (v: any) => { v.action_class = 'ADD'; },
    ]) {
      const changed = structuredClone(args); change(changed);
      expect(collectVisualMicroPlanConstructionErrors(changed).join('\n')).toMatch(/construction_role classification/);
    }
  });
  it('inherits only the unique authorized attention identity and actual effects; preserves conflicts', () => {
    expect(prepareAttentionBinding(undefined, hierarchy, 'plants-owner', ['plants'], ['local-edge'], [])).toEqual({ hierarchy_revision: 2, zone_id: 'plants', dimensions: ['edge'] });
    expect(prepareAttentionBinding(undefined, hierarchy, 'plants-owner', [], ['local-edge'], [])).toEqual({});
    const foreign = { hierarchy_revision: 1, zone_id: 'elsewhere', dimensions: ['chroma'] };
    expect(prepareAttentionBinding(foreign, hierarchy, 'plants-owner', ['plants'], ['local-edge'], [])).toEqual(foreign);
    expect(prepareAttentionBinding({ dimensions: [] }, hierarchy, 'plants-owner', ['plants'], ['local-edge'], [])).toMatchObject({ dimensions: [] });
  });
  it('reports independent Director errors together without calling the mutator', async () => {
    const bad: any = structuredClone(saved);
    bad.directive.composition_freedom = 'fixed';
    bad.directive.composition_exploration = { hypotheses: [{ id: 'variant' }] };
    bad.directive.perceptual_hierarchy = 'wrong';
    bad.directive.refinement_check = { status: 'fail', observed: true };
    delete bad.directive.value_check;
    const runtime: any = { artDirector: vi.fn(), collectArtDirectorReviewErrors: (input: any) => errors(input, { current_frame: { operation_id: 'actual-frame' } }) };
    const tool = createGuardTools(runtime).find(v => v.tool.name === 'photoshop_guard_art_director')!;
    const result = body(await tool.handler(bad));
    expect(result.code).toBe('guard_art_director_contract_invalid');
    expect(result.issues.join('\n')).toMatch(/fixed forbids/);
    expect(result.issues.join('\n')).toMatch(/perceptual_hierarchy/);
    expect(result.issues.join('\n')).toMatch(/value_check/);
    expect(result.issues.join('\n')).toMatch(/refinement_check/);
    expect(result.issues.join('\n')).toMatch(/refinement_check.criteria is required/);
    expect(result.issues.join('\n')).toMatch(/refinement_check.representation_change is required/);
    expect(runtime.artDirector).not.toHaveBeenCalled();
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(16000);
    expect(saved.directive).not.toEqual(bad.directive);
  });
  it('allows a complete pending first review through the public handler without manufacturing observed evidence', async () => {
    const input: any = structuredClone(saved);
    input.directive.composition_freedom = 'fixed'; input.directive.composition_exploration = { hypotheses: [] };
    input.directive.perceptual_hierarchy = publicDirectorTemplate(hierarchy,
      (createGuardTools({} as any).find(v => v.tool.name === 'photoshop_guard_art_director')!.tool.inputSchema as any).properties.directive.properties.perceptual_hierarchy);
    input.directive.tasks = [{ task_id: 'repair', summary: 'repair form', perceptual_zone_ids: ['plants'] }];
    input.directive.value_check = { status: 'pending', observed: false };
    input.directive.refinement_check = { status: 'pending', observed: false };
    const runtime: any = { artDirector: vi.fn(async () => ({ ok: true })), collectArtDirectorReviewErrors: (v: any) => errors(v) };
    const result = body(await createGuardTools(runtime).find(v => v.tool.name === 'photoshop_guard_art_director')!.handler(input));
    expect(result).toEqual({ ok: true });
    expect(runtime.artDirector).toHaveBeenCalledOnce();
  });
  it('checks unknown task zones even when refinement evidence is also malformed', () => {
    const bad: any = structuredClone(saved);
    bad.directive.perceptual_hierarchy = hierarchy;
    bad.directive.tasks = [{ task_id: 'repair', summary: 'repair', perceptual_zone_ids: ['other'] }];
    bad.directive.refinement_check = { status: 'fail', observed: true };
    const result = errors(bad).join('\n');
    expect(result).toMatch(/unknown zone=other; allowed=plants/);
    expect(result).toMatch(/refinement_check/);
  });
  it('publishes complete attention fields in the compact pass schema', () => {
    const defs = createGuardTools({} as any);
    const cycle: any = defs.find(v => v.tool.name === 'photoshop_guard_cycle_auto')!.tool;
    expect(cycle.inputSchema.properties.next_pass.properties.logical_layer.properties.attention_binding).toEqual(ATTENTION_BINDING_SCHEMA);
    const director: any = defs.find(v => v.tool.name === 'photoshop_guard_art_director')!.tool;
    expect(director.inputSchema.properties.directive.required).toContain('perceptual_hierarchy');
  });
  it('makes saved hierarchy/tasks/contracts reusable without discarding hard brief debt or evidence', () => {
    const director: any = createGuardTools({} as any).find(v => v.tool.name === 'photoshop_guard_art_director')!.tool;
    const schema = director.inputSchema.properties.directive;
    const contract: any = structuredClone(saved.directive.artistic_evaluation_contract);
    contract.brief_items = [{ item_id: 'cat', kind: 'hard_perceptual', requirement: 'readable cat', provenance: 'user', recognition_target: 'cat' }];
    const fields = { perceptual_hierarchy: hierarchy, tasks: [{ task_id: 'repair', summary: 'repair form', status: 'active', attempt_count: 4 }], artistic_evaluation_contract: contract };
    const template: any = publicDirectorTemplate(fields, schema);
    expect(collectSchemaErrors(template.perceptual_hierarchy, schema.properties.perceptual_hierarchy, 'hierarchy')).toEqual([]);
    expect(collectSchemaErrors(template.tasks, schema.properties.tasks, 'tasks')).toEqual([]);
    expect(template.artistic_evaluation_contract.brief_items).toEqual(contract.brief_items);
    expect(collectSchemaErrors(template.artistic_evaluation_contract, schema.properties.artistic_evaluation_contract, 'contract')).toEqual([]);
  });
  it('retains essential tools under a prefix limit and removes duplicate blocked execution schemas only from Guard publication', () => {
    const registry = new ToolRegistry();
    const definitions = [...createConnectionToolCatalog({} as any), ...createRegistryToolCatalog(registry, 'unused-offline'), ...createGuardTools({} as any)];
    const raw = definitions.map(v => v.tool);
    const compact = publishedToolCatalog(raw, true);
    expect(compact.slice(0, 8).map(v => v.name)).toEqual([
      'photoshop_guard_cycle_auto', 'photoshop_guard_art_director', 'photoshop_guard_resume', 'photoshop_guard_review_image',
      'photoshop_guard_job_poll', 'photoshop_guard_reconcile', 'photoshop_guard_set_art_run', 'photoshop_guard_status',
    ]);
    expect(compact.some(v => v.name === 'photoshop_execute_visual_microplan')).toBe(false);
    expect(compact.some(v => v.name === 'photoshop_paint_strokes')).toBe(false);
    expect(raw.some(v => v.name === 'photoshop_paint_strokes')).toBe(true);
    expect(publishedToolCatalog(raw, false).map(v => v.name)).toEqual(raw.map(v => v.name));
    expect(compact.length).toBeLessThan(45);
    expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(Buffer.byteLength(JSON.stringify(raw)) * 0.60);
  });
});
