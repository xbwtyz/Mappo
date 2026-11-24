import { riEqual, riIndex } from './road-impact-model.js';
import { classifyRoadProvenance } from './road-provenance.js';

// Last-line preservation gate for the group-only operation. This is independent
// of the solver's change ledger: a missing ledger row cannot authorize a write.
const b1Mutable = {
  nodes: ['x','y'],
  blocks: ['area'],
  properties: ['boundary','frontage','frame','local','area','roadProvenance'],
  plots: ['boundary'],
  buildings: ['entrance','accessPath','plotIds','roadProvenance','geometry','orientation','area'],
  openSpaces: ['area']
};
const b1Without=(value,keys)=>Object.fromEntries(Object.entries(value)
  .filter(([key])=>!keys.includes(key)));
const b1Mismatch=(code,message,id)=>({kind:'road',id,code,message,severity:'needs-review'});

// Schema 10 region topology and component metadata must survive any relocation.
// Only region rings may change here; courtyard route changes inside geometry
// are outside this group's generated-building relocation scope.
function b1GeometryPreserved(before,after) {
  if(!before || !after || !Array.isArray(before.regions) || !Array.isArray(after.regions))return false;
  return riEqual(b1Without(before,['regions']),b1Without(after,['regions'])) &&
    before.regions.length===after.regions.length &&
    before.regions.every((region,i)=>riEqual(b1Without(region,['ring']),
      b1Without(after.regions[i],['ring'])));
}

export function verifyRoadGroupPreservationB1(before,after,draft,removedIds = new Set()) {
  const id=draft?.selectedRoadIds?.[0]??'group';
  const fail=(code,message,target=id)=>b1Mismatch(code,message,target);
  if(before?.schemaVersion!==10 || after?.schemaVersion!==10 ||
    !draft?.group?.eligible || !before.city || !after.city)
    return fail('group-preservation','A verified Schema 10 group draft is required.');
  if(!riEqual(b1Without(before,['city']),b1Without(after,['city'])))
    return fail('group-project-metadata','The road group would change project metadata.');
  const old=before.city,next=after.city;
  const collections=Object.keys(b1Mutable);
  const archive='roadParcelDecisionHistory028';
  if(!riEqual(b1Without(old,[...collections,archive]),b1Without(next,[...collections,archive])))
    return fail('group-protected-context','The road group would change roads, protected infrastructure or unrelated city records.');
  const moved=new Map(draft.proposedNodes.map(node=>[node.id,node]));
  const affectedBlocks=new Set(old.blocks.filter(block=>block.vertices.some(v=>moved.has(v))).map(block=>block.id));
  const oldPlots=riIndex(old.plots);
  for(const key of collections) {
    const expectedCount = old[key]?.length - (key === 'buildings' ? removedIds.size : 0);
    if(!Array.isArray(old[key]) || !Array.isArray(next[key]) || expectedCount!==next[key].length)
      return fail('group-identity-change','This movement would create or retire '+key+' records.');
    const indexed=riIndex(next[key]);
    if(indexed.size!==expectedCount)
      return fail('group-identity-change','This movement would duplicate '+key+' IDs.');
    for(const a of old[key]) {
      const b=indexed.get(a.id);
      if (key === 'buildings' && removedIds.has(a.id)) {
        if (b || !affectedBlocks.has(a.blockId))
          return fail('group-unauthorized-removal','A reviewed removal is outside the affected block or still present.',a.id);
        continue;
      }
      if(!b)return fail('group-identity-change','This movement would retire '+a.id+'.',a.id);
      if(key==='nodes') {
        const p=moved.get(a.id);
        const expected=p?{...a,x:p.x,y:p.y}:a;
        if(!riEqual(expected,b))return fail('group-node-delta','Unexpected junction movement or metadata change.',a.id);
        continue;
      }
      if(!(affectedBlocks.has(key==='blocks'?a.id:a.blockId))) {
        if(!riEqual(a,b))return fail('group-unaffected-change','An unaffected record would change.',a.id);
        continue;
      }
      let allowed=b1Mutable[key];
      if (key === 'properties') {
        const generated = classifyRoadProvenance(a, a.plotIds.map(pid => oldPlots.get(pid))) === 'generated';
        if (!generated) allowed = allowed.filter(field => field !== 'roadProvenance');
        const remaining = a.buildingIds.filter(buildingId => !removedIds.has(buildingId));
        if (remaining.length !== a.buildingIds.length) {
          if (!generated || !riEqual(remaining, b.buildingIds))
            return fail('group-demolition-membership','A demolition would change unauthorized property membership.',a.id);
          allowed = [...allowed,'buildingIds'];
        }
      }
      if(key==='buildings') {
        if(classifyRoadProvenance(a)!=='generated')
          allowed=['entrance','accessPath','plotIds'];
        else if(!riEqual(a.geometry,b.geometry) && !b1GeometryPreserved(a.geometry,b.geometry))
          return fail('group-building-structure','Generated relocation would alter building structure or metadata.',a.id);
      }
      if(!riEqual(b1Without(a,allowed),b1Without(b,allowed)))
        return fail('group-record-change','This movement would change protected metadata or ownership.',a.id);
    }
  }
  // Authored parcel choices may append original snapshots; older records cannot
  // disappear or change. The existing solver validates choices and the archive.
  const previous=old[archive]??[],updated=next[archive]??[];
  if(!Array.isArray(previous)||!Array.isArray(updated)||updated.length<previous.length||
    !previous.every((entry,i)=>riEqual(entry,updated[i])))
    return fail('group-archive-change','The original authored parcel archive would be changed.');
  return null;
}
