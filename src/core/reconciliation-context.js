import { classifyLareProperty, classifyLareBuilding } from './reconciliation-policy.js';
import { LARE_LIMITS, LareBudgetExceeded } from './reconciliation-budget.js';

// Initial inventory returns frozen descriptors, never writable accepted records.
export function createLareContext(project,draft,choices,budget){
  if(project?.schemaVersion!==10||!draft?.group?.eligible||!draft.draftable||
    !draft.topologyResolved||!draft.facesResolved||draft.status==='unchanged'||
    draft.issues?.some(i=>i.code==='boundary-escape'))
    throw Error('LARE requires a nonzero, topology-preserving Schema 10 intent.');
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
    const policy=classifyLareProperty(p,ownPlots,choices.get(p.id));
    const children=p.buildingIds.slice().sort().map(id=>{budget.spend();const b=buildings.get(id);
      if(!b||b.propertyId!==p.id)throw Error('Invalid building ownership: '+id);
      return Object.freeze({id,...classifyLareBuilding(b,policy,dependent.has(id))});});
    return Object.freeze({id:p.id,blockId:p.blockId,frontageRoadId:p.frontageRoadId,policy,
      plotIds:Object.freeze(p.plotIds.slice()),buildings:Object.freeze(children)});
  });
  return Object.freeze({blockIds:Object.freeze(blocks),properties:Object.freeze(properties)});
}
