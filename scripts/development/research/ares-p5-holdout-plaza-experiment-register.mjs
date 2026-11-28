import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAZA_EXPERIMENT_CASES,plazaExperimentCase} from './ares-p5-holdout-plaza-experiment-lock.mjs';
import {constructP5PlazaExperiment,observeP5PlazaExperiment} from './ares-p5-topology-observe.mjs';
import {auditP5PlazaExperiment} from './ares-p5-topology-audit.mjs';
const summary=(c,a)=>({construction:c.status,reason:c.reason,attempts:c.attempts,stats:c.stats,audit:a?{status:a.status,reason:a.reason,contacts:a.contacts,splitParents:a.splitParents,finalChecks:a.finalChecks,sweptChecks:a.sweptChecks,sweptUnresolved:a.sweptUnresolved.length,rotation:a.rotationDiagnostic?.finalChanged,plaza:a.plazaPreservation,stats:a.stats}:null});
export async function measurePlaza(caseId,precision=false){
 const result={caseId,precision,source:plazaExperimentCase(caseId,'strict').source,authority:'none',arms:[]};
 for(const arm of ['strict','plaza-attached']){
  let observation=null;if(!precision){const o=await observeP5PlazaExperiment(caseId,arm);observation={contacts:o.conflicts.length,blocked:o.conflicts.filter(c=>c.status==='blocked').length,other:o.other.length,blockedPairs:o.conflicts.filter(c=>c.status==='blocked').map(c=>({roads:c.roadIds,reasons:c.reasons})),stats:o.stats};}
  const c=await constructP5PlazaExperiment(caseId,arm,precision),a=c.status==='graph-candidate'?await auditP5PlazaExperiment(caseId,arm,c,precision):null;
  assert.equal(c.authority,'none');assert.ok(c.attempts<=1&&c.stats.work<=8000000&&c.stats.expansions<=32768);
  if(a){assert.equal(a.authority,'none');assert.ok(a.stats.work<=8000000&&a.stats.expansions<=32768);if(a.status==='topology-final-verified'){assert.equal(a.rotationDiagnostic.finalChanged,0);if(arm==='plaza-attached'){assert.equal(a.plazaPreservation.geometry,'unchanged');assert.equal(a.plazaPreservation.parentIncidence,'unchanged');}}}
  result.arms.push({arm,observation,...summary(c,a),...(precision?{evidence:{construction:c,audit:a}}:{})});
 }
 if(!precision){assert.equal(result.arms[0].observation.contacts,result.arms[1].observation.contacts);assert.ok(result.arms[1].observation.blocked<=result.arms[0].observation.blocked);}
 console.log('ARES_HOLDOUT_PLAZA_EXPERIMENT '+JSON.stringify(result));
 return result;
}
export function registerPlazaExperiment(morphology,part){
 for(const id of PLAZA_EXPERIMENT_CASES.filter(x=>x.startsWith('h:'+morphology+'-')).slice(part*4,(part+1)*4))test('Matched plaza split experiment '+id,()=>measurePlaza(id));
}
