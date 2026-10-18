import { SEMANTIC_EXECUTION_SPEC } from './semantic-contract-spec.js';
import { VISUAL_MICROPLAN_MUTATION_TOOLS } from '../visual-microplan.js';
import { compileVisualMicroPlan } from '../visual-microplan-compiler.js';
import type { StructuredRepairOperation } from './preflight-repair.js';

type RecordValue = Record<string, unknown>;
const record = (item: unknown): RecordValue | undefined =>
  item && typeof item === 'object' && !Array.isArray(item) ? item as RecordValue : undefined;
const nonempty = (item: unknown): string | undefined =>
  typeof item === 'string' && item.trim() ? item.trim() : undefined;
const validLayer = (item: unknown): number | undefined =>
  typeof item === 'number' && Number.isSafeInteger(item) && item > 0 ? item : undefined;

export interface SemanticExecutionIssue {
  code: 'semantic_execution_owner_ambiguous' | 'semantic_execution_owner_conflict'
    | 'semantic_method_contract_required' | 'semantic_method_contract_conflict';
  path: string;
  message: string;
  candidates?: string[];
}
export interface SemanticExecutionCompilation {
  pass: RecordValue;
  issues: SemanticExecutionIssue[];
  repairs: StructuredRepairOperation[];
}

/** Apply one explicit semantic owner to its uniquely registered physical layer.
 * This is a *binding*, not permission to create, migrate or edit the layer.
 * The ordinary Guard validates authority and all action targets afterwards. */
export function compileSemanticOwnership(
  authored: RecordValue, context: RecordValue = {},
): SemanticExecutionCompilation {
  const pass = structuredClone(authored);
  const issues: SemanticExecutionIssue[] = [];
  const repairs: StructuredRepairOperation[] = [];
  const spec = SEMANTIC_EXECUTION_SPEC.owner;
  const requested = nonempty(pass[spec.selector]);
  const logical = record(pass[spec.declaration]);
  if (requested && logical && nonempty(logical.hypothesis_id) && logical.hypothesis_id !== requested) {
    issues.push({ code: 'semantic_execution_owner_conflict',
      path: 'logical_layer.hypothesis_id',
      message: `Authored logical layer ${String(logical.hypothesis_id)} disagrees with selected semantic owner ${requested}. Do not change artistic ownership implicitly.` });
    return { pass, issues, repairs };
  }
  if (!requested) return { pass, issues, repairs };
  const durableOwnerRows: unknown = context[spec.durableOwners];
  const owners: RecordValue[] = Array.isArray(durableOwnerRows)
    ? durableOwnerRows.filter((entry: unknown): entry is RecordValue => !!record(entry)) : [];
  const matches = owners.filter(entry => entry.temporary !== true && entry[spec.durableId] === requested);
  if (matches.length > 1) {
    issues.push({ code: 'semantic_execution_owner_ambiguous', path: 'target_owner_id',
      message: `More than one durable owner matches ${requested}; there is no single authorized layer.` });
    return { pass, issues, repairs };
  }
  if (matches.length !== 1) return { pass, issues, repairs };
  const owner = matches[0]!;
  const layer = validLayer(owner[spec.physicalTarget]);
  if (!layer) return { pass, issues, repairs };
  const actions = Array.isArray(pass.actions) ? pass.actions.filter(record) as RecordValue[] : [];
  const creates = actions.some(step => step.tool === 'photoshop_create_layer');
  const mutations = actions.filter(step => VISUAL_MICROPLAN_MUTATION_TOOLS.has(String(step.tool)));
  if (!mutations.length) return { pass, issues, repairs };
  const explicitTargets: number[] = [];
  const target = (value: unknown): void => {
    if (value !== undefined) {
      // Explicit symbolic and non-numeric targets are not silently rewritten.
      explicitTargets.push(validLayer(value) ?? -1);
    }
  };
  for (const action of mutations) {
    const args = record(action.args);
    target(args?.layer_id);
    // Only executable *target* positions, not e.g. a source/mask-layer
    // reference. The later Guard checks all method-specific targeting.
    if (action.tool === 'photoshop_paint_regions' && Array.isArray(args?.regions)) {
      for (const region of args.regions) target(record(region)?.layer_id);
    }
  }
  if (explicitTargets.some(target => target !== layer)) {
    issues.push({ code: 'semantic_execution_owner_conflict', path: 'actions',
      message: `An authored mutation target conflicts with the durable layer ${layer} of owner ${requested}. No owner or target was changed.` });
    return { pass, issues, repairs };
  }
  // Creation, rollback, explicit cross-layer correction and an artist-authored
  // logical decision must go through their normal safety contracts.
  if (creates || pass.cross_layer_correction !== undefined || pass.restore_anchor_operation_id !== undefined) {
    return { pass, issues, repairs };
  }
  if (!logical) {
    pass.logical_layer = {
      decision: 'continue-logical-layer', hypothesis_id: requested, layer_id: layer,
    };
    repairs.push({ kind: 'inject_from_context', path: 'next_pass.logical_layer',
      source: `durable_owner:${requested}`,
      reason: 'Selected owner has exactly one current durable physical layer; no artistic decision was inferred.' });
  } else if (spec.continuationDecisions.includes(logical.decision as never)) {
    if (logical.layer_id !== undefined && logical.layer_id !== layer) {
      issues.push({ code: 'semantic_execution_owner_conflict', path: 'logical_layer.layer_id',
        message: `Authored layer ${String(logical.layer_id)} conflicts with the current durable layer ${layer} of ${requested}.` });
      return { pass, issues, repairs };
    }
    if (logical.layer_id === undefined) {
      logical.layer_id = layer;
      repairs.push({ kind: 'inject_from_context', path: 'next_pass.logical_layer.layer_id',
        source: `durable_owner:${requested}.layer_id`,
        reason: 'Inherited an exact durable physical layer binding, without overwriting the selected owner.' });
    }
  }
  // The existing narrow physical target binder executes in the next compiler
  // phase and retains its own guardrail against mixed or foreign operations.
  return { pass, issues, repairs };
}

