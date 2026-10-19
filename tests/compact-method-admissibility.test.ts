import { describe, expect, it } from 'vitest';
import { collectCompactMethodAdmissibility } from '../src/core/guard/compact-method-admissibility.js';

const methods = new Map<string, { primaryTool?: string }>([
  ['soft-edges', { primaryTool: 'photoshop_paint_strokes' }],
  ['continuous-color-field', { primaryTool: 'photoshop_paint_color_gradient' }],
  ['descriptive-only', {}],
]);
const step = (method_id: unknown, tool: unknown, methodClass = 'brush') =>
  ({ method_id, tool, methodClass });
const check = (
  mutationSteps: Array<Record<string, unknown>>,
  avoidMethodIds: unknown = undefined
) => collectCompactMethodAdmissibility({
  mutationSteps,
  avoidMethodIds,
  knownMethods: methods,
  methodClassForStep: row => row.methodClass as string | undefined,
});

describe('compact method admissibility extraction', () => {
  it('preserves explicit exclusion while catalog tool preferences remain advisory', () => {
    expect(check([step('soft-edges', 'photoshop_fill_layer')], ['soft-edges'])).toEqual({
      methodClasses: ['brush'],
      violations: [
        { scope: 'next_operation', code: 'artistic_method_unavailable',
          message: 'Executed method_id=soft-edges is explicitly excluded.' },
      ],
    });
  });

  it('retains the special continuous-color-field fill compatibility', () => {
    expect(check([step('continuous-color-field', 'photoshop_fill_layer', 'fill')])).toEqual({
      methodClasses: ['fill'], violations: [],
    });
  });

  it('does not invent a binding for unknown or omitted method ids', () => {
    expect(check([step('uncatalogued', 'photoshop_fill_layer'), step(undefined, 'photoshop_paint_strokes')]))
      .toEqual({ methodClasses: ['brush'], violations: [] });
  });

  it('does not treat a missing catalog primaryTool as execution authority', () => {
    expect(check([step('descriptive-only', 'photoshop_fill_layer')]).violations).toEqual([]);
  });

  it('preserves mixed-class classification without an artistic refusal', () => {
    expect(check([step(undefined, 'photoshop_fill_layer', 'fill'),
      step(undefined, 'photoshop_paint_strokes', 'brush'),
      step(undefined, 'photoshop_paint_regions', 'fill')])).toEqual({
      methodClasses: ['fill', 'brush'],
      violations: [],
    });
  });

  it('retains trimmed method matching and ignores non-array exclusions', () => {
    expect(check([step(' soft-edges ', 'photoshop_paint_strokes')], 'soft-edges'))
      .toEqual({ methodClasses: ['brush'], violations: [] });
    expect(check([step(' soft-edges ', 'photoshop_paint_strokes')], ['soft-edges']).violations)
      .toEqual([{ scope: 'next_operation', code: 'artistic_method_unavailable',
        message: 'Executed method_id=soft-edges is explicitly excluded.' }]);
  });
});
