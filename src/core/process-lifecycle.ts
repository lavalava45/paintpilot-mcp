import { getAppVersion } from './app-version.js';
import type { PhotoshopMCPServer } from './server.js';
import { Logger } from './runtime-log.js';
import { assertDeploymentLaunchReady, RUNNING_DEPLOYMENT } from './deployment-health.js';

type RuntimeState = {
  server?: PhotoshopMCPServer;
  closing: boolean;
};

export function runPhotoshopMcpCli(): void {
  const log = new Logger('Main');
  const runtime: RuntimeState = { closing: false };

  const shutdown = async (reason: string): Promise<void> => {
    if (runtime.closing) return;
    runtime.closing = true;
    log.info(`Received ${reason}, shutting down`);
    try {
      await runtime.server?.stop();
    } finally {
      runtime.server = undefined;
      process.exit(0);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
  process.stdin.once('end', () => void shutdown('stdio_closed'));

  void (async () => {
    log.info('Starting Photoshop MCP Server...');
    try {
      assertDeploymentLaunchReady(undefined, RUNNING_DEPLOYMENT);
      const { PhotoshopMCPServer } = await import('./server.js');
      // A concurrent publication during module loading must not launch a mixed build.
      assertDeploymentLaunchReady(undefined, RUNNING_DEPLOYMENT);
      const server = new PhotoshopMCPServer({ serverVersion: getAppVersion() });
      runtime.server = server;
      await server.start();
      log.info('Photoshop MCP Server is running');
    } catch (error) {
      log.error('Failed to start server:', error);
      process.exit(1);
    }
  })();
}
