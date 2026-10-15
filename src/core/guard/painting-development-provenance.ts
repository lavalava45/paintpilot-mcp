import { canonicalPaintingStage, paintingStageRank } from '../painting-stage-policy.js';

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Historical, accepted visual operations provide evidence of material
// development; an attempted or unreviewed brush pass does not.
// Retain the SessionStore export's untyped argument contract during extraction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function paintingDevelopmentProvenance(records: any[], documentId: any, currentFrameOperationId?: any) {
  const currentRecord = currentFrameOperationId
    ? records.find(record => record?.id === currentFrameOperationId)
    : undefined;
  const sequenceCeiling = Number.isSafeInteger(currentRecord?.sequence)
    ? Number(currentRecord.sequence)
    : Number.MAX_SAFE_INTEGER;
  let regionConstructionOperations = 0;
  let postBlockinMarkmakingOperations = 0;
  const postBlockinMarkmakingTools = new Set<string>();
  const blockInRegionStages = new Set([
    'RECOGNITION_BLOCK_IN',
    'GLOBAL_BLOCK_IN',
    'COMPOSITION',
    'SHAPE',
  ]);

  for (const record of records) {
    if (!record || record.phase !== 'completed' || record.failed || !record.visual) continue;
    if (record.args?.document_id !== documentId) continue;
    if (Number.isSafeInteger(record.sequence) && Number(record.sequence) > sequenceCeiling) continue;
    const executionChanged = record.verdict?.artistic_value?.execution_changed === true;
    const accepted = record.verdict?.disposition === 'accept';
    if (!executionChanged || !accepted) continue;
    if (record.tool !== 'photoshop_execute_visual_microplan') continue;
    const micro = record.args && typeof record.args === 'object' && !Array.isArray(record.args)
      ? record.args
      : {};
    const steps: Array<{ tool?: unknown }> = Array.isArray(micro.steps) ? micro.steps : [];
    const mutationTools = steps
      .map(step => textOrUndefined(step?.tool))
      .filter((tool): tool is string => !!tool && tool !== 'photoshop_get_preview');
    const stage = canonicalPaintingStage(micro.stage);
    const actionClass = textOrUndefined(micro.action_class)?.toUpperCase() ?? 'ADD';
    if (
      mutationTools.includes('photoshop_paint_regions')
      && actionClass === 'ADD'
      && blockInRegionStages.has(stage ?? '')
    ) {
      regionConstructionOperations += 1;
    }

    const stageRank = paintingStageRank(stage);
    if (stageRank === undefined || stageRank < 4) continue;
    const expressiveTools = new Set([
      'photoshop_paint_strokes',
      'photoshop_paint_dabs',
      'photoshop_paint_stamp_instances',
    ]);
    const used = mutationTools.filter(tool => expressiveTools.has(tool));
    if (used.length) {
      postBlockinMarkmakingOperations += 1;
      for (const tool of used) postBlockinMarkmakingTools.add(tool);
    }
  }

  return {
    region_construction_operations: regionConstructionOperations,
    post_blockin_markmaking_operations: postBlockinMarkmakingOperations,
    post_blockin_markmaking_tools: [...postBlockinMarkmakingTools].sort(),
    blockin_primitive_dominance: regionConstructionOperations >= 2 && postBlockinMarkmakingOperations === 0,
  };
}
