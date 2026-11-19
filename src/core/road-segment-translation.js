import { buildRoadGraph } from './road-graph.js';
import { extractRoadFaces, matchExistingFaces } from './road-faces.js';
import { insideOrOn } from './boundary.js';
import { validateStoredProject } from '../data/project-validation.js';
import { copyJson, createProjectDocument, decodeProjectDocument, encodeProjectDocument, defaultWorkspace } from '../data/project-format.js';
import { warpPropertyFrontageB2 } from './parcel-reconciliation.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I, propertyLocalBounds3I } from './property-geometry.js';

// C1-A: Pure detached two-endpoint translation candidate. There are no Apply,
// persistence, event or history hooks here. C1's later UI/Apply checkpoint must
// independently re-evaluate the candidate and audit its allowed complete delta.
const C1_TRANSLATION_LIMIT = 6;
const c1Order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const c1Same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function c1Freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) c1Freeze(child);
    Object.freeze(value);
  }
  return value;
}
function c1Rejected(code, message, ids = [], stage = 'input', status = 'blocked') {
  return c1Freeze({
    phase: 'C1-A', operation: 'translate-road-segment', status,
    applyReady: false, candidateProject: null, changed: [],
    issues: [{code, message, severity: status === 'needs-review' ? 'needs-review' : 'invalid',
      relatedIds: [...new Set(ids)].sort(c1Order)}],
    validation: {graph: stage === 'graph' ? 'failed' : 'not-run',
      faces: stage === 'faces' ? 'failed' : 'not-run',
      identity: stage === 'identity' ? 'failed' : 'not-run',
      project: 'not-run', roundTrip: 'not-run'},
  });
}
const c1Point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && Math.abs(p.x) <= 100000 && Math.abs(p.y) <= 100000;

