import { polygonSignedArea, boundsOf } from './geometry.js';
import { distanceToSegment } from './boundary.js';
import { clipToConvexPolygon } from './placement.js';

const rfCross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

// Ear clipping is used only for geometric corroboration. It never changes a
// candidate's vertices or assigns identity. All loops share the caller's budget.
export function triangulateRoadFace(polygon, spend) {
  const points = polygon.map((p) => ({ x: p.x, y: p.y }));
  let removed = true;
  while (removed && points.length > 3) {
    removed = false;
    for (let i = 0; i < points.length; i++) {
      spend();
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length];
      if (Math.abs(rfCross(a, b, c)) < 1e-8 && distanceToSegment(b, a, c) < 1e-7) {
        points.splice(i, 1);
        removed = true;
        break;
      }
    }
  }
  const triangles = [];
  while (points.length > 3) {
    let ear = -1;
    for (let i = 0; i < points.length; i++) {
      spend();
      const before = (i + points.length - 1) % points.length,
        after = (i + 1) % points.length;
      const a = points[before],
        b = points[i],
        c = points[after];
      if (rfCross(a, b, c) <= 1e-10) continue;
      let blocked = false;
      for (let j = 0; j < points.length; j++) {
        spend();
        if (j === before || j === i || j === after) continue;
        const p = points[j];
        if (rfCross(a, b, p) >= -1e-10 && rfCross(b, c, p) >= -1e-10 && rfCross(c, a, p) >= -1e-10) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        triangles.push([a, b, c]);
        ear = i;
        break;
      }
    }
    if (ear < 0) throw new Error('A face cannot be triangulated reliably; identity remains unresolved.');
    points.splice(ear, 1);
  }
  if (points.length !== 3 || polygonSignedArea(points) <= 0)
    throw new Error('A face has no positive triangulation.');
  triangles.push(points);
  return triangles;
}

export function roadFaceOverlapArea(a, b, spend) {
  const ta = triangulateRoadFace(a, spend),
    tb = triangulateRoadFace(b, spend);
  let area = 0;
  const boxes = tb.map(boundsOf);
  for (const triangle of ta) {
    const bounds = boundsOf(triangle);
    for (let i = 0; i < tb.length; i++) {
      spend();
      const box = boxes[i];
      if (
        bounds.maxX <= box.minX ||
        bounds.minX >= box.maxX ||
        bounds.maxY <= box.minY ||
        bounds.minY >= box.maxY
      )
        continue;
      const overlap = clipToConvexPolygon(triangle, tb[i]);
      if (overlap.length >= 3) area += Math.abs(polygonSignedArea(overlap));
    }
  }
  return area;
}
