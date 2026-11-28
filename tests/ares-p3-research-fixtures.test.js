import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ARES_P3_MANIFEST as m, materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { LARE_PRESERVATION_LIMITS, LARE_DEMOLITION_LIMITS } from '../src/core/reconciliation-budget.js';
import { ARES_SRE_STRATEGY_IDS } from '../src/core/ares-sre-portfolio.js';
import { ARES_SRE_METRICS } from '../src/core/ares-sre-verifier.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
const sha=v=>createHash('sha256').update(v).digest('hex');
const historical=JSON.parse(readFileSync(new URL('./fixtures/ares-p2-historical-setbacks.json',import.meta.url),'utf8'));
test('P3 frozen protocol preserves exact Standard ceilings and declared strategy/profile contracts',()=>{
  assert.equal(m.version,1);assert.equal(m.schemaVersion,11);
  assert.match(m.frozenImplementation,/^[a-f0-9]{40}$/);
  assert.deepEqual(m.rootLimits.preservation,LARE_PRESERVATION_LIMITS);
  for(const k of ['work','stateExpansions'])assert.equal(m.rootLimits.destruction[k],LARE_DEMOLITION_LIMITS[k]);
  assert.deepEqual(m.profile.criteria.map(c=>c.metric),ARES_SRE_METRICS);
  assert.deepEqual(m.arms.map(a=>a.id),['sre-reference','ares-single','ares-portfolio']);
  for(const a of m.arms.filter(a=>a.kind==='serial')){
    assert.equal(new Set(a.tasks.map(t=>t.taskId)).size,a.tasks.length);
    assert.ok(a.tasks.every(t=>ARES_SRE_STRATEGY_IDS.includes(t.strategyId)&&t.limits.work>0&&t.limits.stateExpansions>0));
  }
  assert.ok(Object.isFrozen(m.cases[0].permissions));
});
test('P3 frozen research inventory includes every historical case, control and reserved split',()=>{
  assert.equal(m.cases.length,11);assert.equal(new Set(m.cases.map(c=>c.id)).size,11);
  assert.equal(m.cases.filter(c=>c.split==='reserved').length,2);
  assert.equal(m.cases.filter(c=>c.recipe==='mixed').length,2);
  assert.ok(m.cases.every(c=>c.permissions.regeneration===false));
  for(const c of historical.cases){
    const f=m.cases.find(x=>x.id==='historical-'+c.id);
    assert.deepEqual(f.selection.ids,c.ids);assert.deepEqual(f.offset,c.offset);
    assert.deepEqual(f.permissions,historical.permissions);
  }
});
test('P3 all frozen cases materialize valid Schema 11 sources with exact typed intent',()=>{
  for(const c of m.cases){
    const f=materializeAresP3Case(c.id);
    assert.equal(f.project.schemaVersion,11);
    assert.equal(f.context.operation.permissions.destruction,c.permissions.destruction);
    assert.equal(f.context.operation.permissions.regeneration,false);
    assert.ok(f.context.operation.editedRefs.length>=2);
    if(!c.offset.towardRiverMidpoint)assert.deepEqual(f.context.operation.geometry.offset,c.offset);
    if(c.id.startsWith('historical-'))assert.equal(sha(JSON.stringify(f.project)),historical.historicalBaseline);
    if(c.recipe==='mixed'){
      assert.ok(f.project.city.waterFeatures.some(x=>x.kind==='river'));
      assert.ok(f.project.city.terrainFeatures.length);assert.ok(f.project.city.walls.length);
    }
    console.log('ARES_P3_FROZEN_CASE '+JSON.stringify({id:c.id,split:c.split,source:sha(aresReplayJson(f.project)),
      operation:f.context.operation,limits:f.limits}));
  }
  assert.throws(()=>materializeAresP3Case('not-in-manifest'),/Unknown frozen/);
});
test('P3 reserved and mixed fixture materialization is repeatable without a solver-based selection',()=>{
  for(const id of ['holdout-radial','mixed-river']){
    const a=materializeAresP3Case(id),b=materializeAresP3Case(id);
    assert.equal(aresReplayJson(a.project),aresReplayJson(b.project));
    assert.deepEqual(a.context,b.context);
  }
});
