import { shapeContained } from './building-validation.js';
import { roadBuildingOccupiedPlots } from './road-building-decisions.js';
import { createRng, hashSeed } from './prng.js';
import { stampRoadGenerated } from './road-provenance.js';
import { populateProperty } from '../generators/buildings.js';
import { adoptNewBuildingS10, writeSimpleBuildingS10 } from './building-project-s10.js';

export function reflowGeneratedRoadBuildings(seed, before, after, plots, original, reservedIds, canonical = false) {
  const oldFrame = before.frame, newFrame = after.frame;
  const center = local => local.x + local.width / 2;
  const transform = point => {
    const dx = point.x - oldFrame.origin.x, dy = point.y - oldFrame.origin.y;
    const u = dx * oldFrame.tangent.x + dy * oldFrame.tangent.y + center(after.local) - center(before.local);
    const v = dx * oldFrame.inward.x + dy * oldFrame.inward.y + after.local.y - before.local.y;
    return {
      x: newFrame.origin.x + newFrame.tangent.x * u + newFrame.inward.x * v,
      y: newFrame.origin.y + newFrame.tangent.y * u + newFrame.inward.y * v,
    };
  };
  const rotation = Math.atan2(newFrame.tangent.y, newFrame.tangent.x) -
    Math.atan2(oldFrame.tangent.y, oldFrame.tangent.x);
  const moved = original.map(building => {
    const footprint = building.footprint.map(transform);
    const holes = building.holes.map(hole => hole.map(transform));
    const entrance = transform(building.entrance);
    const u = (entrance.x - newFrame.origin.x) * newFrame.tangent.x +
      (entrance.y - newFrame.origin.y) * newFrame.tangent.y;
    const end = {
      x: newFrame.origin.x + u * newFrame.tangent.x,
      y: newFrame.origin.y + u * newFrame.tangent.y,
    };
    const plotIds = roadBuildingOccupiedPlots({footprint,holes},plots);
    const changes={footprint,holes,entrance,accessPath:[entrance,end],
      plotIds,orientation:building.orientation+rotation};
    return building.geometry
      ?writeSimpleBuildingS10(building,changes)
      :{...building,...changes};
  });
  if (moved.every(building => building.plotIds.length && shapeContained(building.footprint, after.boundary))) {
    for (const building of moved) stampRoadGenerated(building);
    return { buildings: moved, disposition: 'relocated' };
  }

  if (after.local.width < 7 || after.local.depth < 7)
    throw new Error('The reshaped parcel has insufficient room for replacement buildings.');
  const replacements = [];
  const generatedParcel = { ...after, buildingIds: [] };
  const key = JSON.stringify([seed, after.id, after.boundary]);
  populateProperty(generatedParcel, plots, createRng(key), replacements);
  let suffix = 0;
  for (const building of replacements) {
    do {
      building.id = 'BLD-REFLOW-' + hashSeed(key).toString(36) + '-' + ++suffix;
    } while (reservedIds.has(building.id));
    reservedIds.add(building.id);
    if (after.districtId !== undefined) building.districtId = after.districtId;
    stampRoadGenerated(building);
  }
  if (!replacements.length) throw new Error('The reshaped parcel has no suitable replacement building.');
  return { buildings: canonical || original.some(b=>Boolean(b.geometry)) ? replacements.map(adoptNewBuildingS10) : replacements,
    disposition: 'regenerated' };
}
