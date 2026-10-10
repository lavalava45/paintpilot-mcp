import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore } from './guard/session-store.js';
import { normalizeUserConfig, parseUserConfigPatch, UserConfigValidationError } from './user-config.js';

const tempRoots: string[] = [];

function createStore() {
  const root = mkdtempSync(path.join(tmpdir(), 'paintpilot-user-config-'));
  tempRoots.push(root);
  const runtimeDirectory = path.join(root, '.photoshop-runtime', 'controller');
  return {
    root,
    runtimeDirectory,
    store: new SessionStore(runtimeDirectory, { workspaceRoot: root }),
  };
}

afterEach(() => {
  while (tempRoots.length) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('user config normalization', () => {
  it('falls back field-by-field when persisted presentation values are invalid', () => {
    const normalized = normalizeUserConfig({
      config_version: 99,
      language: 'de',
      commentary_mode: 'mixed',
      commentary_detail: 'verbose',
    });

    expect(normalized.config).toMatchObject({
      config_version: 1,
      language: 'auto',
      commentary_mode: 'mixed',
      commentary_detail: 'normal',
    });
    expect(normalized.sources).toEqual({
      language: 'default',
      commentary_mode: 'stored',
      commentary_detail: 'default',
    });
    expect(normalized.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('unsupported config_version'),
      expect.stringContaining('invalid language'),
      expect.stringContaining('invalid commentary_detail'),
    ]));
  });

  it('rejects invalid write patches without accepting a second vocabulary', () => {
    expect(() => parseUserConfigPatch({ commentary_mode: 'hybrid' }))
      .toThrow(UserConfigValidationError);
    expect(() => parseUserConfigPatch({ language: 'de' }))
      .toThrow('language must be auto|ru|en');
    expect(() => parseUserConfigPatch({ unknown: true }))
      .toThrow('unsupported user config field');
  });
});

describe('SessionStore user config persistence and precedence', () => {
  it('persists in painting-state.json, feeds new runs, and preserves sticky run precedence', () => {
    const { runtimeDirectory, store } = createStore();

    expect(store.userConfig()).toMatchObject({
      effective: {
        language: 'auto',
        commentary_mode: 'mixed',
        commentary_detail: 'normal',
      },
      sources: {
        language: 'default',
        commentary_mode: 'default',
        commentary_detail: 'default',
      },
    });

    store.setUserConfig({
      language: 'ru',
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
    });

    const firstRun = store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/user-config-process/run-01',
      painting_profile: 'simple_graphic',
    });
    expect(firstRun).toMatchObject({
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
    });

    store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/user-config-process/run-01',
      commentary_mode: 'technical',
      commentary_detail: 'short',
      painting_profile: 'simple_graphic',
    });
    store.setUserConfig({
      commentary_mode: 'mixed',
      commentary_detail: 'normal',
    });

    expect(store.userConfig(42)).toMatchObject({
      configured: {
        language: 'ru',
        commentary_mode: 'mixed',
        commentary_detail: 'normal',
      },
      effective: {
        language: 'ru',
        commentary_mode: 'technical',
        commentary_detail: 'short',
      },
      sources: {
        language: 'user_config',
        commentary_mode: 'art_run',
        commentary_detail: 'art_run',
      },
    });

    const panelSave = store.setUserConfig({
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
    }, 42);
    expect(panelSave).toMatchObject({
      effective: {
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
      },
      sources: {
        commentary_mode: 'art_run',
        commentary_detail: 'art_run',
      },
    });

    expect(store.presentationContext(42)).toEqual({
      protocol: 'photoshop.presentation_context.v1',
      language: 'ru',
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
      sources: {
        language: 'user_config',
        commentary_mode: 'art_run',
        commentary_detail: 'art_run',
      },
    });
    expect(store.artisticContinuationContext(42)).toMatchObject({
      presentation_context: {
        protocol: 'photoshop.presentation_context.v1',
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
      },
    });
    expect(store.statusCompact().documents['42']).toMatchObject({
      presentation_context: {
        protocol: 'photoshop.presentation_context.v1',
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
      },
    });

    const persisted = JSON.parse(readFileSync(path.join(runtimeDirectory, 'painting-state.json'), 'utf8'));
    expect(persisted.user_config).toMatchObject({
      config_version: 1,
      language: 'ru',
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
    });
    expect(persisted.documents['42']).toMatchObject({
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
    });

    const reloaded = new SessionStore(runtimeDirectory, { workspaceRoot: path.dirname(path.dirname(runtimeDirectory)) });
    expect(reloaded.userConfig(42).effective).toEqual({
      language: 'ru',
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
    });
  });
});
