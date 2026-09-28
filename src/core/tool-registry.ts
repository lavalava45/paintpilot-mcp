import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';

export type ToolResult = CallToolResult;
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface ToolDefinition {
  tool: Tool;
  handler: ToolHandler;
}

export class ToolRegistry {
  private readonly entries = new Map<string, ToolDefinition>();
  private readonly log = new Logger('ToolRegistry');

  register(name: string, definition: ToolDefinition): void {
    const replacing = this.entries.has(name);
    this.entries.set(name, definition);
    if (replacing) this.log.warn(`Tool '${name}' already registered, overwriting`);
    else this.log.debug(`Registered tool: ${name}`);
  }

  unregister(name: string): boolean {
    const removed = this.entries.delete(name);
    if (removed) this.log.debug(`Unregistered tool: ${name}`);
    return removed;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.entries.get(name);
  }

  list(): Tool[] {
    return [...this.entries.values()].map(({ tool }) => tool);
  }

  count(): number {
    return this.entries.size;
  }

  clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.log.debug('All tools cleared');
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const definition = this.entries.get(name);
    if (!definition) throw new Error(`Tool not found: ${name}`);

    this.log.debug(`Executing tool: ${name}`);
    try {
      return await definition.handler(args);
    } catch (error) {
      this.log.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  }
}
