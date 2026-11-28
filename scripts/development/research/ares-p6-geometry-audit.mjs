import {STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../../../src/core/placement.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
const key=(c,id)=>JSON.stringify([c,id]);
const land=new Set(['blocks','properties','plots','buildings','openSpaces','plaza','waterFaces','terrainFaces']);
// Independent road-first projection oracle for known land and node-backed
// faces. No import of the observer, no candidate city, no collision claim.
// Non-node-backed infrastructure is deliberately outside this oracle.
export function auditP6Geometry(city,w,observation,geometry,b){
 if(!b?.spend)throw Error('Shared P6 budget required.');
 const nodes=new Map(),moves=new Map(),parents=new Set(),blocks=new Map(),items=new Map(),expected=new Map(),unsupported=new Set(),actual=new Map(),duplicates=[];
 for(const n of city.nodes){b.spend();nodes.set(n.id,n);}
 for(const n of w.requested){b.spend();moves.set(n.ref.id,n.point);}
 for(const n of w.neighbors){b.spend();moves.set(n.id,n.point);}
 for(const l of w.lineage){b.spend();parents.add(l.parent);}
 const ring=v=>Array.isArray(v)&&v.length>=3?v:null;
 const points=r=>{const v=ring(r.vertices);if(!v)return null;b.spend(v.length);return v.map(id=>nodes.get(id));};
 const add=(c,id,ps)=>{
  b.spend();const k=key(c,id);
  if(!ps||!ps.length){unsupported.add(k);return;}
  const bounds=[];
  for(const axis of ['x','y']){
   let lo=Infinity,hi=-Infinity;
   for(const p of ps){b.spend();if(!Number.isFinite(p?.[axis])){unsupported.add(k);return;}lo=Math.min(lo,p[axis]);hi=Math.max(hi,p[axis]);}
   bounds.push([lo,hi]);
  }
  items.set(k,bounds);
 };
 for(const r of city.blocks??[]){const ps=points(r);blocks.set(r.id,ps);add('blocks',r.id,ps);}
 for(const r of city.properties??[]){
  const v=ring(r.boundary),f=r.frontage;
  b.spend((v?.length??0)+(Array.isArray(f)?f.length:0)+1);
  add('properties',r.id,v&&(f===undefined||Array.isArray(f)&&f.length)?v.concat(f??[]):null);
 }
 for(const r of city.plots??[])add('plots',r.id,ring(r.boundary));
 for(const r of city.buildings??[]){
  const regions=r.geometry?.regions,ps=[];let ok=Array.isArray(regions)&&regions.length>0;
  for(const region of regions??[]){b.spend();const v=ring(region.ring);if(!v){ok=false;continue;}for(const p of v){b.spend();ps.push(p);}}
  for(const p of [r.entrance,...(r.accessPath??[])]){b.spend();ps.push(p);}
  add('buildings',r.id,ok?ps:null);
 }
 for(const r of city.openSpaces??[])add('openSpaces',r.id,blocks.get(r.blockId));
 for(const c of ['waterFaces','terrainFaces'])for(const r of city[c]??[])add(c,r.id,points(r));
 if(city.plaza)add('plaza',city.plaza.id,points(city.plaza));
 const intersects=(axes,ps,margin)=>{
  for(let i=0;i<2;i++){
   b.spend(ps.length);const axis=i===0?'x':'y',v=ps.map(p=>p?.[axis]);
   if(v.some(x=>!Number.isFinite(x)))throw Error('Invalid oracle road endpoint.');
   const low=Math.min(...v),high=Math.max(...v);
   if(axes[i][0]-high-margin>1e-7||low-axes[i][1]-margin>1e-7)return false;
  }
  return true;
 };
 const inside=new Set(),external=new Set();
 for(const o of observation.objects){b.spend();inside.add(key(o.ref.collection,o.ref.id));}
 for(const o of observation.external??[]){b.spend();external.add(key(o.ref.collection,o.ref.id));}
 let roads=0;
 for(const r of city.roads){
  b.spend();if(!parents.has(r.id)&&!moves.has(r.a)&&!moves.has(r.b))continue;roads++;
  const old=[nodes.get(r.a),nodes.get(r.b)],final=[moves.get(r.a)??old[0],moves.get(r.b)??old[1]],margin=(STREET_WIDTHS[r.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
  for(const [k,axes] of items){
   b.spend();if(!intersects(axes,old.concat(final),margin))continue;
   const before=intersects(axes,old,margin),after=intersects(axes,final,margin),pair=JSON.stringify([k,r.id]);
   expected.set(pair,JSON.stringify([before,after,inside.has(k)?'explicit':external.has(k)?'external':'outside-explicit',!['blocks','properties','plots','buildings','openSpaces'].includes(JSON.parse(k)[0])]));
  }
 }
 const actualUnsupported=new Set(),seenRows=new Set();
 for(const row of geometry.rows){
  b.spend();if(!land.has(row.ref.collection))continue;
  const k=key(row.ref.collection,row.ref.id);
  if(seenRows.has(k))duplicates.push(k);seenRows.add(k);
  for(const hit of row.hits){b.spend();const p=JSON.stringify([k,hit.roadId]);if(actual.has(p))duplicates.push(p);actual.set(p,JSON.stringify([hit.before,hit.final,row.membership,row.protectedContext]));}
 }
 for(const r of geometry.unsupported){b.spend();if(land.has(r.collection)){const k=key(r.collection,r.id);if(actualUnsupported.has(k))duplicates.push(k);actualUnsupported.add(k);}}
 const missing=[],extra=[],wrong=[],missingUnsupported=[],extraUnsupported=[];
 for(const [k,v] of expected){b.spend();if(!actual.has(k))missing.push(k);else if(actual.get(k)!==v)wrong.push(k);}
 for(const k of actual.keys()){b.spend();if(!expected.has(k))extra.push(k);}
 for(const k of unsupported){b.spend();if(!actualUnsupported.has(k))missingUnsupported.push(k);}
 for(const k of actualUnsupported){b.spend();if(!unsupported.has(k))extraUnsupported.push(k);}
 for(const ar of [missing,extra,wrong,duplicates,missingUnsupported,extraUnsupported]){b.spend(Math.max(1,ar.length*Math.ceil(Math.log2(ar.length+1))));ar.sort(riCompare);}
 const matched=roads===geometry.roadCount&&![missing,extra,wrong,duplicates,missingUnsupported,extraUnsupported].some(x=>x.length);
 return riFreeze({authority:'none',status:geometry.status==='scope-limit'?'scope-limit':matched?'matched':'geometry-mismatch',coverage:'land-and-node-backed-face-bounds-only',roads,records:items.size+unsupported.size,pairs:expected.size,missing,extra,wrong,duplicates,missingUnsupported,extraUnsupported});
}
