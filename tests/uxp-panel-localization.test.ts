import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../uxp-plugin/index.html', import.meta.url), 'utf8');

function loadLocaleResolver(): (locale?: string) => 'ru' | 'en' {
  const match = source.match(/function panelLanguageFromLocale\(locale\) \{[\s\S]*?\n\}/);
  if (!match) throw new Error('panelLanguageFromLocale not found');
  return runInNewContext(`${match[0]}\npanelLanguageFromLocale`) as (locale?: string) => 'ru' | 'en';
}

describe('UXP panel host-locale presentation', () => {
  it('uses Photoshop UXP host.uiLocale with English as the publish-safe fallback', () => {
    const resolve = loadLocaleResolver();
    expect(resolve('ru_RU')).toBe('ru');
    expect(resolve('ru-RU')).toBe('ru');
    expect(resolve('en_US')).toBe('en');
    expect(resolve('de_DE')).toBe('en');
    expect(resolve()).toBe('en');
    expect(source).toContain("const PANEL_LANGUAGE = panelLanguageFromLocale(host?.uiLocale);");
  });

  it('ships English static markup so the panel is readable before JavaScript localization runs', () => {
    expect(html).toContain('Enable video recording');
    expect(html).toContain('Report language');
    expect(html).toContain('Commentary');
    expect(html).toContain('Detail');
    expect(html).not.toContain('Включить видеозапись');
  });
});
