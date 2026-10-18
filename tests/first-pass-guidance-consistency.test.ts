import { describe, expect, it } from 'vitest';
import { PHOTOSHOP_MCP_INSTRUCTIONS } from '../src/prompts/host-guidance.js';
import { digitalPaintingControlTemplate } from '../src/prompts/templates/digital-painting-control.js';

const guideText = (subject: string, style: string): string => {
  const result = digitalPaintingControlTemplate.handler({ subject, style });
  const part = result.messages[0]?.content;
  return part?.type === 'text' ? part.text : '';
};

describe('First-pass brief fidelity and method/tool capability contract', () => {
  it('preserves the original user brief and prevents the execution interpretation from replacing it', () => {
    const brief = 'Peaceful spring canal village with white cottages, willow trees, wooden boats and watercolor reflections';
    const text = guideText(brief, 'dreamy watercolor, photographic light, 4K detail');
    expect(text).toContain(brief);
    expect(text).toContain('dreamy watercolor, photographic light, 4K detail');
    expect(text).toMatch(/preserve original_brief verbatim/i);
    expect(text).toMatch(/SINGLE-OWNER/);
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toMatch(/preserve original_brief VERBATIM/);
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toMatch(/4K detail\) are not Photoshop method_ids/);
  });

  it('does not contradict single-owner safety with a mandatory five-object first visual pass in simple_graphic', () => {
    const guide = guideText('spring canal scene', 'watercolor');
    expect(guide).toMatch(/In simple_graphic only, the first execution may be ONE independent/);
    expect(guide).toMatch(/never call the initial sky field complete/i);
    expect(guide).toMatch(/nontrivial_painting starts with requested subject/);
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toMatch(/In simple_graphic, ONE independently editable/);
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toMatch(/cottages, trees, canal, boats and sky/);
    expect(guide).not.toMatch(/No independent sky\/fog\/gradient first task/);
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).not.toMatch(/Do not spend an independent first task on an empty sky/);
  });

  it('names the exact first-rejection failure prevention without relaxing a real Guard check', () => {
    const guide = guideText('canal village', 'painterly');
    expect(guide).toContain('installed-brush-preset executes paint_strokes');
    expect(guide).toContain('region-block-in executes paint_regions');
    expect(guide).toMatch(/missing project art_run requires a separate setup action before mutation/);
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('photoshop_guard_set_art_run must be registered BEFORE');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toContain('For terminal_not_executed do NOT resend');
    expect(PHOTOSHOP_MCP_INSTRUCTIONS).toMatch(/single-owner bounded request/);
  });
});
