import { describe, expect, it } from 'vitest';
import { resolveCompactActionClass } from '../src/core/guard/compact-action-class.js';

const resolve = (raw: Record<string, unknown>, methodClass?: string, mutationSteps: Array<Record<string, unknown>> = []) =>
  resolveCompactActionClass({ raw, methodClass, mutationSteps });

const replaceStep = (regions: unknown) => ({
  tool: 'photoshop_paint_regions',
  args: { replace_contents: true, regions },
});

describe('compact action-class preflight extraction', () => {
  it('preserves explicit class normalization and inferred defaults', () => {
    expect(resolve({ action_class: ' replace ' })).toEqual({ actionClass: 'REPLACE', violations: [] });
    expect(resolve({}, 'rollback')).toEqual({ actionClass: 'ROLLBACK', violations: [] });
    expect(resolve({}, 'erase')).toEqual({ actionClass: 'ERASE', violations: [] });
    expect(resolve({})).toEqual({ actionClass: 'ADD', violations: [] });
  });

  it('does not silently repair an invalid explicit class', () => {
    expect(resolve({ action_class: 'unknown' }, 'rollback')).toEqual({
      actionClass: 'UNKNOWN',
      violations: [{ scope: 'next_operation', code: 'compact_action_class_invalid',
        message: 'next_pass.action_class must be one of ADD|REFINE|REPLACE|ERASE|ROLLBACK' }],
    });
  });

  it('requires explicit class for protected replacement even with inferred ERASE', () => {
    expect(resolve({ replace_protected_layer_ids: [11] }, 'erase')).toEqual({
      actionClass: 'ERASE',
      violations: [{ scope: 'next_operation', code: 'compact_replace_action_required',
        message: 'replace_protected_layer_ids requires explicit next_pass.action_class=REPLACE or ERASE' }],
    });
  });

  it('admits replacement only when every region pins the declared layer', () => {
    const raw = { action_class: 'REPLACE', logical_layer: { layer_id: 12 } };
    expect(resolve(raw, undefined, [replaceStep([{ layer_id: 12 }, { layer_id: 12 }])])).toEqual({
      actionClass: 'REPLACE', violations: [],
    });
    expect(resolve(raw, undefined, [replaceStep([{ layer_id: 12 }, { layer_id: 13 }])]).violations.map(v => v.code))
      .toEqual(['component_rebuild_target_required']);
  });

  it('rejects implicit active target, absent regions and non-REPLACE class', () => {
    const cases = [
      resolve({ action_class: 'REPLACE' }, undefined, [replaceStep([{ layer_id: 12 }])]),
      resolve({ action_class: 'REPLACE', logical_layer: { layer_id: 12 } }, undefined, [replaceStep([])]),
      resolve({ action_class: 'ADD', logical_layer: { layer_id: 12 } }, undefined, [replaceStep([{ layer_id: 12 }])]),
    ];
    for (const result of cases) expect(result.violations).toEqual([{
      scope: 'next_operation', code: 'component_rebuild_target_required',
      message: 'Replacing contents requires explicit REPLACE, one durable owned layer and every region pinned to that same layer. Never clear an implicit active target.',
    }]);
  });
});
