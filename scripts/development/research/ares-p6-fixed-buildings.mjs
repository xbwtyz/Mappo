// D1a: fixed building occupancy and movement-policy census. No transforms.
import {classifyLareProperty,classifyLareBuilding} from '../../../src/core/reconciliation-policy.js';
import {shapeContained,shapeWellFormed,shapesOverlapInterior} from '../../../src/core/building-validation.js';
import {polygonRingsProperlyCross,polygonSignedArea} from '../../../src/core/geometry.js';
import {polygonIntersectionAreaS10} from '../../../src/core/building-occupancy-s10.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
const ringOK=(r,b)=>{const n=Array.isArray(r)?r.length:0;charge(b,8*n*n+n);return shapeWellFormed(r);};
const sameIds=(a,c,b)=>{charge(b,a.length*c.length+a.length+c.length);return a.length===c.length&&new Set(a).size===a.length&&a.every(id=>c.includes(id));};
export function observeP6FixedBuildings(source,reshapes,cooperative,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(reshapes?.status!=='parcel-reshape-observed'||cooperative?.status!=='cooperative-parcels-observed'||reshapes.authority!=='none'||cooperative.authority!=='none')return refuse('unqualified-input');
 const index=records=>{const m=new Map();for(const r of records){b.spend();if(typeof r.id!=='string'||m.has(r.id))return null;m.set(r.id,r);}return m;};
 const props=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),options=index(reshapes.rows),selected=index(cooperative.selected);
 if(!props||!plots||!buildings||!options||!selected)return refuse('duplicate-inventory');
 const dependent=new Set(),rawOwners=new Map();
 for(const building of buildings.values()){
  b.spend();const list=rawOwners.get(building.propertyId)??[];list.push(building.id);rawOwners.set(building.propertyId,list);
  const courtyard=building.geometry?.courtyardAccess;
  if(courtyard){dependent.add(building.id);for(const o of courtyard.occupants??[]){b.spend();dependent.add(o.buildingId);}}
 }
 for(const p of props.values())for(const compound of p.buildingCompounds??[]){
  b.spend();for(const id of compound.memberBuildingIds??[]){b.spend();dependent.add(id);}
 }
 const rows=[],counts={fixedPreserved:0,plotReferenceChange:0,blocked:0,deferred:0,complex:0,unsupported:0};
 const policies={rigid:0,fixed:0},properties=[];
 const geometryBudget={charge:(n=1)=>charge(b,n)};
 for(const row of reshapes.rows){
  b.spend();const p=props.get(row.id);
  if(!p||!sameIds(p.buildingIds,rawOwners.get(p.id)??[],b))return refuse('invalid-building-census');
  const own=[],ownBuildings=[];
  for(const id of p.plotIds){b.spend();const q=plots.get(id);if(!q||q.propertyId!==p.id)return refuse('invalid-plot-owner');own.push(q);}
  aresReplayJson([p,own],b);const policy=classifyLareProperty(p,own);
  const s=selected.get(p.id),option=s?row.options[s.index]:null;
  if(s&&(!option||option.authority!=='none'||option.key!==s.key||option.frontageRoadId!==p.frontageRoadId||!sameIds(p.plotIds,option.plots.map(q=>q.id),b)))return refuse('invalid-selected-parcel');
  if(option&&(!ringOK(option.boundary,b)||option.plots.some(q=>!ringOK(q.boundary,b))))return refuse('invalid-candidate-geometry');
  for(const id of p.buildingIds){
   b.spend();const building=buildings.get(id);if(!building||building.propertyId!==p.id)return refuse('invalid-building-owner');
   ownBuildings.push(building);
  }
  const pr={id:p.id,selected:!!option,buildingCount:ownBuildings.length,rigidEligible:0,fixed:0};properties.push(pr);
  for(const building of ownBuildings){
   b.spend();aresReplayJson(building,b);
   const permission=classifyLareBuilding(building,policy,dependent.has(building.id));
   const entry={id:building.id,propertyId:p.id,permission,classification:null,reason:null,occupiedPlotIds:[],area:null};
   const finish=(kind,reason=null)=>{entry.classification=kind;entry.reason=reason;counts[kind]++;rows.push(entry);};
   if(permission.mode==='rigid'){policies.rigid++;pr.rigidEligible++;}else{policies.fixed++;pr.fixed++;}
   const regions=building.geometry?.regions;
   if(dependent.has(building.id)||regions?.length>1||building.components?.length>1){finish('complex','complex-or-dependent-structure');continue;}
   if(!Array.isArray(regions)||regions.length!==1||regions[0].kind!=='solid'||regions[0].parentId!==null||!ringOK(regions[0].ring,b)){
    finish('unsupported','unsupported-simple-geometry');continue;
   }
   const ring=regions[0].ring;charge(b,ring.length);entry.area=polygonSignedArea(ring);
   if(!Number.isFinite(building.area)||Math.abs(entry.area-building.area)>.02){finish('unsupported','source-area-mismatch');continue;}
   if(!option){finish('deferred','parcel-not-selected');continue;}
   charge(b,8*ring.length*option.boundary.length);
   if(!shapeContained(ring,option.boundary)||polygonRingsProperlyCross(ring,option.boundary,b.spend)){finish('blocked','outside-property');continue;}
   let blocked=false,unsupported=false;
   for(const other of ownBuildings){
    b.spend();if(other.id===building.id)continue;
    const rr=other.geometry?.regions;
    if(!Array.isArray(rr)||rr.length!==1||rr[0].kind!=='solid'||rr[0].parentId!==null||!ringOK(rr[0].ring,b)){unsupported=true;continue;}
    charge(b,32*ring.length*rr[0].ring.length+8*(ring.length+rr[0].ring.length));
    if(shapesOverlapInterior(ring,rr[0].ring)){blocked=true;break;}
   }
   if(blocked){finish('blocked','occupied-building-overlap');continue;}
   if(unsupported){finish('complex','complex-neighbor');continue;}
   let total=0;
   try{
    for(const q of option.plots){
     b.spend();charge(b,16*(ring.length**2+q.boundary.length**2)+ring.length+q.boundary.length);
     const area=polygonIntersectionAreaS10(ring,q.boundary,geometryBudget);
     total+=area;if(area>1e-5)entry.occupiedPlotIds.push(q.id);
    }
   }catch(error){if(error instanceof LareBudgetExceeded)throw error;finish('unsupported','occupancy-not-proven');continue;}
   if(!entry.occupiedPlotIds.length||Math.abs(total-entry.area)>.02){finish('blocked','plot-coverage-mismatch');continue;}
   if(!sameIds(building.plotIds,entry.occupiedPlotIds,b)){finish('plotReferenceChange','occupancy-references-require-reconciliation');continue;}
   finish('fixedPreserved');
  }
 }
 for(const s of selected.values()){b.spend();if(!options.has(s.id))return refuse('unknown-selected-owner');}
 const result={status:'fixed-buildings-observed',authority:'none',valid:false,landVerified:false,rows,properties,counts,policies,
  coverage:'selected-simple-fixed-building-geometry-and-plot-occupancy-only',movement:'not-performed',complex:'deferred'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
