import { prepareRoadReconciliationB1 } from './road-reconciliation.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I, propertyLocalBounds3I } from './property-geometry.js';
import { shapeWellFormed } from './building-validation.js';
import { polygonSignedArea } from './geometry.js';
import { validateStoredProject } from '../data/project-validation.js';

// B2: conservative parcel and plot changes only. No Apply or history hooks.
const b2Clone = value => JSON.parse(JSON.stringify(value));
const b2Cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const b2Key = (kind,id) => JSON.stringify([kind,id]);
const b2Order = (a,b) => b2Cmp(a.kind,b.kind) || b2Cmp(a.id,b.id);
const B2_MOVE_LIMIT = 6;
const B2_PARCEL_LIMIT = 256;
const b2Finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const b2Dot = (a,b) => a.x*b.x + a.y*b.y;
function b2Freeze(value) {
  if(value && typeof value === 'object' && !Object.isFrozen(value)){
    Object.values(value).forEach(b2Freeze);
    Object.freeze(value);
  }
  return value;
}
function b2Issue(kind,id,code,message,relatedIds=[]){
  return {kind,id,code,message,severity:'needs-review',
    relatedIds:[...new Set(relatedIds.filter(x=>typeof x==='string'))].sort(b2Cmp)};
}
function b2Blocked(base,unresolved,reason='unsupported-local-reconciliation'){
  return b2Freeze({
    phase:'B2',operation:'move-junction',status:'needs-review',impactStatus:base.impactStatus,
    candidateProject:null, applyReady:false,
    changed:b2Clone(base.changed), dependent:b2Clone(base.dependent), preserved:b2Clone(base.preserved),
    reconciled:[], unresolved:unresolved.length?unresolved:[b2Issue('city','unknown',reason,'A supported local reconciliation could not be established.')],
    validation:{...base.validation,parcels:'blocked',project:'not-run'},
  });
}
const b2Cross = (a,b,c) => (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
const b2Convex = poly => poly.length===4 && poly.every((p,i)=>
  b2Cross(p,poly[(i+1)%4],poly[(i+2)%4])>1e-7);

// Warp the frontage (corners 0→1) in the road's local coordinates while
// keeping rear parcel corners fixed. The existing building footprint, access
// path, entrance and owned plot IDs are never moved or reassigned.
export function warpPropertyFrontageB2(property,road,acceptedNodes,candidateNodes) {
  if(property?.boundary?.length!==4 || !Array.isArray(property.plotIds) ||
     !property.frame?.origin?.id || !property.boundary.every(b2Finite))
    throw new Error('Only framed four-corner properties have a supported local transformation.');
  const anchor=property.frame.origin.id;
  if(anchor!==road.a && anchor!==road.b)
    throw new Error('Property frontage frame is not anchored to its frontage road.');
  const other=anchor===road.a?road.b:road.a;
  const a=acceptedNodes.get(anchor),b=acceptedNodes.get(other);
  const na=candidateNodes.get(anchor),nb=candidateNodes.get(other);
  if(!a||!b||!na||!nb) throw new Error('Frontage road endpoints are missing.');
  if(Math.hypot(na.x-a.x,na.y-a.y)>B2_MOVE_LIMIT ||
     Math.hypot(nb.x-b.x,nb.y-b.y)>B2_MOVE_LIMIT)
    throw new Error('Junction displacement exceeds conservative parcel-adaptation limits.');
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  const nextLength=Math.hypot(nb.x-na.x,nb.y-na.y);
  if(length<1e-6 || nextLength<1e-6) throw new Error('A frontage road is degenerate.');
  const tangent={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
  const inward={x:-tangent.y,y:tangent.x};
  const nextTangent={x:(nb.x-na.x)/nextLength,y:(nb.y-na.y)/nextLength};
  const nextInward={x:-nextTangent.y,y:nextTangent.x};
  const frame=property.frame;
  if(Math.abs(frame.origin.x-a.x)>1e-6 || Math.abs(frame.origin.y-a.y)>1e-6 ||
     b2Dot(frame.tangent,tangent)<1-1e-6 || b2Dot(frame.inward,inward)<1-1e-6)
    throw new Error('A custom or detached property frame cannot be safely reoriented.');
  const front=property.boundary.slice(0,2).map(point=>{
    const d={x:point.x-a.x,y:point.y-a.y};
    const t=b2Dot(d,tangent)/length;
    const v=b2Dot(d,inward);
    if(t < -1e-6 || t > 1+1e-6 || v <= 0)
      throw new Error('The old frontage does not lie in the supported road corridor.');
    return {x:na.x+nextTangent.x*(t*nextLength)+nextInward.x*v,
      y:na.y+nextTangent.y*(t*nextLength)+nextInward.y*v};
  });
  const boundary=[...front,...property.boundary.slice(2).map(b2Clone)];
  if(!shapeWellFormed(boundary) || !b2Convex(boundary))
    throw new Error('The reshaped parcel would be self-intersecting or non-convex.');
  return {boundary, frame:{origin:b2Clone(na),tangent:nextTangent,inward:nextInward}};
}
const B2_RESOLVABLE = new Set(['frontage-geometry','frame-reference','block-containment',
  'road-setback','frontage-distance']);
export function prepareParcelReconciliationB2(project,junctionId,point) {
  const base=prepareRoadReconciliationB1(project,junctionId,point);
  if(!base.candidateProject)
    return b2Freeze({...base,phase:'B2',reconciled:[],
      validation:{...base.validation,parcels:'not-run'}});
  if(base.status==='unchanged')
    return b2Freeze({...base,phase:'B2',reconciled:[],
      validation:{...base.validation,parcels:'unchanged'}});

  try {
    const accepted=project.city, city=b2Clone(base.candidateProject).city;
    const changedRoads=new Set(base.changed.filter(row=>row.kind==='road').map(row=>row.id));
    const changedBlocks=new Set(base.changed.filter(row=>row.kind==='block').map(row=>row.id));
    const frontageProperties=accepted.properties
      .filter(p=>changedRoads.has(p.frontageRoadId))
      .sort((a,b)=>b2Cmp(a.id,b.id));
    if(frontageProperties.length>B2_PARCEL_LIMIT)
      return b2Blocked(base,[b2Issue('city',accepted.id,'reconciliation-work-limit',
        'This junction affects too many frontage parcels to reconcile in B2.')]);
    const oldNodes=new Map(accepted.nodes.map(n=>[n.id,n]));
    const nodes=new Map(city.nodes.map(n=>[n.id,n]));
    const roads=new Map(accepted.roads.map(r=>[r.id,r]));
    const properties=new Map(city.properties.map(p=>[p.id,p]));
    const plots=new Map(city.plots.map(p=>[p.id,p]));
    const issues=[], changes=[], reconciled=[];
    function record(kind,id,fields,before,after,reason) {
      changes.push({kind,id,state:'modified-identity-preserved',fields});
      reconciled.push({kind,id,fields,reason,before:b2Clone(before),after:b2Clone(after)});
    }
    for(const original of frontageProperties){
      const property=properties.get(original.id),road=roads.get(original.frontageRoadId);
      if(!property||!road){issues.push(b2Issue('property',original.id,'missing-frontage',
        'The property or its frontage road cannot be resolved.'));continue;}
      try {
        const dividers=propertyDividerFractions3I(city,property);
        const warped=warpPropertyFrontageB2(original,road,oldNodes,nodes);
        const preview=propertyGeometryPreview3I(city,property.id,warped.boundary,dividers);
        if(preview.area<=1 || Math.abs(preview.area-preview.total)>.02)
          throw new Error('The proposed parcel and plot areas cannot be reconciled.');
        const before={boundary:property.boundary,frontage:property.frontage,
          frame:property.frame,local:property.local,area:property.area};
        const after={boundary:preview.boundary,frontage:preview.boundary.slice(0,2),
          frame:warped.frame,area:preview.area};
        after.local=propertyLocalBounds3I({...property,frame:warped.frame},preview.boundary);
        Object.assign(property,b2Clone(after));
        if(JSON.stringify(before)!==JSON.stringify(after))
          record('property',property.id,['boundary','frontage','frame','local','area'],before,after,
            'Follow the changed frontage while keeping the rear boundary and all building geometry fixed.');
        for(const update of preview.plots){
          const plot=plots.get(update.id);
          if(!plot||plot.propertyId!==property.id || plot.blockId!==property.blockId)
            throw new Error('Plot ownership could not be preserved.');
          if(JSON.stringify(plot.boundary)!==JSON.stringify(update.boundary)){
            record('plot',plot.id,['boundary'],{boundary:plot.boundary},
              {boundary:update.boundary},'Retain the original ordered plot-divider fractions.');
            plot.boundary=b2Clone(update.boundary);
          }
        }
      }catch(error){
        issues.push(b2Issue('property',original.id,'unsupported-parcel-geometry',error.message,
          [original.blockId,original.frontageRoadId]));
      }
    }
    for(const open of city.openSpaces ?? []){
      if(!changedBlocks.has(open.blockId)) continue;
      const block=city.blocks.find(b=>b.id===open.blockId);
      if(!block){issues.push(b2Issue('open-space',open.id,'missing-block',
        'An open-space record has no accepted block identity.'));continue;}
      const occupied=city.properties.filter(p=>p.blockId===block.id)
        .reduce((sum,p)=>sum+p.area,0);
      const newArea=block.area-occupied;
      if(newArea < -0.02 || !Number.isFinite(newArea)){
        issues.push(b2Issue('open-space',open.id,'open-space-overcommitted',
          'Reconciled properties exceed the available block area.'));continue;
      }
      const value=Math.max(0,newArea);
      if(Math.abs(value-open.area)>1e-8){
        record('open-space',open.id,['area'],{area:open.area},{area:value},
          'Recalculate unoccupied area from the matched block and retained properties.');
        open.area=value;
      }
    }

    const resolvedKeys=new Set(changes.map(row=>b2Key(row.kind,row.id)));
    const unresolved=base.unresolved.filter(row=>{
      if(row.code==='dependent-reconciliation-pending' && resolvedKeys.has(b2Key(row.kind,row.id)))
        return false;
      return !(B2_RESOLVABLE.has(row.code) && resolvedKeys.has(b2Key(row.kind,row.id))
        && (row.kind==='property'||row.kind==='plot'));
    });
    unresolved.push(...issues);
    if(JSON.stringify(city.buildings)!==JSON.stringify(accepted.buildings))
      unresolved.push(b2Issue('city',accepted.id,'building-preservation',
        'Building records changed during parcel reconciliation; the candidate is rejected.'));
    if(unresolved.length)return b2Blocked(base,unresolved);

    // Global validator is still mandatory even though the geometry computation
    // is local. Any mismatch, including building access and plot ownership,
    // rejects the candidate without changing accepted project/history.
    const candidate=b2Clone(base.candidateProject);
    candidate.city=city;
    try { validateStoredProject(candidate); }
    catch(error){
      return b2Blocked(base,[b2Issue('city',accepted.id,'candidate-validation',
        'The full city cannot accept this reconciliation: '+error.message)]);
    }

    const allChanged=[...base.changed,...changes].sort(b2Order);
    const touched=new Set(changes.map(row=>b2Key(row.kind,row.id)));
    const dependent=base.dependent.filter(row=>!touched.has(b2Key(row.kind,row.id)));
    const preserved=base.preserved.filter(row=>!touched.has(b2Key(row.kind,row.id)));
    return b2Freeze({
      phase:'B2',operation:'move-junction',status:'candidate-only',
      impactStatus:base.impactStatus,applyReady:false,
      candidateProject:candidate,changed:allChanged,dependent,preserved,reconciled,
      unresolved:[],validation:{...base.validation,parcels:'pass',project:'valid'},
    });
  }catch(error){
    return b2Blocked(base,[b2Issue('city',project?.city?.id??'unknown','reconciliation-incomplete',
      'B2 could not finish its local analysis: '+error.message)]);
  }
}
