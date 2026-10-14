/** Stable, image-reviewed subrequirements. A command cannot resolve one. */
type Obligation = { id: string; criterion: string; component_ids: string[]; depends_on_ids: string[];
  status: 'pass' | 'fail' | 'unknown'; visible: string; frame_sha256?: string; operation_id?: string;
  parent_problem_id?: string; correction_kind?: string };

export const CRITIC_OBLIGATIONS_SCHEMA = {
  type: 'array', maxItems: 12, description: 'Optional explicit decomposition of a compound Critic finding. Reuse stable IDs, list dependent IDs and independently editable components. Review status on the SAME delivered frame; do not split old prose or infer pass automatically.',
  items: { type: 'object', additionalProperties: false, properties: {
    id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' },
    criterion: { type: 'string', enum: ['brief_fidelity','form_proportions','light_material','composition_context','contact_and_protection'] },
    component_ids: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: { type: 'string', minLength: 1 } },
    depends_on_ids: { type: 'array', maxItems: 12, uniqueItems: true, items: { type: 'string', minLength: 1 } },
    parent_problem_id: { type: 'string', minLength: 1, description: 'Exact retained Critic problem replaced by this authored decomposition; all its subrequirements must be listed.' },
    correction_kind: { type: 'string', enum: ['missing-object','composition','form','light','material','contact','brief'], description: 'Correction needed by THIS obligation, not by its older compound parent.' },
    status: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
    visible: { type: 'string', minLength: 12, maxLength: 400 },
  }, required: ['id','criterion','component_ids','depends_on_ids','status','visible'] },
} as const;

export function criticObligationNeedsRecheck(row: Obligation, record: any): boolean {
  return (row.operation_id !== record?.id || row.frame_sha256 !== record?.preview?.sha256)
    && row.component_ids.some(id => touchedCriticComponents(record).includes(id));
}
export function touchedCriticComponents(record: any): string[] {
  const args = record?.args ?? {};
  return [...new Set([args.logical_layer?.hypothesis_id,
    args.construction_provenance?.part_id,
    record?.construction_provenance?.part_id]
    .filter((value): value is string => typeof value === 'string' && !!value))];
}

export function criticObligationState(state: any): Obligation[] {
  return Array.isArray(state?.critic_obligations) ? state.critic_obligations : [];
}

export function openCriticObligation(state: any, links: string[] = []): Obligation | undefined {
  const rows = criticObligationState(state);
  const requested = rows.find(row => row.status !== 'pass' && links.includes(row.id))
    ?? rows.find(row => row.status !== 'pass');
  if (requested) {
    const visited = new Set<string>();
    const prerequisite = (row: Obligation): Obligation => {
      if (visited.has(row.id)) return row;
      visited.add(row.id);
      const pending = row.depends_on_ids.map(id => rows.find(parent => parent.id === id))
        .find(parent => parent && parent.status !== 'pass');
      return pending ? prerequisite(pending) : row;
    };
    return prerequisite(requested);
  }
  return undefined;
}

