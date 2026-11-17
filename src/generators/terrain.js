import {
  createRng
} from '../core/prng.js';
import {
  boundsOf,
  pointInPolygon
} from '../core/geometry.js';
import {
  TERRAIN_LIMIT,
  terrainPrepare,
  terrainPassGeometry
} from '../core/terrain-geometry.js';
import {
  validateTerrainDefinition
} from '../core/terrain-model.js';
export function generateMountain(boundary, center, options = {}) {
  const others = options.otherFeatures ?? [],
    oldPasses = options.passes ?? [],
    water = options.water ?? {
      features: [],
      bridges: []
    };
  if (others.length >= TERRAIN_LIMIT) throw new Error('Remove a range before adding another; this build supports six ranges.');
  const seed = String(options.seed || 'mountains').slice(0, 64),
    placement = options.placement ?? 'surrounding',
    size = Number(options.size ?? 70),
    height = Number(options.height ?? 900);
  if (!['surrounding', 'inside', 'crossing'].includes(placement) || !Number.isFinite(size) || size < 40 || size > 220 || !Number.isFinite(height) || height < 50 || height > 3000) throw new Error('Choose mountain size 40–220 and peak height 50–3000.');
  const rng = createRng(`${seed}:mountains:v1:${others.length}`),
    bounds = boundsOf(boundary),
    cx = (bounds.minX + bounds.maxX) / 2,
    cy = (bounds.minY + bounds.maxY) / 2;
  let n = 1;
  while (others.some(f => f.id === `MTN-${String(n).padStart(3,'0')}`)) n++;
  let pn = 1;
  while (oldPasses.some(p => p.id === `PASS-${String(pn).padStart(3,'0')}`)) pn++;
  for (let attempt = 0; attempt < 180; attempt++) {
    const horizontal = rng() < .5,
      sign = rng() < .5 ? -1 : 1,
      angle = placement === 'inside' ? rng() * Math.PI : horizontal ? 0 : Math.PI / 2;
    const c = options.center ?? (placement === 'inside' ? {
      x: bounds.minX + rng() * (bounds.maxX - bounds.minX),
      y: bounds.minY + rng() * (bounds.maxY - bounds.minY)
    } : horizontal ? {
      x: cx + (rng() - .5) * (bounds.maxX - bounds.minX) * .5,
      y: (sign < 0 ? bounds.minY : bounds.maxY) + (placement === 'surrounding' ? 1 : -1) * sign * size * .72
    } : {
      x: (sign < 0 ? bounds.minX : bounds.maxX) + (placement === 'surrounding' ? 1 : -1) * sign * size * .72,
      y: cy + (rng() - .5) * (bounds.maxY - bounds.minY) * .5
    });
    const length = size * (placement === 'crossing' ? 2.5 : 1.45),
      width = size * (placement === 'inside' ? .50 : .72),
      phase = rng() * 6.28,
      u = {
        x: Math.cos(angle),
        y: Math.sin(angle)
      },
      v = {
        x: -Math.sin(angle),
        y: Math.cos(angle)
      };
    const f = {
      id: options.id ?? `MTN-${String(n).padStart(3,'0')}`,
      dataVersion: 1,
      kind: 'mountain',
      name: `Range ${n}`,
      center: {
        ...c
      },
      path: Array.from({
        length: 12
      }, (_, i) => {
        const a = i * Math.PI / 6,
          factor = 1 + .08 * Math.sin(a * 3 + phase);
        return {
          x: c.x + (u.x * Math.cos(a) * length + v.x * Math.sin(a) * width) * factor,
          y: c.y + (u.y * Math.cos(a) * length + v.y * Math.sin(a) * width) * factor
        };
      }),
      ridge: [-.52, 0, .52].map((t, i) => ({
        x: c.x + u.x * length * t,
        y: c.y + u.y * length * t,
        height: Math.max(50, Math.round(height * (i === 1 ? 1 : .7)))
      })),
      generation: {
        seed,
        algorithm: 'mountain-v1',
        placement,
        size
      },
      extensions: {}
    };
    const next = terrainPrepare({
      features: [f]
    });
    if (placement === 'inside' && !next.features[0].corridor.every(p => pointInPolygon(p, boundary))) continue;
    if (placement === 'surrounding' && f.path.every(p => pointInPolygon(p, boundary))) continue;
    if (placement === 'crossing' && (!f.path.some(p => pointInPolygon(p, boundary)) || f.path.every(p => pointInPolygon(p, boundary)))) continue;
    const features = [...others, ...next.features],
      passes = [];
    if (placement !== 'surrounding')
      for (const t of [.5, .35, .65, .2, .8]) {
        const pass = {
          id: `PASS-${String(pn).padStart(3,'0')}`,
          dataVersion: 1,
          kind: 'pass',
          terrainId: f.id,
          t,
          width: 12,
          extensions: {}
        };
        try {
          terrainPassGeometry(next.features[0], pass, boundary);
          validateTerrainDefinition(features, [...oldPasses, pass], boundary, center, water);
          passes.push(pass);
          break;
        } catch {}
      }
    try {
      validateTerrainDefinition(features, [...oldPasses, ...passes], boundary, center, water);
    } catch {
      continue;
    }
    return {
      features: next.features,
      passes
    };
  }
  throw new Error('No mountain range fits here with connected land and clear water. Try a smaller size, another seed or placement.');
}
