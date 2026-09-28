import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { PromptRegistry } from '../src/core/prompt-registry.js';
import { Session } from '../src/core/session.js';
import { ToolRegistry, type ToolDefinition } from '../src/core/tool-registry.js';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import { Logger, LogLevel } from '../src/utils/logger.js';

function tool(name: string, value: string): ToolDefinition {
  return {
    tool: { name, inputSchema: { type: 'object', properties: {} } },
    handler: async () => ({ content: [{ type: 'text', text: value }] }),
  };
}

function promptResult(text: string): GetPromptResult {
  return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('project-owned MCP bootstrap substrate', () => {
  it('keeps ToolRegistry replacement, lookup, execution and removal semantics', async () => {
    const registry = new ToolRegistry();
    registry.register('demo', tool('demo', 'first'));
    registry.register('demo', tool('demo', 'second'));

    expect(registry.count()).toBe(1);
    expect(registry.has('demo')).toBe(true);
    expect(registry.list().map((item) => item.name)).toEqual(['demo']);
    await expect(registry.execute('demo', {})).resolves.toMatchObject({
      content: [{ type: 'text', text: 'second' }],
    });
    await expect(registry.execute('missing', {})).rejects.toThrow('Tool not found: missing');
    expect(registry.unregister('demo')).toBe(true);
    expect(registry.count()).toBe(0);
  });

  it('keeps PromptRegistry replacement, listing and resolution semantics', async () => {
    const registry = new PromptRegistry();
    registry.register('guide', {
      prompt: { name: 'guide', description: 'old' },
      handler: () => promptResult('old'),
    });
    registry.register('guide', {
      prompt: { name: 'guide', description: 'new' },
      handler: () => promptResult('new'),
    });

    expect(registry.count()).toBe(1);
    expect(registry.has('guide')).toBe(true);
    expect(registry.list()).toEqual([{ name: 'guide', description: 'new' }]);
    await expect(registry.get('guide', {})).resolves.toEqual(promptResult('new'));
    await expect(registry.get('missing', {})).rejects.toThrow('Prompt not found: missing');
  });

  it('keeps Session connection state bounded to the injected Photoshop connection', async () => {
    const ping = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const connection = { ping } as unknown as PhotoshopConnection;
    const session = new Session(connection);

    expect(session.getConnection()).toBe(connection);
    expect(session.getConnectionStatus()).toBe(false);
    await expect(session.connect()).resolves.toBe(true);
    expect(session.getConnectionStatus()).toBe(true);
    await expect(session.connect()).resolves.toBe(false);
    expect(session.getConnectionStatus()).toBe(false);
    await session.disconnect();
    expect(session.getConnectionStatus()).toBe(false);
  });

  it('writes protocol-safe logs only to stderr and honors the configured threshold', () => {
    const previous = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      const logger = new Logger('BootstrapTest', LogLevel.WARN);
      logger.info('hidden');
      logger.warn('visible', { reason: 'contract' });
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(String(stderr.mock.calls[0]?.[0])).toContain('[WARN] [BootstrapTest] visible {"reason":"contract"}');
    } finally {
      if (previous === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previous;
    }
  });
});
