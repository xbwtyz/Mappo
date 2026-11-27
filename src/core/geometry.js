export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function boundsOf(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return points.reduce((bounds, p) => {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.maxY = Math.max(bounds.maxY, p.y);
    return bounds;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonSignedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function properPolygonEdgeIntersection(a, b, c, d) {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y,
    den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-8) return false;
  const qx = c.x - a.x,
    qy = c.y - a.y,
    t = (qx * sy - qy * sx) / den,
    u = (qx * ry - qy * rx) / den;
  return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

// Match the strict edge-crossing test used to validate stored polygon containment.
export function polygonRingsProperlyCross(inner, outer, spend) {
  for (let i = 0; i < inner.length; i++) {
    for (let j = 0; j < outer.length; j++) {
      spend(1);
      if (properPolygonEdgeIntersection(inner[i], inner[(i + 1) % inner.length],
          outer[j], outer[(j + 1) % outer.length])) return true;
    }
  }
  return false;
}

// Persisted road-parcel frames require consistent binary64 arithmetic.
// Math.hypot is implementation-approximated and its last bit can differ
// between JS engines, propagating through boundaries and provenance stamps.
// Scale the inputs to avoid intermediate overflow/underflow, then use a
// fixed arithmetic order and square root. No coordinate rounding.
export function roadFrameLength(dx,dy) {
  const scale=Math.max(Math.abs(dx),Math.abs(dy));
  if(scale===0||!Number.isFinite(scale))return scale;
  const x=dx/scale,y=dy/scale;
  return scale*Math.sqrt(x*x+y*y);
}
