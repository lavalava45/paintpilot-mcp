#!/usr/bin/env node

// Read-only audit of the REAL, freshly launched Guard-required MCP tools/list.
// It never calls an operation that can mutate a Photoshop document.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const diagnosticAt = args.indexOf('--diagnostics');
const diagnosticPath = diagnosticAt >= 0 ? args[diagnosticAt + 1] : undefined;
if (diagnosticAt >= 0 && (!diagnosticPath || diagnosticPath.startsWith('--'))) {
  throw new Error('--diagnostics requires a path to JSON Guard lint/rejection output');
}

// Explicit semantic promises that must survive every source -> build -> MCP
// boundary. Conditional Guard decisions are covered by the independent unit
// tests and, when available, the --diagnostics reachability check below.
const requiredPaths = {
  photoshop_guard_cycle_auto: [
    'next_pass.request_key',
    'next_pass.document_id',
    'next_pass.goal',
    'next_pass.actions[]',
    'next_pass.scene_ownership_plan.objects[].subject_kind',
    'next_pass.scene_ownership_plan.objects[].kind',
    'next_pass.scene_ownership_plan.objects[].component_semantic_ids',
    'next_pass.scene_ownership_plan.units[].owner_id',
    'next_pass.scene_geometry_model.source_frame.document_incarnation',
    'next_pass.scene_geometry_model.projection.kind',
    'next_pass.logical_layer.geometry_binding.support_plane_id',
    'next_pass.logical_layer.geometry_binding.anchors.near_contact',
    'next_pass.logical_layer.geometry_binding.control_sections[]',
    'next_pass.scene_camera_imaging_model',
    'next_pass.imaging_preflight',
    'next_pass.scene_lighting_color_model',
    'next_pass.change_domains',
    'next_pass.distribution_intent',
    'next_pass.edges',
    'previous_observation.edge_observations',
    'painting_intent.deferred_from_operation_id',
  ],
  photoshop_guard_status: ['next_pass.scene_ownership_plan.objects[].subject_kind'],
  photoshop_guard_lint_next_pass: ['next_pass.scene_ownership_plan.objects[].subject_kind'],
  photoshop_guard_keep_logical_layer: [
    'scene_ownership_plan.objects[].subject_kind',
    'scene_ownership_plan.units[].owner_id',
  ],
  photoshop_guard_set_priorities: ['problems[].depends_on_problem_ids'],
  photoshop_guard_art_director: ['directive.refinement_check.material_response'],
  photoshop_guard_resume: ['same_document_confirmed', 'document_id', 'projection'],
  photoshop_guard_review_image: ['operation_id'],
  photoshop_guard_job_poll: ['job_id'],
  photoshop_guard_set_art_run: ['document_id', 'process_dir', 'brush_preflight.roles[]'],
};

function normalizePath(input) {
  return String(input).replace(/\[(?:\d+)\]/g, '[]').replace(/^\$\./, '');
}

function locate(schema, input) {
  const parts = normalizePath(input).split('.');
  let value = schema;
  for (const part of parts) {
    const isArray = part.endsWith('[]');
    const name = isArray ? part.slice(0, -2) : part;
    // A deliberately opaque object schema allows any nested field. This is
    // expressible, although it does not give the client typed guidance.
    if (value?.type === 'object' && !value.properties && value.additionalProperties !== false) {
      return { __opaque: true };
    }
    if (!value?.properties || !Object.hasOwn(value.properties, name)) return null;
    value = value.properties[name];
    if (isArray) {
      if (!value?.items || !['array', undefined].includes(value.type)) return null;
      value = value.items;
    }
  }
  return value;
}

function structural(node) {
  if (Array.isArray(node)) return node.map(structural);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node)
    .filter(([k]) => !['description', 'title', 'examples', 'default'].includes(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, structural(v)]));
}

