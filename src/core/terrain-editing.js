import {
  terrainCopy,
  terrainShapeSafe,
  terrainRidgeSafe
} from './terrain-geometry.js';
export function guideTerrainFeature(feature, {
  index = -1,
  point = null,
  moveCenter = null,
  ridge = false
} = {}) {
  if ((point && (!Number.isFinite(point.x) || !Number.isFinite(point.y))) || (moveCenter && (!Number.isFinite(moveCenter.x) || !Number.isFinite(moveCenter.y)))) throw new Error('Invalid terrain handle position.');
  const original = terrainCopy(feature),
    requested = terrainCopy(feature);
  if (!terrainShapeSafe(original) || !terrainRidgeSafe(original)) throw new Error('Regenerate this mountain range to repair its draft shape.');
  if (moveCenter) {
    const dx = moveCenter.x - feature.center.x,
      dy = moveCenter.y - feature.center.y;
    requested.center = {
      ...feature.center,
      x: moveCenter.x,
      y: moveCenter.y
    };
    for (const key of ['path', 'ridge']) requested[key] = feature[key].map(p => ({
      ...p,
      x: p.x + dx,
      y: p.y + dy
    }));
  } else if (index >= 0 && point) {
    const key = ridge ? 'ridge' : 'path';
    if (!requested[key][index]) throw new Error('Select a mountain handle.');
    requested[key][index] = {
      ...requested[key][index],
      x: point.x,
      y: point.y
    };
  }
  const safe = f => terrainShapeSafe(f) && terrainRidgeSafe(f);
  const interpolate = t => ({
    ...original,
    center: {
      ...original.center,
      x: original.center.x + (requested.center.x - original.center.x) * t,
      y: original.center.y + (requested.center.y - original.center.y) * t
    },
    path: original.path.map((p, i) => ({
      ...p,
      x: p.x + (requested.path[i].x - p.x) * t,
      y: p.y + (requested.path[i].y - p.y) * t
    })),
    ridge: original.ridge.map((p, i) => ({
      ...p,
      x: p.x + (requested.ridge[i].x - p.x) * t,
      y: p.y + (requested.ridge[i].y - p.y) * t
    }))
  });
  let result = requested,
    adjusted = false;
  if (!safe(requested)) {
    let lo = 0,
      hi = 1;
    for (let n = 1; n <= 24; n++) {
      const t = n / 24;
      if (!safe(interpolate(t))) {
        hi = t;
        break;
      }
      lo = t;
    }
    for (let n = 0; n < 22; n++) {
      const t = (lo + hi) / 2;
      if (safe(interpolate(t))) lo = t;
      else hi = t;
    }
    result = interpolate(lo);
    adjusted = true;
  }
  return {
    feature: result,
    adjusted
  };
}
