import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8');

describe('UXP user-config active-document synchronization', () => {
  it('refreshes effective presentation settings when the active Photoshop document changes', () => {
    expect(source).toContain('let lastUserConfigDocumentId = null;');
    expect(source).toContain('const activeDocumentId = numericValue(app.activeDocument?.id) ?? null;');
    expect(source).toContain('const activeDocumentChanged = activeDocumentId !== lastUserConfigDocumentId;');
    expect(source).toContain('if (connected && (!wasConnected || activeDocumentChanged)) {');
    expect(source).toContain('lastUserConfigDocumentId = activeDocumentId;');
    expect(source).toMatch(/activeDocumentChanged[\s\S]{0,500}refreshUserConfig\(\);/);
  });
});
