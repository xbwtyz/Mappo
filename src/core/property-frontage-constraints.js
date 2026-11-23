// Canonical road-aware projection for the single frontage edge (vertices 0 -> 1).
// Geometry-only: never mutate a city, a draft, or the stored property frame.
export const FRONTAGE_MIN_LENGTH_SFS = 7;
const sfsDot=(a,b)=>a.x*b.x+a.y*b.y;
const sfsSub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const sfsAdd=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
const sfsScale=(a,s)=>({x:a.x*s,y:a.y*s});
const sfsLength=a=>Math.hypot(a.x,a.y);
const sfsMidpoint=(a,b)=>sfsScale(sfsAdd(a,b),.5);
const sfsFinite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function resolvePropertyFrontageGuideSFS(city,property){
  const road=city?.roads?.find(r=>r.id===property?.frontageRoadId);
  const block=city?.blocks?.find(b=>b.id===property?.blockId);
  if(!road||!block||!Array.isArray(block.vertices)||!Array.isArray(property?.boundary)||property.boundary.length<3)
    return null;
  // Frontage may not silently jump to an adjacent road on a corner lot.
  const joins=block.vertices.some((id,i)=>{
    const next=block.vertices[(i+1)%block.vertices.length];
    return (id===road.a&&next===road.b)||(id===road.b&&next===road.a);
  });
  if(!joins)return null;
  const a=city.nodes?.find(n=>n.id===road.a),b=city.nodes?.find(n=>n.id===road.b);
  if(!sfsFinite(a)||!sfsFinite(b))return null;
  const delta=sfsSub(b,a),roadLength=sfsLength(delta);
  if(roadLength<1e-7)return null;
  let tangent=sfsScale(delta,1/roadLength);
  const front=sfsSub(property.boundary[1],property.boundary[0]),frontLength=sfsLength(front);
  if(frontLength<FRONTAGE_MIN_LENGTH_SFS-1e-5)return null;
  if(sfsDot(tangent,front)<0)tangent=sfsScale(tangent,-1);
  // Reject detached or severely rotated legacy geometry; only small frame drift
  // may be recovered by a road-aligned edit.
  if(sfsDot(tangent,front)/frontLength<.995)return null;
  const inward={x:-tangent.y,y:tangent.x};
  return {roadId:road.id,tangent,inward,length:frontLength};
}

export function projectFrontageCornerSFS(boundary,guide,index,requested){
  if(!Array.isArray(boundary)||boundary.length<2||!sfsFinite(requested)||![0,1].includes(index)||!guide)return null;
  const fixed=boundary[1-index],tangent=guide.tangent;
  if(!sfsFinite(fixed))return null;
  const amount=index===0?sfsDot(sfsSub(fixed,requested),tangent):sfsDot(sfsSub(requested,fixed),tangent);
  const span=Math.max(FRONTAGE_MIN_LENGTH_SFS,amount);
  const moved=index===0?sfsSub(fixed,sfsScale(tangent,span)):sfsAdd(fixed,sfsScale(tangent,span));
  return index===0?[moved,{...fixed}]:[{...fixed},moved];
}

export function translateFrontageSFS(boundary,guide,delta){
  if(!Array.isArray(boundary)||!guide||!sfsFinite(delta))return null;
  const p=sfsAdd(boundary[0],delta);
  return [p,sfsAdd(p,sfsScale(guide.tangent,guide.length))];
}

export function frontageMidpointSFS(boundary){
  if(!Array.isArray(boundary)||!sfsFinite(boundary[0])||!sfsFinite(boundary[1]))return null;
  return sfsMidpoint(boundary[0],boundary[1]);
}

// The same road direction must be used by previews and final Apply.
// This is intentionally independent from historical saved frame.inward drift.
export function editedFrontageAlignedSFS(boundary,guide){
  if(!guide||!boundary||!sfsFinite(boundary[0])||!sfsFinite(boundary[1]))return false;
  const front=sfsSub(boundary[1],boundary[0]);
  return sfsLength(front)>=FRONTAGE_MIN_LENGTH_SFS-1e-7 &&
    sfsDot(front,guide.tangent)>0 &&
    Math.abs(sfsDot(front,guide.inward))<=1e-4;
}
