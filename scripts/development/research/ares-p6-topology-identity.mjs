// Narrow detached identity hypothesis. No accepted record, ID reservation,
// deletion, geometry change or authorization. Only a complete 1:1 census
// with the exact original directed boundary and original road endpoints.
const charge=(b,n)=>b.spend(Math.max(1,n));
const edge=(a,c)=>JSON.stringify([a,c].sort());
function cycle(ids,b){
 charge(b,2*ids.length);
 if(ids.length<3||new Set(ids).size!==ids.length)return null;
 let start=0;
 for(let i=1;i<ids.length;i++)if(ids[i]<ids[start])start=i;
 return JSON.stringify([...ids.slice(start),...ids.slice(0,start)]);
}
export function observeP6TopologyIdentity(source,extraction,identity,b){
 const refuse=reason=>({status:'not-proven',reason,authority:'none',valid:false});
 b.spend();
 if(!extraction?.valid||!identity?.correspondenceValid||identity.authority!=='none'||identity.valid!==false)return refuse('unqualified-diagnostic');
 if(identity.added.length!==1||identity.removed.length!==1||identity.split.length||identity.merged.length||identity.ambiguous.length)return refuse('not-isolated-one-to-one');
 const added=identity.added[0],removed=identity.removed[0];
 if(added.kind!=='block'||removed.kind!=='block')return refuse('not-ordinary-block');
 const oldRows=[...source.blocks.map(record=>({kind:'block',record})),{kind:'plaza',record:source.plaza}];
 charge(b,oldRows.length+extraction.faces.length);
 const oldById=new Map(oldRows.map(x=>[x.record.id,x])),freshByKey=new Map(extraction.faces.map(f=>[f.key,f]));
 if(oldById.size!==oldRows.length||freshByKey.size!==extraction.faces.length)return refuse('duplicate-inventory');
 const old=oldById.get(removed.id)?.record,fresh=freshByKey.get(added.candidateKey);
 if(!old||!fresh||fresh.kind!=='block'||fresh.area<=1)return refuse('missing-or-small-face');
 const seenOld=new Set([old.id]),seenNew=new Set([fresh.key]);
 for(const row of [...identity.preserved,...identity.changed]){
  b.spend();
  if(seenOld.has(row.id)||seenNew.has(row.candidateKey)||oldById.get(row.id)?.kind!==row.kind||freshByKey.get(row.candidateKey)?.kind!==row.kind)return refuse('nonunique-census');
  seenOld.add(row.id);seenNew.add(row.candidateKey);
 }
 if(seenOld.size!==oldById.size||seenNew.size!==freshByKey.size)return refuse('incomplete-census');
 const a=cycle(old.vertices,b),c=cycle(fresh.vertices,b);
 if(!a||a!==c||c!==fresh.key)return refuse('different-directed-cycle');
 const byEdge=new Map();
 for(const r of source.roads){b.spend();const k=edge(r.a,r.b);if(byEdge.has(k))return refuse('duplicate-source-edge');byEdge.set(k,r);}
 const roadIds=[];
 for(let i=0;i<fresh.vertices.length;i++){
  b.spend();
  const k=edge(fresh.vertices[i],fresh.vertices[(i+1)%fresh.vertices.length]),prior=byEdge.get(k),next=extraction.graph.roadsById.get(fresh.roadIds[i]);
  if(!prior||!next||prior.id!==next.id||prior.kind!==next.kind||edge(next.a,next.b)!==k)return refuse('different-boundary-road');
  roadIds.push(prior.id);
 }
 if(new Set(roadIds).size!==roadIds.length)return refuse('duplicate-boundary-road');
 const properties=[],plots=[],buildings=[],openSpaces=[];
 for(const [collection,output] of [['properties',properties],['plots',plots],['buildings',buildings],['openSpaces',openSpaces]]){
  for(const record of source[collection]??[]){b.spend();if(record.blockId===old.id)output.push(record.id);}
 }
 return {status:'topology-correspondence-observed',authority:'none',valid:false,oldId:old.id,candidateKey:fresh.key,
  roadIds,oldArea:old.area,newArea:fresh.area,retainedAreaRatio:fresh.area/old.area,
  directBlockReferences:{properties,plots,buildings,openSpaces},landFit:'not-evaluated',ownership:'not-assigned'};
}
