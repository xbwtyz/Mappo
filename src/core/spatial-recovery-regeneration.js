import { createSpatialOperation, spatialRefKey } from './spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { verifySpatialRetirementWitness } from './spatial-recovery-road-adapter.js';
import { issueIdentityReservation } from './identity-verification.js';
import { normalizeIdentityRequests } from './identity-reservations.js';
import { populateProperty } from '../generators/buildings.js';
import { createRng } from './prng.js';
import { adoptNewBuildingS10 } from './building-project-s10.js';
import { buildingPrimaryRouteViewS10 } from './building-geometry-adapter-s10.js';
import { classifyRoadProvenance, stampRoadGenerated } from './road-provenance.js';
import { resolveSameFrontageAccessB1R } from '../editor/building-application.js';
import { spatialConstraint } from './spatial-recovery-registry.js';
import { LareBudgetExceeded } from './reconciliation-budget.js';
import { copyJson } from '../data/project-format.js';
import { riBudget, riReporter, riCompare, riEqual, riFreeze } from './road-impact-model.js';

// Detached additive shell regeneration only. Reservations here are
// provisional, never publication or Apply authority. Host must independently
// supply current context, requests and receipt when verifying transport.
function sreRegenerationOperation(input){
  const op=createSpatialOperation(input);
  if(!op.permissions.destruction||!op.permissions.regeneration)
    throw Error('Explicit destruction and regeneration permissions required.');
  return {op,retirement:createSpatialOperation({...op,permissions:{...op.permissions,regeneration:false}})};
}
const sreClone=(value,budget)=>{
  budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(value)).length/64)));
  return copyJson(value);
};
function sreDrain(iterator,budget){
  for(;;){budget.spend();const step=iterator.next();if(step.done)return step.value;}
}
function sreShells(original,base,retired,budget){
  const ids=new Set(retired.filter(r=>r.collection==='buildings').map(r=>r.id));
  const limits=new Map();
  for(const b of original.city.buildings){
    budget.spend();
    if(ids.has(b.id))limits.set(b.propertyId,(limits.get(b.propertyId)??0)+1);
  }
  const plots=new Map(base.city.plots.map(r=>[r.id,r]));budget.spend(Math.max(1,plots.size));
  const shells=new Map();
  for(const p of base.city.properties){
    budget.spend(1+p.plotIds.length);
    if(limits.has(p.id)&&!p.buildingIds.length&&!p.buildingCompounds?.length&&
      classifyRoadProvenance(p,p.plotIds.map(id=>plots.get(id)))==='generated')
      shells.set(p.id,{property:p,plots:p.plotIds.map(id=>plots.get(id)),cap:limits.get(p.id)});
  }
  return shells;
}
function sreAccess(city,b,repair,budget){
  const cap=riBudget(),spend=(n=1)=>{cap(n);if(n>0)budget.spend(n);};
  return resolveSameFrontageAccessB1R(city,buildingPrimaryRouteViewS10(b),
    {allowRepair:repair,allowEntranceMove:repair,spend}).route;
}
function sreCheckShellDomain(original,base,candidate,retired,added,budget){
  const shells=sreShells(original,base,retired,budget);
  if(!added.length||added.some(r=>r.collection!=='buildings'))
    throw Error('Only additive shell buildings are supported.');
  const fresh=new Set(added.map(r=>r.id));
  if(fresh.size!==added.length)throw Error('Duplicate regenerated identity.');
  const old=new Map(original.city.buildings.map(b=>[b.id,b]));
  const baseBuildings=new Map(base.city.buildings.map(b=>[b.id,b]));
  budget.spend(Math.max(1,old.size+baseBuildings.size));
  const projected=sreClone(candidate,budget),children=new Map(),blocks=new Set();
  for(const b of candidate.city.buildings){
    budget.spend();
    if(!fresh.has(b.id))continue;
    const shell=shells.get(b.propertyId);
    if(old.has(b.id)||!shell||b.blockId!==shell.property.blockId||
      b.frontageRoadId!==shell.property.frontageRoadId||
      classifyRoadProvenance(b)!=='generated')
      throw Error('Unauthorized regenerated building or parent.');
    if(!children.has(b.propertyId))children.set(b.propertyId,[]);
    const group=children.get(b.propertyId);group.push(b.id);
    if(group.length>shell.cap)throw Error('Regeneration exceeds retired children.');
    blocks.add(b.blockId);
  }
  if(children.size!==1||[...children.values()].flat().length!==fresh.size)
    throw Error('Exactly one eligible vacant shell may be regenerated.');
  projected.city.buildings=projected.city.buildings.filter(b=>!fresh.has(b.id));
  for(const p of projected.city.properties){
    budget.spend();
    if(!children.has(p.id))continue;
    const shell=shells.get(p.id);
    if(!riEqual(p.buildingIds,children.get(p.id))||
      classifyRoadProvenance(p,shell.plots)!=='generated')throw Error('Invalid regenerated parent membership.');
    p.buildingIds=copyJson(shell.property.buildingIds);
    p.roadProvenance=copyJson(shell.property.roadProvenance);
  }
  // Allocation is validated separately by the Schema 11 delta replay.
  projected.identityAllocation=copyJson(base.identityAllocation);
  if(!riEqual(projected,base))throw Error('Regeneration changed existing survivor records.');
  sreDrain(spatialConstraint('storedProject').iterate(candidate),budget);
  const context={roadIds:[],junctionIds:[],changedBlockIds:[...blocks],acceptedValid:true};
  const {emit,items}=riReporter(),cap=riBudget();
  const spend=(n=1)=>{cap(n);if(n>0)budget.spend(n);};
  sreDrain(spatialConstraint('landDependencies').iterate(candidate.city,candidate.city,context,emit,spend,base.city),budget);
  spatialConstraint('infrastructure').check(base.city,candidate.city,context,emit,spend);
  const issue=items().find(r=>r.severity!=='info'&&!(r.kind==='plot'&&r.code==='property-containment'));
  if(issue)throw Error('Regeneration dependency refused: '+issue.message);
  for(const b of candidate.city.buildings){
    budget.spend();if(!blocks.has(b.blockId))continue;
    const prior=baseBuildings.get(b.id);
    if((!prior||sreAccess(base.city,prior,false,budget))&&!sreAccess(candidate.city,b,false,budget))
      throw Error('Regeneration obstructed a new or previously valid access route.');
  }
}
export async function verifySpatialShellRegeneration(original,input,seedDelta,delta,authorization,budget){
  const {op,retirement}=sreRegenerationOperation(input);
  if(!authorization)throw Error('Missing host reservation authorization.');
  const base=await verifySpatialRetirementWitness(original,retirement,seedDelta,budget);
  const candidate=await reconstructSpatialDelta(original,op,1,delta,budget,authorization);
  if(!riEqual(seedDelta.retired,delta.retired))throw Error('Regeneration changed reviewed retirements.');
  sreCheckShellDomain(original,base,candidate,delta.retired,delta.added,budget);
  return candidate;
}
export async function searchSpatialShellRegeneration(original,input,seedDelta,context,budget){
  const {op,retirement}=sreRegenerationOperation(input),attempts=[];
  if(context?.projectId!==op.projectId||context?.revision!==op.revision)
    throw Error('Stale regeneration reservation context.');
  const refusal=exhausted=>riFreeze({status:'refused',operation:op,delta:null,provisionalAuthorization:null,
    attempts,exhausted,stats:budget.snapshot()});
  try{
    const snapshot=sreClone(original,budget);
    const base=await verifySpatialRetirementWitness(snapshot,retirement,seedDelta,budget);
    const shells=sreShells(snapshot,base,seedDelta.retired,budget);
    for(const [id,shell] of [...shells].sort(([a],[b])=>riCompare(a,b))){
      for(let attempt=0;attempt<4&&attempts.length<16;attempt++){
        budget.spend();
        const row={parentId:id,attempt,status:'refused'};attempts.push(row);
        try{
          const p=sreClone(shell.property,budget),plots=sreClone(shell.plots,budget),raw=[];
          populateProperty(p,plots,createRng(String(snapshot.seed??op.projectId)+':sre-shell:'+id+':'+attempt),raw);
          budget.spend(Math.max(1,raw.length));
          if(!raw.length||raw.length>shell.cap)continue;
          const requests=normalizeIdentityRequests(raw.map((_,i)=>({type:'building',key:'sre-shell/'+id+'/'+attempt+'/'+i})));
          budget.spend(Math.max(1,snapshot.city.buildings.length+snapshot.city.properties.length+snapshot.city.plots.length+requests.length*8));
          const receipt=issueIdentityReservation(snapshot.identityAllocation,snapshot.city,context,requests);
          const authorization={context:copyJson(context),requests,receipt};
          const candidate=sreClone(base,budget),parent=candidate.city.properties.find(r=>r.id===id);
          const block=candidate.city.blocks.find(b=>b.id===parent.blockId);
          const added=raw.map((r,i)=>{
            const fresh=receipt.allocations.find(a=>a.key==='sre-shell/'+id+'/'+attempt+'/'+i).id;
            const transient={...r,id:fresh,propertyId:id,districtId:block.districtId??null};
            stampRoadGenerated(transient);return adoptNewBuildingS10(transient);
          });
          parent.buildingIds=added.map(b=>b.id);stampRoadGenerated(parent,shell.plots);
          candidate.city.buildings.push(...added);candidate.identityAllocation=copyJson(receipt.nextState);
          for(const b of added){
            const route=sreAccess(candidate.city,b,true,budget);
            if(!route)throw Error('New access refused.');
            Object.assign(b,{entrance:route.entrance,accessPath:route.accessPath});stampRoadGenerated(b);
          }
          const delta=await createSpatialDelta(snapshot,candidate,op,1,budget,authorization);
          await verifySpatialShellRegeneration(snapshot,op,seedDelta,delta,authorization,budget);
          row.status='verified-witness';
          return riFreeze({status:'verified-witness',operation:op,delta,provisionalAuthorization:authorization,
            attempts,exhausted:null,stats:budget.snapshot()});
        }catch(error){
          if(error instanceof LareBudgetExceeded)throw error;
          row.reason=String(error.message??error);
        }
      }
      if(attempts.length>=16)break;
    }
    return refusal(null);
  }catch(error){
    if(error instanceof LareBudgetExceeded)return refusal(error.resource);
    throw error;
  }
}
