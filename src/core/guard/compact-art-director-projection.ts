// @ts-nocheck
// Read-only compact Art Director presentation from already loaded painting state.
// Guard admission, durable task state and Photoshop execution remain in SessionStore.
export function projectCompactArtDirector(doc) {
  return {
    art_director: doc.art_director ? {
      directive_id: doc.art_director.directive_id,
      revision: doc.art_director.revision,
      status: doc.art_director.status,
      goal: doc.art_director.goal,
      style_contract: doc.art_director.style_contract ?? null,
      prompt_conflict_preflight: doc.art_director.prompt_conflict_preflight ?? null,
      strategy_validation_after_microplans: doc.art_director.strategy_validation_after_microplans ?? null,
      strategy_validation: doc.art_director.strategy_validation ?? null,
      assessment: doc.art_director.assessment ?? null,
      artistic_evaluation_contract: doc.art_director.artistic_evaluation_contract ?? null,
      global_brief_assessment: doc.art_director.global_brief_assessment ?? null,
      global_brief_completion_allowed: !!doc.art_director.global_brief_completion_allowed,
      composition_freedom: doc.art_director.composition_freedom ?? null,
      composition_exploration: doc.art_director.composition_exploration ? {
        hypotheses: doc.art_director.composition_exploration.hypotheses ?? [],
        selected_id: doc.art_director.composition_exploration.selected_id ?? null,
        selection_reason: doc.art_director.composition_exploration.selection_reason ?? null,
        material_choice_unresolved: !!doc.art_director.composition_exploration.material_choice_unresolved,
        ...(doc.art_director.composition_exploration.normalized_from_legacy_mode
          ? { normalized_from_legacy_mode: doc.art_director.composition_exploration.normalized_from_legacy_mode }
          : {}),
      } : null,
      brush_pack_scene_plan: doc.art_director.brush_pack_scene_plan ?? null,
      perceptual_hierarchy: doc.art_director.perceptual_hierarchy ?? null,
      priorities: doc.art_director.priorities ?? [],
      current_task_id: doc.art_director.current_task_id ?? null,
      review_after_microplans: doc.art_director.review_after_microplans,
      completed_microplans: doc.art_director.completed_microplans ?? 0,
      task_review_after_microplans: doc.art_director.task_review_after_microplans ?? null,
      task_successful_microplans: doc.art_director.task_successful_microplans ?? 0,
      task_autonomy_remaining: doc.art_director.task_autonomy_remaining ?? null,
      review_due: !!doc.art_director.review_due,
      review_reason: doc.art_director.review_reason ?? null,
      interrupt: doc.art_director.interrupt ?? null,
      physical_stack_check: doc.physical_stack_check ?? doc.art_director.physical_stack_check ?? null,
      value_check: doc.art_director.value_check ?? null,
      refinement_check: doc.art_director.refinement_check ?? null,
      last_stage_reset: doc.art_director.last_stage_reset ?? null,
      incomplete_hypothesis: doc.art_director.incomplete_hypothesis ?? null,
      last_incomplete_hypothesis_resolution: doc.art_director.last_incomplete_hypothesis_resolution ?? null,
      whole_image_glance: doc.art_director.whole_image_glance ?? {
        due: false,
        reason: null,
        last_record: null,
        history: [],
      },
      tasks: (doc.art_director.tasks ?? []).map(task => ({
        task_id: task.task_id,
        summary: task.summary,
        status: task.status,
        successful_microplans: task.successful_microplans ?? 0,
        region: task.region ?? null,
        allowed_scales: task.allowed_scales ?? [],
        allowed_global_changes: task.allowed_global_changes ?? [],
        ...(task.correction_target ? { correction_target: structuredClone(task.correction_target) } : {}),
        ...(Array.isArray(task.perceptual_zone_ids) && task.perceptual_zone_ids.length
          ? { perceptual_zone_ids: task.perceptual_zone_ids }
          : {}),
        ...(Array.isArray(task.affected_relations) && task.affected_relations.length
          ? { affected_relations: task.affected_relations }
          : {}),
        ...(Array.isArray(task.affected_qualities) && task.affected_qualities.length
          ? { affected_qualities: task.affected_qualities }
          : {}),
      })),
    } : null,
  };
}
