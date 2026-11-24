import { buildingExteriorRingsS10 } from './building-geometry-adapter-s10.js';
import { prepareRoadTopologyReflowC3 } from './road-topology-reflow.js';
import { roadBuildingOccupiedPlots } from './road-building-decisions.js';
import { resolveBuildingAccess } from '../editor/building-application.js';
import { reflowGeneratedRoadBuildings } from './road-building-reflow.js';
import { prepareJunctionIntentC7, prepareRoadIntentC1, iterateRoadGroupIntentB1, readRoadGroupTopologyB1 } from './road-intent-c1.js';
import { buildRoadGraph } from './road-graph.js';
import { extractRoadFaces, matchExistingFaces } from './road-faces.js';
import { analyzeRoadImpact, iterateRoadGroupImpactB1 } from './road-impact.js';
import { iterateRoadDependencies, inspectRoadContextReferences } from './road-impact-dependencies.js';
import { riBudget, riEqual, riIndex, riReporter } from './road-impact-model.js';
import { classifyRoadProvenance, stampRoadGenerated } from './road-provenance.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from './property-geometry.js';
import { reshapeRoadParcelPolygon } from './road-parcel-shape-reflow.js';
import { PROPERTY_SETBACK, STREET_EDGE_WIDTH, STREET_WIDTHS, propertyFits, rectangleInFrame } from './placement.js';
import { distanceToSegment, segmentCuts } from './boundary.js';
import { iterateStoredProjectValidation } from '../data/project-validation.js';
import { hydrateCityS10 } from './building-project-s10.js';
import { iterateLareRoadGroup } from './reconciliation-road-group.js';
import { createLareRoadOperation } from './reconciliation-operation.js';
import { iterateLareStrategies } from './reconciliation-strategies.js';
import { describeLareRefusal } from './reconciliation-diagnostics.js';
import { cloneLareCity } from './reconciliation-city.js';
import { finishLareSteps } from './reconciliation-steps.js';
import { createLareBudget } from './reconciliation-budget.js';

