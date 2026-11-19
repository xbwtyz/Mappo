import { buildRoadGraph } from './road-graph.js';
import { polygonSignedArea, pointInPolygon, boundsOf } from './geometry.js';
import { insideOrOn, distanceToSegment, segmentCuts, lerpPoint } from './boundary.js';
import { waterFaceInterior, waterSetContains, waterFaceFeatureIds } from './water-geometry.js';
import { validateWaterCity } from './water-model.js';
import { validateTerrainCity } from './terrain-model.js';
import { validateDistricts } from './district-model.js';
import { validateFortifications } from './fortification-model.js';
import { roadFaceOverlapArea } from './road-face-geometry.js';

export const ROAD_FACE_WORK_LIMIT = 6000000;
const rfCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rfPair = (a, b) => JSON.stringify([a, b]);
const rfEdge = (a, b) => JSON.stringify([a, b].sort(rfCompare));
const rfUndirectedRecord = (road) => ({
  ...rfCopy(road),
  a: [road.a, road.b].sort(rfCompare)[0],
  b: [road.a, road.b].sort(rfCompare)[1],
});
function rfCopy(value) {
  if (Array.isArray(value)) return value.map(rfCopy);
  return value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort(rfCompare)
          .map((k) => [k, rfCopy(value[k])]),
      )
    : value;
}
function rfFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(rfFreeze);
    Object.freeze(value);
  }
  return value;
}
function rfBudget() {
  let remaining = ROAD_FACE_WORK_LIMIT;
  return (n = 1) => {
    if ((remaining -= n) < 0)
      throw new Error('Face analysis exceeded its work budget; no complete identity result is available.');
  };
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
const rfKey = (vertices) => JSON.stringify(rfCycle(vertices));
const rfCloseArea = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.max(a, b) * 1e-8);
const rfObjects = (city) => [
  ...(city.blocks ?? []).map((record) => ({ kind: 'block', record })),
  ...(city.plaza ? [{ kind: 'plaza', record: city.plaza }] : []),
  ...(city.waterFaces ?? []).map((record) => ({ kind: 'water', record })),
  ...(city.terrainFaces ?? []).map((record) => ({ kind: 'terrain', record })),
];

