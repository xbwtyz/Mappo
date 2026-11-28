import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
import {auditP6ExplicitInventory} from './ares-p6-inventory-audit.mjs';
const key=r=>JSON.stringify([r.collection,r.id]);
const land=new Set(['blocks','properties','plots','buildings','openSpaces']);
const ownership=new Set(['block','property','plot','building','compound-member','courtyard-occupant']);
const protectedKinds=new Set(['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces','walls','gates','towers','plaza','districts']);
// Observational closure only. A broad-phase hit is a new observation seed,
// never a writable object or approval to reshape its neighbors.
export function observeP6LandClosure(city,w,observation,geometry,edges,b){
 if(!b?.spend)throw Error('Shared P6 budget required.');
 const roots=new Map(),adj=new Map(),depth=new Map(),known=new Map(),geometricRoots=new Map(),context=new Map(),omitted=new Map(),prior=new Set();
 const addRoot=r=>{b.spend();roots.set(key(r),r);};
 for(const r of observation.roots)addRoot(r);
 for(const o of observation.objects){b.spend();prior.add(key(o.ref));}
 for(const hit of geometry.rows){
  b.spend();const r=hit.ref,k=key(r);
  if(land.has(r.collection)&&!hit.protectedContext){geometricRoots.set(k,r);addRoot(r);}
  else context.set(k,r);
 }
 for(const e of edges){
  b.spend();const a=key(e.from),c=key(e.to);
  known.set(a,e.from);known.set(c,e.to);
  if(!adj.has(a))adj.set(a,[]);
  if(!adj.has(c))adj.set(c,[]);
  adj.get(a).push({ref:e.to,relation:e.relation});
  if(a!==c)adj.get(c).push({ref:e.from,relation:e.relation});
 }
 const ordered=map=>{b.spend(Math.max(1,map.size*Math.ceil(Math.log2(map.size+1))));return [...map.keys()].sort(riCompare);};
 const queue=ordered(roots);for(const k of queue){b.spend();depth.set(k,0);known.set(k,roots.get(k));}
 const finish=(status,extra={})=>riFreeze({authority:'none',landVerified:false,status,...extra});
 if(queue.length+context.size>10000)return finish('scope-limit');
 for(let i=0;i<queue.length;i++){
  const k=queue[i],here=known.get(k),n=depth.get(k);
  for(const e of adj.get(k)??[]){
   b.spend();const r=e.ref,j=key(r);
   if(depth.has(j))continue;
   const follow=land.has(r.collection)&&((land.has(here.collection)&&ownership.has(e.relation))||(here.collection==='roads'&&e.relation==='frontage'));
   if(!follow){context.set(j,r);continue;}
   if(n>=6){omitted.set(j,r);continue;}
   if(depth.size>=10000)return finish('scope-limit');
   depth.set(j,n+1);queue.push(j);
  }
 }
 for(const k of depth.keys()){b.spend();context.delete(k);omitted.delete(k);}
 if(depth.size+context.size>10000)return finish('scope-limit');
 const objects=ordered(depth).map(k=>{b.spend();return {ref:known.get(k),depth:depth.get(k),classification:'observe-only',newObservation:!prior.has(k)};});
 const external=ordered(context).map(k=>{b.spend();const ref=context.get(k);return {ref,classification:protectedKinds.has(ref.collection)?'protected-context':'observe-only'};});
 const omittedRefs=ordered(omitted).map(k=>omitted.get(k));
 const inventory={roots:ordered(roots).map(k=>roots.get(k)),objects,omitted:omittedRefs};
 // Independent raw-record fixed-point traversal receives only the additional
 // broad-phase seeds, not the graph traversal's output as expected truth.
 const audit=auditP6ExplicitInventory(city,w,inventory,b,[...geometricRoots.values()]);
 const added=objects.filter(x=>{b.spend();return x.newObservation;});
 const counts={};for(const x of added){b.spend();const c=x.ref.collection;counts[c]=(counts[c]??0)+1;}
 const status=audit.status!=='matched'?'inventory-mismatch':omittedRefs.length?'scope-incomplete':geometry.status!=='broad-phase-observed'?'geometry-unresolved':'closure-observed';
 return finish(status,{inventory,external,audit,counts,geometricSeeds:geometricRoots.size,added:added.length,unionSize:objects.length+external.length});
}
