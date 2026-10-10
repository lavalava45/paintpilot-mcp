import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { guardResumeSubset } from '../src/core/guard/response-budget.js';
import { unexpandedConstructionPrerequisites } from '../src/core/guard/construction-execution.js';
const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'timing-continuation-')); dirs.push(dir);
  return new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: dir, workspaceRoot: dir });
}
function body(result: any) { return JSON.parse(result.content.find((x: any) => x.type === 'text').text); }
it('explicit document recovery excludes a foreign Director and pending historical records', () => {
  const runtime = fixture(), store = runtime.store;
  store.updatePaintingState(5225, current => ({ ...current, art_director: {
    directive_id: 'foreign-knight', status: 'active', review_due: true, review_reason: 'foreign-review', tasks: [] } }));
  store.updatePaintingState(64, current => ({ ...current }));
  store.write({ id: 'foreign-pending-report', created_at: new Date().toISOString(), sequence: 1, phase: 'completed', tool: 'photoshop_get_state', args: { document_id: 5225 } });
  const before = store.artRunState(5225);
  const proof = vi.spyOn(store, 'hasDurableNotExecutedProof');
  const result: any = runtime.resume(64);
  expect(result.document_id).toBe(64);
  expect(result.next_required_action).toBe(result.document.next_required_action);
  expect(result.next_required_action).not.toContain('foreign-knight');
  expect(result.pending_reports).not.toContain('foreign-pending-report');
  expect(guardResumeSubset(result, 'recovery').next_required_action).toBe(result.document.next_required_action);
  expect(guardResumeSubset(result, 'ownership').next_required_action).toBe(result.document.next_required_action);
  expect(store.artRunState(5225)).toEqual(before);
  expect(proof.mock.calls.every(([record]) => record.args?.document_id !== 5225)).toBe(true);
});
it('retains the selected document own recovery blocker', () => {
  const runtime = fixture();
  runtime.store.updatePaintingState(64, current => ({ ...current }));
  runtime.store.write({ id: 'own-uncertain', created_at: new Date().toISOString(), sequence: 1,
    phase: 'started', tool: 'photoshop_fill_layer', args: { document_id: 64 } });
  expect(runtime.resume(64).next_required_action).toContain('own-uncertain');
});
it('replays the first malformed construction with all available independent prerequisites at once', async () => {
  const input = JSON.parse(readFileSync('tests/fixtures/timing-first-construction.json', 'utf8'));
  const context = { painting_profile: 'nontrivial_painting', construction_policy: 'enforced', has_visual_frame: false };
  const store: any = { compactPassContext: () => context, constructionModel: () => null,
    collectClosePreviousErrors: () => [], collectPreflightErrors: () => [], compactClosureDefaults: () => ({}) };
  const compiled = await compileGuardCycle(input, store, new ToolRegistry());
  const codes = compiled.violations.map(x => x.code);
  expect(codes).toEqual(expect.arrayContaining(['construction_model_invalid', 'construction_proportion_contract_required',
    'scene_geometry_model_required', 'construction_role_material_role_required']));
  expect(compiled.nextOperation).toBeUndefined();
});
it('does not invent a compound dimension obligation for a single component and handles malformed containers', () => {
  const context = { painting_profile: 'nontrivial_painting', has_visual_frame: true, logical_layer_owners: {} };
  const raw = { construction: { part_id: 'part', model: { objects: [{ id: 'obj', subject_kind: 'single-component' }],
    parts: [{ id: 'part', object_id: 'obj' }], constraints: { some: 1 } } }, scene_geometry_model: { applicability: 'orthographic' } };
  expect(unexpandedConstructionPrerequisites(raw, context)).toEqual([]);
});
it('lint forwards a full previous observation to the compiler without recording a verdict or dispatching', async () => {
  const runtime = fixture();
  vi.spyOn(runtime, 'collectDynamicOperationViolations').mockResolvedValue([]);
  const previous: any = { id: 'old', visual: true, phase: 'completed', args: { document_id: 64 }, preview: { sha256: 'sha' } };
  vi.spyOn(runtime.store, 'read').mockImplementation((id: any) => id === 'old' ? previous : null);
  const closureCheck = vi.spyOn(runtime.store, 'collectClosePreviousErrors').mockReturnValue([]);
  vi.spyOn(runtime.store, 'compactClosureDefaults').mockReturnValue({});
  vi.spyOn(runtime.store, 'compactPassContext').mockReturnValue({});
  vi.spyOn(runtime.store, 'collectPreflightErrors').mockReturnValue([]);
  const mutate = vi.spyOn(runtime.store, 'verdict');
  const result = await runtime.lintNextPass({ document_id: 64, request_key: 'draft', goal: 'Build next component', actions: [] },
    { previous_operation_id: 'old', previous_observation: { observed: 'Exact delivered frame shows the previous contour', target: 'resolved' } });
  expect(closureCheck).toHaveBeenCalledWith(expect.objectContaining({ previous_operation_id: 'old',
    previous_visual_verdict: expect.objectContaining({ target_resolved: 'yes' }) }));
  expect(mutate).not.toHaveBeenCalled(); expect(previous).not.toHaveProperty('verdict');
  expect(result.execution).toBe('not-executed'); expect(result.continuation).toContain('SAME');
});
it('public lint passes closure fields and discovery rechecks produce a compact unchanged receipt', async () => {
  const runtime = fixture(), tools = createGuardTools(runtime);
  const lint = tools.find(x => x.tool.name === 'photoshop_guard_lint_next_pass')!;
  const spy = vi.spyOn(runtime, 'lintNextPass').mockResolvedValue({ ok: true });
  const args = { next_pass: { goal: 'draft' }, previous_operation_id: 'old', previous_observation: { target: 'resolved' } };
  await lint.handler(args); expect(spy).toHaveBeenCalledWith(args.next_pass, args);
  const caps = tools.find(x => x.tool.name === 'photoshop_guard_capabilities')!;
  const first = body(await caps.handler({}));
  const again = body(await caps.handler({ if_revision: first.discovery_revision }));
  expect(again.unchanged).toBe(true); expect(JSON.stringify(again).length).toBeLessThan(JSON.stringify(first).length / 2);
  expect(body(await caps.handler({ if_revision: 'stale' }))).not.toHaveProperty('unchanged');
  const batch = body(await caps.handler({ tool_names: ['photoshop_create_layer', 'photoshop_paint_regions'] }));
  expect(batch.contracts).toHaveLength(2);
  expect(body(await caps.handler({ tool_names: ['photoshop_create_layer', 'photoshop_paint_regions'], if_revision: batch.discovery_revision })).unchanged).toBe(true);
});

