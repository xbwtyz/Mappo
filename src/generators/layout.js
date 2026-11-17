import { createRng, randomRange } from '../core/prng.js';
import { polygonSignedArea } from '../core/geometry.js';

// The road graph, city blocks and central square share the same vertex IDs.
// All road junctions are explicit, including connections to mid-block lanes.
const LAYOUT_PRESETS = Object.freeze({
  small: { sectors: 10, rings: 3, laneRate: 0.48 },
  medium: { sectors: 14, rings: 4, laneRate: 0.57 },
  large: { sectors: 19, rings: 5, laneRate: 0.62 }
});

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function boundaryDistance(angle, boundary) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let nearest = Infinity;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denominator = dx * sy - dy * sx;
    if (Math.abs(denominator) < 1e-10) continue;
    const t = (a.x * sy - a.y * sx) / denominator;
    const u = (a.x * dy - a.y * dx) / denominator;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) nearest = Math.min(nearest, t);
  }
  if (!Number.isFinite(nearest)) throw new Error('Invalid survey boundary: no radial intersection');
  return nearest;
}

function walkPolygon(vertices, start, end) {
  const result = [vertices[start]];
  for (let i = (start + 1) % vertices.length; i !== end; i = (i + 1) % vertices.length) {
    result.push(vertices[i]);
  }
  result.push(vertices[end]);
  return result;
}

export function generateLayout(seed, size, survey) {
  const preset = LAYOUT_PRESETS[size] ?? LAYOUT_PRESETS.medium;
  const rng = createRng(`${seed}:layout:v1:${size}`);
  const { sectors, rings, laneRate } = preset;
  const nodes = [];
  const nodeById = new Map();
  const baseEdges = new Map();
  const faces = [];
  const ringsOfNodes = [];

  function createNode(x, y) {
    const node = { id: `N-${String(nodes.length + 1).padStart(4, '0')}`, x, y };
    nodes.push(node);
    nodeById.set(node.id, node);
    return node.id;
  }

  function addEdge(a, b, kind) {
    const key = edgeKey(a, b);
    if (baseEdges.has(key)) return;
    baseEdges.set(key, { a, b, kind });
  }

  // A coherent but irregular angular lattice. The small per-ring deflections
  // yield winding streets without introducing intersecting polylines.
  const steps = Array.from({ length: sectors }, () => randomRange(rng, 0.79, 1.22));
  const total = steps.reduce((sum, step) => sum + step, 0);
  const start = randomRange(rng, -Math.PI, Math.PI);
  const angles = [start];
  for (let i = 0; i < sectors - 1; i++) angles.push(angles.at(-1) + steps[i] / total * Math.PI * 2);
  const angularStep = Math.PI * 2 / sectors;

  for (let ring = 0; ring < rings; ring++) {
    const fraction = 0.14 + (0.73 * ring) / (rings - 1);
    const row = [];
    for (let sector = 0; sector < sectors; sector++) {
      const angle = angles[sector] + randomRange(rng, -0.12, 0.12) * angularStep;
      const distance = boundaryDistance(angle, survey.boundary) * fraction * randomRange(rng, 0.967, 1.033);
      row.push(createNode(Math.cos(angle) * distance, Math.sin(angle) * distance));
    }
    ringsOfNodes.push(row);
  }

  for (let ring = 0; ring < rings; ring++) {
    for (let sector = 0; sector < sectors; sector++) {
      const next = (sector + 1) % sectors;
      // A civic boulevard and a sparse set of outer ring boulevards.
      addEdge(ringsOfNodes[ring][sector], ringsOfNodes[ring][next],
        ring === 0 || (ring === rings - 2 && sector % 3 !== 1) ? 'primary' : 'secondary');
      if (ring === rings - 1) continue;
      addEdge(ringsOfNodes[ring][sector], ringsOfNodes[ring + 1][sector],
        sector % 4 === 0 || sector % 4 === 1 && ring === 0 ? 'primary' : 'secondary');
      faces.push({
        ring, sector,
        corners: [
          ringsOfNodes[ring][sector],
          ringsOfNodes[ring + 1][sector],
          ringsOfNodes[ring + 1][next],
          ringsOfNodes[ring][next]
        ]
      });
    }
  }

  // Plan some connecting lanes per block. Each lane ends at real street
  // junctions. Its endpoints become shared vertices in *both* adjacent blocks.
  const midpoints = new Map();
  function midpoint(a, b) {
    const key = edgeKey(a, b);
    if (midpoints.has(key)) return midpoints.get(key);
    const first = nodeById.get(a);
    const second = nodeById.get(b);
    const id = createNode((first.x + second.x) / 2, (first.y + second.y) / 2);
    midpoints.set(key, id);
    return id;
  }
  for (const face of faces) {
    if (rng() >= laneRate) continue;
    const side = rng() < 0.53 ? 0 : 1;
    const corners = face.corners;
    face.split = [
      midpoint(corners[side], corners[(side + 1) % 4]),
      midpoint(corners[(side + 2) % 4], corners[(side + 3) % 4])
    ];
  }

  const roads = [];
  function road(a, b, kind) {
    roads.push({ id: `RD-${String(roads.length + 1).padStart(4, '0')}`, a, b, kind });
  }
  for (const edge of baseEdges.values()) {
    const mid = midpoints.get(edgeKey(edge.a, edge.b));
    if (mid) {
      road(edge.a, mid, edge.kind);
      road(mid, edge.b, edge.kind);
    } else {
      road(edge.a, edge.b, edge.kind);
    }
  }

  const blocks = [];
  function addBlock(nodeIds, face) {
    const polygon = nodeIds.map(id => nodeById.get(id));
    const area = polygonSignedArea(polygon);
    if (area <= 0) throw new Error(`Invalid block winding/area: ${face.ring}/${face.sector}`);
    blocks.push({
      id: `BLK-${String(blocks.length + 1).padStart(4, '0')}`,
      vertices: nodeIds,
      ring: face.ring,
      sector: face.sector,
      area: Math.round(area * 100) / 100,
      usage: 'unassigned'
    });
  }
  for (const face of faces) {
    const boundary = [];
    for (let i = 0; i < 4; i++) {
      const a = face.corners[i];
      const b = face.corners[(i + 1) % 4];
      boundary.push(a);
      const mid = midpoints.get(edgeKey(a, b));
      if (mid) boundary.push(mid);
    }
    if (!face.split) {
      addBlock(boundary, face);
      continue;
    }
    const a = boundary.indexOf(face.split[0]);
    const b = boundary.indexOf(face.split[1]);
    addBlock(walkPolygon(boundary, a, b), face);
    addBlock(walkPolygon(boundary, b, a), face);
    road(face.split[0], face.split[1], 'lane');
  }

  const plazaVertices = ringsOfNodes[0];
  const plaza = {
    id: 'PLAZA-0001',
    name: 'Founders Square',
    vertices: plazaVertices,
    area: Math.round(polygonSignedArea(plazaVertices.map(id => nodeById.get(id))) * 100) / 100
  };

  return { nodes, roads, blocks, plaza };
}
