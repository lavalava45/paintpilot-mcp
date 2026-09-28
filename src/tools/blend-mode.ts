const NORMAL_GROUP = ['NORMAL', 'DISSOLVE'] as const;
const DARKEN_GROUP = ['DARKEN', 'MULTIPLY', 'COLORBURN', 'LINEARBURN', 'DARKERCOLOR'] as const;
const LIGHTEN_GROUP = ['LIGHTEN', 'SCREEN', 'COLORDODGE', 'LINEARDODGE', 'LIGHTERCOLOR'] as const;
const CONTRAST_GROUP = ['OVERLAY', 'SOFTLIGHT', 'HARDLIGHT', 'VIVIDLIGHT', 'LINEARLIGHT', 'PINLIGHT', 'HARDMIX'] as const;
const DIFFERENCE_GROUP = ['DIFFERENCE', 'EXCLUSION', 'SUBTRACT', 'DIVIDE'] as const;
const COMPONENT_GROUP = ['HUE', 'SATURATION', 'COLOR', 'LUMINOSITY'] as const;

export const LAYER_BLEND_MODE_ENUM = [
  ...NORMAL_GROUP,
  ...DARKEN_GROUP,
  ...LIGHTEN_GROUP,
  ...CONTRAST_GROUP,
  ...DIFFERENCE_GROUP,
  ...COMPONENT_GROUP,
] as const;

export type LayerBlendMode = (typeof LAYER_BLEND_MODE_ENUM)[number];

const SAFE_TOKENS = new Set<string>([
  ...LAYER_BLEND_MODE_ENUM,
  'COLORBLEND',
  'PASSTHROUGH',
]);

export function resolveLayerBlendMode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(token) || !SAFE_TOKENS.has(token)) return null;
  return token === 'COLOR' ? 'COLORBLEND' : token;
}
