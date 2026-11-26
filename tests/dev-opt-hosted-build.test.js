import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHostedBuildTransfer,verifyHostedTransferQualification} from '../scripts/development/hosted-build-transfer.mjs';
const s='a'.repeat(40),g='b'.repeat(40),d='c'.repeat(40),t='d'.repeat(40),h='e'.repeat(40),blob='f'.repeat(40);
const dist='dist/mappo-0.2.25-dev.html',branch='chore/build-transfer-qualification';
function evidence(){return {request:{sha:s,tree:t,branch:'build/standalone/p2-qualification',version:'0.2.25-dev'},run:{id:42,name:'Mappo Hosted Standalone Build',head_sha:s,head_branch:'build/standalone/p2-qualification',status:'completed',conclusion:'success'},jobs:['compile','record'].map(name=>({name,run_id:42,status:'completed',conclusion:'success'})),generated:{sha:g,parents:[s]},scratchHead:g,destination:{sha:d,currentSha:d,tree:t,branch},comparison:{ahead_by:1,behind_by:0,base_commit:{sha:s},files:[{filename:'index.html',status:'modified'},{filename:dist,status:'modified'}]},blobs:{'index.html':blob,[dist]:blob}};}
test('DEV-OPT hosted transfer binds both source trees, generated parent, run and paths',()=>{
  const p=validateHostedBuildTransfer(evidence());assert.equal(p.authorizationGranted,false);assert.equal(p.files.length,2);assert.equal(p.requiredExactDestinationCI,true);
  for(const change of [x=>x.destination.currentSha=h,x=>x.destination.tree=h,x=>x.generated.parents=[d],x=>x.scratchHead=s,x=>x.jobs[1].conclusion='skipped',x=>x.run.head_sha=d,x=>x.comparison.files.push({filename:'src/core/version.js',status:'modified'}),x=>x.blobs[dist]=h,x=>x.comparison.files[0].status='removed',x=>x.request.version='0.2.26-dev']){
    const e=evidence();change(e);assert.throws(()=>validateHostedBuildTransfer(e));
  }
});
test('DEV-OPT hosted transfer is not qualified without actual exact destination Fast Checks',()=>{
  const p=validateHostedBuildTransfer(evidence());
  const o={head:h,currentSha:h,parent:d,branch,changedPaths:['index.html',dist],blobs:evidence().blobs,fastRun:{id:43,name:'Mappo Fast Checks',head_sha:h,status:'completed',conclusion:'success'},fastJobs:[{name:'Build, syntax and targeted Node smoke tests',run_id:43,status:'completed',conclusion:'success'}]};
  const r=verifyHostedTransferQualification(p,o);assert.equal(r.focusedQualified,true);assert.equal(r.fullQualified,false);assert.equal(r.mergeAuthorized,false);
  for(const change of [x=>x.fastRun.head_sha=s,x=>x.fastRun.conclusion='failure',x=>x.fastJobs[0].conclusion='skipped',x=>x.changedPaths.push('src/core/version.js'),x=>x.blobs[dist]=d,x=>x.currentSha=g]){const x=structuredClone(o);change(x);assert.throws(()=>verifyHostedTransferQualification(p,x));}
});
