import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { G_MANIFEST,enumerateGSlots } from '../scripts/development/research/ares-p4-g-corpus.mjs';
import { G_LOCKED_INVENTORY } from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
const read=name=>JSON.parse(readFileSync(new URL('./fixtures/ares-p4-evidence/'+name,import.meta.url),'utf8'));
const a=read('large-corpus-45983786171-a.json'),b=read('large-corpus-45983786171-b.json'),summary=read('large-corpus-summary-45983786171.json'),pilot=read('pilot-45982953977.json');
const observed=[...a.rows,...b.rows],rows=[...observed,...b.omitted];
const count=rs=>rs.reduce((acc,r)=>(acc[r.category]=(acc[r.category]??0)+1,acc),{});
test('G3 evidence retains every preregistered slot and unique executable intent',()=>{
  assert.equal(rows.length,216);assert.equal(new Set(rows.map(r=>r.id)).size,216);
  const intents=new Set();
  for(const s of enumerateGSlots()){
    const r=rows.find(x=>x.id===s.id);assert.ok(r);assert.deepEqual(r.offset,s.offset);
    const c=G_LOCKED_INVENTORY.rows.find(x=>x.id===s.city),g=c.groups.find(x=>x.id===s.group);
    assert.equal(r.source,c.source);assert.deepEqual(r.selectedRoadIds,g.selectedRoadIds);
    if(g.status==='selected'){const key=JSON.stringify([r.source,r.selectedRoadIds,r.offset]);assert.ok(!intents.has(key));intents.add(key);assert.ok(r.searchStats);}
    else {assert.equal(r.category,g.status);assert.equal(r.searchStats,undefined);}
  }
  assert.equal(intents.size,171);assert.deepEqual(count(rows),summary.categories);
  for(const [field,name] of [['city','byCity'],['group','byGroup'],['magnitude','byDistance'],['direction','byDirection']]){
    for(const [key,value] of Object.entries(summary[name]))assert.deepEqual(count(observed.filter(r=>String(r[field])===key)),value);
  }
});
test('G3 independently audited successes, fixed budgets and repeated pilot parity',()=>{
  const withoutTiming=({job,searchMs,auditMs,...r})=>r;
  for(const r of pilot.rows)assert.deepEqual(withoutTiming(observed.find(x=>x.id===r.id)),withoutTiming(r));
  let verified=0;const refusals=[];
  for(const r of observed){
    assert.ok(r.searchStats.work<=G_MANIFEST.search.root.work);assert.ok(r.searchStats.expansions<=G_MANIFEST.search.root.stateExpansions);assert.ok(r.attempts<=G_MANIFEST.search.maxCandidates);
    if(r.category==='baseline-valid'){assert.equal(r.baselineValid,true);assert.equal(r.attempts,0);assert.equal(r.witness,null);}
    if(r.category==='geometry-recovered'){assert.equal(r.baselineValid,false);assert.ok(r.witness);}
    if(['baseline-valid','geometry-recovered'].includes(r.category)){
      verified++;assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.sweptUnresolved,0);assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);
    }
    if(r.category==='search-refused'){assert.equal(r.termination,'candidate-limit');assert.equal(r.attempts,32);refusals.push(r);}
  }
  assert.equal(verified,summary.verified);assert.equal(Math.max(...observed.map(r=>r.searchStats.work)),summary.maxWork);
  assert.equal(Math.min(...refusals.map(r=>r.searchStats.remainingWork)),summary.minRefusalRemainingWork);
});
