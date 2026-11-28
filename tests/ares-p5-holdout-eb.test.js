import test from 'node:test';
import assert from 'node:assert/strict';
import {constructP5HoldoutCombinedSplit} from '../scripts/development/research/ares-p5-topology-observe.mjs';
import {auditP5HoldoutCombinedSplit} from '../scripts/development/research/ares-p5-topology-audit.mjs';
import {holdoutEBSeed} from '../scripts/development/research/ares-p5-holdout-eb-lock.mjs';
const id='h:radial-24';
test('Frozen E-B candidate independently reconstructed under unchanged cyclic gate',async()=>{
 const c=await constructP5HoldoutCombinedSplit(id);
 const a=c.status==='graph-candidate'?await auditP5HoldoutCombinedSplit(id,c):null;
 console.log('ARES_HOLDOUT_EB '+JSON.stringify({caseId:id,construction:c,audit:a}));
 assert.equal(c.authority,'none');assert.equal(c.independentlyVerified,false);assert.ok(c.attempts<=1&&c.stats.work<=8000000&&c.stats.expansions<=32768);
 if(a){assert.equal(a.authority,'none');assert.ok(a.stats.work<=8000000&&a.stats.expansions<=32768);
 if(a.status==='topology-final-verified'){assert.equal(a.rotationDiagnostic.policy,'required');assert.equal(a.rotationDiagnostic.finalChanged,0);}
 const bad=structuredClone(c);bad.witness.neighbors[0].point.x+=1;
 const rejected=await auditP5HoldoutCombinedSplit(id,bad);assert.notEqual(rejected.status,'topology-final-verified');
 }
});
test('E-B is locked to one archived seed and one scenario',async()=>{
 assert.equal(holdoutEBSeed(id).recipe.cap,4);
 await assert.rejects(()=>constructP5HoldoutCombinedSplit('h:radial-12'),/Frozen P5 E-B/);
 await assert.rejects(()=>auditP5HoldoutCombinedSplit('h:radial-12',null),/Frozen P5 E-B/);
});
