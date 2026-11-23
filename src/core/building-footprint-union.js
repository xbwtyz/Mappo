import { pointInPolygon, polygonSignedArea } from './geometry.js';
import { distanceToSegment, lerpPoint, segmentCuts } from './boundary.js';
import { shapeWellFormed } from './building-validation.js';
import { createS10GeometryBudget, S10_REGION_LIMITS } from './building-topology-s10.js';
import { polygonIntersectionAreaS10 } from './building-occupancy-s10.js';

const JOIN_EPS = 1e-7;
const JOIN_MIN_AREA = 1e-8;
const JOIN_WALL_EPS = 1e-9;
const joinDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const joinEdges = ring => ring.map((a, i) => ({a, b:ring[(i + 1) % ring.length], cuts:[0,1]}));

// Split at every crossing and collinear endpoint. Classify the resulting
// directed segments so a shared wall disappears and a crossing is stitched.
export function joinBuildingExteriors(destination, incoming, budget = createS10GeometryBudget()) {
  const rings = [destination, incoming];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length > S10_REGION_LIMITS.maxVertices)
      throw Error('Join footprints exceeds the supported ring size.');
    budget.charge(ring.length ** 2);
    if (!shapeWellFormed(ring)) throw Error('Both join footprints must be simple, positive-area outlines.');
  }
  const [first, second] = rings.map(joinEdges);
  for (const a of first) for (const b of second) {
    budget.charge();
    a.cuts.push(...segmentCuts(a.a, a.b, b.a, b.b));
    b.cuts.push(...segmentCuts(b.a, b.b, a.a, a.b));
  }

  const vertices = [], edges = new Map();
  function vertexFor(point) {
    budget.charge(vertices.length);
    const matches = [];
    for (const [i, vertex] of vertices.entries())
      if (joinDistance(point, vertex) <= JOIN_EPS) matches.push(i);
    if (matches.length > 1) throw Error('The join has ambiguous, nearly coincident vertices.');
    if (matches.length) return matches[0];
    return vertices.push(point) - 1;
  }

  for (const [source, segments] of [first, second].entries()) {
    const other = rings[1 - source];
    for (const {a,b,cuts} of segments) {
      const length = joinDistance(a,b);
      const unique = [0];
      for (const t of cuts.sort((x,y) => x-y)) {
        if ((t - unique.at(-1)) * length > JOIN_EPS) unique.push(t);
      }
      unique[unique.length - 1] = 1;
      for (let i = 1; i < unique.length; i++) {
        const start = unique[i-1], end = unique[i];
        const middle = lerpPoint(a,b,(start + end) / 2);
        budget.charge(other.length * 2);
        const onWall = other.some((p,j) => distanceToSegment(middle,p,other[(j+1)%other.length]) <= JOIN_WALL_EPS);
        if (!onWall && pointInPolygon(middle,other)) continue;
        const from = vertexFor(lerpPoint(a,b,start)), to = vertexFor(lerpPoint(a,b,end));
        if (from === to) throw Error('The join has a collapsed edge.');
        const key = from < to ? from + ':' + to : to + ':' + from;
        const previous = edges.get(key);
        if (previous) {
          if (!onWall || !previous.onWall || previous.source === source)
            throw Error('The join has an ambiguous shared seam.');
          if (previous.from !== from) edges.delete(key);
        } else {
          edges.set(key,{from,to,source,onWall});
        }
      }
    }
  }

  const outgoing = new Map(), incomingVertices = new Set();
  for (const edge of edges.values()) {
    if (outgoing.has(edge.from) || incomingVertices.has(edge.to))
      throw Error('The footprints only meet at a corner or form a branching seam.');
    outgoing.set(edge.from,edge.to);
    incomingVertices.add(edge.to);
  }
  const start = outgoing.keys().next().value, visited = new Set(), outline = [];
  let current = start;
  while (outgoing.has(current) && !visited.has(current)) {
    visited.add(current);
    outline.push(vertices[current]);
    current = outgoing.get(current);
  }
  if (current !== start || outline.length !== edges.size)
    throw Error('The join must form one outline. Move parts together or avoid enclosing a new courtyard.');

  // Remove redundant seam endpoints while keeping meaningful corners.
  const simplified = outline.filter((point, i) => {
    const previous = outline[(i+outline.length-1)%outline.length], next = outline[(i+1)%outline.length];
    return distanceToSegment(point,previous,next) > JOIN_EPS;
  });
  if (simplified.length > S10_REGION_LIMITS.maxVertices) throw Error('The joined outline has too many vertices.');
  budget.charge(simplified.length ** 2);
  if (!shapeWellFormed(simplified)) throw Error('The joined outline is degenerate or crosses itself.');
  const areas = rings.map(polygonSignedArea);
  const area = polygonSignedArea(simplified);
  if (area <= Math.max(...areas) + JOIN_MIN_AREA) throw Error('One footprint is contained in the other and adds no occupied area.');
  const expected = areas[0] + areas[1] - polygonIntersectionAreaS10(...rings,budget);
  if (Math.abs(area - expected) > Math.max(JOIN_MIN_AREA, expected * 1e-9))
    throw Error('The joined outline could not be verified at the current precision.');
  return simplified;
}
