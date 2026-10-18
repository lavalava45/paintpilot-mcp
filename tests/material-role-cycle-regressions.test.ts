import { describe, expect, it } from 'vitest';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { parseVisualMicroPlan } from '../src/core/visual-microplan.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

/** The historical rainy-street failure was a plain native gradient whose
 * artist did not specify a brush material. No Photoshop commands are run. */
const gradient = () => ({
  request_key: 'october-rain-background-gradient', problem_id: 'background-value',
  document_id: 42, goal: 'Establish a broad teal-gray atmospheric color field.',
  stage: 'GLOBAL_BLOCK_IN', scale: 'global', region: 'whole-canvas',
  action_class: 'ADD',
  visual_intent: 'continuous-field', impact_class: 'construct',
  preferred_method_id: 'continuous-color-field',
  actions: [{
    id: 'broad-field', tool: 'photoshop_paint_color_gradient',
    method_id: 'continuous-color-field',
    args: { layer_id: 7,
      from: { x: 0, y: 0 }, to: { x: 400, y: 300 },
      stops: [
        { position: 0, red: 35, green: 55, blue: 68 },
        { position: 1, red: 78, green: 96, blue: 108 },
      ],
    },
  }],
});

function fixture(owners: unknown[] = []) {
  let mutations = 0;
  const registry = new ToolRegistry();
  const visualTool = createVisualMicroPlanTools(registry)[0]!;
  registry.register(visualTool.tool.name, {
    tool: visualTool.tool,
    handler: async () => { mutations++; throw new Error('No visual mutation allowed'); },
  });
  for (const name of ['photoshop_paint_color_gradient', 'photoshop_get_preview']) {
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } },
      handler: async () => { mutations++; throw new Error('No visual mutation allowed'); } });
  }
  const store: any = {
    compactPassContext: () => ({
      painting_profile: 'simple_graphic',
      has_visual_frame: false, logical_layer_owners: owners,
    }),
    collectClosePreviousErrors: () => [],
    collectPreflightErrors: () => [],
  };
  return { registry, store, dispatches: () => mutations, visualTool };
}

describe('material role at the actual Guard cycle / executor boundary', () => {
  it('does not produce either historic schema or microplan errors when a pure gradient has no material role', async () => {
    const f = fixture();
    const compiled = await compileGuardCycle({ next_pass: gradient() }, f.store, f.registry);
    expect(compiled.violations.map(item => item.code)).not.toContain('semantic_method_contract_required');
    expect(compiled.violations.map(item => item.code)).not.toContain('tool_schema_invalid');
    expect(compiled.violations.map(item => item.code)).not.toContain('invalid_visual_microplan');
    expect(compiled.nextOperation?.args).toBeDefined();
    const args = compiled.nextOperation!.args as Record<string, unknown>;
    expect(args.paint_strategy).toMatchObject({
      construction_role: 'continuous-field',
      visual_intent: 'continuous-field', pressure_policy: 'none',
    });
    expect(args.paint_strategy).not.toHaveProperty('material_role');
    expect(parseVisualMicroPlan(args).paintStrategy?.materialRole).toBeUndefined();
    expect(f.dispatches()).toBe(0);
  });

  it('does not suppress genuinely wrong layer ownership while fixing the independent material error', async () => {
    const f = fixture([]);
    const input = { ...gradient(), logical_layer: {
      decision: 'continue-logical-layer', hypothesis_id: 'night-air-background', layer_id: 7,
    } };
    const compiled = await compileGuardCycle({ next_pass: input }, f.store, f.registry);
    const codes = compiled.violations.map(item => item.code);
    expect(codes).toContain('semantic_layer_owner_missing');
    expect(compiled.violations.filter(item =>
      item.message.includes('paint_strategy.material_role'))).toEqual([]);
    expect(codes).not.toContain('semantic_method_contract_required');
    expect(f.dispatches()).toBe(0);
  });

  it('publishes the same conditional material policy in the actual public executor schema', () => {
    const f = fixture();
    const schema: any = f.visualTool.tool.inputSchema;
    expect(schema.properties.paint_strategy.required).toEqual(['visual_intent', 'pressure_policy']);
    expect(schema.properties.paint_strategy.properties.material_role.type).toBe('string');
    expect(schema.properties.paint_strategy.description).toContain('required for preset-brush');
  });
});
