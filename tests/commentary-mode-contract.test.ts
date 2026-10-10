import { describe, expect, it } from 'vitest';
import { PHOTOSHOP_MCP_INSTRUCTIONS } from '../src/prompts/host-guidance.js';
import { digitalPaintingControlTemplate } from '../src/prompts/templates/digital-painting-control.js';

function paintingGuideText(): string {
  const result = digitalPaintingControlTemplate.handler({ subject: 'contract fixture' });
  const content = result.messages?.[0]?.content;
  return content && content.type === 'text' ? content.text : '';
}

describe('commentary mode content contract', () => {
  it('defines technical as developer/debug telemetry rather than artist-facing Photoshop craft', () => {
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('`technical` is developer/debug telemetry only');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('Guard admission/barriers/evidence/receipts/checkpoints/recovery');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('ids/hashes/protocol/schema');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('compiler/preflight/repair/retry/fallback decisions');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('Do not spend this mode on artistic rationale or Photoshop technique');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('technical mode means evidence and diagnostics, not private reasoning');
  });

  it('defines artistic as visual reasoning plus concrete Photoshop technique and parameters', () => {
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('`artistic` is artist-usable reasoning and Photoshop craft');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('composition, hierarchy, depth, perspective/geometry, form, value/light');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('Layer/mask/selection structure, brush preset and');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('brush settings, opacity/flow/hardness/size/spacing/smoothing/pressure');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('blend mode, adjustment/');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('filter/gradient/transform parameters');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('inspected before/after');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('Hide MCP/Guard/API/JSON');
  });

  it('defines mixed as artistic first plus a separate compact debug note without duplicated facts', () => {
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('`mixed` emits the full artist-facing explanation first');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('clearly separated compact');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('Do not duplicate the same fact in both sections');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('`commentary_detail` changes depth/length inside the selected content boundary only');
  });

  it('keeps the painting guide aligned with the canonical server policy and current language preference', () => {
    const text = paintingGuideText();
    expect(text).toContain('technical=developer/debug telemetry only');
    expect(text).toContain('artistic=artist-facing visual reasoning plus practical Photoshop craft/settings');
    expect(text).toContain('mixed=artistic first + compact separated debug note');
    expect(text).toContain('Use presentation_context.language');
    expect(text).not.toContain('Artist voice is natural Russian');
  });
});
