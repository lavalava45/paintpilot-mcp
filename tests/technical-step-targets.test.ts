import { describe, expect, it } from 'vitest';
import { bindUniqueNewLayerStepTarget } from '../src/core/guard/technical-step-targets.js';
import { prepareTechnicalPassBindings } from '../src/core/guard/preflight-repair.js';

const source = () => ({
  document_id: 42,
  logical_layer: { decision: 'create-new', hypothesis_id: 'sky-field', layer_name: 'Sky field' },
  actions: [
    { id: 'new-sky', tool: 'photoshop_create_layer', args: { name: 'Sky field' } },
    { id: 'fill-sky', tool: 'photoshop_fill_layer', args: { red: 10, green: 20, blue: 30 } },
  ],
});

describe('unambiguous same-cycle technical layer target', () => {
  it('binds an omitted target to the guaranteed earlier create-layer result, never an invented numeric layer', () => {
    const input = source();
    const result = prepareTechnicalPassBindings(input, {});
    expect(result.issues).toEqual([]);
    expect((result.pass.actions as any[])[1].args).toEqual({
      red: 10, green: 20, blue: 30, layer_id: '$steps.new-sky.details.layerId',
    });
    expect(result.repairs).toContainEqual(expect.objectContaining({
      kind: 'inject_from_context', path: 'next_pass.actions[1].args.layer_id',
    }));
    expect(input.actions[1].args).not.toHaveProperty('layer_id');
  });
  it('binds individually missing region targets only when all existing targets agree', () => {
    const pass: any = source();
    pass.actions[1] = { id: 'regions', tool: 'photoshop_paint_regions', args: {
      regions: [{ id: 'a' }, { id: 'b', layer_id: '$steps.new-sky.details.layerId' }],
    } };
    const result = bindUniqueNewLayerStepTarget(pass);
    expect((result.pass.actions as any[])[1].args.regions).toEqual([
      { id: 'a', layer_id: '$steps.new-sky.details.layerId' },
      { id: 'b', layer_id: '$steps.new-sky.details.layerId' },
    ]);
    expect(result.repairs).toHaveLength(1);
  });
  it('preserves explicit targets and refuses ambiguous producers, ordering, and unrelated actions', () => {
    const cases: Array<(input: any) => void> = [
      p => { p.actions[1].args.layer_id = 99; },
      p => { p.actions[1].args.layer_id = '$steps.somewhere-else.details.layerId'; },
      p => { p.actions.unshift({ id: 'other', tool: 'photoshop_create_layer', args: { name: 'Different owner' } }); },
      p => { p.actions.reverse(); },
      p => { p.actions[0].id = undefined; },
      p => { p.actions.push({ id: 'unknown', tool: 'photoshop_move_layer', args: {} }); },
      p => { p.logical_layer.layer_id = 99; },
      p => { p.logical_layer.decision = 'continue-logical-layer'; },
      p => { p.construction = { part_id: 'sky-field' }; },
      p => { p.actions[0].args.name = 'Different owner'; },
    ];
    for (const change of cases) {
      const pass: any = source();
      change(pass);
      const result = bindUniqueNewLayerStepTarget(pass);
      expect(result.repairs).toEqual([]);
      expect(result.pass).toEqual(pass);
    }
  });
  it('does not partially patch mixed region targets', () => {
    const pass: any = source();
    pass.actions[1] = { id: 'regions', tool: 'photoshop_paint_regions', args: {
      regions: [{ id: 'a' }, { id: 'b', layer_id: 99 }],
    } };
    const result = bindUniqueNewLayerStepTarget(pass);
    expect(result.repairs).toEqual([]);
    expect(result.pass).toEqual(pass);
  });
});
