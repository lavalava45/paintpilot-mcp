/**
 * MCP-hosted UXP bridge server — companion Photoshop plugin keeps one long-poll
 * request open for commands. This avoids fixed polling latency while retaining a
 * very small localhost-only transport surface.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Logger } from '../utils/logger.js';
import { executionTimeoutMs } from '../core/execution-context.js';
import { UXP_BRIDGE_REVISION } from '../core/guard/protocol-version.js';
import { SessionStore } from '../core/guard/session-store.js';
import { UserConfigValidationError } from '../core/user-config.js';
import {
  probeProcessVideoTraceReadiness,
  readProcessVideoTraceSetting,
  setProcessVideoTraceEnabled,
} from '../core/process-video-trace.js';

const logger = new Logger('UxpBridgeServer');

export interface UxpBridgeCommand {
  protocol: typeof COMMAND_REQUEST_PROTOCOL;
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export interface UxpBridgeResult {
  protocol: typeof COMMAND_RESULT_PROTOCOL;
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  receipt?: UxpBridgeCommandReceipt;
}

export type UxpBridgeCommandState =
  | 'queued'
  | 'claimed'
  | 'completed'
  | 'failed'
  | 'not-claimed';

export interface UxpBridgeCommandReceipt {
  protocol: 'photoshop.uxp.command_receipt.v1';
  command_id: string;
  action: string;
  state: UxpBridgeCommandState;
  terminal: boolean;
  created_at: string;
  updated_at: string;
  claimed_at?: string;
  completed_at?: string;
  failed_at?: string;
  not_claimed_at?: string;
  result?: UxpBridgeResult;
}

export interface UxpBridgeInvokeOptions {
  commandId?: string;
  requireConnected?: boolean;
  expectedBridgeRevision?: string;
}

export const UXP_BRIDGE_EVENT_PROTOCOL = 'photoshop.uxp.event.v1' as const;

export interface UxpBridgeEvent {
  protocol: typeof UXP_BRIDGE_EVENT_PROTOCOL;
  event: 'document_closed';
  document_id: number;
  observed_at: string;
  controlled: boolean;
  command_id?: string;
  document_name?: string;
  document_instance_witness?: Record<string, unknown>;
}

export type UxpBridgeCommandProbe =
  | { status: 'receipt'; receipt: UxpBridgeCommandReceipt }
  | { status: 'absent' }
  | { status: 'corrupt' };

interface UxpBridgeCommandRecord {
  command: UxpBridgeCommand;
  paramsSignature: string;
  receipt: UxpBridgeCommandReceipt;
  durable: boolean;
  deliveryRegistered: boolean;
}

const DEFAULT_PORT = Number.parseInt(process.env.PHOTOSHOP_UXP_BRIDGE_PORT ?? '38452', 10);

let server: Server | null = null;
let listenPort = DEFAULT_PORT;
const pendingCommands: UxpBridgeCommand[] = [];
const pendingPolls: Array<{ res: ServerResponse; timer: NodeJS.Timeout }> = [];
const resultWaiters = new Map<
  string,
  Set<{ resolve: (result: UxpBridgeResult) => void; timer: NodeJS.Timeout }>
>();
const commandRecords = new Map<string, UxpBridgeCommandRecord>();
const eventListeners = new Set<(event: UxpBridgeEvent) => void | Promise<void>>();
let lastPluginPollAt = 0;
let pluginPollCount = 0;
let pluginBridgeRevision: string | null = null;
let pluginRuntimeInstanceWitness: string | null = null;
let pluginPhotoshopVersion: string | null = null;
let pluginDocumentCount: number | null = null;
let pluginActiveDocument: { id?: number; name?: string; instance_witness?: string } | null = null;
let pluginDocumentGeometryRevision = 0;

const LONG_POLL_TIMEOUT_MS = 20_000;
// Guard calls can spend ~20s in connector/validation work before their final
// force-refreshed readiness probe. In a background Photoshop session the UXP
// companion may also reopen its next long-poll a little late after the server's
// 20s response. A 2s grace therefore produced false disconnects even though the
// companion was healthy and continuously polling. Keep the grace bounded: long
// enough to span one delayed reopen/Guard preflight, but short enough that a
// genuinely gone companion still becomes unavailable promptly.
const PLUGIN_CONNECTED_WINDOW_MS = LONG_POLL_TIMEOUT_MS + 15_000;
const COMMAND_RECEIPT_PROTOCOL = 'photoshop.uxp.command_receipt.v1' as const;
export const UXP_BRIDGE_REGISTRATION_PROTOCOL = 'photoshop.uxp.registration.v1' as const;
export const COMMAND_REQUEST_PROTOCOL = 'photoshop.uxp.command.v1' as const;
export const COMMAND_RESULT_PROTOCOL = 'photoshop.uxp.command_result.v1' as const;
const COMMAND_RECEIPT_TTL_MS = 15 * 60_000;
const MAX_COMMAND_RECEIPTS = 512;
const MAX_RECEIPT_FILE_BYTES = 256 * 1024;
const DEFAULT_RECEIPT_DIRECTORY = fileURLToPath(
  new URL('../../.photoshop-runtime/uxp-command-receipts/', import.meta.url)
);

function receiptDirectory(): string {
  return process.env.PHOTOSHOP_UXP_RECEIPT_DIR?.trim() || DEFAULT_RECEIPT_DIRECTORY;
}

const DEFAULT_CONTROLLER_RUNTIME_DIRECTORY = fileURLToPath(
  new URL('../../.photoshop-runtime/controller/', import.meta.url)
);

function controllerRuntimeDirectory(): string {
  return process.env.PHOTOSHOP_CONTROLLER_RUNTIME_DIR?.trim() || DEFAULT_CONTROLLER_RUNTIME_DIRECTORY;
}

function userConfigStore(): SessionStore {
  return new SessionStore(controllerRuntimeDirectory());
}

function activeSettingsDocumentId(): number | undefined {
  const documentId = Number(pluginActiveDocument?.id);
  return Number.isSafeInteger(documentId) && documentId > 0 ? documentId : undefined;
}

function receiptFile(commandId: string): string {
  const digest = createHash('sha256').update(commandId).digest('hex');
  return path.join(receiptDirectory(), `${digest}.json`);
}

function persistedRecordPayload(
  record: UxpBridgeCommandRecord,
  receipt = record.receipt
): Record<string, unknown> {
  return {
    protocol: COMMAND_RECEIPT_PROTOCOL,
    params_signature: record.paramsSignature,
    receipt,
  };
}

function atomicWriteJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const payload = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(payload) > MAX_RECEIPT_FILE_BYTES) {
    throw new Error('uxp_bridge_receipt_too_large');
  }
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, payload, 'utf8');
  renameSync(temp, file);
}

function persistCommandRecord(
  record: UxpBridgeCommandRecord,
  receipt = record.receipt
): void {
  if (!record.durable) return;
  atomicWriteJson(receiptFile(record.command.id), persistedRecordPayload(record, receipt));
}

function deletePersistedCommandRecord(commandId: string): void {
  try {
    unlinkSync(receiptFile(commandId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function loadDurableCommandRecords(): void {
  const directory = receiptDirectory();
  mkdirSync(directory, { recursive: true });
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(directory, name);
    try {
      const raw = readFileSync(file, 'utf8');
      if (Buffer.byteLength(raw) > MAX_RECEIPT_FILE_BYTES) {
        logger.warn(`Ignoring oversized UXP receipt journal entry: ${file}`);
        continue;
      }
      const parsed = JSON.parse(raw) as {
        protocol?: string;
        params_signature?: string;
        receipt?: UxpBridgeCommandReceipt;
      };
      const receipt = parsed.receipt;
      if (
        parsed.protocol !== COMMAND_RECEIPT_PROTOCOL ||
        typeof parsed.params_signature !== 'string' ||
        receipt?.protocol !== COMMAND_RECEIPT_PROTOCOL ||
        typeof receipt.command_id !== 'string' ||
        typeof receipt.action !== 'string' ||
        !['queued', 'claimed', 'completed', 'failed', 'not-claimed'].includes(receipt.state) ||
        path.resolve(file) !== path.resolve(receiptFile(receipt.command_id))
      ) {
        logger.warn(`Ignoring invalid UXP receipt journal entry: ${file}`);
        continue;
      }
      commandRecords.set(receipt.command_id, {
        command: {
          protocol: COMMAND_REQUEST_PROTOCOL,
          id: receipt.command_id,
          action: receipt.action,
          params: {},
        },
        paramsSignature: parsed.params_signature,
        receipt,
        durable: true,
        deliveryRegistered: false,
      });
    } catch (error) {
      logger.warn(
        `Failed to load UXP receipt journal entry ${file}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  pruneCommandReceipts();
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(',')}}`;
}

function isTerminalReceipt(receipt: UxpBridgeCommandReceipt): boolean {
  return receipt.state === 'completed' || receipt.state === 'failed' || receipt.state === 'not-claimed';
}

function cloneReceipt(receipt: UxpBridgeCommandReceipt): UxpBridgeCommandReceipt {
  return JSON.parse(JSON.stringify(receipt)) as UxpBridgeCommandReceipt;
}

function pruneCommandReceipts(now = Date.now()): void {
  for (const [id, record] of commandRecords) {
    if (!isTerminalReceipt(record.receipt)) continue;
    const updatedAt = Date.parse(record.receipt.updated_at);
    if (Number.isFinite(updatedAt) && now - updatedAt > COMMAND_RECEIPT_TTL_MS) {
      commandRecords.delete(id);
      if (record.durable) deletePersistedCommandRecord(id);
    }
  }

  if (commandRecords.size <= MAX_COMMAND_RECEIPTS) return;
  const terminal = Array.from(commandRecords.entries())
    .filter(([, record]) => isTerminalReceipt(record.receipt))
    .sort((a, b) => Date.parse(a[1].receipt.updated_at) - Date.parse(b[1].receipt.updated_at));
  while (commandRecords.size > MAX_COMMAND_RECEIPTS && terminal.length > 0) {
    const [id, record] = terminal.shift()!;
    commandRecords.delete(id);
    if (record.durable) deletePersistedCommandRecord(id);
  }
}

export function getUxpBridgeCommandReceipt(commandId: string): UxpBridgeCommandReceipt | null {
  pruneCommandReceipts();
  const record = commandRecords.get(commandId);
  return record ? cloneReceipt(record.receipt) : null;
}

export async function probeUxpBridgeCommandReceipt(
  commandId: string
): Promise<UxpBridgeCommandProbe> {
  await ensureUxpBridgeServer();
  pruneCommandReceipts();
  const record = commandRecords.get(commandId);
  if (record) return { status: 'receipt', receipt: cloneReceipt(record.receipt) };
  return existsSync(receiptFile(commandId)) ? { status: 'corrupt' } : { status: 'absent' };
}

function removePendingCommand(commandId: string): void {
  const index = pendingCommands.findIndex((candidate) => candidate.id === commandId);
  if (index >= 0) pendingCommands.splice(index, 1);
}

function removeResultWaiter(
  commandId: string,
  waiter: { resolve: (result: UxpBridgeResult) => void; timer: NodeJS.Timeout }
): void {
  const waiters = resultWaiters.get(commandId);
  if (!waiters) return;
  waiters.delete(waiter);
  if (waiters.size === 0) resultWaiters.delete(commandId);
}

function resolveResultWaiters(commandId: string, result: UxpBridgeResult): void {
  const waiters = resultWaiters.get(commandId);
  if (!waiters) return;
  resultWaiters.delete(commandId);
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(result);
  }
}

function terminalizeCommand(
  record: UxpBridgeCommandRecord,
  state: Extract<UxpBridgeCommandState, 'completed' | 'failed' | 'not-claimed'>,
  result: UxpBridgeResult
): void {
  const now = new Date().toISOString();
  const nextReceipt: UxpBridgeCommandReceipt = {
    ...record.receipt,
    state,
    terminal: true,
    updated_at: now,
    result: { ...result },
    ...(state === 'completed' ? { completed_at: now } : {}),
    ...(state === 'failed' ? { failed_at: now } : {}),
    ...(state === 'not-claimed' ? { not_claimed_at: now } : {}),
  };
  persistCommandRecord(record, nextReceipt);
  record.receipt = nextReceipt;
  removePendingCommand(record.command.id);
  resolveResultWaiters(record.command.id, result);
  pruneCommandReceipts();
}

function claimCommand(commandId: string): { execute: boolean; receipt: UxpBridgeCommandReceipt } | null {
  pruneCommandReceipts();
  const record = commandRecords.get(commandId);
  if (!record) return null;
  if (record.receipt.state === 'queued') {
    const now = new Date().toISOString();
    const nextReceipt: UxpBridgeCommandReceipt = {
      ...record.receipt,
      state: 'claimed',
      terminal: false,
      claimed_at: now,
      updated_at: now,
    };
    persistCommandRecord(record, nextReceipt);
    record.receipt = nextReceipt;
    return { execute: true, receipt: cloneReceipt(record.receipt) };
  }
  return { execute: false, receipt: cloneReceipt(record.receipt) };
}

export async function cancelUxpBridgeCommandIfQueued(
  commandId: string
): Promise<UxpBridgeCommandReceipt | null> {
  await ensureUxpBridgeServer();
  const record = commandRecords.get(commandId);
  if (!record || record.receipt.state !== 'queued') return null;
  terminalizeCommand(
    record,
    'not-claimed',
    { protocol: COMMAND_RESULT_PROTOCOL, id: commandId, ok: false, error: 'uxp_bridge_not_claimed' }
  );
  return cloneReceipt(record.receipt);
}

export function getUxpBridgePort(): number {
  return listenPort;
}

export function subscribeUxpBridgeEvents(
  listener: (event: UxpBridgeEvent) => void | Promise<void>
): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

async function serveDiagnostic(
  res: ServerResponse,
  action: string
): Promise<void> {
  const started = Date.now();
  try {
    const result = await invokeUxpBridge(action, {}, 5000);
    json(res, result.ok ? 200 : 502, {
      ...result,
      round_trip_ms: Date.now() - started,
    });
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      round_trip_ms: Date.now() - started,
    });
  }
}

export function isUxpPluginConnected(now = Date.now()): boolean {
  return lastPluginPollAt > 0 && now - lastPluginPollAt <= PLUGIN_CONNECTED_WINDOW_MS;
}

export function getUxpBridgeHealthSnapshot(now = Date.now()) {
  return {
    ok: true as const,
    pending: pendingCommands.length,
    waiting_long_polls: pendingPolls.length,
    plugin_connected: isUxpPluginConnected(now),
    last_plugin_poll_age_ms: lastPluginPollAt > 0 ? now - lastPluginPollAt : null,
    plugin_poll_count: pluginPollCount,
    transport: 'long-poll' as const,
    bridge_revision: pluginBridgeRevision,
    runtime_instance_witness: pluginRuntimeInstanceWitness,
    expected_bridge_revision: UXP_BRIDGE_REVISION,
    photoshop_version: pluginPhotoshopVersion,
    document_count: pluginDocumentCount,
    active_document: pluginActiveDocument,
    document_geometry_revision: pluginDocumentGeometryRevision,
  };
}

function removePendingPoll(res: ServerResponse): void {
  const index = pendingPolls.findIndex((waiter) => waiter.res === res);
  if (index < 0) return;
  const [waiter] = pendingPolls.splice(index, 1);
  clearTimeout(waiter.timer);
}

function dispatchCommand(command: UxpBridgeCommand): boolean {
  while (pendingPolls.length > 0) {
    const waiter = pendingPolls.shift();
    if (!waiter) break;
    clearTimeout(waiter.timer);
    if (waiter.res.writableEnded || waiter.res.destroyed) continue;
    json(waiter.res, 200, command);
    return true;
  }
  return false;
}

function listenOnLoopback(
  candidate: ReturnType<typeof createServer>,
  resolve: (port: number) => void,
  reject: (error: unknown) => void
): void {
  const host = '127.0.0.1';
  candidate.once('listening', () => {
    server = candidate;
    const address = candidate.address();
    if (address && typeof address === 'object') listenPort = address.port;
    logger.info(`UXP bridge listening on ${host}:${listenPort}`);
    resolve(listenPort);
  });
  candidate.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') {
      reject(error);
      return;
    }
    listenPort += 1;
    candidate.listen(listenPort, host);
  });
  candidate.listen(listenPort, host);
}

export async function ensureUxpBridgeServer(): Promise<number> {
  if (server) return listenPort;
  if (commandRecords.size === 0) loadDurableCommandRecords();

  return new Promise((resolve, reject) => {
    const s = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${listenPort}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, getUxpBridgeHealthSnapshot());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/event') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 16 * 1024) req.destroy();
        });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body) as Partial<Omit<UxpBridgeEvent, 'event'>> & { event?: string };
            if (parsed.protocol !== UXP_BRIDGE_EVENT_PROTOCOL) {
              json(res, 409, {
                ok: false,
                error: parsed.protocol ? 'uxp_event_protocol_mismatch' : 'uxp_event_protocol_missing',
                event_protocol: parsed.protocol ?? null,
                expected_event_protocol: UXP_BRIDGE_EVENT_PROTOCOL,
              });
              return;
            }
            if (parsed.event === 'document_geometry_changed') {
              const documentId = Number(parsed.document_id);
              if (!Number.isSafeInteger(documentId) || documentId <= 0) {
                json(res, 400, { ok: false, error: 'document_id_required' });
                return;
              }
              pluginDocumentGeometryRevision += 1;
              json(res, 200, { ok: true, delivered_to: 0 });
              return;
            }
            if (parsed.event !== 'document_closed') {
              json(res, 400, { ok: false, error: 'unsupported_uxp_event' });
              return;
            }
            const documentId = Number(parsed.document_id);
            if (!Number.isSafeInteger(documentId) || documentId <= 0) {
              json(res, 400, { ok: false, error: 'document_id_required' });
              return;
            }
            const observedAt = typeof parsed.observed_at === 'string' && Number.isFinite(Date.parse(parsed.observed_at))
              ? new Date(parsed.observed_at).toISOString()
              : new Date().toISOString();
            const event: UxpBridgeEvent = {
              protocol: UXP_BRIDGE_EVENT_PROTOCOL,
              event: 'document_closed',
              document_id: documentId,
              observed_at: observedAt,
              controlled: parsed.controlled === true,
              ...(typeof parsed.command_id === 'string' && parsed.command_id.trim()
                ? { command_id: parsed.command_id.trim() }
                : {}),
              ...(typeof parsed.document_name === 'string' && parsed.document_name.trim()
                ? { document_name: parsed.document_name.trim() }
                : {}),
              ...(parsed.document_instance_witness && typeof parsed.document_instance_witness === 'object' && !Array.isArray(parsed.document_instance_witness)
                ? { document_instance_witness: structuredClone(parsed.document_instance_witness) }
                : {}),
            };
            const deliveries = [...eventListeners].map(async listener => {
              try { await listener(event); }
              catch (error) { logger.warn(`UXP event listener failed: ${error instanceof Error ? error.message : String(error)}`); }
            });
            await Promise.all(deliveries);
            json(res, 200, { ok: true, delivered_to: eventListeners.size });
          } catch (error) {
            json(res, 400, {
              ok: false,
              error: error instanceof SyntaxError ? 'invalid_json' : `uxp_event_rejected:${error instanceof Error ? error.message : String(error)}`,
            });
          }
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/settings/user-config') {
        try {
          json(res, 200, { ok: true, ...userConfigStore().userConfig(activeSettingsDocumentId()) });
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: 'user_config_read_failed:' + (error instanceof Error ? error.message : String(error)),
          });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/settings/user-config') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8 * 1024) req.destroy();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            json(res, 200, {
              ok: true,
              ...userConfigStore().setUserConfig(parsed, activeSettingsDocumentId()),
            });
          } catch (error) {
            const validationError = error instanceof UserConfigValidationError;
            const clientError = validationError || error instanceof SyntaxError;
            json(res, clientError ? 400 : 500, {
              ok: false,
              error: validationError
                ? error.message
                : error instanceof SyntaxError
                  ? 'invalid_json'
                  : 'user_config_write_failed:' + (error instanceof Error ? error.message : String(error)),
            });
          }
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/settings/process-video-trace') {
        json(res, 200, { ok: true, ...readProcessVideoTraceSetting() });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/settings/process-video-trace/readiness') {
        json(res, 200, { ok: true, ...probeProcessVideoTraceReadiness() });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/settings/process-video-trace') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 4096) req.destroy();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { enabled?: unknown };
            if (typeof parsed.enabled !== 'boolean') {
              json(res, 400, { ok: false, error: 'process_video_trace_enabled_boolean_required' });
              return;
            }
            json(res, 200, { ok: true, ...setProcessVideoTraceEnabled(parsed.enabled) });
          } catch (error) {
            json(res, 400, {
              ok: false,
              error: error instanceof SyntaxError
                ? 'invalid_json'
                : `process_video_trace_setting_write_failed:${error instanceof Error ? error.message : String(error)}`,
            });
          }
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/poll') {
        const announcedProtocol = url.searchParams.get('protocol')?.trim() || null;
        if (announcedProtocol !== UXP_BRIDGE_REGISTRATION_PROTOCOL) {
          lastPluginPollAt = 0;
          pluginBridgeRevision = null;
          pluginRuntimeInstanceWitness = null;
          pluginPhotoshopVersion = null;
          pluginDocumentCount = null;
          pluginActiveDocument = null;
          json(res, 409, {
            ok: false,
            error: announcedProtocol
              ? 'uxp_bridge_registration_protocol_mismatch'
              : 'uxp_bridge_registration_protocol_missing',
            registration_protocol: announcedProtocol,
            expected_registration_protocol: UXP_BRIDGE_REGISTRATION_PROTOCOL,
          });
          return;
        }
        const announcedRevision = url.searchParams.get('revision')?.trim() || null;
        if (announcedRevision !== UXP_BRIDGE_REVISION) {
          lastPluginPollAt = 0;
          pluginBridgeRevision = announcedRevision;
          pluginRuntimeInstanceWitness = null;
          pluginPhotoshopVersion = null;
          pluginDocumentCount = null;
          pluginActiveDocument = null;
          json(res, 409, {
            ok: false,
            error: announcedRevision ? 'uxp_bridge_revision_mismatch' : 'uxp_bridge_revision_missing',
            bridge_revision: announcedRevision,
            expected_bridge_revision: UXP_BRIDGE_REVISION,
          });
          return;
        }
        lastPluginPollAt = Date.now();
        pluginPollCount += 1;
        pluginBridgeRevision = announcedRevision;
        pluginRuntimeInstanceWitness = url.searchParams.get('runtimeInstanceWitness')?.trim() || null;
        pluginPhotoshopVersion = url.searchParams.get('photoshopVersion')?.trim() || null;
        const documentCount = Number(url.searchParams.get('documentCount'));
        pluginDocumentCount = Number.isSafeInteger(documentCount) && documentCount >= 0 ? documentCount : null;
        const activeDocumentId = Number(url.searchParams.get('activeDocumentId'));
        const activeDocumentName = url.searchParams.get('activeDocumentName')?.trim() || undefined;
        const activeDocumentInstanceWitness = url.searchParams.get('activeDocumentInstanceWitness')?.trim() || undefined;
        pluginActiveDocument = Number.isSafeInteger(activeDocumentId) && activeDocumentId > 0
          ? {
              id: activeDocumentId,
              ...(activeDocumentName ? { name: activeDocumentName } : {}),
              ...(activeDocumentInstanceWitness ? { instance_witness: activeDocumentInstanceWitness } : {}),
            }
          : activeDocumentName ? { name: activeDocumentName } : null;
        const cmd = pendingCommands.shift();
        if (cmd) {
          json(res, 200, cmd);
          return;
        }

        const timer = setTimeout(() => {
          removePendingPoll(res);
          if (!res.writableEnded && !res.destroyed) {
            res.writeHead(204);
            res.end();
          }
        }, LONG_POLL_TIMEOUT_MS);
        pendingPolls.push({ res, timer });
        res.once('close', () => removePendingPoll(res));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/ping') {
        const started = Date.now();
        try {
          const result = await invokeUxpBridge('diagnostic_ping', {}, 5000);
          json(res, result.ok ? 200 : 502, {
            ...result,
            round_trip_ms: Date.now() - started,
          });
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            round_trip_ms: Date.now() - started,
          });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/batchplay') {
        const started = Date.now();
        try {
          const result = await invokeUxpBridge('diagnostic_batchplay', {}, 5000);
          json(res, result.ok ? 200 : 502, {
            ...result,
            round_trip_ms: Date.now() - started,
          });
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            round_trip_ms: Date.now() - started,
          });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/state') {
        await serveDiagnostic(res, 'get_state');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/list-documents') {
        await serveDiagnostic(res, 'list_documents');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/selection-bounds') {
        await serveDiagnostic(res, 'get_selection_bounds');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/layers') {
        await serveDiagnostic(res, 'list_layers');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/brush-presets') {
        await serveDiagnostic(res, 'list_brush_presets');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/brush-settings') {
        await serveDiagnostic(res, 'get_brush_settings');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/brush-options-raw') {
        await serveDiagnostic(res, 'get_brush_options_raw');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/history') {
        await serveDiagnostic(res, 'get_history');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/foreground-color') {
        await serveDiagnostic(res, 'get_foreground_color');
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/preview') {
        const started = Date.now();
        try {
          const result = await invokeUxpBridge(
            'capture_preview',
            { max_dimension_px: 1024 },
            30_000
          );
          json(res, result.ok ? 200 : 502, {
            ...result,
            round_trip_ms: Date.now() - started,
          });
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            round_trip_ms: Date.now() - started,
          });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/sample-color') {
        const started = Date.now();
        try {
          const result = await invokeUxpBridge(
            'sample_color',
            { x: 0, y: 0, radius: 0 },
            10_000
          );
          json(res, result.ok ? 200 : 502, {
            ...result,
            round_trip_ms: Date.now() - started,
          });
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            round_trip_ms: Date.now() - started,
          });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/diagnostic/sample-colors') {
        const started = Date.now();
        try {
          const result = await invokeUxpBridge(
            'sample_colors',
            { points: [{ id: 'origin', x: 0, y: 0 }] },
            10_000
          );
          json(res, result.ok ? 200 : 502, {
            ...result,
            round_trip_ms: Date.now() - started,
          });
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            round_trip_ms: Date.now() - started,
          });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/claim') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { id?: string };
            const commandId = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
            if (!commandId) {
              json(res, 400, { ok: false, error: 'command_id_required' });
              return;
            }
            const claimed = claimCommand(commandId);
            if (!claimed) {
              json(res, 404, { ok: false, error: 'command_receipt_not_found' });
              return;
            }
            json(res, 200, { ok: true, ...claimed });
          } catch {
            json(res, 400, { ok: false, error: 'invalid_json' });
          }
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/result') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as Partial<UxpBridgeResult>;
            if (parsed?.protocol !== COMMAND_RESULT_PROTOCOL) {
              json(res, 409, {
                ok: false,
                error: parsed?.protocol
                  ? 'command_result_protocol_mismatch'
                  : 'command_result_protocol_missing',
                result_protocol: parsed?.protocol ?? null,
                expected_result_protocol: COMMAND_RESULT_PROTOCOL,
              });
              return;
            }
            const commandId = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
            if (!commandId) {
              json(res, 400, { ok: false, error: 'command_id_required' });
              return;
            }
            const record = commandRecords.get(commandId);
            if (!record) {
              json(res, 404, { ok: false, error: 'command_receipt_not_found' });
              return;
            }
            if (record.receipt.state === 'not-claimed') {
              json(res, 409, {
                ok: false,
                error: 'command_not_claimed',
                receipt: cloneReceipt(record.receipt),
              });
              return;
            }
            if (record.receipt.state === 'completed' || record.receipt.state === 'failed') {
              json(res, 200, {
                ok: true,
                duplicate: true,
                receipt: cloneReceipt(record.receipt),
              });
              return;
            }
            if (record.receipt.state === 'queued') {
              json(res, 409, {
                ok: false,
                error: 'command_not_claimed',
                receipt: cloneReceipt(record.receipt),
              });
              return;
            }
            if (typeof parsed.ok !== 'boolean') {
              json(res, 400, { ok: false, error: 'command_result_ok_required' });
              return;
            }
            terminalizeCommand(record, parsed.ok ? 'completed' : 'failed', parsed as UxpBridgeResult);
            json(res, 200, { ok: true, receipt: cloneReceipt(record.receipt) });
          } catch {
            json(res, 400, { ok: false, error: 'invalid_json' });
          }
        });
        return;
      }

      json(res, 404, { ok: false, error: 'not_found' });
    });

    listenOnLoopback(s, resolve, reject);
  });
}

function waitForCommandResult(
  record: UxpBridgeCommandRecord,
  timeoutMs: number
): Promise<UxpBridgeResult> {
  const existingResult = record.receipt.result;
  if (isTerminalReceipt(record.receipt) && existingResult) {
    return Promise.resolve(existingResult);
  }

  return new Promise<UxpBridgeResult>((resolve) => {
    let waiter: { resolve: (result: UxpBridgeResult) => void; timer: NodeJS.Timeout };
    const timer = setTimeout(() => {
      const current = commandRecords.get(record.command.id);
      if (!current) {
        removeResultWaiter(record.command.id, waiter);
        resolve({ protocol: COMMAND_RESULT_PROTOCOL, id: record.command.id, ok: false, error: 'uxp_bridge_receipt_expired' });
        return;
      }
      if (isTerminalReceipt(current.receipt) && current.receipt.result) {
        removeResultWaiter(record.command.id, waiter);
        resolve(current.receipt.result);
        return;
      }
      if (current.receipt.state === 'queued') {
        const result: UxpBridgeResult = {
          protocol: COMMAND_RESULT_PROTOCOL,
          id: current.command.id,
          ok: false,
          error: 'uxp_bridge_not_claimed',
        };
        terminalizeCommand(current, 'not-claimed', result);
        return;
      }

      // Once the UXP companion has claimed the command, absence of a result is
      // uncertain execution. Keep the durable receipt claimed and never enqueue
      // another command with the same identity.
      removeResultWaiter(record.command.id, waiter);
      resolve({
        protocol: COMMAND_RESULT_PROTOCOL,
        id: current.command.id,
        ok: false,
        error: 'uxp_bridge_claimed_timeout',
        receipt: cloneReceipt(current.receipt),
      });
    }, timeoutMs);
    waiter = { resolve, timer };
    const waiters = resultWaiters.get(record.command.id) ?? new Set();
    waiters.add(waiter);
    resultWaiters.set(record.command.id, waiters);
  });
}

export async function invokeUxpBridge(
  action: string,
  params: Record<string, unknown>,
  timeoutMs = 60_000,
  options: UxpBridgeInvokeOptions = {}
): Promise<UxpBridgeResult> {
  // A Guard/controller deadline is authoritative for every nested Photoshop-side
  // dispatch. Clamp before starting/queuing the localhost command so an already
  // expired logical operation cannot leak one more UXP mutation to the plugin.
  const effectiveTimeoutMs = executionTimeoutMs(timeoutMs, timeoutMs);
  await ensureUxpBridgeServer();
  const requestedId = typeof options.commandId === 'string' ? options.commandId.trim() : '';
  const id = requestedId || `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const paramsSignature = stableSerialize(params);
  pruneCommandReceipts();

  const preDispatchGate = (): UxpBridgeResult | null => {
    if (options.requireConnected && !isUxpPluginConnected()) {
      return { protocol: COMMAND_RESULT_PROTOCOL, id, ok: false, error: 'uxp_plugin_not_connected' };
    }
    if (
      options.expectedBridgeRevision !== undefined &&
      pluginBridgeRevision !== options.expectedBridgeRevision
    ) {
      return { protocol: COMMAND_RESULT_PROTOCOL, id, ok: false, error: 'uxp_bridge_revision_mismatch' };
    }
    return null;
  };

  const existing = commandRecords.get(id);
  if (existing) {
    if (existing.command.action !== action || existing.paramsSignature !== paramsSignature) {
      return {
        id,
        protocol: COMMAND_RESULT_PROTOCOL,
        ok: false,
        error: 'uxp_bridge_command_id_conflict',
        receipt: cloneReceipt(existing.receipt),
      };
    }
    if (existing.receipt.state === 'not-claimed') {
      const gateFailure = preDispatchGate();
      if (gateFailure) return gateFailure;
      const now = new Date().toISOString();
      const retryReceipt: UxpBridgeCommandReceipt = {
        protocol: COMMAND_RECEIPT_PROTOCOL,
        command_id: id,
        action,
        state: 'queued',
        terminal: false,
        created_at: existing.receipt.created_at,
        updated_at: now,
      };
      persistCommandRecord(existing, retryReceipt);
      existing.receipt = retryReceipt;
      existing.command.params = params;
      existing.deliveryRegistered = true;
      if (!dispatchCommand(existing.command)) pendingCommands.push(existing.command);
      return waitForCommandResult(existing, effectiveTimeoutMs);
    }
    if (existing.receipt.state === 'queued' && !existing.deliveryRegistered) {
      const gateFailure = preDispatchGate();
      if (gateFailure) return gateFailure;
      existing.command.params = params;
      existing.deliveryRegistered = true;
      if (!dispatchCommand(existing.command)) pendingCommands.push(existing.command);
    }
    return waitForCommandResult(existing, effectiveTimeoutMs);
  }

  if (requestedId && existsSync(receiptFile(id))) {
    // A durable receipt file exists but could not be parsed/loaded. Dispatching
    // under that identity could duplicate a previously claimed mutation.
    return { protocol: COMMAND_RESULT_PROTOCOL, id, ok: false, error: 'uxp_bridge_receipt_corrupt' };
  }

  // These are deliberately pre-dispatch gates. A stale companion must never
  // receive a mutation merely because it is still holding an older long-poll.
  const gateFailure = preDispatchGate();
  if (gateFailure) return gateFailure;

  pruneCommandReceipts();
  if (commandRecords.size >= MAX_COMMAND_RECEIPTS) {
    return { protocol: COMMAND_RESULT_PROTOCOL, id, ok: false, error: 'uxp_bridge_receipt_capacity_exceeded' };
  }

  const command: UxpBridgeCommand = { protocol: COMMAND_REQUEST_PROTOCOL, id, action, params };
  const now = new Date().toISOString();
  const record: UxpBridgeCommandRecord = {
    command,
    paramsSignature,
    receipt: {
      protocol: COMMAND_RECEIPT_PROTOCOL,
      command_id: id,
      action,
      state: 'queued',
      terminal: false,
      created_at: now,
      updated_at: now,
    },
    durable: Boolean(requestedId),
    deliveryRegistered: false,
  };
  try {
    persistCommandRecord(record);
  } catch (error) {
    return {
      id,
      protocol: COMMAND_RESULT_PROTOCOL,
      ok: false,
      error: `uxp_bridge_receipt_persist_failed:${error instanceof Error ? error.message : String(error)}`,
    };
  }
  commandRecords.set(id, record);
  record.deliveryRegistered = true;
  if (!dispatchCommand(command)) pendingCommands.push(command);
  return waitForCommandResult(record, effectiveTimeoutMs);
}

export async function shutdownUxpBridgeServer(): Promise<void> {
  if (!server) return;
  for (const waiter of pendingPolls.splice(0)) {
    clearTimeout(waiter.timer);
    if (!waiter.res.writableEnded && !waiter.res.destroyed) waiter.res.destroy();
  }
  for (const [id, waiters] of resultWaiters) {
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve({ protocol: COMMAND_RESULT_PROTOCOL, id, ok: false, error: 'uxp_bridge_shutdown' });
    }
  }
  resultWaiters.clear();
  commandRecords.clear();
  eventListeners.clear();
  pendingCommands.length = 0;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
  lastPluginPollAt = 0;
  pluginPollCount = 0;
  pluginBridgeRevision = null;
  pluginPhotoshopVersion = null;
  pluginDocumentCount = null;
  pluginActiveDocument = null;
}
