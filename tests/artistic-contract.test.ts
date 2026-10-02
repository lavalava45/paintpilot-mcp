import { describe, expect, it } from 'vitest';
import {
  comparisonSpecificationForOperation,
  deriveArtisticOutcome,
  deriveComparisonMetric,
  deriveExecutionOutcome,
  evaluatePaintingProfileTransition,
  globalCompletionAllowed,
  normalizeArtisticEvaluationContract,
  normalizeGlobalBriefAssessment,
} from '../src/core/guard/artistic-contract.js';

function contract(overrides: Record<string, unknown> = {}) {
  return normalizeArtisticEvaluationContract({
    contract_id: 'brief-contract',
    revision: 1,
    positive_criteria: ['The stream must read as a winding spatial path, not a flat stripe.'],
    failure_signals: ['The stream reads as a uniform primitive stripe.'],
    protected_qualities: ['Quiet negative space around the main path.'],
    stage_transition_expectations: ['Do not advance to decorative detail while the main spatial path is unresolved.'],
    final_evidence_requirements: ['Whole-frame evidence shows the requested spatial hierarchy.'],
    provenance: [{ source: 'user_brief', detail: 'Derived from the requested winding mountain-stream composition.' }],
    ...overrides,
  });
}

describe('artistic contract semantics', () => {
  it('keeps execution, local artistic, and global brief outcomes independent', () => {
    expect(deriveExecutionOutcome({ phase: 'completed', failed: false })).toBe('completed');
    expect(deriveExecutionOutcome({
      phase: 'completed',
      failed: false,
      execution: 'partial',
      resolved: { outcome: 'partial' },
    })).toBe('uncertain');
    expect(deriveArtisticOutcome({ verdict: 'neutral', target_resolved: 'no', regressions: [] })).toBe('unresolved');
    const global = normalizeGlobalBriefAssessment(undefined, { contract: contract(), frame: { sha256: 'a'.repeat(64) } });
    expect(global).toMatchObject({ outcome: 'not-evaluated', validation: 'not-independently-validated' });
    expect(globalCompletionAllowed(global)).toBe(false);
  });

  it('allows only the monotonic simple_graphic -> nontrivial_painting upgrade after obligations are met', () => {
    const blocked = evaluatePaintingProfileTransition({
      current: 'simple_graphic', requested: 'nontrivial_painting', brush_preflight: { completed: true },
    });
    expect(blocked).toMatchObject({ allowed: false, allowed_transition: 'simple_graphic -> nontrivial_painting' });
    expect(blocked.allowed === false && blocked.unmet_obligations).toContain('brush_preflight.inventory_observed=true');

    const allowed = evaluatePaintingProfileTransition({
      current: 'simple_graphic', requested: 'nontrivial_painting',
      brush_preflight: { completed: true, inventory_observed: true, roles: [{ role_id: 'broad-form' }] },
    });
    expect(allowed).toMatchObject({ allowed: true, profile: 'nontrivial_painting', transition: { monotonic: true } });
    expect(evaluatePaintingProfileTransition({ current: 'nontrivial_painting', requested: 'simple_graphic' }))
      .toMatchObject({ allowed: false, unmet_obligations: ['painting_profile downgrade is forbidden'] });
  });

  it('degrades a mismatched BEFORE/AFTER machine comparison without changing the artistic verdict', () => {
    const specification = comparisonSpecificationForOperation({
      args: { document_id: 42 }, preview_args: { max_dimension: 1200, color_mode: 'RGB' },
    });
    const metric = deriveComparisonMetric({
      before: { document_id: 42, width: 1200, height: 800 },
      after: { document_id: 42, width: 600, height: 400 },
      significance: { reason: 'geometry mismatch' },
      specification,
    });
    expect(metric).toMatchObject({ status: 'unavailable' });
    expect(deriveArtisticOutcome({ verdict: 'improvement', target_resolved: 'yes', regressions: [] })).toBe('resolved');
  });

  it('freezes open-ended criteria by revision instead of a style enum', () => {
    const first = contract({ positive_criteria: ['A previously unseen ferrofluid-lithograph phrase remains image-observable.'] });
    expect(first.positive_criteria[0]).toContain('ferrofluid-lithograph');
    expect(() => normalizeArtisticEvaluationContract({ ...first, positive_criteria: ['Changed after seeing pixels.'] }, first))
      .toThrow(/higher revision/);
    const revised = normalizeArtisticEvaluationContract({
      ...first,
      revision: 2,
      positive_criteria: ['Changed criterion after an explicit brief revision.'],
      provenance: [...first.provenance, { source: 'art_director_revision', detail: 'User explicitly changed the desired visual reading.' }],
    }, first);
    expect(revised.revision).toBe(2);
    expect(() => normalizeArtisticEvaluationContract({
      ...revised,
      contract_id: 'new-id-cannot-reset-revision',
      revision: 1,
    }, revised)).toThrow(/higher revision|cannot decrease/);
  });

  it('can judge the same frame differently under contrasting brief-derived contracts without code branches', () => {
    const sha = 'b'.repeat(64);
    const flatGraphic = contract({
      contract_id: 'flat-graphic',
      positive_criteria: ['Large flat geometric masses should remain visibly simple.'],
      failure_signals: ['Unwanted modelling makes the masses read volumetrically.'],
    });
    const spatialPainting = contract({
      contract_id: 'spatial-painting',
      positive_criteria: ['Major forms must read with convincing spatial depth.'],
      failure_signals: ['Large forms remain flat primitive blocks.'],
    });
    const accepted = normalizeGlobalBriefAssessment({
      outcome: 'satisfied', contract_id: flatGraphic.contract_id, contract_revision: 1,
      frame_sha256: sha, critic_authority: 'authorized', critic_result_id: 'critic-flat-1',
      reason: 'The same frame matches the intentionally flat brief.',
    }, { contract: flatGraphic, frame: { sha256: sha } });
    const rejected = normalizeGlobalBriefAssessment({
      outcome: 'unsatisfied', contract_id: spatialPainting.contract_id, contract_revision: 1,
      frame_sha256: sha, critic_authority: 'authorized', critic_result_id: 'critic-spatial-1',
      reason: 'The same frame remains too flat for the spatial brief.',
    }, { contract: spatialPainting, frame: { sha256: sha } });
    expect(accepted.outcome).toBe('satisfied');
    expect(rejected.outcome).toBe('unsatisfied');
  });

  it('keeps a known weak block-in unresolved even after technically successful execution', () => {
    const execution = deriveExecutionOutcome({ phase: 'completed', failed: false });
    const artistic = deriveArtisticOutcome({ verdict: 'neutral', target_resolved: 'no', regressions: [] });
    expect({ execution, artistic }).toEqual({ execution: 'completed', artistic: 'unresolved' });
  });

  it('does not let relative-best status complete a still-unsatisfied global brief', () => {
    const active = contract();
    const assessment = normalizeGlobalBriefAssessment({
      outcome: 'unsatisfied', contract_id: active.contract_id, contract_revision: active.revision,
      frame_sha256: 'c'.repeat(64), critic_authority: 'authorized', critic_result_id: 'critic-relative-best',
      criteria: ['Current frame is stronger than the prior anchor but the stream still reads too flat.'],
      reason: 'Best so far remains materially short of the brief.',
    }, { contract: active, frame: { sha256: 'c'.repeat(64) } });
    expect(assessment).toMatchObject({ outcome: 'unsatisfied', validation: 'independently-validated' });
    expect(globalCompletionAllowed(assessment)).toBe(false);
  });

  it('tracks hard-perceptual brief debt explicitly and blocks satisfied completion while hard debt remains', () => {
    const active = contract({
      brief_items: [
        { item_id: 'guardian-lions', kind: 'hard_perceptual', requirement: 'Two guardian lion forms must read recognizably as lions.', provenance: 'user_brief:named required subjects' },
        { item_id: 'extra-snow', kind: 'soft_preference', requirement: 'Additional fine snow texture is welcome if it does not obscure form.', provenance: 'user_brief:secondary preference' },
      ],
    });
    const sha = 'd'.repeat(64);
    expect(() => normalizeGlobalBriefAssessment({
      outcome: 'satisfied', contract_id: active.contract_id, contract_revision: active.revision,
      frame_sha256: sha, critic_authority: 'authorized', critic_result_id: 'critic-hard-debt',
      brief_item_results: [
        { item_id: 'guardian-lions', state: 'NOT_MET', reason: 'The crop remains an abstract symmetric stone mass.', evidence: ['OBJECT crop lacks a readable muzzle/body landmark pattern.'] },
        { item_id: 'extra-snow', state: 'MET', reason: 'Fine snow texture is visible.' },
      ],
      reason: 'Attempted final review.',
    }, { contract: active, frame: { sha256: sha } })).toThrow(/unresolved hard brief debt/);

    const uncertain = normalizeGlobalBriefAssessment({
      outcome: 'uncertain', contract_id: active.contract_id, contract_revision: active.revision,
      frame_sha256: sha, critic_authority: 'authorized', critic_result_id: 'critic-hard-uncertain',
      brief_item_results: [
        { item_id: 'guardian-lions', state: 'UNCERTAIN', reason: 'Whole-frame read is ambiguous and needs an OBJECT crop.' },
        { item_id: 'extra-snow', state: 'MET', reason: 'Fine snow texture is visible.' },
      ],
      reason: 'Named-object identity is not yet proven.',
    }, { contract: active, frame: { sha256: sha } });
    expect(uncertain.unresolved_hard_brief_debt).toEqual([
      expect.objectContaining({ item_id: 'guardian-lions', state: 'UNCERTAIN', kind: 'hard_perceptual' }),
    ]);
    expect(globalCompletionAllowed(uncertain)).toBe(false);

    const satisfied = normalizeGlobalBriefAssessment({
      outcome: 'satisfied', contract_id: active.contract_id, contract_revision: active.revision,
      frame_sha256: sha, critic_authority: 'authorized', critic_result_id: 'critic-hard-met',
      brief_item_results: [
        { item_id: 'guardian-lions', state: 'MET', reason: 'The held-out OBJECT crop visibly supports the required lion identity.' },
        { item_id: 'extra-snow', state: 'UNASSESSED', reason: 'Optional snow polish is not required for completion.' },
      ],
      reason: 'All hard perceptual requirements are independently validated.',
    }, { contract: active, frame: { sha256: sha } });
    expect(satisfied.unresolved_hard_brief_debt).toEqual([]);
    expect(globalCompletionAllowed(satisfied)).toBe(true);
  });

  it('rewrites unsupported global claims as not independently validated', () => {
    const active = contract();
    const frame = { sha256: 'd'.repeat(64) };
    const missingCritic = normalizeGlobalBriefAssessment({
      outcome: 'satisfied', contract_id: active.contract_id, contract_revision: active.revision,
      frame_sha256: frame.sha256, critic_authority: 'shadow', critic_result_id: 'shadow-1', reason: 'Shadow-only review.',
    }, { contract: active, frame });
    expect(missingCritic).toMatchObject({
      outcome: 'not-evaluated', requested_outcome: 'satisfied', validation: 'not-independently-validated',
    });
    expect((missingCritic.missing_evidence as string[])).toContain('authorized critic result');
  });
});
