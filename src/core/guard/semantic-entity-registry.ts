import { createHash } from 'node:crypto';
import {
  SEMANTIC_CONTRACT_SPEC, type SemanticContractSpec, type SemanticEntityKind,
} from './semantic-contract-spec.js';

export const SEMANTIC_STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
type Row = Record<string, unknown>;
type Entity = { kind: SemanticEntityKind; id: string; aliases: string[]; path: string; origin: 'supplied' | 'durable' };
export interface SemanticContractIssue {
  code: 'semantic_identity_ambiguous' | 'semantic_identity_conflict' | 'semantic_reference_ambiguous'
    | 'semantic_reference_unresolved' | 'semantic_pin_conflict';
  path: string;
  message: string;
  candidates?: string[];
}
export interface SemanticContractRepair {
  path: string;
  source: string;
  reason: string;
}
export interface SemanticCompileResult {
  pass: Row;
  issues: SemanticContractIssue[];
  repairs: SemanticContractRepair[];
  entities: Array<{ kind: SemanticEntityKind; id: string; path: string; origin: 'supplied' | 'durable' }>;
}
interface Node { value: unknown; parent?: Row | unknown[]; key?: string | number; path: string }
const asRow = (v: unknown): Row | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Row : undefined;
const normalized = (v: string) => v.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const stableHash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 16);
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const row = asRow(v);
  if (row) return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
};

/** Resolve the exact paths described in the spec, not arbitrary matching property names. */
export function semanticNodes(root: Row, path: string): Node[] {
  let found: Node[] = [{ value: root, path: '' }];
  for (const segment of path.split('.')) {
    const array = segment.endsWith('[]');
    const key = array ? segment.slice(0, -2) : segment;
    const next: Node[] = [];
    for (const node of found) {
      const row = asRow(node.value);
      if (!row || !Object.prototype.hasOwnProperty.call(row, key)) continue;
      const value = row[key];
      const childPath = node.path ? `${node.path}.${key}` : key;
      if (array) {
        if (Array.isArray(value)) value.forEach((entry, index) => next.push({
          value: entry, parent: value, key: index, path: `${childPath}[${index}]`,
        }));
      } else next.push({ value, parent: row, key, path: childPath });
    }
    found = next;
  }
  return found;
}

/** Stable IDs derive from the declared semantic identity, never a random UUID.
 * If two declarations are indistinguishable, report ambiguity rather than
 * assigning an order-sensitive, misleading identity. */
function generatedId(kind: SemanticEntityKind, scope: string, signature: string): string {
  const prefix = kind.replace(/[^a-z0-9]/g, '_').slice(0, 20);
  return `${prefix}_${stableHash(`${scope}|${kind}|${signature}`)}`;
}

function aliasValues(row: Row, fields: readonly string[] | undefined): string[] {
  return fields?.flatMap(field => {
    const value = row[field];
    return typeof value === 'string' && value.trim() ? [value.trim()] : [];
  }) ?? [];
}

/** No write to durable storage, Photoshop, or original caller input.
 * The result must still pass the existing strict Guard and model validators. */
