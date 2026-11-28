// P6 D2/E-entry: construct a complete detached city ONLY when all affected
// land is accounted for. No authority, identity allocation, or verification.
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {equalP6BlockRecord as equal} from './ares-p6-block-record-plan.mjs';
import {classifyLareProperty,classifyLareBuilding} from '../../../src/core/reconciliation-policy.js';
import {stampRoadGenerated} from '../../../src/core/road-provenance.js';
import {polygonSignedArea,roadFrameLength} from '../../../src/core/geometry.js';
import {propertyLocalBounds3I} from '../../../src/core/property-geometry.js';
import {transformLareBuilding,verifyLareRigidGeometry} from '../../../src/core/reconciliation-buildings.js';
import {reconcileLareAccess} from '../../../src/core/reconciliation-access.js';
import {hydrateCityS10} from '../../../src/core/building-project-s10.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
const clone=(x,b)=>{const s=aresReplayJson(x,b);charge(b,Math.ceil(Buffer.byteLength(s)/64));return JSON.parse(s);};
export function assembleP6DetachedCity(source,candidateRoads,extraction,e,b,{frontageBundles=null}={}){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const {identity,blockPlan,propertyAudit,parcelReshapes,fixedBuildings,rigidTranslations,relocationExtension,relocatedAccess}=e;
 const refuse=(reason,details={})=>({status:'assembly-refused',reason,details,authority:'none',valid:false,landVerified:false,candidate:null});
 if(!extraction?.valid||!identity?.correspondenceValid||blockPlan?.status!=='block-plan-observed'||propertyAudit?.status!=='matched'||parcelReshapes?.status!=='parcel-reshape-observed'||fixedBuildings?.status!=='fixed-buildings-observed'||rigidTranslations?.status!=='rigid-translations-observed'||relocationExtension?.status!=='relocation-extension-observed'||relocatedAccess?.status!=='relocated-access-observed'||[identity,blockPlan,propertyAudit,parcelReshapes,fixedBuildings,rigidTranslations,relocationExtension,relocatedAccess].some(x=>x.authority!=='none'))return refuse('unqualified-input');
 const index=(records,key='id')=>{const m=new Map();for(const r of records){b.spend();if(typeof r[key]!=='string'||m.has(r[key]))return null;m.set(r[key],r);}return m;};
 const props=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),blocks=index(source.blocks),oldRoads=index(source.roads),oldNodes=index(source.nodes),
  audit=index(propertyAudit.rows),rows=index(parcelReshapes.rows),fixed=index(fixedBuildings.rows),rigid=index(rigidTranslations.rows),selected=index(relocationExtension.selected),routes=index(relocatedAccess.rows);
 if([props,plots,buildings,blocks,oldRoads,oldNodes,audit,rows,fixed,rigid,selected,routes].some(x=>!x))return refuse('duplicate-inventory');
 // Preserve complex dependency groups as complete fixed records. Do not
 // interpret generated provenance as permission to separate their members.
 const complexOwners=new Set(),linkedOccupants=new Set(),compoundMembers=new Set();
 for(const p of props.values())for(const c of p.buildingCompounds??[]){
  b.spend();complexOwners.add(p.id);
  if(!Array.isArray(c.memberBuildingIds)||c.memberBuildingIds.length<2)return refuse('invalid-compound');
  for(const id of c.memberBuildingIds){
   b.spend();const building=buildings.get(id);charge(b,p.buildingIds.length);
   if(!building||building.propertyId!==p.id||building.blockId!==p.blockId||!p.buildingIds.includes(id)||compoundMembers.has(id))return refuse('invalid-compound-member');
   compoundMembers.add(id);
  }
 }
 for(const building of buildings.values()){
  b.spend();const p=props.get(building.propertyId),g=building.geometry;
  if(!p||!g||!Array.isArray(g.regions))return refuse('missing-building-owner-or-geometry');
  if(g.regions.length!==1||building.components?.length!==1||g.courtyardAccess||g.version===2)complexOwners.add(p.id);
  if(g.version===2||g.courtyardAccess){
   const access=g.courtyardAccess;
   if(!Array.isArray(access?.portals)||!Array.isArray(access?.occupants))return refuse('invalid-courtyard-links');
   const portals=index(access.portals);if(!portals)return refuse('duplicate-courtyard-portal');
   for(const link of access.occupants){
    b.spend();const occupant=buildings.get(link.buildingId);
    if(!occupant||occupant.id===building.id||occupant.propertyId!==p.id||!portals.has(link.portalId)||linkedOccupants.has(occupant.id))return refuse('invalid-courtyard-occupant');
    linkedOccupants.add(occupant.id);
   }
  }
 }
 const unresolved=[];
 for(const id of audit.keys()){b.spend();if(!selected.has(id)&&!frontageBundles?.has(id))unresolved.push(id);}
 for(const id of selected.keys()){b.spend();if(!audit.has(id)||!rows.has(id))return refuse('selection-outside-audit');}
 if(unresolved.length)return refuse('incomplete-land-selection',{unresolved:unresolved.length,structuralBlocks:blockPlan.structural,complexOwners:complexOwners.size});
 if(blockPlan.structural!==0||blockPlan.rows.length!==blocks.size||identity.changed.some(x=>x.kind!=='block'))return refuse('structural-or-protected-face-reconstruction-required',{structuralBlocks:blockPlan.structural,complexOwners:complexOwners.size});
 const faceByKey=new Map(),nextBlocks=new Map(),changedBlocks=new Set();
 for(const f of extraction.faces){b.spend();if(f.kind==='block')faceByKey.set(f.key,f);}
 for(const row of blockPlan.rows){
  b.spend();const old=blocks.get(row.record?.id);
  if(!old||row.status!=='retained-record-proposal'||nextBlocks.has(old.id)||!faceByKey.has(row.key))return refuse('invalid-retained-block');
  nextBlocks.set(old.id,row.record);
  if(row.relation==='reshaped')changedBlocks.add(old.id);
 }
 const nextRoads=index(candidateRoads.roads),nextNodes=index(candidateRoads.nodes);
 if(!nextRoads||!nextNodes)return refuse('duplicate-road-record');
 const unchangedRoad=id=>{
  b.spend();const a=oldRoads.get(id),c=nextRoads.get(id);
  return !!a&&!!c&&equal(a,c,b)&&equal(oldNodes.get(a.a),nextNodes.get(c.a),b)&&equal(oldNodes.get(a.b),nextNodes.get(c.b),b);
 };
 const nextProperties=new Map(),nextPlots=new Map(),nextBuildings=new Map(),switchedBuildings=new Map();
 if(frontageBundles)for(const id of frontageBundles.keys()){b.spend();if(!audit.has(id)||selected.has(id))return refuse('invalid-frontage-bundle-owner');}
 for(const p of props.values()){
  b.spend();const s=selected.get(p.id),bundle=frontageBundles?.get(p.id);
  if(bundle){
   const q=bundle.property,own=p.plotIds.map(id=>plots.get(id));
   aresReplayJson([p,own,bundle],b);const policy=classifyLareProperty(p,own);
   if(complexOwners.has(p.id)||policy.mode!=='adaptive'||policy.provenance!=='generated'||!changedBlocks.has(p.blockId)||bundle.scale!==1||q.id!==p.id||q.blockId!==p.blockId||q.frontageRoadId===p.frontageRoadId||!equal(q.plotIds,p.plotIds,b)||!equal(q.buildingIds,p.buildingIds,b)||bundle.plots.length!==own.length||bundle.buildings.length!==p.buildingIds.length)return refuse('invalid-frontage-bundle');
   for(let i=0;i<own.length;i++){
    b.spend();const old=own[i],plot=bundle.plots[i];
    if(!old||plot.id!==old.id||plot.propertyId!==p.id||plot.blockId!==old.blockId||plot.frontageRoadId!==q.frontageRoadId)return refuse('invalid-frontage-plot');
    nextPlots.set(plot.id,plot);
   }
   for(let i=0;i<p.buildingIds.length;i++){
    b.spend();const old=buildings.get(p.buildingIds[i]),next=bundle.buildings[i];
    if(!old||next.id!==old.id||next.propertyId!==p.id||next.frontageRoadId!==q.frontageRoadId)return refuse('invalid-frontage-building');
    const permission=classifyLareBuilding(old,policy,false);
    if(permission.mode!=='rigid'||permission.provenance!=='generated'||!verifyLareRigidGeometry(old,{...next,frontageRoadId:old.frontageRoadId},b))return refuse('protected-frontage-building');
    nextBuildings.set(old.id,next);switchedBuildings.set(old.id,{old,permission});
   }
   nextProperties.set(p.id,q);continue;
  }
  if(!s){if(changedBlocks.has(p.blockId))return refuse('unaccounted-changed-block-property');continue;}
  const row=rows.get(p.id),w=rigid.get(p.id)?.witness;
  const o=s.kind==='ordinary'?row.options[s.index]:s.kind==='relocated'?row.conditionalOptions?.[s.index]:null;
  const plannedBlock=nextBlocks.get(p.blockId),face=faceByKey.get(s.key);
  if(!o||o.authority!=='none'||o.key!==s.key||!plannedBlock||!face||o.frontageRoadId!==p.frontageRoadId||!equal(plannedBlock.vertices,face.vertices,b))return refuse('invalid-selected-option');
  const own=[];for(const id of p.plotIds){b.spend();const q=plots.get(id);if(!q||q.propertyId!==p.id)return refuse('invalid-plot-owner');own.push(q);}
  if(o.plots.length!==own.length||o.plots.some((q,i)=>q.id!==own[i].id))return refuse('plot-identity-mismatch');
  const unchanged=equal(p.boundary,o.boundary,b)&&own.every((q,i)=>equal(q.boundary,o.plots[i].boundary,b))&&unchangedRoad(p.frontageRoadId);
  if(complexOwners.has(p.id)){
   if(!unchanged||s.kind!=='ordinary')return refuse('complex-group-reconstruction-required',{propertyId:p.id});
   // The complete source group is copied unchanged. Its route/topology
   // will still require the independent whole-city verifier.
   continue;
  }
  aresReplayJson([p,own],b);const policy=classifyLareProperty(p,own);
  if(policy.mode!=='adaptive'||policy.provenance!=='generated')return refuse('protected-property');
  if(!unchanged){
   charge(b,face.roadIds.length);
   const j=face.roadIds.indexOf(p.frontageRoadId);if(j<0)return refuse('missing-frontage');
   const a=face.polygon[j],c=face.polygon[(j+1)%face.polygon.length],length=roadFrameLength(c.x-a.x,c.y-a.y);
   if(length<=1e-6)return refuse('invalid-frontage');
   const tangent={x:(c.x-a.x)/length,y:(c.y-a.y)/length},frame={origin:{x:a.x,y:a.y},tangent,inward:{x:-tangent.y,y:tangent.x}};
   const q={...p,boundary:o.boundary,frontage:o.boundary.slice(0,2),frame,area:polygonSignedArea(o.boundary)};
   charge(b,4*o.boundary.length);q.local=propertyLocalBounds3I(q,q.boundary);
   const newPlots=own.map((old,i)=>({...old,boundary:o.plots[i].boundary}));
   aresReplayJson([q,newPlots],b);stampRoadGenerated(q,newPlots);
   nextProperties.set(p.id,q);for(const plot of newPlots){b.spend();nextPlots.set(plot.id,plot);}
  }
  if(s.kind==='relocated'&&(!w||w.optionIndex!==s.index||w.key!==s.key||w.buildings.length!==p.buildingIds.length))return refuse('missing-rigid-witness');
  for(let i=0;i<p.buildingIds.length;i++){
   b.spend();const id=p.buildingIds[i],old=buildings.get(id),route=routes.get(id),f=fixed.get(id);
   if(!old||old.propertyId!==p.id||!route?.route||route.propertyId!==p.id||route.route.frontageRoadId!==p.frontageRoadId)return refuse('incomplete-building-access',{buildingId:id});
   const permission=classifyLareBuilding(old,policy,false);let next={...old},occupied;
   if(s.kind==='relocated'){
    const m=w.buildings[i];if(!m||m.id!==id||permission.mode!=='rigid'||permission.provenance!=='generated')return refuse('protected-rigid-building');
    aresReplayJson(old,b);aresReplayJson(m,b);
    const n=old.geometry.regions[0].ring.length;charge(b,64*n*n+n+old.accessPath.length);
    try{next=transformLareBuilding(old,permission,m.transform,b);}
    catch(error){if(error instanceof LareBudgetExceeded)throw error;return refuse('invalid-rigid-transform');}
    if(!verifyLareRigidGeometry(old,next,b)||!equal(next.geometry,m.geometry,b)||!equal(next.entrance,m.entrance,b)||next.area!==m.area||next.orientation!==m.orientation)return refuse('rigid-witness-mismatch');
    occupied=m.occupiedPlotIds;
   }else{
    if(!f||!['fixedPreserved','plotReferenceChange'].includes(f.classification)||f.propertyId!==p.id)return refuse('incomplete-fixed-occupancy',{buildingId:id});
    occupied=f.occupiedPlotIds;
   }
   charge(b,occupied.length*p.plotIds.length+occupied.length);
   if(!occupied.length||new Set(occupied).size!==occupied.length||occupied.some(id=>!p.plotIds.includes(id))||!equal(next.entrance,route.route.entrance,b))return refuse('invalid-occupancy-or-door');
   next={...next,plotIds:occupied,entrance:route.route.entrance,accessPath:route.route.accessPath};
   if(!equal(old,next,b)){
    if(permission.mode!=='rigid'||permission.provenance!=='generated')return refuse('protected-building-change');
    aresReplayJson(next,b);stampRoadGenerated(next);nextBuildings.set(id,next);
   }
  }
 }
 const assembled=clone({...source,nodes:candidateRoads.nodes,roads:candidateRoads.roads,
  blocks:source.blocks.map(x=>nextBlocks.get(x.id)),properties:source.properties.map(x=>nextProperties.get(x.id)??x),
  plots:source.plots.map(x=>nextPlots.get(x.id)??x),buildings:source.buildings.map(x=>nextBuildings.get(x.id)??x)},b);
 if(switchedBuildings.size){
  // Route repair takes place only after all actual candidate roofs and
  // parcels are present. The independent concession gate rechecks the city.
  hydrateCityS10(assembled);
  for(let i=0;i<assembled.buildings.length;i++){
   b.spend();const placement=assembled.buildings[i],entry=switchedBuildings.get(placement.id);
   if(!entry)continue;
   aresReplayJson(placement,b);
   const route=reconcileLareAccess(assembled,entry.old,placement,entry.permission,b,{allowAlternativeFrontage:true});
   if(!route.ok)return refuse('alternative-frontage-access-refused',{buildingId:placement.id,code:route.code});
   assembled.buildings[i]=route.building;
  }
 }
 const areaByBlock=new Map();
 for(const p of assembled.properties){b.spend();if(changedBlocks.has(p.blockId))areaByBlock.set(p.blockId,(areaByBlock.get(p.blockId)??0)+p.area);}
 for(const s of assembled.openSpaces){b.spend();if(changedBlocks.has(s.blockId))s.area=Math.max(0,nextBlocks.get(s.blockId).area-(areaByBlock.get(s.blockId)??0));}
 return {status:'candidate-assembled',reason:null,authority:'none',valid:false,landVerified:false,candidate:assembled,
  counts:{propertiesUpdated:nextProperties.size,plotsUpdated:nextPlots.size,buildingsUpdated:nextBuildings.size,complexOwnersPreserved:complexOwners.size,...(frontageBundles?{frontageSwitches:frontageBundles.size}:{})},
  limitations:['independent-road-authorization-required','independent-whole-city-verification-required','no-apply']};
}
