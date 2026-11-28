import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectP5CombinedSeeds} from '../scripts/development/research/ares-p5-topology-g1.mjs';
import {RADIAL_IDS,radialRecipe} from '../scripts/development/research/ares-p4x-radial-scope.mjs';
import {residualSeeds} from '../scripts/development/research/ares-p4x-residual.mjs';

for(const id of RADIAL_IDS)test('P5 G1 frozen combined contact replay '+id,async()=>{
  const caseId='g:'+id,recipe=radialRecipe(caseId),seeds=residualSeeds(caseId);
  const r=await inspectP5CombinedSeeds(caseId);
  console.log('ARES_P5_G1 '+JSON.stringify(r));
  assert.equal(r.source,recipe.source);assert.equal(r.cap,recipe.cap);assert.equal(r.minimum,recipe.minimum);
  assert.equal(r.status,'observed');assert.equal(r.authority,'none');assert.equal(r.topologyChanged,false);assert.equal(r.cityRecovery,false);
  assert.equal(r.attempts,seeds.length);assert.equal(r.rows.length,seeds.length);
  assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
  assert.equal(r.stats.expansions,r.attempts);
  for(let i=0;i<seeds.length;i++){
    const row=r.rows[i],seed=seeds[i];
    assert.equal(row.arm,seed.arm);assert.equal(row.sourceAttempt,seed.best.attempt);assert.equal(row.neighbors,seed.best.neighbors.length);
    assert.equal(row.replayMatches,true);assert.equal(row.pairs.length,seed.best.pairs.length);
    assert.ok(row.finalChecks>=3*row.movedRoadIds.length);assert.equal(row.sweptChecks,3*row.movedRoadIds.length);
    assert.ok(['held','split-research-opportunity'].includes(row.status));
    if(row.status==='split-research-opportunity'){
      assert.deepEqual(row.reasons,[]);assert.deepEqual(row.finalBlockers,[]);assert.deepEqual(row.sweptUnresolved,[]);
      assert.ok(row.pairs.every(p=>p.contact.kind==='interior-interior'&&!p.reasons.length));
    }else assert.ok(row.reasons.length||row.pairs.some(p=>p.reasons.length));
  }
});
test('P5 G1 rejects non-frozen recipe before observation',async()=>{
  await assert.rejects(inspectP5CombinedSeeds('g:unapproved'),/Unapproved radial research case/);
  await assert.rejects(inspectP5CombinedSeeds({city:{}}),/Unapproved radial research case/);
});
