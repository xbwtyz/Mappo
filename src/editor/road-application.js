import { prepareRoadTopologyReflowC3 } from '../core/road-topology-reflow.js';
import { prepareNeighborhoodReflowC3 } from '../core/neighborhood-reflow.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { buildRoadGraph } from '../core/road-graph.js';
import { extractRoadFaces, matchExistingFaces } from '../core/road-faces.js';
import { prepareParcelReconciliationB2 } from '../core/parcel-reconciliation.js';

// B4 owns acceptance. B1/B2/B3 statuses never grant write permission.
const b4Same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function reject(code,message){
  return {ok:false,applyReady:false,status:'blocked',candidate:null,
    issues:[{code,message,severity:'needs-review'}]};
}
const editable = {
  nodes:['x','y'], blocks:['area'],
  properties:['boundary','frontage','frame','local','area'],
  plots:['boundary'], openSpaces:['area'],
};
// Compare values structurally: JSON key insertion order is not a geometry
// change. Array order, object key sets and every field value must match.
function b4FirstDifference(a,b,path='project'){
  if(a===b)return null;
  if(Array.isArray(a)||Array.isArray(b)){
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return path;
    for(let i=0;i<a.length;i++){
      const diff=b4FirstDifference(a[i],b[i],path+'['+i+']');
      if(diff)return diff;
    }
    return null;
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();
    if(ka.length!==kb.length||ka.some((v,i)=>v!==kb[i]))return path;
    for(const key of ka){
      const diff=b4FirstDifference(a[key],b[key],path+'.'+key);
      if(diff)return diff;
    }
    return null;
  }
  return path;
}

// Rebuild the entire expected candidate by transferring *only* approved
// geometry fields. No ID, custom metadata, building, terrain, protected face,
// district, road record or unrelated project field can change implicitly.
export function verifyRoadDeltaB4(before,after,junctionId){
  const expected=copyJson(before);
  for(const [collection,fields] of Object.entries(editable)){
    const original=before.city[collection]??[], proposed=after.city[collection]??[];
    if(original.length!==proposed.length)
      throw new Error('Record membership changed in '+collection+'.');
    for(let i=0;i<original.length;i++){
      const a=original[i],b=proposed[i],out=expected.city[collection][i];
      if(a.id!==b.id)throw new Error('Record identity or order changed in '+collection+'.');
      for(const field of fields){
        if(!b4Same(a[field],b[field])){
          if(collection==='nodes'&&a.id!==junctionId)
            throw new Error('An unrelated junction moved.');
          if(b[field]===undefined)throw new Error('A required geometry field was removed.');
          out[field]=copyJson(b[field]);
        }
      }
    }
  }
  const mismatch=b4FirstDifference(expected,after);
  if(mismatch)throw new Error('Candidate changed unsupported fields at '+mismatch+'.');
  const moved=before.city.nodes.find(n=>n.id===junctionId);
  const next=after.city.nodes.find(n=>n.id===junctionId);
  if(!moved||!next||b4Same([moved.x,moved.y],[next.x,next.y]))
    throw new Error('No accepted junction movement exists in this candidate.');
  return true;
}

