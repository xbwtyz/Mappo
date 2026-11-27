// Diagnostic-only replay of exact owner stress cases. Product files unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,unlink,readdir} from 'node:fs/promises';
import {createProject} from '../../../src/core/city-model.js';
import {prepareRoadGroupIntentB1,readRoadGroupTopologyB1} from '../../../src/core/road-intent-c1.js';
import {createLareContext} from '../../../src/core/reconciliation-context.js';
import {createSpatialDestructionBudget,createSpatialPreservationBudget,createSpatialOperation,spatialRefKey} from '../../../src/core/spatial-recovery-contract.js';
import {normalizeSpatialRoadGroup,discoverSpatialRoadRetirementEligibility,verifySpatialRetirementWitness} from '../../../src/core/spatial-recovery-road-adapter.js';
import {validateStoredProject} from '../../../src/data/project-validation.js';

const target='f04a447ecd4ae6b1f8d12a28ac68adb3573d265f',baseline='c6d1664bdf8eb943e1067ac5a736da6f911b25aca4f30104fda2aee7910a9fda';
const fixtures=[
 {id:'five-chain',ids:['RD-0220','RD-0221','RD-0226','RD-0252','RD-0254'],offset:{x:0,y:75}},
 {id:'five-branch',ids:['RD-0221','RD-0226','RD-0252','RD-0254','RD-0256'],offset:{x:0,y:75}},
 {id:'three-junction',ids:['RD-0226','RD-0254','RD-0256'],offset:{x:0,y:75}},
 {id:'quad-control',ids:['RD-0224','RD-0225','RD-0228','RD-0338'],offset:{x:50,y:0}}
];
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const dir='artifacts/sre-refusal-forensics';
const variants=['ordinary','grouped-baseline','all-eligible-plus-children','all-eligible-direct-scale','area-deficit-direct'];
function replaceOnce(s,a,b){assert.equal(s.split(a).length,2,'Diagnostic anchor changed: '+a.slice(0,80));return s.replace(a,b);}
async function shard(index){
 const c=fixtures[index];assert.ok(c);
 const project=createProject({seed:'sre-owner-motion-planned-01',size:'medium',morphology:'planned',irregularProperties:false});
 validateStoredProject(project);assert.equal(sha(project),baseline);
 const operation=normalizeSpatialRoadGroup(project,0,c.ids,c.offset,{alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2,destruction:true,regeneration:false});
 const preserving=createSpatialOperation({...operation,permissions:{...operation.permissions,destruction:false}});
 const draft=prepareRoadGroupIntentB1(project,c.ids,c.offset);
 const topology=readRoadGroupTopologyB1(project,draft);assert.ok(draft.topologyResolved&&draft.facesResolved&&topology.identity.valid&&!topology.identity.requiresReview);
 const eligibility=discoverSpatialRoadRetirementEligibility(project,operation,createSpatialDestructionBudget());
 const context=createLareContext(project,draft,new Map(),createSpatialDestructionBudget());
 const groupIds=new Set(eligibility.propertyGroups.map(g=>g.propertyId));
 const eligibleBuildings=new Set(eligibility.buildingRefs.map(r=>r.id));
 const refs=[...new Map([...eligibility.propertyGroups.flatMap(g=>g.refs),...eligibility.buildingRefs].map(r=>[spatialRefKey(r),r])).values()];
 const blocks=topology.identity.changed.filter(f=>f.kind==='block').map(f=>({id:f.id,before:project.city.blocks.find(b=>b.id===f.id)?.area,after:f.record?.area}));
 const retained=context.properties.filter(p=>!groupIds.has(p.id)).map(p=>({id:p.id,blockId:p.blockId,policy:p.policy,
   buildings:p.buildings.map(b=>({...b,eligible:eligibleBuildings.has(b.id)}))}));
 const report={target,source:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,index,c,baseline,operation,
   blocks,eligibility:{groups:eligibility.propertyGroups,buildingRefs:eligibility.buildingRefs,allRefs:refs,retained},results:[],errors:[]};
 await mkdir(dir,{recursive:true});
 const persist=()=>writeFile(dir+'/shard-'+index+'.json',JSON.stringify(report,null,2)+'\n');
 await persist();
 console.log('SRE_FORENSIC_SCOPE '+JSON.stringify({id:c.id,blocks,groups:groupIds.size,buildings:eligibleBuildings.size,retained}));
 // Copy the exact adapter to an untracked sibling only on the hosted runner.
 // Add observer-only records to capture swallowed inner search refusals.
 const original=new URL('../../../src/core/spatial-recovery-road-adapter.js',import.meta.url);
 const copy=new URL('../../../src/core/.sre-refusal-forensics-copy.mjs',import.meta.url);
 let s=await readFile(original,'utf8');
 s=replaceOnce(s,"  if(trial.status!=='verified-witness')return {status:'refused',exhausted:trial.exhausted??null};",
 "  globalThis.__sreForensicTrials.push({refs,diagnosticScale,status:trial.status,issues:trial.issues??[],stages:trial.stages??{},attempts:trial.attempts??[],stats:trial.stats,exhausted:trial.exhausted??null});\n  if(trial.status!=='verified-witness')return {status:'refused',exhausted:trial.exhausted??null};");
 // Keep entity IDs when reporting ordinary/concession refusals. This affects
 // diagnostic output only, not branching, candidate geometry or validation.
 s=s.replaceAll("code:String(i.code??'unknown'),message:String(i.message??'Road recovery refused.')","code:String(i.code??'unknown'),message:String(i.message??'Road recovery refused.'),kind:i.kind??null,id:i.id??null");
 s=s.replaceAll("code:String(row.code??'unknown'),message:String(row.message??'Road recovery refused.')","code:String(row.code??'unknown'),message:String(row.message??'Road recovery refused.'),kind:row.kind??null,id:row.id??null");
 await writeFile(copy,s,{flag:'wx'});
 try{
   const api=await import(copy.href);
   for(const variant of variants){
     globalThis.__sreForensicTrials=[];
     const start=performance.now();
     const budget=variant==='ordinary'?createSpatialPreservationBudget():createSpatialDestructionBudget();
     try{
       let result;
       if(variant==='ordinary')result=await api.searchSpatialNondestructiveRoadGroup(project,preserving,budget,{reusePackingInventory:true});
       else if(variant==='grouped-baseline'||variant==='area-deficit-direct')result=await api.searchSpatialGroupedRetirementRoadGroup(project,operation,budget,{seedPolicy:variant==='grouped-baseline'?'baseline':'area-deficit-direct'});
       else result=await api.searchSpatialRetirementSubsetRoadGroup(project,operation,refs,budget,{diagnosticScale:variant==='all-eligible-direct-scale'?.8:null});
       assert.ok(['refused','verified-witness'].includes(result.status));
       assert.equal(sha(project),baseline);
       let verified=false;
       if(result.status==='verified-witness'){
         const candidate=variant==='ordinary'?
           await api.verifySpatialConcessionRoadWitness(project,preserving,result.delta,createSpatialDestructionBudget()):
           await verifySpatialRetirementWitness(project,operation,result.delta,createSpatialDestructionBudget());
         validateStoredProject(candidate);assert.equal(sha(candidate),result.delta.candidateFingerprint);
         verified=true;
       }else assert.equal(result.delta,null);
       const row={variant,status:result.status,verified,stats:budget.snapshot(),exhausted:result.exhausted??null,
         issues:result.issues??[],attempts:result.attempts??[],stages:result.stages??{},trials:globalThis.__sreForensicTrials,
         candidate:result.delta?.candidateFingerprint??null,retired:result.delta?.retired??[],ms:Math.round(performance.now()-start)};
       report.results.push(row);console.log('SRE_FORENSIC_RESULT '+JSON.stringify({id:c.id,variant,status:row.status,verified,stats:row.stats,exhausted:row.exhausted,issues:row.issues,
         trials:row.trials.map(t=>({count:t.refs.length,scale:t.diagnosticScale,status:t.status,issues:t.issues,stats:t.stats,exhausted:t.exhausted})),ms:row.ms}));
     }catch(e){report.errors.push({variant,error:e.stack??String(e)});console.error('SRE_FORENSIC_ERROR '+c.id+' '+variant+' '+e.stack);}
     await persist();
   }
 }finally{delete globalThis.__sreForensicTrials;await unlink(copy);}
 if(report.errors.length)process.exitCode=1;
}
async function aggregate(path){
 const names=(await readdir(path,{recursive:true})).filter(p=>/^shard-[0-3]\.json$/.test(p.split('/').at(-1)));
 assert.equal(names.length,4);
 const reports=await Promise.all(names.map(async n=>JSON.parse(await readFile(path+'/'+n,'utf8'))));
 assert.deepEqual(reports.map(r=>r.index).sort((a,b)=>a-b),[0,1,2,3]);
 for(const r of reports){
   assert.equal(r.target,target);assert.equal(r.baseline,baseline);assert.deepEqual(r.c,fixtures[r.index]);
   assert.equal(r.source,process.env.GITHUB_SHA);assert.equal(r.run,process.env.GITHUB_RUN_ID);assert.equal(r.attempt,process.env.GITHUB_RUN_ATTEMPT);
   assert.equal(r.errors.length,0);assert.deepEqual(r.results.map(x=>x.variant),variants);
   for(const x of r.results){assert.ok(['refused','verified-witness'].includes(x.status));assert.equal(x.verified,x.status==='verified-witness');}
   // Reproduce the existing broad grouped refusal and success on the same source.
   assert.equal(r.results.find(x=>x.variant==='grouped-baseline').status,r.index===3?'verified-witness':'refused');
 }
 await mkdir(dir,{recursive:true});await writeFile(dir+'/report.json',JSON.stringify({target,baseline,reports},null,2)+'\n');
 console.log('SRE_FORENSIC_SUMMARY '+JSON.stringify(reports.map(r=>({id:r.c.id,groups:r.eligibility.groups.length,retained:r.eligibility.retained.length,results:r.results.map(x=>({variant:x.variant,status:x.status,issues:[...new Set([...x.issues,...x.trials.flatMap(t=>t.issues)].map(i=>i.code))],work:x.stats.work}))}))));
}
if(process.argv[2]==='aggregate')await aggregate(process.argv[3]);else await shard(Number(process.argv[2]));
