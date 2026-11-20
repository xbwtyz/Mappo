// E5 controlled, informational Node-only measurements.
// No hard performance pass/fail thresholds or claims against a different CI runner.
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {PropertyEditSession3I} from '../src/editor/property-edit.js';
import {inspectPropertyEdit3I,preparePropertyApply3I} from '../src/editor/property-application.js';

function quantile(sorted,q){
 if(!sorted.length)return null;
 return Number(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)].toFixed(2));
}
function stats(a){const v=[...a].sort((x,y)=>x-y);return {n:v.length,p50Ms:quantile(v,.5),p95Ms:quantile(v,.95),maxMs:quantile(v,1)};}
const groups=[];
for(const size of ['small','large']){
 const project=createProject({seed:'e5-performance-'+size,size,morphology:'planned'});
 let id=null;
 for(const p of project.city.properties){
  const s=new PropertyEditSession3I();
  if(!s.start(project.city,p.id)||!s.addDivider(project.city,0))continue;
  if(preparePropertyApply3I(project,defaultWorkspace(project),s).ok){id=p.id;break;}
 }
 if(!id)throw Error('No legal E5 performance sample for '+size);
 const checks=[],applies=[];
 for(let pass=0;pass<7;pass++){
  const s=new PropertyEditSession3I();
  if(!s.start(project.city,id)||!s.addDivider(project.city,0))throw Error('Fixture no longer eligible');
  const start=performance.now(),preview=inspectPropertyEdit3I(project,s);
  checks.push(performance.now()-start);
  if(!preview.ok)throw Error('Benchmark preview invalid');
  const appliedAt=performance.now(),receipt=preparePropertyApply3I(project,defaultWorkspace(project),s);
  applies.push(performance.now()-appliedAt);
  if(!receipt.ok)throw Error('Benchmark candidate invalid');
 }
 groups.push({size,properties:project.city.properties.length,plots:project.city.plots.length,
  preview:stats(checks.slice(1)),apply:stats(applies.slice(1))});
}
const report={runner:{cpu:os.cpus()[0]?.model,cpus:os.cpus().length,node:process.version,
  platform:os.platform(),arch:os.arch()},measurement:'single-run warmed Node geometric preview and whole-project Apply; no frame/input metrics',groups};
console.log('E5_PERFORMANCE '+JSON.stringify(report));
