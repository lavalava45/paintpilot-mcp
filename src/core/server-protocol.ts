import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { withToolExecutionContext } from './execution-context.js';
import { ExecutionLease } from './execution-lease.js';
import {
  EMBEDDED_GUARD_REQUIRED,
  EmbeddedGuardRuntime,
  describeToolForGuardMode,
  shouldBlockRawTool,
} from './guard/runtime.js';
import {
  normalizeModelFacingToolArgs,
  sanitizeModelFacingToolResult,
} from './model-facing-tool-result.js';
import type { PromptRegistry } from './prompt-registry.js';
import type { ToolDefinition, ToolRegistry } from './tool-registry.js';

const COMPACT_SCHEMA_DESCRIPTION_TOOLS = new Set([
  'photoshop_execute_visual_microplan',
  'photoshop_guard_cycle',
  'photoshop_guard_cycle_auto',
]);

function firstSentence(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.match(/^.*?(?:[.!?](?=\s|$)|$)/)?.[0].trim() ?? compact;
}

function compactSchemaDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactSchemaDescriptions);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      key === 'description' && typeof nested === 'string'
        ? firstSentence(nested)
        : compactSchemaDescriptions(nested),
    ])
  );
}

export function compactToolForPublishedCatalog(
  tool: ToolDefinition['tool']
): ToolDefinition['tool'] {
  return {
    ...tool,
    description: describeToolForGuardMode(tool.name, tool.description),
    inputSchema: COMPACT_SCHEMA_DESCRIPTION_TOOLS.has(tool.name)
      ? compactSchemaDescriptions(tool.inputSchema) as ToolDefinition['tool']['inputSchema']
      : tool.inputSchema,
  };
}

export interface ProtocolRuntime {
  server: Server;
  tools: ToolRegistry;
  prompts: PromptRegistry;
  guard: EmbeddedGuardRuntime;
  lease: ExecutionLease;
}

function busyResult(error: unknown) {
  const payload = {
    ok: false,
    code: 'execution_busy',
    execution: 'not-executed',
    message: error instanceof Error ? error.message : String(error),
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  };
}

function requestDeadline(params: unknown): number | undefined {
  const meta = (params as { _meta?: Record<string, unknown> } | undefined)?._meta;
  const candidate = meta?.photoshop_mcp_deadline_at;
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? Math.floor(candidate)
    : undefined;
}

export function installProtocolHandlers(runtime: ProtocolRuntime): void {
  const { server, tools, prompts, guard, lease } = runtime;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.list().map(compactToolForPublishedCatalog),
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: prompts.list(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const args = (request.params.arguments as Record<string, string>) ?? {};
    return prompts.get(request.params.name, args);
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    if (EMBEDDED_GUARD_REQUIRED && shouldBlockRawTool(name)) {
      return guard.rawMutationBlocked(name);
    }

    let release: (() => void) | undefined;
    if (!name.startsWith('photoshop_guard_')) {
      try {
        release = lease.acquire(name);
      } catch (error) {
        return busyResult(error);
      }
    }

    try {
      const args = normalizeModelFacingToolArgs(
        name,
        (request.params.arguments as Record<string, unknown>) ?? {},
        { guardRequired: EMBEDDED_GUARD_REQUIRED, runtimeDirectory: guard.runtimeDirectory }
      );
      const deadlineAt = requestDeadline(request.params);
      const executionContext = deadlineAt === undefined ? {} : { deadlineAt };
      const result = await withToolExecutionContext(
        executionContext,
        () => tools.execute(name, args)
      );
      return sanitizeModelFacingToolResult(name, result);
    } finally {
      release?.();
    }
  });
}
