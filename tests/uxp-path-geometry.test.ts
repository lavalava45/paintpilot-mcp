import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { bezierCriticalPoints } from '../src/core/bezier-geometry.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';

it('adapts public incoming/outgoing handles consistently for native regions and strokes', () => {
  const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
    .replace(/\npollLoop\(\);\s*$/, '\n');
  expect(source).toContain(`const BRIDGE_REVISION = '${UXP_BRIDGE_REVISION}'`);
  const bridge = runInNewContext(source + '\n({ makeUxpRegionSubPath, makeUxpStrokeSubPath, bezierCriticalPoints, assertCanvasPoint })', {
    require: (name: string) => name === 'uxp'
      ? { entrypoints: { setup() {} }, storage: {} }
      : {
        app: { PathPointInfo: class {}, SubPathInfo: class {} },
        action: {}, core: {},
        constants: { PointKind: { SMOOTHPOINT: 'smooth', CORNERPOINT: 'corner' },
          ShapeOperation: { SHAPEADD: 'add', SHAPESUBTRACT: 'subtract' } },
      },
  });
  const points = [
    { x: 80, y: 140, left: [70, 150], right: [90, 40], smooth: true },
    { x: 180, y: 140, left: [190, 120] },
    { x: 180, y: 220 },
  ];
  const authored = structuredClone(points);
  for (const path of [bridge.makeUxpRegionSubPath({ points }), bridge.makeUxpStrokeSubPath({ points })]) {
    expect(path.entireSubPath[0]).toMatchObject({ anchor: [80, 140],
      leftDirection: [90, 40], rightDirection: [70, 150], kind: 'smooth' });
    expect(path.entireSubPath[1]).toMatchObject({ anchor: [180, 140],
      leftDirection: [180, 140], rightDirection: [190, 120], kind: 'corner' });
    expect(path.entireSubPath[2]).toMatchObject({ anchor: [180, 220],
      leftDirection: [180, 220], rightDirection: [180, 220] });
  }
  expect(points).toEqual(authored);
  const bounded = [{ x:5, y:5, right:[-5,10] }, { x:5, y:15, left:[15,10] }];
  for (const criticalPoints of [bezierCriticalPoints, bridge.bezierCriticalPoints]) {
    const actual = criticalPoints(bounded);
    expect(Math.min(...actual.map((p: { x: number }) => p.x))).toBeCloseTo(2.113248654, 7);
    expect(Math.max(...actual.map((p: { x: number }) => p.x))).toBeCloseTo(7.886751346, 7);
    for (const p of actual) expect(() => bridge.assertCanvasPoint(p, 'curve',20,20)).not.toThrow();
    expect(() => criticalPoints([{ x:5,y:5,right:[NaN,10] }, { x:5,y:15 }])).toThrow(/non-finite/i);
    const closing = [{ x:5,y:5,left:[-50,-50] }, { x:5,y:15 }];
    expect(Math.min(...criticalPoints(closing,false).map((p: { x: number }) => p.x))).toBe(5);
    expect(Math.min(...criticalPoints(closing,true).map((p: { x: number }) => p.x))).toBeLessThan(0);
  }
  expect(bridge.bezierCriticalPoints(bounded,true,[{ x:1,y:-1,offset:2,crossings:true }]))
    .toEqual(bezierCriticalPoints(bounded,true,[{ x:1,y:-1,offset:2,crossings:true }]));
});
