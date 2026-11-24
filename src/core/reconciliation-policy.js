import { classifyRoadProvenance } from './road-provenance.js';

export const LARE_POLICY_B1R = Object.freeze({
  operation:'translate-road-group',schemaVersion:10,allowRegeneration:false,
  allowOwnershipChange:false,allowTopologyChange:false,allowFrontageChange:false,
  allowAuthoredBuildingMove:false,allowScaling:false,allowReflection:false
});
const lareKnownKeys=(r,keys)=>r && Object.keys(r).every(k=>keys.includes(k));
const larePoint=p=>lareKnownKeys(p,['x','y'])&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const lareBuildingKeys=['id','blockId','propertyId','plotIds','frontageRoadId','type','shape','area',
  'entrance','orientation','roofTone','accessPath','districtId','geometry','components','roadProvenance'];
// Conservative initial adapter boundary. P3 may extend recognized geometry,
// but unknown extensions and courtyard dependencies cannot be moved speculatively.
function lareKnownBuilding(b){
  const g=b.geometry;
  return lareKnownKeys(b,lareBuildingKeys)&&[1,3].includes(g?.version)&&lareKnownKeys(g,['version','regions'])&&
    Array.isArray(g.regions)&&g.regions.length>0&&g.regions.every(r=>
      lareKnownKeys(r,['id','parentId','kind','componentId','ring'])&&Array.isArray(r.ring)&&
      r.ring.length>=3&&r.ring.every(larePoint))&&Array.isArray(b.components)&&b.components.length>0&&
    b.components.every(c=>lareKnownKeys(c,['id','parentId','name']))&&larePoint(b.entrance)&&
    Array.isArray(b.accessPath)&&b.accessPath.every(larePoint)&&Number.isFinite(b.orientation);
}
const larePropertyKeys=['id','blockId','plotIds','boundary','frontageRoadId','frontage','area','buildingIds',
  'usage','frame','local','districtId','customName','customUse','roadProvenance','buildingCompounds'];
const larePlotKeys=['id','blockId','propertyId','frontageRoadId','boundary'];
const lareFramePoint=p=>lareKnownKeys(p,['id','x','y'])&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const larePropertyRing=r=>Array.isArray(r)&&r.every(lareFramePoint);
function lareKnownProperty(p,plots){
  return lareKnownKeys(p,larePropertyKeys)&&plots.every(q=>lareKnownKeys(q,larePlotKeys)&&
    (!q.boundary||larePropertyRing(q.boundary)))&&
    (!p.boundary||larePropertyRing(p.boundary))&&(!p.frontage||larePropertyRing(p.frontage))&&
    (!p.frame||(lareKnownKeys(p.frame,['origin','tangent','inward'])&&
      [p.frame.origin,p.frame.tangent,p.frame.inward].every(lareFramePoint)))&&
    (!p.local||lareKnownKeys(p.local,['x','y','width','depth']));
}
export function classifyLareProperty(p,plots,choice=null){
  const provenance=classifyRoadProvenance(p,plots);
  let mode;
  if(provenance==='generated')mode=choice?'invalid-choice':'adaptive';
  else if(!choice)mode='decision-required';
  else if(!['keep','reshape'].includes(choice.kind)||choice.targetId!=null||
    Object.keys(choice).some(k=>!['kind','targetId'].includes(k)))mode='invalid-choice';
  else mode=choice.kind==='keep'?'fixed':'authorized-reshape';
  if(['adaptive','authorized-reshape'].includes(mode)&&!lareKnownProperty(p,plots))mode='fixed-unsupported';
  return Object.freeze({provenance,mode});
}
export function classifyLareBuilding(b,propertyPolicy,dependent=false){
  const provenance=classifyRoadProvenance(b);
  const reason=provenance!=='generated'?'authored-or-unknown':
    propertyPolicy?.mode!=='adaptive'?'authored-or-fixed-property':
    dependent?'dependent-structure':!lareKnownBuilding(b)?'unsupported-geometry':null;
  const fixedFrontageReconnect = propertyPolicy?.mode === 'authorized-reshape' && provenance === 'generated' &&
    !dependent && lareKnownBuilding(b);
  return Object.freeze({provenance,mode:reason?'fixed':'rigid',reason,
    ...(fixedFrontageReconnect ? { fixedFrontageReconnect } : {})});
}

const lareCapabilityPolicies = Object.freeze({
  property: classifyLareProperty,
  building: classifyLareBuilding,
});
const lareUnknownObject = Object.freeze({ provenance: 'unknown', mode: 'fixed', reason: 'unsupported-object' });

export function classifyLareObject(kind, record, ...context) {
  return Object.hasOwn(lareCapabilityPolicies, kind) && record
    ? lareCapabilityPolicies[kind](record, ...context)
    : lareUnknownObject;
}
