import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { preparePropertyBuildingClear4E } from '../src/editor/property-building-clear-4e.js';
import { PropertySplitSessionE2, PropertySplitHistoryE2, inspectPropertySplitE2,
  preparePropertySplitE2 } from '../src/editor/property-split-e2.js';

function irregularFixture(){
  for(const seed of ['025-split-one','025-split-two','025-split-three']){
    const project=createProject({seed,size:'medium',morphology:'organic',irregularProperties:true});
    const candidates=project.city.properties.filter(p=>p.boundary.length>4&&p.area>190&&
      Math.hypot(p.boundary[1].x-p.boundary[0].x,p.boundary[1].y-p.boundary[0].y)>18);
    candidates.sort((a,b)=>a.buildingIds.length-b.buildingIds.length);
    for(const p of candidates.slice(0,45)){
      const cleared=p.buildingIds.length
        ?preparePropertyBuildingClear4E(project,defaultWorkspace(project),p.id)
        :{ok:true,candidate:project};
      if(!cleared.ok)continue;
      const candidate=cleared.candidate,session=new PropertySplitSessionE2();
      if(!session.start(candidate.city,p.id)||!session.flexible)continue;
      for(let edge=1;edge<p.boundary.length;edge++){
        session.setExitEdge(edge);
        for(const position of [.35,.5,.65]){
          session.setT(position);
          const inspection=inspectPropertySplitE2(candidate,session);
          if(inspection.ok)return {project:candidate,propertyId:p.id,session};
        }
      }
    }
  }
  throw Error('0.2.5 acceptance could not locate a safely splittable generated irregular property.');
}

test('025 P3: irregular source Apply is nonmutating, atomic, schema-9 valid and Undo/Redo reversible',()=>{
  const {project,propertyId,session}=irregularFixture();
  const before=JSON.stringify(project.city);
  const receipt=preparePropertySplitE2(project,defaultWorkspace(project),session);
  assert.equal(receipt.ok,true,JSON.stringify(receipt.issues));
  assert.ok(receipt.lineage.operation==='straight-polygon');
  assert.equal(receipt.candidate.schemaVersion,9);
  validateStoredProject(receipt.candidate);
  assert.equal(receipt.candidate.city.properties.length,project.city.properties.length+1);
  const parent=receipt.candidate.city.properties.find(p=>p.id===propertyId);
  assert.ok(parent&&parent.boundary.length>=3);
  assert.equal(JSON.stringify(project.city),before);
  const history=new PropertySplitHistoryE2();
  assert.equal(history.record(project,receipt.candidate,propertyId),true);
  const undo=history.prepare('undo',receipt.candidate,defaultWorkspace(receipt.candidate));
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(JSON.stringify(undo.candidate.city),before);
  history.accept('undo',undo.entry);
  const redo=history.prepare('redo',project,defaultWorkspace(project));
  assert.equal(redo.ok,true,redo.reason);
  assert.equal(JSON.stringify(redo.candidate.city),JSON.stringify(receipt.candidate.city));
});

test('025 P3: protected crossing plot metadata blocks irregular split and keeps accepted city unchanged',()=>{
  const {project,propertyId,session}=irregularFixture();
  const split=inspectPropertySplitE2(project,session);
  const fragment=split.preview.fragments.find(f=>f.crossesCut);
  assert.ok(fragment,'A positive cut must cross an existing plot to test metadata protection.');
  project.city.plots.find(p=>p.id===fragment.originalId).customDescription='Owner-authored record';
  const before=JSON.stringify(project.city);
  const inspection=inspectPropertySplitE2(project,session);
  assert.equal(inspection.ok,false);
  assert.ok(inspection.issues.some(x=>x.code==='plot-metadata'));
  assert.equal(preparePropertySplitE2(project,defaultWorkspace(project),session).candidate,null);
  assert.equal(JSON.stringify(project.city),before);
});
