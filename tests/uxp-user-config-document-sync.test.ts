import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8');

describe('UXP user-config active-document synchronization', () => {
  it('displays exact painting profile names and persists panel choice through the shared bridge endpoint', () => {
    const html = readFileSync(new URL('../uxp-plugin/index.html', import.meta.url), 'utf8');
    expect(html).toContain('id="userConfigPaintingProfile"');
    for (const value of ['auto', 'simple_graphic', 'nontrivial_painting']) {
      expect(html).toContain('value="' + value + '"');
      expect(source).toContain(value);
    }
    expect(source).toContain("updateUserConfigSetting('painting_profile', userConfigPaintingProfile.value)");
    expect(source).toContain('userConfigPaintingProfile.value = state.configured.painting_profile;');
    expect(source).toContain("body: JSON.stringify({ [field]: value })");
    expect(source).toContain("paintingProfileNextRun: ' · applies to next art run'");
  });
  it('refreshes effective presentation settings when the active Photoshop document changes', () => {
    expect(source).toContain('let lastUserConfigDocumentId = null;');
    expect(source).toContain('const activeDocumentId = numericValue(app.activeDocument?.id) ?? null;');
    expect(source).toContain('const activeDocumentChanged = activeDocumentId !== lastUserConfigDocumentId;');
    expect(source).toContain('if (connected && (!wasConnected || activeDocumentChanged)) {');
    expect(source).toContain('lastUserConfigDocumentId = activeDocumentId;');
    expect(source).toMatch(/activeDocumentChanged[\s\S]{0,500}refreshUserConfig\(\);/);
  });
});
