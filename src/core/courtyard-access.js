// Courtyard access grants a passage through a wall while preserving its footprint.
import { boundsOf, pointInPolygon } from './geometry.js';
import { clearance, cross2, distanceToSegment, lerpPoint, segmentCuts } from './boundary.js';
import { classifyRoad } from './road-graph.js';
import { PROPERTY_SETBACK, STREET_EDGE_WIDTH, STREET_WIDTHS } from './placement.js';
import { terminalCorridors } from './road-terminal-corridors.js';

export const COURTYARD_ACCESS_LIMITS = Object.freeze({
  portals: 16, occupants: 32, routePoints: 32, waypoints: 192, searchWork: 400000,
  minWidth: .5, maxWidth: 8, landing: .35
});
const COURTYARD_EPS = 1e-6;
const courtyardLength = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const courtyardSame = (a, b) => courtyardLength(a, b) <= COURTYARD_EPS;
const courtyardPoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y) &&
  Math.abs(p.x) < 10000 && Math.abs(p.y) < 10000;
const courtyardId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const courtyardEdges = ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]);
const courtyardRecords = building => building.geometry?.version === 2 ? building.geometry.courtyardAccess : null;
const courtyardStrictInside = (p, ring) => pointInPolygon(p, ring) && clearance(p, ring) > COURTYARD_EPS;
const courtyardBoxesMeet = (a, b) => a.minX <= b.maxX + COURTYARD_EPS && b.minX <= a.maxX + COURTYARD_EPS &&
  a.minY <= b.maxY + COURTYARD_EPS && b.minY <= a.maxY + COURTYARD_EPS;
const courtyardFail = message => { throw new Error(message); };

function courtyardCuts(a, b, ring) {
  return courtyardEdges(ring).flatMap(([c, d]) => segmentCuts(a, b, c, d));
}

function courtyardOpenSegment(a, b, ring, inside) {
  return courtyardLength(a, b) > COURTYARD_EPS &&
    courtyardCuts(a, b, ring).every(t => t <= COURTYARD_EPS || t >= 1 - COURTYARD_EPS) &&
    clearance(lerpPoint(a, b, .5), ring) > COURTYARD_EPS &&
    pointInPolygon(lerpPoint(a, b, .5), ring) === inside;
}

function courtyardOpening(interval, ring) {
  if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(courtyardPoint))
    courtyardFail('A portal opening needs two finite points.');
  const [start, end] = interval;
  const length = courtyardLength(start, end);
  if (length < COURTYARD_ACCESS_LIMITS.minWidth - COURTYARD_EPS || length > COURTYARD_ACCESS_LIMITS.maxWidth + COURTYARD_EPS ||
      !courtyardEdges(ring).some(([a, b]) => interval.every(p => distanceToSegment(p, a, b) <= COURTYARD_EPS &&
        courtyardLength(p, a) > COURTYARD_EPS && courtyardLength(p, b) > COURTYARD_EPS)))
    courtyardFail('Place each portal opening within one wall edge, clear of its corners.');
  return lerpPoint(start, end, .5);
}

