import test from 'node:test';
import assert from 'node:assert/strict';
import {constructP5HoldoutPrecisionSplit} from '../scripts/development/research/ares-p5-topology-observe.mjs';
import {auditP5HoldoutPrecisionSplit} from '../scripts/development/research/ares-p5-topology-audit.mjs';
import {holdoutPrecisionSeed} from '../scripts/development/research/ares-p5-holdout-precision-audit-lock.mjs';
const id='h:radial-16';
test('Precision contact candidate independent audit with fixed eight-neighbor allowance',async()=>{
 const c=await constructP5HoldoutPrecisionSplit(id);
 const a=c.status==='graph-candidate'?await auditP5HoldoutPrecisionSplit(id,c):null;
 console.log('ARES_HOLDOUT_PRECISION_AUDIT '+JSON.stringify({caseId:id,construction:c,audit:a}));
 assert.equal(c.authority,'none');assert.equal(c.independentlyVerified,false);assert.ok(c.attempts<=1&&c.stats.work<=8000000&&c.stats.expansions<=32768);
 if(a){
  assert.equal(a.authority,'none');assert.ok(a.stats.work<=8000000&&a.stats.expansions<=32768);
  assert.ok(c.witness.neighbors.every(n=>n.id!=='N-0089'));
  if(a.status==='topology-final-verified'){assert.equal(a.rotationDiagnostic.policy,'required');assert.equal(a.rotationDiagnostic.finalChanged,0);}
  const bad=structuredClone(c);bad.witness.neighbors[0].point.x+=1;
  assert.notEqual((await auditP5HoldoutPrecisionSplit(id,bad)).status,'topology-final-verified');
 }
});
test('Precision lock refuses all other cases',async()=>{
 assert.equal(holdoutPrecisionSeed(id).recipe.cap,8);
 await assert.rejects(()=>constructP5HoldoutPrecisionSplit('h:radial-12'),/Frozen precision audit/);
 await assert.rejects(()=>auditP5HoldoutPrecisionSplit('h:radial-24',null),/Frozen precision audit/);
});
