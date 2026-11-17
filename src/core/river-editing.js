import {
  waterPathIsOrdered,
  guideWaterPath
} from './water-editing.js';

// Keep the river API stable while sharing guidance with coastal shorelines.
export function riverPathIsOrdered(path) {
  return waterPathIsOrdered(path);
}
export function guideRiverPath(feature, options = {}) {
  if (feature.kind !== 'river') throw new Error('Choose a river with at least three handles.');
  return guideWaterPath(feature, options);
}
