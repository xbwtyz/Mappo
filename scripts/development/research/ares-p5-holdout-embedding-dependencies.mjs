import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
const archive=new Map();
for(const job of [140858401003,140858401013,140858401031,140858401054,140858401085,140858401122,140858401144,140858401147]){
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-embedding-46105864030-'+job+'.json',import.meta.url),'utf8'));
 if(e.run!==46105864030||e.attempt!==1||e.source!=='f821fe010dfff3bc11303bf852bd1074e246a6f6'||e.job!==job)throw Error('Embedding dependency archive mismatch.');
 for(const r of e.rows){const lock=holdoutLockedRow(r.caseId);if(archive.has(r.caseId)||r.source!==lock.source||r.authority!=='none'||r.status!=='diagnosed'||r.cyclicGate!=='required')throw Error('Embedding dependency row mismatch.');archive.set(r.caseId,riFreeze(r));}
}
if(archive.size!==9)throw Error('Incomplete dependency archive.');
export const EMBEDDING_DEPENDENCY_CASES=Object.freeze([...archive.keys()].sort(riCompare));
const key=(a,b)=>JSON.stringify([a,b].sort(riCompare));
const ordered=s=>[...s].sort(riCompare);
export function mapEmbeddingExposure(city,embedding,b){
 const changed=new Set(embedding.affectedRoads),edges=new Map(),nodes=new Set(city.nodes.map(n=>n.id));
 b.spend(city.nodes.length+city.roads.length+changed.size);
 for(const r of city.roads){b.spend();edges.set(key(r.a,r.b),r.id);}
 const ids=new Set(city.roads.map(r=>r.id));if([...changed].some(id=>!ids.has(id)))throw Error('Unresolved exposure road');
 const blocks=[],blockIds=new Set(),unmapped=[];
 for(const block of city.blocks??[]){
  const vertices=block.vertices??[],roads=[];
  for(let i=0;i<vertices.length;i++){b.spend();const a=vertices[i],c=vertices[(i+1)%vertices.length],road=edges.get(key(a,c));
   if(!nodes.has(a)||!nodes.has(c)||!road)unmapped.push({blockId:block.id,a,c});else if(changed.has(road))roads.push(road);}
  if(roads.length){blockIds.add(block.id);blocks.push({id:block.id,roads:ordered(new Set(roads)),districtId:block.districtId??null});}
 }
 const properties=[],propertyIds=new Set(),plots=[],plotIds=new Set(),buildings=[];
 for(const p of city.properties??[]){b.spend();const block=blockIds.has(p.blockId),frontage=changed.has(p.frontageRoadId);if(block||frontage){propertyIds.add(p.id);properties.push({id:p.id,blockId:p.blockId,frontageRoadId:p.frontageRoadId??null,block,frontage});}}
 for(const p of city.plots??[]){b.spend();if(blockIds.has(p.blockId)||propertyIds.has(p.propertyId)||changed.has(p.frontageRoadId)){plotIds.add(p.id);plots.push(p.id);}}
 for(const p of city.buildings??[]){b.spend();if(blockIds.has(p.blockId)||propertyIds.has(p.propertyId)||plotIds.has(p.plotId)||changed.has(p.frontageRoadId))buildings.push(p.id);}
 return {affectedRoads:ordered(changed),blocks,properties,plots:ordered(new Set(plots)),buildings:ordered(new Set(buildings)),districts:ordered(new Set(blocks.map(x=>x.districtId).filter(x=>x!=null))),unmappedBlockEdges:unmapped,
  scope:'original-record-exposure-only',ownership:'not-verified',access:'not-verified',replacementFaces:'not-constructed'};
}
export async function diagnoseEmbeddingDependencies(caseId){
 const row=archive.get(caseId);if(!row)throw Error('Frozen dependency case required.');
 const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768}),base={caseId,source:row.source,authority:'none',observations:[]};
 const finish=status=>riFreeze({...base,status,stats:b.snapshot()});
 try{
  const f=materializeLockedRtreCase(caseId),before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');b.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(createHash('sha256').update(bytes).digest('hex')!==row.source)throw Error('Dependency source mismatch.');
  for(const o of row.observations)base.observations.push({type:o.type,graphValid:o.graphValid,changedOrders:o.embedding.changed.length,exposure:mapEmbeddingExposure(f.project.city,o.embedding,b)});
  if(aresReplayJson(f.project,b)!==before)throw Error('Dependency source mutated.');aresReplayJson(base,b);
  return finish('diagnosed');
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit');throw e;}
}
