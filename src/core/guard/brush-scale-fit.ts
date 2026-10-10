// working_scale historically accepts descriptive prose; only a canonical token is a restriction.
export const BRUSH_ALLOWED_SCALES = ['global', 'medium', 'small', 'detail', 'local', 'micro'] as const;
export function normalizeBrushAllowedScales(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > BRUSH_ALLOWED_SCALES.length
    || raw.some(value => typeof value !== 'string' || !(BRUSH_ALLOWED_SCALES as readonly string[]).includes(value))) {
    throw new Error('brush_preflight allowed_scales must contain 1-6 scale tokens: ' + BRUSH_ALLOWED_SCALES.join('|'));
  }
  return [...new Set(raw)];
}
export function brushRoleMatchesScale(role: Record<string, unknown>, requested?: string): boolean {
  if (!requested) return true;
  // Explicit typed restrictions take precedence over the legacy description.
  if (role.allowed_scales !== undefined) {
    try { return normalizeBrushAllowedScales(role.allowed_scales)!.includes(requested); }
    catch { return false; }
  }
  const legacy = typeof role.working_scale === 'string' ? role.working_scale.trim().toLowerCase() : '';
  return !(BRUSH_ALLOWED_SCALES as readonly string[]).includes(legacy) || legacy === requested;
}
