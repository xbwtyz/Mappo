// P3c: read-only diagnostics. Classifications are provisional, never test authority.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {expandResearchManifest,digest} from './contract.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const copy=v=>JSON.parse(JSON.stringify(v));
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const statuses=['success','failure','cancelled','timed_out','skipped','incomplete','action_required'];
export function classifyFailure(status,message=''){
  if(['missing','incomplete','cancelled','skipped','invalid-evidence','action_required'].includes(status))
    return {category:'incomplete-evidence',reason:'Required execution or evidence is missing, canceled, skipped or invalid.'};
  if(['timeout','timed_out'].includes(status)||/ERR_TEST_TIMEOUT|test timed out|exceeded (?:the )?time limit/i.test(message))
    return {category:'timeout',reason:'Explicit timeout status or timeout diagnostic.'};
  if(/Nondeterministic|non.deterministic|fingerprint mismatch across repeat|Input drift/i.test(message))
    return {category:'nondeterminism',reason:'Replay or input consistency assertion.'};
  if(/ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ENOSPC|EAI_AGAIN|ECONNRESET|ENOENT|environment mismatch|source revision mismatch|workflow.*(?:syntax|invalid)|Unknown preservation strategy/i.test(message))
    return {category:'environment-or-setup',reason:'Dependency, environment, configuration or adapter diagnostic.'};
  if(/ERR_ASSERTION|AssertionError|Expected values to be strictly equal|Accepted project mutated|Retirement or new identity/i.test(message))
    return {category:'probable-regression',reason:'Assertion or preservation check failed; reproduce before assigning cause.'};
  return {category:'unclassified',reason:'No sufficient diagnostic pattern; inspect original evidence.'};
}
function diagnostic(status,original,context){
  const message=typeof original==='string'?original:JSON.stringify(original);
  return {status,...classifyFailure(status,message),provisional:true,context:copy(context),original:copy(original)};
}
export function diagnoseResearchReport(m,report){
  const tasks=expandResearchManifest(m);
  need(report?.sourceRevision===m.sourceRevision&&report.manifestDigest===digest(m)&&Array.isArray(report.results)&&typeof report.complete==='boolean','Invalid research report identity.');
  const inventory=new Map(tasks.map(t=>[t.key,t]));
  const failures=[],seen=new Set();
  const runId=report.runId??null,attempt=report.attempt??null;
  const runUrl=typeof runId==='string'&&/^[1-9][0-9]{0,19}$/.test(runId)?'https://github.com/xbwtyz/Mappo/actions/runs/'+runId:null;
  for(const row of report.results){
    need(row&&typeof row.key==='string'&&!seen.has(row.key),'Invalid diagnostic result inventory.');
    seen.add(row.key);
    const t=inventory.get(row.key);
    if(!t){failures.push(diagnostic('invalid-evidence',row,{runId,attempt,runUrl,key:row.key}));continue;}
    if(['verified','refused'].includes(row.status))continue;
    failures.push(diagnostic(row.status,row,{runId,attempt,runUrl,sourceRevision:m.sourceRevision,manifestDigest:digest(m),taskKey:t.key,fixture:t.case,strategy:t.strategy,environment:t.environment,budget:m.budget}));
  }
  for(const t of tasks)if(!seen.has(t.key))failures.push(diagnostic('missing',{key:t.key},{runId,attempt,runUrl,sourceRevision:m.sourceRevision,fixture:t.case,strategy:t.strategy,environment:t.environment,budget:m.budget}));
  for(const fault of report.faults??[])failures.push(diagnostic('invalid-evidence',fault,{runId,attempt,runUrl,sourceRevision:m.sourceRevision}));
  if(report.complete===false&&!failures.length)failures.push(diagnostic('incomplete','Research aggregate incomplete without task diagnostics.',{runId,attempt,runUrl,sourceRevision:m.sourceRevision}));
  return {version:1,kind:'research',sourceRevision:m.sourceRevision,manifestDigest:digest(m),originalComplete:report.complete,originalMatrixResult:report.matrixResult??null,runId,attempt,runUrl,failures,productionAdoptionAuthorized:false};
}
// Original job log and status remain intact. No classification upgrades success/failure.
export function diagnoseCiLog(meta,log){
  need(meta?.repository==='xbwtyz/Mappo'&&/^[a-f0-9]{40}$/.test(meta.sourceRevision)&&nonempty(meta.jobName)&&statuses.includes(meta.conclusion)&&Number.isSafeInteger(meta.runId)&&meta.runId>0&&Number.isSafeInteger(meta.jobId)&&meta.jobId>0,'Invalid CI metadata.');
  need(typeof log==='string'&&Buffer.byteLength(log,'utf8')<=16*1024*1024,'Missing or oversized CI log.');
  const context={...copy(meta),runUrl:'https://github.com/xbwtyz/Mappo/actions/runs/'+meta.runId,jobUrl:'https://github.com/xbwtyz/Mappo/actions/runs/'+meta.runId+'/job/'+meta.jobId};
  const lines=log.split(/\r?\n/);
  const clean=s=>s.replace(/^\d{4}-\d\d-\d\dT\S+\s/,'');
  const failures=[];
  for(let i=0;i<lines.length;i++){
    const line=clean(lines[i]);
    if(/^not ok\s+\d+\b/.test(line)){
      let j=i+1;
      while(j<lines.length&&!/^(?:ok\s+\d+\b|not ok\s+\d+\b|# Subtest:|# tests\s|##\[error\])/.test(clean(lines[j]))&&j-i<200)j++;
      const original=lines.slice(i,j).join('\n');
      failures.push(diagnostic('failure',original,{...context,testName:line.replace(/^not ok\s+\d+\s*-?\s*/,'')}));
      i=j-1;
    }
  }
  const errors=lines.filter(x=>/##\[error\]|^Error:|Error: Unknown preservation strategy|ERR_TEST_TIMEOUT/.test(clean(x)));
  if(meta.conclusion!=='success'&&!failures.length)failures.push(diagnostic(meta.conclusion,errors.length?errors.join('\n'):log,{...context}));
  return {version:1,kind:'ci',sourceRevision:meta.sourceRevision,originalConclusion:meta.conclusion,originalExitCode:meta.exitCode??null,context,failures,originalLog:log,productionAdoptionAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [mode,input,evidence,out]=process.argv.slice(2);
    const meta=JSON.parse(readFileSync(input,'utf8'));
    const raw=readFileSync(evidence,'utf8');
    const report=mode==='research'?diagnoseResearchReport(meta,JSON.parse(raw)):mode==='ci'?diagnoseCiLog(meta,raw):null;
    need(report,'Unknown diagnostics mode.');
    writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({kind:report.kind,failures:report.failures.length,originalConclusion:report.originalConclusion??report.originalComplete}));
    // Diagnostics cannot hide the source failure.
    if(report.kind==='ci'?report.originalConclusion!=='success':!report.originalComplete||report.failures.length>0)process.exitCode=1;
  }catch(e){console.error(e.stack);process.exitCode=1;}
}
