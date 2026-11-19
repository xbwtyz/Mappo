import { createRoadNodeNormalizer, traceRoadFaces } from '../core/road-topology.js';
import {
  terrainAccessSegments,
  terrainPassGeometry
} from '../core/terrain-geometry.js';
import {
  lakeAccessSegments
} from '../core/lake-geometry.js';
import {
  waterBridgeGeometry,
  waterSetContains,
  waterSetIntervals,
  waterUnionSegments,
  waterFaceFeatureIds,
  waterFaceInterior
} from '../core/water-geometry.js';
import {
  createRng,
  randomRange
} from '../core/prng.js';
import {
  boundsOf,
  polygonSignedArea,
  pointInPolygon
} from '../core/geometry.js';
import {
  segmentCuts,
  lerpPoint,
  insideOrOn,
  clearance
} from '../core/boundary.js';

// Construct a planar arrangement, rather than warping a finished mesh. Every
// clipped street crossing becomes a shared node before faces are extracted.
export function generateLayout(seed, size, survey, morphology = 'radial', water = {
  features: [],
  bridges: []
}, terrain = {
  features: [],
  passes: []
}) {
  const boundary = survey.boundary,
    center = survey.anchors[0];
  const rng = createRng(`${seed}:streets:v5:${size}:${morphology}`);
  const bounds = boundsOf(boundary);
  const spacing = Math.sqrt(Math.abs(polygonSignedArea(boundary))) / (size === 'small' ? 7 : size === 'large' ? 13 : 10);
  const half = Math.min(spacing * .28, clearance(center, boundary) * .40);
  if (half < 6) throw new Error('Move the town center farther from the edge to make room for its plaza.');
  const square = [{
    x: center.x - half,
    y: center.y - half
  }, {
    x: center.x + half,
    y: center.y - half
  }, {
    x: center.x + half,
    y: center.y + half
  }, {
    x: center.x - half,
    y: center.y + half
  }];
  const features = water.features,
    hasWater = features.length > 0,
    mountains = terrain.features,
    obstacles = [...features, ...mountains],
    hasObstacles = obstacles.length > 0;
  if (features.some(f => square.some(p => insideOrOn(p, f.corridor)))) throw new Error('Move the water farther from the main square.');
  if (mountains.some(f => square.some(p => insideOrOn(p, f.corridor)))) throw new Error('Move the mountains farther from the main square.');
  const segments = [];
  const push = (a, b, kind, tag = 'street') => {
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) segments.push({
      a,
      b,
      kind,
      tag
    });
  };
  for (let i = 0; i < boundary.length; i++) push(boundary[i], boundary[(i + 1) % boundary.length], 'secondary', 'boundary');
  for (let i = 0; i < 4; i++) push(square[i], square[(i + 1) % 4], 'primary', 'plaza');

  function clip(a, b, kind, tag = 'street') {
    const ts = [0, 1];
    for (const polygon of [boundary, square, ...obstacles.map(f => f.corridor)])
      for (let i = 0; i < polygon.length; i++) ts.push(...segmentCuts(a, b, polygon[i], polygon[(i + 1) % polygon.length]));
    ts.sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] < 1e-9) continue;
      const p = lerpPoint(a, b, (ts[i] + ts[i - 1]) / 2);
      const bridge = water.bridges.find(g => g.id === tag),
        wet = waterSetContains(p, features),
        bridgeRiver = bridge && features.find(f => f.id === bridge.waterId),
        allowedWet = bridgeRiver && pointInPolygon(p, bridgeRiver.corridor) && !waterSetContains(p, features.filter(f => f !== bridgeRiver));
      const pass = terrain.passes.find(g => g.id === tag),
        mountain = pass && mountains.find(f => f.id === pass.terrainId),
        blocked = waterSetContains(p, mountains),
        allowedMountain = mountain && pointInPolygon(p, mountain.corridor);
      if (insideOrOn(p, boundary) && !pointInPolygon(p, square) && (!wet || tag === 'bank' || allowedWet) && (!blocked || tag === 'foothill' || allowedMountain)) push(lerpPoint(a, b, ts[i - 1]), lerpPoint(a, b, ts[i]), kind, tag);
    }
  }
  if (morphology === 'radial') {
    const reach = Math.max(...boundary.map(p => Math.hypot(p.x - center.x, p.y - center.y))) + spacing;
    const sectors = size === 'small' ? 12 : size === 'large' ? 22 : 16;
    const phase = randomRange(rng, -.15, .15);
    for (let i = 0; i < sectors; i++) {
      const angle = phase + i * 2 * Math.PI / sectors;
      clip(center, {
        x: center.x + Math.cos(angle) * reach,
        y: center.y + Math.sin(angle) * reach
      }, i % 4 === 0 ? 'primary' : 'secondary');
    }
    for (let radius = spacing; radius < reach; radius += spacing) {
      const count = sectors * 3;
      for (let i = 0; i < count; i++) {
        const a = phase + i * 2 * Math.PI / count,
          b = phase + (i + 1) * 2 * Math.PI / count;
        clip({
          x: center.x + Math.cos(a) * radius,
          y: center.y + Math.sin(a) * radius
        }, {
          x: center.x + Math.cos(b) * radius,
          y: center.y + Math.sin(b) * radius
        }, 'secondary');
      }
    }
  } else {
    // Shared rows form continuous, gently winding corridors. Seeded monotonic
    // spacing changes blocks without changing the user's boundary or center.
    const organic = morphology === 'organic',
      linear = morphology === 'linear';
    const sx = spacing * (linear ? 1.5 : 1),
      sy = spacing * (linear ? .65 : 1);
    const xs = [bounds.minX - spacing],
      ys = [bounds.minY - spacing];
    while (xs.at(-1) < bounds.maxX + spacing) xs.push(xs.at(-1) + sx * randomRange(rng, .82, 1.18));
    while (ys.at(-1) < bounds.maxY + spacing) ys.push(ys.at(-1) + sy * randomRange(rng, .82, 1.18));
    const mesh = ys.map((y, row) => xs.map((x, col) => ({
      x: x + (organic ? randomRange(rng, -.21, .21) * sx : 0),
      y: y + (organic ? randomRange(rng, -.21, .21) * sy : 0)
    })));
    for (let row = 0; row < ys.length; row++)
      for (let col = 0; col < xs.length; col++) {
        if (col + 1 < xs.length) clip(mesh[row][col], mesh[row][col + 1], row === Math.floor(ys.length / 2) ? 'primary' : 'secondary');
        if (row + 1 < ys.length) clip(mesh[row][col], mesh[row + 1][col], col === Math.floor(xs.length / 2) && !linear ? 'primary' : 'lane');
      }
    // An explicit approach through the chosen center connects the square even
    // when it lies entirely within one otherwise unsplit grid cell.
    clip({
      x: bounds.minX - spacing,
      y: center.y
    }, {
      x: bounds.maxX + spacing,
      y: center.y
    }, 'primary');
  }
  for (const access of lakeAccessSegments(features, boundary)) clip(access.a, access.b, 'lane');
  if (hasWater) {
    for (const section of waterUnionSegments(features)) clip(section.a, section.b, 'secondary', 'bank');
    for (const bridge of water.bridges) {
      const river = features.find(f => f.id === bridge.waterId),
        g = waterBridgeGeometry(river, bridge, boundary);
      clip(...g.approach, 'primary', bridge.id);
    }
  }
  for (const access of terrainAccessSegments(mountains, boundary)) clip(access.a, access.b, 'lane');
  for (const s of waterUnionSegments(mountains)) clip(s.a, s.b, 'secondary', 'foothill');
  for (const p of terrain.passes) clip(...terrainPassGeometry(mountains.find(f => f.id === p.terrainId), p, boundary).approach, 'primary', p.id);
  const cuts = segments.map(() => [0, 1]);
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i],
        b = segments[j];
      cuts[i].push(...segmentCuts(a.a, a.b, b.a, b.b));
      cuts[j].push(...segmentCuts(b.a, b.b, a.a, a.b));
    }
  const nodes = [],
    roads = [],
    edges = new Map();

  const node = createRoadNodeNormalizer(nodes, hasObstacles);
  const rank = {
    lane: 0,
    secondary: 1,
    primary: 2
  };
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i],
      ts = cuts[i].sort((a, b) => a - b);
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < 1e-9) continue;
      const a = node(lerpPoint(segment.a, segment.b, ts[k - 1])),
        b = node(lerpPoint(segment.a, segment.b, ts[k]));
      if (a === b) continue;
      const key = [a.id, b.id].sort().join(':');
      if (edges.has(key)) {
        const r = edges.get(key);
        if (rank[segment.kind] > rank[r.kind]) r.kind = segment.kind;
        continue;
      }
      const r = {
        id: `RD-${String(roads.length+1).padStart(4,'0')}`,
        a: a.id,
        b: b.id,
        kind: segment.kind,
        boundary: segment.tag === 'boundary',
        plaza: segment.tag === 'plaza',
        ...(mountains.length ? {
          foothill: segment.tag === 'foothill',
          terrainBoundary: segment.tag === 'boundary' && waterSetContains(lerpPoint(a, b, .5), mountains),
          ...(terrain.passes.some(p => p.id === segment.tag) && waterSetContains(lerpPoint(a, b, .5), mountains) ? {
            passId: segment.tag
          } : {})
        } : {}),
        ...(hasWater ? {
          bank: segment.tag === 'bank',
          waterBoundary: segment.tag === 'boundary' && waterSetContains(lerpPoint(a, b, .5), features),
          ...(water.bridges.some(g => g.id === segment.tag) && waterSetContains(lerpPoint(a, b, .5), features) ? {
            bridgeId: segment.tag
          } : {})
        } : {})
      };
      edges.set(key, r);
      roads.push(r);
    }
  }

  let faces = traceRoadFaces(nodes, roads);
  const minimumArea = Math.max(1.01, spacing * spacing * .012);
  // Tangencies at the boundary can leave tiny slivers. Merge them into a
  // neighbor by removing a shared street, never a city boundary or plaza edge.
  for (let pass = 0; pass < roads.length; pass++) {
    const small = faces.find(f => f.area < minimumArea && (!hasObstacles || !waterSetContains(waterFaceInterior(f.vertices, new Map(nodes.map(n => [n.id, n]))), obstacles)));
    if (!small) break;
    const keys = new Set(small.vertices.map((a, i) => [a, small.vertices[(i + 1) % small.vertices.length]].sort().join(':')));
    let longest = -1,
      index = -1;
    const lookup = new Map(nodes.map(n => [n.id, n]));
    roads.forEach((r, i) => {
      if (r.boundary || r.plaza || r.bank || r.bridgeId || r.foothill || r.passId || !keys.has([r.a, r.b].sort().join(':'))) return;
      const a = lookup.get(r.a),
        b = lookup.get(r.b),
        length = Math.hypot(a.x - b.x, a.y - b.y);
      if (length > longest) {
        longest = length;
        index = i;
      }
    });
    if (index < 0) throw new Error('A narrow outline section leaves no usable city block. Widen that section.');
    roads.splice(index, 1);
    let pruned = true;
    while (pruned) {
      pruned = false;
      const degrees = new Map();
      for (const r of roads) {
        degrees.set(r.a, (degrees.get(r.a) || 0) + 1);
        degrees.set(r.b, (degrees.get(r.b) || 0) + 1);
      }
      for (let i = roads.length - 1; i >= 0; i--) {
        const r = roads[i];
        if (!r.boundary && !r.plaza && !r.bank && !r.bridgeId && !r.foothill && !r.passId && (degrees.get(r.a) === 1 || degrees.get(r.b) === 1)) {
          roads.splice(i, 1);
          pruned = true;
        }
      }
    }
    faces = traceRoadFaces(nodes, roads);
  }
  // Remove junctions no longer used after merging small faces.
  const usedNodes = new Set(roads.flatMap(r => [r.a, r.b]));
  for (let i = nodes.length - 1; i >= 0; i--)
    if (!usedNodes.has(nodes[i].id)) nodes.splice(i, 1);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const plazaFace = faces.find(f => pointInPolygon(center, f.vertices.map(id => byId.get(id))));
  if (!plazaFace) throw new Error('Could not create a plaza at this location. Move the center and try again.');
  const waterFaces = hasWater ? faces.filter(f => waterSetContains(waterFaceInterior(f.vertices, byId), features)).map((f, i) => ({
    id: `WET-${String(i+1).padStart(3,'0')}`,
    ...(features.length === 1 ? {
      waterId: features[0].id
    } : {
      waterIds: waterFaceFeatureIds(f.vertices, byId, features)
    }),
    vertices: f.vertices,
    area: Math.round(f.area * 100) / 100
  })) : [];
  const terrainFaces = faces.filter(f => waterSetContains(waterFaceInterior(f.vertices, byId), mountains)).map((f, i) => ({
    id: `MTFACE-${String(i+1).padStart(3,'0')}`,
    terrainIds: waterFaceFeatureIds(f.vertices, byId, mountains),
    vertices: f.vertices,
    area: Math.round(f.area * 100) / 100
  }));
  const wetKeys = new Set([...terrainFaces, ...waterFaces].map(f => f.vertices.join(':')));
  const blocks = faces.filter(f => f !== plazaFace && !wetKeys.has(f.vertices.join(':'))).map((f, i) => ({
    id: `BLK-${String(i+1).padStart(4,'0')}`,
    vertices: f.vertices,
    area: Math.round(f.area * 100) / 100,
    ring: i % 4,
    sector: i,
    usage: 'unassigned'
  }));
  return {
    nodes,
    roads,
    blocks,
    waterFaces,
    terrainFaces,
    plaza: {
      id: 'PLAZA-0001',
      name: 'Founders Square',
      center: {
        x: center.x,
        y: center.y
      },
      vertices: plazaFace.vertices,
      area: Math.round(plazaFace.area * 100) / 100
    }
  };
}
