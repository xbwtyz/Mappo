import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { proposeJunctionMove } from '../src/core/road-graph.js';
import { analyzeRoadImpact } from '../src/core/road-impact.js';
import { prepareJunctionReflowC7 } from '../src/core/neighborhood-reflow.js';
import { calculateJunctionPreviewP1 } from '../src/worker/junction-preview-worker.js';
import { roadReconciliationPreviewB3 } from '../src/core/road-inspection.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { validateRoadApplyC2 } from '../src/editor/road-application.js';
import { RoadPreviewSession } from '../src/editor/road-preview.js';

test('P1 worker reproduces A3 and C7 results and returns clone-safe data', () => {
  const project = createProject({size:'small',seed:'c2-organic',morphology:'organic'});
  const before = JSON.stringify(project), junctionId = 'N-0139';
  const old = project.city.nodes.find(n=>n.id===junctionId);
  assert.ok(old);
  const point = {x:old.x,y:old.y+15};
  const actual = calculateJunctionPreviewP1({project,junctionId,point});
  const proposal = proposeJunctionMove(project.city,junctionId,point);
  assert.deepEqual(actual.report,analyzeRoadImpact(project,proposal));
  assert.deepEqual(actual.reconciliation,prepareJunctionReflowC7(project,junctionId,point,new Map()));
  assert.deepEqual(actual.proposal.issues,proposal.issues);
  assert.equal(actual.proposal.graphValid,proposal.graphValid);
  assert.deepEqual(actual.previewGeometry,roadReconciliationPreviewB3(project,actual.reconciliation,actual.topology));
  assert.doesNotThrow(()=>structuredClone(actual));
  assert.equal(JSON.stringify(project),before);
});

test('P1 asynchronous session ignores superseded and stopped worker replies', async () => {
  const project=createProject({size:'small',seed:'c2-organic',morphology:'organic'});
  const before=JSON.stringify(project),pending=[];
  const session=new RoadPreviewSession({
    getProject:()=>project,
    reconcile:()=>({candidateProject:project}),
    computeJunctionAsync:input=>new Promise(resolve=>pending.push({input,resolve})),
  });
  session.start();
  const point={...session.point};
  session.update({x:point.x+1,y:point.y},{defer:false});
  await Promise.resolve();
  session.update({x:point.x+2,y:point.y},{defer:false});
  await Promise.resolve();
  assert.equal(pending.length,2);
  const result=status=>({proposal:{graphValid:true,issues:[]},
    report:{status},reconciliation:{status:'candidate-only',candidateProject:project},
    topology:null});
  pending[0].resolve(result('invalid'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.report,null);
  assert.equal(session.checking,true);
  const revision=session.revision;
  pending[1].resolve(result('needs-review'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.report.status,'needs-review');
  assert.equal(session.settledRevision,revision);
  assert.equal(session.checking,false);
  assert.equal(session.acceptedFingerprint,before);
  assert.equal(JSON.stringify(project),before);
  session.update({x:point.x+3,y:point.y},{defer:false});
  await Promise.resolve();
  session.stop();
  pending[2].resolve(result('safe'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.report,null);
  assert.equal(session.settledRevision,null);
});

test('P4 fresh Apply rejects a changed candidate or ledger before exposing an accepted candidate', () => {
  const project = createProject({size:'small',seed:'c2-organic',morphology:'organic'});
  const id = 'N-0139', node = project.city.nodes.find(n=>n.id===id);
  const point = {x:node.x,y:node.y+15}, buildingDecisions = new Map();
  const draft = {selection:{kind:'junction',id},point,buildingDecisions};
  const inspected = prepareJunctionReflowC7(project,id,point,buildingDecisions);
  const workspace = defaultWorkspace(project);
  const original = JSON.stringify(project);
  const receipt = validateRoadApplyC2(project,workspace,draft,inspected);
  assert.equal(receipt.ok,true);
  assert.deepEqual(receipt.candidate,inspected.candidateProject);
  const changedCandidate = structuredClone(inspected.candidateProject);
  changedCandidate.city.nodes.find(n=>n.id===id).y++;
  for (const altered of [{...inspected,candidateProject:changedCandidate}, {...inspected,ledger:[]}]) {
    const rejected = validateRoadApplyC2(project,workspace,draft,altered);
    assert.equal(rejected.issues[0].code,'candidate-changed');
    assert.equal(rejected.candidate,null);
  }
  assert.equal(JSON.stringify(project),original);
});