function schemaErrors(node, at, errors) {
  if (!node || typeof node !== 'object') {
    errors.push(at + ': invalid schema node');
    return;
  }
  if (node.required !== undefined) {
    if (!Array.isArray(node.required) || new Set(node.required).size !== node.required.length) {
      errors.push(at + ': required must be a list of unique property names');
    } else {
      for (const key of node.required) {
        if (!Object.hasOwn(node.properties ?? {}, key) && node.additionalProperties === false) {
          errors.push(at + ': required property ' + key + ' is forbidden by additionalProperties:false');
        }
      }
    }
  }
  if (node.enum !== undefined && (!Array.isArray(node.enum) || node.enum.length === 0 ||
      new Set(node.enum.map(v => JSON.stringify(v))).size !== node.enum.length)) {
    errors.push(at + ': enum must be nonempty and contain unique values');
  }
  for (const [min, max] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']]) {
    if (node[min] !== undefined && node[max] !== undefined && node[min] > node[max]) {
      errors.push(at + ': impossible ' + min + ' > ' + max);
    }
  }
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    schemaErrors(value, at + '.' + key, errors);
  }
  if (node.items) schemaErrors(node.items, at + '[]', errors);
  for (const alternative of ['anyOf', 'oneOf', 'allOf']) {
    (node[alternative] ?? []).forEach((entry, i) => schemaErrors(entry, at + '.' + alternative + '[' + i + ']', errors));
  }
}

function requiredPathErrors(schemas) {
  const errors = [];
  for (const [toolName, paths] of Object.entries(requiredPaths)) {
    const schema = schemas[toolName];
    if (!schema) {
      errors.push('Missing publicly registered tool ' + toolName);
      continue;
    }
    for (const p of paths) {
      if (!locate(schema, p)) errors.push(toolName + ': unexpressible required Guard field ' + p);
    }
  }
  const subject = locate(schemas.photoshop_guard_cycle_auto, 'next_pass.scene_ownership_plan.objects[].subject_kind');
  if (subject) {
    if (!subject.enum?.includes('person')) errors.push('subject_kind cannot classify a person');
    for (const name of ['photoshop_guard_cycle_auto', 'photoshop_guard_status', 'photoshop_guard_lint_next_pass']) {
      const objects = locate(schemas[name], 'next_pass.scene_ownership_plan.objects[]');
      if (!objects?.__opaque && !objects?.required?.includes('subject_kind')) errors.push(name + ': subject_kind must be required for new objects');
    }
    const keepObjects = locate(schemas.photoshop_guard_keep_logical_layer, 'scene_ownership_plan.objects[]');
    if (!keepObjects?.required?.includes('subject_kind')) errors.push('photoshop_guard_keep_logical_layer: subject_kind must be required');
  }
  return errors;
}

function driftErrors(schemas) {
  const errors = [];
  const first = locate(schemas.photoshop_guard_cycle_auto, 'next_pass');
  for (const name of ['photoshop_guard_status', 'photoshop_guard_lint_next_pass']) {
    const other = locate(schemas[name], 'next_pass');
    if (other?.type === 'object' && !other.properties && other.additionalProperties !== false) continue;
    if (JSON.stringify(structural(first)) !== JSON.stringify(structural(other))) {
      errors.push(name + '.next_pass differs structurally from photoshop_guard_cycle_auto.next_pass');
    }
  }
  const canonical = locate(schemas.photoshop_guard_cycle_auto, 'next_pass.scene_ownership_plan');
  for (const [name, p] of [
    ['photoshop_guard_status', 'next_pass.scene_ownership_plan'],
    ['photoshop_guard_lint_next_pass', 'next_pass.scene_ownership_plan'],
    ['photoshop_guard_keep_logical_layer', 'scene_ownership_plan'],
  ]) {
    const target = locate(schemas[name], p);
    if (target?.__opaque) continue;
    if (JSON.stringify(structural(canonical)) !== JSON.stringify(structural(target))) {
      errors.push(name + '.' + p + ': duplicate ownership schema differs');
    }
  }
  return errors;
}

