import test from 'node:test';
import assert from 'node:assert/strict';
import {D2_LOCKS,analyzeP5OverlapCase} from '../scripts/development/research/ares-p5-topology-d2.mjs';
export function registerP5D2(part){
  for(const lock of D2_LOCKS.filter((_,i)=>i%4===part))test('P5 D2 overlap components '+lock.id,()=>{
    const r=analyzeP5OverlapCase(lock.id);
    console.log('ARES_P5_D2 '+JSON.stringify(r));
    assert.equal(r.source,lock.source);assert.equal(r.authority,'none');assert.equal(r.topologyChanged,false);
    assert.ok(r.stats.work<=8000000);assert.equal(r.stats.expansions,0);
    assert.ok(['observed','classification-discrepancy','work-limit'].includes(r.status));
    if(r.status==='observed'){
      assert.equal(r.overlapPairs,lock.overlaps.length);
      assert.equal(r.components.reduce((n,c)=>n+c.overlapPairs,0),r.overlapPairs);
      assert.equal(r.endpointPairs,lock.endpoints.length);
      assert.deepEqual(r.unmatched,[]);assert.deepEqual(r.unexpected,[]);
      for(const p of r.pairs){assert.ok(p.span.length>0);assert.ok(p.scopeReasons.includes('overlap-resolution-held'));assert.equal(p.geometryOnlySplitInsufficient,p.span.exact);}
      assert.equal(new Set(r.components.flatMap(c=>c.roadIds)).size,r.components.flatMap(c=>c.roadIds).length);
    }
  });
}