export function compileSemanticContracts(
  rawPass: Row,
  durable: Row = {},
  spec: SemanticContractSpec = SEMANTIC_CONTRACT_SPEC,
): SemanticCompileResult {
  const pass = structuredClone(rawPass);
  const issues: SemanticContractIssue[] = [];
  const repairs: SemanticContractRepair[] = [];
  const registry = new Map<SemanticEntityKind, Entity[]>();
  const doc = pass.document_id;
  const scope = typeof doc === 'number' && Number.isSafeInteger(doc) && doc > 0
    ? `${doc}|${typeof durable.document_incarnation_id === 'string' ? durable.document_incarnation_id : ''}`
    : 'unknown';
  const issue = (code: SemanticContractIssue['code'], path: string, message: string, candidates?: string[]) =>
    issues.push({ code, path, message, ...(candidates ? { candidates } : {}) });
  const index = (entity: Entity) => registry.set(entity.kind, [...(registry.get(entity.kind) ?? []), entity]);
  const declarations = (source: Row, origin: Entity['origin']) => {
    for (const declaration of spec.declarations) {
      for (const found of semanticNodes(source, declaration.path)) {
        const row = asRow(found.value);
        if (!row) continue;
        const path = `${found.path}.${declaration.field}`;
        const explicit = typeof row[declaration.field] === 'string' && (row[declaration.field] as string).trim()
          ? (row[declaration.field] as string).trim() : undefined;
        const aliases = aliasValues(row, declaration.aliases);
        if (explicit) aliases.push(explicit);
        let id = explicit;
        // A supplied *update* without a technical model identity continues
        // the one exact durable model, never allocates a new model incarnation.
        if (!id && origin === 'supplied' && (declaration.kind.endsWith('-model') || declaration.kind === 'ownership-plan')) {
          const durableMatches = semanticNodes(durable, declaration.path)
            .map(node => asRow(node.value)?.[declaration.field])
            .filter((value): value is string => typeof value === 'string' && SEMANTIC_STABLE_ID.test(value));
          if (durableMatches.length === 1) {
            id = durableMatches[0];
            row[declaration.field] = id;
            repairs.push({ path, source: `durable.${declaration.path}.${declaration.field}`,
              reason: 'Inherited the authoritative durable model identity.' });
          }
        }
        if (!id && origin === 'supplied' && declaration.identityKey) {
          const key = row[declaration.identityKey];
          if (typeof key === 'string' && key.trim()) {
            const sameSemanticRole = semanticNodes(durable, declaration.path)
              .map(node => asRow(node.value))
              .filter((candidate): candidate is Row => !!candidate
                && candidate[declaration.identityKey!] === key
                && typeof candidate[declaration.field] === 'string'
                && SEMANTIC_STABLE_ID.test(candidate[declaration.field] as string));
            if (sameSemanticRole.length === 1) {
              id = sameSemanticRole[0][declaration.field] as string;
              row[declaration.field] = id;
              repairs.push({ path, source: `durable.${declaration.path}.${declaration.field}`,
                reason: `Preserved the exact durable ${declaration.kind} bound to semantic ${declaration.identityKey}.` });
            } else if (sameSemanticRole.length > 1) {
              issue('semantic_identity_ambiguous', path,
                `Multiple durable ${declaration.kind} entities share the authored ${declaration.identityKey}; choose an exact identity.`,
                sameSemanticRole.map(candidate => String(candidate[declaration.field])));
            }
          }
        }
        if (origin === 'supplied' && declaration.generate && (!id || !SEMANTIC_STABLE_ID.test(id))) {
          // The signature is a semantic key: a meaningful role/name or a
          // caller-supplied description. No identity is deduced from pixel data.
          const identity = declaration.identityKey && typeof row[declaration.identityKey] === 'string'
            && String(row[declaration.identityKey]).trim()
            ? `${declaration.identityKey}:${String(row[declaration.identityKey]).trim()}` : '';
          const signature = explicit || identity || aliases.join('|') || stableHash(canonical(row));
          id = generatedId(declaration.kind, scope, signature);
          row[declaration.field] = id;
          repairs.push({ path, source: explicit ? 'authored-label' : 'typed-declaration',
            reason: `Assigned deterministic ${declaration.kind} identity; the artistic declaration is unchanged.` });
        }
        if (!id) continue;
        if (origin === 'supplied' && !SEMANTIC_STABLE_ID.test(id)) {
          issue('semantic_identity_conflict', path, `Invalid ${declaration.kind} identifier; declaration could not be safely bound.`);
          continue;
        }
        const siblings = registry.get(declaration.kind) ?? [];
        // Two separately declared identical IDs in the same request are
        // ambiguous. Durable/current repeat is a valid immutable identity.
        if (declaration.kind !== 'logical-owner' && siblings.some(item => item.id === id && item.origin === origin)) {
          issue('semantic_identity_conflict', path, `Duplicate ${declaration.kind} id ${id} in the same scope.`);
        } else index({ kind: declaration.kind, id, path: found.path, origin, aliases });
      }
    }
  };
  declarations(durable, 'durable');
  declarations(pass, 'supplied');

  for (const model of ['scene_lighting_color_model', 'scene_geometry_model', 'scene_camera_imaging_model']) {
    const row = asRow(pass[model]);
    if (!row || row.revision !== undefined) continue;
    const previous = asRow(durable[model]);
    const priorId = previous?.model_id;
    const id = row.model_id;
    // Existing model update is authored; its revision number is bookkeeping.
    const revision = priorId === id && Number.isSafeInteger(previous?.revision)
      && Number(previous?.revision) > 0 ? Number(previous!.revision) + 1
      : previous ? undefined : 1;
    if (revision !== undefined) {
      row.revision = revision;
      repairs.push({ path: `${model}.revision`, source: previous ? 'durable-model-revision' : 'new-model-initial-revision',
        reason: 'Assigned the deterministic next model revision without changing artwork or authority.' });
    }
  }

  // Additional authoritative semantic owners can exist without a new
  // scene_ownership_plan declaration in this pass.
  if (Array.isArray(durable.logical_layer_owners)) {
    for (const owner of durable.logical_layer_owners) {
      const row = asRow(owner);
      const id = row?.hypothesis_id;
      if (typeof id === 'string' && SEMANTIC_STABLE_ID.test(id)
        && !(registry.get('logical-owner') ?? []).some(item => item.id === id)) {
        index({ kind: 'logical-owner', id, path: 'logical_layer_owners', origin: 'durable', aliases: [] });
      }
    }
  }

  for (const pin of spec.pins) {
    const parentPath = pin.path.split('.').slice(0, -1).join('.');
    const target = pin.path.split('.').at(-1)!;
    const source = pin.sourceScope === 'pass' ? pass : durable;
    const value = semanticNodes(source, pin.source)[0]?.value;
    if (value === undefined || value === null) continue;
    // A frame envelope is pure host provenance, not a user-made artistic
    // decision. Create it only under an already supplied model and only when
    // the exact pin can be obtained.
    if (parentPath.endsWith('.source_frame')) {
      const modelPath = parentPath.slice(0, -'.source_frame'.length);
      const model = asRow(pass[modelPath]);
      if (model && model.source_frame === undefined) model.source_frame = {};
    }
    const parents = semanticNodes(pass, parentPath);
    for (const node of parents) {
      const row = asRow(node.value);
      if (!row) continue;
      if (row[target] === undefined) {
        row[target] = structuredClone(value);
        repairs.push({ path: `${node.path}.${target}`, source: `${pin.sourceScope}.${pin.source}`,
          reason: 'Inherited exact technical pin from the selected model/document.' });
      } else if (row[target] !== value) {
        issue('semantic_pin_conflict', `${node.path}.${target}`,
          `Explicit technical pin disagrees with authoritative ${pin.sourceScope}.${pin.source}; it was not overwritten.`);
      }
    }
  }

  for (const reference of spec.references) {
    for (const node of semanticNodes(pass, reference.path)) {
      if (!node.parent || node.key === undefined) continue;
      if (node.value === undefined || node.value === null) continue;
      if (typeof node.value !== 'string' || !node.value.trim()) {
        issue('semantic_reference_unresolved', node.path, `Expected a ${reference.kind} reference.`);
        continue;
      }
      const requested = node.value.trim();
      const candidates = registry.get(reference.kind) ?? [];
      if (!candidates.length) {
        // An external/previously accepted object may be resolved later by its
        // authoritative Guard gate. We do not manufacture such evidence.
        continue;
      }
      const exact = candidates.filter(item => item.id === requested);
      const aliases = exact.length ? exact : candidates.filter(item =>
        item.aliases.some(alias => normalized(alias) === normalized(requested)));
      const preferred = reference.preferDeclaredPath
        ? candidates.filter(item => item.path.startsWith(reference.preferDeclaredPath!)) : candidates;
      const matches = aliases.length ? aliases
        : reference.naturalLanguage && !SEMANTIC_STABLE_ID.test(requested) ? preferred : [];
      const distinct = [...new Set(matches.map(item => item.id))];
      if (distinct.length === 1) {
        if (requested !== distinct[0]) {
          (node.parent as Row)[node.key] = distinct[0];
          repairs.push({ path: node.path, source: `typed-registry:${reference.kind}`,
            reason: `Resolved the uniquely declared ${reference.kind} reference without changing its semantic target.` });
        }
      } else if (distinct.length > 1) {
        issue('semantic_reference_ambiguous', node.path,
          `The ${reference.kind} reference matches multiple declared targets. Choose the intended entity, not an arbitrary ID.`, distinct);
      } else {
        issue('semantic_reference_unresolved', node.path,
          `No declared ${reference.kind} has identity/role ${JSON.stringify(requested)}. Do not guess or redirect an explicit reference.`,
          [...new Set(candidates.map(item => item.id))]);
      }
    }
  }
  return { pass, issues, repairs, entities: [...registry.values()].flat().map(({ kind, id, path, origin }) => ({ kind, id, path, origin })) };
}
