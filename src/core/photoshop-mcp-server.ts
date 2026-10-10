import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wrapToolHandler } from '../errors/envelope.js';
import { ensureUxpBridgeServer, subscribeUxpBridgeEvents } from '../platform/uxp-bridge-server.js';
import { buildPhotoshopInstructions } from '../prompts/instructions.js';
import { registerPhotoshopPrompts } from '../prompts/registry.js';
import { createGuardTools } from '../tools/guard-tools.js';
import { Logger } from '../utils/logger.js';
import { withOptionalDocumentId, wrapDocumentIdHandler } from './document-target.js';
import { ExecutionLease } from './execution-lease.js';
import { EmbeddedGuardRuntime } from './guard/runtime.js';
import { PromptRegistry } from './prompt-registry.js';
import {
  createConnectionToolCatalog,
  createRegistryToolCatalog,
} from './server-tool-catalog.js';
import { installProtocolHandlers } from './server-protocol.js';
import { Session } from './session.js';
import { ToolRegistry, type ToolDefinition } from './tool-registry.js';

export interface PhotoshopMCPServerOptions {
  serverVersion: string;
}

function runtimePath(relative: string): string {
  return fileURLToPath(new URL(`../../.photoshop-runtime/${relative}`, import.meta.url));
}

export class PhotoshopMCPServer {
  private readonly log = new Logger('PhotoshopMCPServer');
  private readonly tools = new ToolRegistry();
  private readonly prompts = new PromptRegistry();
  private readonly session = new Session();
  private readonly lease = new ExecutionLease(runtimePath('execution.lock'));
  private readonly server: Server;
  private readonly guard: EmbeddedGuardRuntime;
  private uxpEventUnsubscribe?: () => void;

  constructor(options: PhotoshopMCPServerOptions) {
    this.server = new Server(
      { name: 'photoshop-mcp-digital-painting', version: options.serverVersion },
      {
        capabilities: { tools: {}, prompts: {} },
        instructions: buildPhotoshopInstructions(),
      }
    );

    registerPhotoshopPrompts(this.prompts);
    this.guard = this.installRuntimeCatalog();
    installProtocolHandlers({
      server: this.server,
      tools: this.tools,
      prompts: this.prompts,
      guard: this.guard,
      lease: this.lease,
    });
  }

  async start(): Promise<void> {
    await this.session.initialize();
    await this.server.connect(new StdioServerTransport());
    this.log.info('MCP Server connected via stdio');
  }

  async stop(): Promise<void> {
    this.uxpEventUnsubscribe?.();
    this.uxpEventUnsubscribe = undefined;
    await this.session.disconnect();
    this.log.info('MCP Server stopped');
  }

  private installRuntimeCatalog(): EmbeddedGuardRuntime {
    const connection = this.session.getConnection();
    void ensureUxpBridgeServer().catch((error) => {
      this.log.debug('UXP bridge server not started:', error);
    });

    this.install(createConnectionToolCatalog(connection));

    const previewBarrierDirectory = process.env.PHOTOSHOP_PREVIEW_BARRIER_DIR?.trim()
      || runtimePath('preview-barriers/');
    this.install(createRegistryToolCatalog(this.tools, previewBarrierDirectory));

    const guard = new EmbeddedGuardRuntime(this.tools, {
      previewBarrierDirectory,
      executionLeaseFile: runtimePath('execution.lock'),
    });
    // Reapply the standard public handler wrappers to the Guard-bound analyzer.
    this.install([this.tools.get('photoshop_analyze_value_structure')!]);
    guard.ensureRuntimeDirectories();
    this.uxpEventUnsubscribe = subscribeUxpBridgeEvents(async (event) => {
      await guard.handleUxpBridgeEvent(event);
    });
    this.install(createGuardTools(guard));

    this.log.info(`Registered ${this.tools.count()} tools and ${this.prompts.count()} prompts`);
    return guard;
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

}
