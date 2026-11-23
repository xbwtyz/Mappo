import { boundsOf, pointInPolygon } from '../core/geometry.js';
import { clearance, lerpPoint, segmentCuts } from '../core/boundary.js';
import { normalizeBuildingTransform, transformBuildingPoint } from '../core/building-transform.js';
import { createS10GeometryBudget } from '../core/building-topology-s10.js';
import { polygonIntersectionAreaS10 } from '../core/building-occupancy-s10.js';
import { joinBuildingExteriors } from '../core/building-footprint-union.js';

export function positionIncomingFootprint(ring, input) {
  const box = boundsOf(ring);
  const frame = {x:(box.minX+box.maxX)/2, y:(box.minY+box.maxY)/2};
  const transform = normalizeBuildingTransform({...input});
  return point => transformBuildingPoint(point,frame,transform);
}

export function joinComponentFootprints(geometry, components, destination, request) {
  const incoming = components.find(c => c.id === request.incomingId);
  if (!destination || !incoming || destination === incoming)
    throw Error('Select a destination and a different incoming component.');
  if (incoming.parentId === null) throw Error('Use the primary component as the destination.');
  if (components.some(c => c.parentId === incoming.id))
    throw Error('Reparent the incoming component’s children before joining it.');
  const exteriors = id => geometry.regions.filter(r => r.componentId === id && r.parentId === null);
  const target = exteriors(destination.id), source = exteriors(incoming.id);
  if (target.length !== 1 || source.length !== 1)
    throw Error('Both selected components must have exactly one exterior.');
  const [keep] = target, [retire] = source;
  if (Object.keys(incoming).some(k => !['id','parentId','name'].includes(k)) ||
      Object.keys(retire).some(k => !['id','kind','parentId','componentId','ring'].includes(k)))
    throw Error('The incoming component or outline has metadata that a join would discard.');

  const move = positionIncomingFootprint(retire.ring,request.transform);
  retire.ring = retire.ring.map(move);
  const budget = createS10GeometryBudget();
  for (const hole of geometry.regions.filter(r => r.kind === 'void')) {
    // Existing courtyards retain their map coordinates. The incoming part
    // may carry an intact courtyard to the destination without moving it.
    if (hole.parentId === retire.id && hole.ring.some(p => {
      const q = move(p);
      return Math.hypot(p.x-q.x,p.y-q.y) > 1e-7;
    })) throw Error('The incoming footprint has a courtyard. Join it without moving its courtyard.');
    const other = hole.parentId === keep.id ? retire.ring : hole.parentId === retire.id ? keep.ring : null;
    if (other && polygonIntersectionAreaS10(hole.ring,other,budget) > 1e-8)
      throw Error('This join would fill or cut through an existing courtyard.');
  }
  keep.ring = joinBuildingExteriors(keep.ring,retire.ring,budget);
  for (const hole of geometry.regions.filter(r => r.parentId === retire.id)) hole.parentId = keep.id;
  geometry.regions.splice(geometry.regions.indexOf(retire),1);
  components.splice(components.indexOf(incoming),1);
  return {retiredName: incoming.name?.trim() ?? ''};
}

export function verifyJoinNeighborAccess(city, original, joined) {
  const oldRings = original.geometry.regions.map(r => r.ring);
  const newRings = joined.geometry.regions.map(r => r.ring);
  const occupied = (p,rings) => {
    if (rings.some(ring => clearance(p,ring) <= 1e-7)) return false;
    return rings.filter(ring => pointInPolygon(p,ring)).length % 2 === 1;
  };
  const rings = [...oldRings,...newRings];
  const vertexCount = rings.reduce((n,r) => n+r.length,0);
  const box = boundsOf(newRings.flat());
  const budget = createS10GeometryBudget();
  for (const other of city.buildings) {
    if (other.id === joined.id || !Array.isArray(other.accessPath)) continue;
    for (let i=1;i<other.accessPath.length;i++) {
      const a=other.accessPath[i-1], b=other.accessPath[i];
      if (![a?.x,a?.y,b?.x,b?.y].every(Number.isFinite)) continue;
      budget.charge();
      if (Math.max(a.x,b.x)<box.minX || Math.min(a.x,b.x)>box.maxX ||
          Math.max(a.y,b.y)<box.minY || Math.min(a.y,b.y)>box.maxY) continue;
      const cuts=[0,1];
      for (const ring of rings) {
        budget.charge(ring.length);
        ring.forEach((p,j) => cuts.push(...segmentCuts(a,b,p,ring[(j+1)%ring.length])));
      }
      cuts.sort((x,y) => x-y);
      for (let j=1;j<cuts.length;j++) {
        if (cuts[j]-cuts[j-1] <= 1e-9) continue;
        budget.charge(vertexCount * 2);
        const p=lerpPoint(a,b,(cuts[j]+cuts[j-1])/2);
        if (occupied(p,newRings) && !occupied(p,oldRings))
          throw Error('The joined footprint would block access for ' + (other.customName || other.id) + '.');
      }
    }
  }
}
