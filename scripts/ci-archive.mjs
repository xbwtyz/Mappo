// Owner-approved archival-only draft gate. Never a full qualification.
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {focusedExecution} from './ci-full-contract.mjs';
const sha=s=>typeof s==='string'&&/^[0-9a-f]{40}$/.test(s)&&!/^0+$/.test(s);
const pos=n=>Number.isSafeInteger(n)&&n>0;
const evidencePath=/^docs\/research\/evidence\/[a-z0-9][a-z0-9-]*\.json$/;
const markdownPath=/^docs\/(?:plans\/0\.3x|research)\/[a-z0-9][a-z0-9-]*\.md$/;
export function archiveRequest(message){
  return typeof message==='string'&&/\[archive-ci\]/i.test(message)&&
    !/\[(?:full-ci(?:-benchmark)?|benchmark-f4|benchmark-c7|acceptance-package)\]/i.test(message);
}
export function archiveRange({head,before,parents,eventName,after,branch,pulls,message,changes}){
  if(!archiveRequest(message)||eventName!=='push'||!sha(head)||!sha(before)||head!==after||
     !Array.isArray(parents)||parents.length!==1||parents[0]!==before||
     !/^(feature|chore|fix|refactor|release)\/.+/.test(branch??'')||
     !Array.isArray(pulls)||pulls.length!==1||pulls[0]?.state!=='open'||pulls[0].draft!==true||pulls[0].head?.sha!==head||
     !Array.isArray(changes)||!changes.length)return false;
  const seen=new Set();
  return changes.every(c=>{
    if(!c||typeof c.path!=='string'||seen.has(c.path)||c.mode!=='100644')return false;
    seen.add(c.path);
    return evidencePath.test(c.path)?c.status==='A':markdownPath.test(c.path)&&['A','M'].includes(c.status);
  });
}
export function priorArchiveSource(run,response,{source,branch,repository}){
  if(!sha(source)||run?.head_sha!==source||run.head_branch!==branch||run.repository?.full_name!==repository||
     run.event!=='push'||run.name!=='Mappo Fast Checks'||run.status!=='completed'||run.conclusion!=='success'||
     !pos(run.id)||!pos(run.run_attempt)||!Array.isArray(response?.jobs)||response.total_count!==response.jobs.length||
     !response.jobs.every(j=>j.head_sha===source&&j.run_id===run.id&&j.run_attempt===run.run_attempt))return null;
  // An archival-only run skips build and focused selection, so it cannot
  // qualify a later archive. No chained or routing-only qualification.
  return focusedExecution(response.jobs,run);
}
function validateTree(v,depth=0,count={n:0}){
  if(++count.n>1500000||depth>64)throw Error('Archive JSON exceeds data limits');
  if(v===null||['string','boolean'].includes(typeof v))return;
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Archive nonfinite number');return;}
  if(typeof v!=='object')throw Error('Archive invalid value');
  for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Archive unsafe key');validateTree(x,depth+1,count);}
}
export function validateArchiveEvidence(data,{source,run,jobs,execution}){
  validateTree(data);
  if(data?.version!==1||data.source!==source||data.run!==run.id||data.attempt!==run.run_attempt||
     data.aggregate!==(execution.completionJobId??execution.jobId)||!pos(data.job)||
     !jobs.some(j=>j.id===data.job&&j.status==='completed'&&j.conclusion==='success'&&
       (execution.shards===1?j.id===execution.jobId:/^Focused Node \(shard \d+\)$/.test(j.name)))||
     !Array.isArray(data.rows)||!data.rows.length)throw Error('Archive evidence source, job or row identity mismatch');
  const ids=data.rows.map(r=>r?.id);
  if(ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw Error('Archive missing or duplicate row IDs');
  return ids;
}
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
function changesFor(before,head){
  const raw=git(['diff','--no-renames','--name-status','-z',before,head,'--']).split('\0').filter(Boolean);
  if(raw.length%2)throw Error('Malformed archive diff');
  const result=[];
  for(let i=0;i<raw.length;i+=2){
    const path=raw[i+1],entry=git(['ls-tree',head,'--',path]);
    result.push({path,status:raw[i],mode:entry.split(' ')[0]});
  }
  return result;
}
function runCLI(env){
  const emit=(archive,reason,extra={})=>{
    appendFileSync(env.GITHUB_OUTPUT,'archive='+archive+'\n');
    console.log('ARCHIVE_CI '+JSON.stringify({version:1,archive,reason,head:env.GITHUB_SHA,...extra}));
  };
  const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  const head=git(['rev-parse','HEAD']).trim(),before=event.before,message=git(['log','-1','--format=%B']);
  if(!archiveRequest(message))return emit(false,'ordinary-push');
  if(!sha(before)||!sha(head)||head!==env.GITHUB_SHA||head!==event.after)return emit(false,'unknown-push-range');
  const parents=git(['show','-s','--format=%P',head]).trim().split(/\s+/);
  if(parents.length!==1||parents[0]!==before)return emit(false,'not-single-parent-push');
  const api=path=>JSON.parse(execFileSync('gh',['api','--method','GET','repos/'+env.GITHUB_REPOSITORY+'/'+path],{encoding:'utf8',maxBuffer:16*1024*1024}));
  let changes,pulls,qualified;
  try{
    changes=changesFor(before,head);
    pulls=api('pulls?state=open&head='+encodeURIComponent(env.GITHUB_REPOSITORY_OWNER+':'+env.GITHUB_REF_NAME)+'&per_page=100');
    if(!archiveRange({head,before,parents,eventName:env.GITHUB_EVENT_NAME,after:event.after,branch:env.GITHUB_REF_NAME,pulls,message,changes}))
      return emit(false,'ineligible-changes-or-pr');
    const list=api('actions/workflows/ci-fast.yml/runs?head_sha='+before+'&status=success&per_page=20');
    for(const run of list.workflow_runs??[]){
      if(!pos(run.id)||!pos(run.run_attempt))continue;
      const response=api('actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
      const execution=priorArchiveSource(run,response,{source:before,branch:env.GITHUB_REF_NAME,repository:env.GITHUB_REPOSITORY});
      if(execution){qualified={run,response,execution};break;}
    }
  }catch(error){console.warn('Archive eligibility unavailable; normal CI retained.');return emit(false,'unavailable-evidence');}
  if(!qualified)return emit(false,'prior-substantive-focused-ci-not-verified');
  // Once eligible, malformed archival evidence is a real failure, not a
  // quiet skip. Historical evidence only; no executable fixture may change.
  const {run,response,execution}=qualified,seen=new Set(),files=[];
  for(const c of changes){
    const bytes=readFileSync(c.path);
    if(bytes.length>8*1024*1024)throw Error('Archive file exceeds limit');
    if(evidencePath.test(c.path)){
      const data=JSON.parse(bytes.toString('utf8'));
      for(const id of validateArchiveEvidence(data,{source:before,run,jobs:response.jobs,execution})){
        if(seen.has(id))throw Error('Duplicate archival row across added evidence');seen.add(id);
      }
      files.push({path:c.path,rows:data.rows.length,job:data.job});
    }
  }
  emit(true,'verified-archive-only',{source:before,sourceRun:run.id,sourceAttempt:run.run_attempt,changes:changes.map(c=>c.path),files});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runCLI(process.env);
