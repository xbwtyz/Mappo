// Independent raw-record census and conservative dependent geometry extension.
// No geometry changes, ownership assignments, or claims of swept clearance.
import {STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../../../src/core/placement.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const cmp=(a,c)=>a<c?-1:a>c?1:0;
const charge=(b,n)=>b.spend(Math.max(1,n));
const sort=(xs,b)=>{charge(b,xs.length*Math.max(1,Math.ceil(Math.log2(xs.length+1))));return xs.sort(cmp);};
const same=(a,c,b)=>aresReplayJson(a,b)===aresReplayJson(c,b);
const ref=(collection,id)=>JSON.stringify([collection,id]);
function interval(points,axis,b){
 if(!Array.isArray(points)||!points.length)return null;
 let lo=Infinity,hi=-Infinity;
 for(const p of points){b.spend();if(!Number.isFinite(p?.[axis]))return null;lo=Math.min(lo,p[axis]);hi=Math.max(hi,p[axis]);}
 return [lo,hi];
}
function extent(points,b){
 const x=interval(points,'x',b),y=interval(points,'y',b);
 return x&&y?[x,y]:null;
}
function intersects(a,c){return a.every(([lo,hi],i)=>!(hi<c[i][0]-1e-7||lo>c[i][1]+1e-7));}
export function auditP6AffectedProperties(source,proposed,identity,lineage,observed,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refused=reason=>({status:'mismatch',reason,authority:'none',valid:false,landVerified:false});
 if(!identity?.correspondenceValid||identity.authority!=='none'||!lineage?.lineageValid||lineage.authority!=='none'||observed?.authority!=='none'||!Array.isArray(observed.rows))return refused('unqualified-input');
 const index=records=>{const m=new Map();for(const row of records){b.spend();if(m.has(row.id))return null;m.set(row.id,row);}return m;};
 const oldNodes=index(source.nodes),newNodes=index(proposed.nodes),oldRoads=index(source.roads),newRoads=index(proposed.roads);
 const properties=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),reported=index(observed.rows);
 if(!oldNodes||!newNodes||!oldRoads||!newRoads||!properties||!plots||!buildings||!reported)return refused('duplicate-inventory');
 const altered=new Set(),successors=new Map();
 for(const row of identity.changed){b.spend();if(row.kind==='block')altered.add(row.id);}
 for(const group of [...identity.split,...identity.merged,...identity.ambiguous])for(const id of group.oldIds){b.spend();altered.add(id);}
 for(const row of lineage.reverse){b.spend();successors.set(row.oldId,row.candidateKeys);}
 const roadIds=sort([...new Set([...oldRoads.keys(),...newRoads.keys()])],b),envelopes=new Map();
 const roadPoints=(r,ns)=>r?[ns.get(r.a),ns.get(r.b)]:[];
 for(const id of roadIds){
  b.spend();const a=oldRoads.get(id),c=newRoads.get(id),x=roadPoints(a,oldNodes),y=roadPoints(c,newNodes);
  if(a&&c&&a.a===c.a&&a.b===c.b&&a.kind===c.kind&&x.every((p,i)=>p&&y[i]&&Object.is(p.x,y[i].x)&&Object.is(p.y,y[i].y)))continue;
  const ranges=[];
  for(const [row,points] of [[a,x],[c,y]])if(row){
   const q=extent(points,b),m=(STREET_WIDTHS[row.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
   if(!q||!Number.isFinite(m))return refused('unsupported-road-geometry');
   ranges.push(q.map(([lo,hi])=>[lo-m,hi+m]));
  }
  envelopes.set(id,[0,1].map(i=>[Math.min(...ranges.map(q=>q[i][0])),Math.max(...ranges.map(q=>q[i][1]))]));
 }
 if(!same(sort([...altered],b),observed.affectedBlockIds,b)||!same([...envelopes.keys()],observed.changedRoadIds,b)||observed.scanned!==properties.size)return refused('root-census-mismatch');
 const deps=new Map(),extraGeometry=new Map(),unknown=[],linked=new Map();
 function geometryHits(q){const hits=[];for(const [id,road] of envelopes){b.spend();if(intersects(q,road))hits.push(id);}return hits;}
 for(const [collection,records,field] of [['plots',plots,'plotIds'],['buildings',buildings,'buildingIds']])for(const record of records.values()){
  b.spend();const owner=properties.get(record.propertyId);
  if(!owner||!Array.isArray(owner[field]))return refused('missing-dependent-owner');
  charge(b,owner[field].length);
  if(owner[field].filter(id=>id===record.id).length!==1)return refused('nonreciprocal-dependent');
  const link=linked.get(owner.id)??[];link.push({collection,id:record.id});linked.set(owner.id,link);
  if(altered.has(record.blockId)||envelopes.has(record.frontageRoadId)){
   const list=deps.get(owner.id)??[];list.push({collection,id:record.id});deps.set(owner.id,list);
  }
  if(!envelopes.size)continue;
  let q=null;
  if(collection==='plots')q=Array.isArray(record.boundary)&&record.boundary.length>=3?extent(record.boundary,b):null;
  else{
   const regions=record.geometry?.regions,points=[];
   let supported=Array.isArray(regions)&&regions.length>0&&Array.isArray(record.accessPath)&&!!record.entrance;
   if(supported)for(const region of regions){
    b.spend();if(!Array.isArray(region.ring)||region.ring.length<3){supported=false;break;}
    charge(b,region.ring.length);for(const point of region.ring)points.push(point);
   }
   if(supported){charge(b,record.accessPath.length+1);points.push(record.entrance);for(const point of record.accessPath)points.push(point);q=extent(points,b);}
  }
  const item={collection,id:record.id};
  if(!q){unknown.push({...item,propertyId:owner.id});continue;}
  const hits=geometryHits(q);
  if(hits.length){const list=extraGeometry.get(owner.id)??[];list.push({...item,roadIds:hits});extraGeometry.set(owner.id,list);}
 }
 const compareRef=(a,c)=>cmp(a.collection,c.collection)||cmp(a.id,c.id);
 const orderRefs=xs=>{charge(b,xs.length*Math.max(1,Math.ceil(Math.log2(xs.length+1))));return xs.sort(compareRef);};
 const expected=[],unsupported=[],expanded=[],scope=new Set();
 function mark(collection,id){b.spend();scope.add(ref(collection,id));return scope.size<=10000;}
 for(const id of altered)if(!mark('blocks',id))return refused('scope-limit');
 for(const id of envelopes.keys())if(!mark('roads',id))return refused('scope-limit');
 for(const property of properties.values()){
  b.spend();const keys=successors.get(property.blockId);
  if(!keys)return refused('missing-block-lineage');
  const children=linked.get(property.id)??[];
  for(const [field,collection,records] of [['plotIds','plots',plots],['buildingIds','buildings',buildings]]){
   if(!Array.isArray(property[field]))return refused('missing-dependent-list');
   const seen=new Set();
   for(const id of property[field]){b.spend();if(seen.has(id)||records.get(id)?.propertyId!==property.id)return refused('nonreciprocal-dependent');seen.add(id);}
  }
  let q=Array.isArray(property.boundary)&&property.boundary.length>=3?extent(property.boundary,b):null;
  if(property.frontage!==undefined){
   const f=extent(property.frontage,b);
   q=q&&f?q.map(([lo,hi],i)=>[Math.min(lo,f[i][0]),Math.max(hi,f[i][1])]):null;
  }
  const hits=q?geometryHits(q):[],d=orderRefs(deps.get(property.id)??[]),reasons=[];
  if(altered.has(property.blockId))reasons.push('changed-block');
  if(envelopes.has(property.frontageRoadId))reasons.push('changed-frontage');
  if(d.length)reasons.push('dependent-reference');
  if(hits.length)reasons.push('road-bounds-contact');
  if(!q){unsupported.push(property.id);reasons.push('unsupported-property-geometry');}
  const actual=reported.get(property.id);
  if(reasons.length){
   expected.push(property.id);
   if(!actual||actual.oldBlockId!==property.blockId||!same(actual.candidateKeys,keys,b)||!same(actual.reasons,reasons,b)||!same(actual.roadBoundsHits,hits,b)||!same(actual.dependentHits,d,b)||!same(actual.plotIds,sort([...property.plotIds],b),b)||!same(actual.buildingIds,sort([...property.buildingIds],b),b))return refused('property-observation-mismatch');
  }else if(actual)return refused('unexpected-property-observation');
  const geometry=orderRefs(extraGeometry.get(property.id)??[]);
  if(reasons.length||geometry.length){
   if(!mark('properties',property.id)||!mark('blocks',property.blockId))return refused('scope-limit');
   for(const child of children)if(!mark(child.collection,child.id))return refused('scope-limit');
   expanded.push({id:property.id,oldBlockId:property.blockId,candidateKeys:keys,baseObserved:!!reasons.length,dependentGeometryHits:geometry,classification:'observe-only'});
  }
 }
 // Include open spaces of observed owner blocks as known scope context.
 for(const row of source.openSpaces??[]){b.spend();if(scope.has(ref('blocks',row.blockId))&&!mark('openSpaces',row.id))return refused('scope-limit');}
 if(expected.length!==reported.size||!same(sort(unsupported,b),observed.unsupported,b))return refused('property-census-mismatch');
 charge(b,expanded.length*Math.max(1,Math.ceil(Math.log2(expanded.length+1))));
 expanded.sort((a,c)=>cmp(a.id,c.id));orderRefs(unknown);
 const result={status:'matched',authority:'none',valid:false,landVerified:false,baseCount:expected.length,expandedCount:expanded.length,
  extraCount:expanded.length-expected.length,knownScopeCount:scope.size,rows:expanded,unsupportedDependentGeometry:unknown,
  geometryCoverage:unknown.length||unsupported.length?'unresolved':'known-envelope-only',scopeCoverage:'known-land-and-changed-road-references-only'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
