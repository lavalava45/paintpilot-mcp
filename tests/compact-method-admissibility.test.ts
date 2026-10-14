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
  it('preserves exclusion followed by tool mismatch for the same authored step', () => {
    expect(check([step('soft-edges', 'photoshop_fill_layer')], ['soft-edges'])).toEqual({
      methodClasses: ['brush'],
      violations: [
        { scope: 'next_operation', code: 'artistic_method_unavailable',
          message: 'Executed method_id=soft-edges is explicitly excluded.' },
        { scope: 'next_operation', code: 'step_method_tool_mismatch',
          message: 'method_id=soft-edges requires primary tool photoshop_paint_strokes, not photoshop_fill_layer' },
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

  it('keeps missing primaryTool as a mismatch rather than silently admitting a catalogued method', () => {
    expect(check([step('descriptive-only', 'photoshop_fill_layer')]).violations).toEqual([{
      scope: 'next_operation', code: 'step_method_tool_mismatch',
      message: 'method_id=descriptive-only requires primary tool undefined, not photoshop_fill_layer',
    }]);
  });

  it('preserves mixed-class ordering and the exact diagnostic', () => {
    expect(check([step(undefined, 'photoshop_fill_layer', 'fill'),
      step(undefined, 'photoshop_paint_strokes', 'brush'),
      step(undefined, 'photoshop_paint_regions', 'fill')])).toEqual({
      methodClasses: ['fill', 'brush'],
      violations: [{ scope: 'next_operation', code: 'compact_pass_mixed_method_class',
        message: 'next_pass actions contain incompatible mutation method classes: fill, brush; split them into bounded passes' }],
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
