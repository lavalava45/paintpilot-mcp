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
    expect(schema.properties.paint_strategy.required).toEqual([]);
    expect(schema.properties.paint_strategy.properties.material_role.type).toBe('string');
    // Legacy description remains informational; schema.required controls admission.
  });
  it('preserves independent native-gradient clip and preservation proof even without Art Director', async () => {
    const f = fixture();
    const request: any = { ...gradient(),
      request_key: 'sky-first-contained-native-gradient',
      independent_region: true,
      preservation_facts: ['Native selection confines the sky tone to the rectangle above the reviewed rooftops.'],
      actions: [{ ...gradient().actions[0], args: {
        ...gradient().actions[0].args,
        preserve_transparency: true,
        clip_contour: [{ x: 20, y: 10 }, { x: 380, y: 10 },
          { x: 380, y: 235 }, { x: 20, y: 235 }],
      } }],
    };
    const compiled = await compileGuardCycle({ next_pass: request }, f.store, f.registry);
    const args = compiled.nextOperation?.args as any;
    expect(args?.independent_region).toBe(true);
    expect(args?.preservation_facts).toEqual(request.preservation_facts);
    expect(args?.steps?.find((step: any) => step.tool === 'photoshop_paint_color_gradient')
      ?.args?.clip_contour).toEqual(request.actions[0].args.clip_contour);
    expect(compiled.violations.map(item => item.code)).not.toContain('invalid_visual_microplan');
    expect(f.dispatches()).toBe(0);
  });
  it('classifies an explicitly atmospheric broad pass as optical-veil without manufacturing a brush material', async () => {
    const f = fixture();
    for (const name of ['photoshop_paint_strokes', 'photoshop_select_brush_preset',
      'photoshop_list_brush_presets']) {
      f.registry.register(name, {
        tool: { name, inputSchema: { type: 'object' } },
        handler: async () => { throw new Error('Never paint in this test'); },
      });
    }
    const request: any = { ...gradient(), request_key: 'sky-atmospheric-classification',
      problem_id: 'upper-center-sky-too-flat', action_class: 'REFINE',
      visual_intent: 'atmospheric-mass', impact_class: 'transition',
      preferred_method_id: 'installed-brush-preset',
      independent_region: true,
      preservation_facts: ['The top sky is disjoint from the preserved distant rooftop defect.'],
      actions: [{ id: 'sky-veil', tool: 'photoshop_paint_strokes', args: {
        layer_id: 7,
        strokes: [{ tool: 'BRUSH', points: [
          { x: 30, y: 30 }, { x: 180, y: 110 }, { x: 340, y: 160 },
        ] }],
      } }],
    };
    const compiled = await compileGuardCycle({ next_pass: request }, f.store, f.registry);
    expect(compiled.normalizations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'construction_role_normalized',
        message: expect.stringContaining('optical-veil') }),
    ]));
    expect(compiled.violations.map(item => item.message).join('\n')).not.toContain(
      'broad/global soft or environmental VisualMicroPlan requires paint_strategy.construction_role');
    expect(compiled.violations.map(item => item.code)).not.toContain('construction_role_method_unavailable');
    expect((compiled.nextOperation?.args as any)?.paint_strategy?.construction_role)
      .toBe('optical-veil');
    expect((compiled.nextOperation?.args as any)?.independent_region).toBe(true);
    expect((compiled.nextOperation?.args as any)?.preservation_facts)
      .toEqual(request.preservation_facts);
    expect(f.dispatches()).toBe(0);
  });
});
