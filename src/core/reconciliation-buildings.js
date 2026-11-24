import { polygonRingsProperlyCross } from './geometry.js';
import { riEqual } from './road-impact-model.js';
import { validateBuildingStructureS10 } from './building-components-s10.js';
import { occupiedAreaS10,occupiedRegionsOverlapS10,occupiedPlotAreaS10 } from './building-occupancy-s10.js';
import { shapeContained } from './building-validation.js';
import { buildingExteriorRingsS10 } from './building-geometry-adapter-s10.js';
import { hydrateBuildingS10 } from './building-project-s10.js';
import { LARE_LIMITS,LareBudgetExceeded } from './reconciliation-budget.js';

const lareRigidEps=1e-6;
const lareBuildingWithout=(r,keys)=>Object.fromEntries(Object.entries(r).filter(([k])=>!keys.includes(k)));
const lareBuildingClone=x=>JSON.parse(JSON.stringify(x));
const lareBuildingAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const lareBuildingZero=x=>Object.is(x,-0)?0:x;
const lareBuildingPoint=(x,y)=>({x:lareBuildingZero(x),y:lareBuildingZero(y)});
const lareBuildingVertices=b=>b.geometry.regions.flatMap(r=>r.ring);
const lareBuildingCenter=points=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
const lareBuildingMap=(p,c,dx,dy,a)=>{
  const x=p.x-c.x,y=p.y-c.y,co=Math.cos(a),si=Math.sin(a);
  return lareBuildingPoint(c.x+dx+x*co-y*si,c.y+dy+x*si+y*co);
};
function lareBuildingCharge(b,budget){
  const n=b.geometry.regions.reduce((t,r)=>t+r.ring.length,0);
  budget.spend(Math.max(1,n*n+b.components.length*b.components.length));
  return {charge:(n=1)=>{if(n>0)budget.spend(n);}};
}
// Infer one orientation-preserving isometry independently from the first
// original edge, then check every corresponding vertex in every region.
export function verifyLareRigidGeometry(before,after,budget){
  if(!before?.geometry||!after?.geometry||!riEqual(before.components,after.components)||
     !Array.isArray(before.geometry.regions)||!Array.isArray(after.geometry.regions)||
     !riEqual(lareBuildingWithout(before.geometry,['regions']),lareBuildingWithout(after.geometry,['regions'])))return false;
  const old=before.geometry.regions,next=after.geometry.regions;
  const finiteRing=r=>Array.isArray(r)&&r.length>=3&&r.every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y));
  if(!Number.isFinite(before.orientation)||!Number.isFinite(after.orientation)||
    !old.length||old.length!==next.length||old.some((r,i)=>!finiteRing(r.ring)||!finiteRing(next[i].ring)||
    !riEqual(lareBuildingWithout(r,['ring']),lareBuildingWithout(next[i],['ring']))||
    r.ring.length!==next[i].ring.length))return false;
  const [a,b]=old[0].ring,[c,d]=next[0].ring;
  const u={x:b.x-a.x,y:b.y-a.y},v={x:d.x-c.x,y:d.y-c.y};
  const len=Math.hypot(u.x,u.y),other=Math.hypot(v.x,v.y);
  if(len<lareRigidEps||Math.abs(len-other)>lareRigidEps)return false;
  const angle=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y);
  const map=p=>lareBuildingMap(p,a,c.x-a.x,c.y-a.y,angle);
  for(let i=0;i<old.length;i++)for(let j=0;j<old[i].ring.length;j++){
    budget.spend();const p=map(old[i].ring[j]),q=next[i].ring[j];
    if(Math.hypot(p.x-q.x,p.y-q.y)>lareRigidEps)return false;
  }
  if(Math.abs(lareBuildingAngle(after.orientation-before.orientation-angle))>lareRigidEps||
    !Number.isFinite(before.area)||!Number.isFinite(after.area)||Math.abs(before.area-after.area)>lareRigidEps)return false;
  return riEqual(lareBuildingWithout(before,['geometry','orientation','entrance','accessPath','plotIds','roadProvenance','area']),
    lareBuildingWithout(after,['geometry','orientation','entrance','accessPath','plotIds','roadProvenance','area']));
}
export function transformLareBuilding(source,permission,transform,budget){
  const {dx=0,dy=0,angle=0}=transform;
  if(![dx,dy,angle].every(Number.isFinite)||Object.keys(transform).some(k=>!['dx','dy','angle'].includes(k)))
    throw Error('LARE only accepts finite rigid transforms.');
  if(permission?.mode!=='rigid'&&(dx!==0||dy!==0||angle!==0))
    throw Error('Building is fixed by preservation policy.');
  const next=lareBuildingClone(source);
  if(dx===0&&dy===0&&angle===0)return hydrateBuildingS10(next);
  if(![1,3].includes(source.geometry?.version)||source.geometry.courtyardAccess)
    throw Error('Unsupported rigid geometry.');
  const c=lareBuildingCenter(lareBuildingVertices(source)),map=p=>lareBuildingMap(p,c,dx,dy,angle);
  const charge=lareBuildingCharge(source,budget);
  next.geometry.regions=next.geometry.regions.map(r=>({...r,ring:r.ring.map(map)}));
  const valid=validateBuildingStructureS10(next.geometry,next.components,charge);
  next.geometry=valid.geometry;next.components=valid.components;
  next.entrance=map(source.entrance);next.accessPath=source.accessPath.map(map);
  next.orientation=source.orientation+angle;
  if(Math.abs(occupiedAreaS10(next.geometry,charge)-occupiedAreaS10(source.geometry,charge))>lareRigidEps||
    !verifyLareRigidGeometry(source,next,budget))throw Error('Rigid geometry verification failed.');
  return hydrateBuildingS10(next);
}
const lareBuildingBounds=(points,project)=>{const ps=points.map(project);
  return {minX:Math.min(...ps.map(p=>p.x)),maxX:Math.max(...ps.map(p=>p.x)),
    minY:Math.min(...ps.map(p=>p.y)),maxY:Math.max(...ps.map(p=>p.y))};};
