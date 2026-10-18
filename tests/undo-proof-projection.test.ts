import { describe, expect, it } from 'vitest';
import { undoProofForPendingVerdict } from '../src/core/guard/undo-proof-projection.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const source = (status: string, actions: unknown[], steps?: number) => [{
  pass_execution: { history_ownership: {
    protocol: 'photoshop.guard.semantic_pass_history_ownership.v1',
    status, actions, ...(steps !== undefined ? { owned_history_steps: steps } : {}),
  } },
}];

describe('bounded public rollback proof, no fallback to guessed History steps', () => {
  it('exposes exact missing native History receipts before the model attempts an unsafe rollback', () => {
    expect(undoProofForPendingVerdict('photoshop_execute_visual_microplan', source('unproven', [
      { step_id: 'create-layer', history_steps: null },
      { step_id: 'roof-paint', history_steps: 1 },
    ]))).toMatchObject({
      status: 'unproven',
      source: 'missing-or-inexact-history-receipt',
      missing_history_step_ids: ['create-layer'],
    });
  });
  it('only reports an exact source as a CANDIDATE; does not authorize Undo', () => {
    const proof = undoProofForPendingVerdict('photoshop_execute_visual_microplan', source('exact', [
      { step_id: 'create-layer', history_steps: 2 },
      { step_id: 'roof-paint', history_steps: 1 },
    ], 3));
    expect(proof).toMatchObject({
      status: 'candidate-exact', source: 'native-history-receipt', owned_history_steps: 3,
    });
    expect(proof.guidance).toMatch(/Undo still requires/);
  });
  it('never promotes a zero, missing, forged or direct-tool source to an Undo candidate', () => {
    for (const [tool, bodies] of [
      ['photoshop_execute_visual_microplan', source('exact', [], 0)],
      ['photoshop_execute_visual_microplan', source('partial-or-uncertain', [], 3)],
      ['photoshop_execute_visual_microplan', source('unproven', [], 3)],
      ['photoshop_execute_visual_microplan', [{}]],
      ['photoshop_delete_layer', source('exact', [], 3)],
    ] as const) {
      expect(undoProofForPendingVerdict(tool, bodies).status).toBe('unproven');
    }
  });
  it('publishes a bounded read-only warning in photoshop_guard_resume, without touching pixels or History', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'guard-undo-readiness-'));
    try {
      const store = new SessionStore(path.join(dir, 'controller'), {
        workspaceRoot: dir, visualBarrierDirectory: path.join(dir, 'barriers'),
      });
      const receipt = { content: [{ type: 'text', text: JSON.stringify(source('unproven', [
        { step_id: 'layer', history_steps: null }, { step_id: 'color', history_steps: 1 },
      ])[0]) }] };
      store.write({
        id: 'new-roof-planes', sequence: 1, phase: 'completed', failed: false,
        tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
        created_at: '2026-10-18T16:00:00.000Z', visual: true,
        preview: { document_id: 42, sha256: 'a'.repeat(64), materialized_path: path.join(dir, 'after.jpg'),
          canvas_width: 1600, canvas_height: 1000 },
        result: receipt,
      });
      store.updatePaintingState(42, current => ({ ...current,
        current_frame: { operation_id: 'new-roof-planes', sha256: 'a'.repeat(64),
          path: path.join(dir, 'after.jpg'), accepted: false },
      }));
      const resume = store.resume(42) as any;
      expect(resume.pending_visual_verdict).toMatchObject({
        operation_id: 'new-roof-planes',
        undo_proof: { status: 'unproven',
          missing_history_step_ids: ['layer'] },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
