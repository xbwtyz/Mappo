import test from 'node:test';
import assert from 'node:assert/strict';
import {G_MANIFEST,enumerateGSlots} from './ares-p4-g-corpus.mjs';
import {runX8Slot,x8R5Reference} from './ares-p4x-x8-run.mjs';
const success=c=>c==='baseline-valid'||c==='geometry-recovered';
function checkBudget(s,limit){
  assert.ok(s&&Number.isFinite(s.work)&&s.work>=0&&s.work<=limit.work);
  assert.ok(Number.isFinite(s.expansions)&&s.expansions>=0&&s.expansions<=limit.stateExpansions);
}
export function registerX8Group(city,group){
  const slots=enumerateGSlots().filter(s=>s.city===city&&s.group===group);
  assert.equal(slots.length,9);
  for(const slot of slots)test('X8 fresh combined qualification '+slot.id,async()=>{
    let row;
    try{row=await runX8Slot(slot.id);}
    catch(e){console.log('ARES_P4X_X8 '+JSON.stringify({id:slot.id,category:'error',message:e.message}));throw e;}
    console.log('ARES_P4X_X8 '+JSON.stringify(row));
    const r=row.result;
    assert.equal(r.id,slot.id);assert.equal(r.source,row.source);
    if(row.arm==='unavailable'){
      assert.equal(r.category,row.expected);assert.equal(r.searchStats,undefined);
      assert.deepEqual(r.selectedRoadIds,[]);return;
    }
    checkBudget(r.searchStats??r.stats,G_MANIFEST.search.root);
    assert.ok(Number.isInteger(r.attempts)&&r.attempts>=0&&r.attempts<=256);
    if(row.arm==='R5'){
      const ref=x8R5Reference(slot.id);
      assert.deepEqual(r.selectedRoadIds,row.selectedRoadIds);assert.deepEqual(r.offset,row.offset);
      assert.deepEqual(r.baselineIssues,ref.baselineIssues);
      assert.equal(r.category,ref.category);assert.equal(r.attempts,ref.attempts);
      if(success(r.category))assert.deepEqual(r.witness,ref.witness);
      if(r.category==='preflight-refused')assert.equal(r.termination,ref.termination);
    }else if(row.arm==='residual'){
      assert.ok(['search-refused','work-limit','geometry-recovered'].includes(r.category));
      assert.equal(r.cap,row.cap);assert.equal(r.minimum,row.minimum);
    }else assert.equal(r.category,row.expected,'Previously verified recovery must requalify.');
    if(!success(r.category))return;
    assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.caseId,'g:'+slot.id);
    assert.equal(r.audit.sweptUnresolved,0);checkBudget(r.audit.stats,G_MANIFEST.audit.root);
    if(r.category==='baseline-valid'){assert.equal(r.attempts,0);assert.equal(r.witness,null);return;}
    const ns=r.witness.neighbors;
    assert.ok(ns.length>=1&&ns.length<=row.cap);
    if(row.minimum!==null)assert.equal(ns.length,row.minimum);
    assert.equal(new Set(ns.map(n=>n.id)).size,ns.length);
    for(const n of ns){const d=Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y);assert.ok(d>0&&d<=Math.hypot(slot.offset.x,slot.offset.y)+1e-8);}
  });
}
