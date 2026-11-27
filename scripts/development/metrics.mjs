// Development-only descriptive metrics; no network or write authority.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import { mandatoryJobNames, completeFullJobs, NODE_SHARDS, focusedExecution } from '../ci-full-contract.mjs';
const elapsed=(a,b)=>{const start=Date.parse(a),end=Date.parse(b);return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?(end-start)/1000:null;};
const distribution=xs=>{const a=xs.slice().sort((x,y)=>x-y),n=a.length;return n?{n,median:n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2,p90:a[Math.ceil(.9*n)-1]}:{n:0,median:null,p90:null};};
const exactlyOne=(jobs,name)=>jobs.filter(j=>j.name===name).length===1&&jobs.some(j=>j.name===name&&j.status==='completed'&&j.conclusion==='success');
export function summarizeDevelopmentMetrics(input){
  if(![1,2].includes(input?.version)||!Array.isArray(input.runs))throw Error('Unsupported metrics evidence.');
  const seen=new Set(),groups={};
  for(const r of input.runs){
    if(!Number.isSafeInteger(r.runId)||r.runId<1||seen.has(r.runId)||!['full-main','fast-draft'].includes(r.kind))throw Error('Invalid or duplicate run evidence.');
    seen.add(r.runId);
    const key=input.version===2&&r.kind==='full-main'?'full-main-'+NODE_SHARDS+'-node':r.kind;
    const g=groups[key]??={total:0,qualified:0,failed:0,incomplete:0,cancelled:0,workflowOnly:0,wall:[],runner:[],missingRunnerTiming:0,heads:new Set()};
    g.total++;g.heads.add(r.head);
    const wall=elapsed(r.createdAt,r.updatedAt);
    if(r.status!=='completed'){g.incomplete++;continue;}
    if(r.conclusion==='cancelled'){g.cancelled++;continue;}
    if(['failure','timed_out'].includes(r.conclusion)){g.failed++;continue;}
    if(r.conclusion!=='success'||wall===null){g.incomplete++;continue;}
    const required=r.kind==='full-main'?mandatoryJobNames(input.version===1?2:NODE_SHARDS,{routing:input.version===2}):['Build, syntax and targeted Node smoke tests'];
    if(!Array.isArray(r.jobs)||!required.every(name=>exactlyOne(r.jobs,name))||(input.version===2&&r.kind==='fast-draft'&&!focusedExecution(r.jobs,{id:r.runId,run_attempt:r.attempt}))||(input.version===2&&r.kind==='full-main'&&(r.nodeShards!==NODE_SHARDS||!completeFullJobs(r.jobs,{id:r.runId,run_attempt:r.attempt})))){
      if(r.kind==='fast-draft'&&r.jobs===null){g.workflowOnly++;g.wall.push(wall);}else g.incomplete++;
      continue;
    }
    g.qualified++;g.wall.push(wall);
    const durations=r.jobs.filter(j=>j.conclusion!=='skipped').map(j=>elapsed(j.startedAt,j.completedAt));
    if(!durations.length||durations.some(v=>v===null))g.missingRunnerTiming++;
    else g.runner.push(durations.reduce((n,v)=>n+v,0)/60);
  }
  return Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,{total:g.total,qualified:g.qualified,workflowOnly:g.workflowOnly,failed:g.failed,cancelled:g.cancelled,incomplete:g.incomplete,distinctHeads:g.heads.size,wallSeconds:distribution(g.wall),runnerMinutes:distribution(g.runner),missingRunnerTiming:g.missingRunnerTiming}]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(summarizeDevelopmentMetrics(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
