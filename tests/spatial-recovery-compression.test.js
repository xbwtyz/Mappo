import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { iterateRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { verifyLareGroupPreservation } from '../src/core/reconciliation-preservation.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { scoreSpatialPreservation, preferVerifiedSpatialPreservation } from '../src/core/spatial-recovery-score.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { createHash } from 'node:crypto';
const roadIds=['RD-0184','RD-0186'];
const offset0={x:-3.005274072121821,y:-37.39896113564458};
const scales=[1,.75,.5,.25,.125,.025,-.25,-.5,-1];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function run(project,offset,packing){
  const stages={},iterator=iterateRoadGroupReflowB1(project,roadIds,offset,packing?{strategy:'enhanced-adaptive',packing:true}:{});
  let step;
  try{
    while(!(step=iterator.next()).done){
      const name=step.value?.stage??'other';
      stages[name]=(stages[name]??0)+1;
    }
  }finally{iterator.return();}
  const result=step.value,candidate=result.candidateProject;
  if(!candidate)return {witness:null,stages,issues:result.unresolved.map(i=>i.code)};
  validateStoredProject(candidate);
  const draft=prepareRoadGroupIntentB1(project,roadIds,offset),budget=createSpatialPreservationBudget();
  assert.equal(verifyLareGroupPreservation(project,candidate,draft,new Map(),budget),null);
  for(const key of ['properties','plots','buildings'])
    assert.deepEqual(candidate.city[key].map(r=>r.id),project.city[key].map(r=>r.id));
  assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
  return {witness:{cost:scoreSpatialPreservation(project,candidate,budget),fingerprint:hash(candidate)},stages,issues:[]};
}
for(const irregularProperties of [false,true])test('SRE cooperative compression diagnostic '+(irregularProperties?'irregular':'regular'),{timeout:300000},()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  validateStoredProject(project);
  const before=hash(project),summary={cases:0,baseline:0,packing:0,retained:0,newRecoveries:0,blockSearchCases:0};
  for(const scale of scales){
    const offset={x:offset0.x*scale,y:offset0.y*scale};
    const baseline=run(project,offset,false),packing=run(project,offset,true);
    const selected=preferVerifiedSpatialPreservation(baseline.witness,packing.witness);
    summary.cases++;summary.baseline+=Number(Boolean(baseline.witness));summary.packing+=Number(Boolean(packing.witness));
    summary.retained+=Number(Boolean(selected));summary.newRecoveries+=Number(!baseline.witness&&Boolean(packing.witness));
    summary.blockSearchCases+=Number(Boolean(packing.stages['block-result']||packing.stages['bundle-building']));
    if(baseline.witness)assert.ok(selected);
    if(scale===.025)assert.ok(baseline.witness,'known strict baseline lost');
    assert.equal(hash(project),before);
    console.log('SRE_PACKING_CASE '+JSON.stringify({irregularProperties,scale,baseline,packing,selected}));
  }
  assert.ok(summary.blockSearchCases,'cooperative packing path was not exercised');
  console.log('SRE_PACKING_SUMMARY '+JSON.stringify({irregularProperties,...summary}));
});
