import { verifyIdentityReservation, verifyIdentityAdditions } from '../core/identity-verification.js';
import { hasSimpleBuildingFootprintS10 } from '../core/building-geometry-adapter-s10.js';
import { simpleBuildingViewS10 } from '../core/building-transform.js';
import { editCourtyardPlacement, detachCourtyardBuilding } from './courtyard-placement.js';
import { BUILDING_USE_TYPES } from '../core/identity.js';
import { polygonSignedArea } from '../core/geometry.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { inspectBuildingGeometry } from '../core/building-validation.js';
import { deriveOccupiedPlots, prepareBuildingApply } from './building-application.js';
import { adoptNewBuildingS10, writeSimpleBuildingS10 } from '../core/building-project-s10.js';

export const BUILDING_PRESETS_3H = Object.freeze(['rectangle','L','courtyard','T']);
export const BUILDING_TYPES_3H = BUILDING_USE_TYPES;
const h3Same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const h3Finite = x => typeof x === 'number' && Number.isFinite(x);
const h3Point = (frame,u,v) => ({
  x:frame.origin.x+frame.tangent.x*u+frame.inward.x*v,
  y:frame.origin.y+frame.tangent.y*u+frame.inward.y*v
});
export function buildingLocalPoint3H(property,world) {
  const f=property?.frame;
  if (!f || !world || !h3Finite(world.x) || !h3Finite(world.y)) return null;
  const dx=world.x-f.origin.x,dy=world.y-f.origin.y;
  return {u:dx*f.tangent.x+dy*f.tangent.y,v:dx*f.inward.x+dy*f.inward.y};
}
export function defaultBuildingSpec3H(property,source=null) {
  const f=property?.frame,local=property?.local;
  if (!f || !local) throw new Error('Property placement frame is unavailable.');
  if (!source) return {
    u:local.x+local.width/2,v:local.y+local.depth/2,
    width:Math.min(5,Math.max(3,local.width*.35)),
    depth:Math.min(5,Math.max(3,local.depth*.35)),
    angle:0,preset:'rectangle',type:'house'
  };
  const pts=simpleBuildingViewS10(source).footprint.map(p=>buildingLocalPoint3H(property,p));
  const xs=pts.map(p=>p.u),ys=pts.map(p=>p.v);
  const minU=Math.min(...xs),maxU=Math.max(...xs),minV=Math.min(...ys),maxV=Math.max(...ys);
  return {u:(minU+maxU)/2,v:(minV+maxV)/2,width:Math.max(2,maxU-minU),
    depth:Math.max(2,maxV-minV),angle:0,
    preset:BUILDING_PRESETS_3H.includes(source.shape)?source.shape:'rectangle',
    type:source.type};
}
export function makeBuildingShape3H(property,spec,existingType) {
  if (!property?.frame || !spec || !BUILDING_PRESETS_3H.includes(spec.preset)
      || (!BUILDING_TYPES_3H.includes(spec.type)
        && !(typeof spec.type === 'string' && spec.type.length > 0 && spec.type === existingType))) throw new Error('Choose a supported shape and building use.');
  if (!['u','v','width','depth','angle'].every(key=>h3Finite(spec[key]))
      || spec.width<2 || spec.depth<2 || spec.width>250 || spec.depth>250
      || Math.abs(spec.u)>10000 || Math.abs(spec.v)>10000 || Math.abs(spec.angle)>360)
    throw new Error('Position, size or angle is outside supported limits (2–250 units).');
  const w=spec.width,d=spec.depth;
  const rect=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
  const l=[[-w/2,-d/2],[w/2,-d/2],[w/2,-d*.05],[0,-d*.05],[0,d/2],[-w/2,d/2]];
  const t=[[-w/2,-d/2],[w/2,-d/2],[w/2,-d*.12],[w*.22,-d*.12],[w*.22,d/2],[-w*.22,d/2],[-w*.22,-d*.12],[-w/2,-d*.12]];
  const outer=spec.preset==='L'?l:spec.preset==='T'?t:rect;
  const holes=spec.preset==='courtyard'
    ? [[[-w*.23,-d*.23],[w*.23,-d*.23],[w*.23,d*.23],[-w*.23,d*.23]]] : [];
  const angle=spec.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const map=([x,y])=>h3Point(property.frame,spec.u+x*c-y*s,spec.v+x*s+y*c);
  const footprint=outer.map(map),cutouts=holes.map(h=>h.map(map));
  return {footprint,holes:cutouts,area:polygonSignedArea(footprint)-cutouts.reduce((sum,h)=>sum+polygonSignedArea(h),0),
    orientation:Math.atan2(property.frame.tangent.y,property.frame.tangent.x)+angle};
}
export function newBuildingId3H(city) {
  const ids=new Set(city.buildings.map(b=>b.id));
  for(let attempt=0;attempt<32;attempt++){
    const random=globalThis.crypto?.randomUUID?.().replace(/-/g,'')
      ?? (Date.now().toString(36)+Math.random().toString(36).slice(2,14));
    const id='BLD-MAN-'+random.slice(0,24);
    if(!ids.has(id))return id;
  }
  throw new Error('Could not allocate a unique building identifier.');
}
export class BuildingPlacementSession3H {
  constructor(changed=()=>{}) {this.changed=changed;this.active=null;this.drag=null;this.validation=null;}
  get isActive(){return Boolean(this.active);}
  get propertyId(){return this.active?.propertyId??null;}
  get buildingId(){return this.active?.buildingId??null;}
  get operation(){return this.active?.operation??null;}
  get spec(){return this.active?.spec??null;}
  start(city,propertyId,buildingId=null) {
    const property=city?.properties.find(p=>p.id===propertyId);
    const source=buildingId?city?.buildings.find(b=>b.id===buildingId&&b.propertyId===propertyId):null;
    if(!property || (buildingId && !hasSimpleBuildingFootprintS10(source)))return false;
    this.acceptedCity=city;
    this.active={operation:buildingId?'replace':'add',propertyId,
      buildingId:buildingId??newBuildingId3H(city),spec:defaultBuildingSpec3H(property,source)};
    if (source) this.active.spec.preset = '';
    this.drag=null;this.validation=null;this.changed();return true;
  }
  update(changes) {
    if(!this.active)return false;
    const next={...this.active.spec,...changes};
    // Invalid extents may be entered temporarily; validation is handled by the
    // safe preview gate. Never admit NaN, Infinity or malformed numeric input.
    if(!['u','v','width','depth','angle'].every(k=>h3Finite(next[k])))return false;
    this.active.spec=next;
    this.active.replaceGeometry = false;
    this.changed();return true;
  }
  property(city){return city?.properties.find(p=>p.id===this.propertyId)??null;}
  previewFor(city) {
    if(!this.active || this.operation === 'components')return null;
    const existingType = this.operation === 'replace' ? city.buildings.find(b => b.id === this.buildingId)?.type : undefined;
    try{return makeBuildingShape3H(this.property(city),this.spec,existingType);}catch{return null;}
  }
  stop(){if(!this.active)return false;this.active=null;this.acceptedCity=null;this.drag=null;this.validation=null;this.changed();return true;}
}
// Validation and transaction are performed against fresh independent project
// objects; no draft or temporary generated building is ever accepted blindly.
export function prepareBuildingStructure3H(project,workspace,request,{quick=false,identityReservation=null}={}) {
  const issue=(code,message,targetId=null)=>({ok:false,status:'invalid',issues:[{code,message,targetId}],candidate:null});
  const {operation,propertyId,buildingId,spec,courtyard}=request??{};
  const portalOnly = operation === 'add' && courtyard?.hostId && courtyard.only;
  const property=project?.city?.properties.find(p=>p.id===propertyId);
  if(!property)return issue('property','Select a valid property first.',propertyId);
  if(!['add','replace','delete'].includes(operation))return issue('operation','Unsupported building action.');
  const existing=project.city.buildings.find(b=>b.id===buildingId);
  let verifiedAllocation=null;
  const allocationRequests=[{type:'building',key:'manual-building'}];
  if(identityReservation!==null){
    if(project.schemaVersion!==11||operation!=='add'||portalOnly||existing)
      return issue('id','Identity reservation requires a new building on a Schema 11 project.');
    try{
      const {context,receipt}=identityReservation;
      verifiedAllocation=verifyIdentityReservation(project.identityAllocation,project.city,
        context,allocationRequests,receipt);
      if(receipt.allocations[0].id!==buildingId)
        throw Error('Building identity does not match its reservation.');
    }catch(error){return issue('id',error.message);}
  }else if(operation==='add' && (existing || typeof buildingId!=='string' || !buildingId.startsWith('BLD-MAN-')))
    return issue('id','New building identifier must be unique.');
  if(operation!=='add' && (!existing || existing.propertyId!==propertyId))
    return issue('target','The target building is not on this property.',buildingId);
  if (operation === 'replace' && !hasSimpleBuildingFootprintS10(existing))
    return issue('geometry','Use Edit building components to change a multipart footprint.');
  let geometry=null;
  if(operation!=='delete' && !portalOnly) {
    try{geometry=makeBuildingShape3H(property,spec,operation === 'replace' ? existing.type : undefined);}
    catch(error){return issue('shape',error.message);}
  }
  const provisional=copyJson(project),site=provisional.city.properties.find(p=>p.id===propertyId);
  if(verifiedAllocation)provisional.identityAllocation=verifiedAllocation;
  let accessPreview = null;
  if (portalOnly) {
    try { accessPreview = editCourtyardPlacement(provisional.city, propertyId, courtyard); }
    catch (error) { return issue('courtyard-access', error.message); }
  } else if(operation==='delete'){
    try { detachCourtyardBuilding(provisional.city, existing); }
    catch (error) { return issue('courtyard-access', error.message); }
    provisional.city.buildings=provisional.city.buildings.filter(b=>b.id!==buildingId);
    site.buildingIds=site.buildingIds.filter(id=>id!==buildingId);
  } else {
    const record={...(operation==='replace'?existing:{}),
      id:buildingId,blockId:property.blockId,propertyId,
      plotIds:[],frontageRoadId:property.frontageRoadId,
      type:spec.type,shape:spec.preset,
      ...geometry,roofTone:existing?.roofTone??2,
      districtId:property.districtId??null,
      entrance:geometry.footprint[0],accessPath:[geometry.footprint[0],geometry.footprint[1]]};
    const canonical=operation==='add'
      ?adoptNewBuildingS10(record):writeSimpleBuildingS10(existing,record);
    if(operation==='add'){site.buildingIds.push(buildingId);provisional.city.buildings.push(canonical);}
    else provisional.city.buildings=provisional.city.buildings.map(b=>b.id===buildingId?canonical:b);
    // 3G-C's exact geometry, occupied-plot and original-road validation.
    const geometryCheck=inspectBuildingGeometry(provisional.city,buildingId,{});
    if(!geometryCheck.ok)return {...geometryCheck,status:'invalid',candidate:null};
    if(quick)return {ok:true,status:'checking',issues:[],preview:geometry,candidate:null};
    if (operation === 'add' && courtyard?.hostId) {
      try {
        canonical.plotIds = deriveOccupiedPlots(provisional.city, site, canonical);
        if (!canonical.plotIds.length) throw Error('The courtyard building needs an occupied plot.');
        if (courtyard.action === 'remove') throw Error('Remove a portal in portal-only mode.');
        accessPreview = editCourtyardPlacement(provisional.city, propertyId, courtyard, canonical);
      } catch (error) { return issue('courtyard-access', error.message); }
    } else {
      const result=prepareBuildingApply(provisional,workspace,buildingId,{});
      if(result.ok&&verifiedAllocation){
        try{
          const checked=verifyIdentityAdditions(project.identityAllocation,project.city,
            identityReservation.context,allocationRequests,identityReservation.receipt,result.candidate.city);
          if(!h3Same(result.candidate.identityAllocation,checked))
            throw Error('Building placement changed verified allocation state.');
        }catch(error){return issue('id',error.message);}
      }
      return {...result,preview:geometry};
    }
  }
  if(quick)return {ok:true,status:'checking',issues:[],preview:null,candidate:null};
  try{
    if(verifiedAllocation)verifyIdentityAdditions(project.identityAllocation,project.city,
      identityReservation.context,allocationRequests,identityReservation.receipt,provisional.city);
    validateStoredProject(provisional);
    const out=decodeProjectDocument(encodeProjectDocument(createProjectDocument(provisional,workspace)));
    if(!h3Same(out.project.city,provisional.city)||
       (verifiedAllocation&&!h3Same(out.project.identityAllocation,verifiedAllocation)))
      throw new Error('Portable save/load changed the city or verified allocation.');
    return {ok:true,status:'valid',issues:[],preview:geometry,accessPreview,candidate:out.project};
  }catch(error){return issue('project',error.message);}
}
