// Project-authored declarations for the small upstream API used by contour-geometry.
declare module 'bezier-js' {
  export class Bezier {
    constructor(points: Array<{ x: number; y: number }>);
    points: Array<{ x: number; y: number }>;
    get(t: number): { x: number; y: number };
    split(t: number): { left: Bezier; right: Bezier };
  }
}
