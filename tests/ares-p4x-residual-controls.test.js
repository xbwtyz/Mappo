import test from 'node:test';
import assert from 'node:assert/strict';
import {residualSeeds,createOrientationCache,preservesPairs} from '../scripts/development/research/ares-p4x-residual.mjs';
import {RADIAL_IDS,radialRecipe} from '../scripts/development/research/ares-p4x-radial-scope.mjs';
import {runP4XResidual} from '../scripts/development/research/ares-p4x-residual-run.mjs';
import {runP4XX7} from '../scripts/development/research/ares-p4x-x7-run.mjs';
import {runP4XHybrid} from '../scripts/development/research/ares-p4x-x56-run.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {G_MANIFEST} from '../scripts/development/research/ares-p4-g-corpus.mjs';
const root=()=>createSpatialPreservationBudget(G_MANIFEST.search.root);
test('residual frozen seeds, authority and four prioritized near misses',async()=>{
  const seeds=RADIAL_IDS.map(id=>residualSeeds('g:'+id));
  assert.equal(seeds.flat().length,12);assert.equal(seeds.filter(s=>s.length===2).length,4);
  assert.equal(seeds.filter(s=>s.some(r=>r.best.score[1]===1)).length,4);
  for(const r of seeds.flat()){const recipe=radialRecipe('g:'+r.id);assert.ok(r.best.neighbors.length<=recipe.cap);if(recipe.minimum)assert.equal(r.best.neighbors.length,recipe.minimum);}
  await assert.rejects(()=>runP4XResidual('unknown'),/Unapproved/);
});
test('orientation cache invalidates only changed coordinate dependencies',()=>{
  const tele={cacheHits:0,cacheMisses:0,cacheInvalidations:0,cacheEvictions:0},cache=createOrientationCache(tele),b=root();
  const p=new Map([['a',{x:0,y:0}],['b',{x:1,y:0}],['c',{x:0,y:1}],['d',{x:2,y:2}]]),get=id=>p.get(id),t=['a','b','c'];
  assert.equal(cache.get(t,get,b).orientation,1);
  p.set('d',{x:3,y:3});assert.equal(cache.get(t,get,b).orientation,1);assert.equal(tele.cacheHits,1);
  p.set('c',{x:0,y:-2});assert.equal(cache.get(t,get,b).orientation,-2);assert.equal(tele.cacheInvalidations,1);
  assert.equal(cache.get(t,get,b).orientation,-2);assert.equal(tele.cacheHits,2);assert.equal(tele.cacheMisses,2);
});
test('constraint preservation rejects replacement conflicts even at lower count',()=>{
  const a={ids:['a','b']},c={ids:['c','d']},e={ids:['e','f']};
  assert.equal(preservesPairs([a,c],[a]),true);assert.equal(preservesPairs([a,c],[e]),false);assert.equal(preservesPairs([a],[]),true);
});
test('residual detached replay is deterministic',async()=>assert.deepEqual(await runP4XResidual(RADIAL_IDS[0]),await runP4XResidual(RADIAL_IDS[0])));
test('historical recovered arms remain qualified',async()=>{
  for(const r of [await runP4XHybrid('linear-medium:eight-loop:75:y'),await runP4XX7('planned-medium:eight-chain:100:y')]){assert.equal(r.category,'geometry-recovered');assert.equal(r.audit.status,'geometry-verified');}
});
