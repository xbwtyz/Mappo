// S10-A structural components: organizational identity, never spatial ownership.
import { S10_REGION_LIMITS, canonicalizeBuildingRegionsS10 } from './building-topology-s10.js';
const s10ComponentsCloneJson=value=>JSON.parse(JSON.stringify(value));
const s10ComponentsValidId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);

export function canonicalizeBuildingComponentsS10(components, geometry) {
  if (!Array.isArray(components)||!components.length||
    components.length>S10_REGION_LIMITS.maxComponents)
    throw Error('S10 building requires 1–64 structural components.');
  const byId=new Map();
  for (const c of components) {
    if (!c||!s10ComponentsValidId(c.id)||byId.has(c.id)||
      (c.parentId!==null&&!s10ComponentsValidId(c.parentId)))
      throw Error('S10 components require unique IDs and valid parent references.');
    if (c.name!==undefined&&(typeof c.name!=='string'||c.name.length>80))
      throw Error('S10 component name is invalid.');
    byId.set(c.id,s10ComponentsCloneJson(c));
  }
  const roots=[...byId.values()].filter(c=>c.parentId===null);
  if(roots.length!==1)throw Error('S10 building requires exactly one component root.');
  const depth=new Map(),visiting=new Set();
  function visit(id) {
    if (depth.has(id))return depth.get(id);
    if (visiting.has(id))throw Error('S10 component hierarchy contains a cycle.');
    const c=byId.get(id);
    if(!c)throw Error('S10 component parent is missing.');
    visiting.add(id);
    const d=c.parentId===null?0:visit(c.parentId)+1;
    if(d>=S10_REGION_LIMITS.maxComponents)
      throw Error('S10 component hierarchy exceeds its depth budget.');
    visiting.delete(id);depth.set(id,d);return d;
  }
  for (const id of byId.keys())visit(id);
  for (const r of geometry.regions) if(r.kind==='solid'&&!byId.has(r.componentId))
    throw Error('S10 solid region references an unknown component.');
  return [...byId.values()].sort((a,b)=>depth.get(a.id)-depth.get(b.id)||a.id.localeCompare(b.id));
}

export function validateBuildingStructureS10(geometry, components, budget) {
  const canonical=canonicalizeBuildingRegionsS10(geometry,budget);
  const organized=canonicalizeBuildingComponentsS10(components,canonical);
  return {geometry:canonical,components:organized};
}
