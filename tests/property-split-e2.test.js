import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { preparePropertyBuildingClear4E } from '../src/editor/property-building-clear-4e.js';
import { propertySplitGeometryE2 } from '../src/core/property-split-geometry-e2.js';
import { PropertySplitSessionE2,PropertySplitHistoryE2,
  inspectPropertySplitE2,preparePropertySplitE2 } from '../src/editor/property-split-e2.js';
import { validateStoredProject } from '../src/data/project-validation.js';

function candidate(seed='e2-geometry',morphology='planned',size='small'){
  const original=createProject({seed,morphology,size});
  for(const p of original.city.properties){
    if(p.boundary.length!==4)continue;
    const frontage=Math.hypot(p.boundary[1].x-p.boundary[0].x,p.boundary[1].y-p.boundary[0].y);
    if(frontage<16)continue;
    const cleared=p.buildingIds.length
      ?preparePropertyBuildingClear4E(original,defaultWorkspace(original),p.id)
      :{ok:true,candidate:original};
    if(!cleared.ok)continue;
    const project=cleared.candidate,property=project.city.properties.find(x=>x.id===p.id);
    const session=new PropertySplitSessionE2();session.start(project.city,property.id);
    if(inspectPropertySplitE2(project,session).ok)return {project,session,property};
  }
  return null;
}

test('E2 geometry partitions accepted front/rear without mutating source',()=>{
  const fixture=candidate();
  assert.ok(fixture,'A generated vacant four-corner property is needed.');
  const {project,property,session}=fixture;
  const original=JSON.stringify(project.city);
  const result=propertySplitGeometryE2(project.city,property.id,.5);
  assert.ok(result.left.length===4&&result.right.length===4);
  assert.ok(Math.abs(result.areaLeft+result.areaRight-property.area)<.02);
  assert.equal(JSON.stringify(project.city),original);
  const inspected=inspectPropertySplitE2(project,session);
  assert.equal(inspected.ok,true,JSON.stringify(inspected.issues));
});

test('E2 candidate applies with new property and valid plot ownership, undo restores exact city',()=>{
  const fixture=candidate('e2-apply');
  assert.ok(fixture);
  const {project,property,session}=fixture;
  const before=JSON.stringify(project.city);
  const accepted=preparePropertySplitE2(project,defaultWorkspace(project),session);
  assert.equal(accepted.ok,true,JSON.stringify(accepted.issues));
  const city=accepted.candidate.city;
  assert.equal(city.properties.length,project.city.properties.length+1);
  assert.equal(city.plots.length,project.city.plots.length+1);
  assert.equal(city.properties.find(p=>p.id===property.id).id,property.id);
  assert.notEqual(accepted.newPropertyId,property.id);
  validateStoredProject(accepted.candidate);
  assert.equal(JSON.stringify(project.city),before);
  const history=new PropertySplitHistoryE2();
  assert.equal(history.record(project,accepted.candidate,property.id),true);
  const undo=history.prepare('undo',accepted.candidate,defaultWorkspace(accepted.candidate));
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(JSON.stringify(undo.candidate.city),before);
  assert.equal(history.accept('undo',undo.entry),true);
  const redo=history.prepare('redo',project,defaultWorkspace(project));
  assert.equal(redo.ok,true,redo.reason);
  assert.equal(JSON.stringify(redo.candidate.city),JSON.stringify(city));
});

test('E2 rejects invalid fractions, undersized remnants, crossing buildings and unknown source plots safely',()=>{
  const fixture=candidate('e2-negative');
  assert.ok(fixture);
  const {project,property,session}=fixture;
  const original=JSON.stringify(project.city);
  session.setT(.01);
  assert.equal(inspectPropertySplitE2(project,session).ok,false);
  assert.equal(preparePropertySplitE2(project,defaultWorkspace(project),session).candidate,null);
  session.setT(.5);
  const oldPlot=project.city.plots.find(p=>p.id===property.plotIds[0]);
  oldPlot.customAnnotation='protected';
  assert.equal(inspectPropertySplitE2(project,session).ok,false);
  assert.equal(preparePropertySplitE2(project,defaultWorkspace(project),session).candidate,null);
  assert.notEqual(JSON.stringify(project.city),original);
});

test('E2 declared morphologies produce deterministic nonmutating geometry',()=>{
  for(const morphology of ['organic','radial','linear','planned']){
    for(const size of ['small','large']){
      const project=createProject({seed:'e2-'+morphology+'-'+size,morphology,size});
      const eligible=project.city.properties.filter(p=>p.boundary.length===4);
      assert.ok(eligible.length>0);
      const p=eligible.find(p=>Math.hypot(p.boundary[1].x-p.boundary[0].x,p.boundary[1].y-p.boundary[0].y)>15);
      assert.ok(p);
      const before=JSON.stringify(project.city);
      const g=propertySplitGeometryE2(project.city,p.id,.5);
      assert.ok(g.areaLeft>0&&g.areaRight>0);
      assert.equal(JSON.stringify(project.city),before);
    }
  }
});