// Canonical editing traversal is separate from generator insertion order. Every
// half-edge must close exactly once; repeated vertices are explicit diagnostics.
function rfWalk(graph, spend) {
  const next = new Map(),
    roads = new Map();
  for (const road of graph.roadsById.values()) {
    roads.set(rfPair(road.a, road.b), road.id);
    roads.set(rfPair(road.b, road.a), road.id);
  }
  for (const [id, neighbors] of graph.adjacency) {
    const node = graph.nodesById.get(id);
    const sorted = [...neighbors].sort((a, b) => {
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
  for (const key of [...next.keys()].sort(rfCompare)) {
    if (visited.has(key)) continue;
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
  if (visited.size !== graph.roadsById.size * 2)
    throw new Error('Not every directed road edge belongs to one face.');
  return walks;
}

export function extractRoadFaces(graph, protectedGeometry) {
  const issues = [],
    faces = [],
    spend = rfBudget();
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
    const walks = rfWalk(graph, spend),
      outside = walks.filter((f) => f.area < -1e-6),
      bounded = walks.filter((f) => f.area > 1e-6);
    if (outside.length !== 1 || walks.length !== bounded.length + 1)
      throw new Error('The network must have one exterior ring and positive, nondegenerate bounded faces.');
    exterior = outside[0];
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
      spend(boundary.length);
      return insideOrOn(p, boundary);
    };
    for (const road of graph.roadsById.values()) {
      const a = graph.nodesById.get(road.a),
        b = graph.nodesById.get(road.b),
        cuts = [0, 1];
      for (let i = 0; i < boundary.length; i++) {
        spend();
        cuts.push(...segmentCuts(a, b, boundary[i], boundary[(i + 1) % boundary.length]));
      }
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
    const boundaryArea = Math.abs(polygonSignedArea(boundary)),
      faceArea = faces.reduce((n, f) => n + f.area, 0);
    coverage = { boundaryArea, faceArea, error: Math.abs(faceArea - boundaryArea) };
    if (coverage.error > 0.02 || Math.abs(Math.abs(exterior.area) - boundaryArea) > 0.02)
      issues.push(rfIssue('face-coverage', 'The bounded faces do not cover exactly the accepted outline.'));
    faces.sort((a, b) => rfCompare(a.key, b.key));
    if (!issues.length) {
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
            validate(snapshot);
          } catch (error) {
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
    issues.push(rfIssue('face-traversal', error.message));
  }
  // All geometries are copies; graph indexes are already detached and immutable.
  return rfFreeze({ valid: issues.length === 0, issues: rfIssues(issues), faces, exterior, coverage, graph });
}

function rfOldFaces(city, graph) {
  const byEdge = new Map([...graph.roadsById.values()].map((r) => [rfEdge(r.a, r.b), r.id]));
  return rfObjects(city)
    .map(({ kind, record }) => ({
      kind,
      record,
      key: rfKey(record.vertices),
      polygon: record.vertices.map((id) => graph.nodesById.get(id)),
      roadIds: record.vertices.map((a, i) =>
        byEdge.get(rfEdge(a, record.vertices[(i + 1) % record.vertices.length])),
      ),
    }))
    .sort((a, b) => rfCompare(a.record.id, b.record.id));
}
function rfProtectedIssues(city, candidate, accepted) {
  const issues = [];
  for (const [id, old] of accepted.roadsById)
    if (accepted.roadClasses.get(id).protected || candidate.roadClasses.get(id)?.protected) {
      const road = candidate.roadsById.get(id);
      if (
        !road ||
        JSON.stringify(rfUndirectedRecord(old)) !== JSON.stringify(rfUndirectedRecord(road)) ||
        [old.a, old.b].some((n) => {
          const a = accepted.nodesById.get(n),
            b = candidate.nodesById.get(n);
          return !b || a.x !== b.x || a.y !== b.y;
        })
      )
        issues.push(
          rfIssue('protected-edge-change', 'A protected edge or its junction geometry changed.', [], [id]),
        );
    }
  for (const [id] of candidate.roadsById)
    if (candidate.roadClasses.get(id).protected && !accepted.roadsById.has(id))
      issues.push(
        rfIssue('protected-edge-added', 'Ordinary road editing cannot introduce a protected edge.', [], [id]),
      );
  return issues;
}

export function matchExistingFaces(oldCity, extraction) {
  const result = {
    valid: false,
    preserved: [],
    changed: [],
    added: [],
    removed: [],
    split: [],
    merged: [],
    ambiguous: [],
    issues: [],
    requiresReview: true,
    canApplyIn02A: false,
  };
  const spend = rfBudget();
  if (!extraction?.valid) {
    result.issues.push(
      rfIssue(
        'invalid-candidate-faces',
        'Identity matching requires a fully validated candidate face extraction.',
      ),
    );
    return rfFreeze(result);
  }
  const accepted = buildRoadGraph(oldCity),
    baseline = extractRoadFaces(accepted, oldCity);
  if (!baseline.valid) {
    result.issues.push(rfIssue('invalid-accepted-faces', 'The accepted road/face network is not valid.'));
    return rfFreeze(result);
  }
  try {
    const old = rfOldFaces(oldCity, accepted),
      fresh = extraction.faces,
      oldIds = new Set(old.map((f) => f.record.id));
    const baselineByKey = new Map(baseline.faces.map((f) => [f.key, f]));
    if (
      oldIds.size !== old.length ||
      old.length !== baseline.faces.length ||
      new Set(old.map((f) => f.key)).size !== old.length ||
      old.some((f) => baselineByKey.get(f.key)?.kind !== f.kind)
    )
      throw new Error('Accepted face IDs or boundaries do not correspond uniquely to its road network.');
    result.issues.push(...rfProtectedIssues(oldCity, extraction.graph, accepted));
    const assignedOld = new Set(),
      assignedNew = new Set(),
      newByKey = new Map(fresh.map((f) => [f.key, f]));
    function assign(a, b, overlap) {
      const unchanged = a.record.vertices.every((id) => {
        const p = accepted.nodesById.get(id),
          q = extraction.graph.nodesById.get(id);
        return q && p.x === q.x && p.y === q.y;
      });
      const record = rfCopy(a.record);
      if (!unchanged) {
        record.area = Math.round(b.area * 100) / 100;
      }
      const item = {
        id: record.id,
        kind: a.kind,
        candidateKey: b.key,
        record,
        oldArea: Math.abs(polygonSignedArea(a.polygon)),
        newArea: b.area,
        overlapArea: overlap,
      };
      result[unchanged ? 'preserved' : 'changed'].push(item);
      assignedOld.add(a.record.id);
      assignedNew.add(b.key);
      if (a.kind !== 'block' && !unchanged)
        result.issues.push(
          rfIssue(
            'protected-face-change',
            'Protected face geometry cannot be rewritten by ordinary editing.',
            [a.record.id],
            b.roadIds,
          ),
        );
      if (
        (a.kind === 'water' &&
          JSON.stringify([...(a.record.waterIds ?? [a.record.waterId])].sort()) !==
            JSON.stringify([...(b.waterIds ?? [])].sort())) ||
        (a.kind === 'terrain' &&
          JSON.stringify([...(a.record.terrainIds ?? [])].sort()) !==
            JSON.stringify([...(b.terrainIds ?? [])].sort()))
      )
        result.issues.push(
          rfIssue(
            'protected-face-owner',
            'Protected face ownership differs from the accepted feature references.',
            [a.record.id],
            b.roadIds,
          ),
        );
    }
    for (const a of old) {
      const b = newByKey.get(a.key);
      if (
        !b ||
        a.kind !== b.kind ||
        JSON.stringify([...a.roadIds].sort(rfCompare)) !== JSON.stringify([...b.roadIds].sort(rfCompare)) ||
        a.roadIds.some((id, i) => {
          const road = extraction.graph.roadsById.get(id);
          return (
            !road ||
            rfEdge(road.a, road.b) !==
              rfEdge(a.record.vertices[i], a.record.vertices[(i + 1) % a.record.vertices.length])
          );
        })
      )
        continue;
      const unchanged = a.record.vertices.every((id) => {
        const p = accepted.nodesById.get(id),
          q = extraction.graph.nodesById.get(id);
        return q && p.x === q.x && p.y === q.y;
      });
      const overlap = unchanged ? b.area : roadFaceOverlapArea(a.polygon, b.polygon, spend);
      if (overlap > Math.min(Math.abs(polygonSignedArea(a.polygon)), b.area) * 1e-8) assign(a, b, overlap);
    }
    // Remaining faces form a bipartite positive-overlap graph. Its components
    // are diagnostics only. Splits/merges never inherit IDs or metadata.
    const remainingOld = old.filter((f) => !assignedOld.has(f.record.id)),
      remainingNew = fresh.filter((f) => !assignedNew.has(f.key)),
      links = new Map(),
      reverse = new Map(),
      areas = new Map();
    const boxes = remainingNew.map((f) => boundsOf(f.polygon));
    for (let i = 0; i < remainingOld.length; i++) {
      const a = remainingOld[i],
        bounds = boundsOf(a.polygon);
      links.set(i, []);
      for (let j = 0; j < remainingNew.length; j++) {
        spend();
        const box = boxes[j];
        if (
          bounds.maxX <= box.minX ||
          bounds.minX >= box.maxX ||
          bounds.maxY <= box.minY ||
          bounds.minY >= box.maxY
        )
          continue;
        const overlap = roadFaceOverlapArea(a.polygon, remainingNew[j].polygon, spend);
        if (overlap <= 1e-6) continue;
        links.get(i).push(j);
        if (!reverse.has(j)) reverse.set(j, []);
        reverse.get(j).push(i);
        areas.set(rfPair(i, j), overlap);
      }
    }
    const seenOld = new Set(),
      seenNew = new Set();
    for (let i = 0; i < remainingOld.length; i++) {
      if (seenOld.has(i)) continue;
      const os = [i],
        ns = [];
      seenOld.add(i);
      for (let k = 0; k < os.length; k++)
        for (const j of links.get(os[k]))
          if (!seenNew.has(j)) {
            seenNew.add(j);
            ns.push(j);
            for (const oi of reverse.get(j))
              if (!seenOld.has(oi)) {
                seenOld.add(oi);
                os.push(oi);
              }
          }
      if (!ns.length) {
        result.removed.push({ id: remainingOld[i].record.id, kind: remainingOld[i].kind });
        continue;
      }
      const oldFaces = os.map((i) => remainingOld[i]),
        newFaces = ns.map((j) => remainingNew[j]),
        oldArea = oldFaces.reduce((n, f) => n + Math.abs(polygonSignedArea(f.polygon)), 0),
        newArea = newFaces.reduce((n, f) => n + f.area, 0);
      const overlapArea = os.reduce(
        (n, i) => n + ns.reduce((m, j) => m + (areas.get(rfPair(i, j)) ?? 0), 0),
        0,
      );
      const entry = {
        oldIds: oldFaces.map((f) => f.record.id).sort(rfCompare),
        candidateKeys: newFaces.map((f) => f.key).sort(rfCompare),
        oldArea,
        newArea,
        overlapArea,
      };
      const closed =
        rfCloseArea(oldArea, overlapArea) &&
        rfCloseArea(newArea, overlapArea) &&
        oldFaces.every((f) => f.kind === 'block') &&
        newFaces.every((f) => f.kind === 'block');
      const category =
        closed && os.length === 1 && ns.length > 1
          ? 'split'
          : closed && os.length > 1 && ns.length === 1
            ? 'merged'
            : 'ambiguous';
      result[category].push(entry);
      result.issues.push(
        rfIssue(
          `face-${category}`,
          `${category === 'ambiguous' ? 'Face correspondence is ambiguous' : category === 'split' ? 'An accepted face would split' : 'Accepted faces would merge'}; no identity was assigned.`,
          entry.oldIds,
          [],
        ),
      );
    }
    for (let j = 0; j < remainingNew.length; j++)
      if (!seenNew.has(j))
        result.added.push({ candidateKey: remainingNew[j].key, kind: remainingNew[j].kind });
    const mapped = [...result.preserved, ...result.changed],
      mappedIds = new Set(mapped.map((f) => f.id));
    for (const face of old.filter((f) => f.kind !== 'block'))
      if (!mappedIds.has(face.record.id))
        result.issues.push(
          rfIssue(
            'protected-face-unresolved',
            'A plaza, water or terrain face lost its unambiguous counterpart.',
            [face.record.id],
          ),
        );
    const blocks = mapped.filter((f) => f.kind === 'block').map((f) => f.record);
    const snapshot = {
      ...oldCity,
      nodes: [...extraction.graph.nodesById.values()],
      roads: [...extraction.graph.roadsById.values()],
      blocks,
    };
    for (const [code, validate, enabled, ids] of [
      [
        'district-reference',
        validateDistricts,
        !!oldCity.districtState,
        (oldCity.districts ?? []).map((d) => d.id),
      ],
      [
        'defense-reference',
        validateFortifications,
        !!oldCity.fortificationState,
        [...(oldCity.walls ?? []), ...(oldCity.gates ?? []), ...(oldCity.towers ?? [])].map((r) => r.id),
      ],
    ])
      if (enabled) {
        try {
          validate(snapshot);
        } catch (error) {
          result.issues.push(rfIssue(code, error.message, [], [], ids));
        }
      }
    result.valid = !result.issues.some(
      (i) =>
        !['face-split', 'face-merged', 'face-ambiguous', 'district-reference', 'defense-reference'].includes(
          i.code,
        ),
    );
    result.requiresReview = !!(
      result.issues.length ||
      result.added.length ||
      result.removed.length ||
      result.split.length ||
      result.merged.length ||
      result.ambiguous.length
    );
  } catch (error) {
    // Never return a partly proven mapping if geometric corroboration stops.
    for (const key of ['preserved', 'changed', 'added', 'removed', 'split', 'merged', 'ambiguous'])
      result[key] = [];
    result.issues.push(rfIssue('face-matching', error.message));
    result.valid = false;
    result.requiresReview = true;
  }
  rfIssues(result.issues);
  return rfFreeze(result);
}
