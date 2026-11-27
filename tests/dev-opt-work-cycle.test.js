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
  x.evidence.fast.attempt=1;x.evidence.full.attempt=1;x.evidence.full.nodeShards=16;
  if(state==='merged'){x.source.branch='main';x.source.prHeadSha='b'.repeat(40);}
  return x;
}
const mandatory=['Resolve full CI request',...Array.from({length:16},(_,i)=>'Node regression (shard '+(i+1)+'/16)'),
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

test('manual acceptance package is deterministic, exact-source bound, and never claims manual success',async()=>{
  const {buildAcceptancePackage,verifyAcceptancePackage,writeAcceptancePackage}=await import('../scripts/development/manual-acceptance.mjs');
  const {decodeProjectDocument}=await import('../src/data/project-format.js');
  const {mkdtempSync,rmSync,readdirSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const source='d'.repeat(40),html=readFileSync(new URL('../index.html',import.meta.url));
  const {APP_VERSION}=await import('../src/core/version.js');
  const currentDist=readFileSync(new URL('../dist/mappo-'+APP_VERSION+'.html',import.meta.url));
  const input={source,prHead:'e'.repeat(40),html,distHtml:currentDist};
  const first=buildAcceptancePackage(input),second=buildAcceptancePackage(input);
  assert.deepEqual(first,second);
  assert.equal(verifyAcceptancePackage(first,source),true);
  assert.equal(first.manifest.manualStatus,'not-run');
  for(const id of ['regular','irregular']){
    const doc=decodeProjectDocument(first.files[id+'.mappo.json'].toString('utf8'));
    assert.equal(doc.project.schemaVersion,first.manifest.projectSchema);
    assert.ok(['RD-0184','RD-0186'].every(r=>doc.project.city.roads.some(x=>x.id===r)));
  }
  assert.match(first.files['CHECKLIST.md'].toString('utf8'),/SRE is detached/);
  assert.throws(()=>buildAcceptancePackage({...input,distHtml:Buffer.from('wrong')}));
  assert.throws(()=>verifyAcceptancePackage(first,'a'.repeat(40)));
  const bad={manifest:structuredClone(first.manifest),files:{...first.files}};
  bad.manifest.manualStatus='pass';assert.throws(()=>verifyAcceptancePackage(bad,source));
  bad.manifest.manualStatus='not-run';bad.files['index.html']=Buffer.from('tampered');assert.throws(()=>verifyAcceptancePackage(bad,source));
  const dir=mkdtempSync(join(tmpdir(),'mappo-manual-'));
  try{
    writeAcceptancePackage(dir,first);
    assert.equal(readdirSync(dir).length,7);
    assert.throws(()=>writeAcceptancePackage(dir,first),/new or empty/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('V2 current full checkpoint and V2 metrics cannot qualify a missing sixteenth shard',()=>{
  const x=v2Checkpoint('review-ready','full'),l=v2Live(x);
  l.fullJobs=l.fullJobs.filter(j=>j.name!=='Node regression (shard 16/16)');
  assert.throws(()=>reconstructDevelopmentCheckpoint(x,l),/Incomplete mandatory/);
  const legacy=clone(x);legacy.evidence.full.nodeShards=2;
  assert.throws(()=>validateDevelopmentCheckpoint(legacy),/current full gate/);
  const good=v2Live(x);
  const run={runId:x.evidence.full.runId,attempt:1,nodeShards:16,kind:'full-main',head:x.source.sha,status:'completed',conclusion:'success',
    createdAt:'2026-11-27T00:00:00Z',updatedAt:'2026-11-27T00:05:00Z',jobs:good.fullJobs};
  assert.equal(summarizeDevelopmentMetrics({version:2,runs:[run]})['full-main-16-node'].qualified,1);
  assert.equal(summarizeDevelopmentMetrics({version:2,runs:[{...run,jobs:l.fullJobs}]})['full-main-16-node'].incomplete,1);
});

test('adaptive focused evidence requires substantive execution, same attempt and actual completeness',async()=>{
  const {focusedExecution,FAST_JOB,FAST_COMPLETE}=await import('../scripts/ci-full-contract.mjs');
  const run={id:42,run_attempt:1};
  const job=(id,name,names)=>({id,name,run_id:42,run_attempt:1,status:'completed',conclusion:'success',steps:names.map(name=>({name,conclusion:'success'}))});
  const base=job(1,FAST_JOB,['Select exact-push incremental checks','Build and verify offline standalone parity']);
  assert.equal(focusedExecution([base],run),null);
  const light=clone(base);light.steps.push({name:'Run smoke tests and directly modified Node tests',conclusion:'success'});
  assert.equal(focusedExecution([light],run).shards,1);
  const first=clone(base);first.steps.push({name:'Retain exact focused execution plan',conclusion:'success'});
  const jobs=[first,job(2,'Focused Node (shard 1)',['Run assigned focused tests']),job(3,'Focused Node (shard 2)',['Run assigned focused tests']),job(4,FAST_COMPLETE,['Verify exact selected inventory and all shard reports'])];
  assert.deepEqual(focusedExecution(jobs,run),{shards:2,jobId:1,completionJobId:4});
  for(const change of [x=>x.pop(),x=>x[1].run_attempt=2,x=>x[2].conclusion='skipped',x=>x[3].steps=[],x=>x[2].name=x[1].name]){
    const bad=clone(jobs);change(bad);assert.equal(focusedExecution(bad,run),null);
  }
  const x=v2Checkpoint(),l=v2Live(x);
  x.evidence.fast.shards=2;x.evidence.fast.jobId=1;x.evidence.fast.completionJobId=4;x.evidence.fast.runId=42;
  l.fastRun.id=42;l.fastJobs=jobs;
  assert.equal(reconstructDevelopmentCheckpoint(x,l).qualified,'focused-only');
  l.fastJobs=jobs.slice(0,-1);assert.throws(()=>reconstructDevelopmentCheckpoint(x,l),/Incomplete focused/);
});
test('read-only CI run report retains original failure, timing and stale handoff without authority',async()=>{
  const {buildRunReport,renderRunSummary}=await import('../scripts/development/ci-run-report.mjs');
  const req={runId:42,sourceRevision:'a'.repeat(40),attempt:1};
  const run={id:42,run_attempt:1,head_sha:req.sourceRevision,repository:{full_name:'xbwtyz/Mappo'},name:'Mappo Fast Checks',head_branch:'chore/test',event:'push',status:'completed',conclusion:'failure',
    run_started_at:'2026-11-27T00:00:00Z',updated_at:'2026-11-27T00:01:00Z',pull_requests:[{number:162}]};
  const j={id:43,name:'Build, syntax and targeted Node smoke tests',run_id:42,run_attempt:1,head_sha:req.sourceRevision,status:'completed',conclusion:'failure',started_at:run.run_started_at,completed_at:run.updated_at,steps:[]};
  const raw='not ok 1 - bad fixture\n  error: ERR_ASSERTION\n##[error]Process completed with exit code 1.';
  const reader={json:path=>path.includes('/jobs?')?{total_count:1,jobs:[j]}:path.includes('/git/ref/')?{object:{sha:'b'.repeat(40)}}:path.includes('/pulls/')?{number:162,state:'open',draft:true,head:{sha:'b'.repeat(40),repo:{full_name:'xbwtyz/Mappo'}},base:{sha:'c'.repeat(40)}}:run,log:()=>raw};
  const result=buildRunReport(req,reader);
  assert.equal(result.source.originalConclusion,'failure');assert.equal(result.source.jobs[0].diagnostics.originalLog,raw);
  assert.equal(result.performance.wallSeconds,60);assert.equal(result.performance.runnerMinutes,1);
  assert.equal(result.handoff.currentObservation,false);assert.equal(result.handoff.authorizationGranted,false);
  assert.equal(result.metrics['fast-draft'].failed,1);
  assert.match(renderRunSummary(result),/bad fixture/);assert.match(renderRunSummary(result),/probable-regression/);
  const workflow=readFileSync(new URL('../.github/workflows/ci-evidence.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_run:/);assert.match(workflow,/actions: read/);assert.doesNotMatch(workflow,/: write\b/);
  assert.doesNotMatch(workflow,/ref: .*workflow_run\.head_sha/);
});

test('actual historical adaptive checkpoint is structurally valid without granting authority',()=>{
  const record=JSON.parse(readFileSync(new URL('../docs/development/checkpoints/dev-opt-pr162-adaptive-qualified.json',import.meta.url),'utf8'));
  assert.equal(validateDevelopmentCheckpoint(record),record);
  assert.equal(record.evidence.fast.shards,2);
  assert.equal(record.evidence.fast.tests,130);
});

test('rolling performance history separates incomplete, failed, historical and current runs',async()=>{
  const {collectRollingMetrics}=await import('../scripts/development/ci-run-report.mjs');
  const {mandatoryJobNames,FAST_JOB}=await import('../scripts/ci-full-contract.mjs');
  const common={run_attempt:1,head_sha:'a'.repeat(40),repository:{full_name:'xbwtyz/Mappo'},event:'push',status:'completed',conclusion:'success',run_started_at:'2026-11-27T00:00:00Z',updated_at:'2026-11-27T00:02:00Z'};
  const fast=[{...common,id:1,name:'Mappo Fast Checks',head_branch:'chore/test'},{...common,id:2,name:'Mappo Fast Checks',head_branch:'chore/test',conclusion:'failure'},{...common,id:3,name:'Mappo Fast Checks',head_branch:'chore/test'}];
  const full=[{...common,id:4,name:'Mappo CI',head_branch:'main'},{...common,id:5,name:'Mappo CI',head_branch:'main'}];
  const jobs=(run,names)=>names.map((name,i)=>({id:run.id*100+i+1,name,run_id:run.id,run_attempt:1,head_sha:run.head_sha,status:'completed',conclusion:'success',started_at:run.run_started_at,completed_at:run.updated_at,steps:['Select exact-push incremental checks','Build and verify offline standalone parity','Run smoke tests and directly modified Node tests'].map(name=>({name,conclusion:'success'}))}));
  const reader={json:path=>{
    if(path.includes('/workflows/ci-fast.yml/'))return {workflow_runs:fast};
    if(path.includes('/workflows/ci.yml/'))return {workflow_runs:full};
    const id=Number(path.match(/runs\/(\d+)\//)[1]),run=[...fast,...full].find(x=>x.id===id);
    const rows=jobs(run,id===4?mandatoryJobNames(2):id===5?mandatoryJobNames():[FAST_JOB]);
    if(id===3)rows[0].steps=[];
    return {total_count:rows.length,jobs:rows};
  }};
  const r=collectRollingMetrics(reader);
  assert.equal(r.faults.length,0);
  assert.equal(r.groups['fast-draft'].qualified,1);
  assert.equal(r.groups['fast-draft'].failed,1);
  assert.equal(r.groups['fast-draft'].unqualified,1);
  assert.equal(r.groups['historical-full-main-2-node'].qualified,1);
  assert.equal(r.groups['full-main-16-node'].qualified,1);
  assert.equal(r.groups['full-main-16-node'].wallSeconds.median,120);
  assert.throws(()=>collectRollingMetrics(reader,{limit:100}));
});
