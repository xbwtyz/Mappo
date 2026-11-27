// Development-only: validates evidence, never grants authority or writes GitHub.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const string=v=>typeof v==='string'&&v.trim().length>0;
const strings=v=>Array.isArray(v)&&v.length>0&&v.every(string);
const require=(ok,msg)=>{if(!ok)throw Error(msg);};

// V2 supports active/paused draft work, a ready candidate awaiting CI, and
// verified main after an explicit merge. Evidence is never authorization.
import { completeFullJobs, NODE_SHARDS } from '../ci-full-contract.mjs';
const terminal=x=>x?.status==='completed'&&x.conclusion==='success';
const runStates=['queued','in_progress','completed','requested','waiting','pending'];
function validateV2(c){
  require(c.repository==='xbwtyz/Mappo'&&['active','paused','review-ready','merged'].includes(c.state),'Invalid V2 context.');
  require(string(c.milestone)&&string(c.appVersion)&&string(c.targetVersion),'Missing milestone versions.');
  const s=c.source;
  require(string(s?.branch)&&sha(s.sha)&&sha(s.baseSha)&&positive(s.pr),'Invalid source identity.');
  require(c.state==='merged'?s.branch==='main':s.branch!=='main','Invalid state/branch pairing.');
  if(c.state==='merged')require(sha(s.prHeadSha),'Missing merged PR head.');
  require(strings(c.scope?.approved)&&strings(c.scope.prohibited)&&strings(c.scope.stopConditions),'Missing bounded approval record.');
  for(const k of ['completed','pending','decisions','blockers'])require(Array.isArray(c[k])&&c[k].every(string),'Invalid checkpoint '+k+'.');
  const e=c.evidence;
  require(e&&['unqualified','focused-only','full-pending','full'].includes(e.qualification),'Invalid qualification.');
  if(e.qualification==='focused-only')require(c.state==='active'||c.state==='paused','Focused evidence cannot qualify review or main.');
  if(e.qualification==='full')require(c.state==='review-ready'||c.state==='merged','Full gate needs review-ready or main.');
  if(e.qualification==='full-pending')require(c.state==='review-ready'||c.state==='merged','Invalid pending gate state.');
  for(const k of ['fast','full'])if(e[k]!=null)require(positive(e[k].runId)&&positive(e[k].attempt)&&e[k].head===s.sha,'Invalid exact run reference.');
  if(e.qualification==='focused-only')require(e.fast&&positive(e.fast.jobId)&&positive(e.fast.tests)&&e.fast.passed===e.fast.tests&&e.fast.failed===0,'Missing focused evidence.');
  if(e.qualification.startsWith('full'))require(e.full&&e.full.nodeShards===NODE_SHARDS,'Missing current full gate architecture.');
  require(Array.isArray(e.artifacts)&&e.artifacts.length===2,'Missing artifact pair.');
  const [a,b]=e.artifacts;
  require(a.path==='index.html'&&b.path==='dist/mappo-'+c.appVersion+'.html'&&sha(a.blob)&&a.blob===b.blob,'Artifact parity mismatch.');
  require(sha(c.rollback?.sourceSha)&&string(c.rollback.policy)&&string(c.nextAction),'Missing rollback or next action.');
  return c;
}
function reconstructV2(c,live){
  validateV2(c);
  const s=c.source,e=c.evidence,p=live?.pr,merged=c.state==='merged';
  require(p?.number===s.pr&&live.branchSha===s.sha,'Stale branch or PR.');
  if(merged)require(p.state==='closed'&&p.merged===true&&p.merge_commit_sha===s.sha&&p.head?.sha===s.prHeadSha&&p.base?.ref==='main','Merged PR identity mismatch.');
  else require(p.state==='open'&&p.draft===(c.state!=='review-ready')&&p.head?.ref===s.branch&&p.head?.sha===s.sha&&p.base?.sha===s.baseSha,'Stale or mismatched PR.');
  function checkRun(type){
    const r=live[type+'Run'],ref=e[type],name=type==='fast'?'Mappo Fast Checks':'Mappo CI';
    require(r?.id===ref.runId&&r.name===name&&r.head_sha===s.sha&&r.run_attempt===ref.attempt&&runStates.includes(r.status),'Stale exact-head '+type+' run.');
    if(type==='full')require(merged?r.event==='push'&&r.head_branch==='main':r.event==='pull_request','Wrong full-gate event.');
    return r;
  }
  let qualified='unqualified';
  if(e.qualification==='focused-only'){
    const r=checkRun('fast');
    require(terminal(r)&&Array.isArray(live.fastJobs)&&live.fastJobs.filter(j=>j.id===e.fast.jobId&&j.name==='Build, syntax and targeted Node smoke tests'&&j.run_id===r.id&&j.run_attempt===r.run_attempt&&terminal(j)).length===1,'Focused job not verified.');
    qualified='focused-only';
  }
  if(e.qualification==='full'||e.qualification==='full-pending'){
    const r=checkRun('full');
    if(e.qualification==='full'){
      require(terminal(r)&&completeFullJobs(live.fullJobs,r),'Incomplete mandatory full gate.');
      qualified='full';
    }else{
      require(r.status!=='completed','Pending checkpoint changed; reconstruct with current evidence.');
      qualified='full-pending';
    }
  }
  for(const a of e.artifacts)require(live.artifacts?.[a.path]===a.blob,'Artifact evidence mismatch.');
  return {repository:c.repository,branch:s.branch,sourceSha:s.sha,state:c.state,milestone:c.milestone,
    qualified,completed:c.completed,pending:c.pending,decisions:c.decisions,blockers:c.blockers,
    approvalScope:c.scope,nextAction:c.nextAction,authorizationGranted:false};
}

