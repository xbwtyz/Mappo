import {
  gatePosts,
  outsideCityConnection,
  gateIsClear
} from '../core/gate-geometry.js';
import {
  createRng
} from '../core/prng.js';
import {
  boundsOf,
  pointInPolygon
} from '../core/geometry.js';
import {
  distanceToSegment,
  segmentCuts,
  lerpPoint
} from '../core/boundary.js';
import {
  segmentDistance,
  STREET_WIDTHS,
  STREET_EDGE_WIDTH
} from '../core/placement.js';
import {
  GATE_OPENING,
  GATE_POST_RADIUS,
  measureWall,
  wallPoint,
  wallArcGap,
  solidWallSegments
} from '../core/fortification-geometry.js';

function firstWallHit(origin, direction, measure) {
  let best = null;
  for (let i = 0; i < measure.path.length; i++) {
    const a = measure.path[i],
      b = measure.path[(i + 1) % measure.path.length],
      sx = b.x - a.x,
      sy = b.y - a.y,
      den = direction.x * sy - direction.y * sx;
    if (Math.abs(den) < 1e-9) continue;
    const qx = a.x - origin.x,
      qy = a.y - origin.y,
      t = (qx * sy - qy * sx) / den,
      u = (qx * direction.y - qy * direction.x) / den;
    if (t <= 1e-6 || u < -1e-8 || u > 1 + 1e-8) continue;
    const length = Math.hypot(sx, sy),
      alignment = (direction.x * sy - direction.y * sx) / length;
    if (!best || t < best.t - 1e-6 || Math.abs(t - best.t) < 1e-6 && alignment > best.alignment) best = {
      t,
      arc: measure.distances[i] + Math.max(0, Math.min(1, u)) * length,
      center: {
        x: origin.x + direction.x * t,
        y: origin.y + direction.y * t
      },
      alignment
    };
  }
  return best;
}
export function choosePerimeterGates(city, wall, {
  seed,
  count
}) {
  const rng = createRng(`${seed}:gates:v1`),
    measure = measureWall(wall.path),
    boundary = city.survey.boundary;
  const nodes = new Map(city.nodes.map(n => [n.id, n])),
    incident = new Map(city.nodes.map(n => [n.id, []]));
  for (const road of city.roads) {
    incident.get(road.a).push({
      road,
      other: nodes.get(road.b)
    });
    incident.get(road.b).push({
      road,
      other: nodes.get(road.a)
    });
  }
  const candidates = [];
  for (const node of city.nodes) {
    const edges = [];
    for (let i = 0; i < boundary.length; i++)
      if (distanceToSegment(node, boundary[i], boundary[(i + 1) % boundary.length]) < 1e-5) edges.push([boundary[i], boundary[(i + 1) % boundary.length]]);
    if (!edges.length) continue;
    const directions = [];
    let priority = .5;
    for (const {
        road,
        other
      }
      of incident.get(node.id)) {
      if (!pointInPolygon(other, boundary) || boundary.some((p, i) => distanceToSegment(other, p, boundary[(i + 1) % boundary.length]) < 1e-5)) continue;
      const length = Math.hypot(node.x - other.x, node.y - other.y),
        rank = road.kind === 'primary' ? 3 : road.kind === 'secondary' ? 2 : 1;
      priority = Math.max(priority, rank);
      directions.push({
        x: (node.x - other.x) / length,
        y: (node.y - other.y) / length
      });
    }
    let nx = 0,
      ny = 0;
    for (const [a, b] of edges) {
      const length = Math.hypot(b.x - a.x, b.y - a.y),
        x = (b.y - a.y) / length,
        y = -(b.x - a.x) / length;
      nx += x;
      ny += y;
      directions.push({
        x,
        y
      });
    }
    if (Math.hypot(nx, ny) > 1e-6) directions.push({
      x: nx / Math.hypot(nx, ny),
      y: ny / Math.hypot(nx, ny)
    });
    let best = null;
    for (const direction of directions) {
      const hit = firstWallHit(node, direction, measure);
      if (!hit || hit.alignment < .72) continue;
      const exit = {
        x: hit.center.x + direction.x * 24,
        y: hit.center.y + direction.y * 24
      };
      if (pointInPolygon(exit, wall.path) || !outsideCityConnection(node, exit, boundary)) continue;
      const gate = {
        id: 'candidate',
        dataVersion: 1,
        kind: 'street-gate',
        wallId: wall.id,
        arc: hit.arc % measure.length,
        opening: GATE_OPENING,
        postRadius: GATE_POST_RADIUS,
        center: hit.center,
        connection: {
          cityNodeId: node.id,
          points: [{
            x: node.x,
            y: node.y
          }, hit.center, exit],
          width: STREET_WIDTHS.secondary
        },
        extensions: {}
      };
      if (!gateIsClear(gate, wall, measure)) continue;
      const quality = priority + hit.alignment * .25 + rng() * .15;
      if (!best || quality > best.quality) best = {
        gate,
        quality
      };
    }
    if (best) candidates.push(best);
  }
  if (!candidates.length) throw new Error('No safe gate connection was found at the perimeter streets. Try a simpler outline.');
  const chosen = [];
  while (chosen.length < count) {
    let best = null,
      bestScore = -Infinity;
    for (const candidate of candidates) {
      if (chosen.includes(candidate)) continue;
      let gap = measure.length / 2,
        blocked = false;
      for (const other of chosen) {
        gap = Math.min(gap, wallArcGap(candidate.gate.arc, other.gate.arc, measure.length));
        const a = candidate.gate.connection.points,
          b = other.gate.connection.points;
        if (segmentDistance(a[0], a[2], b[0], b[2]) < 14) blocked = true;
      }
      if (gap < 58 || blocked) continue;
      const score = chosen.length ? gap * (.8 + .2 * candidate.quality / 3.5) : candidate.quality;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen.sort((a, b) => a.gate.arc - b.gate.arc).map((item, i) => ({
    ...item.gate,
    id: `GATE-${String(i+1).padStart(3,'0')}`
  }));
}
