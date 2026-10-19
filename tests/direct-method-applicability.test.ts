import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { directMethodApplicability } from '../src/core/guard/direct-method-applicability.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';

const registryWith = (...names: string[]): ToolRegistry => {
  const registry = new ToolRegistry();
  for (const name of names) registry.register(name, {
    tool: { name, inputSchema: { type: 'object' } },
    handler: async () => { throw new Error('Do not send mutations'); },
  });
  return registry;
};

describe('method applicability is an executor property, not a generic mutation requirement', () => {
  it('does not require a paint palette method for registered native layer lifecycle edits', () => {
    const nativeTools = [
      'photoshop_delete_layer', 'photoshop_delete_layer_mask',
      'photoshop_rename_layer', 'photoshop_set_layer_visibility',
      'photoshop_set_layer_locked', 'photoshop_move_layer_to_position',
    ];
    const registry = registryWith(...nativeTools);
    for (const name of nativeTools) {
      expect(directMethodApplicability(registry, name), name).toBe('native-nonpainting');
    }
  });

  it('still requires painting method compatibility for registered painting and filter tools', () => {
    const painterTools = [
      'photoshop_paint_regions', 'photoshop_paint_color_gradient',
      'photoshop_apply_gaussian_blur', 'photoshop_adjust_curves',
    ];
    const registry = registryWith(...painterTools);
    for (const name of painterTools) {
      expect(directMethodApplicability(registry, name), name).toBe('painting-method');
    }
  });

  it('distinguishes registered preparation/read-only operations from unknown, unregistered and forbidden commands', () => {
    const registry = registryWith(
      'photoshop_unreviewed_future_tool', 'photoshop_select_layer_by_name',
      'photoshop_get_layers', 'photoshop_delete_layer', 'photoshop_generative_fill',
    );
    expect(directMethodApplicability(registry, 'photoshop_unreviewed_future_tool')).toBe('unverified-tool');
    expect(directMethodApplicability(registry, 'photoshop_select_layer_by_name')).toBe('native-nonpainting');
    expect(directMethodApplicability(registry, 'photoshop_get_layers')).toBe('native-nonpainting');
    expect(directMethodApplicability(registry, 'photoshop_generative_fill')).toBe('unverified-tool');
    expect(directMethodApplicability(registryWith(), 'photoshop_delete_layer')).toBe('unverified-tool');
  });

  it('does not hide invalid artist-method hints for an actual registered painting operation', async () => {
    const registry = registryWith('photoshop_apply_gaussian_blur');
    const store: any = {
      compactPassContext: () => ({ painting_profile: 'simple_graphic', has_visual_frame: true }),
      collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
    };
    const result = await compileGuardCycle({ next_pass: {
      request_key: 'mismatched-real-paint', problem_id: 'edge', document_id: 625,
      goal: 'Blur the existing edge.', stage: 'FORM', scale: 'local',
      action_class: 'REFINE',
      visual_intent: 'line', impact_class: 'construct',
      preferred_method_id: 'pencil-line',
      actions: [{ tool: 'photoshop_apply_gaussian_blur', args: { layer_id: 16, radius: 3 } }],
    } }, store, registry);
    expect(result.violations.map(item => item.code)).not.toContain('artistic_method_unavailable');
    expect(result.normalizations.some(item => item.code === 'artistic_method_advisory')).toBe(true);
    expect(result.violations.map(item => item.code)).not.toContain('artistic_method_not_applicable_to_native_operation');
  });
});
