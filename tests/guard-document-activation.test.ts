import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function fixture(profile: 'simple_graphic' | 'nontrivial_painting' = 'simple_graphic') {
  const dir = mkdtempSync(path.join(tmpdir(), 'guard-activate-inactive-'));
  dirs.push(dir);
  const registry = new ToolRegistry();
  const navigation = vi.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify({
    ok: true, summary: 'Document activated', details: { activated: { id: 84 }, context: { document: { id: 84 } } },
  }) }] }));
  const opacity = vi.fn(async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }));
  registry.register('photoshop_set_active_document', {
    tool: { name: 'photoshop_set_active_document', description: 'Navigation', inputSchema: {
      type: 'object', properties: { document_id: { type: 'number' }, user_authorized_focus_switch: { type: 'boolean' } },
    } },
    handler: navigation,
  });
  registry.register('photoshop_set_layer_opacity', {
    tool: { name: 'photoshop_set_layer_opacity', description: 'Mutation', inputSchema: {
      type: 'object', properties: { document_id: { type: 'number' }, opacity: { type: 'number' } },
    } }, handler: opacity,
  });
  let activeId = 42;
  let ready = true;
  const runtime = new EmbeddedGuardRuntime(registry, {
    runtimeDirectory: path.join(dir, 'controller'),
    previewBarrierDirectory: path.join(dir, 'barriers'),
    executionLeaseFile: path.join(dir, 'execution.lock'),
    workspaceRoot: dir,
    uxpReadinessProbe: async () => ({
      ready, transport: 'uxp' as const, bridge_transport: 'long-poll' as const,
      bridge_revision: UXP_BRIDGE_REVISION, expected_bridge_revision: UXP_BRIDGE_REVISION,
      revision_match: true, plugin_connected: ready, document_count: 2,
      active_document: { id: activeId, name: 'Current.psd' },
      checked_at: new Date().toISOString(), cache: { hit: false, age_ms: 0, ttl_ms: 0 },
      photoshop_version: '27.0.0', reason: ready ? null : 'uxp_runtime_unavailable',
    }),
    uxpStateProbe: async () => ({ ok: true, data: {
      document: { id: activeId, instanceWitness: {
        protocol: 'photoshop.uxp.document_instance_witness.v1',
        session_id: 'guard-activation-test', token: `guard-activation-test:${activeId}`,
      } },
      activeLayer: { id: 7 },
    } }),
  });
  runtime.store.setArtRunState({ document_id: 84, painting_profile: profile,
    process_dir: 'processes/guard-activation-process/run-01' });
  const nextPass = (authorized?: boolean) => ({
    request_key: `switch-${profile}-${String(authorized)}`, document_id: 84,
    goal: 'Activate the exact user-approved, already-open Photoshop document.',
    actions: [{ id: 'activate', tool: 'photoshop_set_active_document',
      args: { document_id: 84, ...(authorized !== undefined ? { user_authorized_focus_switch: authorized } : {}) } }],
  });
  return { runtime, navigation, opacity, nextPass, setActive: (id: number) => { activeId = id; },
    setReady: (value: boolean) => { ready = value; } };
}

describe('Guard document navigation vs painting-target identity', () => {
  it.each(['simple_graphic', 'nontrivial_painting'] as const)(
    'admits a specifically user-authorized inactive target in %s without confusing it with the current document', async profile => {
      const f = fixture(profile);
      const result = await f.runtime.lintNextPass(f.nextPass(true));
      expect(result.error_codes, JSON.stringify(result.violations)).toEqual([]);
      expect(result.compiled_operation).toMatchObject({
        tool: 'photoshop_set_active_document', args: { document_id: 84, user_authorized_focus_switch: true },
      });
      expect(f.navigation).not.toHaveBeenCalled();
      const mutation = await (f.runtime as any).collectDynamicOperationViolations({
        tool: 'photoshop_set_layer_opacity', args: { document_id: 84, opacity: 75 },
      });
      expect(mutation).toEqual([expect.objectContaining({ code: 'document_instance_target_mismatch' })]);
      expect(f.opacity).not.toHaveBeenCalled();
    }
  );

  it('does not accept host goal or absent/false Boolean as the user authorization', async () => {
    const f = fixture();
    for (const permission of [undefined, false]) {
      const result = await f.runtime.lintNextPass(f.nextPass(permission));
      expect(result.error_codes).toContain('document_focus_switch_permission_required');
      expect(f.navigation).not.toHaveBeenCalled();
    }
  });

  it('allows idempotent activation of the already active document without permission', async () => {
    const f = fixture();
    f.setActive(84);
    const result = await f.runtime.lintNextPass(f.nextPass());
    expect(result.error_codes, JSON.stringify(result.violations)).toEqual([]);
  });

  it('blocks navigation when the matching live UXP route cannot be proved', async () => {
    const f = fixture();
    f.setReady(false);
    const result = await f.runtime.lintNextPass(f.nextPass(true));
    expect(result.error_codes).toContain('document_navigation_uxp_unavailable');
    expect(f.navigation).not.toHaveBeenCalled();
  }, 15000);
});
