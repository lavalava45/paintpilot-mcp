import { describe, expect, it } from 'vitest';
import { PHOTOSHOP_MCP_INSTRUCTIONS } from '../src/prompts/host-guidance.js';
import { digitalPaintingControlTemplate } from '../src/prompts/templates/digital-painting-control.js';

function paintingGuideText(): string {
  const result = digitalPaintingControlTemplate.handler({ subject: 'contract fixture' });
  const content = result.messages?.[0]?.content;
  return content && content.type === 'text' ? content.text : '';
}

describe('commentary mode content contract', () => {
  it('routes document tab mismatches through the registered Guard navigation tool with focus consent', () => {
    const guide = paintingGuideText();
    for (const text of [guide, PHOTOSHOP_MCP_INSTRUCTIONS]) {
      expect(text).toContain('photoshop_set_active_document');
      expect(text).toContain('photoshop_guard_capabilities');
      expect(text).toContain('photoshop_guard_cycle_auto');
      expect(text).toContain('photoshop_get_state');
      expect(text).toContain('document_id');
    }
    expect(guide).toContain('Without permission, ask to activate through MCP instead of making the user click the tab');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('Without permission,');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('If the intended id is already active, just continue.');
    expect(guide).toContain('decision_loop_stall at 90s is advisory, NOT a Guard failure');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('Guard prohibition. Do not wait, ask for a manual tab switch');
  });

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
  it('replans an unverified optional named preset as a separately verified generic BRUSH method', () => {
    const guide = paintingGuideText();
    expect(guide).toContain('preset_verification.source=unavailable');
    expect(guide).toContain('hard-brush-line');
    expect(guide).toContain('photoshop_set_brush');
    expect(guide).toContain('photoshop_paint_strokes');
    expect(guide).toContain('required exact preset');
  });
});