export function inspectCourtyardPortal(city, host, portal, spend = () => {}) {
  const regions = host.geometry.regions;
  spend(regions.reduce((n, r) => n + r.ring.length, 0) * 16);
  const exterior = regions.find(r => r.id === portal?.exteriorId && r.kind === 'solid' && r.parentId === null);
  const courtyard = regions.find(r => exterior && r.id === portal.courtyardId && r.kind === 'void' && r.parentId === exterior.id);
  if (!courtyard || regions.length !== 1 + regions.filter(r => r.kind === 'void' && r.parentId === exterior.id).length)
    courtyardFail('Choose a direct courtyard in a building with one exterior and flat courtyards.');
  if (!courtyardId(portal.id)) courtyardFail('The courtyard portal ID is invalid.');
  const outer = exterior.ring, hole = courtyard.ring;
  const inner = courtyardOpening(portal.inner, hole), exit = courtyardOpening(portal.outer, outer);
  const [a, b] = portal.inner, [c, d] = portal.outer;
  // Join endpoints on the same side of travel even when the walls meet the
  // passage at different angles. Check both sides as well as the centerline.
  if (segmentCuts(a, c, b, d).length ||
      ![[a, c], [inner, exit], [b, d]].every(([from, to]) =>
        courtyardOpenSegment(from, to, outer, true) && courtyardOpenSegment(from, to, hole, false)))
    courtyardFail('The openings must face each other across one clear wall passage.');
  const length = courtyardLength(inner, exit);
  const landing = (p, sign) => ({x: p.x + sign * (exit.x - inner.x) / length * COURTYARD_ACCESS_LIMITS.landing,
    y: p.y + sign * (exit.y - inner.y) / length * COURTYARD_ACCESS_LIMITS.landing});
  const insideLanding = [landing(a, -1), landing(b, -1)];
  const outsideLanding = [landing(c, 1), landing(d, 1)];
  const property = city.properties.find(p => p.id === host.propertyId);
  // Keep the exact corners at both openings. Connecting the landing corners
  // directly would shift the sides of a skewed passage away from those openings.
  const strip = [insideLanding[0], a, c, ...outsideLanding, d, b, insideLanding[1]];
  if (!property || !strip.every(p => courtyardStrictInside(p, property.boundary)) ||
      courtyardEdges(strip).some(([x, y]) => courtyardCuts(x, y, property.boundary).length) ||
      !courtyardOpenSegment(...insideLanding, hole, true) || !courtyardOpenSegment(...outsideLanding, outer, false) ||
      ![0, 1].every(i => courtyardOpenSegment(insideLanding[i], portal.inner[i], hole, true) &&
        courtyardOpenSegment(portal.outer[i], outsideLanding[i], outer, false)))
    courtyardFail('The portal needs clear landings on both sides within the property.');
  if ([...outer, ...hole].some(point => courtyardStrictInside(point, strip)))
    courtyardFail('A wall corner interrupts the full portal width.');
  const bounds = boundsOf(strip);
  for (const building of city.buildings) {
    spend(1);
    const rings = building.geometry.regions.filter(region => building.id !== host.id ||
      (region.kind === 'void' && region.id !== courtyard.id));
    for (const region of rings) {
      spend(region.ring.length);
      if (!courtyardBoxesMeet(bounds, boundsOf(region.ring))) continue;
      spend(strip.length * region.ring.length);
      if (region.ring.some(p => pointInPolygon(p, strip)) || strip.some(p => pointInPolygon(p, region.ring)) ||
          courtyardEdges(strip).some(([x, y]) => courtyardCuts(x, y, region.ring).length))
        courtyardFail('Portal ' + portal.id + ' is obstructed by ' + building.id + '.');
    }
  }
  return {inner, exit, outer, hole, strip, property};
}

export function findCourtyardAccess(city, buildingId) {
  for (const host of city.buildings) {
    const access = courtyardRecords(host);
    const link = access?.occupants?.find(entry => entry.buildingId === buildingId);
    if (link) return {host, portal: access.portals.find(portal => portal.id === link.portalId)};
  }
  return null;
}

