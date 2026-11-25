// Research-only regeneration adapter, using existing procedural generators.
// The accepted recovery witness is immutable; every addition is separately
// validated. No retired ID is reused and no original survivor is displaced.
import assert from 'node:assert/strict';
import {generateBuildings,populateProperty} from '../../src/generators/buildings.js';
import {createRng} from '../../src/core/prng.js';
import {adoptNewBuildingS10} from '../../src/core/building-project-s10.js';
import {buildingPrimaryRouteViewS10} from '../../src/core/building-geometry-adapter-s10.js';
import {classifyRoadProvenance,stampRoadGenerated} from '../../src/core/road-provenance.js';
import {validateStoredProject} from '../../src/data/project-validation.js';
import {resolveSameFrontageAccessB1R} from '../../src/editor/building-application.js';
import {riReporter,riBudget} from '../../src/core/road-impact-model.js';
import {inspectRoadDependencies,inspectRoadContextReferences} from '../../src/core/road-impact-dependencies.js';

const keys=['properties','plots','buildings'];
const sorted=xs=>[...xs].sort();
const index=xs=>new Map(xs.map(r=>[r.id,r]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const empty=()=>({properties:[],plots:[],buildings:[]});
const prefixes={properties:'PROP-',plots:'PLOT-',buildings:'BLD-'};
function reserve(original,candidate,key,n){
  const taken=new Set([...original.city[key],...candidate.city[key]].map(r=>r.id));
  const prefix=prefixes[key];
  let i=Math.max(0,...[...taken].filter(id=>id.startsWith(prefix)&&/^\d+$/.test(id.slice(prefix.length))).map(id=>Number(id.slice(prefix.length))));
  const ids=[];
  while(ids.length<n){
    const id=prefix+String(++i).padStart(5,'0');
    if(!taken.has(id)){ids.push(id);taken.add(id);}
  }
  return ids;
}
function vacancyLimits(original,removed){
  const limits=new Map();
  for(const key of keys){
    const old=index(original.city[key]);
    for(const id of removed[key]){
      const r=old.get(id);assert.ok(r,'Missing retired source record');
      if(!limits.has(r.blockId))limits.set(r.blockId,{properties:0,plots:0,buildings:0});
      limits.get(r.blockId)[key]++;
    }
  }
  return limits;
}
function recalculate(city,blocks){
  const byBlock=new Map();
  for(const p of city.properties)byBlock.set(p.blockId,(byBlock.get(p.blockId)??0)+p.area);
  const bi=index(city.blocks);
  for(const o of city.openSpaces)if(blocks.has(o.blockId))
    o.area=Math.max(0,bi.get(o.blockId).area-(byBlock.get(o.blockId)??0));
}
function prepareGroup(original,current,raw,existingParent=null){
  const next=structuredClone(current),city=next.city,block=index(city.blocks).get(raw.property.blockId);
  const p=structuredClone(raw.property);
  const propertyId=existingParent??reserve(original,current,'properties',1)[0];
  const plotMap=new Map(raw.plots.map((r,i)=>[r.id,existingParent?r.id:reserve(original,current,'plots',raw.plots.length)[i]]));
  const buildingIds=reserve(original,current,'buildings',raw.buildings.length);
  const newPlots=existingParent?[]:raw.plots.map(r=>({...structuredClone(r),id:plotMap.get(r.id),propertyId}));
  const newBuildings=raw.buildings.map((r,i)=>{
    const transient={...structuredClone(r),id:buildingIds[i],propertyId,plotIds:r.plotIds.map(id=>plotMap.get(id)),
      districtId:block.districtId??null};
    stampRoadGenerated(transient);
    return adoptNewBuildingS10(transient);
  });
  if(existingParent){
    const parent=city.properties.find(r=>r.id===existingParent);
    assert.equal(parent.buildingIds.length,0,'Only vacant shells supported');
    parent.buildingIds=buildingIds;
    stampRoadGenerated(parent,parent.plotIds.map(id=>city.plots.find(r=>r.id===id)));
  }else{
    Object.assign(p,{id:propertyId,plotIds:newPlots.map(r=>r.id),buildingIds,districtId:block.districtId??null});
    stampRoadGenerated(p,newPlots);city.properties.push(p);city.plots.push(...newPlots);
  }
  city.buildings.push(...newBuildings);
  // Repair only new routes, not the accepted survivors. All generated
  // footprints and reciprocal membership must validate first.
  validateStoredProject(next);
  for(const b of newBuildings){
    const access=resolveSameFrontageAccessB1R(city,buildingPrimaryRouteViewS10(b),{allowRepair:true,allowEntranceMove:true,spend:riBudget()});
    if(!access.route)throw Error('New access refused: '+access.code);
    Object.assign(b,{entrance:access.route.entrance,accessPath:access.route.accessPath});
    stampRoadGenerated(b);
  }
  recalculate(city,new Set([block.id]));
  return {candidate:next,added:{properties:existingParent?[]:[propertyId],plots:newPlots.map(r=>r.id),buildings:buildingIds}};
}
export function verifyRegeneration(original,base,candidate,removed,reviewed){
  const limits=vacancyLimits(original,removed),used=new Map(),fresh=new Set(),affected=new Set();
  const baseMaps=Object.fromEntries(keys.map(k=>[k,index(base.city[k])]));
  const originalMaps=Object.fromEntries(keys.map(k=>[k,index(original.city[k])]));
  for(const k of keys){
    const now=index(candidate.city[k]);
    assert.equal(now.size,candidate.city[k].length,'Duplicate record');
    assert.ok([...baseMaps[k].keys()].every(id=>now.has(id)),'Survivor lost');
    const added=candidate.city[k].filter(r=>!baseMaps[k].has(r.id));
    assert.deepEqual(sorted(added.map(r=>r.id)),sorted(reviewed[k]),'Creation differs from reviewed set');
    for(const r of added){
      assert.ok(!originalMaps[k].has(r.id)&&!fresh.has(r.id),'Reused record ID');fresh.add(r.id);
      const cap=limits.get(r.blockId);assert.ok(cap,'Creation outside retirement blocks');
      if(!used.has(r.blockId))used.set(r.blockId,{properties:0,plots:0,buildings:0});
      assert.ok(++used.get(r.blockId)[k]<=cap[k],'Replacement count exceeds local retirement');
      affected.add(r.blockId);
      if(k==='buildings')assert.equal(classifyRoadProvenance(r),'generated');
      if(k==='properties')assert.equal(classifyRoadProvenance(r,r.plotIds.map(id=>candidate.city.plots.find(q=>q.id===id))),'generated');
    }
  }
  // Existing parents may receive only new children, and only if they were
  // vacant, generated and lost a child in the original reviewed operation.
  const removedBuildingParents=new Set(original.city.buildings.filter(b=>removed.buildings.includes(b.id)).map(b=>b.propertyId));
  const projected=structuredClone(candidate);
  for(const k of keys)projected.city[k]=projected.city[k].filter(r=>!reviewed[k].includes(r.id));
  for(const p of projected.city.properties){
    const old=baseMaps.properties.get(p.id);
    if(!same(p,old)){
      assert.ok(!old.buildingIds.length&&removedBuildingParents.has(p.id),'Unauthorized survivor change');
      const ownPlots=old.plotIds.map(id=>baseMaps.plots.get(id));
      assert.equal(classifyRoadProvenance(old,ownPlots),'generated');
      const children=candidate.city.buildings.filter(b=>reviewed.buildings.includes(b.id)&&b.propertyId===p.id).map(b=>b.id);
      assert.ok(children.length>0);
      assert.deepEqual(p.buildingIds,children);
      assert.equal(classifyRoadProvenance(p,ownPlots),'generated');
      p.buildingIds=old.buildingIds.slice();p.roadProvenance=structuredClone(old.roadProvenance);
    }
  }
  // Check derived area independently, then restore summaries solely for
  // byte-level comparison of every other original survivor field.
  const derived=structuredClone(candidate.city);recalculate(derived,affected);
  for(const o of candidate.city.openSpaces)assert.deepEqual(o,derived.openSpaces.find(x=>x.id===o.id),'Incorrect open-area summary');
  for(const o of projected.city.openSpaces)if(affected.has(o.blockId))o.area=base.city.openSpaces.find(x=>x.id===o.id).area;
  assert.deepEqual(projected,base,'Regeneration changed surviving geometry or metadata');
  validateStoredProject(candidate);
  const context={roadIds:[],junctionIds:[],changedBlockIds:[...affected],acceptedValid:true};
  const {emit,items}=riReporter(),spend=riBudget();
  inspectRoadDependencies(candidate.city,candidate.city,context,emit,spend);
  inspectRoadContextReferences(base.city,candidate.city,context,emit,spend);
  assert.deepEqual(items().filter(r=>r.severity!=='info'&&!(r.kind==='plot'&&r.code==='property-containment')),[],'Regeneration land dependency failure');
  // Do not block recovery on pre-existing unsupported routes, but prohibit
  // any new obstruction of a previously valid route and require valid new routes.
  for(const b of candidate.city.buildings.filter(b=>affected.has(b.blockId))){
    const old=baseMaps.buildings.get(b.id);
    const route=city=>resolveSameFrontageAccessB1R(city,buildingPrimaryRouteViewS10(b),{spend:riBudget()}).route;
    if(!old||route(base.city))assert.ok(route(candidate.city),'Regeneration obstructed access: '+b.id);
  }
}
export function regenerateVacancies(original,base,removed,{seed,morphology}){
  const limits=vacancyLimits(original,removed),added=empty(),attempts=[];
  let candidate=structuredClone(base);
  const retiredParents=new Set(original.city.buildings.filter(b=>removed.buildings.includes(b.id)).map(b=>b.propertyId));
  const trial=(raw,parent,label)=>{
    try{
      const next=prepareGroup(original,candidate,raw,parent);
      const combined=Object.fromEntries(keys.map(k=>[k,sorted([...added[k],...next.added[k]])]));
      verifyRegeneration(original,base,next.candidate,removed,combined);
      candidate=next.candidate;for(const k of keys)added[k]=combined[k];
      attempts.push({label,outcome:'accepted',added:next.added});return true;
    }catch(error){attempts.push({label,outcome:'refused',message:error.message});return false;}
  };
  // Reuse the existing single-property population routine for shells
  // vacated by the reviewed demolition, never a surviving occupied parcel.
  for(const p of base.city.properties.filter(p=>retiredParents.has(p.id)&&!p.buildingIds.length)){
    const plots=p.plotIds.map(id=>base.city.plots.find(r=>r.id===id));
    if(classifyRoadProvenance(p,plots)!=='generated')continue;
    for(let i=0;i<4;i++){
      const raw={property:structuredClone(p),plots:structuredClone(plots),buildings:[]};
      populateProperty(raw.property,raw.plots,createRng(seed+':shell:'+p.id+':'+i),raw.buildings);
      if(raw.buildings.length&&trial(raw,p.id,'shell:'+p.id+':'+i))break;
    }
  }
  // Generate disposable block proposals with the standard generator; keep
  // only groups fitting residual space, bounded by actual retired counts.
  for(const [blockId,cap] of [...limits].sort(([a],[b])=>a.localeCompare(b))){
    if(!cap.properties)continue;
    const block=base.city.blocks.find(b=>b.id===blockId);
    for(let i=0;i<4;i++){
      const generated=generateBuildings(seed+':block:'+blockId+':'+i,{nodes:base.city.nodes,roads:base.city.roads,blocks:[block]},morphology);
      for(const p of generated.properties){
        const currentCount=candidate.city.properties.filter(r=>r.blockId===blockId&&added.properties.includes(r.id)).length;
        if(currentCount>=cap.properties)break;
        const raw={property:p,plots:generated.plots.filter(r=>r.propertyId===p.id),buildings:generated.buildings.filter(r=>r.propertyId===p.id)};
        if(raw.buildings.length)trial(raw,null,'block:'+blockId+':'+i+':'+p.id);
      }
    }
  }
  verifyRegeneration(original,base,candidate,removed,added);
  return {candidate,added,attempts};
}
