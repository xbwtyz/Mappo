// Fixed child-process runner; no shell, custom command, repository writes or auto-adoption.
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {expandResearchManifest,aggregateResearch,digest} from './contract.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const worker=fileURLToPath(new URL('./lare-worker.mjs',import.meta.url));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
export function assertResearchSource(m){
  if(git(['rev-parse','HEAD'])!==m.sourceRevision)throw Error('Research source revision mismatch.');
  if(git(['status','--porcelain','--untracked-files=all','--','src','scripts','tests','package.json','docs/development/research']))throw Error('Research source is dirty.');
  if(Number(process.versions.node.split('.')[0])!==m.environment.nodeMajor||process.platform!==m.environment.platform)throw Error('Research environment mismatch.');
}
export function executeResearchTask(task,timeoutMs){
  return new Promise(resolve=>{
    const identity={key:task.key,sourceRevision:task.sourceRevision,manifestDigest:task.manifestDigest,inputDigest:digest(task)};
    const child=spawn(process.execPath,[worker],{cwd:root,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',TZ:'UTC'}});
    let out='',err='',timedOut=false,overflow=false,spawnError=null;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
    const collect=(current,chunk)=>{const next=current+chunk;if(next.length>1024*1024){overflow=true;child.kill('SIGKILL');return next.slice(0,1024*1024);}return next;};
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{out=collect(out,chunk);});
    child.stderr.on('data',chunk=>{err=collect(err,chunk);});
    child.on('error',e=>{spawnError=e.message;});
    child.stdin.on('error',()=>{});
    child.on('close',(code,signal)=>{
      clearTimeout(timer);
      const diagnostic={exitCode:code,signal,stderr:err,stdout:out,spawnError,overflow};
      if(timedOut)return resolve({...identity,status:'timeout',diagnostic});
      if(code!==0||spawnError||overflow)return resolve({...identity,status:'failed',diagnostic});
      try{const row=JSON.parse(out);resolve(row.key===identity.key?row:{...identity,status:'incomplete',diagnostic});}
      catch(e){resolve({...identity,status:'incomplete',diagnostic:{...diagnostic,parseError:e.message}});}
    });
    child.stdin.end(JSON.stringify(task));
  });
}
export async function runResearch(m){
  const tasks=expandResearchManifest(m);assertResearchSource(m);
  const rows=new Array(tasks.length);let next=0;
  await Promise.all(Array.from({length:Math.min(tasks.length,m.budget.concurrency)},async()=>{
    for(;;){const i=next++;if(i>=tasks.length)return;rows[i]=await executeResearchTask(tasks[i],m.budget.timeoutMs);}
  }));
  assertResearchSource(m);
  return aggregateResearch(m,rows);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const m=JSON.parse(readFileSync(process.argv[2],'utf8'));
    const report=await runResearch(m);
    // Explicit new output path only; never overwrite prior evidence.
    writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(report.summary));if(!report.complete)process.exitCode=1;
  }catch(e){console.error(e.stack);process.exitCode=1;}
}
