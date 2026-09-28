import type { PromptRegistry } from '../core/prompt-registry.js';
import { toPromptDefinition } from './guide-contract.js';
import { colorCorrectTemplate } from './templates/color-correct.js';
import { compositeBlendTemplate } from './templates/composite-blend.js';
import { digitalPaintingControlTemplate } from './templates/digital-painting-control.js';
import { dodgeBurnGuideTemplate } from './templates/dodge-burn-guide.js';
import { gradientBlendTemplate } from './templates/gradient-blend.js';

const GUIDE_CATALOG = Object.freeze([
  gradientBlendTemplate,
  colorCorrectTemplate,
  dodgeBurnGuideTemplate,
  compositeBlendTemplate,
  digitalPaintingControlTemplate,
]);

export const PHOTOSHOP_PROMPT_TEMPLATES = GUIDE_CATALOG;
export const PHOTOSHOP_GUIDE_PROMPT_NAMES = Object.freeze(
  GUIDE_CATALOG.map(({ name }) => name)
);

export function registerPhotoshopPrompts(registry: PromptRegistry): void {
  GUIDE_CATALOG.forEach((template) => {
    registry.register(template.name, toPromptDefinition(template));
  });
}
