import {
  guideLakePath
} from './lake-editing.js';
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
export function waterPathIsOrdered(path) {
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
export function guideWaterPath(feature, {
  index = null,
  point = null,
  boundary = []
} = {}) {
  if (feature.kind === 'lake') return guideLakePath(feature, {
    index,
    point,
    boundary
  });
  if (!['river', 'coast'].includes(feature.kind) || !Array.isArray(feature.path) || feature.path.length < 3 || feature.path.length > 32) throw new Error('Choose a river or coastline with at least three handles.');
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= feature.path.length || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Invalid water handle.');
  const original = feature.path,
    raw = original.map(p => ({
      ...p
    }));
  if (index !== null) raw[index] = {
    ...raw[index],
    x: point.x,
    y: point.y
  };
  if (!raw.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 100000 && Math.abs(p.y) <= 100000)) throw new Error('Keep water handles within the map coordinate range.');
  const requested = raw.map(p => ({
    ...p
  }));
  const coast = feature.kind === 'coast';
  let seaDepth = feature.seaDepth;
  if (coast && (!['left', 'right'].includes(feature.waterSide) || !Number.isFinite(seaDepth) || seaDepth < 100 || seaDepth > 20000)) throw new Error('Choose a valid ocean side and extent.');
  if (coast && index !== null && (index === 0 || index === raw.length - 1)) {
    try {
      const previous = waterFrame(feature),
        other = index === 0 ? raw.at(-1) : raw[0],
        advance = index === 0 ? (other.x - raw[0].x) * previous.u.x + (other.y - raw[0].y) * previous.u.y : (raw.at(-1).x - other.x) * previous.u.x + (raw.at(-1).y - other.y) * previous.u.y;
      if (advance < 81) {
        const shift = (81 - advance) * (index === 0 ? -1 : 1);
        raw[index] = {
          ...raw[index],
          x: raw[index].x + previous.u.x * shift,
          y: raw[index].y + previous.u.y * shift
        };
      }
    } catch {}
  }
  const endpointsOutside = () => {
    if (!boundary.length && !coast) return true;
    if (!coast) return !insideOrOn(raw[0], boundary) && !insideOrOn(raw.at(-1), boundary);
    try {
      const f = waterFrame({
        path: raw
      });
      return raw.every(p => ((p.x - f.origin.x) * f.v.x + (p.y - f.origin.y) * f.v.y) * (feature.waterSide === 'left' ? 1 : -1) < seaDepth - 100) && boundary.every(p => {
        const u = (p.x - f.origin.x) * f.u.x + (p.y - f.origin.y) * f.u.y,
          v = (p.x - f.origin.x) * f.v.x + (p.y - f.origin.y) * f.v.y;
        return u > 0 && u < f.length && Math.abs(v) < seaDepth - 100;
      });
    } catch {
      return false;
    }
  };
  if (waterPathIsOrdered(raw) && endpointsOutside()) return {
    path: raw,
    ...(coast ? {
      seaDepth
    } : {}),
    adjusted: raw.some((p, i) => Math.hypot(p.x - requested[i].x, p.y - requested[i].y) > 1e-7),
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
      padding = (coast ? 0 : feature.width / 2) + WATER_BANK + 18;
    if (coast ? Math.min(...coordinates) <= 0 : insideOrOn(raw[0], boundary)) {
      const t = Math.min(...coordinates) - padding;
      raw[0] = {
        ...raw[0],
        x: frame.origin.x + frame.u.x * t,
        y: frame.origin.y + frame.u.y * t
      };
    }
    if (coast ? Math.max(...coordinates) >= frame.length : insideOrOn(raw.at(-1), boundary)) {
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
    if (coast) {
      const needed = Math.max(...boundary.map(p => Math.abs((p.x - frame.origin.x) * frame.v.x + (p.y - frame.origin.y) * frame.v.y))) + 101;
      if (needed > 20000) throw new Error('Move the shoreline closer to the city before tidying it.');
      seaDepth = Math.max(seaDepth, needed);
    }
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
  if (coast) {
    const needed = Math.max(...path.map(p => ((p.x - frame.origin.x) * frame.v.x + (p.y - frame.origin.y) * frame.v.y) * (feature.waterSide === 'left' ? 1 : -1))) + 101;
    if (needed > 20000) throw new Error('Move the shoreline closer to the city before tidying it.');
    seaDepth = Math.max(seaDepth, needed);
  }
  if (!waterPathIsOrdered(path)) throw new Error('This water course needs more room between its endpoints. Extend an endpoint and try again.');
  return {
    path,
    ...(coast ? {
      seaDepth
    } : {}),
    adjusted: path.some((p, i) => Math.hypot(p.x - requested[i].x, p.y - requested[i].y) > 1e-7) || (coast && seaDepth !== feature.seaDepth),
    changed: path.some((p, i) => Math.hypot(p.x - original[i].x, p.y - original[i].y) > 1e-7) || (coast && seaDepth !== feature.seaDepth)
  };
}
