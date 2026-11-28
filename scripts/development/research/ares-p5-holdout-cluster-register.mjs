import test from 'node:test';
import assert from 'node:assert/strict';
import {CLUSTER_CASES,diagnoseHoldoutCluster} from './ares-p5-holdout-cluster-diagnostics.mjs';
export function registerHoldoutCluster(morphology,part){
 const rows=CLUSTER_CASES.filter(id=>id.startsWith('h:'+morphology+'-')).slice(part*4,part*4+4);
 assert.ok(rows.length>0);
 for(const id of rows)test('Holdout cluster '+id,async()=>{
  const r=await diagnoseHoldoutCluster(id);console.log('ARES_HOLDOUT_CLUSTER '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
  assert.ok(['diagnosed','diagnostic-work-limit'].includes(r.category));
  if(r.category==='diagnosed'){
   assert.equal(r.arms.geometry.clauses,r.contactPairs);
   assert.equal(r.arms.optimisticSplit.clauses+r.optimisticallySplittable,r.contactPairs);
   for(const a of Object.values(r.arms)){
    if(a.cover.status==='exact'){assert.equal(a.cover.minimum,a.cover.witness.length);assert.equal(a.cover.minimum,a.cover.lower);}
    if(a.connected.status==='within-four')assert.ok(a.connected.witness.length<=4);
   }
  }
 });
}
