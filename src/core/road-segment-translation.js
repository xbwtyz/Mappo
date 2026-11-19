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
    const impactedProperties = old.properties.filter(p =>
      incident.includes(p.frontageRoadId) || blocks.has(p.blockId));
    if (impactedProperties.length > 256)
      return c1Rejected('parcel-work-limit','Too many parcels depend on this segment.',[roadId],
        'project','needs-review');
    for (const source of impactedProperties) {
      if (!incident.includes(source.frontageRoadId))
        return c1Rejected('unmapped-frontage','A dependent parcel has an unchanged frontage road.',
          [source.id], 'project','needs-review');
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
