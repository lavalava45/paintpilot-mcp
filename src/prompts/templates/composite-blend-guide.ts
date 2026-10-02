import {
  defineGuideTemplate,
  makeGuideResult,
  readChoiceArg,
  readTextArg,
} from '../guide-contract.js';

const COMPOSITE_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft_light'] as const;
const PHOTOSHOP_BLEND_MODE = {
  normal: 'NORMAL',
  multiply: 'MULTIPLY',
  screen: 'SCREEN',
  overlay: 'OVERLAY',
  soft_light: 'SOFTLIGHT',
} as const;

export const compositeBlendTemplate = defineGuideTemplate(
  'ps.composite_blend',
  'Plan a reversible external-image composite using placement, masks and explicit blend-mode control.',
  [
    { name: 'image_path', description: 'Absolute path to the external image to place.', required: true },
    { name: 'blend_mode', description: 'normal, multiply, screen, overlay, or soft_light.', required: false },
  ],
  (args) => {
    const imagePath = readTextArg(args, 'image_path', '');
    const mode = readChoiceArg(args, 'blend_mode', COMPOSITE_MODES, 'normal');
    const placement = imagePath
      ? `Place the asset with \`photoshop_place_image\` using filePath "${imagePath}" and explicit canvas coordinates.`
      : 'No image_path was supplied. Obtain an absolute local path before dispatching `photoshop_place_image`.';

    return makeGuideResult(
      `Composite setup${imagePath ? ` for ${imagePath}` : ''} (${mode.replaceAll('_', ' ')}).`,
      [
        'Purpose: keep the incoming asset independently editable and make every blend decision observable.',
        '1. Establish the target document with `photoshop_get_state` and keep its document_id pinned.',
        `2. ${placement}`,
        '3. Reposition/scale the placed layer with semantic transform tools when the first preview requires it.',
        '4. Use `photoshop_create_layer_mask` when the composite needs a bounded reveal rather than destructive erasure.',
        '5. Use `photoshop_apply_gradient_mask` or `ps.gradient_blend` only for a genuine mask fade.',
        `6. If blending is requested, set the placed layer to ${PHOTOSHOP_BLEND_MODE[mode]} with \`photoshop_set_layer_blend_mode\`.`,
        '7. Inspect one whole-image preview and adjust placement/mask/blend mode from evidence rather than adding blind steps.',
      ]
    );
  }
);
