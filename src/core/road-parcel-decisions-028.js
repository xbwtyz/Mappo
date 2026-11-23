import { propertyFits } from './placement.js';
import { shapesOverlapInterior, shapeContained } from './building-validation.js';
import { distanceToSegment, insideOrOn } from './boundary.js';
import { riIndex } from './road-impact-model.js';
import { classifyRoadProvenance } from './road-provenance.js';
import { roadBuildingOccupiedPlots } from './road-building-decisions.js';

// B05 choices operate exclusively on the detached candidate. Never infer consent.
const B05_LIMIT=24;
const b05Copy=value=>JSON.parse(JSON.stringify(value));
const b05Error=(id,message,code='parcel-decision-invalid')=>({
  kind:'property',id,code,message,severity:'needs-review'
});
function b05BlockEdges(city,graph,block) {
  const roads=new Map(city.roads.map(road=>[[road.a,road.b].sort().join(':'),road]));
  return block.vertices.map((id,i)=>{
    const next=block.vertices[(i+1)%block.vertices.length];
    return {a:graph.nodesById.get(id),b:graph.nodesById.get(next),
      road:roads.get([id,next].sort().join(':'))};
  });
}
function b05AccessValid(property,buildings,city,graph,block) {
  const edges=b05BlockEdges(city,graph,block);
  const frontage=edges.find(row=>row.road?.id===property.frontageRoadId);
  if(!frontage || !frontage.a || !frontage.b ||
      !propertyFits(property.boundary,edges.map(row=>row.a),edges))return false;
  for(const building of buildings) {
    const roots=building.geometry?.regions?.filter(region=>region.parentId===null).map(region=>region.ring)
      ?? [building.footprint];
    if(roots.some(ring=>!shapeContained(ring,property.boundary)))return false;
    if(!Array.isArray(building.accessPath)||!building.accessPath.length ||
       building.frontageRoadId!==property.frontageRoadId)return false;
    const end=building.accessPath.at(-1);
    if(distanceToSegment(end,frontage.a,frontage.b)>1e-5 ||
      building.accessPath.some(p=>!insideOrOn(p,edges.map(row=>row.a))))return false;
  }
  return true;
}
function b05GeneratedCandidate(candidate,keptIds){
  // All unretained candidate slots come freshly from c3Development.
  // Previously accepted and already authorized records are protected by ID.
  return !keptIds.has(candidate.id);
}
export function eligibleRoadParcelChoices028(old,city,replacements,generated,graph,keptIds,source) {
  const buildings=source.buildingIds.map(id=>old.buildings.find(b=>b.id===id));
  const plots=source.plotIds.map(id=>old.plots.find(p=>p.id===id));
  if(buildings.some(x=>!x)||plots.some(x=>!x))return [];
  const available=[],blocks=replacements.get(source.blockId)??[];
  for(const block of blocks)if(b05AccessValid(source,buildings,city,graph,block)){
    const kind=block.id===source.blockId?'keep':'transfer';
    available.push({kind,targetId:block.id,label:kind==='keep'?'Keep original geometry':'Transfer unchanged to successor block'});
  }
  for(const candidate of generated.properties){
    if(!blocks.some(b=>b.id===candidate.blockId) || !b05GeneratedCandidate(candidate,keptIds))continue;
    const targetPlots=candidate.plotIds.map(id=>generated.plots.find(p=>p.id===id));
    if(targetPlots.some(x=>!x)||targetPlots.length!==plots.length)continue;
    const updated={...source,boundary:candidate.boundary,frontage:candidate.frontage,frame:candidate.frame,
      area:candidate.area,local:candidate.local,frontageRoadId:candidate.frontageRoadId};
    if(!b05AccessValid(updated,buildings,city,graph,blocks.find(b=>b.id===candidate.blockId)))continue;
    const buildingPlots=buildings.map(b=>roadBuildingOccupiedPlots(b,targetPlots));
    if(buildingPlots.some(ids=>!ids.length))continue;
    available.push({kind:'reshape',targetId:candidate.id,label:'Reshape to verified generated footprint'});
  }
  if(!buildings.length)available.push({kind:'retire',targetId:null,label:'Retire with full original-record archive'});
  return available;
}
export function reconcileRoadParcels028(old,city,replacements,generated,graph,kept,choices) {
  const map=choices instanceof Map?choices:new Map(choices??[]);
  const oldPlots=riIndex(old.plots),oldBuildings=riIndex(old.buildings);
  const retainedIds=new Set(kept.properties.map(p=>p.id));
  const handledBuildings=new Set(),dispositions=new Map();
  const conflicts=old.properties.filter(property=>replacements.has(property.blockId) &&
    !retainedIds.has(property.id) &&
    classifyRoadProvenance(property,property.plotIds.map(id=>oldPlots.get(id)))!=='generated');
  const ids=new Set(conflicts.map(p=>p.id)),unresolved=[],review=[];
  for(const key of map.keys())if(!ids.has(key))unresolved.push(b05Error(key,'The chosen parcel is no longer affected by this road edit.'));
  if(unresolved.length)return {unresolved,review,handledBuildings,dispositions};
  if(city.roadParcelDecisionHistory028!==undefined && !Array.isArray(city.roadParcelDecisionHistory028))
    return {unresolved:[b05Error(conflicts[0]?.id??'unknown','Unsupported parcel archive metadata cannot be modified.')],
      review,handledBuildings,dispositions};
  const archived=Array.isArray(city.roadParcelDecisionHistory028)?b05Copy(city.roadParcelDecisionHistory028):[];
  if(archived.length+conflicts.length>B05_LIMIT)
    return {unresolved:[b05Error(conflicts[0]?.id??'unknown','The bounded parcel decision archive is full; cannot discard original records.')],
      review,handledBuildings,dispositions};
  for(const property of conflicts) {
    const eligible=eligibleRoadParcelChoices028(old,city,replacements,generated,graph,retainedIds,property);
    const choice=map.get(property.id);
    review.push({id:property.id,options:eligible,selected:choice??null,
      provenance:classifyRoadProvenance(property,property.plotIds.map(id=>oldPlots.get(id)))});
    if(!choice){
      unresolved.push(b05Error(property.id,eligible.length
        ?'This authored parcel needs a preservation decision before the road can be applied.'
        :'No valid property preservation choice has been proven for this proposal. Adjust the road.',
        'parcel-decision-required'));
      continue;
    }
    if(!choice || typeof choice!=='object'||!['keep','reshape','transfer','retire'].includes(choice.kind)||
       Object.keys(choice).some(k=>!['kind','targetId'].includes(k))){
      unresolved.push(b05Error(property.id,'Unsupported or malformed property decision.'));continue;
    }
    const selected=eligible.find(o=>o.kind===choice.kind &&
      (o.targetId??null)===(choice.targetId??null));
    if(!selected){unresolved.push(b05Error(property.id,
      'This parcel choice cannot safely fit the proposed street and blocks. Choose another option or revise the road.',
      'parcel-decision-invalid'));continue;}
    const ownPlots=property.plotIds.map(id=>b05Copy(oldPlots.get(id)));
    const ownBuildings=property.buildingIds.map(id=>b05Copy(oldBuildings.get(id)));
    let updated=null,nextPlots=[],nextBuildings=[];
    if(choice.kind==='keep'||choice.kind==='transfer'){
      const block=city.blocks.find(b=>b.id===choice.targetId);
      updated={...b05Copy(property),blockId:block.id,districtId:block.districtId??null};
      nextPlots=ownPlots.map(p=>({...p,blockId:block.id}));
      nextBuildings=ownBuildings.map(b=>({...b,blockId:block.id,districtId:block.districtId??null}));
    } else if(choice.kind==='reshape'){
      const target=generated.properties.find(p=>p.id===choice.targetId);
      if(!target){unresolved.push(b05Error(property.id,'The selected parcel footprint disappeared.'));continue;}
      const block=city.blocks.find(b=>b.id===target.blockId);
      const targetPlots=target.plotIds.map(id=>generated.plots.find(p=>p.id===id));
      updated={...b05Copy(property),blockId:block.id,districtId:block.districtId??null,
        boundary:b05Copy(target.boundary),frontage:b05Copy(target.frontage),
        frontageRoadId:target.frontageRoadId,frame:b05Copy(target.frame),
        local:b05Copy(target.local),area:target.area};
      nextPlots=ownPlots.map((plot,i)=>({...plot,blockId:block.id,
        frontageRoadId:target.frontageRoadId,boundary:b05Copy(targetPlots[i].boundary)}));
      nextBuildings=ownBuildings.map(building=>({
        ...building,blockId:block.id,districtId:block.districtId??null,
        plotIds:roadBuildingOccupiedPlots(building,nextPlots)
      }));
      if(nextBuildings.some(b=>!b.plotIds.length)){
        unresolved.push(b05Error(property.id,'A building no longer occupies a valid plot.'));continue;}
    }
    // Remove only proven-generated, unretained infill which overlaps the approved geometry.
    // Never displace a previously accepted authored/unknown parcel as a side effect.
    const displaced=new Set();
    if(updated){
      for(const other of generated.properties){
        if(other.id===updated.id || other.id===choice.targetId ||
            shapesOverlapInterior(other.boundary,updated.boundary)){
          if(!b05GeneratedCandidate(other,retainedIds)){
            unresolved.push(b05Error(property.id,'Another protected parcel occupies the proposed footprint.'));break;
          }
          displaced.add(other.id);
        }
      }
      if(unresolved.some(row=>row.id===property.id))continue;
      const removedBuildings=generated.buildings.filter(b=>displaced.has(b.propertyId));
      if(removedBuildings.some(b=>kept.buildings.some(k=>k.id===b.id) || handledBuildings.has(b.id))){
        unresolved.push(b05Error(property.id,'A protected building would be displaced.'));continue;
      }
      const alreadyOccupied=generated.properties.some(p=>!displaced.has(p.id) &&
        shapesOverlapInterior(p.boundary,updated.boundary));
      if(alreadyOccupied){unresolved.push(b05Error(property.id,'The selected plot conflicts with another retained parcel.'));continue;}
    }
    const before={property:b05Copy(property),plots:ownPlots,buildings:ownBuildings};
    archived.push({kind:choice.kind,sourceId:property.id,targetId:choice.targetId??null,
      source:before});
    dispositions.set(property.id,choice.kind==='retire'?'authorized-retirement':'authorized-'+choice.kind);
    if(updated){
      const targetIds=new Set(generated.properties.filter(p=>displaced.has(p.id)).map(p=>p.id));
      generated.properties=generated.properties.filter(p=>!targetIds.has(p.id));
      generated.plots=generated.plots.filter(p=>!targetIds.has(p.propertyId));
      generated.buildings=generated.buildings.filter(b=>!targetIds.has(b.propertyId));
      generated.properties.push(updated);
      generated.plots.push(...nextPlots);
      generated.buildings.push(...nextBuildings);
      for(const b of nextBuildings)handledBuildings.add(b.id);
      retainedIds.add(updated.id);
    }
  }
  if(unresolved.length)return {unresolved,review,handledBuildings,dispositions};
  if(conflicts.length) {
    city.roadParcelDecisionHistory028=archived;
    // Re-evaluate open land after introducing or retiring parcels.
    const areas=new Map(city.blocks.map(b=>[b.id,b.area]));
    for(const property of generated.properties)
      areas.set(property.blockId,(areas.get(property.blockId)??0)-property.area);
    for(const space of generated.openSpaces) {
      space.area=Math.max(0,areas.get(space.blockId)??0);
      space.kind=generated.properties.some(p=>p.blockId===space.blockId)?'yards-and-gaps':'undeveloped';
    }
  }
  return {unresolved:[],review,handledBuildings,dispositions};
}