// A road intent is frozen for cancellation safety and loses non-serialized
// read-only building projections during structuredClone. Rehydrate a detached
// candidate, never the frozen accepted or intent objects.
function c2HydrateDraftS10(draft) {
  if (!draft?.proposedCity?.buildings?.some(b=>b?.geometry &&
      !Object.getOwnPropertyDescriptor(b,'footprint')?.get)) return draft;
  return {...draft,proposedCity:hydrateCityS10(structuredClone(draft.proposedCity))};
}
const C2_PARCEL_LIMIT = 256;
const c2CourtyardReshapeLabel = 'Reshape property and reconnect courtyard access';
const rebuildableLandIssues = new Set([
  'road-clearance', 'road-setback', 'block-containment', 'parcel-reflow-blocked',
  'access-reflow-blocked', 'access-decision-required', 'candidate-validation',
]);
const c2LandIssues = new Set(['frontage-geometry', 'block-containment', 'road-setback', 'frame-reference']);
const c2Issue = (kind, id, code, message) => ({ kind, id, code, message, severity: 'needs-review' });
const c2Margin = road => (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK;

function c2Parcel(city, property, road, edges, fixed) {
  const edge = edges?.find(e => e.road?.id === road?.id);
  if (!road || !edge)
    throw new Error('The assigned frontage road no longer bounds this parcel’s own block.');
  const ownPlots=property.plotIds.map(id=>city.plots.find(plot=>plot.id===id&&plot.propertyId===property.id));
  if(ownPlots.some(plot=>!plot))throw Error('The parcel’s existing plot records are incomplete.');
  let legacy=false;
  if(property.boundary.length===4 && ownPlots.every(plot=>plot.boundary.length===4)){
    try {
      const ratios=propertyDividerFractions3I(city,property);
      const reference=propertyGeometryPreview3I(city,property.id,property.boundary,ratios);
      legacy=ownPlots.every((plot,i)=>plot.boundary.every((pt,j)=>
        Math.hypot(pt.x-reference.plots[i].boundary[j].x,pt.y-reference.plots[i].boundary[j].y)<1e-6));
    }catch{/* Flexible plot layouts use the identity-preserving path. */}
  }
  if(!legacy)return reshapeRoadParcelPolygon(property,ownPlots,edge,edges,c2Margin(road)+.05,fixed);
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

function c2CourtyardFrontageUpdates(city, property, buildings, plots) {
  return buildings.map(building => {
    const { route, issue } = resolveBuildingAccess(city, building, building);
    if (!route || route.frontageRoadId !== property.frontageRoadId)
      throw new Error('Cannot reconnect ' + building.id + ' to the moved frontage. ' +
        (issue?.message ?? 'Adjust the road so access can remain on the same street.'));
    const plotIds = roadBuildingOccupiedPlots(building, plots);
    if (!plotIds.length) throw new Error('No reshaped plot covers ' + building.id + '.');
    return { entrance: route.entrance, accessPath: route.accessPath, plotIds };
  });
}

export function prepareNeighborhoodReflowC2(project, roadId, offset, draft = prepareRoadIntentC1(project, roadId, offset)) {
  return prepareNeighborhoodReflow(project, roadId, c2HydrateDraftS10(draft), false);
}

export function prepareNeighborhoodReflowC3(project, roadId, offset,
  draft = prepareRoadIntentC1(project, roadId, offset), decisions = new Map(), options = {}) {
  return reconcileRoadIntent(project,roadId,draft,decisions,options);
}

// Group movement intentionally does not call reconcileRoadIntent, whose
// singleton policy can normalize crossings or reconstruct block topology.
export function* iterateRoadGroupReflowB1(project,selectedRoadIds,offset,options={}) {
  const draft = yield* iterateRoadGroupIntentB1(project, selectedRoadIds, offset);
  const id=draft.selectedRoadIds?.[0]??'group';
  const blocked=(issues,source={})=>({...source,phase:'B1',status:'needs-review',
    candidateProject:null,changed:[],ledger:[],unresolved:issues.map(describeLareRefusal),
    validation:source.validation??{graph:'not-run',faces:'not-run',parcels:'not-run',project:'not-run'},
    parcelReview:source.parcelReview??[],selectedRoadIds:draft.selectedRoadIds??[],
    offset:draft.offset??null});
  if(project?.schemaVersion!==10)
    return blocked([c2Issue('road',id,'group-schema','Group translation requires Schema 10.')]);
  if(!draft.draftable || !draft.topologyResolved || !draft.facesResolved ||
    draft.status==='unchanged' || draft.issues.some(issue=>issue.code==='boundary-escape')) {
    const issues=draft.issues.filter(issue=>issue.code!=='neighborhood-reflow-pending')
      .map(issue=>({...c2Issue('road',id,issue.code,issue.message),
        relatedIds:issue.roadIds??[]}));
    return blocked(issues.length?issues:[c2Issue('road',id,'group-topology','A nonzero move with unchanged road and face topology is required.')]);
  }
  const { graph, faces, identity } = readRoadGroupTopologyB1(project, draft);
  const impact = yield* iterateRoadGroupImpactB1(project, draft);
  const analysis = { graph, faces, identity, impact };
  const analyze = () => analysis;
  const strictOptions = { ...options, strictGroup: true };
  const choices = options.parcelChoices instanceof Map ? options.parcelChoices : new Map(options.parcelChoices ?? []);
  const operation = createLareRoadOperation(project, draft, analysis, choices, options.acceptedRevision, options.strategy);
  const operationChoices = new Map(operation.permissions.parcelChoices);
  strictOptions.parcelChoices = operationChoices;
  const checked = result => result.candidateProject ? result : blocked(result.unresolved, result);
  const parent = createLareBudget(operation.limits.total, {
    ceiling: operation.limits.total,
    parent: options.sharedBudget ?? null,
  });
  const adaptiveStrategy = enhanced => ({
    canRun: previous => !enhanced || options.strategy === 'enhanced-adaptive' || !previous.candidateProject,
    *run(previous) {
      const budget = createLareBudget(operation.limits, { parent });
      const strategy = enhanced ? 'enhanced-adaptive' : 'selective-adaptive';
      const iterator = iterateLareRoadGroup(project, draft, analysis, checked(previous), operationChoices, budget, { enhanced });
      try {
        for (;;) {
          const step = iterator.next();
          const stats = parent.snapshot();
          if (step.done) {
            const adaptive = step.value;
            return { ...adaptive, lare: { ...adaptive.lare, operationStats: stats } };
          }
          yield { ...step.value, strategy, stats };
        }
      } finally {
        iterator.return();
      }
    },
  });
  const result = yield* iterateLareStrategies(operation, {
    direct: {
      canRun: () => true,
      *run() {
        return yield* iterateNeighborhoodReflow(project, id, draft, false, analyze, strictOptions);
      },
    },
    strict: {
      canRun: previous => !previous.candidateProject && previous.unresolved.some(row =>
        rebuildableLandIssues.has(row.code) || row.code === 'parcel-decision-required' || row.code === 'parcel-decision-invalid'),
      *run() {
        return yield* iterateNeighborhoodReflow(project, id, draft, true, analyze, strictOptions);
      },
    },
    'selective-adaptive': adaptiveStrategy(false),
    'enhanced-adaptive': adaptiveStrategy(true),
  });
  const unresolved = result.unresolved.map(describeLareRefusal);
  return { ...result, unresolved, phase: 'B1', selectedRoadIds: draft.selectedRoadIds, offset: draft.offset };
}
export function prepareRoadGroupReflowB1(project,selectedRoadIds,offset,options={}){
  const iterator=iterateRoadGroupReflowB1(project,selectedRoadIds,offset,options);
  for(;;){const step=iterator.next();if(step.done)return step.value;}
}

export function prepareJunctionReflowC7(project,junctionId,point,decisions = new Map(), options = {}) {
  return { ...reconcileRoadIntent(project,junctionId,prepareJunctionIntentC7(project,junctionId,point),decisions,options), applyReady:false };
}

function reconcileRoadIntent(project,roadId,draft,decisions,options = {}) {
  draft=c2HydrateDraftS10(draft);
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
  // A selected local courtyard repair does not authorize a topology replacement.
  if (adapted.parcelReview?.some(row => row.courtyardAccess && row.selected)) return adapted;
  // If a fixed parcel layout cannot be repaired, try filling the same affected
  // blocks again. Topology reflow independently verifies provenance, protects
  // authored work, retains compatible geometry, and validates the whole result.
  if (!adapted.unresolved.length || (adapted.unresolved.some(row => !rebuildableLandIssues.has(row.code)) &&
      !adapted.unresolved.some(row=>row.code==='parcel-decision-required' || row.code==='parcel-decision-invalid')))
    return adapted;
  // Prefer preserving an authored property in its existing block through the
  // local C2 shape solver before offering more disruptive topology replacement.
  if(adapted.unresolved.some(row=>row.code==='parcel-decision-required') &&
     adapted.parcelReview?.some(row=>row.options?.length))return adapted;
  const rebuilt = prepareRoadTopologyReflowC3(project, roadId, draft,null,decisions,options);
  if(!rebuilt.candidateProject && rebuilt.unresolved.some(row=>row.code==='parcel-decision-required') &&
     !rebuilt.parcelReview?.some(row=>row.options.length)) {
    if(adapted.parcelReview?.some(row=>row.options.length))return adapted;
    if(preserved.parcelReview?.some(row=>row.options.length))return preserved;
  }
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

function prepareNeighborhoodReflow(...args) {
  return finishLareSteps(iterateNeighborhoodReflow(...args));
}

function* iterateNeighborhoodReflow(project, roadId, draft, adaptBuildings,
  analyze = () => analyzeNeighborhoodDraft(project, draft), options = {}) {
  const changed = [], ledger = [], parcelReview=[];
  const parcelChoices = options.parcelChoices instanceof Map ? options.parcelChoices
    : new Map(options.parcelChoices ?? []);
  const phase = adaptBuildings ? 'C3' : 'C2';
  const validation = { graph: 'not-run', faces: 'not-run', parcels: 'not-run', project: 'not-run' };
  const blocked = unresolved => ({
    phase, status: 'needs-review', candidateProject: null, changed: [], ledger, unresolved, validation,parcelReview,
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
    const replacements = new Map(), courtyardRepairs = new Map();
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

    yield { stage: 'strict-candidate-materialization' };
    const city = yield* cloneLareCity(draft.proposedCity, structuredClone);
    const plots = riIndex(city.plots), buildings = riIndex(city.buildings);
    const reservedIds = new Set(buildings.keys());
    const affected = city.properties.filter(p => changedBlocks.has(p.blockId));
    const affectedIds=new Set(affected.map(p=>p.id));
    for(const id of parcelChoices.keys())
      if(!affectedIds.has(id))
        unresolved.push(c2Issue('property',id,'parcel-decision-invalid',
          'The selected property is not affected by this road draft. Clear the stale choice.'));
    if(unresolved.length)return blocked(unresolved);

    function record(kind, id, disposition, fields, provenance = 'derived') {
      ledger.push({ kind, oldId: id, newId: id, disposition, provenance });
      if (fields.length) changed.push({ kind, id, fields });
    }
    function archiveParcelChoice028(propertyId,kind) {
      const history=city.roadParcelDecisionHistory028??[];
      if(!Array.isArray(history)||history.length>=24)
        throw Error('The authored parcel decision archive cannot preserve another original record.');
      const original=accepted.properties.find(p=>p.id===propertyId);
      if(!original)throw Error('The original authored property no longer exists.');
      const source={property:structuredClone(original),
        plots:original.plotIds.map(id=>structuredClone(accepted.plots.find(p=>p.id===id))),
        buildings:original.buildingIds.map(id=>structuredClone(accepted.buildings.find(b=>b.id===id)))};
      if([...source.plots,...source.buildings].some(x=>!x))
        throw Error('The original parcel dependency snapshot is incomplete.');
      history.push({kind,sourceId:propertyId,targetId:null,source});
      city.roadParcelDecisionHistory028=history;
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
      yield { stage: 'strict-parcel', id: property.id };
      const ownPlots = property.plotIds.map(id => plots.get(id));
      const provenance = classifyRoadProvenance(property, ownPlots);
      const changedFrontage = roadIds.has(property.frontageRoadId);
      if (!changedFrontage && !parcelIssues.has(property.id) && !displacedParcels.has(property.id)) {
        record('property', property.id, 'preserved', [], provenance);
        for (const plot of ownPlots) record('plot', plot.id, 'preserved', [], provenance);
        continue;
      }
      const choice = parcelChoices.get(property.id);
      const ownBuildings = property.buildingIds.map(id => buildings.get(id));
      const courtyardIds = new Set();
      if (changedFrontage) for (const host of ownBuildings) {
        const occupants = host.geometry?.courtyardAccess?.occupants;
        if (!occupants?.length) continue;
        courtyardIds.add(host.id);
        for (const {buildingId} of occupants) courtyardIds.add(buildingId);
      }
      const courtyardBuildings = ownBuildings.filter(building => courtyardIds.has(building.id) &&
        building.frontageRoadId === property.frontageRoadId);
      const repairCourtyard = courtyardIds.size > 0 && courtyardBuildings.length === courtyardIds.size;
      if (provenance !== 'generated' && !choice) {
        const road=graph.roadsById.get(property.frontageRoadId);
        const edges=blockEdges.get(property.blockId);
        const options=[];
        let repairFailure;
        if(road && edges?.length && edges.some(row=>row.road?.id===road.id)){
          if(propertyFits(property.boundary,edges.map(row=>row.a),edges))
            options.push({kind:'keep',targetId:null,label:'Keep existing property footprint'});
          try{
            // This is an eligibility preflight, never an Apply authorization.
            const next = c2Parcel(city,property,road,edges,ownBuildings.flatMap(b=>buildingExteriorRingsS10(b).flat()));
            if (repairCourtyard) {
              const local = {...city, properties: city.properties.map(row =>
                row.id === property.id ? next.property : row)};
              c2CourtyardFrontageUpdates(local, next.property, courtyardBuildings, next.plots);
            }
            options.push({kind:'reshape',targetId:null,label:repairCourtyard
              ? c2CourtyardReshapeLabel : 'Reshape property around fixed buildings'});
          } catch (error) {
            if (repairCourtyard) repairFailure = error.message;
          }
        }
        parcelReview.push({id:property.id,provenance,options,selected:null});
        const code = repairFailure && !options.length ? 'courtyard-frontage-blocked' : 'parcel-decision-required';
        unresolved.push(c2Issue('property', property.id, code,
          repairFailure ?? 'This parcel has custom or unknown provenance. Choose a compatible preservation option.'));
        continue;
      }
      if (choice && (provenance === 'generated' || !['keep','reshape'].includes(choice.kind) ||
           (choice.targetId != null || Object.keys(choice).some(key=>!['kind','targetId'].includes(key))))) {
        unresolved.push(c2Issue('property', property.id, 'parcel-decision-invalid',
          'This parcel decision is invalid for the current road edit.'));
        continue;
      }
      if (choice?.kind === 'keep') {
        archiveParcelChoice028(property.id,'keep');
        record('property',property.id,'authorized-keep',[],provenance);
        for (const plot of ownPlots) record('plot',plot.id,'preserved',[],provenance);
        continue; // Full-project validation determines whether this is safe.
      }
      const road = graph.roadsById.get(property.frontageRoadId);
      const authorizedCourtyardRepair = repairCourtyard && choice?.kind === 'reshape';
      if (authorizedCourtyardRepair) parcelReview.push({id:property.id, provenance, selected:choice, courtyardAccess:true,
        options:[{kind:'reshape',targetId:null,label:c2CourtyardReshapeLabel}]});
      try {
        const mayAdapt = adaptBuildings && ownBuildings.length &&
          (!options.strictGroup||provenance==='generated') &&
          ownBuildings.every(building => classifyRoadProvenance(building) === 'generated');
        const edges = blockEdges.get(property.blockId);
        let next;
        let adapt = displacedParcels.has(property.id);
        if (!adapt) {
          try {
            next = c2Parcel(city, property, road, edges, ownBuildings.flatMap(building => buildingExteriorRingsS10(building).flat()));
          } catch (error) {
            if (!mayAdapt) throw error;
            adapt = true;
          }
        }
        if (adapt) {
          if (authorizedCourtyardRepair) throw new Error('The courtyard buildings cannot stay fixed at this road position.');
          if (!mayAdapt) throw new Error('A custom or unknown building needs a decision before it can move.');
          next = c2Parcel(city, property, road, edges, []);
          const proposedPlots = ownPlots.map((plot, i) => ({ ...plot, boundary: next.plots[i].boundary }));
          const result = reflowGeneratedRoadBuildings(project.seed, property, next.property, proposedPlots,
            ownBuildings, reservedIds, project.schemaVersion===10,!options.strictGroup);
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
        if((next.flexible||options.strictGroup) && !adapt){
          for(const building of ownBuildings){
            const occupied=roadBuildingOccupiedPlots(building,ownPlots);
            if(!occupied.length)throw Error('No preserved plot covers '+building.id+'.');
            if(!riEqual(building.plotIds,occupied)){
              const source=classifyRoadProvenance(building);
              building.plotIds=occupied;
              if(source==='generated')stampRoadGenerated(building);
              record('building',building.id,'plot-occupancy-updated',['plotIds'],source);
            }
          }
        }
        if (provenance === 'generated') stampRoadGenerated(property, ownPlots);
        else if(choice) {
          archiveParcelChoice028(property.id,'reshape');
          if (authorizedCourtyardRepair && !adapt)
            courtyardRepairs.set(property.id, { property, courtyardBuildings, ownPlots });
        }
        record('property', property.id, choice ? 'authorized-reshape' : 'reshaped', ['boundary', 'frontage', 'frame', 'local', 'area'], provenance);
      } catch (error) {
        unresolved.push(c2Issue('property', property.id, authorizedCourtyardRepair
          ? 'courtyard-frontage-blocked' : 'parcel-reflow-blocked', error.message));
      }
    }
    const inserted = new Set();
    city.buildings = city.buildings.flatMap(building => {
      if (!replacements.has(building.propertyId)) return [building];
      if (inserted.has(building.propertyId)) return [];
      inserted.add(building.propertyId);
      return replacements.get(building.propertyId);
    });

    const repairedAccess = new Set();
    for (const { property, courtyardBuildings, ownPlots } of courtyardRepairs.values()) {
      yield { stage: 'strict-courtyard-access', id: property.id };
      try {
        const updates = c2CourtyardFrontageUpdates(city, property, courtyardBuildings, ownPlots);
        courtyardBuildings.forEach((building, index) => {
          const update = updates[index];
          const fields = Object.keys(update).filter(key => !riEqual(building[key], update[key]));
          const provenance = classifyRoadProvenance(building);
          Object.assign(building, update);
          repairedAccess.add(building.id);
          record('building', building.id, fields.length ? 'access-reconnected' : 'preserved', fields, provenance);
        });
      } catch (error) {
        return blocked([c2Issue('property', property.id, 'courtyard-frontage-blocked', error.message)]);
      }
    }

    const buildingsByBlock = new Map();
    for (const building of city.buildings) {
      if (!changedBlocks.has(building.blockId)) continue;
      if (!buildingsByBlock.has(building.blockId)) buildingsByBlock.set(building.blockId, []);
      buildingsByBlock.get(building.blockId).push(building);
    }
    for (const building of city.buildings) {
      yield { stage: 'strict-building-access', id: building.id };
      if (!changedBlocks.has(building.blockId) || repairedAccess.has(building.id)) continue;
      const intersectsBuilding = (start, end) => buildingsByBlock.get(building.blockId).some(other =>
        buildingExteriorRingsS10(other).some(ring => ring.some((point, index) =>
          segmentCuts(start, end, point, ring[(index + 1) % ring.length]).some(t => t > 1e-6))));
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
    yield* iterateRoadDependencies(city, city, context, emit, spend, accepted);
    inspectRoadContextReferences(accepted, city, context, emit, spend);
    // The full validator checks plot containment with the same shared-edge
    // tolerance used by generation and parcel subdivision.
    const remaining = items().filter(row => row.severity !== 'info' && row.code !== 'frontage-geometry' &&
      !(row.kind === 'plot' && row.code === 'property-containment'));
    if (remaining.length) return blocked(remaining);

    // Clone project metadata, with the already detached city in its original key position.
    const candidateProject = { ...structuredClone({ ...project, city: null }), city };
    yield* iterateStoredProjectValidation(candidateProject);
    validation.parcels = 'pass';
    validation.project = 'valid';
    return { phase, status: 'candidate-only', candidateProject, changed, ledger, unresolved: [], validation,parcelReview };
  } catch (error) {
    return fail('candidate-validation', 'The reflow cannot be accepted: ' + error.message);
  }
}
