import { placeRoadConflictBuilding } from './road-building-decisions.js';
import { terminalCorridors, polygonIntrudesTerminalCorridor } from './road-terminal-corridors.js';
import { buildRoadGraph } from './road-graph.js';
import { draftRoadShape } from './road-shape.js';
import { distanceToSegment, insideOrOn } from './boundary.js';
import { propertyFits } from './placement.js';
import { shapesOverlapInterior } from './building-validation.js';
import { generateBuildings } from '../generators/buildings.js';
import { classifyRoadProvenance, stampRoadGenerated } from './road-provenance.js';
import { extractRoadFaces, matchExistingFaces } from './road-faces.js';
import { inspectRoadContextReferences, inspectRoadDependencies } from './road-impact-dependencies.js';
import { inspectOpaqueRoadDependencies, riBudget, riEqual, riIndex, riReporter } from './road-impact-model.js';
import { draftRoadConnectionC3, normalizeRoadCrossingsC3, roadTopologyId } from './road-crossings.js';
import { validateStoredProject } from '../data/project-validation.js';

const TOPOLOGY_BLOCK_LIMIT = 32;
function roadInspectionTargetAllowed(graph,id) {
  return graph.valid && graph.nodesById.has(id) &&
    (graph.incidentRoads.get(id) ?? []).length > 0 &&
    graph.incidentRoads.get(id).every(edge => !graph.roadClasses.get(edge)?.protected);
}
const ROAD_RECORDS = [
  ['nodes', 'junction'], ['roads', 'road'], ['blocks', 'block'], ['properties', 'property'],
  ['plots', 'plot'], ['buildings', 'building'], ['openSpaces', 'open-space'],
];

function c3RetainDevelopment(old, city, replacements, graph) {
  const kept = { properties: [], plots: [], buildings: [] };
  const plots = riIndex(old.plots), buildings = riIndex(old.buildings);
  const roads = new Map(city.roads.map(road => [[road.a, road.b].sort().join(':'), road]));
  const candidateEdges = new Map();
  for (const block of [...replacements.values()].flat()) {
    if (candidateEdges.has(block.id)) continue;
    const edges = block.vertices.map((id, i) => {
      const next = block.vertices[(i + 1) % block.vertices.length];
      return { a: graph.nodesById.get(id), b: graph.nodesById.get(next),
        road: roads.get([id,next].sort().join(':')) };
    });
    candidateEdges.set(block.id, edges);
  }
  for (const property of old.properties) {
    if (!replacements.has(property.blockId)) continue;
    const ownBuildings = property.buildingIds.map(id => buildings.get(id));
    const sourcePlots = property.plotIds.map(id=>plots.get(id));
    const generatedParcel = classifyRoadProvenance(property,sourcePlots)==='generated';
    const origin = property.frame?.origin;
    const anchor = graph.nodesById.get(origin?.id);
    if (!anchor || anchor.x !== origin.x || anchor.y !== origin.y) continue;
    for (const block of replacements.get(property.blockId)) {
      if (block.id !== property.blockId && (!generatedParcel ||
          ownBuildings.some(building=>classifyRoadProvenance(building)!=='generated'))) continue;
      const edges = candidateEdges.get(block.id);
      const edge = edges.find(({road}) => road.id === property.frontageRoadId);
      if (!edge || ![edge.road.a, edge.road.b].includes(anchor.id)) continue;
      const {a,b} = edge, polygon = edges.map(row => row.a);
      const dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx,dy);
      const alignment = (dx*property.frame.tangent.x + dy*property.frame.tangent.y)/length;
      const outsideFrontage = property.frontage.some(point => {
        const along = ((point.x-a.x)*dx+(point.y-a.y)*dy)/length;
        return along < -1e-6 || along > length + 1e-6;
      });
      if (Math.abs(Math.abs(alignment)-1) > 1e-8 || outsideFrontage || !propertyFits(property.boundary, polygon, edges) ||
          ownBuildings.some(building => {
            const end = building.accessPath?.at(-1);
            return !end || distanceToSegment(end,a,b) > 1e-6 ||
              building.accessPath.some(point => !insideOrOn(point,polygon));
          })) continue;
      const assign = record => ({ ...record, blockId: block.id });
      const assigned = generatedParcel ? {...assign(property),districtId:block.districtId ?? null} : {...property};
      const ownPlots = generatedParcel ? sourcePlots.map(assign) : sourcePlots.map(plot=>({...plot}));
      if (generatedParcel) stampRoadGenerated(assigned, ownPlots);
      kept.properties.push(assigned);
      kept.plots.push(...ownPlots);
      for (const building of ownBuildings) {
        const generated = classifyRoadProvenance(building)==='generated';
        const retained = generated ? {...assign(building),districtId:block.districtId ?? null} : {...building};
        if (generated) stampRoadGenerated(retained);
        kept.buildings.push(retained);
      }
      break;
    }
  }
  return kept;
}