export function makeCourtyardPortal(host, spec, id) {
  const hole = host.geometry.regions.find(r => r.id === spec.courtyardId && r.kind === 'void');
  const exterior = host.geometry.regions.find(r => r.id === hole?.parentId && r.parentId === null);
  const innerEdge = hole && courtyardEdges(hole.ring)[spec.innerEdge];
  const outerEdge = exterior && courtyardEdges(exterior.ring)[spec.outerEdge];
  if (!innerEdge || !outerEdge || !['innerOffset', 'outerOffset', 'width'].every(k => Number.isFinite(spec[k])))
    courtyardFail('Select a courtyard and its two wall edges.');
  const opening = ([a, b], offset) => {
    const half = spec.width / (2 * courtyardLength(a, b));
    return [lerpPoint(a, b, offset - half), lerpPoint(a, b, offset + half)];
  };
  const inner = opening(innerEdge, spec.innerOffset), outer = opening(outerEdge, spec.outerOffset);
  const start = lerpPoint(...inner, .5), end = lerpPoint(...outer, .5);
  const travel = {x: end.x - start.x, y: end.y - start.y};
  const openingSide = ([a, b]) => cross2(travel, {x: b.x - a.x, y: b.y - a.y});
  if (openingSide(inner) * openingSide(outer) < 0) outer.reverse();
  return {id, exteriorId: exterior.id, courtyardId: hole.id, inner, outer};
}

function courtyardRouteContext(city, host, portal, building, spend) {
  const passage = inspectCourtyardPortal(city, host, portal, spend);
  const {hole, property} = passage;
  const roots = building.geometry.regions.filter(r => r.parentId === null);
  if (building.id === host.id || building.propertyId !== host.propertyId || courtyardRecords(building) ||
      roots.length !== 1 || building.geometry.regions.length !== 1)
    courtyardFail('Courtyard building ' + building.id + ' needs one independent footprint on the same property.');
  const roof = roots[0].ring;
  spend(roof.length * hole.length * 2);
  if (!roof.every(p => courtyardStrictInside(p, hole)) ||
      courtyardEdges(roof).some(([a, b]) => courtyardCuts(a, b, hole).length))
    courtyardFail('Building ' + building.id + ' must fit entirely inside courtyard ' + portal.courtyardId + '.');
  const block = city.blocks.find(b => b.id === property.blockId);
  const nodeById = new Map(city.nodes.map(n => [n.id, n]));
  const terminalIds = new Set(terminalCorridors(city).map(c => c.id));
  const road = city.roads.find(r => r.id === property.frontageRoadId && !terminalIds.has(r.id));
  const frontage = property.frontage;
  const neighbors = road && block?.vertices.some((id, i) => {
    const next = block.vertices[(i + 1) % block.vertices.length];
    return id === road.a && next === road.b || id === road.b && next === road.a;
  });
  if (!neighbors || classifyRoad(road).protected || !Array.isArray(frontage) || frontage.length !== 2 ||
      !frontage.every(courtyardPoint) || courtyardSame(...frontage) ||
      !courtyardEdges(property.boundary).some(([a, b]) => frontage.every(p => distanceToSegment(p, a, b) <= COURTYARD_EPS)))
    courtyardFail('Courtyard access needs a verified street-facing property edge.');
  const roadEnds = [nodeById.get(road.a), nodeById.get(road.b)];
  if (!roadEnds.every(courtyardPoint)) courtyardFail('Courtyard frontage ' + road.id + ' has missing endpoints.');
  const [a, b] = roadEnds;
  const roadLength = courtyardLength(a, b);
  const offset = p => ((p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y)) / roadLength;
  const offsets = frontage.map(offset);
  const setback = (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK;
  if (!Number.isFinite(setback) || !offsets.every(Number.isFinite) ||
      Math.abs(offsets[0] - offsets[1]) > 1e-4 || Math.abs(offsets[0]) < setback - 1e-4 ||
      !frontage.some(p => {
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / roadLength ** 2;
        return t >= -COURTYARD_EPS && t <= 1 + COURTYARD_EPS;
      }))
    courtyardFail('The property edge no longer matches frontage ' + road.id + '.');
  const obstacles = [
    ...city.buildings.filter(b => b.id !== host.id).map(b => ({id: b.id, rings: b.geometry.regions})),
    ...city.properties.filter(p => p.id !== property.id).map(p => ({id: p.id, rings: [{kind: 'solid', ring: p.boundary}]}))
  ].map(record => ({...record, rings: record.rings.map(r => {
    spend(r.ring.length);
    return {...r, bounds: boundsOf(r.ring)};
  })}));
  const streetEdges = city.roads.filter(r => r.id !== road.id).map(r => [nodeById.get(r.a), nodeById.get(r.b)]);
  return {...passage, roof, road, roadEnds, frontage, obstacles, streetEdges, spend, buildingId: building.id};
}

function courtyardBlocker(context, a, b, phase) {
  const {hole, outer, property, obstacles, spend} = context;
  const relevant = phase === 'inside' ? hole : outer;
  spend(relevant.length + property.boundary.length);
  if (!courtyardOpenSegment(a, b, relevant, phase === 'inside')) return 'courtyard wall';
  if (phase !== 'street' && !courtyardOpenSegment(a, b, property.boundary, true)) return property.id;
  if (phase === 'street') {
    if (courtyardCuts(a, b, property.boundary).some(t => t > COURTYARD_EPS) ||
        pointInPolygon(lerpPoint(a, b, .5), property.boundary)) return property.id;
    spend(context.streetEdges.length);
    if (context.streetEdges.some(([c, d]) => c && d && segmentCuts(a, b, c, d).length))
      return 'a different street';
  }
  const bounds = boundsOf([a, b]);
  for (const obstacle of obstacles) {
    let occupancy = 0;
    const middle = lerpPoint(a, b, .5);
    for (const region of obstacle.rings) {
      spend(1);
      if (!courtyardBoxesMeet(bounds, region.bounds)) continue;
      spend(region.ring.length);
      const touches = courtyardCuts(a, b, region.ring);
      if (touches.some(t => t > COURTYARD_EPS && t < 1 - COURTYARD_EPS) ||
          (obstacle.id !== context.buildingId && (clearance(a, region.ring) <= COURTYARD_EPS ||
            clearance(b, region.ring) <= COURTYARD_EPS)) ||
          clearance(middle, region.ring) <= COURTYARD_EPS) return obstacle.id;
      if (pointInPolygon(middle, region.ring)) occupancy += region.kind === 'solid' ? 1 : -1;
    }
    if (occupancy > 0) return obstacle.id;
  }
  return null;
}

function courtyardNearest(p, [a, b]) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return lerpPoint(a, b, t);
}

