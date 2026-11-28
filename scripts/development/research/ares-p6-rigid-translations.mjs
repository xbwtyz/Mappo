// D1b1/b2: individual conditional parcel + bounded rigid placement evidence.
// Not a city solution: no cross-property compatibility or access authority.
import {classifyLareProperty,classifyLareBuilding} from '../../../src/core/reconciliation-policy.js';
import {transformLareBuilding,verifyLareRigidGeometry} from '../../../src/core/reconciliation-buildings.js';
import {shapeWellFormed,shapeContained,shapesOverlapInterior} from '../../../src/core/building-validation.js';
import {polygonRingsProperlyCross} from '../../../src/core/geometry.js';
import {polygonIntersectionAreaS10} from '../../../src/core/building-occupancy-s10.js';
import {LARE_LIMITS,LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
const center=(r,b)=>{let x=0,y=0;for(const p of r){b.spend();x+=p.x;y+=p.y;}return {x:x/r.length,y:y/r.length};};
const ringOK=(r,b)=>{const n=Array.isArray(r)?r.length:0;charge(b,8*n*n+n);return shapeWellFormed(r);};
export function observeP6RigidTranslations(source,reshapes,fixed,b,{collective=false}={}){
 if(!b?.spend||!b?.expand||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(reshapes?.status!=='parcel-reshape-observed'||fixed?.status!=='fixed-buildings-observed'||reshapes.authority!=='none'||fixed.authority!=='none')return refuse('unqualified-input');
 const index=records=>{const m=new Map();for(const r of records){b.spend();if(typeof r.id!=='string'||m.has(r.id))return null;m.set(r.id,r);}return m;};
 const props=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),evidence=index(fixed.rows);
 if(!props||!plots||!buildings||!evidence)return refuse('duplicate-inventory');
 const dependent=new Set();
 for(const p of props.values())for(const c of p.buildingCompounds??[]){b.spend();for(const id of c.memberBuildingIds??[]){b.spend();dependent.add(id);}}
 for(const building of buildings.values()){b.spend();const g=building.geometry?.courtyardAccess;if(g){dependent.add(building.id);for(const o of g.occupants??[]){b.spend();dependent.add(o.buildingId);}}}
 const rows=[],counts={notNeeded:0,noConditional:0,protected:0,noPlacement:0,placementObserved:0};
 const geometryBudget={charge:(n=1)=>charge(b,n)};
 for(const row of reshapes.rows){
  b.spend();const p=props.get(row.id);if(!p||!Array.isArray(row.conditionalOptions)||row.conditionalOptions.length>LARE_LIMITS.parcelCandidates)return refuse('invalid-parcel-census');
  const out={id:p.id,classification:null,attempts:0,rotationAttempts:0,conditionalCount:row.conditionalOptions.length,witness:null};
  const finish=kind=>{out.classification=kind;counts[kind]++;rows.push(out);};
  if(collective)out.witnesses=[];
  if(row.options.length&&!collective){finish('notNeeded');continue;}
  if(!row.conditionalOptions.length){finish('noConditional');continue;}
  const own=[];for(const id of p.plotIds){b.spend();const q=plots.get(id);if(!q||q.propertyId!==p.id)return refuse('invalid-plot-owner');own.push(q);}
  aresReplayJson([p,own],b);const policy=classifyLareProperty(p,own),members=[];
  let eligible=policy.mode==='adaptive'&&p.buildingIds.length>0&&!p.buildingCompounds?.length;
  for(const id of p.buildingIds){
   b.spend();const s=buildings.get(id),e=evidence.get(id);if(!s||s.propertyId!==p.id||e?.propertyId!==p.id)return refuse('invalid-building-census');
   aresReplayJson(s,b);const permission=classifyLareBuilding(s,policy,dependent.has(id));
   const rr=s.geometry?.regions;
   if(permission.mode!=='rigid'||permission.provenance!=='generated'||e.permission.mode!=='rigid'||rr?.length!==1||rr[0].kind!=='solid'||rr[0].parentId!==null||s.components?.length!==1||!ringOK(rr[0].ring,b))eligible=false;
   members.push({source:s,permission});
  }
  if(!eligible){finish('protected');continue;}
  const oldCenter=center(p.boundary,b);
  // Exhaust the original translation pass first; never replace its witness
  // with an unnecessary rotation. The second pass is a bounded fallback.
  const foundIndices=new Set();
  const cap=collective?Math.min(6,LARE_LIMITS.parcelCandidates):1;
  for(const phase of ['translation','rotation'])for(let i=0;i<row.conditionalOptions.length&&(collective?out.witnesses.length<cap:!out.witness);i++){
   b.spend();if(foundIndices.has(i))continue;
   b.spend();const o=row.conditionalOptions[i];
   if(o.authority!=='none'||o.requiresRigidPlacement!==true||o.frontageRoadId!==p.frontageRoadId||!ringOK(o.boundary,b)||o.plots.length!==own.length||o.plots.some((q,j)=>q.id!==own[j].id||!ringOK(q.boundary,b)))return refuse('invalid-conditional-option');
   const target=center(o.boundary,b),placed=[];
   for(const member of members){
    b.spend();const s=member.source,origin=center(s.geometry.regions[0].ring,b);
    let found=null;
    const transforms=[{dx:0,dy:0,angle:0},{dx:target.x-oldCenter.x,dy:target.y-oldCenter.y,angle:0},{dx:target.x-origin.x,dy:target.y-origin.y,angle:0}];
    if(phase==='rotation'){
     for(const angle of [Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI/6,-Math.PI/6,Math.PI/12,-Math.PI/12,Math.PI]){
      b.spend();
      transforms.push({dx:target.x-oldCenter.x,dy:target.y-oldCenter.y,angle},
       {dx:target.x-origin.x,dy:target.y-origin.y,angle});
     }
    }
    const tried=new Set();
    for(const t of transforms){
     b.spend();const key=JSON.stringify(t);if(tried.has(key))continue;tried.add(key);
     if(out.attempts>=LARE_LIMITS.stateExpansions)break;
     b.expand();out.attempts++;if(t.angle!==0)out.rotationAttempts++;
     try{
      // Existing LARE/SRE rigid transform; prepay bounded simple-ring validation.
      const n=s.geometry.regions[0].ring.length;
      charge(b,64*n*n+n+s.accessPath.length);
      const next=transformLareBuilding(s,member.permission,t,b);
      if(!verifyLareRigidGeometry(s,next,b))continue;
      const ring=next.geometry.regions[0].ring;
      charge(b,8*ring.length*o.boundary.length);
      if(!shapeContained(ring,o.boundary)||polygonRingsProperlyCross(ring,o.boundary,b.spend))continue;
      let collision=false;
      for(const prior of placed){
       b.spend();const other=prior.geometry.regions[0].ring;
       charge(b,32*ring.length*other.length+8*(ring.length+other.length));
       if(shapesOverlapInterior(ring,other)){collision=true;break;}
      }
      if(collision)continue;
      const plotIds=[];let total=0;
      for(const q of o.plots){
       b.spend();charge(b,16*(ring.length**2+q.boundary.length**2)+ring.length+q.boundary.length);
       const area=polygonIntersectionAreaS10(ring,q.boundary,geometryBudget);total+=area;if(area>1e-5)plotIds.push(q.id);
      }
      if(!plotIds.length||Math.abs(total-s.area)>.02)continue;
      found={id:s.id,transform:t,geometry:next.geometry,orientation:next.orientation,area:next.area,entrance:next.entrance,occupiedPlotIds:plotIds,authority:'none'};break;
     }catch(error){if(error instanceof LareBudgetExceeded)throw error;}
    }
    if(!found)break;
    placed.push(found);
   }
   if(placed.length===members.length&&placed.some(x=>x.transform.dx!==0||x.transform.dy!==0||x.transform.angle!==0)){
    const witness={optionIndex:i,key:o.key,phase,buildings:placed,authority:'none',access:'not-verified',crossProperty:'not-verified'};
    foundIndices.add(i);if(!out.witness)out.witness=witness;
    if(collective)out.witnesses.push(witness);
   }
  }
  finish(out.witness?'placementObserved':'noPlacement');
 }
 const result={status:'rigid-translations-observed',authority:'none',valid:false,landVerified:false,rows,counts,
  coverage:'conditional-same-frontage-individual-parcel-simple-rigid-placement',selection:'not-performed',access:'not-verified'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
