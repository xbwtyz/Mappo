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

function generateRadialLayout(seed, size, survey) {
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


// Linear, organic and planned cities use topologically different street meshes
// from the radial ring-and-spoke city. A shared vertex grid provides robust
// intersections and stable block boundaries, and is shaped by the chosen
// settlement's development pattern.
const GRID_PRESETS = Object.freeze({
  organic: { small: [8, 8], medium: [10, 10], large: [13, 12] },
  linear: { small: [12, 5], medium: [16, 6], large: [21, 7] },
  planned: { small: [9, 7], medium: [12, 9], large: [16, 12] }
});

function generateGridLayout(seed, size, survey, morphology) {
  const rng = createRng(`${seed}:layout:v2:${size}:${morphology}`);
  const [columns, rows] = GRID_PRESETS[morphology][size] ?? GRID_PRESETS[morphology].medium;
  const nodes = [];
  const byId = new Map();
  const baseEdges = new Map();
  const faces = [];
  const mesh = [];
  const radius = survey.nominalRadius;
  const bendPhase = survey.linearBendPhase;
  const angle = survey.plannedAngle;
  const organicPhase = randomRange(rng, -Math.PI, Math.PI);
  const sin = Math.sin, cos = Math.cos;

  function createNode(x, y) {
    const node = { id: `N-${String(nodes.length + 1).padStart(4, '0')}`, x, y };
    nodes.push(node);
    byId.set(node.id, node);
    return node.id;
  }
  function addEdge(a, b, kind) {
    const key = edgeKey(a, b);
    if (!baseEdges.has(key)) baseEdges.set(key, { a, b, kind });
  }

  // Monotonic, seeded axis coordinates prevent near-identical blocks without
  // introducing unconnected roads or randomly crossing street edges.
  function axisPositions(count, jitterRate) {
    const steps = Array.from({ length: count - 1 }, () => randomRange(rng, 1 - jitterRate, 1 + jitterRate));
    const total = steps.reduce((acc, value) => acc + value, 0);
    const values = [-1];
    let current = -1;
    for (const step of steps) { current += step * 2 / total; values.push(current); }
    return values;
  }
  const xs = axisPositions(columns, morphology === 'planned' ? 0.06 : 0.30);
  const ys = axisPositions(rows, morphology === 'planned' ? 0.06 : 0.30);
  const dx = 2 / (columns - 1), dy = 2 / (rows - 1);
  for (let row = 0; row < rows; row++) {
    const ids = [];
    for (let column = 0; column < columns; column++) {
      const u = xs[column];
      const v = ys[row];
      let x, y;
      if (morphology === 'linear') {
        // Main road and side streets follow a bending travel corridor.
        const drift = randomRange(rng, -0.10, 0.10);
        x = radius * (1.77 * u + drift * dx);
        y = radius * (0.35 * v + 0.12 * sin(x / radius * 1.05 + bendPhase) +
          randomRange(rng, -0.08, 0.08) * dy);
      } else if (morphology === 'planned') {
        const rawX = radius * (0.77 * u + randomRange(rng, -0.035, 0.035) * dx);
        const rawY = radius * (0.57 * v + randomRange(rng, -0.035, 0.035) * dy);
        x = rawX * cos(angle) - rawY * sin(angle);
        y = rawX * sin(angle) + rawY * cos(angle);
      } else {
        // Curving, staggered streets arranged inside an asymmetric footprint.
        // The square-to-disk transform leaves an interior margin for future walls.
        const ux = u * 0.81 + randomRange(rng, -0.17, 0.17) * dx;
        const vy = v * 0.81 + randomRange(rng, -0.17, 0.17) * dy;
        const px = ux * Math.sqrt(1 - vy * vy / 2) + 0.06 * sin(2.3 * vy + organicPhase);
        const py = vy * Math.sqrt(1 - ux * ux / 2) + 0.05 * sin(2.1 * ux - organicPhase);
        const theta = Math.atan2(py, px);
        const dist = Math.min(0.83, Math.hypot(px, py) * 0.88);
        const outer = boundaryDistance(theta, survey.boundary);
        x = cos(theta) * outer * dist;
        y = sin(theta) * outer * dist;
      }
      ids.push(createNode(x, y));
    }
    mesh.push(ids);
  }

  // Every grid cell is a face bounded by graph edges. Mid-block lanes split
  // existing streets at shared junctions; the plaza is never crossed by lanes.
  const plazaRow = Math.floor((rows - 2) / 2);
  const plazaCol = Math.floor((columns - 2) / 2);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (col < columns - 1) addEdge(mesh[row][col], mesh[row][col + 1],
        row === Math.floor(rows / 2) ? 'primary' : 'secondary');
      if (row < rows - 1) addEdge(mesh[row][col], mesh[row + 1][col],
        morphology === 'planned' && col === Math.floor(columns / 2) ? 'primary' :
          morphology === 'linear' && col % 4 === 1 ? 'primary' : 'secondary');
      if (row < rows - 1 && col < columns - 1) {
        faces.push({ row, col, ring: row, sector: col,
          plaza: row === plazaRow && col === plazaCol,
          corners: [mesh[row][col], mesh[row][col + 1], mesh[row + 1][col + 1], mesh[row + 1][col]] });
      }
    }
  }

  const midpoints = new Map();
  function midpoint(a, b) {
    const key = edgeKey(a, b);
    if (midpoints.has(key)) return midpoints.get(key);
    const p = byId.get(a), q = byId.get(b);
    const id = createNode((p.x + q.x) / 2, (p.y + q.y) / 2);
    midpoints.set(key, id);
    return id;
  }
  for (const face of faces) {
    if (face.plaza || rng() >= (morphology === 'planned' ? 0.27 : 0.44)) continue;
    const side = rng() < 0.5 ? 0 : 1;
    face.split = [midpoint(face.corners[side], face.corners[(side + 1) % 4]),
      midpoint(face.corners[(side + 2) % 4], face.corners[(side + 3) % 4])];
  }

  const roads = [];
  function road(a, b, kind) {
    roads.push({ id: `RD-${String(roads.length + 1).padStart(4, '0')}`, a, b, kind });
  }
  for (const edge of baseEdges.values()) {
    const mid = midpoints.get(edgeKey(edge.a, edge.b));
    if (mid) { road(edge.a, mid, edge.kind); road(mid, edge.b, edge.kind); }
    else road(edge.a, edge.b, edge.kind);
  }

  const blocks = [];
  let plaza;
  for (const face of faces) {
    const boundary = [];
    for (let i = 0; i < 4; i++) {
      const a = face.corners[i], b = face.corners[(i + 1) % 4];
      boundary.push(a);
      const mid = midpoints.get(edgeKey(a, b));
      if (mid) boundary.push(mid);
    }
    function addBlock(vertices) {
      const area = polygonSignedArea(vertices.map(id => byId.get(id)));
      if (area <= 1) throw new Error(`Invalid ${morphology} block at ${face.row}/${face.col}: ${area}`);
      blocks.push({ id: `BLK-${String(blocks.length + 1).padStart(4, '0')}`,
        vertices, ring: face.ring, sector: face.sector,
        area: Math.round(area * 100) / 100, usage: 'unassigned' });
    }
    if (face.plaza) {
      const area = polygonSignedArea(boundary.map(id => byId.get(id)));
      if (area <= 1) throw new Error('Invalid civic plaza');
      plaza = { id: 'PLAZA-0001', name: 'Founders Square', vertices: boundary, area: Math.round(area * 100) / 100 };
    } else if (!face.split) {
      addBlock(boundary);
    } else {
      const a = boundary.indexOf(face.split[0]), b = boundary.indexOf(face.split[1]);
      addBlock(walkPolygon(boundary, a, b));
      addBlock(walkPolygon(boundary, b, a));
      road(face.split[0], face.split[1], 'lane');
    }
  }
  if (!plaza) throw new Error('Civic plaza not generated');
  return { nodes, roads, blocks, plaza };
}

export function generateLayout(seed, size, survey, morphology = 'radial') {
  if (morphology === 'radial') return generateRadialLayout(seed, size, survey);
  if (!Object.hasOwn(GRID_PRESETS, morphology)) throw new Error(`Unsupported morphology: ${morphology}`);
  return generateGridLayout(seed, size, survey, morphology);
}
