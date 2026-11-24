import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { inspectRoadDependencies } from '../src/core/road-impact-dependencies.js';
import { riBudget,riReporter } from '../src/core/road-impact-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { extractRoadFaces,matchExistingFaces } from '../src/core/road-faces.js';
import { analyzeRoadImpact } from '../src/core/road-impact.js';
import { prepareRoadGroupReflowB1,iterateRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { validateRoadGroupApplyB1 } from '../src/editor/road-application.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { solveLareRoadGroup } from '../src/core/reconciliation-road-group.js';
import { validateStoredProject } from '../src/data/project-validation.js';

function analysis(project,draft){
  const graph=buildRoadGraph(draft.proposedCity),faces=extractRoadFaces(graph,project.city);
  return {graph,faces,identity:matchExistingFaces(project.city,faces),
    get impact(){return analyzeRoadImpact(project,{operation:'translate-road',graph});}};
}
test('B1R adapter retains a verified existing B1 incumbent and does not mutate accepted city',()=>{
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  const ids=['RD-0113','RD-0114'],offset={x:.05,y:0},before=JSON.stringify(project);
  const draft=prepareRoadGroupIntentB1(project,ids,offset);
  const baseline=prepareRoadGroupReflowB1(project,ids,offset);
  assert.ok(baseline.candidateProject);
  const result=solveLareRoadGroup(project,draft,analysis(project,draft),baseline);
  assert.ok(result.candidateProject,JSON.stringify(result.unresolved));
  validateStoredProject(result.candidateProject);
  assert.equal(result.lare.source,'verified-baseline');
  assert.equal(JSON.stringify(project),before);
});
test('B1R adapter never accepts an unverified incumbent on invalid impact',()=>{
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  const ids=['RD-0113','RD-0114'],offset={x:.05,y:0};
  const draft=prepareRoadGroupIntentB1(project,ids,offset);
  const baseline=prepareRoadGroupReflowB1(project,ids,offset);
  const tampered=JSON.parse(JSON.stringify(baseline));tampered.candidateProject.city.roads[0].unexpected=true;
  const result=solveLareRoadGroup(project,draft,{graph:{valid:false}},tampered);
  assert.equal(result.candidateProject,null);
  assert.ok(result.unresolved.length);
});

test('B1R integrated linear refusal recovers without deleting or moving buildings and reproduces Apply',()=>{
  const project=createProject({seed:'b1-linear',size:'small',morphology:'linear',irregularProperties:true});
  const ids=['RD-0122','RD-0123'],offset={x:1,y:1},before=JSON.stringify(project);
  const result=prepareRoadGroupReflowB1(project,ids,offset);
  assert.ok(result.candidateProject,JSON.stringify(result.unresolved));
  assert.equal(result.lare.score[0],0);
  const receipt=validateRoadGroupApplyB1(project,defaultWorkspace(project),{selectedRoadIds:ids,offset},result);
  assert.ok(receipt.ok,JSON.stringify(receipt.issues));
  assert.deepEqual(receipt.candidate.city.buildings.map(b=>b.id),project.city.buildings.map(b=>b.id));
  for(const b of project.city.buildings){
    const candidate=receipt.candidate.city.buildings.find(x=>x.id===b.id);
    assert.equal(JSON.stringify(candidate.geometry),JSON.stringify(b.geometry));
  }
  const h=new AcceptedEditHistoryD01();h.clear(project);
  assert.equal(h.record(project,receipt.candidate,receipt.transaction).status,'recorded');
  const undo=h.prepare('undo',receipt.candidate,receipt.workspace);
  assert.ok(undo.ok,undo.reason);assert.equal(JSON.stringify(undo.candidate),before);
  h.accept('undo',undo.entry,undo.candidate);
  const redo=h.prepare('redo',undo.candidate,undo.workspace);
  assert.ok(redo.ok,redo.reason);assert.deepEqual(redo.candidate,receipt.candidate);
  assert.equal(JSON.stringify(project),before);
});
test('B1R staged and synchronous integrated group drafts produce the same accepted candidate',()=>{
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  const ids=['RD-0113','RD-0114'],offset={x:.05,y:0};
  const direct=prepareRoadGroupReflowB1(project,ids,offset);
  const iterator=iterateRoadGroupReflowB1(project,ids,offset);let step=iterator.next();
  while(!step.done)step=iterator.next();
  assert.deepEqual(step.value,direct);
});


test('B1R outside-block setback diagnostics measure the original and candidate records independently', () => {
  const project = createProject({ seed:'lare-organic-3', morphology:'organic', size:'small', irregularProperties:false });
  const original = project.city;
  const draft = prepareRoadGroupIntentB1(project, ['RD-0167','RD-0170','RD-0188','RD-0232'], { x:0,y:-2 });
  assert.ok(draft.topologyResolved && draft.facesResolved);
  assert.ok(draft.changedRoadIds.includes('RD-0233'));
  const {emit,items} = riReporter();
  const context = { roadIds:draft.changedRoadIds, junctionIds:draft.proposedNodes.map(node=>node.id),
    changedBlockIds:[], acceptedValid:true };
  inspectRoadDependencies(draft.proposedCity,draft.proposedCity,context,emit,riBudget(),original);
  const issue = items().find(item=>item.id==='PROP-00092' && item.code==='road-setback' &&
    item.relatedIds.includes('RD-0233'));
  assert.ok(issue, JSON.stringify(items().filter(item=>item.id==='PROP-00092')));
  assert.ok(Math.abs(issue.metrics.oldDistance-9.959298255558103)<1e-9);
  assert.ok(Math.abs(issue.metrics.newDistance-8.080749215358827)<1e-9);
  assert.equal(issue.metrics.requiredDistance,8.7);
  assert.equal(issue.severity,'needs-review');
});
