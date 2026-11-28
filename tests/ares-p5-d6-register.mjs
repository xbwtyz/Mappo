import test from 'node:test';
import assert from 'node:assert/strict';
import {D2_LOCKS} from '../scripts/development/research/ares-p5-topology-d2.mjs';
import {inspectP5OverlapAuthority} from '../scripts/development/research/ares-p5-topology-d6.mjs';
export function registerD6(part){
  for(const lock of D2_LOCKS.filter((_,i)=>i%4===part))test('P5 D6 overlap endpoint authority '+lock.id,async()=>{
    const r=await inspectP5OverlapAuthority(lock.id);console.log('ARES_P5_D6 '+JSON.stringify(r));
    assert.equal(r.source,lock.source);assert.equal(r.authority,'none');assert.equal(r.topologyChanged,false);
    assert.ok(r.stats.work<=8000000);assert.equal(r.stats.expansions,0);assert.ok(['observed','work-limit'].includes(r.status));
    if(r.status==='observed'){
      assert.equal(r.pairs.length,lock.overlaps.length);
      for(const pair of r.pairs){
        assert.ok(pair.scopeReasons.includes('overlap-resolution-held'));
        assert.deepEqual(pair.possibleNeighborIds,pair.endpoints.filter(e=>e.reasons.length===0).map(e=>e.id));
        if(pair.span)assert.ok(pair.span.length>0);
        if(pair.disposition==='fixed-under-observed-local-endpoint-scope'){assert.ok(pair.span);assert.equal(pair.possibleNeighborIds.length,0);}
        if(pair.disposition==='geometry-research-opportunity'){assert.ok(pair.span);assert.ok(pair.possibleNeighborIds.length>0);}
      }
    }
  });
}
