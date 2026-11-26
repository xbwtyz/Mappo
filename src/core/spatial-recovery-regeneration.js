import { createSpatialOperation } from './spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { verifySpatialRetirementWitness } from './spatial-recovery-road-adapter.js';
import { issueIdentityReservation } from './identity-verification.js';
import { normalizeIdentityRequests } from './identity-reservations.js';
import { populateProperty, generateBuildings } from '../generators/buildings.js';
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
  sreCheckShellDomain(original,base,candidate,delta.retired,delta.added.map(item=>item.ref),budget);
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


// One complete generated land group, bounded by the actual original
// retirements in its block. Do not combine shell and group additions in
// this checkpoint; the coordinator will own that scheduling later.
const sreGroupCollections=['properties','plots','buildings'];
function sreGroupVacancies(original,retired,budget){
  const byBlock=new Map();
  for(const collection of sreGroupCollections){
    const ids=new Set(retired.filter(r=>r.collection===collection).map(r=>r.id));
    for(const row of original.city[collection]){
      budget.spend();if(!ids.has(row.id))continue;
      if(!byBlock.has(row.blockId))byBlock.set(row.blockId,{properties:0,plots:0,buildings:0});
      byBlock.get(row.blockId)[collection]++;
    }
  }
  return byBlock;
}
function sreRecalculateBlockOpenArea(city,blockId,budget){
  const block=city.blocks.find(b=>b.id===blockId);
  let occupied=0;
  for(const p of city.properties){budget.spend();if(p.blockId===blockId)occupied+=p.area;}
  for(const o of city.openSpaces){budget.spend();if(o.blockId===blockId)o.area=Math.max(0,block.area-occupied);}
}
function sreCheckGroupDomain(original,base,candidate,retired,added,budget){
  const limits=sreGroupVacancies(original,retired,budget);
  const refs=Object.fromEntries(sreGroupCollections.map(k=>[k,new Set()]));
  for(const r of added){
    budget.spend();
    if(!Object.hasOwn(refs,r.collection)||refs[r.collection].has(r.id))throw Error('Invalid group addition.');
    refs[r.collection].add(r.id);
  }
  if(refs.properties.size!==1||!refs.plots.size||!refs.buildings.size)
    throw Error('Regeneration requires one complete property group.');
  const rows={};
  for(const collection of sreGroupCollections){
    const originalIds=new Set(original.city[collection].map(r=>r.id));budget.spend(Math.max(1,originalIds.size));
    rows[collection]=candidate.city[collection].filter(row=>{budget.spend();return refs[collection].has(row.id);});
    if(rows[collection].length!==refs[collection].size||rows[collection].some(r=>originalIds.has(r.id)))
      throw Error('Missing or reused regenerated group identity.');
  }
  const [p]=rows.properties,block=candidate.city.blocks.find(b=>b.id===p.blockId),cap=limits.get(p.blockId);
  if(!block||!cap||sreGroupCollections.some(k=>rows[k].length>cap[k])||
    p.buildingCompounds?.length||!riEqual(p.plotIds,rows.plots.map(r=>r.id))||
    !riEqual(p.buildingIds,rows.buildings.map(r=>r.id))||classifyRoadProvenance(p,rows.plots)!=='generated')
    throw Error('Unauthorized regenerated property group or count.');
  for(const collection of sreGroupCollections){
    for(const row of rows[collection]){
      budget.spend();
      if(row.blockId!==p.blockId||row.frontageRoadId!==p.frontageRoadId||
        (row.districtId??null)!==(block.districtId??null)||
        (collection!=='properties'&&row.propertyId!==p.id)||
        (collection==='buildings'&&(!row.plotIds.length||row.plotIds.some(id=>!refs.plots.has(id))||classifyRoadProvenance(row)!=='generated')))
        throw Error('Invalid regenerated group ownership.');
    }
  }
  const projected=sreClone(candidate,budget);
  for(const collection of sreGroupCollections)
    projected.city[collection]=projected.city[collection].filter(row=>{budget.spend();return !refs[collection].has(row.id);});
  const derived=sreClone(candidate.city,budget);sreRecalculateBlockOpenArea(derived,p.blockId,budget);
  if(!riEqual(derived.openSpaces,candidate.city.openSpaces))throw Error('Incorrect regenerated open-space area.');
  const priorSpaces=new Map(base.city.openSpaces.map(r=>[r.id,r]));
  for(const o of projected.city.openSpaces){
    budget.spend();if(o.blockId===p.blockId)o.area=priorSpaces.get(o.id)?.area;
  }
  projected.identityAllocation=copyJson(base.identityAllocation);
  if(!riEqual(projected,base))throw Error('Regeneration changed existing survivor records.');
  sreDrain(spatialConstraint('storedProject').iterate(candidate),budget);
  const context={roadIds:[],junctionIds:[],changedBlockIds:[p.blockId],acceptedValid:true};
  const {emit,items}=riReporter(),local=riBudget(),spend=(n=1)=>{local(n);if(n>0)budget.spend(n);};
  sreDrain(spatialConstraint('landDependencies').iterate(candidate.city,candidate.city,context,emit,spend,base.city),budget);
  spatialConstraint('infrastructure').check(base.city,candidate.city,context,emit,spend);
  const issue=items().find(r=>r.severity!=='info'&&
    !(r.kind==='plot'&&r.code==='property-containment'&&!refs.plots.has(r.id)));
  if(issue)throw Error('Regenerated group dependency refused: '+issue.message);
  const priorBuildings=new Map(base.city.buildings.map(b=>[b.id,b]));
  budget.spend(Math.max(1,priorBuildings.size));
  for(const b of candidate.city.buildings){
    budget.spend();if(b.blockId!==p.blockId)continue;
    const prior=priorBuildings.get(b.id);
    if((!prior||sreAccess(base.city,prior,false,budget))&&!sreAccess(candidate.city,b,false,budget))
      throw Error('Regeneration obstructed a new or previously valid access route.');
  }
}
export async function verifySpatialGroupRegeneration(original,input,seedDelta,delta,authorization,budget){
  const {op,retirement}=sreRegenerationOperation(input);
  if(!authorization)throw Error('Missing host reservation authorization.');
  const base=await verifySpatialRetirementWitness(original,retirement,seedDelta,budget);
  const candidate=await reconstructSpatialDelta(original,op,1,delta,budget,authorization);
  if(!riEqual(seedDelta.retired,delta.retired))throw Error('Regeneration changed reviewed retirements.');
  sreCheckGroupDomain(original,base,candidate,delta.retired,delta.added.map(item=>item.ref),budget);
  return candidate;
}
export async function searchSpatialGroupRegeneration(original,input,seedDelta,context,budget){
  const {op,retirement}=sreRegenerationOperation(input),attempts=[];
  if(context?.projectId!==op.projectId||context?.revision!==op.revision)
    throw Error('Stale regeneration reservation context.');
  const refusal=exhausted=>riFreeze({status:'refused',operation:op,delta:null,provisionalAuthorization:null,
    attempts,exhausted,stats:budget.snapshot()});
  try{
    const snapshot=sreClone(original,budget),base=await verifySpatialRetirementWitness(snapshot,retirement,seedDelta,budget);
    const limits=sreGroupVacancies(snapshot,seedDelta.retired,budget);
    for(const [blockId,cap] of [...limits].sort(([a],[b])=>riCompare(a,b))){
      if(!cap.properties||!cap.plots||!cap.buildings)continue;
      const block=base.city.blocks.find(b=>b.id===blockId);
      for(let attempt=0;attempt<4&&attempts.length<24;attempt++){
        budget.spend(Math.max(1,base.city.nodes.length+base.city.roads.length+block.vertices.length));
        // Generator work is bounded by the existing one-block generator,
        // seed count and proposal count, not claimed fully operation-metered.
        const generated=generateBuildings(String(snapshot.seed??op.projectId)+':sre-group:'+blockId+':'+attempt,
          {nodes:base.city.nodes,roads:base.city.roads,blocks:[block]},null);
        budget.spend(Math.max(1,generated.properties.length+generated.plots.length+generated.buildings.length));
        const proposals=generated.properties.map(p=>({p,plots:generated.plots.filter(r=>r.propertyId===p.id),
          buildings:generated.buildings.filter(r=>r.propertyId===p.id)}))
          .filter(r=>r.plots.length&&r.buildings.length&&r.plots.length<=cap.plots&&r.buildings.length<=cap.buildings)
          .sort((a,b)=>{budget.spend();return a.p.area-b.p.area||riCompare(a.p.id,b.p.id);});
        for(const raw of proposals.slice(0,6)){
          if(attempts.length>=24)break;
          budget.spend();const row={blockId,attempt,proposal:raw.p.id,status:'refused'};attempts.push(row);
          try{
            const key='sre-group/'+blockId+'/'+attempt+'/'+raw.p.id;
            const requests=normalizeIdentityRequests([{type:'property',key:key+'/p'},
              ...raw.plots.map((_,i)=>({type:'plot',key:key+'/q/'+i})),
              ...raw.buildings.map((_,i)=>({type:'building',key:key+'/b/'+i}))]);
            budget.spend(Math.max(1,snapshot.city.buildings.length+snapshot.city.properties.length+snapshot.city.plots.length+requests.length*8));
            const receipt=issueIdentityReservation(snapshot.identityAllocation,snapshot.city,context,requests);
            const authorization={context:copyJson(context),requests,receipt};
            const allocation=new Map(receipt.allocations.map(a=>[a.key,a.id]));
            const candidate=sreClone(base,budget),p=copyJson(raw.p);
            p.id=allocation.get(key+'/p');p.districtId=block.districtId??null;
            const plotMap=new Map(raw.plots.map((r,i)=>[r.id,allocation.get(key+'/q/'+i)]));
            const plots=raw.plots.map(r=>({...copyJson(r),id:plotMap.get(r.id),propertyId:p.id,districtId:p.districtId}));
            const buildings=raw.buildings.map((r,i)=>{
              const transient={...copyJson(r),id:allocation.get(key+'/b/'+i),propertyId:p.id,
                plotIds:r.plotIds.map(id=>plotMap.get(id)),districtId:p.districtId};
              stampRoadGenerated(transient);return adoptNewBuildingS10(transient);
            });
            p.plotIds=plots.map(q=>q.id);p.buildingIds=buildings.map(b=>b.id);stampRoadGenerated(p,plots);
            candidate.city.properties.push(p);candidate.city.plots.push(...plots);candidate.city.buildings.push(...buildings);
            candidate.identityAllocation=copyJson(receipt.nextState);
            sreRecalculateBlockOpenArea(candidate.city,blockId,budget);
            sreDrain(spatialConstraint('storedProject').iterate(candidate),budget);
            for(const b of buildings){
              const route=sreAccess(candidate.city,b,true,budget);
              if(!route)throw Error('New access refused.');
              Object.assign(b,{entrance:route.entrance,accessPath:route.accessPath});stampRoadGenerated(b);
            }
            const delta=await createSpatialDelta(snapshot,candidate,op,1,budget,authorization);
            await verifySpatialGroupRegeneration(snapshot,op,seedDelta,delta,authorization,budget);
            row.status='verified-witness';
            return riFreeze({status:'verified-witness',operation:op,delta,provisionalAuthorization:authorization,
              attempts,exhausted:null,stats:budget.snapshot()});
          }catch(error){
            if(error instanceof LareBudgetExceeded)throw error;
            row.reason=String(error.message??error);
          }
        }
      }
      if(attempts.length>=24)break;
    }
    return refusal(null);
  }catch(error){
    if(error instanceof LareBudgetExceeded)return refusal(error.resource);
    throw error;
  }
}