const lareBuildingOrder=(a,b)=>a.moved-b.moved||a.displacement-b.displacement||a.rotation-b.rotation||a.order-b.order;
export function generateLareBuildingCandidates({source,permission,oldProperty,property,plots,fixedBuildings=[]},budget){
  if(!budget?.spend||!property?.boundary?.length||property.id!==source.propertyId||
    !plots.length||plots.some(p=>p.propertyId!==undefined&&p.propertyId!==property.id))
    throw Error('Invalid local building context.');
  const candidates=[],seen=new Set();let order=0,attempts=0,clearanceRetries=0;
  const sourcePoints=lareBuildingVertices(source),center=lareBuildingCenter(sourcePoints);
  const frame=property.frame??{origin:property.boundary[0],tangent:{x:1,y:0},inward:{x:0,y:1}};
  const project=p=>({x:(p.x-frame.origin.x)*frame.tangent.x+(p.y-frame.origin.y)*frame.tangent.y,
    y:(p.x-frame.origin.x)*frame.inward.x+(p.y-frame.origin.y)*frame.inward.y});
  const world=(u,v)=>({x:frame.tangent.x*u+frame.inward.x*v,y:frame.tangent.y*u+frame.inward.y*v});
  const pb=lareBuildingBounds(property.boundary,project);
  const tryOne=(dx,dy,angle,family,retry=false)=>{
    if (retry) {
      if (clearanceRetries++ >= 160) return;
    } else if (attempts++ >= 160) return;
    angle=lareBuildingAngle(angle);
    if(Math.abs(angle)<1e-10)angle=0;
    if(Math.abs(dx)<1e-10)dx=0;if(Math.abs(dy)<1e-10)dy=0;
    const key=[dx,dy,angle].map(x=>x.toFixed(8)).join('|');
    if(seen.has(key))return;seen.add(key);
    const rank=order++;budget.spend();
    try{
      const b=transformLareBuilding(source,permission,{dx,dy,angle},budget);
      const rings=buildingExteriorRingsS10(b);
      budget.spend(Math.max(1,rings.reduce((n,r)=>n+r.length,0)*property.boundary.length*3));
      if(rings.some(r=>!shapeContained(r,property.boundary)))return;
      if(rings.some(r=>polygonRingsProperlyCross(r,property.boundary,budget.spend)))return 'crossing';
      const charge=lareBuildingCharge(b,budget);
      for(const other of fixedBuildings){
        if(other.id===b.id)continue;
        lareBuildingCharge(other,budget);
        if(occupiedRegionsOverlapS10(b.geometry,other.geometry,charge))return;
      }
      b.plotIds=property.plotIds.filter(id=>{
        const plot=plots.find(p=>p.id===id);if(!plot)return false;
        budget.spend(Math.max(1,plot.boundary.length**2));
        return occupiedPlotAreaS10(b.geometry,plot.boundary,charge)>1e-5;
      });
      if(!b.plotIds.length)return;
      const moved=dx!==0||dy!==0||angle!==0?1:0;
      candidates.push({building:b,transform:{dx,dy,angle},family,moved,
        displacement:Math.hypot(dx,dy),rotation:Math.abs(angle),order:rank});
      candidates.sort(lareBuildingOrder);
      if(candidates.length>LARE_LIMITS.buildingCandidates){
        const groups=new Map();for(const c of candidates){const k=c.rotation===0?'translation':'rotation';groups.set(k,(groups.get(k)??0)+1);}
        let drop=candidates.length-1;while(drop>0&&groups.get(candidates[drop].rotation===0?'translation':'rotation')===1)drop--;
        candidates.splice(drop,1);
      }
    }catch(error){if(error instanceof LareBudgetExceeded)throw error;}
  };
  tryOne(0,0,0,'world-preserved');
  if(permission?.mode!=='rigid')return candidates;
  const old=oldProperty?.frame;
  if(old&&oldProperty.local&&property.local){
    const u=(center.x-old.origin.x)*old.tangent.x+(center.y-old.origin.y)*old.tangent.y+
      property.local.x+property.local.width/2-oldProperty.local.x-oldProperty.local.width/2;
    const v=(center.x-old.origin.x)*old.inward.x+(center.y-old.origin.y)*old.inward.y+property.local.y-oldProperty.local.y;
    const w=world(u,v),angle=Math.atan2(frame.tangent.y,frame.tangent.x)-Math.atan2(old.tangent.y,old.tangent.x);
    tryOne(frame.origin.x+w.x-center.x,frame.origin.y+w.y-center.y,angle,'frontage-frame');
  }
  const angles=[0,Math.PI/12,-Math.PI/12,Math.PI/6,-Math.PI/6,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI];
  for(let i=0;i<property.boundary.length;i++){
    const p=property.boundary[i],q=property.boundary[(i+1)%property.boundary.length];
    angles.push(lareBuildingAngle(Math.atan2(q.y-p.y,q.x-p.x)-source.orientation));
  }
  for(const angle of [...new Set(angles.map(a=>Math.round(lareBuildingAngle(a)*1e9)/1e9))]){
    if(attempts>=160)break;
    const rotated=sourcePoints.map(p=>lareBuildingMap(p,center,0,0,angle));
    const b=lareBuildingBounds(rotated,project),minU=pb.minX-b.minX,maxU=pb.maxX-b.maxX,
      minV=pb.minY-b.minY,maxV=pb.maxY-b.maxY;
    if(minU>maxU+lareRigidEps||minV>maxV+lareRigidEps)continue;
    const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
    const us=[clamp(0,minU,maxU),(minU+maxU)/2,minU,maxU];
    const vs=[clamp(0,minV,maxV),(minV+maxV)/2,minV,maxV];
    for(const [u,v] of [[us[0],vs[0]],[us[1],vs[1]],[us[2],vs[0]],[us[3],vs[0]],
      [us[0],vs[2]],[us[0],vs[3]],[us[2],vs[2]],[us[2],vs[3]],[us[3],vs[2]],[us[3],vs[3]]]){
      if (attempts >= 160) break;
      const delta = world(u, v);
      const result = tryOne(delta.x, delta.y, angle, angle === 0 ? 'translate' : 'rotate');
      if (result === 'crossing') {
        // Retry only a placement rejected by the strict edge-crossing test.
        // The correction is rigid and leaves exact-fit axes unmodified.
        const insetU = Math.min(1e-5, Math.max(0, (maxU - minU) / 4));
        const insetV = Math.min(1e-5, Math.max(0, (maxV - minV) / 4));
        const corrected = world(clamp(u, minU + insetU, maxU - insetU),
          clamp(v, minV + insetV, maxV - insetV));
        tryOne(corrected.x, corrected.y, angle, 'selective-inset', true);
      }
    }
  }
  return candidates.sort(lareBuildingOrder);
}