export function prepareSegmentTranslationC1(project, roadId, offset, workspace = null) {
  if (!project?.city || !Array.isArray(project.city.nodes) || !Array.isArray(project.city.roads))
    return c1Rejected('unsupported-project', 'An accepted city project is required.');
  if (typeof roadId !== 'string' || !roadId.length || !c1Point(offset))
    return c1Rejected('invalid-intent', 'Choose a road and enter finite X/Y displacement.');
  const distance = Math.hypot(offset.x, offset.y);
  if (!distance)
    return c1Rejected('no-change', 'A segment translation must move both endpoints.');
  if (distance > C1_TRANSLATION_LIMIT)
    return c1Rejected('translation-limit', 'Move exceeds the conservative C1 displacement limit.', [roadId]);

  try {
    const old = project.city;
    const accepted = buildRoadGraph(old);
    if (!accepted.valid)
      return c1Rejected('invalid-accepted-network', 'The existing road network is invalid.', [], 'graph');
    const road = accepted.roadsById.get(roadId);
    if (!road)
      return c1Rejected('road-not-found', 'The selected road ID does not exist.', [roadId]);
    const ends = [road.a, road.b];
    if (ends[0] === ends[1])
      return c1Rejected('duplicate-endpoint', 'The road must have two distinct junctions.', ends);
    const incident = [...new Set(ends.flatMap(id => accepted.incidentRoads.get(id) ?? []))].sort(c1Order);
    if (incident.some(id => accepted.roadClasses.get(id)?.protected))
      return c1Rejected('protected-endpoint', 'Both endpoints must be free of protected roads.', [roadId, ...incident]);
    const next = new Map(ends.map(id => {
      const node = accepted.nodesById.get(id);
      return [id, {x: node.x + offset.x, y: node.y + offset.y}];
    }));
    if ([...next.values()].some(p => !c1Point(p) ||
       (Array.isArray(old.survey?.boundary) && !insideOrOn(p, old.survey.boundary))))
      return c1Rejected('boundary-escape', 'Both translated junctions must remain inside the city boundary.', ends);

    const candidate = copyJson(project);
    candidate.city.nodes = candidate.city.nodes.map(node => next.has(node.id)
      ? {...node, ...next.get(node.id)} : node);
    const graph = buildRoadGraph(candidate.city);
    if (!graph.valid)
      return c1Rejected(graph.issues[0]?.code ?? 'invalid-road-graph',
        graph.issues[0]?.message ?? 'Translated roads break the accepted topology.',
        [roadId, ...ends], 'graph');
    const faces = extractRoadFaces(graph, candidate.city);
    if (!faces.valid)
      return c1Rejected(faces.issues[0]?.code ?? 'invalid-faces',
        'The translated segment fails face coverage validation.', [roadId, ...ends], 'faces');
    const identity = matchExistingFaces(old, faces);
    if (!identity.valid || identity.requiresReview || identity.issues.length ||
        identity.added.length || identity.removed.length ||
        identity.split.length || identity.merged.length || identity.ambiguous.length ||
        identity.preserved.length + identity.changed.length !== faces.faces.length)
      return c1Rejected(identity.issues[0]?.code ?? 'ambiguous-face-identity',
        'At least one road face cannot retain its accepted identity.', [roadId, ...ends],
        'identity', 'needs-review');

    const blocks = new Map(identity.changed.filter(row => row.kind === 'block')
      .map(row => [row.id, row.record]));
    // Reconcile only supported frontage-attached four-corner parcels. The
    // same conservative B2 geometry helper supports both endpoints changing
    // at once; only fully project-valid results can be returned.
    candidate.city.blocks = candidate.city.blocks.map(block => blocks.has(block.id)
      ? copyJson(blocks.get(block.id)) : block);
    const oldNodes = new Map(old.nodes.map(node => [node.id,node]));
    const newNodes = new Map(candidate.city.nodes.map(node => [node.id,node]));
    const roads = new Map(old.roads.map(road => [road.id,road]));
    const properties = new Map(candidate.city.properties.map(p => [p.id,p]));
    const plots = new Map(candidate.city.plots.map(p => [p.id,p]));
    const touchedProperties = new Set();
    const touchedPlots = new Set();
    // A modified block does not automatically mean every parcel in it needs
    // a new boundary. Only the frontages whose actual road geometry moved
    // require the B2 warp. All other parcels remain untouched, and the full
    // project validator independently checks their block containment, street
    // setbacks and relationship safety against the new neighborhood.
    // This removes the false "unmapped-frontage" rejection for parcels that
    // can remain safely where they already are.
    const impactedProperties = old.properties.filter(p =>
      incident.includes(p.frontageRoadId));
    if (impactedProperties.length > 256)
      return c1Rejected('parcel-work-limit','Too many frontage parcels depend on this segment.',[roadId],
        'project','needs-review');
    for (const source of impactedProperties) {
      const property = properties.get(source.id);
      const frontRoad = roads.get(source.frontageRoadId);
      if (!property || !frontRoad)
        return c1Rejected('missing-frontage','A dependent parcel has no matching frontage record.',
          [source.id], 'project','needs-review');
      try {
        const fractions = propertyDividerFractions3I(candidate.city,property);
        const warped = warpPropertyFrontageB2(source,frontRoad,oldNodes,newNodes);
        const proposed = propertyGeometryPreview3I(candidate.city,property.id,
          warped.boundary,fractions);
        if (proposed.area <= 1 || Math.abs(proposed.area-proposed.total) > .02)
          throw new Error('Frontage and plot area totals disagree.');
        Object.assign(property,{
          boundary: copyJson(proposed.boundary),
          frontage: copyJson(proposed.boundary.slice(0,2)),
          frame: copyJson(warped.frame),
          area: proposed.area,
          local: propertyLocalBounds3I({...property,frame:warped.frame},proposed.boundary),
        });
        touchedProperties.add(property.id);
        for (const update of proposed.plots) {
          const plot=plots.get(update.id);
          if (!plot || plot.propertyId!==property.id || plot.blockId!==property.blockId)
            throw new Error('Plot relationships changed during adaptation.');
          plot.boundary=copyJson(update.boundary);
          touchedPlots.add(plot.id);
        }
      } catch(error) {
        return c1Rejected('unsupported-property-geometry',
          'Segment adaptation cannot preserve property '+source.id+': '+error.message,
          [source.id,source.frontageRoadId], 'project','needs-review');
      }
    }
    const changedOpen = [];
    for (const open of candidate.city.openSpaces ?? []) {
      const block = blocks.get(open.blockId);
      if (!block) continue;
      const occupied=candidate.city.properties.filter(p=>p.blockId===block.id)
        .reduce((n,p)=>n+p.area,0);
      const newArea=block.area-occupied;
      if (!Number.isFinite(newArea) || newArea < -.02)
        return c1Rejected('open-space-ownership',
          'The segment would leave invalid vacant area in block '+block.id+'.',
          [open.id,block.id], 'project','needs-review');
      const area=Math.max(0,newArea);
      if (Math.abs(open.area-area)>1e-8){
        open.area=area;
        changedOpen.push(open.id);
      }
    }
    validateStoredProject(candidate);
    const portable = decodeProjectDocument(encodeProjectDocument(
      createProjectDocument(candidate, workspace ?? defaultWorkspace(project))));
    if (!c1Same(portable.project, candidate))
      throw new Error('Portable project round-trip changed the segment candidate.');
    if (workspace && !c1Same(portable.workspace, workspace))
      throw new Error('Portable workspace round-trip changed fields.');

    const changed = [
      ...ends.map(id => ({kind:'junction', id, fields:['x','y'].filter(axis => offset[axis] !== 0)})),
      ...incident.map(id => ({kind:'road', id, fields:['effective-geometry']})),
      ...[...blocks.keys()].sort(c1Order).map(id =>
        ({kind:'block', id, fields:['area','boundary-geometry']})),
      ...[...touchedProperties].sort(c1Order).map(id => ({kind:'property',id,
        fields:['boundary','frontage','frame','local','area']})),
      ...[...touchedPlots].sort(c1Order).map(id => ({kind:'plot',id,fields:['boundary']})),
      ...changedOpen.map(id => ({kind:'open-space',id,fields:['area']})),
    ];
    return c1Freeze({
      phase:'C1-A', operation:'translate-road-segment', status:'candidate-only',
      applyReady:false, roadId, endpoints: [...ends], offset:copyJson(offset),
      candidateProject:portable.project,
      changed, issues:[],validation:{graph:'pass',faces:'pass',identity:'pass',
        project:'valid',roundTrip:'pass'},
    });
  } catch (error) {
    return c1Rejected('segment-validation', 'C1 segment preview unavailable: ' + error.message,
      [roadId], 'project');
  }
}

