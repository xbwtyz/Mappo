import {
  createRng
} from '../core/prng.js';
import {
  distanceToSegment
} from '../core/boundary.js';
import {
  STREET_EDGE_WIDTH
} from '../core/placement.js';
import {
  TOWER_RADIUS,
  measureWall,
  wallPoint,
  wallArcGap
} from '../core/fortification-geometry.js';
import {
  gatePosts
} from '../core/gate-geometry.js';

export function placePerimeterTowers(wall, gates, {
  spacing,
  seed
}) {
  const measure = measureWall(wall.path),
    rng = createRng(`${seed}:towers:v1`),
    towers = [];

  function add(arc, role) {
    arc = ((arc % measure.length) + measure.length) % measure.length;
    const center = wallPoint(measure, arc);
    if ((wall.waterOpenings ?? []).some(o => arc >= o.start - TOWER_RADIUS - 3 && arc <= o.end + TOWER_RADIUS + 3)) return;
    if (towers.some(t => Math.hypot(t.center.x - center.x, t.center.y - center.y) < TOWER_RADIUS * 2 + 5)) return;
    for (const gate of gates) {
      if (wallArcGap(arc, gate.arc, measure.length) < gate.opening / 2 + gate.postRadius * 2 + TOWER_RADIUS + 2) return;
      if (gatePosts(gate, measure).some(p => Math.hypot(p.x - center.x, p.y - center.y) < TOWER_RADIUS + gate.postRadius + 2)) return;
      const points = gate.connection.points;
      if (distanceToSegment(center, points[0], points[2]) < TOWER_RADIUS + (gate.connection.width + STREET_EDGE_WIDTH) / 2 + 2) return;
    }
    towers.push({
      id: `TOWER-${String(towers.length+1).padStart(3,'0')}`,
      dataVersion: 1,
      kind: 'round',
      role,
      wallId: wall.id,
      arc,
      center,
      radius: TOWER_RADIUS,
      extensions: {}
    });
  }
  const corners = [];
  for (let i = 0; i < wall.path.length; i++) {
    const arc = measure.distances[i],
      p = wallPoint(measure, arc - 14),
      q = wall.path[i],
      r = wallPoint(measure, arc + 14),
      ax = q.x - p.x,
      ay = q.y - p.y,
      bx = r.x - q.x,
      by = r.y - q.y;
    const angle = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)))));
    if (angle > .72) corners.push({
      arc,
      angle
    });
  }
  corners.sort((a, b) => b.angle - a.angle).forEach(c => add(c.arc, 'corner'));
  const count = Math.max(3, Math.ceil(measure.length / spacing)),
    phase = rng() * measure.length / count;
  for (let i = 0; i < count; i++) add(phase + i * measure.length / count, 'interval');
  return towers.sort((a, b) => a.arc - b.arc).map((t, i) => ({
    ...t,
    id: `TOWER-${String(i+1).padStart(3,'0')}`
  }));
}
