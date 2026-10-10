import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const GUARD_STATE_RESPONSE_MAX_BYTES = 24 * 1024;
type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);

/** Transport-only projection. Never abbreviate an identity, path, token or binding. */
export function serializeGuardState(
  value: Row, directory: string, surface: 'status' | 'resume', maxBytes = GUARD_STATE_RESPONSE_MAX_BYTES
): string {
  const original = JSON.stringify(value);
  if (Buffer.byteLength(original) <= maxBytes) return original;
  const destination = path.join(directory, 'projections', `${surface}-${Date.now()}-${randomUUID()}.json`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, original);
  const output = JSON.parse(original) as Row;
  const omitted: Row = {};
  output.response_budget = {
    protocol: 'photoshop.guard.response_budget.v1', max_bytes: maxBytes,
    original_bytes: Buffer.byteLength(original), truncated: true, full_projection_path: destination, omitted,
  };
  const remove = (row: Row, key: string) => {
    if (row[key] === undefined) return;
    omitted[key] = Number(omitted[key] ?? 0) + 1;
    delete row[key];
  };
  const fits = () => Buffer.byteLength(JSON.stringify(output)) <= maxBytes;
  const diagnostics = [
    'latency_summary', 'method_usage', 'artistic_throughput', 'recognition_metrics',
    'visual_cadence', 'continuation_watch', 'alternative_artistic_anchors', 'scene_geometry_model',
    'scene_lighting_color_model', 'scene_camera_imaging_model', 'scene_ownership_plan',
  ];
  const documents = object(output.documents) ? output.documents : {};
  const rows = [output, ...(object(output.document) ? [output.document] : []),
    ...Object.values(documents).filter(object)];
  for (const row of rows) for (const key of diagnostics) {
    if (output.projection === 'ownership' && key === 'scene_ownership_plan') continue;
    remove(row, key);
  }
  // Broad inventories are diagnostics; retain readiness/backend revision and next action.
  if (object(output.guard_capabilities)) {
    for (const key of Object.keys(output.guard_capabilities)) {
      if (Array.isArray(output.guard_capabilities[key])) remove(output.guard_capabilities, key);
    }
  }
  if (object(output.capability_snapshots)) {
    for (const snapshot of Object.values(output.capability_snapshots).filter(object)) {
      for (const key of ['supported_semantic_methods', 'unavailable_methods', 'tools', 'brush_catalog']) remove(snapshot, key);
    }
  }
  if (fits()) return JSON.stringify(output);
  // Select the document that owns the authoritative next action, not an arbitrary recent tab.
  const activeJob = object(output.active_job) ? output.active_job
    : Array.isArray(output.active_jobs) ? output.active_jobs.at(-1) : undefined;
  const uncertain = Array.isArray(output.uncertain) ? output.uncertain[0] : undefined;
  const pending = Array.isArray(output.pending_visual_verdict_details) ? output.pending_visual_verdict_details : [];
  const blockers = Array.isArray(output.identity_recovery_blockers)
    ? output.identity_recovery_blockers.filter(object) : [];
  const blocker = blockers[0];
  const readiness = object(output.paint_readiness) ? output.paint_readiness : {};
  const preferred = object(output.document) ? output.document.document_id ?? output.document.id
    : object(activeJob) ? activeJob.document_id
      : pending.find(row => object(row) && row.operation_id === uncertain)?.document_id
        ?? blocker?.document_id ?? readiness.document_id ?? readiness.active_document_id;
  const entries = Object.entries(documents);
  const selected = entries.find(([id]) => id === String(preferred))
    ?? entries.find(([, row]) => object(row) && row.next_required_action === output.next_required_action)
    ?? entries.find(([, row]) => object(row) && row.next_required_action !== 'ready') ?? entries[0];
  if (entries.length > 1 && selected) {
    output.documents = Object.fromEntries([selected]);
    omitted.documents = entries.length - 1;
    if (object(output.capability_snapshots)) {
      output.capability_snapshots = selected[0] in output.capability_snapshots
        ? { [selected[0]]: output.capability_snapshots[selected[0]] } : {};
    }
  }
  const selectedRows = [output, ...(object(output.document) ? [output.document] : []),
    ...(object(output.documents) ? Object.values(output.documents).filter(object) : [])];
  for (const limit of [8, 2, 1]) {
    for (const row of selectedRows) for (const [key, item] of Object.entries(row)) {
      if (!Array.isArray(item) || item.length <= limit) continue;
      if (output.projection === 'ownership' && key === 'logical_layer_owners') continue;
      // A running job/pending operation must remain actionable even when older rows are omitted.
      row[key] = key === 'active_jobs' ? item.slice(-limit) : item.slice(0, limit);
      omitted[key] = Number(omitted[key] ?? 0) + item.length - limit;
    }
    if (fits()) return JSON.stringify(output);
  }
  // Never send the Painter to disk. A bounded public subset supplies recovery identity;
  // continuation remains blocked until the requested public context is returned intact.
  const documentId = object(selected?.[1]) ? selected[1].document_id ?? selected[0]
    : object(output.document) ? output.document.document_id ?? output.document.id : output.document_id;
  const uncertainId = Array.isArray(output.uncertain) ? output.uncertain[0] : undefined;
  const fallback = {
    ok: false, code: 'guard_state_projection_requires_public_resume', continuation_blocked: true,
    ...(documentId !== undefined ? { document_id: documentId } : {}),
    mutation_replay_permitted: false,
    ...(blocker ? { identity_recovery_blockers: [blocker],
      identity_recovery_blocker_count: blockers.length } : {}),
    ...(object(output.next_public_call) ? { next_public_call: output.next_public_call }
      : object(activeJob) ? { next_public_call: { tool: 'photoshop_guard_job_poll', args: { job_id: activeJob.job_id } } }
        : typeof blocker?.operation_id === 'string' ? { next_public_call: {
          tool: 'photoshop_guard_reconcile', args: { id: blocker.operation_id, capture_evidence: true },
        } } : {}),
    next_required_action: output.projection ? 'This requested public context cannot fit intact. Request projection=ownership with one owner_id, or report guard_public_context_too_large if that exact binding still cannot fit. Never read runtime files/source or mutate from missing context.' : 'Call photoshop_guard_resume with document_id and projection=recovery to get bounded actionable state; use projection=ownership with owner_id for an exact owner binding. Never read runtime files, source or imports. Do not mutate from this incomplete response.',
    ...(typeof uncertainId === 'string' && Buffer.byteLength(uncertainId) < 1024 ? {
      recovery: { operation_id: uncertainId, tool: 'photoshop_guard_reconcile', args: { id: uncertainId, capture_evidence: true },
        next: 'Capture fresh state and exact image through this public tool, inspect them, then reconcile with returned evidence ids and an honest outcome. No replay.' },
    } : {}),
    response_budget: { protocol: 'photoshop.guard.response_budget.v1', max_bytes: maxBytes,
      truncated: true, full_projection_path: destination, archive_is_diagnostic_only: true, required_context_omitted: true },
  };
  const serialized = JSON.stringify(fallback);
  if (Buffer.byteLength(serialized) > maxBytes) throw new Error('Guard state byte budget is smaller than its public recovery reference');
  return serialized;
}


