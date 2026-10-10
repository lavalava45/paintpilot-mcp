import { describe, expect, it } from 'vitest';
import { directVisualChangeDomains } from '../src/core/guard/cycle-compiler.js';

describe('direct visual change-domain derivation', () => {
  it('classifies global tonal adjustments as large-value rather than local-tone', () => {
    expect(directVisualChangeDomains('photoshop_adjust_curves')).toEqual(['large-value']);
    expect(directVisualChangeDomains('photoshop_adjust_exposure')).toEqual(['large-value']);
  });

  it('classifies whole-layer transforms as composition and silhouette changes', () => {
    expect(directVisualChangeDomains('photoshop_scale_layer')).toEqual(['composition', 'silhouette']);
    expect(directVisualChangeDomains('photoshop_rotate_layer')).toEqual(['composition', 'silhouette']);
  });

  it('keeps genuinely local property and mask operations local', () => {
    expect(directVisualChangeDomains('photoshop_set_layer_opacity')).toEqual(['local-tone']);
    expect(directVisualChangeDomains('photoshop_apply_gradient_mask')).toEqual(['local-edge']);
  });

  it('does not invent a local domain for an ambiguous direct visual operation', () => {
    expect(directVisualChangeDomains('photoshop_unknown_visual_effect')).toBeUndefined();
  });
});
