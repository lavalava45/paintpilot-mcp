// @ts-nocheck
// Read-only compact Brush Preflight display projection from an existing document state.
// Brush verification, admission and persistence remain in SessionStore.
export function projectCompactBrushPreflight(doc) {
  return {
    brush_preflight: doc.brush_preflight ? {
      completed: !!doc.brush_preflight.completed,
      inventory_observed: !!doc.brush_preflight.inventory_observed,
      inventory_total: doc.brush_preflight.inventory_total ?? null,
      inventory_scope: doc.brush_preflight.inventory_scope ?? null,
      brush_pack_id: doc.brush_preflight.brush_pack_id ?? null,
      roles: (doc.brush_preflight.roles ?? []).map(role => ({
        role_id: role.role_id,
        preferred_preset: role.preferred_preset,
        material_roles: role.material_roles ?? [],
        visual_intents: role.visual_intents ?? [],
        pressure_policy: role.pressure_policy,
        probe_status: role.probe_status,
        profile_id: role.profile_id ?? null,
      })),
    } : null,
  };
}
