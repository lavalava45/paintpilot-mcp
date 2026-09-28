import {
  defineGuideTemplate,
  makeGuideResult,
  readChoiceArg,
} from '../guide-contract.js';

const RETOUCH_MODES = ['overlay', 'soft_light'] as const;
const RETOUCH_BLEND_MODE = { overlay: 'OVERLAY', soft_light: 'SOFTLIGHT' } as const;

export const dodgeBurnGuideTemplate = defineGuideTemplate(
  'ps.dodge_burn_guide',
  'Set up reversible dodge/burn on a neutral-gray layer using Overlay or Soft Light.',
  [{
    name: 'blend_mode',
    description: 'overlay (default, stronger) or soft_light (gentler).',
    required: false,
  }],
  (args) => {
    const mode = readChoiceArg(args, 'blend_mode', RETOUCH_MODES, 'overlay');
    return makeGuideResult(
      `Dodge/burn layer (${mode.replaceAll('_', ' ')}).`,
      [
        'Purpose: isolate local light sculpting from the source layer.',
        '1. Confirm the intended document and subject layer with `photoshop_get_state`.',
        '2. Create a new layer named "Dodge & Burn" above the subject.',
        '3. Fill that layer with RGB(128, 128, 128) using `photoshop_fill_layer`.',
        `4. Set its blend mode to ${RETOUCH_BLEND_MODE[mode]} with \`photoshop_set_layer_blend_mode\`.`,
        '5. Paint white to lighten and black to darken at low opacity, evaluating form rather than brush-count.',
        '6. Keep this correction on the dedicated gray layer so it can be weakened, masked or removed independently.',
      ]
    );
  }
);
