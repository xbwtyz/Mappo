import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { RoadPreviewSession } from '../src/editor/road-preview.js';
import { createJunctionPreviewControllerP2 } from '../src/editor/junction-preview-worker-client.js';

class MockWorker {
  constructor() {
    this.sent = [];
    this.closed = false;
    this.terminated = 0;
    this.listeners = new Map();
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  postMessage(payload) {
    if (this.sendError) throw this.sendError;
    this.sent.push(payload);
  }
  terminate() { this.closed = true; this.terminated++; }
  emit(type, detail) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(type === 'message' ? { data: detail } : detail ?? {});
  }
}
function controller(options) {
  const workers = [];
  const compute = createJunctionPreviewControllerP2(() => {
    const w = new MockWorker();
    workers.push(w);
    return w;
  }, options);
  return { compute, workers };
}
const result = id => ({ from: id });

test('P2 kills a busy worker before dispatching a replacement, without a queue', async () => {
  const { compute, workers } = controller();
  const first = compute({ junctionId: 'N-1' });
  const aborted = assert.rejects(first, { name: 'AbortError' });
  assert.equal(workers.length, 1);
  const id1 = workers[0].sent[0].requestId;
  const second = compute({ junctionId: 'N-2' });
  await aborted;
  assert.equal(workers[0].closed, true);
  assert.equal(workers[0].terminated, 1);
  assert.equal(workers[0].sent.length, 1, 'no stale queued draft');
  assert.equal(workers.length, 2);
  assert.equal(workers[1].sent.length, 1);
  const id2 = workers[1].sent[0].requestId;
  assert.ok(id2 > id1);
  workers[0].emit('message', { requestId: id1, result: result('stale') });
  workers[1].emit('message', { requestId: id2, result: result('current') });
  assert.deepEqual(await second, result('current'));
  assert.equal(compute.cancel(), false, 'idle worker has no job to cancel');
  compute.suspend();
  assert.equal(workers[1].closed, true);
  const third = compute({ junctionId: 'N-3' });
  assert.equal(workers.length, 3, 'resume starts a clean worker');
  workers[2].emit('message', { requestId: workers[2].sent[0].requestId, result: result('resumed') });
  assert.deepEqual(await third, result('resumed'));
  compute.terminate();
  await assert.rejects(compute({}), /terminated/);
});

test('P2 handles worker errors, bad messages, clone errors and timeout without sticking', async () => {
  const { compute, workers } = controller({ timeoutMs: 30 });
  const one = compute({ junctionId: 'N-1' });
  const fail1 = assert.rejects(one, /worker error/);
  workers[0].emit('error', { message: 'worker error' });
  await fail1;
  assert.equal(workers[0].closed, true);
  const two = compute({ junctionId: 'N-2' });
  const fail2 = assert.rejects(two, /could not be decoded/);
  workers[1].emit('messageerror');
  await fail2;
  assert.equal(workers[1].closed, true);
  const three = compute({ junctionId: 'N-3' });
  const fail3 = assert.rejects(three, /timed out/);
  await fail3;
  assert.equal(workers[2].closed, true);
  const recovered = compute({ junctionId: 'N-4' });
  workers[3].emit('message', {requestId:workers[3].sent[0].requestId,result:result('recovered')});
  assert.deepEqual(await recovered, result('recovered'));
  compute.terminate();

  const clone = controller();
  clone.compute.warmup();
  clone.workers[0].sendError = new Error('DataCloneError simulated');
  await assert.rejects(clone.compute({ junctionId: 'N-5' }), /DataCloneError simulated/);
  assert.equal(clone.workers[0].closed, true);
  const next = clone.compute({ junctionId: 'N-6' });
  clone.workers[1].emit('message', {requestId:clone.workers[1].sent[0].requestId,
    result:result('after-clone-error')});
  assert.deepEqual(await next, result('after-clone-error'));
  clone.compute.terminate();
});

test('P2 session invalidates worker on rapid nudge, selection, reset and exit', async () => {
  const project = createProject({size:'small',seed:'c2-organic',morphology:'organic'});
  const accepted = JSON.stringify(project);
  const { compute, workers } = controller();
  const session = new RoadPreviewSession({
    getProject: () => project,
    reconcile: () => ({ candidateProject: project }),
    computeJunctionAsync: compute,
  });
  session.start();
  const initial = {...session.point};
  session.update({x:initial.x+1,y:initial.y},{defer:false});
  await Promise.resolve();
  assert.equal(workers.length, 1);
  const first = workers[0];
  assert.equal(first.sent.length, 1);
  session.update({x:initial.x+2,y:initial.y},{defer:false});
  await Promise.resolve();
  assert.equal(first.closed, true);
  assert.equal(workers.length, 2);
  assert.equal(session.checking, true);
  session.reset();
  assert.equal(workers[1].closed, true);
  assert.equal(session.checking, false);
  assert.equal(session.report, null);
  session.update({x:initial.x+3,y:initial.y},{defer:false});
  await Promise.resolve();
  assert.equal(workers.length, 3);
  session.select({kind:'junction', id: session.selection.id});
  assert.equal(workers[2].closed, true);
  assert.equal(session.settledRevision, null);
  session.update({x:initial.x+4,y:initial.y},{defer:false});
  await Promise.resolve();
  const third = workers[3];
  session.stop();
  assert.equal(third.closed, true);
  third.emit('message', {requestId:third.sent[0].requestId,
    result:{report:{status:'safe'},reconciliation:{candidateProject:project}}});
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.report, null);
  assert.equal(session.active, false);
  assert.equal(JSON.stringify(project), accepted);
});

test('P2 invalidated dispatch microtasks do not create a worker or publish a preview', async () => {
  const project = createProject({size:'small',seed:'c2-organic',morphology:'organic'});
  const {compute,workers}=controller();
  const session = new RoadPreviewSession({
    getProject:()=>project,reconcile:()=>({candidateProject:project}),
    computeJunctionAsync:compute,
  });
  session.start();
  const point={...session.point};
  session.update({x:point.x+1,y:point.y},{defer:false});
  session.update({x:point.x+2,y:point.y},{defer:false});
  session.reset();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(workers.length,0,'do not enqueue obsolete microtasks');
  assert.equal(session.checking,false);
  assert.equal(session.settledRevision,null);
  assert.equal(session.report,null);
});

test('P2 failure does not authorize Apply and a new draft can recover', async () => {
  const project=createProject({size:'small',seed:'c2-organic',morphology:'organic'});
  const before=JSON.stringify(project), {compute,workers}=controller();
  const session=new RoadPreviewSession({
    getProject:()=>project,reconcile:()=>({candidateProject:project}),
    computeJunctionAsync:compute,
  });
  session.start();
  const p={...session.point};
  session.update({x:p.x+1,y:p.y},{defer:false});
  await Promise.resolve();
  workers[0].emit('error',{message:'test crash'});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(session.checking,false);
  assert.match(session.error,/test crash/);
  assert.equal(session.settledRevision,null);
  assert.equal(session.acceptedFingerprint,null);
  session.update({x:p.x+2,y:p.y},{defer:false});
  await Promise.resolve();
  assert.equal(workers.length,2);
  workers[1].emit('message',{requestId:workers[1].sent[0].requestId,
    result:{proposal:{issues:[],graphValid:true},report:{status:'needs-review'},
      reconciliation:{status:'candidate-only',candidateProject:project},
      topology:null,reconciliationError:''}});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(session.checking,false);
  assert.equal(session.error,'');
  assert.equal(session.settledRevision,session.revision);
  assert.equal(JSON.stringify(project),before);
  session.stop();
});
