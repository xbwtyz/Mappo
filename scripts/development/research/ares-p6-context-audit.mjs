import {inspectOpaqueRoadDependencies,riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
const key=r=>JSON.stringify([r.collection,r.id]);
const protectedKinds=new Set(['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces','walls','gates','towers']);
// Compare A1's external listing to the complete incident-edge inventory,
// without trusting A1's traversal context set. This is not a second raw
// reference parser and does not claim geometric closure.
export function auditP6ExternalContext(observation,b){
 const inside=new Set(),expected=new Map(),actual=new Map(),duplicates=[];
 for(const o of observation.objects){b.spend();inside.add(key(o.ref));}
 for(const e of observation.relationships){
  b.spend();const a=key(e.from),c=key(e.to);
  if(inside.has(a)&&!inside.has(c))expected.set(c,e.to);
  if(inside.has(c)&&!inside.has(a))expected.set(a,e.from);
 }
 for(const o of observation.external){b.spend();const k=key(o.ref);if(actual.has(k))duplicates.push(k);actual.set(k,o);}
 const missing=[],extra=[],wrong=[];
 // Incomplete ownership closure may deliberately omit a land dependency;
 // retain that as a discrepancy, rather than silently deem it external.
 for(const [k,r] of expected){
  b.spend();if(!actual.has(k))missing.push(k);
  else if(actual.get(k).classification!==(protectedKinds.has(r.collection)?'protected':'observe-only'))wrong.push(k);
 }
 for(const k of actual.keys()){b.spend();if(!expected.has(k))extra.push(k);}
 for(const a of [missing,extra,wrong,duplicates]){b.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));a.sort(riCompare);}
 return riFreeze({authority:'none',status:missing.length||extra.length||wrong.length||duplicates.length?'context-mismatch':'matched',
  expected:expected.size,missing,extra,wrong,duplicates});
}
export function observeP6OpaqueContext(project,b){
 const nodesById=new Map(),roadsById=new Map(),issues=new Map();
 for(const n of project.city.nodes){b.spend();nodesById.set(n.id,n);}
 for(const r of project.city.roads){b.spend();roadsById.set(r.id,r);}
 // Existing conservative contract is reused as an observer only; known
 // fields unsupported by its older policy remain review flags, not errors
 // or deletion authority. No graph build, allocation or candidate mutation.
 inspectOpaqueRoadDependencies(project,{nodesById,roadsById},(kind,id,code,message,related,metrics)=>{
  b.spend();const row={kind,id,code,field:metrics?.field??null};
  issues.set(JSON.stringify(row),row);
 },n=>b.spend(n));
 const rows=[...issues.entries()];
 b.spend(Math.max(1,rows.length*Math.ceil(Math.log2(rows.length+1))));
 rows.sort(([a],[c])=>riCompare(a,c));
 return riFreeze({authority:'none',status:rows.length?'review-required':'no-known-opaque-flags',coverage:'existing-road-contract-only',rows:rows.map(([,r])=>r)});
}