function courtyardCheckRoute(context, building) {
  const {inner, exit, roof, frontage, road, roadEnds} = context;
  const path = building.accessPath;
  if (!Array.isArray(path) || path.length < 5 || path.length > COURTYARD_ACCESS_LIMITS.routePoints ||
      !path.every(courtyardPoint) || !courtyardPoint(building.entrance) || !courtyardSame(path[0], building.entrance) ||
      clearance(path[0], roof) > COURTYARD_EPS || building.frontageRoadId !== road.id ||
      distanceToSegment(path.at(-2), ...frontage) > COURTYARD_EPS ||
      courtyardSame(path.at(-2), frontage[0]) || courtyardSame(path.at(-2), frontage[1]) ||
      !courtyardSame(path.at(-1), courtyardNearest(path.at(-2), roadEnds)))
    return 'the door, saved path or street frontage';
  const index = path.findIndex(p => courtyardSame(p, inner));
  if (index < 1 || index > path.length - 4 || !courtyardSame(path[index + 1], exit)) return 'the selected portal';
  for (let i = 0; i < path.length - 1; i++) {
    if (i === index) continue;
    const blocker = courtyardBlocker(context, path[i], path[i + 1],
      i < index ? 'inside' : i === path.length - 2 ? 'street' : 'outside');
    if (blocker) return blocker;
    const endpoint = path[i + 1];
    if (i < index - 1 && (!courtyardStrictInside(endpoint, context.hole) || clearance(endpoint, roof) <= COURTYARD_EPS))
      return 'courtyard wall or building footprint';
    if (i > index && i < path.length - 3 && (!courtyardStrictInside(endpoint, context.property.boundary) ||
        pointInPolygon(endpoint, context.outer) || clearance(endpoint, context.outer) <= COURTYARD_EPS))
      return 'exterior wall or property edge';
  }
  return null;
}

