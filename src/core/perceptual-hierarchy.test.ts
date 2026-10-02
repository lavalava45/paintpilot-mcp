import { describe, expect, it } from 'vitest';
import {
  attentionBindingStaleness,
  normalizeAttentionBinding,
  normalizePerceptualHierarchy,
} from './perceptual-hierarchy.js';

const ranked = {
  revision: 1,
  mode: 'ranked',
  zones: [
    { id: 'hero', owner_ids: ['train'], priority: 'primary', contrast_budget: 'high', detail_budget: 'high', edge_certainty: 'high', chroma_accent: 'allowed' },
    { id: 'background', owner_ids: ['mountains'], priority: 'support', contrast_budget: 'low', detail_budget: 'low', edge_certainty: 'low', chroma_accent: 'restricted' },
  ],
  ordering: ['hero', 'background'],
};

describe('Durable Art Director perceptual hierarchy', () => {
  it('normalizes ranked owner/zone budgets and rejects duplicate owner allocation', () => {
    expect(normalizePerceptualHierarchy(ranked)).toMatchObject({ revision: 1, mode: 'ranked', ordering: ['hero', 'background'] });
    expect(() => normalizePerceptualHierarchy({
      ...ranked,
      zones: [...ranked.zones, { ...ranked.zones[1], id: 'duplicate', owner_ids: ['train'] }],
    })).toThrow(/only one attention zone/);
    expect(() => normalizePerceptualHierarchy({
      ...ranked,
      zones: ranked.zones.map(zone => ({ ...zone, priority: 'primary' })),
    })).toThrow(/cannot mark every zone primary/);
  });

  it('supports an explicitly distributed flat/all-over attention contract', () => {
    const result = normalizePerceptualHierarchy({
      revision: 1, mode: 'distributed',
      zones: [{ id: 'field', owner_ids: ['whole-field'], priority: 'distributed', contrast_budget: 'medium', detail_budget: 'medium', edge_certainty: 'medium', chroma_accent: 'allowed' }],
      ordering: [],
    });
    expect(result).toMatchObject({ mode: 'distributed', ordering: [] });
    expect(result).not.toHaveProperty('distributed_attention_rationale');
    expect(() => normalizePerceptualHierarchy({
      revision: 1, mode: 'distributed',
      zones: [{ id: 'field', owner_ids: ['whole-field'], priority: 'primary', contrast_budget: 'medium', detail_budget: 'medium', edge_certainty: 'medium', chroma_accent: 'allowed' }],
      ordering: [],
    })).toThrow(/priority=distributed/);
  });

  it('stales a bound owner when focal ordering or its zone budget changes, but not for an unrelated zone-only revision', () => {
    const before = normalizePerceptualHierarchy(ranked);
    const binding = normalizeAttentionBinding({ hierarchy_revision: 1, zone_id: 'hero', dimensions: ['contrast', 'detail', 'edge'] });
    const changedHero = normalizePerceptualHierarchy({
      ...ranked, revision: 2,
      zones: [{ ...ranked.zones[0], detail_budget: 'medium' }, ranked.zones[1]],
    });
    expect(attentionBindingStaleness(binding, changedHero, before)).toMatchObject({ stale: true, changed_dependency_ids: ['zone:hero'] });
    const unrelated = normalizePerceptualHierarchy({
      ...ranked, revision: 3,
      zones: [ranked.zones[0], { ...ranked.zones[1], detail_budget: 'medium' }],
    });
    expect(attentionBindingStaleness(binding, unrelated, before)).toMatchObject({ stale: false, changed_dependency_ids: [] });

    const reordered = normalizePerceptualHierarchy({ ...ranked, revision: 4, ordering: ['background', 'hero'] });
    expect(attentionBindingStaleness(binding, reordered, before)).toMatchObject({ stale: true, changed_dependency_ids: ['ordering'] });
  });
});
