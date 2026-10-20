import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { parsePaintingIntent } from '../src/core/guard/painting-intent.js';
import { compilePaintingIntentToNextPass } from '../src/core/guard/next-pass-compiler.js';
import { classifyViolation, fieldCorrectionPacket } from '../src/core/guard/preflight-repair.js';
import {
  CONTRACT_PRESERVATION_INVENTORY, preservationCatalogErrors,
  criticalPreservationFailures, publicContractFieldPaths,
} from '../src/core/guard/contract-preservation.js';

function publishedSchema() {
  const scratch = mkdtempSync(path.join(tmpdir(), 'paintpilot-contract-schema-'));
  const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), {
    runtimeDirectory: scratch,
  });
  const tool = createGuardTools(runtime).find(item => item.tool.name === 'photoshop_guard_cycle_auto')!;
  const props = (tool.tool.inputSchema as any).properties;
  const schemas = {
    cycle: Object.keys(props),
    next_pass: Object.keys(props.next_pass.properties),
    painting_intent: Object.keys(props.painting_intent.properties),
    previous_observation: Object.keys(props.previous_observation.properties),
  };
  rmSync(scratch, { recursive: true, force: true });
  return schemas;
}

function fixture(profile: string, director: boolean) {
  let calls = 0;
  const registry = new ToolRegistry();
  for (const tool of [
    'photoshop_delete_layer', 'photoshop_set_layer_visibility',
    'photoshop_paint_color_gradient', 'photoshop_get_preview',
  ]) {
    registry.register(tool, { tool: { name: tool, inputSchema: { type: 'object' } },
      handler: async () => { calls++; throw new Error('No physical Photoshop calls allowed'); } });
  }
  const store: any = {
    compactPassContext: () => ({
      painting_profile: profile,
      has_visual_frame: true,
      logical_layer_owners: [{ hypothesis_id: 'existing-background', layer_id: 16, temporary: false }],
      ...(director ? { art_director: { directive_id: 'dir-1', current_task_id: 'task-1' } } : {}),
    }),
    collectClosePreviousErrors: () => [],
    collectPreflightErrors: () => [],
  };
  return { registry, store, calls: () => calls };
}

const direct = (actionClass = 'ROLLBACK') => ({
  request_key: 'oct18-direct-preserve-contract',
  problem_id: 'halo-regression', document_id: 625,
  goal: 'Remove the isolated failed test halo layer and preserve the rest.',
  action_class: actionClass, foundation_goal: 'composition',
  change_domains: ['composition', 'background-scope'],
  actions: [{ tool: 'photoshop_delete_layer', args: { layer_id: 16 } }],
});

const gradient = (actionClass = 'ADD') => ({
  request_key: 'composition-field-preservation',
  problem_id: 'night-composition', document_id: 625,
  goal: 'Paint a continuous color field of distant nocturnal sky.',
  stage: 'GLOBAL_BLOCK_IN', scale: 'global', region: 'whole-canvas',
  action_class: actionClass, construction_role: 'continuous-field',
  visual_intent: 'continuous-field', preferred_method_id: 'continuous-color-field',
  foundation_goal: 'composition', change_domains: ['composition', 'background-scope'],
  actions: [{ id: 'sky-gradient', tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field',
    args: { layer_id: 16, from: { x: 0, y: 0 }, to: { x: 250, y: 180 },
      stops: [{ position: 0, red: 25, green: 40, blue: 52 },
        { position: 1, red: 70, green: 90, blue: 103 }] } }],
});

