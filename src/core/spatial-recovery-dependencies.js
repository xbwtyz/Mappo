import { createSpatialInventory, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { riCompare, riFreeze } from './road-impact-model.js';

// Explicit, known model references only. This graph is not a complete
// geometric impact analysis or permission to change any referenced entity.
export function discoverSpatialDependencies(project, operation, budget) {
  const inventory = createSpatialInventory(project, operation, budget);
  const known = new Set(inventory.refs.map(spatialRefKey));
  const edges = new Map();
  const index = new Map();
  for (const ref of inventory.refs) {
    if (!index.has(ref.collection)) {
      const records = project.city[ref.collection];
      budget.spend(records.length);
      index.set(ref.collection,new Map(records.map(row=>[row.id,row])));
    }
  }
  for (const from of inventory.refs) {
    const record = index.get(from.collection).get(from.id);
    const link = (collection, id, relation) => {
      budget.spend();
      if (id == null) return;
      const to = createSpatialRef({collection,id});
      if (!known.has(spatialRefKey(to))) throw Error('Missing spatial dependency: ' + relation + ' ' + id);
      const key = JSON.stringify([from.collection,from.id,to.collection,to.id,relation]);
      edges.set(key,{from,to,relation});
    };
    const many = (collection, ids, relation) => {
      if (ids === undefined) return;
      if (!Array.isArray(ids)) throw Error('Invalid spatial dependency list: ' + relation);
      for (const id of ids) {
        if (typeof id !== 'string') throw Error('Invalid spatial dependency ID.');
        link(collection,id,relation);
      }
    };
    const c = from.collection;
    if (c === 'roads') {
      link('nodes',record.a,'endpoint'); link('nodes',record.b,'endpoint');
      link('bridges',record.bridgeId,'bridge'); link('terrainPasses',record.passId,'pass');
    }
    if (['blocks','waterFaces','terrainFaces'].includes(c)) many('nodes',record.vertices,'vertex');
    if (['properties','plots','buildings','openSpaces'].includes(c)) link('blocks',record.blockId,'block');
    if (['properties','plots','buildings'].includes(c)) link('roads',record.frontageRoadId,'frontage');
    if (['plots','buildings'].includes(c)) link('properties',record.propertyId,'property');
    if (['properties','buildings'].includes(c)) many('plots',record.plotIds,'plot');
    if (c === 'properties') {
      many('buildings',record.buildingIds,'building');
      for (const compound of record.buildingCompounds ?? []) many('buildings',compound.memberBuildingIds,'compound-member');
    }
    if (c === 'buildings') for (const occupant of record.geometry?.courtyardAccess?.occupants ?? [])
      link('buildings',occupant.buildingId,'courtyard-occupant');
    if (['blocks','properties','buildings'].includes(c)) link('districts',record.districtId,'district');
    if (c === 'districts') many('blocks',record.blockIds,'district-block');
    if (c === 'bridges') link('waterFeatures',record.waterId,'bridge-water');
    if (c === 'waterFaces') many('waterFeatures',record.waterIds ?? (record.waterId == null ? [] : [record.waterId]),'water-face');
    if (c === 'terrainPasses') link('terrainFeatures',record.terrainId,'pass-terrain');
    if (c === 'terrainFaces') many('terrainFeatures',record.terrainIds,'terrain-face');
    if (['gates','towers'].includes(c)) link('walls',record.wallId,'wall');
    if (c === 'gates') link('nodes',record.connection?.cityNodeId,'gate-approach');
    if (c === 'walls') {
      for (const opening of record.waterOpenings ?? [])
        many('waterFeatures',opening.waterIds ?? [opening.waterId],'wall-water-opening');
      for (const opening of record.terrainOpenings ?? []) many('terrainFeatures',opening.terrainIds,'wall-terrain-opening');
    }
  }
  return riFreeze({inventory,edges:[...edges.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,edge])=>edge)});
}