function courtyardWaypoints(context, phase) {
  const {hole, outer, property, obstacles, spend} = context;
  const area = boundsOf(phase === 'inside' ? hole : property.boundary);
  const rings = [phase === 'inside' ? hole : outer, ...(phase === 'outside' ? [property.boundary] : [])];
  for (const obstacle of obstacles)
    for (const region of obstacle.rings)
      if (courtyardBoxesMeet(area, region.bounds)) rings.push(region.ring);
  const result = [];
  for (const ring of rings) for (const vertex of ring) {
    for (const [x, y] of [[-1,-1], [-1,1], [1,-1], [1,1]]) {
      spend(phase === 'inside' ? hole.length : property.boundary.length + outer.length);
      const point = {x: vertex.x + x * .12, y: vertex.y + y * .12};
      if (phase === 'inside' ? !courtyardStrictInside(point, hole) :
          !courtyardStrictInside(point, property.boundary) || pointInPolygon(point, outer) ||
            clearance(point, outer) <= COURTYARD_EPS) continue;
      result.push(point);
      if (result.length > COURTYARD_ACCESS_LIMITS.waypoints)
        courtyardFail('Courtyard routing reached its waypoint limit.');
    }
  }
  return result;
}

// Start at the portal and search to any door (inside) or verified frontage
// point (outside). Destination points are terminal, never intermediate bends.
function courtyardSearch(context, start, targets, phase) {
  for (const target of targets) {
    if (!courtyardBlocker(context, start, target, phase)) return [start, target];
  }
  const points = [start, ...targets, ...courtyardWaypoints(context, phase)];
  const distances = points.map((_, i) => i ? Infinity : 0);
  const from = points.map(() => -1);
  const done = points.map(() => false);
  while (true) {
    let current = -1;
    for (let i = 0; i < points.length; i++)
      if (!done[i] && Number.isFinite(distances[i]) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0) return null;
    if (current > 0 && current <= targets.length) {
      const path = [];
      for (let i = current; i >= 0; i = from[i]) path.unshift(points[i]);
      return path;
    }
    done[current] = true;
    for (let i = 1; i < points.length; i++) {
      if (done[i]) continue;
      const distance = distances[current] + courtyardLength(points[current], points[i]);
      if (distance >= distances[i] || courtyardBlocker(context, points[current], points[i], phase)) continue;
      distances[i] = distance;
      from[i] = current;
    }
  }
}

export function resolveCourtyardAccess(city, building, {host, portal}) {
  try {
    let work = 0;
    const spend = units => {
      work += units;
      if (work > COURTYARD_ACCESS_LIMITS.searchWork) courtyardFail('Courtyard routing reached its search-work limit.');
    };
    const context = courtyardRouteContext(city, host, portal, building, spend);
    const {inner, exit, roof, frontage, road, roadEnds} = context;
    const retainedFailure = courtyardCheckRoute(context, building);
    if (!retainedFailure)
      return {changed: false, route: {entrance: building.entrance, accessPath: building.accessPath, frontageRoadId: road.id}};
    if (roof.length > COURTYARD_ACCESS_LIMITS.waypoints)
      courtyardFail('Courtyard routing reached its door-candidate limit.');
    const doors = courtyardEdges(roof).map(([a, b]) => lerpPoint(a, b, .5))
      .sort((a, b) => courtyardLength(a, inner) - courtyardLength(b, inner));
    const street = [.5, .25, .75, .125, .875].map(t => lerpPoint(...frontage, t))
      .filter(p => !courtyardBlocker(context, p, courtyardNearest(p, roadEnds), 'street'));
    const inside = courtyardSearch(context, inner, doors, 'inside');
    const outside = street.length && courtyardSearch(context, exit, street, 'outside');
    if (!inside || !outside)
      courtyardFail('No clear access from ' + building.id + ' through portal ' + portal.id + ' to ' + road.id +
        ' (' + retainedFailure + ').');
    const route = {entrance: inside.at(-1), accessPath: [...inside.reverse(), ...outside,
      courtyardNearest(outside.at(-1), roadEnds)], frontageRoadId: road.id};
    const failure = courtyardCheckRoute(context, {...building, ...route});
    if (failure) courtyardFail('Courtyard route is blocked by ' + failure + '.');
    return {changed: true, route};
  } catch (error) {
    return {route: null, issue: {code: 'courtyard-access', targetId: portal?.id ?? host.id, message: error.message}};
  }
}

