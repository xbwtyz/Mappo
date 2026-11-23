import { projectSimpleBuildingS10 } from '../../src/core/building-geometry-adapter-s10.js';

// Test-only detached projection for comparing pre-Schema-10 fixtures.
// This is never used by persistence or a live editor; old authored records are
// compared with canonical regions without restoring dual writable geometry.
export function legacyCityViewS10(city) {
  const copied=JSON.parse(JSON.stringify(city));
  copied.buildings=(copied.buildings??[]).map(building=>{
    if(!building.geometry) return building;
    const shape=projectSimpleBuildingS10(building.geometry,building.components);
    if(!shape.ok) throw Error('Cannot compare nested Schema 10 geometry with a legacy fixture.');
    const legacy={};
    for (const [key,value] of Object.entries(building)) {
      if (key==='geometry'||key==='components')continue;
      if (key==='area') {
        legacy.footprint=shape.footprint;
        legacy.holes=shape.holes;
      }
      legacy[key]=value;
    }
    return legacy;
  });
  return copied;
}
