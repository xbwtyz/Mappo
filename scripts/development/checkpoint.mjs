// Development-only: validates evidence, never grants authority or writes GitHub.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const string=v=>typeof v==='string'&&v.trim().length>0;
const strings=v=>Array.isArray(v)&&v.length>0&&v.every(string);
const require=(ok,msg)=>{if(!ok)throw Error(msg);};
export function validateDevelopmentCheckpoint(c){
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
  const fastRun=fetchJson(root+'/actions/runs/'+c.evidence.fast.runId),fullRun=fetchJson(root+'/actions/runs/'+c.evidence.full.runId);
  const jobs=id=>{
    const j=fetchJson(root+'/actions/runs/'+id+'/jobs?per_page=100');
    require(Array.isArray(j.jobs)&&j.total_count===j.jobs.length,'Incomplete job inventory.');
    return j.jobs;
  };
  const tree=fetchJson(root+'/git/trees/'+c.source.sha+'?recursive=1');
  require(tree.truncated===false&&Array.isArray(tree.tree),'Incomplete source tree.');
  return {pr,branchSha:ref.object?.sha,fastRun,fullRun,fastJobs:jobs(fastRun.id),fullJobs:jobs(fullRun.id),
    artifacts:Object.fromEntries(tree.tree.filter(a=>c.evidence.artifacts.some(x=>x.path===a.path)).map(a=>[a.path,a.sha]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const c=JSON.parse(readFileSync(process.argv[2],'utf8'));
    const get=path=>JSON.parse(execFileSync('gh',['api','--method','GET',path],{encoding:'utf8',maxBuffer:32*1024*1024}));
    console.log(JSON.stringify(reconstructDevelopmentCheckpoint(c,fetchCheckpointEvidence(c,get)),null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
