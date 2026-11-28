// Detached C1b2 first-pass same-frontage, positive affine parcel candidates.
// Every existing building is held fixed in this pass. No assignment or Apply.
import {shapeWellFormed,shapeContained} from '../../../src/core/building-validation.js';
import {propertyFits,STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../../../src/core/placement.js';
import {classifyLareProperty} from '../../../src/core/reconciliation-policy.js';
import {larePlotAdjacency,verifyLarePlotDeformation} from '../../../src/core/reconciliation-plots.js';
import {LareBudgetExceeded,LARE_LIMITS} from '../../../src/core/reconciliation-budget.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
const eps=1e-6;
const dot=(p,o,t)=>(p.x-o.x)*t.x+(p.y-o.y)*t.y;
const clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function observeP6ParcelReshapes(source,extraction,fit,b){
 if(!b?.spend||!b?.expand||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,valid:false,authority:'none',landVerified:false});
 if(!extraction?.valid||fit?.status!=='property-fit-observed'||fit.authority!=='none')return refuse('unqualified-input');
 const index=(records,field='id')=>{const map=new Map();for(const r of records){b.spend();const key=r[field];if(typeof key!=='string'||map.has(key))return null;map.set(key,r);}return map;};
 const properties=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),faces=index(extraction.faces.filter(f=>f.kind==='block'),'key');
 if(!properties||!plots||!buildings||!faces)return refuse('duplicate-inventory');
 const rows=[],seen=new Set(),counts={worldPreserved:0,reshaped:0,noCandidate:0,protected:0,unsupported:0};
 for(const item of fit.rows){
  b.spend();const p=properties.get(item.id);
  if(!p||seen.has(p.id)||p.blockId!==item.oldBlockId)return refuse('invalid-property-census');
  seen.add(p.id);
  const own=[],fixed=[];
  for(const id of p.plotIds){b.spend();const plot=plots.get(id);if(!plot||plot.propertyId!==p.id)return refuse('invalid-plot-owner');own.push(plot);}
  aresReplayJson([p,own],b);
  const policy=classifyLareProperty(p,own);
  const row={id:p.id,policy,options:[],attempts:0,classification:'noCandidate'};
  const finish=classification=>{row.classification=classification;counts[classification]++;rows.push(row);};
  if(policy.mode!=='adaptive'){finish('protected');continue;}
  let supported=true;
  for(const id of p.buildingIds){
   b.spend();const building=buildings.get(id);
   if(!building||building.propertyId!==p.id)return refuse('invalid-building-owner');
   const regions=building.geometry?.regions;
   if(!Array.isArray(regions)||!regions.length){supported=false;continue;}
   for(const region of regions){
    b.spend();const ring=region.ring,n=Array.isArray(ring)?ring.length:0;
    charge(b,8*n*n+n);
    if(!shapeWellFormed(ring)&&!shapeWellFormed(Array.isArray(ring)?[...ring].reverse():[])){supported=false;continue;}
    // Include all regions as a conservative fixed footprint constraint.
    fixed.push(ring);
   }
  }
  const original=p.boundary,n=Array.isArray(original)?original.length:0;
  charge(b,8*n*n+n);
  if(!supported||!shapeWellFormed(original)||!own.length||own.some(q=>!Array.isArray(q.boundary))){finish('unsupported');continue;}
  let adjacency;
  try{
   adjacency=larePlotAdjacency(own,b);
   verifyLarePlotDeformation(original,own,own,b,adjacency);
  }catch(error){if(error instanceof LareBudgetExceeded)throw error;finish('unsupported');continue;}
  const f0=original[0],f1=original[1],width=Math.hypot(f1.x-f0.x,f1.y-f0.y);
  if(width<=eps){finish('unsupported');continue;}
  const oldT={x:(f1.x-f0.x)/width,y:(f1.y-f0.y)/width},oldN={x:-oldT.y,y:oldT.x};
  const minWidth=Math.min(7,width);
  const keys=new Set();
  for(const option of item.options){
   b.spend();const face=faces.get(option.key);
   if(!face||keys.has(option.key))return refuse('invalid-successor-face');keys.add(option.key);
   if(!option.originalFrontagePresent)continue;
   const points=face.polygon,m=points.length,edges=[];
   for(let i=0;i<m;i++){b.spend();const road=extraction.graph.roadsById.get(face.roadIds[i]);if(!road)return refuse('missing-boundary-road');edges.push({a:points[i],c:points[(i+1)%m],road});}
   const edge=edges.find(e=>e.road.id===p.frontageRoadId);
   if(!edge)return refuse('frontage-evidence-mismatch');
   const {a,c}=edge,length=Math.hypot(c.x-a.x,c.y-a.y);
   if(length<=eps)continue;
   const t={x:(c.x-a.x)/length,y:(c.y-a.y)/length},inward={x:-t.y,y:t.x};
   if(oldT.x*t.x+oldT.y*t.y<=0)continue;
   const setback=(STREET_WIDTHS[edge.road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
   if(!Number.isFinite(setback))return refuse('unsupported-frontage');
   const local=p=>({u:dot(p,f0,oldT),v:dot(p,f0,oldN)});
   const project=p=>({u:dot(p,a,t),v:dot(p,a,inward)});
   const leftOld=project(f0),rightOld=project(f1),center=(leftOld.u+rightOld.u)/2;
   const fixedCorners=fixed.reduce((sum,r)=>sum+r.length,0),plotCorners=own.reduce((sum,r)=>sum+r.boundary.length,0);
   const streetEdges=edges.map(e=>({a:e.a,b:e.c,road:e.road}));
   const attempt=(family,map)=>{
    if(row.options.length>=LARE_LIMITS.parcelCandidates)return false;
    b.expand();row.attempts++;
    charge(b,8*n*n+24*n*m+8*n*fixedCorners+n+plotCorners);
    const boundary=original.map(map),l=project(boundary[0]),r=project(boundary[1]);
    if(l.u< -eps||r.u>length+eps||r.u-l.u<minWidth-eps||Math.abs(l.v-r.v)>1e-5||l.v<setback-eps||
      !shapeWellFormed(boundary)||!shapeContained(boundary,points)||!propertyFits(boundary,points,streetEdges)||fixed.some(ring=>!shapeContained(ring,boundary)))return false;
    const next=own.map(q=>({...q,boundary:q.boundary.map(map)}));
    try{verifyLarePlotDeformation(boundary,own,next,b,adjacency);}
    catch(error){if(error instanceof LareBudgetExceeded)throw error;return false;}
    const geometry={key:option.key,family,boundary,plots:next.map(q=>({id:q.id,boundary:q.boundary})),frontageRoadId:p.frontageRoadId,authority:'none'};
    row.options.push(geometry);return true;
   };
   // Preserve exact coordinates and plot layout first. Do not speculate
   // on reshapes for this face if the unchanged candidate already works.
   if(attempt('world-preserved',q=>({...q})))continue;
   // Limited positive affine family from the existing LARE approach:
   // no reflection, retiling, changed frontage, or building movement.
   for(const su of [1,.9,.75])for(const sv of [1,.8]){
    const span=width*su;if(span>length||span<minWidth-eps)continue;
    const left=clip(center-span/2,0,length-span);
    for(const front of new Set([Math.max(setback+.05,leftOld.v),setback+.05])){
     attempt('positive-affine',q=>{
      const uv=local(q);return {...q,x:a.x+t.x*(left+uv.u*su)+inward.x*(front+uv.v*sv),y:a.y+t.y*(left+uv.u*su)+inward.y*(front+uv.v*sv)};
     });
    }
   }
  }
  finish(row.options.some(o=>o.family==='world-preserved')?'worldPreserved':row.options.length?'reshaped':'noCandidate');
 }
 const result={status:'parcel-reshape-observed',authority:'none',valid:false,landVerified:false,rows,counts,coverage:'same-frontage-individual-fixed-building-candidates-only',
  ownership:'not-assigned',collision:'not-evaluated',buildings:'held-fixed',allocation:'not-performed'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
