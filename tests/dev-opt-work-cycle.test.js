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

function v2Checkpoint(state='active',qualification='focused-only'){
  const x=clone(c);x.version=2;x.state=state;x.evidence.qualification=qualification;
  x.evidence.fast.attempt=1;x.evidence.full.attempt=1;
  if(state==='merged'){x.source.branch='main';x.source.prHeadSha='b'.repeat(40);}
  return x;
}
const mandatory=['Resolve full CI request','Node regression (shard 1/2)','Node regression (shard 2/2)',
  'Browser QA (desktop)','Browser QA (roads)','Browser QA (property)','Browser QA (integration)','Build, Node tests and browser QA'];
function v2Live(x){
  const l=observation(),e=x.evidence;
  l.pr.draft=x.state!=='review-ready';
  if(x.state==='merged'){l.pr.state='closed';l.pr.merged=true;l.pr.merge_commit_sha=x.source.sha;l.pr.head.sha=x.source.prHeadSha;l.pr.base.ref='main';}
  l.fastRun.run_attempt=1;l.fullRun.run_attempt=1;l.fullRun.event=x.state==='merged'?'push':'pull_request';l.fullRun.head_branch=x.state==='merged'?'main':x.source.branch;
  l.fastJobs.forEach(j=>Object.assign(j,{run_id:e.fast.runId,run_attempt:1}));
  l.fullJobs=mandatory.map(name=>({name,run_id:e.full.runId,run_attempt:1,status:'completed',conclusion:'success'}));
  return l;
}
test('V2 distinguishes active focused, pending full, ready full, and merged exact-main evidence',()=>{
  for(const [state,qualification] of [['active','focused-only'],['paused','focused-only'],['review-ready','full-pending'],['review-ready','full'],['merged','full'],['active','unqualified']]){
    const x=v2Checkpoint(state,qualification),l=v2Live(x);
    if(qualification==='full-pending'){l.fullRun.status='in_progress';l.fullRun.conclusion=null;}
    const r=reconstructDevelopmentCheckpoint(x,l);
    assert.equal(r.qualified,qualification);assert.equal(r.authorizationGranted,false);
  }
});
test('V2 full gate fails closed on missing, duplicate, skipped, stale or cross-attempt evidence',()=>{
  const x=v2Checkpoint('review-ready','full');
  for(const change of [l=>l.fullJobs.pop(),l=>l.fullJobs.push(l.fullJobs[0]),l=>l.fullJobs[2].conclusion='skipped',
    l=>l.fullJobs[1].run_attempt=2,l=>l.fullRun.run_attempt=2,l=>l.fullRun.head_sha='a'.repeat(40),
    l=>l.fullRun.event='push',l=>l.pr.draft=true,l=>l.pr.base.sha='a'.repeat(40),l=>l.branchSha='a'.repeat(40)]){
    const l=v2Live(x);change(l);assert.throws(()=>reconstructDevelopmentCheckpoint(x,l));
  }
  const p=v2Checkpoint('review-ready','full-pending');assert.throws(()=>reconstructDevelopmentCheckpoint(p,v2Live(p)),/Pending checkpoint changed/);
  const m=v2Checkpoint('merged','full'),live=v2Live(m);live.pr.merge_commit_sha='a'.repeat(40);assert.throws(()=>reconstructDevelopmentCheckpoint(m,live));
});
