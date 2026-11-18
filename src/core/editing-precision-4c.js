import { polygonSignedArea } from './geometry.js';
import { buildingFrame, previewBuildingGeometry } from './building-transform.js';
import { propertyLocalBounds3I } from './property-geometry.js';

// Dev 4c uses the existing edit-session update APIs. All operations remain
// preview-only; accepted city geometry changes exclusively through Apply.
export const PRECISION_STEPS_4C = Object.freeze([0.1, 0.5, 1, 5]);
const validStep = step => PRECISION_STEPS_4C.includes(step);
const rounded = value => Math.round(value * 1e8) / 1e8;
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

export function nudgeBuilding4C(session, axis, direction, step) {
  if (!session?.isActive || session.drag || !['dx','dy'].includes(axis)
      || ![1,-1].includes(direction) || !validStep(step)) return false;
  const value = rounded(session.transform[axis] + direction * step);
  return session.setTransform({ [axis]: value });
}

export function nudgePropertyCorner4C(session, axis, direction, step) {
  if (!session?.isActive || session.drag || !['x','y'].includes(axis)
      || ![1,-1].includes(direction) || !validStep(step)
      || session.selectedCorner === null) return false;
  const point = session.boundary?.[session.selectedCorner];
  if (!finitePoint(point)) return false;
  return session.setCorner(session.selectedCorner, {
    ...point, [axis]: rounded(point[axis] + direction * step)
  });
}

export function nudgeStructure4C(session, axis, direction, step) {
  if (!session?.isActive || session.drag || !['u','v'].includes(axis)
      || ![1,-1].includes(direction) || !validStep(step)) return false;
  return session.update({ [axis]: rounded(session.spec[axis] + direction * step) });
}

export function buildingMeasurements4C(city, session) {
  const source = session?.isActive ? session.source(city) : null;
  if (!source) return null;
  const original = previewBuildingGeometry(source);
  const preview = previewBuildingGeometry(source, session.transform);
  const frame = buildingFrame(source), { dx, dy, scaleX, scaleY } = session.transform;
  return { width:frame.width*scaleX, depth:frame.height*scaleY,
    area:preview.area, areaDelta:preview.area-original.area,
    x:frame.x+dx, y:frame.y+dy, dx, dy };
}

export function propertyMeasurements4C(city, session) {
  const source = session?.isActive ? session.source(city) : null;
  const preview = session?.boundary;
  if (!source || !Array.isArray(preview) || !preview.every(finitePoint)) return null;
  const box=propertyLocalBounds3I(source,preview);
  const area=Math.abs(polygonSignedArea(preview));
  const base=Math.abs(polygonSignedArea(source.boundary));
  const centroid=points=>({
    x:points.reduce((sum,p)=>sum+p.x,0)/points.length,
    y:points.reduce((sum,p)=>sum+p.y,0)/points.length
  });
  const now=centroid(preview), was=centroid(source.boundary);
  return { width:box.width,depth:box.depth,area,areaDelta:area-base,
    x:now.x,y:now.y,dx:now.x-was.x,dy:now.y-was.y };
}

export function placementMeasurements4C(city,session) {
  if (!session?.isActive) return null;
  const geometry=session.previewFor(city),spec=session.spec;
  if (!geometry || !spec) return null;
  return { width:spec.width,depth:spec.depth,area:Math.abs(geometry.area),
    u:spec.u,v:spec.v };
}

export function formatPrecision4C(value) {
  return Number.isFinite(value) ? String(rounded(Number(value.toFixed(2)))) : '—';
}