function c3Development(seed, city, blocks, old, kept, corridors = []) {
  const generated = generateBuildings(seed, { ...city, blocks });
  const keptByBlock = new Map();
  for (const property of kept.properties) {
    if (!keptByBlock.has(property.blockId)) keptByBlock.set(property.blockId, []);
    keptByBlock.get(property.blockId).push(property);
  }
  generated.properties = generated.properties.filter(property =>
    !polygonIntrudesTerminalCorridor(property.boundary, corridors) &&
    !(keptByBlock.get(property.blockId) ?? []).some(existing =>
      shapesOverlapInterior(property.boundary, existing.boundary)));
  const propertyIds = new Set(generated.properties.map(property => property.id));
  generated.plots = generated.plots.filter(plot => propertyIds.has(plot.propertyId));
  generated.buildings = generated.buildings.filter(building => propertyIds.has(building.propertyId));
  const reserved = new Set([...old.properties, ...old.plots, ...old.buildings, ...old.openSpaces].map(row => row.id));
  const ids = new Map();
  for (const [collection, prefix] of [['properties','PROP'], ['plots','PLOT'], ['buildings','BLD'], ['openSpaces','OPEN']]) {
    for (const record of generated[collection]) {
      const id = roadTopologyId(prefix + '-X', [record.blockId, record.id], reserved);
      ids.set(record.id, id);
      record.id = id;
    }
  }
  const districts = new Map(blocks.map(block => [block.id, block.districtId]));
  const plots = riIndex(generated.plots);
  for (const plot of generated.plots) plot.propertyId = ids.get(plot.propertyId);
  for (const property of generated.properties) {
    property.plotIds = property.plotIds.map(id => ids.get(id));
    property.buildingIds = property.buildingIds.map(id => ids.get(id));
    property.districtId = districts.get(property.blockId) ?? null;
    stampRoadGenerated(property, property.plotIds.map(id => plots.get(id)));
  }
  for (const building of generated.buildings) {
    building.propertyId = ids.get(building.propertyId);
    building.plotIds = building.plotIds.map(id => ids.get(id));
    building.districtId = districts.get(building.blockId) ?? null;
    stampRoadGenerated(building);
  }
  for (const key of Object.keys(kept)) generated[key].push(...kept[key]);
  const occupied = new Map();
  for (const property of generated.properties)
    occupied.set(property.blockId, (occupied.get(property.blockId) ?? 0) + property.area);
  const blockAreas = new Map(blocks.map(block => [block.id,block.area]));
  for (const space of generated.openSpaces) {
    space.area = Math.max(0, blockAreas.get(space.blockId) - (occupied.get(space.blockId) ?? 0));
    space.kind = occupied.has(space.blockId) ? 'yards-and-gaps' : 'undeveloped';
  }
  return generated;
}

// A bend subdivides a boundary shared by the same two blocks. Match
// those oriented boundaries without the selected path's bend vertices so
// geometric overlap does not accidentally combine the two districts.
function c4MatchBentFaces(old, extraction, draft) {
  const beforeBends = new Set(draft.bendIdsBefore), afterBends = new Set(draft.bendIdsAfter);
  const boundaryKey = (vertices, bends) => {
    const corners = vertices.filter(id=>!bends.has(id));
    if (corners.length < 2) return null;
    const first = corners.indexOf(corners.reduce((a,b)=>a<b?a:b));
    return JSON.stringify([...corners.slice(first),...corners.slice(0,first)]);
  };
  const candidates = new Map();
  for (const face of extraction.faces.filter(face=>face.kind==='block')) {
    const key = boundaryKey(face.vertices,afterBends);
    if (!key || candidates.has(key)) return null;
    candidates.set(key,face);
  }
  if (candidates.size !== old.blocks.length) return null;
  const oldNodes = riIndex(old.nodes), nextNodes = extraction.graph.nodesById;
  const preserved = [], changed = [];
  for (const block of old.blocks) {
    const key = boundaryKey(block.vertices,beforeBends), face = candidates.get(key);
    if (!face) return null;
    candidates.delete(key);
    const same = face.vertices.length === block.vertices.length &&
      boundaryKey(face.vertices, new Set()) === boundaryKey(block.vertices, new Set()) &&
      face.vertices.every(id=>riEqual(oldNodes.get(id),nextNodes.get(id)));
    if (same) preserved.push({id:block.id,kind:'block'});
    else changed.push({id:block.id,kind:'block',record:{...block,vertices:face.vertices,area:face.area}});
  }
  return { valid:true,preserved,changed,added:[],removed:[],split:[],merged:[],ambiguous:[] };
}

