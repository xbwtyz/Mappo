// Cross-revision SRE pilot: fixed approved frozen source, no mutation or adoption.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest} from './contract.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
export const targetRevision='e2fcbdf370fa1bb6e96f99e63a97fc8ec0b5bdd7';
export const schedules=['baseline','diversified-restoration'];
export const cases=[{id:'regular-preservation',irregularProperties:false,scale:.5},{id:'irregular-compression',irregularProperties:true,scale:.25}];
export const gates=['independentWitness','storedProject','nonmutation','permissions','identity','deterministicReplay','budget'];
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const fingerprint=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validId=x=>typeof x==='string'&&/^[1-9][0-9]{0,19}$/.test(x);
export function manifest(identity){
  need(sha(identity.harnessRevision)&&validId(identity.runId)&&validId(identity.attempt),'Invalid run identity.');
  return {version:1,...identity,targetRevision,adapter:'sre-road-recovery-v1',schedules,cases,
    environment:{nodeMajor:22,platform:'linux'},permissions:{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2},
    project:{seed:'mappo-001',size:'medium',morphology:'organic',shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44}},
    roadIds:['RD-0184','RD-0186'],offset:{x:-3.005274072121821,y:-37.39896113564458},
    budget:{work:32000000,expansions:131072,timeoutMs:180000,concurrency:2}};
}
export function tasks(m,index){
  need(Number.isInteger(index)&&index>=0&&index<2,'Invalid shard.');
  return m.cases.map(c=>({manifest:m,manifestDigest:digest(m),case:c,schedule:m.schedules[index],key:c.id+':'+m.schedules[index]}));
}
export function aggregate(m,envelopes,matrix){
  const faults=[],rows=[],seen=new Set();
  for(const e of envelopes){
    if(!e||!Number.isInteger(e.index)||e.index<0||e.index>=2||seen.has(e.index)){faults.push('Invalid or duplicate shard');continue;}seen.add(e.index);
    const expected=tasks(m,e.index);
    if(e.manifestDigest!==digest(m)||e.targetRevision!==m.targetRevision||e.harnessRevision!==m.harnessRevision||e.runId!==m.runId||e.attempt!==m.attempt||!Array.isArray(e.rows)||e.rows.length!==expected.length){faults.push('Stale or incomplete shard '+e.index);continue;}
    const keys=new Set();
    for(const row of e.rows){
      const task=expected.find(t=>t.key===row?.key);
      if(!task||keys.has(row.key)||row.inputDigest!==digest(task)){faults.push('Invalid task evidence in shard '+e.index);continue;}keys.add(row.key);
      rows.push(row);
      if(row.status!=='verified'||!fingerprint(row.inputFingerprint)||!fingerprint(row.candidateFingerprint)||!gates.every(g=>row.gates?.[g]===true)||!Number.isFinite(row.elapsedMs)||row.elapsedMs<0||!Number.isSafeInteger(row.stats?.work)||row.stats.work<0||row.stats.work>m.budget.work||!Number.isSafeInteger(row.stats?.expansions)||row.stats.expansions<0||row.stats.expansions>m.budget.expansions||!['properties','plots','buildings'].every(k=>Number.isSafeInteger(row.counts?.[k])&&row.counts[k]>=0)||!Number.isFinite(row.demolishedFootprint)||row.demolishedFootprint<0||!Number.isFinite(row.scaleLoss)||row.scaleLoss<0)faults.push('Unqualified task '+row.key);
    }
  }
  for(let i=0;i<2;i++)if(!seen.has(i))faults.push('Missing shard '+i);
  if(matrix!=='success')faults.push('Matrix '+matrix);
  for(const c of m.cases){
    const pair=rows.filter(r=>r.key.startsWith(c.id+':'));
    if(pair.length!==2||pair[0].inputFingerprint!==pair[1].inputFingerprint)faults.push('Incomplete or different input '+c.id);
  }
  const complete=faults.length===0&&rows.length===4;
  return {version:1,manifest:m,manifestDigest:digest(m),complete,faults,rows,eligibleForComparison:complete,productionAdoptionAuthorized:false};
}
function checkCheckout(dir,revision){
  const git=args=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
  need(git(['rev-parse','HEAD'])===revision,'Wrong source revision.');
  need(!git(['status','--porcelain','--untracked-files=all']),'Target checkout dirty.');
}
function runTask(task,target){
  const started=Date.now();
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./sre-worker.mjs',import.meta.url)),target],
    {input:JSON.stringify(task),encoding:'utf8',timeout:task.manifest.budget.timeoutMs,maxBuffer:1024*1024,env:{PATH:process.env.PATH??'',TZ:'UTC'}});
  const identity={key:task.key,inputDigest:digest(task)};
  if(result.error||result.status!==0)return {...identity,status:result.error?.code==='ETIMEDOUT'?'timeout':'failed',diagnostic:{exitCode:result.status,signal:result.signal,stderr:result.stderr??'',stdout:result.stdout??'',error:result.error?.message??null},elapsedMs:Date.now()-started};
  try{return {...JSON.parse(result.stdout),...identity};}catch(e){return {...identity,status:'incomplete',diagnostic:{stdout:result.stdout,error:e.message}};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [mode,arg,input,out]=process.argv.slice(2);
    const m=manifest({harnessRevision:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
    need(process.platform==='linux'&&Number(process.versions.node.split('.')[0])===22,'Pilot environment mismatch.');
    if(mode==='shard'){
      const index=Number(arg),target=resolve(input);checkCheckout(target,m.targetRevision);
      const rows=tasks(m,index).map(t=>runTask(t,target));checkCheckout(target,m.targetRevision);
      const envelope={index,manifestDigest:digest(m),targetRevision:m.targetRevision,harnessRevision:m.harnessRevision,runId:m.runId,attempt:m.attempt,rows};
      mkdirSync(out,{recursive:true});writeFileSync(join(out,'shard.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
      console.log('DEV_OPT_SRE_SHARD '+JSON.stringify(envelope));if(rows.some(r=>r.status!=='verified'))process.exitCode=1;
    }else if(mode==='aggregate'){
      const envelopes=[];
      for(let i=0;i<2;i++){const f=join(input,'sre-shard-'+m.attempt+'-'+i,'shard.json');if(existsSync(f)){try{envelopes.push(JSON.parse(readFileSync(f,'utf8')));}catch{envelopes.push(null);}}}
      const report=aggregate(m,envelopes,process.env.RESEARCH_MATRIX_RESULT);
      mkdirSync(out,{recursive:true});writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
      console.log('DEV_OPT_SRE_RESEARCH '+JSON.stringify(report));
      if(!report.complete)process.exitCode=1;
    }else throw Error('Unknown mode.');
  }catch(e){console.error(e.stack);process.exitCode=1;}
}