/** Public MCP diagnostics only. Internal Guard state and actionable recovery remain complete. */
export function projectGuardDiagnostics(value: unknown, directory: string,
  observedBrief?: { sha256: string; operation_id: string }): unknown {
  if (!object(value)) return value;
  const output = structuredClone(value);
  const omittedPaths: string[] = [];
  const remove = (row: Row, key: string, prefix: string) => {
    if (!Object.hasOwn(row, key)) return;
    delete row[key];
    omittedPaths.push(prefix + key);
  };
  if (object(output.art_run) && object(output.art_run.document)) {
    for (const key of ['artistic_throughput', 'workflow_metrics', 'compiler_attempt_audit']) {
      remove(output.art_run.document, key, 'art_run.document.');
    }
  }
  const compactCycle = (row: Row, prefix: string) => {
    const execution = object(row.execution) ? row.execution : {};
    if (execution.phase !== 'completed' || execution.failed !== false || row.preflight_rejection
      || row.blocking_issue || row.execution_failure) return;
    const report = object(row.required_user_report) ? row.required_user_report : {};
    // Nonvisual outcomes (including save/export paths) must remain visible.
    if (!row.preview && row.result === undefined && report.result_hint !== undefined) {
      row.result = { summary: report.result_hint };
    }
    for (const key of ['operation_receipt', 'required_user_report', 'required_operation_ack', 'journal_record_path']) {
      remove(row, key, prefix);
    }
    const repair = object(row.compiler_repair_audit) ? row.compiler_repair_audit : {};
    if (repair.final_validation === 'valid' && !repair.deferred_next_pass) {
      remove(row, 'compiler_repair_audit', prefix);
    }
    if (object(row.cycle_latency)) {
      const audit = object(row.cycle_latency.compiler_repair_audit) ? row.cycle_latency.compiler_repair_audit : {};
      if (!row.cycle_latency.deterministic_violations_unresolved_count
        && !audit.deferred_next_pass && (!audit.final_validation || audit.final_validation === 'valid')) {
        remove(row, 'cycle_latency', prefix);
      }
    }
  };
  compactCycle(output, '');
  if (object(output.result)) compactCycle(output.result, 'result.');
  if (observedBrief && object(output.artistic_review)) {
    remove(output.artistic_review, 'original_brief', 'artistic_review.');
    output.artistic_review.original_brief_reference = { ...observedBrief, already_observed_in_this_chat: true };
    remove(output.artistic_review, 'instruction', 'artistic_review.');
    output.artistic_review.instruction = (object(output.artistic_review.critic_role) && output.artistic_review.critic_role.required ? 'Switch to Critic for the whole scene and return critic_review in the same continuation. ' : '') + 'Compare exact AFTER/BEFORE against the original brief already reviewed in this chat. Record observed form/light/material, primary_mismatch and honest target/primitive_footprint in previous_observation; the next pass addresses the largest defect. Pass success does not finish the task or image.';
  }
  const summaryTimes = new Set([
    'guard_cycle_total_ms', 'guard_preflight_ms', 'photoshop_dispatch_wall_ms', 'semantic_cycle_wall_ms',
  ]);
  const projectLatency = (row: Row, prefix: string) => {
    if (!object(row.cycle_latency)) return;
    const latency = row.cycle_latency;
    for (const [key, item] of Object.entries(latency)) {
      // Unknown counters/bindings and violation accounting stay visible. Only timing details are archived.
      if ((key.endsWith('_ms') && !summaryTimes.has(key) && (typeof item === 'number' || item === null))
        || (key.endsWith('_at') && typeof item === 'string')) {
        remove(latency, key, prefix + 'cycle_latency.');
      }
    }
    const audit = latency.compiler_repair_audit;
    // Preserve rejected/systemic repair evidence, validation, fingerprints and deferred_next_pass.
    if (object(audit) && audit.final_validation === 'valid' && Array.isArray(audit.repairs) && audit.repairs.length) {
      remove(audit, 'repairs', prefix + 'cycle_latency.compiler_repair_audit.');
    }
  };
  projectLatency(output, '');
  if (object(output.result)) projectLatency(output.result, 'result.');
  if (!omittedPaths.length) return value;
  try {
    const full = JSON.stringify(value);
    const sha256 = createHash('sha256').update(full).digest('hex');
    const destination = path.join(directory, 'projections', 'diagnostics-' + randomUUID() + '.json');
    output.diagnostic_projection = {
      protocol: 'photoshop.guard.diagnostic_projection.v1', diagnostics_only: true,
      full_response_path: destination, full_response_sha256: sha256, omitted_paths: omittedPaths,
    };
    // Small diagnostics can be cheaper than their disk reference. Never inflate a response to compact it.
    if (Buffer.byteLength(JSON.stringify(output)) >= Buffer.byteLength(full)) return value;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, full, { flag: 'wx' });
    return output;
  } catch {
    // A completed mutation must not become an error, nor lose data, because an optional archive failed.
    return value;
  }
}

