import type { GetPromptResult, Prompt } from '@modelcontextprotocol/sdk/types.js';
import type { PromptDefinition } from '../prompts/guide-contract.js';
import { Logger } from '../utils/logger.js';

export type { PromptDefinition };
export type PromptHandler = (args: Record<string, string>) => Promise<GetPromptResult> | GetPromptResult;

export class PromptRegistry {
  private readonly entries = new Map<string, PromptDefinition>();
  private readonly log = new Logger('PromptRegistry');

  register(name: string, definition: PromptDefinition): void {
    const replacing = this.entries.has(name);
    this.entries.set(name, definition);
    if (replacing) this.log.warn(`Prompt '${name}' already registered, overwriting`);
    else this.log.debug(`Registered prompt: ${name}`);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  list(): Prompt[] {
    return [...this.entries.values()].map(({ prompt }) => prompt);
  }

  count(): number {
    return this.entries.size;
  }

  async get(name: string, args: Record<string, string>): Promise<GetPromptResult> {
    const definition = this.entries.get(name);
    if (!definition) throw new Error(`Prompt not found: ${name}`);
    this.log.debug(`Resolving prompt: ${name}`);
    return definition.handler(args);
  }
}
