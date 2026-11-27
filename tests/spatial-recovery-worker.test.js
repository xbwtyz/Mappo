import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../src/core/spatial-recovery-coordinator.js';
import { calculateSpatialRoadWorkerResult } from '../src/worker/spatial-recovery-worker.js';
import { normalizeSpatialRoadWorkerRequest, SRE_ROAD_WORKER_VERSION } from '../src/core/spatial-recovery-worker-protocol.js';
import { createSpatialRoadWorkerController } from '../src/editor/spatial-recovery-worker-client.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

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

function controllerFixture(){
  let current={sessionId:'host-session-a',operation,quality:'standard'};
  const workers=[];
  const controller=createSpatialRoadWorkerController(()=>{
    const listeners=new Map();
    const worker={terminated:false,request:null,
      addEventListener:(name,fn)=>listeners.set(name,fn),
      postMessage(data){this.request=data;},
      terminate(){this.terminated=true;},
      emit(name,data){listeners.get(name)?.(data);}
    };workers.push(worker);return worker;
  },()=>current);
  const input=()=>({sessionId:current.sessionId,operation:current.operation,quality:current.quality,projectJson:JSON.stringify(project)});
  const reply=worker=>({version:1,requestId:worker.request.requestId,sessionId:worker.request.sessionId,
    operation:worker.request.operation,quality:worker.request.quality,result:{status:'refused',operation:worker.request.operation,
      delta:null,basisDelta:null,provisionalAuthorization:null}});
  return {controller,workers,input,reply,change:next=>{current={...current,...next};}};
}

test('SRE worker controller supersedes, cancels and rejects stale accepted binding',async()=>{
  const f=controllerFixture(),first=f.controller(f.input()),w1=f.workers[0];
  const rejected=assert.rejects(first,{name:'AbortError'});
  const second=f.controller(f.input()),w2=f.workers[1];
  await rejected;assert.equal(w1.terminated,true);
  w1.emit('message',{data:f.reply(w1)}); // old task cannot settle new promise
  assert.notEqual(w1.request.requestId,w2.request.requestId);
  f.change({operation:{...operation,revision:2}});
  w2.emit('message',{data:f.reply(w2)});
  await assert.rejects(second,{name:'AbortError'});assert.equal(w2.terminated,true);
  const third=f.controller(f.input()),w3=f.workers[2];
  const thirdRejected=assert.rejects(third,{name:'AbortError'});
  assert.equal(f.controller.invalidate(),true);await thirdRejected;
  assert.equal(w3.terminated,true);assert.equal(f.controller.cancel(),false);
  const fourth=f.controller(f.input()),w4=f.workers[3];
  w4.emit('message',{data:f.reply(w4)});
  assert.equal((await fourth).result.status,'refused');assert.equal(w4.terminated,true);
  f.controller.dispose();await assert.rejects(f.controller(f.input()),/disposed/);
});

test('SRE worker controller fails closed on response mismatch, permission change, crash and decode error',async()=>{
  const f=controllerFixture();
  for(const change of [r=>({...r,requestId:999}),r=>({...r,sessionId:'other'}),
      r=>({...r,quality:'high'}),r=>({...r,result:{...r.result,provisionalAuthorization:{}}})]){
    const p=f.controller(f.input()),w=f.workers.at(-1);
    w.emit('message',{data:change(f.reply(w))});
    await assert.rejects(p);assert.equal(w.terminated,true);
  }
  const p=f.controller(f.input()),w=f.workers.at(-1);
  f.change({operation:{...operation,permissions:{...operation.permissions,destruction:true}}});
  w.emit('message',{data:f.reply(w)});await assert.rejects(p,{name:'AbortError'});
  for(const kind of ['error','messageerror']){
    const p=f.controller(f.input()),w=f.workers.at(-1);w.emit(kind,{message:'test crash'});
    await assert.rejects(p);assert.equal(w.terminated,true);
  }
  const unavailable=createSpatialRoadWorkerController(()=>{throw Error('worker unavailable');},
    ()=>({sessionId:'host-session-a',operation,quality:'standard'}));
  await assert.rejects(unavailable({sessionId:'host-session-a',operation,projectJson:JSON.stringify(project)}),/unavailable/);
});

test('SRE compiled standalone contains syntactically valid independent worker and real transport parity',{timeout:120000},async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  // The builder emits exactly one JSON string literal on its own line.
  // Slice that assignment, then use JSON.parse for the escape grammar rather
  // than attempting to recognize JavaScript string escapes with a regex.
  const marker='const SRE_ROAD_WORKER_SOURCE_V1 = ';
  const assignments=html.split('\n').filter(line=>line.startsWith(marker));
  assert.equal(assignments.length,1,'compiled standalone must embed exactly one dedicated worker');
  const assignment=assignments[0];
  assert.ok(assignment.endsWith(';'),'compiled worker assignment must terminate');
  const source=JSON.parse(assignment.slice(marker.length,-1));
  assert.equal(typeof source,'string');
  assert.ok(source.length>0,'compiled worker source must not be empty');
  new vm.Script(source);
  const worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    globalThis.WorkerGlobalScope=class {};
    globalThis.self=new WorkerGlobalScope();
    self.addEventListener=(_,fn)=>parentPort.on('message',data=>fn({data}));
    self.postMessage=data=>parentPort.postMessage(data);
    (0,eval)(workerData);
  `,{eval:true,workerData:source});
  const input=request();
  try{
    const reply=new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
    worker.postMessage(input);
    const response=await reply;
    assert.equal(response.error,undefined);
    assert.equal(response.result.status,'verified-witness');
    const direct=await searchSpatialUnifiedRoadGroup(project,operation,createSpatialPreservationBudget());
    assert.deepEqual(response.result.delta,direct.delta);
    assert.deepEqual(response.result.basisDelta,direct.basisDelta);
  }finally{await worker.terminate();}
});
