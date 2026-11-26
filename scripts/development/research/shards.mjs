// P3b: fixed two-runner research pilot. No repository writes or publishing.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateResearchManifest,expandResearchManifest,aggregateResearch,digest} from './contract.mjs';
import {assertResearchSource,executeResearchTask} from './runner.mjs';
import {diagnoseResearchReport} from './diagnostics.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const validRun=x=>typeof x==='string'&&/^[1-9][0-9]{0,19}$/.test(x);
export const shardCount=2;
export function shardTasks(m,index){
  need(Number.isInteger(index)&&index>=0&&index<shardCount,'Invalid shard index.');
  need(m.budget.concurrency===shardCount,'Pilot requires exact global concurrency 2.');
  return expandResearchManifest(m).filter((_,i)=>i%shardCount===index);
}
export function makeShardEnvelope(m,index,identity,rows){
  const tasks=shardTasks(m,index);
  need(validRun(identity.runId)&&validRun(identity.attempt),'Invalid run identity.');
  need(Array.isArray(rows),'Invalid result rows.');
  return {version:1,runId:identity.runId,attempt:identity.attempt,sourceRevision:m.sourceRevision,manifestDigest:digest(m),index,shardCount,nodeVersion:process.versions.node,platform:process.platform,expectedKeys:tasks.map(t=>t.key),rows};
}
export function aggregateShards(m,envelopes,identity,jobResult){
  validateResearchManifest(m);
  need(validRun(identity.runId)&&validRun(identity.attempt),'Invalid run identity.');
  need(Array.isArray(envelopes),'Invalid envelope inventory.');
  const faults=[],rows=[],seen=new Set(),versions=new Set();
  for(const e of envelopes){
    if(!e||!Number.isInteger(e.index)||e.index<0||e.index>=shardCount){faults.push('Unknown shard');continue;}
    if(seen.has(e.index)){faults.push('Duplicate shard '+e.index);continue;}seen.add(e.index);
    const tasks=shardTasks(m,e.index),keys=tasks.map(t=>t.key);
    if(e.version!==1||e.runId!==identity.runId||e.attempt!==identity.attempt||e.sourceRevision!==m.sourceRevision||e.manifestDigest!==digest(m)||e.shardCount!==shardCount||e.platform!==m.environment.platform||typeof e.nodeVersion!=='string'||Number(e.nodeVersion.split('.')[0])!==m.environment.nodeMajor||JSON.stringify(e.expectedKeys)!==JSON.stringify(keys)||!Array.isArray(e.rows)){
      faults.push('Invalid shard evidence '+e.index);continue;
    }
    versions.add(e.nodeVersion);
    const rowKeys=e.rows.map(r=>r?.key);
    if(rowKeys.length!==keys.length||new Set(rowKeys).size!==rowKeys.length||rowKeys.some(k=>!keys.includes(k))){faults.push('Incomplete or foreign task inventory '+e.index);continue;}
    rows.push(...e.rows);
  }
  for(let i=0;i<shardCount;i++)if(!seen.has(i))faults.push('Missing shard '+i);
  if(versions.size!==1)faults.push('Inconsistent runner Node versions');
  if(jobResult!=='success')faults.push('Matrix result: '+String(jobResult));
  const report=aggregateResearch(m,rows);
  // All strategies must operate on the same generated input, even across hosts.
  for(const c of m.cases){
    const group=report.results.filter(r=>r.key.startsWith(c.id+':')&&['verified','refused'].includes(r.status));
    if(group.length&&group.some(r=>!(/^[a-f0-9]{64}$/.test(r.inputFingerprint))))faults.push('Missing input fingerprint: '+c.id);
    if(new Set(group.map(r=>r.inputFingerprint)).size>1)faults.push('Input drift: '+c.id);
  }
  const complete=report.complete&&faults.length===0;
  return {...report,complete,runId:identity.runId,attempt:identity.attempt,matrixResult:jobResult,faults,summary:report.summary.map(s=>({...s,eligibleForComparison:complete}))};
}
async function runShard(m,index,identity){
  const tasks=shardTasks(m,index);
  assertResearchSource(m);
  const rows=[];
  // Sequential within each of the two matrix runners: global max two processes.
  for(const task of tasks)rows.push(await executeResearchTask(task,m.budget.timeoutMs));
  assertResearchSource(m);
  return makeShardEnvelope(m,index,identity,rows);
}
function pilotManifest(){
  const template=JSON.parse(readFileSync(new URL('../../../docs/development/research/lare-pilot.json',import.meta.url),'utf8'));
  return validateResearchManifest({...template,sourceRevision:process.env.GITHUB_SHA,environment:{nodeMajor:Number(process.versions.node.split('.')[0]),platform:process.platform}});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [mode,arg,out]=process.argv.slice(2);
    const m=pilotManifest(),identity={runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT};
    need(validRun(identity.runId)&&validRun(identity.attempt),'GitHub run identity missing.');
    assertResearchSource(m);
    if(mode==='shard'){
      const envelope=await runShard(m,Number(arg),identity);
      mkdirSync(out,{recursive:true});
      writeFileSync(join(out,'shard.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
      console.log('DEV_OPT_RESEARCH_SHARD '+JSON.stringify(envelope));
      if(envelope.rows.some(r=>!['verified','refused'].includes(r.status)))process.exitCode=1;
    }else if(mode==='aggregate'){
      const envelopes=[];
      for(let i=0;i<shardCount;i++){
        const file=join(arg,'research-shard-'+identity.attempt+'-'+i,'shard.json');
        if(existsSync(file)){
          try{envelopes.push(JSON.parse(readFileSync(file,'utf8')));}
          catch(e){console.error('Unreadable shard '+i+': '+e.message);envelopes.push(null);}
        }
      }
      const report=aggregateShards(m,envelopes,identity,process.env.RESEARCH_MATRIX_RESULT);
      mkdirSync(out,{recursive:true});
      writeFileSync(join(out,'manifest.json'),JSON.stringify(m,null,2)+'\n',{flag:'wx'});
      writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
      console.log('DEV_OPT_DISTRIBUTED_RESEARCH '+JSON.stringify(report));
      // Persist original result before diagnostics; a diagnostic exception must fail closed.
      const diagnosis=diagnoseResearchReport(m,report);
      writeFileSync(join(out,'diagnostics.json'),JSON.stringify(diagnosis,null,2)+'\n',{flag:'wx'});
      console.log('DEV_OPT_RESEARCH_DIAGNOSTICS '+JSON.stringify(diagnosis));
      if(diagnosis.failures.length)process.exitCode=1;
      if(!report.complete||report.results.some(r=>r.status!=='verified'))process.exitCode=1; // known-valid pilot
    }else throw Error('Unknown pilot mode.');
  }catch(e){console.error(e.stack);process.exitCode=1;}
}
