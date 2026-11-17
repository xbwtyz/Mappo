import {
  pointInPolygon
} from './geometry.js';
import {
  distanceToSegment
} from './boundary.js';
import {
  STREET_WIDTHS,
  STREET_EDGE_WIDTH,
  segmentDistance
} from './placement.js';
import {
  WALL_CLEARANCE,
  WALL_EDGE_WIDTH,
  measureWall,
  wallPoint,
  wallArcGap,
  simpleWallPath,
  wallEnclosesCity,
  solidWallSegments
} from './fortification-geometry.js';
import {
  gatePosts,
  gateIsClear,
  outsideCityConnection
} from './gate-geometry.js';

function fortificationPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) <= 100000 && Math.abs(point.y) <= 100000;
}

function fortificationRecords(records, limit) {
  if (!Array.isArray(records) || records.length > limit) throw new Error('Invalid fortification records.');
  const ids = new Set();
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 128 || ids.has(record.id)) throw new Error('Invalid or duplicate fortification ID.');
    ids.add(record.id);
  }
}
export function validateFortifications(city) {
  const state = city.fortificationState;
  if (!state || state.version !== 1 || !['unbuilt', 'built'].includes(state.status)) throw new Error('Unsupported fortification data. Use a compatible Mappo build.');
  if (typeof state.enabled !== 'boolean') throw new Error('Invalid fortification enable setting.');
  fortificationRecords(city.walls, 20000);
  fortificationRecords(city.gates, 20000);
  fortificationRecords(city.towers, 20000);
  if (state.status === 'unbuilt') {
    if (state.enabled) throw new Error('Unbuilt walls cannot be enabled.');
    return city;
  }
  if (city.walls.length !== 1 || !city.gates.length || city.gates.length > 8 || city.towers.length > 512) throw new Error('A fortified perimeter needs a wall and at least one connected gate.');
  if (!Number.isInteger(state.requestedGateCount) || state.requestedGateCount < 1 || state.requestedGateCount > 8 || state.gateCount !== city.gates.length || state.gateCount > state.requestedGateCount || !Number.isFinite(state.towerSpacing) || state.towerSpacing < 40 || state.towerSpacing > 200 || typeof state.seed !== 'string' || state.seed.length > 64) throw new Error('Invalid fortification settings.');
  let work = 4000000;
  const spend = n => {
    work -= n;
    if (work < 0) throw new Error('Fortifications are too complex to validate in this build.');
  };
  const wall = city.walls[0],
    boundary = city.survey.boundary,
    nodes = new Map(city.nodes.map(n => [n.id, n]));
  if (wall.dataVersion !== 1 || wall.kind !== 'perimeter') throw new Error('Unsupported wall kind or version.');
  if (wall.edgeWidth !== undefined && (!Number.isFinite(wall.edgeWidth) || wall.edgeWidth < 0 || wall.edgeWidth > 4)) throw new Error('Invalid wall edge width.');
  if (!Number.isFinite(wall.width) || wall.width < 2 || wall.width > 12 || !Array.isArray(wall.path) || wall.path.length > 1024 || !wall.path.every(fortificationPoint)) throw new Error('Invalid wall geometry.');
  if (!simpleWallPath(wall.path)) throw new Error('The wall crosses itself or is not a simple ring.');
  if (!wallEnclosesCity(wall.path, boundary, WALL_CLEARANCE)) throw new Error('The wall fails to enclose the city with safe street clearance.');
  const measure = measureWall(wall.path);
  for (const gate of city.gates) {
    if (gate.dataVersion !== 1 || gate.kind !== 'street-gate') throw new Error('Unsupported gate data version or kind.');
    if (gate.wallId !== wall.id) throw new Error('Invalid gate wall reference.');
    if (!Number.isFinite(gate.arc) || gate.arc < 0 || gate.arc >= measure.length || !Number.isFinite(gate.opening) || gate.opening < 20 || gate.opening > 60 || !Number.isFinite(gate.postRadius) || gate.postRadius < 2 || gate.postRadius > 10 || !fortificationPoint(gate.center)) throw new Error('Invalid gate geometry.');
    const at = wallPoint(measure, gate.arc);
    if (Math.hypot(at.x - gate.center.x, at.y - gate.center.y) > 1e-4) throw new Error('A gate does not lie on its wall.');
    const c = gate.connection,
      source = nodes.get(c?.cityNodeId);
    if (!source || !Number.isFinite(c.width) || c.width < 4 || c.width > 16 || !Array.isArray(c.points) || c.points.length < 3 || c.points.length > 32 || !c.points.every(fortificationPoint) || Math.hypot(c.points[0].x - source.x, c.points[0].y - source.y) > 1e-6 || !c.points.some(p => Math.hypot(p.x - gate.center.x, p.y - gate.center.y) < 1e-5)) throw new Error('A gate has no valid connection to the saved street graph.');
    if (!boundary.some((p, i) => distanceToSegment(source, p, boundary[(i + 1) % boundary.length]) < 1e-5)) throw new Error('Gate approaches must begin at a perimeter street junction.');
    if (pointInPolygon(c.points.at(-1), wall.path) || wall.path.some((p, i) => distanceToSegment(c.points.at(-1), p, wall.path[(i + 1) % wall.path.length]) < (c.width + STREET_EDGE_WIDTH + wall.width + (wall.edgeWidth ?? WALL_EDGE_WIDTH)) / 2 + .5)) throw new Error('A gate approach does not exit the wall.');
    for (let i = 0; i < c.points.length - 1; i++) {
      if (!outsideCityConnection(c.points[i], c.points[i + 1], boundary)) throw new Error('A gate approach crosses city blocks.');
    }
    if (!gateIsClear(gate, wall, measure)) throw new Error('A gate opening is blocked by its own wall or gateposts.');
  }
  for (let i = 0; i < city.gates.length; i++)
    for (let j = i + 1; j < city.gates.length; j++) {
      const a = city.gates[i],
        b = city.gates[j];
      if (wallArcGap(a.arc, b.arc, measure.length) < (a.opening + b.opening) / 2 + 1) throw new Error('Gate openings overlap.');
      for (const pa of gatePosts(a, measure))
        for (const pb of gatePosts(b, measure))
          if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < a.postRadius + b.postRadius + .5) throw new Error('Gatehouses overlap.');
      for (let p = 0; p < a.connection.points.length - 1; p++)
        for (let q = 0; q < b.connection.points.length - 1; q++)
          if (segmentDistance(a.connection.points[p], a.connection.points[p + 1], b.connection.points[q], b.connection.points[q + 1]) < (a.connection.width + b.connection.width) / 2 + STREET_EDGE_WIDTH) throw new Error('Gate approaches cross without a junction.');
    }
  const solids = solidWallSegments(wall, city.gates);
  for (const section of solids)
    for (const road of city.roads) {
      spend(1);
      if (segmentDistance(section.a, section.b, nodes.get(road.a), nodes.get(road.b)) < (wall.width + (wall.edgeWidth ?? WALL_EDGE_WIDTH) + STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + .5) throw new Error('A wall blocks an existing street.');
    }
  for (const tower of city.towers) {
    if (tower.dataVersion !== 1 || tower.kind !== 'round') throw new Error('Unsupported tower data version or kind.');
    if (tower.wallId !== wall.id || !Number.isFinite(tower.arc) || tower.arc < 0 || tower.arc >= measure.length || !fortificationPoint(tower.center) || !Number.isFinite(tower.radius) || tower.radius < 2 || tower.radius > 20) throw new Error('Invalid tower geometry or wall reference.');
    const at = wallPoint(measure, tower.arc);
    if (Math.hypot(at.x - tower.center.x, at.y - tower.center.y) > 1e-4) throw new Error('A tower is detached from its wall.');
    for (const road of city.roads) {
      spend(1);
      if (distanceToSegment(tower.center, nodes.get(road.a), nodes.get(road.b)) < tower.radius + (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + .5) throw new Error('A tower blocks a street.');
    }
    for (const gate of city.gates) {
      for (const post of gatePosts(gate, measure))
        if (Math.hypot(tower.center.x - post.x, tower.center.y - post.y) < tower.radius + gate.postRadius + .5) throw new Error('A tower overlaps a gatehouse.');
      for (let i = 0; i < gate.connection.points.length - 1; i++)
        if (distanceToSegment(tower.center, gate.connection.points[i], gate.connection.points[i + 1]) < tower.radius + (gate.connection.width + STREET_EDGE_WIDTH) / 2 + .5) throw new Error('A tower blocks a gate approach.');
    }
  }
  for (let i = 0; i < city.towers.length; i++)
    for (let j = i + 1; j < city.towers.length; j++) {
      const a = city.towers[i],
        b = city.towers[j];
      if (Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) < a.radius + b.radius + .5) throw new Error('Defensive towers overlap.');
    }
  return city;
}
export function fortificationViewPoints(city) {
  if (city.fortificationState?.status !== 'built' || !city.fortificationState.enabled) return city.survey.boundary;
  return [...city.survey.boundary, ...city.walls.flatMap(w => w.path), ...city.gates.flatMap(g => g.connection.points), ...city.towers.flatMap(t => [{
    x: t.center.x - t.radius,
    y: t.center.y - t.radius
  }, {
    x: t.center.x + t.radius,
    y: t.center.y + t.radius
  }])];
}

export function setFortificationsEnabled(city, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether fortifications are enabled.');
  if (city.fortificationState.status !== 'built' && enabled) throw new Error('Build fortifications before enabling them.');
  if (city.fortificationState.enabled === enabled) return city;
  const next = {
    ...city,
    fortificationState: {
      ...city.fortificationState,
      enabled
    }
  };
  validateFortifications(next);
  return next;
}
