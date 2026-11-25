// Actual worker-thread transport, existing latest-request-wins controller,
// and independent review-side verification. No browser or production edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject} from '../src/core/city-model.js';
import {createJunctionPreviewControllerP2} from '../src/editor/junction-preview-worker-client.js';
import {prepareRoadGroupIntentB1} from '../src/core/road-intent-c1.js';
import {createRoadRecoveryService,verifyOriginal,verifyHistory,RECOVERY_PROTOCOL} from './helpers/spatial-recovery-road-service.mjs';
import {verifyRegeneration} from './helpers/spatial-recovery-regeneration.mjs';
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const selected=['RD-0184','RD-0186'],delta={x:-3.005274072121821,y:-37.39896113564458};
const capabilities={strategies:['production','pack-fit','frontage-adjacent','targeted-05','targeted-10','targeted-20'],allowRetirement:true,allowRegeneration:true};
const fixture=irregularProperties=>createProject({seed:'mappo-001',size:'medium',morphology:'organic',
  shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
const request=(project,scale,revision,irregularProperties)=>({protocol:RECOVERY_PROTOCOL,project,revision,
  acceptedFingerprint:hash(project),intent:{type:'translate-road-group',roadIds:selected,offset:{x:delta.x*scale,y:delta.y*scale}},
  capabilities:structuredClone(capabilities),regenerationSeed:project.seed+':recovery-r27:'+scale+':'+irregularProperties,
  morphology:irregularProperties?'organic':null});
async function makeHost(t){
  const root=await mkdtemp(join(tmpdir(),'mappo-r30-host-')),workers=[],terminations=[],progress=[];
  let current=null;
  const compute=createJunctionPreviewControllerP2(()=>{
    const w=new Worker(new URL('./helpers/spatial-recovery-worker.mjs',import.meta.url),{env:{...process.env,TMPDIR:root,TEMP:root,TMP:root}});
    const entry={w,terminated:false,request:null};workers.push(entry);
    return {
      addEventListener(type,fn){
        if(type==='message')w.on('message',data=>{
          if(data?.progress){
            if(!entry.terminated&&current&&data.requestId===entry.request?.requestId&&
              data.revision===current.revision&&data.acceptedFingerprint===current.acceptedFingerprint){
              assert.ok(!Object.hasOwn(data.progress,'candidate')&&!Object.hasOwn(data.progress,'project'));
              progress.push(data);
            }
            return;
          }
          fn({data});
        });
        else w.on(type,fn);
      },
      postMessage(data){entry.request=data;w.postMessage(data);},
      terminate(){entry.terminated=true;terminations.push(w.terminate());}
    };
  },{timeoutMs:240000});
  t.after(async()=>{compute.terminate();await Promise.allSettled(terminations);await rm(root,{recursive:true,force:true});});
  return {workers,progress,compute,
    invalidate(){current=null;},
    async submit(input){
      current={revision:input.revision,acceptedFingerprint:input.acceptedFingerprint};
      const result=await compute(input);
      if(!current||result.revision!==current.revision||result.acceptedFingerprint!==current.acceptedFingerprint||
        result.protocol!==RECOVERY_PROTOCOL)throw Error('Stale or unsupported recovery response');
      return result;
    }};
}

// R28 outputs are post-computation assertions only.
const expected=[
  {
    "irregularProperties": false,
    "scale": 0.75,
    "calls": 10,
    "solver": "frontage-adjacent",
    "base": "9ab5d30a59659028faea0f7ad93b2fd1d354ce0b7a36dae18d0ba0c47416e9df",
    "final": "27bcd67d3673ac8fb5638214bb8ceb9c7028fcc3f11e80514bf1cedc78e9cac9",
    "removed": {
      "properties": [],
      "plots": [],
      "buildings": [
        "BLD-00133"
      ]
    },
    "added": {
      "properties": [],
      "plots": [],
      "buildings": [
        "BLD-00439"
      ]
    }
  },
  {
    "irregularProperties": false,
    "scale": 0.025,
    "calls": 1,
    "solver": "production",
    "base": "c08983389f2270eeda6f2ec814909cbb8ac9944388f27ef3d8708efc33331cdf",
    "final": "c08983389f2270eeda6f2ec814909cbb8ac9944388f27ef3d8708efc33331cdf",
    "removed": {
      "properties": [],
      "plots": [],
      "buildings": []
    },
    "added": {
      "properties": [],
      "plots": [],
      "buildings": []
    }
  },
  {
    "irregularProperties": true,
    "scale": -0.5,
    "calls": 34,
    "solver": "targeted-20",
    "base": "951a28ebfbc5e9b9bcd01e31790dc4f261c345373beec536dfd7ac167d8f6152",
    "final": "43f2683df28d63d4dffcc812352eb5f3087bda494450c3103b08c4784f24ff9e",
    "removed": {
      "properties": [],
      "plots": [],
      "buildings": [
        "BLD-00185",
        "BLD-00188"
      ]
    },
    "added": {
      "properties": [],
      "plots": [],
      "buildings": [
        "BLD-00443",
        "BLD-00444"
      ]
    }
  }
];

test('worker pipeline reproduces strict, frontage and scaled recovery with independent host verification',{timeout:600000},async t=>{
  const host=await makeHost(t),verifier=await createRoadRecoveryService(t);
  let revision=0;
  for(const ref of expected){
    const project=fixture(ref.irregularProperties),before=hash(project),input=request(project,ref.scale,++revision,ref.irregularProperties);
    const start=performance.now();let beats=0;
    const timer=setInterval(()=>beats++,10);
    let result;
    try{result=await host.submit(input);}finally{clearInterval(timer);}
    assert.equal(result.status,'candidate-only');assert.equal(result.calls,ref.calls);assert.equal(result.solver,ref.solver);
    assert.equal(result.baseFingerprint,ref.base);assert.equal(result.fingerprint,ref.final);
    assert.deepEqual(result.removed,ref.removed);assert.deepEqual(result.added,ref.added);
    const base=JSON.parse(result.baseJson),candidate=JSON.parse(result.candidateJson);
    assert.equal(hash(base),ref.base);assert.equal(hash(candidate),ref.final);
    const draft=prepareRoadGroupIntentB1(project,selected,input.intent.offset);
    const strategy=verifier.strategies.find(s=>s.id===result.solver);
    verifyOriginal(project,base,draft,result.removed,strategy,selected);
    verifyRegeneration(project,base,candidate,result.removed,result.added);
    verifyHistory(project,candidate,result.removed,selected);
    assert.equal(hash(project),before);assert.ok(beats>0,'Host event loop did not progress');
    console.log('WORKER_RECOVERY_CASE '+JSON.stringify({irregularProperties:ref.irregularProperties,scale:ref.scale,
      calls:result.calls,solver:result.solver,elapsedMs:performance.now()-start,heartbeats:beats,
      payloadBytes:Buffer.byteLength(JSON.stringify(result)),progressEvents:host.progress.filter(p=>p.revision===revision).length,
      fingerprint:result.fingerprint}));
  }
});
test('worker cancellation, stale revision, malformed request and recovery',{timeout:600000},async t=>{
  const host=await makeHost(t),project=fixture(false),before=hash(project);
  const one=host.submit(request(project,1,1,false));
  const aborted=assert.rejects(one,{name:'AbortError'});
  // Wait for genuine first-worker progress, then supersede a busy job.
  const start=performance.now();
  while(!host.progress.some(p=>p.revision===1)){
    if(performance.now()-start>30000)throw Error('No worker progress');
    await new Promise(r=>setTimeout(r,10));
  }
  const two=host.submit(request(project,.025,2,false));
  await aborted;assert.equal(host.workers[0].terminated,true);
  const result=await two;assert.equal(result.status,'candidate-only');assert.equal(result.revision,2);
  const stale=host.submit(request(project,.025,3,false));
  const staleRejected=assert.rejects(stale,/Stale/);host.invalidate();await staleRejected;
  const bad=request(project,.025,4,false);bad.acceptedFingerprint='bad';
  await assert.rejects(host.submit(bad),/fingerprint mismatch/);
  const denied=request(project,.025,5,false);denied.capabilities={strategies:[],allowRetirement:false,allowRegeneration:false};
  const refusal=await host.submit(denied);assert.equal(refusal.status,'refused');assert.equal(refusal.calls,0);
  const again=await host.submit(request(project,.025,6,false));
  assert.equal(again.fingerprint,result.fingerprint);assert.equal(hash(project),before);
  console.log('WORKER_RECOVERY_LIFECYCLE '+JSON.stringify({superseded:true,staleRejected:true,badFingerprintRejected:true,
    deniedCalls:refusal.calls,recovered:true,workers:host.workers.length}));
});