export function validateCourtyardAccess(city, spend) {
  const owners = new Set();
  const buildings = new Map(city.buildings.map(b => [b.id, b]));
  for (const host of city.buildings) {
    const access = courtyardRecords(host);
    if (host.geometry.version !== 2) continue;
    const {portals, occupants} = access ?? {};
    if (!Array.isArray(portals) || portals.length < 1 || portals.length > COURTYARD_ACCESS_LIMITS.portals ||
        !Array.isArray(occupants) || occupants.length > COURTYARD_ACCESS_LIMITS.occupants)
      courtyardFail('Building ' + host.id + ' has invalid courtyard access records.');
    const byId = new Map();
    const linkedIds = new Set(occupants.map(link => link?.buildingId));
    const courtyards = host.geometry.regions.filter(r => r.kind === 'void');
    for (const building of city.buildings) {
      spend(1);
      if (host.id === building.id || building.propertyId !== host.propertyId || linkedIds.has(building.id)) continue;
      for (const root of building.geometry.regions.filter(r => r.parentId === null)) {
        for (const courtyard of courtyards) {
          spend(courtyard.ring.length);
          if (courtyardStrictInside(root.ring[0], courtyard.ring))
            courtyardFail('Building ' + building.id + ' needs a portal link to courtyard ' + courtyard.id + '.');
        }
      }
    }
    for (const portal of portals) {
      if (byId.has(portal?.id)) courtyardFail('Duplicate courtyard portal ID on ' + host.id + '.');
      inspectCourtyardPortal(city, host, portal, spend);
      byId.set(portal.id, portal);
    }
    for (const link of occupants) {
      const building = buildings.get(link?.buildingId), portal = byId.get(link?.portalId);
      if (!building || !portal || owners.has(building.id))
        courtyardFail('Building ' + host.id + ' has a missing or duplicate courtyard occupant or portal.');
      owners.add(building.id);
      const context = courtyardRouteContext(city, host, portal, building, spend);
      const blocker = courtyardCheckRoute(context, building);
      if (blocker) courtyardFail('Access for ' + building.id + ' through ' + portal.id + ' is blocked by ' + blocker + '.');
    }
  }
}

export function mapCourtyardAccess(geometry, map) {
  const access = geometry.courtyardAccess;
  return {...access, portals: access.portals.map(portal => ({...portal,
    inner: portal.inner.map(map), outer: portal.outer.map(map)}))};
}

// Reconcile only the hosted links touched by the current editor. The complete
// project validator checks other routes for newly introduced obstructions.
export function rerouteCourtyardOccupants(city, host) {
  const access = courtyardRecords(host);
  if (!access) return [];
  const changed = [];
  for (const {buildingId, portalId} of access.occupants) {
    const building = city.buildings.find(b => b.id === buildingId);
    const portal = access.portals.find(row => row.id === portalId);
    if (!building || !portal) courtyardFail('A courtyard building or portal was lost during the edit.');
    const result = resolveCourtyardAccess(city, building, {host, portal});
    if (!result.route) courtyardFail(result.issue.message);
    if (result.changed) {
      Object.assign(building, result.route);
      changed.push(building.id);
    }
  }
  return changed;
}
