import { describe, expect, it } from 'vitest';
import {
  collectConcreteMutationLayerIds,
  indexDurableOwnersByLayerId,
} from '../src/core/guard/compact-layer-targets.js';

describe('compact durable layer-target projections', () => {
  it('prefers the declared physical stack over the current layer for indexing', () => {
    const owner = { hypothesis_id: 'wall', layer_id: 99, physical_layer_ids: [11, 12] };
    const indexed = indexDurableOwnersByLayerId([owner]);
    expect(indexed.get(11)).toBe(owner);
    expect(indexed.get(12)).toBe(owner);
    expect(indexed.has(99)).toBe(false);
  });

  it('falls back to the current positive layer when no valid projected layers exist', () => {
    const owner = { hypothesis_id: 'window', layer_id: '17', physical_layer_ids: [0, -4, 'bad'] };
    expect(indexDurableOwnersByLayerId([owner]).get(17)).toBe(owner);
    expect(indexDurableOwnersByLayerId([{ layer_id: -1 }, { layer_id: 0 }]).size).toBe(0);
  });

  it('retains last-owner-wins behavior for colliding layer projections', () => {
    const first = { hypothesis_id: 'first', physical_layer_ids: [23] };
    const second = { hypothesis_id: 'second', physical_layer_ids: [23] };
    expect(indexDurableOwnersByLayerId([first, second]).get(23)).toBe(second);
  });

  it('collects nested snake/camel layer ids from mutation args without duplicates', () => {
    const targets = collectConcreteMutationLayerIds([
      { tool: 'paint', args: { regions: [{ layer_id: 8 }, { nested: { layerId: 9 } }, { layer_id: 8 }] } },
      { tool: 'fill', args: { target: [{ layerId: '10' }] } },
    ]);
    expect([...targets]).toEqual([8, 9, 10]);
  });

  it('ignores deferred references, invalid targets, and metadata outside args', () => {
    const targets = collectConcreteMutationLayerIds([
      { layer_id: 99, args: { layer_id: '$steps.new-layer.details.layerId', layerId: 0, other: { layer: 7 } } },
      { args: { layer_id: -2, layerId: 1.5, nested: [{ layer_id: null }, { layer_id: ' 5 ' }] } },
    ]);
    expect([...targets]).toEqual([5]);
  });
});
