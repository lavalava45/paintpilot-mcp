import { DEPLOYMENT_ROOT, deploymentHealth, type BridgeDeployment } from '../../src/core/deployment-health.js';

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const urlIndex = args.indexOf('--bridge-url');
const endpoint = urlIndex >= 0 ? args[urlIndex + 1]
  : `http://127.0.0.1:${process.env.PHOTOSHOP_UXP_BRIDGE_PORT ?? '38452'}/health`;
let bridge: BridgeDeployment | undefined;
let endpointError: string | undefined;
if (!offline) {
  try {
    if (!endpoint) throw new Error('--bridge-url requires a URL');
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.pathname !== '/health' || url.username || url.password || url.search || url.hash)
      throw new Error('Use only the localhost /health endpoint of this MCP plugin');
    const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
    if (!response.ok) throw new Error(`health HTTP ${response.status}`);
    bridge = await response.json() as BridgeDeployment;
  } catch (error) { endpointError = error instanceof Error ? error.message : String(error); }
}
const result = deploymentHealth(DEPLOYMENT_ROOT, undefined, bridge);
console.log(JSON.stringify({ ...result, health_endpoint: offline ? 'not_queried' : endpoint,
  ...(endpointError ? { health_endpoint_error: endpointError } : {}),
  ...(offline ? { runtime_verification: 'not_attempted; loaded MCP/UXP identities remain unknown' } : {}) }, null, 2));
// Offline checks validate only source/dist; missing runtime evidence is expected.
const relevant = offline ? result.issues.filter(row => !['deployment_running_identity_unknown', 'deployment_uxp_unavailable'].includes(row.code)) : result.issues;
process.exitCode = relevant.length ? 1 : 0;
