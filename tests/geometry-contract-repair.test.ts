import { describe, expect, it, vi } from 'vitest';
import saved from './fixtures/cabin-first-geometry-rejection.json';
import { prepareGeometryContract, GEOMETRY_BINDING_SCHEMA, SCENE_GEOMETRY_SCHEMA } from '../src/core/geometry-contract.js';
import { normalizeSceneGeometryModel } from '../src/core/scene-geometry-model.js';
import { geometryBindingIssues, normalizeGeometryBinding } from '../src/core/geometry-binding.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { classifyViolation } from '../src/core/guard/preflight-repair.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { compactToolForPublishedCatalog } from '../src/core/server-protocol.js';

const context = { painting_profile: 'nontrivial_painting', document_incarnation_id: 'uxp-mv00tjng-b5iv1gupfk:1' };
function corrected() {
  const value = structuredClone(saved) as any;
  // This geometry-only fixture treats each semantic unit as an isolated part;
  // the active color-key owner still requires an explicit subject scope.
  value.next_pass.scene_ownership_plan.objects = value.next_pass.scene_ownership_plan.units.map((unit: any) => ({ object_id: unit.semantic_id, subject_kind: 'single-component', kind: 'single-part', component_semantic_ids: [unit.semantic_id] }));
  const scene = value.next_pass.scene_geometry_model;
  scene.projection.horizon = { line: [{ x: 0, y: 450 }, { x: 1400, y: 450 }] };
  scene.projection.vanishing_points[0].evidence = 'proposed';
  // These are explicit artistic decisions for this offline fixture, never automatic defaults.
  scene.line_families.forEach((v: any) => { delete v.direction; });
  scene.support_planes.forEach((v: any) => { delete v.polygon; v.role = v.id; });
  value.next_pass.logical_layer.geometry_binding = { support_plane_id: 'floor', anchors: { near_contact: { x: 700, y: 850 } } };
  return value;
}
function registry() {
  const value = new ToolRegistry();
  for (const tool of ['photoshop_create_layer', 'photoshop_paint_regions', 'photoshop_execute_visual_microplan', 'photoshop_get_preview']) {
    value.register(tool, { tool: { name: tool, inputSchema: { type: 'object' } }, handler: vi.fn(async () => ({ content: [] })) });
  }
  return value;
}
function store(extra = {}) {
  return { collectClosePreviousErrors: () => [], collectPreflightErrors: () => [], compactPassContext: () => ({ ...context, ...extra }) };
}
function body(result: any) { return JSON.parse(result.rejection.content[0].text); }

