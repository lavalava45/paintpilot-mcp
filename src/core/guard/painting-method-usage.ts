import { canonicalPaintingStage } from '../painting-stage-policy.js';

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Report durable visual-operation telemetry without owning SessionStore's
// problem-identity policy. That policy is supplied by the existing caller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function summarizePaintingMethodUsage(records: any[], documentId: number, problemIdentity: (record: any) => string | undefined) {
  const completed = records.filter(record =>
    record
    && record.phase === 'completed'
    && record.visual === true
    && record.tool === 'photoshop_execute_visual_microplan'
    && record.args?.document_id === documentId
  );
  const increment = (target: Record<string, number>, key: string | undefined) => {
    if (!key) return;
    target[key] = (target[key] ?? 0) + 1;
  };
  const toolUsage: Record<string, number> = {};
  const methodClassUsage: Record<string, number> = {};
  const methodIdUsage: Record<string, number> = {};
  const brushRoleUsage: Record<string, number> = {};
  const brushPresetUsage: Record<string, number> = {};
  const stageUsage: Record<string, number> = {};
  const problemUsage: Record<string, number> = {};
  const outcomeUsage: Record<string, number> = {};
  let mutationOperations = 0;
  for (const record of completed) {
    const micro = record.args && typeof record.args === 'object' && !Array.isArray(record.args)
      ? record.args : {};
    const steps: Array<{ tool?: unknown; method_id?: unknown }> = Array.isArray(micro.steps) ? micro.steps : [];
    const mutationSteps = steps.filter(step => step?.tool && step.tool !== 'photoshop_get_preview');
    if (mutationSteps.length) mutationOperations += 1;
    for (const step of mutationSteps) {
      increment(toolUsage, textOrUndefined(step.tool));
      increment(methodIdUsage, textOrUndefined(step.method_id));
    }
    increment(methodClassUsage, textOrUndefined(micro.method_class)?.toLowerCase());
    increment(brushRoleUsage, textOrUndefined(micro.paint_strategy?.brush_role));
    increment(brushPresetUsage, textOrUndefined(micro.paint_strategy?.preset_name));
    increment(stageUsage, canonicalPaintingStage(micro.stage) ?? textOrUndefined(micro.stage));
    increment(problemUsage, problemIdentity(record));
    const outcome = record.rolled_back === true
      ? 'rolled-back'
      : record.failed === true
        ? 'failed'
        : record.verdict?.disposition === 'accept'
          ? 'accepted'
          : record.verdict?.disposition === 'rollback'
            ? 'rollback-required'
            : record.verdict ? 'reviewed-other' : 'unreviewed';
    increment(outcomeUsage, outcome);
  }
  const sorted = (source: Record<string, number>) => Object.fromEntries(
    Object.entries(source).sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
  );
  return {
    visual_microplan_operations: completed.length,
    mutation_operations: mutationOperations,
    distinct_tools_used: Object.keys(toolUsage).length,
    distinct_method_classes_used: Object.keys(methodClassUsage).length,
    distinct_method_ids_used: Object.keys(methodIdUsage).length,
    distinct_brush_roles_used: Object.keys(brushRoleUsage).length,
    distinct_brush_presets_used: Object.keys(brushPresetUsage).length,
    tool_usage: sorted(toolUsage),
    method_class_usage: sorted(methodClassUsage),
    method_id_usage: sorted(methodIdUsage),
    brush_role_usage: sorted(brushRoleUsage),
    brush_preset_usage: sorted(brushPresetUsage),
    stage_usage: sorted(stageUsage),
    problem_usage: sorted(problemUsage),
    outcome_usage: sorted(outcomeUsage),
  };
}
