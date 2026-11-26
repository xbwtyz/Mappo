import { supportsCanonicalBuildingProjectSchema } from './project-schema-capabilities.js';
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
function b1SameProtectedFields(before, after, editable) {
  let matched = 0;
  for (const key of Object.keys(before)) {
    if (editable.includes(key)) continue;
    if (!Object.prototype.propertyIsEnumerable.call(after, key) || !riEqual(before[key], after[key]))
      return false;
    matched++;
  }
  for (const key of Object.keys(after)) {
    if (!editable.includes(key)) matched--;
  }
  return matched === 0;
}
const b1Mismatch=(code,message,id)=>({kind:'road',id,code,message,severity:'needs-review'});

// Schema 10 region topology and component metadata must survive any relocation.
// Only region rings may change here; courtyard route changes inside geometry
// are outside this group's generated-building relocation scope.
function b1GeometryPreserved(before,after) {
  if(!before || !after || !Array.isArray(before.regions) || !Array.isArray(after.regions))return false;
  return b1SameProtectedFields(before, after, ['regions']) &&
    before.regions.length===after.regions.length &&
    before.regions.every((region,i)=>b1SameProtectedFields(region, after.regions[i], ['ring']));
}

export function* iterateRoadGroupPreservationB1(before,after,draft,removedIds = new Set(),verifiedFrontages = null) {
  const id=draft?.selectedRoadIds?.[0]??'group';
  const fail=(code,message,target=id)=>b1Mismatch(code,message,target);
  if(!supportsCanonicalBuildingProjectSchema(before?.schemaVersion) || before.schemaVersion!==after?.schemaVersion ||
    !draft?.group?.eligible || !before.city || !after.city)
    return fail('group-preservation','A verified group draft with matching canonical project schemas is required.');
  if(!b1SameProtectedFields(before, after, ['city']))
    return fail('group-project-metadata','The road group would change project metadata.');
  const old=before.city,next=after.city;
  const collections=Object.keys(b1Mutable);
  const archive='roadParcelDecisionHistory028';
  const protectedFields = [...new Set([...Object.keys(old), ...Object.keys(next)])]
    .filter(key => key !== archive && !collections.includes(key));
  for (const key of protectedFields) {
    yield { stage: 'protected-city-context', id: key };
    const prior = old[key], current = next[key];
    if (Array.isArray(prior) && Array.isArray(current) && prior.length === current.length &&
        Object.keys(prior).length === prior.length && Object.keys(current).length === current.length) {
      for (let i = 0; i < prior.length; i++) {
        if (i % 16 === 0) yield { stage: 'protected-city-records', id: key };
        if (!riEqual(prior[i], current[i]))
          return fail('group-protected-context','The road group would change roads, protected infrastructure or unrelated city records.');
      }
    } else if (!Object.hasOwn(old, key) || !Object.hasOwn(next, key) || !riEqual(prior, current)) {
      return fail('group-protected-context','The road group would change roads, protected infrastructure or unrelated city records.');
    }
  }
  const moved=new Map(draft.proposedNodes.map(node=>[node.id,node]));
  const affectedBlocks=new Set(old.blocks.filter(block=>block.vertices.some(v=>moved.has(v))).map(block=>block.id));
  const oldPlots=riIndex(old.plots);
  for(const key of collections) {
    yield { stage: 'preservation-inventory', id: key };
    const expectedCount = old[key]?.length - (key === 'buildings' ? removedIds.size : 0);
    if(!Array.isArray(old[key]) || !Array.isArray(next[key]) || expectedCount!==next[key].length)
      return fail('group-identity-change','This movement would create or retire '+key+' records.');
    const indexed=riIndex(next[key]);
    if(indexed.size!==expectedCount)
      return fail('group-identity-change','This movement would duplicate '+key+' IDs.');
    for(const a of old[key]) {
      yield { stage: 'preservation-record', id: a.id };
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
      const canRemoveFromProperty = key === 'properties' && removedIds.size > 0;
      if ((key === 'properties' || key === 'buildings') && !canRemoveFromProperty && riEqual(a, b)) continue;
      let allowed=b1Mutable[key];
      if (key === 'properties') {
        const generated = classifyRoadProvenance(a, a.plotIds.map(pid => oldPlots.get(pid))) === 'generated';
        if (!generated) allowed = allowed.filter(field => field !== 'roadProvenance');
        if (canRemoveFromProperty) {
          const remaining = a.buildingIds.filter(buildingId => !removedIds.has(buildingId));
          if (remaining.length !== a.buildingIds.length) {
            if (!generated || !riEqual(remaining, b.buildingIds))
              return fail('group-demolition-membership','A demolition would change unauthorized property membership.',a.id);
            allowed = [...allowed,'buildingIds'];
          }
        }
      }
      if(key==='buildings') {
        if(classifyRoadProvenance(a)!=='generated')
          allowed=['entrance','accessPath','plotIds'];
        else if(!riEqual(a.geometry,b.geometry) && !b1GeometryPreserved(a.geometry,b.geometry))
          return fail('group-building-structure','Generated relocation would alter building structure or metadata.',a.id);
      }
      // The higher-level gate independently derives this set. Strict callers
      // omit it and retain the original protected-field policy.
      const frontageParent=key==='properties'?a.id:a.propertyId;
      if(['properties','plots','buildings'].includes(key)&&verifiedFrontages?.has(frontageParent))
        allowed=[...allowed,'frontageRoadId'];
      if(!b1SameProtectedFields(a, b, allowed))
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

export function verifyRoadGroupPreservationB1(...args) {
  const iterator = iterateRoadGroupPreservationB1(...args);
  for (let step = iterator.next(); ; step = iterator.next()) {
    if (step.done) return step.value;
  }
}
