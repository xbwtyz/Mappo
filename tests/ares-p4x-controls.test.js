import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { X_MANIFEST,observeP4XConstraints } from '../scripts/development/research/ares-p4x-constraints.mjs';
const dir=new URL('./fixtures/ares-p4-evidence/',import.meta.url);
const rows=readdirSync(dir).filter(n=>n.startsWith('p4r-r5-46077453323-')).flatMap(n=>JSON.parse(readFileSync(new URL(n,dir),'utf8')).rows);
test('P4X frozen denominator and no external input',async()=>{
  assert.equal(rows.length,216);assert.equal(new Set(rows.map(r=>r.id)).size,216);
  assert.equal(X_MANIFEST.cases.length,39);assert.equal(new Set(X_MANIFEST.cases.map(r=>r.id)).size,39);
  assert.deepEqual(X_MANIFEST.cases.map(r=>r.id).sort(),rows.filter(r=>r.result.category==='search-refused').map(r=>r.id).sort());
  assert.deepEqual(X_MANIFEST.limits,{maxHops:6,maxObjects:10000,maxNeighbors:4,maxCandidates:256});
  for(const category of ['preflight-refused','baseline-valid','geometry-recovered','selection-unavailable'])
    await assert.rejects(()=>observeP4XConstraints(rows.find(r=>r.result.category===category).id),/Unapproved/);
  await assert.rejects(()=>observeP4XConstraints({}),/Frozen/);
  await assert.rejects(()=>observeP4XConstraints('unknown'),/Unapproved/);
});
test('P4X deterministic diagnostic representation',async()=>{
  const id=X_MANIFEST.cases[0].id;
  assert.deepEqual(await observeP4XConstraints(id),await observeP4XConstraints(id));
});
