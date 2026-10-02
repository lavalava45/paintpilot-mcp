import type { PhotoshopConnection } from '../platform/connection.js';
import { getUxpBridgeReadiness } from '../platform/uxp-bridge-client.js';
import { createAdjustmentTools } from '../tools/adjustment-tools.js';
import { createBrushPackTools } from '../tools/brush-pack-tools.js';
import { createColorAdjustmentTools } from '../tools/color-adjustment-tools.js';
import { createColorSamplingTools } from '../tools/color-sampling-tools.js';
import { createDocumentTools } from '../tools/document-tools.js';
import { createExportTools } from '../tools/export-tools.js';
import { createFilterTools } from '../tools/filter-tools.js';
import { createHistoryTools } from '../tools/history-tools.js';
import { createImagePlacementTools } from '../tools/image-placement-tools.js';
import { createImageTools } from '../tools/image-tools.js';
import { createLayerOrderingTools } from '../tools/layer-ordering-tools.js';
import { createLayerPropertiesTools } from '../tools/layer-properties-tools.js';
import { createLayerTools } from '../tools/layer-tools.js';
import { createLayerTransformTools } from '../tools/layer-transform-tools.js';
import { createMaskTools } from '../tools/mask-tools.js';
import { createMeasurementTools } from '../tools/measurement-tools.js';
import { createMethodPaletteTools } from '../tools/method-palette-tools.js';
import { createNeuralTools } from '../tools/neural-tools.js';
import { createPaintingTools } from '../tools/painting-tools.js';
import { createSelectionTools } from '../tools/selection-tools.js';
import { createSkyReplacementTools } from '../tools/sky-replacement-tools.js';
import { createSmartObjectTools } from '../tools/smart-object-tools.js';
import { createStackTools } from '../tools/stack-tools.js';
import { createStateTools } from '../tools/state-tools.js';
import { createStyleTools } from '../tools/style-tools.js';
import { createTextTools } from '../tools/text-tools.js';
import { createValueCheckTools } from '../tools/value-check-tools.js';
import { createVisualMicroPlanTools } from '../tools/visual-microplan-tools.js';
import { buildPhotoshopPingPayload } from './photoshop-ping.js';
import type { ToolDefinition, ToolRegistry } from './tool-registry.js';

const GET_VERSION_DESCRIPTION = [
  'Return the detected Photoshop version string.',
  'For feature support use photoshop_get_capabilities.',
].join('\n\n');

function createVersionTool(connection: PhotoshopConnection): ToolDefinition {
  return {
    tool: {
      name: 'photoshop_get_version',
      description: GET_VERSION_DESCRIPTION,
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => ({
      content: [{ type: 'text', text: `Photoshop version: ${await connection.getVersion()}` }],
    }),
  };
}

function createBootstrapTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_ping',
        description:
          'Verify Photoshop/UXP readiness and report transport, version, bridge revision, active document and document count. Use for route/bootstrap checks, not every call.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async () => {
        const connected = await connection.ping();
        const readiness = await getUxpBridgeReadiness();
        return {
          content: [{ type: 'text', text: JSON.stringify(buildPhotoshopPingPayload(connected, readiness), null, 2) }],
        };
      },
    },
    createVersionTool(connection),
  ];
}

export function createConnectionToolCatalog(connection: PhotoshopConnection): ToolDefinition[] {
  const groups = [
    createDocumentTools(connection),
    createLayerTools(connection),
    createImageTools(connection),
    createImagePlacementTools(connection),
    createSmartObjectTools(connection),
    createLayerTransformTools(connection),
    createLayerPropertiesTools(connection),
    createFilterTools(connection),
    createAdjustmentTools(connection),
    createTextTools(connection),
    createSelectionTools(connection),
    createMaskTools(connection),
    createHistoryTools(connection),
    createLayerOrderingTools(connection),
    createStateTools(connection),
    createSkyReplacementTools(connection),
    createNeuralTools(connection),
    createStyleTools(connection),
    createColorAdjustmentTools(connection),
    createColorSamplingTools(connection),
    createStackTools(connection),
    createExportTools(connection),
    createPaintingTools(connection),
    createBrushPackTools(connection),
    createMeasurementTools(connection),
  ];
  return [...createBootstrapTools(connection), ...groups.flat()];
}

export function createRegistryToolCatalog(
  registry: ToolRegistry,
  previewBarrierDirectory: string
): ToolDefinition[] {
  return [
    ...createMethodPaletteTools(registry),
    ...createValueCheckTools(registry),
    ...createVisualMicroPlanTools(registry, previewBarrierDirectory),
  ];
}
