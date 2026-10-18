import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
      language: 'xx',
      commentary_mode: 'mixed',
      commentary_detail: 'verbose',
      painting_profile: 'unknown',
    });

    expect(normalized.config).toMatchObject({
      config_version: 1,
      language: 'auto',
      commentary_mode: 'mixed',
      commentary_detail: 'normal',
      painting_profile: 'auto',
    });
    expect(normalized.sources).toEqual({
      language: 'default',
      commentary_mode: 'stored',
      commentary_detail: 'default',
      painting_profile: 'default',
    });
    expect(normalized.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('unsupported config_version'),
      expect.stringContaining('invalid language'),
      expect.stringContaining('invalid commentary_detail'),
      expect.stringContaining('invalid painting_profile'),
    ]));
  });

  it('rejects invalid write patches without accepting a second vocabulary', () => {
    expect(() => parseUserConfigPatch({ commentary_mode: 'hybrid' }))
      .toThrow(UserConfigValidationError);
    expect(() => parseUserConfigPatch({ language: 'xx' }))
      .toThrow('language must be auto|ru|en');
    expect(() => parseUserConfigPatch({ unknown: true }))
      .toThrow('unsupported user config field');
    expect(() => parseUserConfigPatch({ painting_profile: 'complex' }))
      .toThrow('painting_profile must be auto|simple_graphic|nontrivial_painting');
    expect(parseUserConfigPatch({ painting_profile: 'simple_graphic' }))
      .toEqual({ painting_profile: 'simple_graphic' });
  });

  it('accepts and canonically persists four additional report languages', () => {
    for (const language of ['es', 'pt-BR', 'de', 'fr']) {
      expect(parseUserConfigPatch({ language })).toEqual({ language });
      expect(normalizeUserConfig({ language }).config.language).toBe(language);
    }
    expect(parseUserConfigPatch({ language: 'PT-br' })).toEqual({ language: 'pt-BR' });
    expect(normalizeUserConfig({ language: 'pt-br' }).config.language).toBe('pt-BR');
    expect(normalizeUserConfig({ language: 'xx' }).config.language).toBe('auto');
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
        painting_profile: 'auto',
      },
      sources: {
        language: 'default',
        commentary_mode: 'default',
        commentary_detail: 'default',
        painting_profile: 'default',
      },
    });

    store.setUserConfig({
      language: 'ru',
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
      painting_profile: 'auto',
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
        painting_profile: 'auto',
      },
      effective: {
        language: 'ru',
        commentary_mode: 'technical',
        commentary_detail: 'short',
        painting_profile: 'auto',
      },
      sources: {
        language: 'user_config',
        commentary_mode: 'art_run',
        commentary_detail: 'art_run',
        painting_profile: 'user_config',
      },
    });

    const panelSave = store.setUserConfig({
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
      painting_profile: 'auto',
    }, 42);
    expect(panelSave).toMatchObject({
      effective: {
        language: 'ru',
        commentary_mode: 'artistic',
        commentary_detail: 'detailed',
        painting_profile: 'auto',
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
      painting_profile_selection: 'auto',
      active_run_painting_profile: 'simple_graphic',
      sources: {
        language: 'user_config',
        commentary_mode: 'art_run',
        commentary_detail: 'art_run',
        painting_profile: 'user_config',
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
      painting_profile: 'auto',
    });
    expect(persisted.documents['42']).toMatchObject({
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
      painting_profile: 'simple_graphic',
    });

    const reloaded = new SessionStore(runtimeDirectory, { workspaceRoot: path.dirname(path.dirname(runtimeDirectory)) });
    expect(reloaded.userConfig(42).effective).toEqual({
      language: 'ru',
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
      painting_profile: 'auto',
    });
  });

  it('uses an explicit Photoshop panel profile only for a new run and leaves existing runs immutable', () => {
    const { root, runtimeDirectory, store } = createStore();
    store.setUserConfig({ painting_profile: 'simple_graphic' });
    const first = store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/profile-choice-process/run-01',
    });
    expect(first.painting_profile).toBe('simple_graphic');
    expect(first.document.painting_profile_selection).toBe('simple_graphic');
    expect(store.userConfig(42)).toMatchObject({
      configured: { painting_profile: 'simple_graphic' },
      active_run_painting_profile: 'simple_graphic',
      painting_profile_applies_to: 'next_art_run',
    });

    const nextPath = 'processes/profile-choice-process/run-02';
    expect(() => store.setArtRunState({
      document_id: 43, process_dir: nextPath, painting_profile: 'nontrivial_painting',
    })).toThrow('painting_profile conflicts with Photoshop panel selection');
    expect(existsSync(path.join(root, nextPath))).toBe(false);
    expect(store.artRunState(43)).toBeUndefined();

    store.setUserConfig({ painting_profile: 'nontrivial_painting' }, 42);
    expect(store.artRunState(42)?.painting_profile).toBe('simple_graphic');
    expect(() => store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/profile-choice-process/run-01',
      painting_profile: 'nontrivial_painting',
    })).toThrow('painting_profile is locked by the Photoshop panel');
    expect(store.artRunState(42)?.painting_profile).toBe('simple_graphic');
    expect(store.userConfig(42).effective.painting_profile).toBe('nontrivial_painting');
    expect(store.userConfig(42).active_run_painting_profile).toBe('simple_graphic');
    expect(store.setArtRunState({ document_id: 43, process_dir: nextPath }).painting_profile)
      .toBe('nontrivial_painting');
    expect(store.artRunState(43)?.painting_profile_selection).toBe('nontrivial_painting');

    const reloaded = new SessionStore(runtimeDirectory, { workspaceRoot: root });
    expect(reloaded.userConfig(43)).toMatchObject({
      effective: { painting_profile: 'nontrivial_painting' },
      active_run_painting_profile: 'nontrivial_painting',
    });
  });

  it('auto lets the artist choose either profile; omitted profile retains historical fallback', () => {
    const { store } = createStore();
    store.setUserConfig({ painting_profile: 'auto' });
    expect(store.setArtRunState({ document_id: 42, process_dir: 'processes/profile-auto-process/graphic', painting_profile: 'simple_graphic' }).painting_profile)
      .toBe('simple_graphic');
    expect(store.artRunState(42)?.painting_profile_selection).toBe('auto');
    expect(store.setArtRunState({ document_id: 43, process_dir: 'processes/profile-auto-process/complex', painting_profile: 'nontrivial_painting' }).painting_profile)
      .toBe('nontrivial_painting');
    expect(store.setArtRunState({ document_id: 44, process_dir: 'processes/profile-auto-process/default' }).painting_profile)
      .toBe('nontrivial_painting');
  });
});
