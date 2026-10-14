import { createHash } from 'node:crypto';

/** Artistic suitability is not the same as installed preset / scale / material authority. */
export function brushUseKey(role: any, material: string, intent: string, scale: string, preset: string, packId?: string): string {
  const evidence = (role?.candidate_evidence ?? []).find((item: any) => item.preset_name === preset);
  return createHash('sha256').update(JSON.stringify({
    role: role?.role_id, material, intent, scale, preset, packId: packId ?? null,
    profile: evidence?.profile_id ?? role?.profile_id ?? null,
    pressure: evidence?.pressure_policy ?? role?.pressure_policy,
    settings: evidence?.effective_settings ?? role?.effective_settings,
  })).digest('hex');
}

export function boundedBrushTrial(strategy: any, steps: any[], scale: string): string | undefined {
  const bounds = strategy?.brush_trial_bounds;
  if (!bounds || !['medium', 'small'].includes(scale))
    return 'Provide paint_strategy.brush_trial_bounds for one medium/small bounded trial (max 128px per side), not a full-scene paint.';
  const { left, top, right, bottom } = bounds;
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top
    || right - left > 128 || bottom - top > 128) return 'brush_trial_bounds must be a positive rectangle no more than 128 × 128 source pixels.';
  const trialTools = new Set(['photoshop_paint_strokes', 'photoshop_paint_dabs']);
  // Callers supply the visual-mutation steps, not preparation or preview steps.
  // Checking only a few known alternatives let mixed passes (e.g. strokes plus
  // fill_layer/gradient) gain a brush-fitness approval for unbounded mutations.
  if (!steps.length || steps.some(step => !trialTools.has(step.tool)))
    return 'New brush-purpose trial must contain only bounded strokes/dabs; do not authorize other visual mutation tools.';
  const painting = steps;
  for (const step of painting) {
    const marks = step.tool === 'photoshop_paint_strokes' ? step.args?.strokes : step.args?.dabs;
    if (!Array.isArray(marks) || !marks.length) return 'Trial strokes/dabs are required.';
    for (const mark of marks) {
      const points = step.tool === 'photoshop_paint_strokes' ? mark.points : [mark];
      const radius = Number(mark.size ?? step.args?.size) / 2;
      if (!Number.isFinite(radius) || radius <= 0 || !Array.isArray(points) || !points.length
        || points.some((point: any) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
          || point.x - radius < left || point.x + radius > right
          || point.y - radius < top || point.y + radius > bottom))
        return 'All trial marks, including brush radii, must remain inside brush_trial_bounds.';
    }
  }
  return undefined;
}
