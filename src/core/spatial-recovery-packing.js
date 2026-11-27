import { roadFrameLength } from './geometry.js';
import { sreMathSin, sreMathCos, sreMathAtan2 } from './spatial-recovery-math.js';
import { createSpatialPermissions } from './spatial-recovery-contract.js';
import { riCompare, riFreeze } from './road-impact-model.js';
import { shapeContained } from './building-validation.js';
import { STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK } from './placement.js';

// Derived from R7/R8 shelf-packing research. Pure bounded proposal generator,
// NOT a parcel, plot, building, access or whole-project validator.
const srePackEps=1e-6,srePackMargin=.12;
const srePackClamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const srePackUnique=xs=>[...new Set(xs.filter(Number.isFinite))];
const srePackDot=(p,v)=>p.x*v.x+p.y*v.y;
export function* iterateSpatialPackingSeeds({property,policy,buildings,edge,edges=[],maxProposals=24,permissions={},scale=1},budget){
  if(!budget?.spend||!Array.isArray(buildings))throw Error('Invalid spatial packing request.');
  if(policy?.mode!=='adaptive'||policy?.provenance!=='generated'||!buildings.length||
    buildings.some(b=>b.permission?.mode!=='rigid'||b.permission?.provenance!=='generated'||
      b.source?.propertyId!==property?.id||b.source?.geometry?.courtyardAccess||
      ![1,3].includes(b.source?.geometry?.version)))return [];
  const ids=buildings.map(b=>b.source.id);
  if(new Set(ids).size!==ids.length||!Array.isArray(property.buildingIds)||
    property.buildingIds.length!==ids.length||property.buildingIds.some(id=>!ids.includes(id)))
    throw Error('Invalid spatial packing ownership.');
  const policyFlags=createSpatialPermissions(permissions);
  const switching=edge?.road?.id!==property.frontageRoadId;
  if(!edge?.road||!Number.isFinite(STREET_WIDTHS[edge.road.kind])||edge.road.waterBoundary||edge.road.terrainBoundary)
    throw Error('Invalid spatial packing frontage.');
  if(!Number.isFinite(scale)||scale<=0||scale>1||
    (scale!==1&&(!policyFlags.uniformScaling||scale<1-policyFlags.maxLinearReduction-srePackEps)))
    throw Error('Unauthorized spatial packing scale.');
  if(switching){
    const originalIndex=edges.findIndex(e=>e.road?.id===property.frontageRoadId);
    const targetIndex=edges.findIndex(e=>e.road?.id===edge.road.id);
    if(!policyFlags.alternativeFrontage||originalIndex<0||targetIndex<0||edges.length<3||
      ![(originalIndex+1)%edges.length,(originalIndex+edges.length-1)%edges.length].includes(targetIndex)||
      edges[targetIndex]!==edge)
      throw Error('Unauthorized spatial packing frontage.');
  }
  const original=property.boundary,[f0,f1]=original;
  const {a,b}=edge,len=roadFrameLength(b.x-a.x,b.y-a.y),width=roadFrameLength(f1.x-f0.x,f1.y-f0.y);
  if(len<srePackEps||width<srePackEps)return [];
  const t={x:(b.x-a.x)/len,y:(b.y-a.y)/len},n={x:-t.y,y:t.x};
  const oldT={x:(f1.x-f0.x)/width,y:(f1.y-f0.y)/width},oldN={x:-oldT.y,y:oldT.x};
  if(!switching&&srePackDot(t,oldT)<=0)return [];
  const local=p=>{const q={x:p.x-f0.x,y:p.y-f0.y};return {u:srePackDot(q,oldT),v:srePackDot(q,oldN)};};
  const world=(u,v)=>({x:a.x+t.x*u+n.x*v,y:a.y+t.y*u+n.y*v});
  const depth=Math.max(...original.map(p=>local(p).v));
  if(depth<srePackEps)return [];
  const front=(STREET_WIDTHS[edge.road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK+.05;
  const center=srePackDot({x:(f0.x+f1.x)/2-a.x,y:(f0.y+f1.y)/2-a.y},t);
  const align=sreMathAtan2(t.y,t.x)-sreMathAtan2(oldT.y,oldT.x);
  if(!Number.isSafeInteger(maxProposals)||maxProposals<1||maxProposals>192)
    throw Error('Invalid packing proposal limit.');
  const shape=original.map(local);
  const rectangular=shape.length===4&&shape.every(q=>
    (Math.abs(q.u)<1e-5||Math.abs(q.u-width)<1e-5)&&
    (Math.abs(q.v)<1e-5||Math.abs(q.v-depth)<1e-5));
  const out=[],seen=new Set();
  for(const fitMode of rectangular?[0]:[0,1]){
  let attempts=0;
  fitPass: for(const [rotationMode,angle] of [align,align+Math.PI/2,0].entries()){
    const pieces=buildings.map(({source})=>{
      const points=source.geometry.regions.flatMap(r=>r.ring);
      budget.spend(Math.max(1,points.length*4));
      const c={x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};
      const co=sreMathCos(angle),si=sreMathSin(angle);
      const project=p=>{const x=p.x-c.x,y=p.y-c.y,q={x:scale*(x*co-y*si),y:scale*(x*si+y*co)};return {u:srePackDot(q,t),v:srePackDot(q,n)};};
      const pts=points.map(project),minU=Math.min(...pts.map(p=>p.u)),minV=Math.min(...pts.map(p=>p.v));
      return {source,c,project,minU,minV,w:Math.max(...pts.map(p=>p.u))-minU,h:Math.max(...pts.map(p=>p.v))-minV};
    }).sort((a,b)=>b.h-a.h||b.w-a.w||riCompare(a.source.id,b.source.id));
    const m=srePackMargin,sum=pieces.reduce((s,p)=>s+p.w+m,m),max=Math.max(...pieces.map(p=>p.w))+2*m;
    for(const target of srePackUnique([sum,max,(sum+max)/2,Math.max(max,Math.min(width,len)*.85)])){
      if(target>len||target<max-srePackEps)continue;
      let u=m,v=m,rowH=0,usedW=0;const placed=[];
      for(const p of pieces){
        budget.spend();
        if(u>m&&u+p.w+m>target+srePackEps){u=m;v+=rowH+m;rowH=0;}
        placed.push({p,u,v});usedW=Math.max(usedW,u+p.w+m);u+=p.w+m;rowH=Math.max(rowH,p.h);
      }
      const packedDepth=v+rowH+m;
      for(const widthFactor of fitMode?[1.15,1.35,1.6]:[1])for(const depthFactor of fitMode?[1.15,1.4,1.65]:[1,1.2]){
        const span=Math.max(Math.min(7,width),usedW+.08)*widthFactor,newDepth=Math.max(1.01,packedDepth*depthFactor);
        if(span>len)continue;
        // A conservative half-plane intersection supplies extra translations,
        // never excludes the ordinary samples (concave blocks need not have
        // a nonempty common inset). The real parcel gate remains decisive.
        const guided=[];
        if(fitMode&&edges.length){
          let lo=0,hi=len-span,valid=true;
          for(const e of edges){
            const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,edgeLen=roadFrameLength(dx,dy);
            if(edgeLen<srePackEps||!Number.isFinite(STREET_WIDTHS[e.road?.kind])){valid=false;break;}
            const inward={x:-dy/edgeLen,y:dx/edgeLen};
            const margin=(STREET_WIDTHS[e.road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK+.05;
            const slope=srePackDot(t,inward);
            for(const q of shape){
              budget.spend();
              const p=world(q.u*span/width,front+q.v*newDepth/depth);
              const required=margin-srePackDot({x:p.x-e.a.x,y:p.y-e.a.y},inward);
              if(Math.abs(slope)<1e-9){if(required>1e-7)valid=false;}
              else if(slope>0)lo=Math.max(lo,required/slope);
              else hi=Math.min(hi,required/slope);
            }
          }
          if(valid&&lo<=hi)guided.push(srePackClamp(center-span/2,lo,hi),(lo+hi)/2,lo,hi);
        }
        const oldLeft=srePackDot({x:f0.x-a.x,y:f0.y-a.y},t);
        for(const left of srePackUnique([...guided,center-span/2,oldLeft,(len-span)*.25,(len-span)*.5,(len-span)*.75,0,len-span].map(x=>srePackClamp(x,0,len-span)))){
          if(attempts++>=96)break fitPass;
          budget.spend(Math.max(1,original.length));
          yield {stage:'spatial-packing-seed',id:property.id};
          const boundary=original.map(p=>{const q=local(p);return world(left+q.u*span/width,front+q.v*newDepth/depth);});
          const seeds=[];let contained=true;
          for(const {p,u,v} of placed){
            const tx=left+(span-usedW)/2+u-p.minU,ty=front+(newDepth-packedDepth)/2+v-p.minV;
            const c=world(tx,ty);
            for(const region of p.source.geometry.regions){
              budget.spend(Math.max(1,region.ring.length*boundary.length*2));
              if(!shapeContained(region.ring.map(q=>{const z=p.project(q);return world(tx+z.u,ty+z.v);}),boundary)){contained=false;break;}
            }
            if(!contained)break;
            seeds.push({id:p.source.id,dx:c.x-p.c.x,dy:c.y-p.c.y,angle,...(scale!==1?{scale}:{})});
          }
          if(!contained)continue;
          seeds.sort((a,b)=>riCompare(a.id,b.id));
          const key=JSON.stringify([boundary,seeds]);
          if(seen.has(key))continue;seen.add(key);
          out.push({propertyId:property.id,frontageRoadId:edge.road.id,boundary,seeds,family:(fitMode?'packed-fit-':'packed-')+rotationMode+'-'+Math.round(target*100),frame:{left,front,span,depth:newDepth}});
          if(out.length>=maxProposals)return riFreeze(out);
        }
      }
    }
  }
  }
  return riFreeze(out);
}
