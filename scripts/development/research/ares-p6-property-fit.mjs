// C1b1 detached original-shape capacity and fit observations. No selection,
// assignment, deformation, new ID, ownership or permission is granted.
import {polygonSignedArea} from '../../../src/core/geometry.js';
import {shapeWellFormed,shapeContained} from '../../../src/core/building-validation.js';
import {propertyFits} from '../../../src/core/placement.js';
import {observeP6ConvexClearance} from './ares-p6-block-capacity.mjs';
import {classifyLareProperty} from '../../../src/core/reconciliation-policy.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
export function observeP6PropertyFit(source,extraction,audit,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,valid:false,authority:'none',landVerified:false});
 if(!extraction?.valid||audit?.status!=='matched'||audit.authority!=='none'||!Array.isArray(audit.rows))return refuse('unqualified-input');
 const props=new Map(),plots=new Map(),faces=new Map(),cache=new Map(),seen=new Set();
 for(const r of source.properties){b.spend();if(props.has(r.id))return refuse('duplicate-property');props.set(r.id,r);}
 for(const r of source.plots){b.spend();if(plots.has(r.id))return refuse('duplicate-plot');plots.set(r.id,r);}
 for(const f of extraction.faces){b.spend();if(f.kind==='block'){if(faces.has(f.key))return refuse('duplicate-face');faces.set(f.key,f);}}
 const rows=[],counts={unchangedShapeOption:0,noUnchangedShapeOption:0,unresolved:0,protected:0};
 for(const entry of audit.rows){
  b.spend();const p=props.get(entry.id);
  if(!p||seen.has(entry.id)||p.blockId!==entry.oldBlockId||!Array.isArray(entry.candidateKeys)||!entry.candidateKeys.length)return refuse('invalid-property-census');
  seen.add(entry.id);
  const own=[];
  for(const id of p.plotIds){b.spend();const q=plots.get(id);if(!q||q.propertyId!==p.id)return refuse('invalid-plot-owner');own.push(q);}
  aresReplayJson([p,own],b);
  const policy=classifyLareProperty(p,own);
  if(policy.mode!=='adaptive')counts.protected++;
  const ring=p.boundary,n=Array.isArray(ring)?ring.length:0;
  // Legacy fixed-ring routines have bounded nested edge comparisons. Prepay
  // their conservative worst-case loop sizes; no legacy search is invoked.
  charge(b,n+8*n*n);
  const supported=shapeWellFormed(ring);
  const area=supported?Math.abs(polygonSignedArea(ring)):null;
  const options=[],keys=new Set();
  for(const key of entry.candidateKeys){
   b.spend();const face=faces.get(key);
   if(!face||keys.has(key))return refuse('invalid-successor-face');keys.add(key);
   if(!cache.has(key)){
    const points=face.polygon,m=points.length;
    charge(b,8*m*m+m);
    if(!shapeWellFormed(points)||face.roadIds.length!==m)return refuse('invalid-face-geometry');
    const edges=[];
    for(let i=0;i<m;i++){
     b.spend();const road=extraction.graph.roadsById.get(face.roadIds[i]);
     if(!road)return refuse('missing-boundary-road');
     edges.push({a:points[i],b:points[(i+1)%m],road});
    }
    const capacity=observeP6ConvexClearance(face,extraction.graph,b);
    // Convex setback clipping is informative only: legacy segment clearance
    // and exact candidate tests remain separate; never rule out by this
    // relaxed estimate alone. Gross face area is a necessary area bound.
    cache.set(key,{points,edges,capacity,grossArea:Math.abs(polygonSignedArea(points))});
   }
   const f=cache.get(key),m=f.points.length;
   let fixedGeometry='unsupported';
   if(supported){
    charge(b,24*n*m+4*n+m);
    fixedGeometry=shapeContained(ring,f.points)&&propertyFits(ring,f.points,f.edges)?'fits-original-boundary':'original-boundary-does-not-fit';
   }
   options.push({key,faceArea:f.grossArea,clearance:f.capacity,originalArea:area,
    originalAreaExceedsGrossFace:area===null?null:area>f.grossArea+.02,
    originalFrontagePresent:f.edges.some(e=>e.road.id===p.frontageRoadId),
    fixedGeometry,ownership:'not-assigned'});
  }
  const classification=!supported?'unresolved':options.some(x=>x.fixedGeometry==='fits-original-boundary')?'unchanged-shape-option':'no-unchanged-shape-option';
  counts[classification==='unresolved'?'unresolved':classification==='unchanged-shape-option'?'unchangedShapeOption':'noUnchangedShapeOption']++;
  rows.push({id:p.id,oldBlockId:p.blockId,policy,classification,options});
 }
 const result={status:'property-fit-observed',authority:'none',valid:false,landVerified:false,rows,counts,
  coverage:'individual-original-boundary-and-road-setback-only',ownership:'not-assigned',collision:'not-evaluated',frontage:'not-verified',reshape:'not-performed'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