export function validateCriticObligations(rows: unknown, state: any, record: any): void {
  if (rows === undefined) return;
  if (!Array.isArray(rows) || rows.length > 12) throw new Error('critic_obligations_invalid: use up to 12 explicit obligations in the existing critic_review');
  const existing = criticObligationState(state);
  const units = Array.isArray(state?.scene_ownership_plan?.units) ? state.scene_ownership_plan.units : [];
  const knownComponents = new Set<string>(units.flatMap((unit: any) => [unit.semantic_id, unit.owner_id]
    .filter((id: unknown): id is string => typeof id === 'string' && !!id)));
  const seen = new Set<string>();
  const all = new Map<string, Obligation>(existing.map(row => [row.id, row]));
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(row.id)
      || seen.has(row.id) || !['pass','fail','unknown'].includes(row.status)
      || !['brief_fidelity','form_proportions','light_material','composition_context','contact_and_protection'].includes(row.criterion)
      || !Array.isArray(row.component_ids) || !row.component_ids.length
      || !row.component_ids.every((v: any) => typeof v === 'string' && !!v.trim())
      || new Set(row.component_ids).size !== row.component_ids.length
      || !Array.isArray(row.depends_on_ids) || new Set(row.depends_on_ids).size !== row.depends_on_ids.length
      || row.depends_on_ids.some((id: any) => typeof id !== 'string' || !id || id === row.id)
      || typeof row.visible !== 'string' || row.visible.trim().length < 12 || row.visible.length > 400
      || (row.correction_kind !== undefined && !['missing-object','composition','form','light','material','contact','brief'].includes(row.correction_kind))
      || (row.parent_problem_id !== undefined && (typeof row.parent_problem_id !== 'string' || !row.parent_problem_id.trim()))
      || Object.keys(row).some(key => !['id','criterion','component_ids','depends_on_ids','parent_problem_id','correction_kind','status','visible'].includes(key)))
      throw new Error('critic_obligations_invalid: stable id, unique component_ids/dependencies, exact status and 12+ characters of visual evidence required');
    const old = all.get(row.id);
    if (knownComponents.size && row.component_ids.some((id: string) => !knownComponents.has(id)))
      throw new Error(`critic_obligation_component_unmapped: ${row.id} must reference declared semantic component/owner IDs; choose from ${JSON.stringify([...knownComponents])}`);
    if (old && (old.criterion !== row.criterion
      || JSON.stringify(old.component_ids) !== JSON.stringify(row.component_ids)
      || JSON.stringify(old.depends_on_ids) !== JSON.stringify(row.depends_on_ids)
      || (row.parent_problem_id !== undefined && old.parent_problem_id !== undefined && old.parent_problem_id !== row.parent_problem_id)
      || (row.correction_kind !== undefined && old.correction_kind !== undefined && old.correction_kind !== row.correction_kind)))
      throw new Error(`critic_obligation_identity_conflict: ${row.id} cannot change meaning or dependencies; add a new id`);
    seen.add(row.id); all.set(row.id, row);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const walk = (id: string) => {
    if (visiting.has(id)) throw new Error('critic_obligation_dependency_cycle: dependencies cannot be circular');
    if (visited.has(id)) return;
    const row = all.get(id);
    if (!row) throw new Error(`critic_obligation_dependency_missing: ${id} is not declared`);
    visiting.add(id);
    for (const parent of row.depends_on_ids) walk(parent);
    visiting.delete(id); visited.add(id);
  };
  for (const id of all.keys()) walk(id);
  for (const row of rows) if (row.status === 'pass'
    && row.depends_on_ids.some((id: string) => all.get(id)?.status !== 'pass'))
    throw new Error(`critic_obligation_prerequisite_unresolved: ${row.id} cannot pass before ${row.depends_on_ids.join(',')}`);
  for (const old of existing) if (old.status === 'pass' && criticObligationNeedsRecheck(old, record)
    && !seen.has(old.id)) throw new Error(`critic_obligation_recheck_required: ${old.id} was touched; review its current pixels as pass|fail|unknown in the same critic_review`);
}

export function persistCriticObligations(state: any, review: any, record?: any): Obligation[] {
  const prior = criticObligationState(state);
  const merged = new Map<string, Obligation>(prior.map(row => [row.id,
    row.status === 'pass' && record && criticObligationNeedsRecheck(row, record)
      ? { ...row, status: 'unknown', visible: 'Touched after the accepted review; exact current visual recheck required.' }
      : row]));
  for (const row of review?.obligations ?? []) merged.set(row.id, { ...prior.find(previous => previous.id === row.id), ...row,
    operation_id: review.operation_id, frame_sha256: review.frame_sha256 });
  // A reverted prerequisite invalidates any dependent pass until rechecked.
  for (let i = 0; i < merged.size; i++) for (const row of merged.values())
    if (row.status === 'pass' && row.depends_on_ids.some(id => merged.get(id)?.status !== 'pass'))
      merged.set(row.id, { ...row, status: 'unknown', visible: 'Prerequisite changed: dependent obligation needs visual recheck.' });
  return [...merged.values()];
}
