// P3c-b: read-only CI evidence retrieval. Never reclassifies a source run as passed.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {diagnoseCiLog} from './diagnostics.mjs';
const repository='xbwtyz/Mappo',root='repos/'+repository;
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const positive=x=>Number.isSafeInteger(x)&&x>0;
const supported=['Mappo Fast Checks','Mappo CI'];
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const errorText=e=>String(e?.message??e);
export function collectCiDiagnostics(request,reader){
  const {runId,sourceRevision,attempt}=request;
  need(positive(runId)&&positive(attempt)&&sha(sourceRevision),'Invalid exact run/attempt/source request.');
  const run=reader.json(root+'/actions/runs/'+runId+'/attempts/'+attempt);
  need(run?.id===runId&&run.run_attempt===attempt&&run.head_sha===sourceRevision&&run.repository?.full_name===repository&&supported.includes(run.name),'CI run identity mismatch.');
  const report={version:1,repository,sourceRevision,runId,attempt,workflow:run.name,originalStatus:run.status,originalConclusion:run.conclusion??null,runUrl:'https://github.com/'+repository+'/actions/runs/'+runId,evidenceComplete:false,jobs:[],faults:[],productionAdoptionAuthorized:false};
  if(run.status!=='completed'||!run.conclusion){report.faults.push('Source workflow is not complete.');return report;}
  const seen=new Set(),jobs=[];
  // Bound pagination; missing pages cannot qualify.
  for(let page=1;page<=10;page++){
    const data=reader.json(root+'/actions/runs/'+runId+'/attempts/'+attempt+'/jobs?per_page=100&page='+page);
    need(Array.isArray(data.jobs)&&Number.isSafeInteger(data.total_count)&&data.total_count>=0&&data.total_count<=1000,'Invalid CI job inventory.');
    for(const j of data.jobs){
      need(positive(j.id)&&j.run_id===runId&&j.run_attempt===attempt&&j.head_sha===sourceRevision&&!seen.has(j.id),'Stale or duplicate job evidence.');
      seen.add(j.id);jobs.push(j);
    }
    if(jobs.length===data.total_count)break;
    need(data.jobs.length===100&&jobs.length<data.total_count&&page<10,'Incomplete CI job inventory.');
  }
  if(!jobs.length){report.faults.push('No jobs created; inspect workflow configuration and original run annotations.');return report;}
  for(const j of jobs){
    const entry={id:j.id,name:j.name,status:j.status,conclusion:j.conclusion??null,diagnostics:null};
    report.jobs.push(entry);
    if(j.status!=='completed'){report.faults.push('Incomplete job '+j.id);continue;}
    // Skips are visible, not diagnosed as executed failures.
    if(j.conclusion==='success'||j.conclusion==='skipped')continue;
    const meta={repository,sourceRevision,runId,jobId:j.id,jobName:j.name,conclusion:j.conclusion??'incomplete',attempt,exitCode:null};
    try{
      const log=reader.log(root+'/actions/jobs/'+j.id+'/logs');
      need(typeof log==='string'&&log.trim().length>0,'Job log missing or empty.');
      const matches=[...log.matchAll(/Process completed with exit code (\d+)\./g)].map(m=>Number(m[1]));
      if(matches.length)meta.exitCode=matches.at(-1);
      entry.diagnostics=diagnoseCiLog(meta,log);
    }catch(e){
      entry.retrievalError=errorText(e);
      report.faults.push('Original diagnostic evidence unavailable for job '+j.id);
    }
  }
  if(run.conclusion!=='success'&&!report.jobs.some(j=>j.diagnostics))report.faults.push('Failed workflow has no retrieved job failure evidence.');
  report.evidenceComplete=report.faults.length===0;
  return report;
}
export function ciDiagnosticsExitCode(report){
  return report.evidenceComplete&&report.originalStatus==='completed'&&report.originalConclusion==='success'&&report.jobs.every(j=>j.conclusion==='success'||j.conclusion==='skipped')?0:1;
}
export function githubReadOnlyReader(){
  const get=path=>execFileSync('gh',['api','--method','GET',path],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:30000,stdio:['ignore','pipe','pipe']});
  return {json:path=>JSON.parse(get(path)),log:get};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [run,revision,attempt,out]=process.argv.slice(2);
    need(typeof out==='string'&&out.length>0,'New report directory required.');
    const report=collectCiDiagnostics({runId:Number(run),sourceRevision:revision,attempt:Number(attempt)},githubReadOnlyReader());
    mkdirSync(out,{recursive:false});
    writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('DEV_OPT_CI_DIAGNOSTICS '+JSON.stringify({runId:report.runId,sourceRevision:report.sourceRevision,originalConclusion:report.originalConclusion,evidenceComplete:report.evidenceComplete,failures:report.jobs.filter(j=>j.diagnostics).map(j=>({jobId:j.id,conclusion:j.conclusion,exitCode:j.diagnostics.originalExitCode,categories:j.diagnostics.failures.map(f=>f.category)})),faults:report.faults}));
    process.exitCode=ciDiagnosticsExitCode(report);
  }catch(e){console.error(e.stack);process.exitCode=1;}
}
