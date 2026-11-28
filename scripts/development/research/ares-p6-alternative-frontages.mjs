// C2b: adjacent street eligibility inventory only. The actual operation
// must independently grant alternativeFrontage; this function never does.
import {classifyRoad} from '../../../src/core/road-graph.js';
import {classifyLareProperty,classifyLareBuilding} from '../../../src/core/reconciliation-policy.js';
import {STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../../../src/core/placement.js';
import {roadFrameLength} from '../../../src/core/geometry.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const charge=(b,n)=>b.spend(Math.max(1,n));
export function observeP6AlternativeFrontages(source,extraction,identity,fit,reshapes,access,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(!extraction?.valid||!identity?.correspondenceValid||fit?.status!=='property-fit-observed'||reshapes?.status!=='parcel-reshape-observed'||access?.status!=='same-frontage-access-observed'||[fit,reshapes,access].some(x=>x.authority!=='none'))return refuse('unqualified-input');
 const index=(records,field='id')=>{const m=new Map();for(const r of records){b.spend();const k=r[field];if(typeof k!=='string'||m.has(k))return null;m.set(k,r);}return m;};
 const properties=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),fitRows=index(fit.rows),reshapeRows=index(reshapes.rows),faces=index(extraction.faces.filter(f=>f.kind==='block'),'key');
 if(!properties||!plots||!buildings||!fitRows||!reshapeRows||!faces)return refuse('duplicate-inventory');
 const changed=new Set(),dependent=new Set(),failedAccess=new Set();
 for(const f of identity.changed){b.spend();if(f.kind==='block')changed.add(f.id);}
 for(const building of buildings.values()){
  b.spend();const g=building.geometry?.courtyardAccess;if(!g)continue;
  dependent.add(building.id);
  for(const o of g.occupants??[]){b.spend();dependent.add(o.buildingId);}
 }
 for(const row of access.rows){b.spend();if(!['retained','repaired'].includes(row.classification))failedAccess.add(row.propertyId);}
 const rows=[],counts={eligible:0,protected:0,notNeeded:0,unsupported:0,noAdjacent:0};
 for(const f of fit.rows){
  b.spend();const p=properties.get(f.id),r=reshapeRows.get(f.id);
  if(!p||!r||p.blockId!==f.oldBlockId)return refuse('invalid-property-census');
  const row={id:p.id,originalFrontage:p.frontageRoadId,classification:null,reason:null,options:[]};
  const finish=(kind,reason=null)=>{row.classification=kind;row.reason=reason;counts[kind]++;rows.push(row);};
  if(r.options.length&&!failedAccess.has(p.id)){finish('notNeeded');continue;}
  const own=[];
  for(const id of p.plotIds){b.spend();const q=plots.get(id);if(!q||q.propertyId!==p.id)return refuse('invalid-plot-owner');own.push(q);}
  aresReplayJson([p,own],b);
  const policy=classifyLareProperty(p,own);
  if(policy.mode!=='adaptive'||policy.provenance!=='generated'||p.buildingCompounds?.length){finish('protected','property-policy');continue;}
  let eligible=true;
  for(const id of p.buildingIds){
   b.spend();const building=buildings.get(id);
   if(!building||building.propertyId!==p.id)return refuse('invalid-building-owner');
   aresReplayJson(building,b);
   const permission=classifyLareBuilding(building,policy,dependent.has(id));
   if(permission.mode!=='rigid'||permission.provenance!=='generated'||building.frontageRoadId!==p.frontageRoadId)eligible=false;
  }
  if(!eligible){finish('protected','building-policy');continue;}
  if(own.some(q=>q.frontageRoadId!==p.frontageRoadId)||!changed.has(p.blockId)||f.options.length!==1){finish('unsupported','non-direct-changed-block-or-inconsistent-frontage');continue;}
  const o=f.options[0],face=faces.get(o.key);
  if(!face||face.roadIds.length!==face.polygon.length)return refuse('invalid-successor-face');
  charge(b,face.roadIds.length);
  const i=face.roadIds.indexOf(p.frontageRoadId);
  if(i<0){finish('unsupported','original-frontage-not-in-successor');continue;}
  const m=face.roadIds.length,seen=new Set();
  for(const j of [(i+m-1)%m,(i+1)%m]){
   b.spend();const id=face.roadIds[j],road=extraction.graph.roadsById.get(id),a=face.polygon[j],c=face.polygon[(j+1)%m];
   if(!road||!finite(a)||!finite(c))return refuse('missing-boundary-road');
   if(id===p.frontageRoadId||seen.has(id)||classifyRoad(road).protected||!Object.hasOwn(STREET_WIDTHS,road.kind))continue;
   seen.add(id);
   const length=roadFrameLength(c.x-a.x,c.y-a.y);
   if(length<7-1e-6)continue;
   row.options.push({key:o.key,roadId:id,edgeIndex:j,length,setback:(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK,
    permission:'requires-operation-authorization',geometry:'not-tested',authority:'none'});
  }
  finish(row.options.length?'eligible':'noAdjacent',row.options.length?null:'no-unprotected-adjacent-street');
 }
 const result={status:'alternative-frontage-observed',authority:'none',valid:false,landVerified:false,rows,counts,
  coverage:'direct-changed-block-adjacent-street-eligibility-only',permission:'not-granted',switches:'not-performed'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
