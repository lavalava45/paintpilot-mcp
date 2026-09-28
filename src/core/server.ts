import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { wrapToolHandler } from '../errors/envelope.js';
import { ensureUxpBridgeServer } from '../platform/uxp-bridge-server.js';
import { buildPhotoshopInstructions } from '../prompts/instructions.js';
import { registerPhotoshopPrompts } from '../prompts/registry.js';
import { createGuardTools } from '../tools/guard-tools.js';
import { Logger } from '../utils/logger.js';
import { withOptionalDocumentId, wrapDocumentIdHandler } from './document-target.js';
import { ExecutionLease } from './execution-lease.js';
import { withToolExecutionContext } from './execution-context.js';
import {
  EMBEDDED_GUARD_REQUIRED,
  EmbeddedGuardRuntime,
  describeToolForGuardMode,
  shouldBlockRawTool,
} from './guard/runtime.js';
import { PromptRegistry } from './prompt-registry.js';
import {
  createConnectionToolCatalog,
  createRegistryToolCatalog,
} from './server-tool-catalog.js';
import { Session } from './session.js';
import { ToolRegistry, type ToolDefinition } from './tool-registry.js';

export interface PhotoshopMCPServerOptions {
  serverVersion: string;
}

function runtimePath(relative: string): string {
  return fileURLToPath(new URL(`../../.photoshop-runtime/${relative}`, import.meta.url));
}

function executionBusy(error: unknown) {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ok: false,
        code: 'execution_busy',
        execution: 'not-executed',
        message: error instanceof Error ? error.message : String(error),
      }),
    }],
  };
}

export class PhotoshopMCPServer {
  private readonly log = new Logger('PhotoshopMCPServer');
  private readonly tools = new ToolRegistry();
  private readonly prompts = new PromptRegistry();
  private readonly session = new Session();
  private readonly lease = new ExecutionLease(runtimePath('execution.lock'));
  private readonly server: Server;
  private guard: EmbeddedGuardRuntime | undefined;

  constructor(options: PhotoshopMCPServerOptions) {
    this.server = new Server(
      { name: 'photoshop-mcp-digital-painting', version: options.serverVersion },
      {
        capabilities: { tools: {}, prompts: {} },
        instructions: buildPhotoshopInstructions(),
      }
    );

    registerPhotoshopPrompts(this.prompts);
    this.installRuntimeCatalog();
    this.bindProtocolHandlers();
  }

  async start(): Promise<void> {
    await this.session.initialize();
    await this.server.connect(new StdioServerTransport());
    this.log.info('MCP Server connected via stdio');
  }

  async stop(): Promise<void> {
    await this.session.disconnect();
    this.log.info('MCP Server stopped');
  }

  private installRuntimeCatalog(): void {
    const connection = this.session.getConnection();
    void ensureUxpBridgeServer().catch((error) => {
      this.log.debug('UXP bridge server not started:', error);
    });

    this.install(createConnectionToolCatalog(connection));

    const previewBarrierDirectory = process.env.PHOTOSHOP_PREVIEW_BARRIER_DIR?.trim()
      || runtimePath('preview-barriers/');
    this.install(createRegistryToolCatalog(this.tools, previewBarrierDirectory));

    this.guard = new EmbeddedGuardRuntime(this.tools, {
      previewBarrierDirectory,
      executionLeaseFile: runtimePath('execution.lock'),
    });
    this.guard.ensureRuntimeDirectories();
    this.install(createGuardTools(this.guard));

    this.log.info(`Registered ${this.tools.count()} tools and ${this.prompts.count()} prompts`);
  }

  private install(definitions: ToolDefinition[]): void {
    for (const definition of definitions) {
      const tool = withOptionalDocumentId(definition.tool);
      const handler = wrapDocumentIdHandler(tool.name, definition.handler);
      this.tools.register(tool.name, {
        tool,
        handler: wrapToolHandler(tool.name, handler),
      });
    }
  }

  private bindProtocolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools.list().map((tool) => ({
        ...tool,
        description: describeToolForGuardMode(tool.name, tool.description),
      })),
    }));
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: this.prompts.list() }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const args = (request.params.arguments as Record<string, string>) ?? {};
      return this.prompts.get(request.params.name, args);
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      if (EMBEDDED_GUARD_REQUIRED && shouldBlockRawTool(name) && this.guard) {
        return this.guard.rawMutationBlocked(name);
      }

      const isGuardTool = name.startsWith('photoshop_guard_');
      let release: (() => void) | undefined;
      if (!isGuardTool) {
        try {
          release = this.lease.acquire(name);
        } catch (error) {
          return executionBusy(error);
        }
      }

      try {
        const args = (request.params.arguments as Record<string, unknown>) ?? {};
        const meta = (request.params as unknown as { _meta?: Record<string, unknown> })._meta;
        const rawDeadline = meta?.photoshop_mcp_deadline_at;
        const deadlineAt = typeof rawDeadline === 'number' && Number.isFinite(rawDeadline)
          ? Math.floor(rawDeadline)
          : undefined;
        return await withToolExecutionContext(
          deadlineAt === undefined ? {} : { deadlineAt },
          () => this.tools.execute(name, args)
        );
      } finally {
        release?.();
      }
    });
  }
}
