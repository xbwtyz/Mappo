import {
  polygonSignedArea
} from './geometry.js';
import {
  insideOrOn
} from './boundary.js';
import {
  rectanglesOverlap
} from './placement.js';

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
    if (neighbors.some(p => rectanglesOverlap(p.boundary, property.boundary))) throw new Error('Generated properties overlap. Try another seed.');
    neighbors.push(property);
    groups.set(property.blockId, neighbors);
  }
  if (usedPlots.size !== plots.length) throw new Error('An allocated plot has no property.');
  for (const building of buildings) {
    const property = byProperty.get(building.propertyId);
    if (!property || building.blockId !== property.blockId || !property.buildingIds.includes(building.id) || !building.plotIds.length || building.plotIds.some(id => !property.plotIds.includes(id))) throw new Error('A building has invalid property or plot references.');
    if (building.footprint.length < 4 || building.area <= 1 || !building.footprint.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && insideOrOn(p, property.boundary))) throw new Error('A generated building extends outside its property.');
    if (polygonSignedArea(building.footprint) <= 0) throw new Error('A building footprint has invalid winding.');
    for (const hole of building.holes)
      if (!hole.every(p => insideOrOn(p, building.footprint))) throw new Error('A courtyard extends beyond its building.');
  }
}
