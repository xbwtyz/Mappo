import {
  polygonSignedArea
} from './geometry.js';
import {
  insideOrOn
} from './boundary.js';
import { shapesOverlapInterior } from './building-validation.js';

export function validateDevelopment(layout, development) {
  const {
    plots,
    properties,
    buildings
  } = development;
  const byProperty = new Map(properties.map(p => [p.id, p]));
  const byPlot = new Map(plots.map(p => [p.id, p]));
  const roadIds = new Set(layout.roads.map(r => r.id));
  const usedPlots = new Set();
  const groups = new Map();
  for (const property of properties) {
    if (!property.plotIds.length || !roadIds.has(property.frontageRoadId)) throw new Error('A generated property has no valid street frontage.');
    for (const id of property.plotIds) {
      if (!byPlot.has(id) || usedPlots.has(id) || byPlot.get(id).propertyId !== property.id) throw new Error('A plot was allocated to more than one property.');
      usedPlots.add(id);
    }
    const neighbors = groups.get(property.blockId) || [];
    if (neighbors.some(p => shapesOverlapInterior(p.boundary, property.boundary))) throw new Error('Generated properties overlap. Try another seed.');
    neighbors.push(property);
    groups.set(property.blockId, neighbors);
  }
  if (usedPlots.size !== plots.length) throw new Error('An allocated plot has no property.');
  for (const building of buildings) {
    const property = byProperty.get(building.propertyId);
    if (!property || building.blockId !== property.blockId || !property.buildingIds.includes(building.id) || !building.plotIds.length || building.plotIds.some(id => !property.plotIds.includes(id))) throw new Error('A building has invalid property or plot references.');
    const regions=building.geometry?.regions;
    const roots=regions?.filter(r=>r.parentId===null).map(r=>r.ring)
      ?? [building.footprint];
    if(!roots.length||roots.some(ring=>!Array.isArray(ring)||ring.length<4 ||
      !ring.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&insideOrOn(p,property.boundary)))||
      building.area<=1)
      throw new Error('A generated building extends outside its property.');
    if(roots.some(ring=>polygonSignedArea(ring)<=0))
      throw new Error('A building footprint has invalid winding.');
    if(regions){
      const byId=new Map(regions.map(r=>[r.id,r]));
      for(const region of regions.filter(r=>r.parentId!==null)){
        const parent=byId.get(region.parentId);
        if(!parent||!region.ring.every(point=>insideOrOn(point,parent.ring)))
          throw new Error('A courtyard or component region extends beyond its parent.');
      }
    }else for (const hole of building.holes)
      if (!hole.every(p => insideOrOn(p, building.footprint))) throw new Error('A courtyard extends beyond its building.');
  }
}
