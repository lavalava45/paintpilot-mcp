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
      requestedMaterialRole = compatibleMaterials[0];
      normalizations.push({
        code: 'material_role_normalized',
        message: `Derived material_role=${requestedMaterialRole} from the unambiguous durable brush preflight.`,
      });
    }
  }
  if (materialFitnessRequired && !requestedMaterialRole) {
    violations.push({
      scope: 'next_operation',
      code: 'brush_material_role_required',
      message: `substantial ${stage} brush work requires next_pass.material_role so Guard can match the installed/preflighted brush inventory to the requested material instead of choosing a generic first role`,
    });
  }
  if (materialFitnessRequired && brushInventoryScope === 'filtered') {
    violations.push({
      scope: 'next_operation',
      code: 'brush_inventory_scope_insufficient',
      message: 'substantial form/material/detail brush work requires a full installed-inventory or evidence-bound brush-pack preflight; a filtered familiar-preset lookup is insufficient',
    });
  }
  return { requestedMaterialRole, normalizations, violations };
}
