import {
  terrainPolygon
} from './terrain-geometry.js';
import {
  waterWallOpenings,
  waterGateIsDry
} from './water-fortifications.js';
export function terrainWallOpenings(wall, features = []) {
  return waterWallOpenings(wall, features, terrainPolygon).map(o => ({
    start: o.start,
    end: o.end,
    terrainIds: o.waterIds ?? [o.waterId]
  }));
}
export function terrainGateIsClear(gate, features, measure) {
  return waterGateIsDry(gate, features, measure, terrainPolygon);
}
