import {
  clamp
} from './geometry.js';
import {
  insideOrOn
} from './boundary.js';
import {
  waterFrame,
  WATER_BANK,
  WATER_MAX_SLOPE
} from './water-geometry.js';

// Keep editing inside the supported bank geometry rather than accepting a bad
// handle position and reporting it later. This never touches accepted city data.
export function riverPathIsOrdered(path) {
  try {
    const f = waterFrame({
      path
    });
    let previous = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        u = (b.x - a.x) * f.u.x + (b.y - a.y) * f.u.y,
        v = (b.x - a.x) * f.v.x + (b.y - a.y) * f.v.y;
      if (u <= .001 || Math.abs(v) > u * WATER_MAX_SLOPE) return false;
      previous += u;
    }
    return previous >= 80 - 1e-6;
  } catch {
    return false;
  }
}
export function guideRiverPath(feature, {
  index = null,
  point = null,
  boundary = []
} = {}) {
  if (feature.kind !== 'river' || !Array.isArray(feature.path) || feature.path.length < 3 || feature.path.length > 32) throw new Error('Choose a river with at least three handles.');
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= feature.path.length || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Invalid river handle.');
  const original = feature.path,
    raw = original.map(p => ({
      ...p
    }));
  if (index !== null) raw[index] = {
    ...raw[index],
    x: point.x,
    y: point.y
  };
  if (!raw.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 100000 && Math.abs(p.y) <= 100000)) throw new Error('Keep river handles within the map coordinate range.');
  const requested = raw.map(p => ({
    ...p
  }));
  const endpointsOutside = () => !boundary.length || (!insideOrOn(raw[0], boundary) && !insideOrOn(raw.at(-1), boundary));
  if (riverPathIsOrdered(raw) && endpointsOutside()) return {
    path: raw,
    adjusted: false,
    changed: raw.some((p, i) => Math.hypot(p.x - original[i].x, p.y - original[i].y) > 1e-7)
  };
  if (Math.hypot(raw.at(-1).x - raw[0].x, raw.at(-1).y - raw[0].y) < 80) {
    let direction;
    try {
      direction = waterFrame(feature).u;
    } catch {
      let far = raw[1];
      for (const p of raw)
        if (Math.hypot(p.x - raw[0].x, p.y - raw[0].y) > Math.hypot(far.x - raw[0].x, far.y - raw[0].y)) far = p;
      const length = Math.hypot(far.x - raw[0].x, far.y - raw[0].y);
      direction = length > 1e-7 ? {
        x: (far.x - raw[0].x) / length,
        y: (far.y - raw[0].y) / length
      } : {
        x: 1,
        y: 0
      };
    }
    if (index === 0) raw[0] = {
      ...raw[0],
      x: raw.at(-1).x - direction.x * 81,
      y: raw.at(-1).y - direction.y * 81
    };
    else raw[raw.length - 1] = {
      ...raw.at(-1),
      x: raw[0].x + direction.x * 81,
      y: raw[0].y + direction.y * 81
    };
  }
  let frame = waterFrame({
    path: raw
  });
  if (boundary.length) {
    const coordinates = boundary.map(p => (p.x - frame.origin.x) * frame.u.x + (p.y - frame.origin.y) * frame.u.y),
      padding = feature.width / 2 + WATER_BANK + 18;
    if (insideOrOn(raw[0], boundary)) {
      const t = Math.min(...coordinates) - padding;
      raw[0] = {
        ...raw[0],
        x: frame.origin.x + frame.u.x * t,
        y: frame.origin.y + frame.u.y * t
      };
    }
    if (insideOrOn(raw.at(-1), boundary)) {
      const t = Math.max(...coordinates) + padding;
      raw[raw.length - 1] = {
        ...raw.at(-1),
        x: frame.origin.x + frame.u.x * t,
        y: frame.origin.y + frame.u.y * t
      };
    }
    frame = waterFrame({
      path: raw
    });
  }
  const n = raw.length,
    gap = Math.min(2, frame.length / (4 * (n - 1))),
    slope = WATER_MAX_SLOPE * (1 - 1e-6),
    projection = p => ({
      u: (p.x - frame.origin.x) * frame.u.x + (p.y - frame.origin.y) * frame.u.y,
      v: (p.x - frame.origin.x) * frame.v.x + (p.y - frame.origin.y) * frame.v.y
    });
  const coordinates = raw.map(projection),
    u = coordinates.map(p => p.u),
    v = coordinates.map(p => p.v);
  u[0] = 0;
  u[n - 1] = frame.length;
  v[0] = 0;
  v[n - 1] = 0;
  if (index > 0 && index < n - 1) u[index] = projection(original[index]).u;
  for (let i = 1; i < n - 1; i++) u[i] = Math.max(u[i], u[i - 1] + gap);
  for (let i = n - 2; i > 0; i--) u[i] = Math.min(u[i], u[i + 1] - gap);
  if (index > 0 && index < n - 1) u[index] = clamp(coordinates[index].u, u[index - 1] + gap, u[index + 1] - gap);
  if (index > 0 && index < n - 1) {
    v[index] = clamp(coordinates[index].v, -slope * Math.min(u[index], frame.length - u[index]), slope * Math.min(u[index], frame.length - u[index]));
    for (let i = index - 1; i > 0; i--) {
      const reach = slope * (u[i + 1] - u[i]),
        end = slope * u[i];
      v[i] = clamp(v[i], Math.max(v[i + 1] - reach, -end), Math.min(v[i + 1] + reach, end));
    }
    for (let i = index + 1; i < n - 1; i++) {
      const reach = slope * (u[i] - u[i - 1]),
        end = slope * (frame.length - u[i]);
      v[i] = clamp(v[i], Math.max(v[i - 1] - reach, -end), Math.min(v[i - 1] + reach, end));
    }
  } else {
    for (let i = 1; i < n - 1; i++) {
      const reach = slope * (u[i] - u[i - 1]),
        end = slope * (frame.length - u[i]);
      v[i] = clamp(v[i], Math.max(v[i - 1] - reach, -end), Math.min(v[i - 1] + reach, end));
    }
  }
  const path = raw.map((p, i) => {
    if (!i || i === n - 1) return p;
    const next = {
      ...p,
      x: frame.origin.x + frame.u.x * u[i] + frame.v.x * v[i],
      y: frame.origin.y + frame.u.y * u[i] + frame.v.y * v[i]
    };
    return Math.hypot(next.x - p.x, next.y - p.y) < 1e-7 ? p : next;
  });
  if (!riverPathIsOrdered(path)) throw new Error('This river needs more room between its endpoints. Extend an endpoint and try again.');
  return {
    path,
    adjusted: path.some((p, i) => Math.hypot(p.x - requested[i].x, p.y - requested[i].y) > 1e-7),
    changed: path.some((p, i) => Math.hypot(p.x - original[i].x, p.y - original[i].y) > 1e-7)
  };
}
