import { createProject } from '../../src/core/city-model.js';
import { defaultWorkspace } from '../../src/data/project-format.js';
import { preparePropertyDeletion4A } from '../../src/editor/property-deletion.js';
import { inspectPropertyCreationE1 } from '../../src/editor/property-creation-e1.js';

export function vacant(morphology='planned',size='small'){
  const base=createProject({seed:'e1-'+morphology+'-'+size,size,morphology});
  const workspace=defaultWorkspace(base);
  for(const property of base.city.properties){
    if(property.local?.width<10||property.local?.depth<12)continue;
    const erased=preparePropertyDeletion4A(base,workspace,property.id);
    if(!erased.ok)continue;
    const draft={
      blockId:property.blockId,roadId:property.frontageRoadId,u:property.local.x+1,
      width:Math.min(10,property.local.width-2),depth:Math.min(12,property.local.depth-1)
    };
    if(inspectPropertyCreationE1(erased.candidate,draft).ok)
      return {project:erased.candidate,original:property,draft,workspace:defaultWorkspace(erased.candidate)};
  }
  throw Error('No verified vacant frontage found for '+morphology+'/'+size);
}
