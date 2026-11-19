import { buildRoadGraph } from './road-graph.js';
import { extractRoadFaces, matchExistingFaces } from './road-faces.js';
import { insideOrOn } from './boundary.js';

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
  const changedRoadIds=[...new Set([...endpoints].flatMap(id=>
    accepted.incidentRoads.get(id)??[]))].sort();
  if(changedRoadIds.some(id=>accepted.roadClasses.get(id)?.protected))
    return c1IntentRefused('protected-connection',
      'This road shares a junction with protected infrastructure. Edit that feature separately.');
  const proposedNodes=[...endpoints].map(id=>{
    const node=accepted.nodesById.get(id);
    return {id,x:node.x+offset.x,y:node.y+offset.y};
  });
  if(proposedNodes.some(p=>!c1IntentFinite(p)))
    return c1IntentRefused('coordinate-limit','The requested road coordinates exceed supported world bounds.');
  const next=new Map(proposedNodes.map(p=>[p.id,p]));
  const proposedCity=c1IntentCopy(project.city);
  proposedCity.nodes=proposedCity.nodes.map(node=>next.has(node.id)
    ? {...node,x:next.get(node.id).x,y:next.get(node.id).y}:node);
  const issues=[];
  const changed=!!Math.hypot(offset.x,offset.y);
  let topologyResolved=false;
  let facesResolved=false;
  if(changed){
    if(proposedNodes.some(node=>Array.isArray(project.city.survey?.boundary) &&
      !insideOrOn(node,project.city.survey.boundary)))
      issues.push({code:'boundary-escape',message:'The intended street extends beyond the protected city outline.'});
    try{
      const graph=buildRoadGraph(proposedCity);
      if(!graph.valid)issues.push(...graph.issues.map(issue=>({code:issue.code,message:issue.message})));
      else{
        topologyResolved=true;
        const faces=extractRoadFaces(graph,project.city);
        if(!faces.valid)issues.push(...faces.issues.map(issue=>({code:issue.code,message:issue.message})));
        else{
          const identity=matchExistingFaces(project.city,faces);
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
    phase:'C1',operation:'draft-road-translation',draftable:true,applyReady:false,
    status:changed ? issues.some(i=>i.code==='protected-connection')?'blocked':
      topologyResolved?'neighborhood-needed':'topology-needed':'unchanged',
    roadId,offset:c1IntentCopy(offset),proposedNodes,changedRoadIds,
    proposedCity,topologyResolved,facesResolved,
    neighborhoodResolved:false,issues,project:null,
  });
}
