import { describe, expect, it } from 'vitest';
import {
  collectCompactRequiredEnvelopeViolations,
  collectCompactDocumentGateViolations,
  collectCompactDirectBundleViolations,
} from '../src/core/guard/compact-envelope-gates.js';

describe('compact envelope gate extraction', () => {
  it('keeps all three missing-field diagnostics in their original order and shape', () => {
    expect(collectCompactRequiredEnvelopeViolations({ actionCount: 0 })).toEqual([
      { scope: 'next_operation', code: 'compact_request_key_required', message: 'next_pass.request_key must be a non-empty string' },
      { scope: 'next_operation', code: 'compact_goal_required', message: 'next_pass.goal must be a non-empty string' },
      { scope: 'next_operation', code: 'compact_actions_required', message: 'next_pass.actions must contain executable actions' },
    ]);
  });

  it('allows a registered anchor restore without executable actions', () => {
    expect(collectCompactRequiredEnvelopeViolations({
      requestKey: 'restore', goal: 'Undo to accepted frame', restoreAnchorOperationId: 'anchor', actionCount: 0,
    })).toEqual([]);
    expect(collectCompactRequiredEnvelopeViolations({
      requestKey: 'paint', goal: 'Fill one region', actionCount: 1,
    })).toEqual([]);
  });

  it('does not let restore bypass request-key and goal requirements', () => {
    expect(collectCompactRequiredEnvelopeViolations({ restoreAnchorOperationId: 'anchor', actionCount: 0 })
      .map(issue => issue.code)).toEqual(['compact_request_key_required', 'compact_goal_required']);
  });

  it('preserves strict numeric non-bootstrap document identity', () => {
    const required = [{
      scope: 'next_operation', code: 'compact_pass_document_required',
      message: 'next_pass.document_id is required for every non-bootstrap Photoshop pass',
    }];
    for (const invalid of [undefined, null, 0, -1, 1.5, '42', Number.NaN, Number.POSITIVE_INFINITY])
      expect(collectCompactDocumentGateViolations(invalid, false)).toEqual(required);
    expect(collectCompactDocumentGateViolations(42, false)).toEqual([]);
  });

  it('preserves the bootstrap document-forbidden diagnostic even for null', () => {
    const forbidden = [{
      scope: 'next_operation', code: 'compact_bootstrap_document_forbidden',
      message: 'next_pass.document_id must be omitted for photoshop_create_document/photoshop_open_image because the target document does not exist yet',
    }];
    expect(collectCompactDocumentGateViolations(undefined, true)).toEqual([]);
    expect(collectCompactDocumentGateViolations(null, true)).toEqual(forbidden);
    expect(collectCompactDocumentGateViolations(42, true)).toEqual(forbidden);
  });

  it('retains the exact refusal for a bundle of two direct operations', () => {
    expect(collectCompactDirectBundleViolations([
      { tool: 'photoshop_save_document' }, { tool: 'photoshop_get_state' },
    ])).toEqual([{
      scope: 'next_operation', code: 'compact_pass_multiple_direct_operations',
      message: 'next_pass cannot bundle multiple direct Photoshop operations into one durable Guard operation; submit each direct operation as its own guarded pass (for example, save PSD and PNG in two sequential passes)',
    }]);
  });

  it('allows one direct operation or a bundle containing a VisualMicroPlan mutation', () => {
    expect(collectCompactDirectBundleViolations([{ tool: 'photoshop_save_document' }])).toEqual([]);
    expect(collectCompactDirectBundleViolations([
      { tool: 'photoshop_save_document' }, { tool: 'photoshop_paint_regions' },
    ])).toEqual([]);
  });
});
