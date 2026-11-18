import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

// Dev 4e: clear the buildings of ONE selected property in a single transaction.
// Plots, property geometry, streets, neighboring buildings and metadata survive.
export function preparePropertyBuildingClear4E(project,workspace,propertyId) {
  const failure = (reason,code='clear') => ({ok:false,reason,issues:[{code,message:reason}],candidate:null});
  const property=project?.city?.properties?.find(p=>p.id===propertyId);
  if(!property)return failure('The selected property no longer exists.','property');
  if(!Array.isArray(property.buildingIds))return failure('Property building membership is unavailable.','membership');
  const linked=project.city.buildings.filter(b=>b.propertyId===propertyId);
  const expected=[...property.buildingIds].sort(),actual=linked.map(b=>b.id).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))
    return failure('Property building references are inconsistent; no buildings were removed.','membership');
  if(!linked.length)return failure('This property has no buildings to clear.','unchanged');
  try {
    const candidate=copyJson(project);
    candidate.city.buildings=candidate.city.buildings.filter(b=>b.propertyId!==propertyId);
    candidate.city.properties.find(p=>p.id===propertyId).buildingIds=[];
    validateStoredProject(candidate);
    const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
    if(JSON.stringify(portable.project.city)!==JSON.stringify(candidate.city))
      throw new Error('Save/load altered the proposed city geometry.');
    return {ok:true,candidate:portable.project,propertyId,buildingIds:linked.map(b=>b.id),
      count:linked.length};
  }catch(error){return failure('Could not clear property buildings: '+error.message,'project');}
}
