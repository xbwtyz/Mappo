import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { createMountedSpatialRoadRecovery } from '../src/editor/spatial-recovery-mounted.js';
import { createSpatialRoadWorkerController } from '../src/editor/spatial-recovery-worker-client.js';
import { installSpatialRoadRecoveryWorker,calculateSpatialRoadReview,calculateSpatialRoadReservationPlan } from '../src/worker/spatial-recovery-worker.js';

function mountedFixture(){
  const host=new SecureIdentityHost(),project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  host.adopt(project);
  const draft={draftRevision:1,roadIds:['RD-0113','RD-0114'],offset:{x:.05,y:0},
    workspace:defaultWorkspace(host.view().project),savedDistrictCount:0};
  const waiters=new Set();
  let mounted;
  const changed=()=>{for(const fn of [...waiters])fn();};
  const wait=phase=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiters.delete(check);reject(Error('Mounted recovery did not reach '+phase));},30000);
    const check=()=>{
      const state=mounted.state;
      if(state?.phase===phase||['error','refused'].includes(state?.phase)){
        clearTimeout(timer);waiters.delete(check);
        if(state.phase!==phase)reject(Error(state.message));else resolve(state);
      }
    };
    waiters.add(check);check();
  });
  const workers=[];
  const makeSearch=(getBinding,options)=>createSpatialRoadWorkerController(()=>{
    let receive,terminated=false;
    const listeners=new Map();
    const worker={
      addEventListener:(name,fn)=>listeners.set(name,fn),
      postMessage:data=>{setTimeout(()=>{if(!terminated)void receive({data});},0);},
      terminate:()=>{terminated=true;},
      get terminated(){return terminated;}
    };
    installSpatialRoadRecoveryWorker({
      addEventListener:(_,fn)=>{receive=fn;},
      postMessage:data=>{if(!terminated)void listeners.get('message')?.({data});}
    });
    workers.push(worker);return worker;
  },getBinding,options);
  mounted=createMountedSpatialRoadRecovery(host,()=>draft,changed,{
    makeSearch,makeVerifier:()=>input=>input.kind==='plan-reservation'?
      calculateSpatialRoadReservationPlan(input):calculateSpatialRoadReview(input)
  });
  return {host,draft,mounted,wait,workers};
}
test('mounted road recovery defaults to preservation, cancels stale work and applies only reviewed result',{timeout:120000},async()=>{
  const {host,draft,mounted,wait,workers}=mountedFixture(),before=host.view();
  assert.deepEqual(mounted.policy.permissions,{alternativeFrontage:false,uniformScaling:false,maxLinearReduction:0,destruction:false,regeneration:false});
  assert.throws(()=>mounted.setPolicy({permissions:{regeneration:true}}),/destruction/);
  assert.throws(()=>mounted.setPolicy({permissions:{destruction:true,regeneration:true},quality:'high'}),/High quality/);
  mounted.setPolicy({permissions:{alternativeFrontage:true}});
  assert.equal(mounted.start(),true);
  mounted.invalidate();draft.draftRevision++;
  assert.equal(workers[0].terminated,true);
  assert.equal(mounted.state,null);
  assert.equal(mounted.policy.permissions.alternativeFrontage,false);
  assert.equal(host.view(),before);
  assert.equal(mounted.start(),true);
  const state=await wait('ready');
  assert.equal(state.geometry.verified,true);
  assert.deepEqual(state.review.summary.retired,[]);
  assert.deepEqual(state.review.summary.added,[]);
  assert.equal(host.view(),before);
  draft.draftRevision++;
  await assert.rejects(()=>mounted.apply(),/No current/);
  assert.equal(host.view(),before);
  mounted.invalidate();
  assert.equal(mounted.start(),true);
  const ready=await wait('ready');
  const result=await mounted.apply();
  assert.deepEqual(result.project,ready.review.candidate);
  assert.equal(host.view().history.length,1);
  assert.equal(host.view().context.revision,1);
  assert.equal(result.historyStatus,'recorded');
  await assert.rejects(()=>mounted.apply(),/No current/);
  mounted.invalidate();
});
