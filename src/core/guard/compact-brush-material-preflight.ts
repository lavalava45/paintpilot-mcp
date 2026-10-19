import { brushRoleMatchesScale } from './brush-scale-fit.js';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Pure, ordered material-preflight admission for substantial brush work.
 * The compiler owns stage classification, brush selection, and dispatch.
 * Never guess a material from an ambiguous or scale-incompatible inventory.
 */
export function resolveCompactBrushMaterialPreflight(input: {
  materialFitnessRequired: boolean;
  requestedMaterialRole?: string;
  explicitBrushRole?: string;
  requestedBrushScale?: string;
  visualIntent?: string;
  stage?: string;
  brushInventoryScope?: string | null;
  roles: Array<Record<string, unknown>>;
}): {
  requestedMaterialRole?: string;
  normalizations: Array<{ code: string; message: string }>;
  violations: GuardCycleCompileViolation[];
} {
  const { materialFitnessRequired, explicitBrushRole, requestedBrushScale, visualIntent, stage, brushInventoryScope, roles } = input;
  let requestedMaterialRole = input.requestedMaterialRole;
  const normalizations: Array<{ code: string; message: string }> = [];
  const violations: GuardCycleCompileViolation[] = [];

  if (materialFitnessRequired && !requestedMaterialRole) {
    const compatibleRoles = roles.filter(role => {
      const roleId = text(role.role_id);
      const intents = Array.isArray(role.visual_intents)
        ? role.visual_intents.map(value => text(value)?.toLowerCase()).filter(Boolean)
        : [];
      return (!explicitBrushRole || roleId === explicitBrushRole)
        && brushRoleMatchesScale(role, requestedBrushScale)
        && (!!explicitBrushRole || !visualIntent || intents.includes(visualIntent.toLowerCase()));
    });
    const compatibleMaterials = [...new Set(compatibleRoles.flatMap(role =>
      Array.isArray(role.material_roles) ? role.material_roles.map(text).filter(Boolean) as string[] : []
    ))];
    const everyCompatibleRoleIsSingleMaterial = compatibleRoles.length > 0
      && compatibleRoles.every(role => {
        const materials = Array.isArray(role.material_roles)
          ? [...new Set(role.material_roles.map(text).filter(Boolean))]
          : [];
        return materials.length === 1 && materials[0] === compatibleMaterials[0];
      });
    if (compatibleMaterials.length === 1 && everyCompatibleRoleIsSingleMaterial) {
      normalizations.push({
        code: 'material_role_suggested',
        message: `Optional artistic material_role suggestion: ${compatibleMaterials[0]}. Authored intent is unchanged.`,
      });
    }
  }
  // A filtered inventory and missing material classification affect quality of
  // recommendations, not the safety of an explicitly valid Photoshop command.
  void stage;
  void brushInventoryScope;
  return { requestedMaterialRole, normalizations, violations };
}
