import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { HostStopObservation } from './host-stop-authority.js';
import { currentToolExecutionContext } from '../execution-context.js';

export const COS_STOP_PROTOCOL = 'cos.stop.v1';
export type CosStopWire = {
  protocol: typeof COS_STOP_PROTOCOL;
  nonce: string;
  sessionId: string;
  conversationId: string;
  turnId: string;
  state: 'running' | 'stop_requested' | 'blocked' | 'unknown';
  issuedAt: number;
  expiresAt: number;
  mac: string;
};

const signedFields = (body: Omit<CosStopWire, 'mac'>) => [body.protocol, body.nonce,
  body.sessionId, body.conversationId, body.turnId, body.state,
  String(body.issuedAt), String(body.expiresAt)].join('\n');

export function signCosStopWire(body: Omit<CosStopWire, 'mac'>, key: Buffer): string {
  return createHmac('sha256', key).update(signedFields(body), 'utf8').digest('hex');
}

export function verifyCosStopWire(raw: unknown, nonce: string, secret: Buffer, now = Date.now()): HostStopObservation | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const body = raw as CosStopWire;
  if (body.protocol !== COS_STOP_PROTOCOL || body.nonce !== nonce ||
    !/^[a-zA-Z0-9_-]{16,}$/.test(body.sessionId ?? '') ||
    !/^[a-zA-Z0-9_-]{16,}$/.test(body.conversationId ?? '') ||
    !/^[a-zA-Z0-9_-]{8,}$/.test(body.turnId ?? '') ||
    !['running', 'stop_requested', 'blocked', 'unknown'].includes(body.state) ||
    !Number.isSafeInteger(body.issuedAt) || !Number.isSafeInteger(body.expiresAt) ||
    body.issuedAt > now + 1000 || now - body.issuedAt > 1000 ||
    body.expiresAt < now || body.expiresAt > body.issuedAt + 2000 ||
    typeof body.mac !== 'string' || !/^[a-f0-9]{64}$/.test(body.mac)) return;
  const expected = Buffer.from(signCosStopWire(body, secret), 'hex');
  const actual = Buffer.from(body.mac, 'hex');
  if (!timingSafeEqual(actual, expected)) return;
  return { source: 'cos-host-stop', authoritative: true, state: body.state === 'running' ? 'running' : 'stopped' };
}

export function createCosHostStopProbe(endpoint: string, keyHex: string): () => Promise<HostStopObservation | undefined> {
  const key = /^[a-fA-F0-9]{64}$/.test(keyHex) ? Buffer.from(keyHex, 'hex') : undefined;
  let url: URL | undefined;
  try { url = new URL(endpoint); } catch { /* deny all mutations */ }
  if (!key || !url || url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.hash || url.search || url.pathname !== '/v1/stop-status') {
    return async () => undefined;
  }
  return async () => {
    const callToken = currentToolExecutionContext()?.cosStopCallToken;
    if (!callToken || !/^[a-f0-9]{64}$/.test(callToken)) return undefined;
    const nonce = randomBytes(24).toString('base64url');
    const payload = JSON.stringify({ protocol: COS_STOP_PROTOCOL, nonce, callToken });
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const req = httpRequest(url!, { method: 'POST', timeout: 650,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, res => {
          if (res.statusCode !== 200) { res.resume(); reject(new Error('status')); return; }
          let text = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { text += chunk; if (text.length > 4096) req.destroy(new Error('oversized')); });
          res.on('end', () => resolve(text));
          res.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.end(payload);
      });
      return verifyCosStopWire(JSON.parse(response), nonce, key);
    } catch { return undefined; }
  };
}
