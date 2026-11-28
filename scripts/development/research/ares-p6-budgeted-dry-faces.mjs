// Research fork of src/core/road-faces.js at f026fb4aeecf61be58430052fb1d729deb2b2806.
// Existing geometry and protected plaza semantics retained; no shared-budget claim for graph construction.
import { polygonSignedArea, pointInPolygon, boundsOf } from '../../../src/core/geometry.js';
import { insideOrOn, distanceToSegment, appendSegmentCuts, lerpPoint } from '../../../src/core/boundary.js';
import { waterFaceInterior, waterSetContains, waterFaceFeatureIds } from '../../../src/core/water-geometry.js';
import { validateWaterCity } from '../../../src/core/water-model.js';
import { validateTerrainCity } from '../../../src/core/terrain-model.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';

const rfCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rfPair = (a, b) => JSON.stringify([a, b]);
const rfEdge = (a, b) => JSON.stringify([a, b].sort(rfCompare));
function rfFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(rfFreeze);
    Object.freeze(value);
  }
  return value;
}
function rfIssue(code, message, faceIds = [], roadIds = [], objectIds = []) {
  return {
    code,
    message,
    faceIds: [...faceIds].sort(rfCompare),
    roadIds: [...roadIds].sort(rfCompare),
    objectIds: [...objectIds].sort(rfCompare),
  };
}
function rfIssues(issues) {
  return issues.sort((a, b) => rfCompare(a.code, b.code) || rfCompare(JSON.stringify(a), JSON.stringify(b)));
}
function rfCycle(vertices) {
  let first = 0;
  for (let i = 1; i < vertices.length; i++) if (rfCompare(vertices[i], vertices[first]) < 0) first = i;
  return [...vertices.slice(first), ...vertices.slice(0, first)];
}
// Canonical editing traversal is separate from generator insertion order. Every
// half-edge must close exactly once; repeated vertices are explicit diagnostics.
const charge=(spend,n)=>spend(Math.max(1,n));
const sortCharge=(spend,n)=>charge(spend,n*Math.ceil(Math.log2(n+1)));
function* rfWalk(graph, spend) {
  const next = new Map(),
    roads = new Map();
  // Leaf-chain roads occupy real corridors but do not define closed faces.
  // Traverse only the cycle-bearing core; the full graph is kept for
  // clearance, rendering, connectivity, persistence and independent Apply.
  charge(spend,graph.terminalRoadIds?.length??0);
  const terminal = new Set(graph.terminalRoadIds ?? []);
  for (const road of graph.roadsById.values()) {
    spend(3);
    if (terminal.has(road.id)) continue;
    roads.set(rfPair(road.a, road.b), road.id);
    roads.set(rfPair(road.b, road.a), road.id);
  }
  for (const [id, neighbors] of graph.adjacency) {
    const node = graph.nodesById.get(id);
    charge(spend,3+3*neighbors.length);sortCharge(spend,neighbors.length);
    const sorted = [...neighbors].filter(neighbor => roads.has(rfPair(id, neighbor))).sort((a, b) => {
      const p = graph.nodesById.get(a),
        q = graph.nodesById.get(b);
      return (
        Math.atan2(p.y - node.y, p.x - node.x) - Math.atan2(q.y - node.y, q.x - node.x) || rfCompare(a, b)
      );
    });
    sorted.forEach((neighbor, i) =>
      next.set(rfPair(neighbor, id), [id, sorted[(i + sorted.length - 1) % sorted.length]]),
    );
  }
  const visited = new Set(),
    walks = [];
  sortCharge(spend,next.size);
  for (const key of [...next.keys()].sort(rfCompare)) {
    spend();
    if (visited.has(key)) continue;
    yield { stage: 'road-face-walk' };
    const start = JSON.parse(key),
      vertices = [],
      roadIds = [];
    let pair = start;
    do {
      spend();
      const directed = rfPair(...pair);
      if (visited.has(directed)) throw new Error('A directed edge was reused before its face closed.');
      visited.add(directed);
      vertices.push(pair[0]);
      roadIds.push(roads.get(directed));
      pair = next.get(directed);
      if (!pair) throw new Error('A face traversal has no successor.');
    } while (rfPair(...pair) !== key);
    if (vertices.length < 3 || new Set(vertices).size !== vertices.length)
      throw new Error('A face is pinched or repeats a junction.');
    charge(spend,8*vertices.length);
    const ordered = rfCycle(vertices),
      polygon = ordered.map((id) => {
        const p = graph.nodesById.get(id);
        return { x: p.x, y: p.y };
      });
    const ids = ordered.map((a, i) => roads.get(rfPair(a, ordered[(i + 1) % ordered.length])));
    walks.push({
      key: JSON.stringify(ordered),
      vertices: ordered,
      roadIds: ids,
      polygon,
      area: polygonSignedArea(polygon),
    });
  }
  if (visited.size !== (graph.roadsById.size - terminal.size) * 2)
    throw new Error('Not every directed road edge belongs to one face.');
  return walks;
}

