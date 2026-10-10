import { describe, expect, it } from 'vitest';
import {
  PaintingIntentError,
  paintingIntentFingerprint,
  parsePaintingIntent,
} from '../src/core/guard/painting-intent.js';

describe('PaintingIntent', () => {
  it('normalizes compact artistic input without retaining caller-owned mutable data', () => {
    const input = {
      request_key: ' intent-01 ',
      problem_id: ' material-read ',
      document_id: 42,
      goal: ' Refine the coat material. ',
      target_owner_id: ' coat-owner ',
      action: 'REFINE',
      scale: 'MEDIUM',
      visual_intent: 'DIRECTIONAL-MASS',
      preserve: ['background', ' background ', '', 'rim-light'],
      region_bounds: { left: 10, top: 20, right: 110, bottom: 160 },
      actions: [{
        id: 'coat-strokes',
        tool: 'photoshop_paint_strokes',
        args: { strokes: [{ points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }] },
      }],
    };

    const parsed = parsePaintingIntent(input);

    expect(parsed).toMatchObject({
      request_key: 'intent-01',
      problem_id: 'material-read',
      document_id: 42,
      goal: 'Refine the coat material.',
      target_owner_id: 'coat-owner',
      action: 'refine',
      scale: 'medium',
      visual_intent: 'directional-mass',
      preserve: ['background', 'rim-light'],
      region_bounds: { left: 10, top: 20, right: 110, bottom: 160 },
    });
    expect(parsed.actions).not.toBe(input.actions);
    expect(parsed.actions?.[0]).not.toBe(input.actions[0]);

    (input.actions[0].args.strokes[0].points[0] as { x: number }).x = 999;
    expect((parsed.actions?.[0]?.args as any).strokes[0].points[0].x).toBe(10);
  });

  it('produces a deterministic fingerprint independent of object key insertion order', () => {
    const first = parsePaintingIntent({
      request_key: 'intent-deterministic',
      problem_id: 'shape-read',
      document_id: 42,
      goal: 'Refine the silhouette.',
      target_owner_id: 'hero-owner',
      action: 'refine',
      visual_intent: 'hard-edge',
      scale: 'medium',
      preserve: ['continuousField-owner', 'ground-owner'],
      actions: [{
        id: 'edge-pass',
        tool: 'photoshop_paint_strokes',
        args: { layer_id: 7, strokes: [{ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] },
      }],
    });
    const second = parsePaintingIntent({
      actions: [{
        args: { strokes: [{ points: [{ y: 2, x: 1 }, { y: 4, x: 3 }] }], layer_id: 7 },
        tool: 'photoshop_paint_strokes',
        id: 'edge-pass',
      }],
      preserve: ['continuousField-owner', 'ground-owner'],
      scale: 'medium',
      visual_intent: 'hard-edge',
      action: 'refine',
      target_owner_id: 'hero-owner',
      goal: 'Refine the silhouette.',
      document_id: 42,
      problem_id: 'shape-read',
      request_key: 'intent-deterministic',
    });

    expect(paintingIntentFingerprint(first)).toBe(paintingIntentFingerprint(second));
  });

  it('fails closed on invalid artistic enums and invalid region geometry', () => {
    expect(() => parsePaintingIntent({
      request_key: 'invalid-action',
      problem_id: 'shape',
      document_id: 42,
      goal: 'Do work.',
      action: 'guess',
      visual_intent: 'mass',
    })).toThrowError(PaintingIntentError);

    try {
      parsePaintingIntent({
        request_key: 'invalid-bounds',
        problem_id: 'shape',
        document_id: 42,
        goal: 'Do work.',
        action: 'add',
        visual_intent: 'mass',
        region_bounds: { left: 20, top: 10, right: 10, bottom: 30 },
      });
      throw new Error('expected parsePaintingIntent to reject invalid bounds');
    } catch (error) {
      expect(error).toBeInstanceOf(PaintingIntentError);
      expect((error as PaintingIntentError).code).toBe('painting_intent_region_bounds_invalid');
    }
  });
});