/** Build the executor strategy from typed artistic choices and verified brush
 * inventory. Missing roles are *not* replaced with a guessed generic material. */
export function compileSemanticMethod(
  provided: RecordValue | undefined,
  input: {
    authoredMaterial?: string;
    authoredVisualIntent?: string;
    brushMaterialRoles?: unknown;
  },
): { strategy?: RecordValue; issues: SemanticExecutionIssue[]; repairs: StructuredRepairOperation[] } {
  if (!provided) return { issues: [], repairs: [] };
  const strategy = structuredClone(provided);
  const issues: SemanticExecutionIssue[] = [];
  const repairs: StructuredRepairOperation[] = [];
  const spec = SEMANTIC_EXECUTION_SPEC.method;
  const material = nonempty(strategy.material_role);
  const explicit = nonempty(input.authoredMaterial);
  const choices = [...new Set((Array.isArray(input.brushMaterialRoles) ? input.brushMaterialRoles : [])
    .map(nonempty).filter((value): value is string => !!value))];
  if (material && explicit && material !== explicit) {
    issues.push({ code: 'semantic_method_contract_conflict', path: 'paint_strategy.material_role',
      message: `Executor material ${material} contradicts the authored material ${explicit}.` });
  } else if (!material) {
    const uniquelyProven = explicit ?? (choices.length === 1 ? choices[0] : undefined);
    if (uniquelyProven) {
      strategy.material_role = uniquelyProven;
      repairs.push({ kind: 'inject_from_context', path: 'next_operation.args.paint_strategy.material_role',
        source: explicit ? 'next_pass.material_role' : 'preflighted_brush_role.material_roles',
        reason: 'Executor requires the uniquely authored or preflight-proven material role.' });
    }
  }
  if (nonempty(input.authoredVisualIntent) && nonempty(strategy.visual_intent)
      && input.authoredVisualIntent !== strategy.visual_intent) {
    issues.push({ code: 'semantic_method_contract_conflict', path: 'paint_strategy.visual_intent',
      message: 'Executor visual intent differs from the supplied artistic intent.' });
  }
  for (const field of spec.requiredFields) {
    if (!nonempty(strategy[field])) issues.push({
      code: 'semantic_method_contract_required',
      path: `paint_strategy.${field}`,
      message: `The executable method requires ${field}; no unique authored/verified source was available. Do not choose an arbitrary brush material or artistic intent.`,
      ...(field === 'material_role' && choices.length > 1 ? { candidates: choices } : {}),
    });
  }
  return { strategy, issues, repairs };
}

/** Final immutable phase of intent→owner→method→execution compilation.
 * Defaults only pure protocol sequencing. The existing VisualMicroPlan parser,
 * Photoshop tool schemas and Guard still make the admission decision. */
export function compileSemanticExecutablePlan(
  input: RecordValue,
): { args: RecordValue; repairs: StructuredRepairOperation[] } {
  const spec = SEMANTIC_EXECUTION_SPEC.plan;
  const before = Array.isArray(input[spec.stepField]) ? input[spec.stepField] as RecordValue[] : [];
  const args = compileVisualMicroPlan(input);
  const after = Array.isArray(args[spec.stepField]) ? args[spec.stepField] as RecordValue[] : [];
  const additions = after.slice(before.length).filter(step => step.tool === spec.terminalRead);
  return { args, repairs: additions.length && before.length
    && VISUAL_MICROPLAN_MUTATION_TOOLS.has(String(before.at(-1)?.tool))
    ? [{ kind: 'normalize', path: 'next_operation.args.steps', normalizer: 'executor_terminal_preview',
      reason: 'Compiled the required terminal Photoshop preview after an authored visual mutation.' }]
    : [] };
}
