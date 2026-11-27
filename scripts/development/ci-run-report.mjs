// Read-only completed-run evidence. Never changes source status or grants approval.
import {readFileSync, mkdirSync, writeFileSync, appendFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {collectCiDiagnostics,githubReadOnlyReader} from './research/ci-diagnostics.mjs';
import {completeFullJobs,focusedExecution,NODE_SHARDS} from '../ci-full-contract.mjs';
import {summarizeDevelopmentMetrics} from './metrics.mjs';
const repo='xbwtyz/Mappo',root='repos/'+repo;
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const positive=n=>Number.isSafeInteger(n)&&n>0;
const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const duration=(a,b)=>{const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)&&y>=x?(y-x)/1000:null;};
const clean=s=>String(s??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/[<>&|]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;','|':'&#124;'}[x])).slice(0,240);
export function buildRunReport(request,reader){
  const source=collectCiDiagnostics(request,reader);
  const run=reader.json(root+'/actions/runs/'+request.runId+'/attempts/'+request.attempt);
  need(run.id===source.runId&&run.run_attempt===source.attempt&&run.head_sha===source.sourceRevision&&run.repository?.full_name===repo&&run.name===source.workflow&&run.status===source.originalStatus&&run.conclusion===source.originalConclusion,'Run changed while reading evidence');
  const jobs=source.jobs,success=source.evidenceComplete&&run.status==='completed'&&run.conclusion==='success';
  const focused=success&&run.name==='Mappo Fast Checks'?focusedExecution(jobs,run):null;
  const full=success&&run.name==='Mappo CI'&&completeFullJobs(jobs,run);
  const mode=focused?'focused-only':full?'full-job-set':success?'routing-or-unverified':'unqualified';
  const timed=jobs.filter(j=>j.conclusion!=='skipped').map(j=>({id:j.id,name:j.name,seconds:duration(j.startedAt,j.completedAt),conclusion:j.conclusion}));
  const valid=timed.filter(j=>j.seconds!==null).sort((a,b)=>b.seconds-a.seconds||a.id-b.id);
  const wallSeconds=duration(run.run_started_at??run.created_at,run.updated_at);
  const performance={wallSeconds,runnerMinutes:valid.length===timed.length&&valid.length?valid.reduce((n,j)=>n+j.seconds,0)/60:null,
    missingRunnerTimings:timed.length-valid.length,longestJobs:valid.slice(0,5),executedJobs:timed.length,focusedShards:focused?.shards??null};
  let branchTip=null,pr=null;const observationFaults=[];
  try{
    const ref=reader.json(root+'/git/ref/heads/'+encodeURIComponent(run.head_branch));
    if(sha(ref.object?.sha))branchTip=ref.object.sha;
    else observationFaults.push('Branch tip unavailable.');
  }catch{observationFaults.push('Branch tip unavailable.');}
  const ids=[...new Set((run.pull_requests??[]).filter(p=>positive(p.number)).map(p=>p.number))];
  if(ids.length===1){
    try{
      const p=reader.json(root+'/pulls/'+ids[0]);
      need(p.number===ids[0]&&p.head?.repo?.full_name===repo,'PR identity mismatch');
      pr={number:p.number,state:p.state,draft:p.draft,head:p.head.sha,base:p.base?.sha,merged:p.merged===true,mergeCommit:p.merge_commit_sha??null};
    }catch{observationFaults.push('PR identity unavailable.');}
  }else if(ids.length>1)observationFaults.push('Multiple associated PRs; no automatic selection.');
  const isCurrent=branchTip===source.sourceRevision&&(!pr||pr.state==='open'&&pr.head===source.sourceRevision);
  // A full job set is evidence only: merge-ref tree binding and explicit approval
  // are separate review obligations. Never claim an accepted or merged state here.
  const handoff={repository:repo,branch:run.head_branch,sourceRevision:source.sourceRevision,branchTip,pr,sourceRun:source.runUrl,
    currentObservation:isCurrent,evidence:mode,observationFaults,authorizationGranted:false,
    nextAction:!isCurrent?'Reconstruct current branch and PR before continuing.':!success?'Inspect original failure or incomplete evidence; do not qualify.':focused?'Continue only within existing approved scope; full qualification remains mandatory.':full?'Verify exact merge-ref/main tree and separate owner approval before any merge or publishing.':'Inspect routing and job inventory; no qualification.'};
  const metricsInput={version:2,runs:[{runId:run.id,attempt:run.run_attempt,kind:run.name==='Mappo Fast Checks'?'fast-draft':'full-main',
    nodeShards:NODE_SHARDS,head:run.head_sha,status:run.status,conclusion:run.conclusion,createdAt:run.run_started_at??run.created_at,updatedAt:run.updated_at,jobs}]};
  // Do not misclassify PR/full diagnostics as main metrics.
  const metrics=run.name==='Mappo Fast Checks'||run.name==='Mappo CI'&&run.event==='push'&&run.head_branch==='main'?summarizeDevelopmentMetrics(metricsInput):null;
  return {version:1,source,performance,handoff,metricsInput:metrics?metricsInput:null,metrics};
}
export function renderRunSummary(r){
  const s=r.source,p=r.performance,h=r.handoff;
  const lines=['# Mappo CI evidence','', 'Source: '+s.runUrl+' (attempt '+s.attempt+')','Revision: '+s.sourceRevision,'Original result: '+clean(s.originalConclusion),'Evidence: '+clean(h.evidence),'Wall seconds: '+(p.wallSeconds??'unknown'),'Runner minutes: '+(p.runnerMinutes===null?'unknown':p.runnerMinutes.toFixed(2)), 'Current branch observation: '+(h.currentObservation?'matches':'stale or unavailable'),'','## Longest jobs',''];
  for(const j of p.longestJobs)lines.push('- '+clean(j.name)+': '+j.seconds+'s ('+clean(j.conclusion)+')');
  lines.push('','## Failure diagnostics (provisional)','');
  for(const j of s.jobs.filter(j=>j.conclusion!=='success'&&j.conclusion!=='skipped')){
    lines.push('- '+clean(j.name)+': '+clean(j.conclusion)+' — '+s.runUrl+'/job/'+j.id);
    for(const f of j.diagnostics?.failures??[])lines.push('  - '+clean(f.context?.testName??'Job error')+' — '+clean(f.category));
  }
  for(const f of [...s.faults,...h.observationFaults])lines.push('- Evidence limitation: '+clean(f));
  lines.push('','## Handoff', '',clean(h.nextAction),'No merge, release or production adoption authorization is granted.');
  return lines.join('\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
    let request;
    if(process.env.GITHUB_EVENT_NAME==='workflow_run'){
      const r=event.workflow_run;
      need(r?.repository?.full_name===repo&&r.head_repository?.full_name===repo,'Untrusted source repository');
      request={runId:r.id,sourceRevision:r.head_sha,attempt:r.run_attempt};
    }else{
      const [runId,sourceRevision,attempt]=process.argv.slice(2);
      request={runId:Number(runId),sourceRevision,attempt:Number(attempt)};
    }
    const out=process.env.REPORT_DIR;
    need(out&&positive(request.runId)&&positive(request.attempt)&&sha(request.sourceRevision),'Invalid report request');
    const report=buildRunReport(request,githubReadOnlyReader());
    mkdirSync(dirname(out),{recursive:true});
    mkdirSync(out,{recursive:false});
    const markdown=renderRunSummary(report);
    writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    writeFileSync(join(out,'HANDOFF.md'),markdown,{flag:'wx'});
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown);
    console.log('DEV_OPT_RUN_REPORT '+JSON.stringify({runId:report.source.runId,attempt:report.source.attempt,source:report.source.sourceRevision,originalConclusion:report.source.originalConclusion,evidence:report.handoff.evidence,wallSeconds:report.performance.wallSeconds,runnerMinutes:report.performance.runnerMinutes,focusedShards:report.performance.focusedShards,diagnosedJobs:report.source.jobs.filter(j=>j.diagnostics).length,current:report.handoff.currentObservation}));
    // A diagnostic report can succeed independently; the source result is unchanged.
    if(!report.source.evidenceComplete)process.exitCode=1;
  }catch(e){console.error(e.message);process.exitCode=1;}
}
