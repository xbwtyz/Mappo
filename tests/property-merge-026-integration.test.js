import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { preparePropertyBuildingClear4E } from '../src/editor/property-building-clear-4e.js';
import { PropertySplitSessionE2, inspectPropertySplitE2, preparePropertySplitE2 } from '../src/editor/property-split-e2.js';
import { PropertyMergeSessionE3, inspectPropertyMergeE3, preparePropertyMergeE3 } from '../src/editor/property-merge-e3.js';
import { validateStoredProject } from '../src/data/project-validation.js';

function flexibleFixture() {
  const project=createProject({seed:'026-flexible-sibling',size:'small',morphology:'planned'});
  for(const row of project.city.properties){
    if(row.boundary?.length!==4)continue;
    const clear=row.buildingIds.length?
      preparePropertyBuildingClear4E(project,defaultWorkspace(project),row.id):
      {ok:true,candidate:project};
    if(!clear.ok)continue;
    const split=new PropertySplitSessionE2();
    if(!split.start(clear.candidate.city,row.id))continue;
    split.setFlexible(true);split.setT(.38);split.setExitEdge(2);split.setExitT(.65);
    const inspected=inspectPropertySplitE2(clear.candidate,split);
    if(!inspected.ok)continue;
    const sliced=preparePropertySplitE2(clear.candidate,defaultWorkspace(clear.candidate),split);
    if(!sliced.ok)continue;
    const session=new PropertyMergeSessionE3();
    session.start(sliced.candidate.city,sliced.sourcePropertyId);
    session.choose(sliced.candidate.city,sliced.newPropertyId);
    return {project:sliced.candidate,session,source:clear.candidate};
  }
  throw Error('No generated property supports an uneven 026 flexible-split sibling fixture.');
}

test('026: B02 irregular sibling merger preserves every plot ID and property data',()=>{
  const {project,session}=flexibleFixture();
  const original=JSON.stringify(project.city);
  const preview=inspectPropertyMergeE3(project,session);
  assert.equal(preview.ok,true,JSON.stringify(preview.issues));
  assert.equal(preview.preview.flexible,true);
  const merged=preparePropertyMergeE3(project,defaultWorkspace(project),session);
  assert.equal(merged.ok,true,JSON.stringify(merged.issues));
  assert.equal(merged.candidate.city.properties.length,project.city.properties.length-1);
  assert.equal(merged.candidate.city.plots.length,project.city.plots.length);
  assert.deepEqual(new Set(merged.candidate.city.plots.map(p=>p.id)),
    new Set(project.city.plots.map(p=>p.id)));
  for(const plot of project.city.plots){
    const after=merged.candidate.city.plots.find(p=>p.id===plot.id);
    assert.ok(after);
    assert.deepEqual(after.boundary,plot.boundary);
  }
  assert.equal(JSON.stringify(project.city),original);
  validateStoredProject(merged.candidate);
});
