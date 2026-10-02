import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../src/core/guard/session-store.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function makeStore() {
  const root = mkdtempSync(path.join(tmpdir(), 'manual-document-close-'));
  roots.push(root);
  return new SessionStore(path.join(root, 'controller'), {
    visualBarrierDirectory: path.join(root, 'barriers'),
    workspaceRoot: root,
  });
}

function witness(token: string) {
  return {
    protocol: 'photoshop.uxp.document_instance_witness.v1',
    session_id: 'uxp-test-session',
    token,
  };
}

function uncertainVisual(store: SessionStore, id: string, documentId: number) {
  const sequence = store.records().length + 1;
  store.write({
    id,
    tool: 'photoshop_delete_layer',
    args: { document_id: documentId, layer_id: 7 },
    summary: `Visual work for document ${documentId}`,
    purpose: 'Create an interrupted document-scoped workflow for close recovery coverage',
    hash: `${id}-hash`,
    sequence,
    created_at: '2026-10-03T00:00:00.000Z',
    phase: 'uncertain',
    visual: true,
    failed: true,
    execution: 'uncertain',
    dispatched: true,
    guard_ack_required: true,
    operation_receipt: {
      protocol: 'photoshop.guard.operation_receipt.v1',
      operation_id: id,
      token: `${id}-token`,
      issued_at: '2026-10-03T00:00:00.000Z',
      phase: 'uncertain',
      execution: 'uncertain',
    },
  });
  store.setVisualBarrier(documentId, {
    planId: id,
    operationId: id,
    operationSequence: sequence,
    requiresExternalPreview: true,
  });
  store.setWorkflowLifecycle(documentId, 'active', 'operation_dispatched', id);
}

function runtimeWithDocuments(documents: Array<{ id: number; name?: string }> = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'manual-document-close-runtime-'));
  roots.push(root);
  const registry = new ToolRegistry();
  registry.register('photoshop_list_documents', {
    tool: {
      name: 'photoshop_list_documents',
      description: 'test document list',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    handler: async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, count: documents.length, documents, active_document_id: documents[0]?.id ?? null }),
      }],
    }),
  });
  const runtime = new EmbeddedGuardRuntime(registry, {
    runtimeDirectory: path.join(root, 'controller'),
    previewBarrierDirectory: path.join(root, 'barriers'),
    executionLeaseFile: path.join(root, 'execution.lock'),
    workspaceRoot: root,
    processVideoTraceEnabled: false,
    uxpReadinessProbe: async () => ({
      ready: true,
      transport: 'uxp',
      bridge_transport: 'long-poll',
      bridge_revision: UXP_BRIDGE_REVISION,
      expected_bridge_revision: UXP_BRIDGE_REVISION,
      revision_match: true,
      photoshop_version: '27.8',
      document_count: documents.length,
      active_document: documents[0] ?? null,
      plugin_connected: true,
      reason: null,
      checked_at: '2026-10-03T00:00:00.000Z',
      cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
    }),
  });
  return runtime;
}

