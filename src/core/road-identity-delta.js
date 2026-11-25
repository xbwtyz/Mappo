import { normalizeIdentityRequests } from './identity-reservations.js';
import { verifyIdentityReservation, verifyIdentityAdditions } from './identity-verification.js';
import { classifyRoadProvenance, stampRoadGenerated } from './road-provenance.js';
import { validateStoredProject } from '../data/project-validation.js';
import { copyJson } from '../data/project-format.js';

// Batch 2: conversion of a freshly reconstructed road-domain candidate.
// The existing road algorithms keep their deterministic temporary labels
// during geometric search, permission review and candidate reconstruction.
// Only final surviving additions are reserved. This module is not Apply
// authority: a trusted caller must reconstruct and compare the inspected
// road proposal, then independently repeat the domain and allocation checks.
const idaRoadCollections=[['buildings','building',/^BLD-(?:REFLOW|X)-[a-z0-9]+(?:-[0-9]+)?$/],
  ['properties','property',/^PROP-X-[a-z0-9]+(?:-[0-9]+)?$/],
  ['plots','plot',/^PLOT-X-[a-z0-9]+(?:-[0-9]+)?$/]];
const idaRoadSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function idaRoadRoot(project){const {city,...root}=project;return root;}
function idaRoadInventory(project,result){
  if(project?.schemaVersion!==11||result?.status!=='candidate-only'||
    !['B1','C2','C3'].includes(result.phase)||!result.candidateProject||
    result.validation?.project!=='valid'||result.validation?.parcels!=='pass'||
    result.unresolved?.length!==0||!Array.isArray(result.ledger)||!Array.isArray(result.changed))
    throw Error('A complete reconstructed road candidate is required.');
  const candidate=result.candidateProject;
  if(!idaRoadSame(idaRoadRoot(project),idaRoadRoot(candidate)))
    throw Error('Road candidate changed accepted project metadata.');
  validateStoredProject(copyJson(candidate));
  const additions=[];
  for(const [collection,type,pattern] of idaRoadCollections){
    const before=new Set(project.city[collection].map(row=>row.id));
    for(const row of candidate.city[collection]){
      if(before.has(row.id))continue;
      if(!pattern.test(row.id))throw Error('Unexpected road draft identity: '+row.id);
      const entries=result.ledger.filter(entry=>entry.kind===type&&entry.newId===row.id);
      if(entries.length!==1||entries[0].oldId!==null||
        !['created','regenerated'].includes(entries[0].disposition))
        throw Error('Road draft addition lacks an exact creation ledger entry: '+row.id);
      additions.push({type,key:'road/'+row.id});
    }
  }
  return normalizeIdentityRequests(additions);
}
export function roadIdentityRequests(project,result){
  return idaRoadInventory(project,result);
}

// The supported active ownership fields are explicit, not a global string
// replacement. Unknown metadata and historical records are not rewritten.
// Fail closed if a final temporary identity occurs in an unsupported field.
function idaRoadAssertNoUnmapped(value,ids,path='city'){
  if(typeof value==='string'){
    if(ids.has(value))throw Error('Unsupported road draft identity reference at '+path);
    return;
  }
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
    if(ids.has(key))throw Error('Unsupported road draft identity key at '+path);
    // A provenance snapshot is historical JSON, not a live entity reference.
    if(key==='roadProvenance')continue;
    idaRoadAssertNoUnmapped(child,ids,path+'.'+key);
  }
}
export function allocateRoadCandidate(project,result,context,receipt){
  const requests=idaRoadInventory(project,result);
  const nextState=verifyIdentityReservation(project.identityAllocation,project.city,context,requests,receipt);
  const maps=new Map(idaRoadCollections.map(([,type])=>[type,new Map()]));
  for(const row of receipt.allocations)maps.get(row.type).set(row.key.slice(5),row.id);
  const propertyIds=maps.get('property'),plotIds=maps.get('plot'),buildingIds=maps.get('building');
  const mapId=(map,id)=>map.get(id)??id;
  const candidate=copyJson(result.candidateProject),city=candidate.city;
  const originalPlots=new Map(city.plots.map(plot=>[plot.id,plot]));
  // Provenance is a deterministic exact function of the record and its
  // linked plots. Classify only rows whose serialized inputs may change
  // during ID remapping. Unaffected rows and stamps remain byte-identical.
  const affectedProperties=city.properties.filter(row=>propertyIds.has(row.id)||
    row.plotIds.some(id=>plotIds.has(id)||propertyIds.has(originalPlots.get(id)?.propertyId))||
    row.buildingIds.some(id=>buildingIds.has(id)));
  const affectedBuildings=city.buildings.filter(row=>buildingIds.has(row.id)||
    propertyIds.has(row.propertyId)||row.plotIds.some(id=>plotIds.has(id)));
  const propertyClasses=new Map(affectedProperties.map(row=>[row,
    classifyRoadProvenance(row,row.plotIds.map(id=>originalPlots.get(id)))]));
  const buildingClasses=new Map(affectedBuildings.map(row=>[row,classifyRoadProvenance(row)]));
  for(const property of city.properties){
    const originalId=property.id;
    property.id=mapId(propertyIds,originalId);
    property.plotIds=property.plotIds.map(id=>mapId(plotIds,id));
    property.buildingIds=property.buildingIds.map(id=>mapId(buildingIds,id));
  }
  for(const plot of city.plots){
    plot.id=mapId(plotIds,plot.id);
    plot.propertyId=mapId(propertyIds,plot.propertyId);
  }
  for(const building of city.buildings){
    building.id=mapId(buildingIds,building.id);
    building.propertyId=mapId(propertyIds,building.propertyId);
    building.plotIds=building.plotIds.map(id=>mapId(plotIds,id));
  }
  // Recompute only genuine generator fingerprints invalidated by remapping.
  // Custom/unknown provenance is preserved, never elevated to generated.
  const newPlots=new Map(city.plots.map(plot=>[plot.id,plot]));
  for(const [property,prior] of propertyClasses){
    const plots=property.plotIds.map(id=>newPlots.get(id));
    if(prior==='generated'&&classifyRoadProvenance(property,plots)!=='generated')stampRoadGenerated(property,plots);
    if(classifyRoadProvenance(property,plots)!==prior)throw Error('Road property provenance classification changed.');
  }
  for(const [building,prior] of buildingClasses){
    if(prior==='generated'&&classifyRoadProvenance(building)!=='generated')stampRoadGenerated(building);
    if(classifyRoadProvenance(building)!==prior)throw Error('Road building provenance classification changed.');
  }
  const temporaryIds=new Set([...maps.values()].flatMap(map=>[...map.keys()]));
  idaRoadAssertNoUnmapped(city,temporaryIds);
  const ledger=copyJson(result.ledger).map(row=>maps.has(row.kind)?
    {...row,newId:mapId(maps.get(row.kind),row.newId)}:row);
  const changed=copyJson(result.changed).map(row=>maps.has(row.kind)?
    {...row,id:mapId(maps.get(row.kind),row.id)}:row);
  idaRoadAssertNoUnmapped(ledger,temporaryIds,'ledger');
  idaRoadAssertNoUnmapped(changed,temporaryIds,'changed');
  candidate.identityAllocation=nextState;
  verifyIdentityAdditions(project.identityAllocation,project.city,context,requests,receipt,city);
  validateStoredProject(candidate);
  return {candidate,requests,ledger,changed};
}
