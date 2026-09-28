#!/usr/bin/env node

import { getAppVersion } from './core/app-version.js';
import { PhotoshopMCPServer } from './core/server.js';
import { Logger } from './utils/logger.js';

const log = new Logger('Main');
const runtime: { server?: PhotoshopMCPServer; closing: boolean } = { closing: false };

async function boot(): Promise<void> {
  log.info('Starting Photoshop MCP Server...');
  try {
    const server = new PhotoshopMCPServer({ serverVersion: getAppVersion() });
    runtime.server = server;
    await server.start();
    log.info('Photoshop MCP Server is running');
  } catch (error) {
    log.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(reason: string): Promise<void> {
  if (runtime.closing) return;
  runtime.closing = true;
  log.info(`Received ${reason}, shutting down`);

  try {
    await runtime.server?.stop();
  } finally {
    runtime.server = undefined;
    process.exit(0);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
process.stdin.once('end', () => void shutdown('stdio_closed'));

void boot();
