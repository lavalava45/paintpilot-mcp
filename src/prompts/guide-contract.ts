import type { GetPromptResult, PromptArgument } from '@modelcontextprotocol/sdk/types.js';

export interface PhotoshopPromptTemplate {
  name: string;
  description: string;
  arguments: PromptArgument[];
  handler: (args: Record<string, string>) => GetPromptResult;
}

export interface PromptDefinition {
  prompt: { name: string; description?: string; arguments?: PromptArgument[] };
  handler: (args: Record<string, string>) => GetPromptResult;
}

export function defineGuideTemplate(
  name: string,
  description: string,
  argumentsList: PromptArgument[],
  handler: PhotoshopPromptTemplate['handler']
): PhotoshopPromptTemplate {
  return { name, description, arguments: argumentsList, handler };
}

export function readTextArg(args: Record<string, string>, name: string, fallback: string): string {
  const value = args[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function readIntegerArg(args: Record<string, string>, name: string, fallback: number): number {
  const value = args[name];
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readChoiceArg<T extends string>(args: Record<string, string>, name: string, choices: readonly T[], fallback: T): T {
  const candidate = typeof args[name] === 'string' ? args[name].trim().toLowerCase() : '';
  return choices.find((choice) => choice.toLowerCase() === candidate) ?? fallback;
}

export function makeGuideResult(summary: string, body: string | string[]): GetPromptResult {
  const text = Array.isArray(body) ? body.join('\n') : body;
  return { description: summary, messages: [{ role: 'user', content: { type: 'text', text } }] };
}

export function toPromptDefinition(template: PhotoshopPromptTemplate): PromptDefinition {
  return {
    prompt: { name: template.name, description: template.description, arguments: template.arguments },
    handler: template.handler,
  };
}