describe('geometry contract repair (offline only)', () => {
  it('replays the real failed cabin request and reports horizon, evidence, plane roles and missing binding together', async () => {
    const input = structuredClone(saved);
    const dynamic = vi.fn(async () => []);
    const result = await compileGuardCycle(input, store(), registry(), { collectDynamicOperationViolations: dynamic });
    const response = body(result);
    const paths = response.compact_correction_recipe.geometry_contract.issues.map((v: any) => v.path);
    expect(paths).toEqual(expect.arrayContaining([
      'next_pass.scene_geometry_model.projection.horizon.line',
      'next_pass.scene_geometry_model.projection.vanishing_points[0].evidence',
      'next_pass.scene_geometry_model.support_planes[0].role',
      'next_pass.scene_geometry_model.support_planes[1].role',
      'next_pass.logical_layer.geometry_binding',
    ]));
    expect(response).toMatchObject({ visual_mutation_started: false, next_operation_dispatched: false });
    expect(response.cycle_errors).toEqual([]);
    expect(response.compact_correction_recipe.geometry_contract.correction_template.logical_layer.geometry_binding).toEqual({
      owner_id: 'base-scene-blockin', scene_geometry_model_id: 'cabin-weak-perspective-v1', scene_geometry_revision: 1,
    });
    expect(input).toEqual(saved);
    expect(dynamic).not.toHaveBeenCalled();
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(20000);
    expect(classifyViolation({ scope: 'next_operation', code: 'geometry_contract_invalid', message: '' })).toBe('CONTRACT_CORRECTION');
  });

  it('fills all unique identities once, retains artistic decisions and passes the actual geometry normalizers', () => {
    const input = corrected().next_pass;
    delete input.scene_geometry_model.source_frame.document_id;
    delete input.scene_geometry_model.source_frame.document_incarnation;
    const prepared = prepareGeometryContract(input, context);
    expect(prepared.issues).toEqual([]);
    expect(prepared.repairs).toHaveLength(5);
    const scene = normalizeSceneGeometryModel(prepared.pass.scene_geometry_model);
    const logical = prepared.pass.logical_layer as any;
    const binding = normalizeGeometryBinding(logical.geometry_binding);
    expect(geometryBindingIssues(binding, scene, 'base-scene-blockin')).toEqual([]);
    expect(binding.support_plane_id).toBe('floor');
    expect(input.logical_layer.geometry_binding).toEqual({ support_plane_id: 'floor', anchors: { near_contact: { x: 700, y: 850 } } });
    expect(scene.projection.vanishing_points[0].evidence).toBe('proposed');
  });

  it('preserves conflicting identities, and reports unknown supports plus other malformed fields together', async () => {
    const input = corrected().next_pass;
    input.logical_layer.geometry_binding = { owner_id: 'other-owner', scene_geometry_model_id: 'other-scene', scene_geometry_revision: 8,
      support_plane_id: 'scene', anchors: { near_contact: { x: 'wrong' } } };
    const prepared = prepareGeometryContract(input, context);
    expect((prepared.pass.logical_layer as any).geometry_binding.owner_id).toBe('other-owner');
    expect(prepared.repairs).toEqual([]);
    expect(prepared.issues.map(v => v.path)).toEqual(expect.arrayContaining([
      'next_pass.logical_layer.geometry_binding.support_plane_id',
      'next_pass.logical_layer.geometry_binding.anchors.near_contact.x',
      'next_pass.logical_layer.geometry_binding.anchors.near_contact.y',
    ]));
    expect(prepared.issues.find(v => v.path.endsWith('support_plane_id'))?.allowed_ids).toEqual(['floor', 'window']);
    const scene = normalizeSceneGeometryModel(input.scene_geometry_model);
    const explicitBinding = normalizeGeometryBinding({ ...input.logical_layer.geometry_binding, anchors: { near_contact: { x: 10, y: 20 } } });
    expect(geometryBindingIssues(explicitBinding, scene, 'base-scene-blockin').map(v => v.code)).toEqual(expect.arrayContaining([
      'geometry_binding_owner_mismatch', 'geometry_dependency_stale', 'geometry_dependency_missing',
    ]));
    const conflicting = corrected();
    conflicting.next_pass.logical_layer.geometry_binding = { ...explicitBinding, support_plane_id: 'floor' };
    const rejected = await compileGuardCycle(conflicting, store(), registry());
    expect(rejected.violations.map(v => v.code)).toEqual(expect.arrayContaining(['geometry_binding_owner_mismatch', 'geometry_dependency_stale']));
    expect((conflicting.next_pass.logical_layer.geometry_binding as any).owner_id).toBe('other-owner');
  });

  it('stops a second malformed technical attempt even with a new key/error fingerprint, while allowing a valid correction', async () => {
    const previous = { recent_geometry_contract_attempts: [{ problem_id: saved.next_pass.problem_id, outcome: 'rejected', error_codes: ['geometry_contract_invalid'] }] };
    const retry = structuredClone(saved);
    retry.next_pass.request_key = 'different-key';
    const response = body(await compileGuardCycle(retry, store(previous), registry()));
    expect(response.error_codes).toContain('geometry_contract_retry_exhausted');
    expect(response.compact_correction_recipe.repeat_same_semantic_cycle).toBe(false);
    expect(response.canonical_next_operation.action).toBe('stop-and-report-pipeline-blocker');
    const valid = await compileGuardCycle(corrected(), store(previous), registry());
    expect(valid.violations).toEqual([]);
    expect(valid.violations.map(v => v.code)).not.toContain('geometry_contract_retry_exhausted');
    expect(valid.violations.filter(v => v.code.startsWith('geometry_') || v.code.startsWith('scene_geometry_'))).toEqual([]);
    expect(valid.repairAudit?.repairs).toHaveLength(3);
  });

  it('publishes the same complete nested contract without losing enums/required fields to compact catalog projection', () => {
    const tool = createGuardTools({} as any).find(v => v.tool.name === 'photoshop_guard_cycle_auto')!.tool;
    const next = (compactToolForPublishedCatalog(tool).inputSchema as any).properties.next_pass.properties;
    expect(next.scene_geometry_model.properties.projection.properties.vanishing_points.items.properties.evidence.enum).toEqual(['derived', 'proposed']);
    expect(next.scene_geometry_model.properties.projection.properties.horizon.properties.line.minItems).toBe(2);
    expect(next.logical_layer.properties.geometry_binding.properties.anchors.properties.centerline.properties.line.maxItems).toBe(2);
    expect(next.logical_layer.properties.geometry_binding.properties.owner_id).toEqual(GEOMETRY_BINDING_SCHEMA.properties!.owner_id);
    expect(next.scene_geometry_model.properties.support_planes).toEqual(SCENE_GEOMETRY_SCHEMA.properties!.support_planes);
  });
});
