// S10-A: pure, bounded canonical solid/void region topology.
// This module is NOT used by schema-9 persistence or accepted editor paths.
import { pointInPolygon, polygonSignedArea } from './geometry.js';
import { distanceToSegment, segmentCuts } from './boundary.js';
import { shapeWellFormed } from './building-validation.js';

export const S10_REGION_LIMITS = Object.freeze({
  maxRegions: 128, maxVertices: 1024, maxDepth: 8,
  maxComponents: 64, maxWork: 6000000
});
const S10_TOPOLOGY_EPS = 1e-7;
const s10TopologyCloneJson = value => JSON.parse(JSON.stringify(value));
const s10TopologyValidId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const s10TopologyBounds = ring => ({
  minX: Math.min(...ring.map(p => p.x)), maxX: Math.max(...ring.map(p => p.x)),
  minY: Math.min(...ring.map(p => p.y)), maxY: Math.max(...ring.map(p => p.y))
});
const s10TopologySeparated = (a,b) => a.maxX < b.minX-S10_TOPOLOGY_EPS || b.maxX < a.minX-S10_TOPOLOGY_EPS ||
  a.maxY < b.minY-S10_TOPOLOGY_EPS || b.maxY < a.minY-S10_TOPOLOGY_EPS;

export function createS10GeometryBudget(limit = S10_REGION_LIMITS.maxWork) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000000)
    throw Error('S10 geometry work limit is invalid.');
  return {
    limit, spent: 0,
    charge(units = 1) {
      if (!Number.isSafeInteger(units) || units < 0 || this.spent + units > this.limit)
        throw Error('S10 geometry work budget exceeded.');
      this.spent += units;
    }
  };
}

function s10TopologyNormalizeRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3 ||
    ring.length > S10_REGION_LIMITS.maxVertices)
    throw Error('S10 ring must contain 3–1024 vertices.');
  if (!ring.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    Math.abs(p.x) < 10000 && Math.abs(p.y) < 10000))
    throw Error('S10 ring contains invalid coordinates.');
  let next = ring.map(p => ({x:p.x,y:p.y}));
  if (polygonSignedArea(next) < 0) next.reverse();
  if (!shapeWellFormed(next)) throw Error('S10 ring is self-crossing, touching, degenerate or has invalid area.');
  return next;
}

function s10TopologyTouches(a,b,budget) {
  budget.charge(a.length*b.length);
  for (let i=0;i<a.length;i++) for (let j=0;j<b.length;j++)
    if (segmentCuts(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]).length)
      return true;
  return false;
}

function s10TopologyStrictlyInside(inner,outer,budget) {
  if (s10TopologyTouches(inner,outer,budget)) return false;
  budget.charge(inner.length*outer.length);
  for (const p of inner) {
    if (!pointInPolygon(p,outer)) return false;
    for (let i=0;i<outer.length;i++)
      if (distanceToSegment(p,outer[i],outer[(i+1)%outer.length]) <= S10_TOPOLOGY_EPS) return false;
  }
  return true;
}
function s10TopologyDisjoint(a,b,budget) {
  if (s10TopologySeparated(s10TopologyBounds(a),s10TopologyBounds(b))) return true;
  if (s10TopologyTouches(a,b,budget)) return false;
  budget.charge(2);
  return !pointInPolygon(a[0],b) && !pointInPolygon(b[0],a);
}

// Returns a detached, parent-before-child canonical topology. The supplied
// region identifiers never change; unknown compatible region keys are copied.
export function canonicalizeBuildingRegionsS10(geometry, budget = createS10GeometryBudget()) {
  const supportedVersion = geometry?.version === 1 || (geometry?.version === 2 &&
    Array.isArray(geometry.courtyardAccess?.portals) && geometry.courtyardAccess.portals.length > 0 &&
    Array.isArray(geometry.courtyardAccess?.occupants));
  if (!supportedVersion || !Array.isArray(geometry.regions) ||
    !geometry.regions.length || geometry.regions.length > S10_REGION_LIMITS.maxRegions)
    throw Error('S10 geometry needs version 1 or courtyard-access version 2 and 1–128 regions.');
  const map = new Map();
  for (const source of geometry.regions) {
    if (!source || !s10TopologyValidId(source.id) || map.has(source.id))
      throw Error('S10 region IDs must be unique and valid.');
    if (!['solid','void'].includes(source.kind) ||
      (source.parentId !== null && !s10TopologyValidId(source.parentId)))
      throw Error('S10 region has invalid kind or parent reference.');
    if (source.kind === 'solid' ? !s10TopologyValidId(source.componentId) :
      source.componentId !== undefined && source.componentId !== null)
      throw Error('S10 solid regions require a component; voids cannot own one.');
    const region = {...s10TopologyCloneJson(source), ring: s10TopologyNormalizeRing(source.ring)};
    map.set(region.id,region);
  }
  const depth = new Map(), active = new Set();
  function visit(id) {
    if (depth.has(id)) return depth.get(id);
    if (active.has(id)) throw Error('S10 region ancestry has a cycle.');
    active.add(id);
    const r=map.get(id);
    if (!r) throw Error('S10 region has a missing parent.');
    const d=r.parentId===null?0:visit(r.parentId)+1;
    if (d >= S10_REGION_LIMITS.maxDepth)
      throw Error('S10 region nesting exceeds eight levels.');
    if ((d%2===0?'solid':'void')!==r.kind)
      throw Error('S10 regions must alternate solid and void from a solid root.');
    active.delete(id); depth.set(id,d); return d;
  }
  for (const id of map.keys()) visit(id);
  const byParent=new Map();
  for(const region of map.values()){
    const siblings=byParent.get(region.parentId)??[];
    siblings.push(region);byParent.set(region.parentId,siblings);
  }
  if (!byParent.has(null)) throw Error('S10 geometry needs a solid root.');
  for (const [parentId,siblings] of byParent) {
    siblings.sort((a,b)=>a.id.localeCompare(b.id));
    if (parentId !== null) {
      const parent=map.get(parentId);
      for (const child of siblings)
        if (!s10TopologyStrictlyInside(child.ring,parent.ring,budget))
          throw Error('S10 child region must be strictly inside its parent without touching.');
    }
    for (let i=0;i<siblings.length;i++) for(let j=i+1;j<siblings.length;j++)
      if (!s10TopologyDisjoint(siblings[i].ring,siblings[j].ring,budget))
        throw Error('S10 sibling regions overlap, touch, or contain each other.');
  }
  const ordered=[];
  function append(parentId) {
    for (const r of byParent.get(parentId)??[]) {
      ordered.push(r);append(r.id);
    }
  }
  append(null);
  if(ordered.length!==map.size)throw Error('S10 regions must form one or more rooted trees.');
  return { ...s10TopologyCloneJson(geometry), regions:ordered };
}

export function regionDepthS10(geometry, id) {
  const map=new Map(geometry.regions.map(r=>[r.id,r]));
  let depth=0, seen=new Set(), r=map.get(id);
  if(!r)throw Error('Unknown S10 region.');
  while(r.parentId!==null){
    if(seen.has(r.id))throw Error('S10 region ancestry has a cycle.');
    seen.add(r.id);depth++;r=map.get(r.parentId);
    if(!r||depth>=S10_REGION_LIMITS.maxDepth)throw Error('Invalid S10 region ancestry.');
  }
  return depth;
}

export function pointOnS10Ring(point,ring) {
  return ring.some((p,i)=>distanceToSegment(point,p,ring[(i+1)%ring.length])<=S10_TOPOLOGY_EPS);
}
