import {
  waterShoreComponents
} from '../core/water-shore-topology.js';
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
  waterRibbon,
  waterFeaturePolygon,
  waterBridgeGeometry,
  waterDryState,
  waterCompositionState,
  waterBridgeClearOfFeatures,
  waterFrame,
  WATER_BANK
} from '../core/water-geometry.js';

export function generateRiver(boundary, center, options = {}) {
  const seed = String(options.seed || 'river').slice(0, 64),
    width = Number(options.width ?? 28);
  if (!Number.isFinite(width) || width < 10 || width > 90) throw new Error('River width must be 10–90 survey units.');
  const rng = createRng(`${seed}:river:v1`),
    b = boundsOf(boundary),
    coast = (options.otherFeatures ?? []).find(f => f.kind === 'coast'),
    normal = coast ? waterFrame(coast).v : null,
    horizontal = normal ? Math.abs(normal.x) >= Math.abs(normal.y) : (b.maxX - b.minX) >= (b.maxY - b.minY);
  const low = horizontal ? b.minX : b.minY,
    high = horizontal ? b.maxX : b.maxY,
    sideLow = horizontal ? b.minY : b.minX,
    sideHigh = horizontal ? b.maxY : b.maxX;
  const sideCenter = horizontal ? center.y : center.x,
    span = high - low,
    sideSpan = sideHigh - sideLow;
  for (let attempt = 0; attempt < 32; attempt++) {
    const sign = rng() < .5 ? -1 : 1,
      base = sideCenter + sign * (width / 2 + WATER_BANK + 42 + rng() * Math.max(0, sideSpan * .15 - 35));
    if (base < sideLow + width || base > sideHigh - width) continue;
    const path = Array.from({
      length: 9
    }, (_, i) => {
      const t = i / 8,
        u = low - span * .35 + t * span * 1.7,
        v = base + Math.sin(t * Math.PI * 2 + rng() * .3) * Math.min(18, sideSpan * .05);
      return horizontal ? {
        x: u,
        y: v
      } : {
        x: v,
        y: u
      };
    });
    if (coast && pointInPolygon(path[0], coast.polygon) && !pointInPolygon(path.at(-1), coast.polygon)) path.reverse();
    const feature = {
      id: 'WATER-RIVER-001',
      dataVersion: 1,
      kind: 'river',
      width,
      path,
      generation: {
        seed,
        algorithm: 'ribbon-v1'
      },
      extensions: {}
    };
    feature.polygon = waterRibbon(feature);
    feature.corridor = waterRibbon(feature, WATER_BANK);
    if (pointInPolygon(center, feature.corridor) || clearance(center, feature.corridor) < 35) continue;
    const possible = [];
    for (let i = 0; i < 51; i++) {
      const bridge = {
        id: '',
        dataVersion: 1,
        kind: 'bridge',
        waterId: feature.id,
        t: .20 + i * .012,
        width: 9,
        extensions: {}
      };
      try {
        const g = waterBridgeGeometry(feature, bridge, boundary);
        if (Math.hypot(g.center.x - center.x, g.center.y - center.y) < 40) continue;
        if (!waterBridgeClearOfFeatures(feature, bridge, boundary, options.otherFeatures ?? [])) continue;
        possible.push(bridge);
      } catch {}
    }
    if (!possible.length) continue;
    const chosen = [possible[Math.floor(possible.length * .3)], possible[Math.floor(possible.length * .72)]].filter((p, i, a) => !i || Math.abs(p.t - a[0].t) * span * 1.7 > 65);
    if ((options.otherFeatures ?? []).length) {
      const all = [feature, ...options.otherFeatures];
      let components = waterShoreComponents(boundary, all, chosen);
      while (components > 1 && chosen.length < 8) {
        let best = null,
          bestCount = components;
        for (const candidate of possible) {
          if (chosen.includes(candidate) || chosen.some(b => Math.abs(candidate.t - b.t) * span * 1.7 < 65)) continue;
          const count = waterShoreComponents(boundary, all, [...chosen, candidate]);
          if (count < bestCount) {
            best = candidate;
            bestCount = count;
          }
        }
        if (!best) break;
        chosen.push(best);
        components = bestCount;
      }
      if (components !== 1) continue;
    }
    return {
      features: [feature],
      bridges: chosen.map((p, i) => ({
        ...p,
        id: `BRIDGE-${String(i+1).padStart(3,'0')}`
      })),
      state: {
        ...waterDryState(),
        status: 'river',
        seed
      }
    };
  }
  throw new Error('No river course fits clear of the square. Try a narrower river, another water seed, or a different outline.');
}
export function prepareWater(water) {
  const features = (water?.features ?? []).map(f => ({
    ...f,
    polygon: waterFeaturePolygon(f),
    corridor: waterFeaturePolygon(f, WATER_BANK)
  }));
  return {
    features,
    bridges: JSON.parse(JSON.stringify(water?.bridges ?? [])),
    state: waterCompositionState(features, water?.state)
  };
}
