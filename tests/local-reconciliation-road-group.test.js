import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { extractRoadFaces,matchExistingFaces } from '../src/core/road-faces.js';
import { analyzeRoadImpact } from '../src/core/road-impact.js';
import { prepareRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
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
