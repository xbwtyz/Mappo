import { prepareParcelReconciliationB2 } from '../core/parcel-reconciliation.js';
import { buildRoadGraph } from '../core/road-graph.js';
import { extractRoadFaces, matchExistingFaces } from '../core/road-faces.js';
import { validateStoredProject } from '../data/project-validation.js';
import { createProjectDocument, encodeProjectDocument, decodeProjectDocument, copyJson } from '../data/project-format.js';

const b4Same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const B4_ALLOWED={
  nodes:new Set(['x','y']), blocks:new Set(['area','vertices']),
  properties:new Set(['boundary','frontage','frame','local','area']),
  plots:new Set(['boundary']),openSpaces:new Set(['area'])
};
function deny(reason){return {ok:false,reason,issues:[{code:'road-apply-blocked',message:reason}]};}
function verifyPreservation(before,after){
  if(before.schemaVersion!==9||after.schemaVersion!==9)throw Error('Schema 9 required.');
  const bc=before.city,ac=after.city;
  if(!bc||!ac||bc.id!==ac.id)throw Error('City identity changed.');
  for(const name of new Set([...Object.keys(before),...Object.keys(after)])){
    if(name!=='city'&&!b4Same(before[name],after[name]))throw Error('Unrelated project metadata changed: '+name);
  }
  for(const name of new Set([...Object.keys(bc),...Object.keys(ac)])){
    if(!Object.hasOwn(B4_ALLOWED,name)){
      if(!b4Same(bc[name],ac[name]))throw Error('Protected city collection changed: '+name);
      continue;
    }
    const oldList=bc[name],newList=ac[name];
    if(!Array.isArray(oldList)||!Array.isArray(newList)||oldList.length!==newList.length)
      throw Error('Collection identity/count changed: '+name);
    for(let i=0;i<oldList.length;i++){
      const previous=oldList[i],next=newList[i];
      if(previous.id!==next.id)throw Error('Object identity or order changed in '+name);
      for(const key of new Set([...Object.keys(previous),...Object.keys(next)])){
        if(!B4_ALLOWED[name].has(key)&&!b4Same(previous[key],next[key]))
          throw Error('Protected field changed: '+name+'.'+previous.id+'.'+key);
      }
    }
  }
}
export function validateRoadCandidateB4(before,candidate,workspace){
  try{
    verifyPreservation(before,candidate);
    validateStoredProject(candidate);
    const graph=buildRoadGraph(candidate.city);
    if(!graph.valid)throw Error('Road graph validation failed.');
    const faces=extractRoadFaces(graph,candidate.city);
    if(!faces.valid)throw Error('Road face extraction failed.');
    const matched=matchExistingFaces(candidate.city,faces);
    if(!matched.valid||matched.issues.length||matched.added.length||matched.removed.length||
      matched.split.length||matched.merged.length||matched.ambiguous.length)
      throw Error('Candidate block topology has ambiguous identities.');
    const document=createProjectDocument(candidate,workspace);
    const restored=decodeProjectDocument(encodeProjectDocument(document));
    if(!b4Same(candidate,restored.project)||!b4Same(workspace,restored.workspace))
      throw Error('Schema-9 portable round-trip changed the candidate or workspace.');
    return {ok:true,candidate:restored.project};
  }catch(error){return deny(error.message);}
}
export function prepareRoadApplyB4(project,workspace,junctionId,point,{reconcile=prepareParcelReconciliationB2}={}){
  if(!project?.city||!workspace||typeof junctionId!=='string'||
    !Number.isFinite(point?.x)||!Number.isFinite(point?.y))return deny('Invalid road edit intent.');
  try{
    // Never trust a cached B3 preview. Always calculate a fresh conservative B2 candidate.
    const result=reconcile(project,junctionId,{x:point.x,y:point.y});
    if(result?.status!=='candidate-only'||!result.candidateProject||
      result.unresolved?.length||result.validation?.project!=='valid'||
      result.validation?.graph!=='pass'||result.validation?.faces!=='pass'||
      result.validation?.identity!=='pass')
      return deny('Road edit has unresolved reconciliation or incomplete validation.');
    if(b4Same(project,result.candidateProject))return deny('No road geometry changed.');
    return validateRoadCandidateB4(project,result.candidateProject,workspace);
  }catch(error){return deny('Road Apply rejected: '+error.message);}
}
export class RoadProjectHistoryB4{
  constructor(limit=20){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid road history limit.');
    this.limit=limit;this.past=[];this.future=[];
  }
  clear(){this.past=[];this.future=[];}
  can(direction,current){
    const row=(direction==='undo'?this.past:this.future).at(-1);
    return !!row&&b4Same(current,direction==='undo'?row.after:row.before);
  }
  record(before,after){
    if(b4Same(before,after))return false;
    this.past.push({before:copyJson(before),after:copyJson(after)});
    if(this.past.length>this.limit)this.past.shift();
    this.future=[];return true;
  }
  prepare(current,workspace,direction){
    if(!this.can(direction,current))return deny('No matching road history entry is available.');
    const row=(direction==='undo'?this.past:this.future).at(-1);
    const desired=direction==='undo'?row.before:row.after;
    // History pairs were captured only after a successful accepted transaction.
    // A reversal restores the exact snapshot; do not apply the forward-change
    // whitelist to a historical state that may contain valid older metadata.
    try{
      validateStoredProject(desired);
      const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(desired,workspace)));
      if(!b4Same(saved.project,desired)||!b4Same(saved.workspace,workspace))
        throw Error('Road history portable round-trip changed the restored project.');
      return {ok:true,candidate:saved.project,entry:row};
    }catch(error){return deny('Road history rejected: '+error.message);}
  }
  accept(entry,direction){
    const source=direction==='undo'?this.past:this.future;
    const target=direction==='undo'?this.future:this.past;
    if(source.at(-1)!==entry)throw Error('Road history changed during transaction.');
    source.pop();target.push(entry);
  }
}
