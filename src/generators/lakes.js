import {
  createRng
} from '../core/prng.js';
import {
  boundsOf
} from '../core/geometry.js';
import {
  LAKE_LIMIT
} from '../core/lake-geometry.js';
import {
  waterFeaturePolygon,
  waterPolygonsOverlap
} from '../core/water-geometry.js';
import {
  validateWaterDefinition
} from '../core/water-model.js';
export function generateLake(boundary, center, options = {}) {
  const others = options.otherFeatures ?? [],
    bridges = options.bridges ?? [];
  if (others.filter(f => f.kind === 'lake').length >= LAKE_LIMIT) throw new Error('This build supports up to eight lakes. Remove a lake before adding another.');
  const seed = String(options.seed || 'lake').slice(0, 64),
    radius = Number(options.radius ?? 28);
  if (!Number.isFinite(radius) || radius < 18 || radius > 100) throw new Error('Lake size must be 18–100 survey units.');
  const rng = createRng(`${seed}:lake:v1:${others.filter(f=>f.kind==='lake').length}`),
    b = boundsOf(boundary);
  let sequence = 1;
  while (others.some(f => f.id === `LAKE-${String(sequence).padStart(3,'0')}`)) sequence++;
  for (let attempt = 0; attempt < 180; attempt++) {
    const origin = options.center ?? {
        x: b.minX + rng() * (b.maxX - b.minX),
        y: b.minY + rng() * (b.maxY - b.minY)
      },
      phase = rng() * Math.PI * 2,
      aspect = .8 + rng() * .4;
    const feature = {
      id: options.id ?? `LAKE-${String(sequence).padStart(3,'0')}`,
      dataVersion: 1,
      kind: 'lake',
      name: `Lake ${sequence}`,
      center: {
        ...origin
      },
      path: Array.from({
        length: 12
      }, (_, i) => {
        const angle = i * Math.PI / 6,
          r = radius * (1 + .10 * Math.sin(angle * 3 + phase) + .08 * Math.sin(angle * 2 - phase));
        return {
          x: origin.x + Math.cos(angle) * r * aspect,
          y: origin.y + Math.sin(angle) * r / aspect
        };
      }),
      generation: {
        seed,
        algorithm: 'lake-v1',
        radius
      },
      extensions: {}
    };
    feature.polygon = waterFeaturePolygon(feature);
    feature.corridor = waterFeaturePolygon(feature, 9);
    if (others.some(f => waterPolygonsOverlap(f.corridor, feature.corridor))) continue;
    try {
      validateWaterDefinition([...others, feature], bridges, boundary, center);
    } catch {
      continue;
    }
    return {
      features: [feature],
      bridges: [],
      state: {
        version: 1,
        status: 'lake',
        seed,
        algorithm: 'lake-v1'
      }
    };
  }
  throw new Error('No room for a lake of this size on the available land. Try a smaller size, another seed or a larger outline.');
}
