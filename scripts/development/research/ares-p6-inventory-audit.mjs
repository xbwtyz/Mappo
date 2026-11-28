import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';

// A2a: independent raw-record inventory oracle. No graph discovery import,
// no calls to construction or search, and no separately allocated budget.
// This is reference coverage only; geometric coverage is a later A2 gate.
const key=(c,id)=>JSON.stringify([c,id]);
const land=['blocks','properties','plots','buildings','openSpaces'];
const order=(a,b)=>riCompare(a,b);
export function auditP6ExplicitInventory(city,w,observed,b,additionalLandRoots=[]){
 if(!b?.spend)throw Error('Shared P6 budget required.');
 const nodes=new Set(),roads=new Set(),pairs=new Set(),roots=new Set(),links=[];
 for(const n of w.requested){b.spend();nodes.add(n.ref.id);}
 for(const n of w.neighbors){b.spend();nodes.add(n.id);}
 for(const l of w.lineage){b.spend();roads.add(l.parent);}
 for(const r of city.roads){b.spend();if(nodes.has(r.a)||nodes.has(r.b))roads.add(r.id);}
 for(const r of city.roads){b.spend();if(roads.has(r.id)){pairs.add(key(r.a,r.b));pairs.add(key(r.b,r.a));}}
 for(const id of nodes){b.spend();roots.add(key('nodes',id));}
 for(const id of roads){b.spend();roots.add(key('roads',id));}
 const records=new Set();
 const connect=(a,c,id)=>{b.spend();if(id!=null)links.push([a,key(c,id)]);};
 const many=(a,c,ids)=>{for(const id of ids??[])connect(a,c,id);};
 for(const c of land)for(const row of city[c]??[]){
  b.spend();const k=key(c,row.id);
  if(records.has(k))throw Error('Duplicate A2 land record.');
  records.add(k);
  if(roads.has(row.frontageRoadId))roots.add(k);
  if(c==='blocks'){
   const v=row.vertices;
   for(let i=0;i<v.length;i++){b.spend();if(nodes.has(v[i])||pairs.has(key(v[i],v[(i+1)%v.length])))roots.add(k);}
  }else connect(k,'blocks',row.blockId);
  if(c==='plots'||c==='buildings')connect(k,'properties',row.propertyId);
  if(c==='properties'||c==='buildings')many(k,'plots',row.plotIds);
  if(c==='properties'){
   many(k,'buildings',row.buildingIds);
   for(const compound of row.buildingCompounds??[]){b.spend();many(k,'buildings',compound.memberBuildingIds);}
  }
  if(c==='buildings')for(const occupant of row.geometry?.courtyardAccess?.occupants??[])connect(k,'buildings',occupant.buildingId);
 }
 for(const r of additionalLandRoots){b.spend();const k=key(r.collection,r.id);if(!land.includes(r.collection)||!records.has(k))throw Error('Unknown A2 geometric seed.');roots.add(k);}
 for(const [a,c] of links){b.spend();if(!records.has(a)||!records.has(c))throw Error('Missing A2 ownership reference.');}
 // Fixed-point scans rather than the A1 graph traversal. Each pass reads
 // the previous frontier only, so depths are shortest ownership distances.
 const depth=new Map();for(const k of roots){b.spend();depth.set(k,0);}
 let frontier=new Set(roots),omitted=new Set();
 if(depth.size>10000)return riFreeze({status:'scope-limit',authority:'none'});
 for(let hop=1;hop<=7&&frontier.size;hop++){
  const next=new Set();
  for(const [a,c] of links){
   b.spend();
   if(frontier.has(a)&&!depth.has(c))next.add(c);
   if(frontier.has(c)&&!depth.has(a))next.add(a);
  }
  if(hop===7){omitted=next;break;}
  if(depth.size+next.size>10000)return riFreeze({status:'scope-limit',authority:'none'});
  for(const k of next){b.spend();depth.set(k,hop);}
  frontier=next;
 }
 const compare=(expected,claimed)=>{
  b.spend(Math.max(1,expected.size+claimed.length));
  const got=new Map(),duplicates=[];
  for(const [k,v] of claimed){b.spend();if(got.has(k))duplicates.push(k);got.set(k,v);}
  const missing=[],extra=[],wrong=[];
  for(const [k,v] of expected){b.spend();if(!got.has(k))missing.push(k);else if(got.get(k)!==v)wrong.push(k);}
  for(const k of got.keys()){b.spend();if(!expected.has(k))extra.push(k);}
  for(const xs of [missing,extra,wrong,duplicates]){b.spend(Math.max(1,xs.length*Math.ceil(Math.log2(xs.length+1))));xs.sort(order);}
  return {missing,extra,wrong,duplicates};
 };
 const rootsExpected=new Map();for(const k of roots){b.spend();rootsExpected.set(k,true);}
 const omittedExpected=new Map();for(const k of omitted){b.spend();omittedExpected.set(k,true);}
 b.spend(Math.max(1,observed.roots.length+observed.objects.length+observed.omitted.length));
 const differences={
  roots:compare(rootsExpected,observed.roots.map(r=>[key(r.collection,r.id),true])),
  objects:compare(depth,observed.objects.map(r=>[key(r.ref.collection,r.ref.id),r.depth])),
  omitted:compare(omittedExpected,observed.omitted.map(r=>[key(r.collection,r.id),true]))
 };
 const match=Object.values(differences).every(row=>Object.values(row).every(xs=>xs.length===0));
 return riFreeze({status:match?'matched':'inventory-mismatch',authority:'none',
  expected:{roots:roots.size,objects:depth.size,omitted:omitted.size},differences});
}
