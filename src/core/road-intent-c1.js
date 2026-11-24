import { buildRoadGraph, iterateRoadGraph } from './road-graph.js';
import { iterateRoadFaces, iterateRoadFaceIdentity } from './road-faces.js';
import { insideOrOn } from './boundary.js';
import { proposeRoadGroupNodesB1 } from './road-group-b1.js';

// C1 road-first intent is a *draft*, not an accepted city transaction.
// Existing parcels never veto the placement of an ordinary road in preview.
// Reconciliation and Apply of complex edits require the later C2–C5 engine.
// Preserve IEEE -0 and unknown JSON-extension fields byte-semantically during
// preview cloning; JSON stringify/parse would turn -0 into 0.
const c1IntentCopy = value =>
  Array.isArray(value) ? value.map(c1IntentCopy) :
  value && typeof value==='object'
    ? Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,c1IntentCopy(entry)]))
    : value;
const c1IntentFinite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && Math.abs(p.x) <= 100000 && Math.abs(p.y) <= 100000;
const c1IntentFreeze = value => {
  if(value && typeof value==='object' && !Object.isFrozen(value)){
    Object.values(value).forEach(c1IntentFreeze);Object.freeze(value);
  }
  return value;
};
function c1IntentRefused(code,message){
  return c1IntentFreeze({phase:'C1',operation:'draft-road-translation',draftable:false,
    applyReady:false,status:'blocked',issues:[{code,message}],project:null,
    proposedCity:null,proposedNodes:[],changedRoadIds:[]});
}
export function prepareRoadIntentC1(project,roadId,offset){
  if(!project?.city || !Array.isArray(project.city.nodes) || !Array.isArray(project.city.roads))
    return c1IntentRefused('missing-city','An accepted city is required to preview a road.');
  if(typeof roadId!=='string' || !c1IntentFinite(offset))
    return c1IntentRefused('invalid-offset','Enter finite road X/Y offsets within the supported coordinate range.');
  const accepted=buildRoadGraph(project.city);
  if(!accepted.valid)return c1IntentRefused('invalid-base-road-graph',
    'The accepted road graph must be valid before a road-first edit.');
  const road=accepted.roadsById.get(roadId);
  if(!road)return c1IntentRefused('road-not-found','Choose an existing ordinary road segment.');
  const endpoints=new Set([road.a,road.b]);
  const proposedNodes=[...endpoints].map(id=>{
    const node=accepted.nodesById.get(id);
    return {id,x:node.x+offset.x,y:node.y+offset.y};
  });
  return finishRoadIntent(project,accepted,proposedNodes,'draft-road-translation',{roadId,offset:c1IntentCopy(offset)});
}
// The same detached graph/face intent used by the singleton editor, with a
// canonical group membership and no implied acceptance or topology rewrite.
export function prepareRoadGroupIntentB1(project, selectedRoadIds, offset) {
  const iterator = iterateRoadGroupIntentB1(project, selectedRoadIds, offset);
  for (let step = iterator.next(); ; step = iterator.next()) {
    if (step.done) return step.value;
  }
}

export function* iterateRoadGroupIntentB1(project,selectedRoadIds,offset,captureTopology) {
  yield { stage: 'accepted-road-graph' };
  const graph=yield* iterateRoadGraph(project?.city);
  const proposal=proposeRoadGroupNodesB1(graph,selectedRoadIds,offset);
  if(!proposal.draftable) {
    const issue=proposal.issues[0];
    return c1IntentFreeze({...c1IntentRefused(issue.code,issue.message),
      operation:'draft-road-group-translation',group:proposal.group,
      selectedRoadIds:proposal.group.selectedRoadIds,issues:proposal.issues});
  }
  return yield* iterateRoadIntent(project,graph,proposal.proposedNodes,
    'draft-road-group-translation',{group:proposal.group,
      selectedRoadIds:proposal.group.selectedRoadIds,offset:proposal.offset},captureTopology);
}

