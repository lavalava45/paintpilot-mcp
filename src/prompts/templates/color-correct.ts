import {
  defineGuideTemplate,
  makeGuideResult,
  readChoiceArg,
} from '../guide-contract.js';

const CORRECTION_METHODS = ['auto_levels', 'brightness_contrast'] as const;

export const colorCorrectTemplate = defineGuideTemplate(
  'ps.color_correct',
  'Plan a neutral tonal correction with semantic Photoshop adjustment tools.',
  [{
    name: 'preset',
    description: 'Starting correction: auto_levels (default) or brightness_contrast.',
    required: false,
  }],
  (args) => {
    const method = readChoiceArg(args, 'preset', CORRECTION_METHODS, 'auto_levels');
    const primaryAction = method === 'auto_levels'
      ? 'Run `photoshop_auto_levels` on the intended raster target.'
      : 'Run `photoshop_adjust_brightness_contrast` conservatively and judge the result from preview evidence.';

    return makeGuideResult(
      `Neutral color correction (${method.replaceAll('_', ' ')}).`,
      [
        'Purpose: restore useful tonal separation without silently turning the edit into a creative grade.',
        '1. Confirm the active/pinned document and intended layer with `photoshop_get_state`.',
        '2. Inspect `photoshop_get_preview` when the current image has not yet been observed.',
        `3. ${primaryAction}`,
        '4. Use `photoshop_adjust_curves` when selective tonal shaping is needed rather than stacking arbitrary global changes.',
        '5. Inspect one post-adjustment preview and stop when the requested correction is satisfied.',
        '6. Keep original pixels reversible by using duplicated or adjustment-layer workflows when the task requires that property.',
      ]
    );
  }
);