describe('manual Photoshop document close recovery', () => {
  it('abandons only the closed document and clears its blocking Guard debt', () => {
    const store = makeStore();
    store.observeDocumentInstance(42, witness('doc-42'));
    store.observeDocumentInstance(43, witness('doc-43'));
    uncertainVisual(store, 'doc42-uncertain', 42);
    uncertainVisual(store, 'doc43-uncertain', 43);

    const result = store.abandonClosedDocument(42, {
      evidence_mode: 'uxp_document_close_notification',
      source: 'photoshop_uxp_notification',
      observed_at: '2026-10-03T00:00:00.000Z',
      document_instance_witness: witness('doc-42'),
    });

    expect(result).toMatchObject({
      abandoned: true,
      document_id: 42,
      abandoned_operations: ['doc42-uncertain'],
      workflow_stopped: true,
    });
    const compact = store.statusCompact();
    expect(compact.uncertain).not.toContain('doc42-uncertain');
    expect(compact.pending_reports).not.toContain('doc42-uncertain');
    expect(compact.pending_visual_verdicts).not.toContain('doc42-uncertain');
    expect(compact.active_jobs).toEqual([]);
    expect(compact.documents['42']?.next_required_action).toBe('ready');
    expect(compact.documents['42']?.workflow_lifecycle).toMatchObject({
      status: 'stopped',
      reason: 'abandoned_document_absent',
    });

    expect(compact.uncertain).toContain('doc43-uncertain');
    expect(compact.pending_reports).toContain('doc43-uncertain');
    expect(compact.pending_visual_verdicts).toContain('doc43-uncertain');
  });

  it('ignores a stale close event from an older document incarnation', () => {
    const store = makeStore();
    store.observeDocumentInstance(42, witness('current-doc-42'));
    uncertainVisual(store, 'current-doc42-uncertain', 42);

    const result = store.abandonClosedDocument(42, {
      evidence_mode: 'uxp_document_close_notification',
      source: 'photoshop_uxp_notification',
      document_instance_witness: witness('old-doc-42'),
    });

    expect(result).toMatchObject({
      abandoned: false,
      reason: 'stale_document_close_event',
      document_id: 42,
    });
    expect(store.statusCompact().uncertain).toContain('current-doc42-uncertain');
  });

  it('does not abandon a workflow for a Guard-controlled close notification', async () => {
    const runtime = runtimeWithDocuments([]);
    uncertainVisual(runtime.store, 'controlled-close-uncertain', 42);

    const result = await runtime.handleUxpBridgeEvent({
      event: 'document_closed',
      document_id: 42,
      controlled: true,
      observed_at: '2026-10-03T00:00:00.000Z',
      command_id: 'guard-close-command',
    });

    expect(result).toMatchObject({
      handled: true,
      ignored: true,
      reason: 'guard_controlled_close',
      document_id: 42,
    });
    expect(runtime.store.statusCompact().uncertain).toContain('controlled-close-uncertain');
  });

  it('keeps a successful Guard close terminal without fallback reclassifying it as abandonment', async () => {
    const runtime = runtimeWithDocuments([]);
    const close = runtime.store.begin({
      id: 'controlled-close-success',
      tool: 'photoshop_close_document',
      args: { document_id: 42, save: false },
      summary: 'Close the test document',
      purpose: 'Verify successful controlled close remains a normal terminal lifecycle boundary',
    }).record;
    runtime.store.markDispatched(close);
    runtime.store.complete(close, {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, closed: true, document_id: 42 }) }],
    });

    expect(runtime.store.paintingState().documents?.['42']?.workflow_lifecycle).toMatchObject({
      status: 'stopped',
      reason: 'controlled_document_close',
      operation_id: 'controlled-close-success',
    });
    const recovered = await (runtime as any).autoAbandonMissingDocuments('test_list_documents_fallback');
    expect(recovered).toEqual([]);
    expect(runtime.store.read('controlled-close-success')?.resolved?.outcome).not.toBe('abandoned');
  });

  it('self-heals a lost close event from fresh list_documents evidence', async () => {
    const runtime = runtimeWithDocuments([{ id: 43, name: 'StillOpen.psd' }]);
    uncertainVisual(runtime.store, 'lost-event-doc42', 42);
    uncertainVisual(runtime.store, 'open-doc43', 43);

    const recovered = await (runtime as any).autoAbandonMissingDocuments('test_list_documents_fallback');

    expect(recovered).toEqual(expect.arrayContaining([
      expect.objectContaining({ abandoned: true, document_id: 42 }),
    ]));
    const compact = runtime.store.statusCompact();
    expect(compact.uncertain).not.toContain('lost-event-doc42');
    expect(compact.documents['42']?.next_required_action).toBe('ready');
    expect(compact.uncertain).toContain('open-doc43');
  });
});
