import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { digitalPaintingControlTemplate } from '../src/prompts/templates/digital-painting-control.js';

function promptText(): string {
  const result = digitalPaintingControlTemplate.handler({ subject: 'choose anything yourself' });
  const content = result.messages[0]?.content;
  if (!content || content.type !== 'text') throw new Error('digital painting prompt did not return text');
  return content.text;
}

describe('open-brief subject selection', () => {
  it('selects once from diverse candidates without adding a paint-loop Guard gate', () => {
    const prompt = promptText();
    expect(prompt).toMatch(/OPEN BRIEF/);
    expect(prompt).toMatch(/4[–-]6 candidates/);
    expect(prompt).toMatch(/at least four/);
    expect(prompt).toMatch(/ease never decides alone/i);
    expect(prompt).toMatch(/no Guard gate/i);
    expect(prompt).toMatch(/no .*repeat inside the paint loop/i);
  });

  it('does not use past work as positive or negative artistic memory', () => {
    const prompt = promptText();
    expect(prompt).toMatch(/never browse or consult prior runs/i);
    expect(prompt).toMatch(/cross-run artistic memory/i);
    expect(prompt).toMatch(/atmosphere-only premises/);

    const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
    expect(agents).toMatch(/Past process directories are recovery\/evaluation evidence only/i);
    expect(agents).toMatch(/never an inspiration library or a\s+cross-run artistic memory/i);
    expect(agents).not.toMatch(/processes\/constable-process\/english-landscape-01/);
    expect(agents).not.toMatch(/subject-selection-memory\.json/);
    expect(existsSync(new URL('../docs/subject-selection-memory-template.json', import.meta.url))).toBe(false);
  });
});
