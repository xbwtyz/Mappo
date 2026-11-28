import test from 'node:test';
import assert from 'node:assert/strict';
import {observeP6Ownership,P6_A_CASES} from '../scripts/development/research/ares-p6-ownership-observe.mjs';
for(const id of P6_A_CASES)test('P6-A1 detached ownership inventory '+id,async()=>{
 const r=await observeP6Ownership(id);
 console.log('ARES_P6_OWNERSHIP '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.equal(r.landVerified,false);assert.equal(r.geometryCoverage,'not-evaluated');
 if(id==='t:t-radial-01'){assert.equal(r.status,'road-refused');assert.equal(r.roadAudit,null);assert.equal(r.observation,undefined);return;}
 assert.equal(r.roadAudit.status,'topology-final-verified');assert.equal(r.status,'observed');
 const o=r.observation;assert.equal(o.coverage,'explicit-references-only');assert.ok(o.counts.blocks>0);assert.ok(o.counts.properties>0);assert.ok(o.counts.buildings>0);assert.equal(o.omitted.length,0);
 assert.ok(o.objects.every(x=>x.depth<=6));assert.ok(o.objects.length<=10000);assert.equal(new Set(o.objects.map(x=>JSON.stringify(x.ref))).size,o.objects.length);
 assert.ok(o.objects.every(x=>['observe-only','generated-review-only','protected-or-unsupported'].includes(x.classification)));
 assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);assert.ok(Object.isFrozen(o));assert.equal(o.plaza.classification,'protected');
});
test('P6 A1 refuses arbitrary source and unregistered qualified recipe',async()=>{await assert.rejects(observeP6Ownership('h:radial-06'));await assert.rejects(observeP6Ownership('t:t-planned-14'));});
