import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { proposeJunctionMove } from '../src/core/road-graph.js';
import { analyzeRoadImpact } from '../src/core/road-impact.js';
import { prepareJunctionReflowC7 } from '../src/core/neighborhood-reflow.js';
import { calculateJunctionPreviewP1 } from '../src/worker/junction-preview-worker.js';
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
