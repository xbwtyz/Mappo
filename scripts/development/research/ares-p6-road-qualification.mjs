// P6 E: first detached whole-project qualification path. Independent
// strict SRE verification, not SRE search or an incumbent substitution.
import {prepareRoadGroupIntentB1} from '../../../src/core/road-intent-c1.js';
import {normalizeSpatialRoadGroup,verifySpatialStrictRoadWitness,verifySpatialConcessionRoadWitness} from '../../../src/core/spatial-recovery-road-adapter.js';
import {createSpatialDelta} from '../../../src/core/spatial-recovery-delta.js';
import {createSpatialOperation} from '../../../src/core/spatial-recovery-contract.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {observeP6DryPipeline} from './ares-p6-budgeted-pipeline.mjs';

function strictOperation(project,input,b){
 b.spend();
 const op=createSpatialOperation(input);
 if(project?.schemaVersion!==11||op.projectId!==(project.id??project.city?.id)||op.family!=='road'||op.operation!=='translate-road-group'||!op.geometry||op.editedRefs.some(ref=>ref.collection!=='roads')||op.permissions.uniformScaling||op.permissions.destruction||op.permissions.regeneration)
  throw Error('P6 requires nondestructive road operation without scaling.');
 return op;
}
// Only a freshly derived candidate can pass the existing operation-bound
// preservation, dependency and stored-project gate. Search evidence alone
// cannot authorize a movement. No candidate escapes on failure.
export async function verifyP6AssembledRoadCity(project,input,assembly,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 const op=strictOperation(project,input,b);
 if(assembly?.status!=='candidate-assembled'||assembly.authority!=='none'||assembly.valid!==false||assembly.landVerified!==false||!assembly.candidate)throw Error('Complete detached P6 assembly required.');
 const text=aresReplayJson({...project,city:assembly.candidate},b);
 b.spend(Math.max(1,Math.ceil(Buffer.byteLength(text)/64)));
 const candidate=JSON.parse(text);
 const delta=await createSpatialDelta(project,candidate,op,1,b);
 if(delta.added.length||delta.retired.length)throw Error('P6 must preserve all identities.');
 const verify=op.permissions.alternativeFrontage?verifySpatialConcessionRoadWitness:verifySpatialStrictRoadWitness;
 const verified=await verify(project,op,delta,b);
 // SRE delta v2 fingerprints and copyJson use standard persisted JSON.
 // Compare those exact bytes, not ARES replay's signed-zero-sensitive
 // in-memory records. The strict domain gate above is unchanged.
 // Validate and meter both JSON trees before ordinary serialization.
 const verifiedText=aresReplayJson(verified,b);
 b.spend(Math.max(1,Math.ceil(Buffer.byteLength(verifiedText)/64)));
 const persistedCandidate=JSON.stringify(candidate),persistedVerified=JSON.stringify(JSON.parse(verifiedText));
 b.spend(Math.max(1,Math.ceil((Buffer.byteLength(persistedCandidate)+Buffer.byteLength(persistedVerified))/64)));
 if(persistedCandidate!==persistedVerified)throw Error('P6 independent persisted replay differs from assembly.');
 return {status:'verified-detached-road-movement',authority:'none',landVerified:true,operation:op,delta,
  counts:{modified:delta.modified.length,added:delta.added.length,retired:delta.retired.length}};
}

export async function qualifyP6RoadMovement(project,revision,ids,offset,b,{permissions={}}={}){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 const refuse=(stage,reason,details=null)=>({status:'refused',stage,reason,details,authority:'none',landVerified:false,delta:null,stats:b.snapshot()});
 let stage='road-intent';
 try{
  const op=strictOperation(project,normalizeSpatialRoadGroup(project,revision,ids,offset,permissions),b);
  // Reuse the existing bounded road intent; P6 land search and verification
  // share the caller's root. The legacy intent has its existing own limits.
  aresReplayJson(project,b);
  const draft=prepareRoadGroupIntentB1(project,ids,offset);
  if(!draft.group?.eligible||!draft.draftable||!draft.topologyResolved||!draft.facesResolved||draft.status==='unchanged'||!draft.proposedCity)return refuse(stage,'unresolved-road-intent');
  stage='land-reconstruction';
  const result=observeP6DryPipeline(project.city,{nodes:draft.proposedCity.nodes,roads:draft.proposedCity.roads},b,{collective:true,landscape:true,...(op.permissions.alternativeFrontage?{frontageContext:{project,operation:op}}:{})});
  if(!result.diagnosticsComplete)return refuse(stage,result.reason);
  if(result.assembly?.status!=='candidate-assembled')return refuse('assembly',result.assembly?.reason??'missing-assembly',result.assembly?.details??null);
  stage='independent-verification';
  const verified=await verifyP6AssembledRoadCity(project,op,result.assembly,b);
  return {...verified,stage:'complete',reason:null,stats:b.snapshot(),assemblyCounts:result.assembly.counts,jointCounts:result.assembly.jointCounts??null,frontageDetails:result.assembly.frontageDetails??null};
 }catch(error){
  if(error instanceof LareBudgetExceeded)return refuse(stage,'budget-exhausted',{resource:error.resource});
  return refuse(stage,error.message);
 }
}
