import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDevelopmentCheckpoint,reconstructDevelopmentCheckpoint,fetchCheckpointEvidence} from '../scripts/development/checkpoint.mjs';
import {summarizeDevelopmentMetrics} from '../scripts/development/metrics.mjs';
const c=JSON.parse(readFileSync(new URL('../docs/development/checkpoints/sre-e2-paused.json',import.meta.url)));
const evidence=JSON.parse(readFileSync(new URL('../docs/development/metrics/p0-baseline.json',import.meta.url)));
const clone=x=>JSON.parse(JSON.stringify(x));
function observation(){
  const good={status:'completed',conclusion:'success'};
  return {pr:{number:c.source.pr,state:'open',draft:true,head:{ref:c.source.branch,sha:c.source.sha},base:{sha:c.source.baseSha}},
    branchSha:c.source.sha,fastRun:{...good,name:'Mappo Fast Checks',id:c.evidence.fast.runId,head_sha:c.source.sha},
    fullRun:{...good,name:'Mappo CI',id:c.evidence.full.runId,head_sha:c.source.sha},
    fastJobs:[{...good,id:c.evidence.fast.jobId,name:'Build, syntax and targeted Node smoke tests'}],
    fullJobs:[{...good,name:'Resolve full CI request'},{status:'completed',conclusion:'skipped',name:'Build, Node tests and browser QA'}],
    artifacts:Object.fromEntries(c.evidence.artifacts.map(a=>[a.path,a.blob]))};
}
test('DEV-OPT persisted checkpoint reconstructs a paused focused-only handoff without authority',()=>{
  const before=JSON.stringify(c);assert.equal(validateDevelopmentCheckpoint(c),c);
  const r=reconstructDevelopmentCheckpoint(c,observation());assert.equal(r.state,'paused');assert.equal(r.qualified,'focused-only');assert.equal(r.authorizationGranted,false);assert.deepEqual(r.pending,c.pending);assert.equal(JSON.stringify(c),before);
});
test('DEV-OPT rejects stale refs, changed base, missing jobs, bad claims and artifact drift',()=>{
  for(const change of [x=>x.branchSha='a'.repeat(40),x=>x.pr.head.sha='a'.repeat(40),x=>x.pr.base.sha='b'.repeat(40),x=>x.fastRun.head_sha='a'.repeat(40),x=>x.fastRun.name='Mappo CI',x=>x.fastJobs=[],x=>x.fullJobs[1].conclusion='success',x=>x.artifacts['index.html']='a'.repeat(40)]){
    const live=observation();change(live);assert.throws(()=>reconstructDevelopmentCheckpoint(c,live));
  }
  const bad=clone(c);bad.evidence.full.qualification='full';assert.throws(()=>validateDevelopmentCheckpoint(bad));
  const empty=clone(c);empty.scope.approved=[];assert.throws(()=>validateDevelopmentCheckpoint(empty));
});
test('DEV-OPT evidence loader rejects incomplete paginated job data',()=>{
  const live=observation();const get=path=>{
    if(path.includes('/pulls/'))return live.pr;
    if(path.includes('/git/ref/'))return {object:{sha:live.branchSha}};
    if(path.includes('/jobs?'))return {total_count:2,jobs:[live.fastJobs[0]]};
    if(path.includes('/actions/runs/'))return path.endsWith(String(c.evidence.fast.runId))?live.fastRun:live.fullRun;
    return {truncated:false,tree:c.evidence.artifacts.map(a=>({path:a.path,sha:a.blob}))};
  };assert.throws(()=>fetchCheckpointEvidence(c,get),/Incomplete job/);
});
test('DEV-OPT real baseline separates full CI from focused workflow-only evidence and keeps failures visible',()=>{
  const r=summarizeDevelopmentMetrics(evidence);
  assert.equal(r['full-main'].total,8);assert.equal(r['full-main'].qualified,8);
  assert.equal(r['fast-draft'].total,9);assert.equal(r['fast-draft'].qualified,1);assert.equal(r['fast-draft'].workflowOnly,7);assert.equal(r['fast-draft'].failed,1);
  assert.equal(r['full-main'].wallSeconds.median,308.5);assert.equal(r['full-main'].wallSeconds.p90,398);
  assert.equal(r['full-main'].runnerMinutes.n,1);assert.equal(r['full-main'].missingRunnerTiming,7);
  const bad=clone(evidence);bad.runs[0].jobs=bad.runs[0].jobs.filter(j=>j.name!=='Browser QA (roads)');assert.equal(summarizeDevelopmentMetrics(bad)['full-main'].incomplete,1);
  const dup=clone(evidence);dup.runs.push(dup.runs[0]);assert.throws(()=>summarizeDevelopmentMetrics(dup),/duplicate/);
});
