import { createHash } from 'node:crypto';

type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type RGB = { red: number; green: number; blue: number };
export class FormFieldError extends Error {
  constructor(
    readonly path: string,
    message: string
  ) {
    super(message);
  }
}
export function authoredFormField(value: unknown, bounds: Bounds, maxDimension = 192) {
  const f = value as any;
  const fail = (path: string, text: string): never => {
    throw new FormFieldError(`painterly.form_field.${path}`, text);
  };
  const finite = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6;
  const point = (p: any, path: string): Point => {
    if (!p || !finite(p.x) || !finite(p.y)) fail(path, 'Choose finite canvas coordinates');
    return { x: p.x, y: p.y };
  };
  const color = (c: any, path: string): RGB => {
    if (!c || !['red', 'green', 'blue'].every((k) => finite(c[k]) && c[k] >= 0 && c[k] <= 255))
      fail(path, 'Choose RGB channels in [0,255]');
    return { red: c.red, green: c.green, blue: c.blue };
  };
  if (!f || !['ellipsoid', 'light-field'].includes(f.kind))
    fail(
      'kind',
      'Choose ellipsoid (volume) or light-field (broad illumination), not an invented image reference'
    );
  const center = point(f.center, 'center'),
    radius = point(f.radius, 'radius');
  if (radius.x <= 0 || radius.y <= 0) fail('radius', 'Radii must be positive');
  const shadow = color(f.shadow_color, 'shadow_color'),
    light = color(f.light_color, 'light_color');
  if (['red', 'green', 'blue'].every((k) => shadow[k as keyof RGB] === light[k as keyof RGB]))
    fail('light_color', 'Volume/light refinement needs distinct chosen shadow and light colors');
  if (
    !Array.isArray(f.light_direction) ||
    f.light_direction.length !== 3 ||
    !f.light_direction.every(finite) ||
    Math.hypot(...f.light_direction) < 1e-8
  )
    fail(
      'light_direction',
      'Choose a nonzero [x,y,z] light direction; negative x illuminates the left side'
    );
  const direction = f.light_direction.map((v: number) => v / Math.hypot(...f.light_direction));
  const rotation = f.rotation_degrees ?? 0,
    ambient = f.ambient ?? 0.15;
  if (!finite(rotation) || !finite(ambient) || ambient < 0 || ambient > 0.8)
    fail('ambient', 'Finite rotation and ambient in [0,0.8] are required');
  const w = bounds.right - bounds.left,
    h = bounds.bottom - bounds.top;
  if (
    ![w, h, maxDimension].every(finite) ||
    w <= 0 ||
    h <= 0 ||
    maxDimension < 32 ||
    maxDimension > 384
  )
    fail('bounds', 'Use positive current-canvas bounds and max_dimension 32..384');
  const factor = Math.min(1, maxDimension / Math.max(w, h));
  const width = Math.max(1, Math.round(w * factor)),
    height = Math.max(1, Math.round(h * factor));
  const data = new Uint8Array(width * height * 4);
  const angle = (rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = bounds.left + ((x + 0.5) / width) * w - center.x;
      const dy = bounds.top + ((y + 0.5) / height) * h - center.y;
      const u = (cos * dx + sin * dy) / radius.x,
        v = (-sin * dx + cos * dy) / radius.y;
      let intensity: number;
      if (f.kind === 'ellipsoid') {
        const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
        const nx = (cos * u - sin * v) / radius.x,
          ny = (sin * u + cos * v) / radius.y,
          nz = z / Math.sqrt(radius.x * radius.y);
        const norm = Math.hypot(nx, ny, nz) || 1;
        intensity = Math.max(0, (nx * direction[0] + ny * direction[1] + nz * direction[2]) / norm);
      } else {
        intensity = Math.exp(-0.5 * (u * u + v * v));
      }
      const amount = ambient + (1 - ambient) * intensity,
        offset = (y * width + x) * 4;
      ['red', 'green', 'blue'].forEach((k, i) => {
        data[offset + i] = Math.round(
          shadow[k as keyof RGB] + amount * (light[k as keyof RGB] - shadow[k as keyof RGB])
        );
      });
      data[offset + 3] = 255;
    }
  const normalized = {
    kind: f.kind,
    center,
    radius,
    light_direction: direction,
    rotation_degrees: rotation,
    shadow_color: shadow,
    light_color: light,
    ambient,
  };
  return {
    width,
    height,
    data,
    sha256: createHash('sha256').update(JSON.stringify(normalized)).update(data).digest('hex'),
    field: normalized,
  };
}
const point = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
  additionalProperties: false,
};
const rgb = {
  type: 'object',
  properties: Object.fromEntries(
    ['red', 'green', 'blue'].map((k) => [k, { type: 'number', minimum: 0, maximum: 255 }])
  ),
  required: ['red', 'green', 'blue'],
  additionalProperties: false,
};
export const FORM_FIELD_SCHEMA = {
  type: 'object',
  description:
    'Explicit authored analytic form/light target, NOT a photographic reference or anatomy inference. All colors and lighting are chosen by the artist. Generates bounded shape-following brush marks through the normal painterly executor.',
  properties: {
    kind: { type: 'string', enum: ['ellipsoid', 'light-field'] },
    center: point,
    radius: point,
    light_direction: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
    rotation_degrees: { type: 'number' },
    shadow_color: rgb,
    light_color: rgb,
    ambient: { type: 'number', minimum: 0, maximum: 0.8 },
  },
  required: ['kind', 'center', 'radius', 'light_direction', 'shadow_color', 'light_color'],
  additionalProperties: false,
};
