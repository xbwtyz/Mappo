import { prepareRoadTopologyReflowC3 } from './road-topology-reflow.js';
import { reflowGeneratedRoadBuildings } from './road-building-reflow.js';
import { prepareJunctionIntentC7, prepareRoadIntentC1 } from './road-intent-c1.js';
import { buildRoadGraph } from './road-graph.js';
import { extractRoadFaces, matchExistingFaces } from './road-faces.js';
import { analyzeRoadImpact } from './road-impact.js';
import { inspectRoadDependencies, inspectRoadContextReferences } from './road-impact-dependencies.js';
import { riBudget, riEqual, riIndex, riReporter } from './road-impact-model.js';
import { classifyRoadProvenance, stampRoadGenerated } from './road-provenance.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from './property-geometry.js';
import { PROPERTY_SETBACK, STREET_EDGE_WIDTH, STREET_WIDTHS, propertyFits, rectangleInFrame } from './placement.js';
import { distanceToSegment, segmentCuts } from './boundary.js';
import { validateStoredProject } from '../data/project-validation.js';

const C2_PARCEL_LIMIT = 256;
const rebuildableLandIssues = new Set([
  'road-clearance', 'road-setback', 'block-containment', 'parcel-reflow-blocked',
  'access-reflow-blocked', 'access-decision-required', 'candidate-validation',
]);
const c2LandIssues = new Set(['frontage-geometry', 'block-containment', 'road-setback', 'frame-reference']);
const c2Issue = (kind, id, code, message) => ({ kind, id, code, message, severity: 'needs-review' });
const c2Margin = road => (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK;

function c2Parcel(city, property, road, edges, fixed) {
  const edge = edges.find(e => e.road.id === road.id);
  if (!edge || property.boundary.length !== 4)
    throw new Error('This parcel needs a four-corner envelope with frontage on its own block.');
  const { a, b } = edge;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const inward = { x: -tangent.y, y: tangent.x };
  const frame = { origin: a, tangent, inward };
  const u = p => (p.x - a.x) * tangent.x + (p.y - a.y) * tangent.y;
  const v = p => (p.x - a.x) * inward.x + (p.y - a.y) * inward.y;
  const front = c2Margin(road) + .05;
  if (fixed.some(p => v(p) < front))
    throw new Error('The street setback reaches a fixed building. Adjust the street or resolve the building placement.');
  const ratios = propertyDividerFractions3I(city, property);
  const polygon = edges.map(e => e.a);
  const oldLeft = Math.min(...property.boundary.map(u));
  const oldRight = Math.max(...property.boundary.map(u));
  const oldRear = Math.max(...property.boundary.map(v));
  const center = Math.max(2, Math.min(length - 2, (oldLeft + oldRight) / 2));
  const tightLeft = fixed.length ? Math.min(...fixed.map(u)) - .03 : center - 1;
  const tightRight = fixed.length ? Math.max(...fixed.map(u)) + .03 : center + 1;
  const tightRear = fixed.length ? Math.max(...fixed.map(v)) + .03 : front + 2;
  const left = Math.min(oldLeft, tightLeft), right = Math.max(oldRight, tightRight);
  const rear = Math.max(oldRear, tightRear);
  // Prefer the old world footprint. Trim only unbuilt margins where needed.
  for (const trim of [0, .25, .5, .75, 1]) {
    const x = left + (tightLeft - left) * trim;
    const width = right + (tightRight - right) * trim - x;
    const depth = rear + (tightRear - rear) * trim - front;
    if (width <= 1 || depth <= 1 || x < 0 || x + width > length) continue;
    const boundary = rectangleInFrame(frame, x, front, width, depth);
    if (!propertyFits(boundary, polygon, edges)) continue;
    const preview = propertyGeometryPreview3I(city, property.id, boundary, ratios);
    return {
      property: { ...property, boundary, frontage: boundary.slice(0, 2), frame, area: preview.area,
        local: { x, y: front, width, depth } },
      plots: preview.plots,
    };
  }
  throw new Error('No local parcel envelope fits the new block and its fixed buildings.');
}

export function prepareNeighborhoodReflowC2(project, roadId, offset, draft = prepareRoadIntentC1(project, roadId, offset)) {
  return prepareNeighborhoodReflow(project, roadId, draft, false);
}

export function prepareNeighborhoodReflowC3(project, roadId, offset,
  draft = prepareRoadIntentC1(project, roadId, offset), decisions = new Map(), options = {}) {
  return reconcileRoadIntent(project,roadId,draft,decisions,options);
}

export function prepareJunctionReflowC7(project,junctionId,point,decisions = new Map(), options = {}) {
  return { ...reconcileRoadIntent(project,junctionId,prepareJunctionIntentC7(project,junctionId,point),decisions,options), applyReady:false };
}

function reconcileRoadIntent(project,roadId,draft,decisions,options = {}) {
  if (draft.draftable && !draft.issues.some(row => row.code === 'boundary-escape') &&
      draft.issues.some(row => row.code === 'unnormalized-crossing'))
    return prepareRoadTopologyReflowC3(project, roadId, draft,null,decisions,options);
  if (decisions.size && draft.facesResolved && !draft.issues.some(row=>row.code==='boundary-escape'))
    return prepareRoadTopologyReflowC3(project,roadId,draft,null,decisions,options);
  // Both attempts start from the same detached draft. Reuse its read-only
  // analysis within this call, including when Apply runs a fresh rebuild.
  let analysis;
  const analyze = () => analysis ??= analyzeNeighborhoodDraft(project, draft);
  const preserved = prepareNeighborhoodReflow(project, roadId, draft, false, analyze, options);
  if (preserved.candidateProject || !preserved.unresolved.some(row =>
      rebuildableLandIssues.has(row.code) || row.code==='parcel-decision-required' || row.code==='parcel-decision-invalid'))
    return preserved;
  const adapted = prepareNeighborhoodReflow(project, roadId, draft, true, analyze, options);
  if (adapted.candidateProject || !draft.facesResolved) return adapted;
  // If a fixed parcel layout cannot be repaired, try filling the same affected
  // blocks again. Topology reflow independently verifies provenance, protects
  // authored work, retains compatible geometry, and validates the whole result.
  if (!adapted.unresolved.length || (adapted.unresolved.some(row => !rebuildableLandIssues.has(row.code)) &&
      !adapted.unresolved.some(row=>row.code==='parcel-decision-required' || row.code==='parcel-decision-invalid')))
    return adapted;
  const rebuilt = prepareRoadTopologyReflowC3(project, roadId, draft,null,decisions,options);
  return rebuilt.candidateProject || rebuilt.unresolved.some(row =>
    ['parcel-decision-required','parcel-decision-invalid','building-decision-required'].includes(row.code))
    ? rebuilt : adapted;
}

function analyzeNeighborhoodDraft(project, draft) {
  const graph = buildRoadGraph(draft.proposedCity);
  const faces = extractRoadFaces(graph, project.city);
  const identity = matchExistingFaces(project.city, faces);
  let impact;
  return { graph, faces, identity, get impact() {
    return impact ??= analyzeRoadImpact(project,
      { operation: draft.junctionId ? 'move-junction' : 'translate-road', graph });
  } };
}

function prepareNeighborhoodReflow(project, roadId, draft, adaptBuildings,
  analyze = () => analyzeNeighborhoodDraft(project, draft), options = {}) {
  const changed = [], ledger = [];
  const parcelChoices = options.parcelChoices instanceof Map ? options.parcelChoices
    : new Map(options.parcelChoices ?? []);
  const phase = adaptBuildings ? 'C3' : 'C2';
  const validation = { graph: 'not-run', faces: 'not-run', parcels: 'not-run', project: 'not-run' };
  const blocked = unresolved => ({
    phase, status: 'needs-review', candidateProject: null, changed: [], ledger, unresolved, validation,
  });
  const kind = draft.junctionId ? 'junction' : 'road';
  const fail = (code, message) => blocked([c2Issue(kind, roadId, code, message)]);
  if (!draft.draftable || draft.status === 'unchanged' || !draft.topologyResolved ||
      draft.issues.some(issue => issue.code === 'boundary-escape')) {
    const issues = draft.issues.filter(issue => issue.code !== 'neighborhood-reflow-pending');
    return issues.length ? blocked(issues.map(issue => c2Issue(kind, roadId, issue.code, issue.message))) :
      fail('unresolved-topology', 'A changed street with matching block identities is required.');
  }
  try {
    const accepted = project.city;
    const draftAnalysis = analyze();
    const { graph, faces, identity } = draftAnalysis;
    if (!graph.valid || !faces.valid)
      return blocked([...graph.issues, ...faces.issues].map(issue => c2Issue(kind, roadId, issue.code, issue.message)));
    if (!identity.valid || identity.requiresReview || identity.issues.length ||
        identity.added.length || identity.removed.length || identity.split.length || identity.merged.length ||
        identity.ambiguous.length) {
      const issues = identity.issues.map(issue => c2Issue('block', issue.faceIds[0] ?? roadId, issue.code, issue.message));
      return issues.length ? blocked(issues) :
        fail('unresolved-topology', 'This move changes block identities. Face restructuring comes in C3.');
    }
    validation.graph = validation.faces = 'pass';
    const impact = draftAnalysis.impact;
    if (!impact.complete || impact.status === 'invalid')
      return impact.issues.length ? blocked(impact.issues) :
        fail('impact-incomplete', 'The full street and neighborhood impact could not be verified.');

    const changedBlocks = new Map(identity.changed.filter(face => face.kind === 'block').map(face => [face.id, face.record]));
    const roadIds = new Set(draft.changedRoadIds);
    const junctionIds = draft.proposedNodes.filter(node => {
      const old = accepted.nodes.find(n => n.id === node.id);
      return node.x !== old.x || node.y !== old.y;
    }).map(node => node.id);
    if (!junctionIds.length) return fail('unchanged-street', 'The offset does not move either street endpoint.');
    const draftBuildings = riIndex(draft.proposedCity.buildings);
    const replacements = new Map();
    const displacedParcels = new Set();
    if (adaptBuildings) for (const row of impact.issues) {
      const building = draftBuildings.get(row.id);
      if (row.kind === 'building' && building && ['road-clearance', 'block-containment'].includes(row.code))
        displacedParcels.add(building.propertyId);
    }
    if (draft.proposedCity.properties.filter(p => changedBlocks.has(p.blockId)).length > C2_PARCEL_LIMIT)
      return fail('reflow-work-limit', 'This move affects too many parcels for one local reflow.');
    const parcelIssues = new Set(impact.issues.filter(row =>
      row.kind === 'property' && c2LandIssues.has(row.code)).map(row => row.id));
    const unresolved = impact.issues.filter(row => !(
      ((row.kind === 'property' || row.kind === 'plot') && c2LandIssues.has(row.code)) ||
      (row.kind === 'plot' && row.code === 'property-containment') ||
      (row.kind === 'building' && (['frontage-geometry', 'access-connection'].includes(row.code) ||
        (adaptBuildings && displacedParcels.has(draftBuildings.get(row.id)?.propertyId) &&
          ['road-clearance', 'block-containment'].includes(row.code))))
    ));
    if (unresolved.length) return blocked(unresolved);

    const city = structuredClone(draft.proposedCity);
    const plots = riIndex(city.plots), buildings = riIndex(city.buildings);
    const reservedIds = new Set(buildings.keys());
    const affected = city.properties.filter(p => changedBlocks.has(p.blockId));

    function record(kind, id, disposition, fields, provenance = 'derived') {
      ledger.push({ kind, oldId: id, newId: id, disposition, provenance });
      if (fields.length) changed.push({ kind, id, fields });
    }

    city.blocks = city.blocks.map(block => changedBlocks.get(block.id) ?? block);
    const blocks = riIndex(city.blocks);
    const edgeRoads = new Map(city.roads.map(road => [[road.a, road.b].sort().join(':'), road]));
    const blockEdges = new Map([...changedBlocks].map(([id, block]) => [id, block.vertices.map((start, i) => {
      const end = block.vertices[(i + 1) % block.vertices.length];
      return { a: graph.nodesById.get(start), b: graph.nodesById.get(end),
        road: edgeRoads.get([start, end].sort().join(':')) };
    })]));
    for (const id of junctionIds) record('junction', id, 'moved', ['x', 'y']);
    for (const id of draft.changedRoadIds) record('road', id, 'moved', ['effective-geometry']);
    for (const id of changedBlocks.keys()) record('block', id, 'reshaped', ['area', 'boundary-geometry']);

    for (const property of affected) {
      const ownPlots = property.plotIds.map(id => plots.get(id));
      const provenance = classifyRoadProvenance(property, ownPlots);
      const changedFrontage = roadIds.has(property.frontageRoadId);
      if (!changedFrontage && !parcelIssues.has(property.id) && !displacedParcels.has(property.id)) {
        record('property', property.id, 'preserved', [], provenance);
        for (const plot of ownPlots) record('plot', plot.id, 'preserved', [], provenance);
        continue;
      }
      const choice = parcelChoices.get(property.id);
      if (provenance !== 'generated' && !choice) {
        unresolved.push(c2Issue('property', property.id, 'parcel-decision-required',
          'This parcel has custom or unknown provenance. Review whether its existing footprint can be kept or safely reshaped.'));
        continue;
      }
      if (choice && (provenance === 'generated' || !['keep','reshape'].includes(choice.kind) ||
           Object.keys(choice).some(key=>key!=='kind'))) {
        unresolved.push(c2Issue('property', property.id, 'parcel-decision-invalid',
          'This parcel decision is invalid for the current road edit.'));
        continue;
      }
      if (choice?.kind === 'keep') {
        record('property',property.id,'authorized-keep',[],provenance);
        for (const plot of ownPlots) record('plot',plot.id,'preserved',[],provenance);
        continue; // Full-project validation determines whether this is safe.
      }
      const road = graph.roadsById.get(property.frontageRoadId);
      try {
        const ownBuildings = property.buildingIds.map(id => buildings.get(id));
        const mayAdapt = adaptBuildings && ownBuildings.length &&
          ownBuildings.every(building => classifyRoadProvenance(building) === 'generated');
        const edges = blockEdges.get(property.blockId);
        let next;
        let adapt = displacedParcels.has(property.id);
        if (!adapt) {
          try {
            next = c2Parcel(city, property, road, edges, ownBuildings.flatMap(building => building.footprint));
          } catch (error) {
            if (!mayAdapt) throw error;
            adapt = true;
          }
        }
        if (adapt) {
          if (!mayAdapt) throw new Error('A custom or unknown building needs a decision before it can move.');
          next = c2Parcel(city, property, road, edges, []);
          const proposedPlots = ownPlots.map((plot, i) => ({ ...plot, boundary: next.plots[i].boundary }));
          const result = reflowGeneratedRoadBuildings(project.seed, property, next.property, proposedPlots,
            ownBuildings, reservedIds);
          next.property.buildingIds = result.buildings.map(building => building.id);
          replacements.set(property.id, result.buildings);
          for (const building of ownBuildings) {
            const relocated = result.disposition === 'relocated';
            ledger.push({ kind: 'building', oldId: building.id,
              newId: relocated ? building.id : null, disposition: relocated ? 'relocated' : 'replaced', provenance });
            changed.push({ kind: 'building', id: building.id, fields: ['footprint', 'accessPath'] });
          }
          if (result.disposition === 'regenerated') for (const building of result.buildings) {
            ledger.push({ kind: 'building', oldId: null, newId: building.id, disposition: 'regenerated', provenance });
            changed.push({ kind: 'building', id: building.id, fields: ['footprint', 'accessPath'] });
          }
        }
        Object.assign(property, next.property);
        for (const update of next.plots) {
          const plot = plots.get(update.id);
          const modified = !riEqual(plot.boundary, update.boundary);
          plot.boundary = update.boundary;
          record('plot', plot.id, modified ? 'reshaped' : 'preserved', modified ? ['boundary'] : [], provenance);
        }
        if (provenance === 'generated') stampRoadGenerated(property, ownPlots);
        record('property', property.id, choice ? 'authorized-reshape' : 'reshaped', ['boundary', 'frontage', 'frame', 'local', 'area'], provenance);
      } catch (error) {
        unresolved.push(c2Issue('property', property.id, 'parcel-reflow-blocked', error.message));
      }
    }
    const inserted = new Set();
    city.buildings = city.buildings.flatMap(building => {
      if (!replacements.has(building.propertyId)) return [building];
      if (inserted.has(building.propertyId)) return [];
      inserted.add(building.propertyId);
      return replacements.get(building.propertyId);
    });

    const buildingsByBlock = new Map();
    for (const building of city.buildings) {
      if (!changedBlocks.has(building.blockId)) continue;
      if (!buildingsByBlock.has(building.blockId)) buildingsByBlock.set(building.blockId, []);
      buildingsByBlock.get(building.blockId).push(building);
    }
    for (const building of city.buildings) {
      if (!changedBlocks.has(building.blockId)) continue;
      const intersectsBuilding = (start, end) => buildingsByBlock.get(building.blockId).some(other =>
        other.footprint.some((point, index) => segmentCuts(start, end, point,
          other.footprint[(index + 1) % other.footprint.length]).some(t => t > 1e-6)));
      if (replacements.has(building.propertyId)) {
        if (intersectsBuilding(...building.accessPath))
          unresolved.push(c2Issue('building', building.id, 'access-reflow-blocked',
            'The adapted entrance path intersects another footprint.'));
        continue;
      }
      const provenance = classifyRoadProvenance(building);
      if (!roadIds.has(building.frontageRoadId)) {
        record('building', building.id, 'preserved', [], provenance);
        continue;
      }
      const road = graph.roadsById.get(building.frontageRoadId);
      const a = graph.nodesById.get(road.a), b = graph.nodesById.get(road.b);
      const old = building.accessPath?.at(-1);
      if (old && distanceToSegment(old, a, b) <= 1e-5) {
        record('building', building.id, 'preserved', [], provenance);
        continue;
      }
      if (provenance !== 'generated' || building.accessPath?.length !== 2 || !building.entrance) {
        unresolved.push(c2Issue('building', building.id, 'access-decision-required',
          'A custom or unknown access path needs a decision before reconnection.'));
        continue;
      }
      const { x, y } = building.entrance;
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy);
      if (t <= 0 || t >= 1) {
        unresolved.push(c2Issue('building', building.id, 'access-reflow-blocked',
          'The fixed entrance no longer projects onto its frontage street.'));
        continue;
      }
      const end = { x: a.x + t * dx, y: a.y + t * dy };
      const start = building.accessPath[0];
      if (intersectsBuilding(start, end)) {
        unresolved.push(c2Issue('building', building.id, 'access-reflow-blocked',
          'The proposed entrance path intersects a fixed building.'));
        continue;
      }
      building.accessPath = [start, end];
      stampRoadGenerated(building);
      record('building', building.id, 'access-reconnected', ['accessPath'], provenance);
    }
    if (unresolved.length) return blocked(unresolved);
    const occupied = new Map();
    for (const property of affected)
      occupied.set(property.blockId, (occupied.get(property.blockId) ?? 0) + property.area);
    for (const space of city.openSpaces) {
      if (!changedBlocks.has(space.blockId)) continue;
      const area = Math.max(0, blocks.get(space.blockId).area - (occupied.get(space.blockId) ?? 0));
      const modified = Math.abs(space.area - area) > 1e-8;
      if (modified) space.area = area;
      record('open-space', space.id, modified ? 'recalculated' : 'preserved', modified ? ['area'] : []);
    }
    const { emit, items } = riReporter();
    const context = { roadIds: draft.changedRoadIds, junctionIds, changedBlockIds: [...changedBlocks.keys()], acceptedValid: true };
    const spend = riBudget();
    inspectRoadDependencies(city, city, context, emit, spend);
    inspectRoadContextReferences(accepted, city, context, emit, spend);
    // The full validator checks plot containment with the same shared-edge
    // tolerance used by generation and parcel subdivision.
    const remaining = items().filter(row => row.severity !== 'info' && row.code !== 'frontage-geometry' &&
      !(row.kind === 'plot' && row.code === 'property-containment'));
    if (remaining.length) return blocked(remaining);

    // Clone project metadata, with the already detached city in its original key position.
    const candidateProject = { ...structuredClone({ ...project, city: null }), city };
    validateStoredProject(candidateProject);
    validation.parcels = 'pass';
    validation.project = 'valid';
    return { phase, status: 'candidate-only', candidateProject, changed, ledger, unresolved: [], validation };
  } catch (error) {
    return fail('candidate-validation', 'The reflow cannot be accepted: ' + error.message);
  }
}
