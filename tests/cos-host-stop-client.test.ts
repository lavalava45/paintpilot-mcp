import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { withToolExecutionContext } from '../src/core/execution-context.js';
import { COS_STOP_PROTOCOL, createCosHostStopProbe, signCosStopWire, verifyCosStopWire } from '../src/core/guard/cos-host-stop-client.js';

describe('authenticated COS Stop status', () => {
  it('reads authenticated status from a mocked host and fails closed on mismatched MAC', async () => {
    const secret = randomBytes(32);
    let valid = true;
    const server = createServer((req, res) => {
      let incoming = '';
      req.on('data', chunk => { incoming += chunk; });
      req.on('end', () => {
        const { nonce, callToken } = JSON.parse(incoming) as { nonce: string; callToken?: string };
        if (callToken !== 'a'.repeat(64)) { res.statusCode = 403; res.end(); return; }
        const now = Date.now();
        const body = { protocol: COS_STOP_PROTOCOL, nonce, sessionId: 'session-123456789012345',
          conversationId: 'conversation-123456789012345', turnId: 'turn-123456789',
          state: 'running' as const, issuedAt: now, expiresAt: now + 500 };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ...body, mac: signCosStopWire(body, valid ? secret : randomBytes(32)) }));
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No mock server port');
      const probe = createCosHostStopProbe(`http://127.0.0.1:${address.port}/v1/stop-status`, secret.toString('hex'));
      expect(await probe()).toBeUndefined(); // no caller identity
      expect(await withToolExecutionContext({ cosStopCallToken: 'a'.repeat(64) }, probe))
        .toMatchObject({ state: 'running', authoritative: true });
      valid = false;
      expect(await withToolExecutionContext({ cosStopCallToken: 'a'.repeat(64) }, probe)).toBeUndefined();
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
  it('requires fresh, authenticated response bound to the exact challenge', () => {
    const secret = randomBytes(32);
    const now = Date.now();
    const body = { protocol: COS_STOP_PROTOCOL, nonce: 'challenge-1',
      sessionId: 'session-123456789012345', conversationId: 'conversation-123456789012345', turnId: 'turn-123456789',
      state: 'running' as const, issuedAt: now, expiresAt: now + 500 };
    const signed = { ...body, mac: signCosStopWire(body, secret) };
    expect(verifyCosStopWire(signed, body.nonce, secret, now)).toMatchObject({ state: 'running', authoritative: true });
    expect(verifyCosStopWire(signed, 'other-nonce', secret, now)).toBeUndefined();
    expect(verifyCosStopWire({ ...signed, state: 'blocked' }, body.nonce, secret, now)).toBeUndefined();
    expect(verifyCosStopWire(signed, body.nonce, randomBytes(32), now)).toBeUndefined();
    expect(verifyCosStopWire(signed, body.nonce, secret, now + 501)).toBeUndefined();
    const stopped = { ...body, state: 'stop_requested' as const };
    expect(verifyCosStopWire({ ...stopped, mac: signCosStopWire(stopped, secret) }, body.nonce, secret, now))
      .toMatchObject({ state: 'stopped', authoritative: true });
  });
});
