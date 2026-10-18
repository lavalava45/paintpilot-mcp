import type { ToolRegistry } from '../tool-registry.js';
import { paintingMethodCapabilities } from '../painting-method-palette.js';
import { guardExecutionClass } from './execution-policy.js';

/**
 * The painting-method palette is NOT a registry of every Photoshop mutation.
 * Native layer management, preparation and other operations not represented by the palette
 * cannot satisfy a paint-method selection constraint. The operation's own
 * registered schema, scene/owner/document policy and Guard preflight still
 * apply exactly as before.
 *
 * Fail closed for unknown, retired, forbidden and unregistered tool names:
 * absence from the palette by itself does not authorize their execution.
 */
export function directMethodApplicability(
  registry: ToolRegistry,
  tool: string,
): 'painting-method' | 'native-nonpainting' | 'unverified-tool' {
  const executionClass = guardExecutionClass(tool);
  if (!registry.has(tool) || executionClass === 'retired' || executionClass === 'forbidden')
    return 'unverified-tool';
  const represented = paintingMethodCapabilities(registry).some(method =>
    (method.executionTools?.length ? method.executionTools
      : method.primaryTool ? [method.primaryTool] : []).includes(tool));
  return represented ? 'painting-method' : 'native-nonpainting';
}
