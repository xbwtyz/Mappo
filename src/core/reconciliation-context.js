import { roadFrameLength } from './geometry.js';
import { supportsCanonicalBuildingProjectSchema } from './project-schema-capabilities.js';
import { classifyLareObject } from './reconciliation-policy.js';
import { boundsOf } from './geometry.js';
import { LARE_LIMITS, LareBudgetExceeded } from './reconciliation-budget.js';

// Initial inventory returns frozen descriptors, never writable accepted records.
export function createLareContext(project,draft,choices,budget){
  if(!supportsCanonicalBuildingProjectSchema(project?.schemaVersion)||!draft?.group?.eligible||!draft.draftable||
    !draft.topologyResolved||!draft.facesResolved||draft.status==='unchanged'||
    draft.issues?.some(i=>i.code==='boundary-escape'))
    throw Error('LARE requires a nonzero, topology-preserving canonical building project intent.');
  if(!(choices instanceof Map)||!budget?.spend)throw Error('Explicit choices and shared budget required.');
  const city=project.city,moved=new Set(draft.proposedNodes.map(n=>n.id));
  const blocks=city.blocks.filter(b=>{budget.spend(1+b.vertices.length);return b.vertices.some(id=>moved.has(id));})
    .map(b=>b.id).sort(),blockIds=new Set(blocks);
  const plots=new Map(),buildings=new Map(),dependent=new Set();
  for(const p of city.plots){budget.spend();plots.set(p.id,p);}
  for(const b of city.buildings){
    budget.spend();buildings.set(b.id,b);
    for(const o of b.geometry?.courtyardAccess?.occupants??[]){
      budget.spend();dependent.add(b.id);dependent.add(o.buildingId);
    }
  }
  for(const p of city.properties)for(const compound of p.buildingCompounds??[])
    for(const id of compound.memberBuildingIds??[]){budget.spend();dependent.add(id);}
  const affected=city.properties.filter(p=>{budget.spend();return blockIds.has(p.blockId);});
  if(affected.length>LARE_LIMITS.affectedParcels)throw new LareBudgetExceeded('affectedParcels');
  const ids=new Set(affected.map(p=>p.id));
  for(const id of choices.keys())if(!ids.has(id))throw Error('Stale parcel choice: '+id);
  const properties=affected.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(p=>{
    const ownPlots=p.plotIds.map(id=>{budget.spend();const r=plots.get(id);
      if(!r||r.propertyId!==p.id)throw Error('Invalid plot ownership: '+id);return r;});
    const policy=classifyLareObject('property',p,ownPlots,choices.get(p.id));
    const children=p.buildingIds.slice().sort().map(id=>{budget.spend();const b=buildings.get(id);
      if(!b||b.propertyId!==p.id)throw Error('Invalid building ownership: '+id);
      return Object.freeze({id,...classifyLareObject('building',b,policy,dependent.has(id))});});
    return Object.freeze({id:p.id,blockId:p.blockId,frontageRoadId:p.frontageRoadId,policy,
      plotIds:Object.freeze(p.plotIds.slice()),buildings:Object.freeze(children)});
  });
  return Object.freeze({blockIds:Object.freeze(blocks),properties:Object.freeze(properties)});
}

// Discover the writable parcel neighborhood and distinguish observed blockers
// from parcels that may be changed. Cross-block effects stay observable.
export function discoverLareParcelScope(context, city, draft, changedBlocks, issues, budget) {
  const propertyIndex = new Map(city.properties.map(property => [property.id, property]));
  const plotIndex = new Map(city.plots.map(plot => [plot.id, plot]));
  const buildingIndex = new Map(city.buildings.map(building => [building.id, building]));
  const changedRoads = new Set(draft.changedRoadIds);
  const changedBlockIds = new Set(changedBlocks.keys());
  const implicated = new Set();
  for (const issue of issues) {
    const id = issue.kind === 'property' ? issue.id
      : issue.kind === 'plot' ? plotIndex.get(issue.id)?.propertyId
      : issue.kind === 'building' ? buildingIndex.get(issue.id)?.propertyId : null;
    if (id) implicated.add(id);
  }
  const primary = context.properties.filter(parcel => changedBlockIds.has(parcel.blockId) &&
    (changedRoads.has(parcel.frontageRoadId) || implicated.has(parcel.id)));
  const margin = Math.max(1, roadFrameLength(draft.offset.x, draft.offset.y) + 1);
  const canReconcile = parcel => changedBlockIds.has(parcel.blockId) &&
    ['adaptive', 'authorized-reshape'].includes(parcel.policy.mode);
  const nearby = (first, second) => {
    const a = propertyIndex.get(first.id).boundary;
    const b = propertyIndex.get(second.id).boundary;
    budget.spend(Math.max(1, a.length + b.length));
    const boxA = boundsOf(a), boxB = boundsOf(b);
    return boxA.maxX + margin >= boxB.minX && boxB.maxX + margin >= boxA.minX &&
      boxA.maxY + margin >= boxB.minY && boxB.maxY + margin >= boxA.minY;
  };
  // Match the existing order of refusal checks and geometry charges.
  const adapt = () => {
    const authorized = context.properties.filter(parcel => canReconcile(parcel) &&
      (primary.includes(parcel) || primary.some(other =>
        other.blockId === parcel.blockId && nearby(parcel, other))));
    const ids = new Set(authorized.map(parcel => parcel.id));
    return Object.freeze({
      authorized: Object.freeze(authorized),
      role(id) {
        if (ids.has(id)) return 'authorized';
        return implicated.has(id) || changedBlockIds.has(propertyIndex.get(id)?.blockId)
          ? 'observable' : 'unaffected';
      },
    });
  };
  return Object.freeze({ primary: Object.freeze(primary), adapt });
}
