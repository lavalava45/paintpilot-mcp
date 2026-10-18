import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG_LANGUAGES, REPORT_LANGUAGES, effectiveReportLanguage,
  modelReportLanguageDirective, reportText } from '../src/core/report-locales.js';
import { renderCommentarySidecar, artisticToolDescription } from '../src/core/guard/painting-commentary-presentation.js';
import { operationNarrative, formatOperationNarrative } from '../src/core/guard/operation-narrative.js';
import { parseUserConfigPatch } from '../src/core/user-config.js';

const expected = {
  ru: ['Кадр', 'Что сделал', 'Сейчас'],
  en: ['Frame', 'Did', 'Now'],
  es: ['Fotograma', 'Qué hice', 'Ahora'],
  'pt-BR': ['Quadro', 'O que fiz', 'Agora'],
  de: ['Bild', 'Ausgeführt', 'Jetzt'],
  fr: ['Image', 'Action effectuée', 'Maintenant'],
};

describe('localized report/progress surface', () => {
  it('shares one canonical list with persisted configuration and the Photoshop panel', () => {
    const html = readFileSync(fileURLToPath(new URL('../uxp-plugin/index.html', import.meta.url)), 'utf8');
    for (const language of CONFIG_LANGUAGES) {
      expect(html).toContain(`value="${language}"`);
      expect(parseUserConfigPatch({ language }).language).toBe(language);
    }
    expect(effectiveReportLanguage('PT-br')).toBe('pt-BR');
    expect(effectiveReportLanguage('auto', 'Нарисуй море')).toBe('ru');
    expect(effectiveReportLanguage('auto', 'Paint a sea')).toBe('en');
  });

  it.each(REPORT_LANGUAGES)('renders %s headings, brush description, and operation status', language => {
    const [frame, did, now] = expected[language];
    expect(reportText(language, 'frame')).toBe(frame);
    expect(reportText(language, 'did')).toBe(did);
    expect(reportText(language, 'now')).toBe(now);
    const record = {
      id: 'op-localized', tool: 'photoshop_paint_regions', args: {
        logical_layer: { layer_name: 'Scene 1' },
        steps: [{ tool: 'photoshop_paint_regions', args: { regions: [{ opacity: 75 }] } }],
      },
      preview: { project_path: '/tmp/frame-1.jpg' },
      artistic_commentary: 'Artistic intent',
      report: { did: 'Painted', why: 'Improve clarity', result: 'Observed visible change' },
    };
    const sidecar = renderCommentarySidecar(record, {
      language, commentary_mode: 'technical', commentary_detail: 'detailed',
    });
    expect(sidecar).toContain(`${frame}: frame-1.jpg`);
    expect(sidecar).toContain(`${did}: Painted`);
    expect(artisticToolDescription(record, language, 'detailed')).toContain(reportText(language, 'workingLayer'));
    const narrative = operationNarrative({ id: 'op-localized', tool: 'photoshop_paint_regions', visual: true },
      'queued', { language });
    expect(narrative.text).toContain(`${now}:`);
    expect(narrative.text).toContain(reportText(language, 'statusQueued'));
    expect(formatOperationNarrative(narrative)).toBe(narrative.text);
    expect(modelReportLanguageDirective(language)).toContain('user-visible');
  });

  it.each(['es', 'pt-BR', 'de', 'fr'] as const)('%s renders localized artistic/mixed sidecars', language => {
    const record = {
      id: 'op-localized', tool: 'photoshop_fill_layer', args: { steps: [{ tool: 'photoshop_fill_layer' }] },
      preview: { project_path: '/tmp/frame-1.jpg' },
      artistic_commentary: 'User-authored intent',
      report: { did: '', why: '', result: '' },
    };
    const artistic = renderCommentarySidecar(record, {
      language, commentary_mode: 'artistic', commentary_detail: 'normal',
    });
    expect(artistic).toContain(reportText(language, 'unconfirmedPass'));
    expect(artistic.toLocaleLowerCase()).toContain(reportText(language, 'unassessedVisual').toLocaleLowerCase());
    expect(artistic).not.toContain(reportText(language, 'completedStep', { text: '' }));
    expect(artistic).not.toContain('Pass execution is unconfirmed');
    const mixed = renderCommentarySidecar(record, {
      language, commentary_mode: 'mixed', commentary_detail: 'short',
    });
    expect(mixed).toContain(reportText(language, 'technicalRecord'));
  });
});
