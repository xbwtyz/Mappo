import {
  TERRAIN_LIMIT,
  terrainPoint,
  terrainShapeSafe,
  terrainRidgeSafe,
  terrainPolygon,
  terrainPassGeometry,
  terrainAccessSegments
} from './terrain-geometry.js';
import {
  waterPolygonsOverlap,
  waterDistance,
  waterSetContains,
  waterSetIntervals,
  waterSetBoundary,
  waterFaceInterior,
  waterFaceFeatureIds,
  waterBridgeGeometry
} from './water-geometry.js';
import {
  waterShoreComponents
} from './water-shore-topology.js';
import {
  segmentDistance
} from './placement.js';
import {
  distanceToSegment,
  insideOrOn
} from './boundary.js';
export function validateTerrainDefinition(features, passes, boundary, center, water = {
  features: [],
  bridges: []
}) {
  if (!Array.isArray(features) || features.length > TERRAIN_LIMIT || !Array.isArray(passes) || passes.length > 12) throw new Error('This build supports six mountain ranges and twelve passes.');
  const ids = new Set();
  for (const record of [...features, ...passes]) {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 128 || ids.has(record.id) || record.dataVersion !== 1) throw new Error('Invalid or duplicate terrain ID/version.');
    ids.add(record.id);
  }
  for (const f of features) {
    if (f.kind !== 'mountain' || typeof f.name !== 'string' || !f.name || f.name.length > 80 || !terrainShapeSafe(f) || !terrainRidgeSafe(f)) throw new Error('Invalid mountain footprint, ridge or peak height.');
    for (const [key, margin] of [
        ['polygon', 0],
        ['corridor', 9]
      ]) {
      const expected = terrainPolygon(f, margin);
      if (!Array.isArray(f[key]) || f[key].length !== expected.length || expected.some((p, i) => !terrainPoint(f[key][i]) || Math.hypot(p.x - f[key][i].x, p.y - f[key][i].y) > 1e-5)) throw new Error('Saved mountain footprint disagrees with its handles.');
    }
    if (waterDistance(center, f.corridor) < 28) throw new Error('Move the mountain foothills away from the main square.');
    for (const other of [...features.filter(o => o !== f), ...(water.features ?? [])]) {
      if (waterPolygonsOverlap(f.corridor, other.corridor) || f.corridor.some((p, i) => other.corridor.some((q, j) => segmentDistance(p, f.corridor[(i + 1) % f.corridor.length], q, other.corridor[(j + 1) % other.corridor.length]) < 10))) throw new Error('Keep mountain ranges and water separated with room for foothill streets.');
    }
  }
  const spans = [];
  for (const p of passes) {
    const f = features.find(f => f.id === p.terrainId);
    if (p.kind !== 'pass' || !f || !Number.isFinite(p.t) || p.t <= .01 || p.t >= .99 || p.width !== 12) throw new Error('Invalid mountain pass reference or position.');
    const g = terrainPassGeometry(f, p, boundary);
    for (const other of [...features.filter(o => o !== f), ...(water.features ?? [])])
      if (waterSetIntervals(...g.ends, [other]).some(s => s.inside) || other.corridor.some((q, j) => segmentDistance(...g.ends, q, other.corridor[(j + 1) % other.corridor.length]) < 9)) throw new Error('Move the mountain pass clear of other ranges and water.');
    if (spans.some(other => segmentDistance(...g.ends, ...other.ends) < 24)) throw new Error('Move mountain passes farther apart.');
    spans.push(g);
  }
  if (features.length && waterShoreComponents(boundary, [...(water.features ?? []), ...features], water.bridges ?? [], {
      access: terrainAccessSegments(features, boundary),
      crossings: spans.map(g => ({
        a: g.ends[0],
        b: g.ends[1],
        kind: 'bridge'
      }))
    }) !== 1) throw new Error('The mountains divide the city. Add or move a pass to connect its neighborhoods.');
}
export function validateTerrainCity(city) {
  const features = city.terrainFeatures ?? [],
    passes = city.terrainPasses ?? [],
    faces = city.terrainFaces ?? [];
  if (!features.length) {
    if (passes.length || faces.length || city.roads.some(r => r.foothill || r.terrainBoundary || r.passId)) throw new Error('Mountain topology has no owning range.');
    return city;
  }
  validateTerrainDefinition(features, passes, city.survey.boundary, city.plaza.center, {
    features: city.waterFeatures,
    bridges: city.bridges
  });
  if (faces.length > 256) throw new Error('Too many mountain faces.');
  const nodes = new Map(city.nodes.map(n => [n.id, n])),
    lengths = new Map();
  let work = 4000000;
  for (const face of [...city.blocks, city.plaza, ...city.waterFaces, ...faces]) {
    const blocked = faces.includes(face);
    if (waterSetContains(waterFaceInterior(face.vertices, nodes), features) !== blocked) throw new Error('Mountain and land faces disagree.');
    for (let i = 0; i < face.vertices.length; i++) {
      if ((work -= features.reduce((n, f) => n + f.corridor.length, 0)) < 0) throw new Error('Mountain topology is too complex.');
      for (const s of waterSetIntervals(nodes.get(face.vertices[i]), nodes.get(face.vertices[(i + 1) % face.vertices.length]), features)) {
        const mid = {
          x: (s.a.x + s.b.x) / 2,
          y: (s.a.y + s.b.y) / 2
        };
        if (!waterSetBoundary(mid, features) && s.inside !== blocked) throw new Error('A city face crosses mountain ground.');
      }
    }
    if (blocked) {
      const expected = waterFaceFeatureIds(face.vertices, nodes, features);
      if (!Array.isArray(face.terrainIds) || JSON.stringify(face.terrainIds) !== JSON.stringify(expected)) throw new Error('Invalid mountain face reference.');
    }
  }
  for (const road of city.roads) {
    if ((work -= features.reduce((n, f) => n + f.corridor.length, 0)) < 0) throw new Error('Mountain topology is too complex.');
    const a = nodes.get(road.a),
      b = nodes.get(road.b),
      mid = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      },
      blocked = waterSetContains(mid, features),
      on = waterSetBoundary(mid, features);
    for (const key of ['foothill', 'terrainBoundary'])
      if (road[key] !== undefined && typeof road[key] !== 'boolean') throw new Error('Invalid mountain street flags.');
    if (road.foothill && !on) throw new Error('A foothill street is detached from its mountain.');
    if (road.terrainBoundary && (!road.boundary || !blocked)) throw new Error('Invalid virtual mountain boundary.');
    if (road.passId) {
      const p = passes.find(p => p.id === road.passId);
      if (!p || !blocked) throw new Error('Invalid pass street reference.');
      const g = terrainPassGeometry(features.find(f => f.id === p.terrainId), p, city.survey.boundary);
      if (distanceToSegment(a, ...g.ends) > 1e-4 || distanceToSegment(b, ...g.ends) > 1e-4) throw new Error('A mountain pass is detached from its route.');
      lengths.set(p.id, (lengths.get(p.id) ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
    } else if (blocked && !on && !road.terrainBoundary) throw new Error('An ordinary street crosses steep mountain ground.');
  }
  for (const p of passes) {
    const g = terrainPassGeometry(features.find(f => f.id === p.terrainId), p, city.survey.boundary);
    if (Math.abs((lengths.get(p.id) ?? 0) - Math.hypot(g.ends[1].x - g.ends[0].x, g.ends[1].y - g.ends[0].y)) > .02) throw new Error('A pass does not connect both foothills.');
  }
  const graph = new Map();
  for (const road of city.roads.filter(r => !r.waterBoundary && !r.terrainBoundary)) {
    if (!graph.has(road.a)) graph.set(road.a, []);
    if (!graph.has(road.b)) graph.set(road.b, []);
    graph.get(road.a).push(road.b);
    graph.get(road.b).push(road.a);
  }
  const q = [graph.keys().next().value],
    seen = new Set(q);
  for (let i = 0; i < q.length; i++)
    for (const n of graph.get(q[i]) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        q.push(n);
      } if (seen.size !== graph.size) throw new Error('Mountain streets are disconnected. Add or move a pass.');
  return city;
}
