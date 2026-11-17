import {
  LAKE_LIMIT,
  validateLakeFeature
} from './lake-geometry.js';
import {
  waterShoreComponents
} from './water-shore-topology.js';
import {
  waterLandRegions
} from './water-regions.js';
import {
  pointInPolygon
} from './geometry.js';
import {
  insideOrOn,
  distanceToSegment
} from './boundary.js';
import {
  waterFrame,
  waterStatus,
  waterSetContains,
  waterSetBoundary,
  waterSetIntervals,
  waterFaceFeatureIds,
  waterBridgeClearOfFeatures,
  waterFeaturePolygon,
  waterBridgeGeometry,
  waterLineIntervals,
  waterFaceInterior,
  WATER_BANK,
  WATER_MAX_SLOPE
} from './water-geometry.js';
import {
  segmentDistance
} from './placement.js';

export function validateWaterDefinition(features, bridges, boundary, center) {
  if (!Array.isArray(features) || features.length > LAKE_LIMIT + 2 || !Array.isArray(bridges) || bridges.length > 8) throw new Error('This build supports eight lakes, one river, one coast and eight river bridges.');
  const ids = new Set(),
    kinds = new Set();
  for (const r of [...features, ...bridges]) {
    if (!r || typeof r.id !== 'string' || !r.id || r.id.length > 128 || ids.has(r.id)) throw new Error('Invalid or duplicate water/bridge ID.');
    ids.add(r.id);
    if (r.dataVersion !== 1) throw new Error('Unsupported water data version.');
  }
  for (const f of features) {
    if (f.kind !== 'lake' && kinds.has(f.kind)) throw new Error('Only one water feature of each kind is supported.');
    kinds.add(f.kind);
    validateWaterFeature(f, boundary, center);
  }
  if (features.filter(f => f.kind === 'lake').length > LAKE_LIMIT) throw new Error('This build supports up to eight lakes.');
  if (!features.length) {
    if (bridges.length) throw new Error('A bridge references missing water.');
    return;
  }
  const river = features.find(f => f.kind === 'river');
  if (river && !bridges.length) throw new Error('Add at least one bridge to connect the river banks.');
  const geometries = [];
  for (const bridge of bridges) {
    if (bridge.kind !== 'bridge') throw new Error('Unsupported bridge kind.');
    const f = features.find(f => f.id === bridge.waterId);
    if (f?.kind === 'coast') throw new Error('A coast has open ocean, not a second bank for bridges.');
    if (!f || f.kind !== 'river' || !Number.isFinite(bridge.t) || bridge.t <= .01 || bridge.t >= .99 || bridge.width !== 9) throw new Error('Invalid bridge reference, location or width.');
    const g = waterBridgeGeometry(f, bridge, boundary);
    if (!waterBridgeClearOfFeatures(f, bridge, boundary, features.filter(other => other !== f))) throw new Error('A bridge reaches the ocean or another water feature. Move it upstream onto two dry banks.');
    for (const other of geometries)
      if (segmentDistance(...g.ends, ...other.ends) < 24) throw new Error('Move bridges farther apart so their approaches remain distinct.');
    geometries.push(g);
  }
  if (features.length > 1 && waterShoreComponents(boundary, features, bridges) !== 1) throw new Error('The combined water layout disconnects land. Add or move a bridge, or adjust the river or shoreline.');
}

