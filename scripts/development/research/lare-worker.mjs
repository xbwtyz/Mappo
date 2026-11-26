// Fixed read-only adapter for existing LARE preservation strategies.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {createProject} from '../../../src/core/city-model.js';
import {prepareRoadGroupReflowB1} from '../../../src/core/neighborhood-reflow.js';
import {validateRoadGroupApplyB1} from '../../../src/editor/road-application.js';
import {defaultWorkspace} from '../../../src/data/project-format.js';
import {validateStoredProject} from '../../../src/data/project-validation.js';
import {prepareRoadGroupIntentB1} from '../../../src/core/road-intent-c1.js';
import {verifyLareGroupPreservation} from '../../../src/core/reconciliation-preservation.js';
import {createLareBudget} from '../../../src/core/reconciliation-budget.js';
import {digest,strategies} from './contract.mjs';
const task=JSON.parse(readFileSync(0,'utf8'));
const start=performance.now();
function solve(){
  const c=task.case,project=createProject(c.project),before=JSON.stringify(project);
  validateStoredProject(project);
  const strategy=task.strategy==='production'?null:task.strategy;
  const preview=prepareRoadGroupReflowB1(project,c.roadIds,c.offset,{strategy});
  let candidateFingerprint=null,issues=preview.unresolved??[];
  if(preview.candidateProject){
    const receipt=validateRoadGroupApplyB1(project,defaultWorkspace(project),{selectedRoadIds:c.roadIds,offset:c.offset,strategy},preview);
    assert.ok(receipt.ok,JSON.stringify(receipt.issues));
    validateStoredProject(receipt.candidate);
    const draft=prepareRoadGroupIntentB1(project,c.roadIds,c.offset);
    assert.equal(verifyLareGroupPreservation(project,receipt.candidate,draft,new Map(),createLareBudget()),null);
    for(const k of ['roads','nodes','blocks','properties','plots','buildings']){
      assert.deepEqual(receipt.candidate.city[k].map(x=>x.id).sort(),project.city[k].map(x=>x.id).sort(),'Retirement or new identity: '+k);
    }
    candidateFingerprint=digest(receipt.candidate);issues=[];
  }
  assert.equal(JSON.stringify(project),before,'Accepted project mutated');
  return {candidateFingerprint,issues:issues.map(i=>({code:i.code,message:i.message})),inputFingerprint:digest(project),stats:preview.lare?.operationStats??null};
}
try{
  assert.ok(task.version===1&&task.adapter==='lare-road-preservation-v1'&&strategies.includes(task.strategy));
  assert.equal(Number(process.versions.node.split('.')[0]),task.environment.nodeMajor);
  assert.equal(process.platform,task.environment.platform);
  const a=solve(),b=solve();
  assert.equal(a.inputFingerprint,b.inputFingerprint,'Nondeterministic input');
  assert.equal(a.candidateFingerprint,b.candidateFingerprint,'Nondeterministic candidate');
  assert.deepEqual(a.issues,b.issues,'Nondeterministic refusal');
  const accepted=a.candidateFingerprint!==null;
  console.log(JSON.stringify({key:task.key,manifestDigest:task.manifestDigest,sourceRevision:task.sourceRevision,inputDigest:digest(task),status:accepted?'verified':'refused',candidateFingerprint:a.candidateFingerprint,inputFingerprint:a.inputFingerprint,issues:a.issues,stats:a.stats,retired:0,elapsedMs:performance.now()-start,peakRssKiB:process.resourceUsage().maxRSS,gates:accepted?{storedProject:true,topology:true,nonmutation:true,permissions:true,authoredPreservation:true,deterministicReplay:true}:{nonmutation:true,deterministicReplay:true}}));
}catch(error){console.error(error.stack??String(error));process.exitCode=1;}
