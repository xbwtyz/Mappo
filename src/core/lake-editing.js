import {
  lakeShapeSafe,
  lakeFitsBoundary
} from './lake-geometry.js';
export function guideLakePath(feature, {
  index = null,
  point = null,
  boundary = [],
  moveCenter = null
} = {}) {
  const baseline = {
    ...feature,
    path: feature.path.map(p => ({
      ...p
    })),
    center: {
      ...feature.center
    }
  };
  if (!lakeShapeSafe(baseline)) throw new Error('This lake draft needs a valid closed shoreline. Regenerate the selected lake to start again.');
  const requested = {
    ...baseline,
    path: baseline.path.map(p => ({
      ...p
    })),
    center: {
      ...baseline.center
    }
  };
  if (moveCenter) {
    if (!Number.isFinite(moveCenter.x) || !Number.isFinite(moveCenter.y)) throw new Error('Invalid lake center.');
    requested.center = {
      ...baseline.center,
      x: moveCenter.x,
      y: moveCenter.y
    };
    requested.path = requested.path.map(p => ({
      ...p,
      x: p.x + moveCenter.x - baseline.center.x,
      y: p.y + moveCenter.y - baseline.center.y
    }));
  } else if (index !== null) {
    if (!Number.isInteger(index) || index < 0 || index >= requested.path.length || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid lake handle.');
    requested.path[index] = {
      ...baseline.path[index],
      x: point.x,
      y: point.y
    };
  }
  const interpolate = t => ({
    ...baseline,
    center: {
      ...baseline.center,
      x: baseline.center.x + (requested.center.x - baseline.center.x) * t,
      y: baseline.center.y + (requested.center.y - baseline.center.y) * t
    },
    path: baseline.path.map((p, i) => ({
      ...p,
      x: p.x + (requested.path[i].x - p.x) * t,
      y: p.y + (requested.path[i].y - p.y) * t
    }))
  });
  const safe = f => lakeShapeSafe(f) && lakeFitsBoundary(f, boundary);
  let result = requested,
    adjusted = false;
  if (!safe(requested)) {
    // Find the first unsafe part of this drag, then limit its extent.
    // The accepted baseline and other lake records remain untouched.
    let lo = 0,
      hi = 1;
    for (let step = 1; step <= 24; step++) {
      const t = step / 24;
      if (!safe(interpolate(t))) {
        hi = t;
        break;
      }
      lo = t;
    }
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (safe(interpolate(mid))) lo = mid;
      else hi = mid;
    }
    result = interpolate(lo);
    adjusted = true;
  }
  return {
    path: result.path,
    center: result.center,
    adjusted,
    changed: result.path.some((p, i) => Math.hypot(p.x - baseline.path[i].x, p.y - baseline.path[i].y) > 1e-7)
  };
}