export function validateWaterFeature(f, boundary, center) {
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) throw new Error('A waterfront city needs a saved main-square center.');
  if (f.kind === 'lake') return validateLakeFeature(f, boundary, center);
  if (!['river', 'coast'].includes(f.kind)) throw new Error('Unsupported water feature kind.');
  if ((f.kind === 'river' && (!Number.isFinite(f.width) || f.width < 10 || f.width > 90)) || (f.kind === 'coast' && (!['left', 'right'].includes(f.waterSide) || !Number.isFinite(f.seaDepth) || f.seaDepth < 100 || f.seaDepth > 20000)) || !Array.isArray(f.path) || f.path.length < 3 || f.path.length > 32 || !f.path.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 100000 && Math.abs(p.y) < 100000)) throw new Error('Invalid water path, river width or coast extent.');
  const frame = waterFrame(f);
  let previous = -1;
  for (const p of f.path) {
    const t = (p.x - frame.origin.x) * frame.u.x + (p.y - frame.origin.y) * frame.u.y;
    if (t - previous < 1e-3) throw new Error('Water points must progress from one endpoint to the other; untangle the draft.');
    previous = t;
  }
  for (let i = 1; i < f.path.length; i++) {
    const a = f.path[i - 1],
      b = f.path[i],
      du = (b.x - a.x) * frame.u.x + (b.y - a.y) * frame.u.y,
      dv = (b.x - a.x) * frame.v.x + (b.y - a.y) * frame.v.y;
    if (Math.abs(dv) > du * WATER_MAX_SLOPE) throw new Error('Smooth this water bend; adjacent points turn too sharply for safe banks.');
  }
  if (insideOrOn(f.path[0], boundary) || insideOrOn(f.path.at(-1), boundary)) throw new Error('Extend both water endpoints beyond the city.');
  for (const [key, margin] of [
      ['polygon', 0],
      ['corridor', WATER_BANK]
    ]) {
    const expected = waterFeaturePolygon(f, margin);
    if (!Array.isArray(f[key]) || f[key].length !== expected.length || expected.some((p, i) => !Number.isFinite(f[key][i]?.x) || !Number.isFinite(f[key][i]?.y) || Math.hypot(p.x - f[key][i].x, p.y - f[key][i].y) > 1e-5)) throw new Error('Saved water banks disagree with the path.');
  }
  if (insideOrOn(center, f.corridor) || Math.min(...f.corridor.map((p, i) => distanceToSegment(center, p, f.corridor[(i + 1) % f.corridor.length]))) < 28) throw new Error('Move the water away from the main square or relocate the square.');
  let intersects = false;
  for (let i = 0; i < f.path.length - 1; i++)
    if (waterLineIntervals(f.path[i], f.path[i + 1], boundary).some(s => s.inside)) intersects = true;
  if (!intersects) throw new Error('The shoreline or river must pass through the city.');
  if (f.kind === 'coast') {
    const frame = waterFrame(f);
    for (const p of boundary) {
      const u = (p.x - frame.origin.x) * frame.u.x + (p.y - frame.origin.y) * frame.u.y,
        v = (p.x - frame.origin.x) * frame.v.x + (p.y - frame.origin.y) * frame.v.y;
      if (u <= 0 || u >= frame.length || Math.abs(v) > f.seaDepth - 100) throw new Error('Extend the coast endpoints and ocean extent to cover the city.');
    }
    if (waterLandRegions(boundary, f.corridor).landCount !== 1) throw new Error('The coastline separates land into disconnected islands. Move the shore to keep the city connected.');
    return;
  }
}
export function validateWaterCity(city) {
  const state = city.waterState;
  if (!state || state.version !== 1 || !['dry', 'river', 'coast', 'lake', 'mixed'].includes(state.status) || typeof state.seed !== 'string' || state.seed.length > 64 || state.algorithm !== (state.status === 'mixed' ? 'union-v1' : state.status === 'coast' ? 'shore-v1' : state.status === 'lake' ? 'lake-v1' : 'ribbon-v1')) throw new Error('Unsupported water state.');
  validateWaterDefinition(city.waterFeatures, city.bridges, city.survey.boundary, city.plaza.center);
  if (state.status !== waterStatus(city.waterFeatures)) throw new Error('Water state and features disagree.');
  if (!Array.isArray(city.waterFaces) || city.waterFaces.length > 256) throw new Error('Invalid water face collection.');
  if (!city.waterFeatures.length) {
    if (city.waterFaces.length || city.roads.some(r => r.waterBoundary || r.bridgeId || r.bank)) throw new Error('Dry cities cannot contain water topology.');
    return city;
  }
  let waterWork = 4000000;
  const waterSpend = n => {
    waterWork -= n;
    if (waterWork < 0) throw new Error('Water topology is too complex to validate safely.');
  };
  const features = city.waterFeatures,
    nodes = new Map(city.nodes.map(n => [n.id, n])),
    ids = new Set(city.bridges.map(b => b.id)),
    wetEdges = new Map();
  if (!city.waterFaces.length) throw new Error('The water feature has no reserved area.');
  for (const face of [...city.blocks, city.plaza, ...city.waterFaces]) {
    const wet = city.waterFaces.includes(face),
      p = waterFaceInterior(face.vertices, nodes);
    if (waterSetContains(p, features) !== wet) throw new Error('Land and river faces disagree with the saved shoreline.');
    for (let i = 0; i < face.vertices.length; i++) {
      waterSpend(features.reduce((n, f) => n + f.corridor.length, 0));
      const a = nodes.get(face.vertices[i]),
        b = nodes.get(face.vertices[(i + 1) % face.vertices.length]);
      for (const s of waterSetIntervals(a, b, features)) {
        const m = {
            x: (s.a.x + s.b.x) / 2,
            y: (s.a.y + s.b.y) / 2
          },
          on = waterSetBoundary(m, features);
        if (!on && s.inside !== wet) throw new Error('A land or river face crosses the shoreline.');
      }
    }
    if (wet) {
      const expected = waterFaceFeatureIds(face.vertices, nodes, features),
        actual = face.waterIds ?? [face.waterId];
      if (!Array.isArray(actual) || new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some(id => !expected.includes(id))) throw new Error('Invalid water face reference.');
    }
  }
  for (const r of city.roads) {
    waterSpend(features.reduce((n, f) => n + f.corridor.length, 0));
    if ((r.waterBoundary !== undefined && typeof r.waterBoundary !== 'boolean') || (r.bank !== undefined && typeof r.bank !== 'boolean')) throw new Error('Invalid water street flags.');
    const a = nodes.get(r.a),
      b = nodes.get(r.b),
      mid = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      },
      wet = waterSetContains(mid, features),
      onBank = waterSetBoundary(mid, features);
    if (r.bank && !onBank) throw new Error('A bank road is detached from the shoreline.');
    if (r.bridgeId) {
      if (!ids.has(r.bridgeId) || !wet) throw new Error('Invalid bridge street reference.');
      const bridge = city.bridges.find(g => g.id === r.bridgeId),
        f = features.find(f => f.id === bridge.waterId),
        g = waterBridgeGeometry(f, bridge, city.survey.boundary);
      if (distanceToSegment(a, ...g.ends) > 1e-4 || distanceToSegment(b, ...g.ends) > 1e-4) throw new Error('Bridge road is detached from its crossing.');
      wetEdges.set(r.bridgeId, (wetEdges.get(r.bridgeId) || 0) + Math.hypot(b.x - a.x, b.y - a.y));
    } else if (wet && !onBank && !r.waterBoundary) throw new Error('An ordinary street crosses the water.');
    if (r.waterBoundary && (!r.boundary || !wet)) throw new Error('Invalid water boundary edge.');
  }
  for (const bridge of city.bridges) {
    const g = waterBridgeGeometry(features.find(f => f.id === bridge.waterId), bridge, city.survey.boundary);
    if (Math.abs((wetEdges.get(bridge.id) || 0) - Math.hypot(g.ends[1].x - g.ends[0].x, g.ends[1].y - g.ends[0].y)) > .02) throw new Error('A bridge does not span both banks.');
  }
  // Boundary edges across water close the planar arrangement; they are never streets.
  const active = city.roads.filter(r => !r.waterBoundary),
    graph = new Map();
  for (const r of active) {
    if (!graph.has(r.a)) graph.set(r.a, []);
    if (!graph.has(r.b)) graph.set(r.b, []);
    graph.get(r.a).push(r.b);
    graph.get(r.b).push(r.a);
  }
  const queue = [active[0]?.a],
    visited = new Set(queue);
  for (let i = 0; i < queue.length; i++)
    for (const n of graph.get(queue[i]) || [])
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
  if (visited.size !== graph.size) throw new Error(!features.some(f => f.kind === 'river') ? 'The coastline separates land into disconnected islands. Move the shore to keep the city connected.' : 'The river disconnects streets. Add or move a bridge to connect every bank, or adjust the river course.');
  return city;
}