function diagnosticsErrors(schemas, diagnostics) {
  const errors = [];
  const violations = diagnostics.violations ?? diagnostics.rejection?.violations ??
    diagnostics.preflight_rejection?.violations ?? [];
  for (const item of violations) {
    const p = item.details?.path;
    if (!p) continue;
    if (!locate(schemas.photoshop_guard_cycle_auto, p)) {
      errors.push('Guard violation ' + (item.code ?? 'unknown') + ': required path ' + p + ' is unexpressible in cycle_auto');
    }
    for (const field of item.details?.required_fields ?? []) {
      const parent = p.replace(/\.\w+$/, '');
      const full = parent + '.' + field;
      if (!locate(schemas.photoshop_guard_cycle_auto, full)) {
        errors.push('Guard violation ' + (item.code ?? 'unknown') + ': required field ' + full + ' is unexpressible');
      }
    }
  }
  return errors;
}

function audit(tools, diagnostics) {
  const errors = [];
  const schemas = Object.fromEntries(tools.map(t => [t.name, t.inputSchema]));
  if (Object.keys(schemas).length !== tools.length) errors.push('Duplicate published tool names');
  for (const [name, schema] of Object.entries(schemas)) schemaErrors(schema, name, errors);
  errors.push(...requiredPathErrors(schemas), ...driftErrors(schemas));
  if (diagnostics) errors.push(...diagnosticsErrors(schemas, diagnostics));
  const normalized = structural(Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))));
  const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return { ok: errors.length === 0, tool_count: tools.length, guarded_tool_count: tools.filter(t => t.name.startsWith('photoshop_guard_')).length,
    schema_fingerprint: fingerprint, checked_model_paths: Object.values(requiredPaths).reduce((n, p) => n + p.length, 0),
    permissive_untyped_next_pass_tools: ['photoshop_guard_status', 'photoshop_guard_lint_next_pass']
      .filter(name => schemas[name]?.properties?.next_pass?.type === 'object'
        && !schemas[name]?.properties?.next_pass?.properties
        && schemas[name]?.properties?.next_pass?.additionalProperties !== false),
    diagnostic_violations_checked: diagnostics?.violations?.length ?? diagnostics?.rejection?.violations?.length ?? 0, errors };
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist', 'cos-plugin.js')],
  cwd: root,
  env: { ...process.env, LOG_LEVEL: '3' },
  stderr: 'pipe',
});
const client = new Client({ name: 'guard-contract-public-audit', version: '1.0.0' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const diagnostics = diagnosticPath ? JSON.parse(fs.readFileSync(path.resolve(diagnosticPath), 'utf8')) : undefined;
  const result = audit(tools, diagnostics);
  if (args.includes('--explain')) {
    for (const name of ['photoshop_guard_cycle_auto', 'photoshop_guard_status', 'photoshop_guard_lint_next_pass']) {
      const schema = tools.find(t => t.name === name)?.inputSchema;
      console.log('SCHEMA_SHAPE', name, JSON.stringify({
        next_pass: schema?.properties?.next_pass && {
          type: schema.properties.next_pass.type,
          additionalProperties: schema.properties.next_pass.additionalProperties,
          propertyCount: Object.keys(schema.properties.next_pass.properties ?? {}).length,
          sceneOwnership: schema.properties.next_pass.properties?.scene_ownership_plan,
        },
      }).slice(0, 2500));
    }
  }
  if (selfTest) {
    const copy = structuredClone(tools);
    const schema = copy.find(t => t.name === 'photoshop_guard_cycle_auto').inputSchema;
    delete schema.properties.next_pass.properties.scene_ownership_plan.properties.objects.items.properties.subject_kind;
    const negative = audit(copy);
    assert.equal(negative.ok, false);
    assert.ok(negative.errors.some(e => e.includes('unexpressible required Guard field next_pass.scene_ownership_plan.objects[].subject_kind')));
    const example = { violations: [{
      code: 'invented_guard_required_field',
      details: { path: 'next_pass.scene_ownership_plan.objects[0].new_guard_field' },
    }] };
    assert.ok(diagnosticsErrors(Object.fromEntries(tools.map(t => [t.name, t.inputSchema])), example)
      .some(e => e.includes('new_guard_field')));
    result.negative_controls = 'PASS (omitted subject_kind and newly required Guard field both detected)';
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
