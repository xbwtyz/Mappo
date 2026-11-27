import { riEqual } from './road-impact-model.js';

// Optional detached diagnostic capture of the selected retirement lineage.
// Collapse consecutive geometry-only refinements; retain membership
// changes, including re-retirement after restoration. The last entry
// always binds the exact current retirement basis. No search authority.
export function recordSpatialRestorationBasis(trail,delta){
  if(trail===null)return;
  const last=trail.at(-1);
  if(last&&riEqual(last.retired,delta.retired))trail[trail.length-1]=delta;
  else trail.push(delta);
}