/** Explicit public subsets, not continuation authority or clipped owner bindings. */
export function guardResumeSubset(value: Row, projection: string, ownerId?: string): Row {
  if (projection === 'ownership') {
    const doc = object(value.document) ? value.document : {};
    const owners = Array.isArray(doc.logical_layer_owners) ? doc.logical_layer_owners.filter(object) : [];
    const plan = object(doc.scene_ownership_plan) ? doc.scene_ownership_plan : undefined;
    const units = plan && Array.isArray(plan.units) ? plan.units.filter(object) : [];
    const ownerUnits = units.filter(unit => unit.owner_id === ownerId);
    const objects = plan && Array.isArray(plan.objects) ? plan.objects.filter(object) : [];
    return { document_id: value.document_id, projection, ...(ownerId ? {
      component_membership: plan ? { plan_id: plan.plan_id, units: ownerUnits,
        objects: objects.filter(row => Array.isArray(row.component_semantic_ids)
          && ownerUnits.some(unit => (row.component_semantic_ids as unknown[]).includes(unit.semantic_id))) } : null,
    } : { scene_ownership_plan: plan }),
      logical_layer_owners: ownerId ? owners.filter(row => row.hypothesis_id === ownerId) : owners,
      next_required_action: value.next_required_action,
      ...(value.next_public_call ? { next_public_call: value.next_public_call } : {}),
      ...(value.identity_recovery_blockers ? { identity_recovery_blockers: value.identity_recovery_blockers } : {}),
      continuation_requires_recovery_projection: true };
  }
  if (projection !== 'recovery') throw new Error('projection must be recovery|ownership');
  const fields = ['document_id', 'uncertain', 'active_job', 'pending_reports', 'pending_operation_ack',
    'pending_operation_acks', 'pending_report_delivery_acks', 'pending_visual_verdict', 'last_operation',
    'checkpoint_due_before_next_visual_mutation', 'checkpoint_due_reason', 'next_required_action', 'canonical_next_command',
    'resume_mode', 'mutation_allowed', 'identity_recovery_blockers', 'next_public_call'];
  const doc = object(value.document) ? value.document : {};
  return { ...Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]])),
    projection, document: Object.fromEntries(['document_id', 'document_incarnation_id', 'current_frame',
      'visual_barrier', 'checkpoint_state', 'next_required_action'].filter(key => doc[key] !== undefined).map(key => [key, doc[key]])),
    ...(Array.isArray(value.uncertain) && typeof value.uncertain[0] === 'string' ? {
      recovery: { tool: 'photoshop_guard_reconcile', args: { id: value.uncertain[0], capture_evidence: true },
        next: 'Inspect fresh inline evidence, then reconcile using returned state_id/preview_id and an honest outcome; never replay.' },
    } : {}),
  };
}
