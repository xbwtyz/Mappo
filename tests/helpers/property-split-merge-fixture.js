import { createProject } from '../../src/core/city-model.js';
import { defaultWorkspace } from '../../src/data/project-format.js';
import { preparePropertyBuildingClear4E } from '../../src/editor/property-building-clear-4e.js';
import { PropertySplitSessionE2, inspectPropertySplitE2, preparePropertySplitE2 } from '../../src/editor/property-split-e2.js';
import { PropertyMergeSessionE3, inspectPropertyMergeE3, preparePropertyMergeE3 } from '../../src/editor/property-merge-e3.js';

export function findSplitAndMerge(seed='e5-cross-editor',morphology='planned',size='small'){
 const original=createProject({seed,morphology,size});
 for(const parcel of original.city.properties){
  if(parcel.boundary?.length!==4)continue;
  const cleared=parcel.buildingIds.length
   ?preparePropertyBuildingClear4E(original,defaultWorkspace(original),parcel.id)
   :{ok:true,candidate:original};
  if(!cleared.ok)continue;
  const base=cleared.candidate,session=new PropertySplitSessionE2();
  if(!session.start(base.city,parcel.id)||!inspectPropertySplitE2(base,session).ok)continue;
  const split=preparePropertySplitE2(base,defaultWorkspace(base),session);
  if(!split.ok)continue;
  const mergeSession=new PropertyMergeSessionE3();
  if(!mergeSession.start(split.candidate.city,split.sourcePropertyId)
   ||!mergeSession.choose(split.candidate.city,split.newPropertyId)
   ||!inspectPropertyMergeE3(split.candidate,mergeSession).ok)continue;
  const merged=preparePropertyMergeE3(split.candidate,defaultWorkspace(split.candidate),mergeSession);
  if(merged.ok)return {base,split,merged,propertyId:split.sourcePropertyId};
 }
 throw Error('No E2→E3 legal fixture: '+morphology+'/'+size+' seed '+seed);
}