describe('Contract Preservation Audit – public surface inventory', () => {
  it('accounts for every currently published cycle, next_pass, intent and closure field without a silent fallback', () => {
    const schemas = publishedSchema();
    expect(schemas.cycle).toHaveLength(6);
    expect(schemas.next_pass.length).toBeGreaterThanOrEqual(62);
    expect(schemas.painting_intent.length).toBeGreaterThanOrEqual(40);
    expect(schemas.previous_observation.length).toBeGreaterThanOrEqual(33);
    expect(preservationCatalogErrors(schemas)).toEqual([]);
    const all = Object.values(CONTRACT_PRESERVATION_INVENTORY)
      .flatMap(group => Object.values(group));
    expect(all.length).toBe(Object.values(schemas).reduce((n, fields) => n + fields.length, 0));
    expect(all.every(policy => policy.contract.length > 22)).toBe(true);
  });
  it('rejects schema drift and coverage omissions, not just missing public-schema fields', () => {
    const schemas = publishedSchema();
    const missing = structuredClone(schemas);
    missing.next_pass.push('new_unreviewed_field');
    expect(preservationCatalogErrors(missing)).toContain(
      'next_pass.new_unreviewed_field is published without a preservation policy');
    const renamed = structuredClone(schemas);
    renamed.painting_intent = renamed.painting_intent.filter(name => name !== 'change_domains');
    expect(preservationCatalogErrors(renamed)).toContain(
      'painting_intent.change_domains has a stale preservation policy but is not public');
    const duplicate = structuredClone(schemas);
    duplicate.previous_observation.push('scene_foundation');
    expect(preservationCatalogErrors(duplicate)).toContain('previous_observation has duplicate schema fields');
  });
  it('enumerates nested typed fields without pretending open Photoshop args are finite', () => {
    const nested = publicContractFieldPaths({
      type: 'object', properties: {
        next_pass: { type: 'object', properties: {
          foundation_goal: { type: 'string' },
          actions: { type: 'array', items: { type: 'object',
            properties: { tool: { type: 'string' }, args: { type: 'object', additionalProperties: true } } } },
        } },
      },
    });
    expect(nested.paths).toContain('next_pass.actions[].args');
    expect(nested.paths).toContain('next_pass.actions[].tool');
    expect(nested.openObjects).toEqual(['next_pass.actions[].args']);
    expect(() => publicContractFieldPaths({ type: 'object',
      properties: { 'not legal field': { type: 'string' } } })).toThrow(/name_invalid/);
  });
});

