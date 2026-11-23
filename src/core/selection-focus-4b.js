import { buildingExteriorRingsS10 } from './building-geometry-adapter-s10.js';
// Dev 4b: view-only selection framing. Never alters city geometry or selection.
export function selectionFocusPoints4B(city,selection) {
  if(!city||!selection||!['property','building'].includes(selection.kind))return null;
  const collection=selection.kind==='property'?city.properties:city.buildings;
  const record=collection?.find(item=>item.id===selection.id);
  const points=selection.kind==='property'?record?.boundary:buildingExteriorRingsS10(record).flat();
  if(!Array.isArray(points)||points.length<3
      ||!points.every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)))return null;
  return points;
}

export function focusCameraOnSelection4B(camera,city,selection) {
  const points=selectionFocusPoints4B(city,selection);
  if(!points||!camera||typeof camera.fit!=='function')return false;
  const span=Math.min(camera.width??800,camera.height??600);
  const padding=Math.max(30,Math.min(94,Math.round(span*.16)));
  camera.fit(points,padding);
  return true;
}
