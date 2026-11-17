import {
  pointInPolygon
} from './geometry.js';
import {
  segmentCuts,
  lerpPoint,
  distanceToSegment
} from './boundary.js';
import {
  segmentDistance,
  STREET_EDGE_WIDTH
} from './placement.js';
import {
  WALL_EDGE_WIDTH,
  measureWall,
  wallPoint,
  solidWallSegments
} from './fortification-geometry.js';
export function gatePosts(gate, measure) {
  return [wallPoint(measure, gate.arc - gate.opening / 2 - gate.postRadius), wallPoint(measure, gate.arc + gate.opening / 2 + gate.postRadius)];
}
export function outsideCityConnection(a, b, boundary) {
  const cuts = [0, 1];
  for (let i = 0; i < boundary.length; i++) cuts.push(...segmentCuts(a, b, boundary[i], boundary[(i + 1) % boundary.length]));
  cuts.sort((a, b) => a - b);
  for (let i = 1; i < cuts.length; i++)
    if (cuts[i] - cuts[i - 1] > 1e-8 && pointInPolygon(lerpPoint(a, b, (cuts[i] + cuts[i - 1]) / 2), boundary)) return false;
  return true;
}
export function gateIsClear(gate, wall, measure = measureWall(wall.path)) {
  const points = gate.connection.points,
    half = (gate.connection.width + STREET_EDGE_WIDTH) / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i],
      end = points[i + 1];
    for (const section of solidWallSegments(wall, [gate]))
      if (segmentDistance(start, end, section.a, section.b) < half + (wall.width + (wall.edgeWidth ?? WALL_EDGE_WIDTH)) / 2 + .45) return false;
    for (const post of gatePosts(gate, measure))
      if (distanceToSegment(post, start, end) < half + gate.postRadius + .45) return false;
  }
  return true;
}
