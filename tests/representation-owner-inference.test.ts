
import { expect, it } from 'vitest';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';

async function compile(owners: Array<Record<string, unknown>>, layerId = 7, profile = 'simple_graphic', constructionRole?: string) {
  const registry = new ToolRegistry();
  for (const name of ['photoshop_paint_regions', 'photoshop_get_preview', 'photoshop_execute_visual_microplan']) registry.register(name, {
    tool: { name, description: name, inputSchema: { type: 'object', additionalProperties: true } },
    handler: async () => ({ content: [] }),
  });
  return compileGuardCycle({ next_pass: { request_key: 'owner-continuation', document_id: 42,
    goal: 'Adjust an existing object without recreating its layer', construction_role: constructionRole, stage: 'GLOBAL_BLOCK_IN', scale: 'medium',
    actions: [{ id: 'adjust', tool: 'photoshop_paint_regions', args: { regions: [{ layer_id: layerId, color: {red: 31, green: 38, blue: 37}, opacity: 96, contours: [{ points: [{x: 5,y: 5},{x: 25,y: 5},{x: 25,y: 25},{x: 5,y: 25}] }] }] } }],
  } }, {
    collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
    compactPassContext: () => ({ painting_profile: profile, has_visual_frame: profile === 'nontrivial_painting', stage: 'GLOBAL_BLOCK_IN', scale: 'medium', logical_layer_owners: owners }),
  }, registry);
}

it('binds a numeric target to its unique current durable owner and inherits the physical role used by quality review', async () => {
  const owner = { hypothesis_id: 'figures-owner', hypothesis: 'Dark-robed figure', layer_id: 7,
    layer_name: 'Figure', physical_role: 'opaque-mass', opacity_role: 'opaque', rollback_value: 'high' };
  const result = await compile([owner]);
  expect(result.rejection, JSON.stringify(result.violations)).toBeUndefined();
  expect((result.nextOperation?.args as any).logical_layer).toMatchObject({
    hypothesis_id: 'figures-owner', decision: 'continue-logical-layer', layer_id: 7, physical_role: 'opaque-mass', opacity_role: 'opaque',
  });
  expect(result.normalizations.some(row => row.code === 'semantic_owner_inherited_from_target')).toBe(true);
  expect(owner).not.toHaveProperty('decision');
});

it('rejects ambiguous ownership without choosing the last journal entry or fabricating an owner', async () => {
  const result = await compile([{ hypothesis_id: 'figure', layer_id: 7 }, { hypothesis_id: 'road', layer_id: 7 }]);
  expect(result.violations.some(row => row.code === 'semantic_target_owner_ambiguous')).toBe(true);
  expect(result.rejection?.isError).toBe(true);
  expect((result.nextOperation?.args as any)?.logical_layer).toBeUndefined();
});

it('does not guess the ownership of an unclaimed physical layer', async () => {
  const result = await compile([{ hypothesis_id: 'figures-owner', layer_id: 7 }], 8);
  expect(result.rejection, JSON.stringify(result.violations)).toBeUndefined();
  expect((result.nextOperation?.args as any)?.logical_layer).toBeUndefined();
});


it('does not silently promote a temporary hypothesis or adopt a historical physical stack member', async () => {
  for (const owner of [
    { hypothesis_id: 'temporary-figure', layer_id: 7, temporary: true },
    { hypothesis_id: 'migrated-figure', layer_id: 8, physical_layer_ids: [7, 8] },
  ]) {
    const result = await compile([owner]);
    expect(result.rejection, JSON.stringify(result.violations)).toBeUndefined();
    expect((result.nextOperation?.args as any)?.logical_layer).toBeUndefined();
  }
});

it('requires ownership for unbound nontrivial structured-mass continuation instead of bypassing object review', async () => {
  const result = await compile([], 7, 'nontrivial_painting', 'structured-mass');
  expect(result.violations.some(row => row.code === 'semantic_layer_owner_missing')).toBe(true);
  expect(result.rejection?.isError).toBe(true);
});
