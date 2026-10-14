import { createHash } from 'node:crypto';
type Row = Record<string, any>;
type V = [number, number, number];
type P = { x: number; y: number; z: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
const dot = (a: V, b: V) => a.reduce((s, v, i) => s + v * b[i], 0);
const sub = (a: P, b: P): V => [a.x - b.x, a.y - b.y, a.z - b.z];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V): V => a.map((v) => v / Math.hypot(...a)) as V;
const inside = (p: { x: number; y: number }, polygon: P[]) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
};

/** Original 2.5D orthographic approximation; the artist supplies geometry, light and material. */
export function authoredSurfaceField(
  f: Row,
  bounds: Bounds,
  maxDimension: number,
  fail: (path: string, message: string) => never
) {
  const finite = (n: any) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6;
  const vector = (v: any, path: string): V => {
    if (!Array.isArray(v) || v.length !== 3 || !v.every(finite) || Math.hypot(...v) < 1e-8)
      fail(path, 'Choose a finite nonzero [x,y,z] vector');
    return unit(v as V);
  };
  const point = (p: any, path: string): P => {
    if (!p || !['x', 'y', 'z'].every((k) => finite(p[k])))
      fail(path, 'Choose finite shared-canvas x/y and depth z in the same units');
    return { x: p.x, y: p.y, z: p.z };
  };
  const color = (v: any, path: string): number[] => {
    if (!v || !['red', 'green', 'blue'].every((k) => finite(v[k]) && v[k] >= 0 && v[k] <= 255))
      fail(path, 'Choose RGB in [0,255]');
    return [v.red, v.green, v.blue];
  };
  const fraction = (n: any, def: number, path: string) => {
    const value = n ?? def;
    if (!finite(value) || value < 0 || value > 1) fail(path, 'Choose a value in [0,1]');
    return value as number;
  };
  const light = vector(f.light_direction, 'light_direction'),
    shadow = color(f.shadow_color, 'shadow_color'),
    lit = color(f.light_color, 'light_color');
  if (shadow.every((v, i) => v === lit[i]))
    fail('light_color', 'Choose distinct authored shadow and light colors');
  const ambient = fraction(f.ambient, 0.15, 'ambient');
  const w = bounds.right - bounds.left,
    h = bounds.bottom - bounds.top;
  if (
    ![w, h, maxDimension].every(finite) ||
    w <= 0 ||
    h <= 0 ||
    maxDimension < 32 ||
    maxDimension > 384
  )
    fail('bounds', 'Use positive bounds and max_dimension 32..384');
  const factor = Math.min(1, maxDimension / Math.max(w, h)),
    width = Math.max(1, Math.round(w * factor)),
    height = Math.max(1, Math.round(h * factor));
  const triangles: { vertices: P[]; normals: V[] }[] = [];
  let projected: P[] = [];
  let contact: P | undefined;
  let density = 1,
    falloff = 0;
  const addTriangle = (raw: any, path: string) => {
    if (!Array.isArray(raw.vertices) || raw.vertices.length !== 3)
      fail(path, 'Each surface is a triangle with exactly three vertices');
    const vertices = raw.vertices.map((p: any, i: number) => point(p, `${path}.vertices[${i}]`));
    const normal = cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0]));
    if (Math.hypot(...normal) < 1e-8 || Math.abs(normal[2]) < 1e-8)
      fail(path, 'Degenerate or edge-on triangle has no paintable projected area');
    if (raw.normals !== undefined && (!Array.isArray(raw.normals) || raw.normals.length !== 3))
      fail(`${path}.normals`, 'Supply one normal per vertex');
    triangles.push({
      vertices,
      normals: raw.normals
        ? raw.normals.map((n: any, i: number) => vector(n, `${path}.normals[${i}]`))
        : [unit(normal), unit(normal), unit(normal)],
    });
  };
  if (f.kind === 'surface') {
    if ((f.surfaces !== undefined) === (f.sections !== undefined))
      fail('surfaces', 'Choose authored triangles OR matching cross-sections');
    if (f.surfaces !== undefined) {
      if (!Array.isArray(f.surfaces) || !f.surfaces.length || f.surfaces.length > 128)
        fail('surfaces', 'Use 1..128 triangles');
      f.surfaces.forEach((t: any, i: number) => addTriangle(t, `surfaces[${i}]`));
    } else {
      if (!Array.isArray(f.sections) || f.sections.length < 2 || f.sections.length > 16)
        fail('sections', 'Use 2..16 ordered corresponding sections');
      const count = f.sections[0]?.points?.length;
      if (!Number.isInteger(count) || count < 2 || count > 8)
        fail('sections', 'Each section needs 2..8 corresponding points');
      for (const [i, section] of f.sections.entries()) {
        if (
          !Array.isArray(section.points) ||
          section.points.length !== count ||
          (section.normals !== undefined && section.normals.length !== count)
        )
          fail(`sections[${i}]`, 'Keep matching point/normal counts');
        section.points.forEach((p: any, j: number) => point(p, `sections[${i}].points[${j}]`));
      }
      for (let i = 0; i < f.sections.length - 1; i++)
        for (let j = 0; j < count - 1; j++) {
          const a = f.sections[i],
            b = f.sections[i + 1];
          if ((a.normals !== undefined) !== (b.normals !== undefined))
            fail('sections.normals', 'Supply normals for every corresponding section or omit all');
          addTriangle(
            {
              vertices: [a.points[j], a.points[j + 1], b.points[j]],
              ...(a.normals ? { normals: [a.normals[j], a.normals[j + 1], b.normals[j]] } : {}),
            },
            'sections'
          );
          addTriangle(
            {
              vertices: [a.points[j + 1], b.points[j + 1], b.points[j]],
              ...(a.normals ? { normals: [a.normals[j + 1], b.normals[j + 1], b.normals[j]] } : {}),
            },
            'sections'
          );
        }
      if (triangles.length > 128)
        fail('sections', 'Reduce section resolution to at most 128 triangles');
    }
  } else {
    if (f.kind !== 'cast-shadow') fail('kind', 'Choose surface or cast-shadow');
    if (!f.caster?.owner_id || !f.receiver?.owner_id || f.caster.owner_id === f.receiver.owner_id)
      fail('caster', 'Caster and independently editable shadow receiver need distinct owner ids');
    if (
      !Array.isArray(f.caster.contour) ||
      f.caster.contour.length < 3 ||
      f.caster.contour.length > 64
    )
      fail('caster.contour', 'Use an authored 3D silhouette with 3..64 vertices');
    const plane = point(f.receiver.point, 'receiver.point'),
      normal = vector(f.receiver.normal, 'receiver.normal');
    contact = point(f.contact, 'contact');
    if (Math.abs(dot(normal, sub(contact, plane))) > 1e-5)
      fail('contact', 'Contact must lie on the receiving plane');
    const away = light.map((n) => -n) as V,
      denom = dot(normal, away);
    if (Math.abs(denom) < 1e-8)
      fail('receiver', 'Light parallel to receiver cannot produce a finite cast-shadow projection');
    projected = f.caster.contour.map((raw: any, i: number) => {
      const p = point(raw, `caster.contour[${i}]`),
        t = dot(normal, sub(plane, p)) / denom;
      if (t < -1e-5)
        fail(
          'caster.contour',
          'Caster lies behind the receiving plane along the chosen shadow ray'
        );
      const projectedPoint = { x: p.x + t * away[0], y: p.y + t * away[1], z: p.z + t * away[2] };
      if (!Object.values(projectedPoint).every(finite))
        fail(
          'caster.contour',
          'Projected coordinates exceed the finite shared-canvas budget; change light/receiver or narrow the caster'
        );
      return projectedPoint;
    });
    const area =
      Math.abs(
        projected.reduce((s, p, i) => {
          const q = projected[(i + 1) % projected.length];
          return s + p.x * q.y - q.x * p.y;
        }, 0)
      ) / 2;
    if (area < 1e-5) fail('caster.contour', 'Projected shadow must have nonzero screen area');
    density = fraction(f.contact_density, 0.85, 'contact_density');
    falloff = f.falloff ?? 0;
    if (!finite(falloff) || falloff < 0)
      fail('falloff', 'Choose nonnegative canvas-distance falloff; zero retains constant density');
  }
  const material = f.material ?? {},
    roughness = fraction(material.roughness, 0.5, 'material.roughness'),
    strength = fraction(material.specular_strength, 0, 'material.specular_strength');
  const anisotropy = fraction(material.anisotropy, 0, 'material.anisotropy');
  if (anisotropy && !material.tangent)
    fail('material.tangent', 'Anisotropy needs an artist-authored tangent direction');
  const tangent = material.tangent
    ? vector(material.tangent, 'material.tangent')
    : ([1, 0, 0] as V);
  const specular = material.specular_color
    ? color(material.specular_color, 'material.specular_color')
    : lit;
  const halfRaw = [light[0], light[1], light[2] + 1] as V,
    half = Math.hypot(...halfRaw) > 1e-8 ? unit(halfRaw) : ([0, 0, 0] as V);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = {
          x: bounds.left + ((x + 0.5) * w) / width,
          y: bounds.top + ((y + 0.5) * h) / height,
        },
        offset = (y * width + x) * 4;
      let amount = 0,
        spec = 0,
        covered = false,
        nearest = -Infinity;
      if (f.kind === 'cast-shadow') {
        covered = inside(p, projected);
        const attenuation = falloff
          ? Math.exp(-Math.hypot(p.x - contact!.x, p.y - contact!.y) / falloff)
          : 1;
        amount = 1 - density * attenuation;
      } else
        for (const tri of triangles) {
          const [a, b, c] = tri.vertices,
            den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
          const u = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / den,
            v = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / den,
            t = 1 - u - v;
          if (u < -1e-8 || v < -1e-8 || t < -1e-8) continue;
          const z = u * a.z + v * b.z + t * c.z;
          if (z < nearest) continue;
          nearest = z;
          covered = true;
          const interpolated = tri.normals[0].map(
            (n, i) => u * n + v * tri.normals[1][i] + t * tri.normals[2][i]
          ) as V;
          if (Math.hypot(...interpolated) < 1e-8)
            fail('normals', 'Interpolated vertex normals cancel; choose coherent directions');
          const n = unit(interpolated),
            lambert = Math.max(0, dot(n, light));
          amount = ambient + (1 - ambient) * lambert;
          const tangentRaw = tangent.map((a, i) => a - dot(tangent, n) * n[i]) as V;
          if (anisotropy && Math.hypot(...tangentRaw) < 1e-8)
            fail('material.tangent', 'Tangent cannot be parallel to the painted normal');
          const tangentDot = Math.hypot(...tangentRaw) > 1e-8 ? dot(half, unit(tangentRaw)) : 0;
          spec =
            lambert > 0
              ? strength *
                Math.max(0, dot(n, half)) ** (2 + 126 * (1 - roughness) ** 2) *
                Math.exp(-anisotropy * tangentDot * tangentDot * 12)
              : 0;
        }
      if (!covered) continue;
      for (let i = 0; i < 3; i++)
        data[offset + i] = Math.round(
          Math.max(0, Math.min(255, shadow[i] + amount * (lit[i] - shadow[i]) + spec * specular[i]))
        );
      data[offset + 3] = 255;
    }
  const source_mask =
    f.kind === 'surface'
      ? triangles.map((tri) => tri.vertices.map(({ x, y }) => ({ x, y })))
      : [projected.map(({ x, y }) => ({ x, y }))];
  const field = {
    kind: f.kind,
    light_direction: light,
    shadow_color: { red: shadow[0], green: shadow[1], blue: shadow[2] },
    light_color: { red: lit[0], green: lit[1], blue: lit[2] },
    ...(f.kind === 'surface'
      ? {
          ambient,
          surfaces: triangles,
          material: {
            roughness,
            specular_strength: strength,
            anisotropy,
            tangent,
            specular_color: { red: specular[0], green: specular[1], blue: specular[2] },
          },
        }
      : {
          caster: {
            owner_id: f.caster.owner_id,
            contour: f.caster.contour.map((p: any) => point(p, 'caster.contour')),
          },
          receiver: {
            owner_id: f.receiver.owner_id,
            point: point(f.receiver.point, 'receiver.point'),
            normal: vector(f.receiver.normal, 'receiver.normal'),
          },
          contact,
          contact_density: density,
          falloff,
          projected_shadow: projected,
        }),
    approximation:
      'orthographic-2.5d; authored normals/palette; no inferred anatomy, perspective, area-light penumbra or global illumination',
  };
  return {
    width,
    height,
    data,
    source_mask,
    field,
    sha256: createHash('sha256').update(JSON.stringify(field)).update(data).digest('hex'),
  };
}

