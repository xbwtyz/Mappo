import test from 'node:test';
import assert from 'node:assert/strict';
import {D1_SLOTS,censusP5SpecialContacts} from '../scripts/development/research/ares-p5-topology-d1.mjs';
const permissions={mode:'restructure',intersection:true,split:true,merge:true,overlap:true};
export function registerP5D1(city,half){
  const slots=D1_SLOTS.filter(s=>s.city===city);
  assert.equal(slots.length,54);
  for(const slot of slots.slice(half*27,(half+1)*27))test('P5 D1 special contact census '+slot.id,async()=>{
    const r=await censusP5SpecialContacts(slot.id,permissions);
    console.log('ARES_P5_D1 '+JSON.stringify(r));
    assert.equal(r.caseId,slot.id);assert.equal(r.authority,'none');assert.equal(r.topologyChanged,false);
    assert.ok(r.stats.work<=8000000);assert.equal(r.stats.expansions,0);
    if(slot.selection!=='selected'){assert.equal(r.status,slot.selection);assert.equal(r.source,null);return;}
    assert.match(r.source,/^[a-f0-9]{64}$/);
    assert.ok(['observed','work-limit'].includes(r.status));
    if(r.status==='observed'){
      assert.ok(r.comparisons>0);assert.ok(r.requestedCount>0);
      assert.equal(r.special.length,Object.entries(r.counts).filter(([k])=>k!=='interior-interior').reduce((n,[,v])=>n+v,0));
      for(const row of r.special){
        if(row.contact.kind==='overlap')assert.ok(row.reasons.includes('overlap-resolution-held'));
        if(row.contact.kind==='endpoint-endpoint')assert.ok(row.reasons.includes('identity-consolidation-held'));
        assert.ok(Object.isFrozen(row));assert.equal(new Set(row.closureRoads).size,row.closureRoads.length);
      }
    }
  });
}
