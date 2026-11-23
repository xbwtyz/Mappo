import { copyJson } from '../data/project-format.js';
import { inspectPropertyEdit3I } from './property-application.js';
import { resolvePropertyFrontageGuideSFS, projectFrontageCornerSFS, translateFrontageSFS } from '../core/property-frontage-constraints.js';

const sfsSqDist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const sfsInterp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const sfsChanged=(a,b)=>sfsSqDist(a[0],b[0])>1e-8||sfsSqDist(a[1],b[1])>1e-8;
const sfsCandidateSession=(session,frontage)=>{
  const candidate=Object.create(session);
  candidate.active={...session.active,boundary:session.boundary.map((p,i)=>i<2?{...frontage[i]}:{...p})};
  candidate.drag=null;
  return candidate;
};
const sfsValid=(project,session,frontage)=>inspectPropertyEdit3I(project,sfsCandidateSession(session,frontage)).ok;

// A gesture is isolated from accepted data; every frame is recomputed from the
// same initial draft to avoid pointer drift and cumulative floating-point error.
export function beginPropertyFrontageGestureSFS(project,session,kind,index,start){
  if(!project||!session?.isActive||!session.polygonMode||session.flexibleMode||
    !['corner','edge'].includes(kind)||!start||!Number.isFinite(start.x)||!Number.isFinite(start.y))return null;
  if(kind==='corner'&&![0,1].includes(index))return null;
  const guide=resolvePropertyFrontageGuideSFS(project.city,session.source(project.city));
  if(!guide)return null;
  const boundary=copyJson(session.boundary);
  return {kind:'frontage-sfs',handle:kind,index,start:{...start},boundary,guide,
    validStart:inspectPropertyEdit3I(project,session).ok,original:copyJson(boundary.slice(0,2)),clamped:false};
}

export function proposePropertyFrontageGestureSFS(project,session,gesture,point){
  if(!project||!session?.isActive||gesture?.kind!=='frontage-sfs'||!point||
    !Number.isFinite(point.x)||!Number.isFinite(point.y))
    return {ok:false,reason:'Frontage movement is unavailable.'};
  if(!gesture.validStart)return {ok:false,reason:'Resolve existing property preview issues before moving frontage.'};
  const base=gesture.boundary.slice(0,2);
  let requested;
  if(gesture.handle==='edge'){
    const delta={x:point.x-gesture.start.x,y:point.y-gesture.start.y};
    if(Math.hypot(delta.x,delta.y)<1e-9)return {ok:true,frontage:base,clamped:false};
    requested=translateFrontageSFS(base,gesture.guide,delta);
  }else{
    if(sfsSqDist(point,base[gesture.index])<1e-9)return {ok:true,frontage:base,clamped:false};
    requested=projectFrontageCornerSFS(base,gesture.guide,gesture.index,point);
  }
  if(!requested)return {ok:false,reason:'The assigned frontage road could not be resolved.'};
  if(!sfsChanged(base,requested))return {ok:true,frontage:base,clamped:false};
  // Historical accepted frontages can be a fraction off the assigned road.
  // Do not normalize on pointer-down; only align after the user really moves.
  const aligned=gesture.handle==='edge'
    ? translateFrontageSFS(base,gesture.guide,{x:0,y:0})
    : projectFrontageCornerSFS(base,gesture.guide,gesture.index,base[gesture.index]);
  if(!aligned||!sfsValid(project,session,aligned))
    return {ok:false,reason:'Existing frontage cannot be aligned safely without affecting a protected parcel or building.'};
  const displacement=Math.max(sfsSqDist(aligned[0],requested[0]),sfsSqDist(aligned[1],requested[1]));
  // Check the swept movement in order. A final sfsValid point alone must not let
  // a fast pointer jump across an obvious blocked interval.
  const count=Math.max(1,Math.min(24,Math.ceil(displacement/3)));
  let good=0,blocked=1;
  for(let i=1;i<=count;i++){
    const t=i/count;
    const frontage=[sfsInterp(aligned[0],requested[0],t),sfsInterp(aligned[1],requested[1],t)];
    if(!sfsValid(project,session,frontage)){blocked=t;break;}
    good=t;
  }
  if(good===1)return {ok:true,frontage:requested,clamped:false};
  // Refine the first boundary without ever accepting an invalid candidate.
  for(let i=0;i<9;i++){
    const mid=(good+blocked)/2;
    const front=[sfsInterp(aligned[0],requested[0],mid),sfsInterp(aligned[1],requested[1],mid)];
    if(sfsValid(project,session,front))good=mid;
    else blocked=mid;
  }
  const frontage=[sfsInterp(aligned[0],requested[0],good),sfsInterp(aligned[1],requested[1],good)];
  return {ok:true,frontage,clamped:true,
    reason:'Frontage stopped at a property, road, plot, or building constraint.'};
}

// Numeric controls request the coordinate the user actually typed. For a
// diagonal road, solve the complementary axis to keep exact requested x/y.
export function proposePropertyFrontageCoordinateSFS(project,session,index,axis,value){
  if(!['x','y'].includes(axis)||!Number.isFinite(value)||![0,1].includes(index))return {ok:false};
  const source=session?.source(project?.city),guide=resolvePropertyFrontageGuideSFS(project?.city,source);
  if(!session?.polygonMode||!guide)return {ok:false,reason:'Frontage snapping is unavailable.'};
  const p=session.boundary[index],component=guide.tangent[axis];
  if(Math.abs(component)<1e-7)return {ok:false,reason:axis.toUpperCase()+' is fixed by the frontage street direction.'};
  const distance=(value-p[axis])/component;
  const requested={x:p.x+guide.tangent.x*distance,y:p.y+guide.tangent.y*distance};
  const gesture=beginPropertyFrontageGestureSFS(project,session,'corner',index,p);
  return gesture?proposePropertyFrontageGestureSFS(project,session,gesture,requested):
    {ok:false,reason:'Resolve existing property preview issues before moving frontage.'};
}
