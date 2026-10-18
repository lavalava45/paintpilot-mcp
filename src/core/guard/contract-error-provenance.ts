import { createHmac, randomBytes } from 'node:crypto';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

type Row = Record<string, unknown>;
type Root = 'painting_intent' | 'next_pass' | 'next_operation';
export type ProvenanceStage =
  | 'submitted' | 'semantic_identity' | 'semantic_ownership'
  | 'technical_binding' | 'geometry_binding' | 'operation_compiled'
  | 'operation_validated' | 'convergence';
export type ProvenanceFinding =
  | 'authored_conflict_with_durable_binding'
  | 'compiler_output_invalid'
  | 'contract_spec_conflict'
  | 'compiler_pipeline_failure'
  | 'durable_owner_binding_absent'
  | 'input_field_present'
  | 'input_field_missing'
  | 'unattributed';

export interface FieldWitness {
  stage: ProvenanceStage;
  root: Root;
  path: string;
  presence: 'present' | 'absent';
  /** Hash only: do not return prompts, pixels, paths, free text or raw model data. */
  value_hmac_sha256?: string;
  value_type?: 'null' | 'undefined' | 'array' | 'object' | 'number' | 'boolean' | 'string';
}

export interface ContractErrorOrigin {
  code: string;
  scope: GuardCycleCompileViolation['scope'];
  path: string | null;
  finding: ProvenanceFinding;
  certainty: 'proven' | 'insufficient-evidence';
  evidence: FieldWitness[];
  state_binding?: {
    owner_registered: boolean;
    /** Only exact durable owner records count; names/active layers are not proof. */
    owner_matches: number;
    current_layer_id?: number;
    requested_layer_id?: number;
  };
  explanation: string;
}
export interface ContractErrorProvenanceReport {
  protocol: 'paintpilot.contract_error_provenance.v1';
  scope: 'current-preflight-only';
  instruction_delivery: 'not-observed';
  /** Evidence of an invalid field is NOT evidence that a model saw instructions. */
  model_instruction_noncompliance_proven: false;
  photoshop_mutation_started: false;
  findings: ContractErrorOrigin[];
  remaining_count: number;
}

const record = (value: unknown): Row | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined;
const hashed = (key: Buffer, value: unknown): string => createHmac('sha256', key)
  .update(JSON.stringify(value) ?? 'undefined').digest('hex');
