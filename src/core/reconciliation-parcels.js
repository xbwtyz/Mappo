import { polygonSignedArea } from './geometry.js';
import { shapeWellFormed,shapeContained,shapesOverlapInterior } from './building-validation.js';
import { propertyFits,STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK } from './placement.js';
import { propertyDividerFractions3I,propertyGeometryPreview3I,propertyLocalBounds3I } from './property-geometry.js';
import { validatePlotTiling027 } from './plot-partition-027.js';
import { LARE_LIMITS,LareBudgetExceeded } from './reconciliation-budget.js';
import { larePlotAdjacency,verifyLarePlotDeformation,mapLarePlotCells } from './reconciliation-plots.js';

const lareParcelEps=1e-6;
const lareParcelClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lareParcelUnique=xs=>[...new Set(xs.filter(Number.isFinite).map(x=>Object.is(x,-0)?0:x))];
function lareParcelStrip(property,plots){
  if(property.boundary.length!==4||plots.some(p=>p.boundary.length!==4))return null;
  try{
    const city={properties:[property],plots},ratios=propertyDividerFractions3I(city,property);
    const reference=propertyGeometryPreview3I(city,property.id,property.boundary,ratios);
    if(reference.plots.every((p,i)=>p.id===plots[i].id&&p.boundary.every((q,j)=>
      Math.hypot(q.x-plots[i].boundary[j].x,q.y-plots[i].boundary[j].y)<lareParcelEps)))return ratios;
  }catch{/* Arbitrary convex-cell layouts use coordinated affine deformation. */}
  return null;
}
const lareParcelDist=(a,b)=>a.reduce((n,p,i)=>n+Math.hypot(p.x-b[i].x,p.y-b[i].y),0);
const lareParcelCmp=(a,b)=>a.score-b.score||a.order-b.order;
// Returns admissible parcel/plot candidates, never a complete accepted edit.
// Fixed exterior rings and fixed neighbors constrain the search; movable
// neighboring properties must be checked later by the cooperative solver.
export function generateLareParcelCandidates({property,plots,edge,edges,fixedRings=[],fixedNeighbors=[],mode='adaptive',compactDeformation=false},budget){
  if(!budget?.spend)throw Error('Shared LARE budget required.');
  if(!['adaptive','authorized-reshape','fixed','decision-required','invalid-choice','fixed-unsupported'].includes(mode))
    throw Error('Unknown parcel policy.');
  if(mode==='decision-required'||mode==='invalid-choice')return [];
  const original=property.boundary;
  if(!shapeWellFormed(original)||!plots.length||plots.length!==property.plotIds.length||
     plots.some((p,i)=>p.id!==property.plotIds[i]))throw Error('Invalid source parcel or plot identities.');
  const cornerCount=plots.reduce((n,p)=>n+p.boundary.length,0);
  budget.spend(Math.max(1,cornerCount*cornerCount+cornerCount*original.length*2));
  validatePlotTiling027(original,plots);
  const adjacency=larePlotAdjacency(plots,budget);
  if(edge?.road?.id!==property.frontageRoadId||!edges.some(e=>e===edge||e.road?.id===edge.road.id))
    throw Error('Assigned frontage is not a boundary of this block.');
  if(edges.some(e=>!Number.isFinite(STREET_WIDTHS[e.road?.kind])))throw Error('Unsupported block edge.');
  const {a,b}=edge,length=Math.hypot(b.x-a.x,b.y-a.y);
  const f0=original[0],f1=original[1],width=Math.hypot(f1.x-f0.x,f1.y-f0.y);
  if(length<lareParcelEps||width<lareParcelEps)return [];
  const tangent={x:(b.x-a.x)/length,y:(b.y-a.y)/length},inward={x:-tangent.y,y:tangent.x};
  const oldT={x:(f1.x-f0.x)/width,y:(f1.y-f0.y)/width},oldN={x:-oldT.y,y:oldT.x};
  if(oldT.x*tangent.x+oldT.y*tangent.y<=0)return [];
  const frame={origin:{...a},tangent,inward};
  const uv=(p,o,t,n)=>({u:(p.x-o.x)*t.x+(p.y-o.y)*t.y,v:(p.x-o.x)*n.x+(p.y-o.y)*n.y});
  const projected=p=>uv(p,a,tangent,inward);
  const local=p=>uv(p,f0,oldT,oldN);
  const world=(u,v)=>({x:a.x+tangent.x*u+inward.x*v,y:a.y+tangent.y*u+inward.y*v});
  const oldDepth=Math.max(...original.map(p=>local(p).v));
  if(oldDepth<lareParcelEps)return [];
  const setback=(STREET_WIDTHS[edge.road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
  const minimumWidth=Math.min(7,width),block=edges.map(e=>e.a);
  const frontOld=projected(f0),rightOld=projected(f1);
  const fixed=fixedRings.flat().map(projected);
  const fixedLeft=fixed.length?Math.min(...fixed.map(p=>p.u)):Infinity;
  const fixedRight=fixed.length?Math.max(...fixed.map(p=>p.u)):-Infinity;
  const fixedRear=fixed.length?Math.max(...fixed.map(p=>p.v)):0;
  const blockRear=Math.max(...block.map(p=>projected(p).v));
  const strip=lareParcelStrip(property,plots);
  const found=[],seen=new Set();
  let order=0,attempts=0,attemptLimit=192;
  const tryCandidate=(family,boundary,nextPlots)=>{
    if(attempts++>=attemptLimit)return;
    const rank=order++,key=JSON.stringify(boundary);
    if(seen.has(key))return;seen.add(key);
    const n=boundary.length;
    const fixedWork=[...fixedRings,...fixedNeighbors].reduce((sum,r)=>sum+r.length,0);
    budget.spend(Math.max(1,n*n+n*(edges.length*4+fixedWork*4)));
    const l=projected(boundary[0]),r=projected(boundary[1]);
    if(l.u< -lareParcelEps||r.u>length+lareParcelEps||r.u-l.u<minimumWidth-lareParcelEps||
      Math.abs(l.v-r.v)>1e-5||l.v<setback-lareParcelEps||!shapeWellFormed(boundary)||
      !shapeContained(boundary,block)||!propertyFits(boundary,block,edges)||
      fixedRings.some(ring=>!shapeContained(ring,boundary))||
      fixedNeighbors.some(ring=>shapesOverlapInterior(ring,boundary)))return;
    try{verifyLarePlotDeformation(boundary,plots,nextPlots,budget,adjacency);}
    catch(error){if(error instanceof LareBudgetExceeded)throw error;return;}
    const next={...property,boundary,frontage:boundary.slice(0,2),frame,area:polygonSignedArea(boundary)};
    next.local=propertyLocalBounds3I(next,boundary);
    const score=lareParcelDist(original,boundary);
    found.push({family,property:next,plots:nextPlots,score,order:rank});
    found.sort(lareParcelCmp);
    // Keep at least one candidate from each discovered family for diversity.
    if(found.length>LARE_LIMITS.parcelCandidates){
      const counts=new Map();for(const c of found)counts.set(c.family,(counts.get(c.family)??0)+1);
      let drop=found.length-1;while(drop>0&&counts.get(found[drop].family)===1)drop--;
      found.splice(drop,1);
    }
  };
  const mapped=(family,map)=>{
    if(attempts>=attemptLimit)return;
    tryCandidate(family,original.map(map),mapLarePlotCells(plots,map,budget));
  };
  mapped('world-preserved',p=>({...p}));
  if(mode==='fixed'||mode==='fixed-unsupported')return found;
  const frontValues=lareParcelUnique([Math.max(setback+.05,frontOld.v),setback+.05]);
  const oldLeft=Math.min(frontOld.u,rightOld.u),oldRight=Math.max(frontOld.u,rightOld.u);
  const usableWidth=Math.min(width,length);
  const center=(oldLeft+oldRight)/2;
  const affine=(family,left,right,front,rear,shear=0)=>{
    if(attempts>=attemptLimit||right-left<minimumWidth-lareParcelEps||rear-front<=1||
       left< -lareParcelEps||right>length+lareParcelEps)return;
    const su=(right-left)/width,sv=(rear-front)/oldDepth;
    mapped(family,p=>{const q=local(p);return world(left+q.u*su+shear*q.v/oldDepth,front+q.v*sv);});
  };
  // Non-affine flexible mesh deformation: choose a seam that separates
  // complete existing cells and crosses no parent edge interior. On each
  // side the map is affine and agrees exactly on the seam. No new cells,
  // vertex insertion or topology changes are needed.
  function hingeCandidates(front){
    if(strip!==null||plots.length<2||usableWidth<minimumWidth)return;
    const left=lareParcelClamp(center-usableWidth/2,0,length-usableWidth);
    const base=p=>{const q=local(p);return world(left+q.u*usableWidth/width,front+q.v);};
    const seams=new Set();let eligible=0;
    for(const plot of plots)for(let i=0;i<plot.boundary.length;i++){
      if(eligible>=8||attempts>=attemptLimit)return;
      const p=plot.boundary[i],q=plot.boundary[(i+1)%plot.boundary.length],len=Math.hypot(q.x-p.x,q.y-p.y);
      if(len<lareParcelEps)continue;
      const key=[p.x+','+p.y,q.x+','+q.y].sort().join('|');
      if(seams.has(key))continue;seams.add(key);
      let sign=1;const distance=v=>sign*((q.x-p.x)*(v.y-p.y)-(q.y-p.y)*(v.x-p.x))/len;
      budget.spend(Math.max(1,cornerCount+original.length));
      if(distance(f0)>lareParcelEps||distance(f1)>lareParcelEps)sign=-1;
      if(distance(f0)>lareParcelEps||distance(f1)>lareParcelEps)continue;
      const sides=ring=>ring.map(distance);
      const across=values=>Math.min(...values)<-lareParcelEps&&Math.max(...values)>lareParcelEps;
      const boundarySides=sides(original);
      if(!across(boundarySides)||boundarySides.some((v,j)=>
        (v>lareParcelEps&&boundarySides[(j+1)%boundarySides.length]<-lareParcelEps)||
        (v<-lareParcelEps&&boundarySides[(j+1)%boundarySides.length]>lareParcelEps)))continue;
      if(plots.some(cell=>across(sides(cell.boundary))))continue;
      const depth=Math.max(...boundarySides);
      if(depth<=lareParcelEps)continue;
      eligible++;
      for(const dx of [-width*.08,width*.08]){
        mapped('polygon-hinge',p=>{
          const v=base(p),d=Math.max(0,distance(p))/depth;
          return {x:v.x+tangent.x*dx*d,y:v.y+tangent.y*dx*d};
        });
      }
    }
  }
  for(const front of frontValues)hingeCandidates(front);
  // Independent front endpoints and rear depth. Candidate boundaries are
  // driven by existing footprint, fixed-building extents and available block.
  for(const front of frontValues){
    const rearOld=Math.max(front+2,Math.max(...original.map(p=>projected(p).v)));
    const nearLeft=lareParcelClamp(oldLeft,0,length-minimumWidth);
    const nearRight=lareParcelClamp(oldRight,nearLeft+minimumWidth,length);
    const tightLeft=lareParcelClamp(fixed.length?fixedLeft-.03:nearLeft+width*.2,0,length-minimumWidth);
    const tightRight=lareParcelClamp(fixed.length?fixedRight+.03:nearRight-width*.2,minimumWidth,length);
    const tightRear=Math.max(front+2,fixedRear+.03);
    const rearValues=lareParcelUnique([rearOld,Math.min(rearOld,Math.max(tightRear,(rearOld+tightRear)/2)),
      tightRear,Math.min(blockRear,front+oldDepth),front+oldDepth*.8]);
    const leftValues=lareParcelUnique([nearLeft,lareParcelClamp(setback+.05,0,length-minimumWidth),tightLeft,(nearLeft+tightLeft)/2]);
    const rightValues=lareParcelUnique([nearRight,lareParcelClamp(length-setback-.05,minimumWidth,length),tightRight,(nearRight+tightRight)/2]);
    const spanValues=lareParcelUnique([usableWidth,Math.max(minimumWidth,usableWidth*.9),Math.max(minimumWidth,usableWidth*.75)]);
    // Explore slide alternatives before coupled combinations consume budget.
    for(const span of spanValues){
      if(span>length)continue;
      const starts=lareParcelUnique([center-span/2,oldLeft,oldLeft-span*.25,oldLeft+span*.25,
        fixed.length?fixedLeft-.03:0,fixed.length?fixedRight-span+.03:length-span]
        .map(x=>lareParcelClamp(x,0,length-span)));
      for(const left of starts)affine('frontage-slide',left,left+span,front,rearOld);
    }
    for(const left of leftValues)affine('independent-left',left,nearRight,front,rearOld);
    for(const right of rightValues)affine('independent-right',nearLeft,right,front,rearOld);
    for(const rear of rearValues)affine('independent-rear',nearLeft,nearRight,front,rear);
    // Shared positive affine shear also supports non-strip and concave layouts.
    for(const shear of [-width*.1,width*.1,-width*.2,width*.2])
      affine('affine-shear',nearLeft,nearRight,front,rearOld,shear);
    // A verified strip partition permits independent taper at the rear corners.
    // Reconstructing from the same divider fractions preserves every strip ID.
    if(strip!==null){
      for(const delta of [-width*.2,-width*.1,width*.1,width*.2]){
        for(const side of ['left','right']){
          if(attempts>=attemptLimit)break;
          const rearL=nearLeft+(side==='left'?delta:0),rearR=nearRight+(side==='right'?delta:0);
          if(rearR-rearL<=1)continue;
          const boundary=[world(nearLeft,front),world(nearRight,front),world(rearR,rearOld),world(rearL,rearOld)];
          const preview=propertyGeometryPreview3I({properties:[property],plots},property.id,boundary,strip);
          const next=plots.map((p,i)=>({...p,boundary:preview.plots[i].boundary}));
          tryCandidate('taper-'+side,boundary,next);
        }
      }
    }
    for(const left of leftValues)for(const right of rightValues)for(const rear of rearValues)
      affine('independent-combined',left,right,front,rear);
  }
  if (compactDeformation) {
    attemptLimit = attempts + 54;
    const spans = lareParcelUnique([minimumWidth, (minimumWidth + usableWidth) / 2, usableWidth]);
    const depths = [.35, .55, .75].map(ratio => Math.max(2, oldDepth * ratio));
    for (const front of frontValues) {
      for (const span of spans) {
        if (span > length || span < minimumWidth) continue;
        const starts = lareParcelUnique([center - span / 2, oldLeft, oldRight - span]
          .map(x => lareParcelClamp(x, 0, length - span)));
        for (const start of starts) {
          for (const depth of depths) affine('compact-joint', start, start + span, front, front + depth);
        }
      }
    }
  }
  return found.sort(lareParcelCmp);
}
