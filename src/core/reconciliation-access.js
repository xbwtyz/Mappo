import { resolveSameFrontageAccessB1R } from '../editor/building-application.js';
import { buildingPrimaryRouteViewS10 } from './building-geometry-adapter-s10.js';
import { classifyRoadProvenance,stampRoadGenerated } from './road-provenance.js';
import { hydrateBuildingS10 } from './building-project-s10.js';

// Final route checks run against the whole detached arrangement, not the
// prior locations of other movable buildings. Fixed authored doors/routes
// are retained only; explicit courtyard repair remains a separate B1 path.
export function reconcileLareAccess(city,original,placement,permission,budget){
  if(placement.id!==original.id||placement.propertyId!==original.propertyId||
    placement.frontageRoadId!==original.frontageRoadId)throw Error('Building ownership or frontage changed.');
  const generated=classifyRoadProvenance(original)==='generated';
  const view=buildingPrimaryRouteViewS10(placement);
  const result=resolveSameFrontageAccessB1R(city,view,{allowRepair:generated,
    allowEntranceMove:generated&&permission?.mode==='rigid',spend:budget.spend});
  if(!result.route)return {ok:false,code:result.code,building:null};
  const {entrance,accessPath,frontageRoadId}=result.route;
  if(frontageRoadId!==original.frontageRoadId)throw Error('Unexpected frontage change.');
  const b={...JSON.parse(JSON.stringify(placement)),entrance,accessPath};
  if(generated)stampRoadGenerated(b);
  return {ok:true,building:hydrateBuildingS10(b),changed:result.changed};
}
