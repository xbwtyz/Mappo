// Cross-revision SRE pilot: fixed approved frozen source, no mutation or adoption.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest} from './contract.mjs';
import {classifyFailure} from './diagnostics.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
export const targetRevision='e2fcbdf370fa1bb6e96f99e63a97fc8ec0b5bdd7';
export const budgetWork=Object.freeze({'budget-32m':32000000,'budget-64m':64000000,'budget-128m':128000000,'budget-256m':256000000,'iterative-256m':256000000});
export const schedules=['baseline','grouped-first','diversified-restoration','shell-first-restoration',...Object.keys(budgetWork)];
export const cases=[{id:'regular-preservation',partition:'development',irregularProperties:false,scale:.5,expectation:'known-preservation'},{id:'irregular-compression',partition:'development',irregularProperties:true,scale:.25,expectation:'known-compression'}];
export const gates=['independentWitness','storedProject','nonmutation','permissions','identity','deterministicReplay','budget'];
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const fingerprint=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validId=x=>typeof x==='string'&&/^[1-9][0-9]{0,19}$/.test(x);
export function validateSubmission(s){
  const fields=(v,keys)=>v&&typeof v==='object'&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
  need(fields(s,['version','targetRevision','schedules','cases'])&&s.version===1&&sha(s.targetRevision),'Invalid submission identity.');
  need(Array.isArray(s.schedules)&&s.schedules.length>=2&&s.schedules.length<=4&&new Set(s.schedules).size===s.schedules.length&&s.schedules.every(x=>schedules.includes(x)),'Invalid schedules.');
  need(Array.isArray(s.cases)&&s.cases.length>=2&&s.cases.length<=4,'Invalid case inventory.');
  const ids=new Set(),inputs=new Set(),heldOutSeeds=new Set();
  for(const c of s.cases){
    need(fields(c,['id','partition','irregularProperties','scale','expectation',...(Object.hasOwn(c,'fixture')?['fixture']:[])])&&typeof c.id==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(c.id)&&!ids.has(c.id)&&['development','held-out'].includes(c.partition)&&typeof c.irregularProperties==='boolean'&&typeof c.scale==='number'&&Number.isFinite(c.scale)&&c.scale!==0&&Math.abs(c.scale)<=1&&['known-preservation','known-compression','exploratory'].includes(c.expectation),'Invalid case.');
    if(Object.hasOwn(c,'fixture')){
      need(c.expectation==='exploratory'&&c.partition==='held-out'&&fields(c.fixture,['seed','size','morphology'])&&typeof c.fixture.seed==='string'&&/^dev-opt-holdout-[a-z0-9-]{1,64}$/.test(c.fixture.seed)&&['small','medium'].includes(c.fixture.size)&&['linear','organic','radial','planned'].includes(c.fixture.morphology),'Invalid independent city fixture.');
      need(!heldOutSeeds.has(c.fixture.seed),'Duplicate held-out city seed.');heldOutSeeds.add(c.fixture.seed);
    }
    const key=JSON.stringify([c.fixture??null,c.irregularProperties,c.scale]);need(!inputs.has(key),'Duplicate movement across partitions.');ids.add(c.id);inputs.add(key);
    if(c.expectation==='known-preservation')need(!c.irregularProperties&&c.scale===.5&&c.partition==='development','Wrong preservation control.');
    if(c.expectation==='known-compression')need(c.irregularProperties&&c.scale===.25&&c.partition==='development'&&s.schedules.every(x=>['baseline','diversified-restoration'].includes(x)),'Wrong compression control.');
    if(c.partition==='held-out')need(c.expectation==='exploratory'&&(c.fixture||![1,.75,.5,.25,.125,.025,-.25,-.5,-1].includes(c.scale)),'Held-out movement overlaps historical grid.');
  }
  need(s.cases.some(c=>c.partition==='development'),'Missing development cases.');
  const experimental=s.schedules.some(x=>Object.hasOwn(budgetWork,x));
  if(experimental)need(s.targetRevision==='4820dd6f697cf24bdfc395b2edefb86fcc40ed74'&&s.schedules.every(x=>Object.hasOwn(budgetWork,x))&&s.cases.every(c=>c.expectation==='exploratory'&&c.partition==='development'&&!c.fixture),'Invalid isolated budget sensitivity submission.');
  return s;
}
export function manifest(identity,submission={version:1,targetRevision,schedules:['baseline','diversified-restoration'],cases}){
  validateSubmission(submission);
  need(sha(identity.harnessRevision)&&validId(identity.runId)&&validId(identity.attempt),'Invalid run identity.');
  return {version:1,...identity,targetRevision:submission.targetRevision,adapter:'sre-road-recovery-v1',schedules:submission.schedules,cases:submission.cases,
    environment:{nodeMajor:22,platform:'linux'},permissions:{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2},
    project:{seed:'mappo-001',size:'medium',morphology:'organic',shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44}},
    roadIds:['RD-0184','RD-0186'],offset:{x:-3.005274072121821,y:-37.39896113564458},
    budget:{work:submission.schedules.some(x=>Object.hasOwn(budgetWork,x))?Math.max(...submission.schedules.map(x=>budgetWork[x])):32000000,expansions:131072,timeoutMs:submission.schedules.some(x=>Object.hasOwn(budgetWork,x))?360000:180000,concurrency:2}};
}
export function tasks(m,index){
  need(Number.isInteger(index)&&index>=0&&index<2,'Invalid shard.');
  return m.schedules.flatMap((schedule,i)=>i%2===index?m.cases.map(c=>({manifest:m,manifestDigest:digest(m),case:c,schedule,key:c.id+':'+schedule})):[]);
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
      const refused=row.status==='refused'&&task.case.expectation==='exploratory'&&row.candidateFingerprint===null&&['nonmutation','deterministicReplay','budget'].every(g=>row.gates?.[g]===true)&&row.counts===null&&row.demolishedFootprint===null&&row.scaleLoss===null;
      const verified=row.status==='verified'&&fingerprint(row.candidateFingerprint)&&gates.every(g=>row.gates?.[g]===true)&&['properties','plots','buildings'].every(k=>Number.isSafeInteger(row.counts?.[k])&&row.counts[k]>=0)&&Number.isFinite(row.demolishedFootprint)&&row.demolishedFootprint>=0&&Number.isFinite(row.scaleLoss)&&row.scaleLoss>=0;
      const workLimit=budgetWork[task.schedule]??m.budget.work;
      if(Object.hasOwn(budgetWork,task.schedule)&&(row.workLimit!==workLimit||row.stats?.work>workLimit||(workLimit===32000000&&!verified)))faults.push('Invalid budget comparison '+row.key);
      if((!refused&&!verified)||!fingerprint(row.inputFingerprint)||!fingerprint(row.operationFingerprint)||!Number.isFinite(row.elapsedMs)||row.elapsedMs<0||!Number.isSafeInteger(row.stats?.work)||row.stats.work<0||row.stats.work>m.budget.work||!Number.isSafeInteger(row.stats?.expansions)||row.stats.expansions<0||row.stats.expansions>m.budget.expansions)faults.push('Unqualified task '+row.key);
    }
  }
  for(let i=0;i<2;i++)if(!seen.has(i))faults.push('Missing shard '+i);
  if(matrix!=='success')faults.push('Matrix '+matrix);
  for(const c of m.cases){
    const pair=rows.filter(r=>r.key.startsWith(c.id+':'));
    if(pair.length!==m.schedules.length||new Set(pair.map(r=>r.inputFingerprint)).size!==1||new Set(pair.map(r=>r.operationFingerprint)).size!==1)faults.push('Incomplete or different input '+c.id);
  }
  const complete=faults.length===0&&rows.length===m.cases.length*m.schedules.length;
  const summary=m.schedules.map(schedule=>({schedule,verified:rows.filter(r=>r.key.endsWith(':'+schedule)&&r.status==='verified').length,refused:rows.filter(r=>r.key.endsWith(':'+schedule)&&r.status==='refused').length,heldOutVerified:rows.filter(r=>r.key.endsWith(':'+schedule)&&r.status==='verified'&&m.cases.some(c=>c.partition==='held-out'&&r.key.startsWith(c.id+':'))).length}));
  const diagnostics=rows.filter(r=>!['verified','refused'].includes(r.status)).map(r=>({key:r.key,status:r.status,...classifyFailure(r.status,JSON.stringify(r.diagnostic??r)),provisional:true,original:r,task:[...tasks(m,0),...tasks(m,1)].find(t=>t.key===r.key)}));
  return {version:1,manifest:m,manifestDigest:digest(m),complete,faults,rows,summary,diagnostics,eligibleForComparison:complete,productionAdoptionAuthorized:false};
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
    const submission=validateSubmission(JSON.parse(readFileSync(new URL('../../../docs/development/research/sre-submission.json',import.meta.url),'utf8')));
    if(mode==='target'){console.log(submission.targetRevision);process.exit(0);}
    const m=manifest({harnessRevision:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT},submission);
    checkCheckout(fileURLToPath(new URL('../../../',import.meta.url)),m.harnessRevision);
    need(process.platform==='linux'&&Number(process.versions.node.split('.')[0])===22,'Pilot environment mismatch.');
    if(mode==='shard'){
      const index=Number(arg),target=resolve(input);checkCheckout(target,m.targetRevision);
      const rows=tasks(m,index).map(t=>runTask(t,target));checkCheckout(target,m.targetRevision);
      const envelope={index,manifestDigest:digest(m),targetRevision:m.targetRevision,harnessRevision:m.harnessRevision,runId:m.runId,attempt:m.attempt,rows};
      mkdirSync(out,{recursive:true});writeFileSync(join(out,'shard.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
      console.log('DEV_OPT_SRE_SHARD '+JSON.stringify(envelope));if(rows.some(r=>!['verified','refused'].includes(r.status)))process.exitCode=1;
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
