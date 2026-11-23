// S10-A pure Schema-9 shape adapter. Never writes a project or upgrades a save.
// Existing editable buildings remain schema 9 until the separately approved S10-B.
import { validateFootprintF1 } from './building-footprint-f1.js';
import { validateBuildingStructureS10 } from './building-components-s10.js';
import { occupiedAreaS10 } from './building-occupancy-s10.js';

const cloneRing=ring=>ring.map(p=>({x:p.x,y:p.y}));
export function reserveBuildingPartIdS10(usedIds,prefix) {
  if(!(usedIds instanceof Set)||!['REG-MAN','BC-MAN'].includes(prefix))
    throw Error('S10 part ID allocator requires a scoped ID set and known prefix.');
  for(let i=1;i<=999999;i++){
    const id=prefix+'-'+String(i).padStart(6,'0');
    if(!usedIds.has(id))return id;
  }
  throw Error('S10 part identifier capacity was reached.');
}

export function legacyBuildingShapeToS10(source) {
  if(!source || source.geometry!==undefined || source.components!==undefined)
    throw Error('S10 migration cannot overwrite an existing geometry or components field.');
  const old=validateFootprintF1(source);
  if(old.holes.length>64)throw Error('S10 legacy adapter supports at most 64 courtyards.');
  const geometry={version:1,regions:[
    {id:'REG-ROOT',parentId:null,kind:'solid',componentId:'BC-ROOT',
      ring:cloneRing(old.footprint)},
    ...old.holes.map((hole,i)=>({
      id:'REG-H'+String(i+1).padStart(4,'0'),
      parentId:'REG-ROOT',kind:'void',ring:cloneRing(hole)
    }))
  ]};
  const components=[{id:'BC-ROOT',parentId:null}];
  const normalized=validateBuildingStructureS10(geometry,components);
  if(Math.abs(occupiedAreaS10(normalized.geometry)-old.area)>.02)
    throw Error('S10 legacy adapter did not conserve occupied area.');
  return normalized;
}

// A projection is a detached read-only *value*. No caller may write its
// footprint/holes back into canonical geometry without revalidation.
export function projectSimpleBuildingS10(geometry,components) {
  let validated;
  try {validated=validateBuildingStructureS10(geometry,components);}
  catch(error){return {ok:false,code:'invalid-topology',reason:error.message};}
  const {geometry:valid,components:parts}=validated;
  const roots=valid.regions.filter(r=>r.parentId===null);
  if(roots.length!==1||parts.length!==1||
    valid.regions.some(r=>r.id!==roots[0].id &&
      (r.parentId!==roots[0].id||r.kind!=='void')) ||
    roots[0].componentId!==parts[0].id)
    return {ok:false,code:'unsupported-topology',
      reason:'Nested or multi-root S10 geometry cannot be edited by a simple-footprint tool.'};
  const holes=valid.regions.filter(r=>r.kind==='void').map(r=>cloneRing(r.ring));
  const footprint=cloneRing(roots[0].ring);
  return {ok:true,footprint,holes,area:occupiedAreaS10(valid)};
}