// Detached, dry-only budget experiment. No private root; no production callers.
export function* iterateP6BudgetedDryFaces(graph, protectedGeometry, budget) {
  if(!budget?.spend||!budget?.snapshot)throw Error('Shared P6 budget required.');
  const spend=n=>budget.spend(n??1);
  // Refuse rather than silently skip mixed landscape validators that own private budgets.
  for(const key of ['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces']){
    spend();if(!Array.isArray(protectedGeometry?.[key])||protectedGeometry[key].length)throw Error('P6 dry face pilot requires empty landscape collections.');
  }
  if(protectedGeometry.waterState?.status!=='dry')throw Error('P6 dry face pilot requires dry water state.');
  charge(spend,graph?.roadsById?.size??0);
  if(graph?.valid&&[...graph.roadsById.values()].some(r=>r.waterBoundary||r.bridgeId||r.bank||r.foothill||r.terrainBoundary||r.passId))throw Error('P6 dry face pilot rejects landscape flags.');
  const issues = [],
    faces = [];
  let exterior = null,
    coverage = null;
  if (!graph?.valid)
    issues.push(
      rfIssue(
        'invalid-road-graph',
        'Face extraction requires a valid A1 graph.',
        [],
        graph?.issues?.flatMap((i) => i.roadIds) ?? [],
      ),
    );
  const boundary = protectedGeometry?.survey?.boundary;
  if (!Array.isArray(boundary) || boundary.length < 3 || !protectedGeometry?.plaza?.center)
    issues.push(
      rfIssue('protected-context', 'Provide the accepted outline and plaza geometry for face validation.'),
    );
  if (issues.length)
    return rfFreeze({ valid: false, issues: rfIssues(issues), faces, exterior, coverage, graph });
  try {
    const walks = yield* rfWalk(graph, spend);
    charge(spend,3*walks.length);
    const
      outside = walks.filter((f) => f.area < -1e-6),
      bounded = walks.filter((f) => f.area > 1e-6);
    if (outside.length !== 1 || walks.length !== bounded.length + 1)
      throw new Error('The network must have one exterior ring and positive, nondegenerate bounded faces.');
    exterior = outside[0];
    charge(spend,8*graph.roadsById.size+boundary.length);
    const byEdge = new Map([...graph.roadsById.values()].map((r) => [rfEdge(r.a, r.b), r]));
    const boundaryRoads = [...graph.roadsById.values()].filter((r) => r.boundary);
    const exteriorIds = new Set(exterior.roadIds),
      boundaryDegree = new Map();
    for (const r of boundaryRoads)
      for (const id of [r.a, r.b]) boundaryDegree.set(id, (boundaryDegree.get(id) ?? 0) + 1);
    if (
      boundaryRoads.length !== exterior.roadIds.length ||
      boundaryRoads.some((r) => !exteriorIds.has(r.id)) ||
      [...boundaryDegree.values()].some((n) => n !== 2)
    )
      issues.push(
        rfIssue(
          'boundary-ring',
          'Boundary roads must form exactly the connected exterior ring.',
          [],
          boundaryRoads.map((r) => r.id),
        ),
      );
    const onBoundary = (p) =>
      boundary.some((a, i) => {
        spend();
        return distanceToSegment(p, a, boundary[(i + 1) % boundary.length]) < 1e-6;
      });
    const inside = (p) => {
      spend(2*boundary.length);
      return insideOrOn(p, boundary);
    };
    for (const road of graph.roadsById.values()) {
      yield { stage: 'road-outline-validation', id: road.id };
      const a = graph.nodesById.get(road.a),
        b = graph.nodesById.get(road.b),
        cuts = [0, 1];
      for (let i = 0; i < boundary.length; i++) {
        spend();
        appendSegmentCuts(cuts, a, b, boundary[i], boundary[(i + 1) % boundary.length]);
      }
      sortCharge(spend,cuts.length);charge(spend,2*cuts.length);
      cuts.sort((x, y) => x - y);
      if (
        !inside(a) ||
        !inside(b) ||
        cuts.some((t, i) => i && !inside(lerpPoint(a, b, (t + cuts[i - 1]) / 2)))
      )
        issues.push(rfIssue('face-boundary-escape', 'A road leaves the accepted outline.', [], [road.id]));
      if (
        road.boundary &&
        (!onBoundary(a) ||
          !onBoundary(b) ||
          cuts.some((t, i) => i && !onBoundary(lerpPoint(a, b, (t + cuts[i - 1]) / 2))))
      )
        issues.push(
          rfIssue(
            'boundary-edge-detached',
            'An exterior edge is detached from the accepted outline.',
            [],
            [road.id],
          ),
        );
    }
    const center = protectedGeometry.plaza.center,
      waters = protectedGeometry.waterFeatures ?? [],
      terrain = protectedGeometry.terrainFeatures ?? [];
    let plazaCount = 0;
    for (const face of bounded) {
      yield { stage: 'bounded-face-validation' };
      charge(spend,10*face.vertices.length);
      const interior = waterFaceInterior(face.vertices, graph.nodesById),
        wet = waterSetContains(interior, waters),
        mountain = waterSetContains(interior, terrain);
      const plaza =
        pointInPolygon(center, face.polygon) &&
        face.polygon.every(
          (p, i) => distanceToSegment(center, p, face.polygon[(i + 1) % face.polygon.length]) > 1e-6,
        );
      const kind = plaza ? 'plaza' : wet ? 'water' : mountain ? 'terrain' : 'block';
      if (plaza) plazaCount++;
      if ((wet && mountain) || (plaza && (wet || mountain)))
        issues.push(
          rfIssue('protected-face-overlap', 'A face has incompatible plaza/water/terrain ownership.'),
        );
      if (face.area <= (kind === 'water' || kind === 'terrain' ? 0.00001 : 1))
        issues.push(
          rfIssue('degenerate-face', 'A face is too small for its accepted role.', [], face.roadIds),
        );
      faces.push({
        ...face,
        orientation: 'ccw',
        kind,
        edges: face.vertices.map((a, i) => ({
          a,
          b: face.vertices[(i + 1) % face.vertices.length],
          roadId: byEdge.get(rfEdge(a, face.vertices[(i + 1) % face.vertices.length])).id,
        })),
        ...(wet ? { waterIds: waterFaceFeatureIds(face.vertices, graph.nodesById, waters) } : {}),
        ...(mountain ? { terrainIds: waterFaceFeatureIds(face.vertices, graph.nodesById, terrain) } : {}),
      });
    }
    if (plazaCount !== 1)
      issues.push(
        rfIssue('plaza-face', 'The accepted plaza center must lie strictly within one face.', [
          protectedGeometry.plaza.id,
        ]),
      );
    charge(spend,boundary.length+faces.length);
    const boundaryArea = Math.abs(polygonSignedArea(boundary)),
      faceArea = faces.reduce((n, f) => n + f.area, 0);
    coverage = { boundaryArea, faceArea, error: Math.abs(faceArea - boundaryArea) };
    if (coverage.error > 0.02 || Math.abs(Math.abs(exterior.area) - boundaryArea) > 0.02)
      issues.push(rfIssue('face-coverage', 'The bounded faces do not cover exactly the accepted outline.'));
    sortCharge(spend,faces.length);
    faces.sort((a, b) => rfCompare(a.key, b.key));
    if (!issues.length) {
      charge(spend,4*faces.length+4*graph.nodesById.size+4*graph.roadsById.size);
      const snapshot = {
        ...protectedGeometry,
        nodes: [...graph.nodesById.values()],
        roads: [...graph.roadsById.values()],
        blocks: faces.filter((f) => f.kind === 'block'),
        plaza: { ...protectedGeometry.plaza, ...faces.find((f) => f.kind === 'plaza') },
        waterFaces: faces.filter((f) => f.kind === 'water'),
        terrainFaces: faces.filter((f) => f.kind === 'terrain'),
      };
      for (const [code, validate, enabled] of [
        ['water-topology', validateWaterCity, !!protectedGeometry.waterState],
        ['terrain-topology', validateTerrainCity, true],
      ])
        if (enabled) {
          try {
            // Dry state and empty feature arrays are checked above; validator scans roads only.
            charge(spend,2*graph.roadsById.size+boundary.length);
            validate(snapshot);
          } catch (error) {
            if(error instanceof LareBudgetExceeded)throw error;
            issues.push(
              rfIssue(
                code,
                error.message,
                [],
                [],
                [...waters, ...terrain].map((f) => f.id),
              ),
            );
          }
        }
    }
  } catch (error) {
    if(error instanceof LareBudgetExceeded)throw error;
    issues.push(rfIssue('face-traversal', error.message));
  }
  // All geometries are copies; graph indexes are already detached and immutable.
  return rfFreeze({ valid: issues.length === 0, issues: rfIssues(issues), faces, exterior, coverage, graph });
}


export function extractP6BudgetedDryFaces(graph,context,budget){
 const it=iterateP6BudgetedDryFaces(graph,context,budget);
 for(let step=it.next();;step=it.next())if(step.done)return step.value;
}
