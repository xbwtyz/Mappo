import test from 'node:test';
import assert from 'node:assert/strict';
import { P2_AUDIT_CASES,P2_AUDIT_HOPS,referenceP2Scope,auditP2Case } from '../scripts/development/research/ares-p4r-p2-depth-audit.mjs';
import { createSpatialPreservationBudget,spatialRefKey } from '../src/core/spatial-recovery-contract.js';
test('R4C-B0 frozen audit denominator and reject arbitrary cases',async()=>{
  assert.equal(P2_AUDIT_CASES.length,39);assert.equal(new Set(P2_AUDIT_CASES).size,39);
  assert.deepEqual(P2_AUDIT_HOPS,[1,2,4,6]);await assert.rejects(()=>auditP2Case('arbitrary'),/Unapproved/);
});
test('R4C-B0 reference keeps observation path separate from expansion path',()=>{
  const r=(collection,id)=>({collection,id}),p=r('properties','P'),a=r('buildings','A'),b=r('buildings','B'),c=r('buildings','C');
  const o={roots:[p,c],nodes:[p,a,b,c].map(ref=>({ref,classification:'review-candidate'})),
    discovery:{changedRoads:[],blockers:[{propertyRef:p}]},
    edges:[{from:p,to:a,relation:'building'},{from:a,to:b,relation:'courtyard-occupant'},{from:b,to:c,relation:'courtyard-occupant'}]};
  const short=referenceP2Scope(o,2,createSpatialPreservationBudget());
  assert.equal(short.observed.get(spatialRefKey(c)),0);assert.equal(short.expansion.has(spatialRefKey(c)),false);
  const long=referenceP2Scope(o,3,createSpatialPreservationBudget());
  assert.equal(long.observed.get(spatialRefKey(c)),0);assert.equal(long.expansion.get(spatialRefKey(c)),3);
});