export function validateDevelopmentCheckpoint(c){
  if(c?.version===2)return validateV2(c);
  require(c?.version===1&&c.repository==='xbwtyz/Mappo','Unsupported checkpoint.');
  require(string(c.milestone)&&string(c.appVersion)&&string(c.targetVersion)&&c.state==='paused','Invalid checkpoint context.');
  require(string(c.source?.branch)&&sha(c.source.sha)&&sha(c.source.baseSha)&&positive(c.source.pr),'Invalid source identity.');
  require(strings(c.scope?.approved)&&strings(c.scope.prohibited)&&strings(c.scope.stopConditions),'Missing bounded approval record.');
  for(const k of ['completed','pending','decisions','blockers'])require(strings(c[k]),'Missing checkpoint '+k+'.');
  const f=c.evidence?.fast,g=c.evidence?.full;
  require(positive(f?.runId)&&positive(f.jobId)&&f.head===c.source.sha&&positive(f.tests)&&f.passed===f.tests&&f.failed===0&&positive(f.durationSeconds),'Missing exact-head focused evidence.');
  require(positive(g?.runId)&&g.head===c.source.sha&&g.qualification==='routing-only','Invalid full CI qualification claim.');
  require(Array.isArray(c.evidence.artifacts)&&c.evidence.artifacts.length===2,'Missing artifact pair.');
  const [a,b]=c.evidence.artifacts;
  require(a.path==='index.html'&&b.path==='dist/mappo-'+c.appVersion+'.html'&&sha(a.blob)&&a.blob===b.blob,'Artifact parity mismatch.');
  require(c.rollback?.sourceSha===c.source.sha&&string(c.rollback.policy)&&string(c.nextAction),'Missing rollback or next action.');
  return c;
}
// Live observation must be independently obtained from GitHub.
export function reconstructDevelopmentCheckpoint(c,live){
  if(c?.version===2)return reconstructV2(c,live);
  validateDevelopmentCheckpoint(c);
  const p=live?.pr;
  require(p?.number===c.source.pr&&p.state==='open'&&p.draft===true&&p.head?.ref===c.source.branch&&p.head?.sha===c.source.sha&&p.base?.sha===c.source.baseSha,'Stale or mismatched pull request.');
  require(live.branchSha===c.source.sha,'Stale branch head.');
  for(const [type,run,name] of [['fast',live.fastRun,'Mappo Fast Checks'],['full',live.fullRun,'Mappo CI']])
    require(run?.id===c.evidence[type].runId&&run.name===name&&run.head_sha===c.source.sha&&run.status==='completed'&&run.conclusion==='success','Missing exact-head '+type+' run.');
  require(Array.isArray(live.fastJobs)&&live.fastJobs.some(j=>j.id===c.evidence.fast.jobId&&j.name==='Build, syntax and targeted Node smoke tests'&&j.status==='completed'&&j.conclusion==='success'),'Focused job not verified.');
  require(Array.isArray(live.fullJobs)&&live.fullJobs.some(j=>j.name==='Resolve full CI request'&&j.conclusion==='success')&&live.fullJobs.some(j=>j.name==='Build, Node tests and browser QA'&&j.conclusion==='skipped')&&live.fullJobs.every(j=>j.name==='Resolve full CI request'||j.conclusion==='skipped'),'Full CI routing-only state changed.');
  for(const a of c.evidence.artifacts)require(live.artifacts?.[a.path]===a.blob,'Artifact evidence mismatch.');
  return {repository:c.repository,branch:c.source.branch,sourceSha:c.source.sha,state:c.state,milestone:c.milestone,qualified:'focused-only',completed:c.completed,pending:c.pending,decisions:c.decisions,blockers:c.blockers,approvalScope:c.scope,nextAction:c.nextAction,authorizationGranted:false};
}
export function fetchCheckpointEvidence(c,fetchJson){
  validateDevelopmentCheckpoint(c);
  const root='repos/'+c.repository;
  const pr=fetchJson(root+'/pulls/'+c.source.pr),ref=fetchJson(root+'/git/ref/heads/'+c.source.branch);
  const fastRun=c.evidence.fast?fetchJson(root+'/actions/runs/'+c.evidence.fast.runId):null,fullRun=c.evidence.full?fetchJson(root+'/actions/runs/'+c.evidence.full.runId):null;
  const jobs=id=>{
    const j=fetchJson(root+'/actions/runs/'+id+'/jobs?per_page=100');
    require(Array.isArray(j.jobs)&&j.total_count===j.jobs.length,'Incomplete job inventory.');
    return j.jobs;
  };
  const tree=fetchJson(root+'/git/trees/'+c.source.sha+'?recursive=1');
  require(tree.truncated===false&&Array.isArray(tree.tree),'Incomplete source tree.');
  return {pr,branchSha:ref.object?.sha,fastRun,fullRun,fastJobs:fastRun?jobs(fastRun.id):[],fullJobs:fullRun?jobs(fullRun.id):[],
    artifacts:Object.fromEntries(tree.tree.filter(a=>c.evidence.artifacts.some(x=>x.path===a.path)).map(a=>[a.path,a.sha]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const c=JSON.parse(readFileSync(process.argv[2],'utf8'));
    const get=path=>JSON.parse(execFileSync('gh',['api','--method','GET',path],{encoding:'utf8',maxBuffer:32*1024*1024}));
    console.log(JSON.stringify(reconstructDevelopmentCheckpoint(c,fetchCheckpointEvidence(c,get)),null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
