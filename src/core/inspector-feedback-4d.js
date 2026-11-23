import { polygonSignedArea } from './geometry.js';

// Read-only facts, recomputed from accepted city data on every Inspector refresh.
// "Unbuilt" is an occupancy estimate, NOT a guarantee of buildable frontage.
const nonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const lineLength = points => Array.isArray(points) && points.length === 2
  && points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    ? Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y) : null;
export function propertyOverview4D(city, property) {
  if (!property) return null;
  const area = nonnegative(property.area) ? property.area
    : Array.isArray(property.boundary) && property.boundary.length >= 3
      ? Math.abs(polygonSignedArea(property.boundary)) : null;
  const length = lineLength(property.frontage) ??
    lineLength(Array.isArray(property.boundary) ? property.boundary.slice(0,2) : null);
  const buildings = (city?.buildings ?? []).filter(b => b.propertyId === property.id
    && Array.isArray(property.buildingIds) && property.buildingIds.includes(b.id));
  const complete = buildings.length === (property.buildingIds?.length ?? -1)
    && buildings.every(b => nonnegative(b.area));
  const occupied = complete ? buildings.reduce((sum,b)=>sum+b.area,0) : null;
  return {
    area, frontageLength:length,
    plots: Array.isArray(property.plotIds) ? property.plotIds.length : null,
    buildings: Array.isArray(property.buildingIds) ? property.buildingIds.length : null,
    estimatedUnbuiltArea:area !== null && occupied !== null ? Math.max(0,area-occupied) : null
  };
}

// Keep original validator issue codes and targetId intact; only explain them.
const REMEDIES = Object.freeze({
  shape:'Use a simple, non-crossing footprint; adjust corner positions or dimensions.',
  transform:'Enter finite position, rotation and scale values within the allowed limits.',
  courtyard:'Move the courtyard inward and keep its edges separate from the outer walls.',
  property:'Move or shrink the building so its entire footprint stays inside the property.',
  block:'Move the parcel corners back inside their parent street block.',
  setback:'Move the boundary farther from the named road to restore its required setback.',
  neighbor:'Move this parcel boundary away from the neighboring property.',
  collision:'Move, rotate or shrink the draft away from the neighboring building.',
  building:'Move the parcel boundary outward or reposition the named building before applying.',
  plot:'Widen or straighten the indicated plot subdivision and keep its corners ordered.',
  plots:'Reposition the footprint so it occupies valid plots on its owning property.',
  subdivision:'Keep each divider between its neighbors and away from the frontage ends.',
  tiling:'Adjust dividers so their plots exactly cover the edited parcel.',
  frontage:'Restore a valid street edge for the parcel before applying this edit.',
  access:'Adjust the footprint or clear the proposed entrance route.',
  selection:'Select an existing property or building and restart the preview.',
  missing:'Select an existing building and its owning property before editing.',
  target:'Re-select the building on its owning property.',
  id:'Choose an unused building identifier.',
  operation:'Choose a supported building action.',
  project:'Check the project geometry and undo the last invalid draft adjustment.',
  schema:'Review the affected geometry; Apply remains disabled until validation succeeds.',
  roundtrip:'Keep the accepted city unchanged and recheck the project save constraints.',
  unchanged:'Change a draft dimension or coordinate before applying.'
});
const KINDS = Object.freeze({
  setback:'Road',access:'Road',frontage:'Road',
  collision:'Building',building:'Building',target:'Building',
  neighbor:'Neighbor property',property:'Property',selection:'Property',
  block:'Block',plot:'Plot',plots:'Property',subdivision:'Plot'
});
export function formatEditIssue4D(issue, context = {}) {
  if(!issue || typeof issue !== 'object') return 'Check the draft geometry before applying.';
  const code=typeof issue.code === 'string' ? issue.code : '';
  const targetId=typeof issue.targetId === 'string' && issue.targetId
    ? issue.targetId : code==='access' ? context.frontageRoadId
      : code==='plots' ? context.propertyId : null;
  const type=KINDS[code];
  const label=type && typeof targetId === 'string' && targetId ? type+' '+targetId+': ' : '';
  const reason=String(issue.message ?? 'The draft did not pass validation.').trim();
  const remedy=REMEDIES[code] ?? 'Review this draft and try a smaller geometry adjustment.';
  const blocker = issue.blockerId ? ' Obstruction found on a proposed route: '+issue.blockerId+'.' : '';
  return label+reason+blocker+' '+remedy;
}
