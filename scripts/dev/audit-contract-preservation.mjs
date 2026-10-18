#!/usr/bin/env node
// Release gate: fresh built/public Guard schema -> exhaustive, source-owned
// field preservation policy. Read-only: no transport, UXP or Photoshop calls.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGuardTools } from '../../dist/tools/guard-tools.js';
import { EmbeddedGuardRuntime } from '../../dist/core/guard/runtime.js';
import { ToolRegistry } from '../../dist/core/tool-registry.js';
import {
  preservationCatalogErrors, criticalPreservationFailures,
  CONTRACT_PRESERVATION_INVENTORY, publicContractFieldPaths,
} from '../../dist/core/guard/contract-preservation.js';

const scratch = mkdtempSync(path.join(tmpdir(), 'paintpilot-preservation-'));
const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), { runtimeDirectory: scratch });
const publicTool = createGuardTools(runtime).find(item => item.tool.name === 'photoshop_guard_cycle_auto');
assert.ok(publicTool, 'public cycle_auto absent');
const root = publicTool.tool.inputSchema.properties;
const schemas = {
  cycle: Object.keys(root),
  next_pass: Object.keys(root.next_pass.properties),
  painting_intent: Object.keys(root.painting_intent.properties),
  previous_observation: Object.keys(root.previous_observation.properties),
};
const errors = preservationCatalogErrors(schemas);
assert.deepEqual(errors, [], 'all published schema fields must have an explicit preservation policy');
const nested = publicContractFieldPaths(publicTool.tool.inputSchema);
for (const item of nested.paths) {
  const parts = item.split('.');
  if (parts.length < 2 || !['next_pass', 'painting_intent', 'previous_observation'].includes(parts[0])) continue;
  const root = parts[1].replace(/\[\]$/, '');
  assert.ok(CONTRACT_PRESERVATION_INVENTORY[parts[0]][root],
    `${item}: nested field must belong to an enumerated typed preservation contract`);
}
for (const [surface, rows] of Object.entries(CONTRACT_PRESERVATION_INVENTORY)) {
  for (const [field, policy] of Object.entries(rows)) {
    assert.ok(policy.contract.length > 22, `${surface}.${field}: missing explanation`);
    assert.ok(['retained', 'translated', 'validated', 'durable', 'conditional'].includes(policy.disposition),
      `${surface}.${field}: invalid disposition`);
  }
}
// Release gate itself must catch the exact Oct 18 regression even if another
// compiler route reintroduces it later. No Photoshop mutation is dispatched.
const authored = { document_id: 625, foundation_goal: 'composition',
  change_domains: ['composition', 'background-scope'] };
const full = { tool: 'photoshop_delete_layer',
  args: { document_id: 625, layer_id: 16 }, foundation_goal: 'composition',
  change_domains: ['composition', 'background-scope'] };
assert.deepEqual(criticalPreservationFailures(authored, full), []);
for (const candidate of [
  { ...full, foundation_goal: undefined },
  { ...full, change_domains: undefined },
  { ...full, args: { ...full.args, document_id: 626 } },
]) {
  assert.ok(criticalPreservationFailures(authored, candidate).some(item =>
    item.code === 'contract_field_lost_during_compilation'));
}
const summary = Object.fromEntries(Object.entries(schemas).map(([key, fields]) => [key, fields.length]));
console.log(JSON.stringify({
  ok: true, contract: 'paintpilot.guard.contract_preservation.v1',
  public_cycle_fields: summary,
  total_covered: Object.values(schemas).reduce((n, fields) => n + fields.length, 0),
  nested_named_paths: nested.paths.length,
  open_action_arguments: nested.openObjects.length,
  checker_negative_controls: 3,
  guarantee: 'exhaustive field disposition inventory plus runtime pre-dispatch critical field invariants',
}));
rmSync(scratch, { recursive: true, force: true });
