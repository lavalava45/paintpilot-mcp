import { describe, expect, it } from 'vitest';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { foundationAdmission, SCENE_FOUNDATION_VERSION } from '../src/core/guard/scene-foundation.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createLayerTools } from '../src/tools/layer-tools.js';
import { PhotoshopConnection } from '../src/platform/connection.js';

const foundationState = {
  document_id: 625, document_incarnation_id: 'retained-test-incarnation',
  original_brief: 'Rainy street with coherent dark architecture, lantern reflections and soft atmosphere.',
  scene_foundation_policy: SCENE_FOUNDATION_VERSION,
  current_frame: { operation_id: 'last-reviewed-frame', sha256: 'exact-reviewed-frame' },
};

const proposedDelete = () => ({
  request_key: 'oct18-discard-only-failed-halo',
  document_id: 625, problem_id: 'hard-edged-halo-regression',
  goal: 'Discard the failed halo layer; do not claim the foundation is complete.',
  foundation_goal: 'composition', change_domains: ['composition', 'background-scope'],
  stage: 'GLOBAL_BLOCK_IN', scale: 'global', action_class: 'ROLLBACK',
  actions: [{ id: 'delete-bad-halo', tool: 'photoshop_delete_layer',
    args: { layer_id: 16 } }],
});

function fixture(planner = false, paintingProfile: 'simple_graphic' | 'nontrivial_painting' = 'simple_graphic') {
  let mutationCalls = 0;
  const registry = new ToolRegistry();
  const conn = new PhotoshopConnection({ detector: {
    detect: async () => ({ version: 'test', path: 'test', isRunning: true }),
  } });
  const layer = createLayerTools(conn).find(item => item.tool.name === 'photoshop_delete_layer');
  if (!layer) throw new Error('Missing native delete layer contract');
  registry.register(layer.tool.name, { ...layer,
    handler: async () => { mutationCalls++; throw new Error('No Photoshop mutation may be executed'); },
  });
  const store: any = { compactPassContext: () => ({
    painting_profile: paintingProfile,
    document_id: 625, logical_layer_owners: [], has_visual_frame: true,
    ...(planner ? { art_director: {
      directive_id: 'directive', current_task_id: 'task',
    } } : {}),
  }), collectClosePreviousErrors: () => [], collectPreflightErrors: () => [] };
  return { registry, store, mutationCalls: () => mutationCalls };
}

describe('October 18 direct foundation rollback domain provenance', () => {
  it.each([
    { planner: false, profile: 'simple_graphic' as const },
    { planner: true, profile: 'simple_graphic' as const },
    { planner: false, profile: 'nontrivial_painting' as const },
    { planner: true, profile: 'nontrivial_painting' as const },
  ])('preserves foundation fields for direct delete (%o)', async ({ planner, profile }) => {
    const f = fixture(planner, profile);
    const input = proposedDelete();
    const before = structuredClone(input);
    const result = await compileGuardCycle({ next_pass: input }, f.store, f.registry);
    const compiled = result.nextOperation!;
    expect(compiled, JSON.stringify(result.violations)).toBeDefined();
    expect(compiled.tool).toBe('photoshop_delete_layer');
    expect(compiled.foundation_goal).toBe('composition');
    expect(compiled.change_domains).toEqual(['composition', 'background-scope']);
    expect(compiled.args).toMatchObject({ document_id: 625, layer_id: 16 });
    // The foundation gate can examine the unmodified semantic scope.
    expect(foundationAdmission(foundationState, compiled).status).toBe('foundation-repair');
    expect(f.mutationCalls()).toBe(0);
    expect(input).toEqual(before);
  });

  it('does not supply omitted or invalid author scope nor fabricate a composition foundation', async () => {
    const f = fixture();
    const missing = proposedDelete();
    delete (missing as any).change_domains;
    const without = await compileGuardCycle({ next_pass: missing }, f.store, f.registry);
    expect(without.nextOperation).not.toHaveProperty('change_domains');
    expect(foundationAdmission(foundationState, without.nextOperation!).status).toBe('blocked');
    const wrong = proposedDelete();
    wrong.change_domains = ['not-a-published-domain'];
    const rejected = await compileGuardCycle({ next_pass: wrong }, f.store, f.registry);
    expect(rejected.violations.map(item => item.code)).toContain('compact_change_domains_invalid');
    expect(rejected.nextOperation).not.toHaveProperty('change_domains');
    expect(f.mutationCalls()).toBe(0);
  });

  it('does not treat an unrelated local/detail action as an authorized foundation simply by relabeling it', async () => {
    const f = fixture();
    const detail = proposedDelete();
    detail.stage = 'DETAIL';
    const result = await compileGuardCycle({ next_pass: detail }, f.store, f.registry);
    expect(foundationAdmission(foundationState, result.nextOperation!).status).toBe('blocked');
    expect(f.mutationCalls()).toBe(0);
  });

  it('does not validate an invalid foundation enum by carrying a supplied domain', async () => {
    const f = fixture();
    const request = { ...proposedDelete(), foundation_goal: 'arbitrary-escape' };
    const compiled = await compileGuardCycle({ next_pass: request }, f.store, f.registry);
    expect(foundationAdmission(foundationState, compiled.nextOperation!).status).toBe('blocked');
    expect(f.mutationCalls()).toBe(0);
  });
});