const C1_FIELDS = Object.freeze({
  nodes:['x','y'], blocks:['area'],
  properties:['boundary','frontage','frame','local','area'],
  plots:['boundary'], openSpaces:['area']
});
function c1Canonical(value) {
  if (Array.isArray(value)) return value.map(c1Canonical);
  if (value && typeof value==='object') return Object.fromEntries(
    Object.keys(value).sort(c1Order).map(key=>[key,c1Canonical(value[key])]));
  return value;
}
const c1Equal=(a,b)=>JSON.stringify(c1Canonical(a))===JSON.stringify(c1Canonical(b));

// Audit exact accepted-state changes separately from topology checks. All
// fields outside the narrow geometry whitelist, including building/road IDs,
// metadata and unknown extensions, must survive without any alteration.
export function verifySegmentDeltaC1(before, after, roadId, offset) {
  if(!before?.city||!after?.city)throw new Error('Complete accepted/candidate projects required.');
  const road=before.city.roads.find(r=>r.id===roadId);
  if(!road||road.a===road.b||!c1Point(offset)||!Math.hypot(offset.x,offset.y))
    throw new Error('Missing or invalid segment translation intent.');
  const endpoints=new Set([road.a,road.b]);
  const expected=copyJson(before);
  for(const [kind,fields] of Object.entries(C1_FIELDS)){
    const original=before.city[kind]??[],proposed=after.city[kind]??[];
    if(original.length!==proposed.length)
      throw new Error('Membership changed for '+kind+'.');
    for(let i=0;i<original.length;i++){
      const a=original[i],b=proposed[i],out=expected.city[kind][i];
      if(a.id!==b.id)throw new Error('Record identity changed in '+kind+'.');
      for(const field of fields){
        if(!c1Equal(a[field],b[field])){
          if(kind==='nodes'&&!endpoints.has(a.id))
            throw new Error('An unrelated junction moved.');
          if(b[field]===undefined)
            throw new Error('A geometry field was removed.');
          out[field]=copyJson(b[field]);
        }
      }
    }
  }
  for(const id of endpoints){
    const source=before.city.nodes.find(n=>n.id===id);
    const target=after.city.nodes.find(n=>n.id===id);
    if(!source||!target || Math.abs(target.x-source.x-offset.x)>1e-7 ||
      Math.abs(target.y-source.y-offset.y)>1e-7)
      throw new Error('Segment endpoints do not share the approved translation.');
  }
  if(!c1Equal(expected,after))
    throw new Error('Unsupported project fields changed during the road translation.');
  return true;
}