const p = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false,
};
const v = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } };
const rgb = {
  type: 'object',
  properties: Object.fromEntries(
    ['red', 'green', 'blue'].map((k) => [k, { type: 'number', minimum: 0, maximum: 255 }])
  ),
  required: ['red', 'green', 'blue'],
  additionalProperties: false,
};
export const SURFACE_FIELD_PROPERTIES = {
  surfaces: {
    type: 'array',
    minItems: 1,
    maxItems: 128,
    items: {
      type: 'object',
      properties: {
        vertices: { type: 'array', minItems: 3, maxItems: 3, items: p },
        normals: { type: 'array', minItems: 3, maxItems: 3, items: v },
      },
      required: ['vertices'],
      additionalProperties: false,
    },
  },
  sections: {
    type: 'array',
    minItems: 2,
    maxItems: 16,
    items: {
      type: 'object',
      properties: {
        points: { type: 'array', minItems: 2, maxItems: 8, items: p },
        normals: { type: 'array', minItems: 2, maxItems: 8, items: v },
      },
      required: ['points'],
      additionalProperties: false,
    },
  },
  material: {
    type: 'object',
    properties: {
      roughness: { type: 'number', minimum: 0, maximum: 1 },
      specular_strength: { type: 'number', minimum: 0, maximum: 1 },
      anisotropy: { type: 'number', minimum: 0, maximum: 1 },
      tangent: v,
      specular_color: rgb,
    },
    additionalProperties: false,
  },
  caster: {
    type: 'object',
    properties: {
      owner_id: { type: 'string' },
      contour: { type: 'array', minItems: 3, maxItems: 64, items: p },
    },
    required: ['owner_id', 'contour'],
    additionalProperties: false,
  },
  receiver: {
    type: 'object',
    properties: { owner_id: { type: 'string' }, point: p, normal: v },
    required: ['owner_id', 'point', 'normal'],
    additionalProperties: false,
  },
  contact: p,
  contact_density: { type: 'number', minimum: 0, maximum: 1 },
  falloff: { type: 'number', minimum: 0 },
};
