import {
  waterLandRegions
} from '../core/water-regions.js';
import {
  boundsOf,
  pointInPolygon
} from '../core/geometry.js';
import {
  clearance
} from '../core/boundary.js';
import {
  createRng
} from '../core/prng.js';
import {
  waterFeaturePolygon,
  WATER_BANK
} from '../core/water-geometry.js';

export const COAST_DIRECTIONS = Object.freeze(['north', 'east', 'south', 'west']);
export function generateCoast(boundary, center, options = {}) {
  const seed = String(options.seed || 'coast').slice(0, 64),
    direction = options.direction ?? 'east';
  if (!COAST_DIRECTIONS.includes(direction)) throw new Error('Choose north, east, south or west for the ocean.');
  const b = boundsOf(boundary),
    horizontal = direction === 'north' || direction === 'south',
    sign = direction === 'south' || direction === 'west' ? 1 : -1;
  const low = horizontal ? b.minX : b.minY,
    high = horizontal ? b.maxX : b.maxY,
    span = high - low,
    sideLow = horizontal ? b.minY : b.minX,
    sideHigh = horizontal ? b.maxY : b.maxX,
    sideSpan = sideHigh - sideLow,
    centerSide = horizontal ? center.y : center.x;
  // For vertical paths, the left-hand normal points west.
  const waterSide = sign === 1 ? 'left' : 'right',
    rng = createRng(`${seed}:coast:v1:${direction}`);
  const towardHigh = direction === 'south' || direction === 'east';
  for (let attempt = 0; attempt < 24; attempt++) {
    const fraction = .20 + rng() * .12,
      base = towardHigh ? Math.max(centerSide + 58, sideHigh - sideSpan * fraction) : Math.min(centerSide - 58, sideLow + sideSpan * fraction);
    if (base <= sideLow + 16 || base >= sideHigh - 16) continue;
    const phase = rng() * Math.PI * 2,
      amplitude = Math.min(24, sideSpan * .055),
      path = Array.from({
        length: 9
      }, (_, i) => {
        const t = i / 8,
          u = low - span * .35 + t * span * 1.7,
          v = base + Math.sin(t * Math.PI * 2 + phase) * amplitude;
        return horizontal ? {
          x: u,
          y: v
        } : {
          x: v,
          y: u
        };
      });
    const feature = {
      id: 'WATER-001',
      dataVersion: 1,
      kind: 'coast',
      path,
      waterSide,
      seaDepth: Math.min(20000, Math.max(2000, span * 5)),
      direction,
      extensions: {}
    };
    feature.polygon = waterFeaturePolygon(feature);
    feature.corridor = waterFeaturePolygon(feature, WATER_BANK);
    if (pointInPolygon(center, feature.corridor) || clearance(center, feature.corridor) < 38) continue;
    if (!boundary.some(p => pointInPolygon(p, feature.polygon))) continue;
    if (waterLandRegions(boundary, feature.corridor).landCount !== 1) continue;
    return {
      features: [feature],
      bridges: [],
      state: {
        version: 1,
        status: 'coast',
        seed,
        algorithm: 'shore-v1'
      }
    };
  }
  throw new Error('No shoreline fits on that side with room for the square. Try another ocean direction or water seed.');
}