const typeOf = (value: unknown): FieldWitness['value_type'] =>
  value === null ? 'null' : Array.isArray(value) ? 'array'
    : (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
      ? 'undefined' : typeof value as FieldWitness['value_type'];

/** Deliberately bounded, literal property paths only; never eval, wildcard
 * inspection or path-derived access to runtime internals. */
export function readContractPath(root: unknown, path: string): { present: boolean; value?: unknown } {
  if (!/^[a-zA-Z_][\w-]*(?:\[\d{1,4}\]|\.[a-zA-Z_][\w-]*)*$/.test(path)) return { present: false };
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  if (parts.length > 32) return { present: false };
  let value: unknown = root;
  for (const part of parts) {
    if (part === '__proto__' || part === 'prototype' || part === 'constructor') return { present: false };
    if (Array.isArray(value)) {
      const number = Number(part);
      if (!/^\d+$/.test(part) || number >= value.length || !Object.hasOwn(value, number)) return { present: false };
      value = value[number];
    } else {
      const row = record(value);
      if (!row || !Object.hasOwn(row, part)) return { present: false };
      value = row[part];
    }
  }
  return { present: true, value };
}

function normalizePath(violation: GuardCycleCompileViolation): string | null {
  const candidate = typeof violation.details?.path === 'string' ? violation.details.path : '';
  const combined = candidate || violation.message;
  // The emitter's namespace is evidence. Do not pretend an arbitrary quoted
  // path necessarily refers to user input.
  const explicit = combined.match(/(?:painting_intent|next_pass|next_operation)\.(?:[a-zA-Z_]\w*(?:\[\d{1,4}\])?\.?)+/);
  if (explicit) return explicit[0].replace(/\.$/, '');
  const args = combined.match(/args(?:\.[a-zA-Z_]\w*(?:\[\d{1,4}\])?)+/);
  if (args) return `next_operation.${args[0]}`;
  switch (violation.code) {
    case 'semantic_layer_owner_missing': return 'next_pass.logical_layer';
    case 'semantic_mutation_target_owner_mismatch': return 'next_pass.actions';
    case 'tool_schema_invalid': return null;
    case 'invalid_visual_microplan': return 'next_operation.args.steps';
    default: return null;
  }
}

type Snapshot = { stage: ProvenanceStage; root: Root; payload: unknown };
const MAX_SNAPSHOTS = 12;
const MAX_FINDINGS = 24;
const MAX_WITNESSES = 8;
const layerId = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;

function mutationTargets(pass: Row | undefined): number[] {
  const steps = Array.isArray(pass?.actions) ? pass.actions : [];
  const results: number[] = [];
  for (const action of steps) {
    const item = record(action);
    if (!item || typeof item.tool !== 'string' || !/^(photoshop_paint_|photoshop_fill_layer|photoshop_erase|photoshop_transform_layer|photoshop_move_layer|photoshop_rotate_layer|photoshop_scale_layer|photoshop_apply_)/.test(item.tool)) continue;
    const args = record(item.args);
    if (!args) continue;
    const target = layerId(args.layer_id);
    if (target) results.push(target);
    if (item.tool === 'photoshop_paint_regions' && Array.isArray(args.regions)) {
      for (const region of args.regions) {
        const id = layerId(record(region)?.layer_id);
        if (id) results.push(id);
      }
    }
  }
  return [...new Set(results)];
}

/** Observer is local to one compiler call. Capture is ephemeral; only bounded
 * hashes, paths and proven numeric layer bindings leave the call. */
export class ContractErrorProvenanceObserver {
  private readonly snapshots: Snapshot[] = [];
  private readonly authored: Root | undefined;
  private readonly evidenceKey = randomBytes(32);
  constructor(private readonly submitted: Row) {
    this.authored = record(submitted.next_pass) ? 'next_pass'
      : record(submitted.painting_intent) ? 'painting_intent'
        : record(submitted.next_operation) ? 'next_operation' : undefined;
    if (this.authored) this.capture('submitted', this.authored, submitted[this.authored]);
  }

  capture(stage: ProvenanceStage, root: Root, payload: unknown): void {
    if (this.snapshots.length >= MAX_SNAPSHOTS || !record(payload)) return;
    this.snapshots.push({ stage, root, payload: structuredClone(payload) });
  }

  report(
    violations: readonly GuardCycleCompileViolation[],
    context: Row = {},
  ): ContractErrorProvenanceReport {
    const findings = violations.slice(0, MAX_FINDINGS).map(item => this.origin(item, context));
    return {
      protocol: 'paintpilot.contract_error_provenance.v1',
      scope: 'current-preflight-only',
      instruction_delivery: 'not-observed',
      model_instruction_noncompliance_proven: false,
      photoshop_mutation_started: false,
      findings,
      remaining_count: Math.max(0, violations.length - findings.length),
    };
  }

  private origin(item: GuardCycleCompileViolation, context: Row): ContractErrorOrigin {
    const path = normalizePath(item);
    const [root, ...tokens] = path?.split('.') ?? [];
    const relative = tokens.join('.');
    const witnesses: FieldWitness[] = [];
    if (relative && ['next_pass', 'painting_intent', 'next_operation'].includes(root)) {
      for (const snap of this.snapshots) {
        if (snap.root !== root || witnesses.length >= MAX_WITNESSES) continue;
        const found = readContractPath(snap.payload, relative);
        witnesses.push({ stage: snap.stage, root: snap.root, path: path!,
          presence: found.present ? 'present' : 'absent',
          ...(found.present ? { value_type: typeOf(found.value), value_hmac_sha256: hashed(this.evidenceKey, found.value) } : {}),
        });
      }
    }
    const submitted = witnesses.find(entry => entry.stage === 'submitted');
    const last = witnesses.at(-1);
    let finding: ProvenanceFinding = 'unattributed';
    let certainty: ContractErrorOrigin['certainty'] = 'insufficient-evidence';
    let explanation = 'The available compilation stages do not prove who introduced this conflict or whether the model received applicable instructions.';
    let stateBinding: ContractErrorOrigin['state_binding'];

    if (['guard_requirement_unexpressible', 'guard_requirement_conflict'].includes(item.code)) {
      finding = 'contract_spec_conflict';
      certainty = 'proven';
      explanation = 'The server proved that its required contract cannot be expressed or contains incompatible requirements. A new artistic guess is not a valid repair.';
    } else if (item.code === 'compiled_operation_missing') {
      finding = 'compiler_pipeline_failure';
      certainty = 'proven';
      explanation = 'The server completed compilation without an executable operation or a more precise diagnostic. This missing compiler output is not attributable to ignored model instructions.';
    }
    if (finding === 'unattributed' && (item.code === 'semantic_mutation_target_owner_mismatch' || item.code === 'semantic_layer_owner_missing')) {
      // Source can be an authored next_pass or an internally derived pass.
      // Prefer the original payload; never ascribe an intent-generated layer
      // index to the model without corresponding authored evidence.
      const original = record(this.submitted.next_pass) ?? record(this.submitted.painting_intent);
      const ownerId = typeof record(original?.logical_layer)?.hypothesis_id === 'string'
        ? record(original?.logical_layer)!.hypothesis_id
        : original?.target_owner_id;
      const owners = Array.isArray(context.logical_layer_owners)
        ? context.logical_layer_owners.filter(entry => !!record(entry)) as Row[] : undefined;
      if (typeof ownerId === 'string' && owners) {
        const matches = owners.filter(owner => owner.hypothesis_id === ownerId && owner.temporary !== true);
        const target = mutationTargets(original);
        const current = matches.length === 1 ? layerId(matches[0]?.layer_id) : undefined;
        stateBinding = { owner_registered: matches.length === 1, owner_matches: matches.length,
          ...(current ? { current_layer_id: current } : {}),
          ...(target.length === 1 ? { requested_layer_id: target[0] } : {}),
        };
        if (item.code === 'semantic_mutation_target_owner_mismatch' && current && target.some(id => id !== current)) {
          finding = 'authored_conflict_with_durable_binding';
          certainty = 'proven';
          explanation = 'A numeric foreign target was present in the submitted request and contradicts exactly one durable owner binding. This does not prove that instructions were received.';
        } else if (item.code === 'semantic_layer_owner_missing' && matches.length === 0
          && record(original?.logical_layer)?.decision === 'continue-logical-layer') {
          finding = 'durable_owner_binding_absent';
          certainty = 'proven';
          explanation = 'The submitted request selected continuation, but the authoritative owner inventory has no durable record. Repeating the same ID cannot create that record.';
        }
      }
    }
    if (finding === 'unattributed' && submitted?.presence === 'present') {
      finding = 'input_field_present';
      certainty = 'proven';
      explanation = 'The referenced field was already in the submitted payload. This is field lineage only, not evidence that the user/model ignored a delivered contract.';
    } else if (finding === 'unattributed' && submitted?.presence === 'absent'
      && last?.presence === 'present' && root === this.authored) {
      finding = 'compiler_output_invalid';
      certainty = 'proven';
      explanation = 'The field was absent in the submitted technical contract and present in a later compiler stage that was rejected. This establishes value provenance, not whether the artistic intent was sufficient.';
    } else if (finding === 'unattributed'
      && item.code === 'tool_schema_invalid'
      && root === 'next_operation'
      && this.authored !== 'next_operation'
      && witnesses.some(entry => entry.stage === 'operation_compiled' && entry.presence === 'present')) {
      finding = 'compiler_output_invalid';
      certainty = 'proven';
      explanation = 'The invalid executable field is present in the server-compiled operation, not a directly authored next_operation. The compiler produced the rejected technical representation; the adequacy of artistic input must be evaluated separately.';
    } else if (finding === 'unattributed' && submitted?.presence === 'absent') {
      finding = 'input_field_missing';
      certainty = 'proven';
      explanation = 'The referenced field is absent in the submitted payload. No evidence proves the model saw the corresponding requirement or that the missing value can be safely inferred.';
    }
    return {
      code: item.code, scope: item.scope, path, finding, certainty,
      evidence: witnesses,
      ...(stateBinding ? { state_binding: stateBinding } : {}),
      explanation,
    };
  }
}

/** Preserve ONLY the v1 forensic projection in the durable journal.
 * Diagnostic writes cannot smuggle prompts, pixels or arbitrary untrusted
 * properties into the user-visible audit even if called by another runtime. */
export function sanitizeContractErrorProvenance(input: unknown): ContractErrorProvenanceReport | undefined {
  const data = record(input);
  if (data?.protocol !== 'paintpilot.contract_error_provenance.v1' || !Array.isArray(data.findings)
    || data.findings.length > MAX_FINDINGS) return undefined;
  const findings: ContractErrorOrigin[] = [];
  for (const raw of data.findings) {
    const row = record(raw);
    if (!row || typeof row.code !== 'string' || row.code.length > 100
      || !['cycle', 'finalization', 'next_operation'].includes(String(row.scope))
      || !/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(row.code)
      || !['authored_conflict_with_durable_binding', 'compiler_output_invalid',
        'contract_spec_conflict', 'compiler_pipeline_failure',
        'durable_owner_binding_absent', 'input_field_present', 'input_field_missing', 'unattributed'].includes(String(row.finding))) return undefined;
    const evidence: FieldWitness[] = [];
    if (!Array.isArray(row.evidence) || row.evidence.length > MAX_WITNESSES) return undefined;
    for (const witness of row.evidence) {
      const field = record(witness);
      if (!field || typeof field.path !== 'string' || field.path.length > 240
        || !/^(painting_intent|next_pass|next_operation)\.[a-zA-Z_]\w*(?:\[\d{1,4}\])?(?:\.[a-zA-Z_]\w*(?:\[\d{1,4}\])?)*$/.test(field.path)
        || !['submitted', 'semantic_identity', 'semantic_ownership', 'technical_binding',
          'geometry_binding', 'operation_compiled', 'operation_validated', 'convergence'].includes(String(field.stage))
        || !['painting_intent', 'next_pass', 'next_operation'].includes(String(field.root))
        || !['present', 'absent'].includes(String(field.presence))) return undefined;
      if (field.value_hmac_sha256 !== undefined && (typeof field.value_hmac_sha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(field.value_hmac_sha256))) return undefined;
      evidence.push({
        stage: field.stage as ProvenanceStage,
        root: field.root as Root,
        path: field.path,
        presence: field.presence as FieldWitness['presence'],
        ...(typeof field.value_hmac_sha256 === 'string' ? { value_hmac_sha256: field.value_hmac_sha256 } : {}),
        ...(['null', 'undefined', 'array', 'object', 'number', 'boolean', 'string'].includes(String(field.value_type))
          ? { value_type: field.value_type as FieldWitness['value_type'] } : {}),
      });
    }
    const binding = record(row.state_binding);
    const safeBinding = binding
      && typeof binding.owner_registered === 'boolean'
      && Number.isSafeInteger(binding.owner_matches) && Number(binding.owner_matches) >= 0
      ? { owner_registered: binding.owner_registered,
        owner_matches: Number(binding.owner_matches),
        ...(layerId(binding.current_layer_id) ? { current_layer_id: layerId(binding.current_layer_id) } : {}),
        ...(layerId(binding.requested_layer_id) ? { requested_layer_id: layerId(binding.requested_layer_id) } : {}),
      } : undefined;
    findings.push({
      code: row.code,
      scope: row.scope as ContractErrorOrigin['scope'],
      path: typeof row.path === 'string' && row.path.length <= 240
        && /^(painting_intent|next_pass|next_operation)\.[a-zA-Z_]\w*(?:\[\d{1,4}\])?(?:\.[a-zA-Z_]\w*(?:\[\d{1,4}\])?)*$/.test(row.path)
        ? row.path : null,
      finding: row.finding as ProvenanceFinding,
      certainty: row.certainty === 'proven' ? 'proven' : 'insufficient-evidence',
      evidence,
      ...(safeBinding ? { state_binding: safeBinding } : {}),
      // Explanations are recomputed as generic bounded text to prevent
      // accidental persistence of dynamic error messages or user prompts.
      explanation: 'See the typed finding and field witnesses; instruction delivery remains unobserved.',
    });
  }
  return {
    protocol: 'paintpilot.contract_error_provenance.v1',
    scope: 'current-preflight-only',
    instruction_delivery: 'not-observed',
    model_instruction_noncompliance_proven: false,
    photoshop_mutation_started: false,
    findings,
    remaining_count: Number.isSafeInteger(data.remaining_count) && Number(data.remaining_count) >= 0
      ? Math.min(Number(data.remaining_count), 100000) : 0,
  };
}
