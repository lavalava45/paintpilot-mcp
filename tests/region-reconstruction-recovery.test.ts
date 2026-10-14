import { expect, it } from 'vitest';
import { visualStrategyFingerprint } from '../src/core/guard/session-store.js';

it('keeps the region method but distinguishes actual geometry from labels and recoloring', () => {
  const original = {
    tool: 'photoshop_execute_visual_microplan', problem_id: 'structural-rebuild',
    args: { problem_id: 'structural-rebuild', method_class: 'region', stage: 'MEDIUM_FORM',
      action_class: 'REPLACE', steps: [
        { tool: 'photoshop_paint_regions', method_id: 'region-block-in', args: {
          regions: [{ color: { red: 20, green: 20, blue: 20 },
            contours: [{ points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 30 }] }] }],
        } },
      ] },
  };
  const recolored = structuredClone(original);
  recolored.args.steps[0].args.regions[0].color.red = 210;
  expect(visualStrategyFingerprint(recolored)).toBe(visualStrategyFingerprint(original));
  const recontoured = structuredClone(recolored);
  recontoured.args.steps[0].args.regions[0].contours[0].points[1].x = 55;
  expect(visualStrategyFingerprint(recontoured)).not.toBe(visualStrategyFingerprint(original));
});
