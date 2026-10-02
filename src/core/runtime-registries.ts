import type {
  CallToolResult,
  GetPromptResult,
  Prompt,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { PromptDefinition } from '../prompts/guide-contract.js';
import { Logger } from '../utils/logger.js';
import { DefinitionStore } from './definition-store.js';

export type ToolResult = CallToolResult;
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
export type PromptHandler = (
  args: Record<string, string>
) => Promise<GetPromptResult> | GetPromptResult;

export interface ToolDefinition {
  tool: Tool;
  handler: ToolHandler;
}

abstract class NamedDefinitions<T> {
  protected readonly store = new DefinitionStore<T>();

  protected constructor(
    private readonly kind: string,
    protected readonly log: Logger
  ) {}

  protected put(name: string, definition: T): void {
    const replaced = this.store.put(name, definition);
    if (replaced) this.log.warn(`${this.kind} '${name}' already registered, overwriting`);
    else this.log.debug(`Registered ${this.kind.toLowerCase()}: ${name}`);
  }

  has(name: string): boolean {
    return this.store.contains(name);
  }

  count(): number {
    return this.store.size;
  }
}

export class ToolRegistry extends NamedDefinitions<ToolDefinition> {
  constructor(log = new Logger('ToolRegistry')) {
    super('Tool', log);
  }

  register(name: string, definition: ToolDefinition): void {
    this.put(name, definition);
  }

  unregister(name: string): boolean {
    const removed = this.store.remove(name);
    if (removed) this.log.debug(`Unregistered tool: ${name}`);
    return removed;
  }

  get(name: string): ToolDefinition | undefined {
    return this.store.find(name);
  }

  list(): Tool[] {
    return this.store.values().map((definition) => definition.tool);
  }

  clear(): void {
    if (this.store.reset()) this.log.debug('All tools cleared');
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const definition = this.store.find(name);
    if (definition === undefined) throw new Error(`Tool not found: ${name}`);
    this.log.debug(`Executing tool: ${name}`);
    try {
      return await definition.handler(args);
    } catch (error) {
      this.log.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  }
}

export class PromptRegistry extends NamedDefinitions<PromptDefinition> {
  constructor(log = new Logger('PromptRegistry')) {
    super('Prompt', log);
  }

  register(name: string, definition: PromptDefinition): void {
    this.put(name, definition);
  }

  list(): Prompt[] {
    return this.store.values().map((definition) => definition.prompt);
  }

  async get(name: string, args: Record<string, string>): Promise<GetPromptResult> {
    const definition = this.store.find(name);
    if (definition === undefined) throw new Error(`Prompt not found: ${name}`);
    this.log.debug(`Resolving prompt: ${name}`);
    return definition.handler(args);
  }
}

export type { PromptDefinition };
