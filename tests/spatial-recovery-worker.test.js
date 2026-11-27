import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../src/core/spatial-recovery-coordinator.js';
import { normalizeSpatialRoadWorkerRequest, calculateSpatialRoadWorkerResult, SRE_ROAD_WORKER_VERSION } from '../src/worker/spatial-recovery-worker.js';

const project = createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const operation = normalizeSpatialRoadGroup(project,1,['RD-0113','RD-0114'],{x:.05,y:0});
const request = () => ({version:SRE_ROAD_WORKER_VERSION,requestId:1,sessionId:'host-session-a',
  projectJson:JSON.stringify(project),operation,quality:'standard'});

test('SRE worker rejects unknown policy, malformed binding and mismatched snapshot without a witness',async()=>{
  const input = request();
  assert.throws(()=>normalizeSpatialRoadWorkerRequest({...input,version:2}),/request/);
  assert.throws(()=>normalizeSpatialRoadWorkerRequest({...input,requestId:0}),/request/);
  assert.throws(()=>normalizeSpatialRoadWorkerRequest({...input,sessionId:''}),/request/);
  assert.throws(()=>normalizeSpatialRoadWorkerRequest({...input,budget:{work:999999999}}),/request/);
  assert.throws(()=>normalizeSpatialRoadWorkerRequest({...input,quality:'high'}),/quality/);
  assert.throws(()=>normalizeSpatialRoadWorkerRequest({...input,operation:{...operation,
    permissions:{destruction:true,regeneration:true}}}),/regeneration/);
  await assert.rejects(()=>calculateSpatialRoadWorkerResult({...input,projectJson:'{'}));
  await assert.rejects(()=>calculateSpatialRoadWorkerResult({...input,operation:{...operation,projectId:'wrong'}}),/identity/);
  await assert.rejects(()=>calculateSpatialRoadWorkerResult({...input,projectJson:JSON.stringify({...project,schemaVersion:10})}),/schema/);
});

test('SRE detached worker thread returns a compact replayable witness identical to the direct search',{timeout:120000},async()=>{
  const input=request(),before=JSON.stringify(project);
  const moduleUrl=new URL('../src/worker/spatial-recovery-worker.js',import.meta.url).href;
  // Node transport harness uses the same worker handler as the offline browser
  // entry; this is not a claim of bundled browser or live UI qualification.
  const worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    import(workerData).then(({installSpatialRoadRecoveryWorker})=>{
      installSpatialRoadRecoveryWorker({
        addEventListener:(_,fn)=>parentPort.on('message',data=>fn({data})),
        postMessage:data=>parentPort.postMessage(data)
      });
      parentPort.postMessage({ready:true});
    }).catch(error=>{throw error;});
  `,{eval:true,workerData:moduleUrl});
  const next=()=>new Promise((resolve,reject)=>{
    const onError=err=>{worker.off('message',onMessage);reject(err);};
    const onMessage=data=>{worker.off('error',onError);resolve(data);};
    worker.once('error',onError);worker.once('message',onMessage);
  });
  try {
    assert.deepEqual(await next(),{ready:true});
    const reply=next();worker.postMessage(input);
    const response=await reply;
    assert.equal(response.error,undefined);
    assert.equal(response.version,input.version);
    assert.equal(response.sessionId,input.sessionId);
    assert.equal(response.requestId,input.requestId);
    assert.deepEqual(response.operation,operation);
    assert.equal(response.quality,'standard');
    assert.equal(response.result.status,'verified-witness');
    const direct=await searchSpatialUnifiedRoadGroup(project,operation,createSpatialPreservationBudget());
    assert.deepEqual(response.result.delta,direct.delta);
    assert.deepEqual(response.result.basisDelta,direct.basisDelta);
    assert.equal(response.result.kind,direct.kind);
    assert.equal(Object.hasOwn(response,'project'),false);
    assert.equal(Object.hasOwn(response.result,'candidateProject'),false);
    await verifySpatialUnifiedRoadWitness(project,operation,response.result,createSpatialPreservationBudget());
    assert.equal(JSON.stringify(project),before);
    const bad=next();worker.postMessage({...input,requestId:2,projectJson:'not json'});
    const failure=await bad;
    assert.equal(failure.requestId,2);
    assert.equal(failure.sessionId,input.sessionId);
    assert.equal(typeof failure.error,'string');
    assert.equal(Object.hasOwn(failure,'result'),false);
  } finally {await worker.terminate();}
});