it('descriptive brush scale does not falsely reject medium/global, while typed and legacy restrictions remain', async () => {
  const { brushRoleMatchesScale, normalizeBrushAllowedScales } = await import('../src/core/guard/brush-scale-fit.js');
  const description = '1200×900; большие массы 50–300 px, средние 10–70 px';
  expect(brushRoleMatchesScale({ working_scale: description }, 'medium')).toBe(true);
  expect(brushRoleMatchesScale({ working_scale: description }, 'global')).toBe(true);
  expect(brushRoleMatchesScale({ working_scale: 'small' }, 'global')).toBe(false);
  expect(brushRoleMatchesScale({ working_scale: 'small', allowed_scales: ['medium'] }, 'medium')).toBe(true);
  expect(brushRoleMatchesScale({ working_scale: description, allowed_scales: ['medium'] }, 'global')).toBe(false);
  for (const raw of [[], ['large'], 'medium', [null], ['medium', 'oops']]) {
    expect(() => normalizeBrushAllowedScales(raw)).toThrow(/allowed_scales/);
    expect(brushRoleMatchesScale({ allowed_scales: raw }, 'medium')).toBe(false);
  }
});
it('brush scale restrictions survive durable preflight and compiler projection and reject invalid tokens', () => {
  const runtime = fixture();
  const role = { role_id: 'soft-volume', purpose: 'Sculpt light over form', preferred_preset: 'Soft',
    material_roles: ['skin'], visual_intents: ['light-sculpt'], working_scale: '1200×900; 10–70 px',
    allowed_scales: ['medium', 'global'], pressure_policy: 'none', probe_status: 'not-needed',
    effective_settings: { size: 70, hardness: 0, roundness: 100, opacity: 40, flow: 10, spacing: 12,
      smoothing: 0, use_pressure_size: false, use_pressure_opacity: false, airbrush: false, smoothing_enabled: false } };
  const input = { document_id: 64, process_dir: 'processes/brush-scale-process/run-01',
    brush_preflight: { completed: true, inventory_observed: true, inventory_total: 10, roles: [role] } };
  runtime.store.setArtRunState(input);
  expect(runtime.store.artRunState(64).brush_preflight.roles[0].allowed_scales).toEqual(['medium', 'global']);
  expect(runtime.store.compactPassContext(64).brush_roles[0].allowed_scales).toEqual(['medium', 'global']);
  expect(() => runtime.store.setArtRunState({ ...input, brush_preflight: { ...input.brush_preflight,
    roles: [{ ...role, allowed_scales: ['large'] }] } })).toThrow(/allowed_scales/);
});
it('layer stacking aliases return an explicit gap and actual new-layer placement contract, not pixel movement', () => {
  const runtime = fixture();
  const create: any = { tool: { name: 'photoshop_create_layer', inputSchema: { type: 'object',
    properties: { above_layer_id: { type: 'number' }, below_layer_id: { type: 'number' } } } } };
  vi.spyOn(runtime.registry, 'get').mockImplementation((name: string) => name === 'photoshop_create_layer' ? create : undefined);
  for (const name of ['photoshop_reorder_layer','photoshop_rearrange_layers','photoshop_set_layer_order',
    'photoshop_layer_move','photoshop_move_layer_relative']) {
    const result: any = runtime.toolContract(name);
    expect(result.unsupported_capability).toBe('reorder-existing-layers');
    expect(result.supported_alternatives).toEqual(['photoshop_create_layer']);
    expect(result.new_layer_placement.inputSchema.properties.above_layer_id).toEqual({ type: 'number' });
    expect(result.next).toContain('not stacking');
  }
});
