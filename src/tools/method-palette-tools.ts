import { ToolDefinition } from '../core/tool-registry.js';
import {
  PAINTING_IMPACT_CLASSES,
  PAINTING_CONSTRUCTION_ROLES,
  PAINTING_VISUAL_INTENTS,
  paintingMethodCapabilities,
  paintingMethodExecutionContract,
  selectPaintingMethod,
  selectPaintingConstructionMethod,
  type PaintingConstructionRole,
  type PaintingImpactClass,
  type PaintingVisualIntent,
} from '../core/painting-method-palette.js';
import type { ToolRegistry } from '../core/tool-registry.js';
import { EDGE_CLASSES, selectEdgeMethod, type EdgeClass } from '../core/edge-control.js';

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function createMethodPaletteTools(registry: ToolRegistry): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_get_painting_method_capabilities',
        description:
          'Return the executable painting-method capability map derived from tools actually registered in this runtime. Unsupported methods remain explicit instead of being invented.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async () => json({
        ok: true,
        contract: 'visual_intent -> impact_class -> method -> registered runtime tool + required preparation/state -> verification expectation -> fallback',
        capabilities: paintingMethodCapabilities(registry),
      }),
    },
    {
      tool: {
        name: 'photoshop_select_painting_method',
        description:
          'Choose an executable painting method from registered runtime capabilities without contacting or mutating Photoshop. Use photoshop_get_painting_method_capabilities to inspect the full map; use this tool for a specific construction_role or visual_intent plus required impact_class. construction_role takes precedence and derives the intent when both are supplied. Excludes avoid_method_ids, then uses the ordered intent preferences unless a valid preferred_method_id is supplied; an unavailable, avoided or incompatible preference is rejected rather than silently replaced. With edge_class, returns a separate edge_selection and tries preferred_method_id first for that edge choice; incompatible edge preferences are listed as rejected and may fall back. Returns ok=true, selection (selected method, fallbacks and rejected candidates), execution_contract with registered commands/input schemas and fallback_commands. This is planning guidance, not execution or pixel verification; required preparation and state still apply. Missing role/intent or no compatible method returns isError=true with ok=false, code=no_painting_method_available and message.',
        inputSchema: {
          type: 'object',
          properties: {
            construction_role: {
              type: 'string', enum: [...PAINTING_CONSTRUCTION_ROLES],
              description: 'Subject-agnostic construction role. In broad nontrivial construction this classification must precede concrete Photoshop method selection.',
            },
            visual_intent: { type: 'string', enum: [...PAINTING_VISUAL_INTENTS], description: 'Desired visual effect. Required when construction_role is absent; when both are given, the construction role determines the intent.' },
            impact_class: { type: 'string', enum: [...PAINTING_IMPACT_CLASSES], description: 'Required operation-impact category (for example construct, subtract or tone); filters methods compatible with the chosen intent.' },
            avoid_method_ids: { type: 'array', items: { type: 'string' }, description: 'Method ids from the capability map to exclude from main and optional edge selection, including fallback candidates.' },
            stage: {
              type: 'string',
              description: 'Optional painting-stage context passed to method selection. Does not change the durable Guard stage or authorize painting.',
            },
            edge_class: { type: 'string', enum: [...EDGE_CLASSES], description: 'Optional boundary appearance: hard, soft, lost, firm or broken. Adds an independent edge_selection alongside the main construction/intent selection.' },
            preferred_method_id: { type: 'string', description: 'Exact capability-map method id. Without edge_class, requires this method for the main selection and rejects invalid/avoided/incompatible preferences. With edge_class, tries it first only for edge_selection and may fall back, recording the rejection.' },
          },
          required: ['impact_class'],
          additionalProperties: false,
        },
      },
      handler: async (args) => {
        const constructionRole = args.construction_role as PaintingConstructionRole | undefined;
        const visualIntent = args.visual_intent as PaintingVisualIntent | undefined;
        const impactClass = args.impact_class as PaintingImpactClass;
        const avoid = Array.isArray(args.avoid_method_ids)
          ? args.avoid_method_ids.filter((value): value is string => typeof value === 'string')
          : [];
        try {
          if (!constructionRole && !visualIntent) {
            throw new Error('construction_role or visual_intent is required');
          }
          const options = {
            stage: typeof args.stage === 'string' ? args.stage : undefined,
            preferredMethodId: typeof args.preferred_method_id === 'string' && !args.edge_class
              ? args.preferred_method_id : undefined,
          };
          const selection = constructionRole
            ? selectPaintingConstructionMethod(registry, constructionRole, impactClass, avoid, options)
            : selectPaintingMethod(registry, visualIntent!, impactClass, avoid, options);
          const edgeClass = typeof args.edge_class === 'string' ? args.edge_class as EdgeClass : undefined;
          const edgeSelection = edgeClass
            ? selectEdgeMethod(registry, edgeClass, {
                preferredMethodId: typeof args.preferred_method_id === 'string' ? args.preferred_method_id : undefined,
                avoidMethodIds: avoid,
              })
            : undefined;
          return json({ ok: true, selection,
            execution_contract: paintingMethodExecutionContract(registry, selection.selected),
            fallback_commands: selection.fallbacks.map(method => ({
              method_id: method.id,
              allowed_commands: paintingMethodExecutionContract(registry, method).allowed_commands,
            })),
            ...(edgeSelection ? { edge_selection: edgeSelection } : {}) });
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify({
              ok: false,
              code: 'no_painting_method_available',
              message: error instanceof Error ? error.message : String(error),
            }) }],
          };
        }
      },
    },
  ];
}