describe('Contract Preservation Audit – final compiler boundary / no Photoshop mutation', () => {
  it.each([
    ['simple_graphic', false, 'ROLLBACK'],
    ['simple_graphic', true, 'ROLLBACK'],
    ['nontrivial_painting', false, 'ROLLBACK'],
    ['nontrivial_painting', true, 'ROLLBACK'],
    ['simple_graphic', false, 'ERASE'],
    ['nontrivial_painting', true, 'REPLACE'],
  ])('preserves direct semantic scope under profile=%s Director=%s action=%s', async (profile, director, action) => {
    const f = fixture(profile as string, director as boolean);
    const input = direct(action as string);
    const before = structuredClone(input);
    const result = await compileGuardCycle({ next_pass: input }, f.store, f.registry);
    expect(result.nextOperation, JSON.stringify(result.violations)).toBeDefined();
    expect(result.nextOperation!.tool).toBe('photoshop_delete_layer');
    expect(criticalPreservationFailures(input, result.nextOperation)).toEqual([]);
    expect(result.violations.map(item => item.code)).not.toContain('contract_field_lost_during_compilation');
    expect(f.calls()).toBe(0);
    expect(input).toEqual(before);
  });

  it.each(['simple_graphic', 'nontrivial_painting'])(
    'preserves fields when a VisualMicroPlan is generated for %s',
    async profile => {
      const f = fixture(profile, false);
      const pass = gradient();
      const result = await compileGuardCycle({ next_pass: pass }, f.store, f.registry);
      expect(result.nextOperation, JSON.stringify(result.violations)).toBeDefined();
      expect(result.nextOperation?.tool).toBe('photoshop_execute_visual_microplan');
      expect(criticalPreservationFailures(pass, result.nextOperation)).toEqual([]);
      expect(result.violations.map(item => item.code)).not.toContain('contract_field_lost_during_compilation');
      expect(f.calls()).toBe(0);
    },
  );

  it.each(['simple_graphic', 'nontrivial_painting'])(
    'retains an authored PaintingIntent domain and action meaning through intent-to-pass in %s',
    profile => {
      const intent = {
        request_key: 'intent-domain-preservation', problem_id: 'background-balance',
        document_id: 625, goal: 'Adjust a known graphic component without retargeting.',
        action: 'refine', visual_intent: 'tonal-contrast', target_owner_id: 'existing-background',
        change_domains: ['composition', 'background-scope'],
        actions: [{ tool: 'photoshop_set_layer_visibility', args: { layer_id: 16, visible: true } }],
      };
      const parsed = parsePaintingIntent(intent);
      const compiled = compilePaintingIntentToNextPass(parsed, fixture(profile, false).store);
      expect(compiled.next_pass.change_domains).toEqual(intent.change_domains);
      expect(compiled.next_pass.action_class).toBe('ADD');
      expect(compiled.next_pass.document_id).toBe(intent.document_id);
      expect(compiled.next_pass.logical_layer).toMatchObject({
        hypothesis_id: 'existing-background', layer_id: 16,
      });
    },
  );

  it('rejects a fabricated or dropped critical field at the exact final boundary', () => {
    const input = direct();
    const complete = {
      tool: 'photoshop_delete_layer', args: { document_id: 625, layer_id: 16 },
      foundation_goal: 'composition', change_domains: ['composition', 'background-scope'],
    };
    expect(criticalPreservationFailures(input, complete)).toEqual([]);
    for (const [candidate, path] of [
      [{ ...complete, foundation_goal: undefined }, 'next_pass.foundation_goal'],
      [{ ...complete, change_domains: undefined }, 'next_pass.change_domains'],
      [{ ...complete, args: { ...complete.args, document_id: 999 } }, 'next_pass.document_id'],
    ] as const) {
      expect(criticalPreservationFailures(input, candidate).map(item => item.path)).toContain(path);
    }
    const microPlan = {
      ...complete, tool: 'photoshop_execute_visual_microplan',
      args: { ...complete.args, action_class: 'ADD', change_domains: complete.change_domains },
    };
    expect(criticalPreservationFailures({ ...input, action_class: 'ROLLBACK' }, microPlan)
      .map(item => item.path)).toContain('next_pass.action_class');
    const lost = { scope: 'next_operation' as const,
      code: 'contract_field_lost_during_compilation',
      message: 'Contract preservation failed: explicit foundation was lost',
      details: { path: 'next_pass.foundation_goal' } };
    expect(classifyViolation(lost)).toBe('SYSTEMIC_FAILURE');
    expect(fieldCorrectionPacket([lost]).corrections[0].path).toBe('next_pass.foundation_goal');
  });

  it('never drops or substitutes local-glow owner authorization between compiler and Guard', () => {
    const contract = {purpose:'local-glow',owner_id:'firefly-halos',revalidate_edges:true};
    const source = {document_id:625,painterly_softening:contract};
    const compiled = {tool:'photoshop_apply_gaussian_blur',args:{document_id:625,layer_id:12,radius:10},
      painterly_softening:contract};
    expect(criticalPreservationFailures(source,compiled)).toEqual([]);
    expect(criticalPreservationFailures(source,{...compiled,painterly_softening:undefined}).map(row=>row.path))
      .toContain('next_pass.painterly_softening');
    expect(criticalPreservationFailures(source,{...compiled,painterly_softening:{...contract,owner_id:'different'}}).map(row=>row.path))
      .toContain('next_pass.painterly_softening');
  });
  it('requires an explicit scene model to survive into an actual PSD checkpoint', () => {
    const model = {model_id:'exact-scene',revision:1,source_frame:{document_id:625,
      document_incarnation:'incarnation:625',operation_id:'source-frame',preview_sha256:'a'.repeat(64)}};
    const authored = {document_id:625,scene_geometry_model:model};
    const compiled = {tool:'photoshop_save_document',args:{document_id:625,path:'scene.psd'},scene_geometry_model:model};
    expect(criticalPreservationFailures(authored,compiled)).toEqual([]);
    expect(criticalPreservationFailures(authored,{...compiled,scene_geometry_model:undefined}).map(row=>row.path))
      .toContain('next_pass.scene_geometry_model');
  });

  it('does not grant a ROLLBACK exemption to native delete or change artistic meaning', () => {
    const input = direct('ROLLBACK');
    const compiled = { tool: 'photoshop_delete_layer', args: { layer_id: 16, document_id: 625 },
      foundation_goal: 'composition', change_domains: ['composition', 'background-scope'] };
    expect(criticalPreservationFailures(input, compiled)).toEqual([]);
    expect((compiled.args as any).action_class).toBeUndefined();
    // Eligibility for native deletion remains in Guard, not in this audit.
  });

  it('carries exact-frame closure evidence through the previous_observation -> previous_visual_verdict boundary', async () => {
    const f = fixture('simple_graphic', false);
    let observedByClosure: any;
    f.store.collectClosePreviousErrors = (input: unknown) => {
      observedByClosure = structuredClone(input);
      return [];
    };
    const foundation = { request_id: 'bound-to-current-frame',
      composition: { status: 'fail', visible: 'The surrounding atmospheric field is incomplete.',
        next_change: 'Remove the failed optical experiment before retrying.' },
      technique: { status: 'unknown', visible: 'Material demonstration is not yet verified.',
        next_change: 'Review the representative optical technique.' },
    };
    const input = {
      previous_operation_id: 'known-exact-reviewed-frame',
      previous_observation: {
        observed: 'Only the failed rim remains on the reviewed optical test layer.',
        target: 'unresolved', action: 'correct', scene_foundation: foundation,
        affected_relations: ['lantern-to-fog'], preservation_facts: ['dark architecture intact'],
      },
    };
    const previous = structuredClone(input);
    const compiled = await compileGuardCycle(input, f.store, f.registry);
    expect(observedByClosure.previous_operation_id).toBe(input.previous_operation_id);
    expect(observedByClosure.previous_visual_verdict.scene_foundation).toEqual(foundation);
    expect(observedByClosure.previous_visual_verdict.affected_relations).toEqual(['lantern-to-fog']);
    expect(observedByClosure.previous_visual_verdict.preservation_facts).toEqual(['dark architecture intact']);
    expect(compiled.input.previous_visual_verdict.scene_foundation).toEqual(foundation);
    expect(compiled.nextOperation).toBeUndefined();
    expect(f.calls()).toBe(0);
    expect(input).toEqual(previous);
  });

  it('cannot bypass an independent Stop gate by preserving valid foundation fields', async () => {
    const f = fixture('simple_graphic', false);
    f.store.collectPreflightErrors = () => ['paintpilot_stop_requested: stopped operation'];
    const compiled = await compileGuardCycle({ next_pass: direct() }, f.store, f.registry);
    expect(compiled.violations.some(item => item.message.includes('paintpilot_stop_requested'))).toBe(true);
    expect(compiled.rejection).toBeDefined();
    expect(f.calls()).toBe(0);
  });

  it('does not translate a stale accepted-anchor restore into an unchecked native deletion', async () => {
    const f = fixture('nontrivial_painting', true);
    f.store.planAcceptedAnchorRestore = () => { throw new Error('anchor is not registered in the current frame'); };
    const compiled = await compileGuardCycle({ next_pass: {
      request_key: 'restore-anchor-only', document_id: 625, goal: 'Restore known good source',
      restore_anchor_operation_id: 'stale-anchor', change_domains: ['composition'],
    } }, f.store, f.registry);
    expect(compiled.violations.map(item => item.code)).toContain('accepted_anchor_restore_rejected');
    expect(compiled.nextOperation).toBeUndefined();
    expect(f.calls()).toBe(0);
  });
});