export function prepareRoadApplyB4(project,workspace,session,expectedRevision,currentRevision){
  if(!session?.current?.()||session.project!==project||session.city!==project?.city)
    return reject('stale-project','The accepted project changed. Reopen the road preview.');
  if(!Number.isSafeInteger(expectedRevision)||currentRevision!==expectedRevision)
    return reject('stale-revision','The project revision changed while the preview was open.');
  if(session.drag||session.checking||session.error||session.reconciliationError||
     !session.pending||session.selection?.kind!=='junction'||
     !Number.isFinite(session.point?.x)||!Number.isFinite(session.point?.y)||
     session.settledRevision!==session.revision||
     session.acceptedFingerprint!==JSON.stringify(project))
    return reject('stale-preview','The road proposal is not a complete, current preview.');
  const inspected=session.reconciliation;
  if(!inspected?.candidateProject||inspected.status!=='candidate-only'||
     inspected.validation?.project!=='valid'||inspected.validation?.parcels!=='pass'||
     inspected.unresolved?.length||session.previewGeometry?.verified!==true)
    return reject('reconciliation-required','The complete neighborhood has not been safely reconciled.');
  try{
    // Recompute now instead of trusting the cached visual preview.
    const fresh=prepareParcelReconciliationB2(project,session.selection.id,session.point);
    if(!fresh.candidateProject||fresh.status!=='candidate-only'||
       fresh.unresolved?.length||fresh.validation?.project!=='valid'||
       fresh.validation?.parcels!=='pass')
      return reject('candidate-invalid',fresh.unresolved?.[0]?.message??
        'Fresh local reconciliation did not produce an eligible candidate.');
    if(!b4Same(fresh.candidateProject,inspected.candidateProject))
      return reject('candidate-changed','The reconstruction differs from the inspected proposal.');
    const candidate=copyJson(fresh.candidateProject);
    verifyRoadDeltaB4(project,candidate,session.selection.id);
    const graph=buildRoadGraph(candidate.city);
    if(!graph.valid)throw new Error('Candidate road topology failed validation.');
    const faces=extractRoadFaces(graph,candidate.city);
    if(!faces.valid)throw new Error('Candidate face coverage failed validation.');
    // Reconfirm identities against the ACCEPTED city, never the already-edited candidate.
    // A graph/face-valid movement can still produce a split, merge, or ambiguous match.
    const matched=matchExistingFaces(project.city,faces);
    if(!matched.valid||matched.requiresReview||matched.issues.length||
       matched.added.length||matched.removed.length||matched.split.length||
       matched.merged.length||matched.ambiguous.length)
      throw new Error('Candidate face identities are not unambiguously preserved.');
    const mapped=[...matched.preserved,...matched.changed];
    if(mapped.length!==faces.faces.length)
      throw new Error('Candidate face correspondence is incomplete.');
    validateStoredProject(candidate);
    const roundtrip=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
    if(!b4Same(roundtrip.project,candidate))
      throw new Error('The portable file round-trip changed candidate project fields.');
    if(!b4Same(roundtrip.workspace,workspace))
      throw new Error('The portable file round-trip changed the current workspace.');
    return {ok:true,applyReady:true,status:'valid',candidate:roundtrip.project,
      changed:copyJson(fresh.changed),issues:[],validation:{graph:'pass',faces:'pass',
        identity:'pass',project:'pass',roundTrip:'pass'}};
  }catch(error){return reject('apply-validation','Road Apply blocked: '+error.message);}
}


export function prepareRoadApplyC2(project, workspace, session, expectedRevision, currentRevision) {
  if (!session?.current?.() || session.project !== project || session.city !== project?.city ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision !== currentRevision)
    return reject('stale-project', 'The accepted project changed. Reopen the road preview.');
  const inspected = session.reconciliation;
  if (session.selection?.kind !== 'road' || !session.pending || session.drag || session.checking ||
      session.error || session.roadIntentInputError || session.settledRevision !== session.revision ||
      session.acceptedFingerprint !== JSON.stringify(project) || !session.previewGeometry?.verified ||
      !['C2', 'C3'].includes(inspected?.phase) || !inspected.candidateProject)
    return reject('stale-preview', 'The street proposal is not a complete, current preview.');
  try {
    const fresh = session.roadConnectionEdit
      ? prepareRoadTopologyReflowC3(project, session.selection.id, null, session.roadConnectionEdit)
      : prepareNeighborhoodReflowC3(project, session.selection.id, session.roadIntentOffset);
    if (!fresh.candidateProject)
      return reject('candidate-invalid', fresh.unresolved[0]?.message ?? 'Fresh reflow did not pass validation.');
    if (!b4Same(fresh.candidateProject, inspected.candidateProject) || !b4Same(fresh.ledger, inspected.ledger))
      return reject('candidate-changed', 'The reconstruction differs from the inspected proposal.');
    const roundtrip = decodeProjectDocument(encodeProjectDocument(createProjectDocument(fresh.candidateProject, workspace)));
    if (!b4Same(roundtrip.project, fresh.candidateProject) || !b4Same(roundtrip.workspace, workspace))
      throw new Error('Portable save/load changed the candidate or workspace.');
    return { ok: true, candidate: fresh.candidateProject, changed: fresh.changed, ledger: fresh.ledger };
  } catch (error) {
    return reject('apply-validation', 'Road Apply blocked: ' + error.message);
  }
}
