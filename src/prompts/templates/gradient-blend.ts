import {
  defineGuideTemplate,
  makeGuideResult,
  readChoiceArg,
  readIntegerArg,
} from '../guide-contract.js';

const MASK_DIRECTIONS = ['top_to_bottom', 'bottom_to_top'] as const;

export const gradientBlendTemplate = defineGuideTemplate(
  'ps.gradient_blend',
  'Plan a reversible linear transition on an existing or newly created layer mask.',
  [
    {
      name: 'direction',
      description: 'Mask gradient direction: top_to_bottom or bottom_to_top (default).',
      required: false,
    },
    {
      name: 'feather_px',
      description: 'Optional selection feather before mask creation, clamped to 0-20 pixels.',
      required: false,
    },
  ],
  (args) => {
    const direction = readChoiceArg(args, 'direction', MASK_DIRECTIONS, 'bottom_to_top');
    const feather = Math.min(20, Math.max(0, readIntegerArg(args, 'feather_px', 0)));
    const preparation = feather > 0
      ? `Feather the intended selection by ${feather}px before creating the mask.`
      : 'Confirm the intended reveal region and whether the target layer already owns a mask.';

    return makeGuideResult(
      `Mask gradient (${direction.replaceAll('_', ' ')}, feather ${feather}px).`,
      [
        'Purpose: blend visibility through mask opacity while leaving source pixels intact.',
        '1. Confirm the active/pinned document and target layer with `photoshop_get_state`.',
        `2. ${preparation}`,
        '3. Create a layer mask from an explicit selection when no suitable mask exists.',
        `4. Apply \`photoshop_apply_gradient_mask\` with direction "${direction}" to the target mask.`,
        '5. Inspect one preview to verify the transition occurs on the intended layer and in the intended direction.',
        '6. Refine the mask only if the observed composite requires it; do not replace this with destructive pixel erasure.',
      ]
    );
  }
);