export function prepareRoadTopologyReflowC3(project, roadId, draft, edit = null, decisions = new Map(), options = {}) {
  const validation = { graph: 'not-run', faces: 'not-run', parcels: 'not-run', project: 'not-run' };
  const fail = (code, message, kind = draft?.junctionId ? 'junction' : 'road', id = roadId) => ({
    phase: 'C3', status: 'needs-review', candidateProject: null, changed: [], ledger: [],
    unresolved: [{ code, message, kind, id, severity: 'needs-review' }], validation,
  });
  try {
    validateStoredProject(project);
    const old = project.city;
    if (edit?.kind === 'shape') draft = draftRoadShape(old, buildRoadGraph(old), roadId, edit.points);
    else if (edit) draft = draftRoadConnectionC3(old, roadId, edit);
    const preferred = options?.targetJunctionId ?? null;
    if (preferred !== null) {
      const source = old.nodes.find(node => node.id === roadId);
      const destination = old.nodes.find(node => node.id === preferred);
      const moved = draft?.proposedCity?.nodes?.find(node => node.id === roadId);
      const accepted = buildRoadGraph(old);
      if (edit || draft?.junctionId !== roadId || !source || !destination ||
          source.id === preferred || !moved ||
          moved.x !== destination.x || moved.y !== destination.y ||
          !roadInspectionTargetAllowed(accepted, preferred))
        return fail('target-junction-invalid',
          'The selected destination is no longer an ordinary junction at the proposed position.', 'junction', preferred);
    }
    const oldTerminals = new Set(buildRoadGraph(old).terminalRoadIds);
    if (oldTerminals.has(roadId) && edit?.kind !== 'remove')
      return fail('terminal-edit-out-of-scope',
        'Editing an existing dead-end road requires a separately scoped operation.', 'road', roadId);
    const { city, graph, splitRoadIds } = normalizeRoadCrossingsC3(structuredClone(draft.proposedCity), {preferredNodeId: preferred});
    const introduced = graph.terminalRoadIds.filter(id => !oldTerminals.has(id));
    if (introduced.length && edit?.kind !== 'remove')
      return fail('terminal-edit-out-of-scope',
        'Creating new dead ends is supported only through ordinary road deletion in 0.2.1.',
        'road', introduced[0]);
    validation.graph = 'pass';
    const { emit, items } = riReporter(), spend = riBudget();
    inspectOpaqueRoadDependencies(project, graph, emit, spend);
    const opaque = items().find(row => row.severity !== 'info');
    if (opaque) return fail(opaque.code, opaque.message, opaque.kind, opaque.id);
    const extraction = extractRoadFaces(graph, old);
    if (!extraction.valid) return fail(extraction.issues[0].code, extraction.issues[0].message);
    validation.faces = 'pass';
    const overlapMatch = matchExistingFaces(old, extraction);
    const matching = (edit?.kind === 'shape' && !splitRoadIds.length && overlapMatch.valid
      ? c4MatchBentFaces(old,extraction,draft)
      : null) ?? overlapMatch;
    if (!matching.valid || matching.added.length || matching.removed.length)
      return fail('unresolved-face-ownership', 'Block ownership cannot be traced across these street changes.');
    const matches = new Map(extraction.faces.map(face => [face.key, face]));
    const oldBlocks = riIndex(old.blocks);
    const preserved = new Set(matching.preserved.filter(row => row.kind === 'block').map(row => row.id));
    const groups = [...matching.split, ...matching.merged, ...matching.ambiguous];
    // The matcher classifies a many-to-many overlap as ambiguous. It is eligible
    // only when every participant is an ordinary block of one accepted district.
    const replacements = new Map();
    const used = new Set([old.plaza.id, ...oldBlocks.keys(), ...(old.waterFaces??[]).map(r=>r.id),
      ...(old.terrainFaces??[]).map(r=>r.id)]);
    for (const group of groups) {
      const sources = group.oldIds.map(id => oldBlocks.get(id));
      const faces = group.candidateKeys.map(key => matches.get(key));
      if (sources.some(block => !block) || faces.some(face => face?.kind !== 'block') ||
          new Set(sources.map(block => block.districtId)).size !== 1 ||
          new Set(sources.map(block => block.usage)).size !== 1)
        return fail('district-decision-required', 'The restructured blocks span different districts or land uses.');
      if (group.overlapArea <= 1e-6)
        return fail('unresolved-face-ownership', 'The new blocks have no provable overlap with their former district.');
      const inherited = sources[0];
      const records = faces.map(face => ({
        ...inherited, vertices: face.vertices, area: face.area,
        id: sources.length === 1 && faces.length === 1 ? inherited.id : roadTopologyId('BLK-X', face.key, used),
      }));
      for (const { id } of sources) replacements.set(id, records);
    }
    for (const match of matching.changed) {
      if (match.kind !== 'block') return fail('protected-face-change', 'A protected face would change.');
      replacements.set(match.id, [match.record]);
    }
    const affectedBlocks = old.blocks.filter(block => !preserved.has(block.id));
    if (!affectedBlocks.length || affectedBlocks.length > TOPOLOGY_BLOCK_LIMIT ||
        affectedBlocks.some(block => !replacements.has(block.id)))
      return fail('unresolved-face-ownership', 'The neighborhood is too large or its replacement blocks cannot be identified.');
    const rebuilt = [...new Map([...replacements.values()].flat().map(block => [block.id, block])).values()];
    const uniqueBlocks = (ids) => [...new Set(ids.flatMap(id => replacements.get(id)?.map(block => block.id) ?? [id]))];
    const nextBlocks = riIndex(rebuilt);
    city.blocks = uniqueBlocks(old.blocks.map(block => block.id)).map(id => nextBlocks.get(id) ?? oldBlocks.get(id));
    city.districts = city.districts.map(district => ({ ...district, blockIds: uniqueBlocks(district.blockIds) }));
    const corridors = terminalCorridors(city);
    const retained = c3RetainDevelopment(old, city, replacements, graph);
    const colliding = new Set(retained.properties.filter(property =>
      polygonIntrudesTerminalCorridor(property.boundary, corridors)).map(property => property.id));
    const oldBuildingIndex = riIndex(old.buildings);
    const keptPlotIndex = riIndex(retained.plots);
    for (const property of retained.properties.filter(row => colliding.has(row.id))) {
      const childBuildings = property.buildingIds.map(id => oldBuildingIndex.get(id));
      if (classifyRoadProvenance(property, property.plotIds.map(id => keptPlotIndex.get(id))) !== 'generated' ||
          childBuildings.some(building => !building || classifyRoadProvenance(building) !== 'generated'))
        return fail('parcel-corridor-conflict', 'An authored property or building occupies the retained dead-end street corridor.', 'property', property.id);
    }
    const kept = {
      properties: retained.properties.filter(property => !colliding.has(property.id)),
      plots: retained.plots.filter(plot => !colliding.has(plot.propertyId)),
      buildings: retained.buildings.filter(building => !colliding.has(building.propertyId)),
    };
    const keptIds = new Set(Object.values(kept).flat().map(record=>record.id));
    const oldPlots = riIndex(old.plots);
    const customized = old.properties.find(property => replacements.has(property.blockId) && !keptIds.has(property.id) &&
      classifyRoadProvenance(property, property.plotIds.map(id => oldPlots.get(id))) !== 'generated');
    if (customized) return fail('parcel-decision-required', 'Changing this custom or older parcel requires a separate parcel edit.',
      'property', customized.id);
    const conflicts = old.buildings.filter(building => replacements.has(building.blockId) && !keptIds.has(building.id) &&
      classifyRoadProvenance(building) !== 'generated');
    const required = conflicts.filter(building=>!decisions.has(building.id));
    if (required.length) return {
      ...fail('building-decision-required','Choose how to handle the affected building.','building',required[0].id),
      unresolved: required.map(building=>({kind:'building', id:building.id, code:'building-decision-required',
        message:'This building needs your approval before its parcel or placement can change.',severity:'needs-review'})),
    };
    const regenerated = c3Development(project.seed, city, rebuilt, old, kept, corridors);
    const decided = new Map();
    for (const building of conflicts) {
      const choice = decisions.get(building.id);
      const placed = placeRoadConflictBuilding(building,choice,regenerated,replacements.get(building.blockId),graph,keptIds);
      if (!placed)
        return fail('building-placement-blocked', 'That choice does not fit the adapted neighborhood. Choose another placement or revise the road.',
          'building',building.id);
      decided.set(building.id,choice.kind);
    }
    const refitted = new Map();
    const complex = old.buildings.filter(building=>replacements.has(building.blockId) && !keptIds.has(building.id) &&
      classifyRoadProvenance(building)==='generated' && (building.holes?.length || building.plotIds.length>1));
    for (const building of complex.slice(0,24)) {
      const blocks = replacements.get(building.blockId);
      const fixed = placeRoadConflictBuilding(building,{kind:'fixed'},regenerated,blocks,graph,keptIds);
      const moved = fixed ?? placeRoadConflictBuilding(building,{kind:'auto'},regenerated,blocks,graph,keptIds);
      if (moved) {
        stampRoadGenerated(moved);
        refitted.set(building.id,fixed ? 'access-reconnected' : 'relocated');
      }
    }
    for (const key of Object.keys(regenerated))
      city[key] = [...city[key].filter(record => !replacements.has(record.blockId)), ...regenerated[key]];

    const oldRoads = riIndex(old.roads);
    const oldNodes = riIndex(old.nodes);
    const roadIds = new Set(city.roads.filter(road => !riEqual(road, oldRoads.get(road.id)) ||
      [road.a, road.b].some(id => !riEqual(graph.nodesById.get(id), oldNodes.get(id)))).map(road => road.id));
    const context = { roadIds: [...roadIds], junctionIds: draft.proposedNodes.map(node => node.id),
      changedBlockIds: rebuilt.map(block => block.id), acceptedValid: true };
    inspectRoadContextReferences(city, city, context, emit, spend);
    inspectRoadDependencies(city, city, context, (kind,id,code,...args) => {
      // Stored-project validation checks shared-edge plot containment with the
      // subdivision tolerance. These reports describe frontage re-inspection.
      if (code !== 'frontage-geometry' && !(kind === 'plot' && code === 'property-containment'))
        emit(kind,id,code,...args);
    }, spend);
    const conflict = items().find(row => row.severity !== 'info');
    if (conflict) return fail(conflict.code, conflict.message, conflict.kind, conflict.id);
    const candidateProject = { ...structuredClone({ ...project, city: null }), city };
    validateStoredProject(candidateProject);
    validation.parcels = 'pass';
    validation.project = 'valid';

    const changed = [], ledger = [];
    const retainedIds = new Set(Object.values(kept).flat().map(record => record.id));
    for (const [key, kind] of ROAD_RECORDS) {
      const before = riIndex(old[key]), after = riIndex(city[key]);
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        const a = before.get(id), b = after.get(id);
        const movedBoundary = (kind === 'road' && roadIds.has(id)) ||
          (kind === 'block' && replacements.has(id));
        if (riEqual(a,b) && !movedBoundary) continue;
        const disposition = !a ? (kind === 'junction' ? 'created-junction' : 'created') :
          !b ? (kind === 'road' ? 'removed-road' : 'replaced') : kind === 'building' && decided.has(id) ? (decided.get(id)==='fixed'?'access-reconnected':'authorized-relocation') : refitted.get(id) ?? (retainedIds.has(id) ? 'retained' : kind === 'road' && splitRoadIds.includes(id) ? 'split' : 'reshaped');
        ledger.push({ kind, oldId: a?.id ?? null, newId: b?.id ?? null, disposition,
          ...(refitted.has(id) ? {provenance:'generated'} : {}),
          ...(kind === 'block' && a ? { successorIds: replacements.get(id)?.map(row => row.id) ?? [id] } : {}) });
        changed.push({ kind, id, fields: ['geometry'] });
      }
    }
    return { phase: 'C3', status: 'candidate-only', candidateProject, changed, ledger, unresolved: [], validation };
  } catch (error) {
    return fail('topology-reflow-blocked', error.message);
  }
}