export function prepareJunctionIntentC7(project,junctionId,point) {
  const accepted=buildRoadGraph(project?.city);
  if (!accepted.valid) return c1IntentRefused('invalid-base-road-graph','A valid city is required to move a junction.');
  if (!accepted.nodesById.has(junctionId)) return c1IntentRefused('junction-not-found','Choose an existing ordinary junction.');
  return finishRoadIntent(project,accepted,[{id:junctionId,x:point?.x,y:point?.y}],
    'draft-junction-move',{junctionId});
}
function finishRoadIntent(...args) {
  const iterator = iterateRoadIntent(...args);
  for (let step = iterator.next(); ; step = iterator.next()) {
    if (step.done) return step.value;
  }
}

function* iterateRoadIntent(project,accepted,proposedNodes,operation,selection,captureTopology) {
  const changedRoadIds=[...new Set(proposedNodes.flatMap(({id})=>accepted.incidentRoads.get(id)??[]))].sort();
  if(changedRoadIds.some(id=>accepted.roadClasses.get(id)?.protected))
    return c1IntentRefused('protected-connection','This junction touches protected infrastructure. Edit that feature separately.');
  if(proposedNodes.some(p=>!c1IntentFinite(p)))
    return c1IntentRefused('coordinate-limit','The requested road coordinates exceed supported world bounds.');
  const next=new Map(proposedNodes.map(p=>[p.id,p]));
  yield { stage: 'road-intent-materialization' };
  const entries = [];
  for (const [key, value] of Object.entries(project.city)) {
    if (!Array.isArray(value)) {
      entries.push([key, c1IntentFreeze(c1IntentCopy(value))]);
      continue;
    }
    const records = [];
    for (let i = 0; i < value.length; i++) {
      if (i % 32 === 0) yield { stage: 'road-intent-records' };
      const record = c1IntentCopy(value[i]);
      const moved = key === 'nodes' ? next.get(record.id) : null;
      records.push(c1IntentFreeze(moved ? { ...record, x: moved.x, y: moved.y } : record));
    }
    entries.push([key, Object.freeze(records)]);
  }
  const proposedCity = Object.fromEntries(entries);
  const issues=[];
  const changed=proposedNodes.some(({id,x,y})=>{
    const old=accepted.nodesById.get(id);
    return x!==old.x || y!==old.y;
  });
  let topologyResolved=false;
  let facesResolved=false;
  if(changed){
    if(proposedNodes.some(node=>Array.isArray(project.city.survey?.boundary) &&
      !insideOrOn(node,project.city.survey.boundary)))
      issues.push({code:'boundary-escape',message:'The intended street extends beyond the protected city outline.'});
    try{
      yield { stage: 'road-intent-graph' };
      const graph=yield* iterateRoadGraph(proposedCity);
      if(!graph.valid)issues.push(...graph.issues.map(issue=>({code:issue.code,message:issue.message,
        roadIds:issue.roadIds??[],nodeIds:issue.nodeIds??[]})));
      else{
        topologyResolved=true;
        yield { stage: 'road-intent-faces' };
        const faces=yield* iterateRoadFaces(graph,project.city);
        if(!faces.valid)issues.push(...faces.issues.map(issue=>({code:issue.code,message:issue.message})));
        else{
          yield { stage: 'road-intent-face-identity' };
          const identity=yield* iterateRoadFaceIdentity(project.city,faces);
          captureTopology?.({ graph, faces, identity });
          facesResolved=identity.valid && !identity.requiresReview;
          if(!facesResolved)issues.push({code:'face-reflow-needed',
            message:'These street positions require block identity and ownership reconciliation.'});
        }
      }
    }catch(error){issues.push({code:'topology-analysis-unavailable',
      message:'Planar topology could not yet be resolved: '+error.message});}
  }
  if(changed)issues.push({code:'neighborhood-reflow-pending',
    message:'Generated properties, plots and buildings have not been adapted to this intended street position.'});
  // This result intentionally includes an unresolved full city only for
  // visualization. It is not project-schema valid or save/Apply eligible.
  return c1IntentFreeze({
    phase:'C1',operation,draftable:true,applyReady:false,
    status:changed ? issues.some(i=>i.code==='protected-connection')?'blocked':
      topologyResolved?'neighborhood-needed':'topology-needed':'unchanged',
    ...selection,proposedNodes,changedRoadIds,
    proposedCity,topologyResolved,facesResolved,
    neighborhoodResolved:false,issues,project:null,
  });
}
