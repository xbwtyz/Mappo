import {observeP6LandClosure} from './ares-p6-land-closure.mjs';
import {auditP6ExternalContext,observeP6OpaqueContext} from './ares-p6-context-audit.mjs';
import {observeP6GeometricImpact} from './ares-p6-geometric-impact.mjs';
import {auditP6ExplicitInventory} from './ares-p6-inventory-audit.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tournamentLockedRow} from './ares-p5-tournament-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {auditP5CoordinatedCandidate} from './ares-p5-topology-audit.mjs';
import {discoverSpatialDependencies} from '../../../src/core/spatial-recovery-dependencies.js';
import {classifyLareProperty,classifyLareBuilding} from '../../../src/core/reconciliation-policy.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget,spatialRefKey} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';

const sourceRevision='82f28f31758c042ae59bf27f67540d706eb532ba';
const recipes=new Map([
 ['t:t-linear-04',140873788951],['t:t-linear-08',140873788960],
 ['t:t-radial-09',140873788960],['t:t-radial-01',140873788951]
]);
export const P6_A_CASES=Object.freeze([...recipes.keys()]);
const ordered=xs=>[...xs].sort(riCompare);
const key=(collection,id)=>JSON.stringify([collection,id]);
const land=new Set(['blocks','properties','plots','buildings','openSpaces']);
const protectedCollections=new Set(['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces','walls','gates','towers']);
const ownershipRelations=new Set(['block','property','plot','building','compound-member','courtyard-occupant']);
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
function archived(id){
 if(!recipes.has(id))throw Error('Frozen P6-A recipe ID required.');
 const job=recipes.get(id),e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/tournament-recovery-46110819768-'+job+'.json',import.meta.url),'utf8'));
 if(e.version!==1||e.source!==sourceRevision||e.run!==46110819768||e.attempt!==1||e.aggregate!==140875497212||e.job!==job)throw Error('P6 archive identity mismatch.');
 const matches=e.rows.filter(r=>r.id===id&&r.caseId===id);
 if(matches.length!==1||matches[0].source!==tournamentLockedRow(id).source)throw Error('P6 source evidence mismatch.');
 return matches[0];
}
// A1 is a detached explicit-reference inventory, not geometric coverage or
// ownership assignment. Requalify archived road evidence with the existing
// independent, non-search P5 audit root before opening the single P6 root.
// No call to a road search, construction, editor, or allocation authority.
export async function observeP6Ownership(id){
 const prior=archived(id),base={version:1,id,source:prior.source,authority:'none',landVerified:false,geometryCoverage:'not-evaluated',roadAudit:null};
 if(prior.status!=='verified')return riFreeze({...base,status:'road-refused',reason:prior.reason});
 const w=prior.construction?.witness;
 if(prior.audit?.status!=='topology-final-verified'||prior.audit.sweptUnresolved.length||!w)throw Error('Missing qualified P5 witness.');
 const audit=await auditP5CoordinatedCandidate(id,prior.construction);
 base.roadAudit={status:audit.status,reason:audit.reason,stats:audit.stats};
 if(audit.status!=='topology-final-verified'||audit.sweptUnresolved.length||audit.rotationDiagnostic.finalChanged!==0)return riFreeze({...base,status:'road-replay-refused'});
 const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
 const finish=(status,extra={})=>riFreeze({...base,status,...extra,stats:b.snapshot()});
 try{
  const f=materializeLockedRtreCase(id),city=f.project.city,before=aresReplayJson(f.project,b);b.spend(Math.max(1,Math.ceil(Buffer.byteLength(before)/64)));
  if(hash(before)!==prior.source)throw Error('P6 source changed.');
  const {inventory,edges}=discoverSpatialDependencies(f.project,f.context.operation,b);
  const records=new Map(),refs=new Map(),adj=new Map();
  for(const ref of inventory.refs){const k=spatialRefKey(ref);b.spend();refs.set(k,ref);adj.set(k,[]);}
  for(const collection of new Set(inventory.refs.map(r=>r.collection)))for(const record of city[collection]){b.spend();records.set(key(collection,record.id),record);}
  for(const edge of edges){b.spend();const a=spatialRefKey(edge.from),c=spatialRefKey(edge.to);adj.get(a).push(edge);if(a!==c)adj.get(c).push(edge);}
  const moved=new Set([...w.requested.map(n=>n.ref.id),...w.neighbors.map(n=>n.id)]),changedRoads=new Set(w.lineage.map(r=>r.parent));
  for(const r of city.roads){b.spend();if(moved.has(r.a)||moved.has(r.b))changedRoads.add(r.id);}
  const byEdge=new Map();for(const r of city.roads){b.spend();byEdge.set(JSON.stringify(ordered([r.a,r.b])),r.id);}
  const roots=new Set();
  const addRoot=(collection,id)=>{b.spend();const k=key(collection,id);if(!refs.has(k))throw Error('Missing P6 root.');roots.add(k);};
  for(const id of moved)addRoot('nodes',id);
  for(const id of changedRoads)addRoot('roads',id);
  for(const block of city.blocks){
   const vs=block.vertices;let affected=false;
   for(let i=0;i<vs.length;i++){b.spend();if(moved.has(vs[i])||changedRoads.has(byEdge.get(JSON.stringify(ordered([vs[i],vs[(i+1)%vs.length]])))))affected=true;}
   if(affected)addRoot('blocks',block.id);
  }
  // Direct frontage references can cross the initially identified face set.
  for(const ref of inventory.refs){b.spend();const record=records.get(spatialRefKey(ref));if(land.has(ref.collection)&&changedRoads.has(record.frontageRoadId))addRoot(ref.collection,ref.id);}
  const seen=new Map(ordered(roots).map(k=>[k,0])),queue=[...seen.keys()],context=new Set(),excluded=new Set();
  let limited=seen.size>10000;
  for(let i=0;i<queue.length&&!limited;i++){
   const k=queue[i],depth=seen.get(k),here=refs.get(k);
   for(const edge of adj.get(k)){b.spend();const a=spatialRefKey(edge.from),c=spatialRefKey(edge.to),other=a===k?c:a,target=refs.get(other);
    if(seen.has(other))continue;
    // Do not fan out through an entire district or unchanged road network.
    // Keep external relationships visible as context rather than authority.
    if(land.has(target.collection)&&((land.has(here.collection)&&ownershipRelations.has(edge.relation))||(here.collection==='roads'&&edge.relation==='frontage'))){
     if(depth>=6){excluded.add(other);continue;}
     if(seen.size>=10000){limited=true;break;}
     seen.set(other,depth+1);queue.push(other);
    }else context.add(other);
   }
  }
  const dependent=new Set();for(const e of edges){b.spend();if(['compound-member','courtyard-occupant'].includes(e.relation)){dependent.add(spatialRefKey(e.to));if(e.from.collection==='buildings')dependent.add(spatialRefKey(e.from));}}
  const propertyPolicies=new Map();
  const propertyPolicy=id=>{
   if(!propertyPolicies.has(id)){
    const p=records.get(key('properties',id));if(!p)throw Error('Missing P6 property owner.');
    const plots=(p.plotIds??[]).map(id=>{b.spend();const q=records.get(key('plots',id));if(!q)throw Error('Missing P6 plot.');return q;});
    aresReplayJson([p,plots],b);propertyPolicies.set(id,classifyLareProperty(p,plots));
   }return propertyPolicies.get(id);
  };
  const objects=ordered(seen.keys()).map(k=>{
   b.spend();const ref=refs.get(k),record=records.get(k),c=ref.collection;
   let classification='observe-only',policy=null;
   if(c==='properties'||c==='plots'||c==='buildings'){
    policy=propertyPolicy(c==='properties'?ref.id:record.propertyId);
    if(c==='buildings'){aresReplayJson(record,b);policy=classifyLareBuilding(record,policy,dependent.has(k));}
    classification=['adaptive','rigid'].includes(policy.mode)?'generated-review-only':'protected-or-unsupported';
   }
   return {ref,depth:seen.get(k),root:roots.has(k),classification,policy};
  });
  const external=ordered([...context].filter(k=>!seen.has(k))).map(k=>{b.spend();const ref=refs.get(k);return {ref,classification:protectedCollections.has(ref.collection)?'protected':'observe-only'};});
  const omitted=ordered([...excluded].filter(k=>!seen.has(k))).map(k=>refs.get(k));
  const relationships=edges.filter(e=>{b.spend();return seen.has(spatialRefKey(e.from))||seen.has(spatialRefKey(e.to));});
  const counts={};for(const row of objects){b.spend();const c=row.ref.collection;counts[c]=(counts[c]??0)+1;}
  const observation={roots:ordered(roots).map(k=>refs.get(k)),objects,external,omitted,relationships,counts,
   movedNodes:ordered(moved),changedParentRoads:ordered(changedRoads),plaza:{id:city.plaza.id,classification:'protected',geometry:'not-reconciled'},
   limits:{maxObjects:10000,maxHops:6},coverage:'explicit-references-only'};
  aresReplayJson(observation,b);
  const inventoryAudit=limited?{status:'scope-limit',authority:'none'}:auditP6ExplicitInventory(city,w,observation,b);
  aresReplayJson(inventoryAudit,b);
  const geometricImpact=inventoryAudit.status==='matched'?observeP6GeometricImpact(city,w,observation,b):null;
  aresReplayJson(geometricImpact,b);
  const externalAudit=auditP6ExternalContext(observation,b),opaqueContext=observeP6OpaqueContext(f.project,b);
  aresReplayJson([externalAudit,opaqueContext],b);
  const landClosure=geometricImpact&&externalAudit.status==='matched'?observeP6LandClosure(city,w,observation,geometricImpact,edges,b):null;
  aresReplayJson(landClosure,b);
  if(aresReplayJson(f.project,b)!==before)throw Error('P6 source mutated.');
  return finish(limited||omitted.length?'scope-incomplete':inventoryAudit.status!=='matched'?'inventory-unverified':'observed',{observation,inventoryAudit,geometricImpact,externalAudit,opaqueContext,landClosure});
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit',{reason:e.resource});throw e;}
}
